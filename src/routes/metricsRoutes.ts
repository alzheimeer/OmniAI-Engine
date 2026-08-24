/**
 * metricsRoutes.ts
 * 
 * Router Express para el endpoint HTTP /metrics del sistema de observabilidad.
 * Expone métricas del sistema en formato JSON o Prometheus.
 * 
 * REQ-6.3.1: Crear endpoint HTTP /metrics con formato Prometheus opcional
 * REQ-6.3.3: Monitorear CPU/RAM en tiempo real
 * 
 * Endpoints:
 * - GET /metrics - Obtener métricas del sistema (JSON por defecto, Prometheus con ?format=prometheus)
 * - GET /metrics/summary - Obtener resumen de métricas (siempre JSON)
 * - GET /metrics/realtime - Obtener métricas de CPU/RAM en tiempo real con histórico
 * 
 * Formatos soportados:
 * - JSON (default): Objeto estructurado con métricas detalladas
 * - Prometheus: Formato texto compatible con Prometheus scraping
 */

import { Router, Request, Response } from 'express';
import os from 'os';
import { MetricsCollector, metricsCollector, MetricStats, OperationType } from '../infrastructure/MetricsCollector';
import { Logger } from '../infrastructure/Logger';

// ===== TIPOS =====

/**
 * Query params para GET /metrics
 */
interface MetricsQueryParams {
    /** Formato de salida: 'json' (default) o 'prometheus' */
    format?: 'json' | 'prometheus';
    /** Días de histórico para estadísticas (default: 7) */
    days?: string;
}

/**
 * Respuesta JSON de métricas
 */
interface MetricsJsonResponse {
    /** Timestamp de cuando se generaron las métricas */
    timestamp: string;
    /** Nombre de la aplicación */
    application: string;
    /** Versión de la aplicación */
    version: string;
    /** Información del sistema */
    system: SystemMetrics;
    /** Estadísticas de operaciones */
    operations: MetricStats;
    /** Información del servicio */
    service: ServiceInfo;
}

/**
 * Métricas del sistema operativo
 */
interface SystemMetrics {
    /** Uso de CPU (porcentaje 0-100) */
    cpuUsagePercent: number;
    /** Memoria total en bytes */
    totalMemoryBytes: number;
    /** Memoria libre en bytes */
    freeMemoryBytes: number;
    /** Memoria usada en bytes */
    usedMemoryBytes: number;
    /** Porcentaje de memoria usada */
    memoryUsagePercent: number;
    /** Número de CPUs disponibles */
    cpuCount: number;
    /** Uptime del sistema en segundos */
    uptimeSeconds: number;
    /** Plataforma (win32, linux, darwin) */
    platform: string;
    /** Carga promedio del sistema (últimos 1, 5, 15 minutos) */
    loadAverage: number[];
}

/**
 * Información del servicio
 */
interface ServiceInfo {
    /** Nombre del servicio */
    name: string;
    /** Estado del servicio */
    status: 'healthy' | 'degraded' | 'unhealthy';
    /** Uptime del proceso Node.js en segundos */
    processUptimeSeconds: number;
    /** Uso de memoria del proceso */
    processMemoryUsage: {
        heapUsedBytes: number;
        heapTotalBytes: number;
        externalBytes: number;
        rssBytes: number;
    };
}

/**
 * Respuesta estándar de la API
 */
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ===== TIPOS PARA MÉTRICAS EN TIEMPO REAL (REQ-6.3.3) =====

/**
 * Información de un núcleo de CPU
 */
interface CpuCoreInfo {
    /** Índice del núcleo (0-based) */
    core: number;
    /** Modelo del procesador */
    model: string;
    /** Velocidad en MHz */
    speedMhz: number;
    /** Porcentaje de uso del núcleo (0-100) */
    usagePercent: number;
    /** Tiempos de CPU por tipo */
    times: {
        user: number;
        nice: number;
        sys: number;
        idle: number;
        irq: number;
    };
}

