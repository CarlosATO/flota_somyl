import { useState } from 'react'
import './Login.css'

function Login({ onLogin }){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) =>{
    e.preventDefault()
    setLoading(true)
    setError(null)
    try{
      const res = await fetch('/auth/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if(res.ok && data.token){
        localStorage.setItem('token', data.token)
        onLogin(data.user, data.token)
      } else {
        setError(data.message || 'Credenciales inválidas')
      }
    }catch(err){
      setError('Error de conexión con el servidor')
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      {/* Lado izquierdo - Imagen */}
      <div className="login-image-side">
        <div className="image-overlay">
          <div className="overlay-content">
            <h1 className="brand-title">Control de Flotas</h1>
            <p className="brand-tagline">Sistema de Gestión Integral de Vehículos</p>
          </div>
        </div>
      </div>

      {/* Lado derecho - Formulario */}
      <div className="login-form-side">
        <div className="form-container">
          <div className="form-header">
            <div className="logo-small">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M19 17H5C3.89543 17 3 16.1046 3 15V9C3 7.89543 3.89543 7 5 7H19C20.1046 7 21 7.89543 21 9V15C21 16.1046 20.1046 17 19 17Z" stroke="currentColor" strokeWidth="2"/>
                <circle cx="8" cy="9" r="1" fill="currentColor"/>
                <circle cx="16" cy="9" r="1" fill="currentColor"/>
              </svg>
            </div>
            <h2>Acceso a la plataforma</h2>
          </div>

          <form onSubmit={submit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Usuario</label>
              <input 
                id="email"
                type="email"
                value={email} 
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="correo@empresa.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <input 
                id="password"
                type="password"
                value={password} 
                onChange={(e)=>setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="error-message">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button className="btn-submit" type="submit" disabled={loading}>
              {loading ? 'Ingresando...' : 'Entrar'}
            </button>
          </form>

          <div className="form-footer">
            <p>© 2025 Sistema de Gestión de Flotas de Carlos Alegría</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login