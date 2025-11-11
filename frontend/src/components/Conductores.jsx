import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api'
import './Conductores.css'

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

const ConductorFormModal = ({ isOpen, onClose, onSave, editingConductor, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('basico');
    const requiredFields = ['nombre', 'apellido', 'rut'];
    
    useEffect(() => {
        if (editingConductor) {
            setForm({
                nombre: editingConductor.nombre || '', 
                apellido: editingConductor.apellido || '',
                rut: editingConductor.rut || '', 
                licencia_numero: editingConductor.licencia_numero || '',
                licencia_tipo: editingConductor.licencia_tipo || '', 
                licencia_vencimiento: editingConductor.licencia_vencimiento || '',
                telefono: editingConductor.telefono || '', 
                email: editingConductor.email || '',
                estado: editingConductor.estado || 'activo',
                observaciones: editingConductor.observaciones || '',
            });
        } else {
            setForm({ 
                nombre: '', apellido: '', rut: '', licencia_numero: '', licencia_tipo: '', 
                licencia_vencimiento: '', telefono: '', email: '', estado: 'activo', observaciones: '' 
            });
        }
        setActiveTab('basico');
    }, [editingConductor, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;
        
        // Convertir a mayúsculas campos de texto (excepto email, teléfono, observaciones, fechas y estado)
        if (
            type !== 'date' &&
            type !== 'email' &&
            type !== 'tel' &&
            name !== 'observaciones' &&
            name !== 'email' &&
            name !== 'telefono' &&
            name !== 'estado' && // ← AGREGAR ESTA LÍNEA
            typeof value === 'string'
        ) {
            finalValue = value.toUpperCase();
        }
        
        setForm({ ...form, [name]: finalValue });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = {};
        Object.keys(form).forEach(key => {
            const value = form[key];
            // Solo agregar campos con valores válidos
            if (value !== '' && value !== null && value !== undefined) {
                payload[key] = value;
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
                            <span className="error-icon-pro">⚠</span>
                            <span>{apiError}</span>
                        </div>
                    )}

                    <div className="modal-tabs">
                        <button 
                            type="button"
                            className={`tab-button ${activeTab === 'basico' ? 'active' : ''}`}
                            onClick={() => setActiveTab('basico')}
                        >
                            👤 Datos Personales
                        </button>
                        <button 
                            type="button"
                            className={`tab-button ${activeTab === 'licencia' ? 'active' : ''}`}
                            onClick={() => setActiveTab('licencia')}
                        >
                            🪪 Licencia de Conducir
                        </button>
                        <button 
                            type="button"
                            className={`tab-button ${activeTab === 'adicional' ? 'active' : ''}`}
                            onClick={() => setActiveTab('adicional')}
                        >
                            📞 Contacto y Observaciones
                        </button>
                    </div>

                    <div className="modal-body-pro">
                        {activeTab === 'basico' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Identificación</h4>
                                    <div className="form-grid-3">
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
                                        <div className="form-group-pro">
                                            <label>RUT <span className="required-star">*</span></label>
                                            <input 
                                                name="rut" 
                                                value={form.rut} 
                                                onChange={handleChange} 
                                                placeholder="Ej: 12345678-9"
                                                required 
                                            />
                                            <small className="input-hint-pro">Formato: 12345678-9</small>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Estado Laboral</h4>
                                    <div className="form-grid-2">
                                        <div className="form-group-pro">
                                            <label>Estado <span className="required-star">*</span></label>
                                            <select 
                                                name="estado" 
                                                value={form.estado} 
                                                onChange={handleChange} 
                                                required
                                            >
                                                <option value="activo">ACTIVO</option>
                                                <option value="inactivo">INACTIVO</option>
                                                <option value="vacaciones">VACACIONES</option>
                                                <option value="licencia">LICENCIA MÉDICA</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            <div className="tab-actions">
                                <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                                    {submitting ? '⏳ Guardando...' : (editingConductor ? '💾 Actualizar' : '➕ Crear Conductor')}
                                </button>
                            </div>
                        </div>
                    )}

                        {activeTab === 'licencia' && (
                            <div className="tab-content">
                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Información de Licencia</h4>
                                    <div className="form-grid-3">
                                        <div className="form-group-pro">
                                            <label>Número de Licencia</label>
                                            <input 
                                                name="licencia_numero" 
                                                value={form.licencia_numero} 
                                                onChange={handleChange} 
                                                placeholder="Ej: 12345678"
                                            />
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Tipo de Licencia</label>
                                            <select 
                                                name="licencia_tipo" 
                                                value={form.licencia_tipo} 
                                                onChange={handleChange}
                                            >
                                                <option value="">Seleccionar tipo</option>
                                                <option value="A1">A1 - Motos hasta 125cc</option>
                                                <option value="A2">A2 - Motos hasta 400cc</option>
                                                <option value="A3">A3 - Motos sin límite</option>
                                                <option value="B">B - Automóviles</option>
                                                <option value="C">C - Camiones</option>
                                                <option value="D">D - Transporte Público</option>
                                                <option value="E">E - Transporte Carga</option>
                                            </select>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Fecha de Vencimiento</label>
                                            <input 
                                                name="licencia_vencimiento" 
                                                type="date" 
                                                value={form.licencia_vencimiento} 
                                                onChange={handleChange} 
                                            />
                                            <small className="input-hint-pro">Fecha de expiración de la licencia</small>
                                        </div>
                                    </div>
                                </div>
                            <div className="tab-actions">
                                <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                                    {submitting ? '⏳ Guardando...' : (editingConductor ? '💾 Actualizar' : '➕ Crear Conductor')}
                                </button>
                            </div>
                        </div>
                    )}

                        {activeTab === 'adicional' && (
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
                                            <small className="input-hint-pro">Incluye código de país</small>
                                        </div>
                                        <div className="form-group-pro">
                                            <label>Email</label>
                                            <input 
                                                name="email" 
                                                type="email" 
                                                value={form.email} 
                                                onChange={handleChange} 
                                                placeholder="ejemplo@email.com"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section-pro">
                                    <h4 className="section-title-pro">Notas y Observaciones</h4>
                                    <div className="form-group-pro">
                                        <label>Observaciones</label>
                                        <textarea 
                                            name="observaciones" 
                                            value={form.observaciones} 
                                            onChange={handleChange} 
                                            rows="8"
                                            placeholder="Agrega notas, restricciones médicas, preferencias de turno o cualquier información relevante..."
                                            className="textarea-pro"
                                        ></textarea>
                                        <small className="input-hint-pro">
                                            {form.observaciones?.length || 0} caracteres
                                        </small>
                                    </div>
                                </div>
                            <div className="tab-actions">
                                <button type="button" onClick={onClose} className="btn btn-secondary-pro" disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary-pro">
                                    {submitting ? '⏳ Guardando...' : (editingConductor ? '💾 Actualizar' : '➕ Crear Conductor')}
                                </button>
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
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);
    const debouncedSearch = useDebounce(searchQuery, 500);

    const fetchConductores = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page, per_page: meta.per_page });
        if (debouncedSearch) params.append('search', debouncedSearch);
        
        try {
            const res = await apiFetch(`/api/conductores/?${params.toString()}`);
            if (res && res.status === 200) {
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

    const getEstadoBadge = (estado) => {
        const badges = {
            'activo': 'badge-estado-activo',
            'inactivo': 'badge-estado-inactivo',
            'vacaciones': 'badge-estado-vacaciones',
            'licencia': 'badge-estado-licencia'
        };
        return badges[estado] || 'badge-estado-default';
    };

    if (!token) {
        return (
            <div className="conductores-container">
                <div className="loading-state">Cargando módulo de conductores...</div>
            </div>
        );
    }

    return (
        <div className="conductores-container">
            <div className="conductores-header">
                <div>
                    <h2>Gestión de Conductores</h2>
                    <p className="header-subtitle">Administra el personal de conductores de la empresa</p>
                </div>
                {canWrite && (
                    <button onClick={() => { setEditingConductor(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">
                        ➕ Nuevo Conductor
                    </button>
                )}
            </div>

            <div className="search-container-pro">
                <div className="search-wrapper-pro">
                    <span className="search-icon-pro">🔍</span>
                    <input 
                        type="search" 
                        placeholder="Buscar por nombre, apellido, RUT o email..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="search-input-pro" 
                    />
                </div>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            <div className="table-container">
                {loading && conductores.length === 0 ? (
                    <div className="loading-state">Cargando conductores...</div>
                ) : (
                    <table className="conductores-table">
                        <thead>
                            <tr>
                                <th>Nombre Completo</th>
                                <th>RUT</th>
                                <th>Licencia</th>
                                <th>Teléfono</th>
                                <th>Email</th>
                                <th>Estado</th>
                                {(canWrite || isAdmin) && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {conductores.map(c => (
                                <tr key={c.id}>
                                    <td className="font-bold" style={{whiteSpace: 'nowrap'}}>{c.nombre} {c.apellido}</td>
                                    <td><span className="badge-rut">{c.rut}</span></td>
                                    <td>{c.licencia_tipo || '-'}</td>
                                    <td>{c.telefono || '-'}</td>
                                    <td>{c.email || '-'}</td>
                                    <td><span className={getEstadoBadge(c.estado)}>{c.estado.toUpperCase()}</span></td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            <div className="action-buttons-pro">
                                                {canWrite && (
                                                    <button 
                                                        onClick={() => { setEditingConductor(c); setFormError(null); setShowModal(true); }} 
                                                        className="btn-icon-pro btn-edit-pro"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => setDeletingConductor(c)} 
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
                {conductores.length === 0 && !loading && (
                    <div className="empty-state-pro">
                        <span className="empty-icon-pro">👥</span>
                        <p>No se encontraron conductores</p>
                    </div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

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
                title="Confirmar Eliminación"
                message={`¿Estás seguro de eliminar al conductor ${deletingConductor?.nombre} ${deletingConductor?.apellido}? Esta acción no se puede deshacer.`} 
                submitting={submitting} 
            />
        </div>
    );
}

export default Conductores;