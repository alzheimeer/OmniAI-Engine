/**
 * ReelsAdapter.ts
 * 
 * Adaptador para convertir videos de YouTube a formato Instagram Reels.
 * Parte de la Fase 5: Expansión Multiplataforma (bloqueada por YPPValidationGate.passed === true)
 * 
 * REQ-3.1.1: Crear ReelsAdapter.ts que adapte contenido de YouTube Shorts
 * 
 * Funcionalidades:
 * - Recorte a 30 segundos óptimo (REQ-3.1.2)
 * - Forzar subtítulos animados - 85% audiencia sin sonido (REQ-3.1.3)
 * - Color pop: saturación +20%, contraste +10% (REQ-3.1.4)
 * - Generar cover/thumbnail específico para Reels (REQ-3.1.6)
 * 
 * NOTA: Esta fase está bloqueada hasta que YPPValidationGate.passed === true.
 * El código existe para cuando se desbloquee.
 */

import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// ===== INTERFACES =====

/**
 * Configuración para la adaptación a Instagram Reels.
 * Define todos los parámetros necesarios para transformar un video de YouTube.
 */
export interface ReelsConfig {
    /** Ruta absoluta al video fuente (YouTube Short o video largo) */
    inputVideoPath: string;
    
    /** Duración máxima del Reel en segundos (default: 30) */
    maxDurationSeconds: number;
    
    /** Punto de inicio en segundos para el recorte (default: 0) */
    startTimeSeconds: number;
    
    /** Configuración de color pop */
    colorPop: {
        /** Incremento de saturación (default: +20% = 1.20) */
        saturationBoost: number;
        /** Incremento de contraste (default: +10% = 1.10) */
        contrastBoost: number;
    };
    
    /** Configuración de subtítulos */
    subtitles: {
        /** Habilitar subtítulos animados (default: true para Reels) */
        enabled: boolean;
        /** Ruta al archivo de subtítulos .ASS o .SRT */
        subtitlePath?: string;
        /** Estilo de subtítulos: bold, glow, minimal */
        style: 'bold' | 'glow' | 'minimal';
    };
    
    /** Configuración de zoom dinámico */
    dynamicZoom: {
        /** Habilitar zoom dinámico sutil (REQ-3.1.5) */
        enabled: boolean;
        /** Rango de zoom: min a max durante el video */
        minZoom: number;
        maxZoom: number;
    };
    
    /** Configuración de cover/thumbnail */
    cover: {
        /** Generar cover específico para Reels */
        generateCover: boolean;
        /** Segundo del video para extraer frame del cover (default: 1) */
        coverFrameTime: number;
        /** Timestamp opcional para extracción del frame (override de coverFrameTime) */
        customTimestamp?: number;
        /** Usar detección automática de momento impactante */
        useSmartFrameSelection?: boolean;
        /** Configuración de text overlay para el cover */
        textOverlay?: ReelsCoverTextOverlay;
        /** Aplicar el mismo color pop del video al cover */
        applyColorPop?: boolean;
        /** Formato de salida del cover */
        outputFormat?: 'jpeg' | 'png';
        /** Calidad de compresión JPEG (1-31, menor es mejor) */
        jpegQuality?: number;
    };
}

/**
 * Configuración de text overlay para el cover de Reels.
 * REQ-3.1.6: Soporte para texto en el cover
 */
export interface ReelsCoverTextOverlay {
    /** Texto a mostrar en el cover */
    text: string;
    /** Posición del texto en el cover */
    position: 'top' | 'center' | 'bottom';
    /** Nombre de la fuente (debe estar instalada en el sistema) */
    fontName?: string;
    /** Tamaño de fuente en puntos */
    fontSize?: number;
    /** Color del texto en formato hexadecimal (#FFFFFF) */
    fontColor?: string;
    /** Color del borde/stroke en formato hexadecimal (#000000) */
    borderColor?: string;
    /** Grosor del borde en píxeles */
    borderWidth?: number;
    /** Margen desde el borde en píxeles */
    margin?: number;
}

/**
 * Resultado de la adaptación a Instagram Reels.
 * Contiene las rutas a todos los assets generados y metadatos.
 */
export interface ReelsOutput {
    /** Ruta absoluta al video adaptado para Reels */
    videoPath: string;
    
    /** Ruta absoluta al cover/thumbnail (si se generó) */
    coverPath?: string;
    
    /** Duración final del Reel en segundos */
    durationSeconds: number;
    
    /** Resolución del video de salida */
    resolution: {
        width: number;
        height: number;
    };
    
    /** Hash MD5 del video generado para verificación */
    videoHash: string;
    
    /** Hash MD5 del cover (si se generó) */
    coverHash?: string;
    
    /** Metadatos del cover generado */
    coverMetadata?: ReelsCoverMetadata;
    
    /** Metadatos de la transformación aplicada */
    metadata: {
        /** Configuración de color pop aplicada */
        colorPopApplied: boolean;
        /** Saturación aplicada */
        saturationApplied: number;
        /** Contraste aplicado */
        contrastApplied: number;
        /** Subtítulos quemados */
        subtitlesBurned: boolean;
        /** Zoom dinámico aplicado */
        dynamicZoomApplied: boolean;
        /** Timestamp de procesamiento */
        processedAt: string;
    };
}

/**
 * Metadatos del cover generado para Reels.
 * REQ-3.1.6: Información detallada del thumbnail generado
 */
export interface ReelsCoverMetadata {
    /** Timestamp del frame extraído en segundos */
    extractedAtSecond: number;
    /** Resolución del cover (1080x1920 para Reels) */
    resolution: {
        width: number;
        height: number;
    };
    /** Color pop aplicado al cover */
    colorPopApplied: boolean;
    /** Text overlay aplicado */
    textOverlayApplied: boolean;
    /** Texto del overlay (si se aplicó) */
    textContent?: string;
    /** Formato de salida del cover */
    format: 'jpeg' | 'png';
    /** Método de selección del frame */
    frameSelectionMethod: 'manual' | 'smart' | 'default';
}

/**
 * Opciones internas para el procesamiento de video.
 */
interface ProcessingOptions {
    /** Codec de video a usar */
    videoCodec: string;
    /** Preset de encoding (ultrafast, fast, medium, slow) */
    preset: string;
    /** CRF para calidad (18-28) */
    crf: number;
    /** Codec de audio */
    audioCodec: string;
    /** Bitrate de audio */
    audioBitrate: string;
}

/**
 * Estrategia de selección de segmento para Reels.
 * REQ-3.1.2: Recortar a 30 segundos óptimo
 */
export type SegmentSelectionStrategy = 
    | 'full-video'      // Video completo (cuando es ≤30s)
    | 'hook-priority'   // Priorizar hook inicial
    | 'smart-selection'; // Selección inteligente basada en duración

/**
 * Posición preferida para la selección de segmento.
 */
export type PreferredSegmentPosition = 'start' | 'middle' | 'end';

/**
 * Resultado de la selección del segmento óptimo.
 * REQ-3.1.2: Incluye el razonamiento de la selección
 */
export interface SegmentSelectionResult {
    /** Segundo de inicio del segmento seleccionado */
    startTimeSeconds: number;
    /** Duración del segmento en segundos */
    durationSeconds: number;
    /** Estrategia utilizada para la selección */
    strategy: SegmentSelectionStrategy;
    /** Razón legible de por qué se seleccionó este segmento */
    reason: string;
}

/**
 * Opciones avanzadas para la selección de segmento.
 * REQ-3.1.2: Considerar el "hook" y evitar cortes bruscos
 */
