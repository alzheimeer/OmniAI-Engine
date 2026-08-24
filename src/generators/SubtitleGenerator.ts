/**
 * SubtitleGenerator - Generación de subtítulos sincronizados con TTS
 * 
 * Genera subtítulos profesionales con timing preciso usando timepoints de Google Cloud TTS
 * y formato .ASS (Advanced SubStation Alpha) para máxima compatibilidad.
 * 
 * @requirement REQ-2.5.1 - Crear SubtitleGenerator.ts con subtítulos sincronizados frame-a-frame
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { WhisperTranscriber, WhisperConfig } from './WhisperTranscriber';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuración para generación de subtítulos
 */
export interface SubtitleConfig {
    /** Idioma de síntesis ('Spanish', 'English', 'Portuguese') */
    language: string;
    /** Estilo visual de subtítulos */
    style: SubtitleStyleType;
    /** Duración de fade in/out en ms (default: 100) */
    fadeDurationMs?: number;
    /** Margen vertical desde el borde inferior en px */
    marginV?: number;
}

/**
 * Resultado de generación de subtítulos
 */
export interface SubtitleResult {
    /** Ruta al archivo .ASS generado */
    assPath: string;
    /** Ruta al archivo de audio generado */
    audioPath: string;
    /** Timestamps por palabra extraídos de TTS */
    timestamps: WordTiming[];
    /** Líneas de subtítulo generadas */
    lines: SubtitleLine[];
    /** Duración total del audio en ms */
    totalDurationMs: number;
}

/**
 * Timing de una palabra individual
 */
export interface WordTiming {
    /** La palabra */
    word: string;
    /** Tiempo de inicio en milisegundos */
    startTimeMs: number;
    /** Tiempo de fin en milisegundos */
    endTimeMs: number;
    /** Índice de la marca SSML */
    markIndex: number;
}

/**
 * Línea de subtítulo agrupada
 */
export interface SubtitleLine {
    /** Texto completo de la línea */
    text: string;
    /** Tiempo de inicio en ms */
    startTimeMs: number;
    /** Tiempo de fin en ms */
    endTimeMs: number;
    /** Palabras individuales con timing */
    words: WordTiming[];
}

/**
 * Tipos de estilo de subtítulo disponibles
 */
export type SubtitleStyleType = 'minimal' | 'bold' | 'glow';

/**
 * Configuración de estilo visual ASS
 */
export interface SubtitleStyle {
    /** Nombre del estilo */
    name: string;
    /** Nombre de la fuente */
    fontname: string;
    /** Tamaño de fuente */
    fontsize: number;
    /** Color primario en formato ASS (&HBBGGRR) */
    primaryColor: string;
    /** Color de borde/outline */
    outlineColor: string;
    /** Si es negrita */
    bold: boolean;
    /** Grosor del borde en px */
    outline: number;
    /** Grosor de sombra en px */
    shadow: number;
    /** Margen vertical desde borde inferior */
    marginV: number;
}

// ============================================================================
// CONSTANTES DE ESTILO PROFESIONAL
// ============================================================================

/**
 * Estilos de subtítulo predefinidos
 * Preparados para Montserrat Bold con borde negro (REQ-2.5.4)
 */
export const SUBTITLE_STYLES: Record<SubtitleStyleType, SubtitleStyle> = {
    minimal: {
        name: 'Minimal',
        fontname: 'Arial',
        fontsize: 20,
        primaryColor: '&HFFFFFF', // Blanco
        outlineColor: '&H000000', // Negro
        bold: false,
        outline: 1,
        shadow: 1,
        marginV: 50
    },
    bold: {
        name: 'Bold',
        fontname: 'Montserrat', // Fuente profesional (REQ-2.5.4)
        fontsize: 24,
        primaryColor: '&HFFFFFF', // Blanco (#FFFFFF)
        outlineColor: '&H000000', // Negro - borde 2px
        bold: true,
        outline: 2,
        shadow: 2,
        marginV: 60
    },
    glow: {
        name: 'Glow',
        fontname: 'Montserrat',
        fontsize: 22,
        primaryColor: '&HFFFFFF',
        outlineColor: '&H00FFFF', // Cyan glow
        bold: true,
        outline: 3,
        shadow: 0,
        marginV: 70
    }
};

