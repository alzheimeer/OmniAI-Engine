import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import dotenv from 'dotenv';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { SubtitleGenerator } from './SubtitleGenerator';
import { ThumbnailGenerator } from './ThumbnailGenerator';
import { FallbackStrategies } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';
// Importaciones para integración con VideoSourceRouter (Requirement 6.1, 6.2)
import { VideoSourceRouter, VideoGenerationRequest, VideoGenerationResult, VideoSourceRouterConfig } from './VideoSourceRouter';
import { ComfyPrompt } from './ScriptGenerator';
import { ModelConfig, VideoSourceMode } from './ModelConfig';
import { ComfyUIClient } from './ComfyUIClient';
import { ComfyUIHealthMonitor } from './ComfyUIHealthMonitor';

dotenv.config();

// Set the path to the ffmpeg binary from the installer package
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Instancia de RetryHandler preconfigurada para Pexels API
const pexelsRetry = RetryHandler.forAPI('Pexels');

// Logger para VideoRenderer
const logger = new Logger('VideoRenderer');

// ============================================================================
// CACHE DE VIDEOS USADOS (Requirement 6.5)
// ============================================================================

/**
 * Cache en memoria para evitar repeticiones de clips en sesiones cercanas.
 * Almacena IDs de clips usados con timestamp de último uso.
 * @see Requirement 6.5
 */
interface UsedVideoEntry {
    /** Timestamp de último uso */
    usedAt: number;
    /** Tipo de video donde se usó */
    videoType: 'short' | 'long';
    /** Fuente del video */
    source: 'comfyui' | 'pexels' | 'pool' | 'synthetic';
}

/** Cache en memoria de videos usados en la sesión actual */
const sessionUsedVideosCache = new Map<string, UsedVideoEntry>();

/** Duración máxima del cache en memoria (1 hora) */
const SESSION_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Registra un video como usado en la sesión actual.
 * @param clipId Identificador único del clip (puede ser filepath o ID de DB)
 * @param videoType Tipo de video (short o long)
 * @param source Fuente del video
 */
function markVideoAsUsedInSession(clipId: string, videoType: 'short' | 'long', source: 'comfyui' | 'pexels' | 'pool' | 'synthetic'): void {
    sessionUsedVideosCache.set(clipId, {
        usedAt: Date.now(),
        videoType,
        source
    });
    logger.debug('Video marcado como usado en sesión', { clipId, videoType, source });
}

/**
 * Verifica si un video fue usado recientemente en la sesión.
 * @param clipId Identificador del clip
 * @returns true si fue usado en el TTL de la sesión
 */
function wasVideoUsedRecently(clipId: string): boolean {
    const entry = sessionUsedVideosCache.get(clipId);
    if (!entry) return false;
    
    const age = Date.now() - entry.usedAt;
    if (age > SESSION_CACHE_TTL_MS) {
        // Limpiar entrada expirada
        sessionUsedVideosCache.delete(clipId);
        return false;
    }
    return true;
}

/**
 * Limpia entradas expiradas del cache de sesión.
 */
function cleanupSessionCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [clipId, entry] of sessionUsedVideosCache.entries()) {
        if (now - entry.usedAt > SESSION_CACHE_TTL_MS) {
            sessionUsedVideosCache.delete(clipId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger.debug('Cache de sesión limpiado', { entriesRemoved: cleaned });
    }
}

// ============================================================================
// SINGLETON DE VIDEOSOURCEROUTER
// ============================================================================

/** Instancia singleton de VideoSourceRouter para reutilización */
let videoSourceRouterInstance: VideoSourceRouter | null = null;

/**
 * Obtiene o crea la instancia singleton de VideoSourceRouter.
 * Configura el router según las variables de entorno.
 * @returns Instancia de VideoSourceRouter configurada
 */
function getVideoSourceRouter(): VideoSourceRouter {
    if (videoSourceRouterInstance) {
        return videoSourceRouterInstance;
    }
    
    // Obtener modo de fuente de video desde variables de entorno
    const mode = ModelConfig.getVideoSourceMode();
    
    // Preparar configuración del router
    const config: VideoSourceRouterConfig = {
        mode,
        pexelsApiKey: process.env.PEXELS_API_KEY,
        outputDirectory: path.join(__dirname, '../../content/generated_videos')
    };
    
    // Inicializar ComfyUIClient solo si el modo lo requiere
    if (mode === 'comfyui' || mode === 'hybrid') {
        try {
            const comfyClient = new ComfyUIClient();
            config.comfyClient = comfyClient;
            
            // Inicializar health monitor para ComfyUI
            const healthMonitor = new ComfyUIHealthMonitor({
                comfyUrl: process.env.COMFYUI_URL || 'http://127.0.0.1:8188'
            });
            healthMonitor.start();
            config.healthMonitor = healthMonitor;
            
            logger.info('ComfyUIClient y HealthMonitor inicializados para VideoSourceRouter', { mode });
        } catch (error: any) {
            logger.warn('No se pudo inicializar ComfyUIClient, se usará solo Pexels', { error: error.message });
        }
    }
    
    videoSourceRouterInstance = new VideoSourceRouter(config);
    logger.info('VideoSourceRouter singleton creado', { mode });
    
    return videoSourceRouterInstance;
}

export class VideoRenderer {
    private static readonly DEFAULT_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    };

    private static readonly PEXELS_USED_VIDEOS_CACHE = path.join(__dirname, '../../content/cache/used_pexels_videos.json');

    private static loadUsedVideos(): number[] {
        try {
            if (fs.existsSync(this.PEXELS_USED_VIDEOS_CACHE)) {
                return JSON.parse(fs.readFileSync(this.PEXELS_USED_VIDEOS_CACHE, 'utf-8'));
            }
        } catch (e: any) {
            logger.warn('Error loading used pexels videos cache', { error: e.message });
        }
        return [];
    }

    private static saveUsedVideo(id: number) {
        const MAX_HISTORY = 100;
        const used = this.loadUsedVideos();
        const index = used.indexOf(id);
        if (index > -1) {
            used.splice(index, 1);
        }
        used.push(id);
        if (used.length > MAX_HISTORY) {
            used.shift(); // remove oldest
        }
        try {
            const dir = path.dirname(this.PEXELS_USED_VIDEOS_CACHE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.PEXELS_USED_VIDEOS_CACHE, JSON.stringify(used));
        } catch (e: any) {
            logger.warn('Error saving used pexels videos cache', { error: e.message });
        }
    }

    private static getUnusedVideo(videos: any[]): any {
        if (!videos || videos.length === 0) return null;
        const used = this.loadUsedVideos();
        
        const unusedVideos = videos.filter(v => !used.includes(v.id));
        
        if (unusedVideos.length > 0) {
            this.saveUsedVideo(unusedVideos[0].id);
            logger.info('Seleccionando video Pexels no utilizado', { videoId: unusedVideos[0].id });
            return unusedVideos[0];
        }
        
        let oldestVideo = videos[0];
        let oldestIndex = used.length;
        
        for (const v of videos) {
            const idx = used.indexOf(v.id);
            if (idx > -1 && idx < oldestIndex) {
                oldestIndex = idx;
                oldestVideo = v;
            }
        }
        
        this.saveUsedVideo(oldestVideo.id);
        logger.warn('Todos los videos fueron utilizados, reciclando el más antiguo', { videoId: oldestVideo.id });
        return oldestVideo;
    }

    /**
     * Renders a YouTube Short video with background clips and audio.
     * Uses VideoSourceRouter to select video source according to configured mode.
     * 
     * @param visualPrompts Array of search terms for Pexels (1-3 words each)
     * @param audioFilename The name of the audio file in the content folder
     * @param outputFilename The name of the final video file to produce
     * @param text The spoken text for subtitle generation
     * @param comfyPrompts Optional array of detailed prompts for ComfyUI (20-50 words each)
     * @param videoId Optional unique identifier for tracking usage
     * @returns Path to the final rendered video file
     * @see Requirements: 6.1, 6.2, 6.5
     */
    public static async renderVideo(
        visualPrompts: string[], 
        audioFilename: string, 
        outputFilename: string, 
        text: string,
        comfyPrompts?: ComfyPrompt[],
        videoId?: string
    ): Promise<string> {
        // Generar videoId si no se proporciona (para tracking)
        const trackingVideoId = videoId || `short_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        logger.info(`Iniciando render de video corto`, { 
            promptsCount: visualPrompts.length, 
            hasComfyPrompts: !!comfyPrompts,
            videoId: trackingVideoId 
        });
        
        // Limpiar cache de sesión periódicamente
        cleanupSessionCache();
        
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const headers = {
            ...VideoRenderer.DEFAULT_HEADERS,
            'Authorization': apiKey
        };

        const audioPath = path.join(__dirname, '../../content', audioFilename);
        const outputPath = path.join(__dirname, '../../content', outputFilename);
        
        // 1. Generar Subtítulos (ASS Dinámicos)
        const assFilename = outputFilename.replace('.mp4', '.ass');
        await SubtitleGenerator.generateASS(audioPath, text, assFilename);
        const assPath = path.join(__dirname, '../../content', assFilename);

        // 2. Obtener clips de video usando VideoSourceRouter o Pexels según modo
        const downloadedVideos: string[] = [];
        const promptsToUse = visualPrompts ? visualPrompts.slice(0, 3) : [];
        if (promptsToUse.length === 0) promptsToUse.push('technology');
        while (promptsToUse.length < 3) promptsToUse.push(promptsToUse[0]); // asegurar 3 clips

        // Obtener el modo de video configurado
        const videoMode = ModelConfig.getVideoSourceMode();
        const useRouter = videoMode === 'comfyui' || videoMode === 'hybrid';
        
        logger.info('Modo de fuente de video para Short', { mode: videoMode, useRouter });

        for (let i = 0; i < promptsToUse.length; i++) {
            const prompt = promptsToUse[i];
            const normVideoPath = path.join(__dirname, '../../content', `short_scene_norm_${i}.mp4`);
            
            try {
                let clipPath: string | null = null;
                let sourceUsed: 'comfyui' | 'pexels' | 'pool' | 'synthetic' = 'pexels';
                
                // Intentar usar VideoSourceRouter si está habilitado (Requirement 6.2)
                if (useRouter) {
                    try {
                        const router = getVideoSourceRouter();
                        
                        // Construir request para el router
                        const request: VideoGenerationRequest = {
                            visualPrompt: prompt,
                            comfyPrompt: comfyPrompts?.[i]?.prompt,
                            style: comfyPrompts?.[i]?.style,
                            videoType: 'short',
                            videoId: trackingVideoId,
                            segmentIndex: i,
                            totalSegments: promptsToUse.length,
                            durationSeconds: 20 // Duración aproximada de un Short
                        };
                        
                        logger.debug(`Generando clip ${i + 1} con VideoSourceRouter`, { 
                            visualPrompt: prompt,
                            hasComfyPrompt: !!request.comfyPrompt,
                            style: request.style
                        });
                        
                        const result = await router.generateVideo(request);
                        clipPath = result.outputPath;
                        sourceUsed = result.sourceUsed;
                        
                        // Registrar en cache de sesión (Requirement 6.5)
                        const clipId = result.metadata.clipId || result.outputPath;
                        markVideoAsUsedInSession(clipId, 'short', sourceUsed);
                        
                        logger.info(`Clip ${i + 1} generado con ${sourceUsed}`, {
                            outputPath: clipPath,
                            generationTimeMs: result.generationTimeMs
                        });
                        
                    } catch (routerError: any) {
                        logger.warn(`VideoSourceRouter falló para clip ${i + 1}, usando Pexels como fallback`, {
                            error: routerError.message
                        });
                        // Continuar con Pexels como fallback
                    }
                }
                
                // Fallback a Pexels si router no generó el clip
                if (!clipPath) {
                    const tempVideoPath = path.join(__dirname, '../../content', `short_scene_${i}.mp4`);
                    
                    let response = await pexelsRetry.execute(
                        () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&orientation=portrait&per_page=15`, { headers }),
                        `Pexels search short scene ${i + 1}`
                    );

                    if (!response.data.videos || response.data.videos.length === 0) {
                        response = await pexelsRetry.execute(
                            () => axios.get(`https://api.pexels.com/videos/search?query=technology&orientation=portrait&per_page=15`, { headers }),
                            `Pexels fallback search short scene ${i + 1}`
                        );
                    }

                    if (response.data.videos && response.data.videos.length > 0) {
                        const videoData = this.getUnusedVideo(response.data.videos);
                        if (!videoData) throw new Error('No Pexels video found');
                        const videoFile = videoData.video_files.find((v: any) => v.height >= 1080) || videoData.video_files[0];
                        const writer = fs.createWriteStream(tempVideoPath);
                        const downloadResponse = await pexelsRetry.execute(
                            () => axios({ url: videoFile.link, method: 'GET', responseType: 'stream', headers: { 'User-Agent': VideoRenderer.DEFAULT_HEADERS['User-Agent'] } }),
                            `Pexels download short scene ${i + 1}`
                        );
                        downloadResponse.data.pipe(writer);
                        await new Promise((resolve, reject) => { writer.on('finish', () => resolve(true)); writer.on('error', reject); });
                        
                        clipPath = tempVideoPath;
                        sourceUsed = 'pexels';
                        
                        // Registrar en cache de sesión
                        markVideoAsUsedInSession(`pexels_${videoData.id}`, 'short', 'pexels');
                    }
                }
                
                if (!clipPath) {
                    throw new Error(`No se pudo obtener clip para escena ${i + 1}`);
                }
                
                // Normalizar el clip (aplicar efectos visuales y ajustar formato)
                await new Promise((resolve, reject) => {
                    ffmpeg()
                        .input(clipPath!)
                        .outputOptions(['-c:v libx264', '-preset ultrafast', '-r 30', '-s 1080x1920', '-t 15', '-pix_fmt yuv420p'])
                        .save(normVideoPath)
                        .on('end', resolve)
                        .on('error', reject);
                });
                downloadedVideos.push(normVideoPath);
                
                // Limpiar archivo temporal si no es el normalizado
                if (clipPath !== normVideoPath && fs.existsSync(clipPath)) {
                    fs.unlinkSync(clipPath);
                }
                
            } catch (err: any) {
                logger.warn(`Error obteniendo escena ${i + 1}`, err);
            }
        }

        if (downloadedVideos.length === 0) throw new Error('No se pudo obtener ningún video para el Short');

        // 3. Concatenar clips descargados
        const concatListFile = path.join(__dirname, '../../content', '_short_concat.txt');
        fs.writeFileSync(concatListFile, downloadedVideos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n'));
        const concatVideoPath = path.join(__dirname, '../../content', '_short_concat.mp4');
        
        await new Promise((resolve, reject) => {
            ffmpeg().input(concatListFile).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).save(concatVideoPath).on('end', resolve).on('error', reject);
        });

        // 3b. Generar portada / miniatura estática de 1.5s e insertar al inicio del Short
        let videoInputToUse = concatVideoPath;
        const thumbnailFilename = `cover_${trackingVideoId}.jpg`;
        const coverVideoPath = path.join(__dirname, '../../content', `_short_cover_${trackingVideoId}.mp4`);
        try {
            const coverImgPath = await ThumbnailGenerator.generateThumbnail({
                title: text.length > 60 ? text.substring(0, 60) + '...' : text,
                isShort: true,
                visualPrompt: visualPrompts?.[0],
                outputFilename: thumbnailFilename
            });

            logger.info('Generando escena de portada (1.5s) para el Short', { coverImgPath });
            await new Promise((res, rej) => {
                ffmpeg()
                    .input(coverImgPath)
                    .loop(1.5)
                    .outputOptions(['-c:v libx264', '-preset ultrafast', '-r 30', '-s 1080x1920', '-pix_fmt yuv420p'])
                    .save(coverVideoPath)
                    .on('end', res)
                    .on('error', rej);
            });

            // Preconcatenar la portada al video concatenado
            const coverConcatList = path.join(__dirname, '../../content', `_cover_concat_${trackingVideoId}.txt`);
            fs.writeFileSync(coverConcatList, `file '${coverVideoPath.replace(/\\/g, '/')}'\nfile '${concatVideoPath.replace(/\\/g, '/')}'`);
            const finalVideoWithCover = path.join(__dirname, '../../content', `_short_final_base_${trackingVideoId}.mp4`);
            
            await new Promise((res, rej) => {
                ffmpeg().input(coverConcatList).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).save(finalVideoWithCover).on('end', res).on('error', rej);
            });

            videoInputToUse = finalVideoWithCover;
            if (fs.existsSync(coverImgPath)) fs.unlinkSync(coverImgPath);
            if (fs.existsSync(coverConcatList)) fs.unlinkSync(coverConcatList);
        } catch (coverErr: any) {
            logger.warn('No se pudo insertar escena de portada al Short, continuando con concat estándar', { error: coverErr.message });
        }

        logger.info('Videos concatenados. Mezclando audio, video y subtítulos con FFmpeg');
        
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoInputToUse)
                .inputOptions(['-stream_loop -1'])
                .input(audioPath)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 23',
                    '-pix_fmt yuv420p',
                    `-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=contrast=1.2:saturation=1.1,subtitles='${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
                    '-c:a aac',
                    '-b:a 128k',
                    '-shortest',
                    '-fflags +shortest',
                    '-max_interleave_delta 100M'
                ])
                .save(outputPath)
                .on('end', () => {
                    logger.info(`Video render completo`, { outputPath, videoId: trackingVideoId });
                    // Limpiar archivos temporales
                    downloadedVideos.forEach(vid => { if (fs.existsSync(vid)) fs.unlinkSync(vid); });
                    if (fs.existsSync(concatListFile)) fs.unlinkSync(concatListFile);
                    if (fs.existsSync(concatVideoPath)) fs.unlinkSync(concatVideoPath);
                    if (fs.existsSync(coverVideoPath)) fs.unlinkSync(coverVideoPath);
                    const finalVideoWithCover = path.join(__dirname, '../../content', `_short_final_base_${trackingVideoId}.mp4`);
                    if (fs.existsSync(finalVideoWithCover)) fs.unlinkSync(finalVideoWithCover);
                    resolve(outputPath);
                })
                .on('error', (err: Error) => {
                    logger.error('Error renderizando video', err);
                    reject(err);
                });
        });
    }

    /**
     * Renders a Long-Form YouTube video with background clips and audio.
     * Uses VideoSourceRouter to select video source according to configured mode,
     * with intelligent key/filler segment classification.
     * 
     * @param visualPrompts Array of search terms for Pexels (1-3 words each)
     * @param audioFilename The name of the audio file in the content folder
     * @param outputFilename The name of the final video file to produce
     * @param text The spoken text for subtitle generation
     * @param comfyPrompts Optional array of detailed prompts for ComfyUI (20-50 words each)
     * @param videoId Optional unique identifier for tracking usage
     * @returns Path to the final rendered video file
     * @see Requirements: 6.1, 6.3, 6.5, 9.1-9.6
     */
    public static async renderLongVideo(
        visualPrompts: string[], 
        audioFilename: string, 
        outputFilename: string, 
        text: string,
        comfyPrompts?: ComfyPrompt[],
        videoId?: string
    ): Promise<string> {
        // Generar videoId si no se proporciona (para tracking)
        const trackingVideoId = videoId || `long_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        logger.info(`Iniciando render de video largo`, { 
            promptsCount: visualPrompts.length,
            hasComfyPrompts: !!comfyPrompts,
            videoId: trackingVideoId
        });
        
        // Limpiar cache de sesión periódicamente
        cleanupSessionCache();
        
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const headers = {
            ...VideoRenderer.DEFAULT_HEADERS,
            'Authorization': apiKey
        };
        
        const audioPath = path.join(__dirname, '../../content', audioFilename);
        
        // Generar Subtítulos (ASS Dinámicos)
        const assFilename = outputFilename.replace('.mp4', '.ass');
        await SubtitleGenerator.generateASS(audioPath, text, assFilename);
        const assPath = path.join(__dirname, '../../content', assFilename);

        const downloadedVideos: string[] = [];
        const promptsToUse = visualPrompts || ['technology'];
        
        // Estimar duración total del video basada en número de prompts (aprox 30s por segmento)
        const estimatedDurationSeconds = promptsToUse.length * 30;

        // Obtener el modo de video configurado
        const videoMode = ModelConfig.getVideoSourceMode();
        const useRouter = videoMode === 'comfyui' || videoMode === 'hybrid';
        
        logger.info('Modo de fuente de video para Long Video', { 
            mode: videoMode, 
            useRouter,
            estimatedDurationSeconds,
            totalSegments: promptsToUse.length
        });

        try {
            for (let i = 0; i < promptsToUse.length; i++) {
                const prompt = promptsToUse[i];
                logger.info(`Procesando escena ${i + 1}/${promptsToUse.length}`, { prompt });

                const tempVideoPath = path.join(__dirname, '../../content', `scene_${i}.mp4`);
                const normVideoPath = path.join(__dirname, '../../content', `scene_norm_${i}.mp4`);
                
                let clipPath: string | null = null;
                let sourceUsed: 'comfyui' | 'pexels' | 'pool' | 'synthetic' = 'pexels';

                try {
                    // Intentar usar VideoSourceRouter si está habilitado (Requirement 6.3)
                    if (useRouter) {
                        try {
                            const router = getVideoSourceRouter();
                            
                            // Construir request para el router con clasificación key/filler
                            // El router clasificará automáticamente según segmentIndex y totalSegments
                            const request: VideoGenerationRequest = {
                                visualPrompt: prompt,
                                comfyPrompt: comfyPrompts?.[i]?.prompt,
                                style: comfyPrompts?.[i]?.style,
                                videoType: 'long',
                                videoId: trackingVideoId,
                                segmentIndex: i,
                                totalSegments: promptsToUse.length,
                                durationSeconds: estimatedDurationSeconds
                            };
                            
                            // El router clasificará este segmento como key o filler
                            // y seleccionará la fuente apropiada según el modo hybrid
                            const segmentType = router.classifySegment(
                                i, 
                                promptsToUse.length, 
                                estimatedDurationSeconds
                            );
                            
                            logger.debug(`Generando clip ${i + 1} con VideoSourceRouter`, { 
                                visualPrompt: prompt,
                                hasComfyPrompt: !!request.comfyPrompt,
                                style: request.style,
                                segmentType
                            });
                            
                            const result = await router.generateVideo(request);
                            clipPath = result.outputPath;
                            sourceUsed = result.sourceUsed;
                            
                            // Registrar en cache de sesión (Requirement 6.5)
                            const clipId = result.metadata.clipId || result.outputPath;
                            markVideoAsUsedInSession(clipId, 'long', sourceUsed);
                            
                            logger.info(`Clip ${i + 1} generado`, {
                                source: sourceUsed,
                                segmentType,
                                generationTimeMs: result.generationTimeMs
                            });
                            
                        } catch (routerError: any) {
                            logger.warn(`VideoSourceRouter falló para clip ${i + 1}, usando Pexels como fallback`, {
                                error: routerError.message
                            });
                            // Continuar con Pexels como fallback
                        }
                    }
                    
                    // Fallback a Pexels si router no generó el clip
                    if (!clipPath) {
                        // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas Pexels
                        let response = await pexelsRetry.execute(
                            () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&orientation=landscape&per_page=15`, { headers }),
                            `Pexels search scene ${i + 1} (${prompt})`
                        );

                        if (!response.data.videos || response.data.videos.length === 0) {
                            logger.warn(`No se encontraron videos para escena ${i + 1}, usando fallback`, { prompt, fallbackPrompt: 'futuristic tech' });
                            response = await pexelsRetry.execute(
                                () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent('futuristic tech')}&orientation=landscape&per_page=15`, { headers }),
                                `Pexels search scene ${i + 1} (fallback: futuristic tech)`
                            );
                        }

                        if (response.data.videos && response.data.videos.length > 0) {
                            const videoData = this.getUnusedVideo(response.data.videos);
                            if (!videoData) throw new Error('No Pexels video found');
                            const videoFile = videoData.video_files.find((v: any) => v.height >= 720) || videoData.video_files[0];
                            const videoUrl = videoFile.link;

                            const writer = fs.createWriteStream(tempVideoPath);
                            // Aplicar retry también a la descarga del video
                            const downloadResponse = await pexelsRetry.execute(
                                () => axios({
                                    url: videoUrl,
                                    method: 'GET',
                                    responseType: 'stream',
                                    headers: { 'User-Agent': VideoRenderer.DEFAULT_HEADERS['User-Agent'] }
                                }),
                                `Pexels download scene ${i + 1}`
                            );

                            downloadResponse.data.pipe(writer);
                            await new Promise((resolve, reject) => {
                                writer.on('finish', () => resolve(true));
                                writer.on('error', reject);
                            });
                            
                            clipPath = tempVideoPath;
                            sourceUsed = 'pexels';
                            
                            // Registrar en cache de sesión
                            markVideoAsUsedInSession(`pexels_${videoData.id}`, 'long', 'pexels');
                        } else {
                            throw new Error('No Pexels video found');
                        }
                    }
                } catch (sceneErr: any) {
                    // REQ-4.4.3: Fallback específico para Pexels cuando reintentos se agotan
                    if (sceneErr instanceof RetryError) {
                        logger.warn(`Pexels agotó reintentos para escena ${i + 1}, usando fallback sintético`, { 
                            prompt,
                            attempts: sceneErr.attempts 
                        });
                        
                        const fallbackResult = await FallbackStrategies.pexelsFallback(
                            prompt,
                            tempVideoPath,
                            'landscape',
                            10,
                            sceneErr
                        );
                        
                        clipPath = tempVideoPath;
                        sourceUsed = 'synthetic';
                        
                        logger.info(`Fallback Pexels aplicado para escena ${i + 1}`, {
                            fallbackType: fallbackResult.fallbackType
                        });
                    } else {
                        // Fallback para otros errores
                        logger.warn(`Escena ${i + 1} video fetch falló, generando fondo sintético`, { error: sceneErr.message });
                        await new Promise((resolve, reject) => {
                            ffmpeg()
                                .input('color=c=0x0f172a:s=1920x1080:r=30:d=10')
                                .inputFormat('lavfi')
                                .outputOptions(['-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p'])
                                .save(tempVideoPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });
                        clipPath = tempVideoPath;
                        sourceUsed = 'synthetic';
                    }
                }

                logger.debug(`Normalizando escena ${i + 1}`, { source: sourceUsed });
                
                // Normalizar el clip con filtros visuales
                await new Promise((resolve, reject) => {
                    const vf = [
                        'scale=1920:1080:force_original_aspect_ratio=decrease',
                        'pad=1920:1080:-1:-1',
                        'setsar=1',
                        'fps=30'
                    ];
                    // Aplicar efectos más intensos en segmentos key (intro/outro)
                    // Esto se determina por la posición del segmento
                    const isKeySegment = i === 0 || i === promptsToUse.length - 1;
                    if (isKeySegment) {
                        vf.push('eq=contrast=1.2:saturation=1.1');
                    } else {
                        vf.push('eq=contrast=1.2:saturation=1.1');
                    }
                    ffmpeg(clipPath!)
                        .videoFilters(vf)
                        .outputOptions(['-c:v libx264', '-preset ultrafast', '-an'])
                        .save(normVideoPath)
                        .on('end', resolve)
                        .on('error', reject);
                });

                downloadedVideos.push(normVideoPath);
                
                // Limpiar archivo temporal si es diferente del normalizado
                if (clipPath && clipPath !== normVideoPath && fs.existsSync(clipPath)) {
                    fs.unlinkSync(clipPath);
                }
            }

            if (downloadedVideos.length === 0) {
                throw new Error('Could not download any videos for the long script.');
            }

            logger.info(`Videos descargados, mezclando con audio`, { 
                videoCount: downloadedVideos.length,
                videoId: trackingVideoId
            });

            const outputPath = path.join(__dirname, '../../content', outputFilename);
            const concatListPath = path.join(__dirname, '../../content', 'concat_list.txt');

            let concatLines: string[] = [];
            for (let loop = 0; loop < 20; loop++) {
                concatLines = concatLines.concat(downloadedVideos.map(vid => `file '${vid.replace(/\\/g, '/')}'`));
            }
            const concatContent = concatLines.join('\n');
            fs.writeFileSync(concatListPath, concatContent);

            return new Promise((resolve, reject) => {
                ffmpeg()
                    .input(concatListPath)
                    .inputOptions(['-f concat', '-safe 0'])
                    .input(audioPath)
                    .outputOptions([
                        '-c:v libx264',
                        '-preset ultrafast',
                        '-crf 23',
                        '-pix_fmt yuv420p',
                        `-vf subtitles='${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
                        '-c:a aac',
                        '-shortest'
                    ])
                    .save(outputPath)
                    .on('end', () => {
                        logger.info(`Long Video render completo`, { outputPath, videoId: trackingVideoId });
                        downloadedVideos.forEach(vid => { if (fs.existsSync(vid)) fs.unlinkSync(vid); });
                        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
                        resolve(outputPath);
                    })
                    .on('error', (err: Error) => {
                        logger.error('Error renderizando long video', err);
                        reject(err);
                    });
            });

        } catch (error) {
            logger.error('Error fatal en render de long video', error as Error);
            downloadedVideos.forEach(vid => { if (fs.existsSync(vid)) fs.unlinkSync(vid); });
            throw error;
        }
    }
}
