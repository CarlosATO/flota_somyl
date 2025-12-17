import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Mantenimiento.css';

// --- HELPERS ---
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
        return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString('es-CL');
    } catch (e) { return dateString; }
};

const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 10);
    } catch (e) { return ''; }
};

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

// --- UPLOADER ---
const MantFileUploader = ({ mantId, onUploadSuccess, disabled }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileChange = async (e) => {
        if (!e.target.files || e.target.files.length === 0 || !mantId) {
             setUploadError("Debe seleccionar un archivo y la orden debe estar creada.");
             return;
        }
        const file = e.target.files[0];
        if (file.size > 10 * 1024 * 1024) {
            setUploadError("El archivo es muy grande (máx 10MB).");
            return;
        }
        setIsUploading(true);
        setUploadError(null);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9]/g, '_');
            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `mantenimiento/${mantId}/${safeFileName}`;

            const { error: uploadError } = await supabase.storage.from('adjuntos_ordenes').upload(filePath, file);
            if (uploadError) throw new Error(uploadError.message);

            const res = await apiFetch(`/api/mantenimiento/${mantId}/adjuntos`, {
                method: 'POST',
                body: { storage_path: filePath, nombre_archivo: file.name, mime_type: file.type }
            });

            if (res.status === 201) onUploadSuccess(res.data);
            else throw new Error(res.data?.message || 'Error guardando adjunto');
        } catch (err) {
            setUploadError(err.message || String(err));
        } finally {
            setIsUploading(false);
            e.target.value = null;
        }
    };

    return (
        <div className="adjuntos-container">
            {uploadError && <div className="modal-error-pro"><span>📤</span> {uploadError}</div>}
            <div className="uploader-box">
                <input type="file" id={`mant-file-upload`} onChange={handleFileChange} accept="image/*,application/pdf" disabled={isUploading || disabled} />
                <label htmlFor={`mant-file-upload`} className={`uploader-label ${disabled ? 'disabled' : ''}`}>Seleccionar archivo...</label>
                <p className="uploader-hint">JPG, PNG o PDF (Máx 10MB)</p>
                {isUploading && <p className="upload-progress">⏳ Subiendo archivo...</p>}
            </div>
        </div>
    );
};

// --- ADJUNTOS LIST ---
const MantAdjuntosList = ({ adjuntos, loading, onDelete }) => {
    const openPreview = async (adj) => {
        if (!adj) return;
        if (adj.publicUrl) { window.open(adj.publicUrl, '_blank', 'noopener,noreferrer'); return; }
        try {
            const tokenLocal = localStorage.getItem('token');
            const url = `/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenLocal}` } });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank', 'noopener,noreferrer');
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            }
        } catch (e) { console.error(e); }
    };

    if (loading) return <p className="loading-adjuntos">Cargando adjuntos...</p>;
    if (adjuntos.length === 0) return <p className="loading-adjuntos">📂 No hay archivos adjuntos.</p>;

    return (
        <div className="adjuntos-list">
            {adjuntos.map(adj => (
                <div key={adj.id} className="adjunto-item">
                    <div className="adjunto-info">
                        <span className="adjunto-icon">{adj.mime_type?.includes('image') ? '🖼️' : '📄'}</span>
                        <span className="adjunto-name">
                            <button type="button" className="btn-link" onClick={() => openPreview(adj)}>
                                {adj.nombre_archivo || adj.storage_path}
                            </button>
                        </span>
                    </div>
                    <button type="button" className="adjunto-delete-btn" onClick={() => onDelete(adj.id)}>×</button>
                </div>
            ))}
        </div>
    );
};

