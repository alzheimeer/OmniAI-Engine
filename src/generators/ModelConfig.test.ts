/**
 * Tests unitarios para ModelConfig
 * Verifica la configuración de modelos Wan y resoluciones
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelConfig, MODEL_FILES, STYLE_PARAMS, Resolution } from './ModelConfig';

describe('ModelConfig', () => {
    // Resetear el singleton antes de cada test
    beforeEach(() => {
        ModelConfig.resetInstance();
    });

    afterEach(() => {
        // Limpiar mocks de variables de entorno
        vi.unstubAllEnvs();
        ModelConfig.resetInstance();
    });

    describe('getResolution', () => {
        it('debería retornar resolución portrait 576x1024 para videos short', () => {
            const config = ModelConfig.getInstance();
            const resolution = config.getResolution('short');
            
            expect(resolution.width).toBe(576);
            expect(resolution.height).toBe(1024);
            // Verificar que es portrait (ancho < alto)
            expect(resolution.width).toBeLessThan(resolution.height);
        });

        it('debería retornar resolución landscape 832x480 para videos long', () => {
            const config = ModelConfig.getInstance();
            const resolution = config.getResolution('long');
            
            expect(resolution.width).toBe(832);
            expect(resolution.height).toBe(480);
            // Verificar que es landscape (ancho > alto)
            expect(resolution.width).toBeGreaterThan(resolution.height);
        });

        it('las resoluciones por defecto deben ser múltiplos de 16', () => {
            const config = ModelConfig.getInstance();
            
            const shortRes = config.getResolution('short');
            expect(shortRes.width % 16).toBe(0);
            expect(shortRes.height % 16).toBe(0);
            
            const longRes = config.getResolution('long');
            expect(longRes.width % 16).toBe(0);
            expect(longRes.height % 16).toBe(0);
        });
    });

    describe('Configuración de resolución via variables de entorno', () => {
        it('debería leer COMFYUI_SHORT_RESOLUTION desde variables de entorno', () => {
            vi.stubEnv('COMFYUI_SHORT_RESOLUTION', '640x1136');
            
            const config = ModelConfig.getInstance();
            const resolution = config.getResolution('short');
            
            expect(resolution.width).toBe(640);
            expect(resolution.height).toBe(1136);
        });

        it('debería leer COMFYUI_LONG_RESOLUTION desde variables de entorno', () => {
            vi.stubEnv('COMFYUI_LONG_RESOLUTION', '1280x720');
            
            const config = ModelConfig.getInstance();
            const resolution = config.getResolution('long');
            
            expect(resolution.width).toBe(1280);
            expect(resolution.height).toBe(720);
        });

        it('debería lanzar error si COMFYUI_SHORT_RESOLUTION no es múltiplo de 16', () => {
            vi.stubEnv('COMFYUI_SHORT_RESOLUTION', '577x1024');
            
            expect(() => ModelConfig.getInstance()).toThrow(/múltiplo de 16/);
        });

        it('debería lanzar error si el alto no es múltiplo de 16', () => {
            vi.stubEnv('COMFYUI_LONG_RESOLUTION', '832x481');
            
            expect(() => ModelConfig.getInstance()).toThrow(/múltiplo de 16/);
        });

        it('debería lanzar error si formato de resolución es inválido', () => {
            vi.stubEnv('COMFYUI_SHORT_RESOLUTION', '576-1024');
            
            expect(() => ModelConfig.getInstance()).toThrow(/Formato de resolución inválido/);
        });

        it('debería lanzar error si formato contiene caracteres no numéricos', () => {
            vi.stubEnv('COMFYUI_SHORT_RESOLUTION', 'ABCxDEF');
            
            expect(() => ModelConfig.getInstance()).toThrow(/Formato de resolución inválido/);
        });
    });

    describe('COMFYUI_DEFAULT_FRAMES', () => {
        it('debería usar 49 frames por defecto si no se especifica', () => {
            const config = ModelConfig.getInstance();
            expect(config.getConfig().defaultFrames).toBe(49);
        });

        it('debería leer COMFYUI_DEFAULT_FRAMES desde variables de entorno', () => {
            vi.stubEnv('COMFYUI_DEFAULT_FRAMES', '33');
            
            const config = ModelConfig.getInstance();
            expect(config.getConfig().defaultFrames).toBe(33);
        });

        it('debería lanzar error si COMFYUI_DEFAULT_FRAMES no es un número válido', () => {
            vi.stubEnv('COMFYUI_DEFAULT_FRAMES', 'abc');
            
            expect(() => ModelConfig.getInstance()).toThrow(/COMFYUI_DEFAULT_FRAMES inválido/);
        });

        it('debería lanzar error si COMFYUI_DEFAULT_FRAMES es menor que 1', () => {
            vi.stubEnv('COMFYUI_DEFAULT_FRAMES', '0');
            
            expect(() => ModelConfig.getInstance()).toThrow(/COMFYUI_DEFAULT_FRAMES inválido/);
        });
    });

    describe('validateVideoSourceMode', () => {
        it('debería retornar "hybrid" si VIDEO_SOURCE_MODE no está definida', () => {
            const result = ModelConfig.validateVideoSourceMode(undefined);
            expect(result).toBe('hybrid');
        });

        it('debería retornar "hybrid" si VIDEO_SOURCE_MODE es string vacío', () => {
            const result = ModelConfig.validateVideoSourceMode('');
            expect(result).toBe('hybrid');
        });

        it('debería aceptar "comfyui" como modo válido', () => {
            const result = ModelConfig.validateVideoSourceMode('comfyui');
            expect(result).toBe('comfyui');
        });

        it('debería aceptar "pexels" como modo válido', () => {
            const result = ModelConfig.validateVideoSourceMode('pexels');
            expect(result).toBe('pexels');
        });

        it('debería aceptar "hybrid" como modo válido', () => {
            const result = ModelConfig.validateVideoSourceMode('hybrid');
            expect(result).toBe('hybrid');
        });

        it('debería lanzar error si el modo es inválido', () => {
            expect(() => ModelConfig.validateVideoSourceMode('invalid')).toThrow(
                /Valor inválido para VIDEO_SOURCE_MODE/
            );
        });

        it('debería lanzar error si el modo tiene mayúsculas (case sensitive)', () => {
            expect(() => ModelConfig.validateVideoSourceMode('COMFYUI')).toThrow(
                /Valor inválido para VIDEO_SOURCE_MODE/
            );
        });
    });

    describe('Singleton pattern', () => {
        it('debería retornar la misma instancia en múltiples llamadas', () => {
            const instance1 = ModelConfig.getInstance();
            const instance2 = ModelConfig.getInstance();
            
            expect(instance1).toBe(instance2);
        });

        it('resetInstance debería permitir crear una nueva instancia', () => {
            const instance1 = ModelConfig.getInstance();
            ModelConfig.resetInstance();
            const instance2 = ModelConfig.getInstance();
            
            expect(instance1).not.toBe(instance2);
        });
    });

    describe('getModelFiles', () => {
        it('debería retornar archivos correctos para wan22_5B por defecto', () => {
            const config = ModelConfig.getInstance();
            const files = config.getModelFiles();
            
            expect(files).toEqual(MODEL_FILES.wan22_5B);
            expect(files.unetModel).toBe('wan2.2_ti2v_5B_fp16.safetensors');
            expect(files.clipModel).toBe('umt5_xxl_fp8_e4m3fn_scaled.safetensors');
            expect(files.vaeModel).toBe('wan2.2_vae.safetensors');
        });

        it('debería retornar archivos correctos para wan21_1_3B si está configurado', () => {
            vi.stubEnv('COMFYUI_MODEL', 'wan21_1_3B');
            
            const config = ModelConfig.getInstance();
            const files = config.getModelFiles();
            
            expect(files).toEqual(MODEL_FILES.wan21_1_3B);
            expect(files.unetModel).toBe('wan2.1_t2v_1.3B.safetensors');
            expect(files.clipModel).toBe('umt5-xxl-enc-fp8_e4m3fn.safetensors');
            expect(files.vaeModel).toBe('Wan2_1_VAE_bf16.safetensors');
        });

        it('debería lanzar error si COMFYUI_MODEL tiene valor inválido', () => {
            vi.stubEnv('COMFYUI_MODEL', 'invalid_model');
            
            expect(() => ModelConfig.getInstance()).toThrow(/Valor inválido para COMFYUI_MODEL/);
        });
    });

    describe('getStyleParams', () => {
        it('debería retornar parámetros correctos para cinemagraph_plotagraph', () => {
            const config = ModelConfig.getInstance();
            const params = config.getStyleParams('cinemagraph_plotagraph');
            
            expect(params.frames).toBe(33);
            expect(params.motionType).toBe('minimal');
            expect(params.stabilityHigh).toBe(true);
            expect(params.promptSuffix).toContain('subtle motion');
        });

        it('debería retornar parámetros correctos para moody_lofi_ambient', () => {
            const config = ModelConfig.getInstance();
            const params = config.getStyleParams('moody_lofi_ambient');
            
            expect(params.frames).toBe(49);
            expect(params.motionType).toBe('atmospheric');
            expect(params.stabilityHigh).toBe(false);
            expect(params.promptSuffix).toContain('lo-fi');
        });

        it('debería retornar parámetros correctos para analog_horror_liminal', () => {
            const config = ModelConfig.getInstance();
            const params = config.getStyleParams('analog_horror_liminal');
            
            expect(params.frames).toBe(49);
            expect(params.motionType).toBe('slow_unsettling');
            expect(params.stabilityHigh).toBe(false);
            expect(params.promptSuffix).toContain('liminal space');
        });
    });

    describe('getPreset', () => {
        it('debería retornar preset fast con parámetros correctos', () => {
            const config = ModelConfig.getInstance();
            const preset = config.getPreset('fast');
            
            expect(preset.name).toBe('fast');
            expect(preset.width).toBe(480);
            expect(preset.height).toBe(288);
            expect(preset.frames).toBe(17);
            expect(preset.steps).toBe(12);
        });

        it('debería retornar preset balanced con parámetros correctos', () => {
            const config = ModelConfig.getInstance();
            const preset = config.getPreset('balanced');
            
            expect(preset.name).toBe('balanced');
            expect(preset.width).toBe(576);
            expect(preset.height).toBe(320);
        });

        it('debería retornar preset quality con parámetros correctos', () => {
            const config = ModelConfig.getInstance();
            const preset = config.getPreset('quality');
            
            expect(preset.name).toBe('quality');
            expect(preset.width).toBe(672);
            expect(preset.height).toBe(384);
            expect(preset.steps).toBe(20);
        });

        it('debería lanzar error si el preset no existe', () => {
            const config = ModelConfig.getInstance();
            
            expect(() => config.getPreset('ultra')).toThrow(/Preset no encontrado/);
        });
    });
});
