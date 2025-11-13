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

        # Mantenimientos pendientes (no completados ni cancelados) - estados en mayúsculas
        mantenimientos_res = supabase.table('flota_mantenimientos').select('id', count='exact').in_('estado', ['PROGRAMADO', 'PENDIENTE', 'EN_TALLER']).is_('deleted_at', None).execute()
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


@reportes_bp.route('/detalle_mantenimientos', methods=['GET'])
@auth_required
def get_detalle_mantenimientos():
    """Obtiene detalle de mantenimientos pendientes con información del vehículo."""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # Filtrar mantenimientos pendientes/programados/en taller
        # Usamos select('*') para evitar errores si cambian nombres de columnas
        query = supabase.table('flota_mantenimientos').select(
            '*, vehiculo:flota_vehiculos(placa, marca, modelo)'
        ).in_('estado', ['PROGRAMADO', 'PENDIENTE', 'EN_TALLER']).is_('deleted_at', None).order('fecha_programada', desc=False)

        try:
            res = query.execute()
        except Exception as e:
            current_app.logger.error(f'Error ejecutando consulta detalle_mantenimientos: {e}')
            # devolver detalle del error para ayudar en debugging
            return jsonify({'status': 'error', 'message': 'Error en consulta de mantenimientos', 'detail': str(e)}), 500

        mantenimientos = res.data or []

        current_app.logger.debug(f'detalle_mantenimientos: rows={len(mantenimientos)} sample={mantenimientos[:3]}')

        resultado = []
        for m in mantenimientos:
            veh = m.get('vehiculo') or {}
            # soporte para campo tipo_mantenimiento (existente) o tipo (antiguo)
            tipo_val = m.get('tipo_mantenimiento') if m.get('tipo_mantenimiento') is not None else m.get('tipo')
            resultado.append({
                'id': m.get('id'),
                'vehiculo_placa': veh.get('placa'),
                'vehiculo_modelo': f"{veh.get('marca','')} {veh.get('modelo','')}".strip(),
                'tipo': tipo_val,
                'descripcion': m.get('descripcion'),
                'fecha_programada': m.get('fecha_programada'),
                'costo': m.get('costo')
            })

        return jsonify({
            'status': 'success',
            'data': resultado
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error en detalle_mantenimientos: {e}')
        return jsonify({'status': 'error', 'message': 'Error al obtener detalle de mantenimientos'}), 500


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


@reportes_bp.route('/analisis_vehiculos', methods=['GET'])
@auth_required
def get_analisis_vehiculos():
    """
    Obtiene análisis completo de vehículos con:
    - Métricas de consumo de combustible
    - Estado de documentos obligatorios
    - Alertas de vencimiento
    """
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # 1. Obtener todos los vehículos activos
        # PostgREST/select does not accept SQL-style aliases ("as patente").
        # Seleccionamos la columna original `placa` y la mapeamos a `patente` en Python.
        # Nota: la tabla flota_vehiculos no tiene columna 'estado', solo 'deleted_at' para soft-delete.
        vehiculos_res = supabase.table('flota_vehiculos').select(
            'id, placa, marca, modelo, ano, tipo'
        ).is_('deleted_at', None).order('placa').execute()
        
        vehiculos = vehiculos_res.data or []
        
        # 2. Obtener todas las cargas de combustible
        combustible_res = supabase.table('flota_combustible').select(
            'vehiculo_id, kilometraje, litros_cargados, costo_total, fecha_carga'
        ).execute()
        
        cargas = combustible_res.data or []
        
        # 3. Obtener documentos de vehículos
        documentos_res = supabase.table('flota_vehiculos_documentos').select(
            'vehiculo_id, tipo_documento, fecha_vencimiento'
        ).is_('deleted_at', None).execute()
        
        documentos = documentos_res.data or []
        
        # 4. Procesar datos por vehículo
        hoy = datetime.now().date()
        resultado = []
        
        for vehiculo in vehiculos:
            vehiculo_id = vehiculo['id']
            
            # Filtrar cargas de este vehículo
            cargas_vehiculo = [c for c in cargas if c.get('vehiculo_id') == vehiculo_id]
            
            # Calcular métricas de combustible
            if len(cargas_vehiculo) >= 2:
                # Ordenar por kilometraje
                cargas_ordenadas = sorted(cargas_vehiculo, key=lambda x: x.get('kilometraje', 0))
                
                km_min = cargas_ordenadas[0].get('kilometraje', 0) or 0
                km_max = cargas_ordenadas[-1].get('kilometraje', 0) or 0
                km_recorridos = (km_max - km_min) if (km_max and km_min) else 0
                
                total_litros = sum(float(c.get('litros_cargados') or 0) for c in cargas_vehiculo)
                total_costo = sum(float(c.get('costo_total') or 0) for c in cargas_vehiculo)
                
                # Calcular promedios
                if km_recorridos > 0:
                    promedio_l_km = round(total_litros / km_recorridos, 2)
                    costo_por_km = round(total_costo / km_recorridos, 0)
                else:
                    promedio_l_km = 0
                    costo_por_km = 0
                
                ultimo_km = km_max
            else:
                promedio_l_km = 0
                costo_por_km = 0
                total_costo = 0
                ultimo_km = 0
            
            # Calcular total gastado último mes
            hace_30_dias = (datetime.now() - timedelta(days=30)).isoformat()
            cargas_mes = [c for c in cargas_vehiculo 
                         if c.get('fecha_carga', '') and c.get('fecha_carga') >= hace_30_dias]
            total_mes = sum(float(c.get('costo_total') or 0) for c in cargas_mes)
            
            # Procesar documentos
            docs_vehiculo = [d for d in documentos if d.get('vehiculo_id') == vehiculo_id]
            
            # Tipos de documentos obligatorios
            tipos_docs = {
                'Permiso de Circulación': None,
                'Revisión Técnica': None,
                'SOAP': None,
                'Seguro Obligatorio': None
            }
            
            for doc in docs_vehiculo:
                tipo = doc.get('tipo_documento')
                fecha_venc = doc.get('fecha_vencimiento')
                
                if tipo in tipos_docs and fecha_venc:
                    try:
                        fecha_venc_date = datetime.fromisoformat(fecha_venc.replace('Z', ''))
                        # si la fecha incluye hora, obtener date()
                        if hasattr(fecha_venc_date, 'date'):
                            fecha_venc_date = fecha_venc_date.date()
                        dias_restantes = (fecha_venc_date - hoy).days
                        tipos_docs[tipo] = {
                            'fecha_vencimiento': fecha_venc,
                            'dias_restantes': dias_restantes,
                            'estado': 'VIGENTE' if dias_restantes > 30 else 
                                     'POR_VENCER' if dias_restantes > 0 else 'VENCIDO'
                        }
                    except Exception:
                        # ignorar doc con formato incorrecto
                        continue
            
            # Agregar resultado
            resultado.append({
                'id': vehiculo_id,
                # `placa` es la columna real en la tabla; exponerla como `patente` en la respuesta
                'patente': vehiculo.get('placa'),
                'marca': vehiculo.get('marca'),
                'modelo': vehiculo.get('modelo'),
                'ano': vehiculo.get('ano'),
                'tipo': vehiculo.get('tipo'),
                'promedio_l_km': promedio_l_km,
                'costo_por_km': costo_por_km,
                'total_gastado_mes': round(total_mes, 0),
                'ultimo_km': ultimo_km,
                'permiso_circulacion': tipos_docs.get('Permiso de Circulación'),
                'revision_tecnica': tipos_docs.get('Revisión Técnica'),
                'soap': tipos_docs.get('SOAP'),
                'seguro_obligatorio': tipos_docs.get('Seguro Obligatorio')
            })
        
        return jsonify({
            'status': 'success',
            'data': resultado
        }), 200
        
    except Exception as e:
        current_app.logger.error(f'Error en analisis_vehiculos: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500