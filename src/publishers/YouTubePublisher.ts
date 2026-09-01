import { google } from 'googleapis';
import { GoogleAuth } from '../auth/GoogleAuth';
import fs from 'fs';
import path from 'path';
import { ThumbnailGenerator } from '../generators/ThumbnailGenerator';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { FallbackStrategies, DeferredPublishData } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';

// Instancia de RetryHandler preconfigurada para YouTube API
const youtubeRetry = RetryHandler.forAPI('YouTube');

// Logger para YouTubePublisher
const logger = new Logger('YouTubePublisher');

export interface YouTubeVideoMetadata {
    title: string;
    description: string;
    tags: string[];
    privacyStatus?: 'public' | 'private' | 'unlisted';
    isShort?: boolean; // Flag to indicate if this is a YouTube Short
    visualPrompt?: string; // For thumbnail generation
    channelKey?: string; // Para determinar el disclaimer
}

export class YouTubePublisher {
    /**
     * Sanitizes YouTube tags to comply with API requirements.
     * - Removes invalid characters (<, >, etc.)
     * - Trims whitespace
     * - Removes empty tags
     * - Limits individual tag length to 30 chars
     * - Ensures total tags don't exceed 500 chars combined
     */
    private static sanitizeTags(tags: string[]): string[] {
        if (!tags || !Array.isArray(tags)) return ['Shorts', 'AI', 'Neurodiversity'];
        
        const sanitized: string[] = [];
        let totalLength = 0;
        const maxTotalLength = 400; // Safe margin under YouTube's 500 limit
        
        for (let tag of tags) {
            if (typeof tag !== 'string') continue;
            
            // Remove quotes, commas, brackets, slashes, and special symbols
            let cleanTag = tag
                .replace(/[<>"'\\,/]/g, '')
                .replace(/[^a-zA-Z0-9 áéíóúüñÁÉÍÓÚÜÑ-]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (!cleanTag || cleanTag.length < 2) continue;
            if (cleanTag.length > 30) cleanTag = cleanTag.substring(0, 30).trim();
            
            if (totalLength + cleanTag.length + 1 > maxTotalLength) break;
            
            if (!sanitized.includes(cleanTag)) {
                sanitized.push(cleanTag);
                totalLength += cleanTag.length + 1;
            }
        }
        
        return sanitized.length > 0 ? sanitized : ['Shorts', 'AI'];
    }

    /**
     * Uploads a video to YouTube.
     * @param videoFileName The name of the video file inside the content directory (e.g., 'final-video.mp4')
     * @param metadata The title, description, and tags for the video.
     * @param tokenFilePath Optional path to token file (defaults to oauth2.tokens.json for Channel 1)
     */
    public static async publishVideo(videoFileName: string, metadata: YouTubeVideoMetadata, tokenFilePath?: string): Promise<string> {
        const authClient = await GoogleAuth.getClient(tokenFilePath);
        const youtube = google.youtube({ version: 'v3', auth: authClient });

        const videoPath = path.isAbsolute(videoFileName) 
            ? videoFileName 
            : path.join(__dirname, '../../content', videoFileName);
        
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found at ${videoPath}`);
        }

        logger.info(`Iniciando upload a YouTube`, { videoFileName, title: metadata.title });

        const fileSize = fs.statSync(videoPath).size;

        // SEO Optimization: Ensure title is under 60 chars (YouTube truncates at ~60)
        const optimizedTitle = metadata.title.length > 60 
            ? metadata.title.substring(0, 57) + '...' 
            : metadata.title;

        // Sanitize tags to comply with YouTube API requirements
        const sanitizedTags = this.sanitizeTags(metadata.tags);

        // SEO Optimization: Add #Shorts tag for Short videos to ensure correct classification
        const shortsTag = metadata.isShort ? '\n\n#Shorts' : '';
        
        // Build optimized description with hashtags
        const hashtagString = sanitizedTags.slice(0, 15).map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
        
        let disclaimer = "";
        if (metadata.channelKey === 'channel3') {
            disclaimer = "\n\n⚠️ Disclaimer: This video was synthesized with the assistance of AI for educational and entertainment purposes. It explores mysteries, theories, and psychological facts. Always verify facts independently.";
        } else {
            disclaimer = "\n\n⚠️ Disclaimer: Este contenido fue sintetizado con asistencia de Inteligencia Artificial para fines educativos. No constituye asesoramiento médico, psicológico ni profesional sobre el autismo o la neurodiversidad.";
        }
        
        const optimizedDescription = `${metadata.description}${shortsTag}\n\n${hashtagString}${disclaimer}`;

        const finalPrivacyStatus = metadata.privacyStatus || 'public';

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas YouTube API
            const res = await youtubeRetry.execute(
                () => youtube.videos.insert(
                    {
                        part: ['snippet', 'status'],
                        notifySubscribers: !metadata.isShort, // Notify subscribers for long videos, not for Shorts (spam prevention)
                        requestBody: {
                            snippet: {
                                title: optimizedTitle,
                                description: optimizedDescription,
                                tags: sanitizedTags.slice(0, 30), // YouTube allows max 30 tags
                                categoryId: '27', // 27 = Education
                            },
                            status: {
                                privacyStatus: finalPrivacyStatus, // Aplica Estrategia Híbrida
                                selfDeclaredMadeForKids: false,
                            },
                        },
                        media: {
                            body: fs.createReadStream(videoPath),
                        },
                    },
                    {
                        // Set the upload progress event
                        onUploadProgress: (evt) => {
                            const progress = (evt.bytesRead / fileSize) * 100;
                            process.stdout.write(`\rUploading... ${Math.round(progress)}%`);
                        },
                    }
                ),
                'YouTube videos.insert'
            );

            logger.info('Upload completado exitosamente');
            
            const videoId = res.data.id;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            logger.info(`Video publicado en YouTube`, { videoId, videoUrl });

            // Generate and upload custom thumbnail (critical for CTR)
            if (videoId) {
                try {
                    logger.info('Generando custom thumbnail');
                    const thumbnailFilename = `thumbnail-${videoId}.jpg`;
                    const thumbnailPath = await ThumbnailGenerator.generateThumbnail({
                        title: optimizedTitle,
                        isShort: metadata.isShort || false,
                        visualPrompt: metadata.visualPrompt,
                        outputFilename: thumbnailFilename
                    });

                    // Upload thumbnail to YouTube with retry
                    logger.info('Subiendo thumbnail a YouTube');
                    await youtubeRetry.execute(
                        () => youtube.thumbnails.set({
                            videoId: videoId,
                            media: {
                                mimeType: 'image/jpeg',
                                body: fs.createReadStream(thumbnailPath)
                            }
                        }),
                        'YouTube thumbnails.set'
                    );
                    logger.info('Custom thumbnail subido exitosamente');

                    // Clean up thumbnail file
                    if (fs.existsSync(thumbnailPath)) {
                        fs.unlinkSync(thumbnailPath);
                    }
                } catch (thumbnailError: any) {
                    // Don't fail the whole upload if thumbnail fails
                    logger.warn('Thumbnail upload falló (video aún publicado)', { error: thumbnailError.message });
                }
            }

            return videoUrl;
        } catch (error) {
            // REQ-4.4.3: Fallback específico para YouTube cuando reintentos se agotan
            if (error instanceof RetryError) {
                logger.warn('YouTube API agotó reintentos, guardando para publicación diferida', { 
                    videoFileName,
                    title: metadata.title,
                    attempts: error.attempts 
                });
                
                // Determinar el canal basado en el tokenFilePath
                const channelKey: 'channel1' | 'channel2' | 'channel3' = tokenFilePath?.includes('channel2') ? 'channel2' : 'channel1';
                
                const fallbackResult = await FallbackStrategies.youtubeFallback(
                    videoFileName,
                    {
                        title: optimizedTitle,
                        description: optimizedDescription,
                        tags: sanitizedTags,
                        privacyStatus: metadata.privacyStatus,
                        isShort: metadata.isShort,
                        visualPrompt: metadata.visualPrompt
                    },
                    channelKey,
                    error
                );
                
                logger.info('Fallback YouTube aplicado exitosamente', {
                    fallbackType: fallbackResult.fallbackType,
                    message: fallbackResult.message
                });
                
                // Retornar una URL indicando que está en cola diferida
                return `DEFERRED:${fallbackResult.result.videoFileName}`;
            }
            
            logger.error('Error fatal publicando video en YouTube', error as Error);
            throw error;
        }
    }
}
