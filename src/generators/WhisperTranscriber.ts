/**
 * WhisperTranscriber - Transcripción de audio usando OpenAI Whisper
 * 
 * Extrae timestamps precisos por palabra desde archivos de audio.
 * Se usa como fallback cuando Google Cloud TTS no devuelve timepoints SSML.
 * 
 * @requirement REQ-2.5.7 - Crear fallback a Whisper cuando SSML timestamps no están disponibles
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { WordTiming } from './SubtitleGenerator';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuración para WhisperTranscriber
 */
export interface WhisperConfig {
    /** API Key de OpenAI (opcional, usa OPENAI_API_KEY por defecto) */
    apiKey?: string;
    /** Modelo de Whisper a usar (default: 'whisper-1') */
    model?: string;
    /** Idioma del audio para mejorar precisión (ISO 639-1) */
    language?: string;
    /** Prompt opcional para mejorar precisión de transcripción */
    prompt?: string;
}

/**
 * Resultado de transcripción con timestamps
 */
export interface TranscriptionResult {
    /** Texto completo transcrito */
    text: string;
    /** Timestamps por palabra */
    wordTimings: WordTiming[];
    /** Idioma detectado */
    language: string;
    /** Duración total del audio en ms */
    durationMs: number;
}

/**
 * Segmento de transcripción de Whisper verbose_json
 */
interface WhisperSegment {
    /** ID del segmento */
    id: number;
    /** Índice de inicio en tokens */
    seek: number;
    /** Tiempo de inicio en segundos */
    start: number;
    /** Tiempo de fin en segundos */
    end: number;
    /** Texto del segmento */
    text: string;
    /** Tokens del segmento */
    tokens: number[];
    /** Temperatura usada */
    temperature: number;
    /** Average log probability */
    avg_logprob: number;
    /** Compression ratio */
    compression_ratio: number;
    /** No speech probability */
    no_speech_prob: number;
}

/**
 * Palabra individual con timing de Whisper
 */
interface WhisperWord {
    /** La palabra */
    word: string;
    /** Tiempo de inicio en segundos */
    start: number;
    /** Tiempo de fin en segundos */
    end: number;
}

/**
 * Respuesta completa de Whisper con verbose_json y timestamps por palabra
 */
interface WhisperVerboseResponse {
    /** Idioma detectado o especificado */
    language: string;
    /** Duración del audio en segundos */
    duration: number;
    /** Texto completo */
    text: string;
    /** Palabras con timestamps (cuando timestamp_granularities incluye "word") */
    words?: WhisperWord[];
    /** Segmentos con timestamps (cuando timestamp_granularities incluye "segment") */
    segments?: WhisperSegment[];
}

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Mapeo de idiomas a códigos ISO 639-1 para Whisper
 */
const LANGUAGE_CODES: Record<string, string> = {
    spanish: 'es',
    english: 'en',
    portuguese: 'pt',
    es: 'es',
    en: 'en',
    pt: 'pt'
};

/**
 * Extensiones de audio soportadas por Whisper
 */
const SUPPORTED_EXTENSIONS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];

/**
 * Tamaño máximo de archivo en bytes (25MB para Whisper API)
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// ============================================================================
// CLASE PRINCIPAL
// ============================================================================

/**
 * WhisperTranscriber - Transcriptor de audio usando OpenAI Whisper
 * 
 * Proporciona transcripción con timestamps precisos por palabra usando
 * la API de OpenAI Whisper. Se usa como fallback cuando SSML marks
 * de Google Cloud TTS no están disponibles.
 */
export class WhisperTranscriber {
    private openai: OpenAI;
    private config: Required<Omit<WhisperConfig, 'prompt'>> & Pick<WhisperConfig, 'prompt'>;

    constructor(config: WhisperConfig = {}) {
        this.config = {
            apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
            model: config.model || 'whisper-1',
            language: config.language || '',
            prompt: config.prompt
        };

        if (!this.config.apiKey) {
            console.warn('⚠️ WhisperTranscriber: No se encontró OPENAI_API_KEY. La transcripción fallará.');
        }

        this.openai = new OpenAI({
            apiKey: this.config.apiKey
        });
    }

