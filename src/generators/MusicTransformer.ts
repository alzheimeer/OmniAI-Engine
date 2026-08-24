/**
 * MusicTransformer.ts
 * 
 * Sistema de transformación para evasión de Content ID musical de YouTube.
 * Aplica transformaciones sutiles a pistas de música de bancos gratuitos
 * (Pixabay, Free Music Archive) para evitar matches de Content ID.
 * 
 * REQ-2.8.1: Crear MusicTransformer.ts que altere pistas de música antes de mezclar con voz
 * REQ-2.8.2: Pitch shift sutil: ±2% (equivale a ±0.35 semitonos)
 * REQ-2.8.3: Tempo shift sutil: ±3% sin distorsión audible
 * REQ-2.8.4: EQ único por video: boost/cut aleatorio ±2dB en 1kHz, 4kHz, 8kHz
 * REQ-2.8.5: Reverb sutil único: room size aleatorio 0.05-0.15
 * REQ-2.8.6: Generar hash único por pista transformada
 * REQ-2.8.7: Cachear pistas transformadas por parámetros
 * 
 * Justificación: Pistas de bancos gratuitos están indexadas en Content ID de YouTube.
 * Las transformaciones son imperceptibles al oído pero suficientes para evitar matches.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// ===== INTERFACES =====

/**
 * Configuración de ecualización para transformación de música.
 * Cada frecuencia tiene un boost/cut en dB para crear una firma de audio única.
 */
export interface EQConfig {
    /** Boost/cut en dB para frecuencia de 1kHz (±2dB) */
    freq1k: number;
    
    /** Boost/cut en dB para frecuencia de 4kHz (±2dB) */
    freq4k: number;
    
    /** Boost/cut en dB para frecuencia de 8kHz (±2dB) */
    freq8k: number;
}

/**
 * Parámetros de transformación para pistas de música.
 * Diseñados para ser imperceptibles pero suficientes para evadir Content ID.
 */
export interface MusicTransformationParams {
    /** 
     * Pitch shift como factor multiplicador.
     * Rango: 0.98 a 1.02 (equivale a ±2% o ±0.35 semitonos)
     * Ejemplo: 1.02 = 2% más agudo, 0.98 = 2% más grave
     */
    pitchShift: number;
    
    /** 
     * Tempo shift como factor multiplicador.
     * Rango: 0.97 a 1.03 (equivale a ±3%)
     * Ejemplo: 1.03 = 3% más rápido, 0.97 = 3% más lento
     */
    tempoShift: number;
    
    /** Configuración de ecualización por frecuencia */
    eq: EQConfig;
    
    /** 
     * Tamaño de sala para reverb sutil.
     * Rango: 0.05 a 0.15 (muy sutil, casi imperceptible)
     */
    reverbRoomSize: number;
}

/**
 * Resultado de una transformación de pista de música.
 * Contiene información sobre el output generado y los parámetros aplicados.
 */
export interface MusicTransformResult {
    /** Ruta absoluta a la pista transformada */
    outputPath: string;
    
    /** Hash único de los parámetros de transformación (para cacheo) */
    hash: string;
    
    /** Parámetros que se aplicaron a la pista */
    appliedParams: MusicTransformationParams;
    
    /** Duración original de la pista en segundos */
    originalDuration: number;
    
    /** Duración de la pista transformada en segundos (puede variar por tempo shift) */
    transformedDuration: number;
    
    /** Indica si el resultado proviene del caché */
    fromCache: boolean;
}

/**
 * Resultado de una consulta al caché de música transformada.
 * REQ-2.8.7: Cachear pistas transformadas por parámetros
 */
export interface MusicCacheResult {
    /** Indica si hubo un hit de caché */
    hit: boolean;
    
    /** Ruta al archivo cacheado (solo si hit=true) */
    cachedPath?: string;
    
    /** Clave de caché utilizada */
    cacheKey: string;
    
    /** Metadatos del caché (solo si hit=true) */
    metadata?: MusicCacheMetadata;
}

/**
 * Metadatos almacenados junto con cada pista cacheada.
 * Permite validación y mantenimiento del caché.
 */
export interface MusicCacheMetadata {
    /** Ruta al archivo original */
    originalPath: string;
    
    /** Parámetros de transformación aplicados */
    params: MusicTransformationParams;
    
    /** Timestamp de creación del caché (ISO 8601) */
    createdAt: string;
    
    /** Duración original en segundos */
    originalDuration: number;
    
    /** Duración transformada en segundos */
    transformedDuration: number;
    
    /** Hash MD5 de los parámetros */
    paramsHash: string;
}

