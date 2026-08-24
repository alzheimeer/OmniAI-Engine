/**
 * ReelsAdapter.test.ts
 * 
 * Tests unitarios para ReelsAdapter.
 * Verifica la adaptación de videos de YouTube a formato Instagram Reels.
 * 
 * REQ-3.1.1: Crear ReelsAdapter.ts que adapte contenido de YouTube Shorts
 * REQ-3.1.2: Recorte a 30 segundos óptimo con selección inteligente
 * REQ-3.1.3: Forzar subtítulos animados (85% audiencia sin sonido)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    ReelsAdapter,
    ReelsConfig,
    ReelsOutput,
    REELS_SPECS,
    SegmentSelectionResult,
    SegmentSelectionOptions,
    SegmentSelectionStrategy,
    SubtitleStyleConfig,
    SubtitleValidationResult
} from './ReelsAdapter';

// ===== CONSTANTES DE TEST =====

const TEST_DIR = path.join(process.cwd(), 'content', 'test-reels-adapter');
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures');
const OUTPUT_DIR = path.join(TEST_DIR, 'output');

// ===== SETUP Y TEARDOWN =====

describe('ReelsAdapter', () => {
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

    describe('REELS_SPECS', () => {
        it('debe tener duración óptima de 30 segundos', () => {
            expect(REELS_SPECS.optimalDuration).toBe(30);
        });

        it('debe tener duración máxima de 90 segundos', () => {
            expect(REELS_SPECS.maxDuration).toBe(90);
        });

        it('debe tener resolución vertical 1080x1920', () => {
            expect(REELS_SPECS.resolution.width).toBe(1080);
            expect(REELS_SPECS.resolution.height).toBe(1920);
        });

        it('debe tener aspect ratio 9:16', () => {
            expect(REELS_SPECS.aspectRatio).toBeCloseTo(9 / 16, 5);
        });

        it('debe tener color pop por defecto: saturación +20%, contraste +10%', () => {
            expect(REELS_SPECS.defaultColorPop.saturationBoost).toBe(1.20);
            expect(REELS_SPECS.defaultColorPop.contrastBoost).toBe(1.10);
        });
    });

    // ===== TESTS DE CONFIGURACIÓN POR DEFECTO =====

    describe('getDefaultConfig', () => {
        it('debe generar configuración con valores por defecto correctos', () => {
            const inputPath = '/path/to/video.mp4';
            const config = ReelsAdapter.getDefaultConfig(inputPath);

            expect(config.inputVideoPath).toBe(inputPath);
            expect(config.maxDurationSeconds).toBe(REELS_SPECS.optimalDuration);
            expect(config.startTimeSeconds).toBe(0);
        });

        it('debe incluir color pop con valores por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');

            expect(config.colorPop.saturationBoost).toBe(1.20);
            expect(config.colorPop.contrastBoost).toBe(1.10);
        });

        it('debe tener subtítulos habilitados por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');

            expect(config.subtitles.enabled).toBe(true);
            expect(config.subtitles.style).toBe('bold');
        });

        it('debe tener zoom dinámico deshabilitado por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');

            expect(config.dynamicZoom.enabled).toBe(false);
        });

        it('debe generar cover por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');

            expect(config.cover.generateCover).toBe(true);
            expect(config.cover.coverFrameTime).toBe(1);
        });
    });

    // ===== TESTS DE CONSTRUCCIÓN DE FILTROS =====

    describe('buildColorPopFilter', () => {
        it('debe construir filtro de color pop con valores especificados', () => {
            const filter = ReelsAdapter.buildColorPopFilter(1.20, 1.10);
            
            expect(filter).toContain('eq=saturation=');
            expect(filter).toContain('contrast=');
        });

        it('debe formatear valores con 3 decimales', () => {
            const filter = ReelsAdapter.buildColorPopFilter(1.20, 1.10);
            
            expect(filter).toBe('eq=saturation=1.200:contrast=1.100');
        });

        it('debe manejar valores extremos correctamente', () => {
            const filterHigh = ReelsAdapter.buildColorPopFilter(2.0, 1.5);
            const filterLow = ReelsAdapter.buildColorPopFilter(0.5, 0.8);

            expect(filterHigh).toBe('eq=saturation=2.000:contrast=1.500');
            expect(filterLow).toBe('eq=saturation=0.500:contrast=0.800');
        });

        it('debe producir filtro FFmpeg válido', () => {
            const filter = ReelsAdapter.buildColorPopFilter(1.20, 1.10);
            
            // Verificar formato FFmpeg eq
            expect(filter).toMatch(/^eq=saturation=[\d.]+:contrast=[\d.]+$/);
        });
    });

    describe('buildTrimParams', () => {
        it('debe retornar parámetros de recorte correctos', () => {
            const params = ReelsAdapter.buildTrimParams(5, 30);
            
            expect(params.startTime).toBe(5);
            expect(params.duration).toBe(30);
        });

        it('debe manejar inicio en 0', () => {
            const params = ReelsAdapter.buildTrimParams(0, 30);
            
            expect(params.startTime).toBe(0);
            expect(params.duration).toBe(30);
        });
    });

    describe('buildSubtitleFilter', () => {
        it('debe construir filtro para archivos .ass', () => {
            const filter = ReelsAdapter.buildSubtitleFilter('/path/to/subs.ass');
            
            expect(filter).toContain('ass=');
        });

        it('debe construir filtro para archivos .srt', () => {
            const filter = ReelsAdapter.buildSubtitleFilter('/path/to/subs.srt');
            
            expect(filter).toContain('subtitles=');
        });

        it('debe escapar caracteres especiales en la ruta', () => {
            const filterWindows = ReelsAdapter.buildSubtitleFilter('C:/path/to/subs.ass');
            
            // Los : deben estar escapados
            expect(filterWindows).toContain('\\:');
        });

        it('debe convertir backslashes a forward slashes', () => {
            const filter = ReelsAdapter.buildSubtitleFilter('C:\\path\\to\\subs.ass');
            
            // Verificar que usa forward slashes
            expect(filter).not.toContain('\\\\');
        });
    });

    describe('buildDynamicZoomFilter', () => {
        it('debe construir filtro de zoom dinámico (STUB)', () => {
            const filter = ReelsAdapter.buildDynamicZoomFilter(1.0, 1.05, 30);
            
            expect(filter).toContain('zoompan');
            expect(filter).toContain('1080x1920');
        });

        it('debe incluir expresión de zoom basada en tiempo', () => {
            const filter = ReelsAdapter.buildDynamicZoomFilter(1.0, 1.05, 30);
            
            // La expresión debe contener referencia al tiempo (t)
            expect(filter).toContain('t/');
        });
    });

    describe('buildCompleteFilter', () => {
        it('debe incluir scale a resolución de Reels', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('scale=1080:1920');
        });

        it('debe incluir filtro de color pop', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('eq=saturation=');
            expect(filter).toContain('contrast=');
        });

        it('debe incluir subtítulos si están habilitados y hay archivo', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.subtitles.subtitlePath = '/path/to/subs.ass';
            
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('ass=');
        });

        it('NO debe incluir subtítulos si no hay archivo', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            // subtitlePath es undefined por defecto
            
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).not.toContain('ass=');
            expect(filter).not.toContain('subtitles=');
        });

        it('debe incluir formato yuv420p para compatibilidad', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('format=yuv420p');
        });

        it('debe usar flags lanczos para escalado de alta calidad', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('flags=lanczos');
        });
    });

    // ===== TESTS DE GENERACIÓN DE COVER =====

    describe('generateCoverPath', () => {
        it('debe generar ruta de cover con sufijo _cover.jpg', () => {
            const videoPath = '/path/to/video.mp4';
            const coverPath = ReelsAdapter.generateCoverPath(videoPath);
            
            // Verificar que termina con el nombre correcto (independiente del separador de ruta)
            expect(coverPath).toContain('video_reels_cover.jpg');
            expect(coverPath.endsWith('video_reels_cover.jpg')).toBe(true);
        });

        it('debe manejar diferentes extensiones de video', () => {
            const coverWebm = ReelsAdapter.generateCoverPath('/path/video.webm');
            const coverMov = ReelsAdapter.generateCoverPath('/path/video.mov');
            const coverAvi = ReelsAdapter.generateCoverPath('/path/video.avi');
            
            // Verificar que todos terminan con _reels_cover.jpg
            expect(coverWebm).toContain('video_reels_cover.jpg');
            expect(coverMov).toContain('video_reels_cover.jpg');
            expect(coverAvi).toContain('video_reels_cover.jpg');
        });

        it('debe manejar rutas de Windows', () => {
            const videoPath = 'C:\\Users\\test\\video.mp4';
            const coverPath = ReelsAdapter.generateCoverPath(videoPath);
            
            expect(coverPath).toContain('video_reels_cover.jpg');
        });
    });

    // ===== TESTS DE VALIDACIÓN =====

    describe('Validación de configuración', () => {
        it('debe rechazar duración máxima <= 0', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.maxDurationSeconds = 0;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('La duración máxima debe ser mayor que 0');
        });

        it('debe rechazar duración mayor a 90 segundos', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.maxDurationSeconds = 91;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('La duración máxima no puede exceder 90 segundos');
        });

        it('debe rechazar tiempo de inicio negativo', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.startTimeSeconds = -1;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('El tiempo de inicio no puede ser negativo');
        });

        it('debe rechazar saturación negativa', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.colorPop.saturationBoost = -1;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('El boost de saturación no puede ser negativo');
        });

        it('debe rechazar contraste negativo', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.colorPop.contrastBoost = -1;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('El boost de contraste no puede ser negativo');
        });

        it('debe rechazar zoom mínimo > zoom máximo', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.dynamicZoom.enabled = true;
            config.dynamicZoom.minZoom = 1.10;
            config.dynamicZoom.maxZoom = 1.05;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('El zoom mínimo no puede ser mayor que el zoom máximo');
        });

        it('debe rechazar ruta de entrada vacía', async () => {
            const config = ReelsAdapter.getDefaultConfig('');
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('La ruta del video de entrada no puede estar vacía');
        });

        it('debe rechazar estilo de subtítulos inválido', async () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            // @ts-expect-error - Probando valor inválido
            config.subtitles.style = 'invalid';
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('Estilo de subtítulos');
        });

        it('debe rechazar archivo de entrada que no existe', async () => {
            const config = ReelsAdapter.getDefaultConfig('/nonexistent/video.mp4');
            // Configurar subtítulos válidos para llegar a la validación del archivo de entrada
            const tempSubPath = path.join(TEST_DIR, 'temp_validate_subs.ass');
            if (!fs.existsSync(TEST_DIR)) {
                fs.mkdirSync(TEST_DIR, { recursive: true });
            }
            fs.writeFileSync(tempSubPath, '[Script Info]\nTitle: Test');
            config.subtitles.subtitlePath = tempSubPath;
            
            await expect(
                ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
            ).rejects.toThrow('Video fuente no encontrado');
        });
    });

    // ===== TESTS DE COMANDO FFmpeg =====

    describe('getFFmpegCommand', () => {
        it('debe generar comando FFmpeg válido', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('ffmpeg');
            expect(command).toContain('-i');
            expect(command).toContain('-vf');
        });

        it('debe incluir parámetros de recorte si startTime > 0', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            config.startTimeSeconds = 5;
            
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-ss');
            expect(command).toContain('5');
        });

        it('debe incluir duración máxima', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            config.maxDurationSeconds = 30;
            
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-t');
            expect(command).toContain('30');
        });

        it('debe incluir codec de video libx264', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('libx264');
        });

        it('debe incluir codec de audio aac', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('aac');
        });

        it('debe incluir -movflags +faststart para streaming', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-movflags');
            expect(command).toContain('+faststart');
        });

        it('debe incluir -y para sobrescribir', () => {
            const config = ReelsAdapter.getDefaultConfig('/path/to/video.mp4');
            const command = ReelsAdapter.getFFmpegCommand(config, '/path/to/output.mp4');
            
            expect(command).toContain('-y');
        });
    });

    // ===== TESTS DE ESPECIFICACIONES REQ-3.1.x =====

    describe('REQ-3.1.1: Crear ReelsAdapter.ts', () => {
        it('debe exportar la clase ReelsAdapter', () => {
            expect(ReelsAdapter).toBeDefined();
            expect(typeof ReelsAdapter.adaptVideoForReels).toBe('function');
        });

        it('debe exportar interfaces ReelsConfig y ReelsOutput', () => {
            // Las interfaces se validan implícitamente a través del uso
            const config: ReelsConfig = ReelsAdapter.getDefaultConfig('/video.mp4');
            expect(config).toBeDefined();
            expect(config.inputVideoPath).toBeDefined();
        });

        it('debe exportar REELS_SPECS con especificaciones de plataforma', () => {
            expect(REELS_SPECS).toBeDefined();
            expect(REELS_SPECS.optimalDuration).toBeDefined();
            expect(REELS_SPECS.resolution).toBeDefined();
        });
    });

    describe('REQ-3.1.2: Recorte a 30 segundos óptimo', () => {
        it('debe configurar duración por defecto a 30 segundos', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.maxDurationSeconds).toBe(30);
        });

        it('debe permitir especificar punto de inicio para recorte', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            config.startTimeSeconds = 10;
            
            expect(config.startTimeSeconds).toBe(10);
        });

        it('buildTrimParams debe retornar parámetros de recorte', () => {
            const params = ReelsAdapter.buildTrimParams(5, 30);
            
            expect(params.startTime).toBe(5);
            expect(params.duration).toBe(30);
        });
    });

    describe('REQ-3.1.3: Forzar subtítulos animados', () => {
        it('debe tener subtítulos habilitados por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.subtitles.enabled).toBe(true);
        });

        it('debe soportar estilo bold para subtítulos', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.subtitles.style).toBe('bold');
        });

        it('debe construir filtro de subtítulos correctamente', () => {
            const filter = ReelsAdapter.buildSubtitleFilter('/subs.ass');
            
            expect(filter).toBeDefined();
            expect(filter.length).toBeGreaterThan(0);
        });
    });

    describe('REQ-3.1.4: Color pop saturación +20%, contraste +10%', () => {
        it('debe tener saturación +20% (1.20) por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.colorPop.saturationBoost).toBe(1.20);
        });

        it('debe tener contraste +10% (1.10) por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.colorPop.contrastBoost).toBe(1.10);
        });

        it('debe generar filtro FFmpeg con valores correctos', () => {
            const filter = ReelsAdapter.buildColorPopFilter(1.20, 1.10);
            
            expect(filter).toBe('eq=saturation=1.200:contrast=1.100');
        });

        it('el filtro completo debe incluir color pop', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            const filter = ReelsAdapter.buildCompleteFilter(config);
            
            expect(filter).toContain('saturation=1.200');
            expect(filter).toContain('contrast=1.100');
        });
    });

    describe('REQ-3.1.6: Generar cover/thumbnail para Reels', () => {
        it('debe tener generación de cover habilitada por defecto', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.cover.generateCover).toBe(true);
        });

        it('debe usar segundo 1 por defecto para cover frame', () => {
            const config = ReelsAdapter.getDefaultConfig('/video.mp4');
            
            expect(config.cover.coverFrameTime).toBe(1);
        });

        it('debe generar ruta de cover correctamente', () => {
            const coverPath = ReelsAdapter.generateCoverPath('/path/video.mp4');
            
            // Verificar independiente del separador de ruta
            expect(coverPath).toContain('video_reels_cover.jpg');
            expect(coverPath.endsWith('video_reels_cover.jpg')).toBe(true);
        });
    });

    // ===== TESTS DE SELECCIÓN DE SEGMENTO ÓPTIMO (REQ-3.1.2) =====

    describe('selectOptimalSegment', () => {
        describe('Videos cortos (≤30s) - Estrategia full-video', () => {
            it('debe usar video completo cuando duración es exactamente 30s', () => {
                const result = ReelsAdapter.selectOptimalSegment(30);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('full-video');
                expect(result.reason).toContain('corto');
            });

            it('debe usar video completo cuando duración es menor a 30s', () => {
                const result = ReelsAdapter.selectOptimalSegment(25);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(25);
                expect(result.strategy).toBe('full-video');
            });

            it('debe usar video completo cuando duración es muy corta (5s)', () => {
                const result = ReelsAdapter.selectOptimalSegment(5);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(5);
                expect(result.strategy).toBe('full-video');
            });
        });

        describe('Videos medianos (30-60s) - Estrategia hook-priority', () => {
            it('debe priorizar hook inicial para video de 45s', () => {
                const result = ReelsAdapter.selectOptimalSegment(45);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('hook-priority');
                expect(result.reason).toContain('mediano');
            });

            it('debe priorizar hook inicial para video de 60s', () => {
                const result = ReelsAdapter.selectOptimalSegment(60);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('hook-priority');
            });

            it('debe priorizar hook para video ligeramente mayor a 30s', () => {
                const result = ReelsAdapter.selectOptimalSegment(35);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('hook-priority');
            });
        });

        describe('Videos largos (>60s) - Estrategia smart-selection', () => {
            it('debe aplicar selección inteligente para video de 90s', () => {
                const result = ReelsAdapter.selectOptimalSegment(90);
                
                expect(result.startTimeSeconds).toBeGreaterThanOrEqual(0);
                expect(result.startTimeSeconds).toBeLessThanOrEqual(2);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('smart-selection');
                expect(result.reason).toContain('largo');
            });

            it('debe aplicar selección inteligente para video de 120s', () => {
                const result = ReelsAdapter.selectOptimalSegment(120);
                
                expect(result.startTimeSeconds).toBeGreaterThanOrEqual(0);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('smart-selection');
            });

            it('debe aplicar selección inteligente para video muy largo (300s)', () => {
                const result = ReelsAdapter.selectOptimalSegment(300);
                
                // Para videos muy largos, debe aplicar pequeño offset
                expect(result.startTimeSeconds).toBeGreaterThanOrEqual(0);
                expect(result.startTimeSeconds).toBeLessThanOrEqual(2);
                expect(result.durationSeconds).toBe(30);
                expect(result.strategy).toBe('smart-selection');
            });
        });

        describe('Duración objetivo personalizada', () => {
            it('debe respetar duración objetivo de 15s', () => {
                const result = ReelsAdapter.selectOptimalSegment(60, 15);
                
                expect(result.durationSeconds).toBe(15);
            });

            it('debe respetar duración objetivo de 60s', () => {
                const result = ReelsAdapter.selectOptimalSegment(120, 60);
                
                expect(result.durationSeconds).toBe(60);
            });

            it('debe ajustar duración si video es más corto que objetivo', () => {
                const result = ReelsAdapter.selectOptimalSegment(20, 30);
                
                expect(result.durationSeconds).toBe(20);
                expect(result.strategy).toBe('full-video');
            });
        });

        describe('Validación de entrada', () => {
            it('debe rechazar duración de video <= 0', () => {
                expect(() => ReelsAdapter.selectOptimalSegment(0)).toThrow(
                    'La duración del video debe ser mayor que 0'
                );
            });

            it('debe rechazar duración de video negativa', () => {
                expect(() => ReelsAdapter.selectOptimalSegment(-10)).toThrow(
                    'La duración del video debe ser mayor que 0'
                );
            });

            it('debe rechazar duración objetivo <= 0', () => {
                expect(() => ReelsAdapter.selectOptimalSegment(60, 0)).toThrow(
                    'La duración objetivo debe ser mayor que 0'
                );
            });

            it('debe rechazar duración objetivo negativa', () => {
                expect(() => ReelsAdapter.selectOptimalSegment(60, -5)).toThrow(
                    'La duración objetivo debe ser mayor que 0'
                );
            });
        });

        describe('Garantías de resultado', () => {
            it('el startTime nunca debe ser negativo', () => {
                const durations = [5, 10, 25, 30, 45, 60, 90, 120, 300, 600];
                for (const duration of durations) {
                    const result = ReelsAdapter.selectOptimalSegment(duration);
                    expect(result.startTimeSeconds).toBeGreaterThanOrEqual(0);
                }
            });

            it('startTime + duration nunca debe exceder la duración del video', () => {
                const durations = [5, 10, 25, 30, 45, 60, 90, 120, 300, 600];
                for (const duration of durations) {
                    const result = ReelsAdapter.selectOptimalSegment(duration);
                    expect(result.startTimeSeconds + result.durationSeconds).toBeLessThanOrEqual(duration);
                }
            });

            it('siempre debe retornar un objeto válido con todas las propiedades', () => {
                const result = ReelsAdapter.selectOptimalSegment(60);
                
                expect(result).toHaveProperty('startTimeSeconds');
                expect(result).toHaveProperty('durationSeconds');
                expect(result).toHaveProperty('strategy');
                expect(result).toHaveProperty('reason');
                expect(typeof result.startTimeSeconds).toBe('number');
                expect(typeof result.durationSeconds).toBe('number');
                expect(typeof result.strategy).toBe('string');
                expect(typeof result.reason).toBe('string');
            });
        });
    });

    describe('selectOptimalSegmentAdvanced', () => {
        describe('Posición preferida: start (por defecto)', () => {
            it('debe preservar hook inicial por defecto', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(90);
                
                expect(result.startTimeSeconds).toBe(0);
                expect(result.strategy).toBe('hook-priority');
            });

            it('debe aplicar offset cuando preserveHook es false', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(90, {
                    preserveHook: false,
                    avoidExactZeroStart: true
                });
                
                expect(result.startTimeSeconds).toBe(2);
                expect(result.strategy).toBe('smart-selection');
            });
        });

        describe('Posición preferida: middle', () => {
            it('debe seleccionar segmento central', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(120, {
                    preferredPosition: 'middle'
                });
                
                // Para video de 120s, el punto medio es 60s
                // El segmento de 30s debería empezar en 60 - 15 = 45s
                expect(result.startTimeSeconds).toBe(45);
                expect(result.strategy).toBe('smart-selection');
                expect(result.reason).toContain('central');
            });

            it('debe ajustar segmento central para video más corto', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(60, {
                    preferredPosition: 'middle'
                });
                
                // Para video de 60s, punto medio es 30s
                // Segmento de 30s empezaría en 30 - 15 = 15s
                expect(result.startTimeSeconds).toBe(15);
            });
        });

        describe('Posición preferida: end', () => {
            it('debe seleccionar segmento final', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(90, {
                    preferredPosition: 'end'
                });
                
                // Para video de 90s con duración objetivo 30s
                // Debería empezar en 90 - 30 = 60s
                expect(result.startTimeSeconds).toBe(60);
                expect(result.strategy).toBe('smart-selection');
                expect(result.reason).toContain('final');
            });

            it('debe ajustar segmento final para video corto', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(40, {
                    preferredPosition: 'end'
                });
                
                // Para video de 40s, debería empezar en 40 - 30 = 10s
                expect(result.startTimeSeconds).toBe(10);
            });
        });

        describe('Duración objetivo personalizada', () => {
            it('debe respetar targetDuration de 15s', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(60, {
                    targetDuration: 15
                });
                
                expect(result.durationSeconds).toBe(15);
            });

            it('debe ajustar para video más corto que targetDuration', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(20, {
                    targetDuration: 30
                });
                
                expect(result.durationSeconds).toBe(20);
                expect(result.strategy).toBe('full-video');
            });
        });

        describe('Validación de entrada', () => {
            it('debe rechazar duración de video <= 0', () => {
                expect(() => ReelsAdapter.selectOptimalSegmentAdvanced(0)).toThrow(
                    'La duración del video debe ser mayor que 0'
                );
            });

            it('debe rechazar targetDuration <= 0', () => {
                expect(() => ReelsAdapter.selectOptimalSegmentAdvanced(60, { targetDuration: 0 })).toThrow(
                    'La duración objetivo debe ser mayor que 0'
                );
            });
        });

        describe('Opciones por defecto', () => {
            it('debe usar 30s como targetDuration por defecto', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(60);
                
                expect(result.durationSeconds).toBe(30);
            });

            it('debe preservar hook por defecto', () => {
                const result = ReelsAdapter.selectOptimalSegmentAdvanced(90);
                
                expect(result.startTimeSeconds).toBe(0);
            });
        });
    });

    describe('REQ-3.1.2: Integración selectOptimalSegment con buildTrimParams', () => {
        it('debe poder usar resultado de selectOptimalSegment en buildTrimParams', () => {
            const segmentResult = ReelsAdapter.selectOptimalSegment(90);
            const trimParams = ReelsAdapter.buildTrimParams(
                segmentResult.startTimeSeconds,
                segmentResult.durationSeconds
            );
            
            expect(trimParams.startTime).toBe(segmentResult.startTimeSeconds);
            expect(trimParams.duration).toBe(segmentResult.durationSeconds);
        });

        it('flujo completo: video largo → selección → trim params', () => {
            // Simular video de YouTube de 2 minutos
            const videoDuration = 120;
            
            // 1. Seleccionar segmento óptimo
            const segment = ReelsAdapter.selectOptimalSegment(videoDuration);
            
            // 2. Construir parámetros de trim
            const trimParams = ReelsAdapter.buildTrimParams(
                segment.startTimeSeconds,
                segment.durationSeconds
            );
            
            // 3. Verificar que los parámetros son válidos
            expect(trimParams.startTime).toBeGreaterThanOrEqual(0);
            expect(trimParams.duration).toBe(30);
            expect(trimParams.startTime + trimParams.duration).toBeLessThanOrEqual(videoDuration);
        });
    });

    // ===== TESTS REQ-3.1.3: SUBTÍTULOS ANIMADOS OBLIGATORIOS =====

    describe('REQ-3.1.3: Forzar subtítulos animados (85% audiencia sin sonido)', () => {
        
        describe('SUBTITLE_STYLES - Estilos predefinidos', () => {
            it('debe definir estilo bold con valores correctos', () => {
                const boldStyle = ReelsAdapter.SUBTITLE_STYLES.bold;
                
                expect(boldStyle.fontName).toBe('Arial Black');
                expect(boldStyle.fontSize).toBe(24);
                expect(boldStyle.primaryColor).toBe('&HFFFFFF');
                expect(boldStyle.outlineColor).toBe('&H000000');
                expect(boldStyle.outlineWidth).toBe(3);
                expect(boldStyle.shadowOffset).toBe(2);
            });

            it('debe definir estilo glow con efecto blur', () => {
                const glowStyle = ReelsAdapter.SUBTITLE_STYLES.glow;
                
                expect(glowStyle.fontName).toBe('Impact');
                expect(glowStyle.fontSize).toBe(22);
                expect(glowStyle.outlineColor).toBe('&HFFFF00'); // Cyan en formato BGR (00FFFF → FFFF00)
                expect(glowStyle.outlineWidth).toBe(4);
                expect(glowStyle.effect).toBe('blur');
            });

            it('debe definir estilo minimal con valores sutiles', () => {
                const minimalStyle = ReelsAdapter.SUBTITLE_STYLES.minimal;
                
                expect(minimalStyle.fontName).toBe('Montserrat');
                expect(minimalStyle.fontSize).toBe(20);
                expect(minimalStyle.outlineWidth).toBe(1);
                expect(minimalStyle.shadowOffset).toBe(0);
            });

            it('todos los estilos deben tener color primario blanco', () => {
                const styles = ['bold', 'glow', 'minimal'] as const;
                
                for (const style of styles) {
                    expect(ReelsAdapter.SUBTITLE_STYLES[style].primaryColor).toBe('&HFFFFFF');
                }
            });
        });

        describe('buildStyledSubtitleFilter - Filtros estilizados', () => {
            it('debe construir filtro bold con force_style para archivo .ass', () => {
                const filter = ReelsAdapter.buildStyledSubtitleFilter('/path/subs.ass', 'bold');
                
                expect(filter).toContain("ass=");
                expect(filter).toContain("force_style=");
                expect(filter).toContain("FontName=Arial Black");
                expect(filter).toContain("FontSize=24");
                expect(filter).toContain("Bold=1");
                expect(filter).toContain("Alignment=2");
                expect(filter).toContain("MarginV=60");
            });

            it('debe construir filtro glow con BorderStyle=3 para efecto', () => {
                const filter = ReelsAdapter.buildStyledSubtitleFilter('/path/subs.ass', 'glow');
                
                expect(filter).toContain("FontName=Impact");
                expect(filter).toContain("OutlineColour=&HFFFF00"); // Cyan en formato BGR
                expect(filter).toContain("Outline=4");
                expect(filter).toContain("BorderStyle=3");
            });

            it('debe construir filtro minimal con borde sutil', () => {
                const filter = ReelsAdapter.buildStyledSubtitleFilter('/path/subs.ass', 'minimal');
                
                expect(filter).toContain("FontName=Montserrat");
                expect(filter).toContain("FontSize=20");
                expect(filter).toContain("Outline=1");
                expect(filter).toContain("Shadow=0");
            });

            it('debe usar filtro subtitles para archivos .srt', () => {
                const filter = ReelsAdapter.buildStyledSubtitleFilter('/path/subs.srt', 'bold');
                
                expect(filter).toContain("subtitles=");
                expect(filter).toContain("force_style=");
                expect(filter).not.toContain("ass=");
            });

            it('debe escapar caracteres especiales en rutas Windows', () => {
                const filter = ReelsAdapter.buildStyledSubtitleFilter('C:\\Users\\test\\subs.ass', 'bold');
                
                expect(filter).toContain("C\\:/Users/test/subs.ass");
            });

            it('todos los filtros deben incluir parámetros de posición', () => {
                const styles = ['bold', 'glow', 'minimal'] as const;
                
                for (const style of styles) {
                    const filter = ReelsAdapter.buildStyledSubtitleFilter('/subs.ass', style);
                    expect(filter).toContain("Alignment=2");
                    expect(filter).toContain("MarginV=60");
                }
            });
        });

        describe('validateSubtitlesRequired - Validación de subtítulos obligatorios', () => {
            let validConfig: ReelsConfig;

            beforeEach(() => {
                // Crear un archivo temporal de subtítulos para tests
                const tempSubPath = path.join(TEST_DIR, 'test_subs.ass');
                if (!fs.existsSync(TEST_DIR)) {
                    fs.mkdirSync(TEST_DIR, { recursive: true });
                }
                fs.writeFileSync(tempSubPath, '[Script Info]\nTitle: Test');
                
                validConfig = ReelsAdapter.getDefaultConfig('/video.mp4');
                validConfig.subtitles.subtitlePath = tempSubPath;
            });

            it('debe pasar validación con subtítulos configurados correctamente', () => {
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('debe fallar cuando subtitles.enabled es false', () => {
                validConfig.subtitles.enabled = false;
                
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(false);
                expect(result.error).toContain('SUBTÍTULOS OBLIGATORIOS');
                expect(result.error).toContain('85%');
                expect(result.recommendation).toBeDefined();
            });

            it('debe fallar cuando no hay subtitlePath', () => {
                validConfig.subtitles.subtitlePath = undefined;
                
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(false);
                expect(result.error).toContain('No se ha proporcionado archivo de subtítulos');
            });

            it('debe fallar cuando el archivo de subtítulos no existe', () => {
                validConfig.subtitles.subtitlePath = '/nonexistent/subs.ass';
                
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(false);
                expect(result.error).toContain('no existe');
            });

            it('debe advertir con extensión de archivo no estándar', () => {
                const oddSubPath = path.join(TEST_DIR, 'subs.txt');
                fs.writeFileSync(oddSubPath, 'test content');
                validConfig.subtitles.subtitlePath = oddSubPath;
                
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(true); // No es bloqueante
                expect(result.warning).toContain('no es estándar');
            });

            it('debe advertir cuando se usa .srt en lugar de .ass', () => {
                const srtSubPath = path.join(TEST_DIR, 'subs.srt');
                fs.writeFileSync(srtSubPath, '1\n00:00:00,000 --> 00:00:02,000\nTest');
                validConfig.subtitles.subtitlePath = srtSubPath;
                
                const result = ReelsAdapter.validateSubtitlesRequired(validConfig);
                
                expect(result.valid).toBe(true);
                expect(result.warning).toContain('.ASS');
            });
        });

        describe('enforceSubtitlesRequired - Validación estricta', () => {
            let validConfig: ReelsConfig;

            beforeEach(() => {
                const tempSubPath = path.join(TEST_DIR, 'enforce_test.ass');
                if (!fs.existsSync(TEST_DIR)) {
                    fs.mkdirSync(TEST_DIR, { recursive: true });
                }
                fs.writeFileSync(tempSubPath, '[Script Info]\nTitle: Test');
                
                validConfig = ReelsAdapter.getDefaultConfig('/video.mp4');
                validConfig.subtitles.subtitlePath = tempSubPath;
            });

            it('no debe lanzar error con configuración válida', () => {
                expect(() => {
                    ReelsAdapter.enforceSubtitlesRequired(validConfig);
                }).not.toThrow();
            });

            it('debe lanzar error cuando subtítulos están deshabilitados', () => {
                validConfig.subtitles.enabled = false;
                
                expect(() => {
                    ReelsAdapter.enforceSubtitlesRequired(validConfig);
                }).toThrow('SUBTÍTULOS OBLIGATORIOS');
            });

            it('debe lanzar error cuando no hay archivo de subtítulos', () => {
                validConfig.subtitles.subtitlePath = undefined;
                
                expect(() => {
                    ReelsAdapter.enforceSubtitlesRequired(validConfig);
                }).toThrow('No se ha proporcionado archivo de subtítulos');
            });

            it('debe lanzar error cuando el archivo no existe', () => {
                validConfig.subtitles.subtitlePath = '/nonexistent/file.ass';
                
                expect(() => {
                    ReelsAdapter.enforceSubtitlesRequired(validConfig);
                }).toThrow('no existe');
            });
        });

        describe('buildCompleteFilter - Integración con estilos', () => {
            it('debe usar buildStyledSubtitleFilter en filtro completo', () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.subtitlePath = '/path/to/subs.ass';
                config.subtitles.style = 'bold';
                
                const filter = ReelsAdapter.buildCompleteFilter(config);
                
                // Debe contener el filtro estilizado
                expect(filter).toContain("ass=");
                expect(filter).toContain("force_style=");
                expect(filter).toContain("FontName=Arial Black");
            });

            it('debe aplicar estilo glow correctamente en filtro completo', () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.subtitlePath = '/path/to/subs.ass';
                config.subtitles.style = 'glow';
                
                const filter = ReelsAdapter.buildCompleteFilter(config);
                
                expect(filter).toContain("FontName=Impact");
                expect(filter).toContain("BorderStyle=3");
            });

            it('debe aplicar estilo minimal correctamente en filtro completo', () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.subtitlePath = '/path/to/subs.srt';
                config.subtitles.style = 'minimal';
                
                const filter = ReelsAdapter.buildCompleteFilter(config);
                
                expect(filter).toContain("FontName=Montserrat");
                expect(filter).toContain("Outline=1");
            });
        });

        describe('adaptVideoForReels - Validación en pipeline', () => {
            it('debe rechazar adaptación sin subtítulos habilitados', async () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.enabled = false;
                
                await expect(
                    ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
                ).rejects.toThrow('SUBTÍTULOS OBLIGATORIOS');
            });

            it('debe rechazar adaptación sin archivo de subtítulos', async () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.subtitlePath = undefined;
                
                await expect(
                    ReelsAdapter.adaptVideoForReels(config, '/output.mp4')
                ).rejects.toThrow('No se ha proporcionado archivo de subtítulos');
            });

            it('mensaje de error debe mencionar el 85% de audiencia sin sonido', async () => {
                const config = ReelsAdapter.getDefaultConfig('/video.mp4');
                config.subtitles.enabled = false;
                
                try {
                    await ReelsAdapter.adaptVideoForReels(config, '/output.mp4');
                    // No debería llegar aquí
                    expect(true).toBe(false);
                } catch (error: any) {
                    expect(error.message).toContain('85%');
                    expect(error.message).toContain('SIN SONIDO');
                }
            });
        });
    });
});


    // ===== TESTS ADICIONALES REQ-3.1.3: MÉTODOS HELPER DE SUBTÍTULOS =====

    describe('REQ-3.1.3: Métodos helper de subtítulos', () => {
        
        describe('getSubtitleStyleConfig - Acceso programático a estilos', () => {
            it('debe retornar configuración completa para estilo bold', () => {
                const config = ReelsAdapter.getSubtitleStyleConfig('bold');
                
                expect(config.fontName).toBe('Arial Black');
                expect(config.fontSize).toBe(24);
                expect(config.primaryColor).toBe('&HFFFFFF');
                expect(config.outlineColor).toBe('&H000000');
                expect(config.outlineWidth).toBe(3);
            });

            it('debe retornar configuración completa para estilo glow', () => {
                const config = ReelsAdapter.getSubtitleStyleConfig('glow');
                
                expect(config.fontName).toBe('Impact');
                expect(config.effect).toBe('blur');
            });

            it('debe retornar configuración completa para estilo minimal', () => {
                const config = ReelsAdapter.getSubtitleStyleConfig('minimal');
                
                expect(config.fontName).toBe('Montserrat');
                expect(config.outlineWidth).toBe(1);
            });

            it('debe retornar una copia, no la referencia original', () => {
                const config1 = ReelsAdapter.getSubtitleStyleConfig('bold');
                const config2 = ReelsAdapter.getSubtitleStyleConfig('bold');
                
                config1.fontSize = 999;
                
                expect(config2.fontSize).toBe(24); // No debe estar afectado
            });
        });

        describe('getAvailableSubtitleStyles - Lista de estilos', () => {
            it('debe retornar array con los 3 estilos disponibles', () => {
                const styles = ReelsAdapter.getAvailableSubtitleStyles();
                
                expect(styles).toHaveLength(3);
                expect(styles).toContain('bold');
                expect(styles).toContain('glow');
                expect(styles).toContain('minimal');
            });
        });

        describe('recommendSubtitleStyle - Recomendación de estilos', () => {
            it('debe recomendar bold para contenido educativo', () => {
                const result = ReelsAdapter.recommendSubtitleStyle('educational');
                
                expect(result.style).toBe('bold');
                expect(result.reason).toContain('educativo');
            });

            it('debe recomendar glow para contenido energético', () => {
                const result = ReelsAdapter.recommendSubtitleStyle('energetic');
                
                expect(result.style).toBe('glow');
                expect(result.reason).toContain('energético');
            });

            it('debe recomendar glow para contenido trending', () => {
                const result = ReelsAdapter.recommendSubtitleStyle('trending');
                
                expect(result.style).toBe('glow');
            });

            it('debe recomendar minimal para contenido profesional', () => {
                const result = ReelsAdapter.recommendSubtitleStyle('professional');
                
                expect(result.style).toBe('minimal');
                expect(result.reason).toContain('profesional');
            });

            it('debe recomendar bold por defecto', () => {
                const result = ReelsAdapter.recommendSubtitleStyle('default');
                
                expect(result.style).toBe('bold');
                expect(result.reason).toContain('defecto');
            });
        });

        describe('getForceStyleString - Cadena force_style para FFmpeg', () => {
            it('debe generar cadena force_style para bold', () => {
                const forceStyle = ReelsAdapter.getForceStyleString('bold');
                
                expect(forceStyle).toContain('FontName=Arial Black');
                expect(forceStyle).toContain('FontSize=24');
                expect(forceStyle).toContain('Bold=1');
                expect(forceStyle).toContain('Alignment=2');
                expect(forceStyle).toContain('MarginV=60');
            });

            it('debe incluir BorderStyle=3 para glow', () => {
                const forceStyle = ReelsAdapter.getForceStyleString('glow');
                
                expect(forceStyle).toContain('BorderStyle=3');
            });

            it('NO debe incluir BorderStyle para minimal', () => {
                const forceStyle = ReelsAdapter.getForceStyleString('minimal');
                
                expect(forceStyle).not.toContain('BorderStyle');
            });

            it('debe ser consistente con buildStyledSubtitleFilter', () => {
                // El force_style generado debe ser el mismo usado internamente
                const manualForceStyle = ReelsAdapter.getForceStyleString('bold');
                const filter = ReelsAdapter.buildStyledSubtitleFilter('/test.ass', 'bold');
                
                // Verificar que el filtro contiene los mismos valores
                expect(filter).toContain('FontName=Arial Black');
                expect(filter).toContain('FontSize=24');
            });
        });

        describe('Descripción de estilos', () => {
            it('todos los estilos deben tener descripción', () => {
                const styles = ReelsAdapter.getAvailableSubtitleStyles();
                
                for (const style of styles) {
                    const config = ReelsAdapter.getSubtitleStyleConfig(style);
                    expect(config.description).toBeDefined();
                    expect(config.description!.length).toBeGreaterThan(0);
                }
            });
        });
    });
