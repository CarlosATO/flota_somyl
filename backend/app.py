import os
import jwt
from flask import Flask, jsonify, send_from_directory, request, redirect
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    # RUTA FIJA Y SEGURA (Gracias al cambio en Dockerfile)
    # En Railway siempre será esta. En local fallará si no creas la carpeta,
    # pero lo importante ahora es Producción.
    static_folder = '/app/public'
    
    print(f"🔍 INICIANDO FLOTA. Buscando frontend en: {static_folder}")

    if os.path.exists(static_folder) and os.listdir(static_folder):
        print(f"✅ CARPETA ENCONTRADA. Contenido: {os.listdir(static_folder)[:3]}...")
        app = Flask(__name__, static_folder=static_folder, static_url_path='')
    else:
        print(f"❌ ERROR CRÍTICO: La carpeta {static_folder} no existe o está vacía.")
        # Fallback para desarrollo local (opcional, por si pruebas en tu PC)
        local_dev = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
        if os.path.exists(local_dev):
             app = Flask(__name__, static_folder=local_dev, static_url_path='')
        else:
             app = Flask(__name__)

    # Configuración base
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

    # Health check
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "Flota API Online 5003"})

    # Registrar blueprints (mismo conjunto que antes)
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
            module = __import__(f".modules.{module_name}", fromlist=['bp'], level=1)
            app.register_blueprint(module.bp, url_prefix=prefix)
            print(f"🔹 Blueprint registrado: {module_name}")
        except Exception as e:
            print(f"⚠️ Error cargando módulo {module_name}: {e}")

    # Catch-all para SPA
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/') or path.startswith('auth/') or path.startswith('sso/'):
            return jsonify({'error': 'Not Found'}), 404

        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)

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