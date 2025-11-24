import './AccessDenied.css'

export default function AccessDenied() {
  return (
    <div className="access-denied-root">
      <div className="access-denied-card">
        <h1>Acceso Denegado</h1>
        <p>Esta aplicación se ha mudado al portal. Por favor, ingrese desde el portal oficial.</p>
        <div style={{marginTop: 20}}>
          <a className="btn-primary" href="https://portal.datix.cl/">Ir al Portal</a>
        </div>
      </div>
    </div>
  )
}
