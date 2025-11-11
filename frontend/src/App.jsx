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
    // on mount, if token exists, try to fetch /auth/me
    const token = localStorage.getItem('token')
    if(!token) return
    ;(async ()=>{
      const res = await apiFetch('/auth/me')
      if(res && res.status === 200 && res.data && res.data.user){
        setUser(res.data.user)
      } else {
        // invalid token? remove
        localStorage.removeItem('token')
      }
    })()
  }, [])

  // If no user, render only the Login view (full-screen). This ensures
  // the sidebar and app content are not accessible until authentication.
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
      <Sidebar user={user} onLogout={() => { localStorage.removeItem('token'); setUser(null); }} onNavigate={(m)=>setActiveModule(m)} />
      <main className="main-content">
        <div>
          <h2>Bienvenido, {user.nombre || user.correo}</h2>
          <p>Aquí irán los módulos de gestión de flota.</p>
        </div>
        {activeModule === 'vehiculos' && (
          <Vehiculos user={user} />
        )}
      </main>
    </div>
  )
}

export default App
