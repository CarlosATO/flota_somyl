import React, { useEffect } from 'react';
import MapaRuta from './MapaRuta.jsx';
import './Reportes.css';

const MapaModal = ({ open, onClose, puntos, title = 'Ruta realizada', loading = false }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="modal-detalle modal-map" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-detalle">
          <div>
            <h3>{title}</h3>
          </div>
          <div>
            <button className="btn-close-modal" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body-detalle" style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: 24 }} className="loading-state">Cargando mapa...</div>
          ) : (
            <div style={{ width: '100%', height: '100%' }}>
              <MapaRuta puntos={puntos} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapaModal;
