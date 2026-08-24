/**
 * ThumbnailTransformer.ts
 * 
 * Sistema de transformación anti-detección para thumbnails de videos.
 * Aplica las MISMAS transformaciones cromáticas que VideoTransformer para
 * garantizar consistencia visual video↔thumbnail mientras evita detección.
 * 
 * REQ-1.4.1: Crear ThumbnailTransformer.ts que aplique las MISMAS transformaciones 
 * cromáticas que VideoTransformer para sincronización perfecta.
 * 
 * Justificación: YouTube indexa thumbnails por hash visual. Si múltiples videos 
 * comparten la misma plantilla base, te marca como "producción en masa".
 */

import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';

// Reutiliza TransformationParams de VideoTransformer para sincronización
import { TransformationParams, TRANSFORMATION_RANGES } from './VideoTransformer';

// ===== INTERFACES =====

/**
 * Configuración para el overlay de texto en thumbnails.
 * El offset aleatorio evita posicionamiento repetitivo detectado por algoritmos.
 */
export interface TextOverlayConfig {
    /** Texto a mostrar en el thumbnail */
    text: string;
    
    /** Offset horizontal en píxeles (±20px aleatorio) */
    offsetX: number;
    
    /** Offset vertical en píxeles (±20px aleatorio) */
    offsetY: number;
    
    /** Estilo visual del texto */
    style: 'bold' | 'glow' | 'minimal';
}

/**
 * Configuración completa para la transformación de thumbnail.
 * Incluye sincronización con los parámetros del video correspondiente.
 */
export interface ThumbnailTransformerConfig {
    /** Ruta absoluta a la imagen base del thumbnail */
    baseImagePath: string;
    
    /** Parámetros de transformación sincronizados con el video */
    transformationParams: TransformationParams;
    
    /** Configuración del overlay de texto */
    textOverlay: TextOverlayConfig;
    
    /** Intensidad del grain de película (3-8) */
    grainIntensity: number;
}

/**
 * Resultado de una transformación de thumbnail.
 * Contiene información sobre el output generado y los parámetros aplicados.
 */
export interface ThumbnailTransformResult {
    /** Ruta absoluta al thumbnail transformado */
    outputPath: string;
    
    /** Hash MD5 del archivo de salida (debe ser único por transformación) */
    hash: string;
    
    /** Parámetros de transformación que se aplicaron */
    appliedParams: TransformationParams;
}

/**
 * Rangos de valores específicos para thumbnails.
 * Algunos difieren de video para optimizar calidad de imagen estática.
 */
export const THUMBNAIL_RANGES = {
    /** Offset de texto en píxeles */
    textOffset: { min: -20, max: 20 },
    
    /** Intensidad del grain para imágenes */
    grain: { min: 3, max: 8 },
    
    /** Dimensiones estándar de thumbnail de YouTube */
    dimensions: { width: 1280, height: 720 },
    
    /** Calidad JPEG para output */
    quality: { min: 85, max: 95 }
} as const;

// ===== CLASE PRINCIPAL =====

/**
 * ThumbnailTransformer - Clase para aplicar transformaciones anti-detección a thumbnails.
 * 
 * Esta clase implementa la lógica para:
 * - Aplicar las MISMAS transformaciones cromáticas que el video asociado
 * - Generar offsets aleatorios de texto para evitar patrones
 * - Añadir grain de película sutil para unicidad de hash
 * - Calcular hash único para cada thumbnail transformado
 * 
 * IMPORTANTE: Los parámetros de transformación cromática (hue, saturation, contrast)
 * deben ser los MISMOS que se aplicaron al video para mantener consistencia visual.
 */
export class ThumbnailTransformer {
    // ===== GENERACIÓN DE PARÁMETROS =====

