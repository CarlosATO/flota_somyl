import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './Reportes.css';
import DetalleVehiculoModal from './DetalleVehiculoModal.jsx';

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
    const [licencias, setLicencias] = useState([]);
    const [metaMantenimientos, setMetaMantenimientos] = useState({});
    const [metaLicencias, setMetaLicencias] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [diasVentanaMantenimientos, setDiasVentanaMantenimientos] = useState(30);
    const [diasVentanaLicencias, setDiasVentanaLicencias] = useState(60);
    
    // Estados para colapsables y modales
    const [mantenimientosExpanded, setMantenimientosExpanded] = useState(true);
    const [licenciasExpanded, setLicenciasExpanded] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(null); // null | 'vehiculos' | 'conductores' | 'ordenes'

    // Estados para análisis de vehículos (Combustible)
    const [analisisVehiculos, setAnalisisVehiculos] = useState([]);
    const [loadingAnalisis, setLoadingAnalisis] = useState(false);
    const [selectedVehiculoId, setSelectedVehiculoId] = useState(null);
    const [showDetalleVehiculoModal, setShowDetalleVehiculoModal] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (!token) {
                throw new Error('No hay sesión activa');
            }

            // 1. KPIs
            const resKpis = await apiFetch('/api/reportes/kpis_resumen');
            if (resKpis.status !== 200) throw new Error('Error al cargar KPIs');

            // 2. Costos
            const resCosto = await apiFetch('/api/reportes/costo_mantenimiento_mensual');
            if (resCosto.status !== 200) throw new Error('Error al cargar costos');

            // 3. Mantenimientos por vencer
            const resMant = await apiFetch(`/api/reportes/mantenimientos_por_vencer?dias=${diasVentanaMantenimientos}`);
            if (resMant.status !== 200) throw new Error('Error al cargar mantenimientos');

            // 4. Licencias por vencer
            const resLic = await apiFetch(`/api/reportes/licencias_por_vencer?dias=${diasVentanaLicencias}`);
            if (resLic.status !== 200) throw new Error('Error al cargar licencias');

            setKpis({
                ...resKpis.data.data,
                costo_total_clp: resCosto.data.data.costo_total_clp,
            });

            setMantenimientos(resMant.data.data || []);
            setMetaMantenimientos(resMant.data.meta || {});

            setLicencias(resLic.data.data || []);
            setMetaLicencias(resLic.data.meta || {});

            // 5. Análisis de Vehículos (Combustible)
            try {
                setLoadingAnalisis(true);
                const resAnalisis = await apiFetch('/api/reportes/analisis_vehiculos');
                if (resAnalisis.status === 200) {
                    setAnalisisVehiculos(resAnalisis.data.data || []);
                }
            } finally {
                setLoadingAnalisis(false);
            }

        } catch (err) {
            setError(err.message || 'Error al cargar reportes');
        } finally {
            setLoading(false);
        }
    }, [token, diasVentanaMantenimientos, diasVentanaLicencias]);

    useEffect(() => {
        if (token) {
            fetchData();
        } else {
            setError('No hay sesión activa');
            setLoading(false);
        }
    }, [token, fetchData]);

    const handleKPIClick = (tipo) => {
        setModalDetalle(tipo);
    };

    const openVehiculoModal = (vehId) => {
        setSelectedVehiculoId(vehId);
        setShowDetalleVehiculoModal(true);
    };

    // Helper para mostrar estado de documento y fecha de vencimiento.
    // Cambia de color según días restantes:
    // dias <= 0 => rojo (doc-vencido)
    // 1 <= dias < 60 => amarillo (doc-por-vencer)
    // dias >= 60 => verde (doc-vigente)
    const getEstadoDocumento = (doc) => {
        if (!doc) return { texto: 'SIN REGISTRO', clase: 'doc-sin-registro', fecha_vencimiento: null };

        const fechaStr = doc.fecha_vencimiento || doc.fechaVencimiento || null;
        let dias = null;
        if (typeof doc.dias_restantes === 'number') {
            dias = doc.dias_restantes;
        } else if (fechaStr) {
            // Calcular días restantes si backend no entregó 'dias_restantes'
            try {
                const hoy = new Date();
                const fecha = new Date(fechaStr);
                const diff = Math.floor((fecha - hoy) / (1000 * 60 * 60 * 24));
                dias = diff;
            } catch (e) {
                dias = null;
            }
        }

        // Si no pudimos determinar días restantes, fallback a estado textual si lo hay
        if (dias === null) {
            if (doc.estado === 'VENCIDO') return { texto: 'VENCIDO', clase: 'doc-vencido', fecha_vencimiento: fechaStr };
            if (doc.estado === 'POR_VENCER') return { texto: 'POR VENCER', clase: 'doc-por-vencer', fecha_vencimiento: fechaStr };
            return { texto: 'VIGENTE', clase: 'doc-vigente', fecha_vencimiento: fechaStr };
        }

        if (dias <= 0) return { texto: 'VENCIDO', clase: 'doc-vencido', fecha_vencimiento: fechaStr };
        if (dias < 60) return { texto: `${dias} días`, clase: 'doc-por-vencer', fecha_vencimiento: fechaStr };
        return { texto: `${dias} días`, clase: 'doc-vigente', fecha_vencimiento: fechaStr };
    };

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="reportes-container">
            <div className="reportes-header">
                <h2>📊 Dashboard y Reportes</h2>
                <p className="header-subtitle">Métricas clave y alertas del sistema</p>
            </div>

            {loading && <div className="loading-state">Cargando datos...</div>}
            {error && <div className="error-state">⚠️ {error}</div>}

            {!loading && !error && (
                <>
                    {/* KPIs Clickeables */}
                    <div className="kpis-grid">
                        <div className="kpi-card vehiculos clickeable" onClick={() => handleKPIClick('vehiculos')}>
                            <div className="kpi-title">🚗 Total Vehículos</div>
                            <div className="kpi-value">{kpis.total_vehiculos || 0}</div>
                            <div className="kpi-action">Click para ver detalles →</div>
                        </div>

                        <div className="kpi-card conductores clickeable" onClick={() => handleKPIClick('conductores')}>
                            <div className="kpi-title">👥 Total Conductores</div>
                            <div className="kpi-value">{kpis.total_conductores || 0}</div>
                            <div className="kpi-action">Click para ver detalles →</div>
                        </div>

                        <div className="kpi-card ordenes clickeable" onClick={() => handleKPIClick('ordenes')}>
                            <div className="kpi-title">📅 Órdenes Activas</div>
                            <div className="kpi-value">{kpis.ordenes_activas || 0}</div>
                            <div className="kpi-meta">Pendientes o Asignadas</div>
                            <div className="kpi-action">Click para ver detalles →</div>
                        </div>

                        <div className="kpi-card mantenimiento clickeable" onClick={() => handleKPIClick('mantenimientos')}>
                            <div className="kpi-title">🛠️ Mantenimientos Pendientes</div>
                            <div className="kpi-value">{kpis.mantenimientos_pendientes || 0}</div>
                            <div className="kpi-meta">Programados o En Taller</div>
                            <div className="kpi-action">Click para ver detalles →</div>
                        </div>
                    </div>

                    {/* Costos */}
                    <div className="report-section">
                        <div className="report-costo">
                            <div className="costo-label">💰 Costo Total de Mantenimiento (Últimos 30 días)</div>
                            <div className="costo-value">{formatCurrency(kpis.costo_total_clp || 0)}</div>
                        </div>
                    </div>

                    {/* Mantenimientos por Vencer - Colapsable */}
                    <div className="report-section">
                        <div 
                            className="section-header-collapsible" 
                            onClick={() => setMantenimientosExpanded(!mantenimientosExpanded)}
                        >
                            <div className="section-title-collapsible">
                                <span className="collapse-icon">{mantenimientosExpanded ? '▼' : '▶'}</span>
                                <h3>🔧 Mantenimientos Programados ({metaMantenimientos.total || 0})</h3>
                            </div>
                            <div className="filter-group">
                                <label htmlFor="diasVentanaMantenimientos">Ventana:</label>
                                <select 
                                    id="diasVentanaMantenimientos"
                                    value={diasVentanaMantenimientos} 
                                    onChange={(e) => setDiasVentanaMantenimientos(Number(e.target.value))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="filter-select-small"
                                >
                                    <option value="7">7 días</option>
                                    <option value="15">15 días</option>
                                    <option value="30">30 días</option>
                                    <option value="60">60 días</option>
                                </select>
                            </div>
                        </div>

                        {mantenimientosExpanded && (
                            <div className="collapsible-content">
                                <div className="alertas-resumen">
                                    <div className="alerta-badge vencido">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaMantenimientos.vencidos || 0} Vencidos</span>
                                    </div>
                                    <div className="alerta-badge critico">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaMantenimientos.criticos || 0} Críticos</span>
                                    </div>
                                    <div className="alerta-badge urgente">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaMantenimientos.urgentes || 0} Urgentes</span>
                                    </div>
                                    <div className="alerta-badge proximo">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaMantenimientos.proximos || 0} Próximos</span>
                                    </div>
                                </div>

                                {mantenimientos.length === 0 ? (
                                    <div className="empty-state-report">
                                        <span className="empty-icon">✅</span>
                                        <p>No hay mantenimientos próximos a vencer</p>
                                    </div>
                                ) : (
                                    <TablaMantenimientos mantenimientos={mantenimientos} />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Licencias por Vencer - Colapsable */}
                    <div className="report-section">
                        <div 
                            className="section-header-collapsible" 
                            onClick={() => setLicenciasExpanded(!licenciasExpanded)}
                        >
                            <div className="section-title-collapsible">
                                <span className="collapse-icon">{licenciasExpanded ? '▼' : '▶'}</span>
                                <h3>📋 Licencias de Conducir ({metaLicencias.total || 0})</h3>
                            </div>
                            <div className="filter-group">
                                <label htmlFor="diasVentanaLicencias">Ventana:</label>
                                <select 
                                    id="diasVentanaLicencias"
                                    value={diasVentanaLicencias} 
                                    onChange={(e) => setDiasVentanaLicencias(Number(e.target.value))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="filter-select-small"
                                >
                                    <option value="30">30 días</option>
                                    <option value="60">60 días</option>
                                    <option value="90">90 días</option>
                                </select>
                            </div>
                        </div>

                        {licenciasExpanded && (
                            <div className="collapsible-content">
                                <div className="alertas-resumen">
                                    <div className="alerta-badge vencida">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaLicencias.vencidas || 0} Vencidas</span>
                                    </div>
                                    <div className="alerta-badge criticos">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaLicencias.criticos || 0} Críticos</span>
                                    </div>
                                    <div className="alerta-badge urgentes">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaLicencias.urgentes || 0} Urgentes</span>
                                    </div>
                                    <div className="alerta-badge proximos">
                                        <span style={{fontSize: '1rem'}}>●</span>
                                        <span>{metaLicencias.proximos || 0} Próximos</span>
                                    </div>
                                </div>

                                {licencias.length === 0 ? (
                                    <div className="empty-state-report">
                                        <span className="empty-icon">✅</span>
                                        <p>No hay licencias próximas a vencer</p>
                                    </div>
                                ) : (
                                    <TablaLicencias licencias={licencias} />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Análisis Detallado de Vehículos (Combustible) */}
                    <div className="reportes-section">
                        <div className="section-header">
                            <div>
                                <h3>🚗 Análisis Detallado de Vehículos</h3>
                                <p className="section-subtitle">
                                    Consumo de combustible y documentación obligatoria
                                </p>
                            </div>
                        </div>

                        {loadingAnalisis ? (
                            <div className="loading-message">Cargando análisis...</div>
                        ) : analisisVehiculos.length === 0 ? (
                            <div className="empty-state-report">
                                <span className="empty-icon">📊</span>
                                <p>No hay datos suficientes para análisis</p>
                            </div>
                        ) : (
                            <div className="table-container-report">
                                <table className="reportes-table">
                                    <thead>
                                        <tr>
                                            <th>Patente</th>
                                            <th>Marca/Modelo</th>
                                            <th>Año</th>
                                            <th>Tipo</th>
                                            <th>Último KM</th>
                                            <th>Promedio L/KM</th>
                                            <th>Costo/KM</th>
                                            <th>Gasto Último Mes</th>
                                            <th>Permiso Circ.</th>
                                            <th>Rev. Técnica</th>
                                            <th>SOAP</th>
                                            <th>Seguro Oblig.</th>
                                                <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analisisVehiculos.map((vehiculo) => {
                                            const permiso = getEstadoDocumento(vehiculo.permiso_circulacion);
                                            const revision = getEstadoDocumento(vehiculo.revision_tecnica);
                                            const soap = getEstadoDocumento(vehiculo.soap);
                                            const seguro = getEstadoDocumento(vehiculo.seguro_obligatorio);

                                            return (
                                                <tr key={vehiculo.id} onDoubleClick={() => openVehiculoModal(vehiculo.id)} style={{cursor: 'pointer'}}>
                                                    <td><strong>{vehiculo.patente}</strong></td>
                                                    <td>{vehiculo.marca} {vehiculo.modelo}</td>
                                                    <td>{vehiculo.ano}</td>
                                                    <td>{vehiculo.tipo}</td>
                                                    <td>{vehiculo.ultimo_km ? vehiculo.ultimo_km.toLocaleString() : '0'} km</td>
                                                    <td>{vehiculo.promedio_l_km || '0'} L/km</td>
                                                    <td>{formatCurrency(vehiculo.costo_por_km)}</td>
                                                    <td>{formatCurrency(vehiculo.total_gastado_mes)}</td>
                                                    <td>
                                                        <div>
                                                            <span className={`doc-badge ${permiso.clase}`} title={permiso.fecha_vencimiento ? formatDate(permiso.fecha_vencimiento) : ''}>
                                                                {permiso.texto}
                                                            </span>
                                                            {permiso.fecha_vencimiento && (
                                                                <div className="doc-fecha">{formatDate(permiso.fecha_vencimiento)}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div>
                                                            <span className={`doc-badge ${revision.clase}`} title={revision.fecha_vencimiento ? formatDate(revision.fecha_vencimiento) : ''}>
                                                                {revision.texto}
                                                            </span>
                                                            {revision.fecha_vencimiento && (
                                                                <div className="doc-fecha">{formatDate(revision.fecha_vencimiento)}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div>
                                                            <span className={`doc-badge ${soap.clase}`} title={soap.fecha_vencimiento ? formatDate(soap.fecha_vencimiento) : ''}>
                                                                {soap.texto}
                                                            </span>
                                                            {soap.fecha_vencimiento && (
                                                                <div className="doc-fecha">{formatDate(soap.fecha_vencimiento)}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div>
                                                            <span className={`doc-badge ${seguro.clase}`} title={seguro.fecha_vencimiento ? formatDate(seguro.fecha_vencimiento) : ''}>
                                                                {seguro.texto}
                                                            </span>
                                                            {seguro.fecha_vencimiento && (
                                                                <div className="doc-fecha">{formatDate(seguro.fecha_vencimiento)}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{width:'1rem'}}>
                                                        <button className="btn btn-icon" onClick={(e) => { e.stopPropagation(); openVehiculoModal(vehiculo.id); }} title="Ver detalle vehículo">🔎</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal de Detalle */}
            {modalDetalle && (
                <ModalDetalle 
                    tipo={modalDetalle} 
                    onClose={() => setModalDetalle(null)} 
                />
            )}
            {showDetalleVehiculoModal && (
                <DetalleVehiculoModal 
                    vehiculoId={selectedVehiculoId}
                    open={showDetalleVehiculoModal}
                    onClose={() => setShowDetalleVehiculoModal(false)}
                />
            )}
        </div>
    );
}

// Componente para Tabla de Mantenimientos
function TablaMantenimientos({ mantenimientos }) {
    return (
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
                    </tr>
                </thead>
                <tbody>
                    {mantenimientos.map((mant) => (
                        <tr key={mant.id} className={`row-${mant.urgencia}`}>
                            <td>
                                <span className={`urgencia-badge ${mant.urgencia}`}>
                                    <span style={{fontSize: '0.875rem'}}>●</span>
                                    <span>{mant.urgencia === 'vencido' ? 'VENCIDO' : 
                                           mant.urgencia === 'critico' ? 'CRÍTICO' : 
                                           mant.urgencia === 'urgente' ? 'URGENTE' : 'PRÓXIMO'}</span>
                                </span>
                            </td>
                            <td>
                                <div className="vehiculo-cell">
                                    <strong>{mant.vehiculo?.placa || 'N/A'}</strong>
                                    <small>{mant.vehiculo?.marca} {mant.vehiculo?.modelo}</small>
                                </div>
                            </td>
                            <td>{mant.tipo_mantenimiento}</td>
                            <td className="descripcion-cell">{mant.descripcion || '-'}</td>
                            <td>{formatDate(mant.fecha_programada)}</td>
                            <td>
                                <strong className={`dias-restantes ${mant.urgencia}`}>
                                    {mant.dias_restantes} días
                                </strong>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Componente para Tabla de Licencias
function TablaLicencias({ licencias }) {
    return (
        <div className="table-container-report">
            <table className="report-table">
                <thead>
                    <tr>
                        <th>Urgencia</th>
                        <th>Conductor</th>
                        <th>RUT</th>
                        <th>Nº Licencia</th>
                        <th>Tipo</th>
                        <th>Vencimiento</th>
                        <th>Días Restantes</th>
                        <th>Contacto</th>
                    </tr>
                </thead>
                <tbody>
                    {licencias.map((lic) => (
                        <tr key={lic.id} className={`row-${lic.urgencia}`}>
                            <td>
                                <span className={`urgencia-badge ${lic.urgencia}`}>
                                    <span style={{fontSize: '0.875rem'}}>●</span>
                                    <span>{lic.urgencia === 'vencida' ? 'VENCIDA' : 
                                           lic.urgencia === 'critico' ? 'CRÍTICO' : 
                                           lic.urgencia === 'urgente' ? 'URGENTE' : 'PRÓXIMO'}</span>
                                </span>
                            </td>
                            <td>
                                <strong>{lic.nombre_completo}</strong>
                            </td>
                            <td><code>{lic.rut}</code></td>
                            <td><code>{lic.licencia_numero}</code></td>
                            <td>
                                <span className="tipo-badge">{lic.licencia_tipo}</span>
                            </td>
                            <td>{formatDate(lic.licencia_vencimiento)}</td>
                            <td>
                                <strong className={`dias-restantes ${lic.urgencia}`}>
                                    {lic.dias_restantes} días
                                </strong>
                            </td>
                            <td>
                                <small>{lic.telefono || '-'}</small>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Modal de Detalle para KPIs
function ModalDetalle({ tipo, onClose }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetalle = async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/api/reportes/detalle_${tipo}`);
                if (res.status === 200) {
                    setData(res.data.data || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetalle();
    }, [tipo]);

    const getTitulo = () => {
        switch(tipo) {
            case 'vehiculos': return '🚗 Detalle de Vehículos';
            case 'conductores': return '👥 Detalle de Conductores';
            case 'ordenes': return '📅 Detalle de Órdenes Activas';
            case 'mantenimientos': return '🛠️ Detalle de Mantenimientos Pendientes';
            default: return 'Detalle';
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-detalle" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-detalle">
                    <h3>{getTitulo()}</h3>
                    <button className="btn-close-modal" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body-detalle">
                    {loading ? (
                        <div className="loading-state">Cargando...</div>
                    ) : (
                        <>
                            {tipo === 'vehiculos' && <TablaDetalleVehiculos data={data} />}
                            {tipo === 'conductores' && <TablaDetalleConductores data={data} />}
                            {tipo === 'ordenes' && <TablaDetalleOrdenes data={data} />}
                            {tipo === 'mantenimientos' && <TablaDetalleMantenimientos data={data} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Tabla del modal para Mantenimientos (sin urgencia, solo detalle)
function TablaDetalleMantenimientos({ data }) {
    if (!data || data.length === 0) {
        return <div className="empty-state-report">No hay mantenimientos para mostrar</div>;
    }

    return (
        <table className="modal-table">
            <thead>
                <tr>
                    <th>Patente</th>
                    <th>Modelo</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>F. Programada</th>
                    <th>Costo</th>
                </tr>
            </thead>
            <tbody>
                {data.map(m => (
                    <tr key={m.id}>
                        <td><strong>{m.vehiculo_placa || '-'}</strong></td>
                        <td>{m.vehiculo_modelo || '-'}</td>
                        <td>{m.tipo || '-'}</td>
                        <td className="descripcion-cell">{m.descripcion || '-'}</td>
                        <td>{formatDate(m.fecha_programada)}</td>
                        <td>{formatCurrency(m.costo)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaDetalleVehiculos({ data }) {
    if (!data || data.length === 0) {
        return <div className="empty-state-report">No hay vehículos para mostrar</div>;
    }
    
    return (
        <table className="modal-table">
            <thead>
                <tr>
                    <th>Placa</th>
                    <th>Marca/Modelo</th>
                    <th>Tipo</th>
                    <th>Año</th>
                    <th>KM Actual</th>
                </tr>
            </thead>
            <tbody>
                {data.map(v => (
                    <tr key={v.id}>
                        <td><strong>{v.placa || '-'}</strong></td>
                        <td>{v.marca || '-'} {v.modelo || '-'}</td>
                        <td>{v.tipo || '-'}</td>
                        <td>{v.ano || '-'}</td>
                        <td><strong>{v.km_actual ? v.km_actual.toLocaleString() + ' km' : '0 km'}</strong></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaDetalleConductores({ data }) {
    return (
        <table className="modal-table">
            <thead>
                <tr>
                    <th>Conductor</th>
                    <th>RUT</th>
                    <th>Licencia</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                    <th>Contacto</th>
                </tr>
            </thead>
            <tbody>
                {data.map(c => (
                    <tr key={c.id}>
                        <td><strong>{c.nombre_completo}</strong></td>
                        <td><code>{c.rut}</code></td>
                        <td>{c.licencia_tipo} - {c.licencia_numero}</td>
                        <td>{formatDate(c.licencia_vencimiento)}</td>
                        <td><span className="estado-badge">{c.estado}</span></td>
                        <td><small>{c.telefono}</small></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TablaDetalleOrdenes({ data }) {
    return (
        <table className="modal-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Vehículo</th>
                    <th>Conductor</th>
                    <th>Origen → Destino</th>
                    <th>Fecha Prog.</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                {data.map(o => (
                    <tr key={o.id}>
                        <td><strong>#{o.id}</strong></td>
                        <td><small>{o.vehiculo_info || '-'}</small></td>
                        <td><small>{o.conductor_nombre || '-'}</small></td>
                        <td><small>{o.origen} → {o.destino}</small></td>
                        <td>{formatDate(o.fecha_inicio_programada)}</td>
                        <td><span className="estado-badge">{o.estado}</span></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default Reportes;