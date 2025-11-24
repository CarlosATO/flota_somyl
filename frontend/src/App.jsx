import { useState, useEffect } from 'react'
import Login from './components/Login'
import AccessDenied from './components/AccessDenied'
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
    // First check if the SSO redirect provided token params in the URL
    try {
      const params = new URLSearchParams(window.location.search)
      const ssoToken = params.get('sso_token')
      const ssoUser = params.get('sso_user')
      if (ssoToken) {
        // Keep compatibility: store both keys
        localStorage.setItem('authToken', ssoToken)
        localStorage.setItem('token', ssoToken)
        if (ssoUser) localStorage.setItem('userName', ssoUser)
        localStorage.setItem('tokenCreatedAt', Date.now().toString())
        // Remove params from URL without reloading
        const u = new URL(window.location.href)
        u.search = ''
        window.history.replaceState({}, document.title, u.toString())
      }
    } catch (err) {
      console.warn('Error parsing SSO params', err)
    }

    const savedToken = localStorage.getItem('authToken') || localStorage.getItem('token')
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
        localStorage.removeItem('authToken')
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

  // Portal-only mode: if enabled, don't show the local login UI and instead
  // show an informative 'Acceso Denegado' page that points users to the portal.
  const portalOnly = import.meta.env.VITE_PORTAL_ONLY === 'true' || import.meta.env.VITE_PORTAL_ONLY === true

  if (!user || !token) {
    if (portalOnly) {
      return <AccessDenied />
    }

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