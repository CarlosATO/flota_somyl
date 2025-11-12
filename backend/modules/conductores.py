from flask import Blueprint, request, jsonify, current_app, g
from ..utils.auth import auth_required
from datetime import datetime
import re

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

bp = Blueprint('conductores', __name__)

def _normalize_rut(rut: str) -> str:
    """Normaliza RUT eliminando puntos y dejando guión"""
    if not rut:
        return rut
    # Eliminar puntos y espacios, dejar solo números y guión
    rut = rut.strip().replace('.', '').replace(' ', '').upper()
    return rut

def _normalize_text(text: str) -> str:
    """Convierte texto a mayúsculas"""
    if not text:
        return text
    return text.strip().upper()

def _check_required_fields(payload: dict, required_fields: list) -> list:
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

def _has_write_permission(user: dict) -> bool:
    cargo = (user.get('cargo') or '').lower()
    return cargo in ('administrador', 'dispatcher')

def _is_admin(user: dict) -> bool:
    return (user.get('cargo') or '').lower() == 'administrador'

def _safe_date(value):
    """Convierte fecha de forma segura (formato: YYYY-MM-DD)"""
    if not value:
        return None
    # Si ya es una fecha válida, retornarla
    if isinstance(value, str) and re.match(r'^\d{4}-\d{2}-\d{2}$', value):
        return value
    return None


