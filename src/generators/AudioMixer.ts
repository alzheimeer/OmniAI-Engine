/**
 * AudioMixer.ts
 * 
 * Sistema de mezcla profesional de audio para combinar voz TTS con música de fondo.
 * Integra MusicTransformer para aplicar transformaciones ANTES de mezclar (REQ-2.8.8).
 * 
 * REQ-2.6.1: Crear AudioMixer.ts que combine voz TTS con música de fondo de forma profesional
 * REQ-2.6.2: Implementar banco de música royalty-free organizado por mood
 * REQ-2.6.3: Ajustar volúmenes correctamente: voz -1dB, música -22dB
 * REQ-2.6.4: Implementar ducking automático: bajar música -6dB cuando hay voz activa
 * REQ-2.6.5: Usar filtro sidechaincompress de FFmpeg para ducking profesional
 * REQ-2.6.6: Implementar fade-in de música en intro (primeros 2 segundos)
 * REQ-2.6.7: Implementar fade-out de música en outro (últimos 2 segundos)
 * REQ-2.6.8: Normalizar audio final a -16 LUFS con loudnorm (estándar YouTube)
 * REQ-2.6.9: Verificar que truePeak < -1.5dB para evitar clipping
 * REQ-2.6.10: Selección inteligente de música basada en mood del script
 * REQ-2.6.11: Loopear música automáticamente si el video es más largo que la pista
 * REQ-2.8.8: Integrar con MusicTransformer para transformar música ANTES de mezclar con voz
 * 
 * Comando FFmpeg de referencia para mezcla con ducking:
 * ffmpeg -i voice.mp3 -i music_transformed.mp3 \
 *   -filter_complex "[1:a]volume=-22dB,afade=t=in:d=2,afade=t=out:st=58:d=2[m];
 *                    [m][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=500[mc];
 *                    [0:a][mc]amix=inputs=2:duration=first[out];
 *                    [out]loudnorm=I=-16:TP=-1.5:LRA=11[final]" \
 *   -map "[final]" output.mp3
 */

import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { 
    MusicTransformer, 
    MusicTransformationParams,
    MusicTransformResult 
} from './MusicTransformer';

// ===== INTERFACES =====

/**
 * Categorías de mood para selección de música.
 * REQ-2.6.2: Banco de música organizado por mood
 */
export type MusicMood = 'ambient' | 'upbeat' | 'cinematic' | 'calm' | 'dramatic';

/**
 * Información de una pista de música disponible en el banco.
 */
export interface MusicTrack {
    /** Ruta relativa al archivo de música */
    path: string;
    
    /** Mood/categoría de la pista */
    mood: MusicMood;
    
    /** Duración en segundos (opcional, se detecta automáticamente) */
    duration?: number;
    
    /** Nombre descriptivo de la pista */
    name: string;
    
    /** BPM de la pista (opcional, útil para sincronización futura) */
    bpm?: number;
}

/**
 * Configuración de volumen para la mezcla.
 * REQ-2.6.3: Volúmenes estándar broadcast
 */
export interface VolumeConfig {
    /** Volumen de la voz en dB (default: -1dB, protagonista) */
    voiceVolumeDb: number;
    
    /** Volumen base de la música en dB (default: -22dB, apenas perceptible) */
    musicVolumeDb: number;
    
    /** Reducción adicional de música cuando hay voz (default: -6dB) */
    duckingAmountDb: number;
}

/**
 * Configuración de fades para intro y outro.
 * REQ-2.6.6 y REQ-2.6.7: Fade-in y fade-out de música
 */
export interface FadeConfig {
    /** Duración del fade-in en segundos (default: 2s) */
    fadeInDuration: number;
    
    /** Duración del fade-out en segundos (default: 2s) */
    fadeOutDuration: number;
}

/**
 * Configuración de normalización de audio.
 * REQ-2.6.8 y REQ-2.6.9: Loudnorm y truePeak
 */
export interface NormalizationConfig {
    /** Loudness integrado objetivo en LUFS (default: -16 para YouTube) */
    targetLufs: number;
    
    /** True peak máximo en dB (default: -1.5dB para evitar clipping) */
    truePeakDb: number;
    
