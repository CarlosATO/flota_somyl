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

    # Asegurar que la columna 'km_intervalo_mantencion' esté incluida en el select
    query = supabase.table('flota_vehiculos').select('*, km_intervalo_mantencion')
    
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

        vehicle = rows[0]
        # Compute km_actual: maximum of kilometraje_inicio and kilometraje_fin from orders for this vehicle
        try:
            orders_res = supabase.table('flota_ordenes').select('kilometraje_inicio, kilometraje_fin, estado').eq('vehiculo_id', veh_id).execute()
            orders = orders_res.data or []
            km_values = []
            km_traveled_sum = 0
            for o in orders:
                ki = o.get('kilometraje_inicio')
                kf = o.get('kilometraje_fin')
                # Build candidate values for max odometer
                for v in (ki, kf):
                    if v is not None and v != '':
                        try:
                            km_values.append(int(float(v)))
                        except Exception:
                            pass

                # Accumulate traveled distance only when both values are present and sensible
                try:
                    if o.get('estado') and str(o.get('estado')).lower() == 'completada' and ki is not None and kf is not None:
                        ki_val = int(float(ki)) if ki != '' else None
                        kf_val = int(float(kf)) if kf != '' else None
                        if ki_val is not None and kf_val is not None and kf_val > ki_val:
                            delta = kf_val - ki_val
                            # Sanity: ignore unrealistically large deltas (e.g., > 10000km) to avoid data errors
                            if delta >= 0 and delta < 100000:
                                km_traveled_sum += delta
                except Exception:
                    # ignore any conversion errors
                    pass

            # km_actual: maximum known odometer reading, fallback to existing vehicle value or 0
            vehicle['km_actual'] = max(km_values) if km_values else (vehicle.get('km_actual') or 0)
            # km_recorridos: total distance recorded in completed orders
            vehicle['km_recorridos'] = km_traveled_sum
        except Exception as e:
            current_app.logger.warning(f"No se pudo calcular km_actual para vehiculo {veh_id}: {e}")
            # Ensure km_actual field exists
            vehicle['km_actual'] = vehicle.get('km_actual') or 0

        return jsonify({'data': vehicle})
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
        'km_intervalo_mantencion': _safe_int(payload.get('km_intervalo_mantencion')),
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

    if 'km_intervalo_mantencion' in payload:
        updates['km_intervalo_mantencion'] = _safe_int(payload['km_intervalo_mantencion'])

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


