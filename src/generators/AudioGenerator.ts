import { google } from 'googleapis';
import { GoogleAuth } from '../auth/GoogleAuth';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { FallbackStrategies } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';

// Instancia de RetryHandler preconfigurada para Google TTS API
const googleTTSRetry = RetryHandler.forAPI('GoogleTTS');

// Logger para AudioGenerator
const logger = new Logger('AudioGenerator');

export class AudioGenerator {
    // Google TTS Journey voices perform best under 2000 bytes (we use 1800 for safety and speed)
    private static readonly MAX_CHUNK_BYTES = 1800;

    /**
     * Generates an MP3 audio file from text using Google Cloud TTS.
     * Automatically chunks long text and concatenates with FFmpeg.
     * @param text The text to synthesize.
     * @param outputFilename The name of the output MP3 file (e.g. 'audio.mp3').
     * @returns The absolute path to the generated audio file.
     */
    public static async generateAudio(text: string, outputFilename: string, language: string = 'Spanish'): Promise<string> {
        
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY is not set in .env');
        }

        let languageCode = 'es-ES';
        let voiceNameA = '';
        let voiceNameB = '';

        if (language.toLowerCase() === 'english') {
            languageCode = 'en-US';
            voiceNameA = 'en-US-Neural2-F'; // Female
            voiceNameB = 'en-US-Neural2-J'; // Male
        } else if (language.toLowerCase() === 'portuguese') {
            languageCode = 'pt-BR';
            voiceNameA = 'pt-BR-Neural2-C'; // Female
            voiceNameB = 'pt-BR-Neural2-B'; // Male
        } else {
            // Default to Spanish
            languageCode = 'es-ES';
            voiceNameA = 'es-ES-Neural2-F'; // Female
            voiceNameB = 'es-ES-Journey-D'; // Male
        }
        
        logger.info(`Voces TTS seleccionadas: A=${voiceNameA}, B=${voiceNameB} (${languageCode})`);

        const tts = google.texttospeech({ version: 'v1', auth: apiKey });
        const contentDir = path.join(__dirname, '../../content');
        const outPath = path.join(contentDir, outputFilename);

