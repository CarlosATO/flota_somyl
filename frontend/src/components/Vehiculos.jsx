import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Use the shared apiFetch so Authorization headers are attached
import { apiFetch } from '../lib/api'
import './Vehiculos.css'

// Usaremos iconos para un look profesional. 
// Necesitarás instalar lucide-react: npm install lucide-react
import { Search, Plus, Edit, Trash2, X, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// (removed local apiFetch; using shared one imported above)


// The component now receives `user` as a prop from App (logged-in user)

/**
 * Hook (custom) para "rebotar" (debounce) un valor.
 * Útil para no saturar la API con búsquedas en cada tecleo.
 */
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};

/**
 * Componente de Paginación reutilizable.
 */
const Pagination = ({ meta, onPageChange }) => {
    if (!meta || meta.pages <= 1) return null;

    return (
        <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-700">
                Página <span className="font-semibold">{meta.page}</span> de <span className="font-semibold">{meta.pages}</span> (Total: {meta.total})
            </span>
            <div className="flex space-x-2">
                <button
                    onClick={() => onPageChange(meta.page - 1)}
                    disabled={meta.page <= 1}
                    className="flex items-center px-3 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={16} className="mr-1" />
                    Anterior
                </button>
                <button
                    onClick={() => onPageChange(meta.page + 1)}
                    disabled={meta.page >= meta.pages}
                    className="flex items-center px-3 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Siguiente
                    <ChevronRight size={16} className="ml-1" />
                </button>
            </div>
        </div>
    );
};

/**
 * Modal de Formulario para Crear y Editar Vehículos.
 */
const VehiculoFormModal = ({ isOpen, onClose, onSave, editingVehicle, apiError, submitting }) => {
    const [form, setForm] = useState({});

    // Campos requeridos que definimos en el backend
    const requiredFields = ['placa', 'marca', 'modelo', 'ano', 'tipo'];
    
    // Sincroniza el estado del formulario cuando 'editingVehicle' cambia
    useEffect(() => {
        if (editingVehicle) {
            // Editando: llenar el formulario con datos existentes
            setForm({
                placa: editingVehicle.placa || '',
                marca: editingVehicle.marca || '',
                modelo: editingVehicle.modelo || '',
                ano: editingVehicle.ano || '',
                tipo: editingVehicle.tipo || '',
                color: editingVehicle.color || '',
                vin: editingVehicle.vin || '',
                capacidad_pasajeros: editingVehicle.capacidad_pasajeros || '',
                capacidad_kg: editingVehicle.capacidad_kg || '',
                numero_chasis: editingVehicle.numero_chasis || '',
                observaciones: editingVehicle.observaciones || '',
            });
        } else {
            // Creando: resetear el formulario
            setForm({
                placa: '', marca: '', modelo: '', ano: '', tipo: '', color: '',
                vin: '', capacidad_pasajeros: '', capacidad_kg: '', numero_chasis: '', observaciones: ''
            });
        }
    }, [editingVehicle, isOpen]); // Se resetea al abrir

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        // Manejo especial para números
        if (type === 'number') {
            setForm({ ...form, [name]: value ? parseInt(value, 10) : '' });
        } else {
            setForm({ ...form, [name]: value });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Limpiamos datos vacíos antes de enviar
        const payload = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== '' && form[key] !== null) {
                payload[key] = form[key];
            }
        });
        
        onSave(payload, editingVehicle ? editingVehicle.id : null);
    };

    // Validar si el formulario está listo para enviarse
    const isFormInvalid = requiredFields.some(field => !form[field]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-xl font-semibold">{editingVehicle ? 'Editar Vehículo' : 'Crear Nuevo Vehículo'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        {/* Mostrador de errores de la API (ej: Placa duplicada) */}
                        {apiError && (
                            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md">
                                {apiError}
                            </div>
                        )}
                        
                        {/* Grid de Formulario */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Campos Requeridos */}
                            <Input label="Placa" name="placa" value={form.placa} onChange={handleChange} required />
                            <Input label="Marca" name="marca" value={form.marca} onChange={handleChange} required />
                            <Input label="Modelo" name="modelo" value={form.modelo} onChange={handleChange} required />
                            <Input label="Año" name="ano" type="number" value={form.ano} onChange={handleChange} required />
                            <Input label="Tipo" name="tipo" value={form.tipo} onChange={handleChange} required />
                            <Input label="Color" name="color" value={form.color} onChange={handleChange} />
                            
                            {/* Campos Opcionales */}
                            <Input label="VIN (N° Serie)" name="vin" value={form.vin} onChange={handleChange} />
                            <Input label="N° Chasis" name="numero_chasis" value={form.numero_chasis} onChange={handleChange} />
                            <Input label="Cap. Pasajeros" name="capacidad_pasajeros" type="number" value={form.capacidad_pasajeros} onChange={handleChange} />
                            <Input label="Cap. Carga (Kg)" name="capacidad_kg" type="number" value={form.capacidad_kg} onChange={handleChange} />
                        </div>
                        {/* Observaciones (full-width) */}
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                            <textarea
                                name="observaciones"
                                value={form.observaciones}
                                onChange={handleChange}
                                rows="3"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            ></textarea>
                        </div>
                    </div>
                    
                    {/* Footer del Modal */}
                    <div className="flex items-center justify-end p-4 bg-gray-50 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 mr-3">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isFormInvalid || submitting}
                            className="flex items-center justify-center px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                            {submitting ? 'Guardando...' : 'Guardar Vehículo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/**
 * Componente de Input reutilizable para el formulario.
 */
