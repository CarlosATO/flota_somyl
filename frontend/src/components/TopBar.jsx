import { useState, useEffect, useRef } from 'react'
import './TopBar.css'

function TopBar({ user, onLogout, onNavigate, activeModule }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  // --- NUEVA FUNCIÓN PARA CERRAR SESIÓN Y VOLVER AL PORTAL ---
  const handleLogoutClick = () => {
    // Nota: NO invocamos `onLogout()` aquí — hacerlo provoca que React
    // re-renderice y muestre la pantalla de Login brevemente antes de la
    // redirección al portal. En su lugar, limpiamos el storage y hacemos
    // un redirect inmediato que reemplaza la entrada actual en el history.

    // 1) Limpiar credenciales locales
    try { localStorage.clear(); } catch (e) { /* ignore */ }

    // 2) Redirigir al portal usando replace para evitar que /login quede en el history
    // (evita flash y evita que el usuario vuelva con el botón Atrás).
    window.location.replace("https://portal.datix.cl/");
  }
  // -----------------------------------------------------------

  const handleReportesClick = () => {
    setDropdownOpen(!dropdownOpen)
  }

  const handleDropdownItemClick = (module) => {
    onNavigate(module)
    setDropdownOpen(false)
  }

  // Verificar si estamos en alguna sección de reportes
  const isReportesActive = activeModule === 'reportes' || 
                          activeModule === 'reportes-documentos' || 
                          activeModule === 'reportes-flota' || 
                          activeModule === 'reportes-mantenimientos'

    return (
    <header className="topbar">
      <div className="topbar-top">
        <div className="topbar-user left">
          <div className="user-info">
            <div className="user-avatar-small">
              {(user?.nombre || user?.correo || 'U').charAt(0).toUpperCase()}
            </div>
          </div>
          
          {/* CAMBIO AQUÍ:
             En lugar de onClick={onLogout}, usamos nuestra nueva función handleLogoutClick 
          */}
          <button 
            className="btn-logout small" 
            onClick={handleLogoutClick} 
            title="Volver al Portal" 
            aria-label="Salir"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 17L21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Middle: Navigation */}
        <nav className="topbar-nav">
        <div className="nav-separator"></div>

        {/* Grupo: Gestión de Flota */}
        <button 
          className={`nav-item ${activeModule === 'vehiculos' ? 'active' : ''}`}
          onClick={() => onNavigate('vehiculos')}
          title="Vehículos"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M19 17H5C3.89543 17 3 16.1046 3 15V9C3 7.89543 3.89543 7 5 7H19C20.1046 7 21 7.89543 21 9V15C21 16.1046 20.1046 17 19 17Z" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="16" cy="17" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Vehículos</span>
        </button>

        <button 
          className={`nav-item ${activeModule === 'conductores' ? 'active' : ''}`}
          onClick={() => onNavigate('conductores')}
          title="Conductores"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Conductores</span>
        </button>

        <div className="nav-separator"></div>

        {/* Grupo: Operaciones */}
        <button 
          className={`nav-item ${activeModule === 'viajes' ? 'active' : ''}`}
          onClick={() => onNavigate('viajes')}
          title="Viajes"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Viajes</span>
        </button>

        <button 
          className={`nav-item ${activeModule === 'mantenimiento' ? 'active' : ''}`}
          onClick={() => onNavigate('mantenimiento')}
          title="Mantenimiento"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3C15.1 5.9 15.1 5.3 14.7 4.9L13.1 3.3C12.7 2.9 12.1 2.9 11.7 3.3L10.6 4.4L13.6 7.4L14.7 6.3Z" stroke="currentColor" strokeWidth="2"/>
            <path d="M3 17.2L9.6 10.6L12.6 13.6L6 20.2H3V17.2Z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Mantenimiento</span>
        </button>

        <button 
          className={`nav-item ${activeModule === 'combustible' ? 'active' : ''}`}
          onClick={() => onNavigate('combustible')}
          title="Combustible"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M3 10h2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Combustible</span>
        </button>

        <div className="nav-separator"></div>

        {/* Reportes con Dropdown */}
        <div className="nav-item-dropdown" ref={dropdownRef}>
          <button 
            className={`nav-item ${isReportesActive ? 'active' : ''}`}
            onClick={handleReportesClick}
            title="Reportes"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 17V11M12 17V7M15 17V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span>Reportes</span>
            <svg 
              className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}
              viewBox="0 0 24 24" 
              fill="none"
              width="16"
              height="16"
            >
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu">
              <button 
                className={`dropdown-item ${activeModule === 'reportes' ? 'active' : ''}`}
                onClick={() => handleDropdownItemClick('reportes')}
              >
                <span className="dropdown-icon">📊</span>
                <div className="dropdown-content">
                  <span className="dropdown-title">Resumen General</span>
                  <span className="dropdown-description">Vista general de KPIs y estadísticas</span>
                </div>
              </button>

              <button 
                className={`dropdown-item ${activeModule === 'reportes-documentos' ? 'active' : ''}`}
                onClick={() => handleDropdownItemClick('reportes-documentos')}
              >
                <span className="dropdown-icon">📄</span>
                <div className="dropdown-content">
                  <span className="dropdown-title">Cons. Documentos</span>
                  <span className="dropdown-description">Estado de documentación vehicular</span>
                </div>
              </button>

              <button 
                className={`dropdown-item ${activeModule === 'reportes-flota' ? 'active' : ''}`}
                onClick={() => handleDropdownItemClick('reportes-flota')}
              >
                <span className="dropdown-icon">🚗</span>
                <div className="dropdown-content">
                  <span className="dropdown-title">Análisis de Flota</span>
                  <span className="dropdown-description">Rendimiento y uso de vehículos</span>
                </div>
              </button>

              <button 
                className={`dropdown-item ${activeModule === 'reportes-mantenimientos' ? 'active' : ''}`}
                onClick={() => handleDropdownItemClick('reportes-mantenimientos')}
              >
                <span className="dropdown-icon">📈</span>
                <div className="dropdown-content">
                  <span className="dropdown-title">Mantenimientos</span>
                  <span className="dropdown-description">Historial y programación</span>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="nav-separator"></div>

        {/* Usuarios */}
        <button 
          className={`nav-item ${activeModule === 'usuarios' ? 'active' : ''}`}
          onClick={() => onNavigate('usuarios')}
          title="Usuarios"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2"/>
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Usuarios</span>
        </button>
        </nav>

        {/* Right: text logo */}
        <div className="topbar-logo right">
          <span className="logo-text">Control Flota</span>
        </div>
      </div>
    </header>
  )
}

export default TopBar