@bp.route('/', methods=['GET'])
@auth_required
def list_conductores():
    """Listar conductores con búsqueda, paginación y filtros."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    q = request.args.get('search')
    estado = request.args.get('estado')
    
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    query = supabase.table('flota_conductores').select('*')
    
    if q:
        like_q = f'%{q}%'
        query = query.or_(f"nombre.ilike.{like_q},apellido.ilike.{like_q},rut.ilike.{like_q},email.ilike.{like_q}")
    if estado:
        query = query.eq('estado', estado)

    query = query.is_('deleted_at', None).order('apellido', desc=False)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar conductores: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener listado'}), 500

    try:
        count_res = supabase.table('flota_conductores').select('id', count='exact').is_('deleted_at', None).execute()
        total = count_res.count if hasattr(count_res, 'count') and count_res.count is not None else len(data)
    except Exception as e:
        current_app.logger.warning(f"No se pudo obtener el conteo total: {e}")
        total = None

    return jsonify({
        'data': data, 
        'meta': {
            'page': page, 
            'per_page': per_page, 
            'total': total, 
            'pages': (total // per_page) + (1 if total % per_page > 0 else 0) if total is not None else None
        }
    })


@bp.route('/<int:conductor_id>', methods=['GET'])
@auth_required
def get_conductor(conductor_id):
    """Obtener un conductor por ID."""
    supabase = current_app.config.get('SUPABASE')
    
    try:
        res = supabase.table('flota_conductores').select('*').eq('id', conductor_id).is_('deleted_at', None).limit(1).execute()
        rows = res.data or []
        if not rows:
            return jsonify({'message': f'Conductor con ID {conductor_id} no encontrado o ha sido eliminado'}), 404
        return jsonify({'data': rows[0]})
    except Exception as e:
        current_app.logger.error(f"Error al obtener conductor {conductor_id}: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener el conductor'}), 500


@bp.route('/', methods=['POST'])
@auth_required
def create_conductor():
    """Crear un nuevo conductor."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear conductores'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    required_fields = ['nombre', 'apellido', 'rut']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    rut_norm = _normalize_rut(payload.get('rut'))
    
    row = {
        'nombre': _normalize_text(payload.get('nombre')),
        'apellido': _normalize_text(payload.get('apellido')),
        'rut': rut_norm,
        'licencia_numero': _normalize_text(payload.get('licencia_numero')) if payload.get('licencia_numero') else None,
        'licencia_tipo': _normalize_text(payload.get('licencia_tipo')) if payload.get('licencia_tipo') else None,
        'licencia_vencimiento': _safe_date(payload.get('licencia_vencimiento')),
        'telefono': payload.get('telefono'),
        'email': payload.get('email'),
        'direccion': _normalize_text(payload.get('direccion')) if payload.get('direccion') else None,
        'fecha_nacimiento': _safe_date(payload.get('fecha_nacimiento')),
        'fecha_ingreso': _safe_date(payload.get('fecha_ingreso')),
        'estado': payload.get('estado', 'ACTIVO'),
        'observaciones': payload.get('observaciones'),
    }

    try:
        res = supabase.table('flota_conductores').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST): {e}")
        error_str = str(e).lower()
        if 'duplicate key' in error_str or '23505' in error_str:
            if 'rut' in error_str:
                return jsonify({'message': f'El RUT "{rut_norm}" ya existe en la base de datos.'}), 409
            elif 'email' in error_str:
                return jsonify({'message': f'El email ya está registrado.'}), 409
        return jsonify({'message': 'Error en la base de datos al crear conductor', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear conductor: {e}")
        return jsonify({'message': 'Error inesperado al crear conductor', 'detail': str(e)}), 500


@bp.route('/<int:conductor_id>', methods=['PUT'])
@auth_required
def update_conductor(conductor_id):
    """Actualizar un conductor existente por ID."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden actualizar conductores'}), 403

    payload = request.get_json() or {}
    updates = {}
    
    if 'nombre' in payload:
        updates['nombre'] = _normalize_text(payload['nombre'])
    if 'apellido' in payload:
        updates['apellido'] = _normalize_text(payload['apellido'])
    if 'rut' in payload:
        updates['rut'] = _normalize_rut(payload['rut'])
    if 'licencia_numero' in payload:
        updates['licencia_numero'] = _normalize_text(payload['licencia_numero']) if payload['licencia_numero'] else None
    if 'licencia_tipo' in payload:
        updates['licencia_tipo'] = _normalize_text(payload['licencia_tipo']) if payload['licencia_tipo'] else None
    if 'licencia_vencimiento' in payload:
        fecha = _safe_date(payload['licencia_vencimiento'])
        updates['licencia_vencimiento'] = fecha if fecha else None
    if 'telefono' in payload:
        updates['telefono'] = payload['telefono']
    if 'email' in payload:
        updates['email'] = payload['email']
    if 'direccion' in payload:
        updates['direccion'] = _normalize_text(payload['direccion']) if payload['direccion'] else None
    if 'fecha_nacimiento' in payload:
        fecha = _safe_date(payload['fecha_nacimiento'])
        updates['fecha_nacimiento'] = fecha if fecha else None
    if 'fecha_ingreso' in payload:
        fecha = _safe_date(payload['fecha_ingreso'])
        updates['fecha_ingreso'] = fecha if fecha else None
    if 'estado' in payload:
        updates['estado'] = payload['estado']
    if 'observaciones' in payload:
        updates['observaciones'] = payload['observaciones']

    if not updates:
        return jsonify({'message': 'No se proporcionaron campos válidos para actualizar.'}), 400

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_conductores').update(updates).eq('id', conductor_id).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Conductor con ID {conductor_id} no encontrado para actualizar'}), 404
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (PUT): {e}")
        error_str = str(e).lower()
        if 'duplicate key' in error_str or '23505' in error_str:
            if 'rut' in error_str:
                return jsonify({'message': 'El RUT ya está en uso.'}), 409
            elif 'email' in error_str:
                return jsonify({'message': 'El email ya está registrado.'}), 409
        return jsonify({'message': 'Error en la base de datos al actualizar conductor', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error inesperado al actualizar conductor {conductor_id}: {e}")
        return jsonify({'message': 'Error inesperado al actualizar conductor', 'detail': str(e)}), 500


@bp.route('/<int:conductor_id>', methods=['DELETE'])
@auth_required
def delete_conductor(conductor_id):
    """Eliminar (soft-delete) un conductor por ID."""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador puede eliminar conductores'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_conductores').update({'deleted_at': datetime.now().isoformat()}).eq('id', conductor_id).execute()
        
        if res.data:
            return jsonify({'message': f'Conductor {conductor_id} marcado como eliminado (soft-delete).'}), 200
        return jsonify({'message': 'Conductor no encontrado para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar conductor {conductor_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete del conductor', 'detail': str(e)}), 500