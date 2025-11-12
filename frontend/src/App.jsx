import { useState, useEffect } from 'react'
import Login from './components/Login'
import TopBar from './components/TopBar'
import Vehiculos from './components/Vehiculos'
import Conductores from './components/Conductores'
import Ordenes from './components/Ordenes'
import Mantenimiento from './components/Mantenimiento'
import Reportes from './components/Reportes'
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
        onNavigate={(m)=>setActiveModule(m)}
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
        {activeModule === 'reportes' && <Reportes user={user} token={token} />}
      </main>
    </div>
  )
}

export default App