from flask import Blueprint, request, jsonify, current_app, g
from backend.utils.auth import auth_required
from datetime import datetime
import numbers

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        status_code = 500

bp = Blueprint('vehiculos', __name__)

def _normalize_placa(p: str) -> str:
    if not p:
        return p
    return p.strip().upper()

def _check_required_fields(payload: dict, required_fields: list) -> list:
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

def _has_write_permission(user: dict) -> bool:
    cargo = (user.get('cargo') or '').lower()
    return cargo in ('administrador', 'dispatcher')

def _is_admin(user: dict) -> bool:
    return (user.get('cargo') or '').lower() == 'administrador'

# CAMBIO: Con slash final para que url_prefix funcione correctamente
@bp.route('/', methods=['GET'])
@auth_required
def list_vehiculos():
    """Listar vehículos con búsqueda, paginación y filtros."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    q = request.args.get('search')
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    tipo = request.args.get('tipo')
    start = (page - 1) * per_page
    end = start + per_page - 1

    query = supabase.table('flota_vehiculos').select('*')
    
    if q:
        like_q = f'%{q}%'
        query = query.or_(f"placa.ilike.{like_q},marca.ilike.{like_q},modelo.ilike.{like_q}")
    if tipo:
        query = query.eq('tipo', tipo)

    query = query.is_('deleted_at', None)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar vehículos: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener listado'}), 500

    try:
        count_res = supabase.table('flota_vehiculos').select('id', count='exact').is_('deleted_at', None).execute()
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


@bp.route('/<int:veh_id>', methods=['GET'])
@auth_required
def get_vehiculo(veh_id):
    """Obtener un vehículo por ID."""
    supabase = current_app.config.get('SUPABASE')
    
    try:
        res = supabase.table('flota_vehiculos').select('*').eq('id', veh_id).is_('deleted_at', None).limit(1).execute()
        rows = res.data or []
        if not rows:
            return jsonify({'message': f'Vehículo con ID {veh_id} no encontrado o ha sido eliminado'}), 404
        return jsonify({'data': rows[0]})
    except Exception as e:
        current_app.logger.error(f"Error al obtener vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener el vehículo'}), 500


# CAMBIO: Con slash final
@bp.route('/', methods=['POST'])
@auth_required
def create_vehiculo():
    """Crear un nuevo vehículo en la flota."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear vehículos'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    required_fields = ['placa', 'marca', 'modelo', 'ano', 'tipo']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    placa_norm = _normalize_placa(payload.get('placa'))
    
    try:
        ano_val = int(payload.get('ano'))
    except (TypeError, ValueError):
        return jsonify({'message': 'El campo "ano" debe ser un número entero válido.'}), 400

    row = {
        'placa': placa_norm,
        'vin': payload.get('vin'),
        'marca': payload.get('marca'),
        'modelo': payload.get('modelo'),
        'ano': ano_val,
        'tipo': payload.get('tipo'),
        'color': payload.get('color'),
        'capacidad_pasajeros': int(payload.get('capacidad_pasajeros')) if payload.get('capacidad_pasajeros') is not None else None,
        'capacidad_kg': float(payload.get('capacidad_kg')) if payload.get('capacidad_kg') is not None else None,
        'numero_chasis': payload.get('numero_chasis'),
        'observaciones': payload.get('observaciones'),
        'metadata': payload.get('metadata') or {}
    }

    try:
        res = supabase.table('flota_vehiculos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST): {e}")
        if 'duplicate key' in str(e).lower() or e.status_code == 409:
             return jsonify({'message': f'La placa "{placa_norm}" ya existe en la base de datos.'}), 409
        return jsonify({'message': 'Error en la base de datos al crear vehículo', 'detail': str(e)}), e.status_code if e.status_code else 500
    except Exception as e:
        current_app.logger.error(f"Error al crear vehículo: {e}")
        return jsonify({'message': 'Error inesperado al crear vehículo', 'detail': str(e)}), 500


@bp.route('/<int:veh_id>', methods=['PUT'])
@auth_required
def update_vehiculo(veh_id):
    """Actualizar un vehículo existente por ID."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden actualizar vehículos'}), 403

    payload = request.get_json() or {}
    updates = {}
    
    allowed_fields = {
        'placa': lambda p: _normalize_placa(p) if p else None,
        'vin': str, 'marca': str, 'modelo': str, 'tipo': str, 'color': str, 
        'numero_chasis': str, 'observaciones': str, 'metadata': lambda m: m if isinstance(m, dict) else {},
        'ano': int, 'capacidad_pasajeros': int, 'capacidad_kg': float
    }

    for field, field_type in allowed_fields.items():
        if field in payload:
            value = payload.get(field)
            if value is not None and field_type in (int, float):
                try:
                    updates[field] = field_type(value)
                except (ValueError, TypeError):
                    return jsonify({'message': f'El campo "{field}" debe ser un valor numérico válido.'}), 400
            elif field == 'placa':
                updates[field] = _normalize_placa(value)
            else:
                updates[field] = value

    if not updates:
        return jsonify({'message': 'No se proporcionaron campos válidos para actualizar.'}), 400

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculos').update(updates).eq('id', veh_id).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Vehículo con ID {veh_id} no encontrado para actualizar'}), 404
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (PUT): {e}")
        if 'duplicate key' in str(e).lower() or e.status_code == 409:
             return jsonify({'message': f'La placa actualizada ya está en uso.'}), 409
        return jsonify({'message': 'Error en la base de datos al actualizar vehículo', 'detail': str(e)}), e.status_code if e.status_code else 500
    except Exception as e:
        current_app.logger.error(f"Error inesperado al actualizar vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error inesperado al actualizar vehículo', 'detail': str(e)}), 500


@bp.route('/<int:veh_id>', methods=['DELETE'])
@auth_required
def delete_vehiculo(veh_id):
    """Eliminar (soft-delete) un vehículo por ID."""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador puede eliminar vehículos permanentemente'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculos').update({'deleted_at': datetime.now().isoformat()}).eq('id', veh_id).execute()
        
        if res.data:
            return jsonify({'message': f'Vehículo {veh_id} marcado como eliminado (soft-delete).'}), 200
        return jsonify({'message': 'Vehículo no encontrado para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete del vehículo', 'detail': str(e)}), 500