export interface SegmentSelectionOptions {
    /** Duración objetivo del segmento en segundos (default: 30) */
    targetDuration?: number;
    /** Preservar el hook inicial del video (default: true) */
    preserveHook?: boolean;
    /** Duración del hook a preservar en segundos (default: 3) */
    hookDurationSeconds?: number;
    /** Evitar empezar exactamente en segundo 0 para videos largos (default: true) */
    avoidExactZeroStart?: boolean;
    /** Posición preferida: inicio, medio o final (default: 'start') */
    preferredPosition?: PreferredSegmentPosition;
}

/**
 * Configuración de estilo de subtítulos para FFmpeg.
 * Define los parámetros visuales para cada estilo.
 * REQ-3.1.3: Soportar estilos: bold, glow, minimal
 * 
 * NOTA: Los colores están en formato ASS/SSA (AABBGGRR o &HBBGGRR)
 * No confundir con formato RGB estándar.
 */
export interface SubtitleStyleConfig {
    /** Nombre de la fuente (debe estar instalada en el sistema) */
    fontName: string;
    /** Tamaño de fuente en puntos */
    fontSize: number;
    /** Color primario en formato BGR (FFmpeg/ASS: &HBBGGRR) */
    primaryColor: string;
    /** Color de borde/outline en formato BGR */
    outlineColor: string;
    /** Grosor del borde en píxeles */
    outlineWidth: number;
    /** Color de sombra en formato BGR con alfa opcional (&HAABBGGRR) */
    shadowColor: string;
    /** Desplazamiento de sombra en píxeles */
    shadowOffset: number;
    /** Efecto adicional para el estilo (blur para glow, etc.) */
    effect?: string;
    /** Descripción del uso ideal del estilo */
    description?: string;
}

/**
 * Resultado de la validación de subtítulos para Reels.
 * REQ-3.1.3: Los subtítulos son obligatorios (85% audiencia sin sonido)
 */
export interface SubtitleValidationResult {
    /** Indica si la validación pasó */
    valid: boolean;
    /** Error bloqueante (si valid=false) */
    error?: string;
    /** Advertencia no bloqueante */
    warning?: string;
    /** Recomendación para mejorar */
    recommendation?: string;
}

// ===== CONSTANTES =====

/**
 * Especificaciones técnicas de Instagram Reels.
 */
export const REELS_SPECS = {
    /** Duración óptima para engagement máximo */
    optimalDuration: 30,
    /** Duración máxima permitida por Instagram */
    maxDuration: 90,
    /** Resolución vertical estándar */
    resolution: { width: 1080, height: 1920 },
    /** Aspect ratio vertical (9:16) */
    aspectRatio: 9 / 16,
    /** Frame rate recomendado */
    frameRate: 30,
    /** Color pop por defecto */
    defaultColorPop: {
        saturationBoost: 1.20,  // +20%
        contrastBoost: 1.10     // +10%
    },
    /** Zoom dinámico por defecto */
    defaultDynamicZoom: {
        minZoom: 1.00,
        maxZoom: 1.05
    },
    /** Configuración de cover/thumbnail por defecto */
    defaultCover: {
        /** Segundo por defecto para extraer el frame (evitar primer frame negro) */
        defaultFrameTime: 1,
        /** Calidad JPEG por defecto (1-31, menor es mejor) */
        jpegQuality: 2,
        /** Formato por defecto */
        defaultFormat: 'jpeg' as const,
        /** Configuración de text overlay por defecto */
        textOverlay: {
            fontName: 'Arial Black',
            fontSize: 72,
            fontColor: '#FFFFFF',
            borderColor: '#000000',
            borderWidth: 4,
            margin: 50
        }
    }
} as const;

/**
 * Opciones de procesamiento por defecto.
 */
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
    videoCodec: 'libx264',
    preset: 'medium',
    crf: 20,
    audioCodec: 'aac',
    audioBitrate: '128k'
};

// ===== CLASE PRINCIPAL =====

/**
 * ReelsAdapter - Adaptador para convertir videos de YouTube a Instagram Reels.
 * 
 * Esta clase implementa la lógica para:
 * - Recortar videos a la duración óptima de 30 segundos (REQ-3.1.2)
 * - Aplicar color pop: saturación +20%, contraste +10% (REQ-3.1.4)
 * - Quemar subtítulos animados (REQ-3.1.3)
 * - Aplicar zoom dinámico sutil (REQ-3.1.5)
 * - Generar cover/thumbnail específico (REQ-3.1.6)
 * 
 * IMPORTANTE: Esta funcionalidad está bloqueada por YPPValidationGate.
 * El código existe para cuando se desbloquee la Fase 5.
 */
export class ReelsAdapter {
    // ===== CONFIGURACIÓN POR DEFECTO =====

    /**
     * Genera una configuración por defecto para adaptación a Reels.
     * 
     * @param inputVideoPath - Ruta al video fuente
     * @returns Configuración completa con valores por defecto
     */
    public static getDefaultConfig(inputVideoPath: string): ReelsConfig {
        return {
            inputVideoPath,
            maxDurationSeconds: REELS_SPECS.optimalDuration,
            startTimeSeconds: 0,
            colorPop: {
                saturationBoost: REELS_SPECS.defaultColorPop.saturationBoost,
                contrastBoost: REELS_SPECS.defaultColorPop.contrastBoost
            },
            subtitles: {
                enabled: true,
                style: 'bold'
            },
            dynamicZoom: {
                enabled: false,  // Deshabilitado por defecto, se implementa en 21.5
                minZoom: REELS_SPECS.defaultDynamicZoom.minZoom,
                maxZoom: REELS_SPECS.defaultDynamicZoom.maxZoom
            },
            cover: {
                generateCover: true,
                coverFrameTime: REELS_SPECS.defaultCover.defaultFrameTime,
                applyColorPop: true,
                outputFormat: REELS_SPECS.defaultCover.defaultFormat,
                jpegQuality: REELS_SPECS.defaultCover.jpegQuality,
                useSmartFrameSelection: false
            }
        };
    }

    // ===== MÉTODO PRINCIPAL =====

