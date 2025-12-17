# 🚗 Sistema de Gestión de Flotas SOMYL

Sistema web completo para la gestión integral de flotas vehiculares, desarrollado con arquitectura moderna full-stack.

## 📋 Descripción

Aplicación web que permite administrar de manera eficiente una flota de vehículos, incluyendo:

- **Gestión de Vehículos**: Registro completo de unidades con placas, modelos, años, kilometraje y estados operativos
- **Órdenes de Trabajo**: Control de servicios y reparaciones con fechas, técnicos asignados y estados
- **Mantenimiento**: Programación y seguimiento de mantenimientos preventivos y correctivos
- **Control de Combustible**: Registro detallado de cargas con kilometraje, litros y costos
- **Gestión de Conductores**: Base de datos de conductores con licencias y asignaciones
- **Reportes y Análisis**: Generación de reportes detallados y métricas de la flota
- **Adjuntos y Documentación**: Almacenamiento de documentos, fotos e informes en la nube
- **Gestión de Usuarios**: Sistema de autenticación con roles y permisos

## 🛠️ Stack Tecnológico

### Backend
- **Flask 3.0.3**: Framework web de Python
- **Gunicorn 21.2.0**: Servidor WSGI para producción (4 workers)
- **Python 3.11**: Lenguaje de programación
- **Supabase**: Base de datos PostgreSQL y almacenamiento
- **PyJWT**: Autenticación basada en tokens
- **Flask-CORS**: Manejo de CORS para API REST

### Frontend
- **React 19**: Biblioteca de UI
- **Vite 5.4**: Build tool y dev server
- **React Router DOM**: Navegación SPA
- **Lucide React**: Iconos modernos
- **Supabase JS Client**: Integración con backend

### Infraestructura
- **Railway**: Plataforma de despliegue
- **Docker**: Containerización
- **Supabase Cloud**: Base de datos y storage
- **Git/GitHub**: Control de versiones

## 📁 Estructura del Proyecto

```
flotas/
├── backend/
│   ├── app.py                 # Aplicación Flask principal
│   ├── requirements.txt       # Dependencias Python
│   ├── modules/               # Módulos de la API
│   │   ├── auth.py           # Autenticación y login
│   │   ├── vehiculos.py      # Gestión de vehículos
│   │   ├── conductores.py    # Gestión de conductores
│   │   ├── ordenes.py        # Órdenes de trabajo
│   │   ├── mantenimiento.py  # Mantenimiento vehicular
│   │   ├── combustible.py    # Control de combustible
│   │   ├── reportes.py       # Generación de reportes
│   │   ├── adjuntos.py       # Manejo de archivos
│   │   └── usuarios.py       # Gestión de usuarios
│   └── utils/
│       └── auth.py           # Utilidades de autenticación
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Componente principal
│   │   ├── components/       # Componentes React
│   │   │   ├── Login.jsx
│   │   │   ├── Vehiculos.jsx
│   │   │   ├── Conductores.jsx
│   │   │   ├── Ordenes.jsx
│   │   │   ├── Mantenimiento.jsx
│   │   │   ├── Combustible.jsx
│   │   │   ├── Reportes.jsx
│   │   │   ├── Adjuntos.jsx
│   │   │   ├── Usuarios.jsx
│   │   │   └── TopBar.jsx
│   │   └── lib/
│   │       ├── api.js        # Cliente API
│   │       └── supabase.js   # Cliente Supabase
│   ├── package.json
│   └── vite.config.js
├── Dockerfile                 # Configuración Docker
├── .dockerignore
├── run.py                    # Script de desarrollo local
└── requirements.txt          # Dependencias raíz

```

## 🚀 Instalación y Desarrollo Local

## 🫀 Resumen Ejecutivo (Corazón)

Backend / Framework: Python + Flask (app inicializada en `backend/app.py`).

Dependencias clave: Flask, flask-cors, supabase (cliente Python), PyJWT, werkzeug, gunicorn y requests. (ver `requirements.txt`).

