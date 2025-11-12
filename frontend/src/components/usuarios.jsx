import { useState, useEffect, useMemo } from 'react'
import './Usuarios.css'
import { apiFetch } from '../lib/api'

const ESTATUS_OPTIONS = ['activo', 'inactivo', 'suspendido']
const CARGO_OPTIONS = ['Administrador', 'Dispatcher', 'Conductor', 'Mecanico']

function Usuarios({ user, token }) {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, pages: 1 })
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtroEstatus, setFiltroEstatus] = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUsuario, setEditingUsuario] = useState(null)
  const [deletingUsuario, setDeletingUsuario] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const isAdmin = useMemo(() => (user?.cargo || '').toLowerCase() === 'administrador', [user?.cargo])

  useEffect(() => {
    if (!isAdmin) return
    fetchUsuarios()
  }, [page, searchQuery, filtroEstatus, filtroCargo, isAdmin])

  const fetchUsuarios = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
      })
      if (searchQuery) params.append('search', searchQuery)
      if (filtroEstatus) params.append('estatus', filtroEstatus)
      if (filtroCargo) params.append('cargo', filtroCargo)

      const res = await apiFetch(`/api/usuarios?${params.toString()}`)
      if (res?.status === 200 && res.data) {
        setUsuarios(res.data.usuarios || [])
        setMeta(res.data.meta || { page: 1, per_page: 20, total: 0, pages: 1 })
      } else {
        setError(res?.data?.message || 'Error al cargar usuarios')
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingUsuario(null)
    setFormError(null)
    setShowModal(true)
  }

  const handleEdit = (usuario) => {
    setEditingUsuario(usuario)
    setFormError(null)
    setShowModal(true)
  }

  const handleDelete = (usuario) => {
    setDeletingUsuario(usuario)
  }

  const confirmDelete = async () => {
    if (!deletingUsuario) return
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/usuarios/${deletingUsuario.id}`, { method: 'DELETE' })
      if (res?.status === 200) {
        fetchUsuarios()
        setDeletingUsuario(null)
      } else {
        alert(res?.data?.message || 'Error al eliminar usuario')
      }
    } catch (err) {
      alert('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="usuarios-container">
        <div className="access-denied">
          <h2>⛔ Acceso Denegado</h2>
          <p>Solo los administradores pueden gestionar usuarios del sistema.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <div>
          <h2>👥 Gestión de Usuarios</h2>
          <p className="header-subtitle">Administra los usuarios del sistema</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          ➕ Nuevo Usuario
        </button>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, correo o RUT..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(1)
          }}
          className="search-input"
        />
        <select
          value={filtroEstatus}
          onChange={(e) => {
            setFiltroEstatus(e.target.value)
            setPage(1)
          }}
          className="filter-select"
        >
          <option value="">Todos los estados</option>
          {ESTATUS_OPTIONS.map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </select>
        <select
          value={filtroCargo}
          onChange={(e) => {
            setFiltroCargo(e.target.value)
            setPage(1)
          }}
          className="filter-select"
        >
          <option value="">Todos los cargos</option>
          {CARGO_OPTIONS.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="error-banner">⚠️ {error}</div>
      )}

      {loading ? (
        <div className="loading-state">Cargando usuarios...</div>
      ) : usuarios.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">👤</span>
          <p>No se encontraron usuarios</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>RUT</th>
                  <th>Correo</th>
                  <th>Cargo</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(usuario => (
                  <tr key={usuario.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {usuario.nombre.charAt(0).toUpperCase()}
                        </div>
                        <strong>{usuario.nombre}</strong>
                      </div>
                    </td>
                    <td><code>{usuario.rut}</code></td>
                    <td>{usuario.correo}</td>
                    <td>
                      <span className={`badge badge-cargo badge-cargo-${usuario.cargo?.toLowerCase()}`}>
                        {usuario.cargo}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-estatus badge-estatus-${usuario.estatus}`}>
                        {usuario.estatus}
                      </span>
                    </td>
                    <td>
                      {usuario.last_login
                        ? new Date(usuario.last_login).toLocaleString('es-CL')
                        : 'Nunca'}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-icon btn-edit"
                          onClick={() => handleEdit(usuario)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                        {usuario.id !== user?.id && (
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDelete(usuario)}
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary"
            >
              ← Anterior
            </button>
            <span className="page-info">
              Página {meta.page} de {meta.pages} ({meta.total} usuarios)
            </span>
            <button
              onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
              disabled={page >= meta.pages}
              className="btn btn-secondary"
            >
              Siguiente →
            </button>
          </div>
        </>
      )}

      {showModal && (
        <UsuarioModal
          usuario={editingUsuario}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            fetchUsuarios()
          }}
          formError={formError}
          setFormError={setFormError}
        />
      )}

      {deletingUsuario && (
        <ConfirmModal
          title="Eliminar Usuario"
          message={`¿Estás seguro de eliminar a ${deletingUsuario.nombre}? Esta acción no se puede deshacer.`}
          onConfirm={confirmDelete}
          onClose={() => setDeletingUsuario(null)}
          submitting={submitting}
        />
      )}
    </div>
  )
}

function UsuarioModal({ usuario, onClose, onSuccess, formError, setFormError }) {
  const [formData, setFormData] = useState({
    nombre: usuario?.nombre || '',
    rut: usuario?.rut || '',
    correo: usuario?.correo || '',
    cargo: usuario?.cargo || 'Conductor',
    estatus: usuario?.estatus || 'activo',
    password: ''
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)

    try {
      const url = usuario ? `/api/usuarios/${usuario.id}` : '/api/usuarios'
      const method = usuario ? 'PUT' : 'POST'

      const payload = { ...formData }
      if (usuario && !payload.password) {
        delete payload.password
      }

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      })

      if (res?.status === 200 || res?.status === 201) {
        onSuccess()
      } else {
        setFormError(res?.data?.message || 'Error al guardar usuario')
      }
    } catch (err) {
      setFormError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{usuario ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {formError && (
            <div className="form-error">⚠️ {formError}</div>
          )}

          <div className="form-group">
            <label>Nombre completo *</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              required
              placeholder="Juan Pérez"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>RUT *</label>
              <input
                type="text"
                value={formData.rut}
                onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                required
                placeholder="12345678-9"
                pattern="[0-9]{7,8}-[0-9kK]"
              />
              <small>Formato: 12345678-9</small>
            </div>

            <div className="form-group">
              <label>Correo *</label>
              <input
                type="email"
                value={formData.correo}
                onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                required
                placeholder="usuario@empresa.com"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cargo *</label>
              <select
                value={formData.cargo}
                onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                required
              >
                {CARGO_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Estado *</label>
              <select
                value={formData.estatus}
                onChange={(e) => setFormData({ ...formData, estatus: e.target.value })}
                required
              >
                {ESTATUS_OPTIONS.map(e => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Contraseña {usuario ? '(dejar vacío para mantener)' : '*'}</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!usuario}
              placeholder="Mínimo 6 caracteres"
              minLength={6}
            />
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Guardando...' : (usuario ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, onConfirm, onClose, submitting }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚠️ {title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={submitting} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={submitting} className="btn btn-danger">
            {submitting ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Usuarios