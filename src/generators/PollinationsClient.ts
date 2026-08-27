/**
 * PollinationsClient - Cliente para generación de imágenes gratuitas con Pollinations.ai
 * 
 * Pollinations.ai es una API 100% gratuita, sin API key, sin límites de uso.
 * Se usa como fallback cuando ComfyUI no está disponible, o para generar
 * imágenes de referencia que luego se animarán con ComfyUI I2V.
 * 
 * Características:
 * - Sin autenticación requerida
 * - Modelos disponibles: flux, turbo, stable-diffusion
 * - Soporta text-to-image y image-to-image (con modelo kontext)
 * 
 * @see https://github.com/pollinations/pollinations/blob/master/APIDOCS.md
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../infrastructure/Logger';

// Logger para PollinationsClient
const logger = new Logger('PollinationsClient');

/**
 * Modelos disponibles en Pollinations.ai para generación de imágenes
 */
export type PollinationsModel = 'flux' | 'turbo' | 'stable-diffusion' | 'kontext';

/**
 * Configuración para generación de imagen
 */
export interface PollinationsImageConfig {
    /** Prompt descriptivo para la imagen */
    prompt: string;
    /** Modelo a usar (default: flux) */
    model?: PollinationsModel;
    /** Ancho en píxeles (default: 1024) */
    width?: number;
    /** Alto en píxeles (default: 1024) */
    height?: number;
    /** Semilla para reproducibilidad (opcional) */
    seed?: number;
    /** Si mejorar el prompt con IA (default: false) */
    enhance?: boolean;
    /** Imagen de entrada para image-to-image (solo con modelo kontext) */
    inputImageUrl?: string;
}

/**
 * Resultado de generación de imagen
 */
export interface PollinationsImageResult {
    /** Ruta al archivo de imagen generada */
    outputPath: string;
    /** Prompt usado */
    prompt: string;
    /** Modelo usado */
    model: PollinationsModel;
    /** Tiempo de generación en ms */
    generationTimeMs: number;
    /** Dimensiones de la imagen */
    dimensions: { width: number; height: number };
    /** URL original de la imagen (antes de descargar) */
    imageUrl: string;
}

/**
 * Cliente para Pollinations.ai - API gratuita de generación de imágenes
 */
export class PollinationsClient {
    private readonly baseUrl = 'https://image.pollinations.ai';
    private readonly outputDir: string;

    /**
     * Crea una instancia del cliente Pollinations
     * @param outputDir Directorio donde guardar las imágenes generadas
     */
    constructor(outputDir?: string) {
        this.outputDir = outputDir || path.join(process.cwd(), 'content', 'pollinations_images');
        
        // Asegurar que el directorio existe
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            logger.info('Directorio de salida creado', { outputDir: this.outputDir });
        }
    }

    /**
     * Verifica si Pollinations.ai está disponible
     */
    public async isAvailable(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/models`, { timeout: 10000 });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    /**
     * Obtiene la lista de modelos disponibles
     */
    public async getModels(): Promise<string[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/models`, { timeout: 10000 });
            return response.data;
        } catch (error: any) {
            logger.warn('Error obteniendo modelos de Pollinations', { error: error.message });
            return ['flux', 'turbo', 'stable-diffusion'];
        }
    }

    /**
     * Genera una imagen usando Pollinations.ai
     * 
     * @param config Configuración de generación
     * @returns Resultado con path a la imagen generada
     */
    public async generateImage(config: PollinationsImageConfig): Promise<PollinationsImageResult> {
        const startTime = Date.now();
        
        // Configuración por defecto
        const model = config.model || 'flux';
        const width = config.width || 1024;
        const height = config.height || 1024;
        
        logger.info('Iniciando generación de imagen con Pollinations', {
            prompt: config.prompt.substring(0, 50) + '...',
            model,
            dimensions: `${width}x${height}`
        });

        // Construir URL
        const encodedPrompt = encodeURIComponent(config.prompt);
        let url = `${this.baseUrl}/prompt/${encodedPrompt}`;
        
        // Agregar parámetros
        const params = new URLSearchParams();
        params.append('model', model);
        params.append('width', width.toString());
        params.append('height', height.toString());
        if (config.seed !== undefined) params.append('seed', config.seed.toString());
        if (config.enhance) params.append('enhance', 'true');
        
        // Para image-to-image (modelo kontext)
        if (config.inputImageUrl && model === 'kontext') {
            params.append('image', config.inputImageUrl);
        }
        
        url += '?' + params.toString();

        try {
            // Descargar imagen
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 120000, // 2 minutos timeout
                headers: {
                    'User-Agent': 'OmniAI-Engine/1.0'
                }
            });

            // Guardar archivo
            const timestamp = Date.now();
            const filename = `pollinations_${model}_${timestamp}.png`;
            const outputPath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(outputPath, response.data);

            const generationTimeMs = Date.now() - startTime;
            
            logger.info('Imagen generada con Pollinations', {
                outputPath,
                generationTimeMs,
                model,
                dimensions: `${width}x${height}`
            });

            return {
                outputPath,
                prompt: config.prompt,
                model,
                generationTimeMs,
                dimensions: { width, height },
                imageUrl: url
            };

        } catch (error: any) {
            logger.error('Error generando imagen con Pollinations', error);
            throw new Error(`Pollinations error: ${error.message}`);
        }
    }

    /**
     * Genera una imagen optimizada para usarse como input de Image-to-Video (I2V)
     * 
     * @param prompt Descripción de la escena
     * @param orientation Orientación del video destino
     * @returns Resultado con path a la imagen
     */
    public async generateForI2V(
        prompt: string, 
        orientation: 'portrait' | 'landscape' = 'portrait'
    ): Promise<PollinationsImageResult> {
        // Dimensiones optimizadas para I2V
        const dimensions = orientation === 'portrait' 
            ? { width: 576, height: 1024 }   // 9:16 vertical (shorts)
            : { width: 832, height: 480 };   // ~16:9 horizontal (long videos)
        
        // Mejorar prompt para I2V
        const enhancedPrompt = `${prompt}, cinematic still frame, high detail, professional photography, perfect for video animation`;
        
        return this.generateImage({
            prompt: enhancedPrompt,
            model: 'flux', // Flux produce mejores resultados para I2V
            width: dimensions.width,
            height: dimensions.height,
            enhance: true
        });
    }

    /**
     * Genera múltiples imágenes en paralelo
     * 
     * @param prompts Array de prompts
     * @param options Opciones comunes para todas las imágenes
     * @returns Array de resultados
     */
    public async generateBatch(
        prompts: string[],
        options?: Partial<PollinationsImageConfig>
    ): Promise<PollinationsImageResult[]> {
        const results: PollinationsImageResult[] = [];
        
        // Generar en lotes de 3 para no sobrecargar
        const batchSize = 3;
        for (let i = 0; i < prompts.length; i += batchSize) {
            const batch = prompts.slice(i, i + batchSize);
            const batchPromises = batch.map(prompt => 
                this.generateImage({ prompt, ...options })
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    logger.warn('Error en generación de batch', { error: result.reason });
                }
            }
            
            // Pequeña pausa entre batches
            if (i + batchSize < prompts.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return results;
    }

    /**
     * Obtiene el directorio de salida configurado
     */
    public getOutputDirectory(): string {
        return this.outputDir;
    }
}

export default PollinationsClient;
