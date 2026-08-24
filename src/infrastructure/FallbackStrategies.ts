/**
 * FallbackStrategies.ts
 * 
 * Estrategias de fallback específicas por componente para cuando los reintentos
 * del RetryHandler se agoten. Permite que el pipeline continúe aunque degradado.
 * 
 * REQ-4.4.3: Crear fallbacks específicos por componente
 * 
 * Componentes cubiertos:
 * - DeepSeek: Fallback a script cached o template genérico
 * - Google TTS: Fallback a audio silencioso o voz alternativa
 * - Pexels: Fallback a video sintético con FFmpeg
 * - YouTube: Fallback a cola de publicación diferida (guardar localmente)
 */

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Logger, LogMeta } from './Logger';
import { RetryError } from './RetryHandler';

// Configurar FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ===== TIPOS E INTERFACES =====

/**
 * Resultado de un fallback ejecutado.
 */
export interface FallbackResult<T> {
    /** Resultado del fallback (puede ser degradado) */
    result: T;
    
    /** Si se usó fallback (true) o resultado original (false) */
    usedFallback: boolean;
    
    /** Tipo de fallback aplicado */
    fallbackType: string;
    
    /** Mensaje descriptivo del fallback */
    message: string;
}

/**
 * Interfaz para scripts de video.
 */
export interface VideoScript {
    title: string;
    description: string;
    tags: string[];
    hook?: string;
    spokenText: string;
    visualPrompts: string[];
    chapters?: { time: string; title: string }[];
}

/**
 * Metadata para publicación diferida de YouTube.
 */
export interface DeferredPublishData {
    videoFileName: string;
    metadata: {
        title: string;
        description: string;
        tags: string[];
        privacyStatus?: 'public' | 'private' | 'unlisted';
        isShort?: boolean;
        visualPrompt?: string;
    };
    channelKey: 'channel1' | 'channel2';
    scheduledTime?: Date;
    createdAt: Date;
    retryCount: number;
    lastError: string;
}

// ===== CONSTANTES =====

const CONTENT_DIR = path.join(__dirname, '../../content');
const DEFERRED_QUEUE_DIR = path.join(CONTENT_DIR, 'deferred-queue');
const FALLBACK_CACHE_DIR = path.join(CONTENT_DIR, 'fallback-cache');

/**
 * Templates genéricos de script por idioma para fallback de DeepSeek.
 */
const GENERIC_SCRIPT_TEMPLATES: Record<string, VideoScript> = {
    Spanish: {
        title: 'Descubre el Poder de la IA para Mentes Neurodivergentes',
        description: 'Exploramos cómo la inteligencia artificial puede transformar la vida de personas neurodivergentes. #Neurodiversidad #IA #Autismo',
        tags: ['neurodiversidad', 'inteligencia artificial', 'autismo', 'TDAH', 'tecnología', 'inclusión'],
        hook: '¿Sabías que la IA puede cambiar completamente la forma en que las personas neurodivergentes interactúan con el mundo?',
        spokenText: '¿Sabías que la IA puede cambiar completamente la forma en que las personas neurodivergentes interactúan con el mundo? La inteligencia artificial está revolucionando las herramientas de apoyo cognitivo. Desde asistentes de organización hasta aplicaciones de comunicación, la tecnología se adapta a las necesidades únicas de cada persona. Lo más increíble es que estas herramientas aprenden y evolucionan contigo. El futuro de la neurodiversidad es brillante gracias a la IA.',
        visualPrompts: ['technology brain', 'ai interface', 'person using tablet', 'futuristic technology']
    },
    English: {
        title: 'Discover the Power of AI for Neurodivergent Minds',
        description: 'Exploring how artificial intelligence can transform life for neurodivergent people. #Neurodiversity #AI #Autism',
        tags: ['neurodiversity', 'artificial intelligence', 'autism', 'ADHD', 'technology', 'inclusion'],
        hook: 'Did you know AI can completely change how neurodivergent people interact with the world?',
        spokenText: 'Did you know AI can completely change how neurodivergent people interact with the world? Artificial intelligence is revolutionizing cognitive support tools. From organization assistants to communication apps, technology adapts to each person\'s unique needs. The most amazing part is that these tools learn and evolve with you. The future of neurodiversity is bright thanks to AI.',
        visualPrompts: ['technology brain', 'ai interface', 'person using tablet', 'futuristic technology']
    },
    Portuguese: {
        title: 'Descubra o Poder da IA para Mentes Neurodivergentes',
        description: 'Exploramos como a inteligência artificial pode transformar a vida de pessoas neurodivergentes. #Neurodiversidade #IA #Autismo',
        tags: ['neurodiversidade', 'inteligência artificial', 'autismo', 'TDAH', 'tecnologia', 'inclusão'],
        hook: 'Você sabia que a IA pode mudar completamente a forma como pessoas neurodivergentes interagem com o mundo?',
        spokenText: 'Você sabia que a IA pode mudar completamente a forma como pessoas neurodivergentes interagem com o mundo? A inteligência artificial está revolucionando as ferramentas de apoio cognitivo. De assistentes de organização a aplicativos de comunicação, a tecnologia se adapta às necessidades únicas de cada pessoa. O mais incrível é que essas ferramentas aprendem e evoluem com você. O futuro da neurodiversidade é brilhante graças à IA.',
        visualPrompts: ['technology brain', 'ai interface', 'person using tablet', 'futuristic technology']
    }
};

