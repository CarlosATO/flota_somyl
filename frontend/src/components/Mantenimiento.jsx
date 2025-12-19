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

// --- UPLOADER (Mantenido intacto) ---
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

// --- ADJUNTOS LIST (Mantenido intacto) ---
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

// --- MODAL FORMULARIO ACTUALIZADO ---
const MantenimientoFormModal = ({ isOpen, onClose, onSave, editingMantenimiento, apiError, submitting }) => {
    // Estado principal del formulario
    const [header, setHeader] = useState({});
    // Estado para las líneas de detalle (Array de objetos)
    const [items, setItems] = useState([]);
    
    const [activeTab, setActiveTab] = useState('programacion');
    
    // Listas maestras
    const [vehiculosList, setVehiculosList] = useState([]);
    const [categoriasList, setCategoriasList] = useState([]);
    const [conceptosList, setConceptosList] = useState([]);
    
    const [loadingLists, setLoadingLists] = useState(false);
    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);

    const mantIdActual = editingMantenimiento?.id;

    // --- CARGA DE DATOS ---
    useEffect(() => {
        if (!isOpen) return;
        const fetchMasters = async () => {
            setLoadingLists(true);
            try {
                // Fetch paralelo para velocidad
                const [resVeh, resCat, resCon] = await Promise.all([
                    apiFetch('/api/vehiculos/?per_page=500'),
                    supabase.from('categorias_mantencion').select('*').eq('activo', true),
                    supabase.from('conceptos_gasto').select('*')
                ]);

                if (resVeh.status === 200) setVehiculosList(resVeh.data.data || []);
                if (resCat.data) setCategoriasList(resCat.data);
                if (resCon.data) setConceptosList(resCon.data);

            } catch (e) { console.error(e); }
            setLoadingLists(false);
        };
        fetchMasters();
    }, [isOpen]);

    // Fetch de adjuntos y detalles existentes
    const fetchDetallesYAdjuntos = useCallback(async (mantId) => {
        setLoadingAdjuntos(true);
        try {
            // 1. Adjuntos (via API Backend)
            const resAdj = await apiFetch(`/api/mantenimiento/${mantId}/adjuntos`);
            if (resAdj.status === 200) setAdjuntos(resAdj.data.data || []);

            // 2. Detalles (Podemos consultar directo a supabase para armar el array de items)
            const { data: detalles } = await supabase
                .from('mantenimiento_detalles')
                .select('*, concepto:conceptos_gasto(categoria_id)')
                .eq('mantenimiento_id', mantId);

            if (detalles && detalles.length > 0) {
                // Mapear al formato que usa el formulario
                const itemsForm = detalles.map(d => ({
                    id: d.id, // ID interno del detalle
                    categoria_id: d.concepto?.categoria_id || '', // Necesario para el select padre
                    concepto_id: d.concepto_id,
                    costo: d.costo,
                    notas: d.notas || ''
                }));
                setItems(itemsForm);
            } else {
                // Caso Legacy: Si no hay detalles en la tabla nueva, tratar de usar los datos viejos de la cabecera si existen
                if (editingMantenimiento?.concepto_id) {
                     // Recuperar categoría del concepto legacy
                     const conceptoLegacy = conceptosList.find(c => c.id === editingMantenimiento.concepto_id);
                     setItems([{
                         categoria_id: conceptoLegacy?.categoria_id || '',
                         concepto_id: editingMantenimiento.concepto_id,
                         costo: editingMantenimiento.costo || 0,
                         notas: ''
                     }]);
                } else {
                    setItems([]); // Lista vacía
                }
            }

        } catch(e) { console.error(e); }
        setLoadingAdjuntos(false);
    }, [editingMantenimiento, conceptosList]);

    // Inicialización del Formulario
    useEffect(() => {
        if (editingMantenimiento) {
            setHeader({
                vehiculo_id: editingMantenimiento.vehiculo_id || '',
                descripcion: editingMantenimiento.descripcion || '', // Observación General SIEMPRE VISIBLE
                tipo_mantenimiento: editingMantenimiento.tipo_mantenimiento || 'PREVENTIVO',
                estado: editingMantenimiento.estado || 'PENDIENTE',
                fecha_programada: formatDateForInput(editingMantenimiento.fecha_programada),
                km_programado: editingMantenimiento.km_programado || '',
                fecha_realizacion: formatDateForInput(editingMantenimiento.fecha_realizacion),
                km_realizacion: editingMantenimiento.km_realizacion || '',
                observaciones: editingMantenimiento.observaciones || '', // Observaciones de cierre
            });
            // Cargar items si ya tenemos las listas maestras cargadas
            if (conceptosList.length > 0) {
                fetchDetallesYAdjuntos(editingMantenimiento.id);
            }
        } else {
            // NUEVO REGISTRO
            setHeader({
                vehiculo_id: '', descripcion: '', tipo_mantenimiento: 'PREVENTIVO', 
                estado: 'PENDIENTE', fecha_programada: formatDateForInput(new Date().toISOString()),
                km_programado: '', fecha_realizacion: '', km_realizacion: '', observaciones: ''
            });
            // Iniciamos con una línea vacía para facilitar al usuario
            setItems([{ categoria_id: '', concepto_id: '', costo: 0, notas: '' }]);
            setAdjuntos([]);
        }
        setActiveTab('programacion');
    }, [editingMantenimiento, isOpen, conceptosList]); // Dependencia added: conceptosList

    // --- MANEJO DE CABECERA ---
    const handleHeaderChange = (e) => {
        const { name, value } = e.target;
        setHeader(prev => ({ ...prev, [name]: value }));
    };

    // --- MANEJO DE ITEMS (LÓGICA FACTURA) ---
    const handleAddItem = () => {
        setItems(prev => [...prev, { categoria_id: '', concepto_id: '', costo: 0, notas: '' }]);
    };

    const handleRemoveItem = (index) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        
        // Si cambia categoría, limpiar concepto
        if (field === 'categoria_id') {
            newItems[index]['concepto_id'] = '';
        }
        setItems(newItems);
    };

    // Calcular Totales
    const totalCosto = useMemo(() => {
        return items.reduce((sum, item) => sum + (parseFloat(item.costo) || 0), 0);
    }, [items]);

    // Guardar
    const handleSubmit = (e) => {
        e.preventDefault();
        
        const payload = {
            ...header,
            costo_total: totalCosto, // Enviamos el total calculado
            items: items.filter(i => i.concepto_id) // Enviamos solo items que tengan concepto seleccionado
        };

        // Convertir vacíos a nulls en header
        Object.keys(payload).forEach(key => {
            if (payload[key] === '' && key !== 'items') payload[key] = null;
        });

        onSave(payload, mantIdActual);
    };

    // Helpers UI
    const selectedVehiculo = vehiculosList.find(v => String(v.id) === String(header.vehiculo_id));
    const isFormInvalid = !header.vehiculo_id || !header.fecha_programada;

    const canUpload = !!mantIdActual;

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
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingMantenimiento ? `Editar Orden #${editingMantenimiento.id}` : 'Nueva Orden de Trabajo'}</h3>
                        <p className="modal-subtitle">Gestión de Servicios Múltiples</p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro">×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {apiError && <div className="modal-error-pro">⚠️ {apiError}</div>}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'programacion' ? 'active' : ''}`} onClick={() => setActiveTab('programacion')}>🛠️ Servicios</button>
                        <button type="button" className={`tab-button ${activeTab === 'cierre' ? 'active' : ''}`} onClick={() => setActiveTab('cierre')}>📝 Cierre</button>
                        <button type="button" className={`tab-button ${activeTab === 'adjuntos' ? 'active' : ''}`} onClick={() => setActiveTab('adjuntos')}>📎 Adjuntos ({adjuntos.length})</button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando datos...</div>}

                        {activeTab === 'programacion' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>Vehículo *</label>
                                            <select name="vehiculo_id" value={header.vehiculo_id} onChange={handleHeaderChange} required>
                                                <option value="">-- Seleccionar --</option>
                                                {vehiculosList.map(v => (<option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>))}
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fecha Programada *</label>
                                            <input name="fecha_programada" type="date" value={header.fecha_programada} onChange={handleHeaderChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Km Actual</label>
                                            <input name="km_programado" type="number" value={header.km_programado} onChange={handleHeaderChange} placeholder="Lectura odómetro" />
                                        </div>
                                    </div>
                                    
                                    {/* OBSERVACIONES GENERALES SIEMPRE VISIBLES */}
                                    <div className="form-group-pro" style={{marginTop: '10px'}}>
                                        <label>Observaciones Generales de la Orden</label>
                                        <textarea 
                                            name="descripcion" 
                                            value={header.descripcion} 
                                            onChange={handleHeaderChange} 
                                            rows="2" 
                                            className="textarea-pro" 
                                            placeholder="Ej: Revisión completa antes de viaje al norte..."
                                        />
                                    </div>
                                </div>

                                {/* TABLA DE ITEMS (FACTURA) */}
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Servicios a Realizar</h4>
                                    <div className="items-table-container">
                                        <table className="items-table">
                                            <thead>
                                                <tr>
                                                    <th style={{width: '25%'}}>Categoría</th>
                                                    <th style={{width: '25%'}}>Concepto</th>
                                                    <th style={{width: '15%'}}>Costo (CLP)</th>
                                                    <th style={{width: '30%'}}>Notas</th>
                                                    <th style={{width: '5%'}}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item, index) => {
                                                    const conceptosFiltrados = conceptosList.filter(c => !item.categoria_id || String(c.categoria_id) === String(item.categoria_id));
                                                    return (
                                                        <tr key={index}>
                                                            <td>
                                                                <select 
                                                                    className="table-input" 
                                                                    value={item.categoria_id} 
                                                                    onChange={(e) => handleItemChange(index, 'categoria_id', e.target.value)}
                                                                >
                                                                    <option value="">-- Seleccionar --</option>
                                                                    {categoriasList.map(cat => (<option key={cat.id} value={cat.id}>{cat.nombre}</option>))}
                                                                </select>
                                                            </td>
                                                            <td>
                                                                <select 
                                                                    className="table-input" 
                                                                    value={item.concepto_id} 
                                                                    onChange={(e) => handleItemChange(index, 'concepto_id', e.target.value)}
                                                                    disabled={!item.categoria_id}
                                                                >
                                                                    <option value="">-- Seleccionar --</option>
                                                                    {conceptosFiltrados.map(conc => (<option key={conc.id} value={conc.id}>{conc.nombre}</option>))}
                                                                </select>
                                                            </td>
                                                            <td>
                                                                <input 
                                                                    type="number" 
                                                                    className="table-input text-right" 
                                                                    value={item.costo} 
                                                                    onChange={(e) => handleItemChange(index, 'costo', e.target.value)} 
                                                                    step="1"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input 
                                                                    type="text" 
                                                                    className="table-input" 
                                                                    value={item.notas} 
                                                                    onChange={(e) => handleItemChange(index, 'notas', e.target.value)} 
                                                                    placeholder="Notas adicionales"
                                                                />
                                                            </td>
                                                            <td className="text-center">
                                                                {items.length > 1 && (
                                                                    <button 
                                                                        type="button" 
                                                                        className="btn-icon-remove" 
                                                                        onClick={() => handleRemoveItem(index)}
                                                                        title="Eliminar fila"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan="5">
                                                        <button type="button" className="btn-small-pro" onClick={handleAddItem}>+ Agregar Servicio</button>
                                                    </td>
                                                </tr>
                                                <tr className="total-row">
                                                    <td colSpan="2" className="text-right font-bold">TOTAL:</td>
                                                    <td className="text-right font-bold">${totalCosto.toLocaleString('es-CL')}</td>
                                                    <td colSpan="2"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
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
                                            <input name="fecha_realizacion" type="date" value={header.fecha_realizacion} onChange={handleHeaderChange} />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Realización</label>
                                            <input name="km_realizacion" type="number" value={header.km_realizacion} onChange={handleHeaderChange} />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '15px', backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', border: '1px solid #c8e6c9'}}>
                                        <label style={{color: '#2e7d32', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>📄 Actualizar Vencimiento Gases (Opcional)</label>
                                        <input name="renovar_gases" type="date" value={header.renovar_gases || ''} onChange={handleHeaderChange} style={{border: '1px solid #a5d6a7'}} />
                                        <small style={{color: '#555', display: 'block', marginTop: '4px'}}>Ingresa la <strong>NUEVA</strong> fecha solo si se renovó el certificado.</small>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Costos y Observaciones</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Costo Total (CLP)</label>
                                            <input name="costo" type="number" value={header.costo || ''} onChange={handleHeaderChange} step="1" />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1rem'}}>
                                        <label>Observaciones</label>
                                        <textarea name="observaciones" value={header.observaciones} onChange={handleHeaderChange} rows="4" className="textarea-pro"></textarea>
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

    // Helper para mostrar Concepto o Descripción en la tabla
    const renderConceptoCell = (m) => {
        if (m.concepto) {
            return (
                <div className="concepto-cell">
                     <div className="concepto-nombre">{m.concepto.nombre}</div>
                     <div className="concepto-categoria">{m.concepto.categoria?.nombre || '-'}</div>
                </div>
            );
        }
        return (
            <div className="concepto-cell">
                <div className="concepto-descripcion" title={m.descripcion}>{m.descripcion || 'Sin descripción'}</div>
            </div>
        );
    };

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
                                <th style={{width: '60px'}}>ID</th>
                                <th style={{width: '120px'}}>Estado</th>
                                <th style={{width: '160px'}}>Vehículo</th>
                                <th style={{width: '110px'}}>Tipo</th>
                                <th style={{width: '280px', minWidth: '250px'}}>Concepto / Detalle</th>
                                <th style={{width: '100px'}}>F. Prog.</th>
                                <th style={{width: '90px'}}>KM Prog.</th>
                                <th style={{width: '100px'}}>F. Realiz.</th>
                                <th style={{width: '110px'}}>Costo</th>
                                {(canWrite || isAdmin) && <th style={{width: '120px'}}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {mantenimientos.map(m => (
                                <tr key={m.id} onDoubleClick={() => { if(canWrite && m.estado!=='FINALIZADO') { setEditingMantenimiento(m); setShowModal(true); } }} className={canWrite && m.estado!=='FINALIZADO' ? 'row-editable' : ''}>
                                    <td className="font-bold">#{m.id}</td>
                                    <td><span className={getEstadoBadge(m.estado)}>{m.estado?.replace('_', ' ')}</span></td>
                                    <td><span className="badge-mant-placa">{m.vehiculo?.placa || '-'}</span><br/><small>{m.vehiculo?.marca} {m.vehiculo?.modelo}</small></td>
                                    <td><span className={getTipoBadge(m.tipo_mantenimiento)}>{m.tipo_mantenimiento}</span></td>
                                    <td>{renderConceptoCell(m)}</td>
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