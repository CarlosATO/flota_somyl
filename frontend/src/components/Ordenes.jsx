import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import './Ordenes.css'; // Usamos los nuevos estilos

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

// --- Formateo de Fechas ---
const formatLocalDate = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        // Formato: DD/MM/AAAA HH:MM
        return date.toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch (e) {
        return dateString;
    }
};

const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        // Ajustar a la zona horaria local para el input 'datetime-local'
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    } catch (e) {
        return '';
    }
};

// --- Componente del Modal ---

const OrdenFormModal = ({ isOpen, onClose, onSave, editingOrden, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('detalle');
    
    // --- NUEVO: Estados para cargar listas ---
    const [vehiculosList, setVehiculosList] = useState([]);
    const [conductoresList, setConductoresList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);

    const requiredFields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion'];

    // --- NUEVO: Cargar Vehículos y Conductores ---
    useEffect(() => {
        if (!isOpen) return;

        const fetchLists = async () => {
            setLoadingLists(true);
            try {
                // Cargar vehículos (asumimos que no son miles, pedimos 500)
                const resVeh = await apiFetch('/api/vehiculos/?per_page=500');
                if (resVeh.status === 200) {
                    setVehiculosList(resVeh.data.data || []);
                }
                
                // Cargar conductores (asumimos que no son miles, pedimos 500)
                const resCond = await apiFetch('/api/conductores/?per_page=500');
                if (resCond.status === 200) {
                    setConductoresList(resCond.data.data || []);
                }
            } catch (e) {
                console.error("Error cargando listas", e);
            }
            setLoadingLists(false);
        };

        fetchLists();
    }, [isOpen]); // Recargar listas cada vez que se abre el modal

    // Cargar datos de la orden que se está editando
    useEffect(() => {
        if (editingOrden) {
            setForm({
                // Usamos formatDateTimeForInput para 'datetime-local'
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
        } else {
            // Formulario vacío para nueva orden
            setForm({
                fecha_inicio_programada: formatDateTimeForInput(new Date().toISOString()), // Default a 'ahora'
                fecha_fin_programada: '',
                fecha_inicio_real: '',
                fecha_fin_real: '',
                origen: '',
                destino: '',
                descripcion: '',
                estado: 'pendiente',
                vehiculo_id: '',
                conductor_id: '',
                kilometraje_inicio: '',
                kilometraje_fin: '',
                observaciones: '',
            });
        }
        setActiveTab('detalle');
    }, [editingOrden, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;

        // Convertir IDs a números
        if (name === 'vehiculo_id' || name === 'conductor_id' || name === 'kilometraje_inicio' || name === 'kilometraje_fin') {
            finalValue = value ? parseInt(value, 10) : '';
        }
        
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const payload = { ...form };

        // Convertir fechas locales a ISO String (UTC) para el backend
        // El backend espera formato ISO 8601
        try {
            if (payload.fecha_inicio_programada) {
                payload.fecha_inicio_programada = new Date(payload.fecha_inicio_programada).toISOString();
            }
            if (payload.fecha_fin_programada) {
                payload.fecha_fin_programada = new Date(payload.fecha_fin_programada).toISOString();
            }
            if (payload.fecha_inicio_real) {
                payload.fecha_inicio_real = new Date(payload.fecha_inicio_real).toISOString();
            }
            if (payload.fecha_fin_real) {
                payload.fecha_fin_real = new Date(payload.fecha_fin_real).toISOString();
            }
        } catch (e) {
            console.error("Error al formatear fechas para envío", e);
        }

        onSave(payload, editingOrden ? editingOrden.id : null);
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingOrden ? 'Editar Orden de Servicio' : 'Crear Nueva Orden'}</h3>
                        <p className="modal-subtitle">
                            {editingOrden ? `Modificando Orden #${editingOrden.id}` : 'Completa los detalles del servicio'}
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
                        <button type="button" className={`tab-button ${activeTab === 'detalle' ? 'active' : ''}`} onClick={() => setActiveTab('detalle')}>
                            📍 Detalles del Viaje
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'asignacion' ? 'active' : ''}`} onClick={() => setActiveTab('asignacion')}>
                            👤 Asignación
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'registro' ? 'active' : ''}`} onClick={() => setActiveTab('registro')}>
                            📈 Registro (KM y Reales)
                        </button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando vehículos y conductores...</div>}

                        {/* --- Pestaña 1: Detalles del Viaje --- */}
                        {activeTab === 'detalle' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Servicio</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Origen <span className="required-star">*</span></label>
                                            <input name="origen" value={form.origen} onChange={handleChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Destino <span className="required-star">*</span></label>
                                            <input name="destino" value={form.destino} onChange={handleChange} required />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1.25rem'}}>
                                        <label>Descripción / Motivo <span className="required-star">*</span></label>
                                        <textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" required></textarea>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Fechas Programadas</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Inicio Programado <span className="required-star">*</span></label>
                                            <input name="fecha_inicio_programada" type="datetime-local" value={form.fecha_inicio_programada} onChange={handleChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fin Programado</label>
                                            <input name="fecha_fin_programada" type="datetime-local" value={form.fecha_fin_programada} onChange={handleChange} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* --- Pestaña 2: Asignación --- */}
                        {activeTab === 'asignacion' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Asignación de Recursos</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Vehículo (Placa)</label>
                                            <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {vehiculosList.map(v => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.placa} ({v.marca} {v.modelo})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Conductor (Nombre)</label>
                                            <select name="conductor_id" value={form.conductor_id} onChange={handleChange}>
                                                <option value="">(Sin asignar)</option>
                                                {conductoresList.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.nombre} {c.apellido} ({c.rut})
                                                    </option>
                                                ))}
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
                                                <option value="pendiente">PENDIENTE</option>
                                                <option value="asignada">ASIGNADA</option>
                                                <option value="en_curso">EN CURSO</option>
                                                <option value="completada">COMPLETADA</option>
                                                <option value="cancelada">CANCELADA</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- Pestaña 3: Registro --- */}
                        {activeTab === 'registro' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Fechas Reales (Ejecución)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Inicio Real</label>
                                            <input name="fecha_inicio_real" type="datetime-local" value={form.fecha_inicio_real} onChange={handleChange} />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fin Real</label>
                                            <input name="fecha_fin_real" type="datetime-local" value={form.fecha_fin_real} onChange={handleChange} />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Kilometraje (Odómetro)</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>KM Inicio</label>
                                            <input name="kilometraje_inicio" type="number" value={form.kilometraje_inicio} onChange={handleChange} />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Fin</label>
                                            <input name="kilometraje_fin" type="number" value={form.kilometraje_fin} onChange={handleChange} />
                                        </div>
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
                    
                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isFormInvalid || submitting || loadingLists} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (editingOrden ? '💾 Actualizar' : '➕ Crear Orden')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Modal de Confirmación ---
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

// --- Componente Principal de Órdenes ---

function Ordenes({ user, token }) {
    const [ordenes, setOrdenes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    
    // Filtros
    const [searchQuery, setSearchQuery] = useState('');
    const [filtroEstado, setFiltroEstado] = useState(''); // '' (todos), 'pendiente', 'asignada', etc.
    
    // Modales
    const [showModal, setShowModal] = useState(false);
    const [editingOrden, setEditingOrden] = useState(null);
    const [cancelingOrden, setCancelingOrden] = useState(null); // ID de la orden a cancelar
    
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    // Permisos
    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    
    const debouncedSearch = useDebounce(searchQuery, 500);

    const fetchOrdenes = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        // Construir Query Params
        const params = new URLSearchParams({ 
            page, 
            per_page: meta.per_page 
        });
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (filtroEstado) params.append('estado', filtroEstado);
        
        try {
            const res = await apiFetch(`/api/ordenes/?${params.toString()}`);
            if (res && res.status === 200) {
                setOrdenes(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else {
                setError(res.data?.message || 'Error cargando órdenes');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, filtroEstado, meta.per_page]);

    useEffect(() => {
        if (token) {
            fetchOrdenes();
        }
    }, [token, fetchOrdenes]);

    // Handler para Submit (Crear / Editar)
    const handleFormSubmit = async (formData, ordenId) => {
        setSubmitting(true);
        setFormError(null);
        const url = ordenId ? `/api/ordenes/${ordenId}` : '/api/ordenes/';
        const method = ordenId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });
            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchOrdenes(); // Recargar la lista
            } else {
                setFormError(res.data?.message || 'Error al guardar la orden');
            }
        } catch (err) {
            setFormError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    // Handler para Cancelar (DELETE)
    const handleConfirmCancel = async () => {
        if (!cancelingOrden) return;
        setSubmitting(true);
        try {
            // El backend (ordenes.py) interpreta DELETE como "cancelar"
            const res = await apiFetch(`/api/ordenes/${cancelingOrden.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setCancelingOrden(null);
                fetchOrdenes(); // Recargar la lista
            } else {
                setError(res.data?.message || 'No se pudo cancelar la orden');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    // Helper para badge de estado
    const getEstadoBadge = (estado) => {
        return `badge-estado badge-estado-${estado || 'default'}`;
    };

    if (!token) {
        return (
            <div className="ordenes-container">
                <div className="loading-state">Cargando módulo de órdenes...</div>
            </div>
        );
    }

    return (
        <div className="ordenes-container">
            <div className="ordenes-header">
                <div>
                    <h2>Gestión de Órdenes</h2>
                    <p className="header-subtitle">Administra los viajes, despachos y asignaciones de la flota</p>
                </div>
                {canWrite && (
                    <button onClick={() => { setEditingOrden(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">
                        ➕ Nueva Orden
                    </button>
                )}
            </div>

            {/* --- Filtros --- */}
            <div className="filtros-container">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input 
                        type="search" 
                        placeholder="Buscar por origen, destino o descripción..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="search-input-pro" 
                    />
                </div>
                <select 
                    value={filtroEstado} 
                    onChange={(e) => setFiltroEstado(e.target.value)} 
                    className="filtro-estado-select"
                >
                    <option value="">Todos los Estados</option>
                    <option value="pendiente">PENDIENTE</option>
                    <option value="asignada">ASIGNADA</option>
                    <option value="en_curso">EN CURSO</option>
                    <option value="completada">COMPLETADA</option>
                    <option value="cancelada">CANCELADA</option>
                </select>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            {/* --- Tabla de Órdenes --- */}
            <div className="table-container">
                {loading && ordenes.length === 0 ? (
                    <div className="loading-state">Cargando órdenes...</div>
                ) : (
                    <table className="ordenes-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Estado</th>
                                <th>Inicio Programado</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Vehículo</th>
                                <th>Conductor</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
</thead>
                        <tbody>
                            {ordenes.map(o => (
                                <tr key={o.id}>
                                    <td className="font-bold">#{o.id}</td>
                                    <td>
                                        <span className={getEstadoBadge(o.estado)}>
                                            {o.estado.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td>{formatLocalDate(o.fecha_inicio_programada)}</td>
                                    <td>{o.origen}</td>
                                    <td>{o.destino}</td>
                                    <td>{o.vehiculo ? `${o.vehiculo.placa}` : '-'}</td>
                                    <td>{o.conductor ? `${o.conductor.nombre} ${o.conductor.apellido}` : '-'}</td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && (
                                                    <button 
                                                        onClick={() => { setEditingOrden(o); setFormError(null); setShowModal(true); }} 
                                                        className="btn-icon-pro btn-edit-pro"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {/* Solo permitir cancelar si no está completada */}
                                                {(isAdmin || canWrite) && o.estado !== 'completada' && o.estado !== 'cancelada' && (
                                                    <button 
                                                        onClick={() => setCancelingOrden(o)} 
                                                        className="btn-icon-pro btn-delete-pro"
                                                        title="Cancelar Orden"
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
                {ordenes.length === 0 && !loading && (
                    <div className="empty-state-pro">
                        <span className="empty-icon-pro">📅</span>
                        <p>No se encontraron órdenes</p>
                    </div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            {/* --- Modales --- */}
            <OrdenFormModal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)} 
                onSave={handleFormSubmit} 
                editingOrden={editingOrden} 
                apiError={formError} 
                submitting={submitting} 
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