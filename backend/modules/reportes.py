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
            'vehiculo_id, kilometraje_inicio, kilometraje_fin, estado'
        ).execute()

        ordenes = res_ordenes.data or []

        # 3. Calcular KM máximo por vehículo y KM total recorrido
        km_por_vehiculo = {}
        km_recorridos_por_vehiculo = {}
        for orden in ordenes:
            vehiculo_id = orden.get('vehiculo_id')
            if not vehiculo_id:
                continue
            
            km_inicio = orden.get('kilometraje_inicio')
            km_fin = orden.get('kilometraje_fin')
            
            # Encontrar el valor máximo
            valores = []
            if km_inicio is not None:
                try: valores.append(int(float(km_inicio)))
                except: pass
            if km_fin is not None:
                try: valores.append(int(float(km_fin)))
                except: pass
            
            if valores:
                km_max = max(valores)
                if vehiculo_id not in km_por_vehiculo:
                    km_por_vehiculo[vehiculo_id] = km_max
                else:
                    km_por_vehiculo[vehiculo_id] = max(km_por_vehiculo[vehiculo_id], km_max)
            
            # Sum deltas
            try:
                if orden.get('kilometraje_inicio') is not None and orden.get('kilometraje_fin') is not None:
                    ki_val = int(float(orden.get('kilometraje_inicio')))
                    kf_val = int(float(orden.get('kilometraje_fin')))
                    if kf_val > ki_val and orden.get('estado') and str(orden.get('estado')).lower() == 'completada':
                        delta = kf_val - ki_val
                        if delta >= 0 and delta < 100000:
                            km_recorridos_por_vehiculo[vehiculo_id] = km_recorridos_por_vehiculo.get(vehiculo_id, 0) + delta
            except Exception:
                pass

        # 4. Agregar KM actual y km_recorridos a cada vehículo
        for vehiculo in vehiculos:
            vehiculo_id = vehiculo.get('id')
            vehiculo['km_actual'] = km_por_vehiculo.get(vehiculo_id, 0)
            vehiculo['km_recorridos'] = km_recorridos_por_vehiculo.get(vehiculo_id, 0)
        
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
    """Obtiene detalle de mantenimientos pendientes con información del vehículo (para Modal KPI)."""
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        query = supabase.table('flota_mantenimientos').select(
            '*, vehiculo:flota_vehiculos(placa, marca, modelo)'
        ).in_('estado', ['PROGRAMADO', 'PENDIENTE', 'EN_TALLER']).is_('deleted_at', None).order('fecha_programada', desc=False)

        res = query.execute()
        mantenimientos = res.data or []

        resultado = []
        for m in mantenimientos:
            veh = m.get('vehiculo') or {}
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
    - Mantenimientos pendientes
    - Control de Gases
    - Lógica robusta de Kilometraje Actual (Ordenes vs Mantenciones)
    """
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración'}), 500

        # 1. Obtener vehículos
        vehiculos_res = supabase.table('flota_vehiculos').select(
            'id, placa, marca, modelo, ano, tipo, fecha_vencimiento_gases, tipo_combustible'
        ).is_('deleted_at', None).order('placa').execute()
        vehiculos = vehiculos_res.data or []
        vehiculo_ids = [v['id'] for v in vehiculos]

        # 2. Obtener combustible (para cálculo de rendimiento)
        combustible_res = supabase.table('flota_combustible').select(
            'vehiculo_id, kilometraje, litros_cargados, costo_total, fecha_carga'
        ).execute()
        cargas = combustible_res.data or []
        
        # 3. Obtener documentos
        documentos_res = supabase.table('flota_vehiculos_documentos').select(
            'vehiculo_id, tipo_documento, fecha_vencimiento'
        ).is_('deleted_at', None).execute()
        documentos = documentos_res.data or []

        # 4. Obtener Mantenimientos (PENDIENTES y FINALIZADOS para historial)
        # Traemos todo lo necesario para calcular costos pendientes y última mantención
        mantenimientos_res = supabase.table('flota_mantenimientos').select(
            'vehiculo_id, costo, descripcion, tipo_mantenimiento, estado, km_realizacion, km_programado, fecha_realizacion'
        ).is_('deleted_at', None).execute()
        todos_mantenimientos = mantenimientos_res.data or []

        # 5. Obtener Órdenes (Max KM y contar viajes completados)
        ordenes_res = supabase.table('flota_ordenes').select(
            'vehiculo_id, kilometraje_fin, estado'
        ).not_.is_('kilometraje_fin', 'null').execute()
        todas_ordenes = ordenes_res.data or []

        # --- PROCESAMIENTO EN MEMORIA (Optimización) ---

        # A. Calcular Max KM Ordenes por vehículo Y contar viajes completados
        max_km_ordenes = {}
        viajes_completados = {}  # Para contar órdenes COMPLETADAS
        
        for o in todas_ordenes:
            vid = o.get('vehiculo_id')
            km = int(float(o.get('kilometraje_fin') or 0))
            estado = o.get('estado', '').upper()
            
            # Max KM
            if vid not in max_km_ordenes: max_km_ordenes[vid] = 0
            if km > max_km_ordenes[vid]: max_km_ordenes[vid] = km
            
            # Contar viajes completados
            if estado == 'COMPLETADA':
                if vid not in viajes_completados: viajes_completados[vid] = 0
                viajes_completados[vid] += 1

        # B. Procesar Mantenimientos (Pendientes y Último Realizado)
        mants_por_vehiculo = {} # Para pendientes
        historial_mant_por_vehiculo = {} # Para última realizada
        max_km_mant = {} # Para KM actual

        for m in todos_mantenimientos:
            vid = m.get('vehiculo_id')
            estado = m.get('estado')
            
            # Agrupar pendientes/programados
            if estado in ['PROGRAMADO', 'PENDIENTE', 'EN_TALLER']:
                if vid not in mants_por_vehiculo: mants_por_vehiculo[vid] = []
                mants_por_vehiculo[vid].append(m)
            
            # Calcular KM máximo reportado en mantenimientos
            km_r = int(float(m.get('km_realizacion') or 0))
            km_p = int(float(m.get('km_programado') or 0))
            km_val = max(km_r, km_p)
            
            if vid not in max_km_mant: max_km_mant[vid] = 0
            if km_val > max_km_mant[vid]: max_km_mant[vid] = km_val

            # Buscar última mantención FINALIZADA
            if estado == 'FINALIZADO':
                if vid not in historial_mant_por_vehiculo:
                    historial_mant_por_vehiculo[vid] = {'fecha': '1900-01-01', 'km': 0}
                
                fecha_m = m.get('fecha_realizacion') or '1900-01-01'
                # Comparamos fechas strings ISO (funciona bien YYYY-MM-DD)
                if fecha_m > historial_mant_por_vehiculo[vid]['fecha']:
                    historial_mant_por_vehiculo[vid] = {
                        'fecha': fecha_m,
                        'km': km_val
                    }

        # 6. Construir resultado final
        hoy = datetime.now().date()
        resultado = []
        
        import re
        def _normalize_tipo(t):
            if not t: return ''
            s = str(t).strip().lower()
            s = re.sub(r"[\s_\-]+", '', s)
            s = re.sub(r"[^a-z0-9]+", '', s)
            return s

        for vehiculo in vehiculos:
            vehiculo_id = vehiculo['id']
            
            # -- Cálculo Kilometraje Actual Robusto --
            km_ord = max_km_ordenes.get(vehiculo_id, 0)
            km_man = max_km_mant.get(vehiculo_id, 0)
            km_actual_real = max(km_ord, km_man)

            # -- Datos Última Mantención --
            last_mant = historial_mant_por_vehiculo.get(vehiculo_id, None)
            fecha_ultima_mant = last_mant['fecha'] if last_mant and last_mant['fecha'] != '1900-01-01' else None
            km_ultima_mant = last_mant['km'] if last_mant else 0

            # -- Combustible (Rendimiento) --
            # Nota: El rendimiento se sigue calculando con los datos de cargas para mantener consistencia de "litros vs km recorridos entre cargas"
            cargas_vehiculo = [c for c in cargas if c.get('vehiculo_id') == vehiculo_id]
            if len(cargas_vehiculo) >= 2:
                cargas_ordenadas = sorted(cargas_vehiculo, key=lambda x: x.get('kilometraje', 0))
                km_min = cargas_ordenadas[0].get('kilometraje', 0) or 0
                km_max = cargas_ordenadas[-1].get('kilometraje', 0) or 0
                km_recorridos = (km_max - km_min) if (km_max and km_min) else 0
                
                total_litros = sum(float(c.get('litros_cargados') or 0) for c in cargas_vehiculo)
                total_costo = sum(float(c.get('costo_total') or 0) for c in cargas_vehiculo)
                
                if km_recorridos > 0:
                    promedio_l_km = round(total_litros / km_recorridos, 2)
                    costo_por_km = round(total_costo / km_recorridos, 0)
                else:
                    promedio_l_km, costo_por_km = 0, 0
            else:
                promedio_l_km, costo_por_km = 0, 0
            
            hace_30_dias = (datetime.now() - timedelta(days=30)).isoformat()
            cargas_mes = [c for c in cargas_vehiculo if c.get('fecha_carga', '') and c.get('fecha_carga') >= hace_30_dias]
            total_mes = sum(float(c.get('costo_total') or 0) for c in cargas_mes)

            # -- Mantenimientos Pendientes (Costos) --
            mis_mants_pendientes = mants_por_vehiculo.get(vehiculo_id, [])
            costo_mant_pendiente = sum(float(m.get('costo') or 0) for m in mis_mants_pendientes)
            descripciones = []
            for m in mis_mants_pendientes:
                tipo = m.get('tipo_mantenimiento') or 'MANT'
                desc = m.get('descripcion') or ''
                if desc: descripciones.append(f"{tipo}: {desc}")
            detalle_mant_pendiente = " | ".join(descripciones) if descripciones else "-"
            
            # -- Documentos (Lógica Dinámica) --
            docs_vehiculo = [d for d in documentos if d.get('vehiculo_id') == vehiculo_id]
            documentos_status = {} # Aquí guardaremos lo que encontremos, sea lo que sea
            
            for doc in docs_vehiculo:
                tipo = doc.get('tipo_documento') # Ej: "SEGURO_AUTOMOTRIZ", "SOAP", etc.
                if not tipo: continue
                
                fecha_venc = doc.get('fecha_vencimiento')
                if fecha_venc:
                    try:
                        # Calcular días restantes
                        fecha_venc_date = datetime.fromisoformat(fecha_venc.replace('Z', ''))
                        if hasattr(fecha_venc_date, 'date'): fecha_venc_date = fecha_venc_date.date()
                        dias_restantes = (fecha_venc_date - hoy).days
                        
                        doc_obj = {
                            'fecha_vencimiento': fecha_venc,
                            'dias_restantes': dias_restantes,
                            'estado': 'VIGENTE' if dias_restantes > 30 else 'POR_VENCER' if dias_restantes > 0 else 'VENCIDO'
                        }
                        # LA CLAVE ES ESTA: Usamos el nombre del tipo como clave directa
                        documentos_status[tipo] = doc_obj
                    except: continue

            # -- Gases --
            fecha_gases = vehiculo.get('fecha_vencimiento_gases')
            tipo_combustible = vehiculo.get('tipo_combustible')
            gases_obj = None
            if fecha_gases:
                try:
                    fg = datetime.strptime(fecha_gases, '%Y-%m-%d').date()
                    dias_gases = (fg - hoy).days
                    umbral = 30 if tipo_combustible == 'DIESEL' else 15
                    estado_gases = 'VENCIDO' if dias_gases < 0 else 'POR_VENCER' if dias_gases <= umbral else 'VIGENTE'
                    gases_obj = {'fecha_vencimiento': fecha_gases, 'dias_restantes': dias_gases, 'estado': estado_gases}
                except: gases_obj = None
            
            # -- Contar viajes/rutas completadas --
            total_viajes = viajes_completados.get(vehiculo_id, 0)
            
            # Al armar el resultado, inyectamos el diccionario completo
            resultado.append({
                'id': vehiculo_id,
                'patente': vehiculo.get('placa'),
                'marca': vehiculo.get('marca'),
                'modelo': vehiculo.get('modelo'),
                'ano': vehiculo.get('ano'),
                'tipo': vehiculo.get('tipo'),
                'promedio_l_km': promedio_l_km,
                'costo_por_km': costo_por_km,
                'total_gastado_mes': round(total_mes, 0),
                
                'ultimo_km': km_actual_real,
                'fecha_ultima_mant': fecha_ultima_mant,
                'km_ultima_mant': km_ultima_mant,
                'costo_mant_pendiente': costo_mant_pendiente,
                'detalle_mant_pendiente': detalle_mant_pendiente,
                'total_viajes': total_viajes,
                'tiene_rutas': total_viajes > 0,
                'gases': gases_obj,
                
                # CAMBIO CRÍTICO: Enviamos el paquete dinámico en lugar de campos sueltos
                'documentos': documentos_status 
            })
        
        return jsonify({'status': 'success', 'data': resultado}), 200
        
    except Exception as e:
        current_app.logger.error(f'Error en analisis_vehiculos: {e}')
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500


@reportes_bp.route('/gastos_pivot', methods=['GET'])
@auth_required
def get_gastos_pivot():
    """
    Genera reporte pivote: Filas=Vehículos, Columnas=Conceptos
    """
    try:
        supabase = current_app.config.get('SUPABASE')
        if not supabase:
            return jsonify({'status': 'error', 'message': 'Error de configuración: Supabase no disponible'}), 500
        
        # Filtros de fecha (Opcional, default últimos 30 días)
        fecha_ini = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        # 1. Obtener Conceptos (para las columnas)
        conceptos_res = supabase.table('conceptos_gasto').select('id, nombre, categoria:categorias_mantencion(nombre)').order('id').execute()
        conceptos = conceptos_res.data or []
        
        # 2. Obtener Gastos (Mantenimientos)
        query = supabase.table('flota_mantenimientos').select(
            'costo, concepto_id, vehiculo:flota_vehiculos(placa)'
        ).is_('deleted_at', None)
        
        if fecha_ini: query = query.gte('fecha_realizacion', fecha_ini)
        if fecha_fin: query = query.lte('fecha_realizacion', fecha_fin)
            
        gastos_res = query.execute()
        gastos = gastos_res.data or []

        # 3. Procesar Pivote
        reporte = {} # Clave: Placa, Valor: {concepto_nom: total, ...}
        
        # Inicializar estructura
        columnas = [c['nombre'] for c in conceptos]
        if 'Otros' not in columnas:
            columnas.append('Otros')

        for g in gastos:
            placa = g.get('vehiculo', {}).get('placa', 'Sin Placa')
            try:
                costo = float(g.get('costo') or 0)
            except (ValueError, TypeError):
                costo = 0
            cid = g.get('concepto_id')
            
            if placa not in reporte:
                reporte[placa] = {col: 0 for col in columnas}
                reporte[placa]['TOTAL'] = 0
            
            # Buscar nombre del concepto
            c_nombre = next((c['nombre'] for c in conceptos if c['id'] == cid), None)
            
            if c_nombre:
                if c_nombre not in reporte[placa]:
                    reporte[placa][c_nombre] = 0
                reporte[placa][c_nombre] += costo
            else:
                # Si es antiguo (no tiene concepto_id), lo mandamos a 'Otros' o 'Sin Clasificar'
                reporte[placa]['Otros'] = reporte[placa].get('Otros', 0) + costo
                
            reporte[placa]['TOTAL'] += costo

        # Convertir a lista para el JSON
        data_final = []
        for placa, valores in reporte.items():
            valores_out = {k: v for k, v in valores.items()}
            valores_out['patente'] = placa
            data_final.append(valores_out)

        return jsonify({
            'status': 'success',
            'columnas': columnas, # Para que el frontend sepa qué columnas pintar
            'data': data_final
        })

    except Exception as e:
        current_app.logger.error(f'Error pivot gastos: {e}')
        return jsonify({'status': 'error', 'message': str(e)}), 500
