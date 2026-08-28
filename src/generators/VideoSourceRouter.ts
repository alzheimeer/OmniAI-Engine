/**
 * VideoSourceRouter - Orquestador de fuentes de video
 * 
 * Selecciona la fuente de video apropiada según el modo configurado
 * (comfyui, pexels, hybrid) y el tipo de segmento (key o filler).
 * 
 * Responsabilidades:
 * - Clasificación de segmentos como key o filler
 * - Routing de solicitudes según el modo configurado
 * - Fallback automático entre fuentes en modo hybrid
 * - Generación sintética como último recurso
 * - Tracking de uso de clips
 * 
 * @see Requirements: 5.1-5.7, 8.4-8.9, 9.1-9.6
 */

import { ComfyUIClient } from './ComfyUIClient';
import { ClipPoolManager } from './ClipPoolManager';
import { ClipDatabase, ClipCategory } from './ClipDatabase';
import { ComfyUIHealthMonitor } from './ComfyUIHealthMonitor';
import { VideoSourceMode, VisualStyle, VideoType, ModelConfig } from './ModelConfig';
import { 
    VideoGenerationError, 
    VideoGenerationErrorCode,
    createComfyUIUnavailableError,
    createPexelsAPIError,
    createPexelsNoResultsError,
    createPoolEmptyError,
    createFFmpegError,
    createRoutingError,
    createInvalidConfigError
} from './VideoGenerationError';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// ============================================================================
// TIPOS E INTERFACES (Tarea 10.1)
// ============================================================================

/**
 * Tipo de segmento en el video.
 * - key: Segmento importante (intro, outro, transiciones) - usar ComfyUI
 * - filler: Segmento intermedio/genérico - puede usar pool o Pexels
 * @see Requirement 9.1: Clasificar cada segmento como 'key' o 'filler'
 */
export type SegmentType = 'key' | 'filler';

/**
 * Resultado de generación de video unificado.
 * Contiene información sobre el video generado y su fuente.
 * @see Requirement 5.7: Retornar resultado con campo sourceUsed
 */
export interface VideoGenerationResult {
    /** Ruta al archivo de video generado o descargado */
    outputPath: string;
    
    /** 
     * Fuente utilizada para generar el video.
     * - comfyui: Generado localmente con ComfyUI
     * - pexels: Descargado de Pexels API
     * - pool: Obtenido del pool de clips pre-generados
     * - synthetic: Generado con FFmpeg como fallback
     * @see Requirement 5.7
     */
    sourceUsed: 'comfyui' | 'pexels' | 'pool' | 'synthetic';
    
    /** 
     * Tiempo de generación/obtención en milisegundos.
     * Para ComfyUI incluye generación completa.
     * Para Pexels/pool incluye descarga/copia.
     * @see Requirement 7.2
     */
    generationTimeMs: number;
    
    /** Metadata adicional del resultado */
    metadata: VideoGenerationMetadata;
}

/**
 * Metadata adicional del resultado de generación.
 */
export interface VideoGenerationMetadata {
    /** ID del clip si se obtuvo del pool */
    clipId?: string;
    
    /** Estilo visual si se generó con ComfyUI */
    style?: VisualStyle;
    
    /** Prompt utilizado */
    prompt: string;
    
    /** Tipo de segmento (key o filler) */
    segmentType: SegmentType;
    
    /** Dimensiones del video */
    dimensions?: { width: number; height: number };
    
    /** Número de frames si aplica */
    frames?: number;
    
    /** Duración en segundos */
    durationSeconds?: number;
}

/**
 * Solicitud de generación de video.
 * Contiene toda la información necesaria para generar o seleccionar un video.
 * @see Requirements 5.7, 9.1
 */
export interface VideoGenerationRequest {
    /** 
     * Prompt para búsqueda en Pexels (keywords cortos 1-3 palabras).
     * Usado cuando la fuente es Pexels.
     */
    visualPrompt: string;
    
    /** 
     * Prompt para ComfyUI (descripción detallada 20-50 palabras).
     * Incluye escena, iluminación, movimiento de cámara, estilo visual.
     * @see Requirement 13.3, 13.4
     */
    comfyPrompt?: string;
    
    /** 
     * Estilo visual para generación con ComfyUI.
     * Define parámetros de frames, movimiento y sufijo de prompt.
     * @see Requirement 15.1-15.9
     */
    style?: VisualStyle;
    
    /** 
     * Tipo de video (short o long).
     * Determina la resolución y orientación.
     * @see Requirement 14.1, 14.2
     */
    videoType: VideoType;
    
    /** 
     * Tipo de segmento (key o filler).
     * Si no se especifica, se clasifica automáticamente.
     * @see Requirement 9.6: Permitir override manual
     */
    segmentType?: SegmentType;
    
    /** 
     * ID del video para tracking de uso.
     * Permite evitar repeticiones en el mismo video.
     * @see Requirement 11.3
     */
    videoId: string;
    
    /** 
     * Índice del segmento en el video.
     * Usado para clasificación automática key/filler.
     * @see Requirement 9.2
     */
    segmentIndex: number;
    
