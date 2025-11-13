import './TopBar.css'

function TopBar({ user, onLogout, onNavigate, activeModule }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M19 17H5C3.89543 17 3 16.1046 3 15V9C3 7.89543 3.89543 7 5 7H19C20.1046 7 21 7.89543 21 9V15C21 16.1046 20.1046 17 19 17Z" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="9" r="1" fill="currentColor"/>
            <circle cx="16" cy="9" r="1" fill="currentColor"/>
          </svg>
          <span>Control de Flotas</span>
        </div>
      </div>

      <nav className="topbar-nav">
        <button 
          className={`nav-item ${activeModule === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
            <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
            <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
            <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Dashboard
        </button>

        <button 
          className={`nav-item ${activeModule === 'vehiculos' ? 'active' : ''}`}
          onClick={() => onNavigate('vehiculos')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M19 17H5C3.89543 17 3 16.1046 3 15V9C3 7.89543 3.89543 7 5 7H19C20.1046 7 21 7.89543 21 9V15C21 16.1046 20.1046 17 19 17Z" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="16" cy="17" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Vehículos
        </button>

        <button 
          className={`nav-item ${activeModule === 'conductores' ? 'active' : ''}`}
          onClick={() => onNavigate('conductores')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Conductores
        </button>

        <button 
          className={`nav-item ${activeModule === 'viajes' ? 'active' : ''}`}
          onClick={() => onNavigate('viajes')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Viajes
        </button>

        <button 
          className={`nav-item ${activeModule === 'mantenimiento' ? 'active' : ''}`}
          onClick={() => onNavigate('mantenimiento')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3C15.1 5.9 15.1 5.3 14.7 4.9L13.1 3.3C12.7 2.9 12.1 2.9 11.7 3.3L10.6 4.4L13.6 7.4L14.7 6.3Z" stroke="currentColor" strokeWidth="2"/>
            <path d="M3 17.2L9.6 10.6L12.6 13.6L6 20.2H3V17.2Z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Mantenimiento
        </button>

        <button 
          className={`nav-item ${activeModule === 'combustible' ? 'active' : ''}`}
          onClick={() => onNavigate('combustible')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M3 10h2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Combustible
        </button>

        <button 
          className={`nav-item ${activeModule === 'reportes' ? 'active' : ''}`}
          onClick={() => onNavigate('reportes')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M9 17V11M12 17V7M15 17V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Reportes
        </button>

        <button 
          className={`nav-item ${activeModule === 'usuarios' ? 'active' : ''}`}
          onClick={() => onNavigate('usuarios')}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2"/>
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Usuarios
        </button>
      </nav>

      <div className="topbar-right">
        <div className="user-menu">
          <div className="user-info">
            <div className="user-avatar">
              {(user?.nombre || user?.correo || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.nombre || user?.correo}</span>
              <span className="user-role">{user?.cargo || 'Usuario'}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={onLogout}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 17L21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

export default TopBar