// ===== CLASE PRINCIPAL =====

/**
 * FallbackStrategies - Estrategias de fallback por componente.
 * 
 * Proporciona métodos estáticos para manejar fallos definitivos de APIs externas
 * cuando los reintentos del RetryHandler se agotan.
 */
export class FallbackStrategies {
    private static logger = new Logger('FallbackStrategies');

    // ===== INICIALIZACIÓN =====

    /**
     * Inicializa los directorios necesarios para fallbacks.
     */
    public static initialize(): void {
        // Crear directorio de cola diferida si no existe
        if (!fs.existsSync(DEFERRED_QUEUE_DIR)) {
            fs.mkdirSync(DEFERRED_QUEUE_DIR, { recursive: true });
            this.logger.info('Directorio de cola diferida creado', { path: DEFERRED_QUEUE_DIR });
        }

        // Crear directorio de caché de fallbacks si no existe
        if (!fs.existsSync(FALLBACK_CACHE_DIR)) {
            fs.mkdirSync(FALLBACK_CACHE_DIR, { recursive: true });
            this.logger.info('Directorio de caché de fallbacks creado', { path: FALLBACK_CACHE_DIR });
        }
    }

    // ===== FALLBACK DEEPSEEK (Script Generation) =====

    /**
     * Fallback para cuando DeepSeek API falla definitivamente.
     * Intenta: 1) Script cacheado reciente, 2) Template genérico por idioma.
     * 
     * @param topic Tema del video
     * @param language Idioma del script
     * @param error Error original que causó el fallback
     * @returns Script de fallback (cacheado o genérico)
     */
    public static async deepSeekFallback(
        topic: string,
        language: string = 'Spanish',
        error?: RetryError
    ): Promise<FallbackResult<VideoScript>> {
        const meta: LogMeta = { topic, language, errorMessage: error?.message };
        
        this.logger.warn('DeepSeek API falló definitivamente, activando fallback', meta);

        // Intentar obtener script cacheado reciente
        const cachedScript = await this.getCachedScript(topic, language);
        if (cachedScript) {
            this.logger.info('Fallback DeepSeek: Usando script cacheado', meta);
            return {
                result: cachedScript,
                usedFallback: true,
                fallbackType: 'cached-script',
                message: `Script cacheado usado para tema "${topic}" en ${language}`
            };
        }

        // Usar template genérico por idioma
        const langKey = this.normalizeLanguage(language);
        const template = GENERIC_SCRIPT_TEMPLATES[langKey] || GENERIC_SCRIPT_TEMPLATES['Spanish'];
        
        // Personalizar ligeramente el template con el tema
        const personalizedScript: VideoScript = {
            ...template,
            title: template.title.includes(topic) ? template.title : `${topic} - ${template.title}`,
            description: `${topic}: ${template.description}`,
            tags: [...template.tags, ...topic.toLowerCase().split(' ').filter(t => t.length > 3)]
        };

        this.logger.info('Fallback DeepSeek: Usando template genérico', { 
            ...meta, 
            fallbackType: 'generic-template' 
        });

        return {
            result: personalizedScript,
            usedFallback: true,
            fallbackType: 'generic-template',
            message: `Template genérico usado para ${language} (DeepSeek no disponible)`
        };
    }

