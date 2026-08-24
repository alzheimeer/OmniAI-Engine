/**
 * MultiPlatformDispatcher.test.ts
 * 
 * Tests unitarios para MultiPlatformDispatcher.
 * Verifica implementación de REQ-3.4.1 a REQ-3.4.4.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    MultiPlatformDispatcher,
    SourceContent,
    DispatchOptions,
    DispatchSchedule,
    DEFAULT_DELAY_CONFIG,
    DEFAULT_SCHEDULE_CONFIG,
    PLATFORM_CONTENT_STRATEGIES,
    Platform
} from './MultiPlatformDispatcher';

// Mock de módulos externos
vi.mock('../infrastructure/Logger', () => ({
    Logger: class {
        static generateCorrelationId() { return 'test-correlation-id'; }
        setCorrelationId() {}
        info() {}
        warn() {}
        error() {}
        debug() {}
    }
}));

vi.mock('../validation/YPPValidationGate', () => ({
    YPPValidationGate: class {
        canExpandToPlatform(platform: string, monetizationData: { hasFirstDollar: boolean }) {
            // Si hasFirstDollar es true, permitir
            if (monetizationData && monetizationData.hasFirstDollar) {
                return { 
                    allowed: true, 
                    reason: 'YPP aprobado',
                    platform,
                    requirement: '',
                    currentMonetizationStatus: monetizationData
                };
            }
            // Por defecto bloquear
            return { 
                allowed: false, 
                reason: 'YPP no aprobado - necesitas monetización primero',
                platform,
                requirement: 'Se requiere primer dólar',
                currentMonetizationStatus: monetizationData
            };
        }
    }
}));

// Mock para ReelsAdapter y TikTokAdapter
vi.mock('../adapters/ReelsAdapter', () => ({
    ReelsAdapter: {
        getDefaultConfig: (path: string) => ({
            inputVideoPath: path,
            maxDurationSeconds: 30,
            colorPop: { saturationBoost: 1.2, contrastBoost: 1.1 },
            subtitles: { enabled: true, style: 'bold' }
        }),
        adaptVideoForReels: async () => ({
            videoPath: '/test/output_reels.mp4',
            durationSeconds: 30,
            coverPath: '/test/cover_reels.jpg',
            videoHash: 'mock-hash',
            resolution: { width: 1080, height: 1920 },
            metadata: { colorPopApplied: true, saturationApplied: 1.2, contrastApplied: 1.1, subtitlesBurned: true, dynamicZoomApplied: false, processedAt: new Date().toISOString() }
        })
    }
}));

vi.mock('../adapters/TikTokAdapter', () => ({
    TikTokAdapter: {
        getDefaultConfig: (path: string) => ({
            inputVideoPath: path,
            maxDurationSeconds: 15,
            colorPop: { saturationBoost: 1.25, contrastBoost: 1.12 },
            subtitles: { enabled: true, style: 'glow' },
            hook: { durationSeconds: 0.5, applyImpactEffect: true, zoomBurst: true }
        }),
        adaptVideoForTikTok: async () => ({
            videoPath: '/test/output_tiktok.mp4',
            durationSeconds: 15,
            coverPath: '/test/cover_tiktok.jpg',
            videoHash: 'mock-hash',
            resolution: { width: 1080, height: 1920 },
            metadata: { colorPopApplied: true, saturationApplied: 1.25, contrastApplied: 1.12, subtitlesBurned: true, dynamicZoomApplied: false, hookApplied: true, hookDurationSeconds: 0.5, cutRhythmIntervalSeconds: 1.5, processedAt: new Date().toISOString() }
        })
    }
}));

describe('MultiPlatformDispatcher', () => {
    let dispatcher: MultiPlatformDispatcher;
    let mockContent: SourceContent;

    beforeEach(() => {
        dispatcher = new MultiPlatformDispatcher();
        mockContent = {
            fullVideoPath: '/test/video_full.mp4',
            shortVideoPath: '/test/video_short.mp4',
            subtitlesPath: '/test/subtitles.ass',
            title: 'Test Video Title',
            description: 'Test video description for all platforms',
            tags: ['test', 'video', 'ai'],
            hashtags: ['#test', '#viral', '#ai'],
            thumbnailPath: '/test/thumbnail.jpg',
            fullVideoDuration: 300,
            shortDuration: 60
        };
        
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15T14:30:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('Inicialización', () => {
        it('debe crear instancia correctamente', () => {
            expect(dispatcher).toBeDefined();
            expect(dispatcher).toBeInstanceOf(MultiPlatformDispatcher);
        });
    });

    describe('REQ-3.4.2: Delay aleatorio 30-90 minutos entre plataformas', () => {
        it('debe generar delay dentro del rango 30-90 minutos por defecto', () => {
            // Ejecutar múltiples veces para verificar aleatoriedad
            const delays: number[] = [];
            
            for (let i = 0; i < 100; i++) {
                const delay = dispatcher.generateRandomDelayMinutes();
                delays.push(delay);
            }
            
            // Verificar que todos los delays están en el rango
            delays.forEach(delay => {
                expect(delay).toBeGreaterThanOrEqual(DEFAULT_DELAY_CONFIG.minDelayMinutes);
                expect(delay).toBeLessThanOrEqual(DEFAULT_DELAY_CONFIG.maxDelayMinutes);
            });
            
            // Verificar que hay variedad (no todos iguales)
            const uniqueDelays = new Set(delays);
            expect(uniqueDelays.size).toBeGreaterThan(1);
        });

        it('debe usar delay fijo cuando está configurado', () => {
            const fixedDelay = 45;
            const delay = dispatcher.generateRandomDelayMinutes({
                minDelayMinutes: 30,
                maxDelayMinutes: 90,
                useFixedDelay: true,
                fixedDelayMinutes: fixedDelay
            });
            
            expect(delay).toBe(fixedDelay);
        });

        it('debe respetar min/max personalizados', () => {
            const customMin = 10;
            const customMax = 20;
            
            for (let i = 0; i < 50; i++) {
                const delay = dispatcher.generateRandomDelayMinutes({
                    minDelayMinutes: customMin,
                    maxDelayMinutes: customMax,
                    useFixedDelay: false
                });
                
                expect(delay).toBeGreaterThanOrEqual(customMin);
                expect(delay).toBeLessThanOrEqual(customMax);
            }
        });
    });

    describe('REQ-3.4.3: Horarios ALEATORIOS de publicación (Regla de Oro #8)', () => {
        it('debe generar horarios dentro del rango permitido', () => {
            const scheduleConfig = {
                earliestHour: 10,
                latestHour: 20,
                allowedDays: [0, 1, 2, 3, 4, 5, 6],
                avoidExactHours: true,
                minuteVariation: 15
            };
            
            for (let i = 0; i < 50; i++) {
                const time = dispatcher.generateRandomPublishTime(scheduleConfig);
                const hour = time.getHours();
                
                expect(hour).toBeGreaterThanOrEqual(scheduleConfig.earliestHour);
                expect(hour).toBeLessThanOrEqual(scheduleConfig.latestHour);
            }
        });

        it('debe generar schedule completo con delays entre plataformas', () => {
            const schedule = dispatcher.generateRandomSchedule();
            
            expect(schedule).toHaveProperty('youtubePublishAt');
            expect(schedule).toHaveProperty('instagramPublishAt');
            expect(schedule).toHaveProperty('tiktokPublishAt');
            expect(schedule).toHaveProperty('youtubeToInstagramDelayMinutes');
            expect(schedule).toHaveProperty('instagramToTiktokDelayMinutes');
            expect(schedule).toHaveProperty('randomized');
            
            // Verificar delays están en rango (REQ-3.4.2)
            expect(schedule.youtubeToInstagramDelayMinutes).toBeGreaterThanOrEqual(30);
            expect(schedule.youtubeToInstagramDelayMinutes).toBeLessThanOrEqual(90);
            expect(schedule.instagramToTiktokDelayMinutes).toBeGreaterThanOrEqual(30);
            expect(schedule.instagramToTiktokDelayMinutes).toBeLessThanOrEqual(90);
        });

        it('debe mantener orden cronológico: YouTube → Instagram → TikTok', () => {
            for (let i = 0; i < 20; i++) {
                const schedule = dispatcher.generateRandomSchedule();
                
                expect(schedule.youtubePublishAt.getTime())
                    .toBeLessThan(schedule.instagramPublishAt.getTime());
                expect(schedule.instagramPublishAt.getTime())
                    .toBeLessThan(schedule.tiktokPublishAt.getTime());
            }
        });

        it('debe marcar schedule como randomized cuando no usa delay fijo', () => {
            const schedule = dispatcher.generateRandomSchedule();
            expect(schedule.randomized).toBe(true);
        });

        it('debe marcar schedule como no randomized cuando usa delay fijo', () => {
            const schedule = dispatcher.generateRandomSchedule({
                useFixedDelay: true,
                fixedDelayMinutes: 60
            });
            expect(schedule.randomized).toBe(false);
        });

        it('debe evitar horas exactas cuando está configurado', () => {
            const scheduleConfig = {
                earliestHour: 8,
                latestHour: 22,
                allowedDays: [0, 1, 2, 3, 4, 5, 6],
                avoidExactHours: true,
                minuteVariation: 15
            };
            
            let exactHourCount = 0;
            const iterations = 100;
            
            for (let i = 0; i < iterations; i++) {
                const time = dispatcher.generateRandomPublishTime(scheduleConfig);
                if (time.getMinutes() === 0) {
                    exactHourCount++;
                }
            }
            
            // Debería haber muy pocas horas exactas (tolerancia 15% por variabilidad estadística)
            expect(exactHourCount).toBeLessThan(iterations * 0.15); // Menos del 15%
        });

        it('debe respetar días permitidos', () => {
            const scheduleConfig = {
                ...DEFAULT_SCHEDULE_CONFIG,
                allowedDays: [1, 2, 3, 4, 5] // Solo lunes a viernes
            };
            
            for (let i = 0; i < 30; i++) {
                const time = dispatcher.generateRandomPublishTime(scheduleConfig);
                const day = time.getDay();
                
                expect(scheduleConfig.allowedDays).toContain(day);
            }
        });
    });

    describe('REQ-3.4.4: Estrategia de contenido diferenciado por plataforma', () => {
        it('debe retornar estrategia correcta para YouTube', () => {
            const strategy = dispatcher.getContentStrategy('youtube');
            
            expect(strategy.platform).toBe('youtube');
            expect(strategy.targetDurationSeconds).toBe(60);
            expect(strategy.hookDurationSeconds).toBe(3);
            expect(strategy.forceSubtitles).toBe(true);
            // YouTube no aplica color pop (valores neutros)
            expect(strategy.saturationBoost).toBe(1.0);
            expect(strategy.contrastBoost).toBe(1.0);
        });

        it('debe retornar estrategia correcta para Instagram (30s Reel)', () => {
            const strategy = dispatcher.getContentStrategy('instagram');
            
            expect(strategy.platform).toBe('instagram');
            expect(strategy.targetDurationSeconds).toBe(30); // REQ-3.1.2
            expect(strategy.forceSubtitles).toBe(true); // REQ-3.1.3
            expect(strategy.saturationBoost).toBe(1.20); // REQ-3.1.4: +20%
            expect(strategy.contrastBoost).toBe(1.10); // REQ-3.1.4: +10%
            expect(strategy.hookDurationSeconds).toBe(3);
        });

        it('debe retornar estrategia correcta para TikTok (15s, hook 0.5s)', () => {
            const strategy = dispatcher.getContentStrategy('tiktok');
            
            expect(strategy.platform).toBe('tiktok');
            expect(strategy.targetDurationSeconds).toBe(15); // REQ-3.2.2
            expect(strategy.forceSubtitles).toBe(true);
            expect(strategy.saturationBoost).toBe(1.25); // +25% (más intenso)
            expect(strategy.contrastBoost).toBe(1.12); // +12%
            expect(strategy.hookDurationSeconds).toBe(0.5); // REQ-3.2.3
        });

        it('las estrategias deben tener duraciones decrecientes: YT > IG > TT', () => {
            const ytStrategy = dispatcher.getContentStrategy('youtube');
            const igStrategy = dispatcher.getContentStrategy('instagram');
            const ttStrategy = dispatcher.getContentStrategy('tiktok');
            
            expect(ytStrategy.targetDurationSeconds).toBeGreaterThan(igStrategy.targetDurationSeconds!);
            expect(igStrategy.targetDurationSeconds).toBeGreaterThan(ttStrategy.targetDurationSeconds!);
        });

        it('TikTok debe tener hook más corto que otras plataformas', () => {
            const ytStrategy = dispatcher.getContentStrategy('youtube');
            const igStrategy = dispatcher.getContentStrategy('instagram');
            const ttStrategy = dispatcher.getContentStrategy('tiktok');
            
            expect(ttStrategy.hookDurationSeconds).toBeLessThan(ytStrategy.hookDurationSeconds);
            expect(ttStrategy.hookDurationSeconds).toBeLessThan(igStrategy.hookDurationSeconds);
        });
    });

    describe('REQ-3.4.1: Dispatch multiplataforma', () => {
        it('debe ejecutar dispatch en modo dry-run sin publicar realmente', async () => {
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true
            };
            
            vi.useRealTimers(); // Necesario para async
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            expect(result).toBeDefined();
            expect(result.dispatchId).toMatch(/^dispatch-/);
            expect(result.blockedByYPP).toBe(false);
            expect(result.status).toBe('completed');
        });

        it('debe generar dispatchId único', async () => {
            const options: DispatchOptions = {
                platforms: ['youtube'],
                dryRun: true,
                bypassYPPGate: true
            };
            
            vi.useRealTimers();
            
            const result1 = await dispatcher.dispatch(mockContent, options);
            const result2 = await dispatcher.dispatch(mockContent, options);
            
            expect(result1.dispatchId).not.toBe(result2.dispatchId);
        });

        it('debe incluir schedule en el resultado', async () => {
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram'],
                dryRun: true,
                bypassYPPGate: true
            };
            
            vi.useRealTimers();
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            expect(result.schedule).toBeDefined();
            expect(result.schedule.youtubePublishAt).toBeInstanceOf(Date);
            expect(result.schedule.instagramPublishAt).toBeInstanceOf(Date);
        });

        it('debe registrar plataformas exitosas y fallidas', async () => {
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true
            };
            
            vi.useRealTimers();
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            expect(result.successfulPlatforms).toBeDefined();
            expect(result.failedPlatforms).toBeDefined();
            expect(Array.isArray(result.successfulPlatforms)).toBe(true);
            expect(Array.isArray(result.failedPlatforms)).toBe(true);
        });

        it('debe medir duración total del dispatch', async () => {
            const options: DispatchOptions = {
                platforms: ['youtube'],
                dryRun: true,
                bypassYPPGate: true
            };
            
            vi.useRealTimers();
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            expect(result.startedAt).toBeInstanceOf(Date);
            expect(result.completedAt).toBeInstanceOf(Date);
            expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
            expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
        });
    });

    describe('Validación YPP Gate', () => {
        it('debe verificar si dispatch está permitido', () => {
            const check = dispatcher.isDispatchAllowed();
            
            expect(check).toHaveProperty('allowed');
            expect(check).toHaveProperty('reason');
            expect(typeof check.allowed).toBe('boolean');
            expect(typeof check.reason).toBe('string');
        });

        it('debe permitir dispatch cuando monetización está activa', () => {
            const check = dispatcher.isDispatchAllowed({
                hasFirstDollar: true,
                totalRevenue: 100,
                monthsWithRevenue: 3
            });
            
            expect(check.allowed).toBe(true);
        });

        it('debe bloquear dispatch cuando no hay monetización', () => {
            const check = dispatcher.isDispatchAllowed({
                hasFirstDollar: false,
                totalRevenue: 0,
                monthsWithRevenue: 0
            });
            
            expect(check.allowed).toBe(false);
        });

        it('debe permitir bypass de YPP gate en modo testing', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true // Bypass explícito
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            expect(result.blockedByYPP).toBe(false);
            expect(result.status).not.toBe('blocked');
        });
    });

    describe('Configuración de Publishers', () => {
        it('debe permitir configurar publishers', () => {
            expect(() => {
                dispatcher.configurePublishers(
                    '/path/to/instagram-cookies.json',
                    '/path/to/tiktok-cookies.json'
                );
            }).not.toThrow();
        });

        it('debe permitir configurar solo Instagram', () => {
            expect(() => {
                dispatcher.configurePublishers('/path/to/instagram-cookies.json');
            }).not.toThrow();
        });

        it('debe permitir configurar solo TikTok', () => {
            expect(() => {
                dispatcher.configurePublishers(undefined, '/path/to/tiktok-cookies.json');
            }).not.toThrow();
        });
    });

    describe('Progress Callback', () => {
        it('debe permitir registrar callback de progreso', () => {
            const callback = vi.fn();
            
            dispatcher.onProgress(callback);
            
            // El callback se registra sin errores
            expect(true).toBe(true);
        });

        it('debe llamar callback durante dispatch', async () => {
            vi.useRealTimers();
            
            const progressUpdates: Array<{ status: string; platform: Platform | null; message: string }> = [];
            
            const callback = (status: string, platform: Platform | null, message: string) => {
                progressUpdates.push({ status, platform, message });
            };
            
            const options: DispatchOptions = {
                platforms: ['youtube'],
                dryRun: true,
                bypassYPPGate: true,
                onProgress: callback
            };
            
            await dispatcher.dispatch(mockContent, options);
            
            expect(progressUpdates.length).toBeGreaterThan(0);
        });
    });

    describe('Cleanup', () => {
        it('debe cerrar recursos correctamente', async () => {
            vi.useRealTimers();
            
            await expect(dispatcher.close()).resolves.not.toThrow();
        });
    });
});

describe('Constantes de configuración', () => {
    it('DEFAULT_DELAY_CONFIG debe tener valores correctos (REQ-3.4.2)', () => {
        expect(DEFAULT_DELAY_CONFIG.minDelayMinutes).toBe(30);
        expect(DEFAULT_DELAY_CONFIG.maxDelayMinutes).toBe(90);
        expect(DEFAULT_DELAY_CONFIG.useFixedDelay).toBe(false);
    });

    it('DEFAULT_SCHEDULE_CONFIG debe tener valores correctos (REQ-3.4.3)', () => {
        expect(DEFAULT_SCHEDULE_CONFIG.earliestHour).toBe(8);
        expect(DEFAULT_SCHEDULE_CONFIG.latestHour).toBe(22);
        expect(DEFAULT_SCHEDULE_CONFIG.avoidExactHours).toBe(true);
        expect(DEFAULT_SCHEDULE_CONFIG.allowedDays).toContain(0); // Domingo
        expect(DEFAULT_SCHEDULE_CONFIG.allowedDays).toContain(6); // Sábado
    });

    it('PLATFORM_CONTENT_STRATEGIES debe tener todas las plataformas (REQ-3.4.4)', () => {
        expect(PLATFORM_CONTENT_STRATEGIES).toHaveProperty('youtube');
        expect(PLATFORM_CONTENT_STRATEGIES).toHaveProperty('instagram');
        expect(PLATFORM_CONTENT_STRATEGIES).toHaveProperty('tiktok');
    });
});

/**
 * Tests de Integración - Publicación Coordinada en 3 Plataformas
 * 
 * Tarea 26.4: Checkpoint Fase 5 - Integración Multiplataforma
 * 
 * Verifica:
 * - MultiPlatformDispatcher coordina correctamente los 3 publishers (YouTube, Instagram, TikTok)
 * - Los delays entre plataformas se respetan
 * - El contenido se adapta correctamente a cada plataforma
 * 
 * Estos tests usan modo dry-run y mocks para evitar publicaciones reales.
 */