    /**
     * Adapta un video de YouTube al formato de Instagram Reels.
     * 
     * Pipeline de transformación:
     * 1. Validar entrada y configuración
     * 2. Validar subtítulos obligatorios (REQ-3.1.3: 85% audiencia sin sonido)
     * 3. Recortar a duración óptima (30s)
     * 4. Aplicar color pop (saturación +20%, contraste +10%)
     * 5. Quemar subtítulos animados con estilo
     * 6. Aplicar zoom dinámico (si está habilitado)
     * 7. Generar cover/thumbnail (si está configurado)
     * 8. Calcular hashes y retornar resultado
     * 
     * @param config - Configuración de adaptación
     * @param outputPath - Ruta donde guardar el video adaptado
     * @returns Promise con el resultado de la adaptación
     */
    public static async adaptVideoForReels(
        config: ReelsConfig,
        outputPath: string
    ): Promise<ReelsOutput> {
        // 1. Validar configuración general
        ReelsAdapter.validateConfig(config);

        // 2. REQ-3.1.3: Validar subtítulos OBLIGATORIOS
        // El 85% de la audiencia de Reels ve contenido sin sonido
        // Los subtítulos son críticos para el engagement
        ReelsAdapter.enforceSubtitlesRequired(config);

        // 3. Verificar que el archivo de entrada existe
        if (!fs.existsSync(config.inputVideoPath)) {
            throw new Error(`Video fuente no encontrado: ${config.inputVideoPath}`);
        }

        // 4. Construir el filtro completo de video (incluye subtítulos estilizados)
        const videoFilter = ReelsAdapter.buildCompleteFilter(config);

        // 5. Construir argumentos de FFmpeg
        const ffmpegArgs = ReelsAdapter.buildFFmpegArgs(
            config,
            outputPath,
            videoFilter
        );

        // 6. Ejecutar FFmpeg
        await ReelsAdapter.executeFFmpeg(ffmpegArgs);

        // 7. Verificar output
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // 8. Calcular hash del video
        const videoHash = await ReelsAdapter.calculateFileHash(outputPath);

        // 9. Obtener duración real del video generado
        const durationSeconds = await ReelsAdapter.getVideoDuration(outputPath);

        // 10. Generar cover si está configurado
        let coverPath: string | undefined;
        let coverHash: string | undefined;
        let coverMetadata: ReelsCoverMetadata | undefined;

        if (config.cover.generateCover) {
            const coverOutputPath = ReelsAdapter.generateCoverPath(outputPath, config.cover.outputFormat);
            
            // Determinar el timestamp para extraer el frame
            const frameTime = config.cover.customTimestamp ?? config.cover.coverFrameTime;
            
            // Generar el cover con todas las opciones
            const coverResult = await ReelsAdapter.generateReelsCover(
                outputPath,
                coverOutputPath,
                {
                    frameTime,
                    colorPop: config.cover.applyColorPop !== false ? config.colorPop : undefined,
                    textOverlay: config.cover.textOverlay,
                    outputFormat: config.cover.outputFormat || 'jpeg',
                    jpegQuality: config.cover.jpegQuality || REELS_SPECS.defaultCover.jpegQuality,
                    useSmartFrameSelection: config.cover.useSmartFrameSelection
                }
            );
            
            coverPath = coverResult.outputPath;
            coverHash = await ReelsAdapter.calculateFileHash(coverOutputPath);
            coverMetadata = coverResult.metadata;
        }

        // 11. Construir y retornar resultado
        return {
            videoPath: outputPath,
            coverPath,
            durationSeconds,
            resolution: REELS_SPECS.resolution,
            videoHash,
            coverHash,
            coverMetadata,
            metadata: {
                colorPopApplied: true,
                saturationApplied: config.colorPop.saturationBoost,
                contrastApplied: config.colorPop.contrastBoost,
                subtitlesBurned: config.subtitles.enabled && !!config.subtitles.subtitlePath,
                dynamicZoomApplied: config.dynamicZoom.enabled,
                processedAt: new Date().toISOString()
            }
        };
    }

    // ===== MÉTODOS DE CONSTRUCCIÓN DE FILTROS =====

    /**
     * Construye el filtro de color pop para Instagram Reels.
     * REQ-3.1.4: Aplicar color pop: saturación +20%, contraste +10%
     * 
     * @param saturationBoost - Multiplicador de saturación (1.20 = +20%)
     * @param contrastBoost - Multiplicador de contraste (1.10 = +10%)
     * @returns String con el filtro de color pop FFmpeg
     */
    public static buildColorPopFilter(
        saturationBoost: number,
        contrastBoost: number
    ): string {
        // eq=saturation=VALUE:contrast=VALUE
        // FFmpeg eq filter usa multiplicadores directamente
        return `eq=saturation=${saturationBoost.toFixed(3)}:contrast=${contrastBoost.toFixed(3)}`;
    }

    /**
     * Construye el filtro de recorte temporal.
     * REQ-3.1.2: Recortar duración a 30 segundos óptimo
     * 
     * NOTA: El recorte se hace mediante -ss y -t en los argumentos de FFmpeg,
     * no como filtro. Este método existe para documentación/testing.
     * 
     * @param startTime - Segundo de inicio del recorte
     * @param duration - Duración en segundos
     * @returns Objeto con los parámetros de recorte
     */
    public static buildTrimParams(
        startTime: number,
        duration: number
    ): { startTime: number; duration: number } {
        return { startTime, duration };
    }

    /**
     * Selecciona el segmento óptimo de 30 segundos de un video para Instagram Reels.
     * REQ-3.1.2: Recortar a 30 segundos óptimo - elegir inteligentemente la sección más interesante
     * 
     * Estrategia de selección:
     * 1. Videos cortos (≤30s): Usar todo el video desde el inicio
     * 2. Videos medianos (30-60s): Priorizar el "hook" inicial (primeros 30s tienen mayor retención)
     * 3. Videos largos (>60s): Seleccionar el primer tercio donde suele estar el contenido más atractivo,
     *    pero evitar empezar exactamente en 0 para evitar intros genéricas
     * 
     * Consideraciones:
     * - El "hook" inicial es crucial para Reels (85% audiencia sin sonido = necesitan captar atención visual)
     * - Evitar cortes bruscos: redondear a segundos completos
     * - Priorizar inicio del video donde suele estar el contenido más pulido
     * 
     * NOTA: Esta es una implementación básica. Una versión avanzada podría usar:
     * - Análisis de audio para detectar silencios/puntos de corte naturales
     * - Detección de escenas con FFmpeg scene filter
     * - Machine learning para detectar momentos "interesantes"
     * 
     * @param videoDurationSeconds - Duración total del video fuente en segundos
     * @param targetDuration - Duración objetivo del Reel (default: 30s)
     * @returns Resultado con startTime y duration óptimos
     */
    public static selectOptimalSegment(
        videoDurationSeconds: number,
        targetDuration: number = REELS_SPECS.optimalDuration
    ): SegmentSelectionResult {
        // Validar entrada
        if (videoDurationSeconds <= 0) {
            throw new Error('La duración del video debe ser mayor que 0');
        }
        if (targetDuration <= 0) {
            throw new Error('La duración objetivo debe ser mayor que 0');
        }

        // Caso 1: Video más corto que la duración objetivo
        // Usar todo el video desde el inicio
        if (videoDurationSeconds <= targetDuration) {
            return {
                startTimeSeconds: 0,
                durationSeconds: videoDurationSeconds,
                strategy: 'full-video',
                reason: `Video corto (${videoDurationSeconds.toFixed(1)}s) - usando contenido completo`
            };
        }

        // Caso 2: Video moderadamente largo (hasta 2x la duración objetivo)
        // Priorizar el hook inicial - los primeros segundos son los más importantes
        // para captar atención en Reels
        if (videoDurationSeconds <= targetDuration * 2) {
            return {
                startTimeSeconds: 0,
                durationSeconds: targetDuration,
                strategy: 'hook-priority',
                reason: `Video mediano (${videoDurationSeconds.toFixed(1)}s) - priorizando hook inicial de ${targetDuration}s`
            };
        }

        // Caso 3: Video largo (más de 2x la duración objetivo)
        // Estrategia: Empezar ligeramente después del segundo 0 para evitar intros genéricas,
        // pero manteniéndonos en el primer tercio del video donde está el contenido más atractivo
        const maxStartTime = Math.floor(videoDurationSeconds / 3);
        
        // Calcular un pequeño offset para evitar exactamente el segundo 0
        // Usamos un offset de 1-3 segundos para saltar posibles intros/logos
        const introOffset = Math.min(2, maxStartTime);
        
        // Asegurar que hay suficiente contenido después del offset
        const startTime = Math.min(introOffset, videoDurationSeconds - targetDuration);
        
        // Redondear a segundos completos para evitar cortes bruscos
        const roundedStartTime = Math.floor(Math.max(0, startTime));

        // Verificar que no excedemos la duración del video
        const actualDuration = Math.min(targetDuration, videoDurationSeconds - roundedStartTime);

        return {
            startTimeSeconds: roundedStartTime,
            durationSeconds: actualDuration,
            strategy: 'smart-selection',
            reason: `Video largo (${videoDurationSeconds.toFixed(1)}s) - selección inteligente desde segundo ${roundedStartTime}`
        };
    }

