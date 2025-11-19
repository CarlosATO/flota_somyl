import { useState, useEffect } from 'react'
import Login from './components/Login'
import TopBar from './components/TopBar'
import Vehiculos from './components/Vehiculos'
import Conductores from './components/Conductores'
import Ordenes from './components/Ordenes'
import Mantenimiento from './components/Mantenimiento'
import Reportes from './components/Reportes'
import Usuarios from './components/Usuarios'
import Combustible from './components/Combustible'
import Adjuntos from './components/Adjuntos'
import './App.css'
import { apiFetch } from './lib/api'

function App(){
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [activeModule, setActiveModule] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const savedToken = localStorage.getItem('token')
    if(!savedToken) {
      setLoading(false)
      return
    }
    
    setToken(savedToken)
    
    ;(async ()=>{
      const res = await apiFetch('/auth/me')
      if(res && res.status === 200 && res.data && res.data.user){
        setUser(res.data.user)
      } else {
        localStorage.removeItem('token')
        setToken(null)
      }
      setLoading(false)
    })()
  }, [])

  // Allow external components to trigger navigation via a CustomEvent
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e.detail || {};
        if (detail.module) {
          setActiveModule(detail.module);
        }
      } catch (err) {
        console.error('Error processing app-navigate event', err);
      }
    };
    window.addEventListener('app-navigate', handler);
    return () => window.removeEventListener('app-navigate', handler);
  }, []);

  const handleLogin = (userData, userToken) => {
    setUser(userData)
    setToken(userToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setToken(null)
    setActiveModule('dashboard')
  }

  // Navegación controlada: mantener dashboard sólo como pantalla inicial.
  const handleNavigate = (module) => {
    // Si intentan navegar a 'dashboard' desde la UI, ignorar.
    if (module === 'dashboard') return
    setActiveModule(module)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Cargando...</p>
      </div>
    )
  }

  if (!user || !token) {
    return (
      <div className="auth-root">
        <div className="auth-center">
          <Login onLogin={handleLogin} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <TopBar 
        user={user} 
        onLogout={handleLogout} 
        onNavigate={handleNavigate}
        activeModule={activeModule}
      />
      <main className="main-content">
        {activeModule === 'dashboard' && (
          <div className="dashboard-welcome">
            <h2>Bienvenido, {user.nombre || user.correo}</h2>
            <p>Selecciona un módulo desde el menú superior para comenzar.</p>
          </div>
        )}
        {activeModule === 'vehiculos' && <Vehiculos user={user} token={token} />}
        {activeModule === 'conductores' && <Conductores user={user} token={token} />}
        {activeModule === 'viajes' && <Ordenes user={user} token={token} />}
        {activeModule === 'mantenimiento' && <Mantenimiento user={user} token={token} />}
        {activeModule === 'combustible' && <Combustible user={user} token={token} />}
        {activeModule === 'usuarios' && <Usuarios user={user} token={token} />}
        
        {/* Reportes - Vista principal */}
        {activeModule === 'reportes' && <Reportes user={user} token={token} />}
        
        {/* Reportes - Cons. Documentos */}
        {activeModule === 'reportes-documentos' && <Adjuntos user={user} token={token} />}
        
        {/* Reportes - Análisis de Flota (Por ahora muestra Reportes, puedes crear componente nuevo) */}
        {activeModule === 'reportes-flota' && (
          <div className="dashboard-welcome">
            <h2>Análisis de Flota</h2>
            <p>Módulo en desarrollo...</p>
          </div>
        )}
        
        {/* Reportes - Mantenimientos (Por ahora muestra mensaje, puedes crear componente nuevo) */}
        {activeModule === 'reportes-mantenimientos' && (
          <div className="dashboard-welcome">
            <h2>Reportes de Mantenimientos</h2>
            <p>Módulo en desarrollo...</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App