/**
 * Estadísticas del sistema de caché.
 * Útil para métricas y optimización.
 */
export interface MusicCacheStats {
    /** Número total de hits de caché */
    hits: number;
    
    /** Número total de misses de caché */
    misses: number;
    
    /** Número de entradas actuales en caché */
    entries: number;
    
    /** Tamaño total del caché en bytes */
    totalSizeBytes: number;
}

// ===== CONSTANTES =====

/**
 * Rangos de valores para cada parámetro de transformación.
 * Estos rangos están diseñados para:
 * - Ser imperceptibles al oído humano
 * - Generar suficiente variación para evadir Content ID
 * 
 * NOTA: Los rangos de pitch y tempo están expresados como factores multiplicadores,
 * NO como porcentajes directos. Para calcular el porcentaje:
 * - pitch 1.02 = +2%, pitch 0.98 = -2%
 * - tempo 1.03 = +3%, tempo 0.97 = -3%
 */
export const MUSIC_TRANSFORMATION_RANGES = {
    /** 
     * Pitch shift: ±2% (equivale a ±0.35 semitonos)
     * Factor: 0.98 a 1.02
     */
    pitch: { min: 0.98, max: 1.02 },
    
    /** 
     * Tempo shift: ±3% sin distorsión audible
     * Factor: 0.97 a 1.03
     */
    tempo: { min: 0.97, max: 1.03 },
    
    /** 
     * EQ: boost/cut ±2dB en frecuencias específicas
     * Valor directo en dB: -2 a +2
     */
    eq: { min: -2, max: 2 },
    
    /** 
     * Reverb room size: muy sutil
     * Valor directo: 0.05 a 0.15
     */
    reverb: { min: 0.05, max: 0.15 }
} as const;

/**
 * Configuración del sistema de caché para pistas transformadas.
 * REQ-2.8.7: Cachear pistas transformadas por parámetros
 * REQ-4.1.6: TTL de música 14 días
 */
export const MUSIC_CACHE_CONFIG = {
    /** Directorio base para el caché de música */
    basePath: 'content/cache/music',
    
    /** TTL (Time To Live) en días para entradas de caché */
    ttlDays: 14,
    
    /** Tamaño máximo del caché en bytes (500MB) */
    maxSizeBytes: 500 * 1024 * 1024,
    
    /** Extensión para archivos de metadatos */
    metadataExtension: '.meta.json',
    
    /** Extensión para archivos de audio cacheados */
    audioExtension: '.mp3'
} as const;

// ===== CLASE PRINCIPAL =====

/**
 * MusicTransformer - Clase para aplicar transformaciones de evasión de Content ID a música.
 * 
 * Esta clase implementa la lógica para:
 * - Generar parámetros de transformación únicos por pista
 * - Aplicar pitch shift, tempo shift, EQ y reverb sutiles
 * - Generar hash único para cacheo de pistas transformadas
 * - Construir filtros FFmpeg para procesamiento de audio
 * 
 * Las transformaciones se aplican ANTES de mezclar con la voz (integración con AudioMixer).
 * 
 * Comando FFmpeg de referencia:
 * ffmpeg -i music.mp3 \
 *   -af "asetrate=44100*1.02,aresample=44100,\
 *        equalizer=f=1000:t=q:w=2:g=2,\
 *        equalizer=f=4000:t=q:w=2:g=-1,\
 *        equalizer=f=8000:t=q:w=2:g=1,\
 *        aecho=0.8:0.88:60:0.4" \
 *   -c:a libmp3lame -q:a 2 \
 *   music_transformed.mp3
 */
export class MusicTransformer {
    // ===== GENERACIÓN DE PARÁMETROS =====

