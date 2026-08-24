import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import dotenv from 'dotenv';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { FallbackStrategies } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';

dotenv.config();

// Set the path to the ffmpeg binary from the installer package
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Instancia de RetryHandler preconfigurada para Pexels API
const pexelsRetry = RetryHandler.forAPI('Pexels');

// Logger para VideoRenderer
const logger = new Logger('VideoRenderer');

export class VideoRenderer {
    private static readonly DEFAULT_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    };

    /**
     * Finds a stock video on Pexels, downloads it, and merges it with the generated audio for Shorts.
     * @param visualPrompt A search term for the background video (e.g., "coding office")
     * @param audioFilename The name of the audio file in the content folder
     * @param outputFilename The name of the final video file to produce
     */
    public static async renderVideo(visualPrompt: string, audioFilename: string, outputFilename: string): Promise<string> {
        logger.info(`Buscando video de fondo en Pexels`, { visualPrompt });
        
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const headers = {
            ...VideoRenderer.DEFAULT_HEADERS,
            'Authorization': apiKey
        };

        const tempVideoPath = path.join(__dirname, '../../content', 'temp_bg.mp4');
        const audioPath = path.join(__dirname, '../../content', audioFilename);
        const outputPath = path.join(__dirname, '../../content', outputFilename);

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas Pexels
            let response = await pexelsRetry.execute(
                () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(visualPrompt)}&orientation=portrait&per_page=1`, { headers }),
                `Pexels search (${visualPrompt})`
            );

            if (!response.data.videos || response.data.videos.length === 0) {
                logger.warn(`No se encontraron videos para prompt, usando fallback`, { visualPrompt, fallbackPrompt: 'technology brain' });
                response = await pexelsRetry.execute(
                    () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent('technology brain')}&orientation=portrait&per_page=1`, { headers }),
                    'Pexels search (fallback: technology brain)'
                );
            }

            if (response.data.videos && response.data.videos.length > 0) {
                const videoData = response.data.videos[0];
                const videoFile = videoData.video_files.find((v: any) => v.height >= 1080) || videoData.video_files[0];
                const videoUrl = videoFile.link;

                logger.info(`Video de Pexels encontrado, descargando`, { videoId: videoData.id });

                const writer = fs.createWriteStream(tempVideoPath);
                // Aplicar retry también a la descarga del video
                const downloadResponse = await pexelsRetry.execute(
                    () => axios({
                        url: videoUrl,
                        method: 'GET',
                        responseType: 'stream',
                        headers: { 'User-Agent': VideoRenderer.DEFAULT_HEADERS['User-Agent'] }
                    }),
                    `Pexels download video ${videoData.id}`
                );

                downloadResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(true));
                    writer.on('error', reject);
                });
            } else {
                throw new Error('No videos found on Pexels');
            }
        } catch (downloadErr: any) {
            // REQ-4.4.3: Fallback específico para Pexels cuando reintentos se agotan
            if (downloadErr instanceof RetryError) {
                logger.warn('Pexels API agotó reintentos, usando fallback de video sintético', { 
                    visualPrompt,
                    attempts: downloadErr.attempts 
                });
                
                const fallbackResult = await FallbackStrategies.pexelsFallback(
                    visualPrompt,
                    tempVideoPath,
                    'portrait',
                    60,
                    downloadErr
                );
                
                logger.info('Fallback Pexels aplicado exitosamente', {
                    fallbackType: fallbackResult.fallbackType,
                    message: fallbackResult.message
                });
            } else {
                // Fallback para otros errores (ej: no videos encontrados)
                logger.warn(`Pexels video fetch falló, generando fondo sintético HD`, { error: downloadErr.message });
                await new Promise((resolve, reject) => {
                    ffmpeg()
                        .input('color=c=0x0f172a:s=1080x1920:r=30:d=60')
                        .inputFormat('lavfi')
                        .outputOptions(['-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p'])
                        .save(tempVideoPath)
                        .on('end', resolve)
                        .on('error', reject);
                });
            }
        }

        logger.info('Video descargado. Mezclando audio y video con FFmpeg');

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(tempVideoPath)
                .inputOptions(['-stream_loop -1'])
                .input(audioPath)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 23',
                    '-pix_fmt yuv420p',
                    // Hook Visual Epiléptico (Retención 4s): Strobing de brillo y contraste intenso en los primeros 3s
                    '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=\'if(between(t,0,3),sin(t*25)*0.3,0)\':contrast=\'if(between(t,0,3),1+sin(t*15)*0.4,1)\'',
                    '-c:a aac',
                    '-b:a 128k',
                    '-shortest',
                    '-fflags +shortest',
                    '-max_interleave_delta 100M'
                ])
                .save(outputPath)
                .on('end', () => {
                    logger.info(`Video render completo`, { outputPath });
                    if (fs.existsSync(tempVideoPath)) {
                        fs.unlinkSync(tempVideoPath);
                    }
                    resolve(outputPath);
                })
                .on('error', (err: Error) => {
                    logger.error('Error renderizando video', err);
                    reject(err);
                });
        });
    }

    /**
     * Finds multiple stock videos on Pexels, downloads them, concatenates them, and merges with audio for Long Videos.
     * @param visualPrompts Array of search terms for the background videos
     * @param audioFilename The name of the audio file in the content folder
     * @param outputFilename The name of the final video file to produce
     */
    public static async renderLongVideo(visualPrompts: string[], audioFilename: string, outputFilename: string): Promise<string> {
        logger.info(`Iniciando render de video largo`, { promptsCount: visualPrompts.length });
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const headers = {
            ...VideoRenderer.DEFAULT_HEADERS,
            'Authorization': apiKey
        };

        const downloadedVideos: string[] = [];

        try {
            for (let i = 0; i < visualPrompts.length; i++) {
                const prompt = visualPrompts[i];
                logger.info(`Buscando en Pexels escena ${i + 1}/${visualPrompts.length}`, { prompt });

                const tempVideoPath = path.join(__dirname, '../../content', `scene_${i}.mp4`);
                const normVideoPath = path.join(__dirname, '../../content', `scene_norm_${i}.mp4`);

                try {
                    // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas Pexels
                    let response = await pexelsRetry.execute(
                        () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&orientation=landscape&per_page=1`, { headers }),
                        `Pexels search scene ${i + 1} (${prompt})`
                    );

                    if (!response.data.videos || response.data.videos.length === 0) {
                        logger.warn(`No se encontraron videos para escena ${i + 1}, usando fallback`, { prompt, fallbackPrompt: 'futuristic tech' });
                        response = await pexelsRetry.execute(
                            () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent('futuristic tech')}&orientation=landscape&per_page=1`, { headers }),
                            `Pexels search scene ${i + 1} (fallback: futuristic tech)`
                        );
                    }

                    if (response.data.videos && response.data.videos.length > 0) {
                        const videoData = response.data.videos[0];
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
                    } else {
                        throw new Error('No Pexels video found');
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
                    }
                }

                logger.debug(`Normalizando escena ${i + 1}`);
                await new Promise((resolve, reject) => {
                    const vf = [
                        'scale=1920:1080:force_original_aspect_ratio=decrease',
                        'pad=1920:1080:-1:-1',
                        'setsar=1',
                        'fps=30'
                    ];
                    if (i === 0) {
                        vf.push('eq=brightness=\'if(between(t,0,3),sin(t*25)*0.3,0)\':contrast=\'if(between(t,0,3),1+sin(t*15)*0.4,1)\'');
                    }
                    ffmpeg(tempVideoPath)
                        .videoFilters(vf)
                        .outputOptions(['-c:v libx264', '-preset ultrafast', '-an'])
                        .save(normVideoPath)
                        .on('end', resolve)
                        .on('error', reject);
                });

                downloadedVideos.push(normVideoPath);
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
            }

            if (downloadedVideos.length === 0) {
                throw new Error('Could not download any videos for the long script.');
            }

            logger.info(`Videos descargados, mezclando con audio`, { videoCount: downloadedVideos.length });

            const audioPath = path.join(__dirname, '../../content', audioFilename);
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
                        '-c:v copy',
                        '-c:a aac',
                        '-shortest'
                    ])
                    .save(outputPath)
                    .on('end', () => {
                        logger.info(`Long Video render completo`, { outputPath });
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
