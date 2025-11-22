import os
import urllib.parse
import jwt
from flask import Flask, jsonify, send_from_directory, request, render_template_string, redirect
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()


def create_app():
    # 1. Definir rutas absolutas (Railway usa /app como raíz)
    # La carpeta dist está dentro de /app/frontend/dist
    docker_dist = '/app/frontend/dist'
    local_dist = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

    # 2. Forzar la detección
    if os.path.exists(docker_dist):
        dist_path = docker_dist
        print(f"🚀 MODO NUBE: Sirviendo frontend desde {dist_path}")
    elif os.path.exists(local_dist):
        dist_path = local_dist
        print(f"💻 MODO LOCAL: Sirviendo frontend desde {dist_path}")
    else:
        print("⚠️ ERROR: No encuentro la carpeta 'dist'. Creando app vacía.")
        dist_path = None

    # 3. Inicializar Flask con la ruta encontrada
    if dist_path:
        app = Flask(__name__, static_folder=dist_path, static_url_path='')
    else:
        app = Flask(__name__)

    # Configuración base
    app.url_map.strict_slashes = False
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret')

    # Configuración Supabase (si aplica)
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    if SUPABASE_URL and SUPABASE_KEY:
        app.config['SUPABASE'] = create_client(SUPABASE_URL, SUPABASE_KEY)

    PROYECTOS_URL = os.environ.get('PROYECTOS_SUPABASE_URL')
    PROYECTOS_KEY = os.environ.get('PROYECTOS_SUPABASE_KEY')
    if PROYECTOS_URL and PROYECTOS_KEY:
        try:
            app.config['PROYECTOS_SUPABASE'] = create_client(PROYECTOS_URL, PROYECTOS_KEY)
            app.logger.info('✅ PROYECTOS_SUPABASE client creado y cacheado')
        except Exception as e:
            app.logger.error(f'❌ Error creando PROYECTOS_SUPABASE client: {e}')

    # Blueprints y rutas API
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "API funcionando!"})

    # Registrar blueprints (se omiten fallos para que la app no caiga)
    try:
        from .modules.auth import bp as auth_bp
        app.register_blueprint(auth_bp, url_prefix='/auth')
        app.logger.info('✅ Blueprint auth registrado en /auth')
    except Exception as e:
        app.logger.warning(f'⚠️ auth blueprint no registrado: {e}')

    try:
        from .modules.ordenes import bp as ordenes_bp
        app.register_blueprint(ordenes_bp, url_prefix='/api/ordenes')
        app.logger.info('✅ Blueprint ordenes registrado en /api/ordenes')
    except Exception as e:
        app.logger.warning(f'⚠️ ordenes blueprint no registrado: {e}')

    try:
        from .modules.vehiculos import bp as vehiculos_bp
        app.register_blueprint(vehiculos_bp, url_prefix='/api/vehiculos')
        app.logger.info('✅ Blueprint vehiculos registrado en /api/vehiculos')
    except Exception as e:
        app.logger.warning(f'⚠️ vehiculos blueprint no registrado: {e}')

    try:
        from .modules.conductores import bp as conductores_bp
        app.register_blueprint(conductores_bp, url_prefix='/api/conductores')
        app.logger.info('✅ Blueprint conductores registrado en /api/conductores')
    except Exception as e:
        app.logger.warning(f'⚠️ conductores blueprint no registrado: {e}')

    try:
        from .modules.mantenimiento import bp as mantenimiento_bp
        app.register_blueprint(mantenimiento_bp, url_prefix='/api/mantenimiento')
        app.logger.info('✅ Blueprint mantenimiento registrado en /api/mantenimiento')
    except Exception as e:
        app.logger.warning(f'⚠️ mantenimiento blueprint no registrado: {e}')

    try:
        from .modules.reportes import reportes_bp
        app.register_blueprint(reportes_bp, url_prefix='/api/reportes')
        app.logger.info('✅ Blueprint reportes registrado en /api/reportes')
    except Exception as e:
        app.logger.warning(f'⚠️ reportes blueprint no registrado: {e}')

    try:
        from .modules.combustible import bp as combustible_bp
        app.register_blueprint(combustible_bp, url_prefix='/api/combustible')
        app.logger.info('✅ Blueprint combustible registrado en /api/combustible')
    except Exception as e:
        app.logger.warning(f'⚠️ combustible blueprint no registrado: {e}')

    try:
        from .modules.adjuntos import bp as adjuntos_bp
        app.register_blueprint(adjuntos_bp, url_prefix='/api/adjuntos')
        app.logger.info('✅ Blueprint adjuntos registrado en /api/adjuntos')
    except Exception as e:
        app.logger.warning(f'⚠️ adjuntos blueprint no registrado: {e}')

    try:
        from .modules.usuarios import bp as usuarios_bp
        app.register_blueprint(usuarios_bp, url_prefix='/api/usuarios')
        app.logger.info('✅ Blueprint usuarios registrado en /api/usuarios')
    except Exception as e:
        app.logger.warning(f'⚠️ usuarios blueprint no registrado: {e}')

    # 4. RUTA CATCH-ALL (Vital para que React funcione)
    if dist_path:
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve(path):
            # Ignorar rutas de API
            if path.startswith('api/') or path.startswith('auth/') or path.startswith('sso/'):
                return jsonify({'error': 'Not Found'}), 404

            # Servir archivos si existen
            if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
                return send_from_directory(app.static_folder, path)

            # Si no, servir el index.html (React Router)
            return send_from_directory(app.static_folder, 'index.html')

    return app

# 1. CREAR LA INSTANCIA (Vital para Gunicorn)
app = create_app()


# 2. RUTA SSO (El puente con el Portal)
@app.route('/sso/login')
def sso_receiver():
    token = request.args.get('token') or request.args.get('sso_token') or request.args.get('t')
    if not token:
        return "Error: Token no recibido", 400
    try:
        # Decodificar sin verificar firma aquí (solo para extraer campos)
        payload = jwt.decode(token, options={"verify_signature": False})
        roles = payload.get('roles', {}) or {}
        if not roles.get('flota'):
            return "<h1>Acceso Denegado</h1><p>Sin permiso para Flota.</p>", 403
        email = payload.get('email', '')
    except Exception:
        email = ''

    # REDIRECCIÓN A PRODUCCIÓN (encode para evitar problemas con caracteres especiales)
    sso_token_enc = urllib.parse.quote_plus(token)
    sso_user_enc = urllib.parse.quote_plus(email)
    frontend_url = f"https://flota.datix.cl/login?sso_token={sso_token_enc}&sso_user={sso_user_enc}"
    return redirect(frontend_url)

