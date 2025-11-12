from flask import Blueprint, request, jsonify, current_app, g
from ..utils.auth import authenticate, generate_token, auth_required, _has_write_permission, _is_admin
from datetime import datetime, timedelta
import numbers

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

bp = Blueprint('vehiculos', __name__)

# === HELPERS DE VEHÍCULOS (EXISTENTES) ===

def _normalize_placa(p: str) -> str:
    if not p:
        return p
    return p.strip().upper()

def _check_required_fields(payload: dict, required_fields: list) -> list:
    missing = [field for field in required_fields if not payload.get(field)]
    return missing

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
        if isinstance(value, str) and 'T' in value:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.date().isoformat()
        if isinstance(value, str):
            return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
        return None
    except (ValueError, TypeError):
        current_app.logger.warning(f"Fecha inválida para documento: {value}")
        return None


# === RUTAS PRINCIPALES DE VEHÍCULOS (CRUD) (Sin cambios funcionales) ===

@bp.route('/', methods=['GET'])
@auth_required
def list_vehiculos():
    """Listar vehículos con búsqueda, paginación y filtros."""
    # ... (Lógica de list_vehiculos, sin cambios) ...
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
    # ... (Lógica de get_vehiculo, sin cambios) ...
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
    # ... (Lógica de create_vehiculo, sin cambios) ...
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
    
    ano_val = _safe_int(payload.get('ano'))
    if ano_val is None:
        return jsonify({'message': 'El campo "ano" debe ser un número entero válido.'}), 400

    capacidad_kg_val = _safe_int(payload.get('capacidad_kg'))
    
    row = {
        'placa': placa_norm,
        'vin': payload.get('vin'),
        'marca': payload.get('marca'),
        'modelo': payload.get('modelo'),
        'ano': ano_val,
        'tipo': payload.get('tipo'),
        'color': payload.get('color'),
        'capacidad_pasajeros': _safe_int(payload.get('capacidad_pasajeros')),
        'capacidad_kg': capacidad_kg_val,
        'numero_chasis': payload.get('numero_chasis'),
        'observaciones': payload.get('observaciones'),
        'metadata': payload.get('metadata') or {}
    }

    try:
        res = supabase.table('flota_vehiculos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST): {e}")
        error_str = str(e).lower()
        if 'duplicate key' in error_str or '23505' in error_str:
             return jsonify({'message': f'La placa "{placa_norm}" ya existe en la base de datos.'}), 409
        return jsonify({'message': 'Error en la base de datos al crear vehículo', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear vehículo: {e}")
        return jsonify({'message': 'Error inesperado al crear vehículo', 'detail': str(e)}), 500


@bp.route('/<int:veh_id>', methods=['PUT'])
@auth_required
def update_vehiculo(veh_id):
    # ... (Lógica de update_vehiculo, sin cambios) ...
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden actualizar vehículos'}), 403

    payload = request.get_json() or {}
    updates = {}
    
    if 'placa' in payload:
        updates['placa'] = _normalize_placa(payload['placa'])
    if 'vin' in payload:
        updates['vin'] = payload['vin']
    if 'marca' in payload:
        updates['marca'] = payload['marca']
    if 'modelo' in payload:
        updates['modelo'] = payload['modelo']
    if 'tipo' in payload:
        updates['tipo'] = payload['tipo']
    if 'color' in payload:
        updates['color'] = payload['color']
    if 'numero_chasis' in payload:
        updates['numero_chasis'] = payload['numero_chasis']
    if 'observaciones' in payload:
        updates['observaciones'] = payload['observaciones']
    if 'metadata' in payload:
        updates['metadata'] = payload['metadata'] if isinstance(payload['metadata'], dict) else {}
    if 'ano' in payload:
        ano_val = _safe_int(payload['ano'])
        if ano_val is None:
            return jsonify({'message': 'El campo "ano" debe ser un número entero válido.'}), 400
        updates['ano'] = ano_val
    if 'capacidad_pasajeros' in payload:
        updates['capacidad_pasajeros'] = _safe_int(payload['capacidad_pasajeros'])
    if 'capacidad_kg' in payload:
        updates['capacidad_kg'] = _safe_int(payload['capacidad_kg'])

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
        error_str = str(e).lower()
        if 'duplicate key' in error_str or '23505' in error_str:
             return jsonify({'message': f'La placa actualizada ya está en uso.'}), 409
        return jsonify({'message': 'Error en la base de datos al actualizar vehículo', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error inesperado al actualizar vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error inesperado al actualizar vehículo', 'detail': str(e)}), 500


@bp.route('/<int:veh_id>', methods=['DELETE'])
@auth_required
def delete_vehiculo(veh_id):
    # ... (Lógica de delete_vehiculo, sin cambios) ...
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

# === RUTAS DE DOCUMENTOS VEHICULARES (CRUD de flota_vehiculos_documentos) ===

@bp.route('/<int:veh_id>/documentos', methods=['GET'])
@auth_required
def list_documentos_vehiculo(veh_id):
    """Lista todos los documentos de cumplimiento para un vehículo."""
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculos_documentos').select('*') \
            .eq('vehiculo_id', veh_id) \
            .is_('deleted_at', None) \
            .order('fecha_vencimiento', desc=False) \
            .execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        current_app.logger.error(f"Error al listar documentos de vehículo {veh_id}: {e}")
        return jsonify({'message': 'Error al obtener documentos del vehículo'}), 500


@bp.route('/documentos', methods=['POST'])
@auth_required
def create_documento_vehiculo():
    """Crea un nuevo registro de documento para un vehículo."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    required_fields = ['vehiculo_id', 'tipo_documento', 'fecha_vencimiento']
    missing = _check_required_fields(payload, required_fields)
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    row = {
        'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
        'tipo_documento': payload.get('tipo_documento'),
        'numero_documento': payload.get('numero_documento'),
        'fecha_emision': _safe_date(payload.get('fecha_emision')),
        'fecha_vencimiento': _safe_date(payload.get('fecha_vencimiento')),
        'observaciones': payload.get('observaciones'),
    }
    
    if not row['vehiculo_id']:
        return jsonify({'message': 'ID de vehículo inválido o faltante'}), 400

    try:
        res = supabase.table('flota_vehiculos_documentos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST Documento): {e}")
        return jsonify({'message': 'Error al crear documento', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear documento: {e}")
        return jsonify({'message': 'Error inesperado al crear documento', 'detail': str(e)}), 500


@bp.route('/documentos/<int:doc_id>', methods=['PUT'])
@auth_required
def update_documento_vehiculo(doc_id):
    """Actualiza un registro de documento."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}
    updates = {}
    
    if 'tipo_documento' in payload: updates['tipo_documento'] = payload['tipo_documento']
    if 'numero_documento' in payload: updates['numero_documento'] = payload['numero_documento']
    if 'observaciones' in payload: updates['observaciones'] = payload['observaciones']
    
    if 'fecha_emision' in payload: updates['fecha_emision'] = _safe_date(payload['fecha_emision'])
    if 'fecha_vencimiento' in payload: updates['fecha_vencimiento'] = _safe_date(payload['fecha_vencimiento'])

    if not updates:
        return jsonify({'message': 'No hay campos válidos para actualizar'}), 400

    try:
        res = supabase.table('flota_vehiculos_documentos').update(updates).eq('id', doc_id).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': 'Documento no encontrado'}), 404
    except Exception as e:
        current_app.logger.error(f"Error al actualizar documento {doc_id}: {e}")
        return jsonify({'message': 'Error inesperado al actualizar documento', 'detail': str(e)}), 500


@bp.route('/documentos/<int:doc_id>', methods=['DELETE'])
@auth_required
def delete_documento_vehiculo(doc_id):
    """Elimina (soft-delete) un registro de documento."""
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculos_documentos').update({'deleted_at': datetime.now().isoformat()}).eq('id', doc_id).execute()
        
        if res.data:
            return jsonify({'message': f'Documento {doc_id} marcado como eliminado.'}), 200
        return jsonify({'message': 'Documento no encontrado para eliminar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al eliminar documento {doc_id}: {e}")
        return jsonify({'message': 'Error al realizar el soft-delete del documento', 'detail': str(e)}), 500


# === RUTAS DE ADJUNTOS DE DOCUMENTOS (CRUD de flota_vehiculo_doc_adjuntos) ===

@bp.route('/documentos/<int:doc_id>/adjuntos', methods=['GET'])
@auth_required
def list_doc_adjuntos(doc_id):
    """Lista todos los adjuntos de un registro de documento."""
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculo_doc_adjuntos').select('*') \
            .eq('documento_id', doc_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        current_app.logger.error(f"Error al listar adjuntos de documento {doc_id}: {e}")
        return jsonify({'message': 'Error al obtener adjuntos de documento'}), 500


@bp.route('/documentos/<int:doc_id>/adjuntos', methods=['POST'])
@auth_required
def add_doc_adjunto(doc_id):
    """Agrega un registro de adjunto a un documento."""
    user = g.get('current_user')
    if not _has_write_permission(user): 
         return jsonify({'message': 'Permisos insuficientes'}), 403
         
    payload = request.get_json() or {}
    storage_path = payload.get('storage_path')
    if not storage_path:
        return jsonify({'message': 'Falta storage_path'}), 400

    row = {
        'documento_id': doc_id,
        'usuario_id': user.get('id'),
        'storage_path': storage_path,
        'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'),
        'observacion': payload.get('observacion'),
    }
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_vehiculo_doc_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception as e:
        current_app.logger.error(f"Error al guardar adjunto de documento: {e}")
        return jsonify({'message': 'Error al guardar adjunto de documento'}), 500


@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_doc_adjunto(adjunto_id):
    """Elimina un registro de adjunto de documento y su archivo de Storage."""
    user = g.get('current_user')
    if not _has_write_permission(user): 
         return jsonify({'message': 'Permisos insuficientes'}), 403
         
    supabase = current_app.config.get('SUPABASE')
    storage_path = None
    
    # 1. Obtener el path del archivo de Storage
    try:
        res = supabase.table('flota_vehiculo_doc_adjuntos').select('storage_path') \
            .eq('id', adjunto_id).limit(1).execute()
        if not res.data:
            return jsonify({'message': 'Adjunto de documento no encontrado'}), 404
        storage_path = res.data[0].get('storage_path')
    except Exception as e:
        return jsonify({'message': 'Error al buscar adjunto de documento'}), 500
        
    # 2. Borrar el registro de la DB
    try:
        supabase.table('flota_vehiculo_doc_adjuntos').delete().eq('id', adjunto_id).execute()
    except Exception as e:
        return jsonify({'message': 'Error al borrar registro de adjunto'}), 500
        
    # 3. Borrar el archivo de Supabase Storage
    try:
        if storage_path:
            # Usar el bucket 'adjuntos_ordenes' por consistencia
            supabase.storage.from_('adjuntos_ordenes').remove([storage_path])
        return jsonify({'message': 'Adjunto de documento eliminado'}), 200
    except Exception as e:
        current_app.logger.error(f"Error al borrar archivo de Storage: {e}")
        return jsonify({'message': 'Registro eliminado, pero falló la eliminación del archivo en Storage'}), 200


# === RUTA DE ALERTAS DE DOCUMENTOS ===

@bp.route('/alertas/documentos', methods=['GET'])
@auth_required
def alertas_documentos():
    """Retorna documentos de vehículos próximos a vencer (vista flota_vehiculos_documentos_alertas)."""
    supabase = current_app.config.get('SUPABASE')
    try:
        # Consulta la vista creada
        res = supabase.table('flota_vehiculos_documentos_alertas').select('*').execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        current_app.logger.error(f"Error obteniendo alertas de documentos: {e}")
        return jsonify({'message': 'Error al obtener alertas de documentos'}), 500