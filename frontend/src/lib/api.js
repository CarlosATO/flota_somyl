// Small fetch wrapper that automatically injects Authorization header (Bearer token)
export async function apiFetch(path, options = {}){
  const token = localStorage.getItem('token')
  const opts = { ...options }
  opts.headers = opts.headers ? { ...opts.headers } : {}
  // default JSON content-type for non-GET when no body is FormData
  if(!opts.headers['Content-Type'] && opts.body && !(opts.body instanceof FormData)){
    opts.headers['Content-Type'] = 'application/json'
  }
  if(token){
    opts.headers['Authorization'] = `Bearer ${token}`
  }

  // if body is an object and Content-Type is application/json, stringify
  if(opts.body && opts.headers['Content-Type'] === 'application/json' && typeof opts.body === 'object'){
    opts.body = JSON.stringify(opts.body)
  }

  const res = await fetch(path, opts)
  const text = await res.text()
  // try parse json, otherwise return raw text
  try{
    const data = text ? JSON.parse(text) : null

    // Global handler: if token is invalid or expired, force logout and
    // redirect to login so the UI isn't stuck with unauthorized state.
    if(res.status === 401){
      try{
        localStorage.removeItem('token')
      }catch(e){}
      // give the app a chance to react (reload will remount App and show Login)
      if(typeof window !== 'undefined'){
        // Use replace to avoid polluting history
        window.location.replace('/')
      }
    }

    return { status: res.status, data }
  }catch(e){
    return { status: res.status, data: text }
  }
}

export default apiFetch
