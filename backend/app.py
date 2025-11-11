import os
from flask import Flask, jsonify
from supabase import create_client
from flask_cors import CORS
from dotenv import load_dotenv

# Cargar variables de entorno desde .env (si existe)
load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app)

    # configuración básica desde env
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret')

    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    if SUPABASE_URL and SUPABASE_KEY:
        app.config['SUPABASE'] = create_client(SUPABASE_URL, SUPABASE_KEY)

    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok", "message": "API funcionando!"})

    # registrar blueprints si existen
    try:
        from .modules.auth import bp as auth_bp
        app.register_blueprint(auth_bp, url_prefix='/auth')
    except Exception:
        pass

    try:
        from .modules.ordenes import bp as ordenes_bp
        app.register_blueprint(ordenes_bp, url_prefix='/api/ordenes')
    except Exception:
        pass

    # register vehiculos module (CRUD for vehicles)
    try:
        from .modules.vehiculos import bp as vehiculos_bp
        app.register_blueprint(vehiculos_bp, url_prefix='/api/vehiculos')
    except Exception:
        # if the module isn't present yet, ignore to allow incremental development
        pass
    return app

app = create_app()
