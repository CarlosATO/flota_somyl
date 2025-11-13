// [START_CODE_BLOCK]
import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Mantenimiento.css'; // Reutilizamos los estilos del sistema de diseño
import './Combustible.css'; // Estilos específicos (ancho y scroll del modal)

// --- CONSTANTES ---
const TIPO_COMBUSTIBLE_OPTIONS = [
    'DIESEL', 'BENCINA 93', 'BENCINA 95', 'BENCINA 97', 'GLP', 'OTRO'
];
const REQUIRED_FIELDS = ['vehiculo_id', 'conductor_id', 'proyecto_id', 'fecha_carga', 'kilometraje', 'litros_cargados', 'costo_total', 'tipo_combustible'];

// Reuso de helpers (debounce y paginación simples)
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const Pagination = ({ meta, onPageChange }) => {
    if (!meta || !meta.pages || meta.pages <= 1) return null;
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

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    try {
        // Asumiendo que la DB retorna un ISO string
        return dateString.slice(0, 16);
    } catch (e) { return ''; }
};

// Simple file uploader for combustible adjuntos
const CargaFileUploader = ({ cargaId, onUploadSuccess, disabled }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !cargaId) {
             setUploadError("Debe seleccionar un archivo y la carga debe estar creada (guardada).");
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
            const fileExt = file.name.split('.').pop();
            const fileName = file.name.substring(0, file.name.lastIndexOf('.'))
                .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_');
            const safeFileName = `${fileName}_${new Date().getTime()}.${fileExt}`;
            const filePath = `combustible/${cargaId}/${safeFileName}`;

            const { error: uploadError } = await supabase.storage
                .from('adjuntos_ordenes')
                .upload(filePath, file);

            if (uploadError) throw new Error(uploadError.message);

            const res = await apiFetch(`/api/combustible/${cargaId}/adjuntos`, {
                method: 'POST',
                body: {
                    storage_path: filePath,
                    nombre_archivo: file.name,
                    mime_type: file.type,
                }
            });

            // El backend devuelve { data: adjunto_creado }
            if (res.status === 201) {
                onUploadSuccess(res.data);
            } else {
                throw new Error(res.data?.message || 'Error guardando adjunto');
            }
        } catch (err) {
            console.error(err);
            setUploadError(err.message || String(err));
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
                    id={`comb-file-upload`}
                    onChange={handleFileChange}
                    accept="image/*,application/pdf"
                    disabled={isUploading || disabled}
                />
                <label htmlFor={`comb-file-upload`} className={`uploader-label ${disabled ? 'disabled' : ''}`}>
                    Seleccionar archivo...
                </label>
                <p className="uploader-hint">JPG, PNG o PDF (Máx 10MB)</p>
                {isUploading && <p className="upload-progress">⏳ Subiendo archivo...</p>}
            </div>
        </div>
    );
};

const CargaAdjuntosList = ({ adjuntos, loading, onDelete }) => {
    const getPublicUrl = (storagePath) => {
        try {
            const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(storagePath);
            return data.publicUrl;
        } catch (e) { return '#'; }
    };

    if (loading) return <p className="loading-adjuntos">Cargando adjuntos...</p>;
    if (!adjuntos || adjuntos.length === 0) return <p className="loading-adjuntos">📂 No hay archivos adjuntos.</p>;

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
                    <button type="button" className="adjunto-delete-btn" title="Eliminar adjunto" onClick={() => onDelete(adj.id)}>×</button>
                </div>
            ))}
        </div>
    );
};

