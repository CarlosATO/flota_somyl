// En: frontend/src/components/Reportes.jsx

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './Reportes.css';

const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    if (isNaN(parseFloat(value))) return '-';
    try {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
    } catch (e) { return String(value); }
};

const KPI_INITIAL_STATE = {
    total_vehiculos: null,
    total_conductores: null,
    ordenes_activas: null,
    mantenimientos_pendientes: null,
    costo_total_clp: null,
};

function Reportes({ token }) {
    const [kpis, setKpis] = useState(KPI_INITIAL_STATE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Verificar que tenemos token antes de hacer peticiones
            if (!token) {
                throw new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.');
            }

            // 1. Fetch de KPIs de Resumen
            const resKpis = await apiFetch('/api/reportes/kpis_resumen');
            if (resKpis.status === 401) {
                throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
            }
            if (resKpis.status !== 200) {
                throw new Error(resKpis.data?.message || 'Error al cargar KPIs de resumen');
            }

            // 2. Fetch de Costo de Mantenimiento
            const resCosto = await apiFetch('/api/reportes/costo_mantenimiento_mensual');
            if (resCosto.status === 401) {
                throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
            }
            if (resCosto.status !== 200) {
                throw new Error(resCosto.data?.message || 'Error al cargar costo de mantenimiento');
            }

            setKpis({
                ...resKpis.data.data,
                costo_total_clp: resCosto.data.data.costo_total_clp,
            });

        } catch (err) {
            console.error('Error en Reportes:', err);
            const errorMessage = err.message || 'Error desconocido al cargar los reportes';

            // Si es error de autenticación, limpiar token y mostrar mensaje específico
            if (errorMessage.includes('Sesión expirada') || errorMessage.includes('Token no provisto')) {
                localStorage.removeItem('token');
                setError('Tu sesión ha expirado. Por favor, recarga la página e inicia sesión nuevamente.');
            } else {
                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (token) {
            fetchData();
        } else {
            setError('No hay sesión activa. Por favor, inicia sesión.');
            setLoading(false);
        }
    }, [token, fetchData]);

    if (!token) return <div className="loading-state">Cargando...</div>;

    return (
        <div className="reportes-container">
            <div className="reportes-header">
                <h2>Dashboard y Reportes</h2>
            </div>

            {loading && <div className="loading-state">Cargando datos del dashboard...</div>}
            {error && <div className="error-state">⚠️ Error al cargar los reportes: {error}</div>}

            {!loading && !error && (
                <>
                    <div className="kpis-grid">
                        <div className="kpi-card vehiculos">
                            <div className="kpi-title">🚗 Total Vehículos</div>
                            <div className="kpi-value">{kpis.total_vehiculos || 0}</div>
                        </div>

                        <div className="kpi-card conductores">
                            <div className="kpi-title">👥 Total Conductores</div>
                            <div className="kpi-value">{kpis.total_conductores || 0}</div>
                        </div>

                        <div className="kpi-card ordenes">
                            <div className="kpi-title">📅 Órdenes de Viaje Activas</div>
                            <div className="kpi-value">{kpis.ordenes_activas || 0}</div>
                            <div className="kpi-meta">Pendientes o Asignadas</div>
                        </div>

                        <div className="kpi-card mantenimiento">
                            <div className="kpi-title">🛠️ Mantenimientos Pendientes</div>
                            <div className="kpi-value">{kpis.mantenimientos_pendientes || 0}</div>
                            <div className="kpi-meta">Programados, Pendientes o En Taller</div>
                        </div>
                    </div>

                    <div className="report-section">
                        <h3>Finanzas Operacionales</h3>
                        <div className="report-costo">
                            <div className="costo-label">Costo Total de Mantenimiento (Últimos 30 días)</div>
                            <div className="costo-value">{formatCurrency(kpis.costo_total_clp || 0)}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default Reportes;