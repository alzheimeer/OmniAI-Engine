/**
 * ModelConfig - Configuración de modelos Wan y resoluciones para ComfyUI
 * 
 * Gestiona la configuración de modelos de video IA (Wan 2.2 5B y Wan 2.1 1.3B),
 * resoluciones según tipo de video, y parámetros de estilos visuales.
 * Implementa patrón singleton para acceso global consistente.
 * 
 * Variables de entorno soportadas:
 * - COMFYUI_MODEL: 'wan22_5B' | 'wan21_1_3B' (default: 'wan22_5B')
 * - VIDEO_SOURCE_MODE: 'comfyui' | 'pexels' | 'hybrid' (default: 'hybrid')
 * - COMFYUI_SHORT_RESOLUTION: "WIDTHxHEIGHT" (default: "576x1024")
 * - COMFYUI_LONG_RESOLUTION: "WIDTHxHEIGHT" (default: "832x480")
 * - COMFYUI_DEFAULT_FRAMES: number (default: 49)
 */

import 'dotenv/config';

// ============================================================================
// TIPOS
// ============================================================================

/** Tipos de modelo Wan soportados */
export type WanModelType = 'wan22_5B' | 'wan21_1_3B';

/** Estilos visuales para generación ComfyUI */
export type VisualStyle = 'cinemagraph_plotagraph' | 'moody_lofi_ambient' | 'analog_horror_liminal';

/** Modo de fuente de video */
export type VideoSourceMode = 'comfyui' | 'pexels' | 'hybrid';

/** Tipo de video */
export type VideoType = 'short' | 'long';

// ============================================================================
// INTERFACES
// ============================================================================

/** Configuración de archivos de un modelo */
export interface ModelFiles {
    /** Archivo del modelo UNet */
    unetModel: string;
    /** Archivo del modelo CLIP */
    clipModel: string;
    /** Archivo del modelo VAE */
    vaeModel: string;
}

/** Preset de calidad */
export interface QualityPreset {
    /** Nombre del preset */
    name: string;
    /** Ancho en píxeles */
    width: number;
    /** Alto en píxeles */
    height: number;
    /** Número de frames */
    frames: number;
    /** Pasos de inferencia */
    steps: number;
    /** CFG scale */
    cfg: number;
}

/** Parámetros específicos por estilo visual */
export interface StyleParams {
    /** Número de frames para este estilo */
    frames: number;
    /** Tipo de movimiento característico */
    motionType: 'minimal' | 'atmospheric' | 'slow_unsettling';
    /** Si requiere alta estabilidad (menos movimiento) */
    stabilityHigh: boolean;
    /** Sufijo a añadir al prompt para lograr el estilo */
    promptSuffix: string;
}

/** Resolución de video */
export interface Resolution {
    /** Ancho en píxeles */
    width: number;
    /** Alto en píxeles */
    height: number;
}

/** Configuración completa del modelo */
export interface ModelConfiguration {
    /** Tipo de modelo Wan seleccionado */
    modelType: WanModelType;
    /** Archivos del modelo */
    files: ModelFiles;
    /** Presets de calidad disponibles */
    presets: Record<string, QualityPreset>;
    /** Parámetros por estilo visual */
    styleParams: Record<VisualStyle, StyleParams>;
    /** Resolución para videos cortos (portrait 9:16) */
    shortResolution: Resolution;
    /** Resolución para videos largos (landscape ~16:9) */
    longResolution: Resolution;
    /** Número de frames por defecto */
    defaultFrames: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/** Definición de archivos por modelo */
export const MODEL_FILES: Record<WanModelType, ModelFiles> = {
    wan22_5B: {
        unetModel: 'wan2.2_ti2v_5B_fp16.safetensors',
        clipModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        vaeModel: 'wan2.2_vae.safetensors'
    },
    wan21_1_3B: {
        unetModel: 'wan2.1_t2v_1.3B.safetensors',
        clipModel: 'umt5-xxl-enc-fp8_e4m3fn.safetensors',
        vaeModel: 'Wan2_1_VAE_bf16.safetensors'
    }
};

/** Parámetros por estilo visual */
export const STYLE_PARAMS: Record<VisualStyle, StyleParams> = {
    cinemagraph_plotagraph: {
        frames: 33,
        motionType: 'minimal',
        stabilityHigh: true,
        promptSuffix: 'subtle motion, gentle drift, seamless loop, static camera with minimal motion'
    },
    moody_lofi_ambient: {
        frames: 49,
        motionType: 'atmospheric',
        stabilityHigh: false,
        promptSuffix: 'slow movement, atmospheric drift, lo-fi aesthetic, seamless loop'
    },
    analog_horror_liminal: {
        frames: 49,
        motionType: 'slow_unsettling',
        stabilityHigh: false,
        promptSuffix: 'slow movement, static camera, liminal space, unsettling calm'
    }
};

/** Valores por defecto para resoluciones (Optimizado para RTX 4060: ~4-5 mins por clip) */
const DEFAULT_SHORT_RESOLUTION: Resolution = { width: 288, height: 512 };
const DEFAULT_LONG_RESOLUTION: Resolution = { width: 512, height: 288 };
const DEFAULT_FRAMES = 17;

/** Presets de calidad por defecto para cada modelo */
const DEFAULT_PRESETS: Record<string, QualityPreset> = {
    fast: {
        name: 'fast',
        width: 480,
        height: 288,
        frames: 17,
        steps: 12,
        cfg: 5.0
    },
    balanced: {
        name: 'balanced',
        width: 576,
        height: 320,
        frames: 21,
        steps: 15,
        cfg: 5.0
    },
    quality: {
        name: 'quality',
        width: 672,
        height: 384,
        frames: 25,
        steps: 20,
        cfg: 5.0
    }
};

// ============================================================================
// CLASE MODELCONFIG
// ============================================================================

/**
 * Clase singleton para gestionar la configuración de modelos Wan.
 * Lee configuración desde variables de entorno y valida parámetros.
 */
export class ModelConfig {
    private static instance: ModelConfig | null = null;
    private config!: ModelConfiguration;