    /**
     * Transcribe un archivo de audio y extrae timestamps por palabra
     * Endpoint: POST /v1/audio/transcriptions con timestamp_granularities=["word"]
     * 
     * @param audioPath - Ruta al archivo de audio
     * @returns Array de WordTiming extraídos por Whisper
     * @throws Error si el archivo no existe, no es soportado, o la API falla
     */
    public async transcribeWithWhisper(audioPath: string): Promise<WordTiming[]> {
        // Validar archivo
        this.validateAudioFile(audioPath);

        console.log(`🎤 Transcribiendo con Whisper: ${path.basename(audioPath)}`);

        try {
            // Crear stream de lectura del archivo
            const audioFile = fs.createReadStream(audioPath);

            // Preparar parámetros de la solicitud
            const transcriptionParams: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
                file: audioFile,
                model: this.config.model,
                response_format: 'verbose_json',
                timestamp_granularities: ['word']
            };

            // Añadir idioma si está especificado
            if (this.config.language) {
                const langCode = this.normalizeLanguageCode(this.config.language);
                if (langCode) {
                    transcriptionParams.language = langCode;
                }
            }

            // Añadir prompt si está especificado
            if (this.config.prompt) {
                transcriptionParams.prompt = this.config.prompt;
            }

            // Llamar a la API de Whisper
            const response = await this.openai.audio.transcriptions.create(transcriptionParams);

            // Parsear respuesta verbose_json
            const verboseResponse = response as unknown as WhisperVerboseResponse;

            // Convertir palabras de Whisper a WordTiming
            const wordTimings = this.parseWhisperWords(verboseResponse);

            console.log(`✅ Whisper transcribió ${wordTimings.length} palabras`);
            console.log(`   Idioma detectado: ${verboseResponse.language || 'desconocido'}`);
            console.log(`   Duración: ${(verboseResponse.duration || 0).toFixed(2)}s`);

            return wordTimings;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error en transcripción Whisper: ${errorMessage}`);
            throw new Error(`Error al transcribir con Whisper: ${errorMessage}`);
        }
    }

    /**
     * Transcribe con información completa incluyendo duración y idioma detectado
     * 
     * @param audioPath - Ruta al archivo de audio
     * @returns Resultado completo de transcripción
     */
    public async transcribeFull(audioPath: string): Promise<TranscriptionResult> {
        // Validar archivo
        this.validateAudioFile(audioPath);

        console.log(`🎤 Transcripción completa con Whisper: ${path.basename(audioPath)}`);

        try {
            const audioFile = fs.createReadStream(audioPath);

            const transcriptionParams: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
                file: audioFile,
                model: this.config.model,
                response_format: 'verbose_json',
                timestamp_granularities: ['word']
            };

            if (this.config.language) {
                const langCode = this.normalizeLanguageCode(this.config.language);
                if (langCode) {
                    transcriptionParams.language = langCode;
                }
            }

            if (this.config.prompt) {
                transcriptionParams.prompt = this.config.prompt;
            }

            const response = await this.openai.audio.transcriptions.create(transcriptionParams);
            const verboseResponse = response as unknown as WhisperVerboseResponse;

            const wordTimings = this.parseWhisperWords(verboseResponse);

            return {
                text: verboseResponse.text || '',
                wordTimings,
                language: verboseResponse.language || 'unknown',
                durationMs: Math.round((verboseResponse.duration || 0) * 1000)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Error en transcripción completa: ${errorMessage}`);
        }
    }

    /**
     * Valida que el archivo de audio existe y es soportado
     * 
     * @param audioPath - Ruta al archivo de audio
     * @throws Error si el archivo no es válido
     */
    private validateAudioFile(audioPath: string): void {
        // Verificar que el archivo existe
        if (!fs.existsSync(audioPath)) {
            throw new Error(`Archivo de audio no encontrado: ${audioPath}`);
        }

        // Verificar extensión soportada
        const ext = path.extname(audioPath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            throw new Error(
                `Extensión de archivo no soportada: ${ext}. ` +
                `Formatos soportados: ${SUPPORTED_EXTENSIONS.join(', ')}`
            );
        }

        // Verificar tamaño máximo
        const stats = fs.statSync(audioPath);
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(
                `Archivo demasiado grande: ${(stats.size / (1024 * 1024)).toFixed(2)}MB. ` +
                `Máximo permitido: ${MAX_FILE_SIZE / (1024 * 1024)}MB`
            );
        }

        if (stats.size === 0) {
            throw new Error('El archivo de audio está vacío');
        }
    }

    /**
     * Normaliza el código de idioma al formato ISO 639-1
     * 
     * @param language - Idioma en cualquier formato (español, spanish, es, etc.)
     * @returns Código ISO 639-1 o undefined si no se reconoce
     */
    private normalizeLanguageCode(language: string): string | undefined {
        const normalized = language.toLowerCase().trim();
        return LANGUAGE_CODES[normalized] || (normalized.length === 2 ? normalized : undefined);
    }

    /**
     * Parsea las palabras de la respuesta de Whisper a formato WordTiming
     * 
     * @param response - Respuesta verbose_json de Whisper
     * @returns Array de WordTiming
     */
    private parseWhisperWords(response: WhisperVerboseResponse): WordTiming[] {
        const wordTimings: WordTiming[] = [];

        // Si hay palabras con timestamps, usarlas directamente
        if (response.words && response.words.length > 0) {
            response.words.forEach((word, index) => {
                wordTimings.push({
                    word: word.word.trim(),
                    startTimeMs: Math.round(word.start * 1000),
                    endTimeMs: Math.round(word.end * 1000),
                    markIndex: index
                });
            });
        } else if (response.segments && response.segments.length > 0) {
            // Fallback: estimar palabras desde segmentos
            let wordIndex = 0;
            for (const segment of response.segments) {
                const words = segment.text.trim().split(/\s+/).filter(w => w.length > 0);
                const segmentDuration = segment.end - segment.start;
                const wordDuration = segmentDuration / words.length;

                words.forEach((word, i) => {
                    const startTime = segment.start + (i * wordDuration);
                    const endTime = startTime + wordDuration;

                    wordTimings.push({
                        word: word,
                        startTimeMs: Math.round(startTime * 1000),
                        endTimeMs: Math.round(endTime * 1000),
                        markIndex: wordIndex++
                    });
                });
            }
        } else if (response.text) {
            // Último fallback: distribuir palabras uniformemente
            console.warn('⚠️ Whisper no devolvió timestamps. Estimando distribución uniforme.');
            const words = response.text.trim().split(/\s+/).filter(w => w.length > 0);
            const totalDuration = (response.duration || 10) * 1000; // ms
            const wordDuration = totalDuration / words.length;

            words.forEach((word, index) => {
                wordTimings.push({
                    word: word,
                    startTimeMs: Math.round(index * wordDuration),
                    endTimeMs: Math.round((index + 1) * wordDuration),
                    markIndex: index
                });
            });
        }

        return wordTimings;
    }

    /**
     * Verifica si la API key de OpenAI está configurada y es válida
     * 
     * @returns true si la configuración es válida
     */
    public isConfigured(): boolean {
        return Boolean(this.config.apiKey && this.config.apiKey.length > 0);
    }

    /**
     * Actualiza la configuración del transcriptor
     * 
     * @param config - Nueva configuración parcial
     */
    public updateConfig(config: Partial<WhisperConfig>): void {
        if (config.apiKey !== undefined) {
            this.config.apiKey = config.apiKey;
            this.openai = new OpenAI({ apiKey: config.apiKey });
        }
        if (config.model !== undefined) {
            this.config.model = config.model;
        }
        if (config.language !== undefined) {
            this.config.language = config.language;
        }
        if (config.prompt !== undefined) {
            this.config.prompt = config.prompt;
        }
    }

    /**
     * Método estático para uso rápido sin instanciar
     * Extrae timestamps de un archivo de audio usando OpenAI Whisper
     * 
     * @param audioPath - Ruta al archivo de audio
     * @param config - Configuración opcional
     * @returns Array de WordTiming extraídos por Whisper
     */
    public static async transcribe(
        audioPath: string,
        config?: WhisperConfig
    ): Promise<WordTiming[]> {
        const transcriber = new WhisperTranscriber(config);
        return transcriber.transcribeWithWhisper(audioPath);
    }
}
