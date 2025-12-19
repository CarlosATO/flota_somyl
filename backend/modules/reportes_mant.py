import sys
import os
from flask import Blueprint, jsonify, current_app, request

# --- AUTH IMPORT ---
auth_required = None
try:
    from ..utils.auth import auth_required
except (ImportError, ValueError):
    try:
        from backend.utils.auth import auth_required
    except ImportError:
        try:
            from utils.auth import auth_required
        except ImportError:
            pass

if not auth_required:
    def auth_required(f): return f

reportes_mant_bp = Blueprint('reportes_mant', __name__)

@reportes_mant_bp.route('/dashboard', methods=['GET'])
@auth_required
def get_dashboard_mantenimiento():
    print("\n🔍 DEBUG: Dashboard - Estrategia 'Detective' (Consultas Separadas)")
    
    try:
        supabase = current_app.config['SUPABASE']
        fecha_ini = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        # 1. TRAER VEHÍCULOS (Para tener patentes)
        res_veh = supabase.table('flota_vehiculos').select('id, placa, marca, modelo').execute()
        vehiculos_map = {v['id']: v for v in (res_veh.data or [])}
        
        # 2. TRAER MANTENIMIENTOS (Solo la cabecera)
        res_mant = supabase.table('flota_mantenimientos')\
            .select('*')\
            .is_('deleted_at', None)\
            .order('fecha_programada', desc=True)\
            .execute()
        mantenimientos = res_mant.data or []
        
        # Crear un mapa de IDs de mantenimiento para filtrar detalles
        mant_ids = [m['id'] for m in mantenimientos]
        
        # 3. TRAER DETALLES (Aparte, para asegurarnos que vengan TODOS)
        # Traemos también el concepto y categoría para que el reporte se vea bonito
        detalles_map = {}
        if mant_ids:
            # Traemos detalles crudos con su concepto
            res_det = supabase.table('mantenimiento_detalles')\
                .select('*, concepto:conceptos_gasto(nombre, categoria:categorias_mantencion(nombre))')\
                .in_('mantenimiento_id', mant_ids)\
                .execute()
            
            raw_detalles = res_det.data or []
            
            # Agrupar detalles por mantenimiento_id
            for d in raw_detalles:
                mid = d['mantenimiento_id']
                if mid not in detalles_map:
                    detalles_map[mid] = []
                detalles_map[mid].append(d)
                
        print(f"✅ Se recuperaron {len(mantenimientos)} órdenes y {sum(len(x) for x in detalles_map.values())} items de detalle.")

        # 4. UNIR TODO (Pegamento Python)
        activos = []
        total_gasto_periodo = 0
        por_categoria = {}
        por_vehiculo = {}
        items_historicos_count = 0
        estados_cerrados = ['FINALIZADO', 'CANCELADO', 'Finalizado', 'Cancelado']

        for m in mantenimientos:
            # A) Pegar Vehículo
            vid = m.get('vehiculo_id')
            m['vehiculo'] = vehiculos_map.get(vid, {'placa': 'S/P', 'marca': '-', 'modelo': '-'})

            # B) Pegar Detalles (Aquí es donde fallaba antes)
            mid = m['id']
            mis_detalles = detalles_map.get(mid, [])
            m['detalles'] = mis_detalles # ¡Ahora el frontend recibirá esto lleno!

            # C) Calcular Costo Real
            if mis_detalles:
                costo_real = sum(float(d.get('costo', 0) or 0) for d in mis_detalles)
            else:
                costo_real = float(m.get('costo', 0) or 0)
            
            m['costo'] = costo_real

            # D) Clasificar Activos (Tabla Operativa)
            if m.get('estado') not in estados_cerrados:
                activos.append(m)

            # E) Clasificar Históricos (Gráficas)
            f_prog = m.get('fecha_programada', '')
            if f_prog and fecha_ini and fecha_fin and (fecha_ini <= f_prog <= fecha_fin):
                total_gasto_periodo += costo_real
                items_historicos_count += 1
                
                placa = m['vehiculo'].get('placa', 'S/P')
                por_vehiculo[placa] = por_vehiculo.get(placa, 0) + costo_real
                
                if mis_detalles:
                    for d in mis_detalles:
                        cat = d.get('concepto', {}).get('categoria', {}).get('nombre', 'General')
                        val = float(d.get('costo', 0) or 0)
                        por_categoria[cat] = por_categoria.get(cat, 0) + val
                else:
                    por_categoria["General"] = por_categoria.get("General", 0) + costo_real

        # 5. RETORNAR
        total_pendiente = sum([m['costo'] for m in activos])
        
        categorias_list = [{'name': k, 'value': v} for k, v in por_categoria.items()]
        categorias_list.sort(key=lambda x: x['value'], reverse=True)
        
        vehiculos_list = [{'name': k, 'value': v} for k, v in por_vehiculo.items()]
        vehiculos_list.sort(key=lambda x: x['value'], reverse=True)

        return jsonify({
            'kpis': {
                'total_gasto_periodo': total_gasto_periodo, 
                'total_items_periodo': items_historicos_count,
                'total_pendiente': total_pendiente, 
                'cantidad_activos': len(activos)
            },
            'grafica_categorias': categorias_list,
            'grafica_vehiculos': vehiculos_list[:10],
            'ordenes_activas': activos
        })

    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'message': str(e)}), 500