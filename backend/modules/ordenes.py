# --- AÑADIR ESTE CÓDIGO AL FINAL DE backend/modules/ordenes.py ---

@bp.route('/<int:orden_id>/adjuntos', methods=['GET'])
@auth_required
def list_adjuntos(orden_id):
    """Listar todos los adjuntos (fotos) de una orden específica."""
    supabase = current_app.config.get('SUPABASE')
    try:
        # Buscamos en la nueva tabla 'flota_orden_adjuntos'
        res = supabase.table('flota_orden_adjuntos').select('*') \
            .eq('orden_id', orden_id) \
            .order('created_at', desc=True) \
            .execute()
        
        return jsonify({'data': res.data or []})
        
    except Exception as e:
        current_app.logger.error(f"Error listando adjuntos: {e}")
        return jsonify({'message': 'Error al obtener adjuntos', 'detail': str(e)}), 500


@bp.route('/<int:orden_id>/adjuntos', methods=['POST'])
@auth_required
def add_adjunto(orden_id):
    """
    Guarda la *metadata* de un adjunto (la foto ya se subió al Storage).
    El frontend nos envía el 'storage_path' y la metadata.
    """
    user = g.get('current_user')
    payload = request.get_json() or {}
    
    storage_path = payload.get('storage_path')
    if not storage_path:
        return jsonify({'message': 'Falta el "storage_path" (la dirección del archivo)'}), 400

    row = {
        'orden_id': orden_id,
        'usuario_id': user.get('id'), # El ID de 'flota_usuarios'
        'storage_path': storage_path,
        'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'),
        'observacion': payload.get('observacion')
    }
    
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_orden_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception as e:
        current_app.logger.error(f"Error creando adjunto SQL: {e}")
        return jsonify({'message': 'Error al guardar el registro del adjunto', 'detail': str(e)}), 500


