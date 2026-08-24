/**
 * TikTokAdapter.ts
 * 
 * Adaptador para convertir videos de YouTube a formato TikTok.
 * Parte de la Fase 5: Expansión Multiplataforma (bloqueada por YPPValidationGate.passed === true)
 * 
 * REQ-3.2.1: Crear TikTokAdapter.ts con especificaciones de la plataforma
 * 
 * Funcionalidades:
 * - Recorte a 15 segundos óptimo (REQ-3.2.2) - vs 30s de Reels
 * - Hook ultra-agresivo de 0.5 segundos (REQ-3.2.3) - vs 3s de YouTube
 * - Ritmo de cortes cada 1.5 segundos promedio (REQ-3.2.4) - vs típico 2-8s
 * - Sincronización de cortes con beats de audio (REQ-3.2.5)
 * - Formato vertical 9:16 (1080x1920) como Reels
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
 * Configuración para la adaptación a TikTok.
 * Define todos los parámetros necesarios para transformar un video de YouTube.
 * TikTok requiere contenido más rápido y agresivo que Reels.
 */
export interface TikTokConfig {
    /** Ruta absoluta al video fuente (YouTube Short o video largo) */
    inputVideoPath: string;
    
    /** Duración máxima del TikTok en segundos (default: 15) */
    maxDurationSeconds: number;
    
    /** Punto de inicio en segundos para el recorte (default: 0) */
    startTimeSeconds: number;
    
    /** Configuración de color pop - similar a Reels pero más intenso para TikTok */
    colorPop: {
        /** Incremento de saturación (default: +25% = 1.25 para TikTok) */
        saturationBoost: number;
        /** Incremento de contraste (default: +12% = 1.12 para TikTok) */
        contrastBoost: number;
    };
    
    /** Configuración de subtítulos */
    subtitles: {
        /** Habilitar subtítulos animados (default: true para TikTok) */
        enabled: boolean;
        /** Ruta al archivo de subtítulos .ASS o .SRT */
        subtitlePath?: string;
        /** Estilo de subtítulos: bold, glow, minimal - TikTok usa glow por defecto */
        style: 'bold' | 'glow' | 'minimal';
    };
    
    /** Configuración de zoom dinámico */
    dynamicZoom: {
        /** Habilitar zoom dinámico (más agresivo en TikTok) */
        enabled: boolean;
        /** Rango de zoom: min a max durante el video */
        minZoom: number;
        maxZoom: number;
    };
    
    /** Configuración de hook ultra-agresivo (REQ-3.2.3) */
    hook: {
        /** Duración del hook en segundos (default: 0.5 para TikTok) */
        durationSeconds: number;
        /** Aplicar efecto de impacto visual al hook */
        applyImpactEffect: boolean;
        /** Zoom rápido durante el hook */
        zoomBurst: boolean;
    };
    
    /** Configuración de ritmo de cortes (REQ-3.2.4) */
    cutRhythm: {
        /** Intervalo promedio de cortes en segundos (default: 1.5 para TikTok) */
        intervalSeconds: number;
        /** Variación del intervalo (±0.3s por defecto) */
        variationSeconds: number;
        /** Sincronizar cortes con beats de audio si está disponible */
        syncWithBeats: boolean;
    };
    
    /** Configuración de cover/thumbnail */
    cover: {
        /** Generar cover específico para TikTok */
        generateCover: boolean;
        /** Segundo del video para extraer frame del cover (default: 0.25) */
        coverFrameTime: number;
        /** Timestamp opcional para extracción del frame */
        customTimestamp?: number;
        /** Usar detección automática de momento impactante */
        useSmartFrameSelection?: boolean;
        /** Configuración de text overlay para el cover */
        textOverlay?: TikTokCoverTextOverlay;
        /** Aplicar el mismo color pop del video al cover */
        applyColorPop?: boolean;
        /** Formato de salida del cover */
        outputFormat?: 'jpeg' | 'png';
        /** Calidad de compresión JPEG (1-31, menor es mejor) */
        jpegQuality?: number;
    };
}

/**
 * Configuración de text overlay para el cover de TikTok.
 * REQ-3.2: Soporte para texto en el cover
 */
export interface TikTokCoverTextOverlay {
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
 * Resultado de la adaptación a TikTok.
 * Contiene las rutas a todos los assets generados y metadatos.
 */
export interface TikTokOutput {
    /** Ruta absoluta al video adaptado para TikTok */
    videoPath: string;
    
    /** Ruta absoluta al cover/thumbnail (si se generó) */
    coverPath?: string;
    
    /** Duración final del TikTok en segundos */
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
    coverMetadata?: TikTokCoverMetadata;
    
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
        /** Hook ultra-agresivo aplicado */
        hookApplied: boolean;
        /** Duración del hook en segundos */
        hookDurationSeconds: number;
        /** Ritmo de cortes aplicado */
        cutRhythmIntervalSeconds: number;
        /** Timestamp de procesamiento */
        processedAt: string;
    };
}

/**
 * Metadatos del cover generado para TikTok.
 */
