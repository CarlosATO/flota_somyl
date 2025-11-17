import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Ordenes.css';
import MapaRuta from './MapaRuta'; // <--- AGREGADO: componente de mapa

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

// *** COMPONENTE DE ALERTAS ***
const AlertasLicencias = () => {
    const [alertas, setAlertas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [visible, setVisible] = useState(false);

    const fetchAlertas = async () => {
        setLoading(true);
        const res = await apiFetch('/api/ordenes/alertas/licencias');
        if (res.status === 200) {
            setAlertas(res.data.data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAlertas();
    }, []);

    if (loading || alertas.length === 0) return null;

    return (
        <div className="alertas-widget">
            <button 
                className="alertas-toggle" 
                onClick={() => setVisible(!visible)}
                title={`${alertas.length} licencia(s) por vencer`}
            >
                🚨 {alertas.length}
            </button>
            
            {visible && (
                <div className="alertas-panel">
                    <div className="alertas-header">
                        <h4>⚠️ Licencias por Vencer (30 días)</h4>
                        <button onClick={() => setVisible(false)}>×</button>
                    </div>
                    <div className="alertas-list">
                        {alertas.map(a => (
                            <div key={a.id} className="alerta-item">
                                <div className="alerta-conductor">
                                    <strong>{a.nombre} {a.apellido}</strong>
                                    <span className="alerta-rut">{a.rut}</span>
                                </div>
                                <div className="alerta-licencia">
                                    <span className="badge-licencia">{a.licencia_tipo}</span>
                                    <span className={`dias-restantes ${a.dias_restantes <= 7 ? 'critico' : ''}`}>
                                        {a.dias_restantes} días
                                    </span>
                                </div>
                                <div className="alerta-fecha">
                                    Vence: {new Date(a.licencia_vencimiento).toLocaleDateString('es-CL')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const OrdenFormModal = ({ isOpen, onClose, onSave, editingOrden, apiError, submitting, defaultTab = 'detalle' }) => {
    
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [form, setForm] = useState({});
    
    const [vehiculosList, setVehiculosList] = useState([]);
    const [conductoresList, setConductoresList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);

    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [tempOrdenId, setTempOrdenId] = useState(null);
    
    const requiredFields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion'];

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
                vehiculo_id: editingOrden.vehiculo_id || null,
                conductor_id: editingOrden.conductor_id || null,
                kilometraje_inicio: editingOrden.kilometraje_inicio || null,
                kilometraje_fin: editingOrden.kilometraje_fin || null,
                observaciones: editingOrden.observaciones || '',
            });

            const fetchAdjuntos = async () => {
                setLoadingAdjuntos(true);
                const res = await apiFetch(`/api/ordenes/${editingOrden.id}/adjuntos`);
                if (res.status === 200) {
                    setAdjuntos(res.data.data || []);
                }
                setLoadingAdjuntos(false);
            };
            fetchAdjuntos();

        } else {
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(new Date().toISOString()),
                fecha_fin_programada: '', fecha_inicio_real: '', fecha_fin_real: '',
                origen: '', destino: '', descripcion: '',
                vehiculo_id: null, conductor_id: null, kilometraje_inicio: null,
                kilometraje_fin: null, observaciones: '',
            });
            setAdjuntos([]);
        }
    }, [editingOrden, isOpen, defaultTab]);

    // Previene scroll del body cuando modal está abierto
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }

        // Cleanup al desmontar
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        let finalValue = value;
        if (name === 'vehiculo_id' || name === 'conductor_id' || name === 'kilometraje_inicio' || name === 'kilometraje_fin') {
            finalValue = value ? parseInt(value, 10) : null;
        }
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = async (e) => {
        // *** MODIFICADO: Validar antes de guardar ***
        e.preventDefault();
        
        // Validación: No permitir "completada" sin fecha_fin_real
        if (form.estado === 'completada' && !form.fecha_fin_real) {
            setUploadError('No puedes completar la orden sin registrar la Fecha de Fin Real (pestaña Registro).');
            return;
        }
        
        const payload = { ...form };
        try {
            if (payload.fecha_inicio_programada) payload.fecha_inicio_programada = new Date(payload.fecha_inicio_programada).toISOString();
            if (payload.fecha_fin_programada) payload.fecha_fin_programada = new Date(payload.fecha_fin_programada).toISOString();
            if (payload.fecha_inicio_real) payload.fecha_inicio_real = new Date(payload.fecha_inicio_real).toISOString();
            if (payload.fecha_fin_real) payload.fecha_fin_real = new Date(payload.fecha_fin_real).toISOString();
        } catch (e) { console.error("Error formateando fechas", e); }
        
        // --- ¡AQUÍ ESTÁ LA MAGIA DEL ARREGLO! ---
        // Si estamos editando, usa el ID de edición.
        // Si no, usa el ID del borrador temporal (si existe).
        const ordenIdParaGuardar = editingOrden ? editingOrden.id : tempOrdenId;
        
        // Simplemente llamamos a guardar.
        // El componente "Padre" (onSave) se encargará de cerrar el modal.
        await onSave(payload, ordenIdParaGuardar);
    };

    const handleFileChange = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        if (file.size > 10 * 1024 * 1024) {
            setUploadError("El archivo es muy grande (máx 10MB).");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        
        try {
            let ordenId = editingOrden ? editingOrden.id : tempOrdenId;
            
            if (!ordenId) {
                console.log('📝 Creando borrador para adjuntos...');
                
                const borradorPayload = {
                    fecha_inicio_programada: form.fecha_inicio_programada || new Date().toISOString(),
                    origen: form.origen || 'Por definir',
                    destino: form.destino || 'Por definir',
                    descripcion: form.descripcion || 'Borrador - completar datos'
                };
                
                const resBorrador = await apiFetch('/api/ordenes/', {
                    method: 'POST',
                    body: borradorPayload
                });
                
                if (resBorrador && resBorrador.status === 201) {
                    ordenId = resBorrador.data?.data?.id || resBorrador.data?.id;
                    setTempOrdenId(ordenId);
                    console.log('✅ Borrador creado:', ordenId);
                } else {
                    throw new Error('No se pudo crear borrador');
                }
            }
            
            const fileExt = file.name.split('.').pop();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.'))
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/__+/g, '_');

            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `${ordenId}/${safeFileName}`;

            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes')
                .upload(filePath, file);

            if (uploadError) {
                if (uploadError.message.includes('policy')) {
                    throw new Error('Error de permisos en Storage');
                }
                throw new Error(uploadError.message);
            }

            const res = await apiFetch(`/api/ordenes/${ordenId}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath,
                    nombre_archivo: file.name,
                    mime_type: file.type
                }
            });

            if (res.status === 201) {
                setAdjuntos([res.data, ...adjuntos]);
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

    const handleDeleteAdjunto = async (adjuntoId) => {
        if (!window.confirm("¿Estás seguro de eliminar este archivo?")) return;
        
        try {
            const res = await apiFetch(`/api/adjuntos/${adjuntoId}`, { method: 'DELETE' });
            if (res.status === 200) {
                setAdjuntos(adjuntos.filter(a => a.id !== adjuntoId));
            } else {
                throw new Error(res.data?.message || 'Error al borrar');
            }
        } catch (err) {
            setUploadError(err.message);
        }
    };

    const getPublicUrl = (storagePath) => {
        try {
            const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(storagePath);
            return data.publicUrl;
        } catch (e) {
            return '#';
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);
    const canUploadFiles = true;

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-xlarge" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingOrden ? 'Editar Orden de Servicio' : 'Crear Nueva Orden'}</h3>
                        <p className="modal-subtitle">
                            {editingOrden ? `Modificando Orden #${editingOrden.id}` : (tempOrdenId ? `Orden #${tempOrdenId} creada - Completa los datos` : 'Completa los detalles del servicio')}
                        </p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro" type="button">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    {apiError && (
                        <div className="modal-error-pro">
                            <span className="error-icon-pro">⚠</span>
                            <span>{apiError}</span>
                        </div>
                    )}
                    {uploadError && (
                        <div className="modal-error-pro">
                            <span className="error-icon-pro">📤</span>
                            <span>{uploadError}</span>
                        </div>
                    )}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'detalle' ? 'active' : ''}`} onClick={() => setActiveTab('detalle')}>
                            📍 Datos del Servicio y Asignación
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'registro' ? 'active' : ''}`} onClick={() => setActiveTab('registro')}>
                            🏁 Cierre (KM y Fechas Reales)
                        </button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando...</div>}

                        {/* TAB 1: DETALLE */}
                        {activeTab === 'detalle' && !loadingLists && (
                            <div className="tab-content">
                                {/* SECCIÓN: SERVICIO */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">🚦 Información del Servicio</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Origen <span className="required-star">*</span></label>
                                            <input name="origen" value={form.origen} onChange={handleChange} placeholder="Ej: Santiago Centro" required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Destino <span className="required-star">*</span></label>
                                            <input name="destino" value={form.destino} onChange={handleChange} placeholder="Ej: Valparaíso" required />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1rem'}}>
                                        <label>Descripción / Motivo del Viaje <span className="required-star">*</span></label>
                                        <textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" placeholder="Describe el tipo de servicio, cliente, observaciones..." required></textarea>
                                    </div>
                                </div>

                                {/* SECCIÓN: FECHAS PROGRAMADAS */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">📅 Fechas Programadas</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Inicio Programado <span className="required-star">*</span></label>
                                            <input name="fecha_inicio_programada" type="datetime-local" value={form.fecha_inicio_programada} onChange={handleChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fin Programado (Opcional)</label>
                                            <input name="fecha_fin_programada" type="datetime-local" value={form.fecha_fin_programada} onChange={handleChange} />
                                        </div>
                                    </div>
                                </div>

                                {/* SECCIÓN: ASIGNACIÓN (MOVIDA AQUÍ) */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">� Asignación de Recursos</h4>
                                    <div className="info-box-estado-inline">
                                        <strong>ℹ️ Estado Automático:</strong> PENDIENTE (sin asignar) → ASIGNADA (con vehículo y conductor) → COMPLETADA (con fecha fin y km)
                                    </div>
                                    <div className="form-grid-2" style={{marginTop: '1rem'}}>
                                        <div className="form-group-pro">
                                            <label>Vehículo (Placa)</label>
                                            <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {vehiculosList.map(v => (<option key={v.id} value={v.id}>{v.placa} - {v.marca} {v.modelo}</option>))}
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Conductor</label>
                                            <select name="conductor_id" value={form.conductor_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {conductoresList.map(c => (<option key={c.id} value={c.id}>{c.nombre} {c.apellido} ({c.rut})</option>))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* SECCIÓN: ADJUNTOS */}
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
                                        <label htmlFor="file-upload" className={`uploader-label ${isUploading ? 'disabled' : ''}`}>
                                            📎 Seleccionar archivo...
                                        </label>
                                        <p className="uploader-hint">JPG, PNG o PDF (Máx 10MB)</p>
                                        {isUploading && <p className="upload-progress">⏳ Subiendo archivo...</p>}
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
                                            <p className="loading-adjuntos">📂 No hay archivos adjuntos aún.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* TAB 2: ASIGNACIÓN */}
                        {/* TAB 2: ASIGNACIÓN eliminada */}

                        {/* TAB 3: REGISTRO/CIERRE */}
                        {activeTab === 'registro' && !loadingLists && (
                            <div className="tab-content">
                                <div className="warning-box-cierre">
                                    ⚠️ <strong>Importante:</strong> Para marcar la orden como COMPLETADA, debes registrar AMBOS campos: <strong>Fecha Fin Real</strong> y <strong>KM Fin</strong>. Si falta alguno, la orden NO se cerrará automáticamente.
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">🕐 Fechas Reales de Ejecución</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Inicio Real</label>
                                            <input name="fecha_inicio_real" type="datetime-local" value={form.fecha_inicio_real} onChange={handleChange} />
                                            <small className="input-hint-pro">Fecha/hora en que realmente comenzó el servicio</small>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fin Real (Cierre)</label>
                                            <input name="fecha_fin_real" type="datetime-local" value={form.fecha_fin_real} onChange={handleChange} />
                                            <small className="input-hint-pro">Fecha/hora en que finalizó el servicio</small>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">🛣️ Kilometraje (Odómetro)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>KM Inicio</label>
                                            <input name="kilometraje_inicio" type="number" value={form.kilometraje_inicio} onChange={handleChange} placeholder="Ej: 12500" />
                                            <small className="input-hint-pro">Lectura del odómetro al iniciar</small>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Fin (Cierre)</label>
                                            <input name="kilometraje_fin" type="number" value={form.kilometraje_fin} onChange={handleChange} placeholder="Ej: 12750" />
                                            <small className="input-hint-pro">Lectura del odómetro al finalizar</small>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">📝 Notas Finales</h4>
                                    <div className="form-group-pro">
                                        <label>Observaciones</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="4" className="textarea-pro" placeholder="Notas del conductor, incidencias, comentarios adicionales..."></textarea>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* *** FOOTER SIEMPRE VISIBLE *** */}
                    <div className="modal-footer-pro-fixed">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                            ← Cancelar
                        </button>
                        <button type="submit" disabled={isFormInvalid || submitting || loadingLists || isUploading} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (editingOrden ? '💾 Actualizar Orden' : '➕ Crear Orden')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, submitting }) => {
    // Previene scroll del body cuando modal está abierto
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }

        // Cleanup al desmontar
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [isOpen]);

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

    // --- ESTADOS PARA EL MAPA ---
    const [showMapa, setShowMapa] = useState(false);
    const [rutaData, setRutaData] = useState([]);
    const [ordenParaMapa, setOrdenParaMapa] = useState(null);
    const [loadingMapa, setLoadingMapa] = useState(false);

    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    const debouncedSearch = useDebounce(searchQuery, 500);

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

    useEffect(() => {
        if (token) { fetchOrdenes(); }
    }, [token, fetchOrdenes]);

    const handleFormSubmit = async (formData, ordenId) => {
        // *** MODIFICADO: Cierra el modal y maneja PUT/POST correctamente ***
        setSubmitting(true);
        setFormError(null);
        
        // Esta lógica ahora es 100% correcta gracias al arreglo anterior.
        // Si ordenId tiene un valor (sea de edición o borrador), hará un PUT.
        // Si ordenId es null (creación limpia sin foto), hará un POST.
        const url = ordenId ? `/api/ordenes/${ordenId}` : '/api/ordenes/';
        const method = ordenId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });
            
            if (res && (res.status === 200 || res.status === 201)) {
                // --- ¡AQUÍ ESTÁ LA MAGIA DEL ARREGLO! ---
                // Cerramos el modal y refrescamos la lista SIEMPRE.
                setShowModal(false);
                fetchOrdenes();
                
                // Retornamos los datos (para la lógica de borrador)
                return res.data?.data || res.data;
            } else { 
                setFormError(res.data?.message || 'Error al guardar la orden'); 
            }
        } catch (err) { 
            console.error('❌ Error:', err);
            setFormError('Error de conexión'); 
        } finally { 
            setSubmitting(false); 
        }
    };

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

    const getEstadoBadge = (estado) => {
        const badges = {
            'pendiente': 'badge-estado-pendiente',
            'asignada': 'badge-estado-asignada',
            'completada': 'badge-estado-completada',
            'cancelada': 'badge-estado-cancelada'
        };
        return `badge-estado ${badges[estado] || 'badge-estado-default'}`;
    };

    // --- FUNCION PARA CARGAR RUTA Y MOSTRAR MAPA ---
    const handleVerMapa = async (orden) => {
        setOrdenParaMapa(orden);
        setRutaData([]);
        setShowMapa(true);
        setLoadingMapa(true);
        try {
            const res = await apiFetch(`/api/ordenes/${orden.id}/ruta`);
            if (res && res.status === 200) {
                setRutaData(res.data.data || []);
            }
        } catch (e) {
            console.error('Error cargando ruta GPS', e);
        } finally {
            setLoadingMapa(false);
        }
    };

    if (!token) {
        return (<div className="ordenes-container"><div className="loading-state">Cargando...</div></div>);
    }

    return (
        <div className="ordenes-container">
            {/* WIDGET DE ALERTAS */}
            <AlertasLicencias />

            <div className="ordenes-header">
                <div>
                    <h2>Gestión de Órdenes de Servicio</h2>
                    <p className="header-subtitle">Control total de viajes, despachos y asignaciones de la flota</p>
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
                    <input type="search" placeholder="Buscar por origen, destino o descripción..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input-pro" />
                </div>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="filtro-estado-select">
                    <option value="">📊 Todos los Estados</option>
                    <option value="pendiente">🟡 PENDIENTE</option>
                    <option value="asignada">🟢 ASIGNADA</option>
                    <option value="completada">✅ COMPLETADA</option>
                    <option value="cancelada">❌ CANCELADA</option>
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
                                // Definimos si la fila es "clicable"
                                const isClickable = canWrite && o.estado !== 'completada' && o.estado !== 'cancelada';
                                // Handler para el clic en la fila
                                const handleRowClick = () => {
                                    if (!isClickable) return;
                                    setEditingOrden(o); 
                                    setFormError(null); 
                                    setModalDefaultTab('detalle'); 
                                    setShowModal(true);
                                };
                                return (
                                    <tr 
                                        key={o.id} 
                                        className={isClickable ? 'clickable-row' : ''}
                                        onDoubleClick={handleRowClick}
                                    >
                                        <td className="font-bold">#{o.id}</td>
                                        <td><span className={getEstadoBadge(o.estado)}>{o.estado.replace('_', ' ')}</span></td>
                                        <td>{formatLocalDate(o.fecha_inicio_programada)}</td>
                                        <td>{formatLocalDate(o.fecha_fin_programada)}</td>
                                        <td>{o.origen}</td>
                                        <td>{o.destino}</td>
                                        <td>{o.vehiculo ? `${o.vehiculo.placa}` : '-'}</td>
                                        <td>{o.conductor ? `${o.conductor.nombre} ${o.conductor.apellido}` : '-'}</td>
                                        <td>{formatLocalDate(o.fecha_inicio_real)}</td>
                                        <td>{formatLocalDate(o.fecha_fin_real)}</td>
                                        <td>{o.kilometraje_inicio || '-'}</td>
                                        <td>{o.kilometraje_fin || '-'}</td>
                                        {(canWrite || isAdmin) && (
                                            <td>
                                                <div className="action-buttons-pro">
                                                    {/* BOTÓN DE MAPA */}
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleVerMapa(o); }}
                                                        className="btn-icon-pro"
                                                        title="Ver Ruta GPS"
                                                        style={{backgroundColor: '#e0f2fe', color: '#0369a1'}}
                                                    >
                                                        🗺️
                                                    </button>
                                                    {canWrite && (
                                                        <button onClick={(e) => { 
                                                            e.stopPropagation();
                                                            setEditingOrden(o); setFormError(null); 
                                                            setModalDefaultTab('detalle'); setShowModal(true); 
                                                        }} className="btn-icon-pro btn-edit-pro" title="Editar">
                                                            ✏️
                                                        </button>
                                                    )}
                                                    {canWrite && (o.estado === 'asignada' || o.estado === 'en_curso') && (
                                                         <button onClick={(e) => { 
                                                            e.stopPropagation();
                                                            setEditingOrden(o); setFormError(null); 
                                                            setModalDefaultTab('registro'); setShowModal(true); 
                                                        }} className="btn-icon-pro" title="Finalizar / Registrar KM">
                                                            🏁
                                                        </button>
                                                    )}
                                                    {(isAdmin || canWrite) && o.estado !== 'completada' && o.estado !== 'cancelada' && (
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCancelingOrden(o)
                                                        }} className="btn-icon-pro btn-delete-pro" title="Cancelar Orden">
                                                            🗑️
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
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

            {/* --- MODAL DE MAPA --- */}
            {showMapa && (
                <div className="modal-overlay" onClick={() => setShowMapa(false)}>
                    <div className="modal-content modal-large" onClick={e => e.stopPropagation()} style={{maxWidth: '900px'}}>
                        <div className="modal-header-pro">
                            <h3>🗺️ Ruta GPS - Orden #{ordenParaMapa?.id}</h3>
                            <button onClick={() => setShowMapa(false)} className="modal-close-pro">×</button>
                        </div>
                        <div className="modal-body-pro" style={{padding: 0, height: '500px'}}>
                            {loadingMapa ? (
                                <div className="loading-state">Cargando puntos GPS...</div>
                            ) : (
                                <MapaRuta puntos={rutaData} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal 
                isOpen={!!cancelingOrden} 
                onClose={() => setCancelingOrden(null)} 
                onConfirm={handleConfirmCancel} 
                title="Confirmar Cancelación"
                message={`¿Estás seguro de cancelar la orden #${cancelingOrden?.id}? Esta acción cambiará el estado a 'CANCELADA'.`} 
                submitting={submitting} 
            />
        </div>
    );
}

export default Ordenes;