/**
 * Configuración de voces por idioma para Google Cloud TTS
 */
const VOICE_CONFIG: Record<string, { name: string; code: string }> = {
    spanish: { name: 'es-ES-Journey-D', code: 'es-ES' },
    english: { name: 'en-US-Neural2-F', code: 'en-US' },
    portuguese: { name: 'pt-BR-Wavenet-B', code: 'pt-BR' }
};

// ============================================================================
// CLASE PRINCIPAL
// ============================================================================

/**
 * Generador de subtítulos sincronizados con TTS
 * 
 * Integra con Google Cloud TTS para obtener timepoints precisos por palabra
 * y genera archivos .ASS con timing profesional.
 */
export class SubtitleGenerator {
    /**
     * Prepara texto con marcas SSML para obtener timestamps por palabra
     * Inserta <mark> tags entre cada palabra para tracking de tiempo
     * 
     * @param text - Texto plano a procesar
     * @returns Texto SSML con marcas por palabra
     */
    public static prepareSSMLWithMarks(text: string): string {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        let ssml = '<speak>';
        
        words.forEach((word, index) => {
            ssml += `<mark name="w${index}"/>${word} `;
        });
        
        ssml += '</speak>';
        return ssml;
    }

    /**
     * Parsea timepoints de la respuesta de Google Cloud TTS
     * Extrae timestamps por palabra desde los marks del audio
     * 
     * @param timepoints - Array de timepoints de TTS
     * @param originalWords - Palabras originales del texto
     * @returns Array de WordTiming con timestamps precisos
     */
    public static parseTimepoints(
        timepoints: Array<{ markName?: string; timeSeconds?: number }> | undefined,
        originalWords: string[]
    ): WordTiming[] {
        if (!timepoints || timepoints.length === 0) {
            // Fallback: generar timepoints estimados si TTS no los provee
            return this.generateEstimatedTimepoints(originalWords);
        }

        const wordTimings: WordTiming[] = [];
        
        for (let i = 0; i < timepoints.length; i++) {
            const tp = timepoints[i];
            const markIndex = parseInt(tp.markName?.replace('w', '') || '0', 10);
            const startTimeMs = Math.round((tp.timeSeconds || 0) * 1000);
            
            // Calcular fin basado en siguiente marca o estimación
            let endTimeMs: number;
            if (i < timepoints.length - 1) {
                endTimeMs = Math.round((timepoints[i + 1].timeSeconds || 0) * 1000);
            } else {
                // Última palabra: estimar duración basada en longitud
                const word = originalWords[markIndex] || '';
                endTimeMs = startTimeMs + Math.max(200, word.length * 80);
            }

            wordTimings.push({
                word: originalWords[markIndex] || '',
                startTimeMs,
                endTimeMs,
                markIndex
            });
        }

        return wordTimings;
    }

    /**
     * Genera timepoints estimados cuando SSML marks no están disponibles
     * Usa algoritmo basado en longitud de palabra y speaking rate
     * 
     * @param words - Array de palabras
     * @param speakingRate - Velocidad de habla (default 1.1)
     * @returns Array de WordTiming estimados
     */
    public static generateEstimatedTimepoints(
        words: string[],
        speakingRate: number = 1.1
    ): WordTiming[] {
        const BASE_WORD_DURATION_MS = 350 / speakingRate;
        const CHAR_DURATION_MS = 50 / speakingRate;
        
        let currentTimeMs = 0;
        const timings: WordTiming[] = [];

        words.forEach((word, index) => {
            const wordDurationMs = BASE_WORD_DURATION_MS + (word.length * CHAR_DURATION_MS);
            
            timings.push({
                word,
                startTimeMs: Math.round(currentTimeMs),
                endTimeMs: Math.round(currentTimeMs + wordDurationMs),
                markIndex: index
            });

            currentTimeMs += wordDurationMs;
        });

        return timings;
    }