/**
 * Muestra de métricas en un punto en el tiempo
 */
interface RealtimeSample {
    /** Timestamp de la muestra */
    timestamp: string;
    /** Porcentaje de uso de CPU total */
    cpuPercent: number;
    /** Porcentaje de uso de memoria */
    memoryPercent: number;
    /** Memoria usada en MB */
    memoryUsedMB: number;
    /** Memoria libre en MB */
    memoryFreeMB: number;
}

/**
 * Respuesta del endpoint /metrics/realtime
 */
interface RealtimeMetricsResponse {
    /** Timestamp actual */
    timestamp: string;
    /** Información de CPU */
    cpu: {
        /** Porcentaje de uso total de CPU (0-100) */
        totalUsagePercent: number;
        /** Número de núcleos */
        coreCount: number;
        /** Información detallada por núcleo */
        cores: CpuCoreInfo[];
        /** Carga promedio del sistema (1, 5, 15 min) */
        loadAverage: number[];
        /** Carga promedio normalizada por número de CPUs (0-100) */
        loadAverageNormalized: number[];
    };
    /** Información de memoria */
    memory: {
        /** Memoria total en bytes */
        totalBytes: number;
        /** Memoria total en MB */
        totalMB: number;
        /** Memoria usada en bytes */
        usedBytes: number;
        /** Memoria usada en MB */
        usedMB: number;
        /** Memoria libre en bytes */
        freeBytes: number;
        /** Memoria libre en MB */
        freeMB: number;
        /** Porcentaje de uso (0-100) */
        usagePercent: number;
    };
    /** Memoria del proceso Node.js */
    process: {
        /** Heap usado en bytes */
        heapUsedBytes: number;
        /** Heap usado en MB */
        heapUsedMB: number;
        /** Heap total en bytes */
        heapTotalBytes: number;
        /** Heap total en MB */
        heapTotalMB: number;
        /** RSS (Resident Set Size) en bytes */
        rssBytes: number;
        /** RSS en MB */
        rssMB: number;
        /** Memoria externa en bytes */
        externalBytes: number;
        /** Uptime del proceso en segundos */
        uptimeSeconds: number;
    };
    /** Histórico de muestras para gráficos (últimos N puntos) */
    history: RealtimeSample[];
    /** Metadata de la respuesta */
    meta: {
        /** Intervalo de muestreo en ms */
        sampleIntervalMs: number;
        /** Número máximo de muestras en histórico */
        maxHistorySamples: number;
        /** Plataforma del sistema */
        platform: string;
        /** Hostname */
        hostname: string;
    };
}

/**
 * Query params para GET /metrics/realtime
 */
interface RealtimeQueryParams {
    /** Incluir histórico de muestras (default: true) */
    includeHistory?: string;
    /** Incluir detalles por núcleo (default: true) */
    includeCores?: string;
}

// ===== CONSTANTES =====

/** Nombre de la aplicación para las métricas */
const APP_NAME = 'omniai_engine';

/** Versión de la aplicación */
const APP_VERSION = '2.0.0';

/** Prefijo para métricas Prometheus */
const PROMETHEUS_PREFIX = 'omniai';

/** Intervalo de muestreo para métricas en tiempo real (ms) */
const REALTIME_SAMPLE_INTERVAL_MS = 1000;

/** Número máximo de muestras en el histórico */
const MAX_HISTORY_SAMPLES = 60;

// ===== ESTADO PARA MÉTRICAS EN TIEMPO REAL =====

/** Buffer circular para histórico de muestras */
const realtimeHistory: RealtimeSample[] = [];

/** Última lectura de tiempos de CPU para cálculo de diferencias */
let lastCpuTimes: { idle: number; total: number }[] | null = null;

/** Timestamp de la última muestra */
let lastSampleTime: number = 0;

// ===== ROUTER =====

