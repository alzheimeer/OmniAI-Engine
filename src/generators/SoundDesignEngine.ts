import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { Logger } from '../infrastructure/Logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const logger = new Logger('SoundDesignEngine');

export interface SoundDesignConfig {
    voiceAudioPath: string;
    outputAudioPath: string;
    musicVolumeDb?: number; // default: -22dB
    durationSeconds?: number;
}

export class SoundDesignEngine {
    
    /**
     * Genera una pista de audio con acabado acústico profesional y mezcla con música ambiental si está disponible.
     */
    public static async processAudio(config: SoundDesignConfig): Promise<string> {
        logger.info('Mezclando diseño sonoro para voz en off', { 
            voice: path.basename(config.voiceAudioPath),
            musicVolumeDb: config.musicVolumeDb || -22
        });

        // Comprobar si existe un archivo de música de fondo en content/
        const contentDir = path.dirname(config.voiceAudioPath);
        const candidateMusic = [
            path.join(contentDir, 'ambient.mp3'),
            path.join(contentDir, 'background.mp3'),
            path.join(contentDir, 'music.mp3')
        ].find(p => fs.existsSync(p));

        return new Promise((resolve, reject) => {
            if (candidateMusic) {
                // Mezclar música real de fondo a -22dB
                const filter = `[0:a]volume=1.0[v];[1:a]volume=0.08,aloop=loop=-1:size=2e+09[m];[v][m]amix=inputs=2:duration=first[aout]`;
                ffmpeg()
                    .input(config.voiceAudioPath)
                    .input(candidateMusic)
                    .complexFilter(filter, 'aout')
                    .outputOptions(['-c:a aac', '-b:a 192k'])
                    .output(config.outputAudioPath)
                    .on('end', () => resolve(config.outputAudioPath))
                    .on('error', () => {
                        fs.copyFileSync(config.voiceAudioPath, config.outputAudioPath);
                        resolve(config.outputAudioPath);
                    })
                    .run();
            } else {
                // Si no hay archivo de música externa, procesar con ecualización de voz broadcast cristalina
                ffmpeg()
                    .input(config.voiceAudioPath)
                    .audioFilters([
                        'highpass=f=80',
                        'lowpass=f=12000',
                        'loudnorm=I=-16:TP=-1.5:LRA=11'
                    ])
                    .outputOptions(['-c:a aac', '-b:a 192k'])
                    .output(config.outputAudioPath)
                    .on('end', () => {
                        logger.debug('Audio con ecualización broadcast completado', { output: path.basename(config.outputAudioPath) });
                        resolve(config.outputAudioPath);
                    })
                    .on('error', (err) => {
                        logger.warn('Error en SoundDesignEngine, copiando audio original', { error: err.message });
                        try {
                            fs.copyFileSync(config.voiceAudioPath, config.outputAudioPath);
                            resolve(config.outputAudioPath);
                        } catch (copyErr) {
                            reject(copyErr);
                        }
                    })
                    .run();
            }
        });
    }
}