    private constructor() {
        // Leer tipo de modelo desde variable de entorno
        const modelTypeEnv = process.env.COMFYUI_MODEL || 'wan21_1_3B';
        
        // Validar que el modelo sea válido
        if (modelTypeEnv !== 'wan22_5B' && modelTypeEnv !== 'wan21_1_3B') {
            throw new Error(
                `[ModelConfig] Valor inválido para COMFYUI_MODEL: '${modelTypeEnv}'. ` +
                `Valores válidos: 'wan22_5B', 'wan21_1_3B'.`
            );
        }
        
        const modelType = modelTypeEnv as WanModelType;
        
        // Inicializar configuración con valores por defecto
        this.config = {
            modelType,
            files: MODEL_FILES[modelType],
            presets: DEFAULT_PRESETS,
            styleParams: STYLE_PARAMS,
            shortResolution: { ...DEFAULT_SHORT_RESOLUTION },
            longResolution: { ...DEFAULT_LONG_RESOLUTION },
            defaultFrames: DEFAULT_FRAMES
        };
        
        // Leer y validar resolución para shorts desde variable de entorno (Requirement 14.7)
        const shortResEnv = process.env.COMFYUI_SHORT_RESOLUTION;
        if (shortResEnv) {
            this.config.shortResolution = this.parseResolution(shortResEnv);
            this.validateResolution(this.config.shortResolution, 'COMFYUI_SHORT_RESOLUTION');
        }
        
        // Leer y validar resolución para videos largos desde variable de entorno (Requirement 14.7)
        const longResEnv = process.env.COMFYUI_LONG_RESOLUTION;
        if (longResEnv) {
            this.config.longResolution = this.parseResolution(longResEnv);
            this.validateResolution(this.config.longResolution, 'COMFYUI_LONG_RESOLUTION');
        }
        
        // Leer número de frames por defecto desde variable de entorno (Requirement 14.9)
        const framesEnv = process.env.COMFYUI_DEFAULT_FRAMES;
        if (framesEnv) {
            const frames = parseInt(framesEnv, 10);
            if (isNaN(frames) || frames < 1) {
                throw new Error(
                    `[ModelConfig] COMFYUI_DEFAULT_FRAMES inválido: '${framesEnv}'. ` +
                    `Debe ser un número entero positivo.`
                );
            }
            this.config.defaultFrames = frames;
        }
        
        // Registrar configuración en log (Requirement 3.6)
        console.log(`[ModelConfig] Modelo configurado: ${modelType}`);
        console.log(`[ModelConfig] Resolución short: ${this.config.shortResolution.width}x${this.config.shortResolution.height}`);
        console.log(`[ModelConfig] Resolución long: ${this.config.longResolution.width}x${this.config.longResolution.height}`);
        console.log(`[ModelConfig] Frames por defecto: ${this.config.defaultFrames}`);
    }

    /**
     * Obtiene la instancia singleton de ModelConfig.
     * @returns Instancia única de ModelConfig
     * @throws Error si la configuración no es válida
     */
    public static getInstance(): ModelConfig {
        if (!ModelConfig.instance) {
            ModelConfig.instance = new ModelConfig();
        }
        return ModelConfig.instance;
    }
    
    /**
     * Resetea la instancia singleton (útil para testing).
     * Solo debe usarse en contexto de pruebas.
     */
    public static resetInstance(): void {
        ModelConfig.instance = null;
    }

