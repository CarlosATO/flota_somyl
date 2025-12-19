import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'; // Importamos supabase para Storage
import './Vehiculos.css'

// === HELPERS DE BASE ===
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
                <button onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} className="btn btn-secondary">
                    Anterior
                </button>
                <button onClick={() => onPageChange(meta.page + 1)} disabled={meta.page >= meta.pages} className="btn btn-secondary">
                    Siguiente
                </button>
            </div>
        </div>
    );
};

const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 10);
    } catch (e) { return ''; }
};

const formatLocalDate = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString('es-CL');
    } catch (e) { return dateString; }
};

// --- COMPONENTES AUXILIARES DE ADJUNTOS ---

const DocAdjuntoUploader = ({ documentoId, onUploadSuccess, disabled }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (!documentoId) {
            setUploadError("Primero debe guardar el documento antes de subir archivos.");
            e.target.value = null;
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) { 
            setUploadError("El archivo es muy grande (máx 10MB).");
            e.target.value = null;
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        
        try {
            const fileExt = file.name.split('.').pop().toLowerCase();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.'))
                .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_');
            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `doc_vehiculo/${documentoId}/${safeFileName}`; 

            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes') 
                .upload(filePath, file);

            if (uploadError) throw new Error(`Error al subir archivo: ${uploadError.message}`);

            const res = await apiFetch(`/api/vehiculos/documentos/${documentoId}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath,
                    nombre_archivo: file.name,
                    mime_type: file.type,
                }
            });

            if (res.status === 201) {
                onUploadSuccess(res.data);
            } else {
                throw new Error(res.data?.message || 'Error guardando adjunto en base de datos');
            }
        } catch (err) {
            console.error('Error completo:', err);
            setUploadError(err.message || 'Error desconocido al subir archivo');
        } finally {
            setIsUploading(false);
            e.target.value = null; 
        }
    };

    return (
        <div className="adjuntos-container">
            {uploadError && <div className="modal-error-pro" style={{marginBottom: '1rem'}}><span>📤</span> {uploadError}</div>}
            <div className="uploader-box">
                <input 
                    type="file" 
                    id={`doc-file-upload`}
                    onChange={(e) => {
                        try { handleFileChange(e); } catch (err) {
                            console.error('Error no controlado:', err);
                            setUploadError('Error interno');
                            e.target.value = null;
                        }
                    }}
                    accept="image/*,application/pdf"
                    disabled={isUploading || disabled}
                />
                <label htmlFor={`doc-file-upload`} className={`uploader-label ${disabled ? 'disabled' : ''}`}>
                    {disabled ? 'Guarde el documento primero' : 'Seleccionar archivo (Max 10MB)'}
                </label>
                {isUploading && <p className="upload-progress">⏳ Subiendo archivo...</p>}
            </div>
        </div>
    );
};

const DocAdjuntosList = ({ adjuntos, loading, onDelete }) => {
    const openPreview = async (adj) => {
        if (!adj) return;
        if (adj.publicUrl) {
            window.open(adj.publicUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        try {
            const tokenLocal = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const url = `/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenLocal}` } });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank', 'noopener,noreferrer');
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            }
        } catch (e) { console.error('Error opening preview', e); }
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
            }
        } catch (e) { console.error('Error downloading adj', e); }
    };
    
    if (loading) return <p className="loading-adjuntos">Cargando adjuntos...</p>
    if (adjuntos.length === 0) return <p className="loading-adjuntos">📂 No hay archivos adjuntos.</p>

    return (
        <div className="adjuntos-list">
            {adjuntos.map(adj => (
                <div key={adj.id} className="adjunto-item">
                    <div className="adjunto-info">
                        <span className="adjunto-icon">
                            {adj.mime_type?.includes('image') ? '🖼️' : '📄'}
                        </span>
                        <span className="adjunto-name">
                            <button type="button" className="btn-link" onClick={() => openPreview(adj)}>
                                {adj.nombre_archivo || adj.storage_path}
                            </button>
                        </span>
                    </div>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                        <button type="button" className="btn btn-tertiary" onClick={() => downloadAdjunto(adj)} title="Descargar">⬇️</button>
                        <button 
                            type="button" 
                            className="adjunto-delete-btn"
                            title="Eliminar adjunto"
                            onClick={(e) => { e.stopPropagation(); onDelete(adj.id); }}
                        >
                            ×
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- MODALES (DocumentoFormModal y VehiculoFormModal) ---

const DocumentoFormModal = ({ isOpen, onClose, onSave, onDelete, editingDocument, vehiculoId, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('detalle');
    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);
    
    const requiredFields = ['tipo_documento', 'fecha_vencimiento'];
    const docIdActual = editingDocument?.id;

    const fetchAdjuntos = useCallback(async (docId) => {
        if (!docId) return;
        setLoadingAdjuntos(true);
        try {
            const res = await apiFetch(`/api/vehiculos/documentos/${docId}/adjuntos`);
            if (res.status === 200) setAdjuntos(res.data.data || []);
        } catch(e) { 
            console.error("Error cargando adjuntos", e); 
            setAdjuntos([]);
        } finally {
            setLoadingAdjuntos(false);
        }
    }, []);

    useEffect(() => {
        if (editingDocument) {
            setForm({
                vehiculo_id: vehiculoId,
                tipo_documento: editingDocument.tipo_documento || '',
                numero_documento: editingDocument.numero_documento || '',
                fecha_emision: formatDateForInput(editingDocument.fecha_emision),
                fecha_vencimiento: formatDateForInput(editingDocument.fecha_vencimiento),
                observaciones: editingDocument.observaciones || '',
            });
            if (editingDocument.id) {
                fetchAdjuntos(editingDocument.id);
            }
        } else {
            setForm({ vehiculo_id: vehiculoId, tipo_documento: '', numero_documento: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' });
            setAdjuntos([]);
        }
        setActiveTab('detalle');
    }, [editingDocument, isOpen, vehiculoId, fetchAdjuntos]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value.toUpperCase() });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...form };
        Object.keys(payload).forEach(key => {
            if (payload[key] === '' || payload[key] === null) payload[key] = null;
        });
        onSave(payload, docIdActual);
    };
    
    const handleUploadSuccess = (adjuntoData) => {
        setAdjuntos(prev => [adjuntoData, ...prev]);
    };

    const handleDeleteAdjunto = async (adjuntoId) => {
        if (!window.confirm("¿Estás seguro de eliminar este archivo?")) return;
        try {
            const res = await apiFetch(`/api/vehiculos/adjuntos/${adjuntoId}`, { method: 'DELETE' }); 
            if (res.status === 200) {
                setAdjuntos(adjuntos.filter(a => a.id !== adjuntoId));
            } else {
                alert(`Error al eliminar adjunto: ${res.data?.message || 'Error desconocido'}`);
            }
        } catch (err) {
            console.error('Error eliminando adjunto:', err);
            alert(`Error de conexión al eliminar adjunto: ${err.message}`);
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field] || form[field] === vehiculoId);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay-nested" onClick={onClose}>
            <div className="modal-content modal-large modal-nested" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <h3>{docIdActual ? `Editar Documento #${docIdActual}` : 'Registrar Nuevo Documento'}</h3>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="modal-close-pro" type="button">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    {apiError && <div className="modal-error-pro"><span>⚠</span><span>{apiError}</span></div>}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'detalle' ? 'active' : ''}`} onClick={() => setActiveTab('detalle')}>📋 Detalle y Fechas</button>
                        <button type="button" className={`tab-button ${activeTab === 'adjuntos' ? 'active' : ''}`} onClick={() => setActiveTab('adjuntos')} disabled={!docIdActual}>📎 Archivos ({adjuntos.length})</button>
                    </div>

                    <div className="modal-body-pro">
                        {activeTab === 'detalle' && (
                            <div className="form-section-pro">
                                <h4 className="section-title-pro">Información de Validez</h4>
                                <div className="form-grid-2">
                                    <div className="form-group-pro">
                                        <label>Tipo de Documento <span className="required-star">*</span></label>
                                        <select name="tipo_documento" value={form.tipo_documento} onChange={handleChange} required>
                                            <option value="">Seleccionar tipo</option>
                                            <option value="PERMISO_CIRCULACION">PERMISO DE CIRCULACIÓN</option>
                                            <option value="REVISION_TECNICA">REVISIÓN TÉCNICA (ITV/VTV)</option>
                                            <option value="SEGURO_OBLIGATORIO">SEGURO OBLIGATORIO (SOAP)</option>
                                            <option value="SEGURO_AUTOMOTRIZ">SEGURO AUTOMOTRIZ (TERCEROS/PROPIO)</option>
                                            <option value="OTROS">OTROS</option>
                                        </select>
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Número de Documento</label>
                                        <input name="numero_documento" value={form.numero_documento} onChange={handleChange} />
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Fecha de Emisión</label>
                                        <input name="fecha_emision" type="date" value={form.fecha_emision} onChange={handleChange} />
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Fecha de Vencimiento <span className="required-star">*</span></label>
                                        <input name="fecha_vencimiento" type="date" value={form.fecha_vencimiento} onChange={handleChange} required />
                                    </div>
                                </div>
                                <div className="form-group-pro" style={{marginTop: '1.25rem'}}>
                                    <label>Observaciones</label>
                                    <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="3" className="textarea-pro"></textarea>
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'adjuntos' && (
                            <div className="form-section-pro">
                                <h4 className="section-title-pro">Archivos del Documento</h4>
                                <DocAdjuntoUploader 
                                    documentoId={docIdActual} 
                                    onUploadSuccess={handleUploadSuccess}
                                    disabled={!docIdActual}
                                />
                                <div style={{marginTop: '1.5rem'}}>
                                    <DocAdjuntosList 
                                        adjuntos={adjuntos}
                                        loading={loadingAdjuntos}
                                        onDelete={handleDeleteAdjunto}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="modal-footer-pro">
                        {docIdActual && <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(docIdActual); }} className="btn btn-danger-pro" disabled={submitting}>🗑️ Eliminar</button>}
                        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="btn btn-secondary-pro" disabled={submitting}>Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (docIdActual ? '💾 Actualizar Documento' : '➕ Crear Documento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const VehiculoFormModal = ({ isOpen, onClose, onSave, editingVehicle, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('basico');
    const requiredFields = ['placa', 'marca', 'modelo', 'ano', 'tipo'];
    const [docModalOpen, setDocModalOpen] = useState(false);
    const [docs, setDocs] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);
    const [docFormError, setDocFormError] = useState(null);

    const fetchDocuments = useCallback(async (vehId) => {
        if (!vehId) return;
        setLoadingDocs(true);
        try {
            const res = await apiFetch(`/api/vehiculos/${vehId}/documentos`);
            if (res.status === 200) setDocs(res.data.data || []);
        } catch(e) { console.error("Error fetching docs", e); }
        setLoadingDocs(false);
    }, []);

    useEffect(() => {
        if (editingVehicle) {
            setForm({
                placa: editingVehicle.placa || '', marca: editingVehicle.marca || '',
                modelo: editingVehicle.modelo || '', ano: editingVehicle.ano || '',
                tipo: editingVehicle.tipo || '', color: editingVehicle.color || '',
                vin: editingVehicle.vin || '', capacidad_pasajeros: editingVehicle.capacidad_pasajeros || '',
                capacidad_kg: editingVehicle.capacidad_kg || '', numero_chasis: editingVehicle.numero_chasis || '',
                observaciones: editingVehicle.observaciones || '',
                // CAMPOS NUEVOS
                km_intervalo_mantencion: editingVehicle.km_intervalo_mantencion || 10000,
                tipo_combustible: editingVehicle.tipo_combustible || '',
                fecha_vencimiento_gases: formatDateForInput(editingVehicle.fecha_vencimiento_gases)
            });
            if (editingVehicle.id) {
                fetchDocuments(editingVehicle.id);
            }
        } else {
            setForm({ 
                placa: '', marca: '', modelo: '', ano: '', tipo: '', color: '', vin: '', 
                capacidad_pasajeros: '', capacidad_kg: '', numero_chasis: '', observaciones: '',
                km_intervalo_mantencion: 10000, tipo_combustible: '', fecha_vencimiento_gases: '' 
            });
            setDocs([]);
        }
        setActiveTab('basico');
    }, [editingVehicle, isOpen, fetchDocuments]);

    useEffect(() => {
        if (!isOpen) {
            setDocModalOpen(false);
            setEditingDoc(null);
            setDocFormError(null);
        }
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;
        if (type !== 'number' && name !== 'observaciones' && type !== 'date' && typeof value === 'string') {
            finalValue = value.toUpperCase();
        }
        if (type === 'number') {
            finalValue = value ? parseInt(value, 10) : '';
        }
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== '' && form[key] !== null) payload[key] = form[key];
        });
        onSave(payload, editingVehicle ? editingVehicle.id : null);
    };
    
    const handleDocSave = async (docData, docId) => {
        setDocFormError(null);
        const url = docId ? `/api/vehiculos/documentos/${docId}` : '/api/vehiculos/documentos';
        const method = docId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: docData });
            if (res && (res.status === 200 || res.status === 201)) {
                setDocModalOpen(false);
                setEditingDoc(null);
                fetchDocuments(editingVehicle.id);
            } else {
                setDocFormError(res.data?.message || 'Error al guardar el documento');
            }
        } catch (err) {
            setDocFormError('Error de conexión al guardar documento');
        }
    };
    
    const handleDocDelete = async (docId) => {
        if (!window.confirm("¿Estás seguro de eliminar este documento?")) return;
        try {
            const res = await apiFetch(`/api/vehiculos/documentos/${docId}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setDocModalOpen(false);
                setEditingDoc(null);
                fetchDocuments(editingVehicle.id);
            } else {
                alert(res.data?.message || 'No se pudo eliminar el documento');
            }
        } catch (err) {
            alert('Error de conexión al eliminar documento');
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);
    const canManageDocs = !!editingVehicle;

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content modal-large modal-parent" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header-pro">
                        <div>
                            <h3>{editingVehicle ? 'Editar Vehículo' : 'Registrar Nuevo Vehículo'}</h3>
                            <p className="modal-subtitle">
                                {editingVehicle ? 'Modifica los datos del vehículo' : 'Completa la información del vehículo'}
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

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'basico' ? 'active' : ''}`} onClick={() => setActiveTab('basico')}>📋 Información Básica</button>
                        <button type="button" className={`tab-button ${activeTab === 'tecnico' ? 'active' : ''}`} onClick={() => setActiveTab('tecnico')}>🔧 Datos Técnicos</button>
                        <button type="button" className={`tab-button ${activeTab === 'documentos' ? 'active' : ''}`} onClick={() => setActiveTab('documentos')} disabled={!canManageDocs}>📄 Documentos ({docs.length})</button>
                        <button type="button" className={`tab-button ${activeTab === 'adicional' ? 'active' : ''}`} onClick={() => setActiveTab('adicional')}>📝 Información Adicional</button>
                    </div>

                    <div className="modal-body-pro">
                        {activeTab === 'basico' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Identificación del Vehículo</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Placa <span className="required-star">*</span></label>
                                            <input name="placa" value={form.placa} onChange={handleChange} placeholder="Ej: ABC123" required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Tipo <span className="required-star">*</span></label>
                                            <select name="tipo" value={form.tipo} onChange={handleChange} required>
                                                <option value="">Seleccionar tipo</option>
                                                <option value="SEDAN">SEDAN</option>
                                                <option value="CAMIONETA">CAMIONETA</option>
                                                <option value="CAMION">CAMIÓN</option>
                                                <option value="VAN">VAN</option>
                                                <option value="BUS">BUS</option>
                                                <option value="MOTO">MOTO</option>
                                                <option value="CHASIS CABINADO">CHASIS CABINADO</option>
                                                <option value="MAQUINA INDUSTRIAL">MAQUINA INDUSTRIAL</option>
                                                <option value="FURGON">FURGON</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Detalles del Vehículo</h4>
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>Marca <span className="required-star">*</span></label>
                                            <input name="marca" value={form.marca} onChange={handleChange} placeholder="Ej: TOYOTA" required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Modelo <span className="required-star">*</span></label>
                                            <input name="modelo" value={form.modelo} onChange={handleChange} placeholder="Ej: COROLLA" required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Año <span className="required-star">*</span></label>
                                            <input name="ano" type="number" value={form.ano} onChange={handleChange} placeholder="2024" min="1900" max="2099" required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Color</label>
                                            <input name="color" value={form.color} onChange={handleChange} placeholder="Ej: BLANCO" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'tecnico' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Números de Serie</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>VIN</label><input name="vin" value={form.vin} onChange={handleChange} placeholder="Ej: 1HGBH41JXMN109186" maxLength="17" /></div>
                                        <div className="form-group-pro"><label>Número de Chasis</label><input name="numero_chasis" value={form.numero_chasis} onChange={handleChange} placeholder="Número de chasis" /></div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Capacidades y Mantenimiento</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Capacidad Pasajeros</label><input name="capacidad_pasajeros" type="number" value={form.capacidad_pasajeros} onChange={handleChange} placeholder="Ej: 5" min="1" /></div>
                                        <div className="form-group-pro"><label>Capacidad Carga (Kg)</label><input name="capacidad_kg" type="number" value={form.capacidad_kg} onChange={handleChange} placeholder="Ej: 2000" min="0" /></div>
                                        
                                        <div className="form-group-pro">
                                            <label>Intervalo Mant. (Km)</label>
                                            <input type="number" name="km_intervalo_mantencion" value={form.km_intervalo_mantencion} onChange={handleChange} placeholder="Ej: 10000" />
                                            <small style={{fontSize: '0.8em', color: '#666'}}>Cada cuántos Km se debe realizar mantención</small>
                                        </div>
                                        
                                        <div className="form-group-pro">
                                            <label>Combustible</label>
                                            <select name="tipo_combustible" value={form.tipo_combustible} onChange={handleChange}>
                                                <option value="">-- Seleccionar --</option>
                                                <option value="DIESEL">DIESEL</option>
                                                <option value="GASOLINA">GASOLINA</option>
                                                <option value="HIBRIDO">HIBRIDO</option>
                                                <option value="ELECTRICO">ELECTRICO</option>
                                                <option value="GAS">GAS</option>
                                            </select>
                                        </div>

                                        <div className="form-group-pro">
                                            <label>Vencimiento Gases</label>
                                            <input type="date" name="fecha_vencimiento_gases" value={form.fecha_vencimiento_gases} onChange={handleChange} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'documentos' && canManageDocs && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                                        <h4 className="section-title-pro" style={{border: 'none', padding: 0, margin: 0}}>Documentos de Cumplimiento ({docs.length})</h4>
                                        <button 
                                            type="button" 
                                            onClick={(e) => { e.stopPropagation(); setEditingDoc(null); setDocFormError(null); setDocModalOpen(true); }}
                                            className="btn btn-primary"
                                        >
                                            ➕ Nuevo
                                        </button>
                                    </div>
                                    
                                    <div className="table-container">
                                        {loadingDocs ? <div className="loading-state">Cargando documentos...</div> : (
                                            <table className="vehiculos-table">
                                                <thead>
                                                    <tr>
                                                        <th>Tipo</th>
                                                        <th>N° Documento</th>
                                                        <th>Vencimiento</th>
                                                        <th>Días Rest.</th>
                                                        <th>Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {docs.map(doc => {
                                                        const vencimiento = new Date(doc.fecha_vencimiento);
                                                        const hoy = new Date();
                                                        const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
                                                        const badgeClass = diasRestantes <= 30 ? (diasRestantes <= 0 ? 'badge-vencido' : 'badge-por-vencer') : 'badge-ok';
                                                        
                                                        return (
                                                            <tr key={doc.id}>
                                                                <td>{doc.tipo_documento}</td>
                                                                <td>{doc.numero_documento || '-'}</td>
                                                                <td>{vencimiento.toLocaleDateString()}</td>
                                                                <td><span className={`badge-status ${badgeClass}`}>{diasRestantes} días</span></td>
                                                                <td>
                                                                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingDoc(doc); setDocFormError(null); setDocModalOpen(true); }} className="btn-icon-pro btn-edit-pro">✏️</button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                        {!loadingDocs && docs.length === 0 && <div className="empty-state-pro"><span className="empty-icon-pro">📄</span><p>No hay documentos registrados para este vehículo.</p></div>}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'adicional' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Notas y Observaciones</h4>
                                    <div className="form-group-pro">
                                        <label>Observaciones</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="8" placeholder="Agrega notas..." className="textarea-pro"></textarea>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (editingVehicle ? '💾 Actualizar' : '➕ Crear Vehículo')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        
        {isOpen && (
            <DocumentoFormModal 
                isOpen={docModalOpen} 
                onClose={() => setDocModalOpen(false)} 
                onSave={handleDocSave} 
                onDelete={handleDocDelete}
                editingDocument={editingDoc} 
                vehiculoId={editingVehicle?.id} 
                apiError={docFormError} 
                submitting={submitting}
            />
        )}
        </>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, submitting }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <h3>⚠️ {title}</h3>
                </div>
                <div className="modal-body-pro">
                    <p className="confirmation-message">{message}</p>
                </div>
                <div className="modal-footer-pro">
                    <button onClick={onClose} disabled={submitting} className="btn btn-secondary-pro">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} disabled={submitting} className="btn btn-danger-pro">
                        {submitting ? 'Procesando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---

function Vehiculos({ user, token }) {
    const [vehiculos, setVehiculos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [deletingVehicle, setDeletingVehicle] = useState(null);
    const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [attachmentsList, setAttachmentsList] = useState([]);
    const [preview, setPreview] = useState({ open: false, url: '#', name: '', mime: '' });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    const debouncedSearch = useDebounce(searchQuery, 500);

    const fetchVehiculos = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);
        
        try {
            const res = await apiFetch(`/api/vehiculos/?${params.toString()}`);
            if (res && res.status === 200) {
                setVehiculos(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else {
                setError(res.data?.message || 'Error cargando vehículos');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, meta.per_page]);

    useEffect(() => {
        if (token) {
            fetchVehiculos();
        }
    }, [token, fetchVehiculos]);

    // Local Storage logic for opening modal from other modules
    useEffect(() => {
        const openFromStorage = () => {
            try {
                const raw = localStorage.getItem('openVehiculoEdit');
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (parsed && parsed.id) {
                    setEditingVehicle({ id: parsed.id });
                    setShowModal(true);
                    localStorage.removeItem('openVehiculoEdit');
                }
            } catch (e) { localStorage.removeItem('openVehiculoEdit'); }
        };
        openFromStorage();
        const handler = (e) => {
            try {
                const detail = e.detail || {};
                if (detail.module === 'vehiculos') {
                    fetchVehiculos();
                    openFromStorage();
                }
            } catch (err) { console.error('Nav handler error', err); }
        };
        window.addEventListener('app-navigate', handler);
        return () => { window.removeEventListener('app-navigate', handler); };
    }, [token, fetchVehiculos]);

    const handleFormSubmit = async (formData, vehiculoId) => {
        setSubmitting(true);
        setFormError(null);
        const url = vehiculoId ? `/api/vehiculos/${vehiculoId}` : '/api/vehiculos/';
        const method = vehiculoId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });
            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchVehiculos();
            } else {
                setFormError(res.data?.message || 'Error al guardar');
            }
        } catch (err) {
            setFormError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingVehicle) return;
        setSubmitting(true);
        try {
            const res = await apiFetch(`/api/vehiculos/${deletingVehicle.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setDeletingVehicle(null);
                fetchVehiculos();
            } else {
                setError(res.data?.message || 'No se pudo eliminar');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const fetchVehicleAttachments = useCallback(async (vehId) => {
        if (!vehId) return;
        setAttachmentsLoading(true);
        try {
            const res = await apiFetch(`/api/vehiculos/${vehId}/adjuntos`);
            if (res && res.status === 200) {
                setAttachmentsList(res.data.data || []);
            } else {
                setAttachmentsList([]);
            }
        } catch (err) { setAttachmentsList([]); } finally { setAttachmentsLoading(false); }
    }, []);

    const openAttachments = (veh) => {
        setAttachmentsList([]);
        setAttachmentsModalOpen(true);
        fetchVehicleAttachments(veh.id);
    };

    const closeAttachments = () => { setAttachmentsModalOpen(false); setAttachmentsList([]); };

    const openPreview = async (adj) => {
        try {
            if (!adj) return;
            if (adj.publicUrl) {
                setPreview({ open: true, url: adj.publicUrl, name: adj.nombre_archivo, mime: adj.mime_type });
                return;
            }
            try {
                const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(adj.storage_path);
                if (data && data.publicUrl) {
                    setPreview({ open: true, url: data.publicUrl, name: adj.nombre_archivo, mime: adj.mime_type });
                    return;
                }
            } catch (e) { /* ignore */ }

            const tokenLocal = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const url = `/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenLocal}` } });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                setPreview({ open: true, url: blobUrl, name: adj.nombre_archivo, mime: blob.type });
            }
        } catch (e) { console.error(e); }
    };

    const closePreview = () => {
        try { if (preview.url.startsWith('blob:')) URL.revokeObjectURL(preview.url); } catch (e) {}
        setPreview({ open: false, url: '#', name: '', mime: '' });
    };

    // --- NUEVAS FUNCIONES DE RENDERIZADO VISUAL ---
    
    const renderEstadoMant = (v) => {
        if (!v.mant_estado) return <span className="badge-status badge-neutro">-</span>;
        
        let clase = 'badge-ok';
        let icon = '✅';
        let text = 'OK';
        
        if (v.mant_estado === 'VENCIDO') {
            clase = 'badge-vencido';
            icon = '⚠️';
            text = 'VENCIDO';
        } else if (v.mant_estado === 'POR_VENCER') {
            clase = 'badge-por-vencer';
            icon = '⏱️';
            text = 'PRÓXIMO';
        }
        
        return (
            <span className={`badge-status ${clase}`} title={`Restan ${v.mant_restante_km} km`}>
                {icon} {text} <small style={{opacity: 0.8, marginLeft: 4}}>({v.mant_restante_km})</small>
            </span>
        );
    };

    const renderEstadoGases = (v) => {
        if (!v.fecha_vencimiento_gases) return <span className="badge-status badge-neutro">-</span>;
        
        const fecha = formatLocalDate(v.fecha_vencimiento_gases);
        let clase = 'badge-ok';
        let icon = '✅';
        
        if (v.gases_estado === 'VENCIDO') {
            clase = 'badge-vencido';
            icon = '⚠️';
        } else if (v.gases_estado === 'POR_VENCER') {
            clase = 'badge-por-vencer';
            icon = '⏱️';
        }
        
        return (
            <div className={`badge-status ${clase}`} title={v.gases_estado}>
                {icon} {fecha}
            </div>
        );
    };

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="vehiculos-container">
            <div className="vehiculos-header">
                <div>
                    <h2>Gestión de Vehículos</h2>
                    <p className="header-subtitle">Administra la flota de vehículos</p>
                </div>
                {canWrite && (
                    <button onClick={() => { setEditingVehicle(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">
                        ➕ Nuevo Vehículo
                    </button>
                )}
            </div>

            <div className="search-container-pro">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input 
                        type="search" 
                        placeholder="Buscar por placa, marca o modelo..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="search-input-pro" 
                    />
                </div>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-container">
                {loading && vehiculos.length === 0 ? (
                    <div className="loading-state">Cargando vehículos...</div>
                ) : (
                    <table className="vehiculos-table">
                        <thead>
                            <tr>
                                <th>Placa</th>
                                <th>Marca/Modelo</th>
                                <th>Año</th>
                                <th>Tipo</th>
                                {/* COLUMNAS NUEVAS */}
                                <th>Km Actual</th>
                                <th>Estado Mant.</th>
                                <th>Gases</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {vehiculos.map(v => (
                                <tr key={v.id}>
                                    <td><span className="badge-placa">{v.placa}</span></td>
                                    <td className="wrap-text">{v.marca} {v.modelo}</td>
                                    <td>{v.ano}</td>
                                    <td><span className="badge-tipo">{v.tipo}</span></td>
                                    
                                    {/* CELDAS NUEVAS */}
                                    <td>{v.km_actual_calculado ? v.km_actual_calculado.toLocaleString() : '0'}</td>
                                    <td>{renderEstadoMant(v)}</td>
                                    <td>{renderEstadoGases(v)}</td>
                                    
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && (
                                                    <button 
                                                        onClick={() => { setEditingVehicle(v); setFormError(null); setShowModal(true); }} 
                                                        className="btn-icon-pro btn-edit-pro"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => setDeletingVehicle(v)} 
                                                        className="btn-icon-pro btn-delete-pro"
                                                        title="Eliminar"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                                <button
                                                    className="btn-icon-pro btn-attach-pro"
                                                    title="Ver adjuntos"
                                                    onClick={() => openAttachments(v)}
                                                >
                                                    📷
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {vehiculos.length === 0 && !loading && (
                    <div className="empty-state-pro">
                        <span className="empty-icon-pro">📦</span>
                        <p>No se encontraron vehículos</p>
                    </div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            <VehiculoFormModal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)} 
                onSave={handleFormSubmit} 
                editingVehicle={editingVehicle} 
                apiError={formError} 
                submitting={submitting} 
            />

            <ConfirmationModal 
                isOpen={!!deletingVehicle} 
                onClose={() => setDeletingVehicle(null)} 
                onConfirm={handleConfirmDelete} 
                title="Confirmar Eliminación"
                message={`¿Estás seguro de eliminar el vehículo ${deletingVehicle?.placa}?`} 
                submitting={submitting} 
            />

            {/* Modal de adjuntos generales */}
            {attachmentsModalOpen && (
                <div className="adjuntos-modal-overlay" onClick={closeAttachments}>
                    <div className="adjuntos-modal" onClick={(e) => e.stopPropagation()} style={{width: '900px'}}>
                        <div className="adjuntos-modal-header">
                            <div><strong>Archivos del vehículo</strong></div>
                            <div><button onClick={closeAttachments} className="modal-close-btn">✖</button></div>
                        </div>
                        <div className="adjuntos-modal-body" style={{padding: '1rem'}}>
                            {attachmentsLoading ? <div className="loading-state">Cargando...</div> : 
                             attachmentsList.length === 0 ? <div className="empty-state-pro">📂 Sin archivos.</div> :
                             <div style={{display: 'grid', gap: '0.5rem'}}>
                                {attachmentsList.map(adj => (
                                    <div key={adj.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', border: '1px solid #eee'}}>
                                        <div>{adj.nombre_archivo}</div>
                                        <button className="btn btn-primary" onClick={() => openPreview(adj)}>Ver</button>
                                    </div>
                                ))}
                             </div>
                            }
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Preview */}
            {preview.open && (
                <div className="adjuntos-modal-overlay" onClick={closePreview}>
                    <div className="adjuntos-modal" onClick={(e) => e.stopPropagation()} style={{width: '80%'}}>
                        <div className="adjuntos-modal-header">
                            <div><strong>{preview.name}</strong></div>
                            <div><button onClick={closePreview} className="modal-close-btn">✖</button></div>
                        </div>
                        <div className="adjuntos-modal-body">
                            {preview.mime.includes('image') ? <img src={preview.url} className="adjuntos-modal-image" /> : 
                             preview.mime.includes('pdf') ? <iframe src={preview.url} className="adjuntos-modal-iframe" /> : 
                             <p>Vista previa no disponible.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Vehiculos;