const router = Router();
const logger = new Logger('MetricsRoutes');

// ===== FUNCIONES PARA MÉTRICAS EN TIEMPO REAL =====

/**
 * Obtiene los tiempos de CPU de todos los núcleos.
 * Usado para calcular el uso real de CPU entre muestras.
 */
function getCpuTimes(): { idle: number; total: number }[] {
    const cpus = os.cpus();
    return cpus.map(cpu => {
        const times = cpu.times;
        const idle = times.idle;
        const total = times.user + times.nice + times.sys + times.idle + times.irq;
        return { idle, total };
    });
}

/**
 * Calcula el porcentaje de uso de CPU real basado en la diferencia
 * entre dos muestras de tiempos de CPU.
 * 
 * Este método es más preciso que usar load average porque mide
 * el uso real entre dos puntos en el tiempo.
 */
function calculateCpuUsageFromDiff(
    current: { idle: number; total: number }[],
    previous: { idle: number; total: number }[]
): { total: number; perCore: number[] } {
    const perCore: number[] = [];
    let totalIdleDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < current.length; i++) {
        const idleDiff = current[i].idle - previous[i].idle;
        const totalCoreDiff = current[i].total - previous[i].total;

        totalIdleDiff += idleDiff;
        totalDiff += totalCoreDiff;

        // Calcular uso por núcleo
        if (totalCoreDiff > 0) {
            const usage = ((totalCoreDiff - idleDiff) / totalCoreDiff) * 100;
            perCore.push(Math.round(usage * 100) / 100);
        } else {
            perCore.push(0);
        }
    }

    // Calcular uso total
    const totalUsage = totalDiff > 0 
        ? ((totalDiff - totalIdleDiff) / totalDiff) * 100 
        : 0;

    return {
        total: Math.round(totalUsage * 100) / 100,
        perCore
    };
}

/**
 * Obtiene información detallada de cada núcleo de CPU.
 */
function getCpuCoresInfo(perCoreUsage: number[]): CpuCoreInfo[] {
    const cpus = os.cpus();
    return cpus.map((cpu, index) => ({
        core: index,
        model: cpu.model,
        speedMhz: cpu.speed,
        usagePercent: perCoreUsage[index] ?? 0,
        times: {
            user: cpu.times.user,
            nice: cpu.times.nice,
            sys: cpu.times.sys,
            idle: cpu.times.idle,
            irq: cpu.times.irq
        }
    }));
}

/**
 * Agrega una muestra al histórico.
 * Mantiene un buffer circular de MAX_HISTORY_SAMPLES elementos.
 */
function addToHistory(sample: RealtimeSample): void {
    realtimeHistory.push(sample);
    while (realtimeHistory.length > MAX_HISTORY_SAMPLES) {
        realtimeHistory.shift();
    }
}

/**
 * Actualiza las métricas en tiempo real.
 * Esta función se llama en cada request para mantener el histórico actualizado.
 */
function updateRealtimeMetrics(): { cpuUsage: { total: number; perCore: number[] } } {
    const now = Date.now();
    const currentCpuTimes = getCpuTimes();

    // Si no hay lectura previa o pasó demasiado tiempo, usar load average como fallback
    let cpuUsage: { total: number; perCore: number[] };

    if (lastCpuTimes && (now - lastSampleTime) < 10000) {
        // Calcular uso real de CPU basado en diferencia de tiempos
        cpuUsage = calculateCpuUsageFromDiff(currentCpuTimes, lastCpuTimes);
    } else {
        // Fallback: usar load average normalizado
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        const normalizedLoad = Math.min(100, (loadAvg[0] / cpuCount) * 100);
        cpuUsage = {
            total: Math.round(normalizedLoad * 100) / 100,
            perCore: currentCpuTimes.map(() => Math.round(normalizedLoad * 100) / 100)
        };
    }

    // Calcular métricas de memoria
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = Math.round((usedMemory / totalMemory) * 10000) / 100;

    // Crear muestra para el histórico (solo si pasó suficiente tiempo)
    if (now - lastSampleTime >= REALTIME_SAMPLE_INTERVAL_MS) {
        const sample: RealtimeSample = {
            timestamp: new Date().toISOString(),
            cpuPercent: cpuUsage.total,
            memoryPercent,
            memoryUsedMB: Math.round(usedMemory / 1024 / 1024),
            memoryFreeMB: Math.round(freeMemory / 1024 / 1024)
        };
        addToHistory(sample);
        lastSampleTime = now;
    }

    // Guardar tiempos actuales para la próxima lectura
    lastCpuTimes = currentCpuTimes;

    return { cpuUsage };
}