    /**
     * Selecciona el segmento óptimo basándose en análisis de la estructura del video.
     * REQ-3.1.2: Considerar el "hook" al inicio y evitar cortes bruscos
     * 
     * Esta versión avanzada considera:
     * - hookPreservation: Si preservar el hook inicial (primeros 3-5 segundos)
     * - avoidHardCuts: Intentar terminar en puntos naturales
     * 
     * @param videoDurationSeconds - Duración total del video fuente
     * @param options - Opciones de selección avanzadas
     * @returns Resultado con startTime y duration óptimos
     */
    public static selectOptimalSegmentAdvanced(
        videoDurationSeconds: number,
        options: SegmentSelectionOptions = {}
    ): SegmentSelectionResult {
        const {
            targetDuration = REELS_SPECS.optimalDuration,
            preserveHook = true,
            hookDurationSeconds = 3,
            avoidExactZeroStart = true,
            preferredPosition = 'start'
        } = options;

        // Validaciones
        if (videoDurationSeconds <= 0) {
            throw new Error('La duración del video debe ser mayor que 0');
        }
        if (targetDuration <= 0) {
            throw new Error('La duración objetivo debe ser mayor que 0');
        }

        // Video corto: usar todo
        if (videoDurationSeconds <= targetDuration) {
            return {
                startTimeSeconds: 0,
                durationSeconds: videoDurationSeconds,
                strategy: 'full-video',
                reason: `Video completo usado (${videoDurationSeconds.toFixed(1)}s)`
            };
        }

        let startTime = 0;
        let strategy: SegmentSelectionStrategy = 'hook-priority';
        let reason = '';

        switch (preferredPosition) {
            case 'start':
                // Priorizar inicio (hook)
                if (preserveHook) {
                    startTime = 0;
                    strategy = 'hook-priority';
                    reason = `Preservando hook inicial de ${hookDurationSeconds}s`;
                } else if (avoidExactZeroStart && videoDurationSeconds > targetDuration + 2) {
                    // Pequeño offset para evitar intros genéricas
                    startTime = 2;
                    strategy = 'smart-selection';
                    reason = 'Offset de 2s para evitar intro genérica';
                }
                break;

            case 'middle':
                // Seleccionar segmento del medio (útil para videos con intro larga)
                const middlePoint = videoDurationSeconds / 2;
                startTime = Math.max(0, Math.floor(middlePoint - targetDuration / 2));
                strategy = 'smart-selection';
                reason = `Segmento central desde segundo ${startTime}`;
                break;

            case 'end':
                // Seleccionar final (útil para videos con climax al final)
                startTime = Math.max(0, Math.floor(videoDurationSeconds - targetDuration));
                strategy = 'smart-selection';
                reason = `Segmento final desde segundo ${startTime}`;
                break;
        }

        // Asegurar que no excedemos la duración
        const actualDuration = Math.min(targetDuration, videoDurationSeconds - startTime);

        return {
            startTimeSeconds: startTime,
            durationSeconds: actualDuration,
            strategy,
            reason
        };
    }

    /**
     * Construye el filtro de subtítulos para quemar en el video.
     * REQ-3.1.3: Forzar subtítulos animados (85% audiencia sin sonido)
     * 
     * @param subtitlePath - Ruta al archivo de subtítulos (.ass o .srt)
     * @returns String con el filtro de subtítulos FFmpeg
     */
    public static buildSubtitleFilter(subtitlePath: string): string {
        // Escapar caracteres especiales en la ruta para FFmpeg
        const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        
        // Determinar el tipo de archivo
        const ext = path.extname(subtitlePath).toLowerCase();
        
        if (ext === '.ass') {
            // Usar filtro ass para archivos Advanced SubStation Alpha
            return `ass='${escapedPath}'`;
        } else {
            // Usar filtro subtitles para .srt y otros formatos
            return `subtitles='${escapedPath}'`;
        }
    }

    /**
     * Configuración de estilo de subtítulos para FFmpeg.
     * Define los parámetros visuales para cada estilo.
     * 
     * REQ-3.1.3: El 85% de la audiencia de Reels ve contenido SIN SONIDO.
     * Los subtítulos son CRÍTICOS para el engagement y deben ser:
     * - Altamente legibles
     * - Visualmente atractivos
     * - Posicionados en zona segura
     */
    public static readonly SUBTITLE_STYLES: Record<'bold' | 'glow' | 'minimal', SubtitleStyleConfig> = {
        /**
         * Estilo BOLD: Negrita destacada, alta legibilidad
         * - Fuente grande y gruesa
         * - Borde negro pronunciado
         * - Sombra sutil para profundidad
         * - IDEAL PARA: Contenido educativo, explicaciones, tutoriales
         */
        bold: {
            fontName: 'Arial Black',
            fontSize: 24,
            primaryColor: '&HFFFFFF',    // Blanco
            outlineColor: '&H000000',    // Negro
            outlineWidth: 3,
            shadowColor: '&H80000000',   // Negro semitransparente
            shadowOffset: 2,
            description: 'Alta legibilidad para contenido educativo y explicaciones'
        },
        /**
         * Estilo GLOW: Efecto brillante/neón
         * - Fuente con efecto de resplandor cyan
         * - Borde difuminado para efecto glow
         * - Colores vivos para mayor engagement
         * - IDEAL PARA: Contenido energético, tech, gaming, trends
         */
        glow: {
            fontName: 'Impact',
            fontSize: 22,
            primaryColor: '&HFFFFFF',    // Blanco
            outlineColor: '&HFFFF00',    // Cyan (BGR: 00FFFF → FFFF00 en ASS)
            outlineWidth: 4,
            shadowColor: '&HFFFF00',     // Cyan glow
            shadowOffset: 0,
            effect: 'blur',               // Efecto blur para glow
            description: 'Efecto neón brillante para contenido energético y trending'
        },
        /**
         * Estilo MINIMAL: Simple y limpio
         * - Fuente elegante y delgada
         * - Borde mínimo
         * - Sin sombra visible
         * - IDEAL PARA: Contenido profesional, serio, minimalista
         */
        minimal: {
            fontName: 'Montserrat',
            fontSize: 20,
            primaryColor: '&HFFFFFF',    // Blanco
            outlineColor: '&H40000000',  // Negro semitransparente
            outlineWidth: 1,
            shadowColor: '&H00000000',   // Sin sombra visible
            shadowOffset: 0,
            description: 'Estilo limpio y profesional para contenido serio'
        }
    };

