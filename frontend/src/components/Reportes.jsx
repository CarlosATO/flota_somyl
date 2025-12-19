import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../lib/api';
import './Reportes.css';
import DetalleVehiculoModal from './DetalleVehiculoModal.jsx';
import { Download, Search, FileText, Map, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ==========================================
// 1. HELPERS GLOBALES (Fuera del componente)
// ==========================================

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('es-CL');
    } catch { return dateStr; }
};

// Helper de Gases
const getEstadoGases = (gasesObj) => {
    if (!gasesObj) return { texto: 'VENCIDO (S/D)', clase: 'doc-vencido', raw: 'vencido' };
    const { estado, dias_restantes } = gasesObj;
    if (estado === 'VENCIDO' || dias_restantes < 0) return { texto: 'VENCIDO', clase: 'doc-vencido', raw: 'vencido' };
    if (estado === 'POR_VENCER') return { texto: `${dias_restantes} días`, clase: 'doc-por-vencer', raw: 'por_vencer' };
    return { texto: `${dias_restantes} días`, clase: 'doc-vigente', raw: 'vigente' };
};

// Helper de Documentos
const getEstadoDocumento = (doc) => {
    if (!doc) return { texto: 'SIN REGISTRO', clase: 'doc-sin-registro', raw: 'sin_registro' };
    const fechaStr = doc.fecha_vencimiento || doc.fechaVencimiento || null;
    let dias = doc.dias_restantes !== undefined ? doc.dias_restantes : null;
    
    // Calculo fallback si no viene dias_restantes desde el backend
    if (dias === null && fechaStr) {
        try {
            const diff = Math.floor((new Date(fechaStr) - new Date()) / (1000 * 60 * 60 * 24));
            dias = diff;
        } catch(e) { dias = null; }
    }

    if (dias === null) return { texto: doc.estado || 'SIN INFO', clase: 'doc-sin-registro', raw: 'sin_info' };
    if (dias <= 0) return { texto: 'VENCIDO', clase: 'doc-vencido', raw: 'vencido' };
    if (dias < 60) return { texto: `${dias} días`, clase: 'doc-por-vencer', raw: 'por_vencer' };
    return { texto: `${dias} días`, clase: 'doc-vigente', raw: 'vigente' };
};

