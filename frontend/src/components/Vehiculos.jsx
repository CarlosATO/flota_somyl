import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api'
import './Vehiculos.css'

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

const VehiculoFormModal = ({ isOpen, onClose, onSave, editingVehicle, apiError, submitting }) => {
    const [form, setForm] = useState({});
    const requiredFields = ['placa', 'marca', 'modelo', 'ano', 'tipo'];
    
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
        } else {
            setForm({ placa: '', marca: '', modelo: '', ano: '', tipo: '', color: '', vin: '', 
                     capacidad_pasajeros: '', capacidad_kg: '', numero_chasis: '', observaciones: '' });
        }
    }, [editingVehicle, isOpen]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setForm({ ...form, [name]: type === 'number' ? (value ? parseInt(value, 10) : '') : value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== '' && form[key] !== null) payload[key] = form[key];
        });
        onSave(payload, editingVehicle ? editingVehicle.id : null);
    };

    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>{editingVehicle ? 'Editar Vehículo' : 'Crear Nuevo Vehículo'}</h3>
                    <button onClick={onClose} className="modal-close">×</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {apiError && <div className="form-error">{apiError}</div>}
                        
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Placa <span>*</span></label>
                                <input name="placa" value={form.placa} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>Marca <span>*</span></label>
                                <input name="marca" value={form.marca} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>Modelo <span>*</span></label>
                                <input name="modelo" value={form.modelo} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>Año <span>*</span></label>
                                <input name="ano" type="number" value={form.ano} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>Tipo <span>*</span></label>
                                <input name="tipo" value={form.tipo} onChange={handleChange} required />
                            </div>
                            <div className="form-group">
                                <label>Color</label>
                                <input name="color" value={form.color} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>VIN (N° Serie)</label>
                                <input name="vin" value={form.vin} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>N° Chasis</label>
                                <input name="numero_chasis" value={form.numero_chasis} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Cap. Pasajeros</label>
                                <input name="capacidad_pasajeros" type="number" value={form.capacidad_pasajeros} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Cap. Carga (Kg)</label>
                                <input name="capacidad_kg" type="number" value={form.capacidad_kg} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Observaciones</label>
                            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows="3"></textarea>
                        </div>
                    </div>
                    
                    <div className="form-actions">
                        <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
                        <button type="submit" disabled={isFormInvalid || submitting} className="btn btn-primary">
                            {submitting ? 'Guardando...' : 'Guardar'}
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
        <div className="modal-overlay">
            <div className="modal-content modal-small">
                <div className="modal-header">
                    <h3>{title}</h3>
                </div>
                <div className="modal-body">
                    <p>{message}</p>
                </div>
                <div className="form-actions">
                    <button onClick={onClose} disabled={submitting} className="btn btn-secondary">Cancelar</button>
                    <button onClick={onConfirm} disabled={submitting} className="btn btn-primary">
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

    // CRÍTICO: Solo hacer fetch cuando el token esté disponible
    useEffect(() => {
        if (token) {
            console.log('✅ Token disponible en Vehiculos, haciendo fetch...');
            fetchVehiculos();
        } else {
            console.warn('⚠️ Esperando token en Vehiculos...');
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

    // Mostrar loading mientras espera el token
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
                <h2>Gestión de Vehículos</h2>
                {canWrite && (
                    <button onClick={() => { setEditingVehicle(null); setFormError(null); setShowModal(true); }} className="btn btn-primary">
                        + Crear Vehículo
                    </button>
                )}
            </div>

            <div className="form-container">
                <input type="search" placeholder="Buscar por placa, marca, modelo..." value={searchQuery} 
                       onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
            </div>

            {error && <div className="list-error">{error}</div>}

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
                                    <td>{v.placa}</td>
                                    <td>{v.marca}</td>
                                    <td>{v.modelo}</td>
                                    <td>{v.ano}</td>
                                    <td>{v.tipo}</td>
                                    {(canWrite || isAdmin) && (
                                        <td>
                                            {canWrite && (
                                                <button onClick={() => { setEditingVehicle(v); setFormError(null); setShowModal(true); }} 
                                                        className="btn btn-secondary" style={{marginRight: '8px'}}>
                                                    Editar
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button onClick={() => setDeletingVehicle(v)} className="btn btn-secondary">
                                                    Eliminar
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {vehiculos.length === 0 && !loading && (
                    <div className="loading-state">No se encontraron vehículos</div>
                )}
            </div>

            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            <VehiculoFormModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleFormSubmit} 
                               editingVehicle={editingVehicle} apiError={formError} submitting={submitting} />

            <ConfirmationModal isOpen={!!deletingVehicle} onClose={() => setDeletingVehicle(null)} 
                               onConfirm={handleConfirmDelete} title="Confirmar Eliminación"
                               message={`¿Eliminar vehículo ${deletingVehicle?.placa}?`} submitting={submitting} />
        </div>
    );
}

export default Vehiculos;