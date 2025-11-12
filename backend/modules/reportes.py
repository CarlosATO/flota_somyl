# En: backend/modules/reportes.py

from flask import Blueprint, jsonify, current_app
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

        # Órdenes de viaje activas (pendientes o asignadas)
        ordenes_res = supabase.table('flota_ordenes').select('id', count='exact').in_('estado', ['PENDIENTE', 'ASIGNADA']).execute()
        ordenes_activas = ordenes_res.count if ordenes_res.count is not None else 0

        # Mantenimientos pendientes (no eliminados, programados, pendientes o en taller)
        mantenimientos_res = supabase.table('flota_mantenimientos').select('id', count='exact').is_('deleted_at', None).in_('estado', ['PENDIENTE', 'PROGRAMADO', 'EN_TALLER']).execute()
        mantenimientos_pendientes = mantenimientos_res.count if mantenimientos_res.count is not None else 0

        return jsonify({
            'status': 'success',
            'data': {
                'total_vehiculos': total_vehiculos,
                'total_conductores': total_conductores,
                'ordenes_activas': ordenes_activas,
                'mantenimientos_pendientes': mantenimientos_pendientes
            }
        }), 200

    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase en KPIs resumen: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Error al obtener KPIs de resumen'
        }), 500
    except Exception as e:
        current_app.logger.error(f"Error general en KPIs resumen: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Error al obtener KPIs de resumen'
        }), 500

@reportes_bp.route('/costo_mantenimiento_mensual', methods=['GET'])
@auth_required
def get_costo_mantenimiento_mensual():
    """Obtiene el costo total de mantenimiento de los últimos 30 días"""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración: Supabase no disponible'}), 500

        # Fecha límite: hace 30 días
        fecha_limite = datetime.now() - timedelta(days=30)
        fecha_limite_str = fecha_limite.isoformat()

        # Obtener mantenimientos finalizados en los últimos 30 días con costo
        mantenimientos_res = supabase.table('flota_mantenimientos').select('costo').is_('deleted_at', None).eq('estado', 'FINALIZADO').gte('fecha_realizacion', fecha_limite_str).not_.is_('costo', None).execute()

        # Calcular suma de costos
        costo_total = 0.0
        if mantenimientos_res.data:
            for mantenimiento in mantenimientos_res.data:
                if mantenimiento.get('costo') is not None:
                    try:
                        costo_total += float(mantenimiento['costo'])
                    except (ValueError, TypeError):
                        continue

        return jsonify({
            'status': 'success',
            'data': {
                'costo_total_clp': costo_total,
                'periodo_dias': 30
            }
        }), 200

    except PostgrestAPIError as e:
        current_app.logger.error(f"Error Supabase en costo mantenimiento mensual: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Error al obtener costo de mantenimiento mensual'
        }), 500
    except Exception as e:
        current_app.logger.error(f"Error general en costo mantenimiento mensual: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Error al obtener costo de mantenimiento mensual'
        }), 500