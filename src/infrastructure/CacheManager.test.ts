/**
 * CacheManager.test.ts
 * 
 * Tests unitarios para el sistema centralizado de caché.
 * Valida TTL, hash, operaciones CRUD y limpieza automática.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CacheManager, CacheType, DEFAULT_CACHE_CONFIG } from './CacheManager';

// Directorio temporal para tests
const TEST_CACHE_DIR = 'content/cache-test';

describe('CacheManager', () => {
    let cacheManager: CacheManager;
    let testFilePath: string;

    beforeEach(() => {
        // Crear directorio temporal para tests
        const testDir = path.resolve(process.cwd(), TEST_CACHE_DIR);
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
        
        // Crear instancia con directorio de test
        cacheManager = new CacheManager({
            baseDir: TEST_CACHE_DIR,
            ttl: {
                video: 30,
                audio: 7,
                thumbnail: 3,
                music: 14
            }
        });
        
        // Crear archivo de prueba
        testFilePath = path.resolve(process.cwd(), TEST_CACHE_DIR, 'test-source.txt');
        fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
        fs.writeFileSync(testFilePath, 'Contenido de prueba para caché');
    });

    afterEach(() => {
        // Limpiar directorio temporal
        const testDir = path.resolve(process.cwd(), TEST_CACHE_DIR);
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    describe('generateKey', () => {
        it('debe generar hash MD5 de 32 caracteres', () => {
            const key = cacheManager.generateKey({ query: 'test', page: 1 });
            
            expect(key).toBeDefined();
            expect(key.length).toBe(32);
            expect(/^[a-f0-9]{32}$/.test(key)).toBe(true);
        });

        it('debe generar el mismo hash para parámetros idénticos', () => {
            const key1 = cacheManager.generateKey({ query: 'test', page: 1 });
            const key2 = cacheManager.generateKey({ query: 'test', page: 1 });
            
            expect(key1).toBe(key2);
        });

        it('debe generar hash diferente para parámetros diferentes', () => {
            const key1 = cacheManager.generateKey({ query: 'test1' });
            const key2 = cacheManager.generateKey({ query: 'test2' });
            
            expect(key1).not.toBe(key2);
        });

        it('debe ordenar claves para hash determinístico', () => {
            const key1 = cacheManager.generateKey({ a: 1, b: 2 });
            const key2 = cacheManager.generateKey({ b: 2, a: 1 });
            
            expect(key1).toBe(key2);
        });

        it('debe manejar objetos anidados', () => {
            const key = cacheManager.generateKey({
                transform: {
                    zoom: 1.05,
                    rotation: 0.3
                },
                source: 'pexels'
            });
            
            expect(key.length).toBe(32);
        });
    });

    describe('set', () => {
        it('debe guardar una entrada de caché correctamente', () => {
            const key = 'test-key-001';
            const entry = cacheManager.set(key, 'video', testFilePath);
            
            expect(entry).toBeDefined();
            expect(entry.key).toBe(key);
            expect(entry.type).toBe('video');
            expect(entry.size).toBeGreaterThan(0);
            expect(entry.createdAt).toBeInstanceOf(Date);
            expect(entry.expiresAt).toBeInstanceOf(Date);
        });

        it('debe almacenar metadatos adicionales', () => {
            const key = 'test-key-meta';
            const metadata = { source: 'pexels', query: 'nature' };
            const entry = cacheManager.set(key, 'video', testFilePath, metadata);
            
            expect(entry.metadata).toEqual(metadata);
        });

        it('debe calcular TTL correcto para cada tipo', () => {
            const types: CacheType[] = ['video', 'audio', 'thumbnail', 'music'];
            const expectedTTL = { video: 30, audio: 7, thumbnail: 3, music: 14 };
            
            for (const type of types) {
                const key = `test-${type}`;
                const entry = cacheManager.set(key, type, testFilePath);
                
                const diffDays = Math.round(
                    (entry.expiresAt.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                );
                
                expect(diffDays).toBe(expectedTTL[type]);
            }
        });

        it('debe lanzar error si el archivo fuente no existe', () => {
            expect(() => {
                cacheManager.set('test-key', 'video', '/ruta/no/existente.mp4');
            }).toThrow('Archivo fuente no existe');
        });
    });

    describe('get', () => {
        it('debe recuperar una entrada existente', () => {
            const key = 'test-get-001';
            cacheManager.set(key, 'audio', testFilePath);
            
            const entry = cacheManager.get(key);
            
            expect(entry).not.toBeNull();
            expect(entry?.key).toBe(key);
            expect(entry?.type).toBe('audio');
        });

        it('debe retornar null para clave inexistente', () => {
            const entry = cacheManager.get('clave-no-existente');
            
            expect(entry).toBeNull();
        });

        it('debe actualizar estadísticas de hits y misses', () => {
            const key = 'test-stats';
            cacheManager.set(key, 'thumbnail', testFilePath);
            
            const statsBefore = cacheManager.getStats();
            
            cacheManager.get(key);  // Hit
            cacheManager.get('no-existe');  // Miss
            
            const statsAfter = cacheManager.getStats();
            
            expect(statsAfter.hits).toBe(statsBefore.hits + 1);
            expect(statsAfter.misses).toBe(statsBefore.misses + 1);
        });
    });

    describe('has', () => {
        it('debe retornar true para entrada existente', () => {
            const key = 'test-has-001';
            cacheManager.set(key, 'music', testFilePath);
            
            expect(cacheManager.has(key)).toBe(true);
        });

        it('debe retornar false para entrada inexistente', () => {
            expect(cacheManager.has('clave-no-existente')).toBe(false);
        });
    });

    describe('delete', () => {
        it('debe eliminar una entrada existente', () => {
            const key = 'test-delete-001';
            cacheManager.set(key, 'video', testFilePath);
            
            expect(cacheManager.has(key)).toBe(true);
            
            const deleted = cacheManager.delete(key);
            
            expect(deleted).toBe(true);
            expect(cacheManager.has(key)).toBe(false);
        });

        it('debe retornar false al eliminar entrada inexistente', () => {
            const deleted = cacheManager.delete('clave-no-existente');
            
            expect(deleted).toBe(false);
        });

        it('debe actualizar estadísticas al eliminar', () => {
            const key = 'test-delete-stats';
            cacheManager.set(key, 'audio', testFilePath);
            
            const statsBefore = cacheManager.getStats();
            cacheManager.delete(key);
            const statsAfter = cacheManager.getStats();
            
            expect(statsAfter.totalEntries).toBe(statsBefore.totalEntries - 1);
        });
    });

    describe('cleanup', () => {
        it('debe eliminar entradas expiradas', () => {
            // Crear CacheManager con TTL de 0 días para que expire inmediatamente
            const quickExpireManager = new CacheManager({
                baseDir: TEST_CACHE_DIR,
                ttl: {
                    video: 0,  // Expira inmediatamente
                    audio: 0,
                    thumbnail: 0,
                    music: 0
                }
            });
            
            const key = 'test-cleanup-expired';
            quickExpireManager.set(key, 'video', testFilePath);
            
            // La entrada debería existir pero estar expirada
            // Ejecutar limpieza
            const removed = quickExpireManager.cleanup();
            
            expect(removed).toBeGreaterThanOrEqual(1);
        });

        it('debe mantener entradas no expiradas', () => {
            const key = 'test-cleanup-valid';
            cacheManager.set(key, 'video', testFilePath);
            
            const removed = cacheManager.cleanup();
            
            // No debería eliminar nada porque tiene TTL de 30 días
            expect(cacheManager.has(key)).toBe(true);
        });
    });

    describe('TTL por tipo REQ-4.1.6', () => {
        it('debe usar TTL de 30 días para videos', () => {
            const entry = cacheManager.set('video-ttl', 'video', testFilePath);
            const diffDays = (entry.expiresAt.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            
            expect(Math.round(diffDays)).toBe(30);
        });

        it('debe usar TTL de 7 días para audio', () => {
            const entry = cacheManager.set('audio-ttl', 'audio', testFilePath);
            const diffDays = (entry.expiresAt.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            
            expect(Math.round(diffDays)).toBe(7);
        });

        it('debe usar TTL de 3 días para thumbnails', () => {
            const entry = cacheManager.set('thumb-ttl', 'thumbnail', testFilePath);
            const diffDays = (entry.expiresAt.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            
            expect(Math.round(diffDays)).toBe(3);
        });

        it('debe usar TTL de 14 días para música', () => {
            const entry = cacheManager.set('music-ttl', 'music', testFilePath);
            const diffDays = (entry.expiresAt.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            
            expect(Math.round(diffDays)).toBe(14);
        });
    });

    describe('getStats y recalculateStats', () => {
        it('debe rastrear estadísticas correctamente', () => {
            cacheManager.set('stat1', 'video', testFilePath);
            cacheManager.set('stat2', 'audio', testFilePath);
            cacheManager.set('stat3', 'thumbnail', testFilePath);
            
            const stats = cacheManager.getStats();
            
            expect(stats.totalEntries).toBe(3);
            expect(stats.entriesByType.video).toBe(1);
            expect(stats.entriesByType.audio).toBe(1);
            expect(stats.entriesByType.thumbnail).toBe(1);
            expect(stats.entriesByType.music).toBe(0);
        });

        it('debe recalcular estadísticas escaneando disco', () => {
            cacheManager.set('recalc1', 'video', testFilePath);
            cacheManager.set('recalc2', 'music', testFilePath);
            
            const stats = cacheManager.recalculateStats();
            
            expect(stats.totalEntries).toBe(2);
            expect(stats.totalSize).toBeGreaterThan(0);
        });
    });

    describe('estructura de directorios REQ-4.1.5', () => {
        it('debe crear estructura /videos/, /audio/, /thumbnails/, /music/', () => {
            const baseDir = path.resolve(process.cwd(), TEST_CACHE_DIR);
            
            // Añadir una entrada de cada tipo para forzar creación
            cacheManager.set('dir-video', 'video', testFilePath);
            cacheManager.set('dir-audio', 'audio', testFilePath);
            cacheManager.set('dir-thumb', 'thumbnail', testFilePath);
            cacheManager.set('dir-music', 'music', testFilePath);
            
            expect(fs.existsSync(path.join(baseDir, 'videos'))).toBe(true);
            expect(fs.existsSync(path.join(baseDir, 'audio'))).toBe(true);
            expect(fs.existsSync(path.join(baseDir, 'thumbnails'))).toBe(true);
            expect(fs.existsSync(path.join(baseDir, 'music'))).toBe(true);
        });
    });

    describe('DEFAULT_CACHE_CONFIG', () => {
        it('debe tener la configuración por defecto correcta', () => {
            expect(DEFAULT_CACHE_CONFIG.baseDir).toBe('content/cache');
            expect(DEFAULT_CACHE_CONFIG.ttl.video).toBe(30);
            expect(DEFAULT_CACHE_CONFIG.ttl.audio).toBe(7);
            expect(DEFAULT_CACHE_CONFIG.ttl.thumbnail).toBe(3);
            expect(DEFAULT_CACHE_CONFIG.ttl.music).toBe(14);
        });
    });

    describe('Caché de videos Pexels REQ-4.1.2', () => {
        it('debe generar clave única basada en source + query + transformación', () => {
            // Caso de uso: caché de videos Pexels transformados
            const pexelsParams1 = {
                source: 'pexels',
                query: 'nature',
                transformation: {
                    zoom: 1.05,
                    rotation: 0.3,
                    hueShift: 5,
                    saturation: 1.1
                }
            };

            const pexelsParams2 = {
                source: 'pexels',
                query: 'nature',
                transformation: {
                    zoom: 1.05,
                    rotation: 0.3,
                    hueShift: 5,
                    saturation: 1.1
                }
            };

            const pexelsParams3 = {
                source: 'pexels',
                query: 'nature',
                transformation: {
                    zoom: 1.08, // diferente zoom
                    rotation: 0.3,
                    hueShift: 5,
                    saturation: 1.1
                }
            };

            const key1 = cacheManager.generateKey(pexelsParams1);
            const key2 = cacheManager.generateKey(pexelsParams2);
            const key3 = cacheManager.generateKey(pexelsParams3);

            // Mismos parámetros = misma clave
            expect(key1).toBe(key2);
            
            // Diferentes parámetros de transformación = clave diferente
            expect(key1).not.toBe(key3);
        });

        it('debe almacenar video Pexels en directorio correcto (content/cache/videos/)', () => {
            const pexelsParams = {
                source: 'pexels',
                query: 'technology',
                transformation: {
                    zoom: 1.05,
                    rotation: 0.2
                }
            };

            const key = cacheManager.generateKey(pexelsParams);
            const entry = cacheManager.set(key, 'video', testFilePath, {
                source: 'pexels',
                query: 'technology'
            });

            // Verificar que el archivo se almacenó en el directorio correcto
            expect(entry.path).toContain('videos');
            expect(entry.type).toBe('video');
            expect(fs.existsSync(entry.path)).toBe(true);
        });

        it('debe recuperar video Pexels cacheado con mismos parámetros', () => {
            const pexelsParams = {
                source: 'pexels',
                query: 'autism awareness',
                transformation: {
                    zoom: 1.03,
                    rotation: -0.1,
                    hueShift: 3
                }
            };

            const key = cacheManager.generateKey(pexelsParams);
            
            // Almacenar video
            const originalEntry = cacheManager.set(key, 'video', testFilePath, {
                source: 'pexels',
                query: 'autism awareness'
            });

            // Recuperar con la misma clave
            const cachedEntry = cacheManager.get(key);

            expect(cachedEntry).not.toBeNull();
            expect(cachedEntry?.path).toBe(originalEntry.path);
            expect(cachedEntry?.metadata?.source).toBe('pexels');
            expect(cachedEntry?.metadata?.query).toBe('autism awareness');
        });

        it('debe retornar null cuando query o transformación son diferentes', () => {
            const pexelsParams1 = {
                source: 'pexels',
                query: 'productivity',
                transformation: { zoom: 1.05 }
            };

            const pexelsParams2 = {
                source: 'pexels',
                query: 'productivity',
                transformation: { zoom: 1.08 } // transformación diferente
            };

            const key1 = cacheManager.generateKey(pexelsParams1);
            cacheManager.set(key1, 'video', testFilePath);

            const key2 = cacheManager.generateKey(pexelsParams2);
            const cachedEntry = cacheManager.get(key2);

            // No debe encontrar porque los parámetros de transformación son diferentes
            expect(cachedEntry).toBeNull();
        });

        it('debe usar TTL de 30 días para videos Pexels', () => {
            const pexelsParams = {
                source: 'pexels',
                query: 'ai technology',
                transformation: { zoom: 1.02 }
            };

            const key = cacheManager.generateKey(pexelsParams);
            const entry = cacheManager.set(key, 'video', testFilePath);

            const diffMs = entry.expiresAt.getTime() - entry.createdAt.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            expect(Math.round(diffDays)).toBe(30);
        });
    });

    describe('Caché de audios TTS REQ-4.1.3', () => {
        it('debe generar clave única basada en texto + voz + parámetros TTS', () => {
            // Caso de uso: caché de audio TTS generado por Google Cloud TTS
            const ttsParams1 = {
                text: 'Hola mundo',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.1,
                pitch: 0
            };

            const ttsParams2 = {
                text: 'Hola mundo',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.1,
                pitch: 0
            };

            const ttsParams3 = {
                text: 'Hola mundo',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.0, // diferente speakingRate
                pitch: 0
            };

            const key1 = cacheManager.generateKey(ttsParams1);
            const key2 = cacheManager.generateKey(ttsParams2);
            const key3 = cacheManager.generateKey(ttsParams3);

            // Mismos parámetros = misma clave
            expect(key1).toBe(key2);
            
            // Diferentes parámetros TTS = clave diferente
            expect(key1).not.toBe(key3);
        });

        it('debe almacenar audio TTS en directorio correcto (content/cache/audio/)', () => {
            const ttsParams = {
                text: 'El autismo es una neurodivergencia',
                voice: 'es-ES-Standard-A',
                speakingRate: 1.05,
                pitch: -1
            };

            const key = cacheManager.generateKey(ttsParams);
            const entry = cacheManager.set(key, 'audio', testFilePath, {
                text: ttsParams.text,
                voice: ttsParams.voice
            });

            // Verificar que el archivo se almacenó en el directorio correcto
            expect(entry.path).toContain('audio');
            expect(entry.type).toBe('audio');
            expect(fs.existsSync(entry.path)).toBe(true);
        });

        it('debe recuperar audio TTS cacheado con mismos parámetros', () => {
            const ttsParams = {
                text: 'La inteligencia artificial puede ayudar a personas con TDAH',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.1,
                pitch: 0,
                ssmlEnabled: true
            };

            const key = cacheManager.generateKey(ttsParams);
            
            // Almacenar audio TTS
            const originalEntry = cacheManager.set(key, 'audio', testFilePath, {
                text: ttsParams.text,
                voice: ttsParams.voice,
                generated: new Date().toISOString()
            });

            // Recuperar con la misma clave
            const cachedEntry = cacheManager.get(key);

            expect(cachedEntry).not.toBeNull();
            expect(cachedEntry?.path).toBe(originalEntry.path);
            expect(cachedEntry?.type).toBe('audio');
            expect(cachedEntry?.metadata?.voice).toBe('es-ES-Journey-D');
        });

        it('debe retornar null cuando texto o voz son diferentes', () => {
            const ttsParams1 = {
                text: 'Primer texto',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.0,
                pitch: 0
            };

            const ttsParams2 = {
                text: 'Segundo texto diferente', // texto diferente
                voice: 'es-ES-Journey-D',
                speakingRate: 1.0,
                pitch: 0
            };

            const key1 = cacheManager.generateKey(ttsParams1);
            cacheManager.set(key1, 'audio', testFilePath);

            const key2 = cacheManager.generateKey(ttsParams2);
            const cachedEntry = cacheManager.get(key2);

            // No debe encontrar porque el texto es diferente
            expect(cachedEntry).toBeNull();
        });

        it('debe retornar null cuando los parámetros de voz son diferentes', () => {
            const ttsParams1 = {
                text: 'Mismo texto',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.1,
                pitch: 0
            };

            const ttsParams2 = {
                text: 'Mismo texto',
                voice: 'es-ES-Standard-A', // voz diferente
                speakingRate: 1.1,
                pitch: 0
            };

            const key1 = cacheManager.generateKey(ttsParams1);
            cacheManager.set(key1, 'audio', testFilePath);

            const key2 = cacheManager.generateKey(ttsParams2);
            const cachedEntry = cacheManager.get(key2);

            // No debe encontrar porque la voz es diferente
            expect(cachedEntry).toBeNull();
        });

        it('debe usar TTL de 7 días para audios TTS', () => {
            const ttsParams = {
                text: 'Audio de prueba TTL',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.0,
                pitch: 0
            };

            const key = cacheManager.generateKey(ttsParams);
            const entry = cacheManager.set(key, 'audio', testFilePath);

            const diffMs = entry.expiresAt.getTime() - entry.createdAt.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            expect(Math.round(diffDays)).toBe(7);
        });

        it('debe manejar parámetros SSML adicionales para variabilidad de voz', () => {
            // Caso de uso: REQ-2.2.3 - variar speakingRate (0.95-1.10) y pitch (-2 a +2)
            const ttsParamsVideo1 = {
                text: 'Contenido para video 1',
                voice: 'es-ES-Journey-D',
                speakingRate: 0.98, // variado para video 1
                pitch: 1.5,
                ssmlMarks: true
            };

            const ttsParamsVideo2 = {
                text: 'Contenido para video 1',
                voice: 'es-ES-Journey-D',
                speakingRate: 1.05, // variado para video 2
                pitch: -0.5,
                ssmlMarks: true
            };

            const key1 = cacheManager.generateKey(ttsParamsVideo1);
            const key2 = cacheManager.generateKey(ttsParamsVideo2);

            // Diferentes parámetros de variabilidad = claves diferentes
            // Esto asegura que cada video tenga su propio audio único
            expect(key1).not.toBe(key2);

            // Verificar que ambos se pueden almacenar
            const entry1 = cacheManager.set(key1, 'audio', testFilePath);
            const entry2 = cacheManager.set(key2, 'audio', testFilePath);

            expect(cacheManager.has(key1)).toBe(true);
            expect(cacheManager.has(key2)).toBe(true);
        });

        it('debe soportar pool de voces por idioma para variabilidad', () => {
            // REQ-2.2.1: pool de 5+ voces por idioma
            const voicePool = [
                'es-ES-Journey-D',
                'es-ES-Standard-A',
                'es-ES-Standard-B',
                'es-ES-Wavenet-C',
                'es-ES-Neural2-A'
            ];

            const text = 'Texto idéntico para probar pool de voces';
            const keys: string[] = [];

            // Generar claves para cada voz del pool
            for (const voice of voicePool) {
                const params = {
                    text,
                    voice,
                    speakingRate: 1.0,
                    pitch: 0
                };
                keys.push(cacheManager.generateKey(params));
            }

            // Todas las claves deben ser diferentes porque la voz es diferente
            const uniqueKeys = new Set(keys);
            expect(uniqueKeys.size).toBe(voicePool.length);
        });
    });
});
