import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import { Logger } from '../infrastructure/Logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const logger = new Logger('KenBurnsEngine');

export type KenBurnsEffect = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export interface KenBurnsConfig {
    inputImagePath: string;
    outputVideoPath: string;
    durationSeconds?: number;
    isShort?: boolean;
    effect?: KenBurnsEffect;
}

export class KenBurnsEngine {
    
    /**
     * Convierte una imagen fija en un clip de video animado con efecto Ken Burns (Zoom/Paneo suave).
     * @param config Configuración de la animación
     * @returns Ruta del clip de video generado
     */
    public static async animateImage(config: KenBurnsConfig): Promise<string> {
        const duration = config.durationSeconds || 3.0;
        const isShort = config.isShort || false;
        const width = isShort ? 1080 : 1920;
        const height = isShort ? 1920 : 1080;
        const fps = 30;
        const totalFrames = Math.round(duration * fps);
        const effect = config.effect || (Math.random() > 0.5 ? 'zoom-in' : 'zoom-out');

        logger.info('Generando animación Ken Burns', { 
            image: path.basename(config.inputImagePath), 
            duration, 
            isShort, 
            effect 
        });

        let zoompanFilter = '';

        if (effect === 'zoom-in') {
            // Zoom suave de 1.0 a 1.25 centrado
            zoompanFilter = `zoompan=z='min(zoom+0.0015,1.25)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
        } else if (effect === 'zoom-out') {
            // Zoom suave de 1.25 a 1.0
            zoompanFilter = `zoompan=z='if(lte(zoom,1.0),1.25,max(1.001,zoom-0.0015))':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`;
        } else if (effect === 'pan-left') {
            // Paneo horizontal hacia la izquierda
            zoompanFilter = `zoompan=z=1.15:x='if(lte(on,1),(iw-iw/zoom)/2,x-1)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
        } else {
            // Paneo horizontal hacia la derecha
            zoompanFilter = `zoompan=z=1.15:x='if(lte(on,1),0,x+1)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
        }

        // Filtro de mejora de contraste y viñeta sutil
        const fullFilter = [
            zoompanFilter,
            'eq=contrast=1.15:saturation=1.1',
            'format=yuv420p'
        ].join(',');

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(config.inputImagePath)
                .loop(duration)
                .videoFilters(fullFilter)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-pix_fmt yuv420p',
                    `-t ${duration}`
                ])
                .output(config.outputVideoPath)
                .on('end', () => {
                    logger.debug('Clip Ken Burns generado con éxito', { output: path.basename(config.outputVideoPath) });
                    resolve(config.outputVideoPath);
                })
                .on('error', (err) => {
                    logger.error('Error generando clip Ken Burns', err);
                    reject(err);
                })
                .run();
        });
    }
}