@bp.route('/<int:veh_id>/viajes', methods=['GET'])
@auth_required
def get_vehiculo_viajes(veh_id):
    """Obtiene viajes (órdenes) del vehículo, usando flota_ordenes y flota_orden_historial;
    permite filtro por fecha (fecha_desde, fecha_hasta), paginado (per_page,page) y retorna adjuntos asociados.
    """
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'status': 'error', 'message': 'Error de configuración: Supabase no disponible'}), 500

    # Parámetros
    fecha_desde = request.args.get('fecha_desde')
    fecha_hasta = request.args.get('fecha_hasta')
    try:
        per_page = max(1, min(200, int(request.args.get('per_page', 50))))
    except ValueError:
        per_page = 50
    try:
        page = max(1, int(request.args.get('page', 1)))
    except ValueError:
        page = 1

    # 1) Obtener órdenes del vehículo
    try:
        query = supabase.table('flota_ordenes').select(
            'id, fecha_inicio_programada, fecha_inicio_real, fecha_fin_real, origen, destino, kilometraje_inicio, kilometraje_fin, estado, conductor:flota_conductores(id,nombre,apellido)'
        ).eq('vehiculo_id', veh_id).order('fecha_inicio_programada', desc=True)

        # Implementamos paginado server-side simple
        start = (page - 1) * per_page
        end = start + per_page - 1
        res = query.range(start, end).execute()
        ordenes = res.data or []

        # Para garantizar que no perdamos órdenes con historial, buscamos eventos en la tabla historial
        orden_ids = [o.get('id') for o in ordenes if o.get('id')]
        hist_by_order = {}

        try:
            # 1) Buscar historial de eventos para este vehículo directamente (para captar órdenes que no aparecen en la primera consulta por paginado)
            hist_query = supabase.table('flota_orden_historial').select('orden_id, created_at, estado_nuevo, observacion, orden:flota_ordenes(id,vehiculo_id)')
            hist_query = hist_query.in_('estado_nuevo', ['completada', 'cancelada'])
            # Filtrar por foranea a vehiculo
            hist_query = hist_query.eq('orden.vehiculo_id', veh_id)
            if fecha_desde:
                hist_query = hist_query.gte('created_at', fecha_desde)
            if fecha_hasta:
                hist_query = hist_query.lte('created_at', fecha_hasta)
            hist_res = hist_query.order('created_at', desc=True).limit(per_page*3).execute()
            hist_all = hist_res.data or []
            hist_ids_from_vehicle = [h.get('orden_id') for h in hist_all if h.get('orden_id')]
            # Merge these ids
            for hid in hist_ids_from_vehicle:
                if hid and hid not in orden_ids:
                    orden_ids.append(hid)
            # Now, also fetch detailed history events for these order ids
            if orden_ids:
                hist_events_res = supabase.table('flota_orden_historial').select('orden_id, created_at, estado_nuevo, observacion').in_('orden_id', orden_ids).in_('estado_nuevo', ['completada', 'cancelada']).order('created_at', desc=True).execute()
                for h in hist_events_res.data or []:
                    oid = h.get('orden_id')
                    if oid and oid not in hist_by_order:
                        hist_by_order[oid] = h
        except Exception as e:
            current_app.logger.warning(f"No fue posible obtener historial para ordenes: {e}")

        # Si encontramos order ids adicionales desde el historial, obtener sus detalles
        missing_ids = [oid for oid in orden_ids if oid not in [o.get('id') for o in ordenes]]
        if missing_ids:
            try:
                extra_res = supabase.table('flota_ordenes').select('id, fecha_inicio_programada, fecha_inicio_real, fecha_fin_real, origen, destino, kilometraje_inicio, kilometraje_fin, estado, conductor:flota_conductores(id,nombre,apellido)').in_('id', missing_ids).execute()
                ordenes += (extra_res.data or [])
            except Exception as e:
                current_app.logger.warning(f"No fue posible obtener detalles para ordenes extras: {e}")

        # Adjuntos por orden
        adjuntos_by_orden = {}
        if orden_ids:
            try:
                adj_res = supabase.table('flota_orden_adjuntos').select('id, orden_id, storage_path, nombre_archivo, mime_type, created_at').in_('orden_id', orden_ids).order('created_at', desc=True).execute()
                for a in adj_res.data or []:
                    oid = a.get('orden_id')
                    # Añadir publicUrl si es posible
                    try:
                        sp = a.get('storage_path')
                        if sp:
                            public = supabase.storage.from_('adjuntos_ordenes').get_public_url(sp)
                            url = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None)
                            a['publicUrl'] = url
                    except Exception:
                        a['publicUrl'] = None
                    if oid:
                        adjuntos_by_orden.setdefault(oid, []).append(a)
            except Exception as e:
                current_app.logger.warning(f"No fue posible obtener adjuntos de ordenes: {e}")

        # Procesar órdenes: añadir hist event y adjuntos; filtrar por fecha si recibido
        resultado = []
        for o in ordenes:
            oid = o.get('id')
            # Obtener la fecha de evento preferida: fecha_fin_real, fecha_inicio_real, fecha_inicio_programada, o el historial.created_at
            fecha_cand = None
            if o.get('fecha_fin_real'):
                fecha_cand = o.get('fecha_fin_real')
            elif o.get('fecha_inicio_real'):
                fecha_cand = o.get('fecha_inicio_real')
            elif o.get('fecha_inicio_programada'):
                fecha_cand = o.get('fecha_inicio_programada')
            elif hist_by_order.get(oid):
                fecha_cand = hist_by_order[oid].get('created_at')

            # Filtro por fecha si se solicitó
            if fecha_desde or fecha_hasta:
                try:
                    if fecha_cand:
                        from datetime import datetime
                        fdate = datetime.fromisoformat(fecha_cand.replace('Z', '')) if 'Z' in str(fecha_cand) else datetime.fromisoformat(fecha_cand)
                        if fecha_desde:
                            ds = datetime.fromisoformat(fecha_desde)
                            if fdate < ds:
                                continue
                        if fecha_hasta:
                            he = datetime.fromisoformat(fecha_hasta)
                            # incluir día entero
                            if fdate > he:
                                continue
                except Exception:
                    pass

            o_res = {
                'id': oid,
                'origen': o.get('origen'),
                'destino': o.get('destino'),
                'fecha_inicio_programada': o.get('fecha_inicio_programada'),
                'fecha_inicio_real': o.get('fecha_inicio_real'),
                'fecha_fin_real': o.get('fecha_fin_real'),
                'kilometraje_inicio': o.get('kilometraje_inicio'),
                'kilometraje_fin': o.get('kilometraje_fin'),
                'estado': o.get('estado'),
                'conductor': o.get('conductor'),
                'hist_event': hist_by_order.get(oid),
                'adjuntos': adjuntos_by_orden.get(oid, [])
            }
            resultado.append(o_res)

        return jsonify({'status': 'success', 'data': resultado, 'meta': {'total': len(resultado)}}), 200

    except Exception as e:
        current_app.logger.error(f"Error en get_vehiculo_viajes: {e}")
        return jsonify({'status': 'error', 'message': 'Error al obtener viajes del vehículo'}), 500



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


