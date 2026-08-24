/**
 * VideoTransformer.ts
 * 
 * Sistema de transformación anti-detección para videos de Pexels.
 * Aplica transformaciones únicas a cada video para evitar Content ID matches.
 * 
 * REQ-1.1.1: Crear VideoTransformer.ts que aplique transformaciones únicas a cada video descargado de Pexels
 * REQ-1.1.2: Implementar alteración geométrica con zoom aleatorio (102-108%), micro-rotación (-0.5° a +0.5°), y crop asimétrico (2-5px en bordes)
 */

import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';

/**
 * Parámetros de transformación para aplicar a videos.
 * Cada campo está diseñado para alterar ligeramente el video
 * de forma imperceptible pero suficiente para generar un hash único.
 */
export interface TransformationParams {
    // ===== Alteración Geométrica =====
    
    /** Zoom aleatorio (1.02-1.08 equivale a 102-108%) */
    zoom: number;
    
    /** Micro-rotación en grados (-0.5 a +0.5) */
    rotation: number;
    
    /** Crop asimétrico en píxeles - borde izquierdo (2-5px) */
    cropLeft: number;
    
    /** Crop asimétrico en píxeles - borde derecho (2-5px) */
    cropRight: number;
    
    /** Crop asimétrico en píxeles - borde superior (2-5px) */
    cropTop: number;
    
    /** Crop asimétrico en píxeles - borde inferior (2-5px) */
    cropBottom: number;

    // ===== Alteración Cromática =====
    
    /** Hue shift en grados (±10) */
    hue: number;
    
    /** Multiplicador de saturación (0.85-1.15 equivale a ±15%) */
    saturation: number;
    
    /** Multiplicador de contraste (0.92-1.08 equivale a ±8%) */
    contrast: number;
    
    /** Multiplicador de brillo (0.95-1.05 equivale a ±5%) */
    brightness: number;

    // ===== Overlays =====
    
    /** Intensidad del grain de película (3-8) */
    grainIntensity: number;
    
    /** Intensidad de la viñeta (0.1-0.3) */
    vignetteStrength: number;

    // ===== Alteración Temporal =====
    
    /** Velocidad de reproducción variable (0.95x-1.05x) para alteración temporal por escena */
    speed: number;

    // ===== Metadatos Únicos =====
    
    /** CRF variable para re-encoding (18-23) */
    crf: number;
    
    /** Timestamp único ISO para metadatos */
    timestamp: string;
    
    /** Hash único del encoder para metadatos */
    encoderHash: string;
}

/**
 * Resultado de una transformación de video.
 * Contiene información sobre el output generado y los parámetros aplicados.
 */
export interface VideoTransformResult {
    /** Ruta absoluta al video transformado */
    outputPath: string;
    
    /** Hash MD5 del archivo de salida (debe ser único por transformación) */
    hash: string;
    
    /** Parámetros que se aplicaron al video */
    appliedParams: TransformationParams;
    
    /** Duración del video en segundos */
    duration: number;
}

/**
 * Rangos de valores para cada parámetro de transformación.
 * Estos rangos están diseñados para ser imperceptibles al ojo humano
 * pero suficientes para generar hashes únicos y evitar Content ID.
 */
export const TRANSFORMATION_RANGES = {
    zoom: { min: 1.02, max: 1.08 },
    rotation: { min: -0.5, max: 0.5 },
    crop: { min: 2, max: 5 },
    hue: { min: -10, max: 10 },
    saturation: { min: 0.85, max: 1.15 },
    contrast: { min: 0.92, max: 1.08 },
    brightness: { min: 0.95, max: 1.05 },
    grain: { min: 3, max: 8 },
    vignette: { min: 0.1, max: 0.3 },
    crf: { min: 18, max: 23 },
    speed: { min: 0.95, max: 1.05 }  // REQ-1.1.4: Alteración temporal 0.95x-1.05x
} as const;

/**
 * VideoTransformer - Clase para aplicar transformaciones anti-detección a videos.
 * 
 * Esta clase implementa la lógica para:
 * - Generar parámetros de transformación únicos
 * - Aplicar transformaciones geométricas, cromáticas y overlays
 * - Generar metadatos únicos para cada video
 * - Verificar unicidad mediante hash MD5
 */
export class VideoTransformer {
    /**
     * Genera un número aleatorio dentro de un rango dado.
     * @param min - Valor mínimo (inclusive)
     * @param max - Valor máximo (inclusive)
     * @param decimals - Número de decimales (default: 2)
     * @returns Número aleatorio dentro del rango
     */
    public static randomInRange(min: number, max: number, decimals: number = 2): number {
        const value = Math.random() * (max - min) + min;
        return Number(value.toFixed(decimals));
    }

