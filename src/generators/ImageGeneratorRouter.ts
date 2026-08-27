/**
 * ImageGeneratorRouter - Orquestador de generación de imágenes para I2V
 * 
 * Estrategia:
 * 1. Pollinations.ai (default) - API gratuita, modelo Flux completo, 0 VRAM
 * 2. ComfyUI Flux Schnell (fallback) - Local, quantizado Q4, usa ~4GB VRAM
 * 
 * La razón de esta prioridad:
 * - Pollinations usa Flux completo (mejor calidad)
 * - No consume VRAM local (crítico para I2V que usa ~5-6GB)
 * - Si falla la API externa, ComfyUI local garantiza funcionamiento
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../infrastructure/Logger';
import { PollinationsClient, PollinationsImageResult } from './PollinationsClient';

const logger = new Logger('ImageGeneratorRouter');

export type ImageSource = 'pollinations' | 'comfyui_flux' | 'synthetic';

export interface ImageGenerationConfig {
    /** Prompt descriptivo de la imagen */
    prompt: string;
    /** Orientación del video destino */
    orientation: 'portrait' | 'landscape';
    /** Forzar fuente específica (opcional, default usa cascada) */
    forceSource?: ImageSource;
    /** Timeout para Pollinations en ms (default: 90000) */
    pollinationsTimeout?: number;
    width?: number;
    height?: number;
}

export interface ImageGenerationResult {
    /** Ruta al archivo de imagen generada */
    imagePath: string;
    /** Fuente que generó la imagen */
    source: ImageSource;
    /** Tiempo de generación en ms */
    generationTimeMs: number;
    /** Dimensiones de la imagen */
    dimensions: { width: number; height: number };
    /** Prompt usado */
    prompt: string;
}

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

/**
 * Dimensiones optimizadas para I2V según orientación
 */
const DIMENSIONS = {
    portrait: { width: 576, height: 1024 },   // 9:16 para Shorts
    landscape: { width: 832, height: 480 }    // ~16:9 para videos largos
};

/**
 * Router inteligente para generación de imágenes
 */
export class ImageGeneratorRouter {
    private pollinationsClient: PollinationsClient;
    private outputDir: string;

    constructor(outputDir?: string) {
        this.pollinationsClient = new PollinationsClient();
        this.outputDir = outputDir || path.join(process.cwd(), 'content', 'generated_images');
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Genera una imagen usando la cascada de fallback:
     * 1. Pollinations.ai (default)
     * 2. ComfyUI Flux Schnell (fallback)
     * 3. Sintético (último recurso)
     */
    public async generateImage(config: ImageGenerationConfig): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        const dims = { width: config.width ?? DIMENSIONS[config.orientation].width, height: config.height ?? DIMENSIONS[config.orientation].height };
        
        logger.info('Iniciando generación de imagen para I2V', {
            prompt: config.prompt.substring(0, 50) + '...',
            orientation: config.orientation,
            forceSource: config.forceSource
        });

        // Si se fuerza una fuente específica
        if (config.forceSource) {
            return this.generateWithSource(config, config.forceSource, dims);
        }

        // Cascada de fallback
        try {
            // 1. Intentar Pollinations.ai (default)
            return await this.generateWithPollinations(config, dims);
        } catch (pollinationsError: any) {
            logger.warn('Pollinations falló, intentando ComfyUI Flux', { 
                error: pollinationsError.message 
            });
            
            try {
                // 2. Fallback a ComfyUI Flux Schnell local
                return await this.generateWithComfyUIFlux(config, dims);
            } catch (comfyError: any) {
                logger.warn('ComfyUI Flux falló, generando imagen sintética', {
                    error: comfyError.message
                });
                
                // 3. Último recurso: imagen sintética
                return await this.generateSynthetic(config, dims);
            }
        }
    }

    private async generateWithSource(
        config: ImageGenerationConfig, 
        source: ImageSource,
        dims: { width: number; height: number }
    ): Promise<ImageGenerationResult> {
        switch (source) {
            case 'pollinations':
                return this.generateWithPollinations(config, dims);
            case 'comfyui_flux':
                return this.generateWithComfyUIFlux(config, dims);
            case 'synthetic':
                return this.generateSynthetic(config, dims);
            default:
                throw new Error(`Fuente desconocida: ${source}`);
        }
    }

