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
    secret = _get_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except Exception:
        return None


def get_user_by_email(email: str) -> dict | None:
    """Look up a user by email (case-insensitive) from Supabase client in app config."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return None
    # use ilike for case-insensitive match
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
    user_id = payload.get('user_id')
    if not user_id:
        return None
    return get_user_by_id(user_id)


def auth_required(func):
    """Decorator to protect routes. Sets `g.current_user` on success."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'message': 'Token no provisto'}), 401
        token = auth.split(' ', 1)[1]
        user = get_user_from_token(token)
        if not user:
            return jsonify({'message': 'Token inválido o expirado'}), 401
        g.current_user = user
        return func(*args, **kwargs)

    return wrapper
