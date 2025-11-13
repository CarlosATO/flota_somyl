import os
import requests
from flask import Blueprint, request, jsonify, current_app, g, Response, stream_with_context
from ..utils.auth import auth_required
from datetime import datetime

bp = Blueprint('adjuntos', __name__)

@bp.route('/', methods=['GET'])
@auth_required
def search_adjuntos():
    """
    Busca adjuntos de Órdenes de Servicio y Mantenimiento, unificando resultados.
    Filtra por 'q' (placa, id de orden/mantenimiento, nombre de archivo).
    """
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Error de configuración: Supabase no disponible'}), 500

    q = request.args.get('search', '').strip()
    like_q = f"%{q}%" if q else None
    
    # 1. Búsqueda en Adjuntos de Órdenes
    orden_adjuntos = []
    try:
        # Consulta: Adjuntos de Ordenes + Join a Vehiculos para la placa
        orden_query = supabase.table('flota_orden_adjuntos').select(
            'id, created_at, nombre_archivo, storage_path, mime_type, orden_id, orden:flota_ordenes(vehiculo_id, vehiculo:flota_vehiculos(placa))'
        )
        
        # Filtro: por ID de Orden, ID de Adjunto o nombre de archivo
        if q:
            # Intentar buscar por ID numérico (de orden o adjunto)
            try:
                q_id = int(q)
                orden_query = orden_query.or_(f"orden_id.eq.{q_id},id.eq.{q_id},nombre_archivo.ilike.{like_q}")
                res_orden = orden_query.order('created_at', desc=True).limit(50).execute()
            except ValueError:
                # Texto: buscaremos por nombre_archivo y además por patente mediante subconsultas
                # 1) Buscar adjuntos cuyo nombre coincida
                res_name = orden_query.ilike('nombre_archivo', like_q).order('created_at', desc=True).limit(50).execute()
                results = res_name.data or []

                # 2) Buscar vehículos por placa y luego órdenes relacionadas
                try:
                    veh_res = supabase.table('flota_vehiculos').select('id').ilike('placa', like_q).execute()
                    veh_ids = [v['id'] for v in (veh_res.data or []) if v.get('id')]
                except Exception:
                    veh_ids = []

                orden_ids = []
                if veh_ids:
                    try:
                        orden_res = supabase.table('flota_ordenes').select('id').in_('vehiculo_id', veh_ids).execute()
                        orden_ids = [o['id'] for o in (orden_res.data or []) if o.get('id')]
                    except Exception:
                        orden_ids = []

                if orden_ids:
                    try:
                        res_by_orden = supabase.table('flota_orden_adjuntos').select(
                            'id, created_at, nombre_archivo, storage_path, mime_type, orden_id, orden:flota_ordenes(vehiculo_id, vehiculo:flota_vehiculos(placa))'
                        ).in_('orden_id', orden_ids).order('created_at', desc=True).limit(50).execute()
                        results += (res_by_orden.data or [])
                    except Exception:
                        pass

                # Deduplicate by id
                seen = set()
                merged = []
                for item in results:
                    iid = item.get('id')
                    if iid and iid not in seen:
                        seen.add(iid)
                        merged.append(item)

                res_orden = type('R', (), {'data': merged})()
        else:
            res_orden = orden_query.order('created_at', desc=True).limit(50).execute()

        for item in res_orden.data or []:
            placa = item.get('orden', {}).get('vehiculo', {}).get('placa') if item.get('orden') else None
            orden_adjuntos.append({
                'id': item['id'],
                'created_at': item['created_at'],
                'nombre_archivo': item['nombre_archivo'],
                'storage_path': item['storage_path'],
                'mime_type': item['mime_type'],
                'placa': placa,
                'entidad_id': item['orden_id'],
                'tipo_entidad': 'Orden de Servicio'
            })
            
    except Exception as e:
        current_app.logger.error(f"Error al buscar adjuntos de órdenes: {e}")

    # 2. Búsqueda en Adjuntos de Mantenimiento
    mant_adjuntos = []
    try:
        # Consulta: Adjuntos de Mantenimiento + Join a Vehiculos para la placa
        mant_query = supabase.table('flota_mantenimiento_adjuntos').select(
            'id, created_at, nombre_archivo, storage_path, mime_type, mantenimiento_id, mantenimiento:flota_mantenimientos(vehiculo_id, vehiculo:flota_vehiculos(placa))'
        )
        
        if q:
            try:
                q_id = int(q)
                mant_query = mant_query.or_(f"mantenimiento_id.eq.{q_id},id.eq.{q_id},nombre_archivo.ilike.{like_q}")
                res_mant = mant_query.order('created_at', desc=True).limit(50).execute()
            except ValueError:
                # Buscar por nombre y por patente (subconsulta a vehiculos -> mantenimientos)
                res_name_m = mant_query.ilike('nombre_archivo', like_q).order('created_at', desc=True).limit(50).execute()
                results_m = res_name_m.data or []

                try:
                    veh_res = supabase.table('flota_vehiculos').select('id').ilike('placa', like_q).execute()
                    veh_ids = [v['id'] for v in (veh_res.data or []) if v.get('id')]
                except Exception:
                    veh_ids = []

                mant_ids = []
                if veh_ids:
                    try:
                        mant_res = supabase.table('flota_mantenimientos').select('id').in_('vehiculo_id', veh_ids).execute()
                        mant_ids = [m['id'] for m in (mant_res.data or []) if m.get('id')]
                    except Exception:
                        mant_ids = []

                if mant_ids:
                    try:
                        res_by_mant = supabase.table('flota_mantenimiento_adjuntos').select(
                            'id, created_at, nombre_archivo, storage_path, mime_type, mantenimiento_id, mantenimiento:flota_mantenimientos(vehiculo_id, vehiculo:flota_vehiculos(placa))'
                        ).in_('mantenimiento_id', mant_ids).order('created_at', desc=True).limit(50).execute()
                        results_m += (res_by_mant.data or [])
                    except Exception:
                        pass

                seen_m = set()
                merged_m = []
                for item in results_m:
                    iid = item.get('id')
                    if iid and iid not in seen_m:
                        seen_m.add(iid)
                        merged_m.append(item)

                res_mant = type('R', (), {'data': merged_m})()
        else:
            res_mant = mant_query.order('created_at', desc=True).limit(50).execute()

        for item in res_mant.data or []:
            placa = item.get('mantenimiento', {}).get('vehiculo', {}).get('placa') if item.get('mantenimiento') else None
            mant_adjuntos.append({
                'id': item['id'],
                'created_at': item['created_at'],
                'nombre_archivo': item['nombre_archivo'],
                'storage_path': item['storage_path'],
                'mime_type': item['mime_type'],
                'placa': placa,
                'entidad_id': item['mantenimiento_id'],
                'tipo_entidad': 'Mantenimiento'
            })
            
    except Exception as e:
        current_app.logger.error(f"Error al buscar adjuntos de mantenimiento: {e}")

    # 3. Combinar y ordenar
    todos_adjuntos = orden_adjuntos + mant_adjuntos
    todos_adjuntos.sort(key=lambda x: x['created_at'], reverse=True)

    return jsonify({
        'status': 'success',
        'data': todos_adjuntos,
        'meta': {'total_results': len(todos_adjuntos)}
    }), 200


