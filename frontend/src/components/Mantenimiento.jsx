import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import './Mantenimiento.css';

// --- HELPERS (Reusando lógica existente) ---
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
        return date.toLocaleDateString('es-CL');
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
    // Aseguramos que solo se muestre el valor si es un número válido
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

// --- MODAL FORMULARIO ---

const MantenimientoFormModal = ({ isOpen, onClose, onSave, editingMantenimiento, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('programacion');
    const [vehiculosList, setVehiculosList] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);

    const requiredFields = ['vehiculo_id', 'descripcion', 'fecha_programada'];

    // Cargar la lista de vehículos (Necesario para el select)
    useEffect(() => {
        if (!isOpen) return;
        const fetchVehicles = async () => {
            setLoadingLists(true);
            try {
                // Obtenemos todos los vehículos para el select
                const resVeh = await apiFetch('/api/vehiculos/?per_page=500');
                if (resVeh.status === 200) setVehiculosList(resVeh.data.data || []);
            } catch (e) { console.error("Error cargando vehículos", e); }
            setLoadingLists(false);
        };
        fetchVehicles();
    }, [isOpen]);

    // Inicializar formulario
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
            });
        } else {
            setForm({
                vehiculo_id: '', descripcion: '', tipo_mantenimiento: 'PREVENTIVO',
                estado: 'PENDIENTE', fecha_programada: formatDateForInput(new Date().toISOString()),
                km_programado: '', fecha_realizacion: '', km_realizacion: '',
                costo: '', observaciones: ''
            });
        }
        setActiveTab('programacion');
    }, [editingMantenimiento, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;

        if (type === 'number' || name.endsWith('_id')) {
            // Manejar números (incluyendo floats para costo)
            finalValue = value ? (name === 'costo' ? parseFloat(value) : parseInt(value, 10)) : '';
        } else if (name === 'descripcion' || name === 'observaciones') {
            finalValue = value; // Mantener case en descripciones
        } else if (typeof value === 'string') {
            finalValue = value.toUpperCase(); // Otros campos a mayúsculas
        }

        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...form };

        // Limpiar campos vacíos antes de enviar (convertir a null si es '')
        Object.keys(payload).forEach(key => {
            if (payload[key] === '' || payload[key] === undefined || payload[key] === null) {
                payload[key] = null;
            }
        });

        // Validaciones UX adicionales
        if (payload.costo && payload.costo < 0) {
            alert('El costo no puede ser negativo.');
            return;
        }

        onSave(payload, editingMantenimiento ? editingMantenimiento.id : null);
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingMantenimiento ? 'Editar Mantenimiento' : 'Nueva Orden de Mantenimiento'}</h3>
                        <p className="modal-subtitle">
                            {editingMantenimiento ? `Modificando Orden #${editingMantenimiento.id}` : 'Registra la intervención programada o correctiva'}
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
                        <button
                            type="button"
                            className={`tab-button ${activeTab === 'programacion' ? 'active' : ''}`}
                            onClick={() => setActiveTab('programacion')}
                        >
                            📅 Programación y Detalle
                        </button>
                        <button
                            type="button"
                            className={`tab-button ${activeTab === 'cierre' ? 'active' : ''}`}
                            onClick={() => setActiveTab('cierre')}
                        >
                            🏁 Ejecución y Costo
                        </button>
                    </div>

                    <div className="modal-body-pro">
                        {loadingLists && <div className="loading-state">Cargando...</div>}

                        {activeTab === 'programacion' && !loadingLists && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Detalles Básicos</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Vehículo (Placa) <span className="required-star">*</span></label>
                                            <select name="vehiculo_id" value={form.vehiculo_id} onChange={handleChange} required>
                                                <option value="">Seleccionar vehículo</option>
                                                {vehiculosList.map(v => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.placa} - {v.marca && v.modelo && v.modelo !== 'Luz' ? `${v.marca} ${v.modelo}` : v.modelo === 'Luz' ? 'Modelo pendiente' : v.modelo || 'Sin modelo'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Tipo de Mantenimiento</label>
                                            <select name="tipo_mantenimiento" value={form.tipo_mantenimiento} onChange={handleChange}>
                                                <option value="PREVENTIVO">PREVENTIVO</option>
                                                <option value="CORRECTIVO">CORRECTIVO</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1.25rem'}}>
                                        <label>Descripción del Trabajo <span className="required-star">*</span></label>
                                        <textarea name="descripcion" value={form.descripcion} onChange={handleChange} rows="3" className="textarea-pro" placeholder="Ej: Cambio de aceite y filtros, Revisión de 20.000 KM" required></textarea>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Planificación</h4>
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>Fecha Programada <span className="required-star">*</span></label>
                                            <input name="fecha_programada" type="date" value={form.fecha_programada} onChange={handleChange} required />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>KM Programado</label>
                                            <input name="km_programado" type="number" value={form.km_programado} onChange={handleChange} placeholder="Ej: 80000" min="0" />
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
                                            <input name="km_realizacion" type="number" value={form.km_realizacion} onChange={handleChange} placeholder="Ej: 80050" min="0" />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Costos y Observaciones</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Costo Total (CLP)</label>
                                            <input name="costo" type="number" value={form.costo} onChange={handleChange} placeholder="Ej: 150000" min="0" step="1" />
                                        </div>
                                    </div>
                                    <div className="form-group-pro" style={{marginTop: '1.25rem'}}>
                                        <label>Observaciones / Detalle</label>
                                        <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="4" className="textarea-pro" placeholder="Detalle de repuestos, proveedor, o notas de la ejecución."></textarea>
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
                            {submitting ? '⏳ Guardando...' : (editingMantenimiento ? '💾 Actualizar' : '➕ Crear Orden')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Reusamos la ConfirmationModal de otros módulos
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


// --- COMPONENTE PRINCIPAL MANTENIMIENTO ---

function Mantenimiento({ user, token }) {
    console.log('🔧 Mantenimiento component rendered', { user, token: token ? 'present' : 'missing' });

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

    // Función para verificar si el token es válido
    const verifyToken = useCallback(async () => {
        try {
            console.log('🔧 Verifying token...');
            const res = await apiFetch('/auth/me');
            if (res && res.status === 200) {
                console.log('🔧 Token is valid');
                return true;
            } else {
                console.log('🔧 Token is invalid');
                return false;
            }
        } catch (err) {
            console.error('🔧 Error verifying token:', err);
            return false;
        }
    }, []);

    const fetchVehiculosList = useCallback(async () => {
        try {
            // Obtenemos una lista simple de vehículos para el filtro
            const res = await apiFetch('/api/vehiculos/?per_page=500');
            if (res.status === 200) {
                setVehiculosFiltroList(res.data.data || []);
            }
        } catch (e) {
            console.error("Error cargando lista de vehículos para filtro", e);
        }
    }, []);

    const fetchMantenimientos = useCallback(async () => {
        console.log('🔧 fetchMantenimientos called');
        setLoading(true);
        setError(null);
        
        // Verificar que tengamos token antes de hacer la petición
        if (!token) {
            console.log('🔧 No token available, skipping');
            setError('No has iniciado sesión');
            setLoading(false);
            return;
        }
        
        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (filtroEstado) params.append('estado', filtroEstado);
        if (filtroVehiculoId) params.append('vehiculo_id', filtroVehiculoId);

        try {
            console.log('🔧 Making API call to:', `/api/mantenimiento/?${params.toString()}`);
            const res = await apiFetch(`/api/mantenimiento/?${params.toString()}`);
            console.log('🔧 API response:', res);
            
            if (res && res.status === 200) {
                setMantenimientos(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else if (res && res.status === 401) {
                console.log('🔧 Token inválido, redirigiendo al login');
                setError('Sesión expirada. Redirigiendo al login...');
                // Dar tiempo para que el usuario vea el mensaje antes de redirigir
                setTimeout(() => {
                    window.location.replace('/');
                }, 2000);
            } else {
                setError(res.data?.message || `Error ${res.status}: ${res.data?.message || 'Error desconocido'}`);
            }
        } catch (err) {
            console.error('🔧 Error in fetchMantenimientos:', err);
            setError('Error de conexión - verifica tu conexión a internet');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, filtroEstado, filtroVehiculoId, meta.per_page, token]);

    useEffect(() => {
        console.log('🔧 useEffect triggered', { token: !!token });
        if (token) {
            // Primero verificar que el token sea válido
            verifyToken().then(isValid => {
                if (isValid) {
                    fetchMantenimientos();
                    fetchVehiculosList();
                } else {
                    console.log('🔧 Token inválido, redirigiendo');
                    setError('Sesión expirada. Redirigiendo al login...');
                    setTimeout(() => {
                        window.location.replace('/');
                    }, 2000);
                }
            });
        } else {
            console.log('🔧 No token available, skipping API calls');
        }
    }, [token, verifyToken, fetchMantenimientos, fetchVehiculosList]);

    // Timeout para evitar carga infinita
    useEffect(() => {
        if (loading) {
            const timeout = setTimeout(() => {
                console.warn('🔧 Loading timeout reached');
                setLoading(false);
                setError('Tiempo de espera agotado. Verifica tu conexión.');
            }, 5000); // 5 segundos
            return () => clearTimeout(timeout);
        }
    }, [loading]);

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
        } catch (err) {
            setFormError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingMantenimiento) return;
        setSubmitting(true);
        try {
            const res = await apiFetch(`/api/mantenimiento/${deletingMantenimiento.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setDeletingMantenimiento(null);
                fetchMantenimientos();
            } else {
                setError(res.data?.message || 'No se pudo eliminar');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const getEstadoBadge = (estado) => {
        const estadoClass = {
            'PENDIENTE': 'badge-estado-pendiente',
            'PROGRAMADO': 'badge-estado-programado',
            'EN_TALLER': 'badge-estado-en_taller',
            'FINALIZADO': 'badge-estado-finalizado',
            'CANCELADO': 'badge-estado-cancelado'
        };
        return `badge-mant-estado ${estadoClass[estado] || ''}`;
    };

    const getTipoBadge = (tipo) => {
        const tipoClass = {
            'PREVENTIVO': 'badge-tipo-preventivo',
            'CORRECTIVO': 'badge-tipo-correctivo',
        };
        return `badge-mant-tipo ${tipoClass[tipo] || ''}`;
    };

    // Función para manejar doble clic en fila
    const handleRowDoubleClick = (mantenimiento) => {
        // No permitir editar órdenes finalizadas
        if (mantenimiento.estado === 'FINALIZADO') {
            console.log('🔒 Orden finalizada, no se puede editar');
            return;
        }
        
        // Verificar permisos
        if (!canWrite) {
            console.log('🔒 Usuario sin permisos para editar');
            return;
        }
        
        console.log('🔧 Editando orden:', mantenimiento.id);
        setEditingMantenimiento(mantenimiento);
        setFormError(null);
        setShowModal(true);
    };

    // Función para determinar si una fila es editable
    const isRowEditable = (mantenimiento) => {
        return canWrite && mantenimiento.estado !== 'FINALIZADO';
    };

    if (!token) {
        return (
            <div className="mantenimiento-container">
                <div className="loading-state">Cargando módulo de mantenimiento...</div>
            </div>
        );
    }

    return (
        <div className="mantenimiento-container">
            <div className="mantenimiento-header">
                <div>
                    <h2>Gestión de Mantenimiento</h2>
                    <p className="header-subtitle">Control de servicios programados y reparaciones de la flota</p>
                </div>
                {canWrite && (
                    <button onClick={() => { setEditingMantenimiento(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">
                        ➕ Nueva Orden
                    </button>
                )}
            </div>

            <div className="filtros-container">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input
                        type="search"
                        placeholder="Buscar por descripción u observaciones..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input-pro"
                    />
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
                    {vehiculosFiltroList.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.placa} - {v.marca && v.modelo && v.modelo !== 'Luz' ? `${v.marca} ${v.modelo}` : v.modelo === 'Luz' ? 'Modelo pendiente' : v.modelo || 'Sin modelo'}
                        </option>
                    ))}
                </select>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-info-message">
                💡 <strong>Edición rápida:</strong> Haz doble clic en cualquier fila editable para modificarla. 
                Las órdenes finalizadas no se pueden editar.
            </div>

            <div className="table-container">
                {loading && mantenimientos.length === 0 ? (
                    <div className="loading-state">Cargando órdenes de mantenimiento...</div>
                ) : (
                    <table className="mantenimiento-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Estado</th>
                                <th>Vehículo</th>
                                <th>Tipo</th>
                                <th>Descripción</th>
                                <th>F. Prog.</th>
                                <th>KM Prog.</th>
                                <th>F. Realiz.</th>
                                <th>Costo</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {mantenimientos.map(m => (
                                <tr 
                                    key={m.id} 
                                    onDoubleClick={() => handleRowDoubleClick(m)}
                                    className={isRowEditable(m) ? 'row-editable' : 'row-readonly'}
                                    title={isRowEditable(m) ? '📝 Doble clic para editar esta orden' : '🔒 Orden finalizada - no editable'}
                                >
                                    <td className="font-bold">
                                        #{m.id}
                                        {isRowEditable(m) && <span className="edit-indicator" title="Editable"> ✏️</span>}
                                        {m.estado === 'FINALIZADO' && <span className="lock-indicator" title="Finalizada"> 🔒</span>}
                                    </td>
                                    <td><span className={getEstadoBadge(m.estado)}>{m.estado?.replace('_', ' ')}</span></td>
                                    <td>
                                        <span className="badge-mant-placa">{m.vehiculo?.placa || 'N/A'}</span>
                                        <br />
                                        <small>
                                            {m.vehiculo?.marca && m.vehiculo?.modelo && m.vehiculo.modelo !== 'Luz'
                                                ? `${m.vehiculo.marca} ${m.vehiculo.modelo}`.trim()
                                                : m.vehiculo?.modelo === 'Luz' 
                                                    ? 'Modelo pendiente'
                                                    : m.vehiculo?.modelo || 'Sin modelo'
                                            }
                                        </small>
                                    </td>
                                    <td><span className={getTipoBadge(m.tipo_mantenimiento)}>{m.tipo_mantenimiento}</span></td>
                                    <td>{m.descripcion}</td>
                                    <td>{formatLocalDate(m.fecha_programada)}</td>
                                    <td>{m.km_programado || '-'}</td>
                                    <td>{formatLocalDate(m.fecha_realizacion) || '-'}</td>
                                    <td>{formatCurrency(m.costo) || '-'}</td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && m.estado !== 'FINALIZADO' && (
                                                    <button
                                                        onClick={() => { setEditingMantenimiento(m); setFormError(null); setShowModal(true); }}
                                                        className="btn-icon-pro btn-edit-pro"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => setDeletingMantenimiento(m)}
                                                        className="btn-icon-pro btn-delete-pro"
                                                        title="Eliminar (Soft-delete)"
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
                {mantenimientos.length === 0 && !loading && (
                    <div className="empty-state-pro">
                        <span className="empty-icon-pro">🛠️</span>
                        <p>No se encontraron órdenes de mantenimiento</p>
                    </div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            <MantenimientoFormModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleFormSubmit}
                editingMantenimiento={editingMantenimiento}
                apiError={formError}
                submitting={submitting}
            />

            <ConfirmationModal
                isOpen={!!deletingMantenimiento}
                onClose={() => setDeletingMantenimiento(null)}
                onConfirm={handleConfirmDelete}
                title="Confirmar Eliminación"
                message={`¿Estás seguro de eliminar la orden de mantenimiento #${deletingMantenimiento?.id}? Se marcará como eliminada (soft-delete).`}
                submitting={submitting}
            />
        </div>
    );
}

export default Mantenimiento;