/**
 * Tests para SubtitleGenerator
 * 
 * Valida la generación de archivos .ASS con timing preciso por palabra
 * @requirement REQ-2.5.3 - Generar archivo .ASS con timing preciso por palabra
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    SubtitleGenerator,
    SubtitleConfig,
    SubtitleLine,
    WordTiming,
    SUBTITLE_STYLES
} from './SubtitleGenerator';

describe('SubtitleGenerator', () => {
    const testOutputDir = path.join(process.cwd(), 'content', 'temp');
    
    beforeEach(() => {
        // Asegurar que el directorio de salida existe
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Limpiar archivos de test
        const testFiles = fs.readdirSync(testOutputDir)
            .filter(f => f.startsWith('test-subtitle'));
        testFiles.forEach(f => {
            try {
                fs.unlinkSync(path.join(testOutputDir, f));
            } catch { /* ignorar errores de limpieza */ }
        });
    });

    describe('formatASSTime', () => {
        it('debe formatear 0ms como 0:00:00.00', () => {
            const result = SubtitleGenerator.formatASSTime(0);
            expect(result).toBe('0:00:00.00');
        });

        it('debe formatear milisegundos correctamente a formato h:mm:ss.cs', () => {
            // 1 segundo = 1000ms
            expect(SubtitleGenerator.formatASSTime(1000)).toBe('0:00:01.00');
            // 1.5 segundos = 1500ms
            expect(SubtitleGenerator.formatASSTime(1500)).toBe('0:00:01.50');
            // 1 minuto 30 segundos
            expect(SubtitleGenerator.formatASSTime(90000)).toBe('0:01:30.00');
            // 1 hora 2 minutos 3.45 segundos
            expect(SubtitleGenerator.formatASSTime(3723450)).toBe('1:02:03.45');
        });

        it('debe manejar centésimas de segundo correctamente', () => {
            // 100ms = 0.10 segundos
            expect(SubtitleGenerator.formatASSTime(100)).toBe('0:00:00.10');
            // 990ms = 0.99 segundos
            expect(SubtitleGenerator.formatASSTime(990)).toBe('0:00:00.99');
            // 1050ms = 1.05 segundos
            expect(SubtitleGenerator.formatASSTime(1050)).toBe('0:00:01.05');
        });
    });

    describe('prepareSSMLWithMarks', () => {
        it('debe agregar marcas SSML por cada palabra', () => {
            const text = 'Hola mundo cruel';
            const ssml = SubtitleGenerator.prepareSSMLWithMarks(text);
            
            expect(ssml).toContain('<speak>');
            expect(ssml).toContain('</speak>');
            expect(ssml).toContain('<mark name="w0"/>Hola');
            expect(ssml).toContain('<mark name="w1"/>mundo');
            expect(ssml).toContain('<mark name="w2"/>cruel');
        });

        it('debe manejar texto con múltiples espacios', () => {
            const text = 'Hola   mundo';
            const ssml = SubtitleGenerator.prepareSSMLWithMarks(text);
            
            // Solo debe haber 2 marcas, ignorando espacios múltiples
            expect((ssml.match(/<mark/g) || []).length).toBe(2);
        });
    });

    describe('generateEstimatedTimepoints', () => {
        it('debe generar timepoints estimados para cada palabra', () => {
            const words = ['Hola', 'mundo'];
            const timepoints = SubtitleGenerator.generateEstimatedTimepoints(words);
            
            expect(timepoints).toHaveLength(2);
            expect(timepoints[0].word).toBe('Hola');
            expect(timepoints[1].word).toBe('mundo');
        });

        it('debe tener timing secuencial sin solapamiento', () => {
            const words = ['Primera', 'segunda', 'tercera'];
            const timepoints = SubtitleGenerator.generateEstimatedTimepoints(words);
            
            for (let i = 0; i < timepoints.length - 1; i++) {
                expect(timepoints[i].endTimeMs).toBeLessThanOrEqual(timepoints[i + 1].startTimeMs);
            }
        });

        it('debe incluir markIndex correcto', () => {
            const words = ['A', 'B', 'C'];
            const timepoints = SubtitleGenerator.generateEstimatedTimepoints(words);
            
            expect(timepoints[0].markIndex).toBe(0);
            expect(timepoints[1].markIndex).toBe(1);
            expect(timepoints[2].markIndex).toBe(2);
        });
    });

    describe('groupIntoLines', () => {
        it('debe agrupar palabras en líneas de máximo N palabras', () => {
            const wordTimings: WordTiming[] = [];
            for (let i = 0; i < 15; i++) {
                wordTimings.push({
                    word: `palabra${i}`,
                    startTimeMs: i * 100,
                    endTimeMs: (i + 1) * 100,
                    markIndex: i
                });
            }
            
            // Por defecto, máximo 7 palabras por línea
            const lines = SubtitleGenerator.groupIntoLines(wordTimings);
            
            expect(lines.length).toBe(3); // 15 palabras / 7 = 3 líneas
            expect(lines[0].words.length).toBe(7);
            expect(lines[1].words.length).toBe(7);
            expect(lines[2].words.length).toBe(1);
        });

        it('debe establecer timing correcto de inicio/fin por línea', () => {
            const wordTimings: WordTiming[] = [
                { word: 'Hola', startTimeMs: 0, endTimeMs: 500, markIndex: 0 },
                { word: 'mundo', startTimeMs: 500, endTimeMs: 1000, markIndex: 1 },
                { word: 'cruel', startTimeMs: 1000, endTimeMs: 1500, markIndex: 2 }
            ];
            
            const lines = SubtitleGenerator.groupIntoLines(wordTimings, 3);
            
            expect(lines.length).toBe(1);
            expect(lines[0].startTimeMs).toBe(0);
            expect(lines[0].endTimeMs).toBe(1500);
            expect(lines[0].text).toBe('Hola mundo cruel');
        });

        it('debe preservar las palabras individuales con timing en cada línea', () => {
            const wordTimings: WordTiming[] = [
                { word: 'A', startTimeMs: 0, endTimeMs: 100, markIndex: 0 },
                { word: 'B', startTimeMs: 100, endTimeMs: 200, markIndex: 1 }
            ];
            
            const lines = SubtitleGenerator.groupIntoLines(wordTimings, 5);
            
            expect(lines[0].words).toHaveLength(2);
            expect(lines[0].words[0].word).toBe('A');
            expect(lines[0].words[0].startTimeMs).toBe(0);
            expect(lines[0].words[1].word).toBe('B');
            expect(lines[0].words[1].startTimeMs).toBe(100);
        });
    });

    describe('generateASSHeader', () => {
        it('debe generar header válido con formato ASS v4+', () => {
            const style = SUBTITLE_STYLES.bold;
            const header = SubtitleGenerator.generateASSHeader(style);
            
            expect(header).toContain('[Script Info]');
            expect(header).toContain('ScriptType: v4.00+');
            expect(header).toContain('[V4+ Styles]');
            expect(header).toContain('[Events]');
        });

        it('debe incluir resolución de video correcta', () => {
            const style = SUBTITLE_STYLES.minimal;
            const header = SubtitleGenerator.generateASSHeader(style, 1080, 1920);
            
            expect(header).toContain('PlayResX: 1080');
            expect(header).toContain('PlayResY: 1920');
        });

        it('debe aplicar el estilo especificado', () => {
            const style = SUBTITLE_STYLES.bold;
            const header = SubtitleGenerator.generateASSHeader(style);
            
            expect(header).toContain('Style: Bold');
            expect(header).toContain('Montserrat');
        });
    });

    describe('generateASSDialogue', () => {
        it('debe generar línea de diálogo con formato correcto', () => {
            const line: SubtitleLine = {
                text: 'Hola mundo',
                startTimeMs: 0,
                endTimeMs: 1000,
                words: []
            };
            
            const dialogue = SubtitleGenerator.generateASSDialogue(line, 'Bold');
            
            expect(dialogue).toContain('Dialogue:');
            expect(dialogue).toContain('0:00:00.00');
            expect(dialogue).toContain('0:00:01.00');
            expect(dialogue).toContain('Bold');
            expect(dialogue).toContain('Hola mundo');
        });

        it('debe incluir efecto de fade configurado', () => {
            const line: SubtitleLine = {
                text: 'Test',
                startTimeMs: 0,
                endTimeMs: 500,
                words: []
            };
            
            const dialogue = SubtitleGenerator.generateASSDialogue(line, 'Minimal', 150);
            
            expect(dialogue).toContain('{\\fad(150,150)}');
        });
    });

    describe('generateASSFile', () => {
        it('debe generar archivo .ASS válido con timing preciso', () => {
            const lines: SubtitleLine[] = [
                {
                    text: 'Primera línea de subtítulos',
                    startTimeMs: 0,
                    endTimeMs: 2000,
                    words: [
                        { word: 'Primera', startTimeMs: 0, endTimeMs: 400, markIndex: 0 },
                        { word: 'línea', startTimeMs: 400, endTimeMs: 800, markIndex: 1 },
                        { word: 'de', startTimeMs: 800, endTimeMs: 1000, markIndex: 2 },
                        { word: 'subtítulos', startTimeMs: 1000, endTimeMs: 2000, markIndex: 3 }
                    ]
                },
                {
                    text: 'Segunda línea aquí',
                    startTimeMs: 2500,
                    endTimeMs: 4000,
                    words: [
                        { word: 'Segunda', startTimeMs: 2500, endTimeMs: 3000, markIndex: 4 },
                        { word: 'línea', startTimeMs: 3000, endTimeMs: 3500, markIndex: 5 },
                        { word: 'aquí', startTimeMs: 3500, endTimeMs: 4000, markIndex: 6 }
                    ]
                }
            ];
            
            const config: SubtitleConfig = {
                language: 'Spanish',
                style: 'bold',
                fadeDurationMs: 100,
                marginV: 60
            };
            
            const outputPath = path.join(testOutputDir, 'test-subtitle-output.ass');
            const result = SubtitleGenerator.generateASSFile(lines, outputPath, config);
            
            // Verificar que el archivo fue creado
            expect(fs.existsSync(result)).toBe(true);
            
            // Leer contenido del archivo
            const content = fs.readFileSync(result, 'utf-8');
            
            // Verificar estructura ASS v4+
            expect(content).toContain('[Script Info]');
            expect(content).toContain('ScriptType: v4.00+');
            expect(content).toContain('[V4+ Styles]');
            expect(content).toContain('[Events]');
            
            // Verificar diálogos con timestamps
            expect(content).toContain('Dialogue:');
            expect(content).toContain('0:00:00.00'); // Start de primera línea
            expect(content).toContain('0:00:02.00'); // End de primera línea
            expect(content).toContain('0:00:02.50'); // Start de segunda línea
            expect(content).toContain('0:00:04.00'); // End de segunda línea
            
            // Verificar texto de las líneas
            expect(content).toContain('Primera línea de subtítulos');
            expect(content).toContain('Segunda línea aquí');
        });

        it('debe usar el estilo configurado', () => {
            const lines: SubtitleLine[] = [{
                text: 'Test estilo',
                startTimeMs: 0,
                endTimeMs: 1000,
                words: [{ word: 'Test', startTimeMs: 0, endTimeMs: 500, markIndex: 0 }]
            }];
            
            const config: SubtitleConfig = {
                language: 'Spanish',
                style: 'glow'
            };
            
            const outputPath = path.join(testOutputDir, 'test-subtitle-glow.ass');
            SubtitleGenerator.generateASSFile(lines, outputPath, config);
            
            const content = fs.readFileSync(outputPath, 'utf-8');
            expect(content).toContain('Style: Glow');
        });

        it('debe aplicar marginV personalizado', () => {
            const lines: SubtitleLine[] = [{
                text: 'Test margin',
                startTimeMs: 0,
                endTimeMs: 1000,
                words: []
            }];
            
            const config: SubtitleConfig = {
                language: 'Spanish',
                style: 'minimal',
                marginV: 80
            };
            
            const outputPath = path.join(testOutputDir, 'test-subtitle-margin.ass');
            SubtitleGenerator.generateASSFile(lines, outputPath, config);
            
            const content = fs.readFileSync(outputPath, 'utf-8');
            expect(content).toContain(',80,1'); // marginV en la línea de Style
        });

        it('debe aplicar fadeDuration configurado en cada diálogo', () => {
            const lines: SubtitleLine[] = [{
                text: 'Test fade',
                startTimeMs: 0,
                endTimeMs: 1000,
                words: []
            }];
            
            const config: SubtitleConfig = {
                language: 'Spanish',
                style: 'bold',
                fadeDurationMs: 200
            };
            
            const outputPath = path.join(testOutputDir, 'test-subtitle-fade.ass');
            SubtitleGenerator.generateASSFile(lines, outputPath, config);
            
            const content = fs.readFileSync(outputPath, 'utf-8');
            expect(content).toContain('{\\fad(200,200)}');
        });
    });

    describe('parseTimepoints', () => {
        it('debe parsear timepoints de TTS correctamente', () => {
            const timepoints = [
                { markName: 'w0', timeSeconds: 0.0 },
                { markName: 'w1', timeSeconds: 0.5 },
                { markName: 'w2', timeSeconds: 1.0 }
            ];
            const originalWords = ['Hola', 'mundo', 'cruel'];
            
            const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
            
            expect(result).toHaveLength(3);
            expect(result[0].word).toBe('Hola');
            expect(result[0].startTimeMs).toBe(0);
            expect(result[1].word).toBe('mundo');
            expect(result[1].startTimeMs).toBe(500);
            expect(result[2].word).toBe('cruel');
            expect(result[2].startTimeMs).toBe(1000);
        });

        it('debe usar fallback a estimados cuando no hay timepoints', () => {
            const originalWords = ['Hola', 'mundo'];
            
            const result = SubtitleGenerator.parseTimepoints(undefined, originalWords);
            
            expect(result).toHaveLength(2);
            expect(result[0].word).toBe('Hola');
            expect(result[1].word).toBe('mundo');
        });

        it('debe calcular endTimeMs basado en siguiente marca', () => {
            const timepoints = [
                { markName: 'w0', timeSeconds: 0.0 },
                { markName: 'w1', timeSeconds: 0.5 }
            ];
            const originalWords = ['Primera', 'Segunda'];
            
            const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
            
            // Primera palabra termina cuando empieza la segunda
            expect(result[0].endTimeMs).toBe(500);
        });
    });

    describe('SUBTITLE_STYLES', () => {
        it('debe tener los 3 estilos requeridos: minimal, bold, glow', () => {
            expect(SUBTITLE_STYLES.minimal).toBeDefined();
            expect(SUBTITLE_STYLES.bold).toBeDefined();
            expect(SUBTITLE_STYLES.glow).toBeDefined();
        });

        it('estilo bold debe usar Montserrat con borde negro', () => {
            const boldStyle = SUBTITLE_STYLES.bold;
            
            expect(boldStyle.fontname).toBe('Montserrat');
            expect(boldStyle.bold).toBe(true);
            expect(boldStyle.primaryColor).toBe('&HFFFFFF');
            expect(boldStyle.outlineColor).toBe('&H000000');
            expect(boldStyle.outline).toBe(2);
        });

        /**
         * Tests específicos para REQ-2.5.4 - Estilo profesional de subtítulos
         * Fuente: Montserrat Bold, Color: Blanco (#FFFFFF), Borde: Negro 2px
         */
        describe('REQ-2.5.4: Estilo profesional bold', () => {
            it('debe usar fuente Montserrat', () => {
                expect(SUBTITLE_STYLES.bold.fontname).toBe('Montserrat');
            });

            it('debe tener bold activado (negrita)', () => {
                expect(SUBTITLE_STYLES.bold.bold).toBe(true);
            });

            it('debe tener color primario blanco (#FFFFFF = &HFFFFFF en ASS)', () => {
                expect(SUBTITLE_STYLES.bold.primaryColor).toBe('&HFFFFFF');
            });

            it('debe tener color de borde negro (#000000 = &H000000 en ASS)', () => {
                expect(SUBTITLE_STYLES.bold.outlineColor).toBe('&H000000');
            });

            it('debe tener grosor de borde de 2px', () => {
                expect(SUBTITLE_STYLES.bold.outline).toBe(2);
            });

            it('debe tener tamaño de fuente entre 20-24px', () => {
                expect(SUBTITLE_STYLES.bold.fontsize).toBeGreaterThanOrEqual(20);
                expect(SUBTITLE_STYLES.bold.fontsize).toBeLessThanOrEqual(24);
            });

            it('debe tener marginV entre 50-80px desde borde inferior', () => {
                expect(SUBTITLE_STYLES.bold.marginV).toBeGreaterThanOrEqual(50);
                expect(SUBTITLE_STYLES.bold.marginV).toBeLessThanOrEqual(80);
            });
        });
    });

    describe('burnSubtitles', () => {
        /**
         * Tests para REQ-2.5.5 - Quemar subtítulos con FFmpeg filtro ass
         */
        const testVideoDir = path.join(process.cwd(), 'content');
        const testOutputPath = path.join(testOutputDir, 'test-subtitle-burned.mp4');
        const testAssPath = path.join(testOutputDir, 'test-subtitle-burn.ass');

        beforeEach(() => {
            // Crear archivo .ASS de prueba
            const lines: SubtitleLine[] = [{
                text: 'Prueba de subtítulos quemados',
                startTimeMs: 0,
                endTimeMs: 2000,
                words: [
                    { word: 'Prueba', startTimeMs: 0, endTimeMs: 500, markIndex: 0 },
                    { word: 'de', startTimeMs: 500, endTimeMs: 700, markIndex: 1 },
                    { word: 'subtítulos', startTimeMs: 700, endTimeMs: 1400, markIndex: 2 },
                    { word: 'quemados', startTimeMs: 1400, endTimeMs: 2000, markIndex: 3 }
                ]
            }];
            
            const config: SubtitleConfig = {
                language: 'Spanish',
                style: 'bold'
            };
            
            SubtitleGenerator.generateASSFile(lines, testAssPath, config);
        });

        afterEach(() => {
            // Limpiar archivos de prueba
            const filesToClean = [testOutputPath, testAssPath];
            filesToClean.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch { /* ignorar errores de limpieza */ }
                }
            });
        });

        it('debe lanzar error cuando el video de entrada no existe', async () => {
            const nonExistentVideo = path.join(testOutputDir, 'no-existe.mp4');
            
            await expect(
                SubtitleGenerator.burnSubtitles(nonExistentVideo, testAssPath, testOutputPath)
            ).rejects.toThrow('Video de entrada no encontrado');
        });

        it('debe lanzar error cuando el archivo .ASS no existe', async () => {
            const existingVideo = path.join(testVideoDir, 'final-short-channel1-spanish.mp4');
            const nonExistentAss = path.join(testOutputDir, 'no-existe.ass');
            
            // Solo ejecutar si existe un video de prueba
            if (fs.existsSync(existingVideo)) {
                await expect(
                    SubtitleGenerator.burnSubtitles(existingVideo, nonExistentAss, testOutputPath)
                ).rejects.toThrow('Archivo .ASS no encontrado');
            }
        });

        it('debe quemar subtítulos correctamente en un video existente', async () => {
            const existingVideo = path.join(testVideoDir, 'final-short-channel1-spanish.mp4');
            
            // Solo ejecutar si existe un video de prueba
            if (!fs.existsSync(existingVideo)) {
                console.log('⚠️ Video de prueba no disponible, saltando test de integración');
                return;
            }
            
            const result = await SubtitleGenerator.burnSubtitles(
                existingVideo,
                testAssPath,
                testOutputPath
            );
            
            // Verificar que se retorna la ruta correcta
            expect(result).toBe(testOutputPath);
            
            // Verificar que el archivo de salida existe
            expect(fs.existsSync(testOutputPath)).toBe(true);
            
            // Verificar que el archivo no está vacío
            const stats = fs.statSync(testOutputPath);
            expect(stats.size).toBeGreaterThan(0);
        }, 60000); // Timeout de 60 segundos para FFmpeg

        it('debe crear el directorio de salida si no existe', async () => {
            const existingVideo = path.join(testVideoDir, 'final-short-channel1-spanish.mp4');
            const nestedOutputPath = path.join(testOutputDir, 'nested', 'deep', 'test-output.mp4');
            
            // Solo ejecutar si existe un video de prueba
            if (!fs.existsSync(existingVideo)) {
                console.log('⚠️ Video de prueba no disponible, saltando test');
                return;
            }
            
            try {
                const result = await SubtitleGenerator.burnSubtitles(
                    existingVideo,
                    testAssPath,
                    nestedOutputPath
                );
                
                expect(fs.existsSync(result)).toBe(true);
            } finally {
                // Limpiar directorio anidado
                const nestedDir = path.join(testOutputDir, 'nested');
                if (fs.existsSync(nestedDir)) {
                    fs.rmSync(nestedDir, { recursive: true, force: true });
                }
            }
        }, 60000);

        it('debe manejar rutas con espacios correctamente', async () => {
            // Crear directorio con espacio
            const dirWithSpace = path.join(testOutputDir, 'test folder with spaces');
            const assInSpaceDir = path.join(dirWithSpace, 'subtitles test.ass');
            const outputInSpaceDir = path.join(dirWithSpace, 'output video.mp4');
            const existingVideo = path.join(testVideoDir, 'final-short-channel1-spanish.mp4');
            
            // Solo ejecutar si existe un video de prueba
            if (!fs.existsSync(existingVideo)) {
                console.log('⚠️ Video de prueba no disponible, saltando test');
                return;
            }
            
            // Crear directorio y archivo ASS
            if (!fs.existsSync(dirWithSpace)) {
                fs.mkdirSync(dirWithSpace, { recursive: true });
            }
            
            // Generar archivo ASS en directorio con espacios
            const lines: SubtitleLine[] = [{
                text: 'Test espacios',
                startTimeMs: 0,
                endTimeMs: 1000,
                words: []
            }];
            SubtitleGenerator.generateASSFile(lines, assInSpaceDir, {
                language: 'Spanish',
                style: 'minimal'
            });
            
            try {
                const result = await SubtitleGenerator.burnSubtitles(
                    existingVideo,
                    assInSpaceDir,
                    outputInSpaceDir
                );
                
                expect(fs.existsSync(result)).toBe(true);
            } finally {
                // Limpiar
                if (fs.existsSync(dirWithSpace)) {
                    fs.rmSync(dirWithSpace, { recursive: true, force: true });
                }
            }
        }, 60000);
    });

    /**
     * REQ-2.5.8: Validar sincronización con desfase máximo ±50ms
     * 
     * Estos tests validan que:
     * 1. parseTimepoints convierte correctamente segundos a milisegundos
     * 2. Los timestamps generados tienen precisión de ±50ms respecto al valor esperado
     * 3. La sincronización entre timepoints consecutivos es precisa
     */
    describe('REQ-2.5.8: Sincronización con desfase máximo ±50ms', () => {
        const MAX_SYNC_OFFSET_MS = 50; // Desfase máximo permitido ±50ms

        describe('parseTimepoints: conversión segundos a milisegundos', () => {
            it('debe convertir timeSeconds a startTimeMs con precisión ±50ms', () => {
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.0 },
                    { markName: 'w1', timeSeconds: 0.523 },
                    { markName: 'w2', timeSeconds: 1.047 },
                    { markName: 'w3', timeSeconds: 1.892 }
                ];
                const originalWords = ['Hola', 'mundo', 'cruel', 'test'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Verificar conversión precisa: timeSeconds * 1000 = startTimeMs
                expect(Math.abs(result[0].startTimeMs - 0)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].startTimeMs - 523)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[2].startTimeMs - 1047)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[3].startTimeMs - 1892)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });

            it('debe calcular endTimeMs con precisión ±50ms basado en siguiente marca', () => {
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.0 },
                    { markName: 'w1', timeSeconds: 0.500 },
                    { markName: 'w2', timeSeconds: 1.000 }
                ];
                const originalWords = ['Primera', 'Segunda', 'Tercera'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // endTimeMs de palabra N debe ser startTimeMs de palabra N+1
                expect(Math.abs(result[0].endTimeMs - result[1].startTimeMs)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].endTimeMs - result[2].startTimeMs)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });

            it('debe mantener sincronización ±50ms con timestamps de alta precisión', () => {
                // Simular timestamps reales de Google Cloud TTS con alta precisión
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.123 },
                    { markName: 'w1', timeSeconds: 0.456 },
                    { markName: 'w2', timeSeconds: 0.789 },
                    { markName: 'w3', timeSeconds: 1.234 }
                ];
                const originalWords = ['El', 'autismo', 'y', 'la'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Verificar conversión exacta con tolerancia ±50ms
                const expectedMs = [123, 456, 789, 1234];
                result.forEach((timing, index) => {
                    const desfase = Math.abs(timing.startTimeMs - expectedMs[index]);
                    expect(desfase).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                });
            });

            it('debe manejar timestamps con valores decimales precisos', () => {
                // Casos extremos de precisión decimal
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.001 },  // 1ms
                    { markName: 'w1', timeSeconds: 0.025 },  // 25ms
                    { markName: 'w2', timeSeconds: 0.049 },  // 49ms (justo en límite)
                    { markName: 'w3', timeSeconds: 0.100 }   // 100ms
                ];
                const originalWords = ['a', 'b', 'c', 'd'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Verificar precisión en milisegundos
                expect(Math.abs(result[0].startTimeMs - 1)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].startTimeMs - 25)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[2].startTimeMs - 49)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[3].startTimeMs - 100)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });
        });

        describe('generateEstimatedTimepoints: precisión de estimación', () => {
            it('debe generar timepoints sin gaps mayores a 50ms entre palabras', () => {
                const words = ['Inteligencia', 'artificial', 'y', 'autismo'];
                const result = SubtitleGenerator.generateEstimatedTimepoints(words);
                
                // Verificar que no hay gaps mayores a 50ms entre end de palabra N y start de palabra N+1
                for (let i = 0; i < result.length - 1; i++) {
                    const gap = result[i + 1].startTimeMs - result[i].endTimeMs;
                    // En timepoints estimados, el gap debe ser exactamente 0 o muy pequeño
                    expect(gap).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                    expect(gap).toBeGreaterThanOrEqual(0); // No debe haber solapamiento
                }
            });

            it('debe mantener consistencia temporal con diferentes speaking rates', () => {
                const words = ['Test', 'de', 'velocidad'];
                
                // Probar diferentes velocidades de habla
                const rates = [0.8, 1.0, 1.1, 1.5];
                
                rates.forEach(rate => {
                    const result = SubtitleGenerator.generateEstimatedTimepoints(words, rate);
                    
                    // Verificar secuencia temporal correcta
                    for (let i = 0; i < result.length - 1; i++) {
                        expect(result[i].endTimeMs).toBeLessThanOrEqual(result[i + 1].startTimeMs + MAX_SYNC_OFFSET_MS);
                        expect(result[i].startTimeMs).toBeLessThan(result[i].endTimeMs);
                    }
                });
            });
        });

        describe('sincronización end-to-end con líneas agrupadas', () => {
            it('debe mantener sincronización ±50ms al agrupar palabras en líneas', () => {
                // Simular timepoints reales de TTS
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.000 },
                    { markName: 'w1', timeSeconds: 0.350 },
                    { markName: 'w2', timeSeconds: 0.700 },
                    { markName: 'w3', timeSeconds: 1.050 },
                    { markName: 'w4', timeSeconds: 1.400 },
                    { markName: 'w5', timeSeconds: 1.750 },
                    { markName: 'w6', timeSeconds: 2.100 }
                ];
                const originalWords = ['El', 'autismo', 'es', 'una', 'condición', 'neurológica', 'única'];
                
                // Parsear timepoints
                const wordTimings = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Agrupar en líneas de 3 palabras
                const lines = SubtitleGenerator.groupIntoLines(wordTimings, 3);
                
                // Verificar que el timing de las líneas está sincronizado con las palabras
                lines.forEach(line => {
                    // El inicio de la línea debe coincidir con el inicio de la primera palabra
                    const firstWordStart = line.words[0].startTimeMs;
                    expect(Math.abs(line.startTimeMs - firstWordStart)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                    
                    // El fin de la línea debe coincidir con el fin de la última palabra
                    const lastWordEnd = line.words[line.words.length - 1].endTimeMs;
                    expect(Math.abs(line.endTimeMs - lastWordEnd)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                });
            });

            it('debe mantener sincronización entre líneas consecutivas', () => {
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.0 },
                    { markName: 'w1', timeSeconds: 0.5 },
                    { markName: 'w2', timeSeconds: 1.0 },
                    { markName: 'w3', timeSeconds: 1.5 },
                    { markName: 'w4', timeSeconds: 2.0 },
                    { markName: 'w5', timeSeconds: 2.5 }
                ];
                const originalWords = ['Palabra1', 'Palabra2', 'Palabra3', 'Palabra4', 'Palabra5', 'Palabra6'];
                
                const wordTimings = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                const lines = SubtitleGenerator.groupIntoLines(wordTimings, 3);
                
                // Verificar que no hay gaps mayores a 50ms entre líneas consecutivas
                // (considerando que puede haber pausa natural entre oraciones)
                for (let i = 0; i < lines.length - 1; i++) {
                    const gapBetweenLines = lines[i + 1].startTimeMs - lines[i].endTimeMs;
                    // El gap entre líneas no debe crear desfase de sincronización
                    // Nota: el gap puede ser >= 0 debido a pausas naturales, pero la sincronización
                    // debe mantenerse dentro de los ±50ms esperados para cada timestamp
                    expect(gapBetweenLines).toBeGreaterThanOrEqual(-MAX_SYNC_OFFSET_MS);
                }
            });
        });

        describe('formatASSTime: precisión de formato temporal', () => {
            it('debe formatear timestamps con precisión de centésimas de segundo (10ms)', () => {
                // El formato ASS usa centésimas (cs), que son 10ms
                // Verificar que la conversión mantiene precisión dentro de ±50ms
                
                const testCases = [
                    { ms: 0, expected: '0:00:00.00' },
                    { ms: 50, expected: '0:00:00.05' },     // 50ms = 5cs
                    { ms: 100, expected: '0:00:00.10' },    // 100ms = 10cs
                    { ms: 550, expected: '0:00:00.55' },    // 550ms = 55cs
                    { ms: 1234, expected: '0:00:01.23' },   // 1234ms ≈ 123cs (redondeo)
                    { ms: 5678, expected: '0:00:05.68' }    // 5678ms ≈ 568cs (redondeo)
                ];
                
                testCases.forEach(({ ms, expected }) => {
                    const result = SubtitleGenerator.formatASSTime(ms);
                    expect(result).toBe(expected);
                });
            });

            it('debe mantener sincronización al convertir ms -> ASS time -> reconstrucción', () => {
                // Verificar que la conversión ida y vuelta mantiene precisión
                const originalMs = [0, 523, 1047, 2500, 5000, 10000];
                
                originalMs.forEach(ms => {
                    const assTime = SubtitleGenerator.formatASSTime(ms);
                    
                    // Reconstruir ms desde el formato ASS
                    const parts = assTime.split(':');
                    const hours = parseInt(parts[0]);
                    const minutes = parseInt(parts[1]);
                    const [seconds, centiseconds] = parts[2].split('.').map(Number);
                    
                    const reconstructedMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + centiseconds * 10;
                    
                    // La diferencia debe ser menor a 50ms (tolerancia por redondeo)
                    expect(Math.abs(reconstructedMs - ms)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                });
            });
        });

        describe('casos límite de sincronización', () => {
            it('debe manejar timestamps muy cercanos (< 50ms diferencia)', () => {
                // Caso: palabras muy cortas pronunciadas rápidamente
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.000 },
                    { markName: 'w1', timeSeconds: 0.040 },  // 40ms después
                    { markName: 'w2', timeSeconds: 0.085 }   // 45ms después
                ];
                const originalWords = ['y', 'la', 'el'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Verificar que la sincronización se mantiene incluso con timestamps muy cercanos
                expect(Math.abs(result[0].startTimeMs - 0)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].startTimeMs - 40)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[2].startTimeMs - 85)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });

            it('debe manejar timestamps con gaps largos (pausas)', () => {
                // Caso: pausa dramática entre oraciones
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.0 },
                    { markName: 'w1', timeSeconds: 0.5 },
                    { markName: 'w2', timeSeconds: 2.5 },  // 2 segundos de pausa
                    { markName: 'w3', timeSeconds: 3.0 }
                ];
                const originalWords = ['Pausa', 'aquí', 'continúa', 'ahora'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // Verificar precisión incluso con gaps largos
                expect(Math.abs(result[0].startTimeMs - 0)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].startTimeMs - 500)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[2].startTimeMs - 2500)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[3].startTimeMs - 3000)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });

            it('debe manejar exactamente el límite de 50ms de desfase', () => {
                // Probar el caso límite exacto de 50ms
                const timepoints = [
                    { markName: 'w0', timeSeconds: 0.000 },
                    { markName: 'w1', timeSeconds: 0.050 }   // Exactamente 50ms
                ];
                const originalWords = ['a', 'b'];
                
                const result = SubtitleGenerator.parseTimepoints(timepoints, originalWords);
                
                // El desfase de exactamente 50ms debe ser aceptable
                expect(Math.abs(result[0].startTimeMs - 0)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
                expect(Math.abs(result[1].startTimeMs - 50)).toBeLessThanOrEqual(MAX_SYNC_OFFSET_MS);
            });
        });
    });
});