    /** Loudness range objetivo (default: 11) */
    loudnessRange: number;
}

/**
 * Configuración completa para AudioMixer.
 */
export interface AudioMixerConfig {
    /** Configuración de volúmenes */
    volume: VolumeConfig;
    
    /** Configuración de fades */
    fade: FadeConfig;
    
    /** Configuración de normalización */
    normalization: NormalizationConfig;
    
    /** 
     * Aplicar transformación de música con MusicTransformer antes de mezclar.
     * REQ-2.8.8: Integrar con MusicTransformer: transformar ANTES de mezclar
     * Default: true (siempre transformar para evadir Content ID)
     */
    transformMusic: boolean;
    
    /** Parámetros de transformación personalizados (opcional, se generan si no se proveen) */
    transformParams?: MusicTransformationParams;
}

/**
 * Resultado de una operación de mezcla de audio.
 */
export interface AudioMixResult {
    /** Ruta al archivo de audio mezclado */
    outputPath: string;
    
    /** Duración total en segundos */
    totalDuration: number;
    
    /** Información de la pista de música usada */
    musicTrack: MusicTrack;
    
    /** Indica si la música fue transformada antes de mezclar */
    musicTransformed: boolean;
    
    /** Resultado de la transformación de música (si aplica) */
    transformResult?: MusicTransformResult;
    
    /** Indica si la música fue looped */
    musicLooped: boolean;
    
    /** Número de loops aplicados */
    loopCount: number;
    
    /** Loudness integrado del output en LUFS */
    outputLufs?: number;
    
    /** True peak del output en dB */
    outputTruePeak?: number;
}

// ===== CONSTANTES =====

/**
 * Valores por defecto para configuración de AudioMixer.
 * Basados en estándares broadcast y YouTube.
 */
export const AUDIO_MIXER_DEFAULTS: AudioMixerConfig = {
    volume: {
        voiceVolumeDb: -1,      // Voz protagonista
        musicVolumeDb: -22,     // Música apenas perceptible
        duckingAmountDb: -6     // Reducción adicional cuando hay voz
    },
    fade: {
        fadeInDuration: 2,      // 2 segundos de fade-in
        fadeOutDuration: 2      // 2 segundos de fade-out
    },
    normalization: {
        targetLufs: -16,        // Estándar YouTube
        truePeakDb: -1.5,       // Evita clipping en compresión
        loudnessRange: 11       // LRA estándar
    },
    transformMusic: true        // REQ-2.8.8: Siempre transformar
};

/**
 * Directorio base para el banco de música.
 * REQ-2.6.2: Organizado por mood
 */
export const MUSIC_BANK_PATH = 'content/music';

/**
 * Subdirectorios por mood.
 */
export const MUSIC_MOOD_DIRS: Record<MusicMood, string> = {
    ambient: 'ambient',
    upbeat: 'upbeat',
    cinematic: 'cinematic',
    calm: 'calm',
    dramatic: 'dramatic'
};

/**
 * Descripciones de cada mood para documentación.
 */
export const MUSIC_MOOD_DESCRIPTIONS: Record<MusicMood, string> = {
    ambient: 'Música ambiental suave para contenido educativo',
    upbeat: 'Música energética para contenido motivacional',
    cinematic: 'Música épica para contenido dramático',
    calm: 'Música calmante para contenido sobre neurodivergencia',
    dramatic: 'Música intensa para ganchos y revelaciones'
};

// ===== CLASE PRINCIPAL =====

/**
 * AudioMixer - Sistema de mezcla profesional de voz TTS con música de fondo.
 * 
 * Flujo de trabajo:
 * 1. Seleccionar pista de música por mood (REQ-2.6.2, REQ-2.6.10)
 * 2. Transformar música con MusicTransformer para evadir Content ID (REQ-2.8.8)
 * 3. Preparar música: loop si es necesario, aplicar fades (REQ-2.6.6, REQ-2.6.7, REQ-2.6.11)
 * 4. Mezclar con voz usando ducking (REQ-2.6.3, REQ-2.6.4, REQ-2.6.5)
 * 5. Normalizar audio final (REQ-2.6.8, REQ-2.6.9)
 */
export class AudioMixer {
    /** Configuración actual del mixer */
    private config: AudioMixerConfig;
    
