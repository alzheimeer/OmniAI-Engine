/**
 * PlaylistManager - Sistema de Playlists Automáticas por Idioma y Tema
 * 
 * Implementa REQ-5.3.1: Crear playlists automáticas por idioma (ES, EN, PT)
 * Implementa REQ-5.3.2: Crear playlists automáticas por tema/keyword principal
 * 
 * Funcionalidades:
 * - Crear playlists automáticas organizadas por idioma
 * - Crear playlists automáticas organizadas por tema/keyword
 * - Detectar tema principal del video a partir del título/keywords
 * - Obtener o crear playlists si no existen
 * - Añadir videos a playlists correspondientes
 * - Configuración de nombres de playlists personalizables
 * 
 * Temas del proyecto:
 * - Canal 1 (NeuroSync AI): Autismo + IA
 * - Canal 2 (NeuroTech AI): TDAH + IA / Productividad
 * 
 * @module PlaylistManager
 */

import { google, youtube_v3 } from 'googleapis';
import { GoogleAuth } from '../auth/GoogleAuth';
import { Logger } from '../infrastructure/Logger';
import { RetryHandler } from '../infrastructure/RetryHandler';

// Logger para PlaylistManager
const logger = new Logger('PlaylistManager');

// RetryHandler preconfigurado para YouTube API
const youtubeRetry = RetryHandler.forAPI('YouTube');

/**
 * Idiomas soportados por el sistema de playlists
 * ES = Español, EN = English, PT = Português
 */
export type SupportedLanguage = 'ES' | 'EN' | 'PT';

/**
 * Temas soportados por el sistema de playlists temáticas
 * Basado en los guardrails de nicho del proyecto
 */
export type SupportedTheme = 
    | 'autism-ai'       // Autismo + IA (Canal 1 - NeuroSync AI)
    | 'adhd-ai'         // TDAH + IA (Canal 2 - NeuroTech AI)
    | 'productivity-ai' // Productividad + IA (Canal 2)
    | 'neurodiversity'  // Neurodivergencia general
    | 'ai-tools';       // Herramientas de IA generales

/**
 * Configuración de una playlist por idioma
 */
export interface PlaylistConfig {
    /** Nombre de la playlist */
    name: string;
    /** Descripción de la playlist */
    description: string;
    /** Idioma de la playlist */
    language: SupportedLanguage;
    /** Privacidad: public, private, unlisted */
    privacyStatus?: 'public' | 'private' | 'unlisted';
}

/**
 * Configuración de una playlist por tema
 */
export interface ThemePlaylistConfig {
    /** Nombre de la playlist */
    name: string;
    /** Descripción de la playlist */
    description: string;
    /** Tema de la playlist */
    theme: SupportedTheme;
    /** Idioma opcional de la playlist (para playlists temáticas por idioma) */
    language?: SupportedLanguage;
    /** Privacidad: public, private, unlisted */
    privacyStatus?: 'public' | 'private' | 'unlisted';
}

/**
 * Resultado de detección de tema
 */
export interface ThemeDetectionResult {
    /** Tema detectado */
    theme: SupportedTheme;
    /** Confianza de la detección (0-1) */
    confidence: number;
    /** Keywords que coincidieron */
    matchedKeywords: string[];
}

/**
 * Metadatos de video para detección de tema
 */
export interface VideoMetadata {
    /** Título del video */
    title: string;
    /** Descripción del video (opcional) */
    description?: string;
    /** Tags/keywords del video (opcional) */
    tags?: string[];
}

/**
 * Configuración de nombres de playlists por canal
 */
export interface ChannelPlaylistConfig {
    /** Nombre del canal */
    channelName: string;
    /** Configuración de playlists por idioma */
    playlists: Record<SupportedLanguage, PlaylistConfig>;
}

/**
 * Resultado de operación de playlist
 */
export interface PlaylistResult {
    /** ID de la playlist */
    playlistId: string;
    /** Nombre de la playlist */
    name: string;
    /** URL de la playlist */
    url: string;
    /** Si fue creada nueva o ya existía */
    created: boolean;
}

/**
 * Resultado de añadir video a playlist
 */
export interface AddVideoResult {
    /** Si se añadió exitosamente */
    success: boolean;
    /** ID del item en la playlist */
    playlistItemId?: string;
    /** ID de la playlist */
    playlistId: string;
    /** ID del video */
    videoId: string;
    /** Mensaje de estado */
    message: string;
}

/**
 * Resultado de añadir video a playlists automáticamente
 * Combina resultados de playlist por idioma y por tema
 */
export interface AutoPlaylistResult {
    /** Si la operación general fue exitosa (al menos playlist por idioma) */
    success: boolean;
    /** ID del video procesado */
    videoId: string;
    /** ID del canal */
    channelId: string;
    /** Idioma del video */
    language: SupportedLanguage;
    /** Resultado de añadir a playlist por idioma */
    languagePlaylist: AddVideoResult | null;
    /** Resultado de añadir a playlist por tema (incluye tema detectado) */
    themePlaylist: (AddVideoResult & { detectedTheme: SupportedTheme; confidence: number }) | null;
    /** Resumen de la operación */
    summary: string;
}

