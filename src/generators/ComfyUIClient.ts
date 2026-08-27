/**
 * ComfyUIClient - Cliente para generar videos mediante ComfyUI con modelos Wan 2.2
 * 
 * Reemplaza Pexels API para generación de video de fondo con IA local.
 * Soporta tanto Text-to-Video (T2V) como Image-to-Video (I2V).
 * 
 * Configuración requerida:
 * - ComfyUI ejecutándose en localhost:8188 (con --lowvram para GPUs <12GB)
 * - Modelos configurados dinámicamente según COMFYUI_MODEL en .env
 * 
 * Los modelos soportados se gestionan mediante ModelConfig:
 * - wan22_5B: wan2.2_ti2v_5B_fp16.safetensors, wan2.2_vae.safetensors, umt5_xxl_fp8_e4m3fn_scaled.safetensors
 * - wan21_1_3B: wan2.1_t2v_1.3B.safetensors, Wan2_1_VAE_bf16.safetensors, umt5-xxl-enc-fp8_e4m3fn.safetensors
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { Logger } from '../infrastructure/Logger';
import { 
    ModelConfig, 
    VideoType, 
    VisualStyle, 
    ModelFiles,
    StyleParams 
} from './ModelConfig';

// Logger para ComfyUIClient
const logger = new Logger('ComfyUIClient');

/** Umbral de advertencia para tiempo de generación (10 minutos en ms) */
const GENERATION_WARNING_THRESHOLD_MS = 10 * 60 * 1000;

/** Configuración de generación de video */
export interface VideoGenerationConfig {
    /** Prompt positivo describiendo el video deseado */
    prompt: string;
    /** Prompt negativo (opcional) */
    negativePrompt?: string;
    /** Ancho del video en píxeles (múltiplo de 16, ej: 480, 672, 848) */
    width?: number;
    /** Alto del video en píxeles (múltiplo de 16, ej: 288, 384, 480) */
    height?: number;
    /** Número de frames (múltiplo de 4+1, ej: 17, 33, 49) */
    frames?: number;
    /** Pasos de inferencia (más = mejor calidad, más lento) */
    steps?: number;
    /** CFG scale (típico: 5.0-7.0) */
    cfg?: number;
    /** Semilla para reproducibilidad (-1 = aleatorio) */
    seed?: number;
    /** Imagen de entrada para I2V (path o base64) */
    inputImage?: string;
    /** Orientación del video */
    orientation?: 'portrait' | 'landscape';
    /** FPS del video de salida */
    fps?: number;
    /** Tipo de video para determinar resolución (short=portrait 9:16, long=landscape ~16:9) */
    videoType?: VideoType;
    /** Estilo visual para aplicar parámetros específicos */
    style?: VisualStyle;
    /** Nombre del preset de calidad a usar (fast, balanced, quality) */
    presetName?: string;
}

/** Resultado de generación de video */
export interface VideoGenerationResult {
    /** Ruta al archivo de video generado */
    outputPath: string;
    /** Prompt utilizado */
    prompt: string;
    /** Tiempo de generación en segundos */
    generationTimeSeconds: number;
    /** Dimensiones del video */
    dimensions: { width: number; height: number };
    /** Número de frames generados */
    frames: number;
    /** Modo utilizado (T2V o I2V) */
    mode: 'T2V' | 'I2V';
    /** Si se usó fallback por timeout */
    usedFallback: boolean;
    /** Modelo utilizado para la generación */
    modelUsed: string;
    /** Preset utilizado para la generación */
    presetUsed?: string;
    /** Estilo visual aplicado */
    styleApplied?: VisualStyle;
    /** Tipo de video (short o long) */
    videoType?: VideoType;
}

/** 
 * Presets de calidad optimizados para RTX 4060 8GB con --lowvram
 * 
 * TIEMPOS REALES MEDIDOS (25/08/2026):
 * - fast: 4:30 min (480×288, 17 frames, 12 steps)
 * - balanced: ~10-15 min estimado
 * - quality: ~25-35 min estimado
 */