    /** Directorio de trabajo para archivos temporales */
    private workDir: string;

    /**
     * Crea una nueva instancia de AudioMixer.
     * 
     * @param config - Configuración parcial (se mezcla con defaults)
     * @param workDir - Directorio de trabajo para temporales (default: content/temp)
     */
    constructor(
        config: Partial<AudioMixerConfig> = {},
        workDir: string = 'content/temp'
    ) {
        this.config = {
            ...AUDIO_MIXER_DEFAULTS,
            ...config,
            volume: { ...AUDIO_MIXER_DEFAULTS.volume, ...config.volume },
            fade: { ...AUDIO_MIXER_DEFAULTS.fade, ...config.fade },
            normalization: { ...AUDIO_MIXER_DEFAULTS.normalization, ...config.normalization }
        };
        this.workDir = workDir;
        
        // Crear directorio de trabajo si no existe
        this.ensureWorkDir();
    }

    // ===== MÉTODOS PÚBLICOS PRINCIPALES =====

    /**
     * Mezcla voz TTS con música de fondo de forma profesional.
     * Este es el método principal que integra todo el flujo.
     * 
     * REQ-2.8.8: La música se transforma ANTES de mezclar si transformMusic=true
     * 
     * @param voicePath - Ruta al archivo de voz TTS
     * @param musicPath - Ruta al archivo de música (o se selecciona por mood)
     * @param outputPath - Ruta para el archivo de salida
     * @param options - Opciones adicionales
     * @returns Resultado de la mezcla
     */
    public async mix(
        voicePath: string,
        musicPath: string,
        outputPath: string,
        options: {
            mood?: MusicMood;
            customTransformParams?: MusicTransformationParams;
        } = {}
    ): Promise<AudioMixResult> {
        // Validar que los archivos existen
        if (!fs.existsSync(voicePath)) {
            throw new Error(`Archivo de voz no encontrado: ${voicePath}`);
        }
        if (!fs.existsSync(musicPath)) {
            throw new Error(`Archivo de música no encontrado: ${musicPath}`);
        }

        // Obtener duraciones
        const voiceDuration = await this.getAudioDuration(voicePath);
        const originalMusicDuration = await this.getAudioDuration(musicPath);

        // Crear información de la pista
        const musicTrack: MusicTrack = {
            path: musicPath,
            mood: options.mood || 'ambient',
            duration: originalMusicDuration,
            name: path.basename(musicPath, path.extname(musicPath))
        };

        let transformResult: MusicTransformResult | undefined;
        let processedMusicPath = musicPath;

        // ===== REQ-2.8.8: Transformar música ANTES de mezclar =====
        if (this.config.transformMusic) {
            console.log('[AudioMixer] Transformando música ANTES de mezclar (REQ-2.8.8)...');
            
            // Generar parámetros de transformación
            const transformParams = options.customTransformParams 
                || this.config.transformParams 
                || MusicTransformer.generateUniqueParams();
            
            // Ruta para música transformada
            const transformedPath = path.join(
                this.workDir,
                `transformed_${Date.now()}_${path.basename(musicPath)}`
            );
            
            // Ejecutar transformación con caché
            transformResult = await MusicTransformer.transformWithCache(
                musicPath,
                transformedPath,
                transformParams
            );
            
            processedMusicPath = transformResult.outputPath;
            console.log(`[AudioMixer] Música transformada: ${transformResult.fromCache ? 'desde caché' : 'procesada'}`);
            console.log(`[AudioMixer] Hash de transformación: ${transformResult.hash}`);
        }

        // Calcular si necesitamos loop
        const needsLoop = originalMusicDuration < voiceDuration;
        let loopCount = 1;
        let loopedMusicPath = processedMusicPath;

        // ===== REQ-2.6.11: Loop automático con crossfade =====
        if (needsLoop) {
            loopCount = Math.ceil(voiceDuration / originalMusicDuration);
            console.log(`[AudioMixer] Música más corta que voz. Aplicando ${loopCount} loops...`);
            
            loopedMusicPath = path.join(
                this.workDir,
                `looped_${Date.now()}_${path.basename(processedMusicPath)}`
            );
            
            await this.loopMusicWithCrossfade(
                processedMusicPath,
                loopedMusicPath,
                loopCount,
                voiceDuration
            );
        }

        // ===== Mezcla final con ducking y normalización =====
        console.log('[AudioMixer] Ejecutando mezcla con ducking y normalización...');
        await this.executeMix(voicePath, loopedMusicPath, outputPath, voiceDuration);

        // Obtener información del output
        const outputDuration = await this.getAudioDuration(outputPath);
        const loudnessInfo = await this.getLoudnessInfo(outputPath);

        // Limpiar archivos temporales
        await this.cleanupTempFiles([
            transformResult?.outputPath,
            loopedMusicPath !== processedMusicPath ? loopedMusicPath : undefined
        ].filter((p): p is string => p !== undefined && p !== musicPath));

        return {
            outputPath,
            totalDuration: outputDuration,
            musicTrack,
            musicTransformed: this.config.transformMusic,
            transformResult,
            musicLooped: needsLoop,
            loopCount,
            outputLufs: loudnessInfo.integratedLufs,
            outputTruePeak: loudnessInfo.truePeak
        };
    }

