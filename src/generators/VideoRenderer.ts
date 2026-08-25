import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import dotenv from 'dotenv';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { SubtitleGenerator } from './SubtitleGenerator';
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
    public static async renderVideo(visualPrompts: string[], audioFilename: string, outputFilename: string, text: string): Promise<string> {
        logger.info(`Iniciando render de video corto`, { promptsCount: visualPrompts.length });
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

        // 2. Descargar 3 videos de Pexels
        const downloadedVideos = [];
        const promptsToUse = visualPrompts ? visualPrompts.slice(0, 3) : [];
        if (promptsToUse.length === 0) promptsToUse.push('technology');
        while (promptsToUse.length < 3) promptsToUse.push(promptsToUse[0]); // asegurar 3 clips

        for (let i = 0; i < promptsToUse.length; i++) {
            const prompt = promptsToUse[i];
            const tempVideoPath = path.join(__dirname, '../../content', `short_scene_${i}.mp4`);
            const normVideoPath = path.join(__dirname, '../../content', `short_scene_norm_${i}.mp4`);
            
            try {
                let response = await pexelsRetry.execute(
                    () => axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&orientation=portrait&per_page=1`, { headers }),
                    `Pexels search short scene ${i + 1}`
                );

                if (!response.data.videos || response.data.videos.length === 0) {
                    response = await pexelsRetry.execute(
                        () => axios.get(`https://api.pexels.com/videos/search?query=technology&orientation=portrait&per_page=1`, { headers }),
                        `Pexels fallback search short scene ${i + 1}`
                    );
                }

                if (response.data.videos && response.data.videos.length > 0) {
                    const videoData = response.data.videos[0];
                    const videoFile = videoData.video_files.find((v: any) => v.height >= 1080) || videoData.video_files[0];
                    const writer = fs.createWriteStream(tempVideoPath);
                    const downloadResponse = await pexelsRetry.execute(
                        () => axios({ url: videoFile.link, method: 'GET', responseType: 'stream', headers: { 'User-Agent': VideoRenderer.DEFAULT_HEADERS['User-Agent'] } }),
                        `Pexels download short scene ${i + 1}`
                    );
                    downloadResponse.data.pipe(writer);
                    await new Promise((resolve, reject) => { writer.on('finish', () => resolve(true)); writer.on('error', reject); });
                    
                    // Normalizar
                    await new Promise((resolve, reject) => {
                        ffmpeg().input(tempVideoPath).outputOptions(['-c:v libx264', '-preset ultrafast', '-r 30', '-s 1080x1920', '-t 15', '-pix_fmt yuv420p']).save(normVideoPath).on('end', resolve).on('error', reject);
                    });
                    downloadedVideos.push(normVideoPath);
                }
            } catch (err: any) {
                logger.warn(`Error descargando escena ${i + 1}`, err);
            }
        }

        if (downloadedVideos.length === 0) throw new Error('No se pudo descargar ningún video de Pexels para el Short');

        // 3. Concatenar clips descargados
        const concatListFile = path.join(__dirname, '../../content', '_short_concat.txt');
        fs.writeFileSync(concatListFile, downloadedVideos.map(v => `file '${path.basename(v)}'`).join('\n'));
        const concatVideoPath = path.join(__dirname, '../../content', '_short_concat.mp4');
        
        await new Promise((resolve, reject) => {
            ffmpeg().input(concatListFile).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).save(concatVideoPath).on('end', resolve).on('error', reject);
        });

        logger.info('Videos concatenados. Mezclando audio, video y subtítulos con FFmpeg');
        
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatVideoPath)
                .inputOptions(['-stream_loop -1'])
                .input(audioPath)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 23',
                    '-pix_fmt yuv420p',
                    // Hook Visual Epiléptico + Filtro Autismo (Contraste alto, Chromashift) + Subtítulos ASS Dinámicos
                    `-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness='if(between(t,0,3),sin(t*25)*0.3,0)':contrast='if(between(t,0,3),1+sin(t*15)*0.4,1.2)':saturation=1.1,chromashift=cbh=-2:crh=2,ass=${assPath}`,
                    '-c:a aac',
                    '-b:a 128k',
                    '-shortest',
                    '-fflags +shortest',
                    '-max_interleave_delta 100M'
                ])
                .save(outputPath)
                .on('end', () => {
                    logger.info(`Video render completo`, { outputPath });
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
    public static async renderLongVideo(visualPrompts: string[], audioFilename: string, outputFilename: string, text: string): Promise<string> {
        logger.info(`Iniciando render de video largo`, { promptsCount: visualPrompts.length });
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

        try {
            for (let i = 0; i < promptsToUse.length; i++) {
                const prompt = promptsToUse[i];
                logger.info(`Buscando en Pexels escena ${i + 1}/${promptsToUse.length}`, { prompt });

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
                        vf.push('eq=brightness=\'if(between(t,0,3),sin(t*25)*0.3,0)\':contrast=\'if(between(t,0,3),1+sin(t*15)*0.4,1.2)\':saturation=1.1');
                        vf.push('chromashift=cbh=-2:crh=2');
                    } else {
                        vf.push('eq=contrast=1.2:saturation=1.1');
                        vf.push('chromashift=cbh=-2:crh=2');
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
                        '-c:v libx264',
                        '-preset ultrafast',
                        '-crf 23',
                        '-pix_fmt yuv420p',
                        `-vf ass=${assPath}`,
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
