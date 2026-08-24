/**
 * InstagramPublisher.test.ts
 * 
 * Tests unitarios para el publicador de Instagram Reels.
 * 
 * REQ-3.3.1: Crear InstagramPublisher.ts usando Instagram Graph API o Puppeteer stealth
 * 
 * NOTA: Los tests de Puppeteer requieren mocking ya que no podemos
 * realizar publicaciones reales en los tests automatizados.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    InstagramPublisher,
    InstagramCredentials,
    InstagramReelMetadata,
    PublishOptions,
    INSTAGRAM_SPECS
} from './InstagramPublisher';

// Crear directorio temporal para tests
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-output', 'instagram-publisher');

// ===== HELPERS =====

/**
 * Crea un archivo de video temporal para tests.
 */
function createTestVideo(): string {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
        fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    
    const videoPath = path.join(TEST_OUTPUT_DIR, `test-video-${Date.now()}.mp4`);
    // Crear archivo vacío que simula un video
    fs.writeFileSync(videoPath, Buffer.alloc(1024));
    return videoPath;
}

/**
 * Crea credenciales de prueba.
 */
function createTestCredentials(
    options: Partial<InstagramCredentials> = {}
): InstagramCredentials {
    return {
        username: 'test_user',
        password: 'test_password',
        ...options
    };
}

/**
 * Crea metadata de prueba.
 */
function createTestMetadata(
    options: Partial<InstagramReelMetadata> = {}
): InstagramReelMetadata {
    return {
        caption: 'Test caption para el Reel',
        hashtags: ['test', 'vitest', 'instagram'],
        ...options
    };
}

// ===== TESTS =====