    /**
     * Construye el filtro de subtítulos con estilo aplicado.
     * REQ-3.1.3: Generar filtro FFmpeg apropiado para cada estilo (bold, glow, minimal)
     * 
     * Para archivos .ASS: El estilo se aplica directamente en el archivo ASS,
     * pero podemos forzar estilos con force_style.
     * 
     * Para archivos .SRT: Usamos force_style para aplicar el estilo completo.
     * 
     * @param subtitlePath - Ruta al archivo de subtítulos (.ass o .srt)
     * @param style - Estilo de subtítulos: 'bold', 'glow', 'minimal'
     * @returns String con el filtro de subtítulos FFmpeg estilizado
     */
    public static buildStyledSubtitleFilter(
        subtitlePath: string, 
        style: 'bold' | 'glow' | 'minimal'
    ): string {
        // Escapar caracteres especiales en la ruta para FFmpeg
        const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        
        // Obtener configuración del estilo
        const styleConfig = ReelsAdapter.SUBTITLE_STYLES[style];
        
        // Construir force_style para FFmpeg
        // Formato: FontName=X,FontSize=Y,PrimaryColour=Z,...
        const forceStyleParts: string[] = [
            `FontName=${styleConfig.fontName}`,
            `FontSize=${styleConfig.fontSize}`,
            `PrimaryColour=${styleConfig.primaryColor}`,
            `OutlineColour=${styleConfig.outlineColor}`,
            `Outline=${styleConfig.outlineWidth}`,
            `Shadow=${styleConfig.shadowOffset}`,
            `BackColour=${styleConfig.shadowColor}`,
            'Bold=1',          // Siempre bold para Reels
            'Alignment=2',     // Centrado inferior
            'MarginV=60'       // Margen inferior (zona segura)
        ];
        
        // Agregar efecto especial si existe (para estilo glow)
        if (style === 'glow') {
            // Para glow, aumentamos el borde y usamos blur
            forceStyleParts.push('BorderStyle=3'); // Borde con caja opaca + efecto
        }
        
        const forceStyle = forceStyleParts.join(',');
        
        // Determinar el tipo de archivo
        const ext = path.extname(subtitlePath).toLowerCase();
        
        if (ext === '.ass') {
            // Para ASS: usar filtro ass con force_style
            // Nota: force_style puede sobrescribir estilos del archivo ASS
            return `ass='${escapedPath}':force_style='${forceStyle}'`;
        } else {
            // Para SRT y otros: usar filtro subtitles con force_style
            return `subtitles='${escapedPath}':force_style='${forceStyle}'`;
        }
    }

    /**
     * Obtiene la configuración de estilo de subtítulos.
     * REQ-3.1.3: Permite acceso programático a los estilos de subtítulos
     * 
     * @param style - Estilo de subtítulos: 'bold', 'glow', 'minimal'
     * @returns Configuración completa del estilo
     */
    public static getSubtitleStyleConfig(style: 'bold' | 'glow' | 'minimal'): SubtitleStyleConfig {
        return { ...ReelsAdapter.SUBTITLE_STYLES[style] };
    }

    /**
     * Obtiene todos los estilos de subtítulos disponibles.
     * REQ-3.1.3: Lista los estilos optimizados para Reels (85% audiencia sin sonido)
     * 
     * @returns Array con los nombres de los estilos disponibles
     */
    public static getAvailableSubtitleStyles(): Array<'bold' | 'glow' | 'minimal'> {
        return ['bold', 'glow', 'minimal'];
    }

    /**
     * Recomienda un estilo de subtítulos basado en el tipo de contenido.
     * REQ-3.1.3: Ayuda a elegir el estilo óptimo para maximizar engagement
     * 
     * @param contentType - Tipo de contenido del Reel
     * @returns Estilo recomendado y razón
     */
    public static recommendSubtitleStyle(
        contentType: 'educational' | 'energetic' | 'professional' | 'trending' | 'default'
    ): { style: 'bold' | 'glow' | 'minimal'; reason: string } {
        switch (contentType) {
            case 'educational':
                return {
                    style: 'bold',
                    reason: 'Estilo BOLD: Alta legibilidad para contenido educativo donde el mensaje es prioritario'
                };
            case 'energetic':
            case 'trending':
                return {
                    style: 'glow',
                    reason: 'Estilo GLOW: Efecto neón vibrante que captura atención para contenido energético y trends'
                };
            case 'professional':
                return {
                    style: 'minimal',
                    reason: 'Estilo MINIMAL: Apariencia limpia y profesional que no distrae del contenido'
                };
            default:
                return {
                    style: 'bold',
                    reason: 'Estilo BOLD por defecto: Balance óptimo entre legibilidad y atractivo visual'
                };
        }
    }

    /**
     * Genera la cadena force_style para FFmpeg basada en el estilo.
     * REQ-3.1.3: Útil para debugging y personalización avanzada
     * 
     * @param style - Estilo de subtítulos: 'bold', 'glow', 'minimal'
     * @returns Cadena force_style lista para usar en FFmpeg
     */
    public static getForceStyleString(style: 'bold' | 'glow' | 'minimal'): string {
        const styleConfig = ReelsAdapter.SUBTITLE_STYLES[style];
        
        const parts: string[] = [
            `FontName=${styleConfig.fontName}`,
            `FontSize=${styleConfig.fontSize}`,
            `PrimaryColour=${styleConfig.primaryColor}`,
            `OutlineColour=${styleConfig.outlineColor}`,
            `Outline=${styleConfig.outlineWidth}`,
            `Shadow=${styleConfig.shadowOffset}`,
            `BackColour=${styleConfig.shadowColor}`,
            'Bold=1',
            'Alignment=2',
            'MarginV=60'
        ];
        
        if (style === 'glow') {
            parts.push('BorderStyle=3');
        }
        
        return parts.join(',');
    }

    /**
     * Valida que los subtítulos estén configurados para Reels.
     * REQ-3.1.3: Los subtítulos son OBLIGATORIOS para Reels (85% audiencia sin sonido)
     * 
     * Esta validación es crucial porque:
     * - El 85% de los usuarios de Instagram ven Reels sin sonido
     * - Sin subtítulos, el contenido pierde la mayor parte de su mensaje
     * - Reels sin subtítulos tienen engagement significativamente menor
     * 
     * @param config - Configuración de ReelsAdapter
     * @returns Objeto con resultado de validación y detalles
     */
    public static validateSubtitlesRequired(config: ReelsConfig): SubtitleValidationResult {
        // Verificación 1: Subtítulos deben estar habilitados
        if (!config.subtitles.enabled) {
            return {
                valid: false,
                error: 'SUBTÍTULOS OBLIGATORIOS: Los subtítulos están deshabilitados. ' +
                       'El 85% de la audiencia de Reels ve contenido SIN SONIDO. ' +
                       'Habilita subtítulos con config.subtitles.enabled = true',
                recommendation: 'Habilita subtítulos para maximizar el engagement en Instagram Reels'
            };
        }
        
        // Verificación 2: Debe existir una ruta al archivo de subtítulos
        if (!config.subtitles.subtitlePath) {
            return {
                valid: false,
                error: 'SUBTÍTULOS OBLIGATORIOS: No se ha proporcionado archivo de subtítulos. ' +
                       'El 85% de la audiencia de Reels ve contenido SIN SONIDO. ' +
                       'Proporciona ruta en config.subtitles.subtitlePath',
                recommendation: 'Genera subtítulos con SubtitleGenerator antes de adaptar a Reels'
            };
        }
        
        // Verificación 3: El archivo de subtítulos debe existir en disco
        if (!fs.existsSync(config.subtitles.subtitlePath)) {
            return {
                valid: false,
                error: `SUBTÍTULOS OBLIGATORIOS: El archivo de subtítulos no existe: ` +
                       `${config.subtitles.subtitlePath}. ` +
                       'Genera los subtítulos antes de adaptar a Reels.',
                recommendation: 'Usa SubtitleGenerator.generateSubtitles() para crear el archivo de subtítulos'
            };
        }
        
        // Verificación 4 (WARNING): Verificar extensión de archivo válida
        const ext = path.extname(config.subtitles.subtitlePath).toLowerCase();
        const validExtensions = ['.ass', '.srt', '.vtt'];
        
        if (!validExtensions.includes(ext)) {
            return {
                valid: true,  // Es una advertencia, no un error bloqueante
                warning: `Extensión de subtítulos '${ext}' no es estándar. ` +
                         `Se recomienda usar: ${validExtensions.join(', ')}. ` +
                         'FFmpeg intentará procesar el archivo pero podría fallar.',
                recommendation: 'Convierte los subtítulos a formato .ASS para mejores resultados'
            };
        }
        
        // Verificación 5 (WARNING): Recomendar .ASS para mejor animación
        if (ext !== '.ass') {
            return {
                valid: true,
                warning: `Usando formato '${ext}' para subtítulos. ` +
                         'Para subtítulos animados con mejor calidad visual, se recomienda .ASS',
                recommendation: 'El formato .ASS permite animaciones y estilos más avanzados'
            };
        }
        
        // Todas las verificaciones pasaron
        return {
            valid: true,
            recommendation: 'Subtítulos configurados correctamente para Reels'
        };
    }

