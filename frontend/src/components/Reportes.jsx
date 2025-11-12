import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './Reportes.css';

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('es-CL');
    } catch {
        return dateStr;
    }
};

const KPI_INITIAL_STATE = {
    total_vehiculos: null,
    total_conductores: null,
    ordenes_activas: null,
    mantenimientos_pendientes: null,
    costo_total_clp: null,
};

function Reportes({ token }) {
    const [kpis, setKpis] = useState(KPI_INITIAL_STATE);
    const [mantenimientos, setMantenimientos] = useState([]);
    const [metaMantenimientos, setMetaMantenimientos] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [diasVentana, setDiasVentana] = useState(30);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (!token) {
                throw new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.');
            }

            // 1. KPIs de Resumen
            const resKpis = await apiFetch('/api/reportes/kpis_resumen');
            if (resKpis.status === 401) {
                throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
            }
            if (resKpis.status !== 200) {
                throw new Error(resKpis.data?.message || 'Error al cargar KPIs');
            }

            // 2. Costo de Mantenimiento
            const resCosto = await apiFetch('/api/reportes/costo_mantenimiento_mensual');
            if (resCosto.status !== 200) {
                throw new Error(resCosto.data?.message || 'Error al cargar costos');
            }

            // 3. Mantenimientos por vencer
            const resMant = await apiFetch(`/api/reportes/mantenimientos_por_vencer?dias=${diasVentana}`);
            if (resMant.status !== 200) {
                throw new Error(resMant.data?.message || 'Error al cargar mantenimientos');
            }

            setKpis({
                ...resKpis.data.data,
                costo_total_clp: resCosto.data.data.costo_total_clp,
            });

            setMantenimientos(resMant.data.data || []);
            setMetaMantenimientos(resMant.data.meta || {});

        } catch (err) {
            console.error('Error en Reportes:', err);
            const errorMessage = err.message || 'Error desconocido';

            if (errorMessage.includes('Sesión expirada') || errorMessage.includes('Token no provisto')) {
                localStorage.removeItem('token');
                setError('Tu sesión ha expirado. Por favor, recarga la página e inicia sesión nuevamente.');
            } else {
                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    }, [token, diasVentana]);

    useEffect(() => {
        if (token) {
            fetchData();
        } else {
            setError('No hay sesión activa. Por favor, inicia sesión.');
            setLoading(false);
        }
    }, [token, fetchData]);

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="reportes-container">
            <div className="reportes-header">
                <h2>📊 Dashboard y Reportes</h2>
                <p className="header-subtitle">Métricas clave y alertas del sistema</p>
            </div>

            {loading && <div className="loading-state">Cargando datos del dashboard...</div>}
            {error && <div className="error-state">⚠️ {error}</div>}

            {!loading && !error && (
                <>
                    {/* KPIs Grid */}
                    <div className="kpis-grid">
                        <div className="kpi-card vehiculos">
                            <div className="kpi-title">🚗 Total Vehículos</div>
                            <div className="kpi-value">{kpis.total_vehiculos || 0}</div>
                        </div>

                        <div className="kpi-card conductores">
                            <div className="kpi-title">👥 Total Conductores</div>
                            <div className="kpi-value">{kpis.total_conductores || 0}</div>
                        </div>

                        <div className="kpi-card ordenes">
                            <div className="kpi-title">📅 Órdenes Activas</div>
                            <div className="kpi-value">{kpis.ordenes_activas || 0}</div>
                            <div className="kpi-meta">Pendientes o Asignadas</div>
                        </div>

                        <div className="kpi-card mantenimiento">
                            <div className="kpi-title">🛠️ Mantenimientos Pendientes</div>
                            <div className="kpi-value">{kpis.mantenimientos_pendientes || 0}</div>
                            <div className="kpi-meta">Programados o En Taller</div>
                        </div>
                    </div>

                    {/* Costos */}
                    <div className="report-section">
                        <h3>💰 Finanzas Operacionales</h3>
                        <div className="report-costo">
                            <div className="costo-label">Costo Total de Mantenimiento (Últimos 30 días)</div>
                            <div className="costo-value">{formatCurrency(kpis.costo_total_clp || 0)}</div>
                        </div>
                    </div>

                    {/* Mantenimientos por Vencer */}
                    <div className="report-section">
                        <div className="section-header">
                            <div>
                                <h3>⚠️ Mantenimientos por Vencer</h3>
                                <p className="section-subtitle">
                                    {metaMantenimientos.total || 0} mantenimientos en los próximos {diasVentana} días
                                </p>
                            </div>
                            <div className="filter-group">
                                <label htmlFor="diasVentana">Ventana de días:</label>
                                <select 
                                    id="diasVentana"
                                    value={diasVentana} 
                                    onChange={(e) => setDiasVentana(Number(e.target.value))}
                                    className="filter-select-small"
                                >
                                    <option value="7">7 días</option>
                                    <option value="15">15 días</option>
                                    <option value="30">30 días</option>
                                    <option value="60">60 días</option>
                                    <option value="90">90 días</option>
                                </select>
                            </div>
                        </div>

                        {/* Resumen de alertas */}
                        <div className="alertas-resumen">
                            <div className="alerta-badge vencido">
                                ⛔ {metaMantenimientos.vencidos || 0} Vencidos
                            </div>
                            <div className="alerta-badge critico">
                                🔴 {metaMantenimientos.criticos || 0} Críticos (≤7 días)
                            </div>
                            <div className="alerta-badge urgente">
                                🟡 {metaMantenimientos.urgentes || 0} Urgentes (≤15 días)
                            </div>
                            <div className="alerta-badge proximo">
                                🟢 {metaMantenimientos.proximos || 0} Próximos
                            </div>
                        </div>

                        {/* Tabla de mantenimientos */}
                        {mantenimientos.length === 0 ? (
                            <div className="empty-state-report">
                                <span className="empty-icon">✅</span>
                                <p>No hay mantenimientos próximos a vencer</p>
                            </div>
                        ) : (
                            <div className="table-container-report">
                                <table className="report-table">
                                    <thead>
                                        <tr>
                                            <th>Urgencia</th>
                                            <th>Vehículo</th>
                                            <th>Tipo</th>
                                            <th>Descripción</th>
                                            <th>Fecha Programada</th>
                                            <th>Días Restantes</th>
                                            <th>Estado</th>
                                            <th>Costo Est.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mantenimientos.map((mant) => (
                                            <tr key={mant.id} className={`row-${mant.urgencia}`}>
                                                <td>
                                                    <span className={`urgencia-badge ${mant.urgencia}`}>
                                                        {mant.urgencia === 'vencido' && '⛔ Vencido'}
                                                        {mant.urgencia === 'critico' && '🔴 Crítico'}
                                                        {mant.urgencia === 'urgente' && '🟡 Urgente'}
                                                        {mant.urgencia === 'proximo' && '🟢 Próximo'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="vehiculo-cell">
                                                        <strong>{mant.vehiculo?.placa || 'N/A'}</strong>
                                                        <small>{mant.vehiculo?.marca} {mant.vehiculo?.modelo}</small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="tipo-badge">
                                                        {mant.tipo_mantenimiento}
                                                    </span>
                                                </td>
                                                <td className="descripcion-cell">
                                                    {mant.descripcion || '-'}
                                                </td>
                                                <td>{formatDate(mant.fecha_programada)}</td>
                                                <td>
                                                    <strong className={`dias-restantes ${mant.urgencia}`}>
                                                        {mant.dias_restantes} días
                                                    </strong>
                                                </td>
                                                <td>
                                                    <span className={`estado-badge ${mant.estado}`}>
                                                        {mant.estado}
                                                    </span>
                                                </td>
                                                <td>{formatCurrency(mant.costo)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default Reportes;