export const QualityPresets = {
    /** Rápido (~4-5 min): para pruebas y borradores - PROBADO ✅ */
    fast: {
        width: 480,
        height: 288,
        frames: 17,
        steps: 12,
        cfg: 5.0
    },
    /** Balanceado (~10-15 min): buen compromiso calidad/tiempo */
    balanced: {
        width: 576,
        height: 320,
        frames: 21,
        steps: 15,
        cfg: 5.0
    },
    /** Alta calidad (~25-35 min): para producción final */
    quality: {
        width: 672,
        height: 384,
        frames: 25,
        steps: 20,
        cfg: 5.0
    },
    /** Short vertical (~6-8 min): optimizado para TikTok/Reels */
    shortVertical: {
        width: 288,
        height: 480,
        frames: 17,
        steps: 12,
        cfg: 5.0
    },
    /** Long horizontal (~12-18 min): para YouTube landscape */
    longHorizontal: {
        width: 576,
        height: 320,
        frames: 25,
        steps: 15,
        cfg: 5.0
    }
} as const;

export class ComfyUIClient {
    private readonly baseUrl: string;
    private readonly client: AxiosInstance;
    private readonly outputDir: string;
    private readonly localOutputDir: string;
    
    // Configuración del modelo obtenida de ModelConfig
    private readonly modelConfig: ModelConfig;
    private readonly modelFiles: ModelFiles;

    /**
     * Crea una instancia del cliente ComfyUI
     * @param baseUrl URL base de ComfyUI (default: http://127.0.0.1:8188)
     * @param comfyOutputDir Directorio de output de ComfyUI (default: D:\ComfyUI\output)
     * @param localOutputDir Directorio local para copiar videos generados
     */
    constructor(
        baseUrl: string = 'http://127.0.0.1:8188',
        comfyOutputDir: string = 'D:\\ComfyUI\\output',
        localOutputDir: string = path.join(__dirname, '../../content/generated_videos')
    ) {
        this.baseUrl = baseUrl;
        this.outputDir = comfyOutputDir;
        this.localOutputDir = localOutputDir;
        
        // Obtener configuración de modelo desde ModelConfig singleton
        this.modelConfig = ModelConfig.getInstance();
        this.modelFiles = this.modelConfig.getModelFiles();
        
        // Registrar modelo configurado
        const config = this.modelConfig.getConfig();
        logger.info('ComfyUIClient inicializado con modelo', {
            modelType: config.modelType,
            unetModel: this.modelFiles.unetModel,
            clipModel: this.modelFiles.clipModel,
            vaeModel: this.modelFiles.vaeModel
        });
        
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000, // 30s para requests individuales
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Asegurar que el directorio de output local existe
        if (!fs.existsSync(this.localOutputDir)) {
            fs.mkdirSync(this.localOutputDir, { recursive: true });
        }
    }

    /**
     * Verifica si ComfyUI está disponible y funcionando
     */
    public async isAvailable(): Promise<boolean> {
        try {
            const response = await this.client.get('/system_stats');
            return response.status === 200;
        } catch {
            return false;
        }
    }

    /**
     * Obtiene estadísticas del sistema ComfyUI
     */
    public async getSystemStats(): Promise<any> {
        const response = await this.client.get('/system_stats');
        return response.data;
    }

