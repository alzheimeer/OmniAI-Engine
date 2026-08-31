import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Logger } from '../infrastructure/Logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const logger = new Logger('SubtitleGenerator');

export class SubtitleGenerator {
    /**
     * Genera un archivo .ass con animaciones dinámicas adaptadas al formato (Shorts 9:16 vs Long 16:9).
     */
    public static async generateASS(audioPath: string, text: string, assFilename: string, isShort: boolean = true): Promise<string> {
        logger.info('Generando subtítulos ASS dinámicos', { audioPath, isShort });
        
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (err) {
                    logger.error('Error al analizar audio para subtítulos', err);
                    return reject(err);
                }

                const duration = metadata.format.duration || 10;
                
                // Limpiar etiquetas [VOICE_A] y [VOICE_B] del texto
                const cleanText = text.replace(/\[VOICE_[AB]\]:?/g, '').trim();
                
                // Dividir el texto en palabras
                const words = cleanText.split(/\s+/).filter(w => w.trim().length > 0);
                
                // Stop words a ignorar (ampliado)
                const stopWords = new Set([
                    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'si', 'de', 'en', 'a', 'por', 'con', 'para', 'del', 'al', 'su', 'sus',
                    'se', 'que', 'es', 'son', 'lo', 'como', 'más', 'mas', 'muy', 'te', 'me', 'nos', 'os', 'le', 'les', 'ya', 'ha', 'han', 'he', 'esta', 'estas', 'este', 'estos', 'tu', 'tus', 'mi', 'mis',
                    'estar', 'estan', 'están', 'está', 'esto', 'eso', 'aquello', 'aquellos', 'aquellas', 'esa', 'esas', 'ese', 'esos', 'así', 'asi', 'cuando', 'donde', 'quien', 'quienes', 'cual', 'cuales',
                    'fue', 'fueron', 'ser', 'sido', 'tienen', 'tiene', 'tener', 'tenido', 'hacer', 'hace', 'hacen', 'hecho', 'todo', 'toda', 'todos', 'todas', 'nada', 'algo'
                ]);
                
                // Seleccionamos "keywords" repartidas uniformemente
                const keywords: string[] = [];
                let currentChunk: string[] = [];
                const wordsPerKeyword = isShort ? 5 : 4;
                
                for (const word of words) {
                    currentChunk.push(word);
                    if (currentChunk.length >= wordsPerKeyword) {
                        let bestWord = currentChunk.find(w => {
                            const cleanW = w.toLowerCase().replace(/[^\w\sáéíóúñ]/gi, '');
                            return cleanW.length > 3 && !stopWords.has(cleanW);
                        });
                        
                        if (!bestWord) {
                            bestWord = currentChunk.sort((a, b) => b.length - a.length)[0];
                        }
                        
                        const finalWord = bestWord.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/gi, '');
                        keywords.push(finalWord.toUpperCase());
                        currentChunk = [];
                    }
                }
                
                if (currentChunk.length > 0) {
                    let bestWord = currentChunk.find(w => {
                        const cleanW = w.toLowerCase().replace(/[^\w\sáéíóúñ]/gi, '');
                        return cleanW.length > 3 && !stopWords.has(cleanW);
                    });
                    if (!bestWord) bestWord = currentChunk.sort((a, b) => b.length - a.length)[0];
                    const finalWord = bestWord.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/gi, '');
                    keywords.push(finalWord.toUpperCase());
                }

                if (keywords.length === 0) keywords.push("...");

                const resX = isShort ? 1080 : 1920;
                const resY = isShort ? 1920 : 1080;
                const fontSize = isShort ? 110 : 54;
                const alignment = isShort ? 5 : 2; // 5 = Center (Shorts), 2 = Bottom Center (Long)
                const marginV = isShort ? 10 : 60;

                // Archivo ASS cabecera
                const assLines = [
                    '[Script Info]',
                    'ScriptType: v4.00+',
                    `PlayResX: ${resX}`,
                    `PlayResY: ${resY}`,
                    '[V4+ Styles]',
                    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
                    `Style: Main,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,${alignment},20,20,${marginV},1`,
                    '[Events]',
                    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
                ];

                const timePerKeyword = duration / keywords.length;
                let currentTime = 0;

                for (let i = 0; i < keywords.length; i++) {
                    const startTime = this.formatAssTime(currentTime);
                    currentTime += timePerKeyword;
                    const endTime = this.formatAssTime(currentTime);

                    // Colores vibrantes ASS (formato BBGGRR)
                    const colors = [
                        '00FFFF', // Amarillo
                        '00FF00', // Verde
                        'FFFF00', // Cyan
                        '0000FF', // Rojo
                        'FF00FF', // Magenta
                        'FFFFFF', // Blanco
                        '00A5FF'  // Naranja
                    ];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    const word = keywords[i].trim();

                    let fx = '';
                    if (isShort) {
                        const fxOptions = [
                            '\\move(540,1500,540,960)',
                            '\\t(\\fscx140\\fscy140)',
                            '\\fad(150,150)',
                            '\\pos(540,960)\\frz' + Math.floor(Math.random() * 20 - 10)
                        ];
                        fx = fxOptions[Math.floor(Math.random() * fxOptions.length)];
                    } else {
                        // En videos largos horizontales, mantener en parte inferior con sutileza cinematográfica
                        fx = '\\fad(150,150)';
                    }
                    
                    if (word.length > 0) {
                        assLines.push(`Dialogue: 0,${startTime},${endTime},Main,,0,0,0,,{\\1c&H${randomColor}&${fx}}${word}`);
                    }
                }

                const outPath = path.join(path.dirname(audioPath), assFilename);
                fs.writeFileSync(outPath, assLines.join('\n'));
                logger.info(`Subtítulos ASS generados exitosamente en ${outPath}`);
                resolve(outPath);
            });
        });
    }

    private static formatAssTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const cs = Math.floor((seconds % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    }
}
