/**
 * VideoGenerationError - Errores personalizados para generación de video
 * 
 * Define códigos de error específicos para cada componente y situación
 * del sistema de generación de video con ComfyUI.
 * 
 * Responsabilidades:
 * - Proporcionar códigos de error descriptivos y únicos
 * - Indicar si un error es recuperable (puede hacer fallback)
 * - Mantener contexto adicional para debugging
 * - Facilitar el wrapping de errores originales
 * 
 * @see Requirements: 7.1, 7.6
 */

// ============================================================================
// ENUM VIDEOGENERATIONERRORCODE (Tarea 16.1)
// ============================================================================

/**
 * Códigos de error para generación de video.
 * Organizados por componente/área para facilitar identificación.
 * 
 * Rangos de códigos:
 * - 1xxx: ComfyUI Process Manager
 * - 2xxx: Health Monitor
 * - 3xxx: Configuración
 * - 4xxx: Generación
 * - 5xxx: Pexels API
 * - 6xxx: Pool de clips
 * - 7xxx: Base de datos
 * - 8xxx: FFmpeg
 * - 9xxx: Routing
 * 
 * @see Requirement 7.1: Registrar todos los eventos de ciclo de vida
 */
export enum VideoGenerationErrorCode {
    // ========================================================================
    // ComfyUI Process Errors (1xxx)
    // ========================================================================
    
    /** ComfyUI no respondió dentro del timeout de startup */
    COMFYUI_STARTUP_TIMEOUT = 'COMFYUI_STARTUP_TIMEOUT',
    
    /** El proceso ComfyUI terminó inesperadamente (crash) */
    COMFYUI_PROCESS_CRASH = 'COMFYUI_PROCESS_CRASH',
    
    /** No se pudo ejecutar el script de inicio de ComfyUI */
    COMFYUI_SPAWN_FAILED = 'COMFYUI_SPAWN_FAILED',
    
    // ========================================================================
    // Health Monitor / Availability Errors (2xxx)
    // ========================================================================
    
    /** ComfyUI server no está respondiendo */
    COMFYUI_UNAVAILABLE = 'COMFYUI_UNAVAILABLE',
    
    /** Health check falló (error de red o timeout) */
    HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
    
    // ========================================================================
    // Generation Errors (3xxx)
    // ========================================================================
    
    /** La generación con ComfyUI excedió el timeout configurado */
    COMFYUI_TIMEOUT = 'COMFYUI_TIMEOUT',
    
    /** ComfyUI retornó un error durante la generación */
    COMFYUI_GENERATION_FAILED = 'COMFYUI_GENERATION_FAILED',
    
    /** El archivo de salida no se encontró después de la generación */
    OUTPUT_NOT_FOUND = 'OUTPUT_NOT_FOUND',
    
    /** El workflow de ComfyUI falló */
    WORKFLOW_FAILED = 'WORKFLOW_FAILED',
    
    // ========================================================================
    // Configuration Errors (4xxx)
    // ========================================================================
    
    /** Configuración de modelo inválida (COMFYUI_MODEL) */
    INVALID_MODEL_CONFIG = 'INVALID_MODEL_CONFIG',
    
    /** Resolución configurada no es válida (no múltiplo de 16) */
    INVALID_RESOLUTION = 'INVALID_RESOLUTION',
    
    /** Modo de video inválido (VIDEO_SOURCE_MODE) */
    INVALID_VIDEO_SOURCE_MODE = 'INVALID_VIDEO_SOURCE_MODE',
    
    /** Configuración general inválida */
    INVALID_CONFIG = 'INVALID_CONFIG',
    
    // ========================================================================
    // Pexels API Errors (5xxx)
    // ========================================================================
    
    /** Pexels API retornó un error */
    PEXELS_API_ERROR = 'PEXELS_API_ERROR',
    
    /** No se encontraron videos para la búsqueda en Pexels */
    PEXELS_NO_RESULTS = 'PEXELS_NO_RESULTS',
    
    /** Error al descargar video de Pexels */
    PEXELS_DOWNLOAD_FAILED = 'PEXELS_DOWNLOAD_FAILED',
    
    // ========================================================================
    // Pool Errors (6xxx)
    // ========================================================================
    