    /**
     * Genera un video usando Text-to-Video (T2V)
     * @param config Configuración de generación
     * @param timeoutMs Timeout máximo en milisegundos (default: 30 min)
     */
    public async generateT2V(
        config: VideoGenerationConfig,
        timeoutMs: number = 30 * 60 * 1000
    ): Promise<VideoGenerationResult> {
        const startTime = Date.now();
        
        // Obtener resolución según VideoType si se especifica
        let baseWidth = config.width;
        let baseHeight = config.height;
        
        if (config.videoType) {
            const resolution = this.modelConfig.getResolution(config.videoType);
            baseWidth = baseWidth ?? resolution.width;
            baseHeight = baseHeight ?? resolution.height;
            
            logger.info('Resolución obtenida de ModelConfig', {
                videoType: config.videoType,
                width: resolution.width,
                height: resolution.height
            });
        }
        
        // Aplicar preset de calidad
        const presetName = config.presetName ?? 'fast';
        let preset;
        try {
            preset = this.modelConfig.getPreset(presetName);
        } catch {
            // Si el preset no existe, usar valores por defecto
            preset = QualityPresets.fast;
            logger.warn(`Preset '${presetName}' no encontrado, usando preset 'fast' por defecto`);
        }
        
        // Configuración inicial
        const finalConfig = {
            width: baseWidth ?? preset.width,
            height: baseHeight ?? preset.height,
            frames: config.frames ?? preset.frames,
            steps: config.steps ?? preset.steps,
            cfg: config.cfg ?? preset.cfg,
            seed: config.seed ?? Math.floor(Math.random() * 1000000),
            fps: config.fps ?? 24,
            prompt: config.prompt,
            negativePrompt: config.negativePrompt ?? 'low quality, blurry, distorted, text, watermark, ugly, deformed'
        };
        
        // Aplicar parámetros de estilo visual si se especifica
        let appliedStyle: VisualStyle | undefined;
        if (config.style) {
            const styledConfig = this.applyStyleParameters(finalConfig, config.style);
            finalConfig.frames = styledConfig.frames;
            finalConfig.prompt = styledConfig.prompt;
            appliedStyle = config.style;
            
            logger.info('Estilo visual aplicado', {
                style: config.style,
                frames: finalConfig.frames
            });
        }

        // Ajustar dimensiones según orientación
        if (config.orientation === 'portrait' && finalConfig.width > finalConfig.height) {
            [finalConfig.width, finalConfig.height] = [finalConfig.height, finalConfig.width];
        } else if (config.orientation === 'landscape' && finalConfig.height > finalConfig.width) {
            [finalConfig.width, finalConfig.height] = [finalConfig.height, finalConfig.width];
        }
        
        // Obtener tipo de modelo para logging
        const modelType = this.modelConfig.getConfig().modelType;

        logger.info('Iniciando generación T2V', {
            prompt: finalConfig.prompt.substring(0, 50) + '...',
            dimensions: `${finalConfig.width}x${finalConfig.height}`,
            frames: finalConfig.frames,
            steps: finalConfig.steps,
            model: modelType,
            preset: presetName,
            style: appliedStyle ?? 'none',
            videoType: config.videoType ?? 'not specified'
        });

        // Construir workflow
        const workflow = this.buildT2VWorkflow(finalConfig);
        
        // Enviar a ComfyUI
        const promptId = await this.queuePrompt(workflow);
        logger.info('Workflow enviado a ComfyUI', { promptId });

        // Esperar resultado con monitoreo de tiempo
        try {
            const outputFiles = await this.waitForCompletionWithMonitoring(promptId, timeoutMs, startTime);
            
            if (outputFiles.length === 0) {
                throw new Error('No se generaron archivos de salida');
            }

            // Copiar archivo a directorio local
            const sourceFile = path.join(this.outputDir, outputFiles[0]);
            const destFile = path.join(this.localOutputDir, `t2v_${Date.now()}_${path.basename(outputFiles[0])}`);
            
            if (fs.existsSync(sourceFile)) {
                fs.copyFileSync(sourceFile, destFile);
            } else {
                throw new Error(`Archivo de salida no encontrado: ${sourceFile}`);
            }

            const generationTime = (Date.now() - startTime) / 1000;
            
            // Registrar tiempo de generación con warning si excede umbral
            this.logGenerationTime(generationTime, finalConfig.prompt);
            
            logger.info('Generación T2V completada', {
                outputPath: destFile,
                generationTimeSeconds: generationTime,
                model: modelType,
                preset: presetName,
                dimensions: `${finalConfig.width}x${finalConfig.height}`
            });

            return {
                outputPath: destFile,
                prompt: finalConfig.prompt,
                generationTimeSeconds: generationTime,
                dimensions: { width: finalConfig.width, height: finalConfig.height },
                frames: finalConfig.frames,
                mode: 'T2V',
                usedFallback: false,
                modelUsed: modelType,
                presetUsed: presetName,
                styleApplied: appliedStyle,
                videoType: config.videoType
            };
        } catch (error: any) {
            logger.error('Error en generación T2V', error);
            throw error;
        }
    }
    