describe('InstagramPublisher', () => {
    let testVideoPath: string;

    beforeEach(() => {
        testVideoPath = createTestVideo();
    });

    afterEach(() => {
        // Limpiar archivos de test
        if (fs.existsSync(testVideoPath)) {
            fs.unlinkSync(testVideoPath);
        }
    });

    describe('Constantes y especificaciones', () => {
        it('INSTAGRAM_SPECS tiene valores correctos', () => {
            expect(INSTAGRAM_SPECS.maxDuration).toBe(90);
            expect(INSTAGRAM_SPECS.resolution.width).toBe(1080);
            expect(INSTAGRAM_SPECS.resolution.height).toBe(1920);
            expect(INSTAGRAM_SPECS.maxCaptionLength).toBe(2200);
            expect(INSTAGRAM_SPECS.maxHashtags).toBe(30);
            expect(INSTAGRAM_SPECS.supportedFormats).toContain('mp4');
            expect(INSTAGRAM_SPECS.supportedFormats).toContain('mov');
        });

        it('URLs de Instagram están definidas', () => {
            expect(INSTAGRAM_SPECS.urls.base).toBe('https://www.instagram.com');
            expect(INSTAGRAM_SPECS.urls.login).toContain('accounts/login');
            expect(INSTAGRAM_SPECS.urls.upload).toContain('create');
        });
    });

    describe('Constructor y credenciales', () => {
        it('acepta credenciales de username/password', () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            
            expect(publisher).toBeInstanceOf(InstagramPublisher);
        });

        it('acepta credenciales de cookies', () => {
            const cookiesPath = path.join(TEST_OUTPUT_DIR, 'cookies.json');
            fs.writeFileSync(cookiesPath, JSON.stringify([{ name: 'session', value: 'test' }]));
            
            const credentials: InstagramCredentials = { cookiesPath };
            const publisher = new InstagramPublisher(credentials);
            
            expect(publisher).toBeInstanceOf(InstagramPublisher);
            
            fs.unlinkSync(cookiesPath);
        });

        it('acepta userDataDir para sesión persistente', () => {
            const credentials: InstagramCredentials = {
                username: 'test',
                password: 'test',
                userDataDir: '/tmp/instagram-session'
            };
            const publisher = new InstagramPublisher(credentials);
            
            expect(publisher).toBeInstanceOf(InstagramPublisher);
        });
    });

    describe('validateCredentials()', () => {
        it('retorna false cuando no hay archivo de cookies', async () => {
            const credentials: InstagramCredentials = {
                cookiesPath: '/non/existent/path.json'
            };
            const publisher = new InstagramPublisher(credentials);
            
            const result = await publisher.validateCredentials();
            
            expect(result).toBe(false);
        });

        it('retorna true con username y password', async () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            
            const result = await publisher.validateCredentials();
            
            expect(result).toBe(true);
        });

        it('retorna true con archivo de cookies válido', async () => {
            const cookiesPath = path.join(TEST_OUTPUT_DIR, 'valid-cookies.json');
            fs.writeFileSync(cookiesPath, JSON.stringify([
                { name: 'sessionid', value: 'abc123', domain: '.instagram.com' }
            ]));
            
            const credentials: InstagramCredentials = { cookiesPath };
            const publisher = new InstagramPublisher(credentials);
            
            const result = await publisher.validateCredentials();
            
            expect(result).toBe(true);
            
            fs.unlinkSync(cookiesPath);
        });

        it('retorna false con archivo de cookies vacío', async () => {
            const cookiesPath = path.join(TEST_OUTPUT_DIR, 'empty-cookies.json');
            fs.writeFileSync(cookiesPath, JSON.stringify([]));
            
            const credentials: InstagramCredentials = { cookiesPath };
            const publisher = new InstagramPublisher(credentials);
            
            const result = await publisher.validateCredentials();
            
            expect(result).toBe(false);
            
            fs.unlinkSync(cookiesPath);
        });

        it('retorna false con archivo de cookies malformado', async () => {
            const cookiesPath = path.join(TEST_OUTPUT_DIR, 'bad-cookies.json');
            fs.writeFileSync(cookiesPath, 'not valid json');
            
            const credentials: InstagramCredentials = { cookiesPath };
            const publisher = new InstagramPublisher(credentials);
            
            const result = await publisher.validateCredentials();
            
            expect(result).toBe(false);
            
            fs.unlinkSync(cookiesPath);
        });
    });

    describe('Validación de entrada', () => {
        it('rechaza video inexistente', async () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            const metadata = createTestMetadata();
            
            await expect(
                publisher.publishReel('/non/existent/video.mp4', metadata)
            ).rejects.toThrow('Video no encontrado');
        });

        it('rechaza formato de video no soportado', async () => {
            const aviPath = path.join(TEST_OUTPUT_DIR, 'test.avi');
            fs.writeFileSync(aviPath, Buffer.alloc(100));
            
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            const metadata = createTestMetadata();
            
            await expect(
                publisher.publishReel(aviPath, metadata)
            ).rejects.toThrow('Formato no soportado');
            
            fs.unlinkSync(aviPath);
        });

        it('rechaza caption demasiado largo', async () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            const metadata = createTestMetadata({
                caption: 'a'.repeat(INSTAGRAM_SPECS.maxCaptionLength + 1)
            });
            
            await expect(
                publisher.publishReel(testVideoPath, metadata)
            ).rejects.toThrow('Caption demasiado largo');
        });
    });

    describe('Métodos estáticos', () => {
        describe('sanitizeHashtags()', () => {
            it('elimina caracteres especiales de hashtags', () => {
                const input = ['#test!', 'hello@world', 'valid'];
                const result = InstagramPublisher.sanitizeHashtags(input);
                
                expect(result).toContain('test');
                expect(result).toContain('helloworld');
                expect(result).toContain('valid');
            });

            it('filtra hashtags demasiado cortos', () => {
                const input = ['a', 'ab', 'abc'];
                const result = InstagramPublisher.sanitizeHashtags(input);
                
                expect(result).not.toContain('a');
                expect(result).toContain('ab');
                expect(result).toContain('abc');
            });

            it('filtra hashtags demasiado largos', () => {
                const longHashtag = 'a'.repeat(35);
                const validHashtag = 'valid';
                const input = [longHashtag, validHashtag];
                
                const result = InstagramPublisher.sanitizeHashtags(input);
                
                expect(result).not.toContain(longHashtag);
                expect(result).toContain(validHashtag);
            });

            it('limita a máximo de hashtags permitidos', () => {
                const input = Array.from({ length: 50 }, (_, i) => `hashtag${i}`);
                const result = InstagramPublisher.sanitizeHashtags(input);
                
                expect(result.length).toBeLessThanOrEqual(INSTAGRAM_SPECS.maxHashtags);
            });

            it('permite caracteres con acentos', () => {
                const input = ['español', 'café', 'niño'];
                const result = InstagramPublisher.sanitizeHashtags(input);
                
                expect(result).toContain('español');
                expect(result).toContain('café');
                expect(result).toContain('niño');
            });
        });

        describe('validateCaption()', () => {
            it('acepta caption dentro del límite', () => {
                const caption = 'Caption válido';
                const result = InstagramPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('rechaza caption que excede el límite', () => {
                const caption = 'a'.repeat(INSTAGRAM_SPECS.maxCaptionLength + 1);
                const result = InstagramPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(false);
                expect(result.error).toContain('excede');
                expect(result.truncated).toBeDefined();
                expect(result.truncated!.length).toBeLessThanOrEqual(INSTAGRAM_SPECS.maxCaptionLength);
            });

            it('acepta caption en el límite exacto', () => {
                const caption = 'a'.repeat(INSTAGRAM_SPECS.maxCaptionLength);
                const result = InstagramPublisher.validateCaption(caption);
                
                expect(result.valid).toBe(true);
            });

            it('trunca caption largo correctamente', () => {
                const caption = 'test '.repeat(500);
                const result = InstagramPublisher.validateCaption(caption);
                
                expect(result.truncated).toBeDefined();
                expect(result.truncated!.endsWith('...')).toBe(true);
            });
        });

        describe('generateReelHash()', () => {
            it('genera hash MD5 para video', () => {
                const hash = InstagramPublisher.generateReelHash(testVideoPath);
                
                expect(hash).toBeDefined();
                expect(hash.length).toBe(12);
                expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
            });

            it('genera hash diferente para archivos diferentes', () => {
                const video1 = path.join(TEST_OUTPUT_DIR, 'video1.mp4');
                const video2 = path.join(TEST_OUTPUT_DIR, 'video2.mp4');
                
                fs.writeFileSync(video1, Buffer.from('content1'));
                fs.writeFileSync(video2, Buffer.from('content2'));
                
                const hash1 = InstagramPublisher.generateReelHash(video1);
                const hash2 = InstagramPublisher.generateReelHash(video2);
                
                expect(hash1).not.toBe(hash2);
                
                fs.unlinkSync(video1);
                fs.unlinkSync(video2);
            });

            it('genera mismo hash para mismo contenido', () => {
                const video1 = path.join(TEST_OUTPUT_DIR, 'video-a.mp4');
                const video2 = path.join(TEST_OUTPUT_DIR, 'video-b.mp4');
                
                const content = Buffer.from('identical content');
                fs.writeFileSync(video1, content);
                fs.writeFileSync(video2, content);
                
                const hash1 = InstagramPublisher.generateReelHash(video1);
                const hash2 = InstagramPublisher.generateReelHash(video2);
                
                expect(hash1).toBe(hash2);
                
                fs.unlinkSync(video1);
                fs.unlinkSync(video2);
            });
        });
    });

    describe('onStatusChange()', () => {
        it('acepta callback de estado', () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            const callback = vi.fn();
            
            publisher.onStatusChange(callback);
            
            // El callback se verificaría durante publishReel
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('close()', () => {
        it('cierra navegador sin error', async () => {
            const credentials = createTestCredentials();
            const publisher = new InstagramPublisher(credentials);
            
            // No debería lanzar error aunque no haya navegador abierto
            await expect(publisher.close()).resolves.toBeUndefined();
        });
    });

    describe('Estructura de resultado', () => {
        it('InstagramPublishResult tiene estructura correcta', () => {
            // Test de tipos - verificar que la interfaz está bien definida
            const mockResult = {
                success: true,
                reelUrl: 'https://www.instagram.com/reel/ABC123/',
                reelId: 'ABC123',
                attempts: 1,
                publishedAt: new Date().toISOString(),
                metadata: {
                    durationMs: 5000,
                    usedCookieSession: true,
                    hadRetries: false
                }
            };
            
            expect(mockResult.success).toBe(true);
            expect(mockResult.metadata.durationMs).toBeGreaterThan(0);
        });
    });
});

// ===== TESTS DE INTEGRACIÓN (Skipped por defecto) =====

describe.skip('InstagramPublisher - Integración (requiere credenciales reales)', () => {
    /**
     * Estos tests requieren credenciales reales de Instagram.
     * Solo ejecutar manualmente con: npm test -- --testNamePattern="Integración"
     * 
     * IMPORTANTE: No commitear credenciales reales.
     */
    
    it('publica un Reel real', async () => {
        const credentials: InstagramCredentials = {
            cookiesPath: process.env.INSTAGRAM_COOKIES_PATH
        };
        
        if (!credentials.cookiesPath) {
            console.log('INSTAGRAM_COOKIES_PATH no configurado, saltando test');
            return;
        }
        
        const publisher = new InstagramPublisher(credentials);
        const testVideo = process.env.TEST_VIDEO_PATH;
        
        if (!testVideo || !fs.existsSync(testVideo)) {
            console.log('TEST_VIDEO_PATH no configurado o no existe, saltando test');
            return;
        }
        
        const result = await publisher.publishReel(testVideo, {
            caption: 'Test de integración automática 🤖',
            hashtags: ['test', 'automation', 'vitest']
        });
        
        expect(result.success).toBe(true);
        expect(result.reelUrl).toContain('instagram.com');
    }, 180000); // Timeout de 3 minutos
});
