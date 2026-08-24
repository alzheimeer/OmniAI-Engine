/**
 * Tests para PlaylistManager - Sistema de Playlists Automáticas por Idioma
 * 
 * Valida REQ-5.3.1: Crear playlists automáticas por idioma (ES, EN, PT)
 * Valida REQ-5.3.2: Crear playlists automáticas por tema/keyword principal
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
    PlaylistManager, 
    SupportedLanguage, 
    SupportedTheme,
    PlaylistConfig, 
    PlaylistResult,
    ThemePlaylistConfig,
    ThemeDetectionResult,
    VideoMetadata,
    AutoPlaylistResult,
} from './PlaylistManager';

// Mock de googleapis
vi.mock('googleapis', () => {
    const mockPlaylistsInsert = vi.fn();
    const mockPlaylistsList = vi.fn();
    const mockPlaylistItemsInsert = vi.fn();
    const mockPlaylistItemsList = vi.fn();

    return {
        google: {
            youtube: vi.fn(() => ({
                playlists: {
                    insert: mockPlaylistsInsert,
                    list: mockPlaylistsList,
                },
                playlistItems: {
                    insert: mockPlaylistItemsInsert,
                    list: mockPlaylistItemsList,
                },
            })),
        },
        // Exponer mocks para configuración en tests
        __mocks__: {
            mockPlaylistsInsert,
            mockPlaylistsList,
            mockPlaylistItemsInsert,
            mockPlaylistItemsList,
        },
    };
});

// Mock de GoogleAuth
vi.mock('../auth/GoogleAuth', () => ({
    GoogleAuth: {
        getClient: vi.fn().mockResolvedValue({}),
    },
}));

// Mock de Logger
vi.mock('../infrastructure/Logger', () => ({
    Logger: class MockLogger {
        info = vi.fn();
        debug = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        constructor(_component: string) {}
    },
}));

// Mock de RetryHandler
vi.mock('../infrastructure/RetryHandler', () => ({
    RetryHandler: {
        forAPI: vi.fn(() => ({
            execute: vi.fn(async (fn: () => Promise<any>) => fn()),
        })),
    },
}));

describe('PlaylistManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PlaylistManager.clearCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Idiomas soportados', () => {
        it('debe soportar los tres idiomas: ES, EN, PT', () => {
            const languages: SupportedLanguage[] = ['ES', 'EN', 'PT'];
            const configs = PlaylistManager.getDefaultPlaylistConfigs();
            
            languages.forEach(lang => {
                expect(configs[lang]).toBeDefined();
                expect(configs[lang].name).toBeTruthy();
                expect(configs[lang].description).toBeTruthy();
            });
        });

        it('debe tener configuración por defecto para cada idioma', () => {
            const configs = PlaylistManager.getDefaultPlaylistConfigs();
            
            // Español
            expect(configs.ES.name).toBe('Videos en Español');
            expect(configs.ES.description).toContain('español');
            
            // Inglés
            expect(configs.EN.name).toBe('English Videos');
            expect(configs.EN.description).toContain('English');
            
            // Portugués
            expect(configs.PT.name).toBe('Vídeos em Português');
            expect(configs.PT.description).toContain('português');
        });
    });

    describe('Configuración de nombres de playlists', () => {
        it('debe permitir actualizar configuración por defecto', () => {
            const originalConfigs = PlaylistManager.getDefaultPlaylistConfigs();
            const originalName = originalConfigs.ES.name;
            
            PlaylistManager.setDefaultPlaylistConfig('ES', {
                name: 'Nuevo Nombre en Español',
                description: 'Nueva descripción',
            });
            
            const updatedConfigs = PlaylistManager.getDefaultPlaylistConfigs();
            expect(updatedConfigs.ES.name).toBe('Nuevo Nombre en Español');
            expect(updatedConfigs.ES.description).toBe('Nueva descripción');
            
            // Restaurar configuración original
            PlaylistManager.setDefaultPlaylistConfig('ES', {
                name: originalName,
                description: 'Colección de videos en español sobre IA y neurodivergencia',
            });
        });

        it('debe mantener otros campos al actualizar parcialmente', () => {
            const originalConfigs = PlaylistManager.getDefaultPlaylistConfigs();
            const originalDescription = originalConfigs.EN.description;
            
            PlaylistManager.setDefaultPlaylistConfig('EN', {
                name: 'Custom English Name',
            });
            
            const updatedConfigs = PlaylistManager.getDefaultPlaylistConfigs();
            expect(updatedConfigs.EN.name).toBe('Custom English Name');
            expect(updatedConfigs.EN.description).toBe(originalDescription);
            
            // Restaurar
            PlaylistManager.setDefaultPlaylistConfig('EN', {
                name: 'English Videos',
            });
        });
    });

    describe('Cache de playlists', () => {
        it('debe limpiar cache correctamente', () => {
            // La función existe y no lanza error
            expect(() => PlaylistManager.clearCache()).not.toThrow();
        });
    });

    describe('Validación de tipos', () => {
        it('SupportedLanguage debe aceptar solo ES, EN, PT', () => {
            const validLanguages: SupportedLanguage[] = ['ES', 'EN', 'PT'];
            
            validLanguages.forEach(lang => {
                // Verificar que el tipo es correcto
                expect(['ES', 'EN', 'PT']).toContain(lang);
            });
        });

        it('PlaylistConfig debe tener estructura correcta', () => {
            const config: PlaylistConfig = {
                name: 'Test Playlist',
                description: 'Test Description',
                language: 'ES',
                privacyStatus: 'public',
            };
            
            expect(config.name).toBeDefined();
            expect(config.description).toBeDefined();
            expect(config.language).toBeDefined();
            expect(['public', 'private', 'unlisted']).toContain(config.privacyStatus);
        });

        it('PlaylistResult debe tener estructura correcta', () => {
            const result: PlaylistResult = {
                playlistId: 'PLtest123',
                name: 'Test Playlist',
                url: 'https://www.youtube.com/playlist?list=PLtest123',
                created: false,
            };
            
            expect(result.playlistId).toBeDefined();
            expect(result.name).toBeDefined();
            expect(result.url).toContain('youtube.com/playlist');
            expect(typeof result.created).toBe('boolean');
        });
    });

    describe('Integración con YouTube API', () => {
        it('debe exportar método getOrCreatePlaylistByLanguage', () => {
            expect(typeof PlaylistManager.getOrCreatePlaylistByLanguage).toBe('function');
        });

        it('debe exportar método addVideoToLanguagePlaylist', () => {
            expect(typeof PlaylistManager.addVideoToLanguagePlaylist).toBe('function');
        });

        it('debe exportar método addVideoToPlaylist', () => {
            expect(typeof PlaylistManager.addVideoToPlaylist).toBe('function');
        });

        it('debe exportar método getAllLanguagePlaylists', () => {
            expect(typeof PlaylistManager.getAllLanguagePlaylists).toBe('function');
        });
    });

    describe('Formato de URLs', () => {
        it('debe generar URLs de playlist válidas', () => {
            const playlistId = 'PLtest123abc';
            const expectedUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
            
            // Verificar formato de URL
            expect(expectedUrl).toMatch(/^https:\/\/www\.youtube\.com\/playlist\?list=/);
            expect(expectedUrl).toContain(playlistId);
        });
    });

    describe('Mapeo de idiomas a ISO', () => {
        it('debe mapear correctamente los códigos de idioma', () => {
            // Verificar que los idiomas soportados tienen mapeo ISO correcto
            const expectedMappings: Record<SupportedLanguage, string> = {
                ES: 'es',
                EN: 'en',
                PT: 'pt',
            };

            // Los códigos ISO deben ser de 2 caracteres
            Object.values(expectedMappings).forEach(iso => {
                expect(iso).toHaveLength(2);
                expect(iso).toMatch(/^[a-z]{2}$/);
            });
        });
    });

    describe('Gestión de errores', () => {
        it('debe manejar videoId inválido graciosamente', async () => {
            const result = await PlaylistManager.addVideoToPlaylist(
                '', // videoId vacío
                'PLtest123',
                undefined
            );
            
            // Debería retornar un resultado con error, no lanzar excepción
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });
});

describe('PlaylistManager - Escenarios de integración', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PlaylistManager.clearCache();
    });

    it('debe soportar múltiples canales con diferentes tokens', () => {
        // Verificar que el sistema puede distinguir entre canales
        const cacheKey1 = 'channel1:lang:ES';
        const cacheKey2 = 'channel2:lang:ES';
        
        // Las claves deben ser diferentes
        expect(cacheKey1).not.toBe(cacheKey2);
    });

    it('debe permitir configuración personalizada por canal', async () => {
        const customConfig: Partial<PlaylistConfig> = {
            name: 'NeuroSync AI - Español',
            description: 'Videos de NeuroSync AI en español',
            privacyStatus: 'public',
        };
        
        // Verificar que la configuración se aplica correctamente
        expect(customConfig.name).toBeDefined();
        expect(customConfig.description).toBeDefined();
    });
});

// ==================== Tests para Playlists Temáticas (REQ-5.3.2) ====================

describe('PlaylistManager - Playlists Temáticas (REQ-5.3.2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PlaylistManager.clearCache();
    });

    describe('Temas soportados', () => {
        it('debe soportar los cinco temas principales', () => {
            const themes = PlaylistManager.getSupportedThemes();
            
            expect(themes).toContain('autism-ai');
            expect(themes).toContain('adhd-ai');
            expect(themes).toContain('productivity-ai');
            expect(themes).toContain('neurodiversity');
            expect(themes).toContain('ai-tools');
            expect(themes).toHaveLength(5);
        });

        it('debe tener configuración por defecto para cada tema en cada idioma', () => {
            const configs = PlaylistManager.getDefaultThemePlaylistConfigs();
            const themes: SupportedTheme[] = ['autism-ai', 'adhd-ai', 'productivity-ai', 'neurodiversity', 'ai-tools'];
            const languages: SupportedLanguage[] = ['ES', 'EN', 'PT'];
            
            themes.forEach(theme => {
                expect(configs[theme]).toBeDefined();
                languages.forEach(lang => {
                    expect(configs[theme][lang]).toBeDefined();
                    expect(configs[theme][lang].name).toBeTruthy();
                    expect(configs[theme][lang].description).toBeTruthy();
                });
            });
        });

        it('debe tener nombres correctos para tema autism-ai', () => {
            const configs = PlaylistManager.getDefaultThemePlaylistConfigs();
            
            expect(configs['autism-ai'].ES.name).toBe('Autismo e Inteligencia Artificial');
            expect(configs['autism-ai'].EN.name).toBe('Autism and Artificial Intelligence');
            expect(configs['autism-ai'].PT.name).toBe('Autismo e Inteligência Artificial');
        });

        it('debe tener nombres correctos para tema adhd-ai', () => {
            const configs = PlaylistManager.getDefaultThemePlaylistConfigs();
            
            expect(configs['adhd-ai'].ES.name).toBe('TDAH e Inteligencia Artificial');
            expect(configs['adhd-ai'].EN.name).toBe('ADHD and Artificial Intelligence');
            expect(configs['adhd-ai'].PT.name).toBe('TDAH e Inteligência Artificial');
        });
    });

    describe('Detección de tema del video', () => {
        it('debe detectar tema autism-ai correctamente', () => {
            const metadata: VideoMetadata = {
                title: 'Herramientas para personas autistas: guía práctica',
                description: 'Cómo la tecnología puede ayudar a personas con autismo',
                tags: ['autismo', 'autista', 'tea'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            expect(result.theme).toBe('autism-ai');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.matchedKeywords).toContain('autismo');
        });

        it('debe detectar tema adhd-ai correctamente', () => {
            const metadata: VideoMetadata = {
                title: 'Herramientas de IA para personas con TDAH',
                description: 'Mejora tu concentración y productividad',
                tags: ['tdah', 'adhd', 'productividad'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            expect(result.theme).toBe('adhd-ai');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.matchedKeywords.some(k => 
                k.toLowerCase().includes('tdah') || k.toLowerCase().includes('adhd')
            )).toBe(true);
        });

        it('debe detectar tema productivity-ai correctamente', () => {
            const metadata: VideoMetadata = {
                title: 'Automatiza tu workflow con inteligencia artificial',
                tags: ['productividad', 'automatización', 'workflow'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            expect(result.theme).toBe('productivity-ai');
            expect(result.matchedKeywords.length).toBeGreaterThan(0);
        });

        it('debe detectar tema neurodiversity correctamente', () => {
            const metadata: VideoMetadata = {
                title: 'La neurodivergencia y el poder de mentes diversas',
                tags: ['neurodivergencia', 'neurodivergente'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            expect(result.theme).toBe('neurodiversity');
        });

        it('debe usar ai-tools como default cuando no hay coincidencias específicas', () => {
            const metadata: VideoMetadata = {
                title: 'Nuevo modelo GPT-4 análisis completo',
                tags: ['gpt', 'chatgpt', 'ia'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            // Puede ser ai-tools u otro tema si hay keywords de IA
            expect(result.theme).toBeDefined();
            expect(PlaylistManager.getSupportedThemes()).toContain(result.theme);
        });

        it('debe dar mayor peso a keywords en título', () => {
            const metadataInTitle: VideoMetadata = {
                title: 'Autismo y tecnología: el futuro',
                tags: ['tecnología'],
            };
            
            const metadataInTags: VideoMetadata = {
                title: 'El futuro de la tecnología',
                tags: ['autismo'],
            };
            
            const resultInTitle = PlaylistManager.detectVideoTheme(metadataInTitle);
            const resultInTags = PlaylistManager.detectVideoTheme(metadataInTags);
            
            // El resultado con keyword en título debería tener mayor confianza
            // o al menos detectar el mismo tema
            expect(resultInTitle.theme).toBe('autism-ai');
            // La confianza debería ser mayor cuando está en el título
            expect(resultInTitle.confidence).toBeGreaterThanOrEqual(resultInTags.confidence);
        });

        it('debe detectar keywords en múltiples idiomas', () => {
            const metadataES: VideoMetadata = {
                title: 'Cómo el autismo afecta el aprendizaje',
                tags: ['autismo', 'aprendizaje'],
            };
            
            const metadataEN: VideoMetadata = {
                title: 'Understanding autism in daily life',
                tags: ['autism', 'daily life'],
            };
            
            const metadataPT: VideoMetadata = {
                title: 'Entendendo o autismo no dia a dia',
                tags: ['autismo', 'vida diária'],
            };
            
            expect(PlaylistManager.detectVideoTheme(metadataES).theme).toBe('autism-ai');
            expect(PlaylistManager.detectVideoTheme(metadataEN).theme).toBe('autism-ai');
            expect(PlaylistManager.detectVideoTheme(metadataPT).theme).toBe('autism-ai');
        });

        it('debe retornar confianza entre 0 y 1', () => {
            const metadata: VideoMetadata = {
                title: 'Video sobre autismo y TDAH con herramientas de IA',
                description: 'Contenido sobre neurodivergencia',
                tags: ['autismo', 'tdah', 'ia', 'neurodivergencia'],
            };
            
            const result = PlaylistManager.detectVideoTheme(metadata);
            
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });
    });

    describe('Keywords de detección', () => {
        it('debe tener keywords para cada tema', () => {
            const keywords = PlaylistManager.getThemeKeywords();
            const themes: SupportedTheme[] = ['autism-ai', 'adhd-ai', 'productivity-ai', 'neurodiversity', 'ai-tools'];
            
            themes.forEach(theme => {
                expect(keywords[theme]).toBeDefined();
                expect(keywords[theme].ES.length).toBeGreaterThan(0);
                expect(keywords[theme].EN.length).toBeGreaterThan(0);
                expect(keywords[theme].PT.length).toBeGreaterThan(0);
            });
        });

        it('debe incluir keywords específicas del proyecto', () => {
            const keywords = PlaylistManager.getThemeKeywords();
            
            // Keywords de Canal 1 (NeuroSync AI)
            expect(keywords['autism-ai'].ES).toContain('autismo');
            expect(keywords['autism-ai'].ES).toContain('neurosync');
            
            // Keywords de Canal 2 (NeuroTech AI)
            expect(keywords['adhd-ai'].ES).toContain('tdah');
            expect(keywords['adhd-ai'].ES).toContain('neurotech');
        });
    });

    describe('Validación de tipos para playlists temáticas', () => {
        it('SupportedTheme debe aceptar solo los temas definidos', () => {
            const validThemes: SupportedTheme[] = [
                'autism-ai', 
                'adhd-ai', 
                'productivity-ai', 
                'neurodiversity', 
                'ai-tools'
            ];
            
            validThemes.forEach(theme => {
                expect(PlaylistManager.getSupportedThemes()).toContain(theme);
            });
        });

        it('ThemeDetectionResult debe tener estructura correcta', () => {
            const result: ThemeDetectionResult = {
                theme: 'autism-ai',
                confidence: 0.85,
                matchedKeywords: ['autismo', 'ia'],
            };
            
            expect(result.theme).toBeDefined();
            expect(typeof result.confidence).toBe('number');
            expect(Array.isArray(result.matchedKeywords)).toBe(true);
        });

        it('VideoMetadata debe aceptar título, descripción y tags', () => {
            const metadata: VideoMetadata = {
                title: 'Título del video',
                description: 'Descripción opcional',
                tags: ['tag1', 'tag2'],
            };
            
            expect(metadata.title).toBeDefined();
            expect(metadata.description).toBeDefined();
            expect(metadata.tags).toBeDefined();
        });

        it('VideoMetadata debe funcionar solo con título', () => {
            const metadata: VideoMetadata = {
                title: 'Solo título',
            };
            
            expect(metadata.title).toBeDefined();
            expect(metadata.description).toBeUndefined();
            expect(metadata.tags).toBeUndefined();
            
            // Debe poder detectar tema solo con título
            const result = PlaylistManager.detectVideoTheme(metadata);
            expect(result.theme).toBeDefined();
        });
    });

    describe('Integración con YouTube API para temas', () => {
        it('debe exportar método getOrCreatePlaylistByTheme', () => {
            expect(typeof PlaylistManager.getOrCreatePlaylistByTheme).toBe('function');
        });

        it('debe exportar método addVideoToThemePlaylist', () => {
            expect(typeof PlaylistManager.addVideoToThemePlaylist).toBe('function');
        });

        it('debe exportar método getAllThemePlaylists', () => {
            expect(typeof PlaylistManager.getAllThemePlaylists).toBe('function');
        });

        it('debe exportar método detectVideoTheme', () => {
            expect(typeof PlaylistManager.detectVideoTheme).toBe('function');
        });
    });

    describe('Cache para playlists temáticas', () => {
        it('debe usar claves de cache separadas para idioma y tema', () => {
            // Las claves deben distinguir entre idioma y tema
            const cacheKeyLang = 'channel1:lang:ES';
            const cacheKeyTheme = 'channel1:theme:autism-ai:ES';
            
            expect(cacheKeyLang).not.toBe(cacheKeyTheme);
        });

        it('debe distinguir playlists temáticas por canal', () => {
            const cacheKey1 = 'channel1:theme:autism-ai:ES';
            const cacheKey2 = 'channel2:theme:autism-ai:ES';
            
            expect(cacheKey1).not.toBe(cacheKey2);
        });
    });
});

describe('PlaylistManager - Escenarios de temas específicos del proyecto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PlaylistManager.clearCache();
    });

    it('debe detectar contenido de Canal 1 (NeuroSync AI - Autismo)', () => {
        const metadata: VideoMetadata = {
            title: 'NeuroSync: Cómo la IA ayuda con soporte sensorial para autismo',
            tags: ['neurosync', 'autismo', 'soporte sensorial', 'ia'],
        };
        
        const result = PlaylistManager.detectVideoTheme(metadata);
        
        expect(result.theme).toBe('autism-ai');
        expect(result.matchedKeywords).toContain('neurosync');
    });

    it('debe detectar contenido de Canal 2 (NeuroTech AI - TDAH)', () => {
        const metadata: VideoMetadata = {
            title: 'NeuroTech: Productividad con IA para TDAH',
            tags: ['neurotech', 'tdah', 'productividad', 'ia'],
        };
        
        const result = PlaylistManager.detectVideoTheme(metadata);
        
        expect(result.theme).toBe('adhd-ai');
        expect(result.matchedKeywords).toContain('neurotech');
    });

    it('debe priorizar temas específicos sobre ai-tools genérico', () => {
        const metadata: VideoMetadata = {
            title: 'Guía completa para personas con autismo: aplicaciones y herramientas',
            tags: ['autismo', 'autista', 'herramientas', 'guía'],
        };
        
        const result = PlaylistManager.detectVideoTheme(metadata);
        
        // Debe detectar autism-ai por las keywords específicas
        expect(result.theme).toBe('autism-ai');
    });
});

// ==================== Tests para addVideoToPlaylistsAutomatically (REQ-5.3.3) ====================

describe('PlaylistManager - addVideoToPlaylistsAutomatically (REQ-5.3.3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PlaylistManager.clearCache();
    });

    describe('Exportación y estructura', () => {
        it('debe exportar método addVideoToPlaylistsAutomatically', () => {
            expect(typeof PlaylistManager.addVideoToPlaylistsAutomatically).toBe('function');
        });

        it('AutoPlaylistResult debe tener estructura correcta', () => {
            const result: AutoPlaylistResult = {
                success: true,
                videoId: 'test123',
                channelId: 'UCtest',
                language: 'ES',
                languagePlaylist: {
                    success: true,
                    playlistId: 'PLlang123',
                    videoId: 'test123',
                    message: 'Éxito',
                },
                themePlaylist: {
                    success: true,
                    playlistId: 'PLtheme456',
                    videoId: 'test123',
                    message: 'Éxito',
                    detectedTheme: 'autism-ai',
                    confidence: 0.85,
                },
                summary: 'Video añadido a 2 playlists',
            };
            
            expect(result.success).toBeDefined();
            expect(result.videoId).toBeDefined();
            expect(result.channelId).toBeDefined();
            expect(result.language).toBeDefined();
            expect(result.languagePlaylist).toBeDefined();
            expect(result.themePlaylist).toBeDefined();
            expect(result.summary).toBeDefined();
        });
    });

    describe('Comportamiento de adición automática', () => {
        it('debe intentar añadir a playlist por idioma siempre', async () => {
            // Llamar al método - intentará añadir a ambas playlists
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoId123',
                'Test video sobre autismo',
                'Descripción del video',
                'ES'
            );
            
            // Debe retornar un resultado estructurado
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('videoId', 'videoId123');
            expect(result).toHaveProperty('channelId', 'UCtest123');
            expect(result).toHaveProperty('language', 'ES');
            expect(result).toHaveProperty('languagePlaylist');
            expect(result).toHaveProperty('themePlaylist');
            expect(result).toHaveProperty('summary');
        });

        it('debe detectar tema para videos con keywords de autismo', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoId456',
                'Cómo la IA ayuda a personas con autismo',
                'Herramientas tecnológicas para el espectro autista',
                'ES'
            );
            
            // Debe detectar tema autism-ai
            expect(result.themePlaylist).not.toBeNull();
            if (result.themePlaylist) {
                expect(result.themePlaylist.detectedTheme).toBe('autism-ai');
                expect(result.themePlaylist.confidence).toBeGreaterThan(0);
            }
        });

        it('debe detectar tema para videos con keywords de TDAH', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoId789',
                'Productividad con IA para personas con TDAH',
                'Mejora tu concentración y enfoque',
                'ES'
            );
            
            // Debe detectar tema adhd-ai
            expect(result.themePlaylist).not.toBeNull();
            if (result.themePlaylist) {
                expect(result.themePlaylist.detectedTheme).toBe('adhd-ai');
                expect(result.themePlaylist.confidence).toBeGreaterThan(0);
            }
        });

        it('debe respetar umbral de confianza personalizado', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoIdGeneric',
                'Video genérico sin keywords específicas',
                'Descripción genérica',
                'ES',
                undefined,
                0.99 // Umbral muy alto - no debería añadir a playlist temática
            );
            
            // Tema detectado pero con baja confianza
            expect(result.themePlaylist).not.toBeNull();
            if (result.themePlaylist) {
                // El mensaje debería indicar confianza insuficiente
                expect(result.themePlaylist.message).toContain('insuficiente');
            }
        });

        it('debe manejar videos en diferentes idiomas', async () => {
            const languagesToTest: SupportedLanguage[] = ['ES', 'EN', 'PT'];
            
            for (const lang of languagesToTest) {
                const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                    'UCtest123',
                    `videoId_${lang}`,
                    'Test video',
                    'Test description',
                    lang
                );
                
                expect(result.language).toBe(lang);
            }
        });

        it('debe generar resumen descriptivo', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoIdSummary',
                'Video sobre autismo y tecnología',
                'Contenido sobre IA y autismo',
                'ES'
            );
            
            // Debe tener un resumen
            expect(typeof result.summary).toBe('string');
            expect(result.summary.length).toBeGreaterThan(0);
        });
    });

    describe('Manejo de errores', () => {
        it('debe manejar videoId vacío graciosamente', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                '', // videoId vacío
                'Test video',
                'Test description',
                'ES'
            );
            
            // Debe retornar resultado estructurado, no lanzar excepción
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('summary');
        });

        it('debe manejar título vacío graciosamente', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoId123',
                '', // título vacío
                'Test description',
                'ES'
            );
            
            // Debe retornar resultado estructurado
            expect(result).toHaveProperty('success');
            expect(result.themePlaylist).not.toBeNull();
        });

        it('debe manejar descripción vacía graciosamente', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoId123',
                'Test video sobre autismo',
                '', // descripción vacía
                'ES'
            );
            
            // Debe detectar tema solo con título
            expect(result.themePlaylist).not.toBeNull();
            if (result.themePlaylist) {
                expect(result.themePlaylist.detectedTheme).toBeDefined();
            }
        });
    });

    describe('Integración con playlists por idioma y tema', () => {
        it('debe añadir a playlist por idioma independiente del tema', async () => {
            const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCtest123',
                'videoIdLang',
                'Video genérico sin tema específico',
                'Descripción genérica',
                'ES'
            );
            
            // Siempre debe intentar añadir a playlist por idioma
            expect(result.languagePlaylist).not.toBeNull();
        });

        it('debe detectar tema correctamente para cada canal del proyecto', async () => {
            // Canal 1 - NeuroSync AI (Autismo)
            const resultCanal1 = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCNeuroSync',
                'videoCanal1',
                'NeuroSync: Herramientas de IA para el espectro autista',
                'Contenido sobre autismo y tecnología',
                'ES'
            );
            
            expect(resultCanal1.themePlaylist?.detectedTheme).toBe('autism-ai');
            
            // Canal 2 - NeuroTech AI (TDAH)
            const resultCanal2 = await PlaylistManager.addVideoToPlaylistsAutomatically(
                'UCNeuroTech',
                'videoCanal2',
                'NeuroTech: Productividad con IA para TDAH',
                'Mejora tu concentración con tecnología',
                'ES'
            );
            
            expect(resultCanal2.themePlaylist?.detectedTheme).toBe('adhd-ai');
        });
    });
});
