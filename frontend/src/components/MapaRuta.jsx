// File: frontend/src/components/MapaRuta.jsx
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- Arreglo para que se vean los marcadores (Bug conocido de Leaflet en React) ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const MapaRuta = ({ puntos }) => {
  // Si no hay puntos, mostramos un aviso
  if (!puntos || puntos.length === 0) {
    return (
      <div style={{
        padding: 40, 
        textAlign: 'center', 
        background: '#f8f9fa', 
        borderRadius: 8,
        color: '#6c757d'
      }}>
        🛰️ No hay datos de GPS registrados para este viaje.
      </div>
    );
  }

  // Convertir puntos al formato [lat, lng] que usa el mapa
  // Aseguramos que sean números por si acaso
  const rutaCoords = puntos.map(p => [parseFloat(p.latitud), parseFloat(p.longitud)]);
  
  const inicio = rutaCoords[0];
  const fin = rutaCoords[rutaCoords.length - 1];
  
  // Calculamos el centro aproximado (usando el punto final)
  const centro = fin; 

  return (
    <MapContainer center={centro} zoom={13} style={{ height: '500px', width: '100%', borderRadius: '12px' }}>
      {/* Capa del Mapa (OpenStreetMap - Gratis) */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      
      {/* Línea de la ruta (Azul) */}
      <Polyline positions={rutaCoords} color="#2563eb" weight={6} opacity={0.8} />

      {/* Marcador de Inicio (Verde) */}
      <Marker position={inicio}>
        <Popup>🚩 Inicio del Viaje</Popup>
      </Marker>

      {/* Marcador Actual/Final (Rojo) */}
      <Marker position={fin}>
        <Popup>📍 Ubicación Actual / Fin</Popup>
      </Marker>
    </MapContainer>
  );
};

export default MapaRuta;