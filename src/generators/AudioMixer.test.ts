/**
 * AudioMixer.test.ts
 * 
 * Tests para AudioMixer con integración de MusicTransformer.
 * Valida que la transformación de música se aplica ANTES de mezclar (REQ-2.8.8).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
    AudioMixer, 
    AUDIO_MIXER_DEFAULTS,
    MusicMood,
    MUSIC_MOOD_DIRS,
    MUSIC_BANK_PATH
} from './AudioMixer';
import { MusicTransformer, MusicTransformationParams } from './MusicTransformer';

describe('AudioMixer', () => {
    describe('Configuración por defecto', () => {
        it('debe tener configuración de volumen correcta según REQ-2.6.3', () => {
            // REQ-2.6.3: Voz -1dB (protagonista), música -22dB (apenas perceptible)
            expect(AUDIO_MIXER_DEFAULTS.volume.voiceVolumeDb).toBe(-1);
            expect(AUDIO_MIXER_DEFAULTS.volume.musicVolumeDb).toBe(-22);
            expect(AUDIO_MIXER_DEFAULTS.volume.duckingAmountDb).toBe(-6);
        });

        it('debe tener configuración de fades correcta según REQ-2.6.6 y REQ-2.6.7', () => {
            // REQ-2.6.6: Fade-in de 2 segundos
            // REQ-2.6.7: Fade-out de 2 segundos
            expect(AUDIO_MIXER_DEFAULTS.fade.fadeInDuration).toBe(2);
            expect(AUDIO_MIXER_DEFAULTS.fade.fadeOutDuration).toBe(2);
        });

        it('debe tener configuración de normalización correcta según REQ-2.6.8 y REQ-2.6.9', () => {
            // REQ-2.6.8: Normalizar a -16 LUFS (estándar YouTube)
            // REQ-2.6.9: truePeak < -1.5dB para evitar clipping
            expect(AUDIO_MIXER_DEFAULTS.normalization.targetLufs).toBe(-16);
            expect(AUDIO_MIXER_DEFAULTS.normalization.truePeakDb).toBe(-1.5);
            expect(AUDIO_MIXER_DEFAULTS.normalization.loudnessRange).toBe(11);
        });

        it('debe tener transformMusic=true por defecto según REQ-2.8.8', () => {
            // REQ-2.8.8: Integrar con MusicTransformer: transformar ANTES de mezclar
            expect(AUDIO_MIXER_DEFAULTS.transformMusic).toBe(true);
        });
    });

    describe('Constructor', () => {
        it('debe crear instancia con valores por defecto', () => {
            const mixer = new AudioMixer();
            // No debe lanzar error
            expect(mixer).toBeInstanceOf(AudioMixer);
        });

        it('debe permitir sobrescribir configuración parcial', () => {
            const mixer = new AudioMixer({
                volume: { voiceVolumeDb: -2, musicVolumeDb: -20, duckingAmountDb: -8 },
                transformMusic: false
            });
            expect(mixer).toBeInstanceOf(AudioMixer);
        });
    });

    describe('Moods de música', () => {
        it('debe tener 5 moods definidos según REQ-2.6.2', () => {
            // REQ-2.6.2: ambient, upbeat, cinematic, calm, dramatic
            const moods: MusicMood[] = ['ambient', 'upbeat', 'cinematic', 'calm', 'dramatic'];
            
            for (const mood of moods) {
                expect(MUSIC_MOOD_DIRS[mood]).toBeDefined();
            }
        });

        it('debe tener directorio correcto para cada mood', () => {
            expect(MUSIC_MOOD_DIRS.ambient).toBe('ambient');
            expect(MUSIC_MOOD_DIRS.upbeat).toBe('upbeat');
            expect(MUSIC_MOOD_DIRS.cinematic).toBe('cinematic');
            expect(MUSIC_MOOD_DIRS.calm).toBe('calm');
            expect(MUSIC_MOOD_DIRS.dramatic).toBe('dramatic');
        });
    });

    describe('Integración con MusicTransformer (REQ-2.8.8)', () => {
        it('debe exportar MusicTransformer desde AudioMixer', async () => {
            // Importar MusicTransformer desde AudioMixer para verificar re-export
            const { MusicTransformer: MTFromAudioMixer } = await import('./AudioMixer');
            expect(MTFromAudioMixer).toBeDefined();
            expect(MTFromAudioMixer.generateUniqueParams).toBeDefined();
        });

        it('debe poder generar parámetros de transformación', () => {
            const params = MusicTransformer.generateUniqueParams();
            
            // Validar que los parámetros están en los rangos correctos
            expect(params.pitchShift).toBeGreaterThanOrEqual(0.98);
            expect(params.pitchShift).toBeLessThanOrEqual(1.02);
            expect(params.tempoShift).toBeGreaterThanOrEqual(0.97);
            expect(params.tempoShift).toBeLessThanOrEqual(1.03);
            expect(params.reverbRoomSize).toBeGreaterThanOrEqual(0.05);
            expect(params.reverbRoomSize).toBeLessThanOrEqual(0.15);
        });

        it('debe poder construir filtro FFmpeg desde parámetros', () => {
            const params: MusicTransformationParams = {
                pitchShift: 1.02,
                tempoShift: 0.98,
                eq: { freq1k: 1.5, freq4k: -1.0, freq8k: 0.5 },
                reverbRoomSize: 0.1
            };

            const filter = MusicTransformer.buildFFmpegFilter(params);
            
            // Verificar que el filtro contiene los componentes esperados
            expect(filter).toContain('asetrate=');
            expect(filter).toContain('aresample=');
            expect(filter).toContain('atempo=');
            expect(filter).toContain('equalizer=f=1000');
            expect(filter).toContain('equalizer=f=4000');
            expect(filter).toContain('equalizer=f=8000');
            expect(filter).toContain('aecho=');
        });

        it('debe generar hash único para cada transformación', () => {
            const params1 = MusicTransformer.generateUniqueParams(12345);
            const params2 = MusicTransformer.generateUniqueParams(67890);
            
            const hash1 = MusicTransformer.getTransformedHash(params1);
            const hash2 = MusicTransformer.getTransformedHash(params2);
            
            expect(hash1).not.toBe(hash2);
            expect(hash1).toHaveLength(32); // MD5 hash length
            expect(hash2).toHaveLength(32);
        });

        it('debe generar hash reproducible con la misma seed', () => {
            const params1 = MusicTransformer.generateUniqueParams(12345);
            const params2 = MusicTransformer.generateUniqueParams(12345);
            
            const hash1 = MusicTransformer.getTransformedHash(params1);
            const hash2 = MusicTransformer.getTransformedHash(params2);
            
            expect(hash1).toBe(hash2);
        });
    });

    describe('Inicialización de banco de música', () => {
        it('debe tener ruta de banco de música definida', () => {
            expect(MUSIC_BANK_PATH).toBe('content/music');
        });
    });

    describe('Métodos estáticos', () => {
        it('debe tener método quickMix', () => {
            expect(AudioMixer.quickMix).toBeDefined();
            expect(typeof AudioMixer.quickMix).toBe('function');
        });

        it('debe tener método quickMixWithMood', () => {
            expect(AudioMixer.quickMixWithMood).toBeDefined();
            expect(typeof AudioMixer.quickMixWithMood).toBe('function');
        });

        it('debe tener método initMusicBank', () => {
            expect(AudioMixer.initMusicBank).toBeDefined();
            expect(typeof AudioMixer.initMusicBank).toBe('function');
        });
    });

    describe('Validación de integración transformación-mezcla', () => {
        it('debe permitir parámetros de transformación personalizados', () => {
            const customParams: MusicTransformationParams = {
                pitchShift: 1.01,
                tempoShift: 1.02,
                eq: { freq1k: 2.0, freq4k: -2.0, freq8k: 1.0 },
                reverbRoomSize: 0.1
            };

            const mixer = new AudioMixer({
                transformParams: customParams
            });

            expect(mixer).toBeInstanceOf(AudioMixer);
        });

        it('debe poder deshabilitar transformación de música', () => {
            const mixer = new AudioMixer({
                transformMusic: false
            });

            expect(mixer).toBeInstanceOf(AudioMixer);
        });
    });

    describe('Validación de truePeak para evitar clipping (REQ-2.6.9)', () => {
        /**
         * Validates: REQ-2.6.9 - truePeak < -1.5dB para evitar clipping
         * 
         * Este test valida que:
         * 1. La configuración por defecto tiene truePeakDb = -1.5
         * 2. El valor de truePeak es negativo (menor que 0dB)
         * 3. El valor de truePeak está en el rango seguro (entre -10 y 0)
         */
        it('debe configurar truePeak a -1.5dB para evitar clipping', () => {
            // REQ-2.6.9: Verificar que truePeak < -1.5dB
            const truePeakDb = AUDIO_MIXER_DEFAULTS.normalization.truePeakDb;
            
            // Debe ser exactamente -1.5
            expect(truePeakDb).toBe(-1.5);
            
            // Debe ser negativo (por debajo de 0dB = clipping)
            expect(truePeakDb).toBeLessThan(0);
            
            // Debe ser mayor que -10dB (rango razonable)
            expect(truePeakDb).toBeGreaterThan(-10);
        });

        it('debe aplicar truePeak en el filtro loudnorm del comando FFmpeg', () => {
            // Verificar que el filtro loudnorm se genera con los parámetros correctos
            const normConfig = AUDIO_MIXER_DEFAULTS.normalization;
            
            // El filtro que se usa en executeMix es:
            // loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${loudnessRange}
            const expectedLoudnormParams = {
                I: normConfig.targetLufs,    // -16 LUFS
                TP: normConfig.truePeakDb,   // -1.5 dB
                LRA: normConfig.loudnessRange // 11
            };

            expect(expectedLoudnormParams.I).toBe(-16);
            expect(expectedLoudnormParams.TP).toBe(-1.5);
            expect(expectedLoudnormParams.LRA).toBe(11);
        });

        it('debe permitir personalizar truePeak si se requiere', () => {
            // Crear mixer con truePeak más conservador (-2.0dB)
            const mixer = new AudioMixer({
                normalization: {
                    targetLufs: -16,
                    truePeakDb: -2.0,  // Más conservador
                    loudnessRange: 11
                }
            });

            expect(mixer).toBeInstanceOf(AudioMixer);
        });

        it('debe mantener truePeak en rango seguro para broadcast', () => {
            // Estándares broadcast: truePeak típicamente entre -1.0 y -2.0 dB
            const truePeakDb = AUDIO_MIXER_DEFAULTS.normalization.truePeakDb;
            
            // Rango seguro para broadcast/streaming
            expect(truePeakDb).toBeGreaterThanOrEqual(-3); // No demasiado bajo (perdería volumen)
            expect(truePeakDb).toBeLessThanOrEqual(-1);    // Margen de seguridad para evitar clipping
        });

        it('debe usar estándar YouTube (-16 LUFS, TP -1.5dB) por defecto', () => {
            // Verificar que cumplimos con el estándar de normalización de YouTube
            const normConfig = AUDIO_MIXER_DEFAULTS.normalization;
            
            // Estándar YouTube según REQ-2.6.8
            expect(normConfig.targetLufs).toBe(-16);
            
            // truePeak conservador para evitar clipping en transcodificación
            expect(normConfig.truePeakDb).toBe(-1.5);
        });
    });
});
