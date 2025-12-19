import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import './ReporteMantenimiento.css';

// --- HELPERS GLOBALES ---
const formatCurrency = (amount) => '$' + (amount || 0).toLocaleString('es-CL');
const getBadgeClass = (estado) => {
    switch(estado) {
        case 'PENDIENTE': return 'status-warn';
        case 'PROGRAMADO': return 'status-info';
        case 'EN_TALLER': return 'status-danger';
        default: return 'status-default';
    }
};

// --- COMPONENTE 1: BARRA KPI (Sin cambios) ---
const ProgressBar = ({ label, value, max, color = '#3b82f6' }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="rm-chart-row" title={`${label}: ${formatCurrency(value)}`}>
            <div className="rm-chart-header">
                <span className="rm-label-text">{label}</span>
                <span className="rm-chart-value">{formatCurrency(value)}</span>
            </div>
            <div className="rm-chart-track">
                <div className="rm-chart-fill" style={{ width: `${percentage}%`, backgroundColor: color }}></div>
            </div>
        </div>
    );
};

// --- COMPONENTE 2: EL PANEL LATERAL DESLIZANTE (NUEVO) ---
const MaintenanceDrawer = ({ orden, onClose }) => {
    const drawerRef = useRef(null);

    // Cerrar al hacer click fuera del panel (en el overlay)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target)) {
                onClose();
            }
        };
        if (orden) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [orden, onClose]);

    if (!orden) return null;

    const totalItems = orden.detalles ? orden.detalles.reduce((sum, item) => sum + (item.costo || 0), 0) : 0;

    return (
        <div className="rm-drawer-overlay fade-in">
            <div className="rm-drawer slide-in-right" ref={drawerRef}>
                {/* HEADER DEL DRAWER */}
                <div className="drawer-header">
                    <div>
                        <h2 className="drawer-title">Orden #{orden.id}</h2>
                        <span className={`status-badge ${getBadgeClass(orden.estado)} large`}>
                            {orden.estado.replace('_', ' ')}
                        </span>
                    </div>
                    <button className="drawer-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="drawer-content">
                    {/* SECCIÓN 1: INFO VEHÍCULO Y FECHA */}
                    <div className="drawer-section info-grid">
                        <div className="info-item">
                            <label>Vehículo</label>
                            <div className="plate-box">{orden.vehiculo?.placa || 'S/P'}</div>
                            <span>{orden.vehiculo?.marca} {orden.vehiculo?.modelo}</span>
                        </div>
                        <div className="info-item">
                            <label>Programación</label>
                            <div className="date-box">📅 {new Date(orden.fecha_programada).toLocaleDateString('es-CL')}</div>
                            {orden.km_programado && <span>KM: {orden.km_programado.toLocaleString()}</span>}
                        </div>
                    </div>

                    {/* SECCIÓN 2: NOTAS GENERALES */}
                    {orden.descripcion && (
                        <div className="drawer-section">
                            <label className="section-label">📝 Observaciones Generales</label>
                            <p className="general-notes">{orden.descripcion}</p>
                        </div>
                    )}

                    {/* SECCIÓN 3: DETALLE DE ITEMS (MINI FACTURA) */}
                    <div className="drawer-section">
                        <label className="section-label">📋 Desglose de Servicios e Items</label>
                        <div className="invoice-container">
                            <table className="invoice-table">
                                <thead>
                                    <tr>
                                        <th>Concepto / Item</th>
                                        <th className="text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!orden.detalles || orden.detalles.length === 0) ? (
                                        <tr><td colSpan="2" className="text-center italic text-muted py-4">Sin items detallados.</td></tr>
                                    ) : (
                                        orden.detalles.map((item, idx) => (
                                            <React.Fragment key={idx}>
                                                <tr className="item-row">
                                                    <td>
                                                        <div className="item-concept">
                                                            {item.concepto?.nombre || 'Item Manual'}
                                                        </div>
                                                        {item.concepto?.categoria && (
                                                            <span className="cat-pill small">{item.concepto.categoria.nombre}</span>
                                                        )}
                                                    </td>
                                                    <td className="text-right font-medium">
                                                        {formatCurrency(item.costo)}
                                                    </td>
                                                </tr>
                                                {item.notas && (
                                                    <tr className="note-row">
                                                        <td colSpan="2">
                                                            <span className="item-note">↳ Nota: {item.notas}</span>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td className="text-right label-total">Total Neto Estimado:</td>
                                        <td className="text-right value-total">{formatCurrency(totalItems)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const ReporteMantenimiento = () => {
    const [loading, setLoading] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null); // Estado para la orden seleccionada
    
    // Fechas Filtro (Default: Últimos 3 meses para asegurar que se vean datos)
    const date = new Date();
    const pastDate = new Date();
    pastDate.setMonth(date.getMonth() - 3); // Retroceder 3 meses
    
    const firstDay = pastDate.toISOString().slice(0, 10);
    const today = date.toISOString().slice(0, 10);
    const [filtros, setFiltros] = useState({ fecha_inicio: firstDay, fecha_fin: today });

    const [data, setData] = useState({
        kpis: { total_gasto_periodo: 0, total_items_periodo: 0, total_pendiente: 0, cantidad_activos: 0 },
        grafica_categorias: [], grafica_vehiculos: [], ordenes_activas: [] 
    });

    const fetchReporte = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams(filtros);
            const res = await apiFetch(`/api/reportes-mant/dashboard?${params.toString()}`);
            if (res.status === 200) setData(res.data);
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }, [filtros]);

    useEffect(() => { fetchReporte(); }, [fetchReporte]);
    const handleDateChange = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });

    const maxCat = Math.max(...data.grafica_categorias.map(d => d.value), 0);
    const maxVeh = Math.max(...data.grafica_vehiculos.map(d => d.value), 0);

    return (
        <div className="rm-dashboard fade-in">
             {/* HEADER & KPIs (Igual que antes) */}
            <div className="rm-header-container">
                <div className="rm-title-block"><h1>Control de Mantenimiento</h1><p>Dashboard Operativo y Financiero</p></div>
                <div className="rm-controls">
                    <div className="rm-date-group"><label>Análisis Histórico:</label>
                        <div className="rm-inputs"><input type="date" name="fecha_inicio" value={filtros.fecha_inicio} onChange={handleDateChange} /><span className="separator">➜</span><input type="date" name="fecha_fin" value={filtros.fecha_fin} onChange={handleDateChange} /></div>
                    </div>
                    <button className="rm-btn-primary" onClick={fetchReporte} disabled={loading}>{loading ? '...' : 'Actualizar'}</button>
                </div>
            </div>
            <div className="rm-grid-kpi">
                <div className="rm-card kpi-card highlight-orange"><div className="kpi-icon">🚨</div><div className="kpi-content"><h3>En Curso</h3><div className="kpi-number">{data.kpis.cantidad_activos}</div></div></div>
                <div className="rm-card kpi-card highlight-blue"><div className="kpi-icon">💳</div><div className="kpi-content"><h3>Comprometido</h3><div className="kpi-number">{formatCurrency(data.kpis.total_pendiente)}</div></div></div>
                <div className="rm-card kpi-card"><div className="kpi-icon">✅</div><div className="kpi-content"><h3>Ejecutado (Periodo)</h3><div className="kpi-number">{formatCurrency(data.kpis.total_gasto_periodo)}</div></div></div>
            </div>

            {/* TABLA ACTIVA (MODIFICADA PARA SELECCIÓN) */}
            <div className="rm-card rm-section-table">
                <div className="rm-card-header"><h2>📋 Gestión Operativa (Activos)</h2><span className="badge-count">{data.ordenes_activas.length}</span></div>
                <div className="rm-table-responsive">
                    <table className="rm-table selectable-table">
                        <thead>
                            <tr><th>Fecha</th><th>Vehículo</th><th>Estado</th><th>Descripción General</th><th className="text-right">Total Estimado</th></tr>
                        </thead>
                        <tbody>
                            {data.ordenes_activas.length === 0 ? (
                                <tr><td colSpan="5" className="empty-row">No hay órdenes pendientes.</td></tr>
                            ) : (
                                data.ordenes_activas.map(orden => (
                                    <tr 
                                        key={orden.id} 
                                        onClick={() => setSelectedOrder(orden)}
                                        className={selectedOrder?.id === orden.id ? 'row-selected' : ''}
                                    >
                                        <td className="font-mono">{new Date(orden.fecha_programada).toLocaleDateString('es-CL')}</td>
                                        <td><div className="vehiculo-cell"><span className="placa">{orden.vehiculo?.placa || 'S/P'}</span><span className="modelo">{orden.vehiculo?.marca}</span></div></td>
                                        <td><span className={`status-badge ${getBadgeClass(orden.estado)}`}>{orden.estado.replace('_', ' ')}</span></td>
                                        <td className="desc-cell text-muted">{orden.descripcion || 'Sin descripción base'}</td>
                                        <td className="text-right font-bold">{formatCurrency(orden.costo)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* GRÁFICAS (Igual que antes) */}
            <div className="rm-grid-charts">
                <div className="rm-card chart-panel"><div className="rm-card-header"><h2>📊 Gasto por Categoría (Histórico)</h2></div><div className="chart-body">{data.grafica_categorias.map((item, idx) => <ProgressBar key={idx} label={item.name} value={item.value} max={maxCat} color="#10b981" />)}</div></div>
                <div className="rm-card chart-panel"><div className="rm-card-header"><h2>🚛 Top Vehículos (Histórico)</h2></div><div className="chart-body">{data.grafica_vehiculos.map((item, idx) => <ProgressBar key={idx} label={item.name} value={item.value} max={maxVeh} color="#f59e0b" />)}</div></div>
            </div>

            {/* --- EL DRAWER SE RENDERIZA AQUÍ AL FINAL --- */}
            <MaintenanceDrawer orden={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
    );
};

export default ReporteMantenimiento;