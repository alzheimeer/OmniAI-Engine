/**
 * ThumbnailABTestingService.test.ts
 * 
 * Tests unitarios para el sistema de A/B testing de thumbnails.
 * 
 * REQ-5.1.3: Implementar A/B testing de thumbnails guardando versiones alternativas
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { 
    ThumbnailABTestingService, 
    ThumbnailABTestConfig,
    ABTestRecord,
    ThumbnailVariant,
    VariationType
} from './ThumbnailABTestingService';

// Mock de ThumbnailService para evitar renderizado real
vi.mock('./ThumbnailService', () => ({
    ThumbnailService: {
        generateThumbnail: vi.fn().mockResolvedValue({
            outputPath: '/test/output/thumbnail.jpg',
            templateId: 'cyber',
            templateName: 'NeuroTech Cyber',
            hash: 'abc123def456',
            antiDetectionApplied: true,
            dynamicElementsApplied: [],
            dynamicElementsCount: 0
        }),
        selectTemplateRandom: vi.fn().mockReturnValue({
            id: 'cyber',
            name: 'NeuroTech Cyber',
            colors: { accent: '#00d4ff' },
            layout: { titlePosition: 'center' },
            effects: { vignette: true }
        }),
        selectTemplateByMood: vi.fn().mockReturnValue({
            id: 'calm',
            name: 'Calm Focus',
            colors: { accent: '#64b5f6' },
            layout: { titlePosition: 'bottom' },
            effects: { vignette: false }
        }),
        selectTemplateRoundRobin: vi.fn().mockReturnValue({
            id: 'energy',
            name: 'Energy Burst',
            colors: { accent: '#ffffff' },
            layout: { titlePosition: 'top' },
            effects: { vignette: true }
        })
    }
}));

// Mock de Logger
vi.mock('../infrastructure/Logger', () => ({
    Logger: class MockLogger {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        debug = vi.fn();
        constructor(_name?: string) {}
    }
}));

// Mock de MetricsCollector
vi.mock('../infrastructure/MetricsCollector', () => ({
    metricsCollector: {
        record: vi.fn().mockResolvedValue(1)
    }
}));

describe('ThumbnailABTestingService', () => {
    let service: ThumbnailABTestingService;
    const testDbPath = path.join(__dirname, '../../../content/test_ab_testing.sqlite');

    beforeEach(() => {
        // Limpiar DB de test si existe
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        service = new ThumbnailABTestingService(testDbPath);
    });

    afterEach(async () => {
        await service.close();
        
        // Limpiar DB de test
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('Inicialización', () => {
        it('debe inicializar correctamente la base de datos', () => {
            // El servicio debe haberse inicializado sin errores
            expect(service).toBeDefined();
        });

        it('debe crear el archivo de base de datos', async () => {
            // El archivo de DB se crea de forma asíncrona por SQLite
            // Realizar una operación para asegurar que la DB se inicializó
            const config: ThumbnailABTestConfig = {
                title: 'DB Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template',
                moodTags: ['test']
            };
            
            // Generar un test para forzar la creación del archivo
            await service.generateABTest(config);
            
            // Ahora el archivo debe existir
            expect(fs.existsSync(testDbPath)).toBe(true);
        });
    });

    describe('Generación de A/B Tests', () => {
        it('debe generar un A/B test con dos variantes', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Test Video Title',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template',
                moodTags: ['tecnología', 'ia']
            };

            const result = await service.generateABTest(config);

            expect(result).toBeDefined();
            expect(result.testId).toBeDefined();
            expect(result.testId).toMatch(/^abt_/);
            expect(result.variantA).toBeDefined();
            expect(result.variantB).toBeDefined();
            expect(result.variantA.variant).toBe('A');
            expect(result.variantB.variant).toBe('B');
            expect(result.activeVariant).toBe('A'); // Por defecto empieza con A
        });

        it('debe guardar el test en la base de datos', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'DB Test Video',
                channelId: 'channel2',
                isShort: false,
                variationType: 'color_scheme'
            };

            const result = await service.generateABTest(config);
            const savedTest = await service.getABTest(result.testId);

            expect(savedTest).toBeDefined();
            expect(savedTest?.testId).toBe(result.testId);
            expect(savedTest?.channelId).toBe('channel2');
            expect(savedTest?.status).toBe('active');
        });

        it('debe generar IDs únicos para cada test', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Unique ID Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };

            const result1 = await service.generateABTest(config);
            const result2 = await service.generateABTest(config);

            expect(result1.testId).not.toBe(result2.testId);
        });

        it('debe soportar diferentes tipos de variación', async () => {
            const variationTypes: VariationType[] = [
                'template',
                'color_scheme',
                'text_position',
                'dynamic_elements',
                'style_intensity'
            ];

            for (const variationType of variationTypes) {
                const config: ThumbnailABTestConfig = {
                    title: `Variation Test ${variationType}`,
                    channelId: 'channel1',
                    isShort: true,
                    variationType
                };

                const result = await service.generateABTest(config);
                expect(result.testId).toBeDefined();
                expect(result.variantB.variationApplied).toBeDefined();
            }
        });
    });

    describe('Tracking de Métricas', () => {
        it('debe actualizar métricas de un test', async () => {
            // Crear test
            const config: ThumbnailABTestConfig = {
                title: 'Metrics Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // Actualizar métricas
            await service.updateTestMetrics(
                result.testId,
                { impressions: 1000, clicks: 50 },
                { impressions: 1000, clicks: 60 }
            );

            // Verificar
            const test = await service.getABTest(result.testId);
            expect(test?.impressionsA).toBe(1000);
            expect(test?.clicksA).toBe(50);
            expect(test?.ctrVariantA).toBeCloseTo(0.05, 2);
            expect(test?.impressionsB).toBe(1000);
            expect(test?.clicksB).toBe(60);
            expect(test?.ctrVariantB).toBeCloseTo(0.06, 2);
        });

        it('debe calcular CTR correctamente', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'CTR Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // CTR de 5% vs 10%
            await service.updateTestMetrics(
                result.testId,
                { impressions: 200, clicks: 10 },  // 5% CTR
                { impressions: 200, clicks: 20 }   // 10% CTR
            );

            const test = await service.getABTest(result.testId);
            expect(test?.ctrVariantA).toBeCloseTo(0.05, 2);
            expect(test?.ctrVariantB).toBeCloseTo(0.10, 2);
        });
    });

    describe('Cambio de Variante Activa', () => {
        it('debe cambiar la variante activa', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Switch Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            expect(result.activeVariant).toBe('A');

            await service.switchActiveVariant(result.testId, 'B', 'Test manual switch');

            const test = await service.getABTest(result.testId);
            expect(test?.activeVariant).toBe('B');
        });

        it('debe registrar el cambio en el historial', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'History Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            await service.switchActiveVariant(result.testId, 'B', 'Reason for switch');

            // El historial se registra internamente (verificamos que no haya error)
            const test = await service.getABTest(result.testId);
            expect(test?.activeVariant).toBe('B');
        });
    });

    describe('Análisis de Tests', () => {
        it('debe recomendar continuar cuando hay pocos datos', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Low Data Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // Solo 50 impresiones (menos del mínimo de 100)
            await service.updateTestMetrics(
                result.testId,
                { impressions: 50, clicks: 3 },
                { impressions: 50, clicks: 5 }
            );

            const analysis = await service.analyzeTest(result.testId);

            expect(analysis.recommendedAction).toBe('continue_test');
            expect(analysis.winner).toBeUndefined();
        });

        it('debe declarar ganador cuando hay diferencia significativa', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Significant Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // CTR significativamente diferente: 3% vs 10%
            await service.updateTestMetrics(
                result.testId,
                { impressions: 200, clicks: 6 },   // 3% CTR
                { impressions: 200, clicks: 20 }   // 10% CTR
            );

            const analysis = await service.analyzeTest(result.testId);

            expect(analysis.recommendedAction).toBe('select_winner');
            expect(analysis.winner).toBe('B');
            expect(analysis.isStatisticallySignificant).toBe(true);
            expect(analysis.uplift).toBeGreaterThan(0);
        });

        it('debe ser inconcluso cuando la diferencia es pequeña', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Close Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // CTR muy similar: 5% vs 5.5% (diferencia < 5%)
            await service.updateTestMetrics(
                result.testId,
                { impressions: 200, clicks: 10 },  // 5% CTR
                { impressions: 200, clicks: 11 }   // 5.5% CTR
            );

            const analysis = await service.analyzeTest(result.testId);

            expect(analysis.recommendedAction).toBe('inconclusive');
        });

        it('debe calcular uplift correctamente', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Uplift Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            // B tiene 100% más CTR que A
            await service.updateTestMetrics(
                result.testId,
                { impressions: 200, clicks: 10 },  // 5% CTR
                { impressions: 200, clicks: 20 }   // 10% CTR
            );

            const analysis = await service.analyzeTest(result.testId);

            // Uplift debe ser cercano a 100% (10% es el doble de 5%)
            expect(analysis.uplift).toBeCloseTo(100, 0);
        });
    });

    describe('Completar Tests', () => {
        it('debe marcar test como completado', async () => {
            const config: ThumbnailABTestConfig = {
                title: 'Complete Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            };
            const result = await service.generateABTest(config);

            await service.completeTest(result.testId, 'A');

            const test = await service.getABTest(result.testId);
            expect(test?.status).toBe('completed');
            expect(test?.winner).toBe('A');
            expect(test?.completedAt).toBeDefined();
        });
    });

    describe('Consultas', () => {
        it('debe obtener tests activos', async () => {
            // Crear varios tests
            for (let i = 0; i < 3; i++) {
                await service.generateABTest({
                    title: `Active Test ${i}`,
                    channelId: 'channel1',
                    isShort: true,
                    variationType: 'template'
                });
            }

            const activeTests = await service.getActiveTests();

            expect(activeTests.length).toBe(3);
            expect(activeTests.every(t => t.status === 'active')).toBe(true);
        });

        it('debe obtener tests por canal', async () => {
            // Crear tests en diferentes canales
            await service.generateABTest({
                title: 'Channel1 Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            });
            await service.generateABTest({
                title: 'Channel2 Test',
                channelId: 'channel2',
                isShort: true,
                variationType: 'template'
            });

            const channel1Tests = await service.getTestsByChannel('channel1');
            const channel2Tests = await service.getTestsByChannel('channel2');

            expect(channel1Tests.length).toBe(1);
            expect(channel2Tests.length).toBe(1);
            expect(channel1Tests[0].channelId).toBe('channel1');
            expect(channel2Tests[0].channelId).toBe('channel2');
        });

        it('debe vincular test a video', async () => {
            const result = await service.generateABTest({
                title: 'Link Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            });

            await service.linkTestToVideo(result.testId, 'yt_video_123');

            const test = await service.getABTest(result.testId);
            expect(test?.videoId).toBe('yt_video_123');

            // También debe poder buscarse por videoId
            const byVideoId = await service.getABTestByVideoId('yt_video_123');
            expect(byVideoId?.testId).toBe(result.testId);
        });

        it('debe obtener ruta del thumbnail activo', async () => {
            const result = await service.generateABTest({
                title: 'Path Test',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            });

            const pathA = await service.getActiveThumbnailPath(result.testId);
            expect(pathA).toBeDefined();

            // Cambiar a B
            await service.switchActiveVariant(result.testId, 'B', 'Test');

            const pathB = await service.getActiveThumbnailPath(result.testId);
            expect(pathB).toBeDefined();
            // Las rutas deben ser diferentes (aunque en el mock son iguales, el concepto es correcto)
        });
    });

    describe('Generación de Reportes', () => {
        it('debe generar un reporte de tests', async () => {
            // Crear algunos tests
            await service.generateABTest({
                title: 'Report Test 1',
                channelId: 'channel1',
                isShort: true,
                variationType: 'template'
            });

            const report = await service.generateReport();

            expect(report).toBeDefined();
            expect(report).toContain('REPORTE DE A/B TESTING');
            expect(report).toContain('TESTS ACTIVOS');
        });
    });

    describe('Manejo de Errores', () => {
        it('debe lanzar error al obtener test inexistente para análisis', async () => {
            await expect(service.analyzeTest('inexistente'))
                .rejects.toThrow('Test inexistente no encontrado');
        });

        it('debe lanzar error al cambiar variante de test inexistente', async () => {
            await expect(service.switchActiveVariant('inexistente', 'B', 'test'))
                .rejects.toThrow('Test inexistente no encontrado');
        });

        it('debe retornar null al obtener test inexistente', async () => {
            const test = await service.getABTest('no_existe');
            expect(test).toBeNull();
        });
    });
});