/**
 * Calcula el porcentaje de uso de CPU.
 * Usa la carga promedio del sistema normalizada por el número de CPUs.
 */
function getCpuUsagePercent(): number {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    // Normalizar carga por número de CPUs (valor de 0-100)
    return Math.min(100, (loadAvg[0] / cpuCount) * 100);
}

/**
 * Obtiene métricas del sistema operativo.
 */
function getSystemMetrics(): SystemMetrics {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    return {
        cpuUsagePercent: Math.round(getCpuUsagePercent() * 100) / 100,
        totalMemoryBytes: totalMemory,
        freeMemoryBytes: freeMemory,
        usedMemoryBytes: usedMemory,
        memoryUsagePercent: Math.round((usedMemory / totalMemory) * 10000) / 100,
        cpuCount: os.cpus().length,
        uptimeSeconds: os.uptime(),
        platform: os.platform(),
        loadAverage: os.loadavg()
    };
}

/**
 * Obtiene información del servicio.
 */
function getServiceInfo(stats: MetricStats): ServiceInfo {
    const memUsage = process.memoryUsage();
    
    // Determinar estado de salud basado en tasa de éxito
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.totals.totalOperations > 0) {
        if (stats.totals.successRate < 0.5) {
            status = 'unhealthy';
        } else if (stats.totals.successRate < 0.8) {
            status = 'degraded';
        }
    }
    
    return {
        name: APP_NAME,
        status,
        processUptimeSeconds: process.uptime(),
        processMemoryUsage: {
            heapUsedBytes: memUsage.heapUsed,
            heapTotalBytes: memUsage.heapTotal,
            externalBytes: memUsage.external,
            rssBytes: memUsage.rss
        }
    };
}

/**
 * Convierte un nombre de métrica a formato Prometheus (snake_case).
 */
