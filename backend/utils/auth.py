import os
import datetime
from functools import wraps

import jwt
from flask import current_app, request, jsonify, g
from werkzeug.security import check_password_hash


def _get_secret():
    return current_app.config.get('SECRET_KEY') or os.environ.get('SECRET_KEY')


def generate_token(user: dict, hours: int = 24) -> str:
    """Generate a JWT for the provided user dict (must contain 'id')."""
    secret = _get_secret()
    payload = {
        'user_id': user.get('id'),
        'nombre': user.get('nombre'),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=hours)
    }
    token = jwt.encode(payload, secret, algorithm='HS256')
    # PyJWT may return bytes in some versions
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token


def decode_token(token: str) -> dict | None:
    # 1. Intentamos obtener la LLAVE MAESTRA del SSO
    sso_secret = os.environ.get('JWT_SECRET_KEY')
    
    # 2. Intentamos obtener la llave local (por si acaso es un token viejo)
    local_secret = _get_secret()

    payload = None

    # INTENTO A: Probar con la Llave del SSO (Prioridad 1)
    if sso_secret:
        try:
            # OJO: El portal usa HS256
            payload = jwt.decode(token, sso_secret, algorithms=['HS256'])
            current_app.logger.info('✅ Token decodificado con llave SSO')
            return payload
        except jwt.ExpiredSignatureError:
            current_app.logger.warning('❌ Token SSO expirado')
            return None
        except jwt.InvalidSignatureError:
            # Si falla la firma, no pasa nada, probamos la siguiente llave
            pass
        except Exception as e:
            current_app.logger.warning(f'⚠️ Error decodificando SSO: {e}')

    # INTENTO B: Probar con la Llave Local (Prioridad 2 - Retrocompatibilidad)
    if local_secret:
        try:
            payload = jwt.decode(token, local_secret, algorithms=['HS256'])
            current_app.logger.info('✅ Token decodificado con llave Local')
            return payload
        except Exception as e:
            current_app.logger.warning(f'❌ Falló decodificación local: {e}')
    
    return None


def get_user_by_email(email: str) -> dict | None:
    """Look up a user by email (case-insensitive) from Supabase client in app config."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return None
    try:
        res = supabase.table('flota_usuarios').select('*').ilike('correo', email).limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def get_user_by_id(user_id: int) -> dict | None:
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return None
    try:
        res = supabase.table('flota_usuarios').select('*').eq('id', user_id).limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def authenticate(email: str, password: str) -> tuple[dict | None, str | None]:
    """Validate credentials against flota_usuarios. Returns (user, error_message)."""
    user = get_user_by_email(email)
    if not user:
        return None, 'Usuario no encontrado'
    pwd_hash = user.get('password_hash') or user.get('password')
    if not pwd_hash:
        return None, 'Usuario sin contraseña configurada'
    try:
        ok = check_password_hash(pwd_hash, password)
    except Exception:
        return None, 'Error verificando contraseña'
    if not ok:
        return None, 'Credenciales inválidas'

    # update last_login (best-effort)
    try:
        supabase = current_app.config.get('SUPABASE')
        if supabase:
            supabase.table('flota_usuarios').update({'last_login': datetime.datetime.utcnow().isoformat()}).eq('id', user.get('id')).execute()
    except Exception:
        pass

    return user, None


def get_user_from_token(token: str) -> dict | None:
    payload = decode_token(token)
    if not payload:
        return None
    
    # ESTRATEGIA HÍBRIDA:
    
    # 1. Si el token trae 'email' (Viene del Portal SSO)
    email_sso = payload.get('email')
    if email_sso:
        current_app.logger.info(f'🔎 Buscando usuario por Email SSO: {email_sso}')
        return get_user_by_email(email_sso)

    # 2. Si el token trae 'user_id' (Formato antiguo de Flota)
    user_id = payload.get('user_id')
    if user_id:
        return get_user_by_id(user_id)
        
    # 3. Si el token trae 'sub' (Estándar JWT, puede ser el ID)
    sub_id = payload.get('sub')
    if sub_id:
        # Intentamos ver si el 'sub' coincide con un ID local (si son enteros o UUID coincidentes)
        return get_user_by_id(sub_id)

    return None


def auth_required(func):
    """Decorator to protect routes. Sets `g.current_user` on success."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        
        # DEBUG
        current_app.logger.info(f'🔑 Header Authorization recibido: {auth[:50] if auth else "VACÍO"}...')
        
        if not auth.startswith('Bearer '):
            current_app.logger.warning('❌ Token no provisto o formato incorrecto')
            return jsonify({'message': 'Token no provisto'}), 401
        
        token = auth.split(' ', 1)[1]
        current_app.logger.info(f'🔍 Intentando decodificar token: {token[:20]}...')
        
        user = get_user_from_token(token)
        if not user:
            current_app.logger.warning('❌ Token inválido o usuario no encontrado')
            return jsonify({'message': 'Token inválido o expirado'}), 401
        
        current_app.logger.info(f'✅ Usuario autenticado: {user.get("correo")}')
        g.current_user = user
        return func(*args, **kwargs)

    return wrapper


def _has_write_permission(user: dict) -> bool:
    """Verifica si el usuario puede crear o modificar recursos.
    
    Args:
        user: Diccionario con información del usuario (debe contener 'cargo')
        
    Returns:
        True si el usuario es Administrador o Dispatcher, False en caso contrario
    """
    if not user:
        return False
    cargo = (user.get('cargo') or '').lower()
    return cargo in ('administrador', 'dispatcher')


def _is_admin(user: dict) -> bool:
    """Verifica si el usuario es Administrador.
    
    Args:
        user: Diccionario con información del usuario (debe contener 'cargo')
        
    Returns:
        True si el usuario es Administrador, False en caso contrario
    """
    if not user:
        return False
    cargo = (user.get('cargo') or '').lower()
    return cargo == 'administrador'