@bp.route('/download', methods=['GET'])
@auth_required
def download_adjunto():
    """Proxy para descargar un archivo de Supabase Storage y forzar Content-Disposition=attachment.

    Parámetros: ?path=<storage_path>&name=<filename_optional>
    """
    supabase = current_app.config.get('SUPABASE')
    if not supabase:
        return jsonify({'message': 'Supabase no configurado'}), 500

    storage_path = request.args.get('path')
    filename = request.args.get('name') or (os.path.basename(storage_path) if storage_path else 'file')
    bucket = 'adjuntos_ordenes'

    if not storage_path:
        return jsonify({'message': 'Falta parámetro path'}), 400

    try:
        # Intentar obtener una URL pública/signed desde Supabase
        try:
            public = supabase.storage.from_(bucket).get_public_url(storage_path)
            url = public.get('data', {}).get('publicUrl') if isinstance(public, dict) else getattr(public, 'publicUrl', None)
        except Exception:
            url = None

        # Si no hay public url, intentar crear signed url (1 hora)
        if not url:
            try:
                signed = supabase.storage.from_(bucket).create_signed_url(storage_path, 3600)
                # signed puede devolver dict con 'signedURL' o 'data' según versión
                url = (signed.get('signedURL') if isinstance(signed, dict) and signed.get('signedURL') else (signed.get('data', {}).get('signed_url') if isinstance(signed, dict) else None))
            except Exception:
                url = None

        if not url:
            return jsonify({'message': 'No se pudo obtener URL del archivo'}), 500

        # Solicitar el recurso y streamarlo al cliente con header de descarga
        r = requests.get(url, stream=True, timeout=30)
        if r.status_code != 200:
            return jsonify({'message': f'Error al descargar archivo (status {r.status_code})'}), 502

        headers = {
            'Content-Type': r.headers.get('Content-Type', 'application/octet-stream'),
            'Content-Length': r.headers.get('Content-Length') or '',
            'Content-Disposition': f'attachment; filename="{filename}"'
        }

        return Response(stream_with_context(r.iter_content(chunk_size=8192)), headers=headers, status=200)
    except Exception as e:
        current_app.logger.error(f'Error en download_adjunto: {e}')
        return jsonify({'message': 'Error al procesar la descarga'}), 500
