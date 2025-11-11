from flask import Blueprint, request, jsonify, current_app, g
from backend.utils.auth import auth_required
from datetime import datetime
import numbers

# Intenta importar la excepción específica de Supabase (postgrest-py)
# Esto es crucial para manejar conflictos de unicidad (409)
try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    # Fallback en caso de que la dependencia no esté exactamente así en el entorno
    class PostgrestAPIError(Exception):
        """Placeholder for Postgrest API Error."""
        status_code = 500

bp = Blueprint('vehiculos', __name__)

# --- UTILITIES ---

def _normalize_placa(p: str) -> str:
    """Normaliza la placa a mayúsculas y sin espacios."""
    if not p:
        return p
    return p.strip().upper()

def _check_required_fields(payload: dict, required_fields: list) -> list:
    """Verifica la presencia de campos requeridos y retorna los faltantes."""
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

def _has_write_permission(user: dict) -> bool:
    """Verifica si el usuario tiene permiso de escritura (crear/actualizar)."""
    # Usamos roles definidos para escritura. Administrador y Despachador (Dispatcher).
    cargo = (user.get('cargo') or '').lower()
    return cargo in ('administrador', 'dispatcher')

def _is_admin(user: dict) -> bool:
    """Verifica si el usuario es administrador (solo para eliminación)."""
    return (user.get('cargo') or '').lower() == 'administrador'

# --- API ENDPOINTS ---

@bp.route('/', methods=['GET'])
@auth_required
def list_vehiculos():
    """Listar vehículos con búsqueda, paginación y filtros."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        # En una aplicación real, esto se manejaría al inicio, pero se mantiene el chequeo.
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    q = request.args.get('search')
    # Validamos que page y per_page sean números válidos
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20)))) # Limitamos a 100
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    tipo = request.args.get('tipo')

    start = (page - 1) * per_page
    end = start + per_page - 1

    # 1. Definición de la consulta de datos
    query = supabase.table('flota_vehiculos').select('*')
    
    if q:
        # Optimización: usando Supabase 'or_' y `ilike`
        like_q = f'%{q}%'
        query = query.or_(f"placa.ilike.{like_q},marca.ilike.{like_q},modelo.ilike.{like_q}")
    if tipo:
        # Asumiendo que 'tipo' se relaciona directamente con una columna
        query = query.eq('tipo', tipo)

    # Excluir soft-deleted (MUY BIEN IMPLEMENTADO)
    query = query.is_('deleted_at', None)

    # 2. Obtener los datos paginados
    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar vehículos: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener listado'}), 500

    # 3. Obtener el total para paginación (usando count='exact')
    try:
        count_res = supabase.table('flota_vehiculos').select('id', count='exact').is_('deleted_at', None).execute()
        # El count viene en el atributo 'count' de la respuesta si se usa `execute()`
        total = count_res.count if hasattr(count_res, 'count') and count_res.count is not None else len(data)
    except Exception as e:
        # Si falla el conteo, se puede seguir con los datos, pero con total=None
        current_app.logger.warning(f"No se pudo obtener el conteo total: {e}")
        total = None

    return jsonify({'data': data, 'meta': {'page': page, 'per_page': per_page, 'total': total, 'pages': (total // per_page) + (1 if total % per_page > 0 else 0) if total is not None else None}})


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


@bp.route('/', methods=['POST'])
@auth_required
def create_vehiculo():
    """Crear un nuevo vehículo en la flota."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear vehículos'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    # 1. Validación de Campos Requeridos
    required_fields = ['placa', 'marca', 'modelo', 'ano', 'tipo']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    placa_norm = _normalize_placa(payload.get('placa'))
    
    # 2. Estructuración y tipado del registro
    try:
        # Forzamos que 'ano' sea un entero válido
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
        # Asegurar que los campos numéricos sean tratados como tal, si existen
        'capacidad_pasajeros': int(payload.get('capacidad_pasajeros')) if payload.get('capacidad_pasajeros') is not None else None,
        'capacidad_kg': numbers.Real(payload.get('capacidad_kg')) if payload.get('capacidad_kg') is not None else None,
        'numero_chasis': payload.get('numero_chasis'),
        'observaciones': payload.get('observaciones'),
        'metadata': payload.get('metadata') or {}
    }

    # 3. Inserción con manejo de errores específico
    try:
        res = supabase.table('flota_vehiculos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST): {e}")
        # Detectar error de unicidad, Supabase retorna 409 o 400 con un mensaje específico.
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
    
    # Lista de campos permitidos para actualización
    allowed_fields = {
        'placa': lambda p: _normalize_placa(p) if p else None,
        'vin': str, 'marca': str, 'modelo': str, 'tipo': str, 'color': str, 
        'numero_chasis': str, 'observaciones': str, 'metadata': lambda m: m if isinstance(m, dict) else {},
        # Campos numéricos
        'ano': int, 'capacidad_pasajeros': int, 'capacidad_kg': numbers.Real
    }

    # Construcción segura del diccionario de actualizaciones
    for field, field_type in allowed_fields.items():
        if field in payload:
            value = payload.get(field)
            if value is not None and field_type in (int, numbers.Real):
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
    # Solo Administrador puede eliminar.
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador puede eliminar vehículos permanentemente'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        # Se establece la fecha de eliminación a la hora actual
        res = supabase.table('flota_vehiculos').update({'deleted_at': datetime.now().isoformat()}).eq('id', veh_id).execute()
        
        if res.data:
            return jsonify({'message': f'Vehículo {veh_id} marcado como eliminado (soft-delete).'}), 200
        return jsonify({'message': 'Vehículo no encontrado para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete del vehículo', 'detail': str(e)}), 500