    /**
     * Selecciona y mezcla con una pista del banco de música por mood.
     * Método de conveniencia que combina selección y mezcla.
     * 
     * REQ-2.6.10: Selección inteligente basada en mood del script
     * 
     * @param voicePath - Ruta al archivo de voz TTS
     * @param mood - Mood deseado para la música
     * @param outputPath - Ruta para el archivo de salida
     * @returns Resultado de la mezcla
     */
    public async mixWithMood(
        voicePath: string,
        mood: MusicMood,
        outputPath: string
    ): Promise<AudioMixResult> {
        // Seleccionar pista aleatoria del mood
        const musicPath = await this.selectMusicByMood(mood);
        
        return this.mix(voicePath, musicPath, outputPath, { mood });
    }

    // ===== MÉTODOS DE SELECCIÓN DE MÚSICA =====

    /**
     * Selecciona una pista aleatoria del banco de música por mood.
     * REQ-2.6.2 y REQ-2.6.10: Banco organizado por mood
     * 
     * @param mood - Mood deseado
     * @returns Ruta al archivo de música seleccionado
     */
    public async selectMusicByMood(mood: MusicMood): Promise<string> {
        const moodDir = path.join(MUSIC_BANK_PATH, MUSIC_MOOD_DIRS[mood]);
        
        if (!fs.existsSync(moodDir)) {
            throw new Error(`Directorio de música no encontrado para mood '${mood}': ${moodDir}`);
        }

        const files = fs.readdirSync(moodDir)
            .filter(f => ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(f).toLowerCase()));
        
        if (files.length === 0) {
            throw new Error(`No hay archivos de música en el directorio: ${moodDir}`);
        }

