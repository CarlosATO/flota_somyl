import os
import jwt
from flask import Flask, jsonify, send_from_directory, request, redirect
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    # --- 1. CONFIGURACIÓN DE RUTAS (Alineado con tu Dockerfile) ---
    # En el Dockerfile movimos todo a /app/public. Esa es la fuente de la verdad.
    static_folder = '/app/public'
    
    print(f"🔍 INICIANDO. Buscando sitio web en: {static_folder}")
    
    if os.path.exists(static_folder) and os.listdir(static_folder):
        print(f"✅ SITIO ENCONTRADO. Contenido: {os.listdir(static_folder)[:3]}...")
        app = Flask(__name__, static_folder=static_folder, static_url_path='')
    else:
        print(f"❌ ERROR: No se encuentra el sitio en {static_folder}.")
        # Fallback para local
        local_dev = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
        if os.path.exists(local_dev):
             app = Flask(__name__, static_folder=local_dev, static_url_path='')
        else:
             app = Flask(__name__)

    # --- 2. CONFIGURACIONES BÁSICAS ---
    app.url_map.strict_slashes = False
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret')

    # Conexiones a Base de Datos
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
            print(f"⚠️ Error cliente Proyectos: {e}")

    # --- 3. RUTA HEALTH CHECK ---
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "API Online"})

    # --- 4. REGISTRO DE BLUEPRINTS (IMPORTACIÓN EXPLÍCITA) ---
    # Esta es la forma segura que no falla en Gunicorn
    try:
        from .modules.auth import bp as auth_bp
        app.register_blueprint(auth_bp, url_prefix='/auth')
        print("🔹 Modulo Auth cargado")

        from .modules.ordenes import bp as ordenes_bp
        app.register_blueprint(ordenes_bp, url_prefix='/api/ordenes')
        
        from .modules.vehiculos import bp as vehiculos_bp
        app.register_blueprint(vehiculos_bp, url_prefix='/api/vehiculos')
        
        from .modules.conductores import bp as conductores_bp
        app.register_blueprint(conductores_bp, url_prefix='/api/conductores')
        
        from .modules.mantenimiento import bp as mantenimiento_bp
        app.register_blueprint(mantenimiento_bp, url_prefix='/api/mantenimiento')
        
        from .modules.reportes import reportes_bp
        app.register_blueprint(reportes_bp, url_prefix='/api/reportes')
        
        from .modules.combustible import bp as combustible_bp
        app.register_blueprint(combustible_bp, url_prefix='/api/combustible')
        
        from .modules.adjuntos import bp as adjuntos_bp
        app.register_blueprint(adjuntos_bp, url_prefix='/api/adjuntos')
        
        from .modules.usuarios import bp as usuarios_bp
        app.register_blueprint(usuarios_bp, url_prefix='/api/usuarios')
        
        print("✅ Todos los módulos cargados correctamente")
    except Exception as e:
        print(f"❌ ERROR CRÍTICO CARGANDO MÓDULOS: {e}")
        import traceback
        traceback.print_exc()

    # --- 5. RUTA CATCH-ALL (FRONTEND) ---
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/') or path.startswith('auth/') or path.startswith('sso/'):
            return jsonify({'error': 'Not Found'}), 404

        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)

        return send_from_directory(app.static_folder, 'index.html')

    return app

# ==============================================================================
# INSTANCIA GLOBAL
# ==============================================================================
app = create_app()

@app.route('/sso/login')
def sso_receiver():
    token = request.args.get('token')
    if not token: return "Error: Token no recibido", 400

    email = ''
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        roles = payload.get('roles', {}) or {}
        if not roles.get('flota'):
             return "<h1>Acceso Denegado</h1><p>Sin permiso para Flota.</p>", 403
        email = payload.get('email', '')
    except:
        pass

    # Redirección a producción
    frontend_url = f"https://flota.datix.cl/login?sso_token={token}&sso_user={email}"
    return redirect(frontend_url)

if __name__ == '__main__':
    app.run(port=5003, debug=True)