Identidad Actual (Login / Sesión)
- Autenticación: JWT emitido por `POST /auth/login` con PyJWT.
- Almacenamiento cliente: token guardado en `localStorage` (key: `token`) por el frontend (`Login.jsx`).
- Uso en peticiones: las llamadas protegidas usan header `Authorization: Bearer <token>`; el helper `frontend/src/lib/api.js` lo agrega automáticamente.
- Sesiones servidor: Stateless — no hay sesiones en servidor; `auth_required` valida token y setea `g.current_user`.

Base de Datos
- Proveedor: Supabase (Postgres) — cliente en `backend/app.py`.
- Tablas clave: `flota_usuarios`, `flota_vehiculos`, `flota_ordenes`, `flota_orden_adjuntos`, `flota_mantenimientos`, `flota_mantenimiento_adjuntos`.

Storage / Adjuntos
- Archivos almacenados en buckets de Supabase (ej.: `adjuntos_ordenes`).
- El backend intenta obtener `publicUrl` o un `signed_url` al exponer adjuntos; hay un proxy en `GET /api/adjuntos/download` que streama el archivo con `Content-Disposition` para forzar la descarga.

Permisos y Acceso
- El proyecto usa roles ('cargo') y helpers: `_has_write_permission`, `_is_admin` en `utils/auth.py`.
- `auth_required` protege la mayoría de endpoints REST.

Seguridad / Recomendaciones
- Considerar usar cookies HttpOnly con refresh tokens para reducir la exposición del JWT a XSS.
- Añadir `SameSite` y `Secure` si vacunas cookies; rotar keys y añadir logout server-side si se requiere seguridad avanzada.
- Añadir `Content-Security-Policy` y pruebas E2E para endpoints sensibles.

¿Quieres que agregue ejemplos curl para login y peticiones autenticadas? Están añadidos abajo.

### Ejemplos curl — login y petición protegida

1) Login (obtener token):

```bash
curl -s -X POST "http://localhost:5003/auth/login" \
   -H "Content-Type: application/json" \
   -d '{"email":"usuario@ejemplo.com","password":"tu-contraseña"}'
```

2) Probar endpoint protegido `/auth/me` con token:

```bash
TOKEN="<AQUI_TU_TOKEN>"
curl -s -X GET "http://localhost:5003/auth/me" \
   -H "Authorization: Bearer $TOKEN"
```

3) Descargar adjunto (proxy backend):

```bash
TOKEN="<AQUI_TU_TOKEN>"
curl -s -X GET "http://localhost:5003/api/adjuntos/download?path=mi/archivo.jpg&name=foto.jpg" \
   -H "Authorization: Bearer $TOKEN" -o foto.jpg
```


### Prerrequisitos
- Python 3.11+
- Node.js 18+
- Cuenta en Supabase
- Git

### 1. Clonar el Repositorio

```bash
git clone https://github.com/CarlosATO/flota_somyl.git
cd flotas
```

### 2. Configurar Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
# Backend
SECRET_KEY=tu_clave_secreta_aqui
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_service_role_key

# Frontend
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

### 3. Configurar Backend

```bash
# Crear entorno virtual
python -m venv .venv

# Activar entorno virtual
# En macOS/Linux:
source .venv/bin/activate
# En Windows:
.venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

### 4. Configurar Frontend

```bash
cd frontend
npm install
```

### 5. Ejecutar en Desarrollo

#### Opción A: Ejecutar todo con un comando
```bash
# Desde la raíz del proyecto
python run.py
```

#### Opción B: Ejecutar por separado

**Terminal 1 - Backend:**
```bash
cd backend
flask run --port=5003
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

La aplicación estará disponible en:
- Frontend: http://localhost:5173
- Backend: http://localhost:5003

## 🐳 Despliegue en Railway

### Paso 1: Preparar el Proyecto

