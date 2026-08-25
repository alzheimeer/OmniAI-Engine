import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { Logger } from '../infrastructure/Logger';

const logger = new Logger('SubtitleGenerator');

export class SubtitleGenerator {
    /**
     * Genera un archivo .ass con animaciones dinámicas aleatorias para palabras clave.
     */
    public static async generateASS(audioPath: string, text: string, assFilename: string): Promise<string> {
        logger.info('Generando subtítulos ASS dinámicos', { audioPath });
        
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
                
                for (const word of words) {
                    currentChunk.push(word);
                    if (currentChunk.length >= 5) {
                        // Limpiar puntuación para comparar
                        let bestWord = currentChunk.find(w => {
                            const cleanW = w.toLowerCase().replace(/[^\w\sáéíóúñ]/gi, '');
                            return cleanW.length > 3 && !stopWords.has(cleanW);
                        });
                        
                        if (!bestWord) {
                            bestWord = currentChunk.sort((a, b) => b.length - a.length)[0];
                        }
                        
                        // Quitar todos los símbolos de la palabra seleccionada
                        const finalWord = bestWord.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/gi, '');
                        keywords.push(finalWord.toUpperCase());
                        currentChunk = [];
                    }
                }
                
                // Si sobra algo al final
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

                // Archivo ASS cabecera
                const assLines = [
                    '[Script Info]',
                    'ScriptType: v4.00+',
                    'PlayResX: 1080',
                    'PlayResY: 1920',
                    '[V4+ Styles]',
                    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
                    'Style: Main,Arial,120,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5,0,5,10,10,10,1',
                    '[Events]',
                    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
                ];

                const timePerKeyword = duration / keywords.length;
                let currentTime = 0;

                for (let i = 0; i < keywords.length; i++) {
                    const startTime = this.formatAssTime(currentTime);
                    currentTime += timePerKeyword;
                    const endTime = this.formatAssTime(currentTime);

                    // Animaciones aleatorias ASS
                    const fxOptions = [
                        '\\move(540,1500,540,960)', // Star wars subir
                        '\\t(\\fscx150\\fscy150)',  // Zoom in
                        '\\fad(200,200)',           // Fade in/out
                        '\\pos(540,960)\\frz' + Math.floor(Math.random() * 30 - 15) // Rotación aleatoria al centro
                    ];
                    const fx = fxOptions[Math.floor(Math.random() * fxOptions.length)];
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
                    
                    // Ass dialogue line
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
