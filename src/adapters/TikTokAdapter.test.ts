/**
 * TikTokAdapter.test.ts
 * 
 * Tests unitarios para TikTokAdapter.
 * Verifica la adaptación de videos de YouTube a formato TikTok.
 * 
 * REQ-3.2.1: Crear TikTokAdapter.ts con especificaciones de la plataforma
 * REQ-3.2.2: Recorte a 15 segundos óptimo (vs 30s de Reels)
 * REQ-3.2.3: Hook ultra-agresivo de 0.5 segundos (vs 3s de YouTube)
 * REQ-3.2.4: Ritmo de cortes cada 1.5 segundos (vs típico 2-8s)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    TikTokAdapter,
    TikTokConfig,
    TikTokOutput,
    TIKTOK_SPECS,
    SegmentSelectionResult,
    SegmentSelectionOptions,
    SegmentSelectionStrategy,
    SubtitleStyleConfig,
    SubtitleValidationResult
} from './TikTokAdapter';

// ===== CONSTANTES DE TEST =====

const TEST_DIR = path.join(process.cwd(), 'content', 'test-tiktok-adapter');
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures');
const OUTPUT_DIR = path.join(TEST_DIR, 'output');

// ===== SETUP Y TEARDOWN =====

describe('TikTokAdapter', () => {
    beforeAll(() => {
        // Crear directorios de test si no existen
        if (!fs.existsSync(TEST_DIR)) {
            fs.mkdirSync(TEST_DIR, { recursive: true });
        }
        if (!fs.existsSync(FIXTURES_DIR)) {
            fs.mkdirSync(FIXTURES_DIR, { recursive: true });
        }
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
    });

    afterAll(() => {
        // Limpiar directorio de test
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        // Limpiar directorio de output antes de cada test
        if (fs.existsSync(OUTPUT_DIR)) {
            const files = fs.readdirSync(OUTPUT_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(OUTPUT_DIR, file));
            }
        }
    });

    // ===== TESTS DE INTERFACES Y CONSTANTES =====

    describe('TIKTOK_SPECS', () => {
        it('debe tener duración óptima de 15 segundos (REQ-3.2.2)', () => {
            expect(TIKTOK_SPECS.optimalDuration).toBe(15);
        });

        it('debe tener duración máxima de 60 segundos', () => {
            expect(TIKTOK_SPECS.maxDuration).toBe(60);
        });

        it('debe tener resolución vertical 1080x1920', () => {
            expect(TIKTOK_SPECS.resolution.width).toBe(1080);
            expect(TIKTOK_SPECS.resolution.height).toBe(1920);
        });

        it('debe tener aspect ratio 9:16', () => {
            expect(TIKTOK_SPECS.aspectRatio).toBeCloseTo(9 / 16, 5);
        });

        it('debe tener hook ultra-agresivo de 0.5 segundos (REQ-3.2.3)', () => {
            expect(TIKTOK_SPECS.hook.durationSeconds).toBe(0.5);
            expect(TIKTOK_SPECS.hook.importance).toBe('CRITICAL');
        });

        it('debe tener ritmo de cortes de 1.5 segundos (REQ-3.2.4)', () => {
            expect(TIKTOK_SPECS.cutRhythm.intervalSeconds).toBe(1.5);
            expect(TIKTOK_SPECS.cutRhythm.variationSeconds).toBe(0.3);
        });

        it('debe tener color pop más intenso que Reels: saturación +25%, contraste +12%', () => {
            expect(TIKTOK_SPECS.defaultColorPop.saturationBoost).toBe(1.25);
            expect(TIKTOK_SPECS.defaultColorPop.contrastBoost).toBe(1.12);
        });

        it('debe tener zoom dinámico más agresivo que Reels', () => {
            expect(TIKTOK_SPECS.defaultDynamicZoom.maxZoom).toBe(1.08);
            // Reels usa 1.05, TikTok usa 1.08
            expect(TIKTOK_SPECS.defaultDynamicZoom.maxZoom).toBeGreaterThan(1.05);
        });

        it('debe extraer cover frame más temprano que Reels', () => {
            expect(TIKTOK_SPECS.defaultCover.defaultFrameTime).toBe(0.25);
            // Reels usa 1s, TikTok usa 0.25s
            expect(TIKTOK_SPECS.defaultCover.defaultFrameTime).toBeLessThan(1);
        });
    });

    // ===== TESTS DE CONFIGURACIÓN POR DEFECTO =====

    describe('getDefaultConfig', () => {
        it('debe generar configuración con valores por defecto correctos', () => {
            const inputPath = '/path/to/video.mp4';
            const config = TikTokAdapter.getDefaultConfig(inputPath);

            expect(config.inputVideoPath).toBe(inputPath);
            expect(config.maxDurationSeconds).toBe(TIKTOK_SPECS.optimalDuration);
            expect(config.startTimeSeconds).toBe(0);
        });

        it('debe incluir color pop con valores más intensos que Reels', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.colorPop.saturationBoost).toBe(1.25);
            expect(config.colorPop.contrastBoost).toBe(1.12);
        });

        it('debe tener subtítulos habilitados con estilo glow por defecto', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.subtitles.enabled).toBe(true);
            expect(config.subtitles.style).toBe('glow');
        });

        it('debe configurar hook ultra-agresivo de 0.5s (REQ-3.2.3)', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.hook.durationSeconds).toBe(0.5);
            expect(config.hook.applyImpactEffect).toBe(true);
            expect(config.hook.zoomBurst).toBe(true);
        });

        it('debe configurar ritmo de cortes de 1.5s (REQ-3.2.4)', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.cutRhythm.intervalSeconds).toBe(1.5);
            expect(config.cutRhythm.variationSeconds).toBe(0.3);
        });

        it('debe tener zoom dinámico deshabilitado por defecto', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.dynamicZoom.enabled).toBe(false);
        });

        it('debe generar cover por defecto con frame time temprano', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');

            expect(config.cover.generateCover).toBe(true);
            expect(config.cover.coverFrameTime).toBe(0.25);
        });
    });

    // ===== TESTS DE CONSTRUCCIÓN DE FILTROS =====

    describe('buildColorPopFilter', () => {
        it('debe construir filtro de color pop con valores especificados', () => {
            const filter = TikTokAdapter.buildColorPopFilter(1.25, 1.12);
            
            expect(filter).toContain('eq=saturation=');
            expect(filter).toContain('contrast=');
        });

        it('debe formatear valores con 3 decimales', () => {
            const filter = TikTokAdapter.buildColorPopFilter(1.25, 1.12);
            
            expect(filter).toBe('eq=saturation=1.250:contrast=1.120');
        });

        it('debe manejar valores extremos correctamente', () => {
            const filterHigh = TikTokAdapter.buildColorPopFilter(2.0, 1.5);
            const filterLow = TikTokAdapter.buildColorPopFilter(0.5, 0.8);

            expect(filterHigh).toBe('eq=saturation=2.000:contrast=1.500');
            expect(filterLow).toBe('eq=saturation=0.500:contrast=0.800');
        });

        it('debe producir filtro FFmpeg válido', () => {
            const filter = TikTokAdapter.buildColorPopFilter(1.25, 1.12);
            
            expect(filter).toMatch(/^eq=saturation=[\d.]+:contrast=[\d.]+$/);
        });
    });

    describe('buildTrimParams', () => {
        it('debe retornar parámetros de recorte correctos', () => {
            const params = TikTokAdapter.buildTrimParams(5, 15);
            
            expect(params.startTime).toBe(5);
            expect(params.duration).toBe(15);
        });

        it('debe manejar inicio en 0', () => {
            const params = TikTokAdapter.buildTrimParams(0, 15);
            
            expect(params.startTime).toBe(0);
            expect(params.duration).toBe(15);
        });
    });

    describe('buildSubtitleFilter', () => {
        it('debe construir filtro para archivos .ass', () => {
            const filter = TikTokAdapter.buildSubtitleFilter('/path/to/subs.ass');
            
            expect(filter).toContain('ass=');
        });

        it('debe construir filtro para archivos .srt', () => {
            const filter = TikTokAdapter.buildSubtitleFilter('/path/to/subs.srt');
            
            expect(filter).toContain('subtitles=');
        });

        it('debe escapar caracteres especiales en la ruta', () => {
            const filterWindows = TikTokAdapter.buildSubtitleFilter('C:/path/to/subs.ass');
            
            expect(filterWindows).toContain('\\:');
        });
    });

    describe('buildDynamicZoomFilter', () => {
        it('debe construir filtro de zoom dinámico', () => {
            const filter = TikTokAdapter.buildDynamicZoomFilter(1.0, 1.08, 15);
            
            expect(filter).toContain('zoompan');
            expect(filter).toContain('1080x1920');
        });

        it('debe incluir expresión de zoom basada en tiempo', () => {
            const filter = TikTokAdapter.buildDynamicZoomFilter(1.0, 1.08, 15);
            
            expect(filter).toContain('t/');
        });
    });

    describe('buildCompleteFilter', () => {
        it('debe incluir scale a resolución de TikTok', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('scale=1080:1920');
        });

        it('debe incluir filtro de color pop', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('eq=saturation=');
            expect(filter).toContain('contrast=');
        });

        it('debe incluir subtítulos si están habilitados y hay archivo', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.subtitles.subtitlePath = '/path/to/subs.ass';
            
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('ass=');
        });

        it('NO debe incluir subtítulos si no hay archivo', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).not.toContain('ass=');
            expect(filter).not.toContain('subtitles=');
        });

        it('debe incluir formato yuv420p para compatibilidad', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('format=yuv420p');
        });

        it('debe usar flags lanczos para escalado de alta calidad', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            const filter = TikTokAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('flags=lanczos');
        });
    });

    // ===== TESTS DE GENERACIÓN DE COVER =====

    describe('generateCoverPath', () => {
        it('debe generar ruta de cover con sufijo _tiktok_cover.jpg', () => {
            const videoPath = '/path/to/video.mp4';
            const coverPath = TikTokAdapter.generateCoverPath(videoPath);
            
            expect(coverPath).toContain('video_tiktok_cover.jpg');
            expect(coverPath.endsWith('video_tiktok_cover.jpg')).toBe(true);
        });

        it('debe manejar diferentes extensiones de video', () => {
            const coverWebm = TikTokAdapter.generateCoverPath('/path/video.webm');
            const coverMov = TikTokAdapter.generateCoverPath('/path/video.mov');
            
            expect(coverWebm).toContain('video_tiktok_cover.jpg');
            expect(coverMov).toContain('video_tiktok_cover.jpg');
        });

        it('debe soportar formato PNG', () => {
            const coverPath = TikTokAdapter.generateCoverPath('/path/video.mp4', 'png');
            
            expect(coverPath).toContain('video_tiktok_cover.png');
        });
    });

    // ===== TESTS DE VALIDACIÓN =====

    describe('Validación de configuración', () => {
        it('debe rechazar duración máxima <= 0', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.maxDurationSeconds = 0;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('La duración máxima debe ser mayor que 0');
        });

        it('debe rechazar duración mayor a 60 segundos para TikTok', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.maxDurationSeconds = 61;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('La duración máxima no puede exceder 60 segundos');
        });

        it('debe rechazar tiempo de inicio negativo', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.startTimeSeconds = -1;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('El tiempo de inicio no puede ser negativo');
        });

        it('debe rechazar saturación negativa', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.colorPop.saturationBoost = -1;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('El boost de saturación no puede ser negativo');
        });

        it('debe rechazar zoom mínimo > zoom máximo', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.dynamicZoom.enabled = true;
            config.dynamicZoom.minZoom = 1.10;
            config.dynamicZoom.maxZoom = 1.05;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('El zoom mínimo no puede ser mayor que el zoom máximo');
        });

        it('debe rechazar duración de hook negativa', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.hook.durationSeconds = -1;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('La duración del hook no puede ser negativa');
        });

        it('debe rechazar intervalo de cortes <= 0', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.cutRhythm.intervalSeconds = 0;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('El intervalo de cortes debe ser mayor que 0');
        });

        it('debe rechazar ruta de entrada vacía', async () => {
            const config = TikTokAdapter.getDefaultConfig('');
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('La ruta del video de entrada no puede estar vacía');
        });

        it('debe rechazar estilo de subtítulos inválido', async () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            // @ts-expect-error - Probando valor inválido
            config.subtitles.style = 'invalid';
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('Estilo de subtítulos');
        });

        it('debe rechazar archivo de entrada que no existe', async () => {
            const config = TikTokAdapter.getDefaultConfig('/nonexistent/video.mp4');
            config.subtitles.enabled = false;
            
            await expect(
                TikTokAdapter.adaptVideoForTikTok(config, '/output.mp4')
            ).rejects.toThrow('Video fuente no encontrado');
        });
    });

    // ===== TESTS DE COMANDO FFmpeg =====

    describe('getFFmpegCommand', () => {
        it('debe generar comando FFmpeg válido', () => {
            const config = TikTokAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = TikTokAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('ffmpeg');
            expect(command).toContain('-i');
            expect(command).toContain('-vf');
        });

        it('debe incluir parámetros de recorte si startTime > 0', () => {
            const config = TikTokAdapter.getDefaultConfig('/path/to/video.mp4');
            config.startTimeSeconds = 5;
            
            const command = TikTokAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-ss');
            expect(command).toContain('5');
        });

        it('debe incluir duración máxima de 15s por defecto', () => {
            const config = TikTokAdapter.getDefaultConfig('/path/to/video.mp4');
            
            const command = TikTokAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-t');
            expect(command).toContain('15');
        });

        it('debe incluir codec de video libx264', () => {
            const config = TikTokAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = TikTokAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('libx264');
        });

        it('debe incluir -movflags +faststart para streaming', () => {
            const config = TikTokAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = TikTokAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-movflags');
            expect(command).toContain('+faststart');
        });
    });

    // ===== TESTS DE ESPECIFICACIONES REQ-3.2.x =====

    describe('REQ-3.2.1: Crear TikTokAdapter.ts', () => {
        it('debe exportar la clase TikTokAdapter', () => {
            expect(TikTokAdapter).toBeDefined();
            expect(typeof TikTokAdapter.adaptVideoForTikTok).toBe('function');
        });

        it('debe exportar interfaces TikTokConfig y TikTokOutput', () => {
            const config: TikTokConfig = TikTokAdapter.getDefaultConfig('/video.mp4');
            expect(config).toBeDefined();
            expect(config.inputVideoPath).toBeDefined();
        });

        it('debe exportar TIKTOK_SPECS con especificaciones de plataforma', () => {
            expect(TIKTOK_SPECS).toBeDefined();
            expect(TIKTOK_SPECS.optimalDuration).toBeDefined();
            expect(TIKTOK_SPECS.resolution).toBeDefined();
        });
    });

    describe('REQ-3.2.2: Recorte a 15 segundos óptimo', () => {
        it('debe configurar duración por defecto a 15 segundos', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.maxDurationSeconds).toBe(15);
        });

        it('debe permitir especificar punto de inicio para recorte', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.startTimeSeconds = 10;
            
            expect(config.startTimeSeconds).toBe(10);
        });

        it('buildTrimParams debe retornar parámetros de recorte para 15s', () => {
            const params = TikTokAdapter.buildTrimParams(0, 15);
            
            expect(params.startTime).toBe(0);
            expect(params.duration).toBe(15);
        });
    });

    describe('REQ-3.2.3: Hook ultra-agresivo de 0.5 segundos', () => {
        it('debe configurar hook de 0.5 segundos por defecto', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.hook.durationSeconds).toBe(0.5);
        });

        it('TIKTOK_SPECS debe definir hook como CRITICAL', () => {
            expect(TIKTOK_SPECS.hook.importance).toBe('CRITICAL');
        });

        it('selectOptimalSegment debe priorizar hook (siempre inicio)', () => {
            const result = TikTokAdapter.selectOptimalSegment(60);
            
            // TikTok SIEMPRE usa inicio por hook
            expect(result.startTimeSeconds).toBe(0);
            expect(result.strategy).toBe('ultra-hook-priority');
        });
    });

    describe('REQ-3.2.4: Ritmo de cortes cada 1.5 segundos', () => {
        it('debe configurar intervalo de cortes de 1.5s por defecto', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.cutRhythm.intervalSeconds).toBe(1.5);
        });

        it('TIKTOK_SPECS debe definir ritmo de 1.5s', () => {
            expect(TIKTOK_SPECS.cutRhythm.intervalSeconds).toBe(1.5);
        });

        it('debe permitir variación de ±0.3s en el ritmo', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.cutRhythm.variationSeconds).toBe(0.3);
        });
    });

    // ===== TESTS DE SELECCIÓN DE SEGMENTO ÓPTIMO (REQ-3.2.2) =====

    describe('selectOptimalSegment', () => {
        describe('Videos cortos (≤15s) - Estrategia full-video', () => {
            it('debe usar video completo cuando duración es exactamente 15s', () => {
                const result = TikTokAdapter.selectOptimalSegment(15);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(15);
                expect(result.strategy).toBe('full-video');
                expect(result.reason).toContain('corto');
            });

            it('debe usar video completo cuando duración es menor a 15s', () => {
                const result = TikTokAdapter.selectOptimalSegment(10);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(10);
                expect(result.strategy).toBe('full-video');
            });

            it('debe usar video completo cuando duración es muy corta (3s)', () => {
                const result = TikTokAdapter.selectOptimalSegment(3);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(3);
                expect(result.strategy).toBe('full-video');
            });
        });

        describe('Videos más largos - Estrategia ultra-hook-priority', () => {
            it('debe priorizar hook ultra-agresivo para video de 30s', () => {
                const result = TikTokAdapter.selectOptimalSegment(30);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(15);
                expect(result.strategy).toBe('ultra-hook-priority');
            });

            it('debe priorizar hook para video de 60s', () => {
                const result = TikTokAdapter.selectOptimalSegment(60);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(15);
                expect(result.strategy).toBe('ultra-hook-priority');
            });

            it('debe priorizar hook para video largo de 120s', () => {
                const result = TikTokAdapter.selectOptimalSegment(120);
                
                // TikTok SIEMPRE empieza desde el inicio
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(15);
                expect(result.strategy).toBe('ultra-hook-priority');
            });

            it('NUNCA debe saltarse el inicio como Reels', () => {
                // A diferencia de Reels que puede usar offset de 2s,
                // TikTok SIEMPRE empieza en 0
                const durations = [20, 30, 60, 120, 300];
                for (const duration of durations) {
                    const result = TikTokAdapter.selectOptimalSegment(duration);
                    expect(result.startTimeSeconds).toBe(0);
                }
            });
        });

        describe('Duración objetivo personalizada', () => {
            it('debe respetar duración objetivo de 10s', () => {
                const result = TikTokAdapter.selectOptimalSegment(60, 10);
                
                expect(result.durationSeconds).toBe(10);
            });

            it('debe ajustar duración si video es más corto que objetivo', () => {
                const result = TikTokAdapter.selectOptimalSegment(10, 15);
                
                expect(result.durationSeconds).toBe(10);
                expect(result.strategy).toBe('full-video');
            });
        });

        describe('Validación de entrada', () => {
            it('debe rechazar duración de video <= 0', () => {
                expect(() => TikTokAdapter.selectOptimalSegment(0)).toThrow(
                    'La duración del video debe ser mayor que 0'
                );
            });

            it('debe rechazar duración de video negativa', () => {
                expect(() => TikTokAdapter.selectOptimalSegment(-10)).toThrow(
                    'La duración del video debe ser mayor que 0'
                );
            });

            it('debe rechazar duración objetivo <= 0', () => {
                expect(() => TikTokAdapter.selectOptimalSegment(60, 0)).toThrow(
                    'La duración objetivo debe ser mayor que 0'
                );
            });
        });

        describe('Garantías de resultado', () => {
            it('el startTime siempre debe ser 0 para TikTok', () => {
                const durations = [5, 10, 15, 30, 60, 120, 300];
                for (const duration of durations) {
                    const result = TikTokAdapter.selectOptimalSegment(duration);
                    // TikTok siempre empieza desde 0 por el hook
                    expect(result.startTimeSeconds).toBe(0);
                }
            });

            it('startTime + duration nunca debe exceder la duración del video', () => {
                const durations = [5, 10, 15, 30, 60, 120, 300];
                for (const duration of durations) {
                    const result = TikTokAdapter.selectOptimalSegment(duration);
                    expect(result.startTimeSeconds + result.durationSeconds).toBeLessThanOrEqual(duration);
                }
            });
        });
    });

    // ===== TESTS DE SELECCIÓN AVANZADA =====

    describe('selectOptimalSegmentAdvanced', () => {
        it('debe preservar hook por defecto', () => {
            const result = TikTokAdapter.selectOptimalSegmentAdvanced(60);
            
            expect(result.startTimeSeconds).toBe(0);
            expect(result.strategy).toBe('ultra-hook-priority');
        });

        it('debe permitir selección de segmento central (no recomendado)', () => {
            const result = TikTokAdapter.selectOptimalSegmentAdvanced(60, {
                preferredPosition: 'middle'
            });
            
            expect(result.strategy).toBe('smart-selection');
            expect(result.reason).toContain('no recomendado');
        });

        it('debe permitir selección de segmento final (no recomendado)', () => {
            const result = TikTokAdapter.selectOptimalSegmentAdvanced(60, {
                preferredPosition: 'end'
            });
            
            expect(result.strategy).toBe('smart-selection');
            expect(result.reason).toContain('no recomendado');
        });

        it('debe usar video completo si es corto', () => {
            const result = TikTokAdapter.selectOptimalSegmentAdvanced(10, {
                targetDuration: 15
            });
            
            expect(result.strategy).toBe('full-video');
            expect(result.durationSeconds).toBe(10);
        });
    });

    // ===== TESTS DE SUBTÍTULOS =====

    describe('SUBTITLE_STYLES', () => {
        it('debe tener estilo bold con fuente más grande', () => {
            const style = TikTokAdapter.getSubtitleStyleConfig('bold');
            
            expect(style.fontName).toBe('Arial Black');
            expect(style.fontSize).toBe(26);  // Mayor que Reels (24)
        });

        it('debe tener estilo glow con color magenta para TikTok', () => {
            const style = TikTokAdapter.getSubtitleStyleConfig('glow');
            
            expect(style.fontName).toBe('Impact');
            expect(style.outlineColor).toBe('&HFF00FF');  // Magenta
        });

        it('debe tener estilo minimal disponible', () => {
            const style = TikTokAdapter.getSubtitleStyleConfig('minimal');
            
            expect(style).toBeDefined();
            expect(style.fontName).toBe('Montserrat');
        });
    });

    describe('recommendSubtitleStyle', () => {
        it('debe recomendar glow para contenido trending', () => {
            const recommendation = TikTokAdapter.recommendSubtitleStyle('trending');
            
            expect(recommendation.style).toBe('glow');
        });

        it('debe recomendar glow como default para TikTok', () => {
            const recommendation = TikTokAdapter.recommendSubtitleStyle('default');
            
            expect(recommendation.style).toBe('glow');
        });

        it('debe recomendar bold para contenido educativo', () => {
            const recommendation = TikTokAdapter.recommendSubtitleStyle('educational');
            
            expect(recommendation.style).toBe('bold');
        });
    });

    describe('validateSubtitlesRequired', () => {
        it('debe dar warning (no error) si subtítulos deshabilitados', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.subtitles.enabled = false;
            
            const result = TikTokAdapter.validateSubtitlesRequired(config);
            
            // TikTok es más tolerante que Reels
            expect(result.valid).toBe(true);
            expect(result.warning).toBeDefined();
        });

        it('debe dar warning si no hay archivo de subtítulos', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            config.subtitles.subtitlePath = undefined;
            
            const result = TikTokAdapter.validateSubtitlesRequired(config);
            
            expect(result.valid).toBe(true);
            expect(result.warning).toBeDefined();
        });
    });

    // ===== COMPARACIÓN CON REELS =====

    describe('Comparación TikTok vs Reels', () => {
        it('TikTok debe tener duración óptima menor que Reels (15s vs 30s)', () => {
            expect(TIKTOK_SPECS.optimalDuration).toBeLessThan(30);
            expect(TIKTOK_SPECS.optimalDuration).toBe(15);
        });

        it('TikTok debe tener hook más corto que YouTube (0.5s vs 3s)', () => {
            expect(TIKTOK_SPECS.hook.durationSeconds).toBe(0.5);
            expect(TIKTOK_SPECS.hook.durationSeconds).toBeLessThan(3);
        });

        it('TikTok debe tener color pop más intenso que Reels', () => {
            // Reels: +20% saturación, +10% contraste
            // TikTok: +25% saturación, +12% contraste
            expect(TIKTOK_SPECS.defaultColorPop.saturationBoost).toBeGreaterThan(1.20);
            expect(TIKTOK_SPECS.defaultColorPop.contrastBoost).toBeGreaterThan(1.10);
        });

        it('TikTok debe usar estilo glow por defecto (vs bold de Reels)', () => {
            const config = TikTokAdapter.getDefaultConfig('/video.mp4');
            expect(config.subtitles.style).toBe('glow');
        });

        it('TikTok debe tener ritmo de cortes más rápido (1.5s vs típico 2-8s)', () => {
            expect(TIKTOK_SPECS.cutRhythm.intervalSeconds).toBe(1.5);
            expect(TIKTOK_SPECS.cutRhythm.intervalSeconds).toBeLessThan(2);
        });
    });
});
