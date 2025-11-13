# En: backend/modules/reportes.py

from flask import Blueprint, jsonify, current_app, request, g
from ..utils.auth import auth_required
from datetime import datetime, timedelta

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:
    class PostgrestAPIError(Exception):
        pass

reportes_bp = Blueprint('reportes', __name__)

@reportes_bp.route('/kpis_resumen', methods=['GET'])
@auth_required
def get_kpis_resumen():
    """Obtiene KPIs de resumen para el dashboard"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración: Supabase no disponible'}), 500

        # Total de vehículos activos (no eliminados)
        vehiculos_res = supabase.table('flota_vehiculos').select('id', count='exact').is_('deleted_at', None).execute()
        total_vehiculos = vehiculos_res.count if vehiculos_res.count is not None else 0

        # Total de conductores activos (no eliminados)
        conductores_res = supabase.table('flota_conductores').select('id', count='exact').is_('deleted_at', None).execute()
        total_conductores = conductores_res.count if conductores_res.count is not None else 0

    # Órdenes activas = todas las que NO están completadas ni canceladas
    ordenes_res = supabase.table('flota_ordenes').select('id', count='exact').not_.in_('estado', ['completada', 'cancelada']).execute()
    ordenes_activas = ordenes_res.count if ordenes_res.count is not None else 0

        # Mantenimientos pendientes (no completados ni cancelados)
        mantenimientos_res = supabase.table('flota_mantenimientos').select('id', count='exact').in_('estado', ['programado', 'pendiente', 'en_taller']).is_('deleted_at', None).execute()
        mantenimientos_pendientes = mantenimientos_res.count if mantenimientos_res.count is not None else 0

        return jsonify({
            'status': 'success',
            'data': {
                'total_vehiculos': total_vehiculos,
                'total_conductores': total_conductores,
                'ordenes_activas': ordenes_activas,
                'mantenimientos_pendientes': mantenimientos_pendientes,
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en kpis_resumen: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener KPIs de resumen'}), 500


@reportes_bp.route('/costo_mantenimiento_mensual', methods=['GET'])
@auth_required
def get_costo_mantenimiento():
    """Calcula el costo total de mantenimientos de los últimos 30 días"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        fecha_limite = (datetime.now() - timedelta(days=30)).date().isoformat()
        
        res = supabase.table('flota_mantenimientos').select('costo').gte('fecha_programada', fecha_limite).is_('deleted_at', None).execute()
        
        costo_total = 0
        for m in res.data or []:
            if m.get('costo'):
                try:
                    costo_total += float(m['costo'])
                except (ValueError, TypeError):
                    pass

        return jsonify({
            'status': 'success',
            'data': {'costo_total_clp': costo_total}
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en costo_mantenimiento_mensual: {e}')
        return jsonify({'status': 'error', 'message': 'Error al calcular costo de mantenimiento'}), 500


@reportes_bp.route('/mantenimientos_por_vencer', methods=['GET'])
@auth_required
def get_mantenimientos_por_vencer():
    """
    Obtiene mantenimientos próximos a vencer o vencidos.
    Parámetros opcionales:
    - dias (int): ventana de días a futuro (default: 30)
    """
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # Parámetros
        dias = int(request.args.get('dias', 30))
        hoy = datetime.now().date()
        fecha_limite = (hoy + timedelta(days=dias)).isoformat()

        # Buscar mantenimientos programados o pendientes que vencen pronto
        query = supabase.table('flota_mantenimientos').select(
            '*, vehiculo:flota_vehiculos(id, placa, marca, modelo, tipo)'
        ).in_('estado', ['programado', 'pendiente']).lte('fecha_programada', fecha_limite).is_('deleted_at', None).order('fecha_programada', desc=False)

        res = query.execute()
        mantenimientos = res.data or []

        # Calcular días restantes y nivel de urgencia
        resultado = []
        for mant in mantenimientos:
            fecha_prog = mant.get('fecha_programada')
            if not fecha_prog:
                continue
            
            try:
                fecha_dt = datetime.fromisoformat(fecha_prog.replace('Z', '+00:00')).date()
                dias_restantes = (fecha_dt - hoy).days
                
                # Determinar urgencia
                if dias_restantes < 0:
                    urgencia = 'vencido'
                elif dias_restantes <= 7:
                    urgencia = 'critico'
                elif dias_restantes <= 15:
                    urgencia = 'urgente'
                else:
                    urgencia = 'proximo'
                
                resultado.append({
                    **mant,
                    'dias_restantes': dias_restantes,
                    'urgencia': urgencia
                })
            except:
                continue

        # Ordenar por días restantes (más urgentes primero)
        resultado.sort(key=lambda x: x['dias_restantes'])

        return jsonify({
            'status': 'success',
            'data': resultado,
            'meta': {
                'total': len(resultado),
                'vencidos': len([m for m in resultado if m['urgencia'] == 'vencido']),
                'criticos': len([m for m in resultado if m['urgencia'] == 'critico']),
                'urgentes': len([m for m in resultado if m['urgencia'] == 'urgente']),
                'proximos': len([m for m in resultado if m['urgencia'] == 'proximo'])
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en mantenimientos_por_vencer: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener mantenimientos por vencer'}), 500


@reportes_bp.route('/licencias_por_vencer', methods=['GET'])
@auth_required
def get_licencias_por_vencer():
    """
    Obtiene licencias de conducir próximas a vencer o vencidas.
    Parámetros opcionales:
    - dias (int): ventana de días a futuro (default: 30)
    """
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # Parámetros
        dias = int(request.args.get('dias', 60))  # 60 días por defecto para licencias
        hoy = datetime.now().date()
        fecha_limite = (hoy + timedelta(days=dias)).isoformat()

        # Buscar conductores activos con licencia próxima a vencer
        query = supabase.table('flota_conductores').select(
            'id, nombre, apellido, rut, licencia_numero, licencia_tipo, licencia_vencimiento, email, telefono, estado'
        ).eq('estado', 'ACTIVO').is_('deleted_at', None).not_.is_('licencia_vencimiento', None).lte('licencia_vencimiento', fecha_limite).order('licencia_vencimiento', desc=False)

        res = query.execute()
        conductores = res.data or []

        # Calcular días restantes y nivel de urgencia
        resultado = []
        for conductor in conductores:
            fecha_venc = conductor.get('licencia_vencimiento')
            if not fecha_venc:
                continue
            
            try:
                fecha_dt = datetime.fromisoformat(fecha_venc.replace('Z', '+00:00')).date()
                dias_restantes = (fecha_dt - hoy).days
                
                # Determinar urgencia
                if dias_restantes < 0:
                    urgencia = 'vencida'
                elif dias_restantes <= 15:
                    urgencia = 'critico'
                elif dias_restantes <= 30:
                    urgencia = 'urgente'
                else:
                    urgencia = 'proximo'
                
                resultado.append({
                    **conductor,
                    'dias_restantes': dias_restantes,
                    'urgencia': urgencia,
                    'nombre_completo': f"{conductor.get('nombre', '')} {conductor.get('apellido', '')}".strip()
                })
            except:
                continue

        # Ordenar por días restantes (más urgentes primero)
        resultado.sort(key=lambda x: x['dias_restantes'])

        return jsonify({
            'status': 'success',
            'data': resultado,
            'meta': {
                'total': len(resultado),
                'vencidas': len([c for c in resultado if c['urgencia'] == 'vencida']),
                'criticos': len([c for c in resultado if c['urgencia'] == 'critico']),
                'urgentes': len([c for c in resultado if c['urgencia'] == 'urgente']),
                'proximos': len([c for c in resultado if c['urgencia'] == 'proximo'])
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en licencias_por_vencer: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener licencias por vencer'}), 500


@reportes_bp.route('/detalle_vehiculos', methods=['GET'])
@auth_required
def get_detalle_vehiculos():
    """Obtiene listado detallado de vehículos con KM actual calculado desde órdenes"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # 1. Obtener vehículos básicos
        res_vehiculos = supabase.table('flota_vehiculos').select(
            'id, placa, marca, modelo, tipo, ano'
        ).is_('deleted_at', None).order('placa', desc=False).execute()

        vehiculos = res_vehiculos.data or []

        # 2. Obtener todos los kilometrajes de órdenes
        res_ordenes = supabase.table('flota_ordenes').select(
            'vehiculo_id, kilometraje_inicio, kilometraje_fin'
        ).execute()

        ordenes = res_ordenes.data or []

        # 3. Calcular KM máximo por vehículo
        km_por_vehiculo = {}
        for orden in ordenes:
            vehiculo_id = orden.get('vehiculo_id')
            if not vehiculo_id:
                continue
            
            km_inicio = orden.get('kilometraje_inicio')
            km_fin = orden.get('kilometraje_fin')
            
            # Encontrar el valor máximo
            valores = []
            if km_inicio is not None:
                try:
                    valores.append(int(km_inicio))
                except:
                    pass
            if km_fin is not None:
                try:
                    valores.append(int(km_fin))
                except:
                    pass
            
            if valores:
                km_max = max(valores)
                if vehiculo_id not in km_por_vehiculo:
                    km_por_vehiculo[vehiculo_id] = km_max
                else:
                    km_por_vehiculo[vehiculo_id] = max(km_por_vehiculo[vehiculo_id], km_max)

        # 4. Agregar KM actual a cada vehículo
        for vehiculo in vehiculos:
            vehiculo_id = vehiculo.get('id')
            vehiculo['km_actual'] = km_por_vehiculo.get(vehiculo_id, 0)
        
        return jsonify({
            'status': 'success',
            'data': vehiculos
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en detalle_vehiculos: {e}')
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500


@reportes_bp.route('/detalle_conductores', methods=['GET'])
@auth_required
def get_detalle_conductores():
    """Obtiene listado detallado de conductores para modal de KPI"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        query = supabase.table('flota_conductores').select(
            'id, nombre, apellido, rut, licencia_numero, licencia_tipo, licencia_vencimiento, estado, email, telefono'
        ).is_('deleted_at', None).order('apellido', desc=False)

        res = query.execute()
        conductores = res.data or []
        
        # Agregar nombre completo
        for c in conductores:
            c['nombre_completo'] = f"{c.get('nombre', '')} {c.get('apellido', '')}".strip()
        
        return jsonify({
            'status': 'success',
            'data': conductores
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en detalle_conductores: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener detalle de conductores'}), 500


@reportes_bp.route('/detalle_ordenes', methods=['GET'])
@auth_required
def get_detalle_ordenes():
    """Obtiene listado detallado de órdenes activas para modal de KPI"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        query = supabase.table('flota_ordenes').select(
            '*, vehiculo:flota_vehiculos(placa, marca, modelo), conductor:flota_conductores(nombre, apellido)'
        ).not_.in_('estado', ['completada', 'cancelada']).order('fecha_inicio_programada', desc=False)

        res = query.execute()
        ordenes = res.data or []
        
        # Formatear datos
        for o in ordenes:
            if o.get('conductor'):
                o['conductor_nombre'] = f"{o['conductor'].get('nombre', '')} {o['conductor'].get('apellido', '')}".strip()
            if o.get('vehiculo'):
                o['vehiculo_info'] = f"{o['vehiculo'].get('placa', '')} - {o['vehiculo'].get('marca', '')} {o['vehiculo'].get('modelo', '')}".strip()
        
        return jsonify({
            'status': 'success',
            'data': ordenes
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en detalle_ordenes: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener detalle de órdenes'}), 500