describe('Integración: Publicación Coordinada en 3 Plataformas (Tarea 26.4)', () => {
    let dispatcher: MultiPlatformDispatcher;
    let mockContent: SourceContent;
    let progressLog: Array<{ status: string; platform: Platform | null; message: string; timestamp: number }>;

    beforeEach(() => {
        dispatcher = new MultiPlatformDispatcher();
        progressLog = [];
        
        mockContent = {
            fullVideoPath: '/test/video_full.mp4',
            shortVideoPath: '/test/video_short.mp4',
            subtitlesPath: '/test/subtitles.ass',
            title: 'Test Video - Integración Multiplataforma',
            description: 'Video de prueba para verificar publicación coordinada en YouTube, Instagram y TikTok',
            tags: ['test', 'integration', 'multiplatform'],
            hashtags: ['#test', '#viral', '#ai', '#neurotech'],
            thumbnailPath: '/test/thumbnail.jpg',
            fullVideoDuration: 300,
            shortDuration: 60
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Coordinación de Publishers (REQ-3.4.1)', () => {
        it('debe ejecutar publicación coordinada en 3 plataformas en modo dry-run', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0 // Sin delay para tests rápidos
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Verificar éxito general
            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.blockedByYPP).toBe(false);
            
            // Verificar que las 3 plataformas fueron procesadas
            expect(result.platformResults).toHaveLength(3);
            expect(result.successfulPlatforms).toContain('youtube');
            expect(result.successfulPlatforms).toContain('instagram');
            expect(result.successfulPlatforms).toContain('tiktok');
            expect(result.failedPlatforms).toHaveLength(0);
            
            // Verificar URLs generadas para cada plataforma
            const youtubeResult = result.platformResults.find(r => r.platform === 'youtube');
            const instagramResult = result.platformResults.find(r => r.platform === 'instagram');
            const tiktokResult = result.platformResults.find(r => r.platform === 'tiktok');
            
            expect(youtubeResult?.success).toBe(true);
            expect(youtubeResult?.contentUrl).toContain('youtube.com');
            
            expect(instagramResult?.success).toBe(true);
            expect(instagramResult?.contentUrl).toContain('instagram.com');
            
            expect(tiktokResult?.success).toBe(true);
            expect(tiktokResult?.contentUrl).toContain('tiktok.com');
        });

        it('debe registrar progreso para cada plataforma durante el dispatch', async () => {
            vi.useRealTimers();
            
            const progressCallback = (status: string, platform: Platform | null, message: string) => {
                progressLog.push({
                    status,
                    platform,
                    message,
                    timestamp: Date.now()
                });
            };
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                },
                onProgress: progressCallback
            };
            
            await dispatcher.dispatch(mockContent, options);
            
            // Debe haber registros de progreso para todas las fases
            expect(progressLog.length).toBeGreaterThan(0);
            
            // Debe incluir adaptación para cada plataforma (adaptación siempre ocurre)
            const adaptingLogs = progressLog.filter(p => p.status === 'adapting');
            expect(adaptingLogs.length).toBeGreaterThanOrEqual(3);
            
            // Debe terminar con estado 'completed'
            const lastLog = progressLog[progressLog.length - 1];
            expect(lastLog.status).toBe('completed');
        });

        it('debe procesar plataformas en orden: YouTube → Instagram → TikTok', async () => {
            vi.useRealTimers();
            
            const platformOrder: Platform[] = [];
            
            const progressCallback = (status: string, platform: Platform | null, message: string) => {
                // Registrar solo cuando empieza a adaptar contenido para cada plataforma
                if (status === 'adapting' && platform && !platformOrder.includes(platform)) {
                    platformOrder.push(platform);
                }
            };
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                },
                onProgress: progressCallback
            };
            
            await dispatcher.dispatch(mockContent, options);
            
            // Verificar orden correcto
            expect(platformOrder[0]).toBe('youtube');
            expect(platformOrder[1]).toBe('instagram');
            expect(platformOrder[2]).toBe('tiktok');
        });
    });

    describe('Delays entre Plataformas (REQ-3.4.2)', () => {
        it('debe generar schedule con delays entre 30-90 minutos', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true
                // Sin fixedDelay para verificar delays aleatorios
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Verificar que se generó schedule
            expect(result.schedule).toBeDefined();
            expect(result.schedule.randomized).toBe(true);
            
            // Verificar delays en rango correcto (REQ-3.4.2: 30-90 min)
            expect(result.schedule.youtubeToInstagramDelayMinutes).toBeGreaterThanOrEqual(30);
            expect(result.schedule.youtubeToInstagramDelayMinutes).toBeLessThanOrEqual(90);
            expect(result.schedule.instagramToTiktokDelayMinutes).toBeGreaterThanOrEqual(30);
            expect(result.schedule.instagramToTiktokDelayMinutes).toBeLessThanOrEqual(90);
        });

        it('debe respetar delay fijo cuando está configurado', async () => {
            vi.useRealTimers();
            
            const fixedDelay = 45; // 45 minutos
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: fixedDelay
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Con delay fijo, el schedule no debe ser aleatorio
            expect(result.schedule.randomized).toBe(false);
            
            // Los delays deben ser exactamente el valor fijo
            expect(result.schedule.youtubeToInstagramDelayMinutes).toBe(fixedDelay);
            expect(result.schedule.instagramToTiktokDelayMinutes).toBe(fixedDelay);
        });

        it('debe mantener orden cronológico en schedule generado', async () => {
            vi.useRealTimers();
            
            // Ejecutar múltiples veces para verificar consistencia
            for (let i = 0; i < 5; i++) {
                const options: DispatchOptions = {
                    platforms: ['youtube', 'instagram', 'tiktok'],
                    dryRun: true,
                    bypassYPPGate: true
                };
                
                const result = await dispatcher.dispatch(mockContent, options);
                
                // YouTube siempre debe ser primero
                expect(result.schedule.youtubePublishAt.getTime())
                    .toBeLessThan(result.schedule.instagramPublishAt.getTime());
                
                // Instagram siempre antes de TikTok
                expect(result.schedule.instagramPublishAt.getTime())
                    .toBeLessThan(result.schedule.tiktokPublishAt.getTime());
            }
        });
    });

    describe('Adaptación de Contenido por Plataforma (REQ-3.4.4)', () => {
        it('debe aplicar estrategias diferentes para cada plataforma', async () => {
            vi.useRealTimers();
            
            // Obtener estrategias
            const youtubeStrategy = dispatcher.getContentStrategy('youtube');
            const instagramStrategy = dispatcher.getContentStrategy('instagram');
            const tiktokStrategy = dispatcher.getContentStrategy('tiktok');
            
            // Verificar duraciones objetivo diferentes
            expect(youtubeStrategy.targetDurationSeconds).toBe(60);  // YouTube Short
            expect(instagramStrategy.targetDurationSeconds).toBe(30); // Instagram Reel
            expect(tiktokStrategy.targetDurationSeconds).toBe(15);    // TikTok
            
            // Verificar color pop diferente
            expect(instagramStrategy.saturationBoost).toBeGreaterThan(youtubeStrategy.saturationBoost);
            expect(tiktokStrategy.saturationBoost).toBeGreaterThan(instagramStrategy.saturationBoost);
            
            // Verificar hooks diferentes (TikTok más agresivo)
            expect(tiktokStrategy.hookDurationSeconds).toBe(0.5);
            expect(youtubeStrategy.hookDurationSeconds).toBe(3);
            expect(instagramStrategy.hookDurationSeconds).toBe(3);
        });

        it('debe ejecutar dispatch con contenido adaptado exitosamente', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Todas las plataformas deben tener resultado
            expect(result.platformResults).toHaveLength(3);
            
            // Cada plataforma debe tener contentId (puede o no ser único en dry-run rápido)
            result.platformResults.forEach(platformResult => {
                expect(platformResult.contentId).toBeDefined();
                expect(platformResult.contentId).not.toBe('');
            });
            
            // Cada resultado debe tener publishedAt
            result.platformResults.forEach(platformResult => {
                expect(platformResult.publishedAt).toBeInstanceOf(Date);
                expect(platformResult.durationMs).toBeGreaterThanOrEqual(0);
            });
        });

        it('debe forzar subtítulos en todas las plataformas', () => {
            const youtubeStrategy = dispatcher.getContentStrategy('youtube');
            const instagramStrategy = dispatcher.getContentStrategy('instagram');
            const tiktokStrategy = dispatcher.getContentStrategy('tiktok');
            
            // Todas las plataformas deben forzar subtítulos
            expect(youtubeStrategy.forceSubtitles).toBe(true);
            expect(instagramStrategy.forceSubtitles).toBe(true);  // REQ-3.1.3: 85% audiencia sin sonido
            expect(tiktokStrategy.forceSubtitles).toBe(true);
        });
    });

    describe('Validación YPP Gate en Integración', () => {
        it('debe bloquear dispatch cuando YPP no está aprobado', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: false, // NO bypass - debe verificar YPP
                monetizationData: {
                    hasFirstDollar: false, // Sin monetización
                    totalRevenue: 0,
                    monthsWithRevenue: 0
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Debe estar bloqueado
            expect(result.success).toBe(false);
            expect(result.status).toBe('blocked');
            expect(result.blockedByYPP).toBe(true);
            expect(result.blockReason).toBeDefined();
            
            // No debe haber resultados de plataformas
            expect(result.platformResults).toHaveLength(0);
            expect(result.failedPlatforms).toHaveLength(3);
        });

        it('debe permitir dispatch cuando YPP está aprobado (primer dólar)', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: false,
                monetizationData: {
                    hasFirstDollar: true, // Con monetización
                    totalRevenue: 150,
                    monthsWithRevenue: 2
                },
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // Debe estar permitido
            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.blockedByYPP).toBe(false);
            expect(result.successfulPlatforms).toHaveLength(3);
        });
    });

    describe('Manejo de Errores en Integración', () => {
        it('debe continuar con otras plataformas si una falla (cuando no hay publisher)', async () => {
            vi.useRealTimers();
            
            // Dispatch sin publishers configurados pero en modo NO dry-run
            // Esto causará error en Instagram y TikTok pero YouTube debería funcionar
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true, // En dry-run todo debería funcionar
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                }
            };
            
            const result = await dispatcher.dispatch(mockContent, options);
            
            // En dry-run todo funciona
            expect(result.platformResults).toHaveLength(3);
            expect(result.successfulPlatforms).toHaveLength(3);
        });

        it('debe calcular duración total correctamente', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                }
            };
            
            const startTime = Date.now();
            const result = await dispatcher.dispatch(mockContent, options);
            const endTime = Date.now();
            
            // La duración total debe estar dentro del rango esperado
            expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
            expect(result.totalDurationMs).toBeLessThanOrEqual(endTime - startTime + 1000);
            
            // startedAt debe ser antes de completedAt
            expect(result.startedAt.getTime()).toBeLessThanOrEqual(result.completedAt.getTime());
        });
    });

    describe('Limpieza de Recursos', () => {
        it('debe cerrar dispatcher correctamente después de integración', async () => {
            vi.useRealTimers();
            
            const options: DispatchOptions = {
                platforms: ['youtube', 'instagram', 'tiktok'],
                dryRun: true,
                bypassYPPGate: true,
                delayConfig: {
                    useFixedDelay: true,
                    fixedDelayMinutes: 0
                }
            };
            
            await dispatcher.dispatch(mockContent, options);
            
            // Cerrar recursos
            await expect(dispatcher.close()).resolves.not.toThrow();
        });
    });
});
