# En: backend/modules/mantenimiento.py

# === 1. IMPORTS ===
from flask import Blueprint, request, jsonify, current_app, g
from datetime import datetime

# Importación robusta de auth (igual que en reportes por seguridad)
auth_required = None
try:
    from ..utils.auth import auth_required, _has_write_permission, _is_admin
except (ImportError, ValueError):
    try:
        from backend.utils.auth import auth_required, _has_write_permission, _is_admin
    except ImportError:
        try:
            from utils.auth import auth_required, _has_write_permission, _is_admin
        except ImportError:
            pass

if not auth_required:
    def auth_required(f): return f
    def _has_write_permission(u): return True
    def _is_admin(u): return True

# === 2. DEFINICIÓN DEL BLUEPRINT ===
bp = Blueprint('mantenimiento', __name__)

# === 3. HELPERS ===
def _safe_int(value):
    if value is None or value == '': return None
    try: return int(float(value))
    except (ValueError, TypeError): return None

def _safe_float(value):
    if value is None or value == '': return None
    try: return float(value)
    except (ValueError, TypeError): return None

def _safe_date(value):
    if not value: return None
    try:
        if isinstance(value, str) and 'T' in value:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.date().isoformat()
        if isinstance(value, str):
            return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
        return None
    except (ValueError, TypeError): return None
        
def _check_required_fields(payload: dict, required_fields: list) -> list:
    return [field for field in required_fields if not payload.get(field)]

# === 4. RUTAS DEL MÓDULO MANTENIMIENTO ===