// --- MODAL FORMULARIO ---
const MantenimientoFormModal = ({ isOpen, onClose, onSave, editingMantenimiento, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('programacion');
    const [vehiculosList, setVehiculosList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);

    const requiredFields = ['vehiculo_id', 'descripcion', 'fecha_programada'];
    const mantIdActual = editingMantenimiento?.id;

    // Helper para encontrar vehículo seleccionado y sus datos de gases
    const selectedVehiculo = useMemo(() => 
        vehiculosList.find(v => String(v.id) === String(form.vehiculo_id)), 
        [vehiculosList, form.vehiculo_id]
    );

    useEffect(() => {
        if (!isOpen) return;
        const fetchVehicles = async () => {
            setLoadingLists(true);
            try {
                const resVeh = await apiFetch('/api/vehiculos/?per_page=500');
                if (resVeh.status === 200) setVehiculosList(resVeh.data.data || []);
            } catch (e) { console.error(e); }
            setLoadingLists(false);
        };
        fetchVehicles();
    }, [isOpen]);

    const fetchAdjuntos = useCallback(async (mantId) => {
        setLoadingAdjuntos(true);
        try {
            const res = await apiFetch(`/api/mantenimiento/${mantId}/adjuntos`);
            if (res.status === 200) setAdjuntos(res.data.data || []);
        } catch(e) { console.error(e); }
        setLoadingAdjuntos(false);
    }, []);

    useEffect(() => {
        if (editingMantenimiento) {
            setForm({
                vehiculo_id: editingMantenimiento.vehiculo_id || '',
                descripcion: editingMantenimiento.descripcion || '',
                tipo_mantenimiento: editingMantenimiento.tipo_mantenimiento || 'PREVENTIVO',
                estado: editingMantenimiento.estado || 'PENDIENTE',
                fecha_programada: formatDateForInput(editingMantenimiento.fecha_programada),
                km_programado: editingMantenimiento.km_programado || '',
                fecha_realizacion: formatDateForInput(editingMantenimiento.fecha_realizacion),
                km_realizacion: editingMantenimiento.km_realizacion || '',
                costo: editingMantenimiento.costo || '',
                observaciones: editingMantenimiento.observaciones || '',
                renovar_gases: '',
            });
            fetchAdjuntos(editingMantenimiento.id);
        } else {
            setForm({
                vehiculo_id: '', descripcion: '', tipo_mantenimiento: 'PREVENTIVO',
                estado: 'PENDIENTE', fecha_programada: formatDateForInput(new Date().toISOString()),
                km_programado: '', fecha_realizacion: '', km_realizacion: '',
                costo: '', observaciones: '', renovar_gases: ''
            });
            setAdjuntos([]);
        }
        setActiveTab('programacion');
    }, [editingMantenimiento, isOpen, fetchAdjuntos]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;
        if (type === 'number' || name.endsWith('_id')) {
            finalValue = value ? (name === 'costo' ? parseFloat(value) : parseInt(value, 10)) : '';
        } else if (typeof value === 'string' && name !== 'descripcion' && name !== 'observaciones' && type !== 'date') {
            finalValue = value.toUpperCase();
        }
        if (name === 'descripcion' || name === 'observaciones') finalValue = value;
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...form };
        Object.keys(payload).forEach(key => {
            if (payload[key] === '' || payload[key] === undefined || payload[key] === null) payload[key] = null;
        });
        onSave(payload, mantIdActual);
    };

    const handleUploadSuccess = (res) => {
        setAdjuntos(prev => [res.data, ...prev]);
        setActiveTab('adjuntos');
    };

    const handleDeleteAdjunto = async (adjuntoId) => {
        if (!window.confirm("¿Eliminar archivo?")) return;
        try {
            const res = await apiFetch(`/api/mantenimiento/adjuntos/${adjuntoId}`, { method: 'DELETE' });
            if (res.status === 200) setAdjuntos(adjuntos.filter(a => a.id !== adjuntoId));
            else throw new Error(res.data?.message);
        } catch (err) { alert(`Error: ${err.message}`); }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);
    const canUpload = !!mantIdActual;

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingMantenimiento ? 'Editar Mantenimiento' : 'Nueva Orden de Mantenimiento'}</h3>
                        <p className="modal-subtitle">{editingMantenimiento ? `Orden #${editingMantenimiento.id}` : 'Registra la intervención'}</p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro">×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {apiError && <div className="modal-error-pro">⚠️ {apiError}</div>}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'programacion' ? 'active' : ''}`} onClick={() => setActiveTab('programacion')}>📅 1. Detalle</button>
                        <button type="button" className={`tab-button ${activeTab === 'cierre' ? 'active' : ''}`} onClick={() => setActiveTab('cierre')}>🏁 2. Ejecución</button>
                        <button type="button" className={`tab-button ${activeTab === 'adjuntos' ? 'active' : ''}`} onClick={() => setActiveTab('adjuntos')}>📎 3. Adjuntos ({adjuntos.length})</button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando...</div>}

                        {activeTab === 'programacion' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Detalles Básicos</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Vehículo (Placa) *</label>
                                            <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange} required>
                                                <option value="">Seleccionar vehículo</option>
                                                {vehiculosList.map(v => (<option key={v.id} value={v.id}>{v.placa} - {v.marca} {v.modelo}</option>))}
                                            </select>
                                            {selectedVehiculo && (
                                                <div style={{marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.85rem'}}>
                                                    <strong>Gases: </strong>
                                                    {selectedVehiculo.gases_estado === 'VENCIDO' && <span style={{color:'#d32f2f', fontWeight:'bold'}}>⚠️ VENCIDO ({formatLocalDate(selectedVehiculo.fecha_vencimiento_gases)})</span>}
                                                    {selectedVehiculo.gases_estado === 'POR_VENCER' && <span style={{color:'#f57c00', fontWeight:'bold'}}>⏱️ POR VENCER ({formatLocalDate(selectedVehiculo.fecha_vencimiento_gases)})</span>}
                                                    {selectedVehiculo.gases_estado === 'OK' && <span style={{color:'#388e3c', fontWeight:'bold'}}>✅ OK ({formatLocalDate(selectedVehiculo.fecha_vencimiento_gases)})</span>}
                                                    {(!selectedVehiculo.gases_estado || selectedVehiculo.gases_estado === 'SIN_DATO') && <span style={{color:'#999'}}>Sin información</span>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Tipo</label>
                                            <select name="tipo_mantenimiento" value={form.tipo_mantenimiento} onChange={handleChange}>
                                                <option value="PREVENTIVO">PREVENTIVO</option>
                                                <option value="CORRECTIVO">CORRECTIVO</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1rem'}}>
                                        <label>Descripción *</label>
                                        <textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" required placeholder="Ej: Cambio de aceite..."></textarea>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Planificación</h4>
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>Fecha Programada *</label>
                                            <input name="fecha_programada" type="date" value={form.fecha_programada} onChange={handleChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Programado</label>
                                            <input name="km_programado" type="number" value={form.km_programado} onChange={handleChange} />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Estado</label>
                                            <select name="estado" value={form.estado} onChange={handleChange}>
                                                <option value="PENDIENTE">PENDIENTE</option>
                                                <option value="PROGRAMADO">PROGRAMADO</option>
                                                <option value="EN_TALLER">EN_TALLER</option>
                                                <option value="FINALIZADO">FINALIZADO</option>
                                                <option value="CANCELADO">CANCELADO</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'cierre' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Registro de Ejecución</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Fecha de Realización</label>
                                            <input name="fecha_realizacion" type="date" value={form.fecha_realizacion} onChange={handleChange} />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Realización</label>
                                            <input name="km_realizacion" type="number" value={form.km_realizacion} onChange={handleChange} />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '15px', backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', border: '1px solid #c8e6c9'}}>
                                        <label style={{color: '#2e7d32', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>📄 Actualizar Vencimiento Gases (Opcional)</label>
                                        <input name="renovar_gases" type="date" value={form.renovar_gases} onChange={handleChange} style={{border: '1px solid #a5d6a7'}} />
                                        <small style={{color: '#555', display: 'block', marginTop: '4px'}}>Ingresa la <strong>NUEVA</strong> fecha solo si se renovó el certificado.</small>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Costos y Observaciones</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Costo Total (CLP)</label>
                                            <input name="costo" type="number" value={form.costo} onChange={handleChange} step="1" />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1rem'}}>
                                        <label>Observaciones</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="4" className="textarea-pro"></textarea>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'adjuntos' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Archivos Adjuntos</h4>
                                    {!canUpload && <div className="modal-error-pro">ℹ️ Guarda la orden primero para subir archivos.</div>}
                                    <MantFileUploader mantId={mantIdActual} onUploadSuccess={handleUploadSuccess} disabled={!canUpload} />
                                    <MantAdjuntosList adjuntos={adjuntos} loading={loadingAdjuntos} onDelete={handleDeleteAdjunto} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting || loadingLists} className="btn btn-primary-pro">{submitting ? 'Guardando...' : (editingMantenimiento ? 'Guardar Cambios' : 'Crear Orden')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, submitting }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro"><h3>⚠️ {title}</h3></div>
                <div className="modal-body-pro"><p className="confirmation-message">{message}</p></div>
                <div className="modal-footer-pro">
                    <button onClick={onClose} disabled={submitting} className="btn btn-secondary-pro">Cancelar</button>
                    <button onClick={onConfirm} disabled={submitting} className="btn btn-danger-pro">{submitting ? 'Procesando...' : 'Confirmar'}</button>
                </div>
            </div>
        </div>
    );
};

function Mantenimiento({ user, token }) {
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroVehiculoId, setFiltroVehiculoId] = useState('');
    const [vehiculosFiltroList, setVehiculosFiltroList] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingMantenimiento, setEditingMantenimiento] = useState(null);
    const [deletingMantenimiento, setDeletingMantenimiento] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    const debouncedSearch = useDebounce(searchQuery, 500);

    useEffect(() => {
        if (token) {
            const fetchList = async () => {
                try {
                    const res = await apiFetch('/api/vehiculos/?per_page=500');
                    if (res.status === 200) setVehiculosFiltroList(res.data.data || []);
                } catch (e) { console.error(e); }
            };
            fetchList();
        }
    }, [token]);

    const fetchMantenimientos = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (!token) { setLoading(false); return; }
        
        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (filtroEstado) params.append('estado', filtroEstado);
        if (filtroVehiculoId) params.append('vehiculo_id', filtroVehiculoId);

        try {
            const res = await apiFetch(`/api/mantenimiento/?${params.toString()}`);
            if (res && res.status === 200) {
                setMantenimientos(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else if (res && res.status === 401) {
                setError('Sesión expirada.');
                setTimeout(() => window.location.replace('/'), 2000);
            } else {
                setError(res.data?.message || 'Error desconocido');
            }
        } catch (err) { setError('Error de conexión'); } 
        finally { setLoading(false); }
    }, [page, debouncedSearch, filtroEstado, filtroVehiculoId, meta.per_page, token]);

    useEffect(() => { if (token) fetchMantenimientos(); }, [token, fetchMantenimientos]);

    const handleFormSubmit = async (formData, mantId) => {
        setSubmitting(true);
        setFormError(null);
        const url = mantId ? `/api/mantenimiento/${mantId}` : '/api/mantenimiento/';
        const method = mantId ? 'PUT' : 'POST';
        try {
            const res = await apiFetch(url, { method, body: formData });
            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchMantenimientos();
            } else {
                setFormError(res.data?.message || 'Error al guardar');
            }
        } catch (err) { setFormError('Error de conexión'); } 
        finally { setSubmitting(false); }
    };

    const handleConfirmDelete = async () => {
        if (!deletingMantenimiento) return;
        setSubmitting(true);
        try {
            const res = await apiFetch(`/api/mantenimiento/${deletingMantenimiento.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setDeletingMantenimiento(null);
                fetchMantenimientos();
            } else { setError(res.data?.message || 'No se pudo eliminar'); }
        } catch (err) { setError('Error de conexión'); } 
        finally { setSubmitting(false); }
    };

    const getEstadoBadge = (estado) => `badge-mant-estado badge-estado-${estado?.toLowerCase()}`;
    const getTipoBadge = (tipo) => `badge-mant-tipo badge-tipo-${tipo?.toLowerCase()}`;

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="mantenimiento-container">
            <div className="mantenimiento-header">
                <div><h2>Gestión de Mantenimiento</h2><p className="header-subtitle">Control de servicios</p></div>
                {canWrite && <button onClick={() => { setEditingMantenimiento(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">➕ Nueva Orden</button>}
            </div>

            <div className="filtros-container">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input type="search" placeholder="Buscar por descripción o patente..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input-pro" />
                </div>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="filtro-select">
                    <option value="">📊 Todos los Estados</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="PROGRAMADO">PROGRAMADO</option>
                    <option value="EN_TALLER">EN TALLER</option>
                    <option value="FINALIZADO">FINALIZADO</option>
                    <option value="CANCELADO">CANCELADO</option>
                </select>
                <select value={filtroVehiculoId} onChange={(e) => setFiltroVehiculoId(e.target.value)} className="filtro-select">
                    <option value="">🚗 Todos los Vehículos</option>
                    {vehiculosFiltroList.map(v => <option key={v.id} value={v.id}>{v.placa} - {v.modelo || 'Sin modelo'}</option>)}
                </select>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-container">
                {loading ? <div className="loading-state">Cargando...</div> : (
                    <table className="mantenimiento-table">
                        <thead>
                            <tr>
                                <th>ID</th><th>Estado</th><th>Vehículo</th><th>Tipo</th><th>Descripción</th>
                                <th>F. Prog.</th><th>KM Prog.</th><th>F. Realiz.</th><th>Costo</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {mantenimientos.map(m => (
                                <tr key={m.id} onDoubleClick={() => { if(canWrite && m.estado!=='FINALIZADO') { setEditingMantenimiento(m); setShowModal(true); } }} className={canWrite && m.estado!=='FINALIZADO' ? 'row-editable' : ''}>
                                    <td className="font-bold">#{m.id}</td>
                                    <td><span className={getEstadoBadge(m.estado)}>{m.estado?.replace('_', ' ')}</span></td>
                                    <td><span className="badge-mant-placa">{m.vehiculo?.placa || '-'}</span><br/><small>{m.vehiculo?.marca} {m.vehiculo?.modelo}</small></td>
                                    <td><span className={getTipoBadge(m.tipo_mantenimiento)}>{m.tipo_mantenimiento}</span></td>
                                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.descripcion}>{m.descripcion}</td>
                                    <td>{formatLocalDate(m.fecha_programada)}</td>
                                    <td>{m.km_programado || '-'}</td>
                                    <td>{formatLocalDate(m.fecha_realizacion) || '-'}</td>
                                    <td>{formatCurrency(m.costo)}</td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && m.estado !== 'FINALIZADO' && <button onClick={() => { setEditingMantenimiento(m); setFormError(null); setShowModal(true); }} className="btn-icon-pro btn-edit-pro">✏️</button>}
                                                {isAdmin && <button onClick={() => setDeletingMantenimiento(m)} className="btn-icon-pro btn-delete-pro">🗑️</button>}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {mantenimientos.length === 0 && !loading && <div className="empty-state-pro"><p>No hay registros</p></div>}
            </div>

            <Pagination meta={meta} onPageChange={setPage} />

            <MantenimientoFormModal 
                isOpen={showModal} onClose={() => setShowModal(false)} 
                onSave={handleFormSubmit} editingMantenimiento={editingMantenimiento} 
                apiError={formError} submitting={submitting} 
            />

            <ConfirmationModal 
                isOpen={!!deletingMantenimiento} onClose={() => setDeletingMantenimiento(null)} 
                onConfirm={handleConfirmDelete} title="Eliminar Orden" 
                message={`¿Eliminar orden #${deletingMantenimiento?.id}?`} submitting={submitting} 
            />
        </div>
    );
}

export default Mantenimiento;