    /**
     * Genera un conjunto único de parámetros de transformación.
     * Cada llamada produce parámetros diferentes para garantizar unicidad.
     * @param seed - Semilla opcional para reproducibilidad en tests
     * @returns Parámetros de transformación únicos
     * 
     * NOTA: Cuando seed está presente, TODOS los parámetros son reproducibles
     * (incluyendo timestamp y encoderHash) para facilitar testing determinístico.
     */
    public static generateUniqueParams(seed?: number): TransformationParams {
        // Si hay seed, usamos una función determinística (para tests)
        const random = seed !== undefined 
            ? VideoTransformer.seededRandom(seed) 
            : () => Math.random();

        const randomRange = (min: number, max: number, decimals: number = 2): number => {
            const value = random() * (max - min) + min;
            return Number(value.toFixed(decimals));
        };

        const randomInt = (min: number, max: number): number => {
            return Math.floor(random() * (max - min + 1)) + min;
        };

        // Generar timestamp único ISO
        // Si hay seed, generamos timestamp determinístico basado en la seed
        const timestamp = seed !== undefined
            ? VideoTransformer.generateSeededTimestamp(seed)
            : new Date().toISOString();
        
        // Generar hash único del encoder
        // Si hay seed, generamos hash determinístico basado en la seed
        const encoderHash = seed !== undefined
            ? VideoTransformer.generateSeededEncoderHash(seed)
            : VideoTransformer.generateEncoderHash();

        return {
            // Alteración geométrica
            zoom: randomRange(TRANSFORMATION_RANGES.zoom.min, TRANSFORMATION_RANGES.zoom.max, 3),
            rotation: randomRange(TRANSFORMATION_RANGES.rotation.min, TRANSFORMATION_RANGES.rotation.max, 3),
            cropLeft: randomInt(TRANSFORMATION_RANGES.crop.min, TRANSFORMATION_RANGES.crop.max),
            cropRight: randomInt(TRANSFORMATION_RANGES.crop.min, TRANSFORMATION_RANGES.crop.max),
            cropTop: randomInt(TRANSFORMATION_RANGES.crop.min, TRANSFORMATION_RANGES.crop.max),
            cropBottom: randomInt(TRANSFORMATION_RANGES.crop.min, TRANSFORMATION_RANGES.crop.max),
            
            // Alteración cromática
            hue: randomRange(TRANSFORMATION_RANGES.hue.min, TRANSFORMATION_RANGES.hue.max, 1),
            saturation: randomRange(TRANSFORMATION_RANGES.saturation.min, TRANSFORMATION_RANGES.saturation.max, 3),
            contrast: randomRange(TRANSFORMATION_RANGES.contrast.min, TRANSFORMATION_RANGES.contrast.max, 3),
            brightness: randomRange(TRANSFORMATION_RANGES.brightness.min, TRANSFORMATION_RANGES.brightness.max, 3),
            
            // Overlays
            grainIntensity: randomInt(TRANSFORMATION_RANGES.grain.min, TRANSFORMATION_RANGES.grain.max),
            vignetteStrength: randomRange(TRANSFORMATION_RANGES.vignette.min, TRANSFORMATION_RANGES.vignette.max, 2),
            
            // Alteración temporal - REQ-1.1.4
            speed: randomRange(TRANSFORMATION_RANGES.speed.min, TRANSFORMATION_RANGES.speed.max, 3),
            
            // Metadatos
            crf: randomInt(TRANSFORMATION_RANGES.crf.min, TRANSFORMATION_RANGES.crf.max),
            timestamp,
            encoderHash
        };
    }

    /**
     * Genera un hash único para el encoder basado en timestamp y valores aleatorios.
     * Este hash se incluye en los metadatos del video para máxima unicidad.
     * @returns Hash hexadecimal de 16 caracteres
     */
    public static generateEncoderHash(): string {
        const data = `${Date.now()}-${Math.random()}-${process.hrtime.bigint()}`;
        return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
    }