@bp.route('/', methods=['GET'])
@auth_required
def list_mantenimientos():
    """Listar órdenes de mantenimiento con 'Manual Join' para asegurar Patentes."""
    supabase = current_app.config.get('SUPABASE')
    if not supabase: return jsonify({'message': 'Error config'}), 500

    q = request.args.get('search')
    estado = request.args.get('estado')
    vehiculo_id = request.args.get('vehiculo_id')

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except ValueError:
        return jsonify({'message': 'Pagination error'}), 400

    start = (page - 1) * per_page
    end = start + per_page - 1

    # 1. CONSULTA PRINCIPAL (Solo tabla base, sin joins que fallan)
    query = supabase.table('flota_mantenimientos').select('*', count='exact').is_('deleted_at', None)
    
    # Filtros de búsqueda (Texto y Patente)
    if q:
        like_q = f'%{q}%'
        or_conditions = [f"descripcion.ilike.{like_q}", f"observaciones.ilike.{like_q}"]
        # Buscar IDs de vehículos por patente
        try:
            veh_res = supabase.table('flota_vehiculos').select('id').ilike('placa', like_q).execute()
            if veh_res.data:
                veh_ids = [str(v['id']) for v in veh_res.data]
                if veh_ids: or_conditions.append(f"vehiculo_id.in.({','.join(veh_ids)})")
        except Exception: pass
        query = query.or_(",".join(or_conditions))

    if estado: query = query.eq('estado', estado)
    if vehiculo_id: query = query.eq('vehiculo_id', vehiculo_id)

    query = query.order('fecha_programada', desc=True)

    try:
        # Ejecutar paginación
        res = query.range(start, end).execute()
        data = res.data or []
        total = res.count if res.count is not None else len(data)

        # --- ESTRATEGIA JOIN MANUAL (DETECTIVE) ---
        if data:
            # A) Obtener IDs necesarios
            veh_ids = list(set(d['vehiculo_id'] for d in data if d.get('vehiculo_id')))
            mant_ids = [d['id'] for d in data]

            # B) Traer Vehículos en lote
            veh_map = {}
            if veh_ids:
                res_v = supabase.table('flota_vehiculos').select('id, placa, marca, modelo').in_('id', veh_ids).execute()
                veh_map = {v['id']: v for v in (res_v.data or [])}

            # C) Traer Detalles en lote
            det_map = {}
            if mant_ids:
                # Traemos detalles con su concepto/categoría
                res_d = supabase.table('mantenimiento_detalles')\
                    .select('*, concepto:conceptos_gasto(id, nombre, categoria:categorias_mantencion(nombre))')\
                    .in_('mantenimiento_id', mant_ids)\
                    .execute()
                raw_dets = res_d.data or []
                for det in raw_dets:
                    mid = det['mantenimiento_id']
                    if mid not in det_map: det_map[mid] = []
                    det_map[mid].append(det)

            # D) Ensamblar datos
            for item in data:
                # Pegar vehículo
                vid = item.get('vehiculo_id')
                item['vehiculo'] = veh_map.get(vid, {'placa': 'S/P', 'marca': '-', 'modelo': '-'})
                
                # Pegar detalles
                mid = item['id']
                item['detalles'] = det_map.get(mid, [])
                
                # (Opcional) Recalcular costo visual si es 0
                if item.get('costo') == 0 and item['detalles']:
                    item['costo'] = sum(d.get('costo', 0) for d in item['detalles'])

    except Exception as e:
        current_app.logger.error(f"Error list_mantenimientos: {e}")
        return jsonify({'message': 'Error BD', 'detail': str(e)}), 500

    return jsonify({
        'data': data, 
        'meta': {'page': page, 'per_page': per_page, 'total': total, 'pages': (total // per_page) + (1 if total % per_page > 0 else 0)}
    })

@bp.route('/', methods=['POST'])
@auth_required
def create_mantenimiento():
    """Crear orden (Cabecera + Detalles)."""
    user = g.get('current_user')
    if not _has_write_permission(user): return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    missing = _check_required_fields(payload, ['vehiculo_id', 'descripcion', 'fecha_programada'])
    if missing: return jsonify({'message': f'Faltan campos: {", ".join(missing)}'}), 400

    try:
        # 1. Cabecera
        header_data = {
            'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
            'fecha_programada': _safe_date(payload.get('fecha_programada')),
            'descripcion': payload.get('descripcion'),
            'estado': payload.get('estado', 'PENDIENTE'),
            'km_programado': _safe_int(payload.get('km_programado')),
            'tipo_mantenimiento': payload.get('tipo_mantenimiento', 'PREVENTIVO'),
            'costo': _safe_float(payload.get('costo_total', 0))
        }

        res = supabase.table('flota_mantenimientos').insert(header_data).execute()
        if not res.data: return jsonify({'message': 'Error creando cabecera'}), 400
        mant_id = res.data[0]['id']
        
        # 2. Detalles
        items = payload.get('items', [])
        if items:
            detalles_data = []
            for item in items:
                detalles_data.append({
                    'mantenimiento_id': mant_id,
                    'concepto_id': _safe_int(item.get('concepto_id')),
                    'costo': _safe_float(item.get('costo', 0)),
                    'notas': item.get('notas', '')
                })
            supabase.table('mantenimiento_detalles').insert(detalles_data).execute()
            
            # Update costo total header
            total = sum([d['costo'] for d in detalles_data])
            supabase.table('flota_mantenimientos').update({'costo': total}).eq('id', mant_id).execute()

        # Renovar gases
        renovar_gases = _safe_date(payload.get('renovar_gases'))
        if renovar_gases and header_data['vehiculo_id']:
            supabase.table('flota_vehiculos').update({'fecha_vencimiento_gases': renovar_gases}).eq('id', header_data['vehiculo_id']).execute()

        return jsonify({'message': 'Orden creada', 'id': mant_id}), 201

    except Exception as e:
        return jsonify({'message': 'Error al crear', 'detail': str(e)}), 500

@bp.route('/<int:mant_id>', methods=['PUT'])
@auth_required
def update_mantenimiento(mant_id):
    """Actualizar orden y sincronizar detalles."""
    user = g.get('current_user')
    if not _has_write_permission(user): return jsonify({'message': 'Permisos insuficientes'}), 403

    supabase = current_app.config.get('SUPABASE')
    payload = request.get_json() or {}

    try:
        # 1. Cabecera
        updates = {
            'vehiculo_id': _safe_int(payload.get('vehiculo_id')),
            'fecha_programada': _safe_date(payload.get('fecha_programada')),
            'descripcion': payload.get('descripcion'),
            'estado': payload.get('estado'),
            'km_programado': _safe_int(payload.get('km_programado')),
            'fecha_realizacion': _safe_date(payload.get('fecha_realizacion')),
            'km_realizacion': _safe_int(payload.get('km_realizacion')),
            'observaciones': payload.get('observaciones'),
            'costo': _safe_float(payload.get('costo_total'))
        }
        # Filtrar solo campos presentes y no None (excepto si queremos borrar, pero asumimos update parcial)
        # Ajuste: Si viene en payload, lo usamos.
        final_updates = {}
        for k, v in updates.items():
            if k in payload: final_updates[k] = v
            
        if final_updates:
            supabase.table('flota_mantenimientos').update(final_updates).eq('id', mant_id).execute()

        # 2. Detalles (Sync)
        if 'items' in payload:
            supabase.table('mantenimiento_detalles').delete().eq('mantenimiento_id', mant_id).execute()
            items = payload.get('items', [])
            if items:
                detalles_data = []
                for item in items:
                    detalles_data.append({
                        'mantenimiento_id': mant_id,
                        'concepto_id': _safe_int(item.get('concepto_id')),
                        'costo': _safe_float(item.get('costo', 0)),
                        'notas': item.get('notas', '')
                    })
                supabase.table('mantenimiento_detalles').insert(detalles_data).execute()
                
                # Update total
                total = sum([d['costo'] for d in detalles_data])
                supabase.table('flota_mantenimientos').update({'costo': total}).eq('id', mant_id).execute()

        # Renovar gases
        if 'renovar_gases' in payload:
            r_gas = _safe_date(payload.get('renovar_gases'))
            vid = final_updates.get('vehiculo_id')
            if not vid:
                curr = supabase.table('flota_mantenimientos').select('vehiculo_id').eq('id', mant_id).single().execute()
                if curr.data: vid = curr.data['vehiculo_id']
            if r_gas and vid:
                supabase.table('flota_vehiculos').update({'fecha_vencimiento_gases': r_gas}).eq('id', vid).execute()

        return jsonify({'message': 'Actualizado'}), 200

    except Exception as e:
        return jsonify({'message': 'Error update', 'detail': str(e)}), 500

@bp.route('/<int:mant_id>', methods=['DELETE'])
@auth_required
def delete_mantenimiento(mant_id):
    user = g.get('current_user')
    if not _is_admin(user): return jsonify({'message': 'Permisos insuficientes'}), 403
    try:
        current_app.config.get('SUPABASE').table('flota_mantenimientos').update({'deleted_at': datetime.now().isoformat()}).eq('id', mant_id).execute()
        return jsonify({'message': 'Eliminado'}), 200
    except Exception as e: return jsonify({'message': 'Error delete', 'detail': str(e)}), 500

# === RUTAS DE ADJUNTOS (Sin cambios) ===
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
                    # Ajuste de compatibilidad para diferentes versiones de librería
                    if hasattr(public, 'publicUrl'): url = public.publicUrl
                    elif isinstance(public, dict): url = public.get('publicUrl')
                    else: url = str(public) 
                    item['publicUrl'] = url
                except: pass
        return jsonify({'data': data})
    except Exception: return jsonify({'message': 'Error'}), 500

@bp.route('/<int:mant_id>/adjuntos', methods=['POST'])
@auth_required
def add_mant_adjunto(mant_id):
    user = g.get('current_user')
    if not _has_write_permission(user): return jsonify({'message': 'Permisos insuficientes'}), 403
    payload = request.get_json() or {}
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