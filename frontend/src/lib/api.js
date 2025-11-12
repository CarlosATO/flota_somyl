// Small fetch wrapper that automatically injects Authorization header (Bearer token)
export async function apiFetch(path, options = {}){
  const token = localStorage.getItem('token')
  
  // DEBUG: Log del token
  if(token){
    console.log('🔑 Token encontrado para', path, ':', token.substring(0, 20) + '...')
  } else {
    console.warn('⚠️ NO hay token para', path)
  }
  
  const opts = { ...options }
  opts.headers = opts.headers ? { ...opts.headers } : {}
  
  // default JSON content-type for non-GET when no body is FormData
  if(!opts.headers['Content-Type'] && opts.body && !(opts.body instanceof FormData)){
    opts.headers['Content-Type'] = 'application/json'
  }
  
  if(token){
    opts.headers['Authorization'] = `Bearer ${token}`
    console.log('✅ Header Authorization agregado')
  }

  // if body is an object and Content-Type is application/json, stringify
  if(opts.body && opts.headers['Content-Type'] === 'application/json' && typeof opts.body === 'object'){
    opts.body = JSON.stringify(opts.body)
  }

  console.log('📤 Fetch a:', path, 'con headers:', opts.headers)
  
  const res = await fetch(path, opts)
  const text = await res.text()
  
  console.log('📥 Respuesta de', path, '- Status:', res.status)
  
  // try parse json, otherwise return raw text
  try{
    const data = text ? JSON.parse(text) : null

    // Global handler: if token is invalid or expired, force logout
    // NOTA: Deshabilitado para permitir que componentes individuales manejen errores 401
    // if(res.status === 401){
    //   console.error('❌ Token inválido/expirado - redirigiendo a login')
    //   try{
    //     localStorage.removeItem('token')
    //   }catch(e){}
    //   if(typeof window !== 'undefined'){
    //     window.location.replace('/')
    //   }
    // }

    return { status: res.status, data }
  }catch(e){
    console.error('⚠️ Error parseando JSON:', e)
    return { status: res.status, data: text }
  }
}

export default apiFetch