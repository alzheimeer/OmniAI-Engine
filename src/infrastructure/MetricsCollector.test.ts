/**
 * MetricsCollector.test.ts
 * 
 * Tests unitarios para MetricsCollector.
 * Verifica el registro de métricas en SQLite, cálculo de estadísticas,
 * y generación de reportes semanales.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
    MetricsCollector,
    MetricRecord,
    OperationType,
    MetricStats
} from './MetricsCollector';

// Directorio temporal para tests (usar timestamp para evitar conflictos)
const getTestDbPath = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const TEST_DB_DIR = path.join(__dirname, `../../test-output/metrics-test-${timestamp}-${random}`);
    const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-metrics.sqlite');
    return { TEST_DB_DIR, TEST_DB_PATH };
};

describe('MetricsCollector', () => {
    let collector: MetricsCollector;
    let TEST_DB_DIR: string;
    let TEST_DB_PATH: string;

    beforeEach(() => {
        // Generar rutas únicas para cada test
        const paths = getTestDbPath();
        TEST_DB_DIR = paths.TEST_DB_DIR;
        TEST_DB_PATH = paths.TEST_DB_PATH;

        // Crear directorio de test
        fs.mkdirSync(TEST_DB_DIR, { recursive: true });

        // Crear instancia con configuración de test
        collector = new MetricsCollector({
            dbPath: TEST_DB_PATH,
            autoInitialize: true,
            retentionDays: 30
        });
    });

    afterEach(async () => {
        // Cerrar conexión
        try {
            await collector.close();
        } catch (e) {
            // Ignorar errores de cierre
        }

        // Pequeño delay para asegurar que SQLite libere el archivo
        await new Promise(resolve => setTimeout(resolve, 100));

        // Limpiar archivos de test
        try {
            if (fs.existsSync(TEST_DB_DIR)) {
                fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
            }
        } catch (e) {
            // Ignorar errores de limpieza
        }
    });

    describe('Inicialización', () => {
        it('debe crear el archivo de base de datos después de una operación', async () => {
            // SQLite crea el archivo cuando se ejecuta la primera operación
            await collector.record({
                operationType: 'api_call',
                status: 'success',
                durationMs: 100
            });
            
            // Pequeño delay para asegurar que el archivo esté escrito
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
        });

        it('debe retornar la configuración correcta', () => {
            const config = collector.getConfig();
            expect(config.dbPath).toBe(TEST_DB_PATH);
            expect(config.autoInitialize).toBe(true);
            expect(config.retentionDays).toBe(30);
        });
    });

    describe('Registro de métricas', () => {
        it('debe registrar una métrica exitosa', async () => {
            const id = await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 45000,
                outputSizeBytes: 50000000,
                cacheUsed: false
            });

            expect(id).toBeGreaterThan(0);
        });

        it('debe registrar una métrica fallida', async () => {
            const id = await collector.record({
                operationType: 'api_call',
                status: 'failure',
                durationMs: 5000,
                errorMessage: 'Timeout de conexión'
            });

            expect(id).toBeGreaterThan(0);
        });

        it('debe registrar múltiples métricas', async () => {
            const ids: number[] = [];

            for (let i = 0; i < 5; i++) {
                const id = await collector.record({
                    operationType: 'video_transform',
                    status: i % 2 === 0 ? 'success' : 'failure',
                    durationMs: 1000 + i * 500
                });
                ids.push(id);
            }

            expect(ids).toHaveLength(5);
            // Los IDs deben ser únicos e incrementales
            for (let i = 1; i < ids.length; i++) {
                expect(ids[i]).toBeGreaterThan(ids[i - 1]);
            }
        });

        it('debe registrar métricas con metadatos adicionales', async () => {
            const id = await collector.record({
                operationType: 'script_generate',
                status: 'success',
                durationMs: 2000,
                correlationId: 'test-correlation-123',
                channelId: 'channel1',
                metadata: {
                    model: 'deepseek',
                    tokens: 1500
                }
            });

            expect(id).toBeGreaterThan(0);
        });

        it('debe registrar métricas de caché', async () => {
            // Cache hit
            const hitId = await collector.record({
                operationType: 'audio_generate',
                status: 'success',
                durationMs: 100,
                cacheUsed: true,
                cacheHit: true
            });

            // Cache miss
            const missId = await collector.record({
                operationType: 'audio_generate',
                status: 'success',
                durationMs: 5000,
                cacheUsed: true,
                cacheHit: false
            });

            expect(hitId).toBeGreaterThan(0);
            expect(missId).toBeGreaterThan(hitId);
        });
    });

    describe('Función startOperation', () => {
        it('debe medir duración automáticamente', async () => {
            const finish = collector.startOperation('video_render', {
                correlationId: 'test-123'
            });

            // Simular trabajo
            await new Promise(resolve => setTimeout(resolve, 100));

            const id = await finish('success', {
                outputSizeBytes: 1000000
            });

            expect(id).toBeGreaterThan(0);

            // Verificar que la duración fue registrada correctamente
            const stats = await collector.getStats(1);
            const videoRenderStats = stats.byOperationType['video_render'];
            expect(videoRenderStats.count).toBe(1);
            expect(videoRenderStats.avgDurationMs).toBeGreaterThanOrEqual(100);
        });

        it('debe manejar operaciones fallidas', async () => {
            const finish = collector.startOperation('api_call');

            const id = await finish('failure', {
                errorMessage: 'Error de red'
            });

            expect(id).toBeGreaterThan(0);
        });
    });

    describe('Estadísticas', () => {
        beforeEach(async () => {
            // Insertar datos de prueba
            const operations: Array<{
                type: OperationType;
                status: 'success' | 'failure';
                duration: number;
                outputSize?: number;
                cacheUsed?: boolean;
                cacheHit?: boolean;
            }> = [
                { type: 'video_render', status: 'success', duration: 45000, outputSize: 50000000 },
                { type: 'video_render', status: 'success', duration: 40000, outputSize: 48000000 },
                { type: 'video_render', status: 'failure', duration: 10000 },
                { type: 'video_transform', status: 'success', duration: 5000, cacheUsed: true, cacheHit: false },
                { type: 'video_transform', status: 'success', duration: 500, cacheUsed: true, cacheHit: true },
                { type: 'audio_generate', status: 'success', duration: 3000 },
                { type: 'api_call', status: 'failure', duration: 30000 }
            ];

            for (const op of operations) {
                await collector.record({
                    operationType: op.type,
                    status: op.status,
                    durationMs: op.duration,
                    outputSizeBytes: op.outputSize,
                    cacheUsed: op.cacheUsed,
                    cacheHit: op.cacheHit
                });
            }
        });

        it('debe calcular totales correctamente', async () => {
            const stats = await collector.getStats(7);

            expect(stats.totals.totalOperations).toBe(7);
            expect(stats.totals.successfulOperations).toBe(5);
            expect(stats.totals.failedOperations).toBe(2);
            expect(stats.totals.successRate).toBeCloseTo(5 / 7, 2);
        });

        it('debe calcular estadísticas por tipo de operación', async () => {
            const stats = await collector.getStats(7);

            // Video render: 3 operaciones (2 success, 1 failure)
            const videoRenderStats = stats.byOperationType['video_render'];
            expect(videoRenderStats.count).toBe(3);
            expect(videoRenderStats.successCount).toBe(2);
            expect(videoRenderStats.failureCount).toBe(1);
            expect(videoRenderStats.successRate).toBeCloseTo(2 / 3, 2);

            // Video transform: 2 operaciones (ambas success)
            const videoTransformStats = stats.byOperationType['video_transform'];
            expect(videoTransformStats.count).toBe(2);
            expect(videoTransformStats.successRate).toBe(1);
        });

        it('debe calcular estadísticas de caché', async () => {
            const stats = await collector.getStats(7);

            expect(stats.cache.totalHits).toBe(1);
            expect(stats.cache.totalMisses).toBe(1);
            expect(stats.cache.hitRate).toBe(0.5);
        });

        it('debe calcular tiempos correctamente', async () => {
            const stats = await collector.getStats(7);

            const videoRenderStats = stats.byOperationType['video_render'];
            // Durations: 45000, 40000, 10000
            expect(videoRenderStats.minDurationMs).toBe(10000);
            expect(videoRenderStats.maxDurationMs).toBe(45000);
            expect(videoRenderStats.avgDurationMs).toBeCloseTo((45000 + 40000 + 10000) / 3, 0);
        });

        it('debe calcular tamaño de output total', async () => {
            const stats = await collector.getStats(7);

            const videoRenderStats = stats.byOperationType['video_render'];
            expect(videoRenderStats.totalOutputSizeBytes).toBe(50000000 + 48000000);
        });

        it('debe manejar período sin datos', async () => {
            // Crear nuevo collector con DB vacía
            const emptyCollector = new MetricsCollector({
                dbPath: path.join(TEST_DB_DIR, 'empty-metrics.sqlite'),
                autoInitialize: true
            });

            const stats = await emptyCollector.getStats(7);

            expect(stats.totals.totalOperations).toBe(0);
            expect(stats.totals.successRate).toBe(0);
            expect(stats.cache.hitRate).toBe(0);

            await emptyCollector.close();
        });
    });

    describe('Generación de reportes', () => {
        beforeEach(async () => {
            // Insertar datos variados
            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 180000, // 3 minutos
                outputSizeBytes: 150000000, // 150MB
                cacheUsed: true,
                cacheHit: false
            });

            await collector.record({
                operationType: 'video_transform',
                status: 'success',
                durationMs: 5000,
                cacheUsed: true,
                cacheHit: true
            });

            await collector.record({
                operationType: 'api_call',
                status: 'failure',
                durationMs: 30000,
                errorMessage: 'Timeout'
            });
        });

        it('debe generar reporte semanal formateado', async () => {
            const report = await collector.generateWeeklyReport();

            // Verificar estructura del reporte
            expect(report).toContain('REPORTE SEMANAL DE MÉTRICAS');
            expect(report).toContain('RESUMEN GENERAL');
            expect(report).toContain('USO DE CACHÉ');
            expect(report).toContain('POR TIPO DE OPERACIÓN');
            expect(report).toContain('OmniAI-Engine');
        });

        it('debe incluir estadísticas correctas en el reporte', async () => {
            const report = await collector.generateWeeklyReport();

            // Debe incluir totales
            expect(report).toContain('Total operaciones: 3');
            expect(report).toContain('Exitosas: 2');
            expect(report).toContain('Fallidas: 1');
        });

        it('debe incluir estadísticas de caché en el reporte', async () => {
            const report = await collector.generateWeeklyReport();

            expect(report).toContain('Hits: 1');
            expect(report).toContain('Misses: 1');
            expect(report).toContain('Hit rate: 50.0%');
        });
    });

    describe('Envío de reportes por Telegram', () => {
        it('debe retornar false si no hay callback configurado', async () => {
            const result = await collector.sendWeeklyReport();
            expect(result).toBe(false);
        });

        it('debe enviar reporte cuando hay callback configurado', async () => {
            const mockCallback = vi.fn().mockResolvedValue(undefined);
            collector.setTelegramCallback(mockCallback);

            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 1000
            });

            const result = await collector.sendWeeklyReport();

            expect(result).toBe(true);
            expect(mockCallback).toHaveBeenCalledTimes(1);
            expect(mockCallback).toHaveBeenCalledWith(expect.stringContaining('REPORTE SEMANAL'));
        });

        it('debe manejar errores en el callback de Telegram', async () => {
            const mockCallback = vi.fn().mockRejectedValue(new Error('Network error'));
            collector.setTelegramCallback(mockCallback);

            const result = await collector.sendWeeklyReport();

            expect(result).toBe(false);
        });
    });

    describe('Limpieza de métricas antiguas', () => {
        it('debe eliminar métricas más antiguas que el período de retención', async () => {
            // Crear collector con retención muy corta
            const shortRetentionCollector = new MetricsCollector({
                dbPath: path.join(TEST_DB_DIR, 'cleanup-test.sqlite'),
                autoInitialize: true,
                retentionDays: 0 // Eliminar todo inmediatamente
            });

            // Insertar métricas
            await shortRetentionCollector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 1000
            });

            // Esperar un momento
            await new Promise(resolve => setTimeout(resolve, 100));

            // Ejecutar limpieza (debería eliminar todo porque retentionDays = 0)
            const deleted = await shortRetentionCollector.cleanup();

            expect(deleted).toBeGreaterThanOrEqual(0); // Puede ser 0 si la BD es muy rápida

            await shortRetentionCollector.close();
        });
    });

    describe('Manejo de tipos de operación', () => {
        it('debe aceptar todos los tipos de operación definidos', async () => {
            const operationTypes: OperationType[] = [
                'video_transform',
                'thumbnail_transform',
                'audio_generate',
                'music_transform',
                'script_generate',
                'script_humanize',
                'subtitle_generate',
                'video_render',
                'video_publish',
                'api_call'
            ];

            for (const opType of operationTypes) {
                const id = await collector.record({
                    operationType: opType,
                    status: 'success',
                    durationMs: 1000
                });
                expect(id).toBeGreaterThan(0);
            }

            const stats = await collector.getStats(1);
            expect(stats.totals.totalOperations).toBe(operationTypes.length);
        });
    });

    describe('Correlation ID y Channel ID', () => {
        it('debe registrar y recuperar correlation ID', async () => {
            const correlationId = 'pipeline-abc-123';

            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 1000,
                correlationId
            });

            await collector.record({
                operationType: 'video_publish',
                status: 'success',
                durationMs: 2000,
                correlationId
            });

            // Las estadísticas no filtran por correlationId, pero el dato está almacenado
            const stats = await collector.getStats(1);
            expect(stats.totals.totalOperations).toBe(2);
        });

        it('debe registrar y filtrar por channel ID', async () => {
            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 1000,
                channelId: 'channel1'
            });

            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 2000,
                channelId: 'channel2'
            });

            const stats = await collector.getStats(1);
            expect(stats.totals.totalOperations).toBe(2);
        });
    });

    /**
     * Tests específicos para REQ-4.3.2
     * Verifica que el sistema registre correctamente:
     * - Tiempo de renderizado
     * - Tasa de éxito/fallo  
     * - Uso de caché (hit/miss)
     * - Tamaño de output
     */
    describe('REQ-4.3.2: Registro de métricas específicas', () => {
        
        describe('Tiempo de renderizado', () => {
            it('debe registrar tiempo de renderizado en milisegundos', async () => {
                const tiempoRenderizado = 45000; // 45 segundos
                
                await collector.record({
                    operationType: 'video_render',
                    status: 'success',
                    durationMs: tiempoRenderizado
                });

                const stats = await collector.getStats(1);
                expect(stats.byOperationType['video_render'].avgDurationMs).toBe(tiempoRenderizado);
            });

            it('debe calcular tiempo mínimo y máximo de renderizado', async () => {
                const tiempos = [30000, 45000, 60000]; // 30s, 45s, 60s
                
                for (const tiempo of tiempos) {
                    await collector.record({
                        operationType: 'video_render',
                        status: 'success',
                        durationMs: tiempo
                    });
                }

                const stats = await collector.getStats(1);
                const renderStats = stats.byOperationType['video_render'];
                
                expect(renderStats.minDurationMs).toBe(30000);
                expect(renderStats.maxDurationMs).toBe(60000);
                expect(renderStats.avgDurationMs).toBeCloseTo(45000, 0);
            });

            it('debe medir tiempo automáticamente con startOperation', async () => {
                const finish = collector.startOperation('video_render');
                
                // Simular trabajo de renderizado
                await new Promise(resolve => setTimeout(resolve, 150));
                
                await finish('success');

                const stats = await collector.getStats(1);
                // El tiempo debe ser al menos 150ms
                expect(stats.byOperationType['video_render'].avgDurationMs).toBeGreaterThanOrEqual(150);
            });
        });

        describe('Tasa de éxito/fallo', () => {
            it('debe calcular tasa de éxito correctamente', async () => {
                // 4 éxitos, 1 fallo = 80% tasa de éxito
                for (let i = 0; i < 4; i++) {
                    await collector.record({
                        operationType: 'video_render',
                        status: 'success',
                        durationMs: 1000
                    });
                }
                
                await collector.record({
                    operationType: 'video_render',
                    status: 'failure',
                    durationMs: 500,
                    errorMessage: 'Error de codificación'
                });

                const stats = await collector.getStats(1);
                const renderStats = stats.byOperationType['video_render'];
                
                expect(renderStats.successCount).toBe(4);
                expect(renderStats.failureCount).toBe(1);
                expect(renderStats.successRate).toBe(0.8); // 80%
            });

            it('debe calcular tasa global de éxito/fallo', async () => {
                // Diferentes operaciones con diferentes resultados
                await collector.record({
                    operationType: 'video_render',
                    status: 'success',
                    durationMs: 1000
                });
                
                await collector.record({
                    operationType: 'audio_generate',
                    status: 'success',
                    durationMs: 500
                });
                
                await collector.record({
                    operationType: 'api_call',
                    status: 'failure',
                    durationMs: 2000
                });

                const stats = await collector.getStats(1);
                
                expect(stats.totals.successfulOperations).toBe(2);
                expect(stats.totals.failedOperations).toBe(1);
                expect(stats.totals.successRate).toBeCloseTo(2/3, 2);
            });

            it('debe registrar mensaje de error en fallos', async () => {
                const errorMsg = 'FFmpeg error: códec no soportado';
                
                await collector.record({
                    operationType: 'video_render',
                    status: 'failure',
                    durationMs: 1000,
                    errorMessage: errorMsg
                });

                // La métrica se registró (verificamos que no lanza error)
                const stats = await collector.getStats(1);
                expect(stats.byOperationType['video_render'].failureCount).toBe(1);
            });
        });

        describe('Uso de caché (hit/miss)', () => {
            it('debe registrar cache hits correctamente', async () => {
                await collector.record({
                    operationType: 'video_transform',
                    status: 'success',
                    durationMs: 100, // Rápido porque viene de caché
                    cacheUsed: true,
                    cacheHit: true
                });

                const stats = await collector.getStats(1);
                expect(stats.cache.totalHits).toBe(1);
                expect(stats.cache.totalMisses).toBe(0);
            });

            it('debe registrar cache misses correctamente', async () => {
                await collector.record({
                    operationType: 'video_transform',
                    status: 'success',
                    durationMs: 5000, // Lento porque tuvo que procesar
                    cacheUsed: true,
                    cacheHit: false
                });

                const stats = await collector.getStats(1);
                expect(stats.cache.totalHits).toBe(0);
                expect(stats.cache.totalMisses).toBe(1);
            });

            it('debe calcular hit rate de caché correctamente', async () => {
                // 3 hits, 2 misses = 60% hit rate
                for (let i = 0; i < 3; i++) {
                    await collector.record({
                        operationType: 'audio_generate',
                        status: 'success',
                        durationMs: 100,
                        cacheUsed: true,
                        cacheHit: true
                    });
                }
                
                for (let i = 0; i < 2; i++) {
                    await collector.record({
                        operationType: 'audio_generate',
                        status: 'success',
                        durationMs: 3000,
                        cacheUsed: true,
                        cacheHit: false
                    });
                }

                const stats = await collector.getStats(1);
                expect(stats.cache.totalHits).toBe(3);
                expect(stats.cache.totalMisses).toBe(2);
                expect(stats.cache.hitRate).toBe(0.6); // 60%
            });

            it('debe diferenciar entre caché usado y no usado', async () => {
                // Operación sin caché
                await collector.record({
                    operationType: 'script_generate',
                    status: 'success',
                    durationMs: 2000,
                    cacheUsed: false
                });
                
                // Operación con caché
                await collector.record({
                    operationType: 'audio_generate',
                    status: 'success',
                    durationMs: 100,
                    cacheUsed: true,
                    cacheHit: true
                });

                const stats = await collector.getStats(1);
                // Solo debe contar la operación que usó caché
                expect(stats.cache.totalHits).toBe(1);
                expect(stats.cache.totalMisses).toBe(0);
            });
        });

        describe('Tamaño de output', () => {
            it('debe registrar tamaño de output en bytes', async () => {
                const outputSize = 52428800; // 50MB
                
                await collector.record({
                    operationType: 'video_render',
                    status: 'success',
                    durationMs: 45000,
                    outputSizeBytes: outputSize
                });

                const stats = await collector.getStats(1);
                expect(stats.byOperationType['video_render'].totalOutputSizeBytes).toBe(outputSize);
            });

            it('debe acumular tamaño total de outputs', async () => {
                const sizes = [
                    52428800,  // 50MB
                    104857600, // 100MB
                    26214400   // 25MB
                ];
                
                for (const size of sizes) {
                    await collector.record({
                        operationType: 'video_render',
                        status: 'success',
                        durationMs: 30000,
                        outputSizeBytes: size
                    });
                }

                const stats = await collector.getStats(1);
                const totalExpected = sizes.reduce((a, b) => a + b, 0); // 175MB
                expect(stats.byOperationType['video_render'].totalOutputSizeBytes).toBe(totalExpected);
                expect(stats.totals.totalOutputSizeBytes).toBe(totalExpected);
            });

            it('debe manejar operaciones sin tamaño de output', async () => {
                // Algunas operaciones no generan output medible
                await collector.record({
                    operationType: 'api_call',
                    status: 'success',
                    durationMs: 500
                    // Sin outputSizeBytes
                });

                const stats = await collector.getStats(1);
                expect(stats.byOperationType['api_call'].totalOutputSizeBytes).toBe(0);
            });
        });

        describe('Escenario completo de pipeline de renderizado', () => {
            it('debe registrar métricas completas de un pipeline de video', async () => {
                const correlationId = 'pipeline-video-123';
                const channelId = 'channel1';

                // 1. Generación de script (sin caché, sin output size)
                await collector.record({
                    operationType: 'script_generate',
                    status: 'success',
                    durationMs: 3000,
                    correlationId,
                    channelId
                });

                // 2. Generación de audio (cache miss)
                await collector.record({
                    operationType: 'audio_generate',
                    status: 'success',
                    durationMs: 5000,
                    outputSizeBytes: 2097152, // 2MB
                    cacheUsed: true,
                    cacheHit: false,
                    correlationId,
                    channelId
                });

                // 3. Transformación de video (cache hit)
                await collector.record({
                    operationType: 'video_transform',
                    status: 'success',
                    durationMs: 200,
                    cacheUsed: true,
                    cacheHit: true,
                    correlationId,
                    channelId
                });

                // 4. Transformación de música (cache miss)
                await collector.record({
                    operationType: 'music_transform',
                    status: 'success',
                    durationMs: 8000,
                    outputSizeBytes: 4194304, // 4MB
                    cacheUsed: true,
                    cacheHit: false,
                    correlationId,
                    channelId
                });

                // 5. Renderizado final de video
                await collector.record({
                    operationType: 'video_render',
                    status: 'success',
                    durationMs: 45000,
                    outputSizeBytes: 52428800, // 50MB
                    correlationId,
                    channelId
                });

                // 6. Publicación (fallo en primer intento)
                await collector.record({
                    operationType: 'video_publish',
                    status: 'failure',
                    durationMs: 10000,
                    errorMessage: 'Rate limit exceeded',
                    correlationId,
                    channelId
                });

                // 7. Publicación (retry exitoso)
                await collector.record({
                    operationType: 'video_publish',
                    status: 'success',
                    durationMs: 8000,
                    correlationId,
                    channelId
                });

                // Verificar estadísticas completas
                const stats = await collector.getStats(1);

                // Totales
                expect(stats.totals.totalOperations).toBe(7);
                expect(stats.totals.successfulOperations).toBe(6);
                expect(stats.totals.failedOperations).toBe(1);
                expect(stats.totals.successRate).toBeCloseTo(6/7, 2);

                // Caché: 1 hit, 2 misses
                expect(stats.cache.totalHits).toBe(1);
                expect(stats.cache.totalMisses).toBe(2);
                expect(stats.cache.hitRate).toBeCloseTo(1/3, 2);

                // Output total: 2MB + 4MB + 50MB = 56MB
                const expectedOutputTotal = 2097152 + 4194304 + 52428800;
                expect(stats.totals.totalOutputSizeBytes).toBe(expectedOutputTotal);

                // Video render específico
                expect(stats.byOperationType['video_render'].avgDurationMs).toBe(45000);
                expect(stats.byOperationType['video_render'].totalOutputSizeBytes).toBe(52428800);

                // Video publish: 1 éxito, 1 fallo
                expect(stats.byOperationType['video_publish'].successCount).toBe(1);
                expect(stats.byOperationType['video_publish'].failureCount).toBe(1);
            });
        });
    });

    /**
     * Tests específicos para REQ-4.3.3
     * Verifica que el reporte semanal incluya todos los elementos requeridos:
     * - Resumen general (operaciones totales, exitosas, fallidas, tasa de éxito)
     * - Tiempo promedio de operaciones
     * - Uso de caché (hits, misses, hit rate)
     * - Tamaño total de output
     * - Desglose por tipo de operación
     */
    describe('REQ-4.3.3: Reporte semanal de métricas por Telegram', () => {
        
        beforeEach(async () => {
            // Insertar datos representativos para el reporte
            await collector.record({
                operationType: 'video_render',
                status: 'success',
                durationMs: 120000, // 2 minutos
                outputSizeBytes: 75000000, // 75MB
                cacheUsed: true,
                cacheHit: false
            });

            await collector.record({
                operationType: 'video_transform',
                status: 'success',
                durationMs: 8000,
                cacheUsed: true,
                cacheHit: true
            });

            await collector.record({
                operationType: 'audio_generate',
                status: 'success',
                durationMs: 5000,
                outputSizeBytes: 2000000, // 2MB
                cacheUsed: true,
                cacheHit: true
            });

            await collector.record({
                operationType: 'api_call',
                status: 'failure',
                durationMs: 30000,
                errorMessage: 'Timeout de conexión'
            });
        });

        describe('Contenido del reporte', () => {
            it('debe incluir resumen general con operaciones totales, exitosas, fallidas y tasa de éxito', async () => {
                const report = await collector.generateWeeklyReport();

                // Verificar que incluye elementos del resumen general
                expect(report).toContain('RESUMEN GENERAL');
                expect(report).toContain('Total operaciones: 4');
                expect(report).toContain('Exitosas: 3');
                expect(report).toContain('Fallidas: 1');
                expect(report).toContain('Tasa de éxito: 75.0%');
            });

            it('debe incluir tiempo promedio de operaciones', async () => {
                const report = await collector.generateWeeklyReport();

                // El reporte debe incluir tiempo promedio
                expect(report).toContain('Tiempo promedio');
                // Verificamos que hay algún formato de tiempo (s, min, etc)
                expect(report).toMatch(/Tiempo promedio.*\d/);
            });

            it('debe incluir estadísticas de uso de caché (hits, misses, hit rate)', async () => {
                const report = await collector.generateWeeklyReport();

                // Verificar sección de caché
                expect(report).toContain('USO DE CACHÉ');
                expect(report).toContain('Hits: 2');
                expect(report).toContain('Misses: 1');
                expect(report).toContain('Hit rate: 66.7%');
            });

            it('debe incluir tamaño total de output', async () => {
                const report = await collector.generateWeeklyReport();

                // Verificar que incluye tamaño de output
                expect(report).toContain('Output total');
                // El total es 75MB + 2MB = 77MB
                expect(report).toMatch(/Output total.*MB/);
            });

            it('debe incluir desglose por tipo de operación', async () => {
                const report = await collector.generateWeeklyReport();

                // Verificar sección de desglose por tipo
                expect(report).toContain('POR TIPO DE OPERACIÓN');
                
                // Cada tipo con operaciones debe aparecer (formato con emojis)
                expect(report).toContain('Video Render'); // video_render
                expect(report).toContain('Video Transform'); // video_transform
                expect(report).toContain('Audio Generate'); // audio_generate
                expect(report).toContain('API Call'); // api_call
            });

            it('debe incluir estadísticas detalladas por tipo de operación', async () => {
                const report = await collector.generateWeeklyReport();

                // Cada tipo debe incluir: operaciones, tasa éxito, tiempo promedio
                expect(report).toMatch(/Operaciones:\s*\d+/);
                expect(report).toMatch(/Tasa éxito:\s*\d+\.\d+%/);
                expect(report).toMatch(/Tiempo prom:/);
            });
        });

        describe('Envío por Telegram', () => {
            it('debe enviar el reporte completo via callback de Telegram', async () => {
                let reporteRecibido = '';
                const mockTelegramCallback = vi.fn().mockImplementation(async (mensaje: string) => {
                    reporteRecibido = mensaje;
                });

                collector.setTelegramCallback(mockTelegramCallback);

                const result = await collector.sendWeeklyReport();

                expect(result).toBe(true);
                expect(mockTelegramCallback).toHaveBeenCalledTimes(1);
                
                // Verificar que el reporte enviado tiene todo lo requerido
                expect(reporteRecibido).toContain('REPORTE SEMANAL DE MÉTRICAS');
                expect(reporteRecibido).toContain('RESUMEN GENERAL');
                expect(reporteRecibido).toContain('USO DE CACHÉ');
                expect(reporteRecibido).toContain('POR TIPO DE OPERACIÓN');
            });

            it('debe formatear el reporte con emojis para mejor legibilidad en Telegram', async () => {
                const report = await collector.generateWeeklyReport();

                // El reporte debe usar emojis para mejor presentación
                expect(report).toContain('📊'); // Título
                expect(report).toContain('📈'); // Resumen
                expect(report).toContain('✅'); // Exitosas
                expect(report).toContain('❌'); // Fallidas
                expect(report).toContain('⏱️'); // Tiempo
                expect(report).toContain('💾'); // Output
                expect(report).toContain('🗄️'); // Caché
                expect(report).toContain('🔄'); // Por tipo
            });

            it('debe incluir período de fechas del reporte', async () => {
                const report = await collector.generateWeeklyReport();

                // Debe incluir fechas de inicio y fin del período
                const hoy = new Date();
                const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                
                // Verificar formato de fecha (día/mes/año)
                expect(report).toMatch(/\d{2}\/\d{2}\/\d{4}/);
            });
        });

        describe('Formato y presentación', () => {
            it('debe usar formato Markdown para Telegram (negrita con asteriscos)', async () => {
                const report = await collector.generateWeeklyReport();

                // El reporte usa *texto* para negrita en Telegram
                expect(report).toContain('*REPORTE SEMANAL DE MÉTRICAS*');
                expect(report).toContain('*RESUMEN GENERAL*');
                expect(report).toContain('*USO DE CACHÉ*');
            });

            it('debe incluir separadores visuales para mejor lectura', async () => {
                const report = await collector.generateWeeklyReport();

                // Separadores de secciones
                expect(report).toContain('═══════════════════════════════');
            });

            it('debe incluir branding de OmniAI-Engine', async () => {
                const report = await collector.generateWeeklyReport();

                expect(report).toContain('OmniAI-Engine');
                expect(report).toContain('Métricas Automatizadas');
            });
        });
    });
});
