/**
 * metricsRoutes.test.ts
 * 
 * Tests unitarios para el endpoint HTTP /metrics.
 * 
 * REQ-6.3.1: Crear endpoint HTTP /metrics con formato Prometheus opcional
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import metricsRoutes from './metricsRoutes';
import { MetricsCollector } from '../infrastructure/MetricsCollector';
import path from 'path';
import fs from 'fs';

// ===== CONFIGURACIÓN DE TESTS =====

describe('metricsRoutes', () => {
    let app: Express;
    let metricsCollector: MetricsCollector;
    const testDbPath = path.join(process.cwd(), 'test-output', 'metrics-routes-test', 'metrics.sqlite');

    beforeAll(async () => {
        // Crear directorio de test si no existe
        const testDir = path.dirname(testDbPath);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Crear aplicación Express de test
        app = express();
        app.use(express.json());
        app.use('/metrics', metricsRoutes);

        // Crear instancia de MetricsCollector para tests
        metricsCollector = new MetricsCollector({
            dbPath: testDbPath,
            autoInitialize: true,
            retentionDays: 7
        });

        // Registrar algunas métricas de prueba
        await metricsCollector.record({
            operationType: 'video_render',
            status: 'success',
            durationMs: 45000,
            outputSizeBytes: 50000000,
            cacheUsed: true,
            cacheHit: false
        });

        await metricsCollector.record({
            operationType: 'video_render',
            status: 'failure',
            durationMs: 12000,
            errorMessage: 'FFmpeg error'
        });

        await metricsCollector.record({
            operationType: 'thumbnail_transform',
            status: 'success',
            durationMs: 2000,
            outputSizeBytes: 150000,
            cacheUsed: true,
            cacheHit: true
        });
    });

    afterAll(async () => {
        // Cerrar conexión a BD
        await metricsCollector.close();

        // Limpiar archivos de test
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    // ===== TESTS GET /metrics (JSON) =====

    describe('GET /metrics (JSON format)', () => {
        it('debe retornar métricas en formato JSON por defecto', async () => {
            const response = await request(app)
                .get('/metrics')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.application).toBe('omniai_engine');
            expect(response.body.data.version).toBe('2.0.0');
            expect(response.body.data.timestamp).toBeDefined();
        });

        it('debe incluir métricas del sistema', async () => {
            const response = await request(app)
                .get('/metrics')
                .expect(200);

            const system = response.body.data.system;
            expect(system).toBeDefined();
            expect(typeof system.cpuUsagePercent).toBe('number');
            expect(typeof system.totalMemoryBytes).toBe('number');
            expect(typeof system.freeMemoryBytes).toBe('number');
            expect(typeof system.usedMemoryBytes).toBe('number');
            expect(typeof system.memoryUsagePercent).toBe('number');
            expect(typeof system.cpuCount).toBe('number');
            expect(typeof system.uptimeSeconds).toBe('number');
            expect(typeof system.platform).toBe('string');
            expect(Array.isArray(system.loadAverage)).toBe(true);
        });

        it('debe incluir métricas de operaciones', async () => {
            const response = await request(app)
                .get('/metrics')
                .expect(200);

            const operations = response.body.data.operations;
            expect(operations).toBeDefined();
            expect(operations.totals).toBeDefined();
            expect(typeof operations.totals.totalOperations).toBe('number');
            expect(typeof operations.totals.successfulOperations).toBe('number');
            expect(typeof operations.totals.failedOperations).toBe('number');
            expect(typeof operations.totals.successRate).toBe('number');
        });

        it('debe incluir métricas de caché', async () => {
            const response = await request(app)
                .get('/metrics')
                .expect(200);

            const cache = response.body.data.operations.cache;
            expect(cache).toBeDefined();
            expect(typeof cache.totalHits).toBe('number');
            expect(typeof cache.totalMisses).toBe('number');
            expect(typeof cache.hitRate).toBe('number');
        });

        it('debe incluir información del servicio', async () => {
            const response = await request(app)
                .get('/metrics')
                .expect(200);

            const service = response.body.data.service;
            expect(service).toBeDefined();
            expect(service.name).toBe('omniai_engine');
            expect(['healthy', 'degraded', 'unhealthy']).toContain(service.status);
            expect(typeof service.processUptimeSeconds).toBe('number');
            expect(service.processMemoryUsage).toBeDefined();
        });

        it('debe aceptar parámetro days para estadísticas', async () => {
            const response = await request(app)
                .get('/metrics?days=30')
                .expect(200);

            expect(response.body.success).toBe(true);
            // Verificar que se usó el período correcto
            const period = response.body.data.operations.period;
            expect(period.from).toBeDefined();
            expect(period.to).toBeDefined();
        });

        it('debe rechazar días inválidos', async () => {
            const response = await request(app)
                .get('/metrics?days=0')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Days debe ser un número');
        });

        it('debe rechazar días mayores a 365', async () => {
            const response = await request(app)
                .get('/metrics?days=500')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Days debe ser un número');
        });
    });

    // ===== TESTS GET /metrics (Prometheus) =====

    describe('GET /metrics?format=prometheus', () => {
        it('debe retornar métricas en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            // Verificar Content-Type
            expect(response.headers['content-type']).toContain('text/plain');
            
            // Verificar formato Prometheus
            const body = response.text;
            expect(body).toContain('# HELP');
            expect(body).toContain('# TYPE');
            expect(body).toContain('omniai_');
        });

        it('debe incluir métricas del sistema en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            expect(body).toContain('omniai_system_cpu_usage_percent');
            expect(body).toContain('omniai_system_memory_total_bytes');
            expect(body).toContain('omniai_system_memory_free_bytes');
            expect(body).toContain('omniai_system_memory_used_bytes');
            expect(body).toContain('omniai_system_uptime_seconds');
        });

        it('debe incluir métricas de operaciones en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            expect(body).toContain('omniai_operations_total');
            expect(body).toContain('omniai_operations_success_total');
            expect(body).toContain('omniai_operations_failure_total');
            expect(body).toContain('omniai_operations_success_rate');
            expect(body).toContain('omniai_operations_duration_avg_ms');
        });

        it('debe incluir métricas de caché en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            expect(body).toContain('omniai_cache_hits_total');
            expect(body).toContain('omniai_cache_misses_total');
            expect(body).toContain('omniai_cache_hit_rate');
        });

        it('debe incluir métricas del proceso en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            expect(body).toContain('omniai_process_uptime_seconds');
            expect(body).toContain('omniai_process_heap_used_bytes');
            expect(body).toContain('omniai_process_heap_total_bytes');
            expect(body).toContain('omniai_process_rss_bytes');
        });

        it('debe incluir información del servicio en formato Prometheus', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            expect(body).toContain('omniai_service_info');
            expect(body).toContain('version="2.0.0"');
        });

        it('debe usar tipos correctos de Prometheus (gauge, counter)', async () => {
            const response = await request(app)
                .get('/metrics?format=prometheus')
                .expect(200);

            const body = response.text;
            // Gauges (valores que pueden subir y bajar)
            expect(body).toContain('# TYPE omniai_system_cpu_usage_percent gauge');
            expect(body).toContain('# TYPE omniai_system_memory_usage_percent gauge');
            expect(body).toContain('# TYPE omniai_operations_success_rate gauge');
            
            // Counters (valores que solo aumentan)
            expect(body).toContain('# TYPE omniai_system_uptime_seconds counter');
            expect(body).toContain('# TYPE omniai_operations_total counter');
        });
    });

    // ===== TESTS GET /metrics/summary =====

    describe('GET /metrics/summary', () => {
        it('debe retornar resumen de métricas', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.timestamp).toBeDefined();
            expect(response.body.data.status).toBeDefined();
        });

        it('debe incluir información de uptime', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            const uptime = response.body.data.uptime;
            expect(uptime).toBeDefined();
            expect(typeof uptime.system).toBe('number');
            expect(typeof uptime.process).toBe('number');
        });

        it('debe incluir información de recursos', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            const resources = response.body.data.resources;
            expect(resources).toBeDefined();
            expect(typeof resources.cpuPercent).toBe('number');
            expect(typeof resources.memoryPercent).toBe('number');
            expect(typeof resources.heapUsedMB).toBe('number');
        });

        it('debe incluir estadísticas de operaciones', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            const operations = response.body.data.operations;
            expect(operations).toBeDefined();
            expect(typeof operations.total).toBe('number');
            expect(typeof operations.successful).toBe('number');
            expect(typeof operations.failed).toBe('number');
            expect(typeof operations.successRate).toBe('number');
        });

        it('debe incluir estadísticas de caché', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            const cache = response.body.data.cache;
            expect(cache).toBeDefined();
            expect(typeof cache.hits).toBe('number');
            expect(typeof cache.misses).toBe('number');
            expect(typeof cache.hitRate).toBe('number');
        });

        it('debe incluir información del período', async () => {
            const response = await request(app)
                .get('/metrics/summary')
                .expect(200);

            const period = response.body.data.period;
            expect(period).toBeDefined();
            expect(period.days).toBe(7);
            expect(period.from).toBeDefined();
            expect(period.to).toBeDefined();
        });

        it('debe aceptar parámetro days personalizado', async () => {
            const response = await request(app)
                .get('/metrics/summary?days=14')
                .expect(200);

            expect(response.body.data.period.days).toBe(14);
        });
    });

    // ===== TESTS DE VALIDACIÓN =====

    describe('Validación de parámetros', () => {
        it('debe rechazar formato inválido', async () => {
            const response = await request(app)
                .get('/metrics?format=xml')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Formato inválido');
        });

        it('debe aceptar format=json explícito', async () => {
            const response = await request(app)
                .get('/metrics?format=json')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.headers['content-type']).toContain('application/json');
        });

        it('debe rechazar days no numérico', async () => {
            const response = await request(app)
                .get('/metrics?days=abc')
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('debe rechazar days negativo', async () => {
            const response = await request(app)
                .get('/metrics?days=-5')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    // ===== TESTS GET /metrics/realtime (REQ-6.3.3) =====

    describe('GET /metrics/realtime', () => {
        it('debe retornar métricas en tiempo real', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.timestamp).toBeDefined();
        });

        it('debe incluir información de CPU', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const cpu = response.body.data.cpu;
            expect(cpu).toBeDefined();
            expect(typeof cpu.totalUsagePercent).toBe('number');
            expect(cpu.totalUsagePercent).toBeGreaterThanOrEqual(0);
            expect(cpu.totalUsagePercent).toBeLessThanOrEqual(100);
            expect(typeof cpu.coreCount).toBe('number');
            expect(cpu.coreCount).toBeGreaterThan(0);
            expect(Array.isArray(cpu.loadAverage)).toBe(true);
            expect(cpu.loadAverage.length).toBe(3);
            expect(Array.isArray(cpu.loadAverageNormalized)).toBe(true);
        });

        it('debe incluir detalles por núcleo de CPU por defecto', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const cores = response.body.data.cpu.cores;
            expect(Array.isArray(cores)).toBe(true);
            expect(cores.length).toBeGreaterThan(0);
            
            // Verificar estructura del primer núcleo
            const firstCore = cores[0];
            expect(typeof firstCore.core).toBe('number');
            expect(typeof firstCore.model).toBe('string');
            expect(typeof firstCore.speedMhz).toBe('number');
            expect(typeof firstCore.usagePercent).toBe('number');
            expect(firstCore.times).toBeDefined();
            expect(typeof firstCore.times.user).toBe('number');
            expect(typeof firstCore.times.idle).toBe('number');
        });

        it('debe excluir detalles por núcleo cuando includeCores=false', async () => {
            const response = await request(app)
                .get('/metrics/realtime?includeCores=false')
                .expect(200);

            const cores = response.body.data.cpu.cores;
            expect(Array.isArray(cores)).toBe(true);
            expect(cores.length).toBe(0);
        });

        it('debe incluir información de memoria del sistema', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const memory = response.body.data.memory;
            expect(memory).toBeDefined();
            expect(typeof memory.totalBytes).toBe('number');
            expect(typeof memory.totalMB).toBe('number');
            expect(typeof memory.usedBytes).toBe('number');
            expect(typeof memory.usedMB).toBe('number');
            expect(typeof memory.freeBytes).toBe('number');
            expect(typeof memory.freeMB).toBe('number');
            expect(typeof memory.usagePercent).toBe('number');
            expect(memory.usagePercent).toBeGreaterThanOrEqual(0);
            expect(memory.usagePercent).toBeLessThanOrEqual(100);
            // Verificar consistencia: used + free = total
            expect(memory.usedBytes + memory.freeBytes).toBe(memory.totalBytes);
        });

        it('debe incluir información de memoria del proceso Node.js', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const proc = response.body.data.process;
            expect(proc).toBeDefined();
            expect(typeof proc.heapUsedBytes).toBe('number');
            expect(typeof proc.heapUsedMB).toBe('number');
            expect(typeof proc.heapTotalBytes).toBe('number');
            expect(typeof proc.heapTotalMB).toBe('number');
            expect(typeof proc.rssBytes).toBe('number');
            expect(typeof proc.rssMB).toBe('number');
            expect(typeof proc.externalBytes).toBe('number');
            expect(typeof proc.uptimeSeconds).toBe('number');
            // Heap usado debe ser menor o igual al heap total
            expect(proc.heapUsedBytes).toBeLessThanOrEqual(proc.heapTotalBytes);
        });

        it('debe incluir histórico de muestras por defecto', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const history = response.body.data.history;
            expect(Array.isArray(history)).toBe(true);
            // El histórico puede estar vacío en la primera llamada
        });

        it('debe excluir histórico cuando includeHistory=false', async () => {
            const response = await request(app)
                .get('/metrics/realtime?includeHistory=false')
                .expect(200);

            const history = response.body.data.history;
            expect(Array.isArray(history)).toBe(true);
            expect(history.length).toBe(0);
        });

        it('debe incluir metadata de la respuesta', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const meta = response.body.data.meta;
            expect(meta).toBeDefined();
            expect(typeof meta.sampleIntervalMs).toBe('number');
            expect(meta.sampleIntervalMs).toBe(1000);
            expect(typeof meta.maxHistorySamples).toBe('number');
            expect(meta.maxHistorySamples).toBe(60);
            expect(typeof meta.platform).toBe('string');
            expect(typeof meta.hostname).toBe('string');
        });

        it('debe acumular muestras en el histórico con múltiples llamadas', async () => {
            // Primera llamada
            await request(app)
                .get('/metrics/realtime')
                .expect(200);

            // Esperar un poco para que se registre como nueva muestra
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Segunda llamada
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const history = response.body.data.history;
            expect(history.length).toBeGreaterThan(0);
            
            // Verificar estructura de las muestras
            const sample = history[0];
            expect(sample.timestamp).toBeDefined();
            expect(typeof sample.cpuPercent).toBe('number');
            expect(typeof sample.memoryPercent).toBe('number');
            expect(typeof sample.memoryUsedMB).toBe('number');
            expect(typeof sample.memoryFreeMB).toBe('number');
        });

        it('debe retornar valores de CPU válidos (0-100)', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const cpu = response.body.data.cpu;
            expect(cpu.totalUsagePercent).toBeGreaterThanOrEqual(0);
            expect(cpu.totalUsagePercent).toBeLessThanOrEqual(100);
            
            // Verificar cada load average normalizado
            for (const normalizedLoad of cpu.loadAverageNormalized) {
                expect(normalizedLoad).toBeGreaterThanOrEqual(0);
                expect(normalizedLoad).toBeLessThanOrEqual(100);
            }
        });

        it('debe retornar valores de memoria consistentes', async () => {
            const response = await request(app)
                .get('/metrics/realtime')
                .expect(200);

            const memory = response.body.data.memory;
            
            // Total debe ser mayor que usado
            expect(memory.totalBytes).toBeGreaterThan(memory.usedBytes);
            
            // MB debe ser aproximadamente bytes / 1024 / 1024
            const expectedTotalMB = Math.round(memory.totalBytes / 1024 / 1024);
            expect(memory.totalMB).toBe(expectedTotalMB);
            
            // Uso porcentual debe coincidir con el cálculo
            const expectedPercent = Math.round((memory.usedBytes / memory.totalBytes) * 10000) / 100;
            expect(memory.usagePercent).toBe(expectedPercent);
        });
    });
});
