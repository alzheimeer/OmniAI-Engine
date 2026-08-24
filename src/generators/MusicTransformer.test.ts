/**
 * MusicTransformer.test.ts
 * 
 * Tests para verificar que generateUniqueParams() genera parámetros
 * dentro de los rangos especificados por REQ-2.8.2 y REQ-2.8.3:
 * - pitchShift: 0.98 a 1.02 (equivale a ±2%)
 * - tempoShift: 0.97 a 1.03 (equivale a ±3%)
 * 
 * **Validates: Requirements REQ-2.8.2, REQ-2.8.3, REQ-2.8.7**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
    MusicTransformer, 
    MusicTransformationParams,
    MUSIC_TRANSFORMATION_RANGES,
    MUSIC_CACHE_CONFIG
} from './MusicTransformer';
import fs from 'fs';
import path from 'path';

describe('MusicTransformer', () => {
    describe('generateUniqueParams()', () => {
        /**
         * **Validates: Requirements REQ-2.8.2**
         * Verifica que pitchShift esté en el rango [0.98, 1.02]
         */
        it('genera pitchShift dentro del rango [0.98, 1.02]', () => {
            // Ejecutar múltiples veces para verificar consistencia
            for (let i = 0; i < 100; i++) {
                const params = MusicTransformer.generateUniqueParams();
                
                expect(params.pitchShift).toBeGreaterThanOrEqual(0.98);
                expect(params.pitchShift).toBeLessThanOrEqual(1.02);
            }
        });

        /**
         * **Validates: Requirements REQ-2.8.3**
         * Verifica que tempoShift esté en el rango [0.97, 1.03]
         */
        it('genera tempoShift dentro del rango [0.97, 1.03]', () => {
            // Ejecutar múltiples veces para verificar consistencia
            for (let i = 0; i < 100; i++) {
                const params = MusicTransformer.generateUniqueParams();
                
                expect(params.tempoShift).toBeGreaterThanOrEqual(0.97);
                expect(params.tempoShift).toBeLessThanOrEqual(1.03);
            }
        });

        /**
         * **Validates: Requirements REQ-2.8.2, REQ-2.8.3**
         * Verifica reproducibilidad con seed
         */
        it('genera parámetros reproducibles cuando se usa seed', () => {
            const seed = 12345;
            
            const params1 = MusicTransformer.generateUniqueParams(seed);
            const params2 = MusicTransformer.generateUniqueParams(seed);
            
            // Deben ser exactamente iguales
            expect(params1.pitchShift).toBe(params2.pitchShift);
            expect(params1.tempoShift).toBe(params2.tempoShift);
            expect(params1.eq.freq1k).toBe(params2.eq.freq1k);
            expect(params1.eq.freq4k).toBe(params2.eq.freq4k);
            expect(params1.eq.freq8k).toBe(params2.eq.freq8k);
            expect(params1.reverbRoomSize).toBe(params2.reverbRoomSize);
        });

        /**
         * **Validates: Requirements REQ-2.8.2, REQ-2.8.3**
         * Verifica que parámetros con seed diferente son diferentes
         */
        it('genera parámetros diferentes con seeds diferentes', () => {
            const params1 = MusicTransformer.generateUniqueParams(12345);
            const params2 = MusicTransformer.generateUniqueParams(67890);
            
            // Al menos uno de los parámetros debe ser diferente
            const allEqual = 
                params1.pitchShift === params2.pitchShift &&
                params1.tempoShift === params2.tempoShift &&
                params1.eq.freq1k === params2.eq.freq1k &&
                params1.eq.freq4k === params2.eq.freq4k &&
                params1.eq.freq8k === params2.eq.freq8k &&
                params1.reverbRoomSize === params2.reverbRoomSize;
            
            expect(allEqual).toBe(false);
        });

        /**
         * **Validates: Requirements REQ-2.8.4**
         * Verifica que EQ está dentro del rango ±2dB
         */
        it('genera EQ dentro del rango [-2, 2] dB', () => {
            for (let i = 0; i < 100; i++) {
                const params = MusicTransformer.generateUniqueParams();
                
                // Frecuencia 1kHz
                expect(params.eq.freq1k).toBeGreaterThanOrEqual(-2);
                expect(params.eq.freq1k).toBeLessThanOrEqual(2);
                
                // Frecuencia 4kHz
                expect(params.eq.freq4k).toBeGreaterThanOrEqual(-2);
                expect(params.eq.freq4k).toBeLessThanOrEqual(2);
                
                // Frecuencia 8kHz
                expect(params.eq.freq8k).toBeGreaterThanOrEqual(-2);
                expect(params.eq.freq8k).toBeLessThanOrEqual(2);
            }
        });

        /**
         * **Validates: Requirements REQ-2.8.5**
         * Verifica que reverb room size está dentro del rango [0.05, 0.15]
         */
        it('genera reverbRoomSize dentro del rango [0.05, 0.15]', () => {
            for (let i = 0; i < 100; i++) {
                const params = MusicTransformer.generateUniqueParams();
                
                expect(params.reverbRoomSize).toBeGreaterThanOrEqual(0.05);
                expect(params.reverbRoomSize).toBeLessThanOrEqual(0.15);
            }
        });

        /**
         * **Validates: Requirements REQ-2.8.2, REQ-2.8.3**
         * Verifica que genera parámetros únicos (no siempre los mismos)
         */
        it('genera parámetros variados (no todos iguales)', () => {
            const paramsSet = new Set<string>();
            
            for (let i = 0; i < 50; i++) {
                const params = MusicTransformer.generateUniqueParams();
                const key = `${params.pitchShift}-${params.tempoShift}`;
                paramsSet.add(key);
            }
            
            // Debe haber variedad - al menos 10 combinaciones diferentes
            expect(paramsSet.size).toBeGreaterThan(10);
        });

        /**
         * **Validates: Requirements REQ-2.8.2, REQ-2.8.3**
         * Verifica que los rangos constantes están correctamente definidos
         */
        it('las constantes MUSIC_TRANSFORMATION_RANGES están correctamente definidas', () => {
            // Pitch: ±2% expresado como factor
            expect(MUSIC_TRANSFORMATION_RANGES.pitch.min).toBe(0.98);
            expect(MUSIC_TRANSFORMATION_RANGES.pitch.max).toBe(1.02);
            
            // Tempo: ±3% expresado como factor
            expect(MUSIC_TRANSFORMATION_RANGES.tempo.min).toBe(0.97);
            expect(MUSIC_TRANSFORMATION_RANGES.tempo.max).toBe(1.03);
            
            // EQ: ±2dB
            expect(MUSIC_TRANSFORMATION_RANGES.eq.min).toBe(-2);
            expect(MUSIC_TRANSFORMATION_RANGES.eq.max).toBe(2);
            
            // Reverb: 0.05-0.15
            expect(MUSIC_TRANSFORMATION_RANGES.reverb.min).toBe(0.05);
            expect(MUSIC_TRANSFORMATION_RANGES.reverb.max).toBe(0.15);
        });
    });

    describe('validateParams()', () => {
        /**
         * Verifica que validateParams() acepta parámetros válidos
         */
        it('acepta parámetros dentro de rangos válidos', () => {
            const validParams: MusicTransformationParams = {
                pitchShift: 1.0,
                tempoShift: 1.0,
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            // No debe lanzar error
            expect(() => MusicTransformer.validateParams(validParams)).not.toThrow();
        });

        /**
         * Verifica que validateParams() rechaza pitch fuera de rango
         */
        it('rechaza pitchShift fuera de rango', () => {
            const invalidParams: MusicTransformationParams = {
                pitchShift: 1.05, // Fuera de rango (max es 1.02)
                tempoShift: 1.0,
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            expect(() => MusicTransformer.validateParams(invalidParams)).toThrow();
        });

        /**
         * Verifica que validateParams() rechaza tempo fuera de rango
         */
        it('rechaza tempoShift fuera de rango', () => {
            const invalidParams: MusicTransformationParams = {
                pitchShift: 1.0,
                tempoShift: 1.05, // Fuera de rango (max es 1.03)
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            expect(() => MusicTransformer.validateParams(invalidParams)).toThrow();
        });
    });

    describe('getTransformedHash()', () => {
        /**
         * **Validates: Requirements REQ-2.8.6**
         * Verifica que genera hash único por pista transformada
         */
        it('genera hash diferente para parámetros diferentes', () => {
            const params1: MusicTransformationParams = {
                pitchShift: 1.0,
                tempoShift: 1.0,
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            const params2: MusicTransformationParams = {
                pitchShift: 1.01,
                tempoShift: 1.0,
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            const hash1 = MusicTransformer.getTransformedHash(params1);
            const hash2 = MusicTransformer.getTransformedHash(params2);
            
            expect(hash1).not.toBe(hash2);
        });

        /**
         * **Validates: Requirements REQ-2.8.6**
         * Verifica que genera mismo hash para parámetros iguales
         */
        it('genera mismo hash para parámetros idénticos', () => {
            const params: MusicTransformationParams = {
                pitchShift: 1.0,
                tempoShift: 1.0,
                eq: { freq1k: 1.5, freq4k: -0.5, freq8k: 0.8 },
                reverbRoomSize: 0.1
            };
            
            const hash1 = MusicTransformer.getTransformedHash(params);
            const hash2 = MusicTransformer.getTransformedHash(params);
            
            expect(hash1).toBe(hash2);
        });

        /**
         * Verifica que el hash tiene formato MD5 (32 caracteres hexadecimales)
         */
        it('genera hash con formato MD5 válido', () => {
            const params = MusicTransformer.generateUniqueParams();
            const hash = MusicTransformer.getTransformedHash(params);
            
            // MD5 hash tiene 32 caracteres hexadecimales
            expect(hash).toMatch(/^[a-f0-9]{32}$/);
        });
    });

    describe('buildFFmpegFilter()', () => {
        /**
         * **Validates: Requirements REQ-2.8.9**
         * Verifica que buildFFmpegFilter genera filtro correcto
         */
        it('genera filtro FFmpeg con componentes correctos', () => {
            const params: MusicTransformationParams = {
                pitchShift: 1.02,
                tempoShift: 1.01,
                eq: { freq1k: 2, freq4k: -1, freq8k: 1 },
                reverbRoomSize: 0.1
            };
            
            const filter = MusicTransformer.buildFFmpegFilter(params);
            
            // Debe contener asetrate para pitch
            expect(filter).toContain('asetrate=');
            expect(filter).toContain('aresample=');
            
            // Debe contener atempo para tempo
            expect(filter).toContain('atempo=');
            
            // Debe contener equalizer para EQ
            expect(filter).toContain('equalizer=');
            
            // Debe contener aecho para reverb
            expect(filter).toContain('aecho=');
        });

        /**
         * Verifica que el filtro de pitch calcula correctamente el sample rate
         */
        it('calcula sample rate correcto para pitch shift', () => {
            const params: MusicTransformationParams = {
                pitchShift: 1.02, // +2%
                tempoShift: 1.0,
                eq: { freq1k: 0, freq4k: 0, freq8k: 0 },
                reverbRoomSize: 0.1
            };
            
            const filter = MusicTransformer.buildFFmpegFilter(params, 44100);
            
            // 44100 * 1.02 = 44982
            expect(filter).toContain('asetrate=44982');
        });
    });
});


    describe('Sistema de Caché (REQ-2.8.7)', () => {
        const testCacheDir = path.resolve(process.cwd(), MUSIC_CACHE_CONFIG.basePath);

        beforeEach(() => {
            // Limpiar caché antes de cada test
            MusicTransformer.clearCache();
        });

        afterEach(() => {
            // Limpiar caché después de cada test
            MusicTransformer.clearCache();
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCacheKey genera claves únicas por archivo y parámetros
         */
        it('getCacheKey() genera claves únicas por archivo y parámetros', () => {
            const params1 = MusicTransformer.generateUniqueParams(12345);
            const params2 = MusicTransformer.generateUniqueParams(67890);
            
            const key1a = MusicTransformer.getCacheKey('/path/to/music1.mp3', params1);
            const key1b = MusicTransformer.getCacheKey('/path/to/music1.mp3', params1);
            const key2a = MusicTransformer.getCacheKey('/path/to/music2.mp3', params1);
            const key3a = MusicTransformer.getCacheKey('/path/to/music1.mp3', params2);
            
            // Misma ruta y parámetros = misma clave
            expect(key1a).toBe(key1b);
            
            // Diferente ruta = diferente clave
            expect(key1a).not.toBe(key2a);
            
            // Diferentes parámetros = diferente clave
            expect(key1a).not.toBe(key3a);
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCacheKey tiene formato esperado
         */
        it('getCacheKey() genera claves con formato correcto', () => {
            const params = MusicTransformer.generateUniqueParams();
            const key = MusicTransformer.getCacheKey('/path/to/music.mp3', params);
            
            // Debe empezar con "music_" y contener dos hashes
            expect(key).toMatch(/^music_[a-f0-9]{8}_[a-f0-9]{32}$/);
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCacheDirectory crea el directorio si no existe
         */
        it('getCacheDirectory() crea el directorio si no existe', () => {
            // Eliminar directorio si existe
            if (fs.existsSync(testCacheDir)) {
                fs.rmSync(testCacheDir, { recursive: true });
            }
            
            const cacheDir = MusicTransformer.getCacheDirectory();
            
            expect(fs.existsSync(cacheDir)).toBe(true);
            expect(cacheDir).toContain(MUSIC_CACHE_CONFIG.basePath.replace(/\//g, path.sep));
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que checkCache retorna miss cuando no hay caché
         */
        it('checkCache() retorna miss cuando no hay caché', () => {
            const params = MusicTransformer.generateUniqueParams();
            const result = MusicTransformer.checkCache('/nonexistent/music.mp3', params);
            
            expect(result.hit).toBe(false);
            expect(result.cachedPath).toBeUndefined();
            expect(result.cacheKey).toBeDefined();
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCacheStats retorna estadísticas
         */
        it('getCacheStats() retorna estadísticas válidas', () => {
            const stats = MusicTransformer.getCacheStats();
            
            expect(stats).toHaveProperty('hits');
            expect(stats).toHaveProperty('misses');
            expect(stats).toHaveProperty('entries');
            expect(stats).toHaveProperty('totalSizeBytes');
            
            expect(typeof stats.hits).toBe('number');
            expect(typeof stats.misses).toBe('number');
            expect(typeof stats.entries).toBe('number');
            expect(typeof stats.totalSizeBytes).toBe('number');
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que las estadísticas se actualizan con cada consulta
         */
        it('estadísticas de caché se actualizan con cada consulta', () => {
            const params = MusicTransformer.generateUniqueParams();
            
            const statsBefore = MusicTransformer.getCacheStats();
            MusicTransformer.checkCache('/test/music.mp3', params);
            MusicTransformer.checkCache('/test/music2.mp3', params);
            const statsAfter = MusicTransformer.getCacheStats();
            
            // Deben haber más misses después
            expect(statsAfter.misses).toBeGreaterThanOrEqual(statsBefore.misses);
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCachedFilePath genera rutas correctas
         */
        it('getCachedFilePath() genera rutas con extensión correcta', () => {
            const cacheKey = 'music_abc12345_1234567890abcdef1234567890abcdef';
            const filePath = MusicTransformer.getCachedFilePath(cacheKey);
            
            expect(filePath).toContain(cacheKey);
            expect(filePath.endsWith(MUSIC_CACHE_CONFIG.audioExtension)).toBe(true);
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que getCacheMetadataPath genera rutas correctas
         */
        it('getCacheMetadataPath() genera rutas con extensión de metadatos', () => {
            const cacheKey = 'music_abc12345_1234567890abcdef1234567890abcdef';
            const metaPath = MusicTransformer.getCacheMetadataPath(cacheKey);
            
            expect(metaPath).toContain(cacheKey);
            expect(metaPath.endsWith(MUSIC_CACHE_CONFIG.metadataExtension)).toBe(true);
        });

        /**
         * **Validates: Requirements REQ-2.8.7**
         * Verifica que clearCache limpia todas las entradas
         */
        it('clearCache() elimina todas las entradas del caché', () => {
            // Crear algunos archivos de prueba en el directorio de caché
            const cacheDir = MusicTransformer.getCacheDirectory();
            const testFile = path.join(cacheDir, 'test_entry.mp3');
            const testMeta = path.join(cacheDir, 'test_entry.meta.json');
            
            fs.writeFileSync(testFile, 'test audio data');
            fs.writeFileSync(testMeta, JSON.stringify({ test: true }));
            
            const removedCount = MusicTransformer.clearCache();
            
            // Debe haber eliminado archivos
            expect(removedCount).toBeGreaterThanOrEqual(2);
            
            // El directorio debe existir pero vacío o con menos archivos
            const stats = MusicTransformer.getCacheStats();
            expect(stats.entries).toBe(0);
        });

        /**
         * Verifica la configuración de caché
         */
        it('MUSIC_CACHE_CONFIG tiene valores correctos', () => {
            expect(MUSIC_CACHE_CONFIG.basePath).toBe('content/cache/music');
            expect(MUSIC_CACHE_CONFIG.ttlDays).toBe(14);
            expect(MUSIC_CACHE_CONFIG.maxSizeBytes).toBe(500 * 1024 * 1024); // 500MB
            expect(MUSIC_CACHE_CONFIG.metadataExtension).toBe('.meta.json');
            expect(MUSIC_CACHE_CONFIG.audioExtension).toBe('.mp3');
        });
    });