// Form modal
const CombustibleFormModal = ({ isOpen, onClose, onSaved, editing, token }) => {
    const [form, setForm] = useState({});
    const [vehiculos, setVehiculos] = useState([]);
    const [conductores, setConductores] = useState([]);
    const [proyectos, setProyectos] = useState([]); // [ADAPTADO]
    const [adjuntos, setAdjuntos] = useState([]);
    const [loadingAdj, setLoadingAdj] = useState(false);
    const [loadingLists, setLoadingLists] = useState(false); // [ADAPTADO]
    const [apiError, setApiError] = useState(null); // [ADAPTADO]
    const [submitting, setSubmitting] = useState(false); // [ADAPTADO]
    const cargaId = editing?.id;

    useEffect(() => {
        if (!isOpen) return;
        const fetchLists = async () => {
            setLoadingLists(true);
            try {
                // Listas de Flota
                const r1 = await apiFetch('/api/vehiculos/?per_page=500');
                if (r1.status === 200) setVehiculos(r1.data.data || []);
                const r2 = await apiFetch('/api/conductores/?per_page=500');
                if (r2.status === 200) setConductores(r2.data.data || []);

                // Lista de Proyectos (DB Externa)
                const r3 = await apiFetch('/api/combustible/proyectos');
                if (r3.status === 200) setProyectos(r3.data.data || []);
                else setApiError(r3.data?.message || 'Error cargando proyectos');
                
            } catch (e) { 
                console.error('Error cargando listas', e); 
                setApiError('Error de conexión al cargar datos iniciales');
            } finally {
                setLoadingLists(false);
            }
        };
        fetchLists();
    }, [isOpen]);

    const fetchAdjuntos = useCallback(async (id) => {
        setLoadingAdj(true);
        try {
            const res = await apiFetch(`/api/combustible/${id}/adjuntos`);
            if (res.status === 200) setAdjuntos(res.data.data || []);
        } catch (e) { console.error('Error cargando adjuntos', e); }
        setLoadingAdj(false);
    }, []);

    useEffect(() => {
        if (editing) {
            setForm({
                vehiculo_id: editing.vehiculo_id || '',
                conductor_id: editing.conductor_id || '',
                proyecto_id: editing.proyecto_id || '', // [ADAPTADO]
                fecha_carga: formatDateTimeForInput(editing.fecha_carga),
                kilometraje: editing.kilometraje || '',
                litros_cargados: editing.litros_cargados || '',
                costo_total: editing.costo_total || '',
                tipo_combustible: editing.tipo_combustible || TIPO_COMBUSTIBLE_OPTIONS[0], // [ADAPTADO]
                estacion_servicio: editing.estacion_servicio || '',
                observaciones: editing.observaciones || ''
            });
            fetchAdjuntos(editing.id);
        } else {
            setForm({ 
                vehiculo_id: '', conductor_id: '', proyecto_id: '', 
                fecha_carga: formatDateTimeForInput(new Date().toISOString()), 
                kilometraje: '', litros_cargados: '', costo_total: '', 
                tipo_combustible: TIPO_COMBUSTIBLE_OPTIONS[0], // [ADAPTADO]
                estacion_servicio: '', observaciones: ''
            });
            setAdjuntos([]);
        }
        setApiError(null);
    }, [editing, fetchAdjuntos, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;
        if (name.endsWith('_id') || name.includes('kilometraje')) {
             finalValue = value ? parseInt(value, 10) : '';
        } else if (name.includes('litros') || name.includes('costo')) {
             finalValue = value ? parseFloat(value) : '';
        }
        setForm(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setApiError(null);
        
        const payload = { ...form };
        
        // Validación simple de campos requeridos (adaptada para frontend)
        const missing = REQUIRED_FIELDS.filter(f => !payload[f]);
        if (missing.length > 0) {
            setApiError(`Faltan campos requeridos: ${missing.join(', ')}`);
            setSubmitting(false);
            return;
        }

        try {
            // POST or PUT
            const url = editing ? `/api/combustible/${editing.id}` : '/api/combustible/';
            const method = editing ? 'PUT' : 'POST';
            
            const res = await apiFetch(url, { method, body: payload });
            
            if (res.status === 200 || res.status === 201) {
                // Pasamos los datos guardados para actualizar el estado del parent y el modal
                onSaved(res.data.data || res.data);
            } else {
                setApiError(res.data?.message || 'Error al guardar la carga');
            }
        } catch (err) { 
            console.error(err); 
            setApiError('Error de conexión al servidor');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUploadSuccess = (resData) => {
        // resData tiene la estructura { data: adjunto_creado } o directamente adjunto_creado
        const adjunto = resData.data || resData;
        setAdjuntos(prev => [adjunto, ...prev]);
    };

    const handleDeleteAdj = async (adjId) => {
        try {
            const res = await apiFetch(`/api/combustible/adjuntos/${adjId}`, { method: 'DELETE' });
            if (res.status === 200) setAdjuntos(prev => prev.filter(a => a.id !== adjId));
        } catch (e) { console.error('Error borrando adjunto', e); }
    };

    if (!isOpen) return null;
    
    // Asumimos que los selectores están cargados o se está cargando
    const isFormInvalid = REQUIRED_FIELDS.some(f => !form[f]) || submitting || loadingLists;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <h3>{editing ? 'Editar Carga' : 'Nueva Carga de Combustible'}</h3>
                    <button className="modal-close-pro" onClick={onClose}>×</button>
                </div>
                
                {apiError && (
                    <div className="modal-error-pro" style={{margin: '1.5rem 2rem 0'}}>
                        <span className="error-icon-pro">⚠</span>
                        <span>{apiError}</span>
                    </div>
                )}
                
                {loadingLists && <div className="loading-state" style={{padding: '2rem 1.5rem 0'}}>Cargando listas de vehículos, conductores y proyectos...</div>}

                <div className="modal-body-pro">
                    <form id="combustible-form" onSubmit={handleSave}>
                    
                    {/* SECCIÓN 1: ASIGNACIÓN Y PROYECTO */}
                    <div className="form-section-pro">
                        <h4 className="section-title-pro">Asignación de Costo y Recursos</h4>
                        <div className="form-grid-2">
                            <div className="form-group-pro">
                                <label>Proyecto (Costo) <span className="required-star">*</span></label>
                                <select name="proyecto_id" value={form.proyecto_id} onChange={handleChange} required disabled={loadingLists}>
                                    <option value="">Seleccionar proyecto</option>
                                    {proyectos.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group-pro">
                                <label>Vehículo <span className="required-star">*</span></label>
                                <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange} required disabled={loadingLists}>
                                    <option value="">Seleccionar vehículo</option>
                                    {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} - {v.marca} {v.modelo}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-grid-2" style={{marginTop: '1.25rem'}}>
                            <div className="form-group-pro">
                                <label>Conductor <span className="required-star">*</span></label>
                                <select name="conductor_id" value={form.conductor_id} onChange={handleChange} required disabled={loadingLists}>
                                    <option value="">Seleccionar conductor</option>
                                    {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>)}
                                </select>
                            </div>
                            <div className="form-group-pro">
                                <label>Fecha y hora <span className="required-star">*</span></label>
                                <input type="datetime-local" name="fecha_carga" value={form.fecha_carga} onChange={handleChange} required />
                            </div>
                        </div>
                    </div>
                    
                    {/* SECCIÓN 2: DETALLE Y KM */}
                    <div className="form-section-pro">
                        <h4 className="section-title-pro">Detalles de la Carga</h4>
                        <div className="form-grid-3">
                            <div className="form-group-pro">
                                <label>Kilometraje <span className="required-star">*</span></label>
                                <input type="number" name="kilometraje" value={form.kilometraje} onChange={handleChange} required min="1" />
                            </div>
                            <div className="form-group-pro">
                                <label>Litros cargados <span className="required-star">*</span></label>
                                <input type="number" step="0.1" name="litros_cargados" value={form.litros_cargados} onChange={handleChange} required min="0.1" />
                            </div>
                            <div className="form-group-pro">
                                <label>Costo total <span className="required-star">*</span></label>
                                <input type="number" step="1" name="costo_total" value={form.costo_total} onChange={handleChange} required min="1" />
                            </div>
                        </div>
                        
                        {/* [ADAPTADO] Layout de Tipo Combustible y Estación */}
                        <div className="form-grid-2" style={{marginTop: '1.25rem'}}>
                            <div className="form-group-pro">
                                <label>Tipo de combustible <span className="required-star">*</span></label>
                                <select name="tipo_combustible" value={form.tipo_combustible} onChange={handleChange} required>
                                    {TIPO_COMBUSTIBLE_OPTIONS.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group-pro">
                                <label>Estación de Servicio</label>
                                <input name="estacion_servicio" value={form.estacion_servicio} onChange={handleChange} placeholder="Ej: COPEC VESP. NORTE" />
                            </div>
                        </div>
                        
                        <div className="form-group-pro" style={{marginTop: '1.25rem'}}>
                            <label>Observaciones</label>
                            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows={8} className="textarea-pro" placeholder="Notas adicionales sobre la carga de combustible..." />
                        </div>
                    </div>

                    {/* SECCIÓN 3: ADJUNTOS */}
                    <div className="form-section-pro">
                        <h4 className="section-title-pro">Adjuntos (Factura/Boleta)</h4>
                        <p className="input-hint-pro" style={{marginBottom: '1rem'}}>
                            📎 Puede adjuntar facturas, boletas o comprobantes relacionados con esta carga de combustible. Los archivos se subirán a Supabase Storage.
                        </p>
                        {cargaId && <CargaFileUploader cargaId={cargaId} onUploadSuccess={handleUploadSuccess} disabled={submitting} />}
                        <CargaAdjuntosList adjuntos={adjuntos} loading={loadingAdj} onDelete={handleDeleteAdj} />
                    </div>
                    </form>
                </div>

                <div className="modal-footer-pro">
                    <button type="button" className="btn btn-secondary-pro" onClick={onClose} disabled={submitting}>Cancelar</button>
                    <button type="submit" form="combustible-form" className="btn btn-primary-pro" disabled={isFormInvalid}>
                        {submitting ? 'Guardando...' : (editing ? 'Actualizar Carga' : 'Registrar Carga')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
export default function Combustible() {
    const [list, setList] = useState([]);
    const [meta, setMeta] = useState({});
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [page, setPage] = useState(1);
    const [perPage] = useState(20);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    // Asumimos que user y token son pasados como props o disponibles en el contexto
    const user = { cargo: 'Administrador' }; // Placeholder para canWrite/isAdmin
    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/combustible/?page=${page}&per_page=${perPage}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`);
            if (res.status === 200) {
                setList(res.data.data || []);
                setMeta(res.data.meta || {});
            }
        } catch (e) { console.error('Error cargando cargas', e); }
        setLoading(false);
    }, [page, perPage, debouncedSearch]);

    useEffect(() => { fetchList(); }, [fetchList]);

    const openNew = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (item) => { setEditing(item); setModalOpen(true); };

    const handleSaved = (saved) => {
        // Si es una creación, actualizamos 'editing' para que se puedan adjuntar archivos inmediatamente
        if (!editing && saved && saved.id) {
            setEditing(saved);
        } else {
            setModalOpen(false); // Si es edición o borrador guardado, cerramos o mantenemos abierto
        }
        fetchList();
    };

    return (
        <div className="mantenimiento-container">
            <div className="mantenimiento-header">
                <h2>⛽ Gestión de Combustible</h2>
                <p className="header-subtitle">Registro de cargas de combustible y asignación de gastos por proyecto</p>
                <div>
                    {canWrite && <button className="btn btn-primary" onClick={openNew}>➕ Nueva Carga</button>}
                </div>
            </div>

            <div className="filtros-container" style={{gridTemplateColumns: '1fr'}}>
                 <div className="search-wrapper-pro" style={{maxWidth: '400px'}}>
                    <span className="search-icon-pro">🔍</span>
                    <input 
                        type="search"
                        placeholder="Buscar por estación u observaciones..." 
                        className="search-input-pro"
                        value={search} 
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
                    />
                </div>
            </div>

            {loading ? <div className="loading-state">Cargando...</div> : (
                <div className="table-container">
                    <table className="mantenimiento-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Fecha</th>
                                <th>Patente</th>
                                <th>Conductor</th>
                                <th>Litros</th>
                                <th>Costo</th>
                                <th>KM</th>
                                <th>Tipo</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(item => (
                                <tr key={item.id} onDoubleClick={() => openEdit(item)} className={canWrite ? 'row-editable' : 'row-readonly'}>
                                    <td className="font-bold">#{item.id}</td>
                                    <td>{item.fecha_carga ? new Date(item.fecha_carga).toLocaleDateString('es-CL') : '-'}</td>
                                    <td><span className="badge-mant-placa">{item.vehiculo?.placa || '-'}</span></td>
                                    <td>{item.conductor ? `${item.conductor.nombre} ${item.conductor.apellido}` : '-'}</td>
                                    <td>{item.litros_cargados || '-'} Lts</td>
                                    <td className="font-bold">{formatCurrency(item.costo_total)}</td>
                                    <td>{item.kilometraje || '-'}</td>
                                    <td><span className="badge-mant-tipo" style={{backgroundColor: '#e0e7ff', color: '#3730a3'}}>{item.tipo_combustible}</span></td>
                                    <td>
                                        {canWrite && <button className="btn-icon-pro btn-edit-pro" onClick={() => openEdit(item)}>✏️</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {list.length === 0 && (
                        <div className="empty-state-pro">
                            <span className="empty-icon-pro">⛽</span>
                            <p>No se encontraron registros de combustible</p>
                        </div>
                    )}
                </div>
            )}

            <Pagination meta={meta} onPageChange={(p) => setPage(p)} />

            {modalOpen && (
                <CombustibleFormModal 
                    isOpen={modalOpen} 
                    onClose={() => setModalOpen(false)} 
                    onSaved={handleSaved} 
                    editing={editing} 
                />
            )}
        </div>
    );
}
// [END_CODE_BLOCK]