function toPrometheusName(name: string): string {
    return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Genera métricas en formato Prometheus.
 * 
 * Formato:
 * # HELP metric_name Descripción
 * # TYPE metric_name tipo
 * metric_name{labels} valor
 */
function generatePrometheusFormat(stats: MetricStats, system: SystemMetrics, service: ServiceInfo): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // === Métricas del sistema ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_cpu_usage_percent Porcentaje de uso de CPU del sistema');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_cpu_usage_percent gauge');
    lines.push(`${PROMETHEUS_PREFIX}_system_cpu_usage_percent ${system.cpuUsagePercent}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_memory_total_bytes Memoria total del sistema en bytes');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_memory_total_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_system_memory_total_bytes ${system.totalMemoryBytes}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_memory_free_bytes Memoria libre del sistema en bytes');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_memory_free_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_system_memory_free_bytes ${system.freeMemoryBytes}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_memory_used_bytes Memoria usada del sistema en bytes');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_memory_used_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_system_memory_used_bytes ${system.usedMemoryBytes}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_memory_usage_percent Porcentaje de uso de memoria');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_memory_usage_percent gauge');
    lines.push(`${PROMETHEUS_PREFIX}_system_memory_usage_percent ${system.memoryUsagePercent}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_system_uptime_seconds Uptime del sistema en segundos');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_system_uptime_seconds counter');
    lines.push(`${PROMETHEUS_PREFIX}_system_uptime_seconds ${system.uptimeSeconds}`);
    lines.push('');

    // === Métricas del proceso ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_process_uptime_seconds Uptime del proceso en segundos');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_process_uptime_seconds counter');
    lines.push(`${PROMETHEUS_PREFIX}_process_uptime_seconds ${service.processUptimeSeconds}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_process_heap_used_bytes Memoria heap usada por el proceso');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_process_heap_used_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_process_heap_used_bytes ${service.processMemoryUsage.heapUsedBytes}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_process_heap_total_bytes Memoria heap total del proceso');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_process_heap_total_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_process_heap_total_bytes ${service.processMemoryUsage.heapTotalBytes}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_process_rss_bytes Resident Set Size del proceso');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_process_rss_bytes gauge');
    lines.push(`${PROMETHEUS_PREFIX}_process_rss_bytes ${service.processMemoryUsage.rssBytes}`);
    lines.push('');

    // === Métricas de operaciones ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_total Total de operaciones procesadas');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_operations_total ${stats.totals.totalOperations}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_success_total Total de operaciones exitosas');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_success_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_operations_success_total ${stats.totals.successfulOperations}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_failure_total Total de operaciones fallidas');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_failure_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_operations_failure_total ${stats.totals.failedOperations}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_success_rate Tasa de éxito de operaciones (0-1)');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_success_rate gauge');
    lines.push(`${PROMETHEUS_PREFIX}_operations_success_rate ${stats.totals.successRate}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_duration_avg_ms Duración promedio de operaciones en ms');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_duration_avg_ms gauge');
    lines.push(`${PROMETHEUS_PREFIX}_operations_duration_avg_ms ${stats.totals.avgDurationMs}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operations_output_bytes_total Total de bytes generados');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operations_output_bytes_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_operations_output_bytes_total ${stats.totals.totalOutputSizeBytes}`);
    lines.push('');

    // === Métricas de caché ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_cache_hits_total Total de hits de caché');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_cache_hits_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_cache_hits_total ${stats.cache.totalHits}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_cache_misses_total Total de misses de caché');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_cache_misses_total counter');
    lines.push(`${PROMETHEUS_PREFIX}_cache_misses_total ${stats.cache.totalMisses}`);
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_cache_hit_rate Tasa de hits de caché (0-1)');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_cache_hit_rate gauge');
    lines.push(`${PROMETHEUS_PREFIX}_cache_hit_rate ${stats.cache.hitRate}`);
    lines.push('');

    // === Métricas por tipo de operación ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operation_count Total de operaciones por tipo');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operation_count counter');
    for (const [opType, opStats] of Object.entries(stats.byOperationType)) {
        if (opStats.count > 0) {
            lines.push(`${PROMETHEUS_PREFIX}_operation_count{operation="${opType}"} ${opStats.count}`);
        }
    }
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operation_success_count Operaciones exitosas por tipo');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operation_success_count counter');
    for (const [opType, opStats] of Object.entries(stats.byOperationType)) {
        if (opStats.count > 0) {
            lines.push(`${PROMETHEUS_PREFIX}_operation_success_count{operation="${opType}"} ${opStats.successCount}`);
        }
    }
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operation_failure_count Operaciones fallidas por tipo');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operation_failure_count counter');
    for (const [opType, opStats] of Object.entries(stats.byOperationType)) {
        if (opStats.count > 0) {
            lines.push(`${PROMETHEUS_PREFIX}_operation_failure_count{operation="${opType}"} ${opStats.failureCount}`);
        }
    }
    lines.push('');

    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_operation_duration_avg_ms Duración promedio por tipo de operación');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_operation_duration_avg_ms gauge');
    for (const [opType, opStats] of Object.entries(stats.byOperationType)) {
        if (opStats.count > 0) {
            lines.push(`${PROMETHEUS_PREFIX}_operation_duration_avg_ms{operation="${opType}"} ${opStats.avgDurationMs}`);
        }
    }
    lines.push('');

    // === Información del servicio ===
    lines.push('# HELP ' + PROMETHEUS_PREFIX + '_service_info Información del servicio');
    lines.push('# TYPE ' + PROMETHEUS_PREFIX + '_service_info gauge');
    const healthValue = service.status === 'healthy' ? 1 : (service.status === 'degraded' ? 0.5 : 0);
    lines.push(`${PROMETHEUS_PREFIX}_service_info{name="${service.name}",status="${service.status}",version="${APP_VERSION}"} ${healthValue}`);
    lines.push('');

    return lines.join('\n');
}

