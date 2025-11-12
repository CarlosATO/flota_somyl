# En: backend/modules/mantenimiento.py

# === 1. IMPORTS ===
from flask import Blueprint, request, jsonify, current_app, g
from ..utils.auth import auth_required, _has_write_permission, _is_admin
from datetime import datetime

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

# === 2. DEFINICIÓN DEL BLUEPRINT ===
bp = Blueprint('mantenimiento', __name__)

# === 3. HELPERS ===

def _safe_int(value):
    if value is None or value == '':
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None

def _safe_float(value):
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

def _safe_date(value):
    """Convierte fecha de forma segura (formato: YYYY-MM-DD)"""
    if not value:
        return None
    try:
        # Intenta parsear como fecha de Supabase (solo fecha) o ISO si incluye hora
        if isinstance(value, str) and 'T' in value:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.date().isoformat()
        if isinstance(value, str):
            return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
        return None
    except (ValueError, TypeError):
        current_app.logger.warning(f"Fecha inválida para mantenimiento: {value}")
        return None
        
def _check_required_fields(payload: dict, required_fields: list) -> list:
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

# === 4. RUTAS DEL MÓDULO MANTENIMIENTO ===

@bp.route('/', methods=['GET'])
@auth_required
def list_mantenimientos():
    """Listar órdenes de mantenimiento con filtros."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración'}), 500

    q = request.args.get('search')
    estado = request.args.get('estado')
    vehiculo_id = request.args.get('vehiculo_id')

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    # Incluir datos del vehículo mediante join implícito de Supabase
    query = supabase.table('flota_mantenimientos').select(
        '*, vehiculo:flota_vehiculos(placa, marca, modelo)'
    ).is_('deleted_at', None) # Solo mostrar los no eliminados
    
    if q:
        like_q = f'%{q}%'
        query = query.or_(f"descripcion.ilike.{like_q},observaciones.ilike.{like_q}")
    if estado:
        query = query.eq('estado', estado)
    if vehiculo_id:
        # Asegurar que sea un número para la consulta
        try:
            veh_id_int = int(vehiculo_id)
            query = query.eq('vehiculo_id', veh_id_int)
        except ValueError:
            pass # Ignorar filtro si es inválido

    query = query.order('fecha_programada', desc=True)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar mantenimientos: {e}")
        return jsonify({'message': 'Error en la base de datos', 'detail': str(e)}), 500

    try:
        # Conteo total (ignora deleted_at para el conteo, asumir que el filtro principal lo hará)
        count_query = supabase.table('flota_mantenimientos').select('id', count='exact').is_('deleted_at', None)
        if q:
            like_q = f'%{q}%'
            count_query = count_query.or_(f"descripcion.ilike.{like_q},observaciones.ilike.{like_q}")
        if estado:
            count_query = count_query.eq('estado', estado)
        if vehiculo_id:
            try:
                veh_id_int = int(vehiculo_id)
                count_query = count_query.eq('vehiculo_id', veh_id_int)
            except ValueError:
                pass
            
        count_res = count_query.execute()
        total = count_res.count if hasattr(count_res, 'count') else None
    except Exception as e:
        current_app.logger.warning(f"No se pudo obtener conteo: {e}")
        total = None

    return jsonify({
        'data': data, 
        'meta': {
            'page': page, 
            'per_page': per_page, 
            'total': total, 
            'pages': (total // per_page) + (1 if total % per_page > 0 else 0) if total else None
        }
    })

@bp.route('/', methods=['POST'])
@auth_required
def create_mantenimiento():
    """Crear una nueva orden de mantenimiento."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear mantenimientos'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    required_fields = ['vehiculo_id', 'descripcion', 'fecha_programada']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    row = {
        'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
        'descripcion': payload.get('descripcion'),
        'tipo_mantenimiento': payload.get('tipo_mantenimiento', 'PREVENTIVO'),
        'fecha_programada': _safe_date(payload.get('fecha_programada')),
        'km_programado': _safe_int(payload.get('km_programado')),
        'estado': payload.get('estado', 'PENDIENTE'),
        'costo': _safe_float(payload.get('costo')),
        'fecha_realizacion': _safe_date(payload.get('fecha_realizacion')),
        'km_realizacion': _safe_int(payload.get('km_realizacion')),
        'observaciones': payload.get('observaciones'),
    }

    try:
        res = supabase.table('flota_mantenimientos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST Mantenimiento): {e}")
        return jsonify({'message': 'Error en la base de datos al crear mantenimiento', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear mantenimiento: {e}")
        return jsonify({'message': 'Error inesperado al crear mantenimiento', 'detail': str(e)}), 500

@bp.route('/<int:mant_id>', methods=['PUT'])
@auth_required
def update_mantenimiento(mant_id):
    """Actualizar una orden de mantenimiento existente."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}
    updates = {}
    
    campos_simples = ['descripcion', 'tipo_mantenimiento', 'estado', 'observaciones']
    for key in campos_simples:
        if key in payload: updates[key] = payload[key]
    
    if 'vehiculo_id' in payload: updates['vehiculo_id'] = _safe_int(payload['vehiculo_id'])
    if 'km_programado' in payload: updates['km_programado'] = _safe_int(payload['km_programado'])
    if 'km_realizacion' in payload: updates['km_realizacion'] = _safe_int(payload['km_realizacion'])
    if 'costo' in payload: updates['costo'] = _safe_float(payload['costo'])
        
    if 'fecha_programada' in payload: updates['fecha_programada'] = _safe_date(payload['fecha_programada'])
    if 'fecha_realizacion' in payload: updates['fecha_realizacion'] = _safe_date(payload['fecha_realizacion'])

    if not updates:
        return jsonify({'message': 'No hay cambios'}), 400

    try:
        res = supabase.table('flota_mantenimientos').update(updates).eq('id', mant_id).is_('deleted_at', None).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Mantenimiento {mant_id} no encontrado'}), 404
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (PUT Mantenimiento): {e}")
        return jsonify({'message': 'Error en la base de datos al actualizar', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al actualizar mantenimiento: {e}")
        return jsonify({'message': 'Error inesperado al actualizar', 'detail': str(e)}), 500

@bp.route('/<int:mant_id>', methods=['DELETE'])
@auth_required
def delete_mantenimiento(mant_id):
    """Eliminar (soft-delete) una orden de mantenimiento (solo Admin)."""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador puede eliminar mantenimientos'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        # Soft-delete: actualizamos deleted_at
        res = supabase.table('flota_mantenimientos').update({'deleted_at': datetime.now().isoformat()}).eq('id', mant_id).execute()
        
        if res.data:
            return jsonify({'message': f'Mantenimiento {mant_id} marcado como eliminado.'}), 200
        return jsonify({'message': 'Mantenimiento no encontrado para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar mantenimiento {mant_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete', 'detail': str(e)}), 500


# === RUTAS DE ADJUNTOS PARA MANTENIMIENTO ===

@bp.route('/<int:mant_id>/adjuntos', methods=['GET'])
@auth_required
def list_mant_adjuntos(mant_id):
    """Lista adjuntos de una orden de mantenimiento."""
    supabase = current_app.config.get('SUPABASE')
    try:
        # Consulta la nueva tabla
        res = supabase.table('flota_mantenimiento_adjuntos').select('*') \
            .eq('mantenimiento_id', mant_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        current_app.logger.error(f"Error al listar adjuntos de mantenimiento {mant_id}: {e}")
        return jsonify({'message': 'Error al obtener adjuntos de mantenimiento'}), 500


@bp.route('/<int:mant_id>/adjuntos', methods=['POST'])
@auth_required
def add_mant_adjunto(mant_id):
    """Agrega un registro de adjunto a una orden de mantenimiento."""
    user = g.get('current_user')
    if not _has_write_permission(user):
         return jsonify({'message': 'Permisos insuficientes'}), 403

    payload = request.get_json() or {}
    storage_path = payload.get('storage_path')
    if not storage_path:
        return jsonify({'message': 'Falta storage_path'}), 400

    row = {
        'mantenimiento_id': mant_id,
        'usuario_id': user.get('id'),
        'storage_path': storage_path,
        'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'),
        'observacion': payload.get('observacion'),
    }
    supabase = current_app.config.get('SUPABASE')
    try:
        # Inserta en la nueva tabla
        res = supabase.table('flota_mantenimiento_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception as e:
        current_app.logger.error(f"Error al guardar adjunto de mantenimiento: {e}")
        return jsonify({'message': 'Error al guardar adjunto de mantenimiento'}), 500


@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_mant_adjunto(adjunto_id):
    """Elimina un registro de adjunto y su archivo de Storage."""
    user = g.get('current_user')
    if not _has_write_permission(user):
         return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    storage_path = None

    # 1. Obtener el path del archivo de Storage (desde la nueva tabla)
    try:
        res = supabase.table('flota_mantenimiento_adjuntos').select('storage_path') \
            .eq('id', adjunto_id).limit(1).execute()
        if not res.data:
            return jsonify({'message': 'Adjunto de mantenimiento no encontrado'}), 404
        storage_path = res.data[0].get('storage_path')
    except Exception as e:
        return jsonify({'message': 'Error al buscar adjunto de mantenimiento'}), 500

    # 2. Borrar el registro de la DB
    try:
        supabase.table('flota_mantenimiento_adjuntos').delete().eq('id', adjunto_id).execute()
    except Exception as e:
        return jsonify({'message': 'Error al borrar registro de adjunto'}), 500

    # 3. Borrar el archivo de Supabase Storage
    try:
        if storage_path:
            # Usa el mismo bucket 'adjuntos_ordenes' que el módulo de Órdenes
            supabase.storage.from_('adjuntos_ordenes').remove([storage_path])
        return jsonify({'message': 'Adjunto de mantenimiento eliminado'}), 200
    except Exception as e:
        current_app.logger.error(f"Error al borrar archivo de Storage: {e}")
        return jsonify({'message': 'Registro eliminado, pero falló la eliminación del archivo en Storage'}), 200