from flask import Blueprint, request, jsonify, current_app, g
from werkzeug.security import generate_password_hash
from ..utils.auth import auth_required, _is_admin
import re

bp = Blueprint('usuarios', __name__)


def validate_rut(rut):
    """Valida formato RUT chileno: 12345678-9 o 1234567-K"""
    if not rut:
        return False
    pattern = r'^[0-9]{7,8}-[0-9kK]$'
    return bool(re.match(pattern, rut))


@bp.route('', methods=['GET'])
@auth_required
def list_usuarios():
    """Listar usuarios con paginación y filtros"""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Acceso denegado. Solo administradores.'}), 403

    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'message': 'Base de datos no configurada'}), 500

        # Parámetros
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        search = request.args.get('search', '').strip()
        estatus = request.args.get('estatus', '').strip()
        cargo = request.args.get('cargo', '').strip()

        offset = (page - 1) * per_page

        # Query base
        query = supabase.table('flota_usuarios').select('*', count='exact')

        # Filtros
        if search:
            query = query.or_(f'nombre.ilike.%{search}%,correo.ilike.%{search}%,rut.ilike.%{search}%')
        
        if estatus:
            query = query.eq('estatus', estatus)
        
        if cargo:
            query = query.eq('cargo', cargo)

        # Orden y paginación
        query = query.order('created_at', desc=True).range(offset, offset + per_page - 1)

        response = query.execute()

        usuarios = response.data
        total = response.count if hasattr(response, 'count') else len(usuarios)

        # Remover password_hash
        for u in usuarios:
            u.pop('password_hash', None)

        return jsonify({
            'usuarios': usuarios,
            'meta': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error listando usuarios: {e}')
        return jsonify({'message': 'Error al obtener usuarios'}), 500


@bp.route('/<int:usuario_id>', methods=['GET'])
@auth_required
def get_usuario(usuario_id):
    """Obtener un usuario específico"""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Acceso denegado'}), 403

    try:
        supabase = current_app.config.get('SUPABASE')
        response = supabase.table('flota_usuarios').select('*').eq('id', usuario_id).execute()

        if not response.data:
            return jsonify({'message': 'Usuario no encontrado'}), 404

        usuario = response.data[0]
        usuario.pop('password_hash', None)

        return jsonify({'usuario': usuario}), 200

    except Exception as e:
        current_app.logger.error(f'Error obteniendo usuario: {e}')
        return jsonify({'message': 'Error al obtener usuario'}), 500


@bp.route('', methods=['POST'])
@auth_required
def create_usuario():
    """Crear nuevo usuario"""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Acceso denegado. Solo administradores.'}), 403

    try:
        data = request.get_json() or {}

        # Validaciones
        nombre = data.get('nombre', '').strip()
        rut = data.get('rut', '').strip()
        correo = data.get('correo', '').strip().lower()
        password = data.get('password', '').strip()
        cargo = data.get('cargo', '').strip()
        estatus = data.get('estatus', 'activo').strip()

        if not all([nombre, rut, correo, password, cargo]):
            return jsonify({'message': 'Todos los campos son obligatorios'}), 400

        if not validate_rut(rut):
            return jsonify({'message': 'Formato de RUT inválido. Debe ser: 12345678-9'}), 400

        if len(password) < 6:
            return jsonify({'message': 'La contraseña debe tener al menos 6 caracteres'}), 400

        # Crear usuario
        supabase = current_app.config.get('SUPABASE')
        
        nuevo_usuario = {
            'nombre': nombre,
            'rut': rut,
            'correo': correo,
            'password_hash': generate_password_hash(password),
            'cargo': cargo,
            'estatus': estatus
        }

        response = supabase.table('flota_usuarios').insert(nuevo_usuario).execute()

        if not response.data:
            return jsonify({'message': 'Error al crear usuario'}), 500

        usuario_creado = response.data[0]
        usuario_creado.pop('password_hash', None)

        return jsonify({
            'message': 'Usuario creado exitosamente',
            'usuario': usuario_creado
        }), 201

    except Exception as e:
        error_msg = str(e)
        current_app.logger.error(f'Error creando usuario: {error_msg}')
        
        if 'duplicate' in error_msg.lower() or 'unique' in error_msg.lower():
            if 'rut' in error_msg.lower():
                return jsonify({'message': 'El RUT ya está registrado'}), 400
            if 'correo' in error_msg.lower() or 'email' in error_msg.lower():
                return jsonify({'message': 'El correo ya está registrado'}), 400
        
        return jsonify({'message': 'Error al crear usuario'}), 500


@bp.route('/<int:usuario_id>', methods=['PUT'])
@auth_required
def update_usuario(usuario_id):
    """Actualizar usuario"""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Acceso denegado'}), 403

    try:
        data = request.get_json() or {}
        supabase = current_app.config.get('SUPABASE')

        # Verificar que existe
        check = supabase.table('flota_usuarios').select('id').eq('id', usuario_id).execute()
        if not check.data:
            return jsonify({'message': 'Usuario no encontrado'}), 404

        # Preparar actualización
        updates = {}

        if 'nombre' in data:
            updates['nombre'] = data['nombre'].strip()
        if 'rut' in data:
            rut = data['rut'].strip()
            if not validate_rut(rut):
                return jsonify({'message': 'Formato de RUT inválido'}), 400
            updates['rut'] = rut
        if 'correo' in data:
            updates['correo'] = data['correo'].strip().lower()
        if 'cargo' in data:
            updates['cargo'] = data['cargo'].strip()
        if 'estatus' in data:
            updates['estatus'] = data['estatus'].strip()
        if 'password' in data and data['password'].strip():
            password = data['password'].strip()
            if len(password) < 6:
                return jsonify({'message': 'La contraseña debe tener al menos 6 caracteres'}), 400
            updates['password_hash'] = generate_password_hash(password)

        if not updates:
            return jsonify({'message': 'No hay cambios para actualizar'}), 400

        response = supabase.table('flota_usuarios').update(updates).eq('id', usuario_id).execute()

        if not response.data:
            return jsonify({'message': 'Error al actualizar usuario'}), 500

        usuario_actualizado = response.data[0]
        usuario_actualizado.pop('password_hash', None)

        return jsonify({
            'message': 'Usuario actualizado exitosamente',
            'usuario': usuario_actualizado
        }), 200

    except Exception as e:
        error_msg = str(e)
        current_app.logger.error(f'Error actualizando usuario: {error_msg}')
        
        if 'duplicate' in error_msg.lower() or 'unique' in error_msg.lower():
            if 'rut' in error_msg.lower():
                return jsonify({'message': 'El RUT ya está registrado'}), 400
            if 'correo' in error_msg.lower():
                return jsonify({'message': 'El correo ya está registrado'}), 400
        
        return jsonify({'message': 'Error al actualizar usuario'}), 500


@bp.route('/<int:usuario_id>', methods=['DELETE'])
@auth_required
def delete_usuario(usuario_id):
    """Eliminar usuario"""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Acceso denegado'}), 403

    # No permitir auto-eliminación
    if user.get('id') == usuario_id:
        return jsonify({'message': 'No puedes eliminar tu propio usuario'}), 400

    try:
        supabase = current_app.config.get('SUPABASE')

        # Verificar que existe
        check = supabase.table('flota_usuarios').select('id').eq('id', usuario_id).execute()
        if not check.data:
            return jsonify({'message': 'Usuario no encontrado'}), 404

        # Eliminar
        supabase.table('flota_usuarios').delete().eq('id', usuario_id).execute()

        return jsonify({'message': 'Usuario eliminado exitosamente'}), 200

    except Exception as e:
        current_app.logger.error(f'Error eliminando usuario: {e}')
        return jsonify({'message': 'Error al eliminar usuario'}), 500