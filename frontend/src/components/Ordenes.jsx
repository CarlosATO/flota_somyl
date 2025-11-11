// En: frontend/src/components/Ordenes.jsx

import { useState, useEffect, useCallback, useMemo } from 'react';
// IMPORTAMOS LOS DOS CLIENTES:
import { apiFetch } from '../lib/api'; // Para nuestro Backend (Flask)
import { supabase } from '../lib/supabase'; // Para Supabase Storage (Archivos)
import './Ordenes.css';

// --- useDebounce (Sin cambios) ---
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// --- Pagination (Sin cambios) ---
const Pagination = ({ meta, onPageChange }) => {
    if (!meta || meta.pages <= 1) return null;
    return (
        <div className="pagination">
            <span>Página {meta.page} de {meta.pages} (Total: {meta.total})</span>
            <div className="pagination-controls">
                <button onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} className="btn btn-secondary">Anterior</button>
                <button onClick={() => onPageChange(meta.page + 1)} disabled={meta.page >= meta.pages} className="btn btn-secondary">Siguiente</button>
            </div>
        </div>
    );
};

// --- Helpers de Fechas (Sin cambios) ---
const formatLocalDate = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    } catch (e) { return dateString; }
};

const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) { return ''; }
};

// --- Componente del Modal ---

