from flask import Blueprint, request, jsonify, g
from ..utils.auth import authenticate, generate_token, auth_required
from datetime import datetime, timedelta

bp = Blueprint('auth', __name__)


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email') or data.get('correo')
    password = data.get('password')
    if not email or not password:
        return jsonify({"message": "Faltan credenciales"}), 400

    user, err = authenticate(email, password)
    if err:
        return jsonify({"message": err}), 401

    token = generate_token(user)
    # Do not return password hash
    user_safe = {k: v for k, v in user.items() if k not in ('password_hash', 'password')}

    return jsonify({"success": True, "token": token, "user": user_safe})


@bp.route('/me', methods=['GET'])
@auth_required
def me():
    # `auth_required` sets g.current_user
    user = g.get('current_user')
    if not user:
        return jsonify({'message': 'Usuario no encontrado'}), 404
    user_safe = {k: v for k, v in user.items() if k not in ('password_hash', 'password')}
    return jsonify({'user': user_safe})