    /** No hay clips disponibles en el pool */
    POOL_EMPTY = 'POOL_EMPTY',
    
    /** El clip solicitado no se encontró */
    CLIP_NOT_FOUND = 'CLIP_NOT_FOUND',
    
    /** No hay clips disponibles para la categoría */
    NO_CLIPS_AVAILABLE = 'NO_CLIPS_AVAILABLE',
    
    // ========================================================================
    // Database Errors (7xxx)
    // ========================================================================
    
    /** Error al acceder a la base de datos de clips */
    POOL_DATABASE_ERROR = 'POOL_DATABASE_ERROR',
    
    /** Error general de base de datos */
    DATABASE_ERROR = 'DATABASE_ERROR',
    
    /** Migración de base de datos falló */
    MIGRATION_FAILED = 'MIGRATION_FAILED',
    
    // ========================================================================
    // FFmpeg Errors (8xxx)
    // ========================================================================
    
    /** FFmpeg command falló */
    FFMPEG_ERROR = 'FFMPEG_ERROR',
    
    /** FFmpeg no está instalado o no se encontró */
    FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',
    
    // ========================================================================
    // Routing Errors (9xxx)
    // ========================================================================
    
    /** Error durante el routing de fuente de video */
    ROUTING_ERROR = 'ROUTING_ERROR',
    
    /** Todas las fuentes fallaron (ComfyUI, Pexels, Pool) */
    ALL_SOURCES_FAILED = 'ALL_SOURCES_FAILED',
    
    /** Fuente de video forzada no está disponible */
    FORCED_SOURCE_UNAVAILABLE = 'FORCED_SOURCE_UNAVAILABLE'
}

// ============================================================================
// MAPEO DE RECUPERABILIDAD
// ============================================================================

/**
 * Define qué errores son recuperables (pueden hacer fallback a otra fuente).
 * Los errores recuperables permiten que el sistema intente alternativas.
 */
const RECOVERABLE_ERRORS: Set<VideoGenerationErrorCode> = new Set([
    // Errores de ComfyUI que permiten fallback a Pexels
    VideoGenerationErrorCode.COMFYUI_UNAVAILABLE,
    VideoGenerationErrorCode.COMFYUI_TIMEOUT,
    VideoGenerationErrorCode.COMFYUI_GENERATION_FAILED,
    VideoGenerationErrorCode.COMFYUI_PROCESS_CRASH,
    VideoGenerationErrorCode.WORKFLOW_FAILED,
    VideoGenerationErrorCode.OUTPUT_NOT_FOUND,
    VideoGenerationErrorCode.HEALTH_CHECK_FAILED,
    
    // Errores de Pexels que permiten fallback a sintético
    VideoGenerationErrorCode.PEXELS_API_ERROR,
    VideoGenerationErrorCode.PEXELS_NO_RESULTS,
    VideoGenerationErrorCode.PEXELS_DOWNLOAD_FAILED,
    
    // Errores de pool que permiten fallback a Pexels
    VideoGenerationErrorCode.POOL_EMPTY,
    VideoGenerationErrorCode.CLIP_NOT_FOUND,
    VideoGenerationErrorCode.NO_CLIPS_AVAILABLE,
    VideoGenerationErrorCode.POOL_DATABASE_ERROR
]);

// ============================================================================
// CLASE VIDEOGENERATIONERROR (Tarea 16.1)
// ============================================================================

/**
 * Error personalizado para generación de video.
 * 
 * Extiende Error estándar con información adicional:
 * - code: Código de error específico para identificación
 * - recoverable: Si el error permite intentar alternativas
 * - context: Información adicional para debugging
 * - timestamp: Momento en que ocurrió el error
 * - cause: Error original si se está wrapeando otro error
 * 
 * @example
 * ```typescript
 * // Crear error nuevo
 * throw new VideoGenerationError(
 *   VideoGenerationErrorCode.COMFYUI_UNAVAILABLE,
 *   'ComfyUI no está respondiendo en http://127.0.0.1:8188',
 *   true, // recoverable
 *   { url: 'http://127.0.0.1:8188', attempts: 3 }
 * );
 * 
 * // Wrapear error existente
 * catch (error) {
 *   throw VideoGenerationError.fromError(
 *     error,
 *     VideoGenerationErrorCode.PEXELS_API_ERROR
 *   );
 * }
 * ```
 * 
 * @see Requirement 7.1: Registrar todos los eventos de ciclo de vida
 */