    /**
     * Aplica parámetros específicos según el estilo visual seleccionado
     * @param config Configuración base
     * @param style Estilo visual a aplicar
     * @returns Configuración modificada con parámetros del estilo
     */
    private applyStyleParameters(
        config: { frames: number; prompt: string; [key: string]: any },
        style: VisualStyle
    ): { frames: number; prompt: string } {
        const styleParams: StyleParams = this.modelConfig.getStyleParams(style);
        
        // Aplicar número de frames específico del estilo
        const frames = styleParams.frames;
        
        // Agregar sufijo del estilo al prompt
        const prompt = `${config.prompt}, ${styleParams.promptSuffix}`;
        
        logger.debug('Parámetros de estilo aplicados', {
            style,
            originalFrames: config.frames,
            newFrames: frames,
            motionType: styleParams.motionType,
            stabilityHigh: styleParams.stabilityHigh,
            promptSuffix: styleParams.promptSuffix
        });
        
        return { frames, prompt };
    }
    
    /**
     * Registra el tiempo de generación y emite warning si excede 10 minutos
     * @param generationTimeSeconds Tiempo de generación en segundos
     * @param prompt Prompt utilizado (para contexto en logs)
     */
    private logGenerationTime(generationTimeSeconds: number, prompt: string): void {
        const generationTimeMs = generationTimeSeconds * 1000;
        const formattedTime = this.formatDuration(generationTimeSeconds);
        
        if (generationTimeMs > GENERATION_WARNING_THRESHOLD_MS) {
            logger.warn('Generación de video excedió 10 minutos', {
                generationTimeSeconds,
                formattedTime,
                thresholdMinutes: 10,
                prompt: prompt.substring(0, 50) + '...'
            });
        } else {
            logger.info('Tiempo de generación registrado', {
                generationTimeSeconds,
                formattedTime
            });
        }
    }
    
    /**
     * Formatea duración en segundos a formato legible (Xm Ys)
     * @param seconds Duración en segundos
     * @returns String formateado
     */
    private formatDuration(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
    }
    
    /**
     * Espera a que un prompt se complete con monitoreo de tiempo
     * @param promptId ID del prompt a monitorear
     * @param timeoutMs Timeout máximo
     * @param startTime Tiempo de inicio para calcular progreso
     */
    private async waitForCompletionWithMonitoring(
        promptId: string, 
        timeoutMs: number,
        startTime: number
    ): Promise<string[]> {
        const pollInterval = 5000; // 5 segundos entre checks
        let lastWarningEmitted = 0;

        while (Date.now() - startTime < timeoutMs) {
            // Verificar si debemos emitir warning de 10 minutos
            const elapsedMs = Date.now() - startTime;
            if (elapsedMs > GENERATION_WARNING_THRESHOLD_MS && lastWarningEmitted === 0) {
                const elapsedMinutes = Math.round(elapsedMs / 60000);
                logger.warn('Generación en progreso excede 10 minutos', {
                    promptId,
                    elapsedMinutes,
                    elapsedSeconds: Math.round(elapsedMs / 1000)
                });
                lastWarningEmitted = elapsedMs;
            }

            // Verificar estado de la cola
            const queueResponse = await this.client.get('/queue');
            const queue = queueResponse.data;

            // Verificar si está en running
            const isRunning = queue.queue_running?.some(
                (job: any[]) => job[1] === promptId
            );

            // Verificar si está pendiente
            const isPending = queue.queue_pending?.some(
                (job: any[]) => job[1] === promptId
            );

            if (!isRunning && !isPending) {
                // Verificar historial para obtener outputs
                const historyResponse = await this.client.get(`/history/${promptId}`);
                const history = historyResponse.data;

                if (history[promptId]) {
                    const outputs = history[promptId].outputs;
                    const outputFiles: string[] = [];

                    // Buscar archivos de salida (SaveAnimatedWEBP, etc.)
                    for (const nodeId in outputs) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.gifs) {
                            outputFiles.push(...nodeOutput.gifs.map((g: any) => g.filename));
                        }
                        if (nodeOutput.images) {
                            outputFiles.push(...nodeOutput.images.map((i: any) => i.filename));
                        }
                    }

                    if (outputFiles.length > 0) {
                        return outputFiles;
                    }

                    // Verificar si hubo error
                    if (history[promptId].status?.status_str === 'error') {
                        throw new Error(`ComfyUI error: ${JSON.stringify(history[promptId].status)}`);
                    }
                }
            }

            // Log de progreso
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.debug(`Esperando generación... ${elapsed}s transcurridos`, {
                promptId,
                isRunning,
                isPending
            });

