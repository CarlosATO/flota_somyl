# === 1. IMPORTS (TODOS AL PRINCIPIO) ===
from flask import Blueprint, request, jsonify, current_app, g
from ..utils.auth import auth_required, _has_write_permission
from datetime import datetime
import re

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

# === 2. DEFINICIÓN DEL BLUEPRINT ===
bp = Blueprint('ordenes', __name__)

# === 3. HELPERS DE PERMISOS Y DATOS ===

def _is_admin(user: dict) -> bool:
    return (user.get('cargo') or '').lower() == 'administrador'

def _safe_int(value):
    if value is None or value == '':
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None

def _safe_datetime(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt.isoformat()
    except (ValueError, TypeError):
        current_app.logger.warning(f"Fecha inválida: {value}")
        return None

# === 4. LÓGICA DE NEGOCIO (¡Excelente!) ===

def _calcular_estado_automatico(vehiculo_id, conductor_id, fecha_fin_real, km_fin):
    """Calcula el estado automático según reglas de negocio."""
    # COMPLETADA: Tiene fecha_fin_real Y km_fin
    if fecha_fin_real and (km_fin is not None): # 0 es un km_fin válido
        return 'completada'
    
    # ASIGNADA: Tiene vehículo Y conductor
    if vehiculo_id and conductor_id:
        return 'asignada'
    
    # PENDIENTE: Todo lo demás
    return 'pendiente'

def _registrar_cambio_estado(orden_id, estado_anterior, estado_nuevo, usuario_id, observacion=None):
    """Registra cambio de estado en historial."""
    if estado_anterior == estado_nuevo:
        return
    
    supabase = current_app.config.get('SUPABASE')
    try:
        supabase.table('flota_orden_historial').insert({
            'orden_id': orden_id,
            'usuario_id': usuario_id,
            'estado_anterior': estado_anterior,
            'estado_nuevo': estado_nuevo,
            'observacion': observacion
        }).execute()
        current_app.logger.info(f"📝 Estado cambiado: {estado_anterior} → {estado_nuevo} (Orden #{orden_id})")
    except Exception as e:
        current_app.logger.error(f"Error registrando historial: {e}")

# === 5. RUTAS DEL MÓDULO ORDENES ===

@bp.route('/', methods=['GET'])
@auth_required
def list_ordenes():
    """Listar órdenes (sin cambios, tu código estaba bien)."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración'}), 500

    q = request.args.get('search')
    estado = request.args.get('estado')
    fecha_desde = request.args.get('fecha_desde')
    fecha_hasta = request.args.get('fecha_hasta')

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Parámetros de paginación inválidos'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    query = supabase.table('flota_ordenes').select(
        '*, vehiculo:flota_vehiculos(placa, marca, modelo), conductor:flota_conductores(nombre, apellido, rut)'
    )
    
    if q:
        like_q = f'%{q}%'
        query = query.or_(f"origen.ilike.{like_q},destino.ilike.{like_q},descripcion.ilike.{like_q}")
    if estado:
        query = query.eq('estado', estado)
    if fecha_desde:
        query = query.gte('fecha_inicio_programada', fecha_desde)
    if fecha_hasta:
        query = query.lte('fecha_inicio_programada', fecha_hasta)

    query = query.order('fecha_inicio_programada', desc=True)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar órdenes: {e}")
        return jsonify({'message': 'Error en la base de datos', 'detail': str(e)}), 500

    try:
        count_query = supabase.table('flota_ordenes').select('id', count='exact')
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

# --- ¡ARREGLO! get_orden() AHORA ESTÁ SEPARADA Y COMPLETA ---
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

# --- ¡ARREGLO! create_orden() ESTABA FALTANDO ---
# (La copié de la versión anterior de tu archivo, ya que la borraste en el merge)
@bp.route('/', methods=['POST'])
@auth_required
def create_orden():
    """Crear una nueva orden de servicio."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes. Solo Administrador o Despachador pueden crear órdenes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    required_fields = ['fecha_inicio_programada', 'origen', 'destino', 'descripcion']
    missing = [f for f in required_fields if not payload.get(f)]
    if missing:
        return jsonify({'message': f'Faltan campos requeridos: {", ".join(missing)}'}), 400

    row = {
        'usuario_creador_id': user.get('id'),
        'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
        'conductor_id': _safe_int(payload.get('conductor_id')),
        'estado': payload.get('estado', 'pendiente'),
        'fecha_inicio_programada': _safe_datetime(payload.get('fecha_inicio_programada')),
        'fecha_fin_programada': _safe_datetime(payload.get('fecha_fin_programada')),
        'origen': payload.get('origen'),
        'destino': payload.get('destino'),
        'descripcion': payload.get('descripcion'),
        'kilometraje_inicio': _safe_int(payload.get('kilometraje_inicio')),
        'observaciones': payload.get('observaciones'),
    }
    
    if not row['fecha_inicio_programada']:
         return jsonify({'message': 'Formato de fecha_inicio_programada inválido.'}), 400
    
    # Calcular estado automático al crear
    row['estado'] = _calcular_estado_automatico(
        row['vehiculo_id'], 
        row['conductor_id'], 
        None, 
        None
    )

    try:
        res = supabase.table('flota_ordenes').insert(row).execute()
        
        # Registrar historial de creación
        if res.data:
            orden_creada = res.data[0]
            _registrar_cambio_estado(
                orden_creada['id'],
                None,
                orden_creada['estado'],
                user.get('id'),
                'Orden creada'
            )
            
        return jsonify({'data': res.data[0]}), 201
    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase (POST Orden): {e}")
        return jsonify({'message': 'Error en la base de datos al crear la orden', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al crear orden: {e}")
        return jsonify({'message': 'Error inesperado al crear la orden', 'detail': str(e)}), 500

# --- ¡ARREGLO! update_orden() AHORA ESTÁ SEPARADA Y COMPLETA ---
@bp.route('/<int:orden_id>', methods=['PUT'])
@auth_required
def update_orden(orden_id):
    """Actualizar una orden existente por ID."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    
    # 1. Obtener el estado actual de la orden (¡necesario!)
    try:
        res_actual = supabase.table('flota_ordenes').select('*').eq('id', orden_id).limit(1).execute()
        if not res_actual.data:
            return jsonify({'message': 'Orden no encontrada'}), 404
        orden_actual = res_actual.data[0]
    except Exception as e:
        return jsonify({'message': 'Error al buscar orden actual', 'detail': str(e)}), 500

    payload = request.get_json() or {}
    updates = {}
    
    # 2. Procesar todos los campos (tu lógica)
    campos_simples = ['vehiculo_id', 'conductor_id', 'origen', 'destino', 'descripcion', 'observaciones']
    for key in campos_simples:
        if key in payload:
            updates[key] = payload[key]
    
    if 'kilometraje_inicio' in payload:
        updates['kilometraje_inicio'] = _safe_int(payload['kilometraje_inicio'])
    if 'kilometraje_fin' in payload:
        updates['kilometraje_fin'] = _safe_int(payload['kilometraje_fin'])
    
    campos_fecha = ['fecha_inicio_programada', 'fecha_fin_programada', 'fecha_inicio_real', 'fecha_fin_real']
    for key in campos_fecha:
        if key in payload:
            dt = _safe_datetime(payload[key])
            updates[key] = dt if dt else None # Permitir setear a null
    
    # 3. Validaciones críticas (tu lógica)
    km_inicio = updates.get('kilometraje_inicio', orden_actual.get('kilometraje_inicio'))
    km_fin = updates.get('kilometraje_fin', orden_actual.get('kilometraje_fin'))
    fecha_fin_real = updates.get('fecha_fin_real', orden_actual.get('fecha_fin_real'))
    fecha_inicio_real = updates.get('fecha_inicio_real', orden_actual.get('fecha_inicio_real'))
    
    if (km_fin is not None and not fecha_fin_real) or (fecha_fin_real and km_fin is None):
        return jsonify({'message': 'Debes completar AMBOS: Fecha Fin Real y KM Fin para cerrar la orden'}), 400
    
    if (km_fin is not None) and (km_inicio is not None) and km_fin <= km_inicio:
        return jsonify({'message': f'KM Fin ({km_fin}) debe ser mayor que KM Inicio ({km_inicio})'}), 400
    
    if fecha_fin_real and fecha_inicio_real:
        try:
            dt_fin = datetime.fromisoformat(fecha_fin_real.replace('Z', '+00:00'))
            dt_inicio = datetime.fromisoformat(fecha_inicio_real.replace('Z', '+00:00'))
            if dt_fin <= dt_inicio:
                return jsonify({'message': 'Fecha Fin Real debe ser posterior a Fecha Inicio Real'}), 400
        except:
            pass
    
    # 4. Calcular estado automático (tu lógica)
    vehiculo_id = updates.get('vehiculo_id', orden_actual.get('vehiculo_id'))
    conductor_id = updates.get('conductor_id', orden_actual.get('conductor_id'))
    
    nuevo_estado = _calcular_estado_automatico(vehiculo_id, conductor_id, fecha_fin_real, km_fin)
    updates['estado'] = nuevo_estado
    
    if not updates:
        return jsonify({'message': 'No hay cambios'}), 400

    # 5. Ejecutar el UPDATE
    try:
        res = supabase.table('flota_ordenes').update(updates).eq('id', orden_id).execute()
        
        if res.data:
            # Registrar cambio de estado
            if orden_actual['estado'] != nuevo_estado:
                _registrar_cambio_estado(
                    orden_id,
                    orden_actual['estado'],
                    nuevo_estado,
                    user.get('id'),
                    'Actualización de orden'
                )
            
            return jsonify({'data': res.data[0]})
        return jsonify({'message': f'Orden {orden_id} no encontrada'}), 404
    except PostgrestAPIError as e: # Manejo de errores de DB
        current_app.logger.error(f"Error Supabase (PUT Orden): {e}")
        return jsonify({'message': 'Error en la base de datos al actualizar la orden', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error al actualizar: {e}")
        return jsonify({'message': 'Error al actualizar', 'detail': str(e)}), 500


@bp.route('/<int:orden_id>', methods=['DELETE'])
@auth_required
def delete_orden(orden_id):
    """Tu lógica de delete_orden (con historial) está perfecta."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        res_actual = supabase.table('flota_ordenes').select('estado').eq('id', orden_id).limit(1).execute()
        if not res_actual.data:
            return jsonify({'message': 'Orden no encontrada'}), 404
        
        estado_anterior = res_actual.data[0]['estado']
        
        res = supabase.table('flota_ordenes').update({'estado': 'cancelada'}).eq('id', orden_id).execute()
        
        if res.data:
            _registrar_cambio_estado(orden_id, estado_anterior, 'cancelada', user.get('id'), 'Orden cancelada manualmente')
            return jsonify({'message': f'Orden {orden_id} cancelada'}), 200
        return jsonify({'message': 'Orden no encontrada'}), 404
        
    except Exception as e:
        current_app.logger.error(f"Error al cancelar: {e}")
        return jsonify({'message': 'Error al cancelar', 'detail': str(e)}), 500


# === RUTAS DE ADJUNTOS (sin cambios, estaban bien) ===

@bp.route('/<int:orden_id>/adjuntos', methods=['GET'])
@auth_required
def list_adjuntos(orden_id):
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_orden_adjuntos').select('*') \
            .eq('orden_id', orden_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        return jsonify({'message': 'Error al obtener adjuntos'}), 500


@bp.route('/<int:orden_id>/adjuntos', methods=['POST'])
@auth_required
def add_adjunto(orden_id):
    user = g.get('current_user')
    payload = request.get_json() or {}
    storage_path = payload.get('storage_path')
    if not storage_path:
        return jsonify({'message': 'Falta storage_path'}), 400

    row = {
        'orden_id': orden_id,
        'usuario_id': user.get('id'),
        'storage_path': storage_path,
        'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'),
        'observacion': payload.get('observacion'),
        # --- ¡AQUÍ ESTÁ EL CAMBIO! ---
        'tipo_adjunto': payload.get('tipo_adjunto', 'inicio') # Recibimos la etiqueta
    }
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_orden_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception as e:
        return jsonify({'message': 'Error al guardar adjunto'}), 500


@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_adjunto(adjunto_id):
    user = g.get('current_user')
    if not _has_write_permission(user): 
         return jsonify({'message': 'Permisos insuficientes'}), 403
         
    supabase = current_app.config.get('SUPABASE')
    storage_path = None
    try:
        res = supabase.table('flota_orden_adjuntos').select('storage_path') \
            .eq('id', adjunto_id).limit(1).execute()
        if not res.data:
            return jsonify({'message': 'Adjunto no encontrado'}), 404
        storage_path = res.data[0].get('storage_path')
    except Exception as e:
        return jsonify({'message': 'Error al buscar adjunto'}), 500
        
    try:
        supabase.table('flota_orden_adjuntos').delete().eq('id', adjunto_id).execute()
    except Exception as e:
        return jsonify({'message': 'Error al borrar registro'}), 500
        
    try:
        if storage_path:
            supabase.storage.from_('adjuntos_ordenes').remove([storage_path])
        return jsonify({'message': 'Adjunto eliminado'}), 200
    except Exception as e:
        return jsonify({'message': 'SQL eliminado, falló Storage'}), 200


# === RUTA NUEVA: ALERTAS DE LICENCIAS (¡Excelente idea!) ===

@bp.route('/alertas/licencias', methods=['GET'])
@auth_required
def alertas_licencias():
    """Retorna conductores con licencias próximas a vencer (30 días)."""
    supabase = current_app.config.get('SUPABASE')
    try:
        # Usar la vista creada
        res = supabase.table('flota_conductores_licencias_alertas').select('*').execute()
        return jsonify({'data': res.data or []})
    except Exception as e:
        current_app.logger.error(f"Error obteniendo alertas: {e}")
        return jsonify({'message': 'Error al obtener alertas'}), 500


# --- RUTA PARA APP MÓVIL CONDUCTOR ---

@bp.route('/conductor/activas', methods=['GET'])
@auth_required
def get_ordenes_conductor_activas():
    """
    [APP MOVIL] Obtiene las órdenes activas (asignadas) para el conductor
    autenticado (obtenido desde el token JWT).
    """
    supabase = current_app.config.get('SUPABASE')
    user = g.get('current_user') # Esto viene de flota_usuarios
    
    if not user:
        return jsonify({'message': 'Error de autenticación, usuario no encontrado'}), 401
    
    # Verificamos que el usuario logueado sea un conductor
    if (user.get('cargo') or '').lower() != 'conductor':
        return jsonify({'message': 'Acceso denegado. Este endpoint es solo para conductores.'}), 403

    # --- Lógica de Búsqueda Segura ---
    # Usamos el RUT del usuario logueado (flota_usuarios) para encontrar 
    # su ID correspondiente en la tabla de conductores (flota_conductores).
    try:
        conductor_rut = user.get('rut')
        if not conductor_rut:
            return jsonify({'message': 'El usuario no tiene RUT asignado'}), 400
            
        res_conductor = supabase.table('flota_conductores').select('id').eq('rut', conductor_rut).limit(1).execute()
        
        if not res_conductor.data:
            return jsonify({'message': f'No se encontró un perfil de conductor para el RUT {conductor_rut}'}), 404
            
        conductor_id_flota = res_conductor.data[0]['id']

    except Exception as e:
        current_app.logger.error(f"Error buscando ID de conductor por RUT: {e}")
        return jsonify({'message': 'Error interno al verificar conductor'}), 500
    
    # --- Búsqueda de Órdenes ---
    try:
        # Buscamos órdenes ASIGNADAS para este conductor_id_flota
        res = supabase.table('flota_ordenes').select(
            "*, vehiculo:flota_vehiculos(placa, marca, modelo)"
        ).eq('conductor_id', conductor_id_flota).eq('estado', 'asignada').order('fecha_inicio_programada', desc=False).execute()
        
        data = res.data or []
        
        return jsonify({'data': data}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error al buscar órdenes de conductor: {e}")
        return jsonify({'message': 'Error inesperado al buscar órdenes'}), 500 