/**
 * Configuración por defecto de playlists por idioma
 * Puede ser sobrescrita por configuración de canal
 */
const DEFAULT_PLAYLIST_CONFIGS: Record<SupportedLanguage, Omit<PlaylistConfig, 'language'>> = {
    ES: {
        name: 'Videos en Español',
        description: 'Colección de videos en español sobre IA y neurodivergencia',
    },
    EN: {
        name: 'English Videos',
        description: 'Collection of English videos about AI and neurodiversity',
    },
    PT: {
        name: 'Vídeos em Português',
        description: 'Coleção de vídeos em português sobre IA e neurodivergência',
    },
};

/**
 * Configuración por defecto de playlists por tema
 * Incluye nombres multiidioma y descripciones descriptivas
 */
const DEFAULT_THEME_PLAYLIST_CONFIGS: Record<SupportedTheme, Record<SupportedLanguage, Omit<ThemePlaylistConfig, 'theme' | 'language'>>> = {
    'autism-ai': {
        ES: {
            name: 'Autismo e Inteligencia Artificial',
            description: 'Videos sobre cómo la IA puede ayudar a personas con autismo: herramientas cognitivas, soporte sensorial y habilidades sociales',
        },
        EN: {
            name: 'Autism and Artificial Intelligence',
            description: 'Videos about how AI can help people with autism: cognitive tools, sensory support, and social skills',
        },
        PT: {
            name: 'Autismo e Inteligência Artificial',
            description: 'Vídeos sobre como a IA pode ajudar pessoas com autismo: ferramentas cognitivas, suporte sensorial e habilidades sociais',
        },
    },
    'adhd-ai': {
        ES: {
            name: 'TDAH e Inteligencia Artificial',
            description: 'Videos sobre cómo la IA puede ayudar a personas con TDAH: productividad, enfoque y automatización',
        },
        EN: {
            name: 'ADHD and Artificial Intelligence',
            description: 'Videos about how AI can help people with ADHD: productivity, focus, and automation',
        },
        PT: {
            name: 'TDAH e Inteligência Artificial',
            description: 'Vídeos sobre como a IA pode ajudar pessoas com TDAH: produtividade, foco e automação',
        },
    },
    'productivity-ai': {
        ES: {
            name: 'Productividad con IA',
            description: 'Videos sobre herramientas de IA para mejorar la productividad y automatización',
        },
        EN: {
            name: 'Productivity with AI',
            description: 'Videos about AI tools for improving productivity and automation',
        },
        PT: {
            name: 'Produtividade com IA',
            description: 'Vídeos sobre ferramentas de IA para melhorar a produtividade e automação',
        },
    },
    'neurodiversity': {
        ES: {
            name: 'Neurodivergencia e IA',
            description: 'Videos sobre neurodivergencia y cómo la tecnología puede empoderar mentes diversas',
        },
        EN: {
            name: 'Neurodiversity and AI',
            description: 'Videos about neurodiversity and how technology can empower diverse minds',
        },
        PT: {
            name: 'Neurodiversidade e IA',
            description: 'Vídeos sobre neurodiversidade e como a tecnologia pode empoderar mentes diversas',
        },
    },
    'ai-tools': {
        ES: {
            name: 'Herramientas de IA',
            description: 'Videos sobre herramientas y tecnologías de inteligencia artificial',
        },
        EN: {
            name: 'AI Tools',
            description: 'Videos about artificial intelligence tools and technologies',
        },
        PT: {
            name: 'Ferramentas de IA',
            description: 'Vídeos sobre ferramentas e tecnologias de inteligência artificial',
        },
    },
};

/**
 * Keywords para detección de temas por idioma
 * Organizadas por tema y luego por idioma para detección multiidioma
 */