        try {
            // Parse text for [VOICE_A] and [VOICE_B]
            const segments = text.split(/(?=\[VOICE_[AB]\]:?)/g).filter(s => s.trim().length > 0);
            const chunkFiles: string[] = [];
            
            let chunkIndex = 0;
            
            for (let i = 0; i < segments.length; i++) {
                let segmentText = segments[i].trim();
                let currentVoice = voiceNameA; // Default to Voice A
                
                if (segmentText.startsWith('[VOICE_B]')) {
                    currentVoice = voiceNameB;
                    segmentText = segmentText.replace(/^\[VOICE_B\]:?\s*/i, '');
                } else if (segmentText.startsWith('[VOICE_A]')) {
                    currentVoice = voiceNameA;
                    segmentText = segmentText.replace(/^\[VOICE_A\]:?\s*/i, '');
                }
                
                if (!segmentText) continue;

                // Check if segment itself exceeds TTS limit and needs chunking
                const textBytes = Buffer.byteLength(segmentText, 'utf8');
                
                if (textBytes <= this.MAX_CHUNK_BYTES) {
                    const chunkFile = path.join(contentDir, `_chunk_${chunkIndex++}_${outputFilename}`);
                    logger.debug(`Sintetizando segment ${i + 1}/${segments.length}`, { bytes: textBytes, voice: currentVoice });
                    await this.synthesizeToFile(tts, segmentText, currentVoice, languageCode, chunkFile);
                    chunkFiles.push(chunkFile);
                } else {
                    const chunks = this.splitTextIntoChunks(segmentText);
                    for (const chunk of chunks) {
                        const chunkFile = path.join(contentDir, `_chunk_${chunkIndex++}_${outputFilename}`);
                        await this.synthesizeToFile(tts, chunk, currentVoice, languageCode, chunkFile);
                        chunkFiles.push(chunkFile);
                    }
                }
            }

            // Concatenate all chunks with FFmpeg
            logger.info(`Concatenando ${chunkFiles.length} chunks de audio con FFmpeg`);
            await this.concatenateAudioFiles(chunkFiles, outPath, contentDir);

            // Cleanup chunk files
            for (const chunkFile of chunkFiles) {
                try { fs.unlinkSync(chunkFile); } catch {}
            }
            logger.debug(`Limpiados ${chunkFiles.length} archivos temporales de chunks`);
            
            // Post-processing to apply silenceremove and occasional masking
            const finalOutPath = outPath.replace('.mp3', '_filtered.mp3');
            await this.applyAudioFilters(outPath, finalOutPath, contentDir);
            
            // Reemplazar el original
            fs.renameSync(finalOutPath, outPath);

            logger.info(`Audio generado y filtrado exitosamente`, { outPath });
            return outPath;
        } catch (error) {
            // REQ-4.4.3: Fallback específico para Google TTS cuando reintentos se agotan
            if (error instanceof RetryError) {
                logger.warn('Google TTS API agotó reintentos, usando fallback de audio silencioso', { 
                    language,
                    textLength: text.length,
                    attempts: error.attempts 
                });
                
                const fallbackResult = await FallbackStrategies.googleTTSFallback(
                    text,
                    outputFilename,
                    language,
                    error
                );
                
                logger.info('Fallback Google TTS aplicado exitosamente', {
                    fallbackType: fallbackResult.fallbackType,
                    message: fallbackResult.message
                });
                
                return fallbackResult.result;
            }
            
            logger.error('Error fatal generando audio con Google TTS', error as Error);
            throw error;
        }
    }

    /**
     * Synthesize text to an MP3 file using Google TTS
     * REQ-4.4.2: Aplicar retry a APIs externas (Google TTS)
     */
    private static async synthesizeToFile(
        tts: any,
        text: string, 
        voiceName: string, 
        languageCode: string, 
        outputPath: string
    ): Promise<void> {
        const request = {
            input: { text },
            voice: { 
                languageCode,
                name: voiceName
            },
            audioConfig: { 
                audioEncoding: 'MP3',
                speakingRate: 1.1
            }
        };

        // Aplicar retry con backoff exponencial a la llamada de Google TTS
        const response = await googleTTSRetry.execute(
            () => tts.text.synthesize({ requestBody: request }),
            `Google TTS synthesize (${voiceName})`
        );
        
        // El response viene del SDK de Google, accedemos a data directamente
        const responseData = (response as { data: { audioContent?: string } }).data;
        
        if (!responseData.audioContent) {
            throw new Error('Failed to generate audio content from Google TTS');
        }

        fs.writeFileSync(outputPath, Buffer.from(responseData.audioContent, 'base64'));
    }

    /**
     * Split text into chunks that fit within Google TTS byte limit.
     * Splits on sentence boundaries (., !, ?) to maintain natural flow.
     */
    private static splitTextIntoChunks(text: string): string[] {
        const chunks: string[] = [];
        
        // Split on sentence boundaries
        const sentences = text.split(/(?<=[.!?])\s+/);
        let currentChunk = '';

        for (const sentence of sentences) {
            const potentialChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
            const potentialBytes = Buffer.byteLength(potentialChunk, 'utf8');

            if (potentialBytes <= this.MAX_CHUNK_BYTES) {
                currentChunk = potentialChunk;
            } else {
                // Current chunk is full, save it and start new one
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                
                // If single sentence exceeds limit, split by words
                if (Buffer.byteLength(sentence, 'utf8') > this.MAX_CHUNK_BYTES) {
                    const subChunks = this.splitLongSentence(sentence);
                    chunks.push(...subChunks.slice(0, -1));
                    currentChunk = subChunks[subChunks.length - 1] || '';
                } else {
                    currentChunk = sentence;
                }
            }
        }

        // Don't forget the last chunk
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    /**
     * Split a very long sentence by words when it exceeds the byte limit
     */
    private static splitLongSentence(sentence: string): string[] {
        const chunks: string[] = [];
        const words = sentence.split(/\s+/);
        let currentChunk = '';

        for (const word of words) {
            const potentialChunk = currentChunk ? currentChunk + ' ' + word : word;
            if (Buffer.byteLength(potentialChunk, 'utf8') <= this.MAX_CHUNK_BYTES) {
                currentChunk = potentialChunk;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = word;
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * Concatenate multiple MP3 files using FFmpeg
     */
    private static async concatenateAudioFiles(
        inputFiles: string[], 
        outputPath: string,
        workDir: string
    ): Promise<void> {
        // Create a file list for FFmpeg concat demuxer
        const listFile = path.join(workDir, '_concat_list.txt');
        const listContent = inputFiles.map(f => `file '${path.basename(f)}'`).join('\n');
        fs.writeFileSync(listFile, listContent);

        try {
            // Use FFmpeg concat demuxer for seamless joining using explicit installer path
            const ffmpegPath = ffmpegInstaller.path;
            execSync(
                `"${ffmpegPath}" -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`,
                { cwd: workDir, stdio: 'pipe' }
            );
        } finally {
            // Cleanup list file
            try { fs.unlinkSync(listFile); } catch {}
        }
    }

    /**
     * Post-process audio with FFmpeg to remove silence and apply micro-mutations
     */
    private static async applyAudioFilters(inputPath: string, outputPath: string, workDir: string): Promise<void> {
        const applyMasking = Math.random() < 0.25; // 25% of the time, apply deep masking
        let filterChain = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB";
        if (applyMasking) {
            // NOTA: atempo=1.02 era detectable por YouTube. Esta técnica usa:
            // - asetrate*1.02: Sube el formante 2%
            // - aresample: Normaliza sample rate
            // - atempo=0.9804: Compensa la velocidad (inverso de 1.02)
            // Resultado: misma duración, timbre diferente, indetectable
            filterChain += ",asetrate=44100*1.02,aresample=44100,atempo=0.9804";
            // El resultado: misma velocidad, pero voz con timbre ligeramente diferente
            logger.info('Aplicando humanización de voz (Formant Shift + compensación)');
        }
        
        try {
            const ffmpegPath = ffmpegInstaller.path;
            execSync(
                `"${ffmpegPath}" -y -i "${inputPath}" -af "${filterChain}" -c:a libmp3lame -q:a 2 "${outputPath}"`,
                { cwd: workDir, stdio: 'pipe' }
            );
        } catch (error) {
            logger.error('Error al aplicar filtros de audio FFmpeg', error as Error);
            throw error;
        }
    }
}
