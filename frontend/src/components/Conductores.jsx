import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import './Conductores.css';

// --- UTILIDADES ---
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
};

// --- COMPONENTE DE PAGINACIÓN ---
const Pagination = ({ meta, onPageChange }) => {
    if (!meta || meta.pages <= 1) return null;
    
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, meta.page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(meta.pages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
    }
    
    return (
        <div className="pagination-pro">
            <div className="pagination-info">
                Mostrando {((meta.page - 1) * meta.per_page) + 1} - {Math.min(meta.page * meta.per_page, meta.total)} de {meta.total} conductores
            </div>
            <div className="pagination-buttons">
                <button 
                    onClick={() => onPageChange(1)} 
                    disabled={meta.page === 1}
                    className="pagination-btn"
                    title="Primera página"
                >
                    «
                </button>
                <button 
                    onClick={() => onPageChange(meta.page - 1)} 
                    disabled={meta.page === 1}
                    className="pagination-btn"
                >
                    ‹ Anterior
                </button>
                
                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={`pagination-btn ${p === meta.page ? 'active' : ''}`}
                    >
                        {p}
                    </button>
                ))}
                
                <button 
                    onClick={() => onPageChange(meta.page + 1)} 
                    disabled={meta.page >= meta.pages}
                    className="pagination-btn"
                >
                    Siguiente ›
                </button>
                <button 
                    onClick={() => onPageChange(meta.pages)} 
                    disabled={meta.page === meta.pages}
                    className="pagination-btn"
                    title="Última página"
                >
                    »
                </button>
            </div>
        </div>
    );
};