const Input = ({ label, name, type = 'text', value, onChange, required = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            id={name}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
    </div>
);

/**
 * Modal de Confirmación Genérico (para Eliminar).
 */
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, submitting }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                            <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                        </div>
                        <div className="ml-4 text-left">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
                            <div className="mt-2">
                                <p className="text-sm text-gray-500">{message}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                        {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};


/**
 * Componente Principal: Panel de Vehículos
 */
function Vehiculos({ user }) {
    const [vehiculos, setVehiculos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null); // Error de listado
    const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    
    // Estados de UI
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null); // null = Crear, Objeto = Editar
    
    // Estados de borrado
    const [deletingVehicle, setDeletingVehicle] = useState(null); // Objeto
    
    // Estados de Formulario
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null); // Error de API en modal

    // Auth: `user` is passed as a prop from App. Guardar contra undefined.
    const canWrite = useMemo(() => ['administrador', 'dispatcher'].includes((user?.cargo || '').toLowerCase()), [user?.cargo]);
    const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo]);

    // Usamos el hook de debounce para la búsqueda
    const debouncedSearch = useDebounce(searchQuery, 500);

    // Función de Fetch (centralizada)
    const fetchVehiculos = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams({
            page: page,
            per_page: meta.per_page,
        });
        if (debouncedSearch) {
            params.append('search', debouncedSearch);
        }
        
        try {
            const res = await apiFetch(`/api/vehiculos?${params.toString()}`);
            
            if (res && res.status === 200) {
                setVehiculos(res.data.data || []);
                setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 });
            } else {
                setError(res.data?.message || 'Error cargando vehículos');
            }
        } catch (err) {
            setError('Error de conexión al cargar vehículos.');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, meta.per_page]);

    // Efecto principal para cargar datos
    useEffect(() => {
        fetchVehiculos();
    }, [fetchVehiculos]); // Se dispara cuando page o debouncedSearch cambian

    // --- Handlers de UI ---

    const handleOpenCreate = () => {
        setEditingVehicle(null);
        setFormError(null);
        setShowModal(true);
    };

    const handleOpenEdit = (vehiculo) => {
        setEditingVehicle(vehiculo);
        setFormError(null);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingVehicle(null); // Limpia por si acaso
    };

    const handleOpenDelete = (vehiculo) => {
        setDeletingVehicle(vehiculo);
    };

    const handleCloseDelete = () => {
        setDeletingVehicle(null);
    };

    // --- Handlers de API ---

    const handleFormSubmit = async (formData, vehiculoId) => {
        setSubmitting(true);
        setFormError(null);
        
        const url = vehiculoId ? `/api/vehiculos/${vehiculoId}` : '/api/vehiculos/';
        const method = vehiculoId ? 'PUT' : 'POST';

        try {
            const res = await apiFetch(url, { method, body: formData });

            if (res && (res.status === 200 || res.status === 201)) {
                setShowModal(false);
                fetchVehiculos(); // Recargar la lista
            } else {
                // Error de API (ej: 409 Placa duplicada)
                setFormError(res.data?.message || 'Error al guardar. Verifique los datos.');
            }
        } catch (err) {
            setFormError('Error de conexión. No se pudo guardar.');
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
                fetchVehiculos(); // Recargar lista
            } else {
                // Manejar error de borrado si se quisiera
                setDeletingVehicle(null);
                setError(res.data?.message || 'No se pudo eliminar el vehículo.');
            }
        } catch (err) {
            setError('Error de conexión al eliminar.');
        } finally {
            setSubmitting(false);
        }
    };


    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            {/* Cabecera */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">Gestión de Vehículos</h2>
                {canWrite && (
                    <button
                        onClick={handleOpenCreate}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        <Plus size={18} className="mr-2" />
                        Crear Vehículo
                    </button>
                )}
            </div>

            {/* Controles de Búsqueda y Filtros */}
            <div className="mb-4 bg-white p-4 rounded-lg shadow">
                <div className="relative">
                    <input
                        type="search"
                        placeholder="Buscar por placa, marca, modelo..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
            </div>

            {/* Mensaje de Error (Listado) */}
            {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md">
                    {error}
                </div>
            )}

            {/* Tabla de Vehículos */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {loading && vehiculos.length === 0 ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 size={32} className="animate-spin text-blue-600" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placa</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marca</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Año</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                    {(canWrite || isAdmin) && (
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {vehiculos.map(v => (
                                    <tr key={v.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{v.placa}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.marca}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.modelo}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.ano}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.tipo}</td>
                                        {(canWrite || isAdmin) && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                                {canWrite && (
                                                    <button onClick={() => handleOpenEdit(v)} className="text-blue-600 hover:text-blue-900" title="Editar">
                                                        <Edit size={18} />
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button onClick={() => handleOpenDelete(v)} className="text-red-600 hover:text-red-900" title="Eliminar">
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {vehiculos.length === 0 && !loading && (
                            <div className="p-4 text-center text-gray-500">
                                No se encontraron vehículos. {searchQuery && "Intente ajustar su búsqueda."}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Paginación */}
            <Pagination meta={meta} onPageChange={(newPage) => setPage(newPage)} />

            {/* --- Modales --- */}
            
            {/* Modal de Formulario (Crear/Editar) */}
            <VehiculoFormModal
                isOpen={showModal}
                onClose={handleCloseModal}
                onSave={handleFormSubmit}
                editingVehicle={editingVehicle}
                apiError={formError}
                submitting={submitting}
            />

            {/* Modal de Confirmación (Eliminar) */}
            <ConfirmationModal
                isOpen={!!deletingVehicle}
                onClose={handleCloseDelete}
                onConfirm={handleConfirmDelete}
                title="Confirmar Eliminación"
                message={`¿Está seguro de que desea eliminar el vehículo ${deletingVehicle?.placa} (${deletingVehicle?.marca} ${deletingVehicle?.modelo})? Esta acción es un 'soft-delete' y puede ser revertida por un administrador.`}
                submitting={submitting}
            />
        </div>
    );
}

export default Vehiculos;