const OrdenFormModal = ({ isOpen, onClose, onSave, editingOrden, apiError, submitting, defaultTab = 'detalle' }) => {
    
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [form, setForm] = useState({});
    
    // Listas para <select>
    const [vehiculosList, setVehiculosList] = useState([]);
    const [conductoresList, setConductoresList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);

    // --- NUEVOS ESTADOS PARA ADJUNTOS ---
    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    // Para errores específicos del upload
    const [uploadError, setUploadError] = useState(null); 
    
    const requiredFields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion'];

    // Cargar listas de Vehículos/Conductores (Sin cambios)
    useEffect(() => {
        if (!isOpen) return;
        const fetchLists = async () => {
            setLoadingLists(true);
            try {
                const resVeh = await apiFetch('/api/vehiculos/?per_page=500');
                if (resVeh.status === 200) setVehiculosList(resVeh.data.data || []);
                const resCond = await apiFetch('/api/conductores/?per_page=500');
                if (resCond.status === 200) setConductoresList(resCond.data.data || []);
            } catch (e) { console.error("Error cargando listas", e); }
            setLoadingLists(false);
        };
        fetchLists();
    }, [isOpen]);

    // Cargar datos del formulario Y ADJUNTOS
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab);
            setUploadError(null); // Limpiar errores de upload
        }

        if (editingOrden) {
            // Cargar datos del formulario
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(editingOrden.fecha_inicio_programada),
                // ... (resto de los campos del formulario, sin cambios)
                fecha_fin_programada: formatDateTimeForInput(editingOrden.fecha_fin_programada),
                fecha_inicio_real: formatDateTimeForInput(editingOrden.fecha_inicio_real),
                fecha_fin_real: formatDateTimeForInput(editingOrden.fecha_fin_real),
                origen: editingOrden.origen || '',
                destino: editingOrden.destino || '',
                descripcion: editingOrden.descripcion || '',
                estado: editingOrden.estado || 'pendiente',
                vehiculo_id: editingOrden.vehiculo_id || '',
                conductor_id: editingOrden.conductor_id || '',
                kilometraje_inicio: editingOrden.kilometraje_inicio || '',
                kilometraje_fin: editingOrden.kilometraje_fin || '',
                observaciones: editingOrden.observaciones || '',
            });

            // --- NUEVO: Cargar lista de adjuntos ---
            const fetchAdjuntos = async () => {
                setLoadingAdjuntos(true);
                // Llamamos al nuevo endpoint del backend
                const res = await apiFetch(`/api/ordenes/${editingOrden.id}/adjuntos`);
                if (res.status === 200) {
                    setAdjuntos(res.data.data || []);
                }
                setLoadingAdjuntos(false);
            };
            fetchAdjuntos();

        } else {
            // Limpiar formulario para "Crear"
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(new Date().toISOString()),
                // ... (resto de campos vacíos, sin cambios)
                fecha_fin_programada: '', fecha_inicio_real: '', fecha_fin_real: '',
                origen: '', destino: '', descripcion: '', estado: 'pendiente',
                vehiculo_id: '', conductor_id: '', kilometraje_inicio: '',
                kilometraje_fin: '', observaciones: '',
            });
            setAdjuntos([]); // Limpiar adjuntos si es una orden nueva
        }
    }, [editingOrden, isOpen, defaultTab]);

    // HandleChange (Sin cambios)
    const handleChange = (e) => {
        const { name, value } = e.target;
        let finalValue = value;
        if (name === 'vehiculo_id' || name === 'conductor_id' || name === 'kilometraje_inicio' || name === 'kilometraje_fin') {
            finalValue = value ? parseInt(value, 10) : '';
        }
        setForm({ ...form, [name]: finalValue });
    };

    // HandleSubmit (Sin cambios)
    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...form };
        try {
            if (payload.fecha_inicio_programada) payload.fecha_inicio_programada = new Date(payload.fecha_inicio_programada).toISOString();
            if (payload.fecha_fin_programada) payload.fecha_fin_programada = new Date(payload.fecha_fin_programada).toISOString();
            if (payload.fecha_inicio_real) payload.fecha_inicio_real = new Date(payload.fecha_inicio_real).toISOString();
            if (payload.fecha_fin_real) payload.fecha_fin_real = new Date(payload.fecha_fin_real).toISOString();
        } catch (e) { console.error("Error al formatear fechas para envío", e); }
        onSave(payload, editingOrden ? editingOrden.id : null);
    };

    // --- NUEVO: Handler para subir archivos ---
    const handleFileChange = async (e) => {
        if (!e.target.files || e.target.files.length === 0 || !editingOrden) return;
        const file = e.target.files[0];
        
        // No permitir archivos muy grandes
        if (file.size > 10 * 1024 * 1024) { // 10MB Límite
            setUploadError("El archivo es muy grande (máx 10MB).");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        
        try {
            // 1. Subir a Supabase Storage (La "bodega")
            // Usamos el ID de la orden y la fecha para un nombre único
            const filePath = `${editingOrden.id}/${new Date().getTime()}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes') // El bucket que creamos
                .upload(filePath, file);

            if (uploadError) {
                throw new Error(uploadError.message);
            }

            // 2. Guardar en nuestro Backend (El "archivador" SQL)
            // Llamamos al endpoint de Flask que guarda la metadata
            const res = await apiFetch(`/api/ordenes/${editingOrden.id}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath, // La "dirección" que nos dio Storage
                    nombre_archivo: file.name,
                    mime_type: file.type
                }
            });

            if (res.status === 201) {
                // Éxito: añadir el nuevo adjunto a la lista visible
                setAdjuntos([res.data, ...adjuntos]);
            } else {
                throw new Error(res.data?.message || 'Error guardando el registro del adjunto');
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message);
        } finally {
            setIsUploading(false);
            // Limpiar el input de archivo
            e.target.value = null; 
        }
    };

    // --- NUEVO: Handler para borrar archivos ---
    const handleDeleteAdjunto = async (adjuntoId) => {
        // Pedir confirmación
        if (!window.confirm("¿Estás seguro de eliminar este archivo?")) {
            return;
        }
        
        try {
            // Llamamos al endpoint DELETE de nuestro backend
            // (Flask se encarga de borrarlo de SQL y de Storage)
            const res = await apiFetch(`/api/adjuntos/${adjuntoId}`, { method: 'DELETE' });
            
            if (res.status === 200) {
                // Éxito: quitar el adjunto de la lista visible
                setAdjuntos(adjuntos.filter(a => a.id !== adjuntoId));
            } else {
                throw new Error(res.data?.message || 'Error al borrar');
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message);
        }
    };

    // --- NUEVO: Helper para obtener la URL pública ---
    const getPublicUrl = (storagePath) => {
        try {
            const { data } = supabase.storage
                .from('adjuntos_ordenes')
                .getPublicUrl(storagePath);
            return data.publicUrl;
        } catch (e) {
            return '#';
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    {/* ... (header del modal - sin cambios) ... */}
                    <div>
                        <h3>{editingOrden ? 'Editar Orden de Servicio' : 'Crear Nueva Orden'}</h3>
                        <p className="modal-subtitle">
                            {editingOrden ? `Modificando Orden #${editingOrden.id}` : 'Completa los detalles del servicio'}
                        </p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro" type="button">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    {/* Error global (para Guardar) */}
                    {apiError && (
                        <div className="modal-error-pro">
                            <span className="error-icon-pro">⚠</span>
                            <span>{apiError}</span>
                        </div>
                    )}
                    {/* Error de Upload */}
                    {uploadError && (
                        <div className="modal-error-pro">
                            <span className="error-icon-pro">📤</span>
                            <span>{uploadError}</span>
                        </div>
                    )}


                    <div className="modal-tabs">
                        {/* ... (botones de pestañas - sin cambios) ... */}
                        <button type="button" className={`tab-button ${activeTab === 'detalle' ? 'active' : ''}`} onClick={() => setActiveTab('detalle')}>📍 Detalles del Viaje</button>
                        <button type="button" className={`tab-button ${activeTab === 'asignacion' ? 'active' : ''}`} onClick={() => setActiveTab('asignacion')}>👤 Asignación</button>
                        <button type="button" className={`tab-button ${activeTab === 'registro' ? 'active' : ''}`} onClick={() => setActiveTab('registro')}>📈 Registro (KM y Reales)</button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando...</div>}

                        {/* --- Pestaña 1: Detalles del Viaje --- */}
                        {activeTab === 'detalle' && !loadingLists && (
                            <div className="tab-content">
                                {/* ... (Formulario de Origen, Destino, Fechas - sin cambios) ... */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Servicio</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Origen <span className="required-star">*</span></label><input name="origen" value={form.origen} onChange={handleChange} required /></div>
                                        <div className="form-group-pro"><label>Destino <span className="required-star">*</span></label><input name="destino" value={form.destino} onChange={handleChange} required /></div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1.25rem'}}><label>Descripción / Motivo <span className="required-star">*</span></label><textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" required></textarea></div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Fechas Programadas</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Inicio Programado <span className="required-star">*</span></label><input name="fecha_inicio_programada" type="datetime-local" value={form.fecha_inicio_programada} onChange={handleChange} required /></div>
                                        <div className="form-group-pro"><label>Fin Programado</label><input name="fecha_fin_programada" type="datetime-local" value={form.fecha_fin_programada} onChange={handleChange} /></div>
                                    </div>
                                </div>
                                
                                {/* --- ¡NUEVA SECCIÓN DE ADJUNTOS! --- */}
                                {/* Solo mostrar si estamos EDITANDO una orden */}
                                {editingOrden && (
                                    <div className="form-section-pro adjuntos-container">
                                        <h4 className="section-title-pro">📷 Adjuntos (Fotos, Guías)</h4>
                                        
                                        <div className="uploader-box">
                                            <input 
                                                type="file" 
                                                id="file-upload" 
                                                onChange={handleFileChange}
                                                accept="image/*,application/pdf"
                                                disabled={isUploading}
                                            />
                                            <label htmlFor="file-upload" className="uploader-label">
                                                Seleccionar archivo...
                                            </label>
                                            <p className="uploader-hint">JPG, PNG o PDF (Máx 10MB)</p>
                                            {isUploading && <p className="upload-progress">Subiendo, por favor espera...</p>}
                                        </div>

                                        <div className="adjuntos-list">
                                            {loadingAdjuntos ? (
                                                <p className="loading-adjuntos">Cargando adjuntos...</p>
                                            ) : (
                                                adjuntos.map(adj => (
                                                    <div key={adj.id} className="adjunto-item">
                                                        <div className="adjunto-info">
                                                            <span className="adjunto-icon">
                                                                {adj.mime_type?.includes('image') ? '🖼️' : '📄'}
                                                            </span>
                                                            <span className="adjunto-name">
                                                                {/* Hacemos un link público al archivo */}
                                                                <a href={getPublicUrl(adj.storage_path)} target="_blank" rel="noopener noreferrer">
                                                                    {adj.nombre_archivo || adj.storage_path}
                                                                </a>
                                                            </span>
                                                        </div>
                                                        <button 
                                                            type="button" 
                                                            className="adjunto-delete-btn"
                                                            title="Eliminar adjunto"
                                                            onClick={() => handleDeleteAdjunto(adj.id)}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                            {!loadingAdjuntos && adjuntos.length === 0 && (
                                                <p className="loading-adjuntos">No hay archivos adjuntos para esta orden.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {/* --- FIN DE SECCIÓN ADJUNTOS --- */}

                            </div>
                        )}
                        
                        {/* --- Pestaña 2: Asignación (Sin cambios) --- */}
                        {activeTab === 'asignacion' && !loadingLists && (
                            <div className="tab-content">
                                {/* ... (contenido sin cambios) ... */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Asignación de Recursos</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Vehículo (Placa)</label>
                                            <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {vehiculosList.map(v => (<option key={v.id} value={v.id}>{v.placa} ({v.marca} {v.modelo})</option>))}
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Conductor (Nombre)</label>
                                            <select name="conductor_id" value={form.conductor_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {conductoresList.map(c => (<option key={c.id} value={c.id}>{c.nombre} {c.apellido} ({c.rut})</option>))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Estado de la Orden</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Estado</label>
                                            <select name="estado" value={form.estado} onChange={handleChange}>
                                                <option value="pendiente">PENDIENTE</option><option value="asignada">ASIGNADA</option>
                                                <option value="en_curso">EN CURSO</option><option value="completada">COMPLETADA</option>
                                                <option value="cancelada">CANCELADA</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- Pestaña 3: Registro (Sin cambios) --- */}
                        {activeTab === 'registro' && !loadingLists && (
                            <div className="tab-content">
                                {/* ... (contenido sin cambios) ... */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Fechas Reales (Ejecución)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Inicio Real</label><input name="fecha_inicio_real" type="datetime-local" value={form.fecha_inicio_real} onChange={handleChange} /></div>
                                        <div className="form-group-pro"><label>Fin Real</label><input name="fecha_fin_real" type="datetime-local" value={form.fecha_fin_real} onChange={handleChange} /></div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Kilometraje (Odómetro)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>KM Inicio</label><input name="kilometraje_inicio" type="number" value={form.kilometraje_inicio} onChange={handleChange} /></div>
                                        <div className="form-group-pro"><label>KM Fin</label><input name="kilometraje_fin" type="number" value={form.kilometraje_fin} onChange={handleChange} /></div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Notas Adicionales</h4>
                                    <div className="form-group-pro">
                                        <label>Observaciones (Conductor o Dispatcher)</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="4" className="textarea-pro"></textarea>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                    
                    {/* --- Footer Global del Modal (Sin cambios) --- */}
                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting || loadingLists || isUploading} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (editingOrden ? '💾 Actualizar' : '➕ Crear Orden')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- ConfirmationModal (Sin cambios) ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, submitting }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro"><h3>⚠️ {title}</h3></div>
                <div className="modal-body-pro"><p className="confirmation-message">{message}</p></div>
                <div className="modal-footer-pro">
                    <button onClick={onClose} disabled={submitting} className="btn btn-secondary-pro">Cancelar</button>
                    <button onClick={onConfirm} disabled={submitting} className="btn btn-danger-pro">
                        {submitting ? 'Procesando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Componente Principal Ordenes (Sin cambios, solo usa el Modal actualizado) ---
function Ordenes({ user, token }) {
    const [ordenes, setOrdenes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingOrden, setEditingOrden] = useState(null);
    const [cancelingOrden, setCancelingOrden] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [modalDefaultTab, setModalDefaultTab] = useState('detalle');

    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    const debouncedSearch = useDebounce(searchQuery, 500);

    // fetchOrdenes (Sin cambios)
    const fetchOrdenes = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (filtroEstado) params.append('estado', filtroEstado);
        
        try {
            const res = await apiFetch(`/api/ordenes/?${params.toString()}`);
            if (res && res.status === 200) {
                setOrdenes(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else { setError(res.data?.message || 'Error cargando órdenes'); }
        } catch (err) { setError('Error de conexión'); } 
        finally { setLoading(false); }
    }, [page, debouncedSearch, filtroEstado, meta.per_page]);

    // useEffect (Sin cambios)
    useEffect(() => {
        if (token) { fetchOrdenes(); }
    }, [token, fetchOrdenes]);

    // handleFormSubmit (Sin cambios)
    const handleFormSubmit = async (formData, ordenId) => {
        setSubmitting(true);
        setFormError(null);
        const url = ordenId ? `/api/ordenes/${ordenId}` : '/api/ordenes/';
        const method = ordenId ? 'PUT' : 'POST';
        try {
            const res = await apiFetch(url, { method, body: formData });
            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchOrdenes();
            } else { setFormError(res.data?.message || 'Error al guardar la orden'); }
        } catch (err) { setFormError('Error de conexión'); } 
        finally { setSubmitting(false); }
    };

    // handleConfirmCancel (Sin cambios)
    const handleConfirmCancel = async () => {
        if (!cancelingOrden) return;
        setSubmitting(true);
        try {
            const res = await apiFetch(`/api/ordenes/${cancelingOrden.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setCancelingOrden(null);
                fetchOrdenes();
            } else { setError(res.data?.message || 'No se pudo cancelar la orden'); }
        } catch (err) { setError('Error de conexión'); } 
        finally { setSubmitting(false); }
    };

    // getEstadoBadge (Sin cambios)
    const getEstadoBadge = (estado) => `badge-estado badge-estado-${estado || 'default'}`;

    if (!token) {
        return (<div className="ordenes-container"><div className="loading-state">Cargando...</div></div>);
    }

    // --- RENDER (Sin cambios, solo usa el Modal actualizado) ---
    return (
        <div className="ordenes-container">
            <div className="ordenes-header">
                <div>
                    <h2>Gestión de Órdenes</h2>
                    <p className="header-subtitle">Administra los viajes, despachos y asignaciones de la flota</p>
                </div>
                {canWrite && (
                    <button onClick={() => { 
                        setEditingOrden(null); setFormError(null); 
                        setModalDefaultTab('detalle'); setShowModal(true); 
                    }} className="btn btn-primary">
                        ➕ Nueva Orden
                    </button>
                )}
            </div>

            <div className="filtros-container">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input type="search" placeholder="Buscar por origen, destino..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input-pro" />
                </div>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="filtro-estado-select">
                    <option value="">Todos los Estados</option>
                    <option value="pendiente">PENDIENTE</option><option value="asignada">ASIGNADA</option>
                    <option value="en_curso">EN CURSO</option><option value="completada">COMPLETADA</option>
                    <option value="cancelada">CANCELADA</option>
                </select>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-container">
                {loading && ordenes.length === 0 ? (
                    <div className="loading-state">Cargando órdenes...</div>
                ) : (
                    <table className="ordenes-table">
                        <thead>
                            <tr>
                                <th>ID</th><th>Estado</th><th>Inicio Programado</th><th>Origen</th>
                                <th>Destino</th><th>Vehículo</th><th>Conductor</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {ordenes.map(o => (
                                <tr key={o.id}>
                                    <td className="font-bold">#{o.id}</td>
                                    <td><span className={getEstadoBadge(o.estado)}>{o.estado.replace('_', ' ')}</span></td>
                                    <td>{formatLocalDate(o.fecha_inicio_programada)}</td>
                                    <td>{o.origen}</td>
                                    <td>{o.destino}</td>
                                    <td>{o.vehiculo ? `${o.vehiculo.placa}` : '-'}</td>
                                    <td>{o.conductor ? `${o.conductor.nombre} ${o.conductor.apellido}` : '-'}</td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && (
                                                    <button onClick={() => { 
                                                        setEditingOrden(o); setFormError(null); 
                                                        setModalDefaultTab('detalle'); setShowModal(true); 
                                                    }} className="btn-icon-pro btn-edit-pro" title="Editar">
                                                        ✏️
                                                    </button>
                                                )}
                                                {canWrite && (o.estado === 'asignada' || o.estado === 'en_curso') && (
                                                     <button onClick={() => { 
                                                        setEditingOrden(o); setFormError(null); 
                                                        setModalDefaultTab('registro'); setShowModal(true); 
                                                    }} className="btn-icon-pro" title="Finalizar / Registrar KM">
                                                        🏁
                                                    </button>
                                                )}
                                                {(isAdmin || canWrite) && o.estado !== 'completada' && o.estado !== 'cancelada' && (
                                                    <button onClick={() => setCancelingOrden(o)} className="btn-icon-pro btn-delete-pro" title="Cancelar Orden">
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {ordenes.length === 0 && !loading && (
                    <div className="empty-state-pro">
                        <span className="empty-icon-pro">📅</span>
                        <p>No se encontraron órdenes</p>
                    </div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            <OrdenFormModal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)} 
                onSave={handleFormSubmit} 
                editingOrden={editingOrden} 
                apiError={formError} 
                submitting={submitting} 
                defaultTab={modalDefaultTab}
            />

            <ConfirmationModal 
                isOpen={!!cancelingOrden} 
                onClose={() => setCancelingOrden(null)} 
                onConfirm={handleConfirmCancel} 
                title="Confirmar Cancelación"
                message={`¿Estás seguro de cancelar la orden #${cancelingOrden?.id}? Esta acción cambiará el estado a 'cancelada'.`} 
                submitting={submitting} 
            />
        </div>
    );
}

export default Ordenes;