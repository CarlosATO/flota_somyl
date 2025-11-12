// En: frontend/src/components/Ordenes.jsx
// --- VERSIÓN CON LÓGICA DE PESTAÑAS MEJORADA ---

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Ordenes.css';

// --- (useDebounce, Pagination, formatLocalDate, formatDateTimeForInput: SIN CAMBIOS) ---
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};
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

// --- COMPONENTE UPLOADER REUTILIZABLE ---
// (Movemos la lógica de UI del uploader a su propio componente)
const FileUploader = ({ ordenId, tipoAdjunto, onUploadSuccess, disabled }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileChange = async (e) => {
        if (!e.target.files || e.target.files.length === 0 || !ordenId) return;
        
        const file = e.target.files[0];
        
        if (file.size > 10 * 1024 * 1024) { // 10MB Límite
            setUploadError("El archivo es muy grande (máx 10MB).");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        
        try {
            // 1. Sanitizar nombre y crear path
            const fileExt = file.name.split('.').pop();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.'))
                .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_');
            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `${ordenId}/${safeFileName}`;

            // 2. Subir a Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes')
                .upload(filePath, file);

            if (uploadError) throw new Error(uploadError.message);

            // 3. Guardar en Backend (Flask)
            const res = await apiFetch(`/api/ordenes/${ordenId}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath,
                    nombre_archivo: file.name,
                    mime_type: file.type,
                    tipo_adjunto: tipoAdjunto // <-- ¡Enviamos la etiqueta!
                }
            });

            if (res.status === 201) {
                onUploadSuccess(res.data); // Devolvemos el adjunto
            } else {
                throw new Error(res.data?.message || 'Error guardando adjunto');
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message);
        } finally {
            setIsUploading(false);
            e.target.value = null; 
        }
    };

    return (
        <div className="adjuntos-container">
            {uploadError && <div className="modal-error-pro" style={{marginBottom: '1rem'}}>{uploadError}</div>}
            <div className="uploader-box">
                <input 
                    type="file" 
                    id={`file-upload-${tipoAdjunto}`}
                    onChange={handleFileChange}
                    accept="image/*,application/pdf"
                    disabled={isUploading || disabled}
                />
                <label htmlFor={`file-upload-${tipoAdjunto}`} className={`uploader-label ${disabled ? 'disabled' : ''}`}>
                    Seleccionar archivo...
                </label>
                <p className="uploader-hint">JPG, PNG o PDF (Máx 10MB)</p>
                {isUploading && <p className="upload-progress">Subiendo...</p>}
            </div>
        </div>
    );
};

// --- LISTA DE ADJUNTOS REUTILIZABLE ---
const AdjuntosList = ({ adjuntos, loading, onDelete }) => {
    
    const getPublicUrl = (storagePath) => {
        try {
            const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(storagePath);
            return data.publicUrl;
        } catch (e) { return '#'; }
    };
    
    if (loading) {
        return <p className="loading-adjuntos">Cargando adjuntos...</p>
    }
    
    if (adjuntos.length === 0) {
        return <p className="loading-adjuntos">No hay archivos adjuntos.</p>
    }

    return (
        <div className="adjuntos-list">
            {adjuntos.map(adj => (
                <div key={adj.id} className="adjunto-item">
                    <div className="adjunto-info">
                        <span className="adjunto-icon">
                            {adj.mime_type?.includes('image') ? '🖼️' : '📄'}
                        </span>
                        <span className="adjunto-name">
                            <a href={getPublicUrl(adj.storage_path)} target="_blank" rel="noopener noreferrer">
                                {adj.nombre_archivo || adj.storage_path}
                            </a>
                        </span>
                    </div>
                    <button 
                        type="button" 
                        className="adjunto-delete-btn"
                        title="Eliminar adjunto"
                        onClick={() => onDelete(adj.id)}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};


// --- Componente del Modal ---

const OrdenFormModal = ({ isOpen, onClose, onSave, editingOrden, apiError, submitting, defaultTab = 'detalle' }) => {
    
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [form, setForm] = useState({});
    
    const [vehiculosList, setVehiculosList] = useState([]);
    const [conductoresList, setConductoresList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);

    // --- ESTADOS DE ADJUNTOS SEPARADOS ---
    const [adjuntosInicio, setAdjuntosInicio] = useState([]);
    const [adjuntosCierre, setAdjuntosCierre] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);
    
    const [tempOrdenId, setTempOrdenId] = useState(null);
    const [uploadError, setUploadError] = useState(null); // Errores de upload
    
    const requiredFields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion'];

    // Cargar listas (Sin cambios)
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

    // Función para cargar adjuntos, ahora reutilizable
    const fetchAdjuntos = useCallback(async (ordenId) => {
        setLoadingAdjuntos(true);
        const res = await apiFetch(`/api/ordenes/${ordenId}/adjuntos`);
        if (res.status === 200) {
            const todos = res.data.data || [];
            // Filtramos por el nuevo tipo
            setAdjuntosInicio(todos.filter(a => a.tipo_adjunto === 'inicio'));
            setAdjuntosCierre(todos.filter(a => a.tipo_adjunto === 'cierre'));
        }
        setLoadingAdjuntos(false);
    }, []);

    // Cargar datos del formulario Y ADJUNTOS
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab);
            setUploadError(null);
            setTempOrdenId(null); 
        }

        if (editingOrden) {
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(editingOrden.fecha_inicio_programada),
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

            // Cargar adjuntos
            fetchAdjuntos(editingOrden.id);

        } else {
            // Limpiar formulario para "Crear"
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(new Date().toISOString()),
                fecha_fin_programada: '', fecha_inicio_real: '', fecha_fin_real: '',
                origen: '', destino: '', descripcion: '', estado: 'pendiente',
                vehiculo_id: '', conductor_id: '', kilometraje_inicio: '',
                kilometraje_fin: '', observaciones: '',
            });
            setAdjuntosInicio([]); // Limpiar adjuntos
            setAdjuntosCierre([]); // Limpiar adjuntos
        }
    }, [editingOrden, isOpen, defaultTab, fetchAdjuntos]);

    // HandleChange (Sin cambios)
    const handleChange = (e) => {
        const { name, value } = e.target;
        let finalValue = value;
        if (name === 'vehiculo_id' || name === 'conductor_id' || name === 'kilometraje_inicio' || name === 'kilometraje_fin') {
            finalValue = value ? parseInt(value, 10) : '';
        }
        setForm({ ...form, [name]: finalValue });
    };

    // HandleSubmit (Sin cambios, usa la lógica de 2 filas)
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (form.estado === 'completada' && !form.fecha_fin_real) {
            setUploadError('No puedes completar la orden sin registrar la Fecha de Fin Real (pestaña Cierre).');
            setActiveTab('registro');
            return;
        }
        
        const payload = { ...form };
        try {
            if (payload.fecha_inicio_programada) payload.fecha_inicio_programada = new Date(payload.fecha_inicio_programada).toISOString();
            if (payload.fecha_fin_programada) payload.fecha_fin_programada = new Date(payload.fecha_fin_programada).toISOString();
            if (payload.fecha_inicio_real) payload.fecha_inicio_real = new Date(payload.fecha_inicio_real).toISOString();
            if (payload.fecha_fin_real) payload.fecha_fin_real = new Date(payload.fecha_fin_real).toISOString();
        } catch (e) { console.error("Error formateando fechas", e); }
        
        const ordenIdParaGuardar = editingOrden ? editingOrden.id : tempOrdenId;
        await onSave(payload, ordenIdParaGuardar);
    };

    // --- Handler para CREAR BORRADOR (si es necesario) ---
    const getOrdenIdParaAdjuntos = async () => {
        let ordenId = editingOrden ? editingOrden.id : tempOrdenId;
        
        if (!ordenId) {
            console.log('📝 No hay orden, creando borrador...');
            setUploadError(null);
            
            const borradorPayload = {
                fecha_inicio_programada: form.fecha_inicio_programada || new Date().toISOString(),
                origen: form.origen || 'Por definir',
                destino: form.destino || 'Por definir',
                descripcion: form.descripcion || 'Borrador - completar datos',
                estado: 'pendiente'
            };
            
            // Llamamos a onSave (handleFormSubmit) para crear el borrador
            const borradorGuardado = await onSave(borradorPayload, null);
            
            if (borradorGuardado && borradorGuardado.id) {
                ordenId = borradorGuardado.id;
                setTempOrdenId(ordenId); // Guardamos el ID del borrador
                console.log('✅ Borrador creado con ID:', ordenId);
            } else {
                setUploadError('No se pudo crear el borrador de la orden.');
                return null;
            }
        }
        return ordenId;
    };
    
    // --- Handler de ÉXITO DE SUBIDA ---
    const handleUploadSuccess = (nuevoAdjunto) => {
        if (nuevoAdjunto.tipo_adjunto === 'cierre') {
            setAdjuntosCierre(prev => [nuevoAdjunto, ...prev]);
        } else {
            setAdjuntosInicio(prev => [nuevoAdjunto, ...prev]);
        }
    };

    // --- Handler para borrar archivos ---
    const handleDeleteAdjunto = async (adjuntoId) => {
        if (!window.confirm("¿Estás seguro de eliminar este archivo?")) return;
        setUploadError(null);
        try {
            const res = await apiFetch(`/api/adjuntos/${adjuntoId}`, { method: 'DELETE' });
            if (res.status === 200) {
                // Borrar de la lista local
                setAdjuntosInicio(prev => prev.filter(a => a.id !== adjuntoId));
                setAdjuntosCierre(prev => prev.filter(a => a.id !== adjuntoId));
            } else {
                throw new Error(res.data?.message || 'Error al borrar');
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message);
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);
    const ordenIdActual = editingOrden?.id || tempOrdenId;

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingOrden ? 'Editar Orden de Servicio' : 'Crear Nueva Orden'}</h3>
                        <p className="modal-subtitle">
                            {editingOrden ? `Modificando Orden #${editingOrden.id}` : (tempOrdenId ? `Borrador Orden #${tempOrdenId}` : 'Completa los detalles')}
                        </p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro" type="button">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    {apiError && <div className="modal-error-pro"><span>⚠</span> {apiError}</div>}
                    {uploadError && <div className="modal-error-pro"><span>📤</span> {uploadError}</div>}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'detalle' ? 'active' : ''}`} onClick={() => setActiveTab('detalle')}>📍 1. Datos y Partida</button>
                        <button type="button" className={`tab-button ${activeTab === 'asignacion' ? 'active' : ''}`} onClick={() => setActiveTab('asignacion')}>👤 2. Asignación</button>
                        <button type="button" className={`tab-button ${activeTab === 'registro' ? 'active' : ''}`} onClick={() => setActiveTab('registro')}>🏁 3. Cierre (KM y Fotos)</button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando...</div>}

                        {/* --- Pestaña 1: Detalles y Partida --- */}
                        {activeTab === 'detalle' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Servicio Programado</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Origen <span className="required-star">*</span></label><input name="origen" value={form.origen} onChange={handleChange} required /></div>
                                        <div className="form-group-pro"><label>Destino <span className="required-star">*</span></label><input name="destino" value={form.destino} onChange={handleChange} required /></div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1.25rem'}}><label>Descripción / Motivo <span className="required-star">*</span></label><textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" required></textarea></div>
                                    <div className="form-grid-2" style={{marginTop: '1.25rem'}}>
                                        <div className="form-group-pro"><label>Inicio Programado <span className="required-star">*</span></label><input name="fecha_inicio_programada" type="datetime-local" value={form.fecha_inicio_programada} onChange={handleChange} required /></div>
                                        <div className="form-group-pro"><label>Fin Programado</label><input name="fecha_fin_programada" type="datetime-local" value={form.fecha_fin_programada} onChange={handleChange} /></div>
                                    </div>
                                </div>
                                
                                {/* --- ¡NUEVO! Sección de Partida --- */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Registro de Partida (Real)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Inicio Real</label><input name="fecha_inicio_real" type="datetime-local" value={form.fecha_inicio_real} onChange={handleChange} /></div>
                                        <div className="form-group-pro"><label>KM Inicio</label><input name="kilometraje_inicio" type="number" value={form.kilometraje_inicio} onChange={handleChange} /></div>
                                    </div>
                                </div>
                                
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">📷 Adjuntos de Inicio (Ej: Guías)</h4>
                                    <FileUploader 
                                        ordenId={ordenIdActual} // ID actual (sea de edición o borrador)
                                        tipoAdjunto="inicio"
                                        onUploadSuccess={handleUploadSuccess}
                                        disabled={!ordenIdActual} // Deshabilitado si es orden nueva sin borrador
                                    />
                                    {/* Info box si es orden nueva */}
                                    {!editingOrden && !tempOrdenId && (
                                        <div className="upload-info-box">
                                            ℹ️ Para adjuntar archivos, primero completa y <strong>guarda la orden</strong>, o sube un archivo (se creará un borrador).
                                        </div>
                                    )}
                                    <AdjuntosList 
                                        adjuntos={adjuntosInicio}
                                        loading={loadingAdjuntos}
                                        onDelete={handleDeleteAdjunto}
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* --- Pestaña 2: Asignación (Sin cambios) --- */}
                        {activeTab === 'asignacion' && !loadingLists && (
                            <div className="tab-content">
                                {/* ... (contenido sin cambios) ... */}
                            </div>
                        )}

                        {/* --- Pestaña 3: Cierre (KM y Fotos) --- */}
                        {activeTab === 'registro' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Registro de Cierre (Real)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Fin Real</label><input name="fecha_fin_real" type="datetime-local" value={form.fecha_fin_real} onChange={handleChange} /></div>
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

                                {/* --- ¡NUEVO! Uploader de Cierre --- */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">📷 Adjuntos de Cierre (Ej: Guía firmada)</h4>
                                    <FileUploader 
                                        ordenId={ordenIdActual}
                                        tipoAdjunto="cierre"
                                        onUploadSuccess={handleUploadSuccess}
                                        disabled={!ordenIdActual}
                                    />
                                    {!editingOrden && !tempOrdenId && (
                                        <div className="upload-info-box">
                                            ℹ️ Primero debes guardar la orden para poder adjuntar archivos de cierre.
                                        </div>
                                    )}
                                    <AdjuntosList 
                                        adjuntos={adjuntosCierre}
                                        loading={loadingAdjuntos}
                                        onDelete={handleDeleteAdjunto}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* --- Footer Global del Modal (Sin cambios) --- */}
                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting || loadingLists} className="btn btn-primary-pro">
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
    // ... (código sin cambios)
};


// --- Componente Principal Ordenes ---
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
        // ... (código sin cambios)
    }, [page, debouncedSearch, filtroEstado, meta.per_page]);

    // useEffect (Sin cambios)
    useEffect(() => {
        if (token) { fetchOrdenes(); }
    }, [token, fetchOrdenes]);

    // handleFormSubmit (¡MODIFICADO PARA MANEJAR BORRADOR!)
    const handleFormSubmit = async (formData, ordenId) => {
        setSubmitting(true);
        setFormError(null);
        
        const url = ordenId ? `/api/ordenes/${ordenId}` : '/api/ordenes/';
        const method = ordenId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });
            
            if (res && (res.status === 200 || res.status === 201)) {
                
                // Si es una actualización (PUT), cerramos el modal y refrescamos
                if (method === 'PUT') {
                    setShowModal(false);
                    fetchOrdenes();
                }
                
                // Retornamos los datos (para la lógica de borrador)
                return res.data?.data || res.data;
            } else { 
                setFormError(res.data?.message || 'Error al guardar la orden');
                return null; // Devuelve null si falla
            }
        } catch (err) { 
            console.error('❌ Error:', err);
            setFormError('Error de conexión'); 
            return null; // Devuelve null si falla
        } finally { 
            setSubmitting(false); 
        }
    };

    // handleConfirmCancel (Sin cambios)
    const handleConfirmCancel = async () => {
        // ... (código sin cambios)
    };

    // getEstadoBadge (Sin cambios)
    const getEstadoBadge = (estado) => `badge-estado badge-estado-${estado || 'default'}`;

    if (!token) {
        return (<div className="ordenes-container"><div className="loading-state">Cargando...</div></div>);
    }

    // --- RENDER (Con las nuevas columnas) ---
    return (
        <div className="ordenes-container">
            <div className="ordenes-header">
                {/* ... (header sin cambios) ... */}
            </div>

            <div className="filtros-container">
                {/* ... (filtros sin cambios) ... */}
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-container">
                {loading && ordenes.length === 0 ? (
                    <div className="loading-state">Cargando órdenes...</div>
                ) : (
                    <table className="ordenes-table">
                        <thead>
                            {/* --- CABECERAS ACTUALIZADAS --- */}
                            <tr>
                                <th>ID</th>
                                <th>Estado</th>
                                <th>Inicio Prog.</th>
                                <th>Fin Prog.</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Vehículo</th>
                                <th>Conductor</th>
                                <th>Inicio Real</th>
                                <th>Fin Real</th>
                                <th>KM Inicio</th>
                                <th>KM Fin</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {ordenes.map(o => {
                                const isClickable = canWrite && o.estado !== 'completada' && o.estado !== 'cancelada';
                                const handleRowClick = () => {
                                    if (!isClickable) return;
                                    setEditingOrden(o); setFormError(null); 
                                    setModalDefaultTab('detalle'); setShowModal(true);
                                };

                                return (
                                    <tr key={o.id} className={isClickable ? 'clickable-row' : ''} onClick={handleRowClick}>
                                        <td className="font-bold">#{o.id}</td>
                                        <td><span className={getEstadoBadge(o.estado)}>{o.estado.replace('_', ' ')}</span></td>
                                        <td>{formatLocalDate(o.fecha_inicio_programada)}</td>
                                        {/* --- FILAS ACTUALIZADAS --- */}
                                        <td>{formatLocalDate(o.fecha_fin_programada)}</td>
                                        <td>{o.origen}</td>
                                        <td>{o.destino}</td>
                                        <td>{o.vehiculo ? `${o.vehiculo.placa}` : '-'}</td>
                                        <td>{o.conductor ? `${o.conductor.nombre} ${o.conductor.apellido}` : '-'}</td>
                                        <td>{formatLocalDate(o.fecha_inicio_real)}</td>
                                        <td>{formatLocalDate(o.fecha_fin_real)}</td>
                                        <td>{o.kilometraje_inicio || '-'}</td>
                                        <td>{o.kilometraje_fin || '-'}</td>
                                        {/* --- --- */}
                                        {(canWrite || isAdmin) && (
                                            <td>
                                                <div className="action-buttons-pro" onClick={(e) => e.stopPropagation()}>
                                                    {/* ... (Botones ✏️ 🏁 🗑️ sin cambios) ... */}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
                {/* ... (empty state sin cambios) ... */}
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