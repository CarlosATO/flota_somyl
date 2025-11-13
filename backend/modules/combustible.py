# [START_CODE_BLOCK]
# File: backend/modules/combustible.py

from flask import Blueprint, request, jsonify, current_app, g
import os
try:
    from supabase import create_client
except Exception:
    create_client = None
from ..utils.auth import auth_required, _has_write_permission, _is_admin
from datetime import datetime
from postgrest.exceptions import APIError as PostgrestAPIError

bp = Blueprint('combustible', __name__)

# === 1. HELPERS ===

def _safe_int(value):
    if value is None or value == '': return None
    try: return int(float(value))
    except (ValueError, TypeError): return None

def _safe_float(value):
    if value is None or value == '': return None
    try: return float(value)
    except (ValueError, TypeError): return None

def _safe_datetime(value):
    if not value: return None
    try:
        # Permite datetime-local del frontend (YYYY-MM-DDTHH:MM) o ISO
        if isinstance(value, str) and 'T' in value:
            # Reemplazamos 'Z' o añadimos timezone para evitar errores de Supabase
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.isoformat()
        return datetime.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        current_app.logger.warning(f"Fecha/Hora inválida: {value}")
        return None

def _check_required_fields(payload: dict, required_fields: list) -> list:
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

# ----------------------------------------------------------------------------------------------------------------------

# === NUEVA RUTA: OBTENER PROYECTOS ACTIVOS DESDE DB EXTERNA ===
@bp.route('/proyectos', methods=['GET'])
@auth_required
def get_proyectos_activos():
    """Obtiene una lista de proyectos activos desde la DB externa. Filtra por activo=true."""
    proyectos_supabase = current_app.config.get('PROYECTOS_SUPABASE')
    
    if not proyectos_supabase:
        current_app.logger.error('Error: Conexión a la base de datos de Proyectos no disponible.')
        return jsonify({'message': 'Error: Conexión a la base de datos de Proyectos no disponible.'}), 500

    try:
        # Consulta: tabla 'proyectos', busca 'activo' = true, selecciona 'id' y 'proyecto'
        res = proyectos_supabase.table('proyectos').select('id, proyecto') \
            .eq('activo', True) \
            .order('proyecto', desc=False) \
            .execute()
        
        # Formatear la data para el frontend (usando 'proyecto' como nombre)
        proyectos_limpios = [{'id': p['id'], 'nombre': p['proyecto']} for p in res.data or []]
        
        return jsonify({'data': proyectos_limpios}), 200

    except Exception as e:
        current_app.logger.error(f"Error al obtener proyectos activos de DB externa: {e}")
        return jsonify({'message': 'Error al consultar la base de datos de Proyectos', 'detail': str(e)}), 500


# === 2. RUTAS CRUD PRINCIPALES ===

