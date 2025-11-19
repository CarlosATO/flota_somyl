import os
from flask import Flask, jsonify, send_from_directory
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    # Si existe un build de Vite en ../frontend/dist, configuramos Flask para servirlo
    base_dir = os.path.abspath(os.path.dirname(__file__))
    dist_path = os.path.normpath(os.path.join(base_dir, '..', 'frontend', 'dist'))
    
    print(f"Base dir: {base_dir}")
    print(f"Looking for dist at: {dist_path}")
    print(f"Dist exists: {os.path.isdir(dist_path)}")
    if os.path.isdir(dist_path):
        print(f"Dist contents: {os.listdir(dist_path)}")
    
    if os.path.isdir(dist_path):
        app = Flask(__name__, static_folder=dist_path, static_url_path='')
        app.logger.info(f'🔷 Servidor en modo producción: sirviendo frontend estático desde {dist_path}')
    else:
        app = Flask(__name__)
        app.logger.warning(f'⚠️ No se encontró el directorio dist en {dist_path}')
    # Desactivar redirecciones automáticas (308/301) por trailing slashes que pueden eliminar headers
    app.url_map.strict_slashes = False
    CORS(app)

    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret')

    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    if SUPABASE_URL and SUPABASE_KEY:
        app.config['SUPABASE'] = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Inicializar cliente Supabase para la base de Proyectos si está configurada
    PROYECTOS_URL = os.environ.get('PROYECTOS_SUPABASE_URL')
    PROYECTOS_KEY = os.environ.get('PROYECTOS_SUPABASE_KEY')
    if PROYECTOS_URL and PROYECTOS_KEY:
        try:
            app.config['PROYECTOS_SUPABASE'] = create_client(PROYECTOS_URL, PROYECTOS_KEY)
            app.logger.info('✅ PROYECTOS_SUPABASE client creado y cacheado')
        except Exception as e:
            app.logger.error(f'❌ Error creando PROYECTOS_SUPABASE client: {e}')

    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "API funcionando!"})

    # Blueprint Auth
    try:
        from .modules.auth import bp as auth_bp
        app.register_blueprint(auth_bp, url_prefix='/auth')
        app.logger.info('✅ Blueprint auth registrado en /auth')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar auth: {e}')
        pass

    # Blueprint Ordenes
    try:
        from .modules.ordenes import bp as ordenes_bp
        app.register_blueprint(ordenes_bp, url_prefix='/api/ordenes')
        app.logger.info('✅ Blueprint ordenes registrado en /api/ordenes')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar ordenes: {e}') 
        pass

    # Blueprint Vehiculos
    try:
        from .modules.vehiculos import bp as vehiculos_bp
        app.register_blueprint(vehiculos_bp, url_prefix='/api/vehiculos')
        app.logger.info('✅ Blueprint vehiculos registrado en /api/vehiculos')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar vehiculos: {e}')
        pass
    
    # Blueprint Conductores
    try:
        from .modules.conductores import bp as conductores_bp
        app.register_blueprint(conductores_bp, url_prefix='/api/conductores')
        app.logger.info('✅ Blueprint conductores registrado en /api/conductores')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar conductores: {e}')
        pass

    # Blueprint Mantenimiento
    try:
        from .modules.mantenimiento import bp as mantenimiento_bp
        app.register_blueprint(mantenimiento_bp, url_prefix='/api/mantenimiento')
        app.logger.info('✅ Blueprint mantenimiento registrado en /api/mantenimiento')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar mantenimiento: {e}')
        pass

    # Blueprint Reportes
    try:
        from .modules.reportes import reportes_bp
        app.register_blueprint(reportes_bp, url_prefix='/api/reportes')
        app.logger.info('✅ Blueprint reportes registrado en /api/reportes')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar reportes: {e}')
        pass

    # Blueprint Combustible
    try:
        from .modules.combustible import bp as combustible_bp
        app.register_blueprint(combustible_bp, url_prefix='/api/combustible')
        app.logger.info('✅ Blueprint combustible registrado en /api/combustible')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar combustible: {e}')
        pass

    # Blueprint Adjuntos (nuevo módulo)
    try:
        from .modules.adjuntos import bp as adjuntos_bp
        app.register_blueprint(adjuntos_bp, url_prefix='/api/adjuntos')
        app.logger.info('✅ Blueprint adjuntos registrado en /api/adjuntos')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar adjuntos: {e}')
        pass

    # Blueprint Usuarios
    try:
        from .modules.usuarios import bp as usuarios_bp
        app.register_blueprint(usuarios_bp, url_prefix='/api/usuarios')
        app.logger.info('✅ Blueprint usuarios registrado en /api/usuarios')
    except Exception as e:
        app.logger.error(f'❌ Error al registrar usuarios: {e}')
        pass

    # Servir frontend compilado por Vite (SPA) si existe
    if app.static_folder and os.path.isdir(app.static_folder):
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve_frontend(path):
            # Evitar interferir con rutas de API y Auth
            if path.startswith('api/') or path.startswith('auth/'):
                return jsonify({'error': 'Not Found'}), 404
            
            # Si es un archivo estático (css, js, etc), intentar servirlo
            full_path = os.path.join(app.static_folder, path)
            if path and os.path.isfile(full_path):
                return send_from_directory(app.static_folder, path)
            
            # Para cualquier otra ruta, servir index.html (SPA routing)
            return send_from_directory(app.static_folder, 'index.html')
        
        app.logger.info('🔷 Rutas configuradas para servir SPA desde static_folder')
        app.logger.info(f'🔷 Static folder: {app.static_folder}')
    else:
        app.logger.warning('⚠️ No se configuraron rutas de frontend (static_folder no existe)')

    return app

app = create_app()