// ==========================================
// 2. COMPONENTE DRAWER (PANEL LATERAL)
// ==========================================
const VehicleDrawer = ({ vehicle, onClose }) => {
    const drawerRef = useRef(null);
    const [rutasVehiculo, setRutasVehiculo] = useState([]);
    const [loadingRutas, setLoadingRutas] = useState(false);
    const [rutaSeleccionada, setRutaSeleccionada] = useState(null);
    const [showMapaModal, setShowMapaModal] = useState(false);

    // Función auxiliar para formatear nombres de documentos
    const formatHeader = (key) => {
        return key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    };

    // Cerrar al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Cargar rutas del vehículo cuando se abre el drawer
    useEffect(() => {
        if (vehicle && vehicle.id) {
            cargarRutasVehiculo();
        }
    }, [vehicle]);

    const cargarRutasVehiculo = async () => {
        if (!vehicle || !vehicle.id) return;
        
        setLoadingRutas(true);
        try {
            const res = await apiFetch(`/api/ordenes/vehiculo/${vehicle.id}/rutas`);
            if (res.status === 200) {
                setRutasVehiculo(res.data.data || []);
            }
        } catch (error) {
            console.error('Error al cargar rutas:', error);
        } finally {
            setLoadingRutas(false);
        }
    };

    const handleVerRuta = (ruta) => {
        setRutaSeleccionada(ruta);
        setShowMapaModal(true);
    };

    if (!vehicle) return null;

    // Calculamos estado de gases (campo especial)
    const gases = getEstadoGases(vehicle.gases);

    // Obtener todos los tipos de documentos disponibles para este vehículo
    const tiposDocumentosVehiculo = vehicle.documentos 
        ? Object.keys(vehicle.documentos).sort()
        : [];

    return (
        <div className="rep-drawer-overlay">
            <div className="rep-drawer" ref={drawerRef}>
                {/* HEADER */}
                <div className="rep-drawer-header">
                    <div className="rep-drawer-title">
                        <h2>{vehicle.patente}</h2>
                        <p>{vehicle.marca} {vehicle.modelo} ({vehicle.ano})</p>
                    </div>
                    <button className="rep-close-btn" onClick={onClose}><X /></button>
                </div>

                {/* CONTENIDO */}
                <div className="rep-drawer-content">
                    
                    {/* SECCIÓN 1: RESUMEN KPIs */}
                    <div className="rep-section">
                        <div className="rep-section-title">📊 Resumen Operativo</div>
                        <div className="info-grid">
                            <div className="info-box">
                                <span className="info-label">Kilometraje Actual</span>
                                <div className="info-val">{vehicle.ultimo_km?.toLocaleString()} km</div>
                            </div>
                            <div className="info-box">
                                <span className="info-label">Rendimiento</span>
                                <div className="info-val">{vehicle.promedio_l_km} L/km</div>
                            </div>
                            <div className="info-box">
                                <span className="info-label">Gasto Mensual</span>
                                <div className="info-val">{formatCurrency(vehicle.total_gastado_mes)}</div>
                            </div>
                            <div className="info-box">
                                <span className="info-label">Mant. Pendiente</span>
                                <div className="info-val" style={{color: vehicle.costo_mant_pendiente > 0 ? '#dc2626': 'inherit'}}>
                                    {formatCurrency(vehicle.costo_mant_pendiente)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: DOCUMENTACIÓN DINÁMICA */}
                    <div className="rep-section">
                        <div className="rep-section-title">📑 Estado Documental</div>
                        <div className="doc-list">
                            {/* Control de Gases - Campo especial */}
                            <div className="doc-item">
                                <span className="doc-name">Control de Gases</span>
                                <span className={`doc-badge ${gases.clase}`}>{gases.texto}</span>
                            </div>
                            
                            {/* Documentos dinámicos */}
                            {tiposDocumentosVehiculo.length > 0 ? (
                                tiposDocumentosVehiculo.map(tipo => {
                                    const doc = vehicle.documentos[tipo];
                                    const estado = getEstadoDocumento(doc);
                                    return (
                                        <div className="doc-item" key={tipo}>
                                            <span className="doc-name">{formatHeader(tipo)}</span>
                                            <span className={`doc-badge ${estado.clase}`}>{estado.texto}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{textAlign:'center', padding:'10px', color:'#9ca3af', fontSize:'0.9rem'}}>
                                    Sin documentos registrados
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SECCIÓN 3: HISTORIAL DE RUTAS */}
                    <div className="rep-section">
                        <div className="rep-section-title">🗺️ Historial de Rutas ({rutasVehiculo.length})</div>
                        
                        {loadingRutas ? (
                            <div style={{textAlign:'center', padding:'20px', color:'#9ca3af'}}>Cargando rutas...</div>
                        ) : rutasVehiculo.length === 0 ? (
                            <div style={{textAlign:'center', padding:'20px', color:'#9ca3af'}}>
                                <p>Este vehículo aún no tiene viajes registrados.</p>
                            </div>
                        ) : (
                            <div className="doc-list">
                                {rutasVehiculo.map((ruta, index) => (
                                    <div 
                                        key={ruta.id} 
                                        className="doc-item" 
                                        style={{
                                            cursor: ruta.tiene_mapa ? 'pointer' : 'default',
                                            backgroundColor: ruta.tiene_mapa ? '#fff' : '#f9fafb',
                                            flexDirection: 'column',
                                            alignItems: 'flex-start',
                                            gap: '8px'
                                        }}
                                        onClick={() => ruta.tiene_mapa && handleVerRuta(ruta)}
                                    >
                                        <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center'}}>
                                            <div style={{flex: 1}}>
                                                <div style={{fontWeight: '600', fontSize: '0.9rem', color: '#1f2937'}}>
                                                    {ruta.origen} → {ruta.destino}
                                                </div>
                                                <div style={{fontSize: '0.75rem', color: '#6b7280', marginTop: '2px'}}>
                                                    {formatDate(ruta.fecha_inicio)} • {ruta.km_recorridos} km • {ruta.conductor}
                                                </div>
                                            </div>
                                            {ruta.tiene_mapa && (
                                                <button 
                                                    className="btn btn-icon"
                                                    style={{
                                                        backgroundColor: '#3b82f6',
                                                        color: 'white',
                                                        padding: '6px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem'
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleVerRuta(ruta);
                                                    }}
                                                >
                                                    <Map size={14} style={{marginRight: '4px'}} />
                                                    Ver Mapa
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SECCIÓN 4: BOTÓN DE ACCIÓN (Solo si no tiene drawer de rutas) */}
                    {rutasVehiculo.length === 0 && !loadingRutas && (
                        <div className="action-area">
                            <button 
                                className="btn-rutas"
                                disabled
                                style={{
                                    backgroundColor: '#9ca3af',
                                    cursor: 'not-allowed',
                                    opacity: 0.6
                                }}
                            >
                                <Map size={20} />
                                Sin rutas realizadas para mostrar
                            </button>
                            <p style={{textAlign:'center', fontSize:'0.8rem', color:'#9ca3af', marginTop:'10px'}}>
                                Este vehículo aún no tiene viajes registrados.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Modal de Mapa */}
            {showMapaModal && rutaSeleccionada && (
                <MapaRutaModal 
                    ruta={rutaSeleccionada}
                    onClose={() => {
                        setShowMapaModal(false);
                        setRutaSeleccionada(null);
                    }}
                />
            )}
        </div>
    );
};

// ==========================================
// 2.5 COMPONENTE MAPA DE RUTA
// ==========================================
const MapaRutaModal = ({ ruta, onClose }) => {
    const [puntosRuta, setPuntosRuta] = useState([]);
    const [loadingMapa, setLoadingMapa] = useState(true);
    
    useEffect(() => {
        const cargarPuntosRuta = async () => {
            try {
                const res = await apiFetch(`/api/ordenes/${ruta.id}/ruta`);
                if (res.status === 200) {
                    setPuntosRuta(res.data.data || []);
                }
            } catch (error) {
                console.error('Error al cargar puntos de ruta:', error);
            } finally {
                setLoadingMapa(false);
            }
        };
        
        if (ruta && ruta.id) {
            cargarPuntosRuta();
        }
    }, [ruta]);
    
    if (!ruta) return null;
    
    // Usar Google Maps Embed API (simple, no requiere instalación)
    const puntoInicio = ruta.punto_inicio;
    const puntoFin = ruta.punto_fin;
    
    // Si hay puntos GPS, crear URL para Google Maps
    let mapaUrl = null;
    if (puntoInicio && puntoFin) {
        const origen = `${puntoInicio.latitud},${puntoInicio.longitud}`;
        const destino = `${puntoFin.latitud},${puntoFin.longitud}`;
        mapaUrl = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destino}&travelmode=driving`;
    }
    
    return (
        <div className="rep-drawer-overlay" style={{zIndex: 1100}}>
            <div className="rep-drawer" style={{maxWidth: '90vw', width: '800px'}}>
                <div className="rep-drawer-header">
                    <div className="rep-drawer-title">
                        <h2>🗺️ Ruta: {ruta.origen} → {ruta.destino}</h2>
                        <p>
                            {formatDate(ruta.fecha_inicio)} • {ruta.km_recorridos} km • Conductor: {ruta.conductor}
                        </p>
                    </div>
                    <button className="rep-close-btn" onClick={onClose}><X /></button>
                </div>
                
                <div className="rep-drawer-content">
                    {loadingMapa ? (
                        <div style={{textAlign: 'center', padding: '40px'}}>
                            <p>Cargando mapa...</p>
                        </div>
                    ) : !puntoInicio || !puntoFin ? (
                        <div style={{textAlign: 'center', padding: '40px', color: '#6b7280'}}>
                            <p>No hay coordenadas GPS disponibles para esta ruta.</p>
                        </div>
                    ) : (
                        <>
                            {/* Información de la ruta */}
                            <div className="rep-section">
                                <div className="info-grid" style={{gridTemplateColumns: '1fr 1fr 1fr'}}>
                                    <div className="info-box">
                                        <span className="info-label">📍 Punto Inicio</span>
                                        <div className="info-val" style={{fontSize: '0.8rem'}}>
                                            {puntoInicio.latitud.toFixed(6)}, {puntoInicio.longitud.toFixed(6)}
                                        </div>
                                    </div>
                                    <div className="info-box">
                                        <span className="info-label">🏁 Punto Final</span>
                                        <div className="info-val" style={{fontSize: '0.8rem'}}>
                                            {puntoFin.latitud.toFixed(6)}, {puntoFin.longitud.toFixed(6)}
                                        </div>
                                    </div>
                                    <div className="info-box">
                                        <span className="info-label">📊 Puntos GPS</span>
                                        <div className="info-val">{puntosRuta.length}</div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Mapa */}
                            <div className="rep-section">
                                <div className="rep-section-title">Visualización de Ruta</div>
                                <div style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    height: '400px',
                                    backgroundColor: '#f9fafb'
                                }}>
                                    {mapaUrl ? (
                                        <div style={{
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            gap: '20px',
                                            padding: '20px'
                                        }}>
                                            <div style={{textAlign: 'center'}}>
                                                <h3 style={{margin: '0 0 10px', color: '#1f2937'}}>Ver ruta en Google Maps</h3>
                                                <p style={{color: '#6b7280', fontSize: '0.9rem'}}>
                                                    Desde {ruta.origen} hasta {ruta.destino}
                                                </p>
                                            </div>
                                            <a 
                                                href={mapaUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '12px 24px',
                                                    backgroundColor: '#2563eb',
                                                    color: 'white',
                                                    borderRadius: '8px',
                                                    textDecoration: 'none',
                                                    fontWeight: '600',
                                                    fontSize: '1rem',
                                                    transition: 'background 0.2s'
                                                }}
                                                onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
                                                onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
                                            >
                                                <Map size={20} />
                                                Abrir en Google Maps
                                            </a>
                                            <div style={{fontSize: '0.8rem', color: '#9ca3af'}}>
                                                📱 Se abrirá en una nueva pestaña
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#9ca3af'
                                        }}>
                                            No se pudo generar el mapa
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 3. COMPONENTE PRINCIPAL REPORTES
// ==========================================

const KPI_INITIAL_STATE = {
    total_vehiculos: null, total_conductores: null, ordenes_activas: null, mantenimientos_pendientes: null, costo_total_clp: null,
};

function Reportes({ token }) {
    // --- ESTADOS ---
    const [kpis, setKpis] = useState(KPI_INITIAL_STATE);
    const [licencias, setLicencias] = useState([]);
    const [metaLicencias, setMetaLicencias] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [diasVentanaLicencias, setDiasVentanaLicencias] = useState(60);
    
    // Estados UI
    const [licenciasExpanded, setLicenciasExpanded] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(null); 

    // Estados Datos Vehículos
    const [analisisVehiculos, setAnalisisVehiculos] = useState([]);
    const [loadingAnalisis, setLoadingAnalisis] = useState(false);
    
    // Estado Selección (Drawer y Modal antiguo)
    const [drawerVehicle, setDrawerVehicle] = useState(null); // Para el panel lateral
    const [selectedVehiculoId, setSelectedVehiculoId] = useState(null);
    const [showDetalleVehiculoModal, setShowDetalleVehiculoModal] = useState(false);
    
    // --- ESTADO FILTROS (inicializado sin filtros dinámicos) ---
    const [columnFilters, setColumnFilters] = useState({
        patente: '',
        marcaModelo: '',
        ano: '',
        gases: ''
    });

    // --- CARGA DE DATOS ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (!token) throw new Error('No hay sesión activa');

            // 1. KPIs
            const resKpis = await apiFetch('/api/reportes/kpis_resumen');
            const resCosto = await apiFetch('/api/reportes/costo_mantenimiento_mensual');
            const resLic = await apiFetch(`/api/reportes/licencias_por_vencer?dias=${diasVentanaLicencias}`);

            if (resKpis.status === 200) setKpis({ ...resKpis.data.data, costo_total_clp: resCosto.data?.data?.costo_total_clp });
            if (resLic.status === 200) { setLicencias(resLic.data.data || []); setMetaLicencias(resLic.data.meta || {}); }

            // 2. Análisis
            setLoadingAnalisis(true);
            const resAnalisis = await apiFetch('/api/reportes/analisis_vehiculos');
            if (resAnalisis.status === 200) {
                setAnalisisVehiculos(resAnalisis.data.data || []);
            }
            setLoadingAnalisis(false);

        } catch (err) { setError(err.message || 'Error al cargar reportes'); } finally { setLoading(false); }
    }, [token, diasVentanaLicencias]);

    useEffect(() => { if (token) fetchData(); else { setError('No hay sesión activa'); setLoading(false); } }, [token, fetchData]);

    // Calcular dinámicamente qué tipos de documentos existen en la data cargada
    const tiposDocumentosEncontrados = useMemo(() => {
        if (!analisisVehiculos || analisisVehiculos.length === 0) return [];
        const tiposSet = new Set();
        analisisVehiculos.forEach(v => {
            if (v.documentos) {
                Object.keys(v.documentos).forEach(k => tiposSet.add(k));
            }
        });
        return Array.from(tiposSet).sort(); // Ej: ['PERMISO_CIRCULACION', 'SEGURO_AUTOMOTRIZ', 'SOAP']
    }, [analisisVehiculos]);

    // Función auxiliar para limpiar el nombre (Ej: PERMISO_CIRCULACION -> Permiso Circulacion)
    const formatHeader = (key) => {
        return key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    };

    // --- LÓGICA DE FILTRADO (TIPO EXCEL) ---
    const vehiculosFiltrados = useMemo(() => {
        if (!analisisVehiculos) return [];

        return analisisVehiculos.filter(vehiculo => {
            // Texto simple
            if (columnFilters.patente && !vehiculo.patente?.toLowerCase().includes(columnFilters.patente.toLowerCase())) return false;
            
            const marcaModelo = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.toLowerCase();
            if (columnFilters.marcaModelo && !marcaModelo.includes(columnFilters.marcaModelo.toLowerCase())) return false;
            
            if (columnFilters.ano && !vehiculo.ano?.toString().includes(columnFilters.ano)) return false;

            // Selects (Comparación exacta de 'raw')
            if (columnFilters.gases) {
                const estadoRaw = getEstadoGases(vehiculo.gases).raw;
                if (columnFilters.gases === 'critico') {
                    if (estadoRaw !== 'vencido' && estadoRaw !== 'por_vencer') return false;
                } else if (estadoRaw !== columnFilters.gases) return false;
            }

            // Filtros dinámicos para documentos (reemplaza los filtros estáticos anteriores)
            for (const tipo of tiposDocumentosEncontrados) {
                const filterKey = tipo.toLowerCase();
                if (columnFilters[filterKey]) {
                    const doc = vehiculo.documentos && vehiculo.documentos[tipo];
                    const estadoRaw = getEstadoDocumento(doc).raw;
                    if (estadoRaw !== columnFilters[filterKey]) return false;
                }
            }

            return true;
        });
    }, [analisisVehiculos, columnFilters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setColumnFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleLimpiarFiltros = () => {
        const baseFilters = {
            patente: '',
            marcaModelo: '',
            ano: '',
            gases: ''
        };
        // Limpiar filtros dinámicos
        tiposDocumentosEncontrados.forEach(tipo => {
            baseFilters[tipo.toLowerCase()] = '';
        });
        setColumnFilters(baseFilters);
    };

    // --- INTERACCIÓN ---
    const handleKPIClick = (tipo) => setModalDetalle(tipo);
    
    // Abre el Drawer lateral
    const handleRowClick = (vehiculo) => {
        setDrawerVehicle(vehiculo);
    };

    // Abre el modal antiguo (lupa)
    const openVehiculoModal = (vehId, e) => {
        e.stopPropagation(); // Evita abrir el drawer al hacer click en la lupa
        setSelectedVehiculoId(vehId);
        setShowDetalleVehiculoModal(true);
    };

    // --- EXPORTACIÓN ---
    const handleExportarExcelPrincipal = () => {
        if (!vehiculosFiltrados || vehiculosFiltrados.length === 0) return;
        const datosExcel = vehiculosFiltrados.map(v => {
             const gases = getEstadoGases(v.gases);
             
             // Crear objeto base
             const row = {
                "Patente": v.patente, "Marca": v.marca, "Modelo": v.modelo, "Año": v.ano, "Tipo": v.tipo,
                "Km Actual": v.ultimo_km, "F. Última Mant.": v.fecha_ultima_mant ? formatDate(v.fecha_ultima_mant) : '-',
                "Mant. Pendiente": v.costo_mant_pendiente || 0,
                "Gases": gases.texto
             };
             
             // Agregar columnas dinámicas de documentos
             tiposDocumentosEncontrados.forEach(tipo => {
                 const doc = v.documentos && v.documentos[tipo];
                 const estado = getEstadoDocumento(doc);
                 row[formatHeader(tipo)] = estado.texto;
             });
             
             return row;
        });
        const worksheet = XLSX.utils.json_to_sheet(datosExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Análisis Flota");
        XLSX.writeFile(workbook, `Reporte_Flota_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportarPDFPrincipal = () => {
        if (!vehiculosFiltrados || vehiculosFiltrados.length === 0) return;
        try {
            const doc = new jsPDF();
            
            // Título
            doc.setFontSize(16);
            doc.text('Análisis Detallado de Vehículos', 14, 20);
            doc.setFontSize(10);
            doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 14, 28);
            doc.text(`Total de vehículos: ${vehiculosFiltrados.length}`, 14, 34);
            
            // Preparar datos para la tabla
            const headers = ['Patente', 'Marca/Modelo', 'Año', 'KM', 'Gases', ...tiposDocumentosEncontrados.map(tipo => formatHeader(tipo))];
            const rows = vehiculosFiltrados.map(v => {
                const gases = getEstadoGases(v.gases);
                
                const row = [
                    v.patente,
                    `${v.marca} ${v.modelo}`,
                    v.ano,
                    v.ultimo_km?.toLocaleString() || '0',
                    gases.texto
                ];
                
                // Agregar columnas dinámicas de documentos
                tiposDocumentosEncontrados.forEach(tipo => {
                    const doc = v.documentos && v.documentos[tipo];
                    const estado = getEstadoDocumento(doc);
                    row.push(estado.texto);
                });
                
                return row;
            });
            
            // Generar tabla
            autoTable(doc, {
                startY: 40,
                head: [headers],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                columnStyles: (() => {
                    const styles = {
                        0: { cellWidth: 20 }, // Patente
                        1: { cellWidth: 35 }, // Marca/Modelo
                        2: { cellWidth: 15 }, // Año
                        3: { cellWidth: 20 }, // KM
                        4: { cellWidth: 20 }  // Gases
                    };
                    // Agregar estilos para columnas dinámicas de documentos
                    tiposDocumentosEncontrados.forEach((tipo, index) => {
                        styles[5 + index] = { cellWidth: 20 };
                    });
                    return styles;
                })()
            });
            
            doc.save(`Reporte_Flota_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error al generar PDF:', error);
            alert('Error al generar el PDF');
        }
    };

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="reportes-container">
            <div className="reportes-header">
                <h2>📊 Dashboard y Reportes</h2>
                <p className="header-subtitle">Métricas clave y alertas del sistema</p>
            </div>

            {loading && <div className="loading-state">Cargando datos...</div>}
            {error && <div className="error-state">⚠️ {error}</div>}

            {!loading && !error && (
                <>
                    {/* KPIs */}
                    <div className="kpis-grid">
                        <div className="kpi-card vehiculos clickeable" onClick={() => handleKPIClick('vehiculos')}>
                            <div className="kpi-title">🚗 Total Vehículos</div><div className="kpi-value">{kpis.total_vehiculos || 0}</div>
                        </div>
                        <div className="kpi-card conductores clickeable" onClick={() => handleKPIClick('conductores')}>
                            <div className="kpi-title">👥 Total Conductores</div><div className="kpi-value">{kpis.total_conductores || 0}</div>
                        </div>
                        <div className="kpi-card ordenes clickeable" onClick={() => handleKPIClick('ordenes')}>
                            <div className="kpi-title">📅 Órdenes Activas</div><div className="kpi-value">{kpis.ordenes_activas || 0}</div>
                        </div>
                        <div className="kpi-card mantenimiento clickeable" onClick={() => handleKPIClick('mantenimientos')}>
                            <div className="kpi-title">🛠️ Mant. Pendientes</div><div className="kpi-value">{kpis.mantenimientos_pendientes || 0}</div>
                        </div>
                    </div>

                    {/* Costos y Licencias */}
                    <div className="report-section"><div className="report-costo"><div className="costo-label">💰 Costo Mant. (30 días)</div><div className="costo-value">{formatCurrency(kpis.costo_total_clp || 0)}</div></div></div>
                    
                    <div className="report-section">
                        <div className="section-header-collapsible" onClick={() => setLicenciasExpanded(!licenciasExpanded)}>
                            <div className="section-title-collapsible"><h3>📋 Licencias ({metaLicencias.total || 0})</h3></div>
                        </div>
                        {licenciasExpanded && <TablaLicencias licencias={licencias} />}
                    </div>

                    {/* TABLA PRINCIPAL */}
                    <div className="reportes-section">
                        <div className="section-header" style={{display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center'}}>
                            <h3>🚗 Análisis Detallado ({vehiculosFiltrados.length})</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={handleLimpiarFiltros}>🗑️ Limpiar</button>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleExportarExcelPrincipal} 
                                    disabled={loadingAnalisis || vehiculosFiltrados.length === 0}
                                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                >
                                    <Download size={16} /> Excel
                                </button>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleExportarPDFPrincipal} 
                                    disabled={loadingAnalisis || vehiculosFiltrados.length === 0}
                                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                >
                                    <FileText size={16} /> PDF
                                </button>
                            </div>
                        </div>

                        <div className="table-container-report">
                            <table className="reportes-table">
                                <thead>
                                    {/* Títulos */}
                                    <tr>
                                        <th className="sticky-col col-patente">Patente</th>
                                        <th className="sticky-col col-marca">Marca/Modelo</th>
                                        <th>Año</th>
                                        <th>Último KM</th>
                                        <th>F. Última Mant.</th>
                                        <th>Mant. Pend. ($)</th>
                                        <th>Gases</th>
                                        <th colSpan={tiposDocumentosEncontrados.length} style={{textAlign:'center', borderBottom:'1px solid #ddd'}}>Estado Documentos</th>
                                        <th></th>
                                    </tr>
                                    {/* Filtros */}
                                    <tr className="filter-row">
                                        <th className="sticky-col col-patente"><input name="patente" className="filter-input" placeholder="Buscar..." value={columnFilters.patente} onChange={handleFilterChange}/></th>
                                        <th className="sticky-col col-marca"><input name="marcaModelo" className="filter-input" placeholder="Buscar..." value={columnFilters.marcaModelo} onChange={handleFilterChange}/></th>
                                        <th><input name="ano" className="filter-input" placeholder="Año" style={{width:'60px'}} value={columnFilters.ano} onChange={handleFilterChange}/></th>
                                        <th></th><th></th><th></th>
                                        <th>
                                            <select name="gases" className="filter-input" value={columnFilters.gases} onChange={handleFilterChange}>
                                                <option value="">Todos</option>
                                                <option value="vigente">✅ Vigente</option>
                                                <option value="por_vencer">⚠️ Por Vencer</option>
                                                <option value="vencido">🚫 Vencido</option>
                                                <option value="critico">🚨 Crítico</option>
                                            </select>
                                        </th>
                                        {/* Filtros dinámicos para documentos */}
                                        {tiposDocumentosEncontrados.map(tipo => (
                                            <th key={`filter-${tipo}`}>
                                                <select 
                                                    name={tipo.toLowerCase()} 
                                                    className="filter-input" 
                                                    value={columnFilters[tipo.toLowerCase()] || ''} 
                                                    onChange={handleFilterChange}
                                                    style={{minWidth: '100px'}}
                                                >
                                                    <option value="">Todos</option>
                                                    <option value="vigente">✅ Vigente</option>
                                                    <option value="por_vencer">⚠️ Por Vencer</option>
                                                    <option value="vencido">🚫 Vencido</option>
                                                    <option value="sin_registro">⚪ Sin Registro</option>
                                                </select>
                                            </th>
                                        ))}
                                        <th></th>
                                    </tr>
                                    <tr style={{fontSize:'0.75rem', color:'#666', background:'#f8f9fa'}}>
                                        <th colSpan="7"></th>
                                        {tiposDocumentosEncontrados.map(tipo => (
                                            <th key={`header-${tipo}`}>{formatHeader(tipo)}</th>
                                        ))}
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vehiculosFiltrados.length === 0 ? (
                                        <tr><td colSpan={11 + tiposDocumentosEncontrados.length} className="empty-state-report">No se encontraron coincidencias</td></tr>
                                    ) : (
                                        vehiculosFiltrados.map((vehiculo) => {
                                            const gases = getEstadoGases(vehiculo.gases);

                                            return (
                                                <tr 
                                                    key={vehiculo.id} 
                                                    onClick={() => handleRowClick(vehiculo)} // <--- AQUI SE ABRE EL DRAWER
                                                    style={{cursor: 'pointer'}}
                                                >
                                                    <td className="sticky-col col-patente"><strong>{vehiculo.patente}</strong></td>
                                                    <td className="sticky-col col-marca">{vehiculo.marca} {vehiculo.modelo}</td>
                                                    <td>{vehiculo.ano}</td>
                                                    <td>{vehiculo.ultimo_km?.toLocaleString()} km</td>
                                                    <td>{vehiculo.fecha_ultima_mant ? formatDate(vehiculo.fecha_ultima_mant) : '-'}</td>
                                                    <td style={{color: vehiculo.costo_mant_pendiente > 0 ? '#d32f2f' : 'inherit', fontWeight: 'bold'}}>
                                                        {formatCurrency(vehiculo.costo_mant_pendiente || 0)}
                                                    </td>
                                                    <td><span className={`doc-badge ${gases.clase}`}>{gases.texto}</span></td>
                                                    {/* Celdas dinámicas para documentos */}
                                                    {tiposDocumentosEncontrados.map(tipo => {
                                                        const doc = vehiculo.documentos && vehiculo.documentos[tipo];
                                                        const estado = getEstadoDocumento(doc); // Reusa tu helper existente
                                                        return (
                                                            <td key={tipo}>
                                                                <span className={`doc-badge ${estado.clase}`}>{estado.texto}</span>
                                                            </td>
                                                        );
                                                    })}
                                                    <td>
                                                        <button 
                                                            className="btn btn-icon" 
                                                            onClick={(e) => openVehiculoModal(vehiculo.id, e)}
                                                            title="Ver detalle completo (Modal)"
                                                        >🔎</button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Modales y Drawers */}
            {modalDetalle && <ModalDetalle tipo={modalDetalle} onClose={() => setModalDetalle(null)} />}
            {showDetalleVehiculoModal && <DetalleVehiculoModal vehiculoId={selectedVehiculoId} open={showDetalleVehiculoModal} onClose={() => setShowDetalleVehiculoModal(false)} />}
            
            {/* COMPONENTE DRAWER NUEVO */}
            <VehicleDrawer 
                vehicle={drawerVehicle} 
                onClose={() => setDrawerVehicle(null)} 
            />
        </div>
    );
}

// ==========================================
// 4. SUB-COMPONENTES (Auxiliares)
// ==========================================

function TablaLicencias({ licencias }) {
    if(!licencias || licencias.length === 0) return <div className="empty-state-report">No hay licencias</div>;
    return (
        <div className="table-container-report">
            <table className="report-table">
                <thead><tr><th>Urgencia</th><th>Conductor</th><th>RUT</th><th>Vencimiento</th><th>Días</th></tr></thead>
                <tbody>{licencias.map((lic) => (
                    <tr key={lic.id} className={`row-${lic.urgencia}`}>
                        <td><span className={`urgencia-badge ${lic.urgencia}`}>{lic.urgencia}</span></td>
                        <td><strong>{lic.nombre_completo}</strong></td>
                        <td>{lic.rut}</td>
                        <td>{formatDate(lic.licencia_vencimiento)}</td>
                        <td><strong className={`dias-restantes ${lic.urgencia}`}>{lic.dias_restantes} días</strong></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}

function ModalDetalle({ tipo, onClose }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetalle = async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/api/reportes/detalle_${tipo}`);
                if (res.status === 200) setData(res.data.data || []);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchDetalle();
    }, [tipo]);

    const getTitulo = () => {
        switch(tipo) {
            case 'vehiculos': return '🚗 Detalle Vehículos';
            case 'conductores': return '👥 Detalle Conductores';
            case 'ordenes': return '📅 Órdenes Activas';
            case 'mantenimientos': return '🛠️ Mant. Pendientes';
            default: return 'Detalle';
        }
    };
    
    // Funciones export simplificadas para no alargar infinito el código, pero funcionan
    const handleExportExcel = () => {
        if (!data.length) return;
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Detalle");
        XLSX.writeFile(wb, `Detalle_${tipo}.xlsx`);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-detalle" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-detalle">
                    <h3>{getTitulo()}</h3>
                    <div style={{marginLeft:'auto', display:'flex', gap:'5px'}}>
                        <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}><Download size={14}/> Excel</button>
                        <button className="btn-close-modal" onClick={onClose}>✕</button>
                    </div>
                </div>
                <div className="modal-body-detalle">
                    {loading ? <div>Cargando...</div> : (
                        <div style={{overflowX:'auto'}}>
                            {tipo === 'vehiculos' && <TablaDetalleVehiculos data={data} />}
                            {tipo === 'conductores' && <TablaDetalleConductores data={data} />}
                            {tipo === 'ordenes' && <TablaDetalleOrdenes data={data} />}
                            {tipo === 'mantenimientos' && <TablaDetalleMantenimientos data={data} />}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Tablas internas del Modal
function TablaDetalleMantenimientos({ data }) {
    return <table className="modal-table"><thead><tr><th>Vehículo</th><th>Tipo</th><th>Desc</th><th>Fecha</th><th>Costo</th></tr></thead><tbody>{data.map(m=><tr key={m.id}><td>{m.vehiculo_placa}</td><td>{m.tipo}</td><td>{m.descripcion}</td><td>{formatDate(m.fecha_programada)}</td><td>{formatCurrency(m.costo)}</td></tr>)}</tbody></table>;
}
function TablaDetalleVehiculos({ data }) {
    return <table className="modal-table"><thead><tr><th>Placa</th><th>Marca</th><th>Año</th><th>KM</th></tr></thead><tbody>{data.map(v=><tr key={v.id}><td>{v.placa}</td><td>{v.marca}</td><td>{v.ano}</td><td>{v.km_actual}</td></tr>)}</tbody></table>;
}
function TablaDetalleConductores({ data }) {
    return <table className="modal-table"><thead><tr><th>Nombre</th><th>RUT</th><th>Vencimiento</th></tr></thead><tbody>{data.map(c=><tr key={c.id}><td>{c.nombre_completo}</td><td>{c.rut}</td><td>{formatDate(c.licencia_vencimiento)}</td></tr>)}</tbody></table>;
}
function TablaDetalleOrdenes({ data }) {
    return <table className="modal-table"><thead><tr><th>ID</th><th>Vehículo</th><th>Conductor</th><th>Fecha</th></tr></thead><tbody>{data.map(o=><tr key={o.id}><td>{o.id}</td><td>{o.vehiculo_info}</td><td>{o.conductor_nombre}</td><td>{formatDate(o.fecha_inicio_programada)}</td></tr>)}</tbody></table>;
}

export default Reportes;