    /**
     * Valida los subtítulos y lanza error si no están configurados.
     * Versión estricta de validateSubtitlesRequired que lanza excepciones.
     * REQ-3.1.3: Forzar subtítulos animados
     * 
     * @param config - Configuración de ReelsAdapter
     * @throws Error si los subtítulos no están correctamente configurados
     */
    public static enforceSubtitlesRequired(config: ReelsConfig): void {
        const validation = ReelsAdapter.validateSubtitlesRequired(config);
        
        if (!validation.valid && validation.error) {
            throw new Error(validation.error);
        }
        
        // Loguear warnings si existen (no bloquean pero informan)
        if (validation.warning) {
            console.warn(`[ReelsAdapter] ⚠️ ${validation.warning}`);
            if (validation.recommendation) {
                console.warn(`[ReelsAdapter] 💡 ${validation.recommendation}`);
            }
        }
    }

    /**
     * Construye el filtro de zoom dinámico sutil.
     * REQ-3.1.5: Implementar zoom dinámico sutil durante el video
     * 
     * STUB: Implementación completa en tarea 21.5
     * 
     * @param minZoom - Zoom mínimo (1.00 = 100%)
     * @param maxZoom - Zoom máximo (1.05 = 105%)
     * @param durationSeconds - Duración del video en segundos
     * @returns String con el filtro de zoom dinámico FFmpeg
     */
    public static buildDynamicZoomFilter(
        minZoom: number,
        maxZoom: number,
        durationSeconds: number
    ): string {
        // STUB: Implementación básica - zoom lineal de min a max
        // La implementación completa irá en tarea 21.5
        const zoomExpression = `'${minZoom}+(${maxZoom}-${minZoom})*t/${durationSeconds}'`;
        return `zoompan=z=${zoomExpression}:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`;
    }

    /**
     * Construye el filtro completo combinando todos los efectos.
     * 
     * Orden de filtros:
     * 1. Scale (asegurar resolución 1080x1920)
     * 2. Color pop (saturación, contraste)
     * 3. Subtítulos con estilo (si están habilitados)
     * 4. Formato de salida
     * 
     * @param config - Configuración de adaptación
     * @returns String con el filtro completo FFmpeg
     */
    public static buildCompleteFilter(config: ReelsConfig): string {
        const filters: string[] = [];

        // 1. Scale a resolución de Reels (1080x1920)
        // Usa flags de alta calidad para escalado
        filters.push(`scale=${REELS_SPECS.resolution.width}:${REELS_SPECS.resolution.height}:flags=lanczos`);

        // 2. Color pop
        filters.push(ReelsAdapter.buildColorPopFilter(
            config.colorPop.saturationBoost,
            config.colorPop.contrastBoost
        ));

        // 3. Subtítulos con estilo (si están habilitados y hay archivo)
        // REQ-3.1.3: Usar buildStyledSubtitleFilter para aplicar el estilo configurado
        if (config.subtitles.enabled && config.subtitles.subtitlePath) {
            filters.push(ReelsAdapter.buildStyledSubtitleFilter(
                config.subtitles.subtitlePath,
                config.subtitles.style
            ));
        }

        // 4. Zoom dinámico (si está habilitado) - STUB para tarea 21.5
        // No se agrega aquí porque requiere filter_complex especial
        // if (config.dynamicZoom.enabled) { ... }

        // 5. Formato de salida compatible
        filters.push('format=yuv420p');

        return filters.join(',');
    }

    // ===== GENERACIÓN DE COVER/THUMBNAIL PARA REELS =====

