import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'; // Importamos supabase para Storage
import './Vehiculos.css'

// === HELPERS DE BASE (sin cambios) ===
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

// --- COMPONENTES AUXILIARES DE ADJUNTOS (adaptados para Documentos Vehiculares) ---

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
            // 1. Sanitizar nombre y crear path
            const fileExt = file.name.split('.').pop().toLowerCase();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.'))
                .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_');
            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `doc_vehiculo/${documentoId}/${safeFileName}`; 

            // 2. Subir a Supabase Storage
            console.log('Subiendo archivo a:', filePath);
            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes') 
                .upload(filePath, file);

            if (uploadError) {
                console.error('Error de Supabase:', uploadError);
                throw new Error(`Error al subir archivo: ${uploadError.message}`);
            }

            // 3. Guardar en Backend
            console.log('Guardando en backend...');
            const res = await apiFetch(`/api/vehiculos/documentos/${documentoId}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath,
                    nombre_archivo: file.name,
                    mime_type: file.type,
                }
            });

            if (res.status === 201) {
                console.log('Archivo guardado exitosamente');
                onUploadSuccess(res.data); // res.data ya contiene el objeto del adjunto
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
                        // Prevenir errores no controlados
                        try {
                            handleFileChange(e);
                        } catch (err) {
                            console.error('Error no controlado en handleFileChange:', err);
                            setUploadError('Error interno al procesar archivo');
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
    
    const getPublicUrl = (storagePath) => {
        try {
            const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(storagePath);
            return data.publicUrl;
        } catch (e) { return '#'; }
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
                            <a href={getPublicUrl(adj.storage_path)} target="_blank" rel="noopener noreferrer">
                                {adj.nombre_archivo || adj.storage_path}
                            </a>
                        </span>
                    </div>
                    <button 
                        type="button" 
                        className="adjunto-delete-btn"
                        title="Eliminar adjunto"
                        onClick={(e) => { e.stopPropagation(); onDelete(adj.id); }}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};

// --- MODAL ANIDADO PARA CREAR/EDITAR DOCUMENTO ---

const DocumentoFormModal = ({ isOpen, onClose, onSave, onDelete, editingDocument, vehiculoId, apiError, submitting, isNested = false }) => {
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
    }, [editingDocument, isOpen, vehiculoId]); // Removido fetchAdjuntos de dependencias

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
        // adjuntoData ya es el objeto del adjunto creado
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

    const modalJSX = (
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
                                        <option value="SEGURO_OBLIGATORIO">SEGURO OBLIGATORIO (SOAP)</option>
                                        <option value="REVISION_TECNICA">REVISIÓN TÉCNICA (ITV/VTV)</option>
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
    );

    return (
        <div className="modal-overlay-nested" onClick={onClose}>
            {modalJSX}
        </div>
    );
};

// --- MODAL PRINCIPAL DE VEHÍCULOS (MODIFICADO CON PESTAÑA "DOCUMENTOS") ---

const VehiculoFormModal = ({ isOpen, onClose, onSave, editingVehicle, apiError, submitting }) => {
    // ... (Estados y helpers existentes) ...
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('basico');
    const requiredFields = ['placa', 'marca', 'modelo', 'ano', 'tipo'];
    const [docModalOpen, setDocModalOpen] = useState(false);
    const [docs, setDocs] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);
    const [docFormError, setDocFormError] = useState(null);

    // Fetch documents on tab change or save
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
            });
            if (editingVehicle.id) {
                fetchDocuments(editingVehicle.id);
            }
        } else {
            setForm({ placa: '', marca: '', modelo: '', ano: '', tipo: '', color: '', vin: '', 
                     capacidad_pasajeros: '', capacidad_kg: '', numero_chasis: '', observaciones: '' });
            setDocs([]);
        }
        setActiveTab('basico');
    }, [editingVehicle, isOpen]); // Removido fetchDocuments de dependencias

    // Reset document modal when parent modal closes
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
        if (type !== 'number' && name !== 'observaciones' && typeof value === 'string') {
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
    
    // Document Handlers
    const handleDocSave = async (docData, docId) => {
        setDocFormError(null);
        const url = docId ? `/api/vehiculos/documentos/${docId}` : '/api/vehiculos/documentos';
        const method = docId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: docData });
            if (res && (res.status === 200 || res.status === 201)) {
                setDocModalOpen(false);
                setEditingDoc(null);
                fetchDocuments(editingVehicle.id); // Refresh list
            } else {
                setDocFormError(res.data?.message || 'Error al guardar el documento');
            }
        } catch (err) {
            console.error('Error guardando documento:', err);
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
            console.error('Error eliminando documento:', err);
            alert('Error de conexión al eliminar documento');
        }
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);
    const canManageDocs = !!editingVehicle; // Solo si el vehículo ya existe

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content modal-large modal-parent" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header-pro">
                        {/* ... (Header) ... */}
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
                        {activeTab === 'basico' && ( /* ... (Pestaña Basico) ... */ 
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

                        {activeTab === 'tecnico' && ( /* ... (Pestaña Tecnico) ... */
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Números de Serie</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>VIN</label><input name="vin" value={form.vin} onChange={handleChange} placeholder="Ej: 1HGBH41JXMN109186" maxLength="17" /></div>
                                        <div className="form-group-pro"><label>Número de Chasis</label><input name="numero_chasis" value={form.numero_chasis} onChange={handleChange} placeholder="Número de chasis" /></div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Capacidades</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro"><label>Capacidad de Pasajeros</label><input name="capacidad_pasajeros" type="number" value={form.capacidad_pasajeros} onChange={handleChange} placeholder="Ej: 5" min="1" /></div>
                                        <div className="form-group-pro"><label>Capacidad de Carga (Kg)</label><input name="capacidad_kg" type="number" value={form.capacidad_kg} onChange={handleChange} placeholder="Ej: 2000" min="0" /></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* --- NUEVA PESTAÑA: DOCUMENTOS --- */}
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
                                                        const badgeClass = diasRestantes <= 30 ? (diasRestantes <= 0 ? 'badge-estado-pendiente' : 'badge-estado-programado') : 'badge-tipo-preventivo';
                                                        
                                                        return (
                                                            <tr key={doc.id}>
                                                                <td>{doc.tipo_documento}</td>
                                                                <td>{doc.numero_documento || '-'}</td>
                                                                <td>{vencimiento.toLocaleDateString()}</td>
                                                                <td><span className={`badge-mant-estado ${badgeClass}`}>{diasRestantes} días</span></td>
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
                        
                        {activeTab === 'adicional' && ( /* ... (Pestaña Adicional) ... */
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Notas y Observaciones</h4>
                                    <div className="form-group-pro">
                                        <label>Observaciones</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="8" placeholder="Agrega notas, características especiales o cualquier información relevante sobre el vehículo..." className="textarea-pro"></textarea>
                                        <small className="input-hint-pro">
                                            {form.observaciones?.length || 0} caracteres
                                        </small>
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
        
        {/* Modal para el CRUD de Documentos - Renderizado FUERA del overlay padre */}
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

// ... (ConfirmationModal y componente Vehiculos, sin cambios en estructura) ...

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

    if (!token) {
        return (
            <div className="vehiculos-container">
                <div className="loading-state">Cargando módulo de vehículos...</div>
            </div>
        );
    }

    return (
        <div className="vehiculos-container">
            <div className="vehiculos-header">
                <div>
                    <h2>Gestión de Vehículos</h2>
                    <p className="header-subtitle">Administra la flota de vehículos de la empresa</p>
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
                                <th>Marca</th>
                                <th>Modelo</th>
                                <th>Año</th>
                                <th>Tipo</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {vehiculos.map(v => (
                                <tr key={v.id}>
                                    <td><span className="badge-placa">{v.placa}</span></td>
                                    <td>{v.marca}</td>
                                    <td>{v.modelo}</td>
                                    <td>{v.ano}</td>
                                    <td><span className="badge-tipo">{v.tipo}</span></td>
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
                message={`¿Estás seguro de eliminar el vehículo ${deletingVehicle?.placa}? Esta acción no se puede deshacer.`} 
                submitting={submitting} 
            />
        </div>
    );
}

export default Vehiculos;