El proyecto ya incluye los archivos necesarios:
- ✅ `Dockerfile` - Configuración de contenedor
- ✅ `.dockerignore` - Archivos excluidos del build
- ✅ Variables de entorno configuradas como ARG/ENV

### Paso 2: Crear Proyecto en Railway

1. Ir a [Railway.app](https://railway.app)
2. Iniciar sesión con GitHub
3. Click en **"New Project"**
4. Seleccionar **"Deploy from GitHub repo"**
5. Elegir el repositorio `flota_somyl`

### Paso 3: Configurar Variables de Entorno

En Railway, ir a **Variables** y agregar (sin comillas):

```
SECRET_KEY=660623ce10bed54d2d842190f9e98c52
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://meskxoyxhbvnataavkkh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://meskxoyxhbvnataavkkh.supabase.co
```

⚠️ **IMPORTANTE**: Las variables `VITE_*` deben estar configuradas ANTES del build para que se inyecten en el bundle de JavaScript.

### Paso 4: Configurar el Builder

Railway debería detectar automáticamente el Dockerfile. Si no:

1. Ir a **Settings**
2. En **Builder**, seleccionar **"Dockerfile"**
3. Guardar cambios

### Paso 5: Desplegar

1. Railway iniciará el build automáticamente
2. Proceso de build (1-2 minutos):
   - Instala dependencias Python
   - Copia frontend y ejecuta `npm install`
   - Ejecuta `npm run build` (inyecta variables VITE_*)
   - Copia backend
   - Crea imagen Docker
3. Una vez completado, la app estará en: `https://tu-app.up.railway.app`

### Paso 6: Verificar Despliegue

Revisar logs en Railway:
```
[INFO] Starting gunicorn 21.2.0
[INFO] Listening at: http://0.0.0.0:8080
[INFO] Using worker: sync
[INFO] Booting worker with pid: 2-5
```

### Troubleshooting Común

**Problema: Pantalla blanca o errores de variables**
- Solución: Verificar que las variables `VITE_*` estén configuradas y hacer un nuevo deploy

**Problema: Error en build de npm**
- Solución: Verificar compatibilidad de versiones en `package.json`
- Vite 5.x requiere Node.js 18+

**Problema: Errores de import en build**
- Solución: Verificar nombres de archivos (case-sensitive en Linux)
- Ejemplo: `usuarios.jsx` vs `Usuarios.jsx`

## 📊 Base de Datos Supabase

### Tablas Principales

- `vehiculos` - Registro de vehículos
- `conductores` - Información de conductores
- `ordenes` - Órdenes de trabajo
- `mantenimientos` - Historial de mantenimiento
- `combustible` - Registros de carga
- `usuarios` - Sistema de autenticación
- `adjuntos` - Referencias a archivos en storage

### Storage Buckets

- `vehiculos-fotos` - Imágenes de vehículos
- `ordenes-archivos` - Documentos de órdenes
- `mantenimiento-docs` - Documentación técnica

## 🔐 Seguridad

- Autenticación JWT con tokens seguros
- Variables de entorno para credenciales sensibles
- CORS configurado para dominios específicos
- Service Role Key solo en backend
- Anon Key expuesta solo para operaciones públicas permitidas

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/NuevaFuncionalidad`)
3. Commit cambios (`git commit -m 'Add: Nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/NuevaFuncionalidad`)
5. Abrir Pull Request

## 📝 Licencia

Este proyecto es privado y propietario de Carlos Alegría.

## 👥 Autor

**Carlos Alegría**
- GitHub: [@CarlosATO](https://github.com/CarlosATO)

## 🆘 Soporte

Para reportar problemas o solicitar nuevas funcionalidades, crear un issue en GitHub.

---
Para iniciar la APPS 
 
 python.run.py

**Versión:** 1.0.0  
**Última actualización:** Noviembre 2025
cd "/Users/carlosalegria/Desktop/Aplicaciones Carlos Alegria/flotas" && "/Users/carlosalegria/Desktop/Aplicaciones Carlos Alegria/flotas/.venv/bin/python" run.py