    /**
     * Genera un conjunto único de parámetros de transformación de música.
     * Cada llamada produce parámetros diferentes para garantizar unicidad.
     * 
     * @param seed - Semilla opcional para reproducibilidad en tests
     * @returns Parámetros de transformación únicos
     * 
     * NOTA: Cuando seed está presente, TODOS los parámetros son reproducibles
     * para facilitar testing determinístico.
     */
    public static generateUniqueParams(seed?: number): MusicTransformationParams {
        // Si hay seed, usamos una función determinística (para tests)
        const random = seed !== undefined 
            ? MusicTransformer.seededRandom(seed) 
            : () => Math.random();

        const randomInRange = (min: number, max: number, decimals: number = 3): number => {
            const value = random() * (max - min) + min;
            return Number(value.toFixed(decimals));
        };

        return {
            // Pitch shift: ±2% (factor 0.98 a 1.02)
            pitchShift: randomInRange(
                MUSIC_TRANSFORMATION_RANGES.pitch.min, 
                MUSIC_TRANSFORMATION_RANGES.pitch.max,
                4  // Mayor precisión para pitch
            ),
            
            // Tempo shift: ±3% (factor 0.97 a 1.03)
            tempoShift: randomInRange(
                MUSIC_TRANSFORMATION_RANGES.tempo.min, 
                MUSIC_TRANSFORMATION_RANGES.tempo.max,
                4  // Mayor precisión para tempo
            ),
            
            // EQ: boost/cut ±2dB en cada frecuencia
            eq: {
                freq1k: randomInRange(
                    MUSIC_TRANSFORMATION_RANGES.eq.min, 
                    MUSIC_TRANSFORMATION_RANGES.eq.max,
                    1  // 1 decimal para dB
                ),
                freq4k: randomInRange(
                    MUSIC_TRANSFORMATION_RANGES.eq.min, 
                    MUSIC_TRANSFORMATION_RANGES.eq.max,
                    1
                ),
                freq8k: randomInRange(
                    MUSIC_TRANSFORMATION_RANGES.eq.min, 
                    MUSIC_TRANSFORMATION_RANGES.eq.max,
                    1
                )
            },
            
            // Reverb room size: 0.05 a 0.15
            reverbRoomSize: randomInRange(
                MUSIC_TRANSFORMATION_RANGES.reverb.min, 
                MUSIC_TRANSFORMATION_RANGES.reverb.max,
                3
            )
        };
    }

    /**
     * Genera un número aleatorio dentro de un rango dado.
     * Versión pública para uso externo.
     * 
     * @param min - Valor mínimo (inclusive)
     * @param max - Valor máximo (inclusive)
     * @param decimals - Número de decimales (default: 3)
     * @returns Número aleatorio dentro del rango
     */
    public static randomInRange(min: number, max: number, decimals: number = 3): number {
        const value = Math.random() * (max - min) + min;
        return Number(value.toFixed(decimals));
    }

    // ===== HASH Y CACHEO =====