    /**
     * Agrupa palabras en líneas de subtítulo
     * Máximo 6-8 palabras por línea para legibilidad
     * 
     * @param wordTimings - Timings de palabras individuales
     * @param maxWordsPerLine - Máximo de palabras por línea (default 7)
     * @returns Array de SubtitleLine agrupadas
     */
    public static groupIntoLines(
        wordTimings: WordTiming[],
        maxWordsPerLine: number = 7
    ): SubtitleLine[] {
        const lines: SubtitleLine[] = [];
        
        for (let i = 0; i < wordTimings.length; i += maxWordsPerLine) {
            const lineWords = wordTimings.slice(i, i + maxWordsPerLine);
            
            if (lineWords.length > 0) {
                lines.push({
                    text: lineWords.map(w => w.word).join(' '),
                    startTimeMs: lineWords[0].startTimeMs,
                    endTimeMs: lineWords[lineWords.length - 1].endTimeMs,
                    words: lineWords
                });
            }
        }

        return lines;
    }

    /**
     * Convierte milisegundos al formato de tiempo ASS (h:mm:ss.cs)
     * 
     * @param ms - Tiempo en milisegundos
     * @returns Tiempo formateado para ASS
     */
    public static formatASSTime(ms: number): string {
        const totalSeconds = ms / 1000;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const centiseconds = Math.round((totalSeconds % 1) * 100);

        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
    }