/**
 * GET /metrics
 * 
 * Obtiene métricas del sistema en formato JSON o Prometheus.
 * 
 * Query params:
 * - format: 'json' (default) o 'prometheus'
 * - days: número de días para estadísticas (default: 7)
 */
router.get('/', async (req: Request<object, object, object, MetricsQueryParams>, res: Response) => {
    try {
        // Validar parámetros
        const format = req.query.format || 'json';
        if (format !== 'json' && format !== 'prometheus') {
            res.status(400).json({
                success: false,
                error: 'Formato inválido. Valores permitidos: json, prometheus'
            } as ApiResponse<null>);
            return;
        }

        let days = 7;
        if (req.query.days) {
            days = parseInt(req.query.days, 10);
            if (isNaN(days) || days < 1 || days > 365) {
                res.status(400).json({
                    success: false,
                    error: 'Days debe ser un número entre 1 y 365'
                } as ApiResponse<null>);
                return;
            }
        }

        // Obtener estadísticas del MetricsCollector
        const stats = await metricsCollector.getStats(days);
        
        // Obtener métricas del sistema
        const systemMetrics = getSystemMetrics();
        
        // Obtener info del servicio
        const serviceInfo = getServiceInfo(stats);

        logger.debug('Métricas solicitadas', { format, days });

        // Responder según formato
        if (format === 'prometheus') {
            const prometheusOutput = generatePrometheusFormat(stats, systemMetrics, serviceInfo);
            res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            res.send(prometheusOutput);
        } else {
            const response: MetricsJsonResponse = {
                timestamp: new Date().toISOString(),
                application: APP_NAME,
                version: APP_VERSION,
                system: systemMetrics,
                operations: stats,
                service: serviceInfo
            };

            res.json({
                success: true,
                data: response
            } as ApiResponse<MetricsJsonResponse>);
        }

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo métricas', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /metrics/summary
 * 
 * Obtiene un resumen simplificado de métricas (siempre JSON).
 * Útil para health checks y dashboards ligeros.
 */
router.get('/summary', async (req: Request<object, object, object, { days?: string }>, res: Response) => {
    try {
        let days = 7;
        if (req.query.days) {
            days = parseInt(req.query.days, 10);
            if (isNaN(days) || days < 1 || days > 365) {
                res.status(400).json({
                    success: false,
                    error: 'Days debe ser un número entre 1 y 365'
                } as ApiResponse<null>);
                return;
            }
        }

        const stats = await metricsCollector.getStats(days);
        const systemMetrics = getSystemMetrics();
        const serviceInfo = getServiceInfo(stats);

        const summary = {
            timestamp: new Date().toISOString(),
            status: serviceInfo.status,
            uptime: {
                system: systemMetrics.uptimeSeconds,
                process: serviceInfo.processUptimeSeconds
            },
            resources: {
                cpuPercent: systemMetrics.cpuUsagePercent,
                memoryPercent: systemMetrics.memoryUsagePercent,
                heapUsedMB: Math.round(serviceInfo.processMemoryUsage.heapUsedBytes / 1024 / 1024)
            },
            operations: {
                total: stats.totals.totalOperations,
                successful: stats.totals.successfulOperations,
                failed: stats.totals.failedOperations,
                successRate: Math.round(stats.totals.successRate * 10000) / 100
            },
            cache: {
                hits: stats.cache.totalHits,
                misses: stats.cache.totalMisses,
                hitRate: Math.round(stats.cache.hitRate * 10000) / 100
            },
            period: {
                days,
                from: stats.period.from.toISOString(),
                to: stats.period.to.toISOString()
            }
        };

        logger.debug('Resumen de métricas solicitado', { days });

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo resumen de métricas', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /metrics/realtime
 * 
 * Obtiene métricas de CPU y RAM en tiempo real.
 * REQ-6.3.3: Monitorear CPU/RAM en tiempo real
 * 
 * Este endpoint proporciona:
 * - Uso actual de CPU (total y por núcleo)
 * - Uso actual de memoria (sistema y proceso)
 * - Histórico de las últimas 60 muestras para gráficos
 * 
 * Query params:
 * - includeHistory: 'true' (default) o 'false' - incluir histórico de muestras
 * - includeCores: 'true' (default) o 'false' - incluir detalles por núcleo de CPU
 * 
 * Para monitoreo en tiempo real, se recomienda hacer polling cada 1-2 segundos.
 */
router.get('/realtime', (req: Request<object, object, object, RealtimeQueryParams>, res: Response) => {
    try {
        // Parsear query params
        const includeHistory = req.query.includeHistory !== 'false';
        const includeCores = req.query.includeCores !== 'false';

        // Actualizar métricas y obtener uso de CPU
        const { cpuUsage } = updateRealtimeMetrics();

        // Obtener información de memoria
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        // Obtener información del proceso
        const processMemory = process.memoryUsage();

        // Obtener load average
        const loadAverage = os.loadavg();
        const cpuCount = os.cpus().length;
        const loadAverageNormalized = loadAverage.map(load => 
            Math.round(Math.min(100, (load / cpuCount) * 100) * 100) / 100
        );

        // Construir respuesta
        const response: RealtimeMetricsResponse = {
            timestamp: new Date().toISOString(),
            cpu: {
                totalUsagePercent: cpuUsage.total,
                coreCount: cpuCount,
                cores: includeCores ? getCpuCoresInfo(cpuUsage.perCore) : [],
                loadAverage,
                loadAverageNormalized
            },
            memory: {
                totalBytes: totalMemory,
                totalMB: Math.round(totalMemory / 1024 / 1024),
                usedBytes: usedMemory,
                usedMB: Math.round(usedMemory / 1024 / 1024),
                freeBytes: freeMemory,
                freeMB: Math.round(freeMemory / 1024 / 1024),
                usagePercent: Math.round((usedMemory / totalMemory) * 10000) / 100
            },
            process: {
                heapUsedBytes: processMemory.heapUsed,
                heapUsedMB: Math.round(processMemory.heapUsed / 1024 / 1024),
                heapTotalBytes: processMemory.heapTotal,
                heapTotalMB: Math.round(processMemory.heapTotal / 1024 / 1024),
                rssBytes: processMemory.rss,
                rssMB: Math.round(processMemory.rss / 1024 / 1024),
                externalBytes: processMemory.external,
                uptimeSeconds: Math.round(process.uptime())
            },
            history: includeHistory ? [...realtimeHistory] : [],
            meta: {
                sampleIntervalMs: REALTIME_SAMPLE_INTERVAL_MS,
                maxHistorySamples: MAX_HISTORY_SAMPLES,
                platform: os.platform(),
                hostname: os.hostname()
            }
        };

        logger.debug('Métricas en tiempo real solicitadas', {
            cpuPercent: cpuUsage.total,
            memoryPercent: response.memory.usagePercent,
            includeHistory,
            includeCores,
            historyLength: realtimeHistory.length
        });

        res.json({
            success: true,
            data: response
        } as ApiResponse<RealtimeMetricsResponse>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo métricas en tiempo real', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

export default router;
