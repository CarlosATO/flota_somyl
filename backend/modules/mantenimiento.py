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
    """Listar órdenes de mantenimiento con filtros (Búsqueda mejorada)."""
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

    query = supabase.table('flota_mantenimientos').select(
        '*, vehiculo:flota_vehiculos(placa, marca, modelo)'
    ).is_('deleted_at', None)
    
    # --- LOGICA DE BÚSQUEDA MEJORADA (Patente + Texto) ---
    if q:
        like_q = f'%{q}%'
        or_conditions = [
            f"descripcion.ilike.{like_q}",
            f"observaciones.ilike.{like_q}"
        ]
        
        # Intentar buscar IDs de vehículos por placa para incluirlos en el filtro
        try:
            veh_res = supabase.table('flota_vehiculos').select('id').ilike('placa', like_q).execute()
            if veh_res.data:
                # Si encontramos vehículos con esa patente, agregamos sus IDs al filtro OR
                veh_ids = [str(v['id']) for v in veh_res.data]
                if veh_ids:
                    or_conditions.append(f"vehiculo_id.in.({','.join(veh_ids)})")
        except Exception:
            pass

        # Aplicar el filtro OR combinado
        query = query.or_(",".join(or_conditions))
    # -----------------------------------------------------

    if estado:
        query = query.eq('estado', estado)
    if vehiculo_id:
        try:
            veh_id_int = int(vehiculo_id)
            query = query.eq('vehiculo_id', veh_id_int)
        except ValueError:
            pass 

    query = query.order('fecha_programada', desc=True)

    try:
        res = query.range(start, end).execute()
        data = res.data or []
    except Exception as e:
        current_app.logger.error(f"Error al listar mantenimientos: {e}")
        return jsonify({'message': 'Error en la base de datos', 'detail': str(e)}), 500

    # Obtener conteo aproximado (simplificado para rendimiento)
    try:
        total = len(data) # Fallback simple
        # Si la página está llena, intentamos obtener el total real
        if len(data) >= per_page or page > 1:
             count_query = supabase.table('flota_mantenimientos').select('id', count='exact').is_('deleted_at', None)
             # Repetir filtros para count (simplificado)
             if estado: count_query = count_query.eq('estado', estado)
             if vehiculo_id: count_query = count_query.eq('vehiculo_id', vehiculo_id)
             count_res = count_query.execute()
             if count_res.count is not None:
                 total = count_res.count
    except Exception:
        pass

    return jsonify({
        'data': data, 
        'meta': {
            'page': page, 
            'per_page': per_page, 
            'total': total, 
            'pages': (total // per_page) + (1 if total % per_page > 0 else 0) if total else 1
        }
    })

@bp.route('/', methods=['POST'])
@auth_required
def create_mantenimiento():
    """Crear una nueva orden de mantenimiento."""
    user = g.get('current_user')
    if not _has_write_permission(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

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
        
        # Actualizar Gases del Vehículo si aplica
        renovar_gases = _safe_date(payload.get('renovar_gases'))
        if renovar_gases and row['vehiculo_id']:
            try:
                supabase.table('flota_vehiculos').update({
                    'fecha_vencimiento_gases': renovar_gases
                }).eq('id', row['vehiculo_id']).execute()
            except Exception as e:
                current_app.logger.error(f"Error actualizando gases vehículo (POST): {e}")

        return jsonify({'data': res.data[0]}), 201
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

    if not updates and 'renovar_gases' not in payload:
        return jsonify({'message': 'No hay cambios'}), 400

    try:
        res_mant = None
        if updates:
            res_mant = supabase.table('flota_mantenimientos').update(updates).eq('id', mant_id).is_('deleted_at', None).execute()
        
        # Actualizar Gases del Vehículo si aplica
        renovar_gases = _safe_date(payload.get('renovar_gases'))
        if renovar_gases:
            vid = updates.get('vehiculo_id')
            if not vid:
                if res_mant and res_mant.data:
                    vid = res_mant.data[0].get('vehiculo_id')
                else:
                    tmp = supabase.table('flota_mantenimientos').select('vehiculo_id').eq('id', mant_id).single().execute()
                    if tmp.data: vid = tmp.data.get('vehiculo_id')

            if vid:
                try:
                    supabase.table('flota_vehiculos').update({
                        'fecha_vencimiento_gases': renovar_gases
                    }).eq('id', vid).execute()
                except Exception as e:
                    current_app.logger.error(f"Error actualizando gases vehículo (PUT): {e}")

        if res_mant and res_mant.data:
            return jsonify({'data': res_mant.data[0]})
        
        if renovar_gases:
             return jsonify({'message': 'Gases actualizados correctamente'})

        return jsonify({'message': f'Mantenimiento {mant_id} no encontrado'}), 404

    except Exception as e:
        current_app.logger.error(f"Error al actualizar mantenimiento: {e}")
        return jsonify({'message': 'Error inesperado al actualizar', 'detail': str(e)}), 500

@bp.route('/<int:mant_id>', methods=['DELETE'])
@auth_required
def delete_mantenimiento(mant_id):
    user = g.get('current_user')
    if not _is_admin(user):
        return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_mantenimientos').update({'deleted_at': datetime.now().isoformat()}).eq('id', mant_id).execute()
        if res.data:
            return jsonify({'message': f'Mantenimiento {mant_id} eliminado.'}), 200
        return jsonify({'message': 'Mantenimiento no encontrado'}), 404
    except Exception as e:
        return jsonify({'message': 'Error al eliminar', 'detail': str(e)}), 500

# === RUTAS DE ADJUNTOS ===
# (Se mantienen sin cambios, asegúrate de tenerlas al final del archivo como antes)
@bp.route('/<int:mant_id>/adjuntos', methods=['GET'])
@auth_required
def list_mant_adjuntos(mant_id):
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_mantenimiento_adjuntos').select('*').eq('mantenimiento_id', mant_id).order('created_at', desc=True).execute()
        data = res.data or []
        for item in data:
            if item.get('storage_path'):
                try:
                    public = supabase.storage.from_('adjuntos_ordenes').get_public_url(item['storage_path'])
                    item['publicUrl'] = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None)
                except: pass
        return jsonify({'data': data})
    except Exception as e: return jsonify({'message': 'Error'}), 500

@bp.route('/<int:mant_id>/adjuntos', methods=['POST'])
@auth_required
def add_mant_adjunto(mant_id):
    user = g.get('current_user')
    if not _has_write_permission(user): return jsonify({'message': 'Permisos insuficientes'}), 403
    payload = request.get_json() or {}
    if not payload.get('storage_path'): return jsonify({'message': 'Falta path'}), 400
    row = {
        'mantenimiento_id': mant_id, 'usuario_id': user.get('id'),
        'storage_path': payload.get('storage_path'), 'nombre_archivo': payload.get('nombre_archivo'),
        'mime_type': payload.get('mime_type'), 'observacion': payload.get('observacion')
    }
    try:
        res = current_app.config.get('SUPABASE').table('flota_mantenimiento_adjuntos').insert(row).execute()
        return jsonify({'data': res.data[0]}), 201
    except Exception: return jsonify({'message': 'Error'}), 500

@bp.route('/adjuntos/<int:adjunto_id>', methods=['DELETE'])
@auth_required
def delete_mant_adjunto(adjunto_id):
    user = g.get('current_user')
    if not _has_write_permission(user): return jsonify({'message': 'Permisos insuficientes'}), 403
    supabase = current_app.config.get('SUPABASE')
    try:
        res = supabase.table('flota_mantenimiento_adjuntos').select('storage_path').eq('id', adjunto_id).limit(1).execute()
        if res.data:
            path = res.data[0].get('storage_path')
            supabase.table('flota_mantenimiento_adjuntos').delete().eq('id', adjunto_id).execute()
            if path: supabase.storage.from_('adjuntos_ordenes').remove([path])
            return jsonify({'message': 'Eliminado'}), 200
        return jsonify({'message': 'No encontrado'}), 404
    except Exception: return jsonify({'message': 'Error'}), 500