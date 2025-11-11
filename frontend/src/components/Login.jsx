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
        // CRÍTICO: Guardar el token
        localStorage.setItem('token', data.token)
        console.log('✅ Token guardado:', data.token.substring(0, 20) + '...')
        // CAMBIO: Pasar tanto el user como el token
        onLogin(data.user, data.token)
      } else {
        setError(data.message || 'Error en login')
      }
    }catch(err){
      setError(String(err))
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="login-card">
      <h2>Iniciar sesión</h2>
      <form onSubmit={submit} className="login-form">
        <label>
          Email
          <input value={email} onChange={(e)=>setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn" disabled={loading}>{loading? 'Ingresando...':'Ingresar'}</button>
      </form>
    </div>
  )
}

export default Login