    /**
     * Genera hash único de los parámetros de transformación.
     * Usado para:
     * - Verificar unicidad de transformaciones
     * - Identificar pistas en caché por sus parámetros
     * 
     * @param params - Parámetros de transformación
     * @returns Hash MD5 de 32 caracteres
     */
    public static getTransformedHash(params: MusicTransformationParams): string {
        // Serializar parámetros de forma determinística
        const data = JSON.stringify({
            pitchShift: params.pitchShift,
            tempoShift: params.tempoShift,
            eq: {
                freq1k: params.eq.freq1k,
                freq4k: params.eq.freq4k,
                freq8k: params.eq.freq8k
            },
            reverbRoomSize: params.reverbRoomSize
        });
        
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Genera una clave de caché única para una pista transformada.
     * Combina el nombre del archivo original con el hash de parámetros.
     * 
     * @param originalPath - Ruta al archivo de música original
     * @param params - Parámetros de transformación
     * @returns Clave de caché única
     */
    public static getCacheKey(originalPath: string, params: MusicTransformationParams): string {
        const paramsHash = MusicTransformer.getTransformedHash(params);
        const pathHash = crypto.createHash('md5').update(originalPath).digest('hex').substring(0, 8);
        return `music_${pathHash}_${paramsHash}`;
    }

    // ===== CONSTRUCCIÓN DE FILTROS FFMPEG =====

    /**
     * Construye el filtro FFmpeg completo para transformación de música.
     * 
     * Orden de filtros (crítico para calidad de audio):
     * 1. asetrate + aresample: Pitch shift (cambia sample rate y resamples)
     * 2. atempo: Tempo shift (mantiene pitch, cambia velocidad)
     * 3. equalizer x3: EQ en 1kHz, 4kHz, 8kHz
     * 4. aecho: Reverb sutil (simula sala pequeña)
     * 
     * @param params - Parámetros de transformación
     * @param sampleRate - Sample rate del audio (default: 44100)
     * @returns String con el filtro FFmpeg completo
     */
    public static buildFFmpegFilter(params: MusicTransformationParams, sampleRate: number = 44100): string {
        const filters: string[] = [];

        // 1. PITCH SHIFT: Usando asetrate + aresample
        // asetrate cambia el sample rate (afecta pitch y velocidad)
        // aresample restaura el sample rate original (mantiene pitch, corrige velocidad)
        const pitchedSampleRate = Math.round(sampleRate * params.pitchShift);
        filters.push(`asetrate=${pitchedSampleRate}`);
        filters.push(`aresample=${sampleRate}`);

        // 2. TEMPO SHIFT: Usando atempo
        // atempo tiene rango válido 0.5-2.0, nuestro rango 0.97-1.03 está dentro
        // NOTA: Se aplica DESPUÉS del pitch para no duplicar el efecto de velocidad
        filters.push(`atempo=${params.tempoShift.toFixed(4)}`);

        // 3. EQ: Tres bandas de ecualización
        // equalizer=f={freq}:t=q:w=2:g={gain}
        // - f: frecuencia central en Hz
        // - t=q: tipo de filtro (Q factor)
        // - w=2: ancho de banda (Q=2)
        // - g: ganancia en dB
        
        // Banda 1kHz
        if (Math.abs(params.eq.freq1k) > 0.1) {
            filters.push(`equalizer=f=1000:t=q:w=2:g=${params.eq.freq1k.toFixed(1)}`);
        }
        
        // Banda 4kHz
        if (Math.abs(params.eq.freq4k) > 0.1) {
            filters.push(`equalizer=f=4000:t=q:w=2:g=${params.eq.freq4k.toFixed(1)}`);
        }
        
        // Banda 8kHz
        if (Math.abs(params.eq.freq8k) > 0.1) {
            filters.push(`equalizer=f=8000:t=q:w=2:g=${params.eq.freq8k.toFixed(1)}`);
        }

        // 4. REVERB: Usando aecho para simular sala pequeña
        // aecho=in_gain:out_gain:delays:decays
        // Para reverb sutil, usamos delays cortos y decay basado en room size
        const reverbDelay = Math.round(50 + params.reverbRoomSize * 100);  // 55-65ms
        const reverbDecay = params.reverbRoomSize * 2;  // 0.1-0.3
        filters.push(`aecho=0.8:0.9:${reverbDelay}:${reverbDecay.toFixed(2)}`);

        return filters.join(',');
    }

    /**
     * Construye SOLO el filtro de pitch shift.
     * Útil para aplicar transformaciones individuales.
     * 
     * @param pitchFactor - Factor de pitch (0.98-1.02)
     * @param sampleRate - Sample rate original (default: 44100)
     * @returns String con el filtro de pitch FFmpeg
     */
    public static buildPitchFilter(pitchFactor: number, sampleRate: number = 44100): string {
        const pitchedSampleRate = Math.round(sampleRate * pitchFactor);
        return `asetrate=${pitchedSampleRate},aresample=${sampleRate}`;
    }

    /**
     * Construye SOLO el filtro de tempo shift.
     * Útil para aplicar transformaciones individuales.
     * 
     * @param tempoFactor - Factor de tempo (0.97-1.03)
     * @returns String con el filtro de tempo FFmpeg
     */
    public static buildTempoFilter(tempoFactor: number): string {
        return `atempo=${tempoFactor.toFixed(4)}`;
    }

    /**
     * Construye SOLO el filtro de EQ.
     * Útil para aplicar transformaciones individuales.
     * 
     * @param eq - Configuración de EQ
     * @returns String con el filtro de EQ FFmpeg
     */
    public static buildEQFilter(eq: EQConfig): string {
        const filters: string[] = [];
        
        if (Math.abs(eq.freq1k) > 0.1) {
            filters.push(`equalizer=f=1000:t=q:w=2:g=${eq.freq1k.toFixed(1)}`);
        }
        if (Math.abs(eq.freq4k) > 0.1) {
            filters.push(`equalizer=f=4000:t=q:w=2:g=${eq.freq4k.toFixed(1)}`);
        }
        if (Math.abs(eq.freq8k) > 0.1) {
            filters.push(`equalizer=f=8000:t=q:w=2:g=${eq.freq8k.toFixed(1)}`);
        }
        
        return filters.length > 0 ? filters.join(',') : 'anull';  // anull = no-op filter
    }

    /**
     * Construye SOLO el filtro de reverb.
     * Útil para aplicar transformaciones individuales.
     * 
     * @param roomSize - Tamaño de sala (0.05-0.15)
     * @returns String con el filtro de reverb FFmpeg
     */
    public static buildReverbFilter(roomSize: number): string {
        const delay = Math.round(50 + roomSize * 100);
        const decay = roomSize * 2;
        return `aecho=0.8:0.9:${delay}:${decay.toFixed(2)}`;
    }

    // ===== VALIDACIÓN =====

    /**
     * Valida que los parámetros de transformación estén dentro de los rangos permitidos.
     * 
     * @param params - Parámetros a validar
     * @throws Error si algún valor está fuera de rango
     */
    public static validateParams(params: MusicTransformationParams): void {
        const { pitch, tempo, eq, reverb } = MUSIC_TRANSFORMATION_RANGES;

        // Validar pitch shift
        if (params.pitchShift < pitch.min || params.pitchShift > pitch.max) {
            throw new Error(
                `Pitch shift ${params.pitchShift} fuera de rango [${pitch.min}, ${pitch.max}]`
            );
        }

        // Validar tempo shift
        if (params.tempoShift < tempo.min || params.tempoShift > tempo.max) {
            throw new Error(
                `Tempo shift ${params.tempoShift} fuera de rango [${tempo.min}, ${tempo.max}]`
            );
        }

        // Validar EQ 1kHz
        if (params.eq.freq1k < eq.min || params.eq.freq1k > eq.max) {
            throw new Error(
                `EQ 1kHz ${params.eq.freq1k} fuera de rango [${eq.min}, ${eq.max}]`
            );
        }

        // Validar EQ 4kHz
        if (params.eq.freq4k < eq.min || params.eq.freq4k > eq.max) {
            throw new Error(
                `EQ 4kHz ${params.eq.freq4k} fuera de rango [${eq.min}, ${eq.max}]`
            );
        }

        // Validar EQ 8kHz
        if (params.eq.freq8k < eq.min || params.eq.freq8k > eq.max) {
            throw new Error(
                `EQ 8kHz ${params.eq.freq8k} fuera de rango [${eq.min}, ${eq.max}]`
            );
        }

        // Validar reverb room size
        if (params.reverbRoomSize < reverb.min || params.reverbRoomSize > reverb.max) {
            throw new Error(
                `Reverb room size ${params.reverbRoomSize} fuera de rango [${reverb.min}, ${reverb.max}]`
            );
        }
    }

    // ===== COMANDOS FFMPEG PARA DEBUGGING =====

    /**
     * Genera el comando FFmpeg completo para transformación de música como string.
     * Útil para debugging, logging y verificación.
     * 
     * @param inputPath - Ruta al archivo de música de entrada
     * @param outputPath - Ruta al archivo de salida
     * @param params - Parámetros de transformación
     * @returns Comando FFmpeg como string
     */
    public static getFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: MusicTransformationParams
    ): string {
        const filter = MusicTransformer.buildFFmpegFilter(params);
        return `ffmpeg -i "${inputPath}" -af "${filter}" -c:a libmp3lame -q:a 2 -y "${outputPath}"`;
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Genera una función de números pseudo-aleatorios con semilla.
     * Permite reproducibilidad en tests.
     * 
     * @param seed - Semilla para el generador
     * @returns Función que devuelve números entre 0 y 1
     */
    private static seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            // Algoritmo LCG (Linear Congruential Generator)
            state = (state * 1103515245 + 12345) % (2 ** 31);
            return state / (2 ** 31);
        };
    }

    // ===== SISTEMA DE CACHÉ (REQ-2.8.7) =====

    /** Estadísticas del caché en memoria (se reinician al reiniciar la aplicación) */
    private static cacheStats: MusicCacheStats = {
        hits: 0,
        misses: 0,
        entries: 0,
        totalSizeBytes: 0
    };

    /**
     * Obtiene la ruta completa del directorio de caché.
     * Crea el directorio si no existe.
     * 
     * @returns Ruta absoluta al directorio de caché
     */
    public static getCacheDirectory(): string {
        const cacheDir = path.resolve(process.cwd(), MUSIC_CACHE_CONFIG.basePath);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return cacheDir;
    }

    /**
     * Obtiene la ruta completa para un archivo cacheado.
     * 
     * @param cacheKey - Clave de caché
     * @returns Ruta absoluta al archivo de audio cacheado
     */
    public static getCachedFilePath(cacheKey: string): string {
        return path.join(
            MusicTransformer.getCacheDirectory(),
            `${cacheKey}${MUSIC_CACHE_CONFIG.audioExtension}`
        );
    }

    /**
     * Obtiene la ruta completa para un archivo de metadatos de caché.
     * 
     * @param cacheKey - Clave de caché
     * @returns Ruta absoluta al archivo de metadatos
     */
    public static getCacheMetadataPath(cacheKey: string): string {
        return path.join(
            MusicTransformer.getCacheDirectory(),
            `${cacheKey}${MUSIC_CACHE_CONFIG.metadataExtension}`
        );
    }

    /**
     * Consulta el caché para verificar si existe una pista transformada.
     * REQ-2.8.7: Cachear pistas transformadas por parámetros
     * 
     * @param originalPath - Ruta al archivo de música original
     * @param params - Parámetros de transformación
     * @returns Resultado de la consulta al caché
     */
    public static checkCache(
        originalPath: string,
        params: MusicTransformationParams
    ): MusicCacheResult {
        const cacheKey = MusicTransformer.getCacheKey(originalPath, params);
        const cachedPath = MusicTransformer.getCachedFilePath(cacheKey);
        const metadataPath = MusicTransformer.getCacheMetadataPath(cacheKey);

        // Verificar si existen tanto el archivo de audio como los metadatos
        if (fs.existsSync(cachedPath) && fs.existsSync(metadataPath)) {
            try {
                // Leer y validar metadatos
                const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
                const metadata: MusicCacheMetadata = JSON.parse(metadataContent);

                // Verificar TTL
                const createdAt = new Date(metadata.createdAt);
                const now = new Date();
                const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

                if (ageInDays <= MUSIC_CACHE_CONFIG.ttlDays) {
                    // Verificar que el hash coincide (integridad)
                    const expectedHash = MusicTransformer.getTransformedHash(params);
                    if (metadata.paramsHash === expectedHash) {
                        MusicTransformer.cacheStats.hits++;
                        return {
                            hit: true,
                            cachedPath,
                            cacheKey,
                            metadata
                        };
                    }
                }
            } catch (error) {
                // Si hay error al leer metadatos, tratar como miss
                console.warn(`Error leyendo metadatos de caché para ${cacheKey}:`, error);
            }
        }

        MusicTransformer.cacheStats.misses++;
        return {
            hit: false,
            cacheKey
        };
    }

    /**
     * Almacena una pista transformada en el caché.
     * REQ-2.8.7: Cachear pistas transformadas por parámetros
     * 
     * @param originalPath - Ruta al archivo de música original
     * @param transformedPath - Ruta al archivo transformado
     * @param params - Parámetros de transformación aplicados
     * @param originalDuration - Duración original en segundos
     * @param transformedDuration - Duración transformada en segundos
     * @returns Ruta al archivo cacheado
     */
    public static async saveToCache(
        originalPath: string,
        transformedPath: string,
        params: MusicTransformationParams,
        originalDuration: number,
        transformedDuration: number
    ): Promise<string> {
        const cacheKey = MusicTransformer.getCacheKey(originalPath, params);
        const cachedPath = MusicTransformer.getCachedFilePath(cacheKey);
        const metadataPath = MusicTransformer.getCacheMetadataPath(cacheKey);

        // Crear directorio de caché si no existe
        MusicTransformer.getCacheDirectory();

        // Copiar archivo transformado al caché
        fs.copyFileSync(transformedPath, cachedPath);

        // Crear y guardar metadatos
        const metadata: MusicCacheMetadata = {
            originalPath,
            params,
            createdAt: new Date().toISOString(),
            originalDuration,
            transformedDuration,
            paramsHash: MusicTransformer.getTransformedHash(params)
        };

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

        // Actualizar estadísticas
        MusicTransformer.cacheStats.entries++;
        const fileStats = fs.statSync(cachedPath);
        MusicTransformer.cacheStats.totalSizeBytes += fileStats.size;

        return cachedPath;
    }

    /**
     * Elimina una entrada específica del caché.
     * 
     * @param cacheKey - Clave de caché a eliminar
     * @returns true si se eliminó correctamente, false si no existía
     */
    public static removeFromCache(cacheKey: string): boolean {
        const cachedPath = MusicTransformer.getCachedFilePath(cacheKey);
        const metadataPath = MusicTransformer.getCacheMetadataPath(cacheKey);
        let removed = false;

        if (fs.existsSync(cachedPath)) {
            const fileStats = fs.statSync(cachedPath);
            fs.unlinkSync(cachedPath);
            MusicTransformer.cacheStats.totalSizeBytes -= fileStats.size;
            removed = true;
        }

        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        if (removed) {
            MusicTransformer.cacheStats.entries--;
        }

        return removed;
    }

    /**
     * Limpia entradas expiradas del caché basándose en el TTL.
     * REQ-4.1.6: TTL de música 14 días
     * 
     * @returns Número de entradas eliminadas
     */
    public static cleanExpiredCache(): number {
        const cacheDir = MusicTransformer.getCacheDirectory();
        const now = new Date();
        let removedCount = 0;

        try {
            const files = fs.readdirSync(cacheDir);
            const metadataFiles = files.filter(f => f.endsWith(MUSIC_CACHE_CONFIG.metadataExtension));

            for (const metaFile of metadataFiles) {
                const metadataPath = path.join(cacheDir, metaFile);
                try {
                    const content = fs.readFileSync(metadataPath, 'utf-8');
                    const metadata: MusicCacheMetadata = JSON.parse(content);
                    const createdAt = new Date(metadata.createdAt);
                    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

                    if (ageInDays > MUSIC_CACHE_CONFIG.ttlDays) {
                        const cacheKey = metaFile.replace(MUSIC_CACHE_CONFIG.metadataExtension, '');
                        if (MusicTransformer.removeFromCache(cacheKey)) {
                            removedCount++;
                        }
                    }
                } catch (error) {
                    // Si el archivo de metadatos está corrupto, eliminarlo
                    console.warn(`Eliminando metadatos corruptos: ${metaFile}`);
                    fs.unlinkSync(metadataPath);
                    removedCount++;
                }
            }
        } catch (error) {
            console.error('Error limpiando caché expirado:', error);
        }

        return removedCount;
    }

    /**
     * Limpia el caché si excede el tamaño máximo permitido.
     * Elimina las entradas más antiguas primero (LRU - Least Recently Used).
     * REQ-4.1.5: Limpieza automática de caché
     * 
     * @returns Número de entradas eliminadas
     */
    public static cleanCacheBySize(): number {
        const cacheDir = MusicTransformer.getCacheDirectory();
        let removedCount = 0;

        try {
            const files = fs.readdirSync(cacheDir);
            const metadataFiles = files.filter(f => f.endsWith(MUSIC_CACHE_CONFIG.metadataExtension));

            // Recopilar información de todas las entradas
            interface CacheEntry {
                cacheKey: string;
                createdAt: Date;
                size: number;
            }

            const entries: CacheEntry[] = [];
            let totalSize = 0;

            for (const metaFile of metadataFiles) {
                const metadataPath = path.join(cacheDir, metaFile);
                const cacheKey = metaFile.replace(MUSIC_CACHE_CONFIG.metadataExtension, '');
                const audioPath = MusicTransformer.getCachedFilePath(cacheKey);

                try {
                    if (fs.existsSync(audioPath)) {
                        const content = fs.readFileSync(metadataPath, 'utf-8');
                        const metadata: MusicCacheMetadata = JSON.parse(content);
                        const audioStats = fs.statSync(audioPath);
                        
                        entries.push({
                            cacheKey,
                            createdAt: new Date(metadata.createdAt),
                            size: audioStats.size
                        });
                        totalSize += audioStats.size;
                    }
                } catch (error) {
                    // Ignorar entradas con errores
                }
            }

            // Si excede el tamaño máximo, eliminar las más antiguas
            if (totalSize > MUSIC_CACHE_CONFIG.maxSizeBytes) {
                // Ordenar por fecha de creación (más antiguas primero)
                entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

                // Eliminar hasta estar bajo el límite
                for (const entry of entries) {
                    if (totalSize <= MUSIC_CACHE_CONFIG.maxSizeBytes * 0.8) {
                        break; // Dejar 20% de margen
                    }
                    
                    if (MusicTransformer.removeFromCache(entry.cacheKey)) {
                        totalSize -= entry.size;
                        removedCount++;
                    }
                }
            }
        } catch (error) {
            console.error('Error limpiando caché por tamaño:', error);
        }

        return removedCount;
    }

    /**
     * Obtiene las estadísticas actuales del caché.
     * Útil para métricas y monitoreo (REQ-4.3.2).
     * 
     * @returns Estadísticas del caché
     */
    public static getCacheStats(): MusicCacheStats {
        // Actualizar conteo de entradas y tamaño total
        MusicTransformer.updateCacheStats();
        return { ...MusicTransformer.cacheStats };
    }

    /**
     * Actualiza las estadísticas del caché leyendo el directorio.
     * Se llama internamente para mantener las estadísticas actualizadas.
     */
    private static updateCacheStats(): void {
        const cacheDir = MusicTransformer.getCacheDirectory();
        
        try {
            const files = fs.readdirSync(cacheDir);
            const audioFiles = files.filter(f => f.endsWith(MUSIC_CACHE_CONFIG.audioExtension));
            
            let totalSize = 0;
            for (const audioFile of audioFiles) {
                const audioPath = path.join(cacheDir, audioFile);
                try {
                    const stats = fs.statSync(audioPath);
                    totalSize += stats.size;
                } catch (error) {
                    // Ignorar archivos que no se pueden leer
                }
            }

            MusicTransformer.cacheStats.entries = audioFiles.length;
            MusicTransformer.cacheStats.totalSizeBytes = totalSize;
        } catch (error) {
            // Si el directorio no existe, las estadísticas son 0
        }
    }

    /**
     * Transforma una pista de música con soporte de caché.
     * REQ-2.8.7: Cachear pistas transformadas por parámetros para evitar reprocesar
     * 
     * Este método:
     * 1. Verifica si existe una versión cacheada con los mismos parámetros
     * 2. Si existe, retorna la versión cacheada (cache hit)
     * 3. Si no existe, ejecuta la transformación y guarda en caché
     * 
     * @param inputPath - Ruta al archivo de música original
     * @param outputPath - Ruta deseada para el archivo de salida (opcional si usa caché)
     * @param params - Parámetros de transformación
     * @returns Resultado de la transformación con información de caché
     */
    public static async transformWithCache(
        inputPath: string,
        outputPath: string,
        params: MusicTransformationParams
    ): Promise<MusicTransformResult> {
        // Validar parámetros
        MusicTransformer.validateParams(params);

        // Verificar caché
        const cacheResult = MusicTransformer.checkCache(inputPath, params);
        
        if (cacheResult.hit && cacheResult.metadata) {
            // Cache hit - usar versión cacheada
            console.log(`[MusicTransformer] Cache HIT para ${path.basename(inputPath)}`);
            
            // Copiar archivo cacheado a la ruta de salida deseada
            if (cacheResult.cachedPath && cacheResult.cachedPath !== outputPath) {
                fs.copyFileSync(cacheResult.cachedPath, outputPath);
            }

            return {
                outputPath: cacheResult.cachedPath || outputPath,
                hash: MusicTransformer.getTransformedHash(params),
                appliedParams: params,
                originalDuration: cacheResult.metadata.originalDuration,
                transformedDuration: cacheResult.metadata.transformedDuration,
                fromCache: true
            };
        }

        // Cache miss - ejecutar transformación
        console.log(`[MusicTransformer] Cache MISS para ${path.basename(inputPath)}, transformando...`);
        
        // Obtener duración original
        const originalDuration = await MusicTransformer.getAudioDuration(inputPath);
        
        // Ejecutar transformación FFmpeg
        await MusicTransformer.executeFFmpegTransform(inputPath, outputPath, params);
        
        // Obtener duración transformada
        const transformedDuration = await MusicTransformer.getAudioDuration(outputPath);

        // Guardar en caché
        await MusicTransformer.saveToCache(
            inputPath,
            outputPath,
            params,
            originalDuration,
            transformedDuration
        );

        // Limpiar caché si es necesario
        MusicTransformer.cleanCacheBySize();

        return {
            outputPath,
            hash: MusicTransformer.getTransformedHash(params),
            appliedParams: params,
            originalDuration,
            transformedDuration,
            fromCache: false
        };
    }

    /**
     * Ejecuta la transformación FFmpeg.
     * Método interno que realiza la transformación real.
     * 
     * @param inputPath - Ruta al archivo de entrada
     * @param outputPath - Ruta al archivo de salida
     * @param params - Parámetros de transformación
     */
    private static executeFFmpegTransform(
        inputPath: string,
        outputPath: string,
        params: MusicTransformationParams
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = MusicTransformer.getFFmpegCommand(inputPath, outputPath, params);
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Error en FFmpeg: ${error.message}\n${stderr}`));
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Obtiene la duración de un archivo de audio en segundos.
     * 
     * @param audioPath - Ruta al archivo de audio
     * @returns Duración en segundos
     */
    private static getAudioDuration(audioPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    // Si falla, retornar 0 como fallback
                    console.warn(`No se pudo obtener duración de ${audioPath}:`, error.message);
                    resolve(0);
                    return;
                }
                
                const duration = parseFloat(stdout.trim());
                resolve(isNaN(duration) ? 0 : duration);
            });
        });
    }

    /**
     * Limpia completamente el caché de música.
     * Útil para testing o mantenimiento.
     * 
     * @returns Número de entradas eliminadas
     */
    public static clearCache(): number {
        const cacheDir = MusicTransformer.getCacheDirectory();
        let removedCount = 0;

        try {
            const files = fs.readdirSync(cacheDir);
            
            for (const file of files) {
                const filePath = path.join(cacheDir, file);
                try {
                    fs.unlinkSync(filePath);
                    removedCount++;
                } catch (error) {
                    console.warn(`No se pudo eliminar ${file}:`, error);
                }
            }

            // Reiniciar estadísticas
            MusicTransformer.cacheStats = {
                hits: 0,
                misses: 0,
                entries: 0,
                totalSizeBytes: 0
            };
        } catch (error) {
            console.error('Error limpiando caché:', error);
        }

        return removedCount;
    }
}