    /**
     * Guarda un script en caché para uso futuro como fallback.
     */
    public static async cacheScript(
        topic: string,
        language: string,
        script: VideoScript
    ): Promise<void> {
        this.initialize();
        
        const cacheKey = this.generateCacheKey(topic, language);
        const cachePath = path.join(FALLBACK_CACHE_DIR, `script-${cacheKey}.json`);
        
        const cacheData = {
            topic,
            language,
            script,
            cachedAt: new Date().toISOString()
        };

        fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
        this.logger.debug('Script cacheado para fallback futuro', { topic, language, cachePath });
    }

    /**
     * Obtiene un script cacheado si existe y no ha expirado (7 días).
     */
    private static async getCachedScript(
        topic: string,
        language: string
    ): Promise<VideoScript | null> {
        this.initialize();
        
        const cacheKey = this.generateCacheKey(topic, language);
        const cachePath = path.join(FALLBACK_CACHE_DIR, `script-${cacheKey}.json`);

        if (!fs.existsSync(cachePath)) {
            return null;
        }

        try {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            const cachedAt = new Date(cacheData.cachedAt);
            const now = new Date();
            const daysDiff = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);

            // Cache válido por 7 días
            if (daysDiff <= 7) {
                return cacheData.script;
            }

            this.logger.debug('Script cacheado expirado', { topic, language, daysDiff });
            return null;
        } catch (err) {
            this.logger.debug('Error leyendo script cacheado', { topic, language, error: (err as Error).message });
            return null;
        }
    }

    // ===== FALLBACK GOOGLE TTS (Audio Generation) =====

    /**
     * Fallback para cuando Google TTS API falla definitivamente.
     * Genera un archivo de audio silencioso de la duración estimada.
     * 
     * @param text Texto que se iba a sintetizar
     * @param outputFilename Nombre del archivo de salida
     * @param language Idioma (para estimar duración)
     * @param error Error original que causó el fallback
     * @returns Ruta al archivo de audio silencioso
     */
    public static async googleTTSFallback(
        text: string,
        outputFilename: string,
        language: string = 'Spanish',
        error?: RetryError
    ): Promise<FallbackResult<string>> {
        const meta: LogMeta = { 
            outputFilename, 
            language, 
            textLength: text.length,
            errorMessage: error?.message 
        };
        
        this.logger.warn('Google TTS API falló definitivamente, generando audio silencioso', meta);

        // Estimar duración basada en longitud del texto (aprox 150 palabras/minuto)
        const wordCount = text.split(/\s+/).length;
        const estimatedDurationSeconds = Math.max(10, Math.ceil((wordCount / 150) * 60));
        
        const outputPath = path.join(CONTENT_DIR, outputFilename);

        try {
            await this.generateSilentAudio(outputPath, estimatedDurationSeconds);

            this.logger.info('Fallback Google TTS: Audio silencioso generado', {
                ...meta,
                duration: estimatedDurationSeconds,
                outputPath
            });

            return {
                result: outputPath,
                usedFallback: true,
                fallbackType: 'silent-audio',
                message: `Audio silencioso de ${estimatedDurationSeconds}s generado (Google TTS no disponible)`
            };
        } catch (ffmpegError) {
            this.logger.error('Error generando audio silencioso de fallback', ffmpegError as Error, meta);
            throw ffmpegError;
        }
    }

    /**
     * Genera un archivo de audio silencioso usando FFmpeg.
     */
    private static async generateSilentAudio(
        outputPath: string,
        durationSeconds: number
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input('anullsrc=r=44100:cl=stereo')
                .inputFormat('lavfi')
                .duration(durationSeconds)
                .audioCodec('libmp3lame')
                .audioBitrate('128k')
                .outputOptions(['-q:a', '2'])
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err));
        });
    }

    // ===== FALLBACK PEXELS (Video Stock) =====

    /**
     * Fallback para cuando Pexels API falla definitivamente.
     * Genera un video sintético con fondo de color sólido.
     * 
     * @param visualPrompt Prompt visual original
     * @param outputPath Ruta de salida del video temporal
     * @param orientation Orientación del video ('portrait' | 'landscape')
     * @param durationSeconds Duración del video en segundos
     * @param error Error original que causó el fallback
     * @returns Ruta al video sintético generado
     */
    public static async pexelsFallback(
        visualPrompt: string,
        outputPath: string,
        orientation: 'portrait' | 'landscape' = 'portrait',
        durationSeconds: number = 60,
        error?: RetryError
    ): Promise<FallbackResult<string>> {
        const meta: LogMeta = {
            visualPrompt,
            outputPath,
            orientation,
            durationSeconds,
            errorMessage: error?.message
        };

        this.logger.warn('Pexels API falló definitivamente, generando video sintético', meta);

        // Dimensiones según orientación
        const dimensions = orientation === 'portrait' 
            ? { width: 1080, height: 1920 }
            : { width: 1920, height: 1080 };

        // Colores de fondo variados para no ser repetitivos
        const backgroundColors = [
            '0x0f172a', // Azul oscuro
            '0x1e293b', // Gris azulado
            '0x18181b', // Negro suave
            '0x1f2937', // Gris oscuro
            '0x0c4a6e', // Azul profundo
            '0x064e3b', // Verde oscuro
            '0x4c1d95'  // Púrpura oscuro
        ];
        const randomColor = backgroundColors[Math.floor(Math.random() * backgroundColors.length)];

        try {
            await this.generateSyntheticVideo(
                outputPath,
                dimensions.width,
                dimensions.height,
                durationSeconds,
                randomColor
            );

            this.logger.info('Fallback Pexels: Video sintético generado', {
                ...meta,
                backgroundColor: randomColor,
                dimensions
            });

            return {
                result: outputPath,
                usedFallback: true,
                fallbackType: 'synthetic-video',
                message: `Video sintético ${dimensions.width}x${dimensions.height} generado (Pexels no disponible)`
            };
        } catch (ffmpegError) {
            this.logger.error('Error generando video sintético de fallback', ffmpegError as Error, meta);
            throw ffmpegError;
        }
    }

    /**
     * Genera un video sintético con fondo de color sólido usando FFmpeg.
     */
    private static async generateSyntheticVideo(
        outputPath: string,
        width: number,
        height: number,
        durationSeconds: number,
        backgroundColor: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(`color=c=${backgroundColor}:s=${width}x${height}:r=30:d=${durationSeconds}`)
                .inputFormat('lavfi')
                .outputOptions([
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-pix_fmt', 'yuv420p'
                ])
                .save(outputPath)
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err));
        });
    }

    // ===== FALLBACK YOUTUBE (Publishing) =====

    /**
     * Fallback para cuando YouTube API falla definitivamente.
     * Guarda la metadata y archivo para publicación diferida.
     * 
     * @param videoFileName Nombre del archivo de video
     * @param metadata Metadata del video
     * @param channelKey Canal de destino
     * @param error Error original que causó el fallback
     * @returns Información de la publicación diferida
     */
    public static async youtubeFallback(
        videoFileName: string,
        metadata: {
            title: string;
            description: string;
            tags: string[];
            privacyStatus?: 'public' | 'private' | 'unlisted';
            isShort?: boolean;
            visualPrompt?: string;
        },
        channelKey: 'channel1' | 'channel2' = 'channel1',
        error?: RetryError
    ): Promise<FallbackResult<DeferredPublishData>> {
        const logMeta: LogMeta = {
            videoFileName,
            title: metadata.title,
            channelKey,
            errorMessage: error?.message
        };

        this.logger.warn('YouTube API falló definitivamente, guardando para publicación diferida', logMeta);

        // Inicializar directorios si no existen
        this.initialize();

        // Crear datos de publicación diferida
        const deferredData: DeferredPublishData = {
            videoFileName,
            metadata,
            channelKey,
            scheduledTime: new Date(Date.now() + 60 * 60 * 1000), // +1 hora por defecto
            createdAt: new Date(),
            retryCount: 0,
            lastError: error?.message || 'YouTube API unavailable'
        };

        // Generar nombre único para el archivo de cola
        const queueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const queueFilePath = path.join(DEFERRED_QUEUE_DIR, `deferred-${queueId}.json`);

        // Guardar en la cola diferida
        fs.writeFileSync(queueFilePath, JSON.stringify(deferredData, null, 2));

        this.logger.info('Fallback YouTube: Publicación diferida guardada', {
            ...logMeta,
            queueFilePath,
            scheduledTime: deferredData.scheduledTime
        });

        return {
            result: deferredData,
            usedFallback: true,
            fallbackType: 'deferred-publish',
            message: `Video guardado para publicación diferida: ${queueFilePath}`
        };
    }

    /**
     * Obtiene todas las publicaciones diferidas pendientes.
     */
    public static async getDeferredPublications(): Promise<DeferredPublishData[]> {
        this.initialize();

        const files = fs.readdirSync(DEFERRED_QUEUE_DIR)
            .filter(f => f.startsWith('deferred-') && f.endsWith('.json'));

        const deferred: DeferredPublishData[] = [];

        for (const file of files) {
            try {
                const filePath = path.join(DEFERRED_QUEUE_DIR, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                deferred.push(data);
            } catch (err) {
                this.logger.warn('Error leyendo archivo de cola diferida', { file, error: (err as Error).message });
            }
        }

        return deferred;
    }

    /**
     * Elimina una publicación diferida después de éxito.
     */
    public static async removeDeferredPublication(videoFileName: string): Promise<boolean> {
        this.initialize();
        
        const files = fs.readdirSync(DEFERRED_QUEUE_DIR)
            .filter(f => f.startsWith('deferred-') && f.endsWith('.json'));

        for (const file of files) {
            try {
                const filePath = path.join(DEFERRED_QUEUE_DIR, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                
                if (data.videoFileName === videoFileName) {
                    fs.unlinkSync(filePath);
                    this.logger.info('Publicación diferida eliminada exitosamente', { videoFileName, file });
                    return true;
                }
            } catch (err) {
                this.logger.warn('Error procesando archivo de cola diferida', { file, error: (err as Error).message });
            }
        }

        return false;
    }

    /**
     * Incrementa el contador de reintentos de una publicación diferida.
     */
    public static async incrementDeferredRetryCount(
        videoFileName: string,
        newError: string
    ): Promise<void> {
        this.initialize();
        
        const files = fs.readdirSync(DEFERRED_QUEUE_DIR)
            .filter(f => f.startsWith('deferred-') && f.endsWith('.json'));

        for (const file of files) {
            try {
                const filePath = path.join(DEFERRED_QUEUE_DIR, file);
                const data: DeferredPublishData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                
                if (data.videoFileName === videoFileName) {
                    data.retryCount += 1;
                    data.lastError = newError;
                    data.scheduledTime = new Date(Date.now() + data.retryCount * 30 * 60 * 1000); // Backoff: 30min * retryCount
                    
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    this.logger.info('Contador de reintentos incrementado', { 
                        videoFileName, 
                        newRetryCount: data.retryCount,
                        nextScheduledTime: data.scheduledTime
                    });
                    return;
                }
            } catch (err) {
                this.logger.warn('Error actualizando archivo de cola diferida', { file, error: (err as Error).message });
            }
        }
    }

    // ===== UTILIDADES =====

    /**
     * Normaliza el nombre del idioma para acceder al template correcto.
     */
    private static normalizeLanguage(language: string): string {
        const normalized = language.toLowerCase().trim();
        
        if (normalized.includes('spanish') || normalized.includes('español') || normalized === 'es') {
            return 'Spanish';
        }
        if (normalized.includes('english') || normalized.includes('inglés') || normalized === 'en') {
            return 'English';
        }
        if (normalized.includes('portuguese') || normalized.includes('portugués') || normalized === 'pt') {
            return 'Portuguese';
        }
        
        return 'Spanish'; // Default
    }

    /**
     * Genera una clave de caché basada en tema e idioma.
     */
    private static generateCacheKey(topic: string, language: string): string {
        const normalized = `${topic.toLowerCase().replace(/\s+/g, '-')}_${this.normalizeLanguage(language).toLowerCase()}`;
        // Limitar longitud y sanitizar
        return normalized.replace(/[^a-z0-9-_]/g, '').substring(0, 100);
    }

    /**
     * Wrapper genérico para ejecutar operación con fallback.
     * Útil para encapsular la lógica de try-catch con fallback.
     * 
     * @param operation Operación principal a ejecutar
     * @param fallbackFn Función de fallback si la operación falla
     * @param operationName Nombre para logging
     */
    public static async executeWithFallback<T>(
        operation: () => Promise<T>,
        fallbackFn: (error: Error) => Promise<FallbackResult<T>>,
        operationName: string
    ): Promise<FallbackResult<T>> {
        try {
            const result = await operation();
            return {
                result,
                usedFallback: false,
                fallbackType: 'none',
                message: `${operationName} completado exitosamente`
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.warn(`${operationName} falló, ejecutando fallback`, { 
                error: err.message,
                isRetryError: error instanceof RetryError
            });
            
            return fallbackFn(err);
        }
    }
}

// ===== EXPORTACIONES =====

export default FallbackStrategies;