    /**
     * Genera offsets aleatorios para el overlay de texto.
     * Offset ±20px para evitar posicionamiento repetitivo.
     * 
     * @param seed - Semilla opcional para reproducibilidad en tests
     * @returns Objeto con offsetX y offsetY aleatorios
     */
    public static generateTextOverlayOffset(seed?: number): { offsetX: number; offsetY: number } {
        const random = seed !== undefined 
            ? ThumbnailTransformer.seededRandom(seed) 
            : () => Math.random();

        const randomInRange = (min: number, max: number): number => {
            return Math.round(random() * (max - min) + min);
        };

        return {
            offsetX: randomInRange(THUMBNAIL_RANGES.textOffset.min, THUMBNAIL_RANGES.textOffset.max),
            offsetY: randomInRange(THUMBNAIL_RANGES.textOffset.min, THUMBNAIL_RANGES.textOffset.max)
        };
    }

    /**
     * Genera intensidad de grain aleatoria dentro del rango permitido.
     * 
     * @param seed - Semilla opcional para reproducibilidad en tests
     * @returns Intensidad de grain (3-8)
     */
    public static generateGrainIntensity(seed?: number): number {
        const random = seed !== undefined 
            ? ThumbnailTransformer.seededRandom(seed) 
            : () => Math.random();

        const { min, max } = THUMBNAIL_RANGES.grain;
        return Math.round(random() * (max - min) + min);
    }

    // ===== CONSTRUCCIÓN DE FILTROS =====

    /**
     * Construye el filtro cromático para imagen, sincronizado con VideoTransformer.
     * Usa los MISMOS valores de hue, saturación, contraste y brillo que el video.
     * 
     * Filtros FFmpeg usados:
     * - eq: para saturación, contraste y brillo
     * - hue: para hue shift en grados
     * 
     * @param params - Parámetros de transformación (los mismos del video)
     * @returns String con el filtro cromático FFmpeg para imágenes
     */
    public static buildColorFilter(params: TransformationParams): string {
        const filters: string[] = [];

        // 1. EQ Filter: saturación, contraste y brillo
        // Exactamente igual que en VideoTransformer para sincronización
        const brightnessOffset = params.brightness - 1;
        filters.push(
            `eq=saturation=${params.saturation.toFixed(3)}:contrast=${params.contrast.toFixed(3)}:brightness=${brightnessOffset.toFixed(3)}`
        );

        // 2. Hue Filter: hue shift en grados
        // Exactamente igual que en VideoTransformer
        filters.push(`hue=h=${params.hue.toFixed(1)}`);

        return filters.join(',');
    }

    /**
     * Construye el filtro de grain para imagen estática.
     * Aplica ruido uniforme (no temporal como en video) para generar hash único.
     * 
     * @param intensity - Intensidad del grain (3-8)
     * @returns String con el filtro de grain FFmpeg
     */
    public static buildGrainFilter(intensity: number): string {
        // noise=alls={intensity}:allf=u
        // - alls: aplica la misma intensidad a todos los planos
        // - allf=u: solo ruido uniforme (sin temporal ya que es imagen estática)
        return `noise=alls=${intensity}:allf=u`;
    }

    /**
     * Construye el filtro completo de imagen combinando todos los efectos.
     * 
     * Orden de filtros:
     * 1. Scale (zoom ligero para evitar detección)
     * 2. Crop (volver al tamaño estándar)
     * 3. EQ (saturación, contraste, brillo)
     * 4. Hue (shift de color)
     * 5. Noise (grain de película)
     * 
     * @param params - Parámetros de transformación sincronizados con video
     * @param grainIntensity - Intensidad del grain (3-8)
     * @returns String con el filtro completo FFmpeg
     */
    public static buildImageFilter(params: TransformationParams, grainIntensity: number): string {
        const filters: string[] = [];
        const { width, height } = THUMBNAIL_RANGES.dimensions;

        // 1. SCALE: Zoom ligero (usando el mismo zoom del video)
        const scaledWidth = Math.round(width * params.zoom);
        const scaledHeight = Math.round(height * params.zoom);
        filters.push(`scale=${scaledWidth}:${scaledHeight}`);

        // 2. CROP: Volver al tamaño estándar 1280x720
        // Centra el crop después del zoom
        filters.push(`crop=${width}:${height}`);

        // 3. EQ + HUE: Transformaciones cromáticas sincronizadas con video
        filters.push(ThumbnailTransformer.buildColorFilter(params));

        // 4. GRAIN: Ruido uniforme para unicidad
        filters.push(ThumbnailTransformer.buildGrainFilter(grainIntensity));

        return filters.join(',');
    }