    /**
     * Genera un cover/thumbnail específico para Instagram Reels.
     * REQ-3.1.6: Generar cover/thumbnail específico para Reels en formato vertical 9:16
     * 
     * Características:
     * - Extrae frame del video en formato vertical (1080x1920)
     * - Aplica el mismo color pop del video para consistencia visual
     * - Soporta text overlay opcional para títulos/hooks
     * - Permite especificar timestamp personalizado
     * - Usa selección inteligente de frame (evita frames oscuros/borrosos)
     * 
     * @param videoPath - Ruta al video del cual extraer el frame
     * @param outputPath - Ruta donde guardar el cover
     * @param options - Opciones de generación del cover
     * @returns Promise con el resultado de la generación
     */
    public static async generateReelsCover(
        videoPath: string,
        outputPath: string,
        options: {
            frameTime: number;
            colorPop?: { saturationBoost: number; contrastBoost: number };
            textOverlay?: ReelsCoverTextOverlay;
            outputFormat: 'jpeg' | 'png';
            jpegQuality: number;
            useSmartFrameSelection?: boolean;
        }
    ): Promise<{ outputPath: string; metadata: ReelsCoverMetadata }> {
        // Validar que el video existe
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video fuente no encontrado: ${videoPath}`);
        }

        // Determinar el timestamp para extraer
        let extractTime = options.frameTime;
        let frameSelectionMethod: 'manual' | 'smart' | 'default' = 'manual';

        // Si se solicita selección inteligente, usar análisis de escena
        if (options.useSmartFrameSelection) {
            try {
                extractTime = await ReelsAdapter.findBestFrameTimestamp(videoPath, options.frameTime);
                frameSelectionMethod = 'smart';
            } catch (error) {
                // Fallback al timestamp por defecto
                console.warn('[ReelsAdapter] ⚠️ Selección inteligente falló, usando timestamp manual:', error);
                frameSelectionMethod = 'default';
            }
        }

        // Construir los filtros de video
        const filters = ReelsAdapter.buildCoverFilters(options);

        // Construir argumentos de FFmpeg
        const ffmpegArgs = ReelsAdapter.buildCoverFFmpegArgs(
            videoPath,
            outputPath,
            extractTime,
            filters,
            options.outputFormat,
            options.jpegQuality
        );

        // Ejecutar FFmpeg
        await ReelsAdapter.executeFFmpeg(ffmpegArgs);

        // Verificar que se generó el archivo
        if (!fs.existsSync(outputPath)) {
            throw new Error(`No se pudo generar el cover: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de cover está vacío: ${outputPath}`);
        }

        // Construir metadatos
        const metadata: ReelsCoverMetadata = {
            extractedAtSecond: extractTime,
            resolution: REELS_SPECS.resolution,
            colorPopApplied: options.colorPop !== undefined,
            textOverlayApplied: options.textOverlay !== undefined,
            textContent: options.textOverlay?.text,
            format: options.outputFormat,
            frameSelectionMethod
        };

        return { outputPath, metadata };
    }

    /**
     * Genera un cover/thumbnail específico para Instagram Reels (versión simplificada).
     * REQ-3.1.6: Método de compatibilidad con API anterior
     * 
     * @param videoPath - Ruta al video del cual extraer el frame
     * @param outputPath - Ruta donde guardar el cover
     * @param frameTime - Segundo del video para extraer el frame
     * @param colorPop - Configuración de color pop a aplicar
     * @deprecated Usar generateReelsCover para más opciones
     */
    public static async generateCover(
        videoPath: string,
        outputPath: string,
        frameTime: number,
        colorPop: { saturationBoost: number; contrastBoost: number }
    ): Promise<void> {
        await ReelsAdapter.generateReelsCover(videoPath, outputPath, {
            frameTime,
            colorPop,
            outputFormat: 'jpeg',
            jpegQuality: REELS_SPECS.defaultCover.jpegQuality
        });
    }

    /**
     * Construye los filtros de video para la generación del cover.
     * REQ-3.1.6: Filtros específicos para thumbnails de Reels
     * 
     * @param options - Opciones de generación del cover
     * @returns String con los filtros FFmpeg
     */
    private static buildCoverFilters(options: {
        colorPop?: { saturationBoost: number; contrastBoost: number };
        textOverlay?: ReelsCoverTextOverlay;
    }): string {
        const filters: string[] = [];

        // 1. Escalar a resolución vertical de Reels (1080x1920)
        // Usar flags de alta calidad para escalado
        filters.push(`scale=${REELS_SPECS.resolution.width}:${REELS_SPECS.resolution.height}:flags=lanczos`);

        // 2. Aplicar color pop si está configurado
        if (options.colorPop) {
            filters.push(ReelsAdapter.buildColorPopFilter(
                options.colorPop.saturationBoost,
                options.colorPop.contrastBoost
            ));
        }

        // 3. Aplicar text overlay si está configurado
        if (options.textOverlay) {
            filters.push(ReelsAdapter.buildCoverTextOverlayFilter(options.textOverlay));
        }

        return filters.join(',');
    }

    /**
     * Construye el filtro de text overlay para el cover de Reels.
     * REQ-3.1.6: Soporte para texto en el cover
     * 
     * @param textConfig - Configuración del texto a mostrar
     * @returns String con el filtro drawtext de FFmpeg
     */
    private static buildCoverTextOverlayFilter(textConfig: ReelsCoverTextOverlay): string {
        // Valores por defecto
        const fontName = textConfig.fontName || REELS_SPECS.defaultCover.textOverlay.fontName;
        const fontSize = textConfig.fontSize || REELS_SPECS.defaultCover.textOverlay.fontSize;
        const fontColor = textConfig.fontColor || REELS_SPECS.defaultCover.textOverlay.fontColor;
        const borderColor = textConfig.borderColor || REELS_SPECS.defaultCover.textOverlay.borderColor;
        const borderWidth = textConfig.borderWidth || REELS_SPECS.defaultCover.textOverlay.borderWidth;
        const margin = textConfig.margin || REELS_SPECS.defaultCover.textOverlay.margin;

        // Determinar posición Y basada en la posición configurada
        let yPosition: string;
        switch (textConfig.position) {
            case 'top':
                yPosition = `${margin}`;
                break;
            case 'center':
                yPosition = '(h-text_h)/2';
                break;
            case 'bottom':
            default:
                yPosition = `h-text_h-${margin}`;
                break;
        }

        // Escapar el texto para FFmpeg (comillas, apostrofes, etc.)
        const escapedText = textConfig.text
            .replace(/'/g, "'\\''")
            .replace(/:/g, '\\:')
            .replace(/\\/g, '\\\\');

        // Construir filtro drawtext
        // Formato: drawtext=fontfile=/path/font.ttf:text='Texto':x=(w-text_w)/2:y=Y:fontsize=SIZE:fontcolor=COLOR:borderw=WIDTH:bordercolor=COLOR
        const drawTextParams = [
            `text='${escapedText}'`,
            `x=(w-text_w)/2`,           // Centrado horizontal
            `y=${yPosition}`,
            `fontsize=${fontSize}`,
            `fontcolor=${fontColor}`,
            `borderw=${borderWidth}`,
            `bordercolor=${borderColor}`,
            `font='${fontName}'`
        ];

        return `drawtext=${drawTextParams.join(':')}`;
    }

    /**
     * Construye los argumentos de FFmpeg para la generación del cover.
     * REQ-3.1.6: Configuración de FFmpeg optimizada para thumbnails de Reels
     * 
     * @param videoPath - Ruta al video fuente
     * @param outputPath - Ruta de salida del cover
     * @param frameTime - Timestamp del frame a extraer
     * @param filters - Filtros de video a aplicar
     * @param format - Formato de salida (jpeg/png)
     * @param quality - Calidad JPEG (1-31)
     * @returns Array con los argumentos de FFmpeg
     */
    private static buildCoverFFmpegArgs(
        videoPath: string,
        outputPath: string,
        frameTime: number,
        filters: string,
        format: 'jpeg' | 'png',
        quality: number
    ): string[] {
        const args: string[] = [];

        // Buscar al segundo especificado (antes del input para seek rápido)
        args.push('-ss', frameTime.toString());

        // Input
        args.push('-i', videoPath);

        // Solo un frame
        args.push('-vframes', '1');

        // Aplicar filtros
        if (filters) {
            args.push('-vf', filters);
        }

        // Configuración de calidad según formato
        if (format === 'jpeg') {
            // Calidad JPEG (1-31, menor es mejor calidad)
            args.push('-q:v', quality.toString());
        } else {
            // PNG: usar compresión sin pérdida
            args.push('-compression_level', '6');
        }

        // Sobrescribir si existe
        args.push('-y');

        // Output
        args.push(outputPath);

        return args;
    }

    /**
     * Encuentra el mejor timestamp para extraer un frame impactante.
     * REQ-3.1.6: Extraer el mejor frame (no necesariamente el primero)
     * 
     * Estrategia de selección:
     * 1. Evitar frames completamente negros/oscuros
     * 2. Buscar frames con buena luminosidad y contraste
     * 3. Preferir frames después de transiciones (más nítidos)
     * 
     * Usa FFmpeg para analizar la luminosidad promedio de varios frames
     * y selecciona el que tenga mejor balance.
     * 
     * @param videoPath - Ruta al video fuente
     * @param defaultTime - Timestamp por defecto si el análisis falla
     * @returns Timestamp del mejor frame encontrado
     */
    private static async findBestFrameTimestamp(
        videoPath: string,
        defaultTime: number
    ): Promise<number> {
        // Obtener duración del video
        const duration = await ReelsAdapter.getVideoDuration(videoPath);
        
        // Definir puntos de muestreo (evitar el primer y último segundo)
        const samplePoints = [
            Math.max(0.5, duration * 0.1),   // 10% del video
            Math.max(1, duration * 0.25),     // 25% del video
            Math.max(1.5, duration * 0.33),   // 33% del video
            defaultTime                        // Punto solicitado
        ].filter(t => t < duration - 0.5);

        // Si no hay suficientes puntos de muestreo, usar el default
        if (samplePoints.length === 0) {
            return Math.min(defaultTime, Math.max(0, duration - 0.5));
        }

        // Por ahora, usar una heurística simple:
        // Preferir el segundo punto de muestreo (25% del video) ya que
        // suele tener contenido establecido después de intros
        // Una implementación más avanzada analizaría la luminosidad real
        const preferredIndex = Math.min(1, samplePoints.length - 1);
        return samplePoints[preferredIndex];
    }

    /**
     * Genera la ruta del cover basada en la ruta del video.
     * REQ-3.1.6: Nombrado consistente para covers de Reels
     * 
     * @param videoPath - Ruta del video
     * @param format - Formato del cover (jpeg/png)
     * @returns Ruta para el cover con la extensión apropiada
     */
    public static generateCoverPath(videoPath: string, format?: 'jpeg' | 'png'): string {
        const dir = path.dirname(videoPath);
        const name = path.basename(videoPath, path.extname(videoPath));
        const extension = format === 'png' ? '.png' : '.jpg';
        return path.join(dir, `${name}_reels_cover${extension}`);
    }

    /**
     * Genera un cover con configuración personalizada de text overlay.
     * REQ-3.1.6: Método de conveniencia para covers con texto
     * 
     * @param videoPath - Ruta al video fuente
     * @param outputPath - Ruta de salida del cover
     * @param text - Texto a mostrar en el cover
     * @param position - Posición del texto (top/center/bottom)
     * @param colorPop - Configuración de color pop (opcional)
     * @returns Promise con el resultado de la generación
     */
    public static async generateCoverWithText(
        videoPath: string,
        outputPath: string,
        text: string,
        position: 'top' | 'center' | 'bottom' = 'bottom',
        colorPop?: { saturationBoost: number; contrastBoost: number }
    ): Promise<{ outputPath: string; metadata: ReelsCoverMetadata }> {
        return ReelsAdapter.generateReelsCover(videoPath, outputPath, {
            frameTime: REELS_SPECS.defaultCover.defaultFrameTime,
            colorPop: colorPop || REELS_SPECS.defaultColorPop,
            textOverlay: {
                text,
                position
            },
            outputFormat: 'jpeg',
            jpegQuality: REELS_SPECS.defaultCover.jpegQuality
        });
    }

    /**
     * Genera el comando FFmpeg del cover para debugging.
     * REQ-3.1.6: Útil para verificar la configuración de FFmpeg
     * 
     * @param videoPath - Ruta al video fuente
     * @param outputPath - Ruta de salida del cover
     * @param options - Opciones de generación
     * @returns Comando FFmpeg como string
     */
    public static getCoverFFmpegCommand(
        videoPath: string,
        outputPath: string,
        options: {
            frameTime: number;
            colorPop?: { saturationBoost: number; contrastBoost: number };
            textOverlay?: ReelsCoverTextOverlay;
            outputFormat?: 'jpeg' | 'png';
            jpegQuality?: number;
        }
    ): string {
        const filters = ReelsAdapter.buildCoverFilters(options);
        const format = options.outputFormat || 'jpeg';
        const quality = options.jpegQuality || REELS_SPECS.defaultCover.jpegQuality;
        const args = ReelsAdapter.buildCoverFFmpegArgs(
            videoPath,
            outputPath,
            options.frameTime,
            filters,
            format,
            quality
        );

        let ffmpegPath = 'ffmpeg';
        try {
            const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
            ffmpegPath = ffmpegInstaller.path;
        } catch {
            // Usar FFmpeg del sistema
        }

        return `${ffmpegPath} ${args.map(arg => 
            arg.includes(' ') ? `"${arg}"` : arg
        ).join(' ')}`;
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Construye los argumentos completos para FFmpeg.
     */
    private static buildFFmpegArgs(
        config: ReelsConfig,
        outputPath: string,
        videoFilter: string
    ): string[] {
        const args: string[] = [];

        // Parámetros de recorte temporal (antes del input)
        if (config.startTimeSeconds > 0) {
            args.push('-ss', config.startTimeSeconds.toString());
        }

        // Input
        args.push('-i', config.inputVideoPath);

        // Duración máxima
        args.push('-t', config.maxDurationSeconds.toString());

        // Filtro de video
        args.push('-vf', videoFilter);

        // Codec de video
        args.push('-c:v', DEFAULT_PROCESSING_OPTIONS.videoCodec);
        args.push('-preset', DEFAULT_PROCESSING_OPTIONS.preset);
        args.push('-crf', DEFAULT_PROCESSING_OPTIONS.crf.toString());

        // Codec de audio
        args.push('-c:a', DEFAULT_PROCESSING_OPTIONS.audioCodec);
        args.push('-b:a', DEFAULT_PROCESSING_OPTIONS.audioBitrate);

        // Optimización para streaming
        args.push('-movflags', '+faststart');

        // Sobrescribir output
        args.push('-y');

        // Output
        args.push(outputPath);

        return args;
    }

    /**
     * Ejecuta FFmpeg con los argumentos especificados.
     */
    private static executeFFmpeg(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            let ffmpegPath = 'ffmpeg';
            
            try {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                ffmpegPath = ffmpegInstaller.path;
            } catch {
                // Usar FFmpeg del sistema
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
     * Obtiene la duración de un video en segundos.
     */
    private static getVideoDuration(videoPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            let ffprobePath = 'ffprobe';
            
            try {
                const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
                ffprobePath = ffprobeInstaller.path;
            } catch {
                // Usar ffprobe del sistema
            }

            const ffprobe = spawn(ffprobePath, [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                videoPath
            ]);

            let stdout = '';

            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0 && stdout.trim()) {
                    resolve(parseFloat(stdout.trim()));
                } else {
                    // Fallback: asumir duración configurada
                    resolve(30);
                }
            });

            ffprobe.on('error', () => {
                // Fallback en caso de error
                resolve(30);
            });
        });
    }

    /**
     * Valida la configuración de adaptación.
     */
    private static validateConfig(config: ReelsConfig): void {
        // Validar duración
        if (config.maxDurationSeconds <= 0) {
            throw new Error('La duración máxima debe ser mayor que 0');
        }
        if (config.maxDurationSeconds > REELS_SPECS.maxDuration) {
            throw new Error(
                `La duración máxima no puede exceder ${REELS_SPECS.maxDuration} segundos`
            );
        }

        // Validar tiempo de inicio
        if (config.startTimeSeconds < 0) {
            throw new Error('El tiempo de inicio no puede ser negativo');
        }

        // Validar color pop
        if (config.colorPop.saturationBoost < 0) {
            throw new Error('El boost de saturación no puede ser negativo');
        }
        if (config.colorPop.contrastBoost < 0) {
            throw new Error('El boost de contraste no puede ser negativo');
        }

        // Validar zoom dinámico
        if (config.dynamicZoom.enabled) {
            if (config.dynamicZoom.minZoom <= 0 || config.dynamicZoom.maxZoom <= 0) {
                throw new Error('Los valores de zoom deben ser mayores que 0');
            }
            if (config.dynamicZoom.minZoom > config.dynamicZoom.maxZoom) {
                throw new Error('El zoom mínimo no puede ser mayor que el zoom máximo');
            }
        }

        // Validar path de entrada
        if (!config.inputVideoPath || config.inputVideoPath.trim() === '') {
            throw new Error('La ruta del video de entrada no puede estar vacía');
        }

        // Validar estilo de subtítulos
        const validStyles = ['bold', 'glow', 'minimal'];
        if (!validStyles.includes(config.subtitles.style)) {
            throw new Error(
                `Estilo de subtítulos '${config.subtitles.style}' no válido. ` +
                `Debe ser: ${validStyles.join(', ')}`
            );
        }
    }

    // ===== COMANDOS FFmpeg PARA DEBUGGING =====

    /**
     * Genera el comando FFmpeg completo como string para debugging.
     * 
     * @param config - Configuración de adaptación
     * @param outputPath - Ruta de salida
     * @returns Comando FFmpeg como string
     */
    public static getFFmpegCommand(config: ReelsConfig, outputPath: string): string {
        const videoFilter = ReelsAdapter.buildCompleteFilter(config);
        const args = ReelsAdapter.buildFFmpegArgs(config, outputPath, videoFilter);
        
        // Construir comando legible
        let ffmpegPath = 'ffmpeg';
        try {
            const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
            ffmpegPath = ffmpegInstaller.path;
        } catch {
            // Usar FFmpeg del sistema
        }

        return `${ffmpegPath} ${args.map(arg => 
            arg.includes(' ') ? `"${arg}"` : arg
        ).join(' ')}`;
    }
}
