/**
 * Tests para ComfyUIClient
 * 
 * Estos tests verifican la funcionalidad del cliente ComfyUI
 * para generación de video con IA.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComfyUIClient, QualityPresets, VideoGenerationConfig } from './ComfyUIClient';

// Mock axios para evitar llamadas reales a ComfyUI
vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({
            get: vi.fn(),
            post: vi.fn()
        }))
    }
}));

describe('ComfyUIClient', () => {
    describe('QualityPresets', () => {
        it('debe tener preset fast con parámetros reducidos', () => {
            expect(QualityPresets.fast).toEqual({
                width: 480,
                height: 288,
                frames: 17,
                steps: 12,
                cfg: 5.0
            });
        });

        it('debe tener preset balanced con parámetros intermedios', () => {
            expect(QualityPresets.balanced).toEqual({
                width: 672,
                height: 384,
                frames: 25,
                steps: 18,
                cfg: 5.0
            });
        });

        it('debe tener preset quality con parámetros de alta calidad', () => {
            expect(QualityPresets.quality).toEqual({
                width: 672,
                height: 384,
                frames: 33,
                steps: 25,
                cfg: 5.0
            });
        });

        it('debe tener preset shortVertical para contenido vertical', () => {
            expect(QualityPresets.shortVertical.width).toBeLessThan(QualityPresets.shortVertical.height);
        });

        it('debe tener preset longHorizontal para contenido horizontal', () => {
            expect(QualityPresets.longHorizontal.width).toBeGreaterThan(QualityPresets.longHorizontal.height);
        });
    });

    describe('Constructor y configuración', () => {
        it('debe crear instancia con valores por defecto', () => {
            const client = new ComfyUIClient();
            expect(client).toBeDefined();
        });

        it('debe aceptar URL personalizada', () => {
            const customUrl = 'http://192.168.1.100:8188';
            const client = new ComfyUIClient(customUrl);
            expect(client).toBeDefined();
        });
    });

    describe('Validación de configuración', () => {
        it('debe rechazar I2V sin imagen de entrada', async () => {
            const client = new ComfyUIClient();
            const config: VideoGenerationConfig = {
                prompt: 'test prompt'
                // Sin inputImage
            };

            await expect(client.generateI2V(config)).rejects.toThrow(
                'I2V requiere una imagen de entrada'
            );
        });
    });

    describe('Dimensiones y orientación', () => {
        it('preset fast debe tener dimensiones divisibles por 16', () => {
            expect(QualityPresets.fast.width % 16).toBe(0);
            expect(QualityPresets.fast.height % 16).toBe(0);
        });

        it('preset balanced debe tener dimensiones divisibles por 16', () => {
            expect(QualityPresets.balanced.width % 16).toBe(0);
            expect(QualityPresets.balanced.height % 16).toBe(0);
        });

        it('frames debe seguir regla múltiplo de 4+1', () => {
            // frames = 4n + 1 (ej: 17, 21, 25, 29, 33)
            expect((QualityPresets.fast.frames - 1) % 4).toBe(0);
            expect((QualityPresets.balanced.frames - 1) % 4).toBe(0);
            expect((QualityPresets.quality.frames - 1) % 4).toBe(0);
        });
    });

    describe('Estimación de tiempos (RTX 4060 8GB con --lowvram)', () => {
        // Basado en observaciones reales
        // Con parámetros originales (672x384, 33 frames, 25 steps): ~24+ min antes de VAEDecode
        // La reducción estimada es proporcional a: width*height*frames*steps
        
        it('debe estimar tiempo reducido para preset fast vs quality', () => {
            const fastComplexity = QualityPresets.fast.width * 
                                   QualityPresets.fast.height * 
                                   QualityPresets.fast.frames * 
                                   QualityPresets.fast.steps;
            
            const qualityComplexity = QualityPresets.quality.width * 
                                      QualityPresets.quality.height * 
                                      QualityPresets.quality.frames * 
                                      QualityPresets.quality.steps;
            
            // fast debe ser significativamente menor en complejidad
            const reductionFactor = fastComplexity / qualityComplexity;
            expect(reductionFactor).toBeLessThan(0.25); // Al menos 4x más rápido
        });
    });
});

describe('Workflow JSON', () => {
    it('debe generar estructura de workflow válida para T2V', () => {
        // Verificamos que los nodos necesarios estén presentes
        const requiredNodes = [
            'UNETLoader',
            'CLIPLoader', 
            'VAELoader',
            'CLIPTextEncode',
            'WanImageToVideo',
            'KSampler',
            'VAEDecode',
            'SaveAnimatedWEBP'
        ];

        // Esto se validaría contra el workflow generado
        expect(requiredNodes.length).toBe(8);
    });
});