const THEME_KEYWORDS: Record<SupportedTheme, Record<SupportedLanguage, string[]>> = {
    'autism-ai': {
        ES: ['autismo', 'autista', 'tea', 'asperger', 'espectro autista', 'neurosync', 'sensorial', 'estimulación'],
        EN: ['autism', 'autistic', 'asd', 'asperger', 'autism spectrum', 'neurosync', 'sensory', 'stimulation'],
        PT: ['autismo', 'autista', 'tea', 'asperger', 'espectro autista', 'neurosync', 'sensorial', 'estimulação'],
    },
    'adhd-ai': {
        ES: ['tdah', 'déficit de atención', 'hiperactividad', 'adhd', 'neurotech', 'concentración', 'foco', 'distracción'],
        EN: ['adhd', 'attention deficit', 'hyperactivity', 'neurotech', 'concentration', 'focus', 'distraction'],
        PT: ['tdah', 'déficit de atenção', 'hiperatividade', 'adhd', 'neurotech', 'concentração', 'foco', 'distração'],
    },
    'productivity-ai': {
        ES: ['productividad', 'automatización', 'eficiencia', 'gestión del tiempo', 'organización', 'workflow', 'tareas'],
        EN: ['productivity', 'automation', 'efficiency', 'time management', 'organization', 'workflow', 'tasks'],
        PT: ['produtividade', 'automação', 'eficiência', 'gestão do tempo', 'organização', 'workflow', 'tarefas'],
    },
    'neurodiversity': {
        ES: ['neurodivergencia', 'neurodivergente', 'diversidad neurológica', 'cerebro diferente', 'mentes diversas'],
        EN: ['neurodiversity', 'neurodivergent', 'neurological diversity', 'different brain', 'diverse minds'],
        PT: ['neurodiversidade', 'neurodivergente', 'diversidade neurológica', 'cérebro diferente', 'mentes diversas'],
    },
    'ai-tools': {
        ES: ['inteligencia artificial', 'ia', 'chatgpt', 'gpt', 'claude', 'gemini', 'machine learning', 'aprendizaje automático'],
        EN: ['artificial intelligence', 'ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'machine learning'],
        PT: ['inteligência artificial', 'ia', 'chatgpt', 'gpt', 'claude', 'gemini', 'machine learning', 'aprendizado de máquina'],
    },
};

/**
 * PlaylistManager - Gestiona playlists automáticas por idioma
 * 
 * Permite crear y gestionar playlists organizadas por idioma (ES, EN, PT)
 * utilizando la YouTube Data API v3.
 * 
 * @example
 * ```typescript
 * // Obtener o crear playlist por idioma
 * const playlist = await PlaylistManager.getOrCreatePlaylistByLanguage('ES');
 * 
 * // Añadir video a playlist de idioma
 * const result = await PlaylistManager.addVideoToLanguagePlaylist(videoId, 'ES');
 * ```
 */
export class PlaylistManager {
    /** Cache de IDs de playlists por idioma y canal */
    private static playlistCache: Map<string, string> = new Map();

    /**
     * Obtiene o crea una playlist por idioma
     * Si la playlist ya existe, retorna su ID. Si no, la crea.
     * 
     * @param language Idioma de la playlist (ES, EN, PT)
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @param customConfig Configuración personalizada de playlist (opcional)
     * @returns Resultado de la operación con ID y URL de playlist
     */
    public static async getOrCreatePlaylistByLanguage(
        language: SupportedLanguage,
        tokenFilePath?: string,
        customConfig?: Partial<PlaylistConfig>
    ): Promise<PlaylistResult> {
        const cacheKey = this.getCacheKey(language, tokenFilePath);
        
        // Verificar cache primero
        const cachedId = this.playlistCache.get(cacheKey);
        if (cachedId) {
            logger.debug('Playlist encontrada en cache', { language, playlistId: cachedId });
            return {
                playlistId: cachedId,
                name: customConfig?.name || DEFAULT_PLAYLIST_CONFIGS[language].name,
                url: `https://www.youtube.com/playlist?list=${cachedId}`,
                created: false,
            };
        }

        const authClient = await GoogleAuth.getClient(tokenFilePath);
        const youtube = google.youtube({ version: 'v3', auth: authClient });

        // Construir configuración final
        const config: PlaylistConfig = {
            ...DEFAULT_PLAYLIST_CONFIGS[language],
            language,
            privacyStatus: 'public',
            ...customConfig,
        };

        logger.info('Buscando playlist existente', { language, name: config.name });

        // Buscar playlist existente por nombre
        const existingPlaylist = await this.findPlaylistByName(youtube, config.name);
        
        if (existingPlaylist) {
            logger.info('Playlist existente encontrada', { 
                playlistId: existingPlaylist.id,
                name: config.name 
            });
            this.playlistCache.set(cacheKey, existingPlaylist.id!);
            return {
                playlistId: existingPlaylist.id!,
                name: config.name,
                url: `https://www.youtube.com/playlist?list=${existingPlaylist.id}`,
                created: false,
            };
        }

        // Crear nueva playlist
        logger.info('Creando nueva playlist', { language, name: config.name });
        
        const newPlaylist = await this.createPlaylist(youtube, config);
        this.playlistCache.set(cacheKey, newPlaylist.id!);
        
        logger.info('Playlist creada exitosamente', { 
            playlistId: newPlaylist.id,
            name: config.name,
            url: `https://www.youtube.com/playlist?list=${newPlaylist.id}`
        });

        return {
            playlistId: newPlaylist.id!,
            name: config.name,
            url: `https://www.youtube.com/playlist?list=${newPlaylist.id}`,
            created: true,
        };
    }

    /**
     * Añade un video a la playlist del idioma correspondiente
     * 
     * @param videoId ID del video de YouTube a añadir
     * @param language Idioma de la playlist destino
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @param customConfig Configuración personalizada de playlist (opcional)
     * @returns Resultado de la operación
     */
    public static async addVideoToLanguagePlaylist(
        videoId: string,
        language: SupportedLanguage,
        tokenFilePath?: string,
        customConfig?: Partial<PlaylistConfig>
    ): Promise<AddVideoResult> {
        try {
            // Obtener o crear la playlist del idioma
            const playlist = await this.getOrCreatePlaylistByLanguage(
                language,
                tokenFilePath,
                customConfig
            );

            // Añadir video a la playlist
            return await this.addVideoToPlaylist(
                videoId,
                playlist.playlistId,
                tokenFilePath
            );
        } catch (error: any) {
            logger.error('Error añadiendo video a playlist de idioma', error, {
                videoId,
                language,
            });
            return {
                success: false,
                playlistId: '',
                videoId,
                message: `Error: ${error.message}`,
            };
        }
    }

    /**
     * Añade un video a una playlist específica por ID
     * 
     * @param videoId ID del video de YouTube
     * @param playlistId ID de la playlist destino
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @returns Resultado de la operación
     */
    public static async addVideoToPlaylist(
        videoId: string,
        playlistId: string,
        tokenFilePath?: string
    ): Promise<AddVideoResult> {
        const authClient = await GoogleAuth.getClient(tokenFilePath);
        const youtube = google.youtube({ version: 'v3', auth: authClient });

        try {
            // Verificar si el video ya está en la playlist
            const isAlreadyInPlaylist = await this.isVideoInPlaylist(
                youtube,
                videoId,
                playlistId
            );

            if (isAlreadyInPlaylist) {
                logger.info('Video ya existe en playlist', { videoId, playlistId });
                return {
                    success: true,
                    playlistId,
                    videoId,
                    message: 'Video ya existe en la playlist',
                };
            }

            // Añadir video a playlist con retry
            logger.info('Añadiendo video a playlist', { videoId, playlistId });
            
            const response = await youtubeRetry.execute(
                () => youtube.playlistItems.insert({
                    part: ['snippet'],
                    requestBody: {
                        snippet: {
                            playlistId,
                            resourceId: {
                                kind: 'youtube#video',
                                videoId,
                            },
                        },
                    },
                }),
                'YouTube playlistItems.insert'
            );

            logger.info('Video añadido a playlist exitosamente', {
                videoId,
                playlistId,
                playlistItemId: response.data.id,
            });

            return {
                success: true,
                playlistItemId: response.data.id || undefined,
                playlistId,
                videoId,
                message: 'Video añadido a playlist exitosamente',
            };
        } catch (error: any) {
            logger.error('Error añadiendo video a playlist', error, {
                videoId,
                playlistId,
            });
            return {
                success: false,
                playlistId,
                videoId,
                message: `Error: ${error.message}`,
            };
        }
    }

    /**
     * Obtiene todas las playlists del canal organizadas por idioma
     * 
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @returns Map de idioma a PlaylistResult
     */
    public static async getAllLanguagePlaylists(
        tokenFilePath?: string
    ): Promise<Map<SupportedLanguage, PlaylistResult | null>> {
        const results = new Map<SupportedLanguage, PlaylistResult | null>();
        const languages: SupportedLanguage[] = ['ES', 'EN', 'PT'];

        for (const language of languages) {
            try {
                const playlist = await this.getOrCreatePlaylistByLanguage(
                    language,
                    tokenFilePath
                );
                results.set(language, playlist);
            } catch (error: any) {
                logger.warn(`No se pudo obtener playlist para ${language}`, { 
                    error: error.message 
                });
                results.set(language, null);
            }
        }

        return results;
    }

    /**
     * Limpia la cache de playlists
     * Útil para forzar recarga desde YouTube API
     */
    public static clearCache(): void {
        this.playlistCache.clear();
        logger.debug('Cache de playlists limpiado');
    }

    /**
     * Obtiene la configuración por defecto de playlists
     */
    public static getDefaultPlaylistConfigs(): Record<SupportedLanguage, Omit<PlaylistConfig, 'language'>> {
        return { ...DEFAULT_PLAYLIST_CONFIGS };
    }

    /**
     * Actualiza la configuración por defecto de una playlist
     * 
     * @param language Idioma a actualizar
     * @param config Nueva configuración
     */
    public static setDefaultPlaylistConfig(
        language: SupportedLanguage,
        config: Partial<Omit<PlaylistConfig, 'language'>>
    ): void {
        DEFAULT_PLAYLIST_CONFIGS[language] = {
            ...DEFAULT_PLAYLIST_CONFIGS[language],
            ...config,
        };
        logger.debug('Configuración de playlist actualizada', { language, config });
    }

    // ==================== Métodos para Playlists Temáticas (REQ-5.3.2) ====================

    /**
     * Detecta el tema principal de un video basado en su título y keywords
     * Implementa REQ-5.3.2: Detectar tema principal del video a partir del título/keywords
     * 
     * @param metadata Metadatos del video (título, descripción, tags)
     * @param preferredLanguage Idioma preferido para detección (opcional)
     * @returns Resultado de detección con tema, confianza y keywords coincidentes
     * 
     * @example
     * ```typescript
     * const result = PlaylistManager.detectVideoTheme({
     *     title: 'Cómo ChatGPT puede ayudar a personas con autismo',
     *     tags: ['autismo', 'ia', 'chatgpt']
     * });
     * // { theme: 'autism-ai', confidence: 0.85, matchedKeywords: ['autismo', 'chatgpt'] }
     * ```
     */
    public static detectVideoTheme(
        metadata: VideoMetadata,
        preferredLanguage?: SupportedLanguage
    ): ThemeDetectionResult {
        const textToAnalyze = [
            metadata.title.toLowerCase(),
            (metadata.description || '').toLowerCase(),
            ...(metadata.tags || []).map(t => t.toLowerCase()),
        ].join(' ');

        // Puntuación por tema
        const themeScores: Record<SupportedTheme, { score: number; matches: string[] }> = {
            'autism-ai': { score: 0, matches: [] },
            'adhd-ai': { score: 0, matches: [] },
            'productivity-ai': { score: 0, matches: [] },
            'neurodiversity': { score: 0, matches: [] },
            'ai-tools': { score: 0, matches: [] },
        };

        // Prioridad de temas (más específicos primero)
        // Los temas más específicos tienen multiplicador mayor
        const themePriority: Record<SupportedTheme, number> = {
            'autism-ai': 2.0,       // Alta prioridad - tema de Canal 1
            'adhd-ai': 2.0,         // Alta prioridad - tema de Canal 2
            'neurodiversity': 1.5,  // Media prioridad
            'productivity-ai': 1.3, // Media-baja prioridad
            'ai-tools': 1.0,        // Genérico - sin boost
        };

        // Idiomas a verificar (priorizar preferido si existe)
        const languagesToCheck: SupportedLanguage[] = preferredLanguage 
            ? [preferredLanguage, 'ES', 'EN', 'PT'].filter((v, i, a) => a.indexOf(v) === i) as SupportedLanguage[]
            : ['ES', 'EN', 'PT'];

        // Analizar cada tema
        for (const theme of Object.keys(THEME_KEYWORDS) as SupportedTheme[]) {
            for (const lang of languagesToCheck) {
                const keywords = THEME_KEYWORDS[theme][lang];
                for (const keyword of keywords) {
                    // Buscar keyword en el texto (palabra completa o parte de frase)
                    const keywordLower = keyword.toLowerCase();
                    if (textToAnalyze.includes(keywordLower)) {
                        // Peso mayor para coincidencias en título
                        const inTitle = metadata.title.toLowerCase().includes(keywordLower);
                        const inTags = (metadata.tags || []).some(t => t.toLowerCase().includes(keywordLower));
                        
                        // Peso base: keywords más largas/específicas valen más
                        let weight = 1 + (keywordLower.length > 5 ? 1 : 0);
                        if (inTitle) weight += 3;  // Título tiene más peso
                        if (inTags) weight += 2;   // Tags también tienen peso extra
                        
                        themeScores[theme].score += weight;
                        if (!themeScores[theme].matches.includes(keyword)) {
                            themeScores[theme].matches.push(keyword);
                        }
                    }
                }
            }
        }

        // Aplicar multiplicador de prioridad a cada tema
        for (const theme of Object.keys(themeScores) as SupportedTheme[]) {
            themeScores[theme].score *= themePriority[theme];
        }

        // Encontrar tema con mayor puntuación
        let bestTheme: SupportedTheme = 'ai-tools';  // Default si no hay coincidencias
        let bestScore = 0;

        for (const [theme, data] of Object.entries(themeScores) as [SupportedTheme, { score: number; matches: string[] }][]) {
            if (data.score > bestScore) {
                bestScore = data.score;
                bestTheme = theme;
            }
        }

        // Calcular confianza (0-1) basada en puntuación
        // Máximo teórico: si coinciden todas las keywords con peso máximo
        const maxPossibleScore = 30;  // Umbral razonable para confianza 1.0
        const confidence = Math.min(bestScore / maxPossibleScore, 1);

        logger.debug('Tema detectado para video', {
            title: metadata.title,
            detectedTheme: bestTheme,
            confidence,
            matchedKeywords: themeScores[bestTheme].matches,
        });

        return {
            theme: bestTheme,
            confidence,
            matchedKeywords: themeScores[bestTheme].matches,
        };
    }

    /**
     * Obtiene o crea una playlist por tema
     * Implementa REQ-5.3.2: Crear playlists automáticas por tema/keyword
     * 
     * @param theme Tema de la playlist
     * @param language Idioma de la playlist
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @param customConfig Configuración personalizada (opcional)
     * @returns Resultado de la operación con ID y URL de playlist
     * 
     * @example
     * ```typescript
     * const playlist = await PlaylistManager.getOrCreatePlaylistByTheme('autism-ai', 'ES');
     * // Crea o retorna "Autismo e Inteligencia Artificial"
     * ```
     */
    public static async getOrCreatePlaylistByTheme(
        theme: SupportedTheme,
        language: SupportedLanguage,
        tokenFilePath?: string,
        customConfig?: Partial<ThemePlaylistConfig>
    ): Promise<PlaylistResult> {
        const cacheKey = this.getThemeCacheKey(theme, language, tokenFilePath);
        
        // Verificar cache primero
        const cachedId = this.playlistCache.get(cacheKey);
        if (cachedId) {
            const config = DEFAULT_THEME_PLAYLIST_CONFIGS[theme][language];
            logger.debug('Playlist temática encontrada en cache', { theme, language, playlistId: cachedId });
            return {
                playlistId: cachedId,
                name: customConfig?.name || config.name,
                url: `https://www.youtube.com/playlist?list=${cachedId}`,
                created: false,
            };
        }

        const authClient = await GoogleAuth.getClient(tokenFilePath);
        const youtube = google.youtube({ version: 'v3', auth: authClient });

        // Obtener configuración por defecto para el tema e idioma
        const defaultConfig = DEFAULT_THEME_PLAYLIST_CONFIGS[theme][language];
        
        // Construir configuración final
        const config: PlaylistConfig = {
            name: customConfig?.name || defaultConfig.name,
            description: customConfig?.description || defaultConfig.description,
            language,
            privacyStatus: customConfig?.privacyStatus || 'public',
        };

        logger.info('Buscando playlist temática existente', { theme, language, name: config.name });

        // Buscar playlist existente por nombre
        const existingPlaylist = await this.findPlaylistByName(youtube, config.name);
        
        if (existingPlaylist) {
            logger.info('Playlist temática existente encontrada', { 
                playlistId: existingPlaylist.id,
                theme,
                name: config.name 
            });
            this.playlistCache.set(cacheKey, existingPlaylist.id!);
            return {
                playlistId: existingPlaylist.id!,
                name: config.name,
                url: `https://www.youtube.com/playlist?list=${existingPlaylist.id}`,
                created: false,
            };
        }

        // Crear nueva playlist
        logger.info('Creando nueva playlist temática', { theme, language, name: config.name });
        
        const newPlaylist = await this.createPlaylist(youtube, config);
        this.playlistCache.set(cacheKey, newPlaylist.id!);
        
        logger.info('Playlist temática creada exitosamente', { 
            playlistId: newPlaylist.id,
            theme,
            name: config.name,
            url: `https://www.youtube.com/playlist?list=${newPlaylist.id}`
        });

        return {
            playlistId: newPlaylist.id!,
            name: config.name,
            url: `https://www.youtube.com/playlist?list=${newPlaylist.id}`,
            created: true,
        };
    }

    /**
     * Añade un video a la playlist del tema correspondiente
     * Detecta automáticamente el tema basado en metadatos del video
     * 
     * @param videoId ID del video de YouTube
     * @param metadata Metadatos del video (título, descripción, tags)
     * @param language Idioma de la playlist temática
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @returns Resultado de la operación
     * 
     * @example
     * ```typescript
     * const result = await PlaylistManager.addVideoToThemePlaylist(
     *     'abc123',
     *     { title: 'Herramientas de IA para TDAH', tags: ['tdah', 'ia'] },
     *     'ES'
     * );
     * // Añade el video a la playlist "TDAH e Inteligencia Artificial"
     * ```
     */
    public static async addVideoToThemePlaylist(
        videoId: string,
        metadata: VideoMetadata,
        language: SupportedLanguage,
        tokenFilePath?: string
    ): Promise<AddVideoResult & { detectedTheme: SupportedTheme; confidence: number }> {
        try {
            // Detectar tema del video
            const detection = this.detectVideoTheme(metadata, language);
            
            logger.info('Tema detectado para video', {
                videoId,
                title: metadata.title,
                theme: detection.theme,
                confidence: detection.confidence,
                matchedKeywords: detection.matchedKeywords,
            });

            // Obtener o crear la playlist del tema
            const playlist = await this.getOrCreatePlaylistByTheme(
                detection.theme,
                language,
                tokenFilePath
            );

            // Añadir video a la playlist
            const result = await this.addVideoToPlaylist(
                videoId,
                playlist.playlistId,
                tokenFilePath
            );

            return {
                ...result,
                detectedTheme: detection.theme,
                confidence: detection.confidence,
            };
        } catch (error: any) {
            logger.error('Error añadiendo video a playlist temática', error, {
                videoId,
                title: metadata.title,
            });
            return {
                success: false,
                playlistId: '',
                videoId,
                message: `Error: ${error.message}`,
                detectedTheme: 'ai-tools',
                confidence: 0,
            };
        }
    }

    /**
     * Obtiene todas las playlists temáticas para un idioma
     * 
     * @param language Idioma de las playlists
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @returns Map de tema a PlaylistResult
     */
    public static async getAllThemePlaylists(
        language: SupportedLanguage,
        tokenFilePath?: string
    ): Promise<Map<SupportedTheme, PlaylistResult | null>> {
        const results = new Map<SupportedTheme, PlaylistResult | null>();
        const themes: SupportedTheme[] = ['autism-ai', 'adhd-ai', 'productivity-ai', 'neurodiversity', 'ai-tools'];

        for (const theme of themes) {
            try {
                const playlist = await this.getOrCreatePlaylistByTheme(
                    theme,
                    language,
                    tokenFilePath
                );
                results.set(theme, playlist);
            } catch (error: any) {
                logger.warn(`No se pudo obtener playlist para tema ${theme}`, { 
                    error: error.message 
                });
                results.set(theme, null);
            }
        }

        return results;
    }

    /**
     * Obtiene la configuración por defecto de playlists temáticas
     */
    public static getDefaultThemePlaylistConfigs(): Record<SupportedTheme, Record<SupportedLanguage, Omit<ThemePlaylistConfig, 'theme' | 'language'>>> {
        // Retornar copia para evitar modificaciones
        return JSON.parse(JSON.stringify(DEFAULT_THEME_PLAYLIST_CONFIGS));
    }

    /**
     * Obtiene los temas soportados
     */
    public static getSupportedThemes(): SupportedTheme[] {
        return ['autism-ai', 'adhd-ai', 'productivity-ai', 'neurodiversity', 'ai-tools'];
    }

    /**
     * Obtiene las keywords de detección por tema
     */
    public static getThemeKeywords(): Record<SupportedTheme, Record<SupportedLanguage, string[]>> {
        // Retornar copia para evitar modificaciones
        return JSON.parse(JSON.stringify(THEME_KEYWORDS));
    }

    // ==================== Métodos Privados ====================

    /**
     * Genera clave de cache para playlist
     */
    private static getCacheKey(language: SupportedLanguage, tokenFilePath?: string): string {
        const channel = tokenFilePath?.includes('channel2') ? 'channel2' : 'channel1';
        return `${channel}:lang:${language}`;
    }

    /**
     * Genera clave de cache para playlist temática
     */
    private static getThemeCacheKey(theme: SupportedTheme, language: SupportedLanguage, tokenFilePath?: string): string {
        const channel = tokenFilePath?.includes('channel2') ? 'channel2' : 'channel1';
        return `${channel}:theme:${theme}:${language}`;
    }

    /**
     * Busca una playlist por nombre en el canal
     */
    private static async findPlaylistByName(
        youtube: youtube_v3.Youtube,
        name: string
    ): Promise<youtube_v3.Schema$Playlist | null> {
        try {
            const response = await youtubeRetry.execute(
                () => youtube.playlists.list({
                    part: ['snippet'],
                    mine: true,
                    maxResults: 50,
                }),
                'YouTube playlists.list'
            );

            const playlists = response.data.items || [];
            return playlists.find(p => p.snippet?.title === name) || null;
        } catch (error: any) {
            logger.warn('Error buscando playlist', { name, error: error.message });
            return null;
        }
    }

    /**
     * Crea una nueva playlist
     */
    private static async createPlaylist(
        youtube: youtube_v3.Youtube,
        config: PlaylistConfig
    ): Promise<youtube_v3.Schema$Playlist> {
        const response = await youtubeRetry.execute(
            () => youtube.playlists.insert({
                part: ['snippet', 'status'],
                requestBody: {
                    snippet: {
                        title: config.name,
                        description: config.description,
                        defaultLanguage: this.languageToISO(config.language),
                    },
                    status: {
                        privacyStatus: config.privacyStatus || 'public',
                    },
                },
            }),
            'YouTube playlists.insert'
        );

        return response.data;
    }

    /**
     * Verifica si un video ya está en una playlist
     */
    private static async isVideoInPlaylist(
        youtube: youtube_v3.Youtube,
        videoId: string,
        playlistId: string
    ): Promise<boolean> {
        try {
            const response = await youtubeRetry.execute(
                () => youtube.playlistItems.list({
                    part: ['snippet'],
                    playlistId,
                    videoId,
                    maxResults: 1,
                }),
                'YouTube playlistItems.list'
            );

            return (response.data.items?.length || 0) > 0;
        } catch (error: any) {
            logger.warn('Error verificando video en playlist', { 
                videoId, 
                playlistId, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Convierte código de idioma a formato ISO 639-1
     */
    private static languageToISO(language: SupportedLanguage): string {
        const isoMap: Record<SupportedLanguage, string> = {
            ES: 'es',
            EN: 'en',
            PT: 'pt',
        };
        return isoMap[language];
    }

    // ==================== Método para Añadir Videos Automáticamente (REQ-5.3.3) ====================

    /**
     * Añade un video a las playlists correspondientes automáticamente
     * Implementa REQ-5.3.3: Añadir videos nuevos a playlists correspondientes automáticamente
     * 
     * Este método añade el video tanto a:
     * 1. La playlist por idioma (siempre)
     * 2. La playlist por tema (si se detecta un tema con confianza suficiente)
     * 
     * @param channelId ID del canal de YouTube (usado para logging)
     * @param videoId ID del video de YouTube a añadir
     * @param title Título del video
     * @param description Descripción del video
     * @param language Idioma del video (ES, EN, PT)
     * @param tokenFilePath Ruta al archivo de tokens (opcional)
     * @param minConfidenceThreshold Umbral mínimo de confianza para añadir a playlist temática (default: 0.3)
     * @returns Resultado de la operación con detalles de ambas playlists
     * 
     * @example
     * ```typescript
     * const result = await PlaylistManager.addVideoToPlaylistsAutomatically(
     *     'UCxxxxxx',
     *     'abc123',
     *     'Herramientas de IA para personas con autismo',
     *     'Guía completa sobre cómo la IA ayuda...',
     *     'ES'
     * );
     * // Resultado:
     * // {
     * //   success: true,
     * //   languagePlaylist: { success: true, playlistId: 'PLlang123', ... },
     * //   themePlaylist: { success: true, playlistId: 'PLtheme456', detectedTheme: 'autism-ai', ... },
     * //   summary: 'Video añadido a 2 playlists: Videos en Español, Autismo e Inteligencia Artificial'
     * // }
     * ```
     */
    public static async addVideoToPlaylistsAutomatically(
        channelId: string,
        videoId: string,
        title: string,
        description: string,
        language: SupportedLanguage,
        tokenFilePath?: string,
        minConfidenceThreshold: number = 0.3
    ): Promise<AutoPlaylistResult> {
        const results: AutoPlaylistResult = {
            success: false,
            videoId,
            channelId,
            language,
            languagePlaylist: null,
            themePlaylist: null,
            summary: '',
        };

        const addedPlaylists: string[] = [];

        logger.info('Iniciando adición automática de video a playlists', {
            channelId,
            videoId,
            title,
            language,
        });

        // 1. Añadir a playlist por idioma (siempre)
        try {
            logger.debug('Añadiendo video a playlist por idioma', { videoId, language });
            
            const languageResult = await this.addVideoToLanguagePlaylist(
                videoId,
                language,
                tokenFilePath
            );

            results.languagePlaylist = languageResult;

            if (languageResult.success) {
                // Obtener nombre de la playlist para el resumen
                const playlistConfig = DEFAULT_PLAYLIST_CONFIGS[language];
                addedPlaylists.push(playlistConfig.name);
                
                logger.info('Video añadido a playlist por idioma', {
                    videoId,
                    language,
                    playlistId: languageResult.playlistId,
                });
            } else {
                logger.warn('Error añadiendo video a playlist por idioma', {
                    videoId,
                    language,
                    error: languageResult.message,
                });
            }
        } catch (error: any) {
            logger.error('Excepción añadiendo video a playlist por idioma', error, {
                videoId,
                language,
            });
            results.languagePlaylist = {
                success: false,
                playlistId: '',
                videoId,
                message: `Error: ${error.message}`,
            };
        }

        // 2. Detectar tema y añadir a playlist temática (si aplica)
        try {
            const metadata: VideoMetadata = {
                title,
                description,
            };

            // Detectar tema del video
            const themeDetection = this.detectVideoTheme(metadata, language);
            
            logger.debug('Tema detectado para video', {
                videoId,
                title,
                theme: themeDetection.theme,
                confidence: themeDetection.confidence,
                matchedKeywords: themeDetection.matchedKeywords,
            });

            // Solo añadir a playlist temática si la confianza es suficiente
            if (themeDetection.confidence >= minConfidenceThreshold) {
                logger.debug('Añadiendo video a playlist por tema', {
                    videoId,
                    theme: themeDetection.theme,
                    language,
                });

                const themeResult = await this.addVideoToThemePlaylist(
                    videoId,
                    metadata,
                    language,
                    tokenFilePath
                );

                // Usar tema y confianza detectados localmente (más precisos que los del método interno)
                results.themePlaylist = {
                    ...themeResult,
                    detectedTheme: themeDetection.theme,
                    confidence: themeDetection.confidence,
                };

                if (themeResult.success) {
                    // Obtener nombre de la playlist temática para el resumen
                    const themeConfig = DEFAULT_THEME_PLAYLIST_CONFIGS[themeDetection.theme][language];
                    addedPlaylists.push(themeConfig.name);
                    
                    logger.info('Video añadido a playlist por tema', {
                        videoId,
                        theme: themeDetection.theme,
                        playlistId: themeResult.playlistId,
                        confidence: themeDetection.confidence,
                    });
                } else {
                    logger.warn('Error añadiendo video a playlist por tema', {
                        videoId,
                        theme: themeDetection.theme,
                        error: themeResult.message,
                    });
                }
            } else {
                logger.debug('Confianza insuficiente para playlist temática', {
                    videoId,
                    theme: themeDetection.theme,
                    confidence: themeDetection.confidence,
                    threshold: minConfidenceThreshold,
                });
                
                // Registrar que no se añadió por baja confianza
                results.themePlaylist = {
                    success: false,
                    playlistId: '',
                    videoId,
                    message: `Confianza insuficiente (${(themeDetection.confidence * 100).toFixed(1)}% < ${(minConfidenceThreshold * 100).toFixed(1)}%)`,
                    detectedTheme: themeDetection.theme,
                    confidence: themeDetection.confidence,
                };
            }
        } catch (error: any) {
            logger.error('Excepción en detección/adición de tema', error, {
                videoId,
                title,
            });
            results.themePlaylist = {
                success: false,
                playlistId: '',
                videoId,
                message: `Error: ${error.message}`,
                detectedTheme: 'ai-tools',
                confidence: 0,
            };
        }

        // 3. Generar resumen y determinar éxito global
        const languageSuccess = results.languagePlaylist?.success || false;
        const themeSuccess = results.themePlaylist?.success || false;
        
        // Éxito si al menos la playlist por idioma fue exitosa
        results.success = languageSuccess;

        if (addedPlaylists.length > 0) {
            results.summary = `Video añadido a ${addedPlaylists.length} playlist${addedPlaylists.length > 1 ? 's' : ''}: ${addedPlaylists.join(', ')}`;
        } else {
            results.summary = 'No se pudo añadir el video a ninguna playlist';
        }

        logger.info('Adición automática de video completada', {
            videoId,
            channelId,
            success: results.success,
            playlistsAdded: addedPlaylists.length,
            summary: results.summary,
        });

        return results;
    }
}