            // Esperar antes del siguiente poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Timeout esperando generación (${timeoutMs / 1000}s)`);
    }

    /**
     * Genera un video usando Image-to-Video (I2V) - requiere imagen de entrada
     * 
     * NOTA: El nodo Wan22ImageToVideoLatent en ComfyUI 0.34.0 tiene una API 
     * diferente a la documentada. Se requiere configuración adicional o 
     * custom nodes (ComfyUI-WanVideoWrapper) para I2V funcional.
     * 
     * RECOMENDACIÓN: Usar generateT2V() que está probado y funciona.
     * 
     * @param config Configuración de generación (debe incluir inputImage)
     * @param timeoutMs Timeout máximo en milisegundos
     */
    public async generateI2V(
        config: VideoGenerationConfig,
        timeoutMs: number = 30 * 60 * 1000
    ): Promise<VideoGenerationResult> {
        if (!config.inputImage) {
            throw new Error('I2V requiere una imagen de entrada (inputImage)');
        }

        const startTime = Date.now();
        
        // Obtener resolución según VideoType si se especifica
        let baseWidth = config.width;
        let baseHeight = config.height;
        
        if (config.videoType) {
            const resolution = this.modelConfig.getResolution(config.videoType);
            baseWidth = baseWidth ?? resolution.width;
            baseHeight = baseHeight ?? resolution.height;
            
            logger.info('Resolución obtenida de ModelConfig para I2V', {
                videoType: config.videoType,
                width: resolution.width,
                height: resolution.height
            });
        }
        
        // Para I2V usamos preset balanceado ya que la imagen guía reduce la necesidad de pasos
        const presetName = config.presetName ?? 'balanced';
        let preset;
        try {
            preset = this.modelConfig.getPreset(presetName);
        } catch {
            preset = QualityPresets.balanced;
            logger.warn(`Preset '${presetName}' no encontrado, usando preset 'balanced' por defecto para I2V`);
        }
        
        const finalConfig = {
            width: baseWidth ?? preset.width,
            height: baseHeight ?? preset.height,
            frames: config.frames ?? preset.frames,
            steps: config.steps ?? 15, // Menos pasos necesarios para I2V
            cfg: config.cfg ?? preset.cfg,
            seed: config.seed ?? Math.floor(Math.random() * 1000000),
            fps: config.fps ?? 24,
            prompt: config.prompt,
            negativePrompt: config.negativePrompt ?? 'low quality, blurry, distorted, text, watermark',
            inputImage: config.inputImage
        };
        
        // Aplicar parámetros de estilo visual si se especifica
        let appliedStyle: VisualStyle | undefined;
        if (config.style) {
            const styledConfig = this.applyStyleParameters(finalConfig, config.style);
            finalConfig.frames = styledConfig.frames;
            finalConfig.prompt = styledConfig.prompt;
            appliedStyle = config.style;
            
            logger.info('Estilo visual aplicado para I2V', {
                style: config.style,
                frames: finalConfig.frames
            });
        }
        
        // Obtener tipo de modelo para logging
        const modelType = this.modelConfig.getConfig().modelType;

        logger.info('Iniciando generación I2V', {
            prompt: finalConfig.prompt.substring(0, 50) + '...',
            dimensions: `${finalConfig.width}x${finalConfig.height}`,
            frames: finalConfig.frames,
            inputImage: finalConfig.inputImage.substring(0, 50) + '...',
            model: modelType,
            preset: presetName,
            style: appliedStyle ?? 'none'
        });

        // Obtener dimensiones de la imagen para I2V
        const { imageSize } = require('image-size');
        const imgDimensions = imageSize(fs.readFileSync(finalConfig.inputImage));
        const imgWidth = imgDimensions.width;
        const imgHeight = imgDimensions.height;
        logger.info('Dimensiones de imagen para I2V', { imgWidth, imgHeight });

        // Subir imagen primero
        const uploadedImageName = await this.uploadImage(finalConfig.inputImage);
        
        // Construir workflow I2V
        const workflow = this.buildI2VWorkflow({...finalConfig, width: imgWidth, height: imgHeight, frames: 5}, uploadedImageName);
        
        // Enviar a ComfyUI
        const promptId = await this.queuePrompt(workflow);
        logger.info('Workflow I2V enviado a ComfyUI', { promptId });

        // Esperar resultado con monitoreo
        const outputFiles = await this.waitForCompletionWithMonitoring(promptId, timeoutMs, startTime);
        
        if (outputFiles.length === 0) {
            throw new Error('No se generaron archivos de salida');
        }

        // Copiar archivo a directorio local
        const sourceFile = path.join(this.outputDir, outputFiles[0]);
        const destFile = path.join(this.localOutputDir, `i2v_${Date.now()}_${path.basename(outputFiles[0])}`);
        
        fs.copyFileSync(sourceFile, destFile);

        const generationTime = (Date.now() - startTime) / 1000;
        
        // Registrar tiempo de generación con warning si excede umbral
        this.logGenerationTime(generationTime, finalConfig.prompt);
        
        logger.info('Generación I2V completada', {
            outputPath: destFile,
            generationTimeSeconds: generationTime,
            model: modelType,
            preset: presetName,
            dimensions: `${finalConfig.width}x${finalConfig.height}`
        });

        return {
            outputPath: destFile,
            prompt: finalConfig.prompt,
            generationTimeSeconds: generationTime,
            dimensions: { width: finalConfig.width, height: finalConfig.height },
            frames: finalConfig.frames,
            mode: 'I2V',
            usedFallback: false,
            modelUsed: modelType,
            presetUsed: presetName,
            styleApplied: appliedStyle,
            videoType: config.videoType
        };
    }

    /**
     * Construye el workflow JSON para Text-to-Video
     */
    private buildT2VWorkflow(config: {
        prompt: string;
        negativePrompt: string;
        width: number;
        height: number;
        frames: number;
        steps: number;
        cfg: number;
        seed: number;
        fps: number;
    }): Record<string, any> {
        const timestamp = Date.now();
        
        // Usar archivos de modelo desde ModelConfig
        const { unetModel, clipModel, vaeModel } = this.modelFiles;
        
        return {
            "1": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": unetModel,
                    "weight_dtype": "default"
                }
            },
            "2": {
                "class_type": "CLIPLoader",
                "inputs": {
                    "clip_name": clipModel,
                    "type": "umt5"
                }
            },
            "3": {
                "class_type": "VAELoader",
                "inputs": {
                    "vae_name": vaeModel
                }
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "clip": ["2", 0],
                    "text": config.prompt
                }
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "clip": ["2", 0],
                    "text": config.negativePrompt
                }
            },
            "6": {
                "class_type": "WanImageToVideo",
                "inputs": {
                    "positive": ["4", 0],
                    "negative": ["5", 0],
                    "vae": ["3", 0],
                    "width": config.width,
                    "height": config.height,
                    "length": config.frames,
                    "batch_size": 1
                }
            },
            "7": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],
                    "positive": ["6", 0],
                    "negative": ["6", 1],
                    "latent_image": ["6", 2],
                    "seed": config.seed,
                    "steps": config.steps,
                    "cfg": config.cfg,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0
                }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["7", 0],
                    "vae": ["3", 0]
                }
            },
            "9": {
                "class_type": "SaveAnimatedWEBP",
                "inputs": {
                    "images": ["8", 0],
                    "filename_prefix": `t2v_${timestamp}`,
                    "fps": config.fps,
                    "lossless": false,
                    "quality": 85,
                    "method": "default"
                }
            }
        };
    }

    /**
     * Construye el workflow JSON para Image-to-Video usando WanVideoWrapper
     * 
     * Usa nodos de ComfyUI-WanVideoWrapper en vez de nodos nativos ya que
     * los nativos no soportan I2V correctamente (error: unexpected keyword argument 'image')
     */
    private buildI2VWorkflow(config: {
        prompt: string;
        negativePrompt: string;
        width: number;
        height: number;
        frames: number;
        steps: number;
        cfg: number;
        seed: number;
        fps: number;
    }, uploadedImageName: string): Record<string, any> {
        const timestamp = Date.now();
        
        // Modelos especificos para I2V con WanVideoWrapper
        const i2vModel = 'wan2.2_ti2v_5B_fp16.safetensors';
        const vaeModel = 'wan2.2_vae.safetensors';
        const t5Model = 'umt5-xxl-enc-fp8_e4m3fn.safetensors';
        
        return {
            '1': {
                'class_type': 'LoadWanVideoT5TextEncoder',
                'inputs': {
                    'model_name': t5Model,
                    'precision': 'bf16',
                    'load_device': 'offload_device',
                    'quantization': 'disabled'
                }
            },
            '2': {
                'class_type': 'WanVideoVAELoader',
                'inputs': {
                    'model_name': vaeModel,
                    'precision': 'bf16'
                }
            },
            '3': {
                'class_type': 'WanVideoModelLoader',
                'inputs': {
                    'model': i2vModel,
                    'base_precision': 'fp16',
                    'quantization': 'disabled',
                    'load_device': 'offload_device',
                    'attention_mode': 'sdpa'
                }
            },
            '4': {
                'class_type': 'LoadImage',
                'inputs': {
                    'image': uploadedImageName
                }
            },
            '5': {
                'class_type': 'WanVideoEncode',
                'inputs': {
                    'vae': ['2', 0],
                    'image': ['4', 0],
                    'enable_vae_tiling': true,
                    'tile_x': 272,
                    'tile_y': 272,
                    'tile_stride_x': 144,
                    'tile_stride_y': 128
                }
            },
            '6': {
                'class_type': 'WanVideoEmptyEmbeds',
                'inputs': {
                    'extra_latents': ['5', 0],
                    'width': config.width,
                    'height': config.height,
                    'num_frames': config.frames
                }
            },
            '7': {
                'class_type': 'WanVideoTextEncode',
                'inputs': {
                    't5': ['1', 0],
                    'model_to_offload': ['3', 0],
                    'positive_prompt': config.prompt,
                    'negative_prompt': config.negativePrompt,
                    'force_offload': true,
                    'device': 'gpu'
                }
            },
            '8': {
                'class_type': 'WanVideoSampler',
                'inputs': {
                    'model': ['3', 0],
                    'image_embeds': ['6', 0],
                    'text_embeds': ['7', 0],
                    'steps': config.steps,
                    'cfg': config.cfg,
                    'shift': 8,
                    'seed': config.seed,
                    'force_offload': true,
                    'scheduler': 'unipc',
                    'riflex_freq_index': 0
                }
            },
            '9': {
                'class_type': 'WanVideoDecode',
                'inputs': {
                    'vae': ['2', 0],
                    'samples': ['8', 0],
                    'enable_vae_tiling': true,
                    'tile_x': 272,
                    'tile_y': 272,
                    'tile_stride_x': 144,
                    'tile_stride_y': 128
                }
            },
            '10': {
                'class_type': 'SaveAnimatedWEBP',
                'inputs': {
                    'images': ['9', 0],
                    'filename_prefix': `i2v_${timestamp}`,
                    'fps': config.fps,
                    'lossless': false,
                    'quality': 85,
                    'method': 'default'
                }
            }
        };
    }
    /**
     * Sube una imagen a ComfyUI para usar en I2V
     */
    private async uploadImage(imagePath: string): Promise<string> {
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        
        // Leer imagen como buffer
        const imageBuffer = fs.readFileSync(imagePath);
        const filename = path.basename(imagePath);
        
        formData.append('image', imageBuffer, {
            filename,
            contentType: 'image/png'
        });

        const response = await this.client.post('/upload/image', formData, {
            headers: formData.getHeaders()
        });

        return response.data.name;
    }

    /**
     * Envía un workflow a la cola de ComfyUI
     */
    private async queuePrompt(workflow: Record<string, any>): Promise<string> {
        const response = await this.client.post('/prompt', {
            prompt: workflow,
            client_id: `omniai_${Date.now()}`
        });

        return response.data.prompt_id;
    }

    /**
     * Cancela todos los jobs en cola
     */
    public async clearQueue(): Promise<void> {
        await this.client.post('/queue', { clear: true });
        logger.info('Cola de ComfyUI limpiada');
    }

    /**
     * Interrumpe el job actual
     */
    public async interrupt(): Promise<void> {
        await this.client.post('/interrupt');
        logger.info('Job actual interrumpido');
    }

    /**
     * Obtiene información del estado actual de la cola
     */
    public async getQueueStatus(): Promise<{ running: number; pending: number }> {
        const response = await this.client.get('/queue');
        return {
            running: response.data.queue_running?.length ?? 0,
            pending: response.data.queue_pending?.length ?? 0
        };
    }
}

export default ComfyUIClient;