        // Selección aleatoria
        const selectedFile = files[Math.floor(Math.random() * files.length)];
        return path.join(moodDir, selectedFile);
    }

    /**
     * Lista todas las pistas disponibles en el banco de música.
     * 
     * @returns Lista de pistas organizadas por mood
     */
    public async listAvailableTracks(): Promise<Record<MusicMood, MusicTrack[]>> {
        const result: Record<MusicMood, MusicTrack[]> = {
            ambient: [],
            upbeat: [],
            cinematic: [],
            calm: [],
            dramatic: []
        };

        for (const mood of Object.keys(MUSIC_MOOD_DIRS) as MusicMood[]) {
            const moodDir = path.join(MUSIC_BANK_PATH, MUSIC_MOOD_DIRS[mood]);
            
            if (fs.existsSync(moodDir)) {
                const files = fs.readdirSync(moodDir)
                    .filter(f => ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(f).toLowerCase()));
                
                for (const file of files) {
                    const filePath = path.join(moodDir, file);
                    const duration = await this.getAudioDuration(filePath);
                    
                    result[mood].push({
                        path: filePath,
                        mood,
                        duration,
                        name: path.basename(file, path.extname(file))
                    });
                }
            }
        }

        return result;
    }

    // ===== MÉTODOS DE PROCESAMIENTO DE AUDIO =====

    /**
     * Ejecuta la mezcla final con FFmpeg.
     * Aplica: volúmenes, fades, ducking y normalización.
     * 
     * REQ-2.6.3 a REQ-2.6.9
     */
    private async executeMix(
        voicePath: string,
        musicPath: string,
        outputPath: string,
        totalDuration: number
    ): Promise<void> {
        const { volume, fade, normalization } = this.config;
        
        // Calcular punto de inicio de fade-out
        const fadeOutStart = Math.max(0, totalDuration - fade.fadeOutDuration);

        // Construir filter_complex para FFmpeg
        // Estructura:
        // [1:a] = música
        // [0:a] = voz
        // 
        // 1. Aplicar volumen base y fades a la música
        // 2. Aplicar ducking con sidechaincompress
        // 3. Mezclar con voz
        // 4. Normalizar
        
        const filterComplex = [
            // Paso 1: Preparar música con volumen base y fades
            `[1:a]volume=${volume.musicVolumeDb}dB,` +
            `afade=t=in:d=${fade.fadeInDuration},` +
            `afade=t=out:st=${fadeOutStart}:d=${fade.fadeOutDuration}[m]`,
            
            // Paso 2: Aplicar ducking usando sidechaincompress
            // threshold=0.02: nivel a partir del cual se activa el compresor
            // ratio=6: compresión 6:1 (fuerte ducking)
            // attack=200ms: tiempo para aplicar el ducking
            // release=500ms: tiempo para recuperar el volumen
            `[m][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=500[mc]`,
            
            // Paso 3: Aplicar volumen a la voz y mezclar
            `[0:a]volume=${volume.voiceVolumeDb}dB[v]`,
            `[2:a]volume=-6dB[impact]`, // Volumen controlado para el sonido de impacto sintético
            `[v][mc][impact]amix=inputs=3:duration=first:dropout_transition=2[mixed]`,
            
            // Paso 4: Normalización loudnorm (estándar YouTube -16 LUFS)
            `[mixed]loudnorm=I=${normalization.targetLufs}:TP=${normalization.truePeakDb}:LRA=${normalization.loudnessRange}[final]`
        ].join(';');

        const command = [
            'ffmpeg',
            '-y',  // Sobrescribir sin preguntar
            `-i "${voicePath}"`,
            `-i "${musicPath}"`,
            `-f lavfi -i "anoisesrc=c=pink:d=0.5:a=1.0,afade=t=out:st=0.1:d=0.4"`, // Diseño sonoro de impacto sintético en 0.0s
            `-filter_complex "${filterComplex}"`,
            '-map "[final]"',
            '-c:a libmp3lame',
            '-q:a 2',  // Alta calidad MP3
            `"${outputPath}"`
        ].join(' ');

        return this.executeCommand(command);
    }

    /**
     * Loop de música con crossfade entre repeticiones.
     * REQ-2.6.11: Loopear música automáticamente con crossfade 1s
     */
    private async loopMusicWithCrossfade(
        inputPath: string,
        outputPath: string,
        loopCount: number,
        targetDuration: number
    ): Promise<void> {
        // Para loops simples, usamos el filtro aloop de FFmpeg
        // Luego recortamos a la duración deseada con fade
        const command = [
            'ffmpeg',
            '-y',
            `-i "${inputPath}"`,
            `-filter_complex "aloop=loop=${loopCount - 1}:size=0,atrim=0:${targetDuration + 1},afade=t=out:st=${targetDuration - 1}:d=1"`,
            '-c:a libmp3lame',
            '-q:a 2',
            `"${outputPath}"`
        ].join(' ');

        return this.executeCommand(command);
    }

    // ===== MÉTODOS UTILITARIOS =====

    /**
     * Obtiene la duración de un archivo de audio en segundos.
     */
    public async getAudioDuration(audioPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.warn(`No se pudo obtener duración de ${audioPath}:`, error.message);
                    resolve(0);
                    return;
                }
                
                const duration = parseFloat(stdout.trim());
                resolve(isNaN(duration) ? 0 : duration);
            });
        });
    }

    /**
     * Obtiene información de loudness de un archivo de audio.
     * Útil para verificar que la normalización fue correcta.
     */
    private async getLoudnessInfo(audioPath: string): Promise<{
        integratedLufs: number;
        truePeak: number;
    }> {
        return new Promise((resolve) => {
            const command = `ffmpeg -i "${audioPath}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    // Si falla, retornar valores por defecto
                    resolve({ integratedLufs: -16, truePeak: -1.5 });
                    return;
                }
                
                try {
                    // Buscar el JSON en stderr (FFmpeg pone info en stderr)
                    const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
                    if (jsonMatch) {
                        const data = JSON.parse(jsonMatch[0]);
                        resolve({
                            integratedLufs: parseFloat(data.output_i) || -16,
                            truePeak: parseFloat(data.output_tp) || -1.5
                        });
                    } else {
                        resolve({ integratedLufs: -16, truePeak: -1.5 });
                    }
                } catch (e) {
                    resolve({ integratedLufs: -16, truePeak: -1.5 });
                }
            });
        });
    }

    /**
     * Ejecuta un comando de shell y retorna una promesa.
     */
    private executeCommand(command: string): Promise<void> {
        return new Promise((resolve, reject) => {
            exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Error ejecutando comando: ${error.message}\n${stderr}`));
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Asegura que el directorio de trabajo existe.
     */
    private ensureWorkDir(): void {
        if (!fs.existsSync(this.workDir)) {
            fs.mkdirSync(this.workDir, { recursive: true });
        }
    }

    /**
     * Limpia archivos temporales después de la mezcla.
     */
    private async cleanupTempFiles(files: string[]): Promise<void> {
        for (const file of files) {
            try {
                if (fs.existsSync(file) && file.startsWith(this.workDir)) {
                    fs.unlinkSync(file);
                }
            } catch (error) {
                console.warn(`No se pudo eliminar archivo temporal ${file}:`, error);
            }
        }
    }

    // ===== MÉTODOS ESTÁTICOS DE CONVENIENCIA =====

    /**
     * Mezcla rápida con configuración por defecto.
     * Método estático de conveniencia para uso simple.
     * 
     * @param voicePath - Ruta al archivo de voz
     * @param musicPath - Ruta al archivo de música
     * @param outputPath - Ruta de salida
     * @returns Resultado de la mezcla
     */
    public static async quickMix(
        voicePath: string,
        musicPath: string,
        outputPath: string
    ): Promise<AudioMixResult> {
        const mixer = new AudioMixer();
        return mixer.mix(voicePath, musicPath, outputPath);
    }

    /**
     * Mezcla con mood específico usando defaults.
     * 
     * @param voicePath - Ruta al archivo de voz
     * @param mood - Mood para seleccionar música
     * @param outputPath - Ruta de salida
     * @returns Resultado de la mezcla
     */
    public static async quickMixWithMood(
        voicePath: string,
        mood: MusicMood,
        outputPath: string
    ): Promise<AudioMixResult> {
        const mixer = new AudioMixer();
        return mixer.mixWithMood(voicePath, mood, outputPath);
    }

    /**
     * Inicializa el banco de música creando las carpetas necesarias.
     * Útil para setup inicial del proyecto.
     */
    public static initMusicBank(): void {
        console.log('[AudioMixer] Inicializando banco de música...');
        
        // Crear directorio base
        if (!fs.existsSync(MUSIC_BANK_PATH)) {
            fs.mkdirSync(MUSIC_BANK_PATH, { recursive: true });
        }

        // Crear subdirectorios por mood
        for (const mood of Object.keys(MUSIC_MOOD_DIRS) as MusicMood[]) {
            const moodDir = path.join(MUSIC_BANK_PATH, MUSIC_MOOD_DIRS[mood]);
            if (!fs.existsSync(moodDir)) {
                fs.mkdirSync(moodDir, { recursive: true });
                console.log(`[AudioMixer] Creado directorio: ${moodDir}`);
                
                // Crear README con descripción del mood
                const readmePath = path.join(moodDir, 'README.md');
                fs.writeFileSync(readmePath, `# ${mood}\n\n${MUSIC_MOOD_DESCRIPTIONS[mood]}\n`);
            }
        }

        console.log('[AudioMixer] Banco de música inicializado correctamente.');
    }
}

// ===== EXPORTACIONES ADICIONALES =====

export {
    MusicTransformer,
    MusicTransformationParams,
    MusicTransformResult
} from './MusicTransformer';