// --- MODAL DE FORMULARIO CON PESTAÑAS ---
const ConductorFormModal = ({ isOpen, onClose, onSave, editingConductor, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('personal');
    
    const requiredFields = ['nombre', 'apellido', 'rut'];

    useEffect(() => {
        if (editingConductor) {
            setForm({
                nombre: editingConductor.nombre || '',
                apellido: editingConductor.apellido || '',
                rut: editingConductor.rut || '',
                licencia_numero: editingConductor.licencia_numero || '',
                licencia_tipo: editingConductor.licencia_tipo || '',
                licencia_vencimiento: formatDateForInput(editingConductor.licencia_vencimiento),
                telefono: editingConductor.telefono || '',
                email: editingConductor.email || '',
                direccion: editingConductor.direccion || '',
                fecha_nacimiento: formatDateForInput(editingConductor.fecha_nacimiento),
                fecha_ingreso: formatDateForInput(editingConductor.fecha_ingreso),
                estado: editingConductor.estado || 'ACTIVO',
                observaciones: editingConductor.observaciones || '',
            });
        } else {
            setForm({
                nombre: '', apellido: '', rut: '', licencia_numero: '', licencia_tipo: '',
                licencia_vencimiento: '', telefono: '', email: '', direccion: '',
                fecha_nacimiento: '', fecha_ingreso: '', estado: 'ACTIVO', observaciones: ''
            });
        }
        setActiveTab('personal');
    }, [editingConductor, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;
        
        // Convertir a mayúsculas campos específicos
        if (type !== 'number' && type !== 'email' && type !== 'date' && name !== 'observaciones' && typeof value === 'string') {
            finalValue = value.toUpperCase();
        }
        
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== '' && form[key] !== null) {
                payload[key] = form[key];
            }
        });
        onSave(payload, editingConductor ? editingConductor.id : null);
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-pro">
                    <div>
                        <h3>{editingConductor ? 'Editar Conductor' : 'Registrar Nuevo Conductor'}</h3>
                        <p className="modal-subtitle">
                            {editingConductor ? 'Modifica los datos del conductor' : 'Completa la información del conductor'}
                        </p>
                    </div>
                    <button onClick={onClose} className="modal-close-pro" type="button">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    {apiError && (
                        <div className="modal-error-pro">
                            <span>⚠</span>
                            <span>{apiError}</span>
                        </div>
                    )}

                    <div className="modal-tabs">
                        <button type="button" className={`tab-button ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
                            👤 Datos Personales
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'licencia' ? 'active' : ''}`} onClick={() => setActiveTab('licencia')}>
                            🪪 Licencia
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'contacto' ? 'active' : ''}`} onClick={() => setActiveTab('contacto')}>
                            📞 Contacto
                        </button>
                        <button type="button" className={`tab-button ${activeTab === 'adicional' ? 'active' : ''}`} onClick={() => setActiveTab('adicional')}>
                            📝 Adicional
                        </button>
                    </div>

                    <div className="modal-body-pro">
                        {activeTab === 'personal' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Información Personal</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Nombre <span className="required-star">*</span></label>
                                            <input 
                                                name="nombre" 
                                                value={form.nombre} 
                                                onChange={handleChange} 
                                                placeholder="Ej: JUAN" 
                                                required 
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Apellido <span className="required-star">*</span></label>
                                            <input 
                                                name="apellido" 
                                                value={form.apellido} 
                                                onChange={handleChange} 
                                                placeholder="Ej: PÉREZ" 
                                                required 
                                            />
                                        </div>
                                    </div>
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>RUT <span className="required-star">*</span></label>
                                            <input 
                                                name="rut" 
                                                value={form.rut} 
                                                onChange={handleChange} 
                                                placeholder="Ej: 12345678-9" 
                                                required 
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fecha de Nacimiento</label>
                                            <input 
                                                name="fecha_nacimiento" 
                                                type="date" 
                                                value={form.fecha_nacimiento} 
                                                onChange={handleChange} 
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fecha de Ingreso</label>
                                            <input 
                                                name="fecha_ingreso" 
                                                type="date" 
                                                value={form.fecha_ingreso} 
                                                onChange={handleChange} 
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Estado</label>
                                        <select name="estado" value={form.estado} onChange={handleChange}>
                                            <option value="ACTIVO">ACTIVO</option>
                                            <option value="INACTIVO">INACTIVO</option>
                                            <option value="LICENCIA_MEDICA">LICENCIA MÉDICA</option>
                                            <option value="VACACIONES">VACACIONES</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'licencia' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Información de Licencia de Conducir</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Número de Licencia</label>
                                            <input 
                                                name="licencia_numero" 
                                                value={form.licencia_numero} 
                                                onChange={handleChange} 
                                                placeholder="Ej: 123456789" 
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Tipo de Licencia</label>
                                            <select name="licencia_tipo" value={form.licencia_tipo} onChange={handleChange}>
                                                <option value="">Seleccionar tipo</option>
                                                <option value="A1">CLASE A1 - Motocicletas pequeñas</option>
                                                <option value="A2">CLASE A2 - Motocicletas</option>
                                                <option value="A3">CLASE A3 - Motos de alta cilindrada</option>
                                                <option value="A4">CLASE A4 - Motos con sidecar</option>
                                                <option value="A5">CLASE A5 - Buses articulados</option>
                                                <option value="B">CLASE B - Vehículos livianos</option>
                                                <option value="C">CLASE C - Vehículos de carga</option>
                                                <option value="D">CLASE D - Transporte de pasajeros</option>
                                                <option value="E">CLASE E - Tractocamiones</option>
                                                <option value="F">CLASE F - Maquinaria especial</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Fecha de Vencimiento</label>
                                        <input 
                                            name="licencia_vencimiento" 
                                            type="date" 
                                            value={form.licencia_vencimiento} 
                                            onChange={handleChange} 
                                        />
                                        {form.licencia_vencimiento && (
                                            <small className="input-hint-pro">
                                                {(() => {
                                                    const vencimiento = new Date(form.licencia_vencimiento);
                                                    const hoy = new Date();
                                                    const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
                                                    if (diasRestantes < 0) return `⚠️ Licencia vencida hace ${Math.abs(diasRestantes)} días`;
                                                    if (diasRestantes <= 30) return `⚠️ Vence en ${diasRestantes} días`;
                                                    return `✓ Válida por ${diasRestantes} días`;
                                                })()}
                                            </small>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'contacto' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Información de Contacto</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Teléfono</label>
                                            <input 
                                                name="telefono" 
                                                type="tel" 
                                                value={form.telefono} 
                                                onChange={handleChange} 
                                                placeholder="Ej: +56912345678" 
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Email</label>
                                            <input 
                                                name="email" 
                                                type="email" 
                                                value={form.email} 
                                                onChange={handleChange} 
                                                placeholder="Ej: conductor@ejemplo.com" 
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group-pro">
                                        <label>Dirección</label>
                                        <input 
                                            name="direccion" 
                                            value={form.direccion} 
                                            onChange={handleChange} 
                                            placeholder="Ej: CALLE PRINCIPAL 123, COMUNA" 
                                        />
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
                                        <textarea 
                                            name="observaciones" 
                                            value={form.observaciones} 
                                            onChange={handleChange} 
                                            rows="8" 
                                            placeholder="Agrega notas, restricciones, certificaciones especiales o cualquier información relevante sobre el conductor..."
                                            className="textarea-pro"
                                        ></textarea>
                                        <small className="input-hint-pro">
                                            {form.observaciones?.length || 0} caracteres
                                        </small>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="modal-footer-pro">
                        <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                            {submitting ? '⏳ Guardando...' : (editingConductor ? '💾 Actualizar' : '➕ Crear Conductor')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MODAL DE CONFIRMACIÓN ---
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
function Conductores({ user, token }) {
    const [conductores, setConductores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingConductor, setEditingConductor] = useState(null);
    const [deletingConductor, setDeletingConductor] = useState(null);
    const [formError, setFormError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const debouncedSearch = useDebounce(searchQuery, 500);

    const canWrite = useMemo(() => 
        ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), 
        [user?.cargo]
    );
    
    const isAdmin = useMemo(() => 
        (user?.cargo || '').toLowerCase() === 'administrador', 
        [user?.cargo]
    );

    const fetchConductores = useCallback(async () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);

        try {
            const res = await apiFetch(`/api/conductores/?${params.toString()}`);
            if (res.status === 200) {
                setConductores(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else {
                setError(res.data?.message || 'Error cargando conductores');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, meta.per_page]);

    useEffect(() => {
        if (token) {
            fetchConductores();
        }
    }, [token, fetchConductores]);

    const handleFormSubmit = async (formData, conductorId) => {
        setSubmitting(true);
        setFormError(null);
        const url = conductorId ? `/api/conductores/${conductorId}` : '/api/conductores/';
        const method = conductorId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });
            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchConductores();
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
        if (!deletingConductor) return;
        setSubmitting(true);
        try {
            const res = await apiFetch(`/api/conductores/${deletingConductor.id}`, { method: 'DELETE' });
            if (res && res.status === 200) {
                setDeletingConductor(null);
                fetchConductores();
            } else {
                setError(res.data?.message || 'No se pudo eliminar');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= meta.pages) {
            setPage(newPage);
        }
    };

    const getEstadoBadgeClass = (estado) => {
        const estadoLower = (estado || '').toLowerCase();
        if (estadoLower === 'activo') return 'badge-estado-activo';
        if (estadoLower === 'inactivo') return 'badge-estado-inactivo';
        if (estadoLower === 'licencia_medica' || estadoLower === 'licencia medica') return 'badge-estado-licencia';
        if (estadoLower === 'vacaciones') return 'badge-estado-vacaciones';
        return 'badge-estado-otro';
    };

    const getLicenciaStatus = (vencimiento) => {
        if (!vencimiento) return { text: '-', class: '' };
        const vencimientoDate = new Date(vencimiento);
        const hoy = new Date();
        const diasRestantes = Math.ceil((vencimientoDate - hoy) / (1000 * 60 * 60 * 24));
        
        if (diasRestantes < 0) return { text: `Vencida`, class: 'badge-licencia-vencida' };
        if (diasRestantes <= 30) return { text: `${diasRestantes}d`, class: 'badge-licencia-proxima' };
        return { text: vencimientoDate.toLocaleDateString('es-CL'), class: 'badge-licencia-vigente' };
    };

    if (!token) {
        return <div className="loading-state">⏳ Cargando...</div>;
    }

    return (
        <div className="conductores-container">
            <div className="conductores-header">
                <div>
                    <h2>👤 Conductores</h2>
                    <p className="header-subtitle">Gestión y administración de conductores de la flota</p>
                </div>
                {canWrite && (
                    <button 
                        onClick={() => { setEditingConductor(null); setFormError(null); setShowModal(true); }}
                        className="btn btn-primary"
                    >
                        ➕ Nuevo Conductor
                    </button>
                )}
            </div>

            <div className="search-container-pro">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input
                        type="text"
                        className="search-input-pro"
                        placeholder="Buscar por nombre, apellido, RUT o licencia..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {error && (
                <div className="alert-error-pro">
                    <span>⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            {loading && <div className="loading-state">⏳ Cargando conductores...</div>}

            {!loading && conductores.length === 0 && (
                <div className="empty-state-pro">
                    <span className="empty-icon-pro">👤</span>
                    <p>No se encontraron conductores</p>
                    {debouncedSearch && <small>Intenta con otros términos de búsqueda</small>}
                </div>
            )}

            {!loading && conductores.length > 0 && (
                <>
                    <div className="table-container">
                        <table className="conductores-table">
                            <thead>
                                <tr>
                                    <th>Conductor</th>
                                    <th>RUT</th>
                                    <th>Licencia</th>
                                    <th>Vencimiento</th>
                                    <th>Contacto</th>
                                    <th>Estado</th>
                                    {canWrite && <th>Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {conductores.map(conductor => {
                                    const licenciaStatus = getLicenciaStatus(conductor.licencia_vencimiento);
                                    return (
                                        <tr key={conductor.id}>
                                            <td>
                                                <div className="conductor-name-cell">
                                                    <strong>{conductor.nombre} {conductor.apellido}</strong>
                                                    {conductor.email && <small>{conductor.email}</small>}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge-rut">{conductor.rut}</span>
                                            </td>
                                            <td>
                                                {conductor.licencia_numero ? (
                                                    <div className="licencia-info">
                                                        <span className="licencia-numero">{conductor.licencia_numero}</span>
                                                        {conductor.licencia_tipo && (
                                                            <span className="badge-licencia-tipo">{conductor.licencia_tipo}</span>
                                                        )}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                {licenciaStatus.text !== '-' ? (
                                                    <span className={`badge-licencia ${licenciaStatus.class}`}>
                                                        {licenciaStatus.text}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                {conductor.telefono ? (
                                                    <a href={`tel:${conductor.telefono}`} className="contact-link">
                                                        📞 {conductor.telefono}
                                                    </a>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                <span className={`badge-estado ${getEstadoBadgeClass(conductor.estado)}`}>
                                                    {conductor.estado || 'ACTIVO'}
                                                </span>
                                            </td>
                                            {canWrite && (
                                                <td>
                                                    <div className="action-buttons-pro">
                                                        <button 
                                                            onClick={() => { setEditingConductor(conductor); setFormError(null); setShowModal(true); }}
                                                            className="btn-icon-pro btn-edit-pro"
                                                            title="Editar conductor"
                                                        >
                                                            ✏️
                                                        </button>
                                                        {isAdmin && (
                                                            <button 
                                                                onClick={() => setDeletingConductor(conductor)}
                                                                className="btn-icon-pro btn-delete-pro"
                                                                title="Eliminar conductor"
                                                            >
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
                    </div>

                    <Pagination meta={meta} onPageChange={handlePageChange} />
                </>
            )}

            <ConductorFormModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleFormSubmit}
                editingConductor={editingConductor}
                apiError={formError}
                submitting={submitting}
            />

            <ConfirmationModal
                isOpen={!!deletingConductor}
                onClose={() => setDeletingConductor(null)}
                onConfirm={handleConfirmDelete}
                title="Eliminar Conductor"
                message={`¿Estás seguro de eliminar al conductor ${deletingConductor?.nombre} ${deletingConductor?.apellido}? Esta acción no se puede deshacer.`}
                submitting={submitting}
            />
        </div>
    );
}

export default Conductores;
