import { useState, useEffect } from 'react'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
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
    
    // Establecer el token ANTES de hacer el fetch
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
    return <div className="auth-root"><div className="auth-center">Cargando...</div></div>
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
    <div className="app-root">
      <Sidebar 
        user={user} 
        onLogout={handleLogout} 
        onNavigate={(m)=>setActiveModule(m)} 
      />
      <main className="main-content">
        {activeModule === 'dashboard' && (
          <div>
            <h2>Bienvenido, {user.nombre || user.correo}</h2>
            <p>Selecciona un módulo desde el menú lateral.</p>
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