    // ===== TRANSFORMACIÓN PRINCIPAL =====

    /**
     * Transforma un thumbnail aplicando las MISMAS transformaciones cromáticas que el video.
     * Garantiza consistencia visual video↔thumbnail mientras evita detección.
     * 
     * Comando FFmpeg de referencia:
     * ffmpeg -i thumbnail_base.png \
     *   -vf "scale=iw*1.05:ih*1.05,crop=1280:720,\
     *        eq=saturation=1.1:contrast=1.05:brightness=0.02,hue=h=5,\
     *        noise=alls=5:allf=u" \
     *   -q:v 2 \
     *   thumbnail_transformed.jpg
     * 
     * @param config - Configuración completa del thumbnail
     * @param outputPath - Ruta absoluta donde guardar el thumbnail transformado
     * @returns Promise con el resultado de la transformación
     */
    public static async transform(
        config: ThumbnailTransformerConfig,
        outputPath: string
    ): Promise<ThumbnailTransformResult> {
        // Validar configuración
        ThumbnailTransformer.validateConfig(config);

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(config.baseImagePath)) {
            throw new Error(`Imagen base no encontrada: ${config.baseImagePath}`);
        }

        // Construir el filtro completo de imagen
        const imageFilter = ThumbnailTransformer.buildImageFilter(
            config.transformationParams,
            config.grainIntensity
        );

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', config.baseImagePath,     // Input
            '-vf', imageFilter,             // Video filter (aplicado a imagen)
            '-q:v', '2',                    // Calidad JPEG alta (2 es muy buena)
            '-y',                           // Sobrescribir output si existe
            outputPath
        ];

        // Ejecutar FFmpeg
        await ThumbnailTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar que el output existe y tiene tamaño > 0
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash MD5 del thumbnail transformado
        const hash = await ThumbnailTransformer.generateThumbnailHash(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: config.transformationParams
        };
    }

    /**
     * Aplica solo transformaciones cromáticas a un thumbnail.
     * Útil cuando se quiere sincronizar colores sin otros efectos.
     * 
     * @param inputPath - Ruta absoluta a la imagen de entrada
     * @param outputPath - Ruta absoluta donde guardar el thumbnail transformado
     * @param params - Parámetros de transformación (mismos del video)
     * @returns Promise con el resultado de la transformación
     */
    public static async applyColorTransformations(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): Promise<ThumbnailTransformResult> {
        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Imagen de entrada no encontrada: ${inputPath}`);
        }

        // Construir solo el filtro cromático
        const colorFilter = ThumbnailTransformer.buildColorFilter(params);

        // Construir argumentos de FFmpeg
        const ffmpegArgs = [
            '-i', inputPath,
            '-vf', colorFilter,
            '-q:v', '2',
            '-y',
            outputPath
        ];

        // Ejecutar FFmpeg
        await ThumbnailTransformer.executeFFmpeg(ffmpegArgs);

        // Verificar output
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // Calcular hash
        const hash = await ThumbnailTransformer.generateThumbnailHash(outputPath);

        return {
            outputPath,
            hash,
            appliedParams: params
        };
    }

    /**
     * Aplica grain de película al thumbnail.
     * 
     * @param inputPath - Ruta a la imagen de entrada
     * @param outputPath - Ruta donde guardar la imagen con grain
     * @param intensity - Intensidad del grain (3-8)
     * @returns Promise que se resuelve cuando termina la transformación
     */
    public static async applyGrain(
        inputPath: string,
        outputPath: string,
        intensity: number
    ): Promise<void> {
        // Validar intensidad
        if (intensity < THUMBNAIL_RANGES.grain.min || intensity > THUMBNAIL_RANGES.grain.max) {
            throw new Error(
                `Intensidad de grain ${intensity} fuera de rango ` +
                `[${THUMBNAIL_RANGES.grain.min}, ${THUMBNAIL_RANGES.grain.max}]`
            );
        }

        // Verificar que el archivo de entrada existe
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Imagen de entrada no encontrada: ${inputPath}`);
        }

        const grainFilter = ThumbnailTransformer.buildGrainFilter(intensity);

        const ffmpegArgs = [
            '-i', inputPath,
            '-vf', grainFilter,
            '-q:v', '2',
            '-y',
            outputPath
        ];

        await ThumbnailTransformer.executeFFmpeg(ffmpegArgs);
    }

    // ===== HASH Y VERIFICACIÓN =====

    /**
     * Genera hash MD5 único del thumbnail transformado.
     * Usado para verificar unicidad y cacheo.
     * 
     * @param imagePath - Ruta al archivo de imagen
     * @returns Hash MD5 del archivo
     */
    public static generateThumbnailHash(imagePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(imagePath);
            
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }

    /**
     * Calcula hash de los parámetros de configuración.
     * Útil para identificar configuraciones únicas sin procesar la imagen.
     * 
     * @param config - Configuración del thumbnail
     * @returns Hash MD5 de la configuración
     */
    public static getConfigHash(config: ThumbnailTransformerConfig): string {
        const data = JSON.stringify({
            transformationParams: config.transformationParams,
            grainIntensity: config.grainIntensity,
            textOverlay: config.textOverlay
        });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    // ===== COMANDOS FFmpeg PARA DEBUGGING =====

    /**
     * Genera el comando FFmpeg para transformación completa como string.
     * Útil para debugging, logging y verificación.
     * 
     * @param config - Configuración del thumbnail
     * @param outputPath - Ruta de salida
     * @returns Comando FFmpeg como string
     */
    public static getFFmpegCommand(
        config: ThumbnailTransformerConfig,
        outputPath: string
    ): string {
        const imageFilter = ThumbnailTransformer.buildImageFilter(
            config.transformationParams,
            config.grainIntensity
        );

        return `ffmpeg -i "${config.baseImagePath}" -vf "${imageFilter}" -q:v 2 -y "${outputPath}"`;
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Ejecuta FFmpeg con los argumentos especificados.
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

    /**
     * Valida la configuración del thumbnail.
     * 
     * @param config - Configuración a validar
     * @throws Error si algún valor está fuera de rango
     */
    private static validateConfig(config: ThumbnailTransformerConfig): void {
        const { grainIntensity, textOverlay } = config;

        // Validar grain
        if (grainIntensity < THUMBNAIL_RANGES.grain.min || 
            grainIntensity > THUMBNAIL_RANGES.grain.max) {
            throw new Error(
                `Intensidad de grain ${grainIntensity} fuera de rango ` +
                `[${THUMBNAIL_RANGES.grain.min}, ${THUMBNAIL_RANGES.grain.max}]`
            );
        }

        // Validar offsets de texto
        const { min, max } = THUMBNAIL_RANGES.textOffset;
        if (textOverlay.offsetX < min || textOverlay.offsetX > max) {
            throw new Error(`OffsetX ${textOverlay.offsetX} fuera de rango [${min}, ${max}]`);
        }
        if (textOverlay.offsetY < min || textOverlay.offsetY > max) {
            throw new Error(`OffsetY ${textOverlay.offsetY} fuera de rango [${min}, ${max}]`);
        }

        // Validar estilo de texto
        const validStyles = ['bold', 'glow', 'minimal'];
        if (!validStyles.includes(textOverlay.style)) {
            throw new Error(`Estilo '${textOverlay.style}' no válido. Debe ser: ${validStyles.join(', ')}`);
        }

        // Validar que baseImagePath no esté vacío
        if (!config.baseImagePath || config.baseImagePath.trim() === '') {
            throw new Error('baseImagePath no puede estar vacío');
        }
    }
}
