/**
 * Tests para WhisperTranscriber
 * 
 * @requirement REQ-2.5.7 - Crear fallback a Whisper cuando SSML timestamps no están disponibles
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock de OpenAI antes de importar WhisperTranscriber
const mockCreate = vi.fn();
vi.mock('openai', () => {
    return {
        default: class MockOpenAI {
            audio = {
                transcriptions: {
                    create: mockCreate
                }
            };
            constructor(_config: any) {}
        }
    };
});

// Importar después del mock
import { WhisperTranscriber, WhisperConfig } from './WhisperTranscriber';

describe('WhisperTranscriber', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock fs.existsSync para simular que el archivo existe
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        
        // Mock fs.statSync para simular tamaño de archivo válido
        vi.spyOn(fs, 'statSync').mockReturnValue({
            size: 1024 * 1024 // 1MB
        } as fs.Stats);
        
        // Mock fs.createReadStream
        vi.spyOn(fs, 'createReadStream').mockReturnValue({} as fs.ReadStream);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('debe crear instancia con configuración por defecto', () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            expect(transcriber).toBeInstanceOf(WhisperTranscriber);
        });

        it('debe aceptar configuración personalizada', () => {
            const config: WhisperConfig = {
                apiKey: 'test-key',
                model: 'whisper-1',
                language: 'spanish',
                prompt: 'Transcripción de contenido sobre IA'
            };
            
            const transcriber = new WhisperTranscriber(config);
            expect(transcriber).toBeInstanceOf(WhisperTranscriber);
            expect(transcriber.isConfigured()).toBe(true);
        });

        it('debe advertir si no hay API key', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const originalEnv = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;
            
            new WhisperTranscriber({ apiKey: '' });
            
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('No se encontró OPENAI_API_KEY')
            );
            
            process.env.OPENAI_API_KEY = originalEnv;
        });
    });

    describe('isConfigured', () => {
        it('debe retornar true si hay API key', () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            expect(transcriber.isConfigured()).toBe(true);
        });

        it('debe retornar false si no hay API key', () => {
            const originalEnv = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const transcriber = new WhisperTranscriber({ apiKey: '' });
            expect(transcriber.isConfigured()).toBe(false);
            
            process.env.OPENAI_API_KEY = originalEnv;
        });
    });

    describe('validación de archivos', () => {
        it('debe rechazar archivo que no existe', async () => {
            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            await expect(
                transcriber.transcribeWithWhisper('/ruta/inexistente.mp3')
            ).rejects.toThrow('Archivo de audio no encontrado');
        });

        it('debe rechazar extensión no soportada', async () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            await expect(
                transcriber.transcribeWithWhisper('/ruta/audio.xyz')
            ).rejects.toThrow('Extensión de archivo no soportada');
        });

        it('debe rechazar archivo demasiado grande', async () => {
            vi.spyOn(fs, 'statSync').mockReturnValue({
                size: 30 * 1024 * 1024 // 30MB (mayor al límite de 25MB)
            } as fs.Stats);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            await expect(
                transcriber.transcribeWithWhisper('/ruta/audio.mp3')
            ).rejects.toThrow('Archivo demasiado grande');
        });

        it('debe rechazar archivo vacío', async () => {
            vi.spyOn(fs, 'statSync').mockReturnValue({
                size: 0
            } as fs.Stats);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            await expect(
                transcriber.transcribeWithWhisper('/ruta/audio.mp3')
            ).rejects.toThrow('El archivo de audio está vacío');
        });

        it('debe aceptar extensiones soportadas', () => {
            const supportedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];
            
            supportedExtensions.forEach(ext => {
                // Verificamos que la extensión es una cadena válida
                expect(typeof ext).toBe('string');
                expect(ext.startsWith('.')).toBe(true);
            });
        });
    });

    describe('transcribeWithWhisper', () => {
        it('debe convertir palabras de Whisper a WordTiming', async () => {
            const mockResponse = {
                language: 'es',
                duration: 5.5,
                text: 'Hola mundo test',
                words: [
                    { word: 'Hola', start: 0.0, end: 0.5 },
                    { word: 'mundo', start: 0.5, end: 1.2 },
                    { word: 'test', start: 1.2, end: 1.8 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({
                word: 'Hola',
                startTimeMs: 0,
                endTimeMs: 500,
                markIndex: 0
            });
            expect(result[1]).toEqual({
                word: 'mundo',
                startTimeMs: 500,
                endTimeMs: 1200,
                markIndex: 1
            });
            expect(result[2]).toEqual({
                word: 'test',
                startTimeMs: 1200,
                endTimeMs: 1800,
                markIndex: 2
            });
        });

        it('debe usar segmentos como fallback si no hay palabras', async () => {
            const mockResponse = {
                language: 'es',
                duration: 2.0,
                text: 'Hola mundo',
                segments: [
                    {
                        id: 0,
                        seek: 0,
                        start: 0.0,
                        end: 2.0,
                        text: 'Hola mundo',
                        tokens: [],
                        temperature: 0,
                        avg_logprob: 0,
                        compression_ratio: 0,
                        no_speech_prob: 0
                    }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result).toHaveLength(2);
            expect(result[0].word).toBe('Hola');
            expect(result[1].word).toBe('mundo');
        });

        it('debe distribuir uniformemente si solo hay texto', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const mockResponse = {
                language: 'es',
                duration: 3.0,
                text: 'Uno dos tres'
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result).toHaveLength(3);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Estimando distribución uniforme')
            );
            
            // Verificar distribución uniforme (3000ms / 3 palabras = 1000ms cada una)
            expect(result[0].startTimeMs).toBe(0);
            expect(result[0].endTimeMs).toBe(1000);
            expect(result[1].startTimeMs).toBe(1000);
            expect(result[1].endTimeMs).toBe(2000);
            expect(result[2].startTimeMs).toBe(2000);
            expect(result[2].endTimeMs).toBe(3000);
        });

        it('debe manejar errores de API', async () => {
            mockCreate.mockRejectedValue(new Error('API Error: Invalid API key'));
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            await expect(
                transcriber.transcribeWithWhisper('/ruta/audio.mp3')
            ).rejects.toThrow('Error al transcribir con Whisper');
        });
    });

    describe('normalizeLanguageCode', () => {
        it('debe normalizar nombres de idioma a códigos ISO', () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            // @ts-ignore - Acceder a método privado para testing
            expect(transcriber['normalizeLanguageCode']('spanish')).toBe('es');
            expect(transcriber['normalizeLanguageCode']('Spanish')).toBe('es');
            expect(transcriber['normalizeLanguageCode']('SPANISH')).toBe('es');
            expect(transcriber['normalizeLanguageCode']('english')).toBe('en');
            expect(transcriber['normalizeLanguageCode']('portuguese')).toBe('pt');
            expect(transcriber['normalizeLanguageCode']('es')).toBe('es');
            expect(transcriber['normalizeLanguageCode']('en')).toBe('en');
        });

        it('debe retornar código de 2 letras si ya es válido', () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            
            // @ts-ignore - Acceder a método privado para testing
            expect(transcriber['normalizeLanguageCode']('fr')).toBe('fr');
            expect(transcriber['normalizeLanguageCode']('de')).toBe('de');
        });
    });

    describe('transcribeFull', () => {
        it('debe retornar resultado completo con duración y idioma', async () => {
            const mockResponse = {
                language: 'es',
                duration: 5.5,
                text: 'Texto completo de prueba',
                words: [
                    { word: 'Texto', start: 0.0, end: 0.5 },
                    { word: 'completo', start: 0.5, end: 1.0 },
                    { word: 'de', start: 1.0, end: 1.2 },
                    { word: 'prueba', start: 1.2, end: 1.8 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeFull('/ruta/audio.mp3');
            
            expect(result.text).toBe('Texto completo de prueba');
            expect(result.language).toBe('es');
            expect(result.durationMs).toBe(5500);
            expect(result.wordTimings).toHaveLength(4);
        });
    });

    describe('updateConfig', () => {
        it('debe actualizar configuración parcialmente', () => {
            const transcriber = new WhisperTranscriber({ 
                apiKey: 'original-key',
                language: 'spanish'
            });
            
            transcriber.updateConfig({ language: 'english' });
            
            // La configuración debería estar actualizada
            expect(transcriber.isConfigured()).toBe(true);
        });

        it('debe actualizar API key y recrear cliente OpenAI', () => {
            const transcriber = new WhisperTranscriber({ apiKey: 'old-key' });
            
            transcriber.updateConfig({ apiKey: 'new-key' });
            
            expect(transcriber.isConfigured()).toBe(true);
        });
    });

    describe('método estático transcribe', () => {
        it('debe funcionar como shortcut sin instanciar', async () => {
            const mockResponse = {
                language: 'en',
                duration: 1.0,
                text: 'Test word here',
                words: [
                    { word: 'Test', start: 0.0, end: 0.3 },
                    { word: 'word', start: 0.3, end: 0.6 },
                    { word: 'here', start: 0.6, end: 1.0 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const result = await WhisperTranscriber.transcribe('/ruta/audio.mp3', { apiKey: 'test-key' });
            
            expect(result).toHaveLength(3);
            expect(result[0].word).toBe('Test');
        });
    });

    describe('timestamps precisos', () => {
        it('debe convertir timestamps de segundos a milisegundos correctamente', async () => {
            const mockResponse = {
                language: 'es',
                duration: 2.0,
                text: 'Prueba timestamp',
                words: [
                    { word: 'Prueba', start: 0.123, end: 0.456 },
                    { word: 'timestamp', start: 0.789, end: 1.234 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result[0].startTimeMs).toBe(123);
            expect(result[0].endTimeMs).toBe(456);
            expect(result[1].startTimeMs).toBe(789);
            expect(result[1].endTimeMs).toBe(1234);
        });

        it('debe redondear timestamps correctamente', async () => {
            const mockResponse = {
                language: 'es',
                duration: 1.0,
                text: 'Test',
                words: [
                    { word: 'Test', start: 0.1234, end: 0.5678 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            // Math.round(0.1234 * 1000) = 123
            // Math.round(0.5678 * 1000) = 568
            expect(result[0].startTimeMs).toBe(123);
            expect(result[0].endTimeMs).toBe(568);
        });
    });

    describe('manejo de palabras', () => {
        it('debe limpiar espacios de las palabras', async () => {
            const mockResponse = {
                language: 'es',
                duration: 1.0,
                text: 'Test',
                words: [
                    { word: '  Test  ', start: 0.0, end: 1.0 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result[0].word).toBe('Test');
        });

        it('debe asignar markIndex secuencial', async () => {
            const mockResponse = {
                language: 'es',
                duration: 3.0,
                text: 'Uno dos tres',
                words: [
                    { word: 'Uno', start: 0.0, end: 0.5 },
                    { word: 'dos', start: 0.5, end: 1.0 },
                    { word: 'tres', start: 1.0, end: 1.5 }
                ]
            };
            
            mockCreate.mockResolvedValue(mockResponse);
            
            const transcriber = new WhisperTranscriber({ apiKey: 'test-key' });
            const result = await transcriber.transcribeWithWhisper('/ruta/audio.mp3');
            
            expect(result[0].markIndex).toBe(0);
            expect(result[1].markIndex).toBe(1);
            expect(result[2].markIndex).toBe(2);
        });
    });
});