    /** 
     * Total de segmentos en el video.
     * Usado junto con segmentIndex para clasificación.
     */
    totalSegments: number;
    
    /** 
     * Duración deseada del segmento en segundos.
     * Usado para clasificación automática (primeros/últimos 10s son key).
     * @see Requirement 9.2
     */
    durationSeconds?: number;
    
    /** 
     * Categoría del contenido para búsqueda en pool.
     * Opcional, se infiere de visualPrompt si no se especifica.
     */
    category?: ClipCategory;
    
    /** 
     * Plataforma de destino (youtube, tiktok, instagram).
     * Usado para tracking de uso.
     */
    platform?: string;
}

/**
 * Configuración del VideoSourceRouter.
 * Define las dependencias y el modo de operación.
 * @see Requirements 5.7, 8.1-8.3, 9.1
 */
export interface VideoSourceRouterConfig {
    /** 
     * Modo de fuente de video configurado.
     * - comfyui: Solo generación local con ComfyUI
     * - pexels: Solo videos de stock desde Pexels API
     * - hybrid: ComfyUI como primario, Pexels/pool como fallback
     * @see Requirement 8.1, 8.2, 8.3
     */
    mode: VideoSourceMode;
    
    /** 
     * Cliente ComfyUI para generación local de video.
     * Requerido para modos 'comfyui' y 'hybrid'.
     */
    comfyClient?: ComfyUIClient;
    
    /** 
     * API key de Pexels para descarga de videos de stock.
     * Requerido para modos 'pexels' y 'hybrid'.
     */
    pexelsApiKey?: string;
    
    /** 
     * Manager del pool de clips pre-generados.
     * Usado en modo 'hybrid' para segmentos filler.
     * @see Requirement 11.1
     */
    clipPoolManager?: ClipPoolManager;
    
    /** 
     * Base de datos de clips para tracking de uso.
     * @see Requirement 12.1, 12.2
     */
    clipDatabase?: ClipDatabase;
    
    /** 
     * Monitor de salud de ComfyUI.
     * Usado para verificar disponibilidad antes de intentar generar.
     * @see Requirement 2.3, 2.4, 2.5
     */
    healthMonitor?: ComfyUIHealthMonitor;
    
    /** 
     * Directorio para videos generados/descargados.
     * @default content/generated_videos
     */
    outputDirectory?: string;
    
    /** 
     * Máximo de reintentos con ComfyUI antes de fallback.
     * @default 2
     * @see Requirement 5.1
     */
    maxComfyRetries?: number;
    
    /** 
     * Timeout para generación con ComfyUI en milisegundos.
     * @default 1800000 (30 minutos)
     * @see Requirement 4.6
     */
    comfyTimeoutMs?: number;
}

/**
 * Opciones adicionales para generación de video.
 */
export interface VideoGenerationOptions {
    /** Forzar uso de una fuente específica, ignorando el modo */
    forceSource?: 'comfyui' | 'pexels' | 'pool';
    
    /** Número de reintentos personalizados */
    maxRetries?: number;
    
    /** Timeout personalizado en milisegundos */
    timeoutMs?: number;
    
    /** Si se debe registrar el uso en la base de datos */
    trackUsage?: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/** Directorio por defecto para videos generados */
export const DEFAULT_OUTPUT_DIRECTORY = 'content/generated_videos';

/** Máximo de reintentos por defecto con ComfyUI */
export const DEFAULT_MAX_COMFY_RETRIES = 2;

/** Timeout por defecto para generación ComfyUI (30 minutos) */
export const DEFAULT_COMFY_TIMEOUT_MS = 30 * 60 * 1000;

/** Duración del segmento key al inicio/fin del video en segundos */
export const KEY_SEGMENT_DURATION_SECONDS = 10;

// ============================================================================
// CLASE VIDEOSOURCEROUTER (Tareas 10.2-10.7)
// ============================================================================

/**
 * VideoSourceRouter - Orquestador de fuentes de video.
 * 
 * Selecciona y genera video según el modo configurado (comfyui, pexels, hybrid)
 * y el tipo de segmento (key o filler).
 * 
 * Responsabilidades:
 * - Clasificación de segmentos como key o filler (10.2)
 * - Routing de solicitudes según modo comfyui (10.3)
 * - Routing de solicitudes según modo pexels (10.4)
 * - Routing de solicitudes según modo hybrid (10.5)
 * - Generación de video sintético con FFmpeg (10.6)
 * - Tracking de uso y resultado (10.7)
 * 
 * @see Requirements: 5.1-5.7, 8.4-8.9, 9.1-9.6
 * 
 * @example
 * ```typescript
 * const router = new VideoSourceRouter({
 *   mode: 'hybrid',
 *   comfyClient: new ComfyUIClient(),
 *   clipPoolManager: new ClipPoolManager(db),
 *   clipDatabase: db,
 *   pexelsApiKey: 'your-api-key'
 * });
 * 
 * const result = await router.generateVideo({
 *   visualPrompt: 'forest nature',
 *   comfyPrompt: 'serene forest with gentle wind, soft sunlight...',
 *   style: 'cinemagraph_plotagraph',
 *   videoType: 'short',
 *   videoId: 'video_123',
 *   segmentIndex: 0,
 *   totalSegments: 5
 * });
 * ```
 */
export class VideoSourceRouter {
    private mode: VideoSourceMode;
    private comfyClient: ComfyUIClient | null;
    private clipPoolManager: ClipPoolManager | null;
    private clipDatabase: ClipDatabase | null;
    private healthMonitor: ComfyUIHealthMonitor | null;
    private pexelsApiKey: string | null;
    private outputDirectory: string;
    private maxComfyRetries: number;
    private comfyTimeoutMs: number;

    /**
     * Crea una nueva instancia de VideoSourceRouter.
     * @param config Configuración del router
     */
    constructor(config: VideoSourceRouterConfig) {
        this.mode = config.mode;
        this.comfyClient = config.comfyClient || null;
        this.clipPoolManager = config.clipPoolManager || null;
        this.clipDatabase = config.clipDatabase || null;
        this.healthMonitor = config.healthMonitor || null;
        this.pexelsApiKey = config.pexelsApiKey || null;
        this.outputDirectory = config.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
        this.maxComfyRetries = config.maxComfyRetries ?? DEFAULT_MAX_COMFY_RETRIES;
        this.comfyTimeoutMs = config.comfyTimeoutMs ?? DEFAULT_COMFY_TIMEOUT_MS;

        // Asegurar que el directorio de output existe
        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
            console.log(`[VideoSourceRouter] Directorio de output creado: ${this.outputDirectory}`);
        }

        console.log(`[VideoSourceRouter] Inicializado en modo '${this.mode}'`);
    }

    // ========================================================================
    // TAREA 10.2: CLASIFICACIÓN DE SEGMENTOS
    // ========================================================================

    /**
     * Clasifica un segmento como 'key' o 'filler'.
     * 
     * Reglas de clasificación:
     * - Primeros 10 segundos del video = key (intro)
     * - Últimos 10 segundos del video = key (outro)
     * - Resto de segmentos = filler
     * 
     * @param segmentIndex Índice del segmento (0-based)
     * @param totalSegments Número total de segmentos en el video
     * @param durationSeconds Duración total del video en segundos
     * @param overrideType Override manual del tipo de segmento (opcional)
     * @returns Tipo de segmento: 'key' o 'filler'
     * @see Requirements: 9.1, 9.2, 9.3, 9.6
     */
    public classifySegment(
        segmentIndex: number,
        totalSegments: number,
        durationSeconds: number,
        overrideType?: SegmentType
    ): SegmentType {
        // Requirement 9.6: Permitir override manual
        if (overrideType) {
            console.log(`[VideoSourceRouter] Segment ${segmentIndex}: override manual a '${overrideType}'`);
            return overrideType;
        }

        // Validar inputs
        if (totalSegments <= 0 || durationSeconds <= 0) {
            return 'filler';
        }

        // Calcular posición temporal del segmento
        const segmentDuration = durationSeconds / totalSegments;
        const segmentStartTime = segmentIndex * segmentDuration;
        const segmentEndTime = (segmentIndex + 1) * segmentDuration;

        // Requirement 9.2: Primeros 10 segundos = key (intro)
        if (segmentStartTime < KEY_SEGMENT_DURATION_SECONDS) {
            console.log(`[VideoSourceRouter] Segment ${segmentIndex}: key (intro, start=${segmentStartTime.toFixed(1)}s)`);
            return 'key';
        }

        // Requirement 9.2: Últimos 10 segundos = key (outro)
        if (segmentEndTime > durationSeconds - KEY_SEGMENT_DURATION_SECONDS) {
            console.log(`[VideoSourceRouter] Segment ${segmentIndex}: key (outro, end=${segmentEndTime.toFixed(1)}s)`);
            return 'key';
        }

        // Requirement 9.3: Resto = filler
        console.log(`[VideoSourceRouter] Segment ${segmentIndex}: filler`);
        return 'filler';
    }

    // ========================================================================
    // MÉTODO PRINCIPAL DE GENERACIÓN
    // ========================================================================

    /**
     * Genera un video según el modo configurado y el tipo de segmento.
     * @param request Solicitud de generación de video
     * @param options Opciones adicionales de generación
     * @returns Resultado de la generación con sourceUsed y métricas
     * @see Requirements: 5.1-5.7, 8.4-8.9
     */
    public async generateVideo(
        request: VideoGenerationRequest,
        options?: VideoGenerationOptions
    ): Promise<VideoGenerationResult> {
        const startTime = Date.now();

        // Determinar tipo de segmento si no se especificó
        const durationSeconds = request.durationSeconds || 60; // Default 60s si no se especifica
        const segmentType = request.segmentType || this.classifySegment(
            request.segmentIndex,
            request.totalSegments,
            durationSeconds
        );

        console.log(`[VideoSourceRouter] Generando video para segment ${request.segmentIndex}/${request.totalSegments} (${segmentType}) en modo '${this.mode}'`);

        let result: VideoGenerationResult;

        // Si hay forzado de fuente, usarlo
        if (options?.forceSource) {
            result = await this.generateWithForceSource(request, options.forceSource, startTime);
        } else {
            // Routing según modo configurado
            switch (this.mode) {
                case 'comfyui':
                    result = await this.routeComfyUIMode(request, startTime);
                    break;
                case 'pexels':
                    result = await this.routePexelsMode(request, startTime);
                    break;
                case 'hybrid':
                    result = await this.routeHybridMode(request, segmentType, startTime);
                    break;
                default:
                    throw new Error(`[VideoSourceRouter] Modo inválido: ${this.mode}`);
            }
        }

        // Requirement 10.7: Tracking de uso
        if (options?.trackUsage !== false) {
            await this.trackUsage(result, request, segmentType);
        }

        return result;
    }

    /**
     * Genera múltiples videos para un video largo.
     * @param requests Array de solicitudes de generación
     * @returns Array de resultados de generación
     */
    public async generateMultipleVideos(
        requests: VideoGenerationRequest[]
    ): Promise<VideoGenerationResult[]> {
        console.log(`[VideoSourceRouter] Generando ${requests.length} videos...`);
        
        const results: VideoGenerationResult[] = [];
        for (let i = 0; i < requests.length; i++) {
            console.log(`[VideoSourceRouter] Procesando video ${i + 1}/${requests.length}`);
            const result = await this.generateVideo(requests[i]);
            results.push(result);
        }
        
        return results;
    }

    // ========================================================================
    // TAREA 10.3: ROUTING MODO 'comfyui'
    // ========================================================================

    /**
     * Routing para modo 'comfyui': usa exclusivamente ComfyUI.
     * - Reintentar hasta 2 veces si falla (Req 5.1)
     * - Lanzar error sin alternativas si falla después de reintentos (Req 5.2)
     * 
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación
     * @throws VideoGenerationError si ComfyUI no está disponible o falla
     * @see Requirements: 5.1, 5.2, 8.4, 8.5
     */
    private async routeComfyUIMode(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        // Requirement 8.5: Verificar disponibilidad de ComfyUI
        if (!this.comfyClient) {
            throw new VideoGenerationError(
                VideoGenerationErrorCode.INVALID_CONFIG,
                'Modo comfyui requiere ComfyUI configurado',
                false,
                { mode: 'comfyui' }
            );
        }

        // Verificar si ComfyUI está disponible usando health monitor o check directo
        const isAvailable = this.healthMonitor?.isComfyUIAvailable() ?? await this.comfyClient.isAvailable();
        if (!isAvailable) {
            throw createComfyUIUnavailableError(
                'http://127.0.0.1:8188',
                'ComfyUI no está disponible. Requerido en modo comfyui.'
            );
        }

        // 1. Reuso inteligente: si existe un clip en el pool local con buena coincidencia, reutilizarlo
        if (this.clipPoolManager && (this.clipPoolManager.shouldPrioritizeReuse() || request.segmentType === 'filler')) {
            try {
                const poolResult = await this.getFromPool(request, startTime);
                if (poolResult) {
                    console.log(`[VideoSourceRouter] Reutilizando clip del pool local: ${poolResult.outputPath}`);
                    return poolResult;
                }
            } catch (poolErr: any) {
                console.log(`[VideoSourceRouter] Busqueda en pool retorno sin coincidencias, procediendo a generar nuevo con ComfyUI`);
            }
        }

        // Requirement 5.1: Reintentar hasta 2 veces
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= this.maxComfyRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`[VideoSourceRouter] Reintento ${attempt}/${this.maxComfyRetries} con ComfyUI...`);
                }
                
                const result = await this.generateWithComfyUI(request, startTime);
                return result;
            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`[VideoSourceRouter] ComfyUI falló (intento ${attempt + 1}/${this.maxComfyRetries + 1}):`, lastError.message);
            }
        }

        // Requirement 5.2: Lanzar error sin alternativas
        throw new VideoGenerationError(
            VideoGenerationErrorCode.COMFYUI_GENERATION_FAILED,
            `ComfyUI falló después de ${this.maxComfyRetries + 1} intentos`,
            false, // No recuperable en modo comfyui
            { 
                attempts: this.maxComfyRetries + 1,
                lastError: lastError?.message 
            },
            lastError || undefined
        );
    }

    // ========================================================================
    // TAREA 10.4: ROUTING MODO 'pexels'
    // ========================================================================

    /**
     * Routing para modo 'pexels': usa exclusivamente Pexels API.
     * - No intenta usar ComfyUI (Req 8.6)
     * - Genera video sintético si Pexels falla (Req 5.3)
     * 
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación
     * @see Requirements: 5.3, 8.6
     */
    private async routePexelsMode(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        // Requirement 8.6: Usar exclusivamente Pexels
        try {
            const result = await this.generateWithPexels(request, startTime);
            return result;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[VideoSourceRouter] Pexels falló, usando video sintético. Error: ${errorMessage}`);
            
            // Requirement 5.3: Generar video sintético si Pexels falla
            return this.generateSynthetic(request, startTime);
        }
    }

    // ========================================================================
    // TAREA 10.5: ROUTING MODO 'hybrid'
    // ========================================================================

    /**
     * Routing para modo 'hybrid': estrategia inteligente según tipo de segmento.
     * - Key segments: usar ComfyUI (Req 9.4)
     * - Filler segments: pool primero, luego Pexels (Req 9.5)
     * - Si ComfyUI falla, usar Pexels con warning (Req 8.9)
     * - Si ambos fallan, video sintético (Req 5.5)
     * 
     * @param request Solicitud de generación
     * @param segmentType Tipo de segmento (key o filler)
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación
     * @see Requirements: 5.4, 5.5, 5.6, 8.8, 8.9, 9.4, 9.5
     */
    private async routeHybridMode(
        request: VideoGenerationRequest,
        segmentType: SegmentType,
        startTime: number
    ): Promise<VideoGenerationResult> {
        // Requirement 9.4: Key segments usan ComfyUI
        if (segmentType === 'key') {
            return this.routeHybridKeySegment(request, startTime);
        }

        // Requirement 9.5: Filler segments usan pool o Pexels
        return this.routeHybridFillerSegment(request, startTime);
    }

    /**
     * Routing híbrido para segmentos key.
     * Intenta ComfyUI primero, con fallback a Pexels y luego sintético.
     */
    private async routeHybridKeySegment(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        // Intentar ComfyUI primero si está disponible
        if (this.comfyClient) {
            const isAvailable = this.healthMonitor?.isComfyUIAvailable() ?? await this.comfyClient.isAvailable();
            
            if (isAvailable) {
                try {
                    return await this.generateWithComfyUI(request, startTime);
                } catch (error: unknown) {
                    // Requirement 8.9 & 5.6: Warning cuando se usa fuente alternativa
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.warn(`[VideoSourceRouter] ComfyUI falló para key segment, usando Pexels. Error: ${errorMessage}`);
                }
            } else {
                // Requirement 8.9: Warning cuando ComfyUI no disponible en hybrid
                console.warn('[VideoSourceRouter] ComfyUI no disponible para key segment, usando Pexels');
            }
        }

        // Requirement 5.4: Usar Pexels como fallback
        try {
            return await this.generateWithPexels(request, startTime);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[VideoSourceRouter] Pexels también falló para key segment. Error: ${errorMessage}`);
            
            // Requirement 5.5: Video sintético como último recurso
            return this.generateSynthetic(request, startTime);
        }
    }

    /**
     * Routing híbrido para segmentos filler.
     * Intenta pool primero, luego Pexels, luego sintético.
     */
    private async routeHybridFillerSegment(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        // Requirement 9.5: Filler busca primero en pool
        if (this.clipPoolManager) {
            try {
                const poolResult = await this.getFromPool(request, startTime);
                if (poolResult) {
                    return poolResult;
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`[VideoSourceRouter] Pool no disponible: ${errorMessage}`);
            }
        }

        // Si pool no tiene clip, usar Pexels
        try {
            return await this.generateWithPexels(request, startTime);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[VideoSourceRouter] Pexels falló para filler segment. Error: ${errorMessage}`);
            
            // Requirement 5.5: Video sintético como último recurso
            return this.generateSynthetic(request, startTime);
        }
    }

    // ========================================================================
    // GENERACIÓN CON COMFYUI
    // ========================================================================

    /**
     * Genera video usando ComfyUI Client.
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación con sourceUsed='comfyui'
     * @throws VideoGenerationError si falla la generación
     */
    private async generateWithComfyUI(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        if (!this.comfyClient) {
            throw new VideoGenerationError(
                VideoGenerationErrorCode.INVALID_CONFIG,
                'ComfyUI client no configurado',
                false,
                { source: 'comfyui' }
            );
        }

        const prompt = request.comfyPrompt || this.expandVisualPrompt(request.visualPrompt);
        const modelConfig = ModelConfig.getInstance();
        const resolution = modelConfig.getResolution(request.videoType);
        
        // Obtener parámetros de estilo si se especifica
        let frames = modelConfig.getConfig().defaultFrames;
        if (request.style) {
            const styleParams = modelConfig.getStyleParams(request.style);
            frames = styleParams.frames;
        }

        console.log(`[VideoSourceRouter] Generando con ComfyUI: ${prompt.substring(0, 50)}...`);

        // Verificar modo de generacion (T2V o I2V) 
        const generationMode = process.env.COMFYUI_GENERATION_MODE?.toLowerCase(); 
        let result; 
        if (generationMode === 'i2v') { 
            // Modo I2V: Generar imagen con Pollinations y luego animarla 
            console.log('[VideoSourceRouter] Usando modo I2V (Image-to-Video)'); 
            const { ImageGeneratorRouter } = await import('./ImageGeneratorRouter.js'); 
            const imageRouter = new ImageGeneratorRouter(); 
            const imageResult = await imageRouter.generateImage({ 
                prompt, 
                orientation: request.videoType === 'short' ? 'portrait' : 'landscape' 
            }); 
            result = await this.comfyClient.generateI2V({ 
                prompt, 
                negativePrompt: 'blurry, low quality, distorted, text, watermark, ugly, deformed', 
                width: resolution.width, 
                height: resolution.height, 
                frames, 
                inputImage: imageResult.imagePath, 
                orientation: request.videoType === 'short' ? 'portrait' : 'landscape' 
            }, this.comfyTimeoutMs);
        } else { 
            // Modo T2V: Generacion directa de texto a video 
            result = await this.comfyClient.generateT2V({
            prompt,
            negativePrompt: 'blurry, low quality, distorted, text, watermark, ugly, deformed',
            width: resolution.width,
            height: resolution.height,
            frames,
            orientation: request.videoType === 'short' ? 'portrait' : 'landscape'
        }, this.comfyTimeoutMs);
        }

        const generationTimeMs = Date.now() - startTime;
        
        // Requirement 7.2: Registrar tiempo de generación
        console.log(`[VideoSourceRouter] ComfyUI completó en ${(generationTimeMs / 1000).toFixed(1)}s`);

        return {
            outputPath: result.outputPath,
            sourceUsed: 'comfyui',
            generationTimeMs,
            metadata: {
                prompt,
                segmentType: request.segmentType || 'filler',
                style: request.style,
                dimensions: result.dimensions,
                frames: result.frames,
                durationSeconds: result.frames / 24
            }
        };
    }

    // ========================================================================
    // GENERACIÓN CON PEXELS
    // ========================================================================

    /**
     * Genera video usando Pexels API.
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación con sourceUsed='pexels'
     * @throws VideoGenerationError si falla la búsqueda o descarga
     */
    private async generateWithPexels(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        if (!this.pexelsApiKey) {
            throw new VideoGenerationError(
                VideoGenerationErrorCode.INVALID_CONFIG,
                'Pexels API key no configurada',
                false,
                { source: 'pexels' }
            );
        }

        console.log(`[VideoSourceRouter] Buscando en Pexels: "${request.visualPrompt}"`);

        try {
            // Buscar videos en Pexels
            const searchResponse = await axios.get('https://api.pexels.com/videos/search', {
                headers: { Authorization: this.pexelsApiKey },
                params: {
                    query: request.visualPrompt,
                    per_page: 5,
                    orientation: request.videoType === 'short' ? 'portrait' : 'landscape'
                },
                timeout: 30000
            });

            const videos = searchResponse.data.videos;
            if (!videos || videos.length === 0) {
                throw createPexelsNoResultsError(request.visualPrompt);
            }

            // Seleccionar el primer video con calidad adecuada
            const video = videos[0];
            const videoFile = this.selectBestVideoFile(video.video_files, request.videoType);
            
            if (!videoFile) {
                throw new VideoGenerationError(
                    VideoGenerationErrorCode.PEXELS_NO_RESULTS,
                    'No se encontró archivo de video adecuado en Pexels',
                    true,
                    { query: request.visualPrompt, videoId: video.id }
                );
            }

            // Descargar el video
            const timestamp = Date.now();
            const filename = `pexels_${video.id}_${timestamp}.mp4`;
            const outputPath = path.join(this.outputDirectory, filename);

            console.log(`[VideoSourceRouter] Descargando video de Pexels: ${videoFile.link}`);
            
            const videoResponse = await axios.get(videoFile.link, {
                responseType: 'arraybuffer',
                timeout: 60000
            });
            
            fs.writeFileSync(outputPath, videoResponse.data);

            const generationTimeMs = Date.now() - startTime;
            
            // Requirement 7.2: Registrar tiempo
            console.log(`[VideoSourceRouter] Pexels descargó en ${(generationTimeMs / 1000).toFixed(1)}s`);

            return {
                outputPath,
                sourceUsed: 'pexels',
                generationTimeMs,
                metadata: {
                    prompt: request.visualPrompt,
                    segmentType: request.segmentType || 'filler',
                    dimensions: { width: videoFile.width, height: videoFile.height },
                    durationSeconds: video.duration
                }
            };
        } catch (error: unknown) {
            // Si ya es VideoGenerationError, re-lanzar
            if (error instanceof VideoGenerationError) {
                throw error;
            }
            
            // Wrapear otros errores
            throw createPexelsAPIError(
                error instanceof Error ? error.message : String(error),
                request.visualPrompt,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Selecciona el mejor archivo de video de Pexels según tipo de video.
     */
    private selectBestVideoFile(
        videoFiles: any[],
        videoType: VideoType
    ): any {
        // Filtrar por calidad y orientación
        const preferredHeight = videoType === 'short' ? 1080 : 720;
        
        // Ordenar por cercanía a la altura preferida
        const sorted = [...videoFiles].sort((a, b) => {
            const diffA = Math.abs(a.height - preferredHeight);
            const diffB = Math.abs(b.height - preferredHeight);
            return diffA - diffB;
        });

        return sorted[0];
    }

    // ========================================================================
    // TAREA 10.6: GENERACIÓN SINTÉTICA CON FFMPEG
    // ========================================================================

    /**
     * Genera video sintético con FFmpeg como último fallback.
     * Crea un video con color sólido animado.
     * 
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado de la generación con sourceUsed='synthetic'
     * @see Requirements: 5.3, 5.5
     */
    private async generateSynthetic(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult> {
        console.warn(`[VideoSourceRouter] Generando video sintético para: "${request.visualPrompt}"`);

        const modelConfig = ModelConfig.getInstance();
        const resolution = modelConfig.getResolution(request.videoType);
        const durationSeconds = request.durationSeconds || 5;
        const fps = 24;
        
        const timestamp = Date.now();
        const filename = `synthetic_${timestamp}.mp4`;
        const outputPath = path.join(this.outputDirectory, filename);

        // Seleccionar color basado en keywords del prompt (para dar algo de variedad)
        const color = this.selectColorForPrompt(request.visualPrompt);

        // Generar video con FFmpeg: color sólido con fade animado
        await this.runFFmpegSynthetic(
            outputPath,
            resolution.width,
            resolution.height,
            durationSeconds,
            fps,
            color
        );

        const generationTimeMs = Date.now() - startTime;

        // Requirement 7.6: Registrar que se usó fuente sintética
        console.warn(`[VideoSourceRouter] Video sintético generado en ${(generationTimeMs / 1000).toFixed(1)}s`);

        return {
            outputPath,
            sourceUsed: 'synthetic',
            generationTimeMs,
            metadata: {
                prompt: request.visualPrompt,
                segmentType: request.segmentType || 'filler',
                dimensions: { width: resolution.width, height: resolution.height },
                durationSeconds
            }
        };
    }

    /**
     * Ejecuta FFmpeg para generar video sintético con color sólido animado.
     * @throws VideoGenerationError si FFmpeg falla
     */
    private runFFmpegSynthetic(
        outputPath: string,
        width: number,
        height: number,
        durationSeconds: number,
        fps: number,
        color: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            // Crear filtro complejo: color sólido con leve gradiente/fade para no ser estático
            const filterComplex = [
                `color=c=${color}:s=${width}x${height}:r=${fps}:d=${durationSeconds}`,
                `fade=t=in:st=0:d=1`,
                `fade=t=out:st=${durationSeconds - 1}:d=1`
            ].join(',');

            const args = [
                '-f', 'lavfi',
                '-i', filterComplex,
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-t', String(durationSeconds),
                '-y',  // Sobrescribir si existe
                outputPath
            ];

            console.log(`[VideoSourceRouter] Ejecutando FFmpeg para video sintético...`);
            
            const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' });
            
            let stderr = '';
            ffmpeg.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(createFFmpegError(
                        `FFmpeg falló con código ${code}`,
                        code ?? undefined,
                        stderr
                    ));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(createFFmpegError(
                    `Error al ejecutar FFmpeg: ${err.message}`,
                    undefined,
                    stderr
                ));
            });
        });
    }

    /**
     * Selecciona un color basado en keywords del prompt para dar variedad.
     */
    private selectColorForPrompt(prompt: string): string {
        const promptLower = prompt.toLowerCase();
        
        // Mapeo de keywords a colores
        if (promptLower.includes('nature') || promptLower.includes('forest') || promptLower.includes('green')) {
            return '1a472a'; // Verde oscuro
        }
        if (promptLower.includes('ocean') || promptLower.includes('water') || promptLower.includes('blue')) {
            return '1a3a5c'; // Azul oscuro
        }
        if (promptLower.includes('sunset') || promptLower.includes('warm') || promptLower.includes('orange')) {
            return '5c3a1a'; // Naranja oscuro
        }
        if (promptLower.includes('tech') || promptLower.includes('cyber') || promptLower.includes('digital')) {
            return '0a1a2a'; // Azul muy oscuro (tech)
        }
        if (promptLower.includes('night') || promptLower.includes('dark')) {
            return '0a0a1a'; // Casi negro con tinte azul
        }
        if (promptLower.includes('urban') || promptLower.includes('city')) {
            return '2a2a3a'; // Gris azulado
        }
        
        // Color por defecto: gris neutro oscuro
        return '1a1a1a';
    }

    // ========================================================================
    // OBTENCIÓN DESDE POOL
    // ========================================================================

    /**
     * Intenta obtener un clip del pool de clips pre-generados.
     * @param request Solicitud de generación
     * @param startTime Tiempo de inicio para métricas
     * @returns Resultado con sourceUsed='pool' o null si no hay clip disponible
     */
    private async getFromPool(
        request: VideoGenerationRequest,
        startTime: number
    ): Promise<VideoGenerationResult | null> {
        if (!this.clipPoolManager) {
            return null;
        }

        // Extraer keywords del visualPrompt
        const keywords = request.visualPrompt.split(/\s+/).filter(w => w.length > 2);
        
        // Inferir categoría del prompt
        const category = request.category || this.inferCategory(request.visualPrompt);

        const clip = await this.clipPoolManager.getClip(category, keywords);
        
        if (!clip) {
            console.log(`[VideoSourceRouter] No hay clip disponible en pool para categoría '${category}'`);
            return null;
        }

        const generationTimeMs = Date.now() - startTime;
        
        console.log(`[VideoSourceRouter] Clip obtenido del pool: ${clip.id} en ${(generationTimeMs / 1000).toFixed(1)}s`);

        return {
            outputPath: clip.filepath,
            sourceUsed: 'pool',
            generationTimeMs,
            metadata: {
                clipId: clip.id,
                prompt: request.visualPrompt,
                segmentType: request.segmentType || 'filler',
                dimensions: this.parseResolutionString(clip.resolution),
                frames: clip.frames,
                durationSeconds: clip.durationSeconds
            }
        };
    }

    /**
     * Infiere la categoría de un prompt basándose en keywords.
     */
    private inferCategory(prompt: string): ClipCategory {
        const promptLower = prompt.toLowerCase();
        
        if (promptLower.match(/nature|forest|mountain|ocean|water|tree|plant|sky|cloud|rain|sun/)) {
            return 'nature';
        }
        if (promptLower.match(/tech|computer|digital|cyber|code|data|circuit|screen|ai/)) {
            return 'technology';
        }
        if (promptLower.match(/business|office|corporate|meeting|work|professional|city skyline/)) {
            return 'business';
        }
        if (promptLower.match(/abstract|geometric|pattern|gradient|shape|particle|art/)) {
            return 'abstract';
        }
        if (promptLower.match(/lifestyle|coffee|home|book|relax|cozy|warm|light/)) {
            return 'lifestyle';
        }
        if (promptLower.match(/urban|city|street|building|neon|night|corridor|liminal/)) {
            return 'urban';
        }
        
        return 'abstract'; // Default
    }

    /**
     * Parsea string de resolución "WIDTHxHEIGHT" a objeto.
     */
    private parseResolutionString(resolution: string): { width: number; height: number } {
        const parts = resolution.split('x');
        return {
            width: parseInt(parts[0], 10) || 576,
            height: parseInt(parts[1], 10) || 1024
        };
    }

    // ========================================================================
    // TAREA 10.7: TRACKING DE USO Y RESULTADO
    // ========================================================================

    /**
     * Registra el uso del resultado en la base de datos de clips.
     * @param result Resultado de la generación
     * @param request Solicitud original
     * @param segmentType Tipo de segmento usado
     * @see Requirements: 5.6, 5.7, 7.2, 7.6
     */
    private async trackUsage(
        result: VideoGenerationResult,
        request: VideoGenerationRequest,
        segmentType: SegmentType
    ): Promise<void> {
        // Requirement 7.6: Registrar warning cuando se usa fuente alternativa
        if (this.mode === 'hybrid' && result.sourceUsed !== 'comfyui' && segmentType === 'key') {
            console.warn(
                `[VideoSourceRouter] WARNING: Key segment usó fuente '${result.sourceUsed}' en lugar de ComfyUI`
            );
        }

        // Registrar en ClipPoolManager si el clip vino del pool
        if (result.sourceUsed === 'pool' && result.metadata.clipId && this.clipPoolManager) {
            this.clipPoolManager.recordUsage(
                result.metadata.clipId,
                request.videoId,
                request.videoType,
                segmentType,
                request.platform
            );
        }

        // Requirement 7.2: Log de tiempo de generación
        console.log(
            `[VideoSourceRouter] Video generado - ` +
            `source: ${result.sourceUsed}, ` +
            `tiempo: ${(result.generationTimeMs / 1000).toFixed(1)}s, ` +
            `segment: ${segmentType}, ` +
            `videoId: ${request.videoId}`
        );
    }

    // ========================================================================
    // UTILIDADES
    // ========================================================================

    /**
     * Expande un visualPrompt corto a un comfyPrompt más descriptivo.
     * Usado cuando no se proporciona comfyPrompt explícito.
     */
    private expandVisualPrompt(visualPrompt: string): string {
        // Template genérico para expandir keywords a prompt descriptivo
        return `${visualPrompt}, cinematic scene, professional quality, ` +
               `smooth movement, atmospheric lighting, high detail, ` +
               `seamless loop, subtle motion, gentle drift`;
    }

    /**
     * Genera con fuente forzada (para opciones override).
     * @throws VideoGenerationError si la fuente no está disponible
     */
    private async generateWithForceSource(
        request: VideoGenerationRequest,
        forceSource: 'comfyui' | 'pexels' | 'pool',
        startTime: number
    ): Promise<VideoGenerationResult> {
        switch (forceSource) {
            case 'comfyui':
                return this.generateWithComfyUI(request, startTime);
            case 'pexels':
                return this.generateWithPexels(request, startTime);
            case 'pool':
                const poolResult = await this.getFromPool(request, startTime);
                if (!poolResult) {
                    throw createPoolEmptyError(request.category);
                }
                return poolResult;
            default:
                throw createRoutingError(
                    `Fuente forzada inválida: ${forceSource}`,
                    this.mode
                );
        }
    }

    /**
     * Obtiene el modo de operación actual.
     */
    public getMode(): VideoSourceMode {
        return this.mode;
    }

    /**
     * Actualiza el modo de operación.
     */
    public setMode(mode: VideoSourceMode): void {
        this.mode = mode;
        console.log(`[VideoSourceRouter] Modo actualizado a '${mode}'`);
    }
}