@bp.route('/', methods=['GET'])
@auth_required
def list_cargas():
    """Listar cargas de combustible con filtros y paginación."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase: return jsonify({'message': 'Error de configuración'}), 500

    q = request.args.get('search')
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    query = supabase.table('flota_combustible').select(
        '*, vehiculo:flota_vehiculos(placa, marca, modelo), conductor:flota_conductores(nombre, apellido)'
    ).is_('deleted_at', None) # Solo no eliminados

    if q:
        like_q = f'%{q}%'
        query = query.or_(f"estacion_servicio.ilike.{like_q},observaciones.ilike.{like_q}")
    
    query = query.order('fecha_carga', desc=True)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar cargas: {e}")
        return jsonify({'message': 'Error en la base de datos', 'detail': str(e)}), 500

    # Conteo (simplificado, similar a otros módulos)
    try:
        count_query = supabase.table('flota_combustible').select('id', count='exact').is_('deleted_at', None)
        if q:
            like_q = f'%{q}%'
            count_query = count_query.or_(f"estacion_servicio.ilike.{like_q},observaciones.ilike.{like_q}")
        count_res = count_query.execute()
        total = count_res.count if hasattr(count_res, 'count') else len(data)
    except Exception:
        total = None

    return jsonify({
        'data': data, 
        'meta': {
            'page': page, 'per_page': per_page, 'total': total, 
            'pages': (total // per_page) + (1 if total % per_page > 0 else 0) if total else None
        }
    })


@bp.route('/', methods=['POST'])
@auth_required
def create_carga():
    """Crear una nueva carga de combustible."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    # [MODIFICADO] Agregar 'proyecto_id' a los requeridos
    required_fields = ['vehiculo_id', 'conductor_id', 'fecha_carga', 'kilometraje', 'litros_cargados', 'costo_total', 'tipo_combustible', 'proyecto_id']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    row = {
        'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
        'conductor_id': _safe_int(payload.get('conductor_id')),
        'proyecto_id': _safe_int(payload.get('proyecto_id')), # [ADAPTADO]
        'fecha_carga': _safe_datetime(payload.get('fecha_carga')),
        'kilometraje': _safe_int(payload.get('kilometraje')),
        'litros_cargados': _safe_float(payload.get('litros_cargados')),
        'costo_total': _safe_float(payload.get('costo_total')),
        'tipo_combustible': payload.get('tipo_combustible'),
        'estacion_servicio': payload.get('estacion_servicio'),
        'observaciones': payload.get('observaciones'),
        'usuario_registro_id': user.get('id')
    }

    if not row['fecha_carga']:
         return jsonify({'message': 'Formato de fecha_carga inválido.'}), 400
    if not row['kilometraje'] or row['kilometraje'] <= 0:
        return jsonify({'message': 'Kilometraje debe ser un número positivo.'}), 400

    try:
        res = supabase.table('flota_combustible').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST Combustible): {e}")
        return jsonify({'message': 'Error en la base de datos al crear carga', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear carga: {e}")
        return jsonify({'message': 'Error inesperado al crear carga', 'detail': str(e)}), 500


@bp.route('/<int:carga_id>', methods=['PUT'])
@auth_required
def update_carga(carga_id):
    """Actualizar una carga existente."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}
    updates = {}
    
    if 'vehiculo_id' in payload: updates['vehiculo_id'] = _safe_int(payload['vehiculo_id'])
    if 'conductor_id' in payload: updates['conductor_id'] = _safe_int(payload['conductor_id'])
    if 'proyecto_id' in payload: updates['proyecto_id'] = _safe_int(payload['proyecto_id']) # [ADAPTADO]
    if 'kilometraje' in payload: updates['kilometraje'] = _safe_int(payload['kilometraje'])
    if 'litros_cargados' in payload: updates['litros_cargados'] = _safe_float(payload['litros_cargados'])
    if 'costo_total' in payload: updates['costo_total'] = _safe_float(payload['costo_total'])
    if 'tipo_combustible' in payload: updates['tipo_combustible'] = payload['tipo_combustible']
    if 'estacion_servicio' in payload: updates['estacion_servicio'] = payload['estacion_servicio']
    if 'observaciones' in payload: updates['observaciones'] = payload['observaciones']
    
    if 'fecha_carga' in payload:
        dt = _safe_datetime(payload['fecha_carga'])
        if not dt:
            return jsonify({'message': 'Formato de fecha_carga inválido.'}), 400
        updates['fecha_carga'] = dt

    if not updates: return jsonify({'message': 'No hay cambios'}), 400

    try:
        res = supabase.table('flota_combustible').update(updates).eq('id', carga_id).is_('deleted_at', None).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Carga {carga_id} no encontrada'}), 404
    except Exception as e:
        current_app.logger.error(f"Error al actualizar carga: {e}")
        return jsonify({'message': 'Error inesperado al actualizar', 'detail': str(e)}), 500


@bp.route('/<int:carga_id>', methods=['DELETE'])
@auth_required
def delete_carga(carga_id):
    """Eliminar (soft-delete) una carga (solo Admin)."""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        # Soft-delete
        res = supabase.table('flota_combustible').update({'deleted_at': datetime.now().isoformat()}).eq('id', carga_id).execute()
        
        if res.data:
            return jsonify({'message': f'Carga {carga_id} marcada como eliminada.'}), 200
        return jsonify({'message': 'Carga no encontrada para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar carga {carga_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete', 'detail': str(e)}), 500

# === 3. RUTAS DE ADJUNTOS ===
# Reusamos la estructura de adjuntos de mantenimiento/ordenes

@bp.route('/<int:carga_id>/adjuntos', methods=['GET'])
@auth_required
def list_carga_adjuntos(carga_id):
    """Lista adjuntos de una carga de combustible."""
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_combustible_adjuntos').select('*') \
            .eq('carga_id', carga_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify({'data': res.data or []})
    except Exception:
        return jsonify({'message': 'Error al obtener adjuntos'}), 500


@bp.route('/<int:carga_id>/adjuntos', methods=['POST'])
@auth_required
def add_carga_adjunto(carga_id):
    """Agrega un registro de adjunto a una carga."""
    user = g.get('current_user')
    if not _has_write_permission(user):
         return jsonify({'message': 'Permisos insuficientes'}), 403

    payload = request.get_json() or {}
    storage_path = payload.get('storage_path')
    if not storage_path:
        return jsonify({'message': 'Falta storage_path'}), 400

    row = {
        'carga_id': carga_id,
        'usuario_id': user.get('id'),
        'storage_path': storage_path,
        'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'),
    }
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_combustible_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception:
        return jsonify({'message': 'Error al guardar adjunto'}), 500


@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_carga_adjunto(adjunto_id):
    """Elimina un registro de adjunto y su archivo de Storage."""
    user = g.get('current_user')
    if not _has_write_permission(user):
         return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    storage_path = None

    # 1. Obtener el path del archivo de Storage
    try:
        res = supabase.table('flota_combustible_adjuntos').select('storage_path') \
            .eq('id', adjunto_id).limit(1).execute()
        if not res.data:
            return jsonify({'message': 'Adjunto no encontrado'}), 404
        storage_path = res.data[0].get('storage_path')
    except Exception:
        return jsonify({'message': 'Error al buscar adjunto'}), 500

    # 2. Borrar el registro de la DB
    try:
        supabase.table('flota_combustible_adjuntos').delete().eq('id', adjunto_id).execute()
    except Exception:
        return jsonify({'message': 'Error al borrar registro'}), 500

    # 3. Borrar el archivo de Supabase Storage
    try:
        if storage_path:
            # Usamos el bucket 'adjuntos_ordenes'
            supabase.storage.from_('adjuntos_ordenes').remove([storage_path])
        return jsonify({'message': 'Adjunto eliminado'}), 200
    except Exception:
        return jsonify({'message': 'Registro eliminado, pero falló la eliminación del archivo en Storage'}), 200


@bp.route('/proyectos', methods=['GET'])
@auth_required
def list_proyectos():
    """Obtiene lista de proyectos (desde la DB de proyectos configurada en .env)"""
    try:
        # Preferir cliente cacheado en app config
        proyectos_client = current_app.config.get('PROYECTOS_SUPABASE')
        if not proyectos_client:
            url = os.environ.get('PROYECTOS_SUPABASE_URL')
            key = os.environ.get('PROYECTOS_SUPABASE_KEY')
            if not url or not key:
                return jsonify({'message': 'Conexión a la base de datos de Proyectos no disponible.'}), 500
            if not create_client:
                return jsonify({'message': 'Librería supabase no disponible en el servidor'}), 500
            proyectos_client = create_client(url, key)
            current_app.config['PROYECTOS_SUPABASE'] = proyectos_client

        # Intentamos obtener registros activos de la tabla 'orden_compra' o 'proyectos'
        # Primero intentamos 'orden_compra', si falla probamos 'proyectos'
        try:
            res = proyectos_client.table('orden_compra').select('*').execute()
            data = res.data or []
        except Exception:
            try:
                res = proyectos_client.table('proyectos').select('*').execute()
                data = res.data or []
            except Exception as e:
                current_app.logger.error(f'Error consultando proyectos en Supabase: {e}')
                return jsonify({'message': 'Error al consultar proyectos', 'detail': str(e)}), 500

        return jsonify({'data': data}), 200

    except Exception as e:
        current_app.logger.error(f'Error en endpoint proyectos: {e}')
        return jsonify({'message': 'Error al obtener proyectos', 'detail': str(e)}), 500
# [END_CODE_BLOCK]