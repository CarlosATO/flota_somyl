import { useState } from 'react'
import './Sidebar.css'

function Sidebar({ user, onLogout, onNavigate }){
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`sidebar ${collapsed? 'collapsed':''}`}>
      <div className="sidebar-top">
        <div className="brand">Flotas</div>
        <button className="collapse-btn" onClick={()=>setCollapsed(!collapsed)}>{collapsed? '☰':'✕'}</button>
      </div>

      <nav className="menu">
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('dashboard')}>Dashboard</a>
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('vehiculos')}>Vehículos</a>
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('conductores')}>Conductores</a>
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('viajes')}>Viajes</a>
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('mantenimiento')}>Mantenimiento</a>
        <a className="menu-item" onClick={()=>onNavigate && onNavigate('reportes')}>Reportes</a>
      </nav>

      <div className="sidebar-footer">
        {user ? <div className="user-info">{user.nombre || user.correo}</div> : <div className="user-info">No conectado</div>}
        <button className="btn" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </aside>
  )
}

export default Sidebar