    /**
     * Genera imagen con Pollinations.ai (Flux remoto, calidad completa)
     */
    private async generateWithPollinations(
        config: ImageGenerationConfig,
        dims: { width: number; height: number }
    ): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        
        logger.info('Generando imagen con Pollinations.ai (Flux remoto)');
        
        const result = await this.pollinationsClient.generateImage({
            prompt: this.enhancePromptForI2V(config.prompt),
            model: 'flux',
            width: dims.width,
            height: dims.height,
            enhance: true
        });
        
        const generationTimeMs = Date.now() - startTime;
        
        logger.info('Imagen generada con Pollinations', {
            path: result.outputPath,
            timeMs: generationTimeMs
        });

        return {
            imagePath: result.outputPath,
            source: 'pollinations',
            generationTimeMs,
            dimensions: dims,
            prompt: config.prompt
        };
    }

    /**
     * Genera imagen con ComfyUI Flux Schnell Q4 (local, fallback)
     */
    private async generateWithComfyUIFlux(
        config: ImageGenerationConfig,
        dims: { width: number; height: number }
    ): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        
        logger.info('Generando imagen con ComfyUI Flux Schnell (local)');

        // Verificar disponibilidad de ComfyUI
        try {
            await axios.get(`${COMFYUI_URL}/system_stats`, { timeout: 5000 });
        } catch {
            throw new Error('ComfyUI no está disponible');
        }

        // Workflow para Flux Schnell
        const workflow: Record<string, any> = {
            '1': {
                class_type: 'UnetLoaderGGUF',
                inputs: {
                    unet_name: 'flux1-schnell-Q4_K_S.gguf'
                }
            },
            '2': {
                class_type: 'DualCLIPLoaderGGUF',
                inputs: {
                    clip_name1: 'clip_l.safetensors',
                    clip_name2: 't5-v1_1-xxl-encoder-Q4_K_S.gguf',
                    type: 'flux'
                }
            },
            '3': {
                class_type: 'VAELoader',
                inputs: {
                    vae_name: 'ae.safetensors'
                }
            },
            '4': {
                class_type: 'CLIPTextEncode',
                inputs: {
                    clip: ['2', 0],
                    text: this.enhancePromptForI2V(config.prompt)
                }
            },
            '5': {
                class_type: 'EmptyLatentImage',
                inputs: {
                    width: dims.width,
                    height: dims.height,
                    batch_size: 1
                }
            },
            '6': {
                class_type: 'KSampler',
                inputs: {
                    model: ['1', 0],
                    positive: ['4', 0],
                    negative: ['4', 0],  // Flux Schnell no usa negative
                    latent_image: ['5', 0],
                    seed: Math.floor(Math.random() * 1000000),
                    steps: 4,  // Schnell es rápido con pocos pasos
                    cfg: 1.0,  // Flux usa CFG bajo
                    sampler_name: 'euler',
                    scheduler: 'simple',
                    denoise: 1.0
                }
            },
            '7': {
                class_type: 'VAEDecode',
                inputs: {
                    samples: ['6', 0],
                    vae: ['3', 0]
                }
            },
            '8': {
                class_type: 'SaveImage',
                inputs: {
                    images: ['7', 0],
                    filename_prefix: 'flux_i2v_' + Date.now()
                }
            }
        };

        const clientId = 'omniai_flux_' + Date.now();
        const queueRes = await axios.post(`${COMFYUI_URL}/prompt`, {
            prompt: workflow,
            client_id: clientId
        });

        const promptId = queueRes.data.prompt_id;
        
        // Esperar a que termine la generación
        const imagePath = await this.waitForComfyUIImage(promptId, 'flux_i2v_');
        
        const generationTimeMs = Date.now() - startTime;
        
        logger.info('Imagen generada con ComfyUI Flux', {
            path: imagePath,
            timeMs: generationTimeMs
        });

        return {
            imagePath,
            source: 'comfyui_flux',
            generationTimeMs,
            dimensions: dims,
            prompt: config.prompt
        };
    }

    /**
     * Genera una imagen sintética como último recurso
     */
    private async generateSynthetic(
        config: ImageGenerationConfig,
        dims: { width: number; height: number }
    ): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        
        logger.warn('Generando imagen sintética (fallback de emergencia)');

        // Crear imagen de gradiente simple usando FFmpeg
        const timestamp = Date.now();
        const outputPath = path.join(this.outputDir, `synthetic_${timestamp}.png`);
        
        const { execSync } = require('child_process');
        
        // Gradiente basado en el prompt (extraemos colores temáticos)
        const colors = this.extractColorsFromPrompt(config.prompt);
        
        execSync(
            `ffmpeg -y -f lavfi -i "gradients=size=${dims.width}x${dims.height}:c0=${colors[0]}:c1=${colors[1]}:duration=1:speed=0.5" -frames:v 1 "${outputPath}"`,
            { stdio: 'pipe' }
        );

        const generationTimeMs = Date.now() - startTime;
        
        return {
            imagePath: outputPath,
            source: 'synthetic',
            generationTimeMs,
            dimensions: dims,
            prompt: config.prompt
        };
    }

    /**
     * Mejora el prompt para que funcione mejor con I2V
     */
    private enhancePromptForI2V(prompt: string): string {
        // Agregar keywords que ayudan a generar imágenes estáticas cinematográficas
        const enhancements = [
            'cinematic still frame',
            'high detail',
            'professional photography',
            'perfect for video animation',
            '4k quality'
        ];
        
        return `${prompt}, ${enhancements.join(', ')}`;
    }

    /**
     * Extrae colores temáticos del prompt para imagen sintética
     */
    private extractColorsFromPrompt(prompt: string): [string, string] {
        const lower = prompt.toLowerCase();
        
        if (lower.includes('sunset') || lower.includes('golden')) {
            return ['#FF6B35', '#1A1A2E'];
        } else if (lower.includes('forest') || lower.includes('nature')) {
            return ['#2D5A27', '#0D1B2A'];
        } else if (lower.includes('ocean') || lower.includes('water')) {
            return ['#006994', '#0D1B2A'];
        } else if (lower.includes('tech') || lower.includes('ai') || lower.includes('digital')) {
            return ['#00D4FF', '#1A1A2E'];
        } else if (lower.includes('space') || lower.includes('night')) {
            return ['#16213E', '#0F0F0F'];
        }
        
        // Default: gradiente azul/púrpura (neurodivergente friendly)
        return ['#667EEA', '#764BA2'];
    }

    /**
     * Espera a que ComfyUI termine de generar la imagen
     */
    private async waitForComfyUIImage(promptId: string, filenamePrefix: string): Promise<string> {
        const maxWaitMs = 120000; // 2 minutos máximo
        const pollIntervalMs = 2000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            // Verificar si el prompt terminó
            const historyRes = await axios.get(`${COMFYUI_URL}/history/${promptId}`);
            const history = historyRes.data[promptId];
            
            if (history && history.outputs) {
                // Buscar la imagen generada
                for (const nodeId of Object.keys(history.outputs)) {
                    const output = history.outputs[nodeId];
                    if (output.images && output.images.length > 0) {
                        const imageInfo = output.images[0];
                        const imagePath = path.join(
                            'D:', 'ComfyUI', 'output',
                            imageInfo.subfolder || '',
                            imageInfo.filename
                        );
                        
                        // Copiar a nuestro directorio
                        const localPath = path.join(this.outputDir, imageInfo.filename);
                        fs.copyFileSync(imagePath, localPath);
                        return localPath;
                    }
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }

        throw new Error(`Timeout esperando imagen de ComfyUI (promptId: ${promptId})`);
    }

    /**
     * Verifica qué fuentes están disponibles
     */
    public async checkAvailability(): Promise<{ pollinations: boolean; comfyui_flux: boolean }> {
        const results = { pollinations: false, comfyui_flux: false };

        // Check Pollinations
        try {
            results.pollinations = await this.pollinationsClient.isAvailable();
        } catch {
            results.pollinations = false;
        }

        // Check ComfyUI Flux
        try {
            const res = await axios.get(`${COMFYUI_URL}/system_stats`, { timeout: 5000 });
            results.comfyui_flux = res.status === 200;
        } catch {
            results.comfyui_flux = false;
        }

        return results;
    }
}

export default ImageGeneratorRouter;