    /**
     * Genera el header del archivo .ASS
     * 
     * @param style - Estilo de subtítulo a usar
     * @param videoWidth - Ancho del video (default 1080 para shorts)
     * @param videoHeight - Alto del video (default 1920 para shorts)
     * @returns Header ASS formateado
     */
    public static generateASSHeader(
        style: SubtitleStyle,
        videoWidth: number = 1080,
        videoHeight: number = 1920
    ): string {
        const boldValue = style.bold ? -1 : 0;
        
        return `[Script Info]
Title: OmniAI Generated Subtitles
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${style.name},${style.fontname},${style.fontsize},${style.primaryColor},&H000000FF,${style.outlineColor},&H80000000,${boldValue},0,0,0,100,100,0,0,1,${style.outline},${style.shadow},2,10,10,${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    }

    /**
     * Genera línea de diálogo ASS con fade opcional
     * 
     * @param line - Línea de subtítulo
     * @param styleName - Nombre del estilo
     * @param fadeDurationMs - Duración del fade (default 100ms)
     * @returns Línea de diálogo ASS formateada
     */
    public static generateASSDialogue(
        line: SubtitleLine,
        styleName: string,
        fadeDurationMs: number = 100
    ): string {
        const start = this.formatASSTime(line.startTimeMs);
        const end = this.formatASSTime(line.endTimeMs);
        const fadeEffect = `{\\fad(${fadeDurationMs},${fadeDurationMs})}`;
        
        return `Dialogue: 0,${start},${end},${styleName},,0,0,0,,${fadeEffect}${line.text}`;
    }

    /**
     * Genera archivo .ASS completo con timing por palabra
     * 
     * @param lines - Líneas de subtítulo con timing
     * @param outputPath - Ruta de salida para el archivo .ASS
     * @param config - Configuración de subtítulos
     * @returns Ruta al archivo .ASS generado
     */
    public static generateASSFile(
        lines: SubtitleLine[],
        outputPath: string,
        config: SubtitleConfig
    ): string {
        const style = SUBTITLE_STYLES[config.style];
        const styleWithMargin = {
            ...style,
            marginV: config.marginV ?? style.marginV
        };
        
        let assContent = this.generateASSHeader(styleWithMargin);
        
        for (const line of lines) {
            assContent += this.generateASSDialogue(
                line, 
                styleWithMargin.name,
                config.fadeDurationMs ?? 100
            ) + '\n';
        }

        fs.writeFileSync(outputPath, assContent, 'utf-8');
        console.log(`✅ Archivo .ASS generado: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * Obtiene configuración de voz por idioma
     */
    public static getVoiceConfig(language: string): { name: string; code: string } {
        const key = language.toLowerCase();
        return VOICE_CONFIG[key] || VOICE_CONFIG.spanish;
    }

    /**
     * Quema subtítulos en el video usando FFmpeg filtro ass
     * Incrusta permanentemente los subtítulos .ASS en el video de salida
     * 
     * @param videoPath - Ruta al video de entrada
     * @param assPath - Ruta al archivo .ASS de subtítulos
     * @param outputPath - Ruta para el video de salida
     * @returns Ruta al video con subtítulos quemados
     * @requirement REQ-2.5.5 - Quemar subtítulos con FFmpeg filtro ass
     */
    public static async burnSubtitles(
        videoPath: string,
        assPath: string,
        outputPath: string
    ): Promise<string> {
        // Validar que los archivos de entrada existen
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video de entrada no encontrado: ${videoPath}`);
        }
        if (!fs.existsSync(assPath)) {
            throw new Error(`Archivo .ASS no encontrado: ${assPath}`);
        }

        // Crear directorio de salida si no existe
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Obtener ruta de FFmpeg desde el instalador
        const ffmpegPath = ffmpegInstaller.path;

        // Escapar rutas para Windows (convertir backslashes y manejar espacios)
        // FFmpeg en Windows requiere que las rutas con espacios estén escapadas
        // y los backslashes se conviertan a forward slashes para el filtro ass
        const escapedAssPath = assPath
            .replace(/\\/g, '/')           // Convertir backslashes a forward slashes
            .replace(/:/g, '\\:')          // Escapar dos puntos (Windows drive letter)
            .replace(/'/g, "\\'");         // Escapar comillas simples

        // Construir comando FFmpeg con filtro ass
        // -i: archivo de entrada
        // -vf "ass=...": filtro de video para subtítulos ASS
        // -c:a copy: copiar audio sin recodificar
        // -y: sobrescribir archivo de salida si existe
        const command = `"${ffmpegPath}" -i "${videoPath}" -vf "ass='${escapedAssPath}'" -c:a copy -y "${outputPath}"`;

        console.log(`🔧 Ejecutando FFmpeg para quemar subtítulos...`);
        console.log(`   Video entrada: ${videoPath}`);
        console.log(`   Archivo ASS: ${assPath}`);
        console.log(`   Video salida: ${outputPath}`);

        try {
            // Ejecutar FFmpeg de forma síncrona
            execSync(command, { 
                stdio: 'pipe',
                encoding: 'utf-8',
                windowsHide: true
            });

            // Verificar que el archivo de salida se creó correctamente
            if (!fs.existsSync(outputPath)) {
                throw new Error('El archivo de salida no fue creado por FFmpeg');
            }

            const outputStats = fs.statSync(outputPath);
            if (outputStats.size === 0) {
                throw new Error('El archivo de salida está vacío');
            }

            console.log(`✅ Subtítulos quemados exitosamente: ${outputPath}`);
            console.log(`   Tamaño del video resultante: ${(outputStats.size / (1024 * 1024)).toFixed(2)} MB`);

            return outputPath;
        } catch (error) {
            // Limpiar archivo de salida parcial si existe
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                } catch {
                    // Ignorar error al limpiar
                }
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Error al quemar subtítulos con FFmpeg: ${errorMessage}`);
        }
    }

    /**
     * Extrae timestamps de un archivo de audio usando OpenAI Whisper
     * Se usa como fallback cuando SSML marks no están disponibles
     * 
     * Utiliza la API de OpenAI Whisper con timestamp_granularities=["word"]
     * para obtener timestamps precisos por palabra.
     * 
     * @param audioPath - Ruta al archivo de audio
     * @param config - Configuración opcional de Whisper (apiKey, language, etc.)
     * @returns Array de WordTiming extraídos por Whisper
     * @throws Error si el archivo no existe o la API falla
     * @requirement REQ-2.5.7 - Crear fallback a Whisper cuando SSML timestamps no están disponibles
     */
    public static async transcribeWithWhisper(
        audioPath: string,
        config?: WhisperConfig
    ): Promise<WordTiming[]> {
        return WhisperTranscriber.transcribe(audioPath, config);
    }
}
