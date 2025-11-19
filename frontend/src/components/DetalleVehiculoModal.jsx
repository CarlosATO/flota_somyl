import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import MapaRuta from './MapaRuta.jsx';
import './Reportes.css';

function DetalleVehiculoModal({ vehiculoId, open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [vehiculo, setVehiculo] = useState(null);
    const [documentos, setDocumentos] = useState([]);
    const [viajes, setViajes] = useState([]);
    const [limit, setLimit] = useState(10);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [loadingRuta, setLoadingRuta] = useState(false);
    const [rutaPuntos, setRutaPuntos] = useState([]);
    const [mapOrdenId, setMapOrdenId] = useState(null);
    const [openTab, setOpenTab] = useState('overview');

    const fetchData = useCallback(async () => {
        if (!open || !vehiculoId) return;
        setLoading(true);
        try {
            const resVeh = await apiFetch(`/api/vehiculos/${vehiculoId}`);
            if (resVeh.status === 200) setVehiculo(resVeh.data.data || null);

            const resDocs = await apiFetch(`/api/vehiculos/${vehiculoId}/documentos`);
            if (resDocs.status === 200) setDocumentos(resDocs.data.data || []);

            // Viajes (ordenes) - por defecto últimos <limit>
            const params = new URLSearchParams();
            params.append('vehiculo_id', vehiculoId);
            params.append('per_page', limit);
            params.append('page', 1);
            // Solo completadas/canceladas
            // No pasar estado multiple (la API acepta valor simple). Obtendremos y filtraremos en cliente
            const resViajes = await apiFetch(`/api/ordenes?${params.toString()}`);
            if (resViajes.status === 200) {
                const all = resViajes.data.data || [];
                const filtered = all.filter(v => ['completada', 'cancelada'].includes(String(v.estado).toLowerCase()));
                setViajes(filtered);
            }

        } catch (err) {
            console.error('Error cargando detalles del vehículo', err);
        } finally {
            setLoading(false);
        }
    }, [open, vehiculoId, limit]);

    useEffect(() => {
        if (open) fetchData();
    }, [open, fetchData]);

    const handleReloadViajes = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('vehiculo_id', vehiculoId);
            params.append('per_page', limit);
            params.append('page', 1);
            if (fechaDesde) params.append('fecha_desde', fechaDesde);
            if (fechaHasta) params.append('fecha_hasta', fechaHasta);
                // No pasar estado, filtraremos en el cliente si es necesario
            const resViajes = await apiFetch(`/api/ordenes?${params.toString()}`);
            if (resViajes.status === 200) {
                const all = resViajes.data.data || [];
                const filtered = all.filter(v => ['completada', 'cancelada'].includes(String(v.estado).toLowerCase()));
                setViajes(filtered);
            }
        } catch (e) {
            console.error('Error recargando viajes', e);
        } finally {
            setLoading(false);
        }
    };

    const handleVerMapa = async (ordenId) => {
        setMapOrdenId(ordenId);
        setLoadingRuta(true);
        try {
            const res = await apiFetch(`/api/ordenes/${ordenId}/ruta`);
            if (res.status === 200) setRutaPuntos(res.data.data || []);
            setOpenTab('viajes');
        } catch (e) {
            console.error('Error cargando ruta', e);
        } finally {
            setLoadingRuta(false);
        }
    };

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-detalle" onClick={(e) => e.stopPropagation()} style={{maxWidth: '1000px'}}>
                <div className="modal-header-detalle">
                    <div>
                        <h3>🚗 Detalle del Vehículo</h3>
                        <div className="modal-subtitle">{vehiculo?.placa ? `Patente: ${vehiculo.placa} • ${vehiculo?.marca || ''} ${vehiculo?.modelo || ''}` : ''}</div>
                    </div>
                    <div>
                        <button className="btn-close-modal" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div style={{padding: '1rem 1.5rem'}}>
                    <div className="modal-tabs" style={{marginBottom: '1rem'}}>
                        <button className={`tab-button ${openTab === 'overview' ? 'active' : ''}`} onClick={() => setOpenTab('overview')}>📋 Overview</button>
                        <button className={`tab-button ${openTab === 'documentos' ? 'active' : ''}`} onClick={() => setOpenTab('documentos')}>📃 Documentos</button>
                        <button className={`tab-button ${openTab === 'viajes' ? 'active' : ''}`} onClick={() => setOpenTab('viajes')}>🧭 Viajes</button>
                    </div>

                    {loading && <div className="loading-state">Cargando detalles...</div>}

                    {!loading && (
                        <div>
                            {openTab === 'overview' && (
                                <div className="form-section-pro">
                                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12}}>
                                        <div>
                                            <strong>Patente</strong>
                                            <div>{vehiculo?.placa || '-'}</div>
                                        </div>
                                        <div>
                                            <strong>Marca / Modelo</strong>
                                            <div>{vehiculo?.marca || '-'} {vehiculo?.modelo || ''}</div>
                                        </div>
                                        <div>
                                            <strong>Año</strong>
                                            <div>{vehiculo?.ano || '-'}</div>
                                        </div>
                                    </div>

                                    <div style={{marginTop: 12}}>
                                        <strong>KM Actual</strong>
                                        <div>{vehiculo?.km_actual ? `${vehiculo.km_actual} km` : '0 km'}</div>
                                    </div>

                                    <div style={{marginTop: 12, display: 'flex', gap: 12}}>
                                        <button className="btn btn-primary">Editar Vehículo</button>
                                        <button className="btn btn-secondary" onClick={() => window.open(`/vehiculos/${vehiculoId}`, '_blank')}>Ver página</button>
                                    </div>
                                </div>
                            )}

                            {openTab === 'documentos' && (
                                <div className="form-section-pro">
                                    <h4>Documentos</h4>
                                    {documentos.length === 0 ? (
                                        <div className="empty-state-report">No hay documentos registrados</div>
                                    ) : (
                                        <table className="modal-table" style={{minWidth: 600}}>
                                            <thead>
                                                <tr>
                                                    <th>Tipo</th>
                                                    <th>Número</th>
                                                    <th>Vencimiento</th>
                                                    <th>Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {documentos.map(d => (
                                                    <tr key={d.id}>
                                                        <td>{d.tipo_documento}</td>
                                                        <td>{d.numero_documento || '-'}</td>
                                                        <td>{d.fecha_vencimiento ? new Date(d.fecha_vencimiento).toLocaleDateString('es-CL') : '-'}</td>
                                                        <td>{d.fecha_vencimiento ? (() => {
                                                            const dias = Math.floor((new Date(d.fecha_vencimiento) - new Date())/(1000*60*60*24));
                                                            if (dias <= 0) return <span className="doc-vencido">VENCIDO</span>;
                                                            if (dias < 60) return <span className="doc-por-vencer">{dias} días</span>;
                                                            return <span className="doc-vigente">VIGENTE</span>;
                                                        })() : <span className="doc-sin-registro">SIN REGISTRO</span>}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {openTab === 'viajes' && (
                                <div className="form-section-pro">
                                    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12}}>
                                        <label style={{fontWeight: 600}}>Mostrar últimos</label>
                                        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                                            <option value={5}>5</option>
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                        </select>
                                        <label style={{fontWeight: 600}}>Fecha desde</label>
                                        <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                                        <label style={{fontWeight: 600}}>Fecha hasta</label>
                                        <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />

                                        <button className="btn btn-secondary" onClick={handleReloadViajes}>Filtrar</button>
                                    </div>

                                    {viajes.length === 0 ? (
                                        <div className="empty-state-report">No hay viajes.</div>
                                    ) : (
                                        <table className="modal-table">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Fecha Inicio</th>
                                                    <th>Fecha Fin</th>
                                                    <th>Origen → Destino</th>
                                                    <th>KMs</th>
                                                    <th>Conductor</th>
                                                    <th>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viajes.map(v => (
                                                    <tr key={v.id}>
                                                        <td><strong>#{v.id}</strong></td>
                                                        <td>{v.fecha_inicio_real ? new Date(v.fecha_inicio_real).toLocaleString() : (v.fecha_inicio_programada ? new Date(v.fecha_inicio_programada).toLocaleString() : '-')}</td>
                                                        <td>{v.fecha_fin_real ? new Date(v.fecha_fin_real).toLocaleString() : (v.fecha_fin_programada ? new Date(v.fecha_fin_programada).toLocaleString() : '-')}</td>
                                                        <td>{v.origen} → {v.destino}</td>
                                                        <td>{(v.kilometraje_fin && v.kilometraje_inicio) ? `${v.kilometraje_fin - v.kilometraje_inicio} km` : '-'}</td>
                                                        <td>{v.conductor ? `${v.conductor.nombre} ${v.conductor.apellido}` : '-'}</td>
                                                        <td>
                                                            <button className="btn btn-secondary" onClick={() => window.open(`/ordenes/${v.id}`, '_blank')}>Ver Orden</button>
                                                            <button className="btn btn-primary" onClick={() => handleVerMapa(v.id)} style={{marginLeft: 8}}>Ver Mapa</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {mapOrdenId && (
                                        <div style={{marginTop: 16}}>
                                            <h4>Ruta Orden #{mapOrdenId}</h4>
                                            {loadingRuta ? <div className="loading-state">Cargando mapa...</div> : (
                                                <MapaRuta puntos={rutaPuntos} />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DetalleVehiculoModal;