@bp.route('/<int:veh_id>/adjuntos', methods=['GET'])
@auth_required
def list_vehiculo_adjuntos(veh_id):
    """Devuelve todos los adjuntos relacionados a un vehículo.

    Recolecta adjuntos de:
    - Documentos del vehículo (flota_vehiculo_doc_adjuntos)
    - Adjuntos de órdenes relacionadas al vehículo (flota_orden_adjuntos)
    - Adjuntos de mantenimientos relacionadas al vehículo (flota_mantenimiento_adjuntos)
    """
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    try:
        all_adjuntos = []

        # 1) Adjuntos de documentos del vehículo
        try:
            docs_res = supabase.table('flota_vehiculos_documentos').select('id').eq('vehiculo_id', veh_id).is_('deleted_at', None).execute()
            doc_ids = [d['id'] for d in (docs_res.data or []) if d.get('id')]
        except Exception:
            doc_ids = []

        if doc_ids:
            try:
                res_docs_adj = supabase.table('flota_vehiculo_doc_adjuntos').select('id, created_at, nombre_archivo, storage_path, mime_type, documento_id').in_('documento_id', doc_ids).order('created_at', desc=True).execute()
                for item in res_docs_adj.data or []:
                    # Add public URL
                    try:
                        sp = item.get('storage_path')
                        public = supabase.storage.from_('adjuntos_ordenes').get_public_url(sp) if sp else None
                        url = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None) if public else None
                    except Exception:
                        url = None
                    all_adjuntos.append({
                        'id': item.get('id'),
                        'created_at': item.get('created_at'),
                        'nombre_archivo': item.get('nombre_archivo'),
                        'storage_path': item.get('storage_path'),
                        'mime_type': item.get('mime_type'),
                        'publicUrl': url,
                        'tipo_entidad': 'Documento Vehicular',
                        'entidad_id': item.get('documento_id')
                    })
            except Exception:
                current_app.logger.warning('No se pudieron obtener adjuntos de documentos del vehículo')

        # 2) Adjuntos de órdenes donde la orden pertenece al vehículo
        try:
            ordenes_res = supabase.table('flota_ordenes').select('id').eq('vehiculo_id', veh_id).execute()
            orden_ids = [o['id'] for o in (ordenes_res.data or []) if o.get('id')]
        except Exception:
            orden_ids = []

        if orden_ids:
            try:
                res_ord_adj = supabase.table('flota_orden_adjuntos').select('id, created_at, nombre_archivo, storage_path, mime_type, orden_id').in_('orden_id', orden_ids).order('created_at', desc=True).execute()
                for item in res_ord_adj.data or []:
                    try:
                        sp = item.get('storage_path')
                        public = supabase.storage.from_('adjuntos_ordenes').get_public_url(sp) if sp else None
                        url = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None) if public else None
                    except Exception:
                        url = None
                    all_adjuntos.append({
                        'id': item.get('id'),
                        'created_at': item.get('created_at'),
                        'nombre_archivo': item.get('nombre_archivo'),
                        'storage_path': item.get('storage_path'),
                        'mime_type': item.get('mime_type'),
                        'publicUrl': url,
                        'tipo_entidad': 'Orden de Servicio',
                        'entidad_id': item.get('orden_id')
                    })
            except Exception:
                current_app.logger.warning('No se pudieron obtener adjuntos de órdenes para el vehículo')

        # 3) Adjuntos de mantenimientos para el vehículo
        try:
            mant_res = supabase.table('flota_mantenimientos').select('id').eq('vehiculo_id', veh_id).execute()
            mant_ids = [m['id'] for m in (mant_res.data or []) if m.get('id')]
        except Exception:
            mant_ids = []

        if mant_ids:
            try:
                res_mant_adj = supabase.table('flota_mantenimiento_adjuntos').select('id, created_at, nombre_archivo, storage_path, mime_type, mantenimiento_id').in_('mantenimiento_id', mant_ids).order('created_at', desc=True).execute()
                for item in res_mant_adj.data or []:
                    try:
                        sp = item.get('storage_path')
                        public = supabase.storage.from_('adjuntos_ordenes').get_public_url(sp) if sp else None
                        url = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None) if public else None
                    except Exception:
                        url = None
                    all_adjuntos.append({
                        'id': item.get('id'),
                        'created_at': item.get('created_at'),
                        'nombre_archivo': item.get('nombre_archivo'),
                        'storage_path': item.get('storage_path'),
                        'mime_type': item.get('mime_type'),
                        'publicUrl': url,
                        'tipo_entidad': 'Mantenimiento',
                        'entidad_id': item.get('mantenimiento_id')
                    })
            except Exception:
                current_app.logger.warning('No se pudieron obtener adjuntos de mantenimientos para el vehículo')

        # Ordenar por fecha y devolver
        all_adjuntos.sort(key=lambda x: x.get('created_at') or '', reverse=True)

        return jsonify({'data': all_adjuntos, 'meta': {'total': len(all_adjuntos)}})

    except Exception as e:
        current_app.logger.error(f'Error listando adjuntos del vehículo {veh_id}: {e}')
        return jsonify({'message': 'Error al obtener adjuntos del vehículo'}), 500