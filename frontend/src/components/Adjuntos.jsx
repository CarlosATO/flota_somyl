import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Adjuntos.css';

// NOTA: Para no crear un archivo utils adicional, incluyo el helper aquí.
const useDebounceLocal = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};


const formatLocalDate = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    } catch (e) { return dateString; }
};

const getPublicUrl = (storagePath) => {
    // El bucket de Supabase es 'adjuntos_ordenes'
    try {
        const { data } = supabase.storage.from('adjuntos_ordenes').getPublicUrl(storagePath);
        return data.publicUrl;
    } catch (e) { return '#'; }
};


function Adjuntos({ token }) {
    const [adjuntos, setAdjuntos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounceLocal(searchQuery, 500);

    const fetchAdjuntos = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams();
        if (debouncedSearch) params.append('search', debouncedSearch);
        
        try {
            const res = await apiFetch(`/api/adjuntos/?${params.toString()}`);
            
            if (res && res.status === 200) {
                setAdjuntos(res.data.data || []);
            } else { 
                setError(res.data?.message || 'Error cargando adjuntos'); 
            }
        } catch (err) { 
            setError('Error de conexión'); 
        } finally { 
            setLoading(false); 
        }
    }, [debouncedSearch]);

    useEffect(() => {
        if (token) { fetchAdjuntos(); }
    }, [token, fetchAdjuntos]);
    
    const getFileTypeIcon = (mime) => {
        if (!mime) return '📎';
        if (mime.includes('image')) return '🖼️';
        if (mime.includes('pdf')) return 'PDF';
        if (mime.includes('zip') || mime.includes('rar')) return '📦';
        return '📄';
    };

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAdjunto, setModalAdjunto] = useState(null);
    const [modalUrl, setModalUrl] = useState('#');
    const [previewLoading, setPreviewLoading] = useState(false);

    const openModal = async (adj) => {
        setModalAdjunto(adj);
        setPreviewLoading(true);
        try {
            const url = getPublicUrl(adj.storage_path);
            setModalUrl(url || '#');
            setModalOpen(true);
        } catch (e) {
            setModalUrl('#');
        } finally {
            setPreviewLoading(false);
        }
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalAdjunto(null);
        setModalUrl('#');
    };

    // Close on ESC
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && modalOpen) closeModal();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modalOpen]);

    const downloadAdjunto = (adj) => {
        const url = getPublicUrl(adj.storage_path);
        // Create a temporary anchor to trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = adj.nombre_archivo || '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="adjuntos-container-main">
            <div className="adjuntos-header">
                <div>
                    <h2>📷 Consulta Documentos y Archivos</h2>
                    <p className="header-subtitle">Búsqueda centralizada de fotos y documentos subidos a Órdenes de Servicio y Mantenimiento.</p>
                </div>
            </div>

            <div className="search-container-pro">
                <div className="search-wrapper-pro" style={{maxWidth: '600px'}}>
                    <span className="search-icon-pro">🔍</span>
                    <input 
                        type="search" 
                        placeholder="Buscar por Patente, ID de Orden/Mant. o nombre de archivo..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="search-input-pro" 
                    />
                </div>
            </div>

            {error && <div className="alert-error-pro">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-state">Buscando archivos...</div>
            ) : adjuntos.length === 0 ? (
                <div className="empty-state-pro">
                    <span className="empty-icon-pro">📂</span>
                    <p>No se encontraron archivos adjuntos.</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="adjuntos-table">
                        <thead>
                            <tr>
                                <th>ID Adjunto</th>
                                <th>Fecha de Subida</th>
                                <th>Tipo</th>
                                <th>Entidad</th>
                                <th>ID Entidad</th>
                                <th>Patente</th>
                                <th>Nombre de Archivo</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adjuntos.map(adj => (
                                <tr key={adj.id}>
                                    <td className="font-bold">#{adj.id}</td>
                                    <td>{formatLocalDate(adj.created_at)}</td>
                                    <td>
                                        <span className={`badge-adjunto badge-adjunto-${adj.mime_type?.includes('image') ? 'image' : 'doc'}`}>
                                            {getFileTypeIcon(adj.mime_type)} {adj.mime_type?.split('/').pop()}
                                        </span>
                                    </td>
                                    <td>{adj.tipo_entidad}</td>
                                    <td className="font-bold">#{adj.entidad_id}</td>
                                    <td>
                                        <span className="badge-placa" style={{backgroundColor: '#e0e7ff', color: '#3730a3', padding: '0.3rem 0.5rem', borderRadius: '4px', fontWeight: '600'}}>{adj.placa || '-'}</span>
                                    </td>
                                    <td className="adjunto-name-cell" title={adj.nombre_archivo}>
                                        {adj.nombre_archivo}
                                    </td>
                                    <td>
                                                                                                                        <div style={{display: 'flex', gap: '0.5rem'}}>
                                                                                                                            <button
                                                                                                                                onClick={() => openModal(adj)}
                                                                                                                                className="btn btn-primary btn-icon"
                                                                                                                                style={{padding: '0.45rem 0.9rem', fontSize: '0.9rem', background: '#2563eb', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer'}}
                                                                                                                            >
                                                                                                                                👁️ Ver
                                                                                                                            </button>
                                                                                                                            <button
                                                                                                                                onClick={() => window.open(`/api/adjuntos/download?path=${encodeURIComponent(adj.storage_path)}&name=${encodeURIComponent(adj.nombre_archivo || '')}`, '_self')}
                                                                                                                                className="btn btn-secondary btn-icon"
                                                                                                                                style={{padding: '0.35rem 0.8rem', fontSize: '0.85rem', background: '#e6eefc', color: '#2563eb', borderRadius: '6px', border: '1px solid #cfe0ff', cursor: 'pointer'}}
                                                                                                                            >
                                                                                                                                ⬇️ Descargar
                                                                                                                            </button>
                                                                                                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

                        {/* Modal para vista previa */}
                        {modalOpen && modalAdjunto && (
                                <div className="adjuntos-modal-overlay" onClick={(e) => { if (e.target.classList.contains('adjuntos-modal-overlay')) closeModal(); }}>
                                    <div className="adjuntos-modal">
                                        <div className="adjuntos-modal-header">
                                            <div>
                                                <strong>{modalAdjunto.nombre_archivo}</strong>
                                                <div style={{fontSize: '0.85rem', color: '#6b7280'}}>{modalAdjunto.tipo_entidad} • {modalAdjunto.placa || '-'}</div>
                                            </div>
                                            <div style={{display: 'flex', gap: '0.5rem'}}>
                                                <button onClick={() => downloadAdjunto(modalAdjunto)} className="modal-download-btn">⬇️ Descargar</button>
                                                <button onClick={closeModal} className="modal-close-btn">Cerrar ✖</button>
                                            </div>
                                        </div>
                                        <div className="adjuntos-modal-body">
                                            {previewLoading ? (
                                                <div className="loading-state">Cargando vista previa...</div>
                                            ) : (
                                                (() => {
                                                    const mime = modalAdjunto.mime_type || '';
                                                    if (mime.includes('image')) {
                                                        return <img src={modalUrl} alt={modalAdjunto.nombre_archivo} className="adjuntos-modal-image" />;
                                                    }
                                                    if (mime.includes('pdf')) {
                                                        return <iframe title={modalAdjunto.nombre_archivo} src={modalUrl} className="adjuntos-modal-iframe" />;
                                                    }
                                                    // Para otros tipos, mostrar icono y link de descarga
                                                    return (
                                                        <div style={{textAlign: 'center', padding: '2rem'}}>
                                                            <div style={{fontSize: '4rem'}}>📎</div>
                                                            <p>{modalAdjunto.nombre_archivo}</p>
                                                            <a href={modalUrl} target="_blank" rel="noopener noreferrer">Abrir en nueva pestaña</a>
                                                        </div>
                                                    );
                                                })()
                                            )}
                                        </div>
                                    </div>
                                </div>
                        )}
        </div>
    );
}

export default Adjuntos;