    /**
     * Obtiene la configuración completa del modelo.
     * @returns Configuración completa
     */
    public getConfig(): ModelConfiguration {
        return this.config;
    }

    /**
     * Obtiene los archivos del modelo configurado.
     * @returns Archivos del modelo (unet, clip, vae)
     */
    public getModelFiles(): ModelFiles {
        return this.config.files;
    }

    /**
     * Obtiene un preset de calidad por nombre.
     * @param presetName Nombre del preset (fast, balanced, quality)
     * @returns Preset de calidad
     * @throws Error si el preset no existe
     */
    public getPreset(presetName: string): QualityPreset {
        const preset = this.config.presets[presetName];
        if (!preset) {
            throw new Error(
                `[ModelConfig] Preset no encontrado: '${presetName}'. ` +
                `Presets disponibles: ${Object.keys(this.config.presets).join(', ')}`
            );
        }
        return preset;
    }

    /**
     * Obtiene la resolución para un tipo de video.
     * Retorna 576x1024 para short (portrait 9:16), 832x480 para long (landscape ~16:9).
     * @param videoType Tipo de video (short o long)
     * @returns Resolución configurada
     */
    public getResolution(videoType: VideoType): Resolution {
        if (videoType === 'short') {
            return this.config.shortResolution;
        }
        return this.config.longResolution;
    }

    /**
     * Obtiene los parámetros de un estilo visual.
     * @param style Estilo visual
     * @returns Parámetros del estilo (frames, motionType, stabilityHigh, promptSuffix)
     */
    public getStyleParams(style: VisualStyle): StyleParams {
        return this.config.styleParams[style];
    }

    /**
     * Valida que las dimensiones sean múltiplos de 16.
     * Los modelos Wan requieren dimensiones múltiplos de 16 para funcionar correctamente.
     * @param resolution Resolución a validar
     * @param name Nombre descriptivo para mensajes de error
     * @throws Error si las dimensiones no son múltiplos de 16 (Requirement 14.5, 14.8)
     */
    private validateResolution(resolution: Resolution, name: string): void {
        if (resolution.width % 16 !== 0) {
            throw new Error(
                `[ModelConfig] ${name}: ancho ${resolution.width} no es múltiplo de 16. ` +
                `Los modelos Wan requieren dimensiones múltiplos de 16.`
            );
        }
        if (resolution.height % 16 !== 0) {
            throw new Error(
                `[ModelConfig] ${name}: alto ${resolution.height} no es múltiplo de 16. ` +
                `Los modelos Wan requieren dimensiones múltiplos de 16.`
            );
        }
    }

    /**
     * Parsea una resolución desde string "WIDTHxHEIGHT".
     * @param resolutionStr String con formato "WIDTHxHEIGHT" (ejemplo: '576x1024')
     * @returns Resolución parseada con width y height
     * @throws Error si el formato es inválido o los valores no son numéricos
     */
    private parseResolution(resolutionStr: string): Resolution {
        const match = resolutionStr.match(/^(\d+)x(\d+)$/);
        if (!match) {
            throw new Error(
                `[ModelConfig] Formato de resolución inválido: '${resolutionStr}'. ` +
                `Formato esperado: 'WIDTHxHEIGHT' (ejemplo: '576x1024')`
            );
        }
        return {
            width: parseInt(match[1], 10),
            height: parseInt(match[2], 10)
        };
    }

    /**
     * Valida el modo de fuente de video.
     * @param mode Modo a validar (puede ser undefined)
     * @returns Modo validado o 'hybrid' como default
     * @throws Error si el modo es inválido (no es 'comfyui', 'pexels', ni 'hybrid')
     */
    public static validateVideoSourceMode(mode: string | undefined): VideoSourceMode {
        // Si no está definido, retornar default 'hybrid' (Requirement 8.3)
        if (!mode) {
            console.log('[ModelConfig] VIDEO_SOURCE_MODE no definida, usando default: hybrid');
            return 'hybrid';
        }
        
        // Validar que sea uno de los tres valores permitidos (Requirements 8.10, 8.11)
        const validModes: VideoSourceMode[] = ['comfyui', 'pexels', 'hybrid'];
        if (!validModes.includes(mode as VideoSourceMode)) {
            throw new Error(
                `[ModelConfig] Valor inválido para VIDEO_SOURCE_MODE: '${mode}'. ` +
                `Valores permitidos: 'comfyui', 'pexels', 'hybrid'`
            );
        }
        
        return mode as VideoSourceMode;
    }

    /**
     * Obtiene el modo de fuente de video actual desde las variables de entorno.
     * @returns Modo de fuente de video configurado
     */
    public static getVideoSourceMode(): VideoSourceMode {
        return ModelConfig.validateVideoSourceMode(process.env.VIDEO_SOURCE_MODE);
    }
}