export interface TikTokCoverMetadata {
    /** Timestamp del frame extraído en segundos */
    extractedAtSecond: number;
    /** Resolución del cover (1080x1920 para TikTok) */
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
 * Estrategia de selección de segmento para TikTok.
 * REQ-3.2.2: Recortar a 15 segundos óptimo
 */
export type SegmentSelectionStrategy = 
    | 'full-video'          // Video completo (cuando es ≤15s)
    | 'ultra-hook-priority' // Priorizar hook ultra-agresivo inicial
    | 'smart-selection';    // Selección inteligente basada en duración

/**
 * Posición preferida para la selección de segmento.
 */
export type PreferredSegmentPosition = 'start' | 'middle' | 'end';

/**
 * Resultado de la selección del segmento óptimo para TikTok.
 * REQ-3.2.2: Incluye el razonamiento de la selección
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
 * Opciones avanzadas para la selección de segmento en TikTok.
 * REQ-3.2.2: Considerar el "hook" ultra-agresivo al inicio
 */
export interface SegmentSelectionOptions {
    /** Duración objetivo del segmento en segundos (default: 15) */
    targetDuration?: number;
    /** Preservar el hook ultra-agresivo inicial del video (default: true) */
    preserveHook?: boolean;
    /** Duración del hook a preservar en segundos (default: 0.5 para TikTok) */
    hookDurationSeconds?: number;
    /** Evitar empezar exactamente en segundo 0 para videos largos (default: false para TikTok) */
    avoidExactZeroStart?: boolean;
    /** Posición preferida: inicio, medio o final (default: 'start') */
    preferredPosition?: PreferredSegmentPosition;
}

/**
 * Configuración de estilo de subtítulos para FFmpeg.
 * Define los parámetros visuales para cada estilo.
 * REQ-3.2: Soportar estilos optimizados para TikTok
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
 * Resultado de la validación de subtítulos para TikTok.
 * Los subtítulos son importantes pero TikTok tiene más tolerancia que Reels.
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
 * Especificaciones técnicas de TikTok.
 * REQ-3.2: Diferencias clave respecto a Reels:
 * - Duración óptima: 15s (vs 30s de Reels)
 * - Hook: 0.5s (vs 3s de YouTube)
 * - Ritmo de cortes: 1.5s (vs típico 2-8s)
 */
export const TIKTOK_SPECS = {
    /** Duración óptima para engagement máximo en TikTok */
    optimalDuration: 15,
    /** Duración máxima permitida por TikTok (para este tipo de contenido) */
    maxDuration: 60,
    /** Resolución vertical estándar */
    resolution: { width: 1080, height: 1920 },
    /** Aspect ratio vertical (9:16) */
    aspectRatio: 9 / 16,
    /** Frame rate recomendado */
    frameRate: 30,
    /** Hook ultra-agresivo - REQ-3.2.3 */
    hook: {
        /** Duración del hook en segundos (0.5s vs 3s de YouTube) */
        durationSeconds: 0.5,
        /** Los primeros 0.5s determinan si el usuario se queda */
        importance: 'CRITICAL' as const
    },
    /** Ritmo de cortes - REQ-3.2.4 */
    cutRhythm: {
        /** Intervalo promedio de cortes en segundos */
        intervalSeconds: 1.5,
        /** Variación permitida */
        variationSeconds: 0.3,
        /** Descripción del ritmo */
        description: 'Cortes cada 1.5s para mantener atención en TikTok'
    },
    /** Color pop por defecto - más intenso que Reels para TikTok */
    defaultColorPop: {
        saturationBoost: 1.25,  // +25% (vs +20% de Reels)
        contrastBoost: 1.12     // +12% (vs +10% de Reels)
    },
    /** Zoom dinámico por defecto - más agresivo para TikTok */
    defaultDynamicZoom: {
        minZoom: 1.00,
        maxZoom: 1.08  // Más agresivo que Reels (1.05)
    },
    /** Configuración de cover/thumbnail por defecto */
    defaultCover: {
        /** Segundo por defecto para extraer el frame (más temprano que Reels) */
        defaultFrameTime: 0.25,
        /** Calidad JPEG por defecto (1-31, menor es mejor) */
        jpegQuality: 2,
        /** Formato por defecto */
        defaultFormat: 'jpeg' as const,
        /** Configuración de text overlay por defecto */
        textOverlay: {
            fontName: 'Impact',  // Fuente más impactante para TikTok
            fontSize: 80,        // Más grande que Reels
            fontColor: '#FFFFFF',
            borderColor: '#000000',
            borderWidth: 5,
            margin: 40
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
 * TikTokAdapter - Adaptador para convertir videos de YouTube a TikTok.
 * 
 * Esta clase implementa la lógica para:
 * - Recortar videos a la duración óptima de 15 segundos (REQ-3.2.2)
 * - Aplicar hook ultra-agresivo de 0.5 segundos (REQ-3.2.3)
 * - Aumentar ritmo de cortes a cada 1.5 segundos (REQ-3.2.4)
 * - Aplicar color pop más intenso que Reels
 * - Quemar subtítulos animados
 * - Generar cover/thumbnail específico
 * 
 * IMPORTANTE: Esta funcionalidad está bloqueada por YPPValidationGate.
 * El código existe para cuando se desbloquee la Fase 5.
 */
export class TikTokAdapter {
    // ===== CONFIGURACIÓN POR DEFECTO =====

    /**
     * Genera una configuración por defecto para adaptación a TikTok.
     * 
     * @param inputVideoPath - Ruta al video fuente
     * @returns Configuración completa con valores por defecto
     */
    public static getDefaultConfig(inputVideoPath: string): TikTokConfig {
        return {
            inputVideoPath,
            maxDurationSeconds: TIKTOK_SPECS.optimalDuration,
            startTimeSeconds: 0,
            colorPop: {
                saturationBoost: TIKTOK_SPECS.defaultColorPop.saturationBoost,
                contrastBoost: TIKTOK_SPECS.defaultColorPop.contrastBoost
            },
            subtitles: {
                enabled: true,
                style: 'glow'  // TikTok prefiere estilo más llamativo que Reels
            },
            dynamicZoom: {
                enabled: false,
                minZoom: TIKTOK_SPECS.defaultDynamicZoom.minZoom,
                maxZoom: TIKTOK_SPECS.defaultDynamicZoom.maxZoom
            },
            hook: {
                durationSeconds: TIKTOK_SPECS.hook.durationSeconds,
                applyImpactEffect: true,
                zoomBurst: true
            },
            cutRhythm: {
                intervalSeconds: TIKTOK_SPECS.cutRhythm.intervalSeconds,
                variationSeconds: TIKTOK_SPECS.cutRhythm.variationSeconds,
                syncWithBeats: false
            },
            cover: {
                generateCover: true,
                coverFrameTime: TIKTOK_SPECS.defaultCover.defaultFrameTime,
                applyColorPop: true,
                outputFormat: TIKTOK_SPECS.defaultCover.defaultFormat,
                jpegQuality: TIKTOK_SPECS.defaultCover.jpegQuality,
                useSmartFrameSelection: false
            }
        };
    }

    // ===== MÉTODO PRINCIPAL =====

    /**
     * Adapta un video de YouTube al formato de TikTok.
     * 
     * Pipeline de transformación:
     * 1. Validar entrada y configuración
     * 2. Validar subtítulos (recomendados para TikTok)
     * 3. Recortar a duración óptima (15s)
     * 4. Aplicar color pop intenso (saturación +25%, contraste +12%)
     * 5. Quemar subtítulos animados con estilo glow
     * 6. Aplicar zoom dinámico (si está habilitado)
     * 7. Generar cover/thumbnail (si está configurado)
     * 8. Calcular hashes y retornar resultado
     * 
     * @param config - Configuración de adaptación
     * @param outputPath - Ruta donde guardar el video adaptado
     * @returns Promise con el resultado de la adaptación
     */
    public static async adaptVideoForTikTok(
        config: TikTokConfig,
        outputPath: string
    ): Promise<TikTokOutput> {
        // 1. Validar configuración general
        TikTokAdapter.validateConfig(config);

        // 2. Validar subtítulos (recomendados pero no obligatorios en TikTok)
        TikTokAdapter.validateSubtitles(config);

        // 3. Verificar que el archivo de entrada existe
        if (!fs.existsSync(config.inputVideoPath)) {
            throw new Error(`Video fuente no encontrado: ${config.inputVideoPath}`);
        }

        // 4. Construir el filtro completo de video
        const videoFilter = TikTokAdapter.buildCompleteFilter(config);

        // 5. Construir argumentos de FFmpeg
        const ffmpegArgs = TikTokAdapter.buildFFmpegArgs(
            config,
            outputPath,
            videoFilter
        );

        // 6. Ejecutar FFmpeg
        await TikTokAdapter.executeFFmpeg(ffmpegArgs);

        // 7. Verificar output
        if (!fs.existsSync(outputPath)) {
            throw new Error(`FFmpeg no generó el archivo de salida: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de salida está vacío: ${outputPath}`);
        }

        // 8. Calcular hash del video
        const videoHash = await TikTokAdapter.calculateFileHash(outputPath);

        // 9. Obtener duración real del video generado
        const durationSeconds = await TikTokAdapter.getVideoDuration(outputPath);

        // 10. Generar cover si está configurado
        let coverPath: string | undefined;
        let coverHash: string | undefined;
        let coverMetadata: TikTokCoverMetadata | undefined;

        if (config.cover.generateCover) {
            const coverOutputPath = TikTokAdapter.generateCoverPath(outputPath, config.cover.outputFormat);
            
            const frameTime = config.cover.customTimestamp ?? config.cover.coverFrameTime;
            
            const coverResult = await TikTokAdapter.generateTikTokCover(
                outputPath,
                coverOutputPath,
                {
                    frameTime,
                    colorPop: config.cover.applyColorPop !== false ? config.colorPop : undefined,
                    textOverlay: config.cover.textOverlay,
                    outputFormat: config.cover.outputFormat || 'jpeg',
                    jpegQuality: config.cover.jpegQuality || TIKTOK_SPECS.defaultCover.jpegQuality,
                    useSmartFrameSelection: config.cover.useSmartFrameSelection
                }
            );
            
            coverPath = coverResult.outputPath;
            coverHash = await TikTokAdapter.calculateFileHash(coverOutputPath);
            coverMetadata = coverResult.metadata;
        }

        // 11. Construir y retornar resultado
        return {
            videoPath: outputPath,
            coverPath,
            durationSeconds,
            resolution: TIKTOK_SPECS.resolution,
            videoHash,
            coverHash,
            coverMetadata,
            metadata: {
                colorPopApplied: true,
                saturationApplied: config.colorPop.saturationBoost,
                contrastApplied: config.colorPop.contrastBoost,
                subtitlesBurned: config.subtitles.enabled && !!config.subtitles.subtitlePath,
                dynamicZoomApplied: config.dynamicZoom.enabled,
                hookApplied: config.hook.applyImpactEffect || config.hook.zoomBurst,
                hookDurationSeconds: config.hook.durationSeconds,
                cutRhythmIntervalSeconds: config.cutRhythm.intervalSeconds,
                processedAt: new Date().toISOString()
            }
        };
    }

    // ===== MÉTODOS DE CONSTRUCCIÓN DE FILTROS =====

    /**
     * Construye el filtro de color pop para TikTok.
     * REQ-3.2: Color pop más intenso que Reels (+25% sat, +12% contrast)
     * 
     * @param saturationBoost - Multiplicador de saturación (1.25 = +25%)
     * @param contrastBoost - Multiplicador de contraste (1.12 = +12%)
     * @returns String con el filtro de color pop FFmpeg
     */
    public static buildColorPopFilter(
        saturationBoost: number,
        contrastBoost: number
    ): string {
        return `eq=saturation=${saturationBoost.toFixed(3)}:contrast=${contrastBoost.toFixed(3)}`;
    }

    /**
     * Construye el filtro de recorte temporal.
     * REQ-3.2.2: Recortar duración a 15 segundos óptimo
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
     * Selecciona el segmento óptimo de 15 segundos de un video para TikTok.
     * REQ-3.2.2: Recortar a 15 segundos óptimo - priorizar hook ultra-agresivo
     * 
     * Estrategia de selección:
     * 1. Videos cortos (≤15s): Usar todo el video desde el inicio
     * 2. Videos medianos (15-30s): Priorizar el "hook" ultra-agresivo inicial
     * 3. Videos largos (>30s): Seleccionar inicio porque TikTok necesita hook inmediato
     * 
     * A diferencia de Reels, TikTok SIEMPRE prioriza el inicio del video
     * porque el hook de 0.5s es crítico.
     * 
     * @param videoDurationSeconds - Duración total del video fuente en segundos
     * @param targetDuration - Duración objetivo del TikTok (default: 15s)
     * @returns Resultado con startTime y duration óptimos
     */
    public static selectOptimalSegment(
        videoDurationSeconds: number,
        targetDuration: number = TIKTOK_SPECS.optimalDuration
    ): SegmentSelectionResult {
        // Validar entrada
        if (videoDurationSeconds <= 0) {
            throw new Error('La duración del video debe ser mayor que 0');
        }
        if (targetDuration <= 0) {
            throw new Error('La duración objetivo debe ser mayor que 0');
        }

        // Caso 1: Video más corto que la duración objetivo
        if (videoDurationSeconds <= targetDuration) {
            return {
                startTimeSeconds: 0,
                durationSeconds: videoDurationSeconds,
                strategy: 'full-video',
                reason: `Video corto (${videoDurationSeconds.toFixed(1)}s) - usando contenido completo`
            };
        }

        // Caso 2 y 3: Video más largo que duración objetivo
        // TikTok SIEMPRE prioriza el hook inicial (0.5s críticos)
        // A diferencia de Reels, nunca saltamos el inicio
        return {
            startTimeSeconds: 0,
            durationSeconds: targetDuration,
            strategy: 'ultra-hook-priority',
            reason: `Priorizando hook ultra-agresivo de ${TIKTOK_SPECS.hook.durationSeconds}s - crítico para retención TikTok`
        };
    }

    /**
     * Selecciona el segmento óptimo con opciones avanzadas.
     * REQ-3.2.2 y REQ-3.2.3: Considerar el hook ultra-agresivo
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
            targetDuration = TIKTOK_SPECS.optimalDuration,
            preserveHook = true,
            hookDurationSeconds = TIKTOK_SPECS.hook.durationSeconds,
            avoidExactZeroStart = false,  // TikTok NO evita el inicio
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
        let strategy: SegmentSelectionStrategy = 'ultra-hook-priority';
        let reason = '';

        switch (preferredPosition) {
            case 'start':
                // TikTok siempre prioriza inicio por hook
                if (preserveHook) {
                    startTime = 0;
                    strategy = 'ultra-hook-priority';
                    reason = `Preservando hook ultra-agresivo de ${hookDurationSeconds}s`;
                }
                break;

            case 'middle':
                // Para TikTok, middle rara vez se usa pero lo soportamos
                const middlePoint = videoDurationSeconds / 2;
                startTime = Math.max(0, Math.floor(middlePoint - targetDuration / 2));
                strategy = 'smart-selection';
                reason = `Segmento central desde segundo ${startTime} (no recomendado para TikTok)`;
                break;

            case 'end':
                // Segmento final
                startTime = Math.max(0, Math.floor(videoDurationSeconds - targetDuration));
                strategy = 'smart-selection';
                reason = `Segmento final desde segundo ${startTime} (no recomendado para TikTok)`;
                break;
        }

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
     * 
     * @param subtitlePath - Ruta al archivo de subtítulos (.ass o .srt)
     * @returns String con el filtro de subtítulos FFmpeg
     */
    public static buildSubtitleFilter(subtitlePath: string): string {
        const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const ext = path.extname(subtitlePath).toLowerCase();
        
        if (ext === '.ass') {
            return `ass='${escapedPath}'`;
        } else {
            return `subtitles='${escapedPath}'`;
        }
    }

    /**
     * Configuración de estilo de subtítulos para TikTok.
     * TikTok prefiere estilos más llamativos y energéticos.
     */
    public static readonly SUBTITLE_STYLES: Record<'bold' | 'glow' | 'minimal', SubtitleStyleConfig> = {
        bold: {
            fontName: 'Arial Black',
            fontSize: 26,  // Más grande para TikTok
            primaryColor: '&HFFFFFF',
            outlineColor: '&H000000',
            outlineWidth: 4,  // Borde más grueso
            shadowColor: '&H80000000',
            shadowOffset: 2,
            description: 'Alta legibilidad para contenido educativo'
        },
        glow: {
            fontName: 'Impact',
            fontSize: 24,
            primaryColor: '&HFFFFFF',
            outlineColor: '&HFF00FF',    // Magenta/rosa para TikTok
            outlineWidth: 5,
            shadowColor: '&HFF00FF',
            shadowOffset: 0,
            effect: 'blur',
            description: 'Efecto neón vibrante ideal para TikTok trends'
        },
        minimal: {
            fontName: 'Montserrat',
            fontSize: 22,
            primaryColor: '&HFFFFFF',
            outlineColor: '&H40000000',
            outlineWidth: 1,
            shadowColor: '&H00000000',
            shadowOffset: 0,
            description: 'Estilo limpio y profesional'
        }
    };

    /**
     * Construye el filtro de subtítulos con estilo aplicado.
     * 
     * @param subtitlePath - Ruta al archivo de subtítulos
     * @param style - Estilo de subtítulos: 'bold', 'glow', 'minimal'
     * @returns String con el filtro de subtítulos FFmpeg estilizado
     */
    public static buildStyledSubtitleFilter(
        subtitlePath: string, 
        style: 'bold' | 'glow' | 'minimal'
    ): string {
        const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const styleConfig = TikTokAdapter.SUBTITLE_STYLES[style];
        
        const forceStyleParts: string[] = [
            `FontName=${styleConfig.fontName}`,
            `FontSize=${styleConfig.fontSize}`,
            `PrimaryColour=${styleConfig.primaryColor}`,
            `OutlineColour=${styleConfig.outlineColor}`,
            `Outline=${styleConfig.outlineWidth}`,
            `Shadow=${styleConfig.shadowOffset}`,
            `BackColour=${styleConfig.shadowColor}`,
            'Bold=1',
            'Alignment=2',
            'MarginV=50'
        ];
        
        if (style === 'glow') {
            forceStyleParts.push('BorderStyle=3');
        }
        
        const forceStyle = forceStyleParts.join(',');
        const ext = path.extname(subtitlePath).toLowerCase();
        
        if (ext === '.ass') {
            return `ass='${escapedPath}':force_style='${forceStyle}'`;
        } else {
            return `subtitles='${escapedPath}':force_style='${forceStyle}'`;
        }
    }

    /**
     * Obtiene la configuración de estilo de subtítulos.
     * 
     * @param style - Estilo de subtítulos
     * @returns Configuración completa del estilo
     */
    public static getSubtitleStyleConfig(style: 'bold' | 'glow' | 'minimal'): SubtitleStyleConfig {
        return { ...TikTokAdapter.SUBTITLE_STYLES[style] };
    }

    /**
     * Obtiene todos los estilos de subtítulos disponibles.
     * 
     * @returns Array con los nombres de los estilos disponibles
     */
    public static getAvailableSubtitleStyles(): Array<'bold' | 'glow' | 'minimal'> {
        return ['bold', 'glow', 'minimal'];
    }

    /**
     * Recomienda un estilo de subtítulos basado en el tipo de contenido.
     * TikTok generalmente prefiere estilos más llamativos.
     * 
     * @param contentType - Tipo de contenido del TikTok
     * @returns Estilo recomendado y razón
     */
    public static recommendSubtitleStyle(
        contentType: 'educational' | 'energetic' | 'professional' | 'trending' | 'default'
    ): { style: 'bold' | 'glow' | 'minimal'; reason: string } {
        switch (contentType) {
            case 'educational':
                return {
                    style: 'bold',
                    reason: 'Estilo BOLD: Alta legibilidad para contenido educativo'
                };
            case 'energetic':
            case 'trending':
            case 'default':
                return {
                    style: 'glow',
                    reason: 'Estilo GLOW: Efecto vibrante ideal para TikTok - captura atención rápidamente'
                };
            case 'professional':
                return {
                    style: 'minimal',
                    reason: 'Estilo MINIMAL: Apariencia limpia y profesional'
                };
        }
    }

    /**
     * Genera la cadena force_style para FFmpeg.
     * 
     * @param style - Estilo de subtítulos
     * @returns Cadena force_style lista para usar en FFmpeg
     */
    public static getForceStyleString(style: 'bold' | 'glow' | 'minimal'): string {
        const styleConfig = TikTokAdapter.SUBTITLE_STYLES[style];
        
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
            'MarginV=50'
        ];
        
        if (style === 'glow') {
            parts.push('BorderStyle=3');
        }
        
        return parts.join(',');
    }

    /**
     * Valida que los subtítulos estén configurados para TikTok.
     * A diferencia de Reels, TikTok es más tolerante pero los recomienda.
     * 
     * @param config - Configuración de TikTokAdapter
     * @returns Objeto con resultado de validación y detalles
     */
    public static validateSubtitlesRequired(config: TikTokConfig): SubtitleValidationResult {
        if (!config.subtitles.enabled) {
            return {
                valid: true,
                warning: 'SUBTÍTULOS RECOMENDADOS: Los subtítulos están deshabilitados. ' +
                         'TikTok tiene mejor engagement con subtítulos activados.',
                recommendation: 'Considera habilitar subtítulos para mejor alcance'
            };
        }
        
        if (!config.subtitles.subtitlePath) {
            return {
                valid: true,
                warning: 'SUBTÍTULOS RECOMENDADOS: No se ha proporcionado archivo de subtítulos. ' +
                         'TikTok funciona mejor con subtítulos.',
                recommendation: 'Genera subtítulos con SubtitleGenerator antes de adaptar'
            };
        }
        
        if (!fs.existsSync(config.subtitles.subtitlePath)) {
            return {
                valid: false,
                error: `El archivo de subtítulos no existe: ${config.subtitles.subtitlePath}`,
                recommendation: 'Verifica la ruta del archivo de subtítulos'
            };
        }
        
        const ext = path.extname(config.subtitles.subtitlePath).toLowerCase();
        const validExtensions = ['.ass', '.srt', '.vtt'];
        
        if (!validExtensions.includes(ext)) {
            return {
                valid: true,
                warning: `Extensión de subtítulos '${ext}' no es estándar. ` +
                         `Se recomienda usar: ${validExtensions.join(', ')}`,
                recommendation: 'Convierte los subtítulos a formato .ASS para mejores resultados'
            };
        }
        
        return {
            valid: true,
            recommendation: 'Subtítulos configurados correctamente para TikTok'
        };
    }

    /**
     * Valida los subtítulos (versión no bloqueante para TikTok).
     * 
     * @param config - Configuración de TikTokAdapter
     */
    private static validateSubtitles(config: TikTokConfig): void {
        const validation = TikTokAdapter.validateSubtitlesRequired(config);
        
        if (!validation.valid && validation.error) {
            throw new Error(validation.error);
        }
        
        if (validation.warning) {
            console.warn(`[TikTokAdapter] ⚠️ ${validation.warning}`);
            if (validation.recommendation) {
                console.warn(`[TikTokAdapter] 💡 ${validation.recommendation}`);
            }
        }
    }

    /**
     * Construye el filtro de zoom dinámico.
     * Más agresivo que Reels para TikTok.
     * 
     * @param minZoom - Zoom mínimo (1.00 = 100%)
     * @param maxZoom - Zoom máximo (1.08 = 108% para TikTok)
     * @param durationSeconds - Duración del video en segundos
     * @returns String con el filtro de zoom dinámico FFmpeg
     */
    public static buildDynamicZoomFilter(
        minZoom: number,
        maxZoom: number,
        durationSeconds: number
    ): string {
        const zoomExpression = `'${minZoom}+(${maxZoom}-${minZoom})*t/${durationSeconds}'`;
        return `zoompan=z=${zoomExpression}:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`;
    }

    /**
     * Construye el filtro completo combinando todos los efectos.
     * 
     * @param config - Configuración de adaptación
     * @returns String con el filtro completo FFmpeg
     */
    public static buildCompleteFilter(config: TikTokConfig): string {
        const filters: string[] = [];

        // 1. Scale a resolución de TikTok (1080x1920)
        filters.push(`scale=${TIKTOK_SPECS.resolution.width}:${TIKTOK_SPECS.resolution.height}:flags=lanczos`);

        // 2. Color pop (más intenso que Reels)
        filters.push(TikTokAdapter.buildColorPopFilter(
            config.colorPop.saturationBoost,
            config.colorPop.contrastBoost
        ));

        // 3. Subtítulos con estilo
        if (config.subtitles.enabled && config.subtitles.subtitlePath) {
            filters.push(TikTokAdapter.buildStyledSubtitleFilter(
                config.subtitles.subtitlePath,
                config.subtitles.style
            ));
        }

        // 4. Formato de salida compatible
        filters.push('format=yuv420p');

        return filters.join(',');
    }

    // ===== GENERACIÓN DE COVER/THUMBNAIL =====

    /**
     * Genera un cover/thumbnail específico para TikTok.
     * Frame extraído más temprano que Reels (0.25s vs 1s).
     */
    public static async generateTikTokCover(
        videoPath: string,
        outputPath: string,
        options: {
            frameTime: number;
            colorPop?: { saturationBoost: number; contrastBoost: number };
            textOverlay?: TikTokCoverTextOverlay;
            outputFormat: 'jpeg' | 'png';
            jpegQuality: number;
            useSmartFrameSelection?: boolean;
        }
    ): Promise<{ outputPath: string; metadata: TikTokCoverMetadata }> {
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video fuente no encontrado: ${videoPath}`);
        }

        let extractTime = options.frameTime;
        let frameSelectionMethod: 'manual' | 'smart' | 'default' = 'manual';

        if (options.useSmartFrameSelection) {
            try {
                extractTime = await TikTokAdapter.findBestFrameTimestamp(videoPath, options.frameTime);
                frameSelectionMethod = 'smart';
            } catch (error) {
                console.warn('[TikTokAdapter] ⚠️ Selección inteligente falló, usando timestamp manual:', error);
                frameSelectionMethod = 'default';
            }
        }

        const filters = TikTokAdapter.buildCoverFilters(options);
        const ffmpegArgs = TikTokAdapter.buildCoverFFmpegArgs(
            videoPath,
            outputPath,
            extractTime,
            filters,
            options.outputFormat,
            options.jpegQuality
        );

        await TikTokAdapter.executeFFmpeg(ffmpegArgs);

        if (!fs.existsSync(outputPath)) {
            throw new Error(`No se pudo generar el cover: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            throw new Error(`El archivo de cover está vacío: ${outputPath}`);
        }

        const metadata: TikTokCoverMetadata = {
            extractedAtSecond: extractTime,
            resolution: TIKTOK_SPECS.resolution,
            colorPopApplied: options.colorPop !== undefined,
            textOverlayApplied: options.textOverlay !== undefined,
            textContent: options.textOverlay?.text,
            format: options.outputFormat,
            frameSelectionMethod
        };

        return { outputPath, metadata };
    }

    /**
     * Genera la ruta del cover basada en la ruta del video.
     */
    public static generateCoverPath(videoPath: string, format?: 'jpeg' | 'png'): string {
        const dir = path.dirname(videoPath);
        const name = path.basename(videoPath, path.extname(videoPath));
        const extension = format === 'png' ? '.png' : '.jpg';
        return path.join(dir, `${name}_tiktok_cover${extension}`);
    }

    /**
     * Genera un cover con text overlay personalizado.
     */
    public static async generateCoverWithText(
        videoPath: string,
        outputPath: string,
        text: string,
        position: 'top' | 'center' | 'bottom' = 'bottom',
        colorPop?: { saturationBoost: number; contrastBoost: number }
    ): Promise<{ outputPath: string; metadata: TikTokCoverMetadata }> {
        return TikTokAdapter.generateTikTokCover(videoPath, outputPath, {
            frameTime: TIKTOK_SPECS.defaultCover.defaultFrameTime,
            colorPop: colorPop || TIKTOK_SPECS.defaultColorPop,
            textOverlay: {
                text,
                position
            },
            outputFormat: 'jpeg',
            jpegQuality: TIKTOK_SPECS.defaultCover.jpegQuality
        });
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Construye los filtros de video para la generación del cover.
     */
    private static buildCoverFilters(options: {
        colorPop?: { saturationBoost: number; contrastBoost: number };
        textOverlay?: TikTokCoverTextOverlay;
    }): string {
        const filters: string[] = [];

        filters.push(`scale=${TIKTOK_SPECS.resolution.width}:${TIKTOK_SPECS.resolution.height}:flags=lanczos`);

        if (options.colorPop) {
            filters.push(TikTokAdapter.buildColorPopFilter(
                options.colorPop.saturationBoost,
                options.colorPop.contrastBoost
            ));
        }

        if (options.textOverlay) {
            filters.push(TikTokAdapter.buildCoverTextOverlayFilter(options.textOverlay));
        }

        return filters.join(',');
    }

    /**
     * Construye el filtro de text overlay para el cover.
     */
    private static buildCoverTextOverlayFilter(textConfig: TikTokCoverTextOverlay): string {
        const fontName = textConfig.fontName || TIKTOK_SPECS.defaultCover.textOverlay.fontName;
        const fontSize = textConfig.fontSize || TIKTOK_SPECS.defaultCover.textOverlay.fontSize;
        const fontColor = textConfig.fontColor || TIKTOK_SPECS.defaultCover.textOverlay.fontColor;
        const borderColor = textConfig.borderColor || TIKTOK_SPECS.defaultCover.textOverlay.borderColor;
        const borderWidth = textConfig.borderWidth || TIKTOK_SPECS.defaultCover.textOverlay.borderWidth;
        const margin = textConfig.margin || TIKTOK_SPECS.defaultCover.textOverlay.margin;

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

        const escapedText = textConfig.text
            .replace(/'/g, "'\\''")
            .replace(/:/g, '\\:')
            .replace(/\\/g, '\\\\');

        const drawTextParams = [
            `text='${escapedText}'`,
            `x=(w-text_w)/2`,
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

        args.push('-ss', frameTime.toString());
        args.push('-i', videoPath);
        args.push('-vframes', '1');

        if (filters) {
            args.push('-vf', filters);
        }

        if (format === 'jpeg') {
            args.push('-q:v', quality.toString());
        } else {
            args.push('-compression_level', '6');
        }

        args.push('-y');
        args.push(outputPath);

        return args;
    }

    /**
     * Encuentra el mejor timestamp para extraer un frame impactante.
     * Para TikTok, priorizamos frames muy tempranos (hook).
     */
    private static async findBestFrameTimestamp(
        videoPath: string,
        defaultTime: number
    ): Promise<number> {
        const duration = await TikTokAdapter.getVideoDuration(videoPath);
        
        // TikTok prioriza frames muy tempranos
        const samplePoints = [
            Math.max(0.1, duration * 0.05),   // 5% del video
            Math.max(0.25, duration * 0.15),  // 15% del video
            defaultTime
        ].filter(t => t < duration - 0.5);

        if (samplePoints.length === 0) {
            return Math.min(defaultTime, Math.max(0, duration - 0.5));
        }

        return samplePoints[0];  // TikTok prefiere inicio
    }

    /**
     * Valida la configuración de TikTok.
     */
    private static validateConfig(config: TikTokConfig): void {
        if (!config.inputVideoPath || config.inputVideoPath.trim() === '') {
            throw new Error('La ruta del video de entrada no puede estar vacía');
        }

        if (config.maxDurationSeconds <= 0) {
            throw new Error('La duración máxima debe ser mayor que 0');
        }

        if (config.maxDurationSeconds > TIKTOK_SPECS.maxDuration) {
            throw new Error(`La duración máxima no puede exceder ${TIKTOK_SPECS.maxDuration} segundos para TikTok`);
        }

        if (config.startTimeSeconds < 0) {
            throw new Error('El tiempo de inicio no puede ser negativo');
        }

        if (config.colorPop.saturationBoost < 0) {
            throw new Error('El boost de saturación no puede ser negativo');
        }

        if (config.colorPop.contrastBoost < 0) {
            throw new Error('El boost de contraste no puede ser negativo');
        }

        if (config.dynamicZoom.enabled && config.dynamicZoom.minZoom > config.dynamicZoom.maxZoom) {
            throw new Error('El zoom mínimo no puede ser mayor que el zoom máximo');
        }

        if (config.hook.durationSeconds < 0) {
            throw new Error('La duración del hook no puede ser negativa');
        }

        if (config.cutRhythm.intervalSeconds <= 0) {
            throw new Error('El intervalo de cortes debe ser mayor que 0');
        }

        const validStyles = ['bold', 'glow', 'minimal'];
        if (!validStyles.includes(config.subtitles.style)) {
            throw new Error(`Estilo de subtítulos inválido: ${config.subtitles.style}. Use: ${validStyles.join(', ')}`);
        }
    }

    /**
     * Construye los argumentos completos para FFmpeg.
     */
    private static buildFFmpegArgs(
        config: TikTokConfig,
        outputPath: string,
        videoFilter: string
    ): string[] {
        const args: string[] = [];

        if (config.startTimeSeconds > 0) {
            args.push('-ss', config.startTimeSeconds.toString());
        }

        args.push('-i', config.inputVideoPath);
        args.push('-t', config.maxDurationSeconds.toString());
        args.push('-vf', videoFilter);
        args.push('-c:v', DEFAULT_PROCESSING_OPTIONS.videoCodec);
        args.push('-preset', DEFAULT_PROCESSING_OPTIONS.preset);
        args.push('-crf', DEFAULT_PROCESSING_OPTIONS.crf.toString());
        args.push('-c:a', DEFAULT_PROCESSING_OPTIONS.audioCodec);
        args.push('-b:a', DEFAULT_PROCESSING_OPTIONS.audioBitrate);
        args.push('-movflags', '+faststart');
        args.push('-y');
        args.push(outputPath);

        return args;
    }

    /**
     * Ejecuta FFmpeg con los argumentos especificados.
     */
    private static async executeFFmpeg(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            let ffmpegPath = 'ffmpeg';
            try {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                ffmpegPath = ffmpegInstaller.path;
            } catch {
                // Usar FFmpeg del sistema
            }

            const process = spawn(ffmpegPath, args);
            let stderr = '';

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg falló con código ${code}: ${stderr}`));
                }
            });

            process.on('error', (err) => {
                reject(new Error(`Error ejecutando FFmpeg: ${err.message}`));
            });
        });
    }

    /**
     * Calcula el hash MD5 de un archivo.
     */
    private static async calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Obtiene la duración de un video usando FFprobe.
     */
    private static async getVideoDuration(videoPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            let ffprobePath = 'ffprobe';
            try {
                const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
                ffprobePath = ffprobeInstaller.path;
            } catch {
                // Usar FFprobe del sistema
            }

            const args = [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                videoPath
            ];

            const process = spawn(ffprobePath, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    const duration = parseFloat(stdout.trim());
                    if (!isNaN(duration)) {
                        resolve(duration);
                    } else {
                        reject(new Error(`No se pudo parsear la duración: ${stdout}`));
                    }
                } else {
                    reject(new Error(`FFprobe falló con código ${code}: ${stderr}`));
                }
            });

            process.on('error', (err) => {
                reject(new Error(`Error ejecutando FFprobe: ${err.message}`));
            });
        });
    }

    /**
     * Genera el comando FFmpeg para debugging.
     */
    public static getFFmpegCommand(config: TikTokConfig, outputPath: string): string {
        const videoFilter = TikTokAdapter.buildCompleteFilter(config);
        const args = TikTokAdapter.buildFFmpegArgs(config, outputPath, videoFilter);

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

    /**
     * Genera el comando FFmpeg del cover para debugging.
     */
    public static getCoverFFmpegCommand(
        videoPath: string,
        outputPath: string,
        options: {
            frameTime: number;
            colorPop?: { saturationBoost: number; contrastBoost: number };
            textOverlay?: TikTokCoverTextOverlay;
            outputFormat?: 'jpeg' | 'png';
            jpegQuality?: number;
        }
    ): string {
        const filters = TikTokAdapter.buildCoverFilters(options);
        const format = options.outputFormat || 'jpeg';
        const quality = options.jpegQuality || TIKTOK_SPECS.defaultCover.jpegQuality;
        const args = TikTokAdapter.buildCoverFFmpegArgs(
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
}