    /**
     * Calcula el hash MD5 de los parámetros de transformación.
     * Útil para cacheo y verificación de unicidad.
     * @param params - Parámetros de transformación
     * @returns Hash MD5 de los parámetros
     */
    public static getParamsHash(params: TransformationParams): string {
        const data = JSON.stringify(params);
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Genera una función de números pseudo-aleatorios con semilla.
     * Permite reproducibilidad en tests.
     * @param seed - Semilla para el generador
     * @returns Función que devuelve números entre 0 y 1
     */
    private static seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            // Algoritmo simple de generación pseudo-aleatoria (Linear Congruential Generator)
            state = (state * 1103515245 + 12345) % (2 ** 31);
            return state / (2 ** 31);
        };
    }

    /**
     * Genera un timestamp determinístico basado en una semilla.
     * Usado para reproducibilidad en tests.
     * @param seed - Semilla para generar el timestamp
     * @returns Timestamp ISO determinístico
     */
    private static generateSeededTimestamp(seed: number): string {
        // Usar la semilla para generar una fecha determinística
        // Base: 2024-01-01T00:00:00.000Z + offset basado en seed
        const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();
        // Offset máximo de ~1 año en milisegundos, modulado por la seed
        const offset = (seed * 1103515245 + 12345) % (365 * 24 * 60 * 60 * 1000);
        const seededDate = new Date(baseTime + offset);
        return seededDate.toISOString();
    }

    /**
     * Genera un hash de encoder determinístico basado en una semilla.
     * Usado para reproducibilidad en tests.
     * @param seed - Semilla para generar el hash
     * @returns Hash hexadecimal de 16 caracteres determinístico
     */
    private static generateSeededEncoderHash(seed: number): string {
        // Generar un string determinístico basado en la semilla
        const deterministicData = `seeded-encoder-${seed}-${(seed * 1103515245 + 12345) % (2 ** 31)}`;
        return crypto.createHash('md5').update(deterministicData).digest('hex').substring(0, 16);
    }

    /**
     * Construye el filtro de video FFmpeg basado en los parámetros de transformación.
     * @param params - Parámetros de transformación a aplicar
     * @param inputWidth - Ancho del video de entrada
     * @param inputHeight - Alto del video de entrada
     * @returns String con el filtro FFmpeg completo
     */
    public static buildVideoFilter(
        params: TransformationParams, 
        inputWidth: number = 1080, 
        inputHeight: number = 1920
    ): string {
        const filters: string[] = [];

        // 1. Zoom (escalar)
        const scaledWidth = Math.round(inputWidth * params.zoom);
        const scaledHeight = Math.round(inputHeight * params.zoom);
        filters.push(`scale=${scaledWidth}:${scaledHeight}`);

        // 2. Rotación (en radianes para FFmpeg)
        const rotationRadians = (params.rotation * Math.PI) / 180;
        if (Math.abs(params.rotation) > 0.001) {
            filters.push(`rotate=${rotationRadians.toFixed(6)}`);
        }

        // 3. Crop asimétrico (volver al tamaño original con offset)
        const cropWidth = inputWidth - params.cropLeft - params.cropRight;
        const cropHeight = inputHeight - params.cropTop - params.cropBottom;
        filters.push(`crop=${cropWidth}:${cropHeight}:${params.cropLeft}:${params.cropTop}`);

        // 4. Alteraciones cromáticas con eq filter
        // eq usa: contrast, brightness (multiplicadores), saturation
        filters.push(`eq=contrast=${params.contrast}:brightness=${params.brightness - 1}:saturation=${params.saturation}`);

        // 5. Hue shift
        filters.push(`hue=h=${params.hue}`);

        // 6. Grain de película
        filters.push(`noise=alls=${params.grainIntensity}:allf=t+u`);

        // 7. Viñeta
        const vignetteAngle = params.vignetteStrength * Math.PI;
        filters.push(`vignette=PI*${params.vignetteStrength.toFixed(2)}`);

        // 8. Asegurar formato compatible
        filters.push('format=yuv420p');

        return filters.join(',');
    }

    /**
     * Construye SOLO el filtro de alteración cromática (hue, saturación, contraste, brillo).
     * REQ-1.1.3: Hue ±10°, saturación ±15%, contraste ±8%, brillo ±5%
     * 
     * Filtros FFmpeg usados:
     * - eq: para saturación, contraste y brillo
     * - hue: para hue shift en grados
     * 
     * NOTA IMPORTANTE sobre brightness en FFmpeg eq filter:
     * - brightness es un OFFSET, no un multiplicador
     * - Rango válido: -1.0 a 1.0
     * - Si brightness=1.02 (2% más brillante), usar brightness=0.02 en eq
     * 
     * @param params - Parámetros de transformación
     * @returns String con el filtro cromático FFmpeg
     */
    public static buildChromaticFilter(params: TransformationParams): string {
        const filters: string[] = [];

        // 1. EQ Filter: saturación, contraste y brillo
        // eq=saturation=VALUE:contrast=VALUE:brightness=OFFSET
        // - saturation: multiplicador (0.85-1.15 para ±15%)
        // - contrast: multiplicador (0.92-1.08 para ±8%)
        // - brightness: offset (-1 a 1), calculado como (brightness - 1)
        //   Ej: brightness=1.02 → offset=0.02
        const brightnessOffset = params.brightness - 1;
        filters.push(
            `eq=saturation=${params.saturation.toFixed(3)}:contrast=${params.contrast.toFixed(3)}:brightness=${brightnessOffset.toFixed(3)}`
        );

        // 2. Hue Filter: hue shift en grados
        // hue=h=VALUE donde VALUE está en grados (-10 a +10)
        filters.push(`hue=h=${params.hue.toFixed(1)}`);

        return filters.join(',');
    }

    /**
     * Aplica transformación cromática a un video usando FFmpeg.
     * REQ-1.1.3: Implementar alteración cromática con hue, saturación, contraste y brillo.
     * 
     * @param inputPath - Ruta absoluta al video de entrada
     * @param outputPath - Ruta absoluta donde guardar el video transformado
     * @param params - Parámetros de transformación a aplicar
     * @returns Promise con el resultado de la transformación
     */
    public static async applyChromaticTransformation(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): Promise<VideoTransformResult> {
        // Validar parámetros antes de ejecutar
        VideoTransformer.validateParams(params);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
        }

        // Construir el filtro cromático
        const chromaticFilter = VideoTransformer.buildChromaticFilter(params);

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', inputPath,                    // Input
            '-vf', chromaticFilter,             // Video filter (cromático)
            '-c:v', 'libx264',                  // Codec de video H.264
            '-preset', 'medium',                // Balance entre velocidad y compresión
            '-crf', params.crf.toString(),      // Calidad variable (18-23)
            '-c:a', 'aac',                      // Codec de audio
            '-b:a', '128k',                     // Bitrate de audio
            '-movflags', '+faststart',          // Optimización para streaming
            '-y',                               // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await VideoTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del output
        const hash = await VideoTransformer.calculateFileHash(outputPath);

        // Obtener duración del video
        const duration = await VideoTransformer.getVideoDuration(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params,
            duration
        };
    }

    /**
     * Genera el comando FFmpeg para transformación cromática como string para debugging/logging.
     * 
     * @param inputPath - Ruta al video de entrada
     * @param outputPath - Ruta al video de salida
     * @param params - Parámetros de transformación
     * @returns Comando FFmpeg como string
     */
    public static getChromaticFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): string {
        const chromaticFilter = VideoTransformer.buildChromaticFilter(params);

        return `ffmpeg -i "${inputPath}" -vf "${chromaticFilter}" -c:v libx264 -preset medium -crf ${params.crf} -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;
    }

    /**
     * Construye SOLO el filtro de transformación geométrica (zoom, rotación, crop).
     * REQ-1.1.2: Zoom 102-108%, micro-rotación ±0.5°, crop asimétrico 2-5px
     * 
     * Orden de filtros: scale → rotate → crop (crítico para resultados correctos)
     * 
     * @param params - Parámetros de transformación
     * @param inputWidth - Ancho del video de entrada (default: 1080)
     * @param inputHeight - Alto del video de entrada (default: 1920)
     * @returns String con el filtro geométrico FFmpeg
     */
    public static buildGeometricFilter(
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): string {
        const filters: string[] = [];

        // 1. ZOOM: Escalar video al porcentaje especificado (102-108%)
        // Usa iw*zoom:ih*zoom para escalado proporcional
        const scaledWidth = Math.round(inputWidth * params.zoom);
        const scaledHeight = Math.round(inputHeight * params.zoom);
        filters.push(`scale=${scaledWidth}:${scaledHeight}`);

        // 2. ROTACIÓN: Micro-rotación en radianes (±0.5° = ±0.0087 rad)
        // FFmpeg rotate filter espera radianes, no grados
        const rotationRadians = (params.rotation * Math.PI) / 180;
        if (Math.abs(params.rotation) > 0.001) {
            // fillcolor=black rellena esquinas expuestas por rotación
            filters.push(`rotate=${rotationRadians.toFixed(6)}:fillcolor=black`);
        }

        // 3. CROP ASIMÉTRICO: Recortar bordes (2-5px cada lado)
        // Después del zoom y rotación, volvemos a un tamaño ligeramente menor
        // que el original, eliminando los bordes donde podrían verse artefactos
        const cropWidth = inputWidth - params.cropLeft - params.cropRight;
        const cropHeight = inputHeight - params.cropTop - params.cropBottom;
        // x:y especifica el punto de inicio del crop
        filters.push(`crop=${cropWidth}:${cropHeight}:${params.cropLeft}:${params.cropTop}`);

        return filters.join(',');
    }

    /**
     * Aplica transformación geométrica a un video usando FFmpeg.
     * REQ-1.1.2: Implementar alteración geométrica con zoom, rotación y crop asimétrico.
     * 
     * @param inputPath - Ruta absoluta al video de entrada
     * @param outputPath - Ruta absoluta donde guardar el video transformado
     * @param params - Parámetros de transformación a aplicar
     * @param inputWidth - Ancho del video de entrada (default: 1080)
     * @param inputHeight - Alto del video de entrada (default: 1920)
     * @returns Promise con el resultado de la transformación
     */
    public static async applyGeometricTransformation(
        inputPath: string,
        outputPath: string,
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): Promise<VideoTransformResult> {
        // Validar parámetros antes de ejecutar
        VideoTransformer.validateParams(params);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
        }

        // Construir el filtro geométrico
        const geometricFilter = VideoTransformer.buildGeometricFilter(
            params,
            inputWidth,
            inputHeight
        );

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', inputPath,                    // Input
            '-vf', geometricFilter,             // Video filter (geométrico)
            '-c:v', 'libx264',                  // Codec de video H.264
            '-preset', 'medium',                // Balance entre velocidad y compresión
            '-crf', params.crf.toString(),      // Calidad variable (18-23)
            '-c:a', 'aac',                      // Codec de audio
            '-b:a', '128k',                     // Bitrate de audio
            '-movflags', '+faststart',          // Optimización para streaming
            '-y',                               // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await VideoTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del output
        const hash = await VideoTransformer.calculateFileHash(outputPath);

        // Obtener duración del video (aproximada basada en tamaño)
        const duration = await VideoTransformer.getVideoDuration(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params,
            duration
        };
    }

    /**
     * Construye el filtro de alteración temporal para FFmpeg.
     * REQ-1.1.4: Alteración temporal con velocidad variable 0.95x-1.05x por escena.
     * 
     * NOTA: Usa filter_complex para sincronizar video y audio:
     * - setpts=PTS/{speed} para video (dividir acelera, multiplicar desacelera)
     * - atempo={speed} para audio (mantiene sincronización, rango válido 0.5-2.0)
     * 
     * @param params - Parámetros de transformación con speed
     * @returns Objeto con los filtros de video y audio separados para filter_complex
     */
    public static buildTemporalFilter(params: TransformationParams): { videoFilter: string; audioFilter: string } {
        const speed = params.speed;
        
        // setpts usa el inverso: PTS/speed
        // Si speed=1.02 (2% más rápido), setpts=PTS/1.02 acelera el video
        // Si speed=0.98 (2% más lento), setpts=PTS/0.98 desacelera el video
        const videoFilter = `setpts=PTS/${speed.toFixed(3)}`;
        
        // atempo usa speed directamente
        // Rango válido de atempo: 0.5 a 2.0 (nuestro rango 0.95-1.05 está dentro)
        const audioFilter = `atempo=${speed.toFixed(3)}`;
        
        return { videoFilter, audioFilter };
    }

    /**
     * Aplica transformación temporal a un video usando FFmpeg.
     * REQ-1.1.4: Implementar alteración temporal con velocidad variable 0.95x-1.05x.
     * 
     * Usa filter_complex para aplicar:
     * - setpts para alterar timestamps del video
     * - atempo para alterar velocidad del audio manteniendo sincronización
     * 
     * Comando de referencia:
     * ffmpeg -i input.mp4 \
     *   -filter_complex "[0:v]setpts=PTS/1.02[v];[0:a]atempo=1.02[a]" \
     *   -map "[v]" -map "[a]" \
     *   output.mp4
     * 
     * @param inputPath - Ruta absoluta al video de entrada
     * @param outputPath - Ruta absoluta donde guardar el video transformado
     * @param params - Parámetros de transformación a aplicar
     * @returns Promise con el resultado de la transformación
     */
    public static async applyTemporalTransformation(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): Promise<VideoTransformResult> {
        // Validar parámetros antes de ejecutar
        VideoTransformer.validateParams(params);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
        }

        // Construir filtros temporales
        const { videoFilter, audioFilter } = VideoTransformer.buildTemporalFilter(params);

        // Construir filter_complex para sincronizar video y audio
        const filterComplex = `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`;

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', inputPath,                    // Input
            '-filter_complex', filterComplex,   // Filtros de video y audio
            '-map', '[v]',                      // Mapear stream de video filtrado
            '-map', '[a]',                      // Mapear stream de audio filtrado
            '-c:v', 'libx264',                  // Codec de video H.264
            '-preset', 'medium',                // Balance entre velocidad y compresión
            '-crf', params.crf.toString(),      // Calidad variable (18-23)
            '-c:a', 'aac',                      // Codec de audio
            '-b:a', '128k',                     // Bitrate de audio
            '-movflags', '+faststart',          // Optimización para streaming
            '-y',                               // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await VideoTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del output
        const hash = await VideoTransformer.calculateFileHash(outputPath);

        // Obtener duración del video (será ligeramente diferente por el cambio de velocidad)
        const duration = await VideoTransformer.getVideoDuration(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params,
            duration
        };
    }

    /**
     * Genera el comando FFmpeg para transformación temporal como string para debugging/logging.
     * 
     * @param inputPath - Ruta al video de entrada
     * @param outputPath - Ruta al video de salida
     * @param params - Parámetros de transformación
     * @returns Comando FFmpeg como string
     */
    public static getTemporalFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): string {
        const { videoFilter, audioFilter } = VideoTransformer.buildTemporalFilter(params);
        const filterComplex = `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`;

        return `ffmpeg -i "${inputPath}" -filter_complex "${filterComplex}" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf ${params.crf} -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;
    }

    /**
     * Ejecuta FFmpeg con los argumentos especificados.
     * Usa spawn para mejor manejo de errores y streams.
     * 
     * @param args - Argumentos para FFmpeg
     * @returns Promise que se resuelve cuando FFmpeg termina exitosamente
     */
    private static executeFFmpeg(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            // Buscar FFmpeg en el sistema o usar el instalado por @ffmpeg-installer
            let ffmpegPath = 'ffmpeg';
            
            try {
                // Intentar usar el FFmpeg instalado por npm
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                ffmpegPath = ffmpegInstaller.path;
            } catch {
                // Si no está disponible, usar el del sistema
                console.log('Usando FFmpeg del sistema');
            }

            const ffmpeg = spawn(ffmpegPath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg terminó con código ${code}: ${stderr}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`Error al ejecutar FFmpeg: ${err.message}`));
            });
        });
    }

    /**
     * Calcula el hash MD5 de un archivo.
     * Útil para verificar unicidad del output.
     * 
     * @param filePath - Ruta al archivo
     * @returns Hash MD5 del archivo
     */
    private static calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }

    /**
     * Obtiene la duración de un video usando FFprobe.
     * 
     * @param filePath - Ruta al archivo de video
     * @returns Duración en segundos
     */
    private static getVideoDuration(filePath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            // Buscar FFprobe
            let ffprobePath = 'ffprobe';
            
            try {
                const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
                ffprobePath = ffprobeInstaller.path;
            } catch {
                // Usar el del sistema
            }

            const args = [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ];

            const ffprobe = spawn(ffprobePath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0 && stdout.trim()) {
                    const duration = parseFloat(stdout.trim());
                    resolve(isNaN(duration) ? 0 : duration);
                } else {
                    // Si ffprobe falla, retornar 0 como fallback
                    console.warn(`No se pudo obtener duración: ${stderr}`);
                    resolve(0);
                }
            });

            ffprobe.on('error', () => {
                // Fallback: retornar 0 si ffprobe no está disponible
                resolve(0);
            });
        });
    }

    /**
     * Construye SOLO el filtro de overlay (grain de película y viñeta dinámica).
     * REQ-1.1.5: Añadir overlays únicos - grain de película aleatorio (intensidad 3-8)
     *            y viñeta dinámica (fuerza 0.1-0.3).
     * 
     * Filtros FFmpeg usados:
     * - noise: para grain de película con ruido temporal y uniforme
     *   - alls={intensity}: intensidad del ruido en todos los planos
     *   - allf=t+u: flags para ruido temporal (t) y uniforme (u) = efecto de grain
     * - vignette: para oscurecimiento en los bordes
     *   - PI*{strength}: ángulo de la viñeta (mayor = más pronunciada)
     * 
     * @param params - Parámetros de transformación con grainIntensity y vignetteStrength
     * @returns String con el filtro de overlay FFmpeg
     */
    public static buildOverlayFilter(params: TransformationParams): string {
        const filters: string[] = [];

        // 1. GRAIN DE PELÍCULA: Ruido temporal uniforme
        // noise=alls={intensity}:allf=t+u
        // - alls: aplica la misma intensidad a todos los planos de color
        // - allf=t+u: t=temporal (varía por frame), u=uniforme (distribución uniforme)
        // Intensidad 3-8 crea un efecto sutil pero suficiente para alterar el hash
        filters.push(`noise=alls=${params.grainIntensity}:allf=t+u`);

        // 2. VIÑETA DINÁMICA: Oscurecimiento progresivo en bordes
        // vignette=PI*{strength}
        // - El ángulo PI*strength controla qué tan pronunciada es la viñeta
        // - Rango 0.1-0.3 crea un efecto sutil pero perceptible
        // - PI*0.1 = viñeta muy leve, PI*0.3 = viñeta más notable
        filters.push(`vignette=PI*${params.vignetteStrength.toFixed(2)}`);

        return filters.join(',');
    }

    /**
     * Aplica transformación de overlays a un video usando FFmpeg.
     * REQ-1.1.5: Implementar overlays - grain de película y viñeta dinámica.
     * 
     * Comando de referencia:
     * ffmpeg -i input.mp4 \
     *   -vf "noise=alls=5:allf=t+u,vignette=PI*0.2" \
     *   output.mp4
     * 
     * @param inputPath - Ruta absoluta al video de entrada
     * @param outputPath - Ruta absoluta donde guardar el video transformado
     * @param params - Parámetros de transformación a aplicar
     * @returns Promise con el resultado de la transformación
     */
    public static async applyOverlayTransformation(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): Promise<VideoTransformResult> {
        // Validar parámetros antes de ejecutar
        VideoTransformer.validateParams(params);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
        }

        // Construir el filtro de overlay
        const overlayFilter = VideoTransformer.buildOverlayFilter(params);

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', inputPath,                    // Input
            '-vf', overlayFilter,               // Video filter (overlay: grain + viñeta)
            '-c:v', 'libx264',                  // Codec de video H.264
            '-preset', 'medium',                // Balance entre velocidad y compresión
            '-crf', params.crf.toString(),      // Calidad variable (18-23)
            '-c:a', 'aac',                      // Codec de audio
            '-b:a', '128k',                     // Bitrate de audio
            '-movflags', '+faststart',          // Optimización para streaming
            '-y',                               // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await VideoTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del output
        const hash = await VideoTransformer.calculateFileHash(outputPath);

        // Obtener duración del video
        const duration = await VideoTransformer.getVideoDuration(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params,
            duration
        };
    }

    /**
     * Genera el comando FFmpeg para transformación de overlay como string para debugging/logging.
     * 
     * @param inputPath - Ruta al video de entrada
     * @param outputPath - Ruta al video de salida
     * @param params - Parámetros de transformación
     * @returns Comando FFmpeg como string
     */
    public static getOverlayFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): string {
        const overlayFilter = VideoTransformer.buildOverlayFilter(params);

        return `ffmpeg -i "${inputPath}" -vf "${overlayFilter}" -c:v libx264 -preset medium -crf ${params.crf} -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;
    }

    /**
     * Genera el comando FFmpeg como string para debugging/logging.
     * Útil para verificar que el comando generado es válido.
     * 
     * @param inputPath - Ruta al video de entrada
     * @param outputPath - Ruta al video de salida
     * @param params - Parámetros de transformación
     * @param inputWidth - Ancho del video
     * @param inputHeight - Alto del video
     * @returns Comando FFmpeg como string
     */
    public static getFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): string {
        const geometricFilter = VideoTransformer.buildGeometricFilter(
            params,
            inputWidth,
            inputHeight
        );

        return `ffmpeg -i "${inputPath}" -vf "${geometricFilter}" -c:v libx264 -preset medium -crf ${params.crf} -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;
    }

    /**
     * Construye los argumentos FFmpeg para metadatos únicos.
     * REQ-1.1.6: Generar metadatos únicos - timestamp único, encoder string con hash.
     * 
     * Metadatos generados:
     * - creation_time: Timestamp ISO único para cada video
     * - encoder: String "OmniAI-{hash16}" para identificación única
     * 
     * @param params - Parámetros de transformación con timestamp y encoderHash
     * @returns Array de argumentos FFmpeg para metadatos
     */
    public static buildMetadataArgs(params: TransformationParams): string[] {
        const args: string[] = [];

        // Metadato: Timestamp único de creación (ISO 8601)
        // FFmpeg usa -metadata creation_time para el timestamp del archivo
        args.push('-metadata', `creation_time=${params.timestamp}`);

        // Metadato: Encoder string único con hash de 16 caracteres
        // Formato: "OmniAI-{hash16}" para identificación única del encoder
        args.push('-metadata', `encoder=OmniAI-${params.encoderHash}`);

        return args;
    }

    /**
     * Aplica transformación COMPLETA a un video usando filter_complex.
     * REQ-1.1.6: Combina TODOS los filtros en una sola operación FFmpeg:
     * - Filtros geométricos (scale, rotate, crop)
     * - Filtros cromáticos (eq, hue)
     * - Filtros de overlay (noise, vignette)
     * - Filtros temporales (setpts, atempo)
     * - Metadatos únicos (creation_time, encoder)
     * - CRF variable (18-23)
     * 
     * Comando de referencia:
     * ffmpeg -i input.mp4 \
     *   -filter_complex "[0:v]scale=...,rotate=...,crop=...,eq=...,hue=...,noise=...,vignette=...,setpts=...,format=yuv420p[v];[0:a]atempo=...[a]" \
     *   -map "[v]" -map "[a]" \
     *   -c:v libx264 -preset medium -crf 20 \
     *   -c:a aac -b:a 128k \
     *   -metadata creation_time="..." \
     *   -metadata encoder="OmniAI-..." \
     *   -movflags +faststart \
     *   -y output.mp4
     * 
     * @param inputPath - Ruta absoluta al video de entrada
     * @param outputPath - Ruta absoluta donde guardar el video transformado
     * @param params - Parámetros de transformación completos
     * @param inputWidth - Ancho del video de entrada (default: 1080)
     * @param inputHeight - Alto del video de entrada (default: 1920)
     * @returns Promise con el resultado de la transformación
     */
    public static async applyFullTransformation(
        inputPath: string,
        outputPath: string,
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): Promise<VideoTransformResult> {
        // Validar parámetros antes de ejecutar
        VideoTransformer.validateParams(params);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
        }

        // Construir filter_complex combinando TODOS los filtros
        const filterComplex = VideoTransformer.buildFullFilterComplex(
            params,
            inputWidth,
            inputHeight
        );

        // Obtener argumentos de metadatos
        const metadataArgs = VideoTransformer.buildMetadataArgs(params);

        // Construir argumentos de FFmpeg completos
        const ffmpegArgs = [
            '-i', inputPath,                    // Input
            '-filter_complex', filterComplex,   // Filtros combinados video + audio
            '-map', '[v]',                      // Mapear stream de video filtrado
            '-map', '[a]',                      // Mapear stream de audio filtrado
            '-c:v', 'libx264',                  // Codec de video H.264
            '-preset', 'medium',                // Balance entre velocidad y compresión
            '-crf', params.crf.toString(),      // Calidad variable (18-23) - REQ-1.1.6
            '-c:a', 'aac',                      // Codec de audio
            '-b:a', '128k',                     // Bitrate de audio
            ...metadataArgs,                    // Metadatos únicos - REQ-1.1.6
            '-movflags', '+faststart',          // Optimización para streaming
            '-y',                               // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await VideoTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del output
        const hash = await VideoTransformer.calculateFileHash(outputPath);

        // Obtener duración del video (afectada por el cambio de velocidad)
        const duration = await VideoTransformer.getVideoDuration(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params,
            duration
        };
    }

    /**
     * Construye el filter_complex completo para FFmpeg combinando TODOS los filtros.
     * 
     * Orden de filtros (crítico para resultados correctos):
     * 1. Scale (zoom)
     * 2. Rotate (micro-rotación)
     * 3. Crop (asimétrico)
     * 4. EQ (saturación, contraste, brillo)
     * 5. Hue (shift de color)
     * 6. Noise (grain de película)
     * 7. Vignette (viñeta dinámica)
     * 8. Setpts (alteración temporal video)
     * 9. Format (yuv420p para compatibilidad)
     * + Atempo (alteración temporal audio)
     * 
     * @param params - Parámetros de transformación
     * @param inputWidth - Ancho del video de entrada
     * @param inputHeight - Alto del video de entrada
     * @returns String con filter_complex para FFmpeg
     */
    public static buildFullFilterComplex(
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): string {
        const videoFilters: string[] = [];

        // 1. ZOOM (scale) - REQ-1.1.2
        const scaledWidth = Math.round(inputWidth * params.zoom);
        const scaledHeight = Math.round(inputHeight * params.zoom);
        videoFilters.push(`scale=${scaledWidth}:${scaledHeight}`);

        // 2. ROTACIÓN (micro-rotación en radianes) - REQ-1.1.2
        const rotationRadians = (params.rotation * Math.PI) / 180;
        if (Math.abs(params.rotation) > 0.001) {
            videoFilters.push(`rotate=${rotationRadians.toFixed(6)}:fillcolor=black`);
        }

        // 3. CROP ASIMÉTRICO - REQ-1.1.2
        const cropWidth = inputWidth - params.cropLeft - params.cropRight;
        const cropHeight = inputHeight - params.cropTop - params.cropBottom;
        videoFilters.push(`crop=${cropWidth}:${cropHeight}:${params.cropLeft}:${params.cropTop}`);

        // 4. EQ (saturación, contraste, brillo) - REQ-1.1.3
        // brightness en FFmpeg eq es un offset, no multiplicador
        const brightnessOffset = params.brightness - 1;
        videoFilters.push(
            `eq=saturation=${params.saturation.toFixed(3)}:contrast=${params.contrast.toFixed(3)}:brightness=${brightnessOffset.toFixed(3)}`
        );

        // 5. HUE (shift de color en grados) - REQ-1.1.3
        videoFilters.push(`hue=h=${params.hue.toFixed(1)}`);

        // 6. NOISE (grain de película) - REQ-1.1.5
        videoFilters.push(`noise=alls=${params.grainIntensity}:allf=t+u`);

        // 7. VIGNETTE (viñeta dinámica) - REQ-1.1.5
        videoFilters.push(`vignette=PI*${params.vignetteStrength.toFixed(2)}`);

        // 8. SETPTS (alteración temporal video) - REQ-1.1.4
        // PTS/speed: velocidad > 1 acelera, velocidad < 1 desacelera
        videoFilters.push(`setpts=PTS/${params.speed.toFixed(3)}`);

        // 9. FORMAT (yuv420p para máxima compatibilidad)
        videoFilters.push('format=yuv420p');

        // Construir filter_complex con video y audio
        // Video: [0:v] → filtros → [v]
        // Audio: [0:a] → atempo → [a]
        const videoFilterChain = `[0:v]${videoFilters.join(',')}[v]`;
        const audioFilterChain = `[0:a]atempo=${params.speed.toFixed(3)}[a]`;

        return `${videoFilterChain};${audioFilterChain}`;
    }

    /**
     * Genera el comando FFmpeg completo para transformación full como string.
     * Útil para debugging, logging y verificación.
     * 
     * @param inputPath - Ruta al video de entrada
     * @param outputPath - Ruta al video de salida
     * @param params - Parámetros de transformación
     * @param inputWidth - Ancho del video de entrada
     * @param inputHeight - Alto del video de entrada
     * @returns Comando FFmpeg como string
     */
    public static getFullTransformationFFmpegCommand(
        inputPath: string,
        outputPath: string,
        params: TransformationParams,
        inputWidth: number = 1080,
        inputHeight: number = 1920
    ): string {
        const filterComplex = VideoTransformer.buildFullFilterComplex(
            params,
            inputWidth,
            inputHeight
        );

        return `ffmpeg -i "${inputPath}" -filter_complex "${filterComplex}" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf ${params.crf} -c:a aac -b:a 128k -metadata creation_time="${params.timestamp}" -metadata encoder="OmniAI-${params.encoderHash}" -movflags +faststart -y "${outputPath}"`;
    }

    /**
     * Valida que los parámetros estén dentro de los rangos permitidos.
     * @param params - Parámetros a validar
     * @returns true si todos los parámetros son válidos
     * @throws Error si algún parámetro está fuera de rango
     */
    public static validateParams(params: TransformationParams): boolean {
        const { zoom, rotation, cropLeft, cropRight, cropTop, cropBottom,
                hue, saturation, contrast, brightness, 
                grainIntensity, vignetteStrength, speed, crf } = params;

        const R = TRANSFORMATION_RANGES;

        if (zoom < R.zoom.min || zoom > R.zoom.max) {
            throw new Error(`Zoom ${zoom} fuera de rango [${R.zoom.min}, ${R.zoom.max}]`);
        }
        if (rotation < R.rotation.min || rotation > R.rotation.max) {
            throw new Error(`Rotación ${rotation} fuera de rango [${R.rotation.min}, ${R.rotation.max}]`);
        }
        if (cropLeft < R.crop.min || cropLeft > R.crop.max) {
            throw new Error(`CropLeft ${cropLeft} fuera de rango [${R.crop.min}, ${R.crop.max}]`);
        }
        if (cropRight < R.crop.min || cropRight > R.crop.max) {
            throw new Error(`CropRight ${cropRight} fuera de rango [${R.crop.min}, ${R.crop.max}]`);
        }
        if (cropTop < R.crop.min || cropTop > R.crop.max) {
            throw new Error(`CropTop ${cropTop} fuera de rango [${R.crop.min}, ${R.crop.max}]`);
        }
        if (cropBottom < R.crop.min || cropBottom > R.crop.max) {
            throw new Error(`CropBottom ${cropBottom} fuera de rango [${R.crop.min}, ${R.crop.max}]`);
        }
        if (hue < R.hue.min || hue > R.hue.max) {
            throw new Error(`Hue ${hue} fuera de rango [${R.hue.min}, ${R.hue.max}]`);
        }
        if (saturation < R.saturation.min || saturation > R.saturation.max) {
            throw new Error(`Saturación ${saturation} fuera de rango [${R.saturation.min}, ${R.saturation.max}]`);
        }
        if (contrast < R.contrast.min || contrast > R.contrast.max) {
            throw new Error(`Contraste ${contrast} fuera de rango [${R.contrast.min}, ${R.contrast.max}]`);
        }
        if (brightness < R.brightness.min || brightness > R.brightness.max) {
            throw new Error(`Brillo ${brightness} fuera de rango [${R.brightness.min}, ${R.brightness.max}]`);
        }
        if (grainIntensity < R.grain.min || grainIntensity > R.grain.max) {
            throw new Error(`Grain ${grainIntensity} fuera de rango [${R.grain.min}, ${R.grain.max}]`);
        }
        if (vignetteStrength < R.vignette.min || vignetteStrength > R.vignette.max) {
            throw new Error(`Viñeta ${vignetteStrength} fuera de rango [${R.vignette.min}, ${R.vignette.max}]`);
        }
        if (speed < R.speed.min || speed > R.speed.max) {
            throw new Error(`Speed ${speed} fuera de rango [${R.speed.min}, ${R.speed.max}]`);
        }
        if (crf < R.crf.min || crf > R.crf.max) {
            throw new Error(`CRF ${crf} fuera de rango [${R.crf.min}, ${R.crf.max}]`);
        }

        return true;
    }
}
