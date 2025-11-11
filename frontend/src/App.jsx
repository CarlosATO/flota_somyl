import { useState, useEffect } from 'react'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import Vehiculos from './components/Vehiculos'
import './App.css'
import { apiFetch } from './lib/api'

function App(){
  const [user, setUser] = useState(null)
  const [activeModule, setActiveModule] = useState('dashboard')

  useEffect(()=>{
    const token = localStorage.getItem('token')
    if(!token) return
    ;(async ()=>{
      const res = await apiFetch('/auth/me')
      if(res && res.status === 200 && res.data && res.data.user){
        setUser(res.data.user)
      } else {
        localStorage.removeItem('token')
      }
    })()
  }, [])

  if (!user) {
    return (
      <div className="auth-root">
        <div className="auth-center">
          <Login onLogin={(u) => setUser(u)} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-root">
      <Sidebar 
        user={user} 
        onLogout={() => { localStorage.removeItem('token'); setUser(null); }} 
        onNavigate={(m)=>setActiveModule(m)} 
      />
      <main className="main-content">
        {activeModule === 'dashboard' && (
          <div>
            <h2>Bienvenido, {user.nombre || user.correo}</h2>
            <p>Selecciona un módulo desde el menú lateral.</p>
          </div>
        )}
        {activeModule === 'vehiculos' && <Vehiculos user={user} />}
        {activeModule === 'conductores' && <div><h2>Módulo Conductores</h2><p>Próximamente...</p></div>}
        {activeModule === 'viajes' && <div><h2>Módulo Viajes</h2><p>Próximamente...</p></div>}
        {activeModule === 'reportes' && <div><h2>Módulo Reportes</h2><p>Próximamente...</p></div>}
      </main>
    </div>
  )
}

export default App