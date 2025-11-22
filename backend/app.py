import os
import jwt
from flask import Flask, jsonify, send_from_directory, request, redirect
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    # --- 🔍 INICIO ZONA DE DIAGNÓSTICO ---
    import os
    print("\n" + "="*50)
    print("🕵️‍♂️ INICIANDO DIAGNÓSTICO DE ARCHIVOS EN RAILWAY")
    print(f"📂 Directorio actual (getcwd): {os.getcwd()}")
    
    paths_to_check = [
        '/app',
        '/app/frontend',
        '/app/frontend/dist',
        '/app/dist',
        'frontend/dist'
    ]
    
    for p in paths_to_check:
        if os.path.exists(p):
            try:
                contenido = os.listdir(p)
                print(f"✅ {p} EXISTE. Contiene ({len(contenido)} items): {contenido[:5]}...")
            except:
                print(f"✅ {p} EXISTE (No se pudo listar contenido)")
        else:
            print(f"❌ {p} NO EXISTE")
    print("="*50 + "\n")
    # --- 🔍 FIN ZONA DE DIAGNÓSTICO ---

    # --- 1. CONFIGURACIÓN DE RUTAS BLINDADA ---
    # En Railway, la ruta SIEMPRE es esta. No adivinamos.
    docker_dist = '/app/frontend/dist'
    local_dist = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    
    dist_path = None
    
    # Diagnóstico en logs
    print("--- INICIANDO DIAGNÓSTICO DE RUTAS ---")
    if os.path.exists(docker_dist):
        print(f"✅ MODO NUBE: Frontend encontrado en {docker_dist}")
        dist_path = docker_dist
    elif os.path.exists(local_dist):
        print(f"✅ MODO LOCAL: Frontend encontrado en {local_dist}")
        dist_path = local_dist
    else:
        print(f"❌ ERROR CRÍTICO: No se encuentra la carpeta 'dist'.")
        print(f"   Buscado en: {docker_dist} y {local_dist}")
        # Intentamos listar qué hay en /app/frontend para debug
        try:
            print(f"   Contenido de /app/frontend: {os.listdir('/app/frontend')}")
        except:
            pass
        # Usamos docker_dist por defecto para que no falle el inicio, aunque dé 404
        dist_path = docker_dist

    # Inicializamos Flask apuntando a esa carpeta
    app = Flask(__name__, static_folder=dist_path, static_url_path='')

    # --- 2. CONFIGURACIONES ---
    app.url_map.strict_slashes = False
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret')

    # Supabase
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    if SUPABASE_URL and SUPABASE_KEY:
        app.config['SUPABASE'] = create_client(SUPABASE_URL, SUPABASE_KEY)

    PROYECTOS_URL = os.environ.get('PROYECTOS_SUPABASE_URL')
    PROYECTOS_KEY = os.environ.get('PROYECTOS_SUPABASE_KEY')
    if PROYECTOS_URL and PROYECTOS_KEY:
        try:
            app.config['PROYECTOS_SUPABASE'] = create_client(PROYECTOS_URL, PROYECTOS_KEY)
        except Exception as e:
            app.logger.error(f'Error Proyectos DB: {e}')

    # --- 3. RUTA HEALTH CHECK ---
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "Flota API Online 5003"})

    # --- 4. REGISTRO DE BLUEPRINTS ---
    # (Usamos un bucle para limpiar el código, pero es lo mismo que tenías)
    modules = [
        ('auth', '/auth'),
        ('ordenes', '/api/ordenes'),
        ('vehiculos', '/api/vehiculos'),
        ('conductores', '/api/conductores'),
        ('mantenimiento', '/api/mantenimiento'),
        ('reportes', '/api/reportes'),
        ('combustible', '/api/combustible'),
        ('adjuntos', '/api/adjuntos'),
        ('usuarios', '/api/usuarios')
    ]

    for module_name, prefix in modules:
        try:
            # Importación dinámica para no llenar de try/except gigantes
            module = __import__(f".modules.{module_name}", fromlist=['bp'], level=1)
            app.register_blueprint(module.bp, url_prefix=prefix)
            print(f"🔹 Blueprint registrado: {module_name}")
        except Exception as e:
            print(f"⚠️ Error cargando módulo {module_name}: {e}")

    # --- 5. RUTA CATCH-ALL (PARA QUE REACT FUNCIONE) ---
    # Esta ruta atrapa todo lo que no sea API y devuelve el index.html
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        # Si es api o auth, dejamos que pase (o damos 404 si no existe)
        if path.startswith('api/') or path.startswith('auth/') or path.startswith('sso/'):
            return jsonify({'error': 'Not Found'}), 404

        # Servir archivos estáticos reales (js, css, imágenes)
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)

        # Para todo lo demás (ej: /login, /vehiculos), servir index.html
        if os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return send_from_directory(app.static_folder, 'index.html')
        else:
            return f"Error: No se encuentra el archivo index.html en {app.static_folder}", 404

    return app

# ==============================================================================
# ⚠️ ZONA CRÍTICA: ESTO FALTABA AL FINAL DEL ARCHIVO
# ==============================================================================

# 1. CREAR LA INSTANCIA GLOBAL (Sin esto, Gunicorn no arranca)
app = create_app()

# 2. RUTA DEL PUENTE SSO (Fuera de create_app para asegurar registro)
@app.route('/sso/login')
def sso_receiver():
    token = request.args.get('token')
    if not token: return "Error: Token no recibido", 400

    email = ''
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        roles = payload.get('roles', {}) or {}
        
        # Seguridad de Roles
        if not roles.get('flota'):
             return "<h1>Acceso Denegado</h1><p>Sin permiso para Flota.</p>", 403
        
        email = payload.get('email', '')
    except:
        pass

    # REDIRECCIÓN A PRODUCCIÓN
    frontend_url = f"https://flota.datix.cl/login?sso_token={token}&sso_user={email}"
    return redirect(frontend_url)

# Para correr en local con python run.py
if __name__ == '__main__':
    app.run(port=5003, debug=True)