export class VideoGenerationError extends Error {
    /** Código de error para identificación programática */
    public readonly code: VideoGenerationErrorCode;
    
    /** Si el error permite intentar alternativas (fallback) */
    public readonly recoverable: boolean;
    
    /** Contexto adicional para debugging */
    public readonly context: Record<string, unknown>;
    
    /** Momento en que ocurrió el error */
    public readonly timestamp: Date;
    
    /** Error original si se está wrapeando otro error */
    public readonly cause?: Error;

    /**
     * Crea una nueva instancia de VideoGenerationError.
     * 
     * @param code Código de error del enum VideoGenerationErrorCode
     * @param message Mensaje descriptivo del error
     * @param recoverable Si el error permite hacer fallback (default: inferido del código)
     * @param context Información adicional para debugging
     * @param cause Error original si se está wrapeando
     */
    constructor(
        code: VideoGenerationErrorCode,
        message: string,
        recoverable?: boolean,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super(message);
        
        this.name = 'VideoGenerationError';
        this.code = code;
        this.recoverable = recoverable ?? RECOVERABLE_ERRORS.has(code);
        this.context = context;
        this.timestamp = new Date();
        this.cause = cause;
        
        // Mantener stack trace correcto en V8 (Node.js)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, VideoGenerationError);
        }
    }

    /**
     * Verifica si un error desconocido es recuperable.
     * 
     * Útil para determinar si se puede intentar un fallback sin importar
     * el tipo específico de error.
     * 
     * @param error Error a verificar (puede ser cualquier tipo)
     * @returns true si el error es recuperable, false si no
     * 
     * @example
     * ```typescript
     * try {
     *   await generateWithComfyUI();
     * } catch (error) {
     *   if (VideoGenerationError.isRecoverable(error)) {
     *     return generateWithPexels(); // Fallback
     *   }
     *   throw error; // No recuperable, propagar
     * }
     * ```
     */
    public static isRecoverable(error: unknown): boolean {
        if (error instanceof VideoGenerationError) {
            return error.recoverable;
        }
        
        // Para errores desconocidos, asumimos que no son recuperables
        // a menos que sean errores de red comunes
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            
            // Errores de red típicamente recuperables
            if (message.includes('econnrefused') ||
                message.includes('timeout') ||
                message.includes('network') ||
                message.includes('socket hang up') ||
                message.includes('enotfound')) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Crea un VideoGenerationError a partir de un error desconocido.
     * 
     * Útil para wrapear errores de librerías externas con nuestro
     * sistema de códigos de error.
     * 
     * @param error Error original (puede ser cualquier tipo)
     * @param code Código de error a asignar
     * @param context Contexto adicional opcional
     * @returns Nueva instancia de VideoGenerationError
     * 
     * @example
     * ```typescript
     * try {
     *   await axios.get(pexelsUrl);
     * } catch (error) {
     *   throw VideoGenerationError.fromError(
     *     error,
     *     VideoGenerationErrorCode.PEXELS_API_ERROR,
     *     { url: pexelsUrl, query: searchQuery }
     *   );
     * }
     * ```
     */
    public static fromError(
        error: unknown,
        code: VideoGenerationErrorCode,
        context: Record<string, unknown> = {}
    ): VideoGenerationError {
        // Si ya es un VideoGenerationError, preservar la información original
        if (error instanceof VideoGenerationError) {
            return new VideoGenerationError(
                code,
                error.message,
                error.recoverable,
                { ...error.context, ...context },
                error.cause || error
            );
        }
        
        // Extraer mensaje del error
        let message: string;
        let originalError: Error | undefined;
        
        if (error instanceof Error) {
            message = error.message;
            originalError = error;
        } else if (typeof error === 'string') {
            message = error;
        } else {
            message = String(error);
        }
        
        return new VideoGenerationError(
            code,
            message,
            undefined, // Inferir de RECOVERABLE_ERRORS
            context,
            originalError
        );
    }

    /**
     * Serializa el error a un objeto plano para logging o transmisión.
     * 
     * @returns Objeto con toda la información del error
     */
    public toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            recoverable: this.recoverable,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            cause: this.cause ? {
                name: this.cause.name,
                message: this.cause.message,
                stack: this.cause.stack
            } : undefined,
            stack: this.stack
        };
    }

    /**
     * Genera una representación string detallada del error para logging.
     * 
     * @returns String formateado con toda la información del error
     */
    public toString(): string {
        const parts = [
            `[${this.code}] ${this.message}`,
            `  recoverable: ${this.recoverable}`,
            `  timestamp: ${this.timestamp.toISOString()}`
        ];
        
        if (Object.keys(this.context).length > 0) {
            parts.push(`  context: ${JSON.stringify(this.context)}`);
        }
        
        if (this.cause) {
            parts.push(`  cause: ${this.cause.message}`);
        }
        
        return parts.join('\n');
    }
}

// ============================================================================
// FACTORY FUNCTIONS (Helpers)
// ============================================================================

/**
 * Crea un error de ComfyUI no disponible.
 */
export function createComfyUIUnavailableError(
    url: string,
    details?: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.COMFYUI_UNAVAILABLE,
        details || `ComfyUI server no está respondiendo en ${url}`,
        true,
        { url }
    );
}

/**
 * Crea un error de timeout de ComfyUI.
 */
export function createComfyUITimeoutError(
    timeoutMs: number,
    promptId?: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.COMFYUI_TIMEOUT,
        `Generación excedió el timeout de ${timeoutMs / 1000} segundos`,
        true,
        { timeoutMs, promptId }
    );
}

/**
 * Crea un error de fallo de generación de ComfyUI.
 */
export function createComfyUIGenerationFailedError(
    message: string,
    promptId?: string,
    cause?: Error
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.COMFYUI_GENERATION_FAILED,
        message,
        true,
        { promptId },
        cause
    );
}

/**
 * Crea un error de crash del proceso ComfyUI.
 */
export function createComfyUIProcessCrashError(
    exitCode: number | null
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.COMFYUI_PROCESS_CRASH,
        `Proceso ComfyUI terminó inesperadamente con código ${exitCode}`,
        true,
        { exitCode }
    );
}

/**
 * Crea un error de Pexels API.
 */
export function createPexelsAPIError(
    message: string,
    query?: string,
    cause?: Error
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.PEXELS_API_ERROR,
        message,
        true,
        { query },
        cause
    );
}

/**
 * Crea un error de no resultados en Pexels.
 */
export function createPexelsNoResultsError(
    query: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.PEXELS_NO_RESULTS,
        `No se encontraron videos en Pexels para: "${query}"`,
        true,
        { query }
    );
}

/**
 * Crea un error de pool vacío.
 */
export function createPoolEmptyError(
    category?: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.POOL_EMPTY,
        category 
            ? `No hay clips disponibles en el pool para categoría '${category}'`
            : 'No hay clips disponibles en el pool',
        true,
        { category }
    );
}

/**
 * Crea un error de base de datos de pool.
 */
export function createPoolDatabaseError(
    message: string,
    cause?: Error
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.POOL_DATABASE_ERROR,
        message,
        true,
        {},
        cause
    );
}

/**
 * Crea un error de FFmpeg.
 */
export function createFFmpegError(
    message: string,
    exitCode?: number,
    stderr?: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.FFMPEG_ERROR,
        message,
        false, // FFmpeg errors no son recuperables típicamente
        { exitCode, stderr: stderr?.slice(-500) }
    );
}

/**
 * Crea un error de configuración inválida.
 */
export function createInvalidConfigError(
    message: string,
    configKey?: string
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.INVALID_CONFIG,
        message,
        false, // Errores de config no son recuperables
        { configKey }
    );
}

/**
 * Crea un error de routing.
 */
export function createRoutingError(
    message: string,
    mode?: string,
    cause?: Error
): VideoGenerationError {
    return new VideoGenerationError(
        VideoGenerationErrorCode.ROUTING_ERROR,
        message,
        false,
        { mode },
        cause
    );
}