@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_adjunto(adjunto_id):
    """
    Elimina un adjunto. Esta es una operación "senior":
    1. Borra el registro en la tabla SQL 'flota_orden_adjuntos'.
    2. Borra el archivo físico del 'Bucket' de Storage.
    """
    user = g.get('current_user')
    # Solo admin o dispatcher pueden borrar
    if not _has_write_permission(user): 
         return jsonify({'message': 'Permisos insuficientes'}), 403
         
    supabase = current_app.config.get('SUPABASE')
    
    # 1. Obtener el 'storage_path' ANTES de borrar el registro SQL
    storage_path = None
    try:
        res = supabase.table('flota_orden_adjuntos').select('storage_path') \
            .eq('id', adjunto_id).limit(1).execute()
        if not res.data:
            return jsonify({'message': 'Adjunto no encontrado'}), 404
        storage_path = res.data[0].get('storage_path')
    except Exception as e:
        return jsonify({'message': 'Error al buscar el adjunto', 'detail': str(e)}), 500
        
    # 2. Borrar el registro de la tabla SQL
    try:
        supabase.table('flota_orden_adjuntos').delete().eq('id', adjunto_id).execute()
    except Exception as e:
        current_app.logger.error(f"Error borrando adjunto SQL: {e}")
        return jsonify({'message': 'Error al borrar registro de la base de datos', 'detail': str(e)}), 500
        
    # 3. Borrar el archivo físico del Storage (¡la bodega!)
    try:
        if storage_path:
            # Usamos el nombre del bucket que creaste
            bucket_name = 'adjuntos_ordenes'
            
            # El storage_path es la "llave" del archivo (ej: 'public/foto.jpg')
            res_storage = supabase.storage.from_(bucket_name).remove([storage_path])
            current_app.logger.info(f"Respuesta de borrado de Storage: {res_storage}")
        
        return jsonify({'message': 'Adjunto eliminado correctamente (SQL y Storage)'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error borrando archivo de Storage: {e}")
        # El registro SQL YA fue borrado, pero el archivo físico quedó huérfano.
        return jsonify({'message': 'Adjunto eliminado (SQL), pero falló al limpiar el Storage', 'detail': str(e)}), 200
from flask import Blueprint, request, jsonify, current_app, g
from backend.utils.auth import auth_required, _has_write_permission
from datetime import datetime
import re

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

bp = Blueprint('ordenes', __name__)

# === PERMISOS (Replicados de otros módulos) ===

def _has_write_permission(user: dict) -> bool:
    """Verifica si el usuario puede crear o modificar."""
    cargo = (user.get('cargo') or '').lower()
    return cargo in ('administrador', 'dispatcher')

def _is_admin(user: dict) -> bool:
    """Verifica si el usuario es Administrador."""
    return (user.get('cargo') or '').lower() == 'administrador'

# === HELPERS DE DATOS ===

def _safe_int(value):
    """Convierte a int de forma segura."""
    if value is None or value == '':
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None

def _safe_datetime(value):
    """
    Convierte un string ISO 8601 a un formato de timestamp 
    que Supabase/PostgreSQL entiende.
    """
    if not value:
        return None
    try:
        # Intenta parsear la fecha. 
        # El formato 'Z' (Zulu/UTC) es manejado por fromisoformat
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        # Devuelve un string en formato ISO para la DB
        return dt.isoformat()
    except (ValueError, TypeError):
        current_app.logger.warning(f"Fecha inválida recibida: {value}")
        return None


# === RUTAS DEL MÓDULO ORDENES ===

@bp.route('/', methods=['GET'])
@auth_required
def list_ordenes():
    """
    Listar órdenes con búsqueda, paginación y filtros.
    Esta es la consulta más importante, une vehículos y conductores.
    """
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    # Filtros
    q = request.args.get('search') # Búsqueda general
    estado = request.args.get('estado') # Filtro por estado
    fecha_desde = request.args.get('fecha_desde') # Rango de fechas
    fecha_hasta = request.args.get('fecha_hasta') # Rango de fechas

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    # --- Consulta Principal con JOINs ---
    # Usamos la sintaxis de Supabase para hacer "JOINs"
    # vehiculo:flota_vehiculos(placa, marca)
    # conductor:flota_conductores(nombre, apellido)
    query = supabase.table('flota_ordenes').select(
        '*, vehiculo:flota_vehiculos(placa, marca, modelo), conductor:flota_conductores(nombre, apellido, rut)'
    )
    
    # Aplicar filtros
    if q:
        like_q = f'%{q}%'
        query = query.or_(f"origen.ilike.{like_q},destino.ilike.{like_q},descripcion.ilike.{like_q}")
    if estado:
        query = query.eq('estado', estado)
    if fecha_desde:
        query = query.gte('fecha_inicio_programada', fecha_desde)
    if fecha_hasta:
        query = query.lte('fecha_inicio_programada', fecha_hasta)

    # Ordenar por fecha más reciente primero
    query = query.order('fecha_inicio_programada', desc=True)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar órdenes: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener listado', 'detail': str(e)}), 500

    # --- Consulta de Conteo (con los mismos filtros) ---
    try:
        count_query = supabase.table('flota_ordenes').select('id', count='exact')
        
        # Aplicar filtros al conteo (CORRECCIÓN DE PAGINACIÓN)
        if q:
            like_q = f'%{q}%'
            count_query = count_query.or_(f"origen.ilike.{like_q},destino.ilike.{like_q},descripcion.ilike.{like_q}")
        if estado:
            count_query = count_query.eq('estado', estado)
        if fecha_desde:
            count_query = count_query.gte('fecha_inicio_programada', fecha_desde)
        if fecha_hasta:
            count_query = count_query.lte('fecha_inicio_programada', fecha_hasta)
            
        count_res = count_query.execute()
        total = count_res.count if hasattr(count_res, 'count') and count_res.count is not None else None
    except Exception as e:
        current_app.logger.warning(f"No se pudo obtener el conteo total de órdenes: {e}")
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


@bp.route('/<int:orden_id>', methods=['GET'])
@auth_required
def get_orden(orden_id):
    """Obtener una orden por ID, incluyendo datos de vehículo y conductor."""
    supabase = current_app.config.get('SUPABASE')
    
    try:
        res = supabase.table('flota_ordenes').select(
            '*, vehiculo:flota_vehiculos(placa, marca, modelo), conductor:flota_conductores(nombre, apellido, rut)'
        ).eq('id', orden_id).limit(1).execute()
        
        rows = res.data or []
        if not rows:
            return jsonify({'message': f'Orden con ID {orden_id} no encontrada'}), 404
        return jsonify({'data': rows[0]})
    except Exception as e:
        current_app.logger.error(f"Error al obtener orden {orden_id}: {e}")
        return jsonify({'message': 'Error en la base de datos al obtener la orden'}), 500


@bp.route('/', methods=['POST'])
@auth_required
def create_orden():
    """Crear una nueva orden de servicio."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear órdenes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    # Campos requeridos para crear
    required_fields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion']
    missing = [f for f in required_fields if not payload.get(f)]
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    # Construir la fila para insertar
    row = {
        'usuario_creador_id': user.get('id'), # ID del usuario que crea la orden
        'vehiculo_id': payload.get('vehiculo_id'),
        'conductor_id': payload.get('conductor_id'),
        'estado': payload.get('estado', 'pendiente'),
        
        'fecha_inicio_programada': _safe_datetime(payload.get('fecha_inicio_programada')),
        'fecha_fin_programada': _safe_datetime(payload.get('fecha_fin_programada')),
        
        'origen': payload.get('origen'),
        'destino': payload.get('destino'),
        'descripcion': payload.get('descripcion'),
        
        'kilometraje_inicio': _safe_int(payload.get('kilometraje_inicio')),
        'observaciones': payload.get('observaciones'),
    }
    
    # Validar que la fecha de inicio sea válida
    if not row['fecha_inicio_programada']:
         return jsonify({'message': 'Formato de fecha_inicio_programada inválido.'}), 400

    try:
        res = supabase.table('flota_ordenes').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST Orden): {e}")
        return jsonify({'message': 'Error en la base de datos al crear la orden', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear orden: {e}")
        return jsonify({'message': 'Error inesperado al crear la orden', 'detail': str(e)}), 500


@bp.route('/<int:orden_id>', methods=['PUT'])
@auth_required
def update_orden(orden_id):
    """Actualizar una orden existente por ID."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden actualizar órdenes'}), 403

    payload = request.get_json() or {}
    updates = {}
    
    # Campos que se pueden actualizar
    campos_actualizables = [
        'vehiculo_id', 'conductor_id', 'estado', 'origen', 'destino', 
        'descripcion', 'kilometraje_inicio', 'kilometraje_fin', 'observaciones'
    ]
    
    campos_fecha = [
        'fecha_inicio_programada', 'fecha_fin_programada', 
        'fecha_inicio_real', 'fecha_fin_real'
    ]

    for key in campos_actualizables:
        if key in payload:
            updates[key] = payload[key]
            
    for key in campos_fecha:
        if key in payload:
            dt = _safe_datetime(payload[key])
            if dt:
                updates[key] = dt
            else:
                # Si la fecha enviada es inválida, rechazar
                return jsonify({'message': f'Formato de fecha inválido para {key}.'}), 400

    if not updates:
        return jsonify({'message': 'No se proporcionaron campos válidos para actualizar.'}), 400

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_ordenes').update(updates).eq('id', orden_id).execute()
        if res.data:
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Orden con ID {orden_id} no encontrada para actualizar'}), 404
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (PUT Orden): {e}")
        return jsonify({'message': 'Error en la base de datos al actualizar la orden', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error inesperado al actualizar orden {orden_id}: {e}")
        return jsonify({'message': 'Error inesperado al actualizar la orden', 'detail': str(e)}), 500


@bp.route('/<int:orden_id>', methods=['DELETE'])
@auth_required
def delete_orden(orden_id):
    """
    Cancelar una orden (borrado lógico).
    En lugar de borrar, cambiamos el estado a 'cancelada'.
    """
    user = g.get('current_user')
    # Un dispatcher también puede cancelar
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes para cancelar órdenes'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        # No borramos, actualizamos el estado a 'cancelada'
        res = supabase.table('flota_ordenes').update({
            'estado': 'cancelada'
        }).eq('id', orden_id).execute()
        
        if res.data:
            return jsonify({'message': f'Orden {orden_id} marcada como cancelada.'}), 200
        return jsonify({'message': 'Orden no encontrada para cancelar'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al cancelar orden {orden_id}: {e}")
        return jsonify({'message': 'Error al cancelar la orden', 'detail': str(e)}), 500