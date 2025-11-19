import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import MapaModal from './MapaModal.jsx';
import './Reportes.css';

function DetalleVehiculoModal({ vehiculoId, open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [vehiculo, setVehiculo] = useState(null);
    const [documentos, setDocumentos] = useState([]);
    const [viajes, setViajes] = useState([]);
    const [limit, setLimit] = useState(10);
    const toIsoDate = (d) => d.toISOString().slice(0,10);
    const today = new Date();
    const defaultHasta = toIsoDate(today);
    const defaultDesde = toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const [fechaDesde, setFechaDesde] = useState(defaultDesde);
    const [fechaHasta, setFechaHasta] = useState(defaultHasta);
    const [loadingRuta, setLoadingRuta] = useState(false);
    const [rutaPuntos, setRutaPuntos] = useState([]);
    const [mapOrdenId, setMapOrdenId] = useState(null);
    const [showMapaModal, setShowMapaModal] = useState(false);
    const [adjuntosByOrden, setAdjuntosByOrden] = useState({});
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewMime, setPreviewMime] = useState(null);
    const [loadingAdjuntosMap, setLoadingAdjuntosMap] = useState({});
    const [openTab, setOpenTab] = useState('resumen');
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

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
            // Traer una cantidad mayor para filtrar localmente (limit max 100)
            const fetchLimit = Math.max(limit, 50);
            params.append('per_page', Math.min(100, fetchLimit));
            params.append('page', 1);
            // Solo completadas/canceladas
            // No pasar estado multiple (la API acepta valor simple). Obtendremos y filtraremos en cliente
            // Use new consolidated endpoint for vehicle trips
            const resViajes = await apiFetch(`/api/vehiculos/${vehiculoId}/viajes?${params.toString()}`);
            if (resViajes.status === 200) {
                const all = resViajes.data.data || [];
                // Filter by state and by date window (fecha_inicio_real | fecha_fin_real | fecha_inicio_programada)
                const desdeDate = fechaDesde ? new Date(fechaDesde) : null;
                const hastaDate = fechaHasta ? new Date(fechaHasta) : null;
                const withinRange = (v) => {
                    const fechaRealInicio = v.fecha_inicio_real ? new Date(v.fecha_inicio_real) : null;
                    const fechaRealFin = v.fecha_fin_real ? new Date(v.fecha_fin_real) : null;
                    const fechaProg = v.fecha_inicio_programada ? new Date(v.fecha_inicio_programada) : null;
                    // Prefer real dates, otherwise programada
                    const candidate = fechaRealInicio || fechaRealFin || fechaProg;
                    if (!candidate) return false;
                    if (desdeDate && candidate < desdeDate) return false;
                    if (hastaDate && candidate > (new Date(hastaDate.getTime() + 24*60*60*1000 - 1))) return false;
                    return true;
                };

                const filtered = all.filter(v => ['completada', 'cancelada'].includes(String(v.estado).toLowerCase()) && withinRange(v));
                // sort by fecha_fin_real desc or fecha_inicio_real
                filtered.sort((a,b) => {
                    const da = a.fecha_fin_real ? new Date(a.fecha_fin_real) : (a.fecha_inicio_real ? new Date(a.fecha_inicio_real) : new Date(0));
                    const db = b.fecha_fin_real ? new Date(b.fecha_fin_real) : (b.fecha_inicio_real ? new Date(b.fecha_inicio_real) : new Date(0));
                    return db - da;
                });

                setViajes(filtered.slice(0, limit));
            }

        } catch (err) {
            console.error('Error cargando detalles del vehículo', err);
        } finally {
            setLoading(false);
        }
    }, [open, vehiculoId, limit, fechaDesde, fechaHasta]);

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
            const resViajes = await apiFetch(`/api/vehiculos/${vehiculoId}/viajes?${params.toString()}`);
            if (resViajes.status === 200) {
                const all = resViajes.data.data || [];
                const filtered = all.filter(v => ['completada', 'cancelada'].includes(String(v.estado).toLowerCase()));
                setViajes(filtered.slice(0, limit));
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
            const maxPoints = 800;
            const res = await apiFetch(`/api/ordenes/${ordenId}/ruta?max_points=${maxPoints}`);
            if (res.status === 200) setRutaPuntos(res.data.data || []);
            // Open the large separate modal to display route
            setShowMapaModal(true);
        } catch (e) {
            console.error('Error cargando ruta', e);
        } finally {
            setLoadingRuta(false);
        }
    };

    const handleVerAdjuntos = async (ordenId) => {
        // Toggle: if already loaded, remove to hide
        if (adjuntosByOrden[ordenId]) {
            const copy = { ...adjuntosByOrden };
            delete copy[ordenId];
            setAdjuntosByOrden(copy);
            return;
        }
        setLoadingAdjuntosMap(prev => ({ ...prev, [ordenId]: true }));
        try {
            const res = await apiFetch(`/api/ordenes/${ordenId}/adjuntos`);
            if (res.status === 200) {
                const data = res.data.data || [];
                // Build public URL for each using Supabase storage client
                const mapped = data.map(a => {
                    let publicUrl = a.publicUrl || null;
                    if (!publicUrl) {
                        try {
                            const urlRes = supabase.storage.from('adjuntos_ordenes').getPublicUrl(a.storage_path);
                            publicUrl = (urlRes && urlRes.data && urlRes.data.publicUrl) || urlRes?.publicUrl || null;
                        } catch (e) {
                            console.error('Error generando publicUrl', e);
                        }
                    }
                    return { ...a, publicUrl };
                });
                setAdjuntosByOrden(prev => ({ ...prev, [ordenId]: mapped }));
            }
        } catch (e) {
            console.error('Error cargando adjuntos de orden', e);
        } finally {
            setLoadingAdjuntosMap(prev => ({ ...prev, [ordenId]: false }));
        }
    };

    const openPreview = async (adj) => {
        setPreviewMime(null);
        // If the backend returned a publicUrl, use it directly
        if (adj.publicUrl) {
            setPreviewUrl(adj.publicUrl);
            setPreviewOpen(true);
            return;
        }
        // Otherwise, download via backend (requires Authorization token)
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const url = `/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                setPreviewUrl(blobUrl);
                setPreviewMime(blob.type);
                setPreviewOpen(true);
            } else {
                console.error('Error descargando archivo para preview', res.status);
            }
        } catch (e) {
            console.error('Error preview adjunto: ', e);
        }
    }

    const closePreview = () => {
        if (previewUrl && !previewUrl.startsWith('http')) {
            // It's a blob created by us; revoke
            try { URL.revokeObjectURL(previewUrl); } catch (e) {}
        }
        setPreviewUrl(null);
        setPreviewMime(null);
        setPreviewOpen(false);
    };

    const downloadAdjunto = async (adj) => {
        try {
            const tokenLocal = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const url = `/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenLocal}` } });
            if (res.ok) {
                const blob = await res.blob();
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = adj.nombre_archivo || 'file';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
            } else {
                console.error('Error al descargar adjunto: ', res.status);
            }
        } catch (e) { console.error('Error descargando adjunto', e); }
    }

    if (!open) return null;

    return (
        <>
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
                        <button className={`tab-button ${openTab === 'resumen' ? 'active' : ''}`} onClick={() => setOpenTab('resumen')}>📋 Resumen</button>
                        <button className={`tab-button ${openTab === 'documentos' ? 'active' : ''}`} onClick={() => setOpenTab('documentos')}>📃 Documentos</button>
                        <button className={`tab-button ${openTab === 'viajes' ? 'active' : ''}`} onClick={() => setOpenTab('viajes')}>🧭 Viajes</button>
                    </div>

                    {loading && <div className="loading-state">Cargando detalles...</div>}
                    {!token && (
                        <div className="error-state" style={{marginTop: '0.5rem'}}>⚠️ No hay sesión activa. Inicia sesión para ver viajes y adjuntos.</div>
                    )}

                    {!loading && (
                        <div>
                            {openTab === 'resumen' && (
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

                                    <div style={{marginTop: 8}}>
                                        <strong>KM Recorridos (registrados)</strong>
                                        <div>{vehiculo?.km_recorridos ? `${vehiculo.km_recorridos} km` : '0 km'}</div>
                                    </div>

                                    <div style={{marginTop: 12, display: 'flex', gap: 12}}>
                                        <button className="btn btn-primary" onClick={() => {
                                            // Request the app to navigate to the Vehículos module and open edit modal
                                            try {
                                                if (typeof window !== 'undefined') {
                                                    window.localStorage.setItem('openVehiculoEdit', JSON.stringify({ id: vehiculoId }));
                                                    window.dispatchEvent(new CustomEvent('app-navigate', { detail: { module: 'vehiculos' } }));
                                                }
                                            } catch (e) { console.error('Error navigating to vehiculos', e); }
                                            onClose();
                                        }}>Editar Vehículo</button>
                                        {/* Eliminado el botón Ver página (evitaba navegación indeseada) */}
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
                                    <div style={{marginBottom: 8}}>
                                        <strong>Total KM (en esta lista):</strong> {viajes.reduce((acc, v) => acc + ((v.kilometraje_fin && v.kilometraje_inicio) ? (v.kilometraje_fin - v.kilometraje_inicio) : 0), 0)} km
                                    </div>

                                    {viajes.length === 0 ? (
                                        <div className="empty-state-report">No hay viajes.</div>
                                    ) : (
                                        <div className="viajes-scroll">
                                            <table className="modal-table">
                                            <thead>
                                                <tr>
                                                        <th>ID</th>
                                                        <th>Fecha Inicio</th>
                                                        <th>Fecha Fin</th>
                                                        <th>Origen → Destino</th>
                                                        <th>KMs</th>
                                                        <th>Conductor</th>
                                                        <th>Ruta realizada</th>
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
                                                            <button className="btn btn-primary" onClick={() => handleVerMapa(v.id)}>Ver Mapa</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Inline map removed in favor of a separate modal */}

                                    {/* Adjuntos por orden (si se cargaron) */}
                                    {Object.keys(adjuntosByOrden).length > 0 && ( 
                                        <div style={{marginTop: 16}}>
                                            <h4>Fotos de viajes</h4>
                                            {Object.entries(adjuntosByOrden).map(([ordenId, arr]) => (
                                                <div key={ordenId} style={{marginBottom: 12}}>
                                                    <h5>Orden #{ordenId}</h5>
                                                    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                                                                {arr.length === 0 ? <small>No hay archivos adjuntos</small> : arr.map(a => (
                                                                    <div key={a.id} style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                                                        <button className="adjunto-thumb" onClick={() => openPreview(a)}>
                                                                            {a.publicUrl ? (
                                                                                <img src={a.publicUrl} alt={a.nombre_archivo} style={{width: 120, height: 80, objectFit: 'cover', borderRadius: 6}} />
                                                                            ) : (
                                                                                <div className="adjunto-placeholder" style={{width: 120, height: 80, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, background: '#f3f4f6'}}>
                                                                                    📁
                                                                                </div>
                                                                            )}
                                                                        </button>
                                                                        <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                                                                            <div style={{fontWeight: 600}}>{a.nombre_archivo}</div>
                                                                            <div style={{display: 'flex', gap: 8}}>
                                                                                {a.publicUrl ? (
                                                                                    <a className="btn btn-secondary" href={a.publicUrl} target="_blank" rel="noopener noreferrer">Abrir</a>
                                                                                ) : (
                                                                                    <button className="btn btn-secondary" onClick={() => openPreview(a)}>Ver</button>
                                                                                )}
                                                                                <button className="btn" onClick={() => downloadAdjunto(a)}>⬇️</button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
        <MapaModal
            open={showMapaModal}
            title={mapOrdenId ? `Ruta realizada - Orden #${mapOrdenId}` : 'Ruta realizada'}
            onClose={() => setShowMapaModal(false)}
            puntos={rutaPuntos}
            loading={loadingRuta}
        />

        {/* Adjuntos preview modal */}
        {previewOpen && (
            <div className="adjuntos-modal-overlay" onClick={(e) => { if (e.target.classList.contains('adjuntos-modal-overlay')) closePreview(); }}>
                <div className="adjuntos-modal">
                    <div className="adjuntos-modal-header">
                        <div><strong>Vista previa: {vehiculo?.placa || ''}</strong></div>
                        <div>
                            <button className="btn-close-modal" onClick={closePreview}>✕</button>
                        </div>
                    </div>
                    <div className="adjuntos-modal-body">
                        {previewUrl ? (
                            previewMime && previewMime.startsWith('image') ? (
                                <img src={previewUrl} alt="Preview" style={{width: '100%', height: 'auto', borderRadius: 8}} />
                            ) : (
                                <div style={{padding: 16}}>
                                    <a className="btn btn-primary" href={previewUrl} target="_blank" rel="noopener noreferrer">Abrir archivo</a>
                                </div>
                            )
                        ) : (
                            <div className="loading-state">Cargando...</div>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

export default DetalleVehiculoModal;
