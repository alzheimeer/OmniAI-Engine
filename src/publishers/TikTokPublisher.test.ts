/**
 * TikTokPublisher.test.ts
 * 
 * Tests unitarios para TikTokPublisher.
 * Valida funcionalidades de publicación de videos en TikTok.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    TikTokPublisher,
    TikTokCredentials,
    TikTokVideoMetadata,
    TikTokPublishOptions,
    TIKTOK_SPECS
} from './TikTokPublisher';

// Mock de módulos externos
vi.mock('puppeteer-extra', () => ({
    default: {
        use: vi.fn(),
        launch: vi.fn()
    }
}));

vi.mock('puppeteer-extra-plugin-stealth', () => ({
    default: vi.fn(() => ({}))
}));

vi.mock('../infrastructure/Logger', () => ({
    Logger: Object.assign(
        vi.fn().mockImplementation(function() {
            return {
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
                setCorrelationId: vi.fn()
            };
        }),
        {
            // Métodos estáticos
            generateCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
            setGlobal: vi.fn()
        }
    )
}));

vi.mock('../infrastructure/RetryHandler', () => ({
    RetryHandler: vi.fn().mockImplementation(function() {
        return {
            executeWithResult: vi.fn((fn) => fn())
        };
    }),
    RetryError: class extends Error {
        attempts: number;
        totalTimeMs: number;
        constructor(message: string) {
            super(message);
            this.attempts = 0;
            this.totalTimeMs = 0;
        }
    }
}));

describe('TikTokPublisher', () => {
    const testCredentials: TikTokCredentials = {
        username: 'testuser',
        password: 'testpass'
    };

    const testMetadata: TikTokVideoMetadata = {
        caption: 'Test caption for TikTok video',
        hashtags: ['fyp', 'viral', 'test']
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Constructor', () => {
        it('debe crear instancia con credenciales válidas', () => {
            const publisher = new TikTokPublisher(testCredentials);
            expect(publisher).toBeInstanceOf(TikTokPublisher);
        });

        it('debe crear instancia con solo cookiesPath', () => {
            const publisher = new TikTokPublisher({
                cookiesPath: './cookies.json'
            });
            expect(publisher).toBeInstanceOf(TikTokPublisher);
        });
    });

    describe('Validación de Credenciales', () => {
        it('debe retornar false cuando no hay credenciales', async () => {
            const publisher = new TikTokPublisher({});
            const isValid = await publisher.validateCredentials();
            expect(isValid).toBe(false);
        });

        it('debe retornar true con username y password', async () => {
            const publisher = new TikTokPublisher(testCredentials);
            const isValid = await publisher.validateCredentials();
            expect(isValid).toBe(true);
        });

        it('debe retornar false si archivo de cookies no existe', async () => {
            const publisher = new TikTokPublisher({
                cookiesPath: './nonexistent-cookies.json'
            });
            const isValid = await publisher.validateCredentials();
            expect(isValid).toBe(false);
        });
    });

    describe('Métodos Estáticos', () => {
        describe('sanitizeHashtags', () => {
            it('debe limpiar hashtags correctamente', () => {
                const input = ['#test', 'hello!', 'world@123', 'español'];
                const result = TikTokPublisher.sanitizeHashtags(input);
                
                expect(result).toContain('test');
                expect(result).toContain('hello');
                expect(result).toContain('world123');
                expect(result).toContain('español');
            });

            it('debe filtrar hashtags muy cortos', () => {
                const input = ['a', 'ab', 'abc'];
                const result = TikTokPublisher.sanitizeHashtags(input);
                
                expect(result).not.toContain('a');
                expect(result).toContain('ab');
                expect(result).toContain('abc');
            });

            it('debe limitar a maxHashtags', () => {
                const input = Array.from({ length: 50 }, (_, i) => `hashtag${i}`);
                const result = TikTokPublisher.sanitizeHashtags(input);
                
                expect(result.length).toBe(TIKTOK_SPECS.maxHashtags);
            });
        });

        describe('validateCaption', () => {
            it('debe validar caption dentro del límite', () => {
                const caption = 'Este es un caption válido';
                const result = TikTokPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('debe invalidar caption que excede el límite', () => {
                const caption = 'x'.repeat(TIKTOK_SPECS.maxCaptionLength + 100);
                const result = TikTokPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(false);
                expect(result.error).toBeDefined();
                expect(result.truncated).toBeDefined();
                expect(result.truncated!.length).toBeLessThanOrEqual(TIKTOK_SPECS.maxCaptionLength);
            });

            it('debe aceptar caption en el límite exacto', () => {
                const caption = 'x'.repeat(TIKTOK_SPECS.maxCaptionLength);
                const result = TikTokPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(true);
            });
        });

        describe('checkVideoDuration', () => {
            it('debe marcar duración óptima (≤15s)', () => {
                const result = TikTokPublisher.checkVideoDuration(15);
                
                expect(result.valid).toBe(true);
                expect(result.optimal).toBe(true);
            });

            it('debe marcar duración válida pero no óptima (16-60s)', () => {
                const result = TikTokPublisher.checkVideoDuration(45);
                
                expect(result.valid).toBe(true);
                expect(result.optimal).toBe(false);
            });

            it('debe invalidar duración que excede máximo (>60s)', () => {
                const result = TikTokPublisher.checkVideoDuration(90);
                
                expect(result.valid).toBe(false);
                expect(result.optimal).toBe(false);
            });

            it('debe aceptar duración exacta de 60s', () => {
                const result = TikTokPublisher.checkVideoDuration(60);
                
                expect(result.valid).toBe(true);
            });
        });

        describe('generateVideoHash', () => {
            it('debe generar hash de 12 caracteres', () => {
                // Crear archivo temporal para test
                const testFile = path.join(process.cwd(), 'test-video-temp.mp4');
                fs.writeFileSync(testFile, 'test video content');
                
                try {
                    const hash = TikTokPublisher.generateVideoHash(testFile);
                    expect(hash.length).toBe(12);
                    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
                } finally {
                    fs.unlinkSync(testFile);
                }
            });

            it('debe generar hashes diferentes para contenido diferente', () => {
                const testFile1 = path.join(process.cwd(), 'test-video-1.mp4');
                const testFile2 = path.join(process.cwd(), 'test-video-2.mp4');
                
                fs.writeFileSync(testFile1, 'content 1');
                fs.writeFileSync(testFile2, 'content 2');
                
                try {
                    const hash1 = TikTokPublisher.generateVideoHash(testFile1);
                    const hash2 = TikTokPublisher.generateVideoHash(testFile2);
                    expect(hash1).not.toBe(hash2);
                } finally {
                    fs.unlinkSync(testFile1);
                    fs.unlinkSync(testFile2);
                }
            });
        });
    });

    describe('Status Callback', () => {
        it('debe registrar y llamar status callback', () => {
            const publisher = new TikTokPublisher(testCredentials);
            const callback = vi.fn();
            
            publisher.onStatusChange(callback);
            
            // El callback se llama internamente durante publishVideo
            expect(callback).not.toHaveBeenCalled(); // No se ha llamado aún
        });
    });

    describe('TIKTOK_SPECS', () => {
        it('debe tener especificaciones correctas', () => {
            expect(TIKTOK_SPECS.optimalDuration).toBe(15);
            expect(TIKTOK_SPECS.maxDuration).toBe(60);
            expect(TIKTOK_SPECS.maxCaptionLength).toBe(2200);
            expect(TIKTOK_SPECS.maxHashtags).toBe(30);
            expect(TIKTOK_SPECS.maxFileSize).toBe(287 * 1024 * 1024);
        });

        it('debe tener formatos de video soportados', () => {
            expect(TIKTOK_SPECS.supportedFormats).toContain('mp4');
            expect(TIKTOK_SPECS.supportedFormats).toContain('mov');
            expect(TIKTOK_SPECS.supportedFormats).toContain('webm');
        });

        it('debe tener resolución correcta (9:16)', () => {
            expect(TIKTOK_SPECS.resolution.width).toBe(1080);
            expect(TIKTOK_SPECS.resolution.height).toBe(1920);
        });

        it('debe tener URLs configuradas', () => {
            expect(TIKTOK_SPECS.urls.base).toBe('https://www.tiktok.com');
            expect(TIKTOK_SPECS.urls.login).toBe('https://www.tiktok.com/login');
            expect(TIKTOK_SPECS.urls.upload).toBe('https://www.tiktok.com/upload');
            expect(TIKTOK_SPECS.urls.studio).toBe('https://www.tiktok.com/creator#/upload');
        });
    });

    describe('Validación de Input', () => {
        it('debe rechazar video inexistente', async () => {
            const publisher = new TikTokPublisher(testCredentials);
            
            await expect(
                publisher.publishVideo('/nonexistent/video.mp4', testMetadata)
            ).rejects.toThrow('Video no encontrado');
        });

        it('debe rechazar formato no soportado', async () => {
            const testFile = path.join(process.cwd(), 'test.avi');
            fs.writeFileSync(testFile, 'test');
            
            const publisher = new TikTokPublisher(testCredentials);
            
            try {
                await expect(
                    publisher.publishVideo(testFile, testMetadata)
                ).rejects.toThrow('Formato no soportado');
            } finally {
                fs.unlinkSync(testFile);
            }
        });

        it('debe rechazar archivo demasiado grande', async () => {
            // No podemos crear un archivo de 287MB en test, así que mockeamos fs.statSync
            const testFile = path.join(process.cwd(), 'test-large.mp4');
            fs.writeFileSync(testFile, 'test');
            
            const originalStatSync = fs.statSync;
            vi.spyOn(fs, 'statSync').mockReturnValue({
                size: TIKTOK_SPECS.maxFileSize + 1000,
                isFile: () => true
            } as fs.Stats);
            
            const publisher = new TikTokPublisher(testCredentials);
            
            try {
                await expect(
                    publisher.publishVideo(testFile, testMetadata)
                ).rejects.toThrow('Archivo demasiado grande');
            } finally {
                vi.spyOn(fs, 'statSync').mockRestore();
                fs.unlinkSync(testFile);
            }
        });

        it('debe rechazar caption demasiado largo', async () => {
            const testFile = path.join(process.cwd(), 'test.mp4');
            fs.writeFileSync(testFile, 'test');
            
            const longCaption = 'x'.repeat(TIKTOK_SPECS.maxCaptionLength + 100);
            const publisher = new TikTokPublisher(testCredentials);
            
            try {
                await expect(
                    publisher.publishVideo(testFile, {
                        ...testMetadata,
                        caption: longCaption
                    })
                ).rejects.toThrow('Caption demasiado largo');
            } finally {
                fs.unlinkSync(testFile);
            }
        });
    });

    describe('Interfaces', () => {
        it('TikTokVideoMetadata debe aceptar todas las propiedades opcionales', () => {
            const metadata: TikTokVideoMetadata = {
                caption: 'Test',
                hashtags: ['test'],
                coverImagePath: './cover.jpg',
                soundId: '12345',
                soundName: 'Original Sound',
                allowDuet: true,
                allowStitch: true,
                disableComments: false,
                visibility: 'everyone'
            };
            
            expect(metadata.caption).toBe('Test');
            expect(metadata.visibility).toBe('everyone');
        });

        it('TikTokPublishOptions debe aceptar todas las propiedades opcionales', () => {
            const options: TikTokPublishOptions = {
                delaySeconds: 30,
                maxRetries: 5,
                keepBrowserOpen: true,
                timeoutMs: 60000,
                debugScreenshots: true,
                screenshotsDir: './debug'
            };
            
            expect(options.delaySeconds).toBe(30);
            expect(options.maxRetries).toBe(5);
        });

        it('TikTokCredentials debe aceptar múltiples formas de autenticación', () => {
            // Solo cookies
            const creds1: TikTokCredentials = {
                cookiesPath: './cookies.json'
            };
            expect(creds1.cookiesPath).toBeDefined();
            
            // Solo username/password
            const creds2: TikTokCredentials = {
                username: 'user',
                password: 'pass'
            };
            expect(creds2.username).toBe('user');
            
            // Ambos
            const creds3: TikTokCredentials = {
                username: 'user',
                password: 'pass',
                cookiesPath: './cookies.json',
                userDataDir: './userData'
            };
            expect(creds3.userDataDir).toBeDefined();
        });
    });

    describe('Close', () => {
        it('debe cerrar navegador si está abierto', async () => {
            const publisher = new TikTokPublisher(testCredentials);
            
            // No debería lanzar error si no hay navegador abierto
            await expect(publisher.close()).resolves.not.toThrow();
        });
    });
});
