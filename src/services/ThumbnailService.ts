/**
 * ThumbnailService.ts
 * 
 * Servicio centralizado para la generación de thumbnails con plantillas rotables.
 * Integra ThumbnailGenerator (renderizado) con ThumbnailTransformer (anti-detección)
 * y las nuevas plantillas visuales.
 * 
 * REQ-5.1.1: Crear 5+ plantillas de thumbnail rotables para evitar monotonía
 * 
 * Características:
 * - Rotación aleatoria/round-robin de plantillas
 * - Tracking de plantillas usadas para evitar repetición
 * - Selección por mood/tema usando tags
 * - Integración con anti-detección (ThumbnailTransformer)
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import dotenv from 'dotenv';
import { 
    ThumbnailTemplate, 
    ALL_TEMPLATES, 
    TEMPLATES_BY_ID,
    HIGHLIGHT_KEYWORDS,
    DynamicElement,
    DynamicElementsGenerator,
    DynamicElementsRenderer
} from './ThumbnailTemplates';
import { ThumbnailTransformer } from '../generators/ThumbnailTransformer';
import { TransformationParams } from '../generators/VideoTransformer';
import { 
    ChannelBrandingService, 
    ChannelId, 
    ChannelBrandingConfig 
} from './ChannelBranding';

dotenv.config();

// ===== INTERFACES =====

/**
 * Configuración para generar un thumbnail
 */
export interface ThumbnailGenerationConfig {
    /** Título del video */
    title: string;
    
    /** Si es un Short (vertical) o video normal (horizontal) */
    isShort: boolean;
    
    /** Prompt para buscar imagen de fondo en Pexels */
    visualPrompt?: string;
    
    /** Nombre del archivo de salida */
    outputFilename: string;
    
    /** ID de plantilla específica (opcional, si no se especifica se rota) */
    templateId?: string;
    
    /** Tags/mood para seleccionar plantilla automáticamente */
    moodTags?: string[];
    
    /** Nombre del canal para branding */
    channelName?: string;
    
    /** ID del canal para branding específico (REQ-5.1.4) */
    channelId?: ChannelId;
    
    /** Parámetros de transformación del video asociado (para sincronización) */
    videoTransformParams?: TransformationParams;
    
    /** Si se debe aplicar transformación anti-detección */
    applyAntiDetection?: boolean;
    
    /** Habilitar elementos dinámicos (flechas, círculos, emojis) - REQ-5.1.2 */
    enableDynamicElements?: boolean;
    
    /** Elementos dinámicos personalizados (sobreescribe los preset de la plantilla) */
    customDynamicElements?: DynamicElement[];
    
    /** Semilla para reproducibilidad de elementos aleatorios */
    dynamicElementsSeed?: number;
    
    /** Aplicar branding específico del canal a la plantilla (REQ-5.1.4) */
    applyChannelBranding?: boolean;
    
    /** Intensidad del branding del canal (0-1, default 0.7) */
    channelBrandingIntensity?: number;
}

/**
 * Resultado de la generación de thumbnail
 */
export interface ThumbnailGenerationResult {
    /** Ruta al thumbnail generado */
    outputPath: string;
    
    /** ID de la plantilla usada */
    templateId: string;
    
    /** Nombre de la plantilla usada */
    templateName: string;
    
    /** Hash MD5 del thumbnail (para verificación de unicidad) */
    hash?: string;
    
    /** Si se aplicó transformación anti-detección */
    antiDetectionApplied: boolean;
    
    /** Elementos dinámicos aplicados (REQ-5.1.2) */
    dynamicElementsApplied?: DynamicElement[];
    
    /** Número de elementos dinámicos aplicados */
    dynamicElementsCount?: number;
    
    /** ID del canal si se aplicó branding específico (REQ-5.1.4) */
    channelId?: ChannelId;
    
    /** Nombre del canal usado para el branding */
    channelName?: string;
    
    /** Si se aplicó branding específico del canal */
    channelBrandingApplied?: boolean;
}

/**
 * Estado interno del servicio para tracking de plantillas usadas
 */
interface TemplateUsageTracker {
    /** Últimas plantillas usadas (máximo 10) */
    recentTemplates: string[];
    
    /** Contador de uso por plantilla */
    usageCount: Record<string, number>;
    
    /** Índice actual para round-robin */
    roundRobinIndex: number;
}

// ===== CLASE PRINCIPAL =====

/**
 * ThumbnailService - Servicio centralizado para generación de thumbnails
 * 
 * Gestiona la rotación de plantillas, renderizado con Puppeteer,
 * y aplicación de transformaciones anti-detección.
 */
export class ThumbnailService {
    /** Tracker de uso de plantillas */
    private static usageTracker: TemplateUsageTracker = {
        recentTemplates: [],
        usageCount: {},
        roundRobinIndex: 0
    };

    // ===== SELECCIÓN DE PLANTILLAS =====

    /**
     * Selecciona una plantilla usando round-robin evitando repetición inmediata
     * 
     * @returns Plantilla seleccionada
     */
    public static selectTemplateRoundRobin(): ThumbnailTemplate {
        const templates = ALL_TEMPLATES;
        const tracker = ThumbnailService.usageTracker;
        
        // Obtener la plantilla actual en el índice round-robin
        let template = templates[tracker.roundRobinIndex];
        
        // Si la plantilla fue usada recientemente, avanzar al siguiente
        let attempts = 0;
        while (tracker.recentTemplates.slice(-2).includes(template.id) && attempts < templates.length) {
            tracker.roundRobinIndex = (tracker.roundRobinIndex + 1) % templates.length;
            template = templates[tracker.roundRobinIndex];
            attempts++;
        }
        
        // Avanzar el índice para la próxima llamada
        tracker.roundRobinIndex = (tracker.roundRobinIndex + 1) % templates.length;
        
        // Registrar uso
        ThumbnailService.trackTemplateUsage(template.id);
        
        return template;
    }

    /**
     * Selecciona una plantilla aleatoria evitando repetición
     * 
     * @returns Plantilla seleccionada aleatoriamente
     */
    public static selectTemplateRandom(): ThumbnailTemplate {
        const tracker = ThumbnailService.usageTracker;
        
        // Filtrar plantillas que no fueron usadas recientemente
        const recentIds = tracker.recentTemplates.slice(-3);
        const availableTemplates = ALL_TEMPLATES.filter(t => !recentIds.includes(t.id));
        
        // Si todas fueron usadas recientemente, usar todas
        const pool = availableTemplates.length > 0 ? availableTemplates : ALL_TEMPLATES;
        
        // Selección aleatoria
        const randomIndex = Math.floor(Math.random() * pool.length);
        const template = pool[randomIndex];
        
        // Registrar uso
        ThumbnailService.trackTemplateUsage(template.id);
        
        return template;
    }

    /**
     * Selecciona una plantilla basada en tags/mood
     * 
     * @param moodTags - Tags que describen el mood del contenido
     * @returns Plantilla que mejor coincide con los tags
     */
    public static selectTemplateByMood(moodTags: string[]): ThumbnailTemplate {
        const tracker = ThumbnailService.usageTracker;
        const recentIds = tracker.recentTemplates.slice(-2);
        
        // Calcular puntuación por plantilla
        const scores: { template: ThumbnailTemplate; score: number }[] = ALL_TEMPLATES.map(template => {
            let score = 0;
            
            // Coincidencia de tags
            for (const tag of moodTags) {
                const normalizedTag = tag.toLowerCase();
                if (template.tags.some(t => t.toLowerCase().includes(normalizedTag) || 
                                           normalizedTag.includes(t.toLowerCase()))) {
                    score += 10;
                }
            }
            
            // Penalizar si fue usada recientemente
            if (recentIds.includes(template.id)) {
                score -= 20;
            }
            
            // Bonus para plantillas menos usadas
            const usage = tracker.usageCount[template.id] || 0;
            score -= usage * 2;
            
            return { template, score };
        });
        
        // Ordenar por puntuación y seleccionar la mejor
        scores.sort((a, b) => b.score - a.score);
        const template = scores[0].template;
        
        // Registrar uso
        ThumbnailService.trackTemplateUsage(template.id);
        
        return template;
    }

    /**
     * Obtiene una plantilla específica por ID
     * 
     * @param templateId - ID de la plantilla
     * @returns Plantilla o undefined si no existe
     */
    public static getTemplateById(templateId: string): ThumbnailTemplate | undefined {
        return TEMPLATES_BY_ID[templateId];
    }

    /**
     * Obtiene todas las plantillas disponibles
     * 
     * @returns Array de todas las plantillas
     */
    public static getAllTemplates(): ThumbnailTemplate[] {
        return [...ALL_TEMPLATES];
    }

    // ===== GENERACIÓN DE THUMBNAILS =====

    /**
     * Genera un thumbnail usando una plantilla rotable
     * 
     * @param config - Configuración de generación
     * @returns Resultado de la generación
     */
    public static async generateThumbnail(
        config: ThumbnailGenerationConfig
    ): Promise<ThumbnailGenerationResult> {
        console.log(`🖼️ ThumbnailService: Generando thumbnail para "${config.title}"...`);
        
        // Determinar el canal y su branding
        const channelId = config.channelId;
        const channelBranding = channelId ? ChannelBrandingService.getBranding(channelId) : null;
        const applyBranding = config.applyChannelBranding !== false && channelId !== undefined;
        
        if (channelBranding && applyBranding) {
            console.log(`🏷️ Aplicando branding del canal: ${channelBranding.info.name}`);
        }
        
        // 1. Seleccionar plantilla (considerando preferencias del canal)
        let template: ThumbnailTemplate;
        
        if (config.templateId) {
            template = TEMPLATES_BY_ID[config.templateId] || ThumbnailService.selectTemplateRoundRobin();
        } else if (channelId && applyBranding) {
            // Usar selección de plantilla específica del canal
            template = ChannelBrandingService.selectTemplateForChannel(
                channelId,
                config.moodTags,
                ThumbnailService.usageTracker.recentTemplates.slice(-2)
            );
        } else if (config.moodTags && config.moodTags.length > 0) {
            template = ThumbnailService.selectTemplateByMood(config.moodTags);
        } else {
            template = ThumbnailService.selectTemplateRoundRobin();
        }
        
        console.log(`📐 Usando plantilla: ${template.name} (${template.id})`);
        
        // 2. Configurar dimensiones
        const width = config.isShort ? 1080 : 1280;
        const height = config.isShort ? 1920 : 720;
        
        // 3. Obtener imagen de fondo de Pexels
        const backgroundImageUrl = await ThumbnailService.fetchBackgroundImage(
            config.visualPrompt,
            config.isShort
        );
        
        // 4. Generar elementos dinámicos (REQ-5.1.2)
        let dynamicElements: DynamicElement[] = [];
        const enableDynamic = config.enableDynamicElements !== false; // Habilitado por defecto
        
        if (enableDynamic) {
            if (config.customDynamicElements && config.customDynamicElements.length > 0) {
                // Usar elementos personalizados si se proporcionan
                dynamicElements = config.customDynamicElements;
                console.log(`✨ Usando ${dynamicElements.length} elementos dinámicos personalizados`);
            } else {
                // Generar elementos según la configuración de la plantilla
                dynamicElements = DynamicElementsGenerator.generateElementsForTemplate(
                    template,
                    config.dynamicElementsSeed
                );
                
                // Si hay branding de canal, añadir emojis del canal
                if (channelBranding && applyBranding && dynamicElements.length < template.dynamicElements.maxElements) {
                    const channelEmojis = ChannelBrandingService.getChannelEmojis(channelId!, 1);
                    // Los emojis del canal ya están incluidos en la generación de elementos
                }
                
                console.log(`✨ Generados ${dynamicElements.length} elementos dinámicos (${template.dynamicElements.presetElements.length} preset + aleatorios)`);
            }
        }
        
        // 5. Generar ruta de salida
        const contentDir = path.join(__dirname, '../../content');
        if (!fs.existsSync(contentDir)) {
            fs.mkdirSync(contentDir, { recursive: true });
        }
        const basePath = path.join(contentDir, config.outputFilename);
        const tempPath = basePath.replace(/\.(jpg|jpeg|png)$/i, '_temp.$1');
        
        // 6. Determinar nombre del canal (prioridad: config.channelName > branding > default)
        const channelName = config.channelName || 
                          (channelBranding ? channelBranding.info.name : 'NeuroSync AI');
        
        // 7. Preparar plantilla con branding del canal si aplica
        let brandedTemplate = template;
        if (channelBranding && applyBranding) {
            brandedTemplate = ThumbnailService.applyChannelBrandingToTemplate(
                template,
                channelBranding,
                config.channelBrandingIntensity || 0.7
            );
            console.log(`🎨 Branding del canal aplicado a la plantilla`);
        }
        
        // 8. Determinar keywords a resaltar (del canal si aplica)
        const highlightKeywords = channelBranding && applyBranding
            ? channelBranding.info.highlightKeywords
            : HIGHLIGHT_KEYWORDS;
        
        // 9. Renderizar thumbnail con Puppeteer (incluyendo elementos dinámicos)
        await ThumbnailService.renderWithPuppeteer(
            tempPath,
            width,
            height,
            config.title,
            backgroundImageUrl,
            brandedTemplate,
            channelName,
            dynamicElements,
            highlightKeywords
        );
        
        // 10. Aplicar transformación anti-detección si está habilitada
        let finalPath = tempPath;
        let hash: string | undefined;
        let antiDetectionApplied = false;
        
        if (config.applyAntiDetection && config.videoTransformParams) {
            console.log(`🔒 Aplicando transformación anti-detección...`);
            
            const grainIntensity = ThumbnailTransformer.generateGrainIntensity();
            const textOffset = ThumbnailTransformer.generateTextOverlayOffset();
            
            const transformResult = await ThumbnailTransformer.transform(
                {
                    baseImagePath: tempPath,
                    transformationParams: config.videoTransformParams,
                    textOverlay: {
                        text: config.title,
                        offsetX: textOffset.offsetX,
                        offsetY: textOffset.offsetY,
                        style: 'bold'
                    },
                    grainIntensity
                },
                basePath
            );
            
            finalPath = transformResult.outputPath;
            hash = transformResult.hash;
            antiDetectionApplied = true;
            
            // Eliminar archivo temporal
            if (fs.existsSync(tempPath) && tempPath !== basePath) {
                fs.unlinkSync(tempPath);
            }
        } else {
            // Renombrar temp a final
            if (tempPath !== basePath) {
                fs.renameSync(tempPath, basePath);
            }
            finalPath = basePath;
        }
        
        console.log(`✅ ThumbnailService: Thumbnail guardado en ${finalPath}`);
        
        return {
            outputPath: finalPath,
            templateId: template.id,
            templateName: template.name,
            hash,
            antiDetectionApplied,
            dynamicElementsApplied: dynamicElements,
            dynamicElementsCount: dynamicElements.length,
            channelId: channelId,
            channelName: channelName,
            channelBrandingApplied: applyBranding && channelBranding !== null
        };
    }
    
    /**
     * Genera un thumbnail específico para un canal con branding completo
     * REQ-5.1.4: Generar thumbnail específico por canal
     * 
     * @param config - Configuración de generación
     * @param channelId - ID del canal ('channel1' | 'channel2' | 'channel3')
     * @returns Resultado de la generación con branding del canal aplicado
     */
    public static async generateChannelThumbnail(
        config: Omit<ThumbnailGenerationConfig, 'channelId' | 'applyChannelBranding'>,
        channelId: ChannelId
    ): Promise<ThumbnailGenerationResult> {
        console.log(`🏷️ Generando thumbnail para canal: ${channelId}`);
        
        const branding = ChannelBrandingService.getBranding(channelId);
        
        // Combinar mood tags con los preferidos del canal
        const combinedMoodTags = [
            ...(config.moodTags || []),
            ...branding.preferredMoodTags
        ];
        
        // Generar con branding completo del canal
        return ThumbnailService.generateThumbnail({
            ...config,
            channelId: channelId,
            channelName: branding.info.name,
            moodTags: combinedMoodTags,
            applyChannelBranding: true,
            channelBrandingIntensity: 0.8 // Alta intensidad para thumbnail de canal
        });
    }
    
    /**
     * Aplica el branding del canal a una plantilla de thumbnail
     * 
     * @param template - Plantilla base
     * @param branding - Configuración de branding del canal
     * @param intensity - Intensidad del branding (0-1)
     * @returns Plantilla con branding aplicado
     */
    private static applyChannelBrandingToTemplate(
        template: ThumbnailTemplate,
        branding: ChannelBrandingConfig,
        intensity: number
    ): ThumbnailTemplate {
        // Crear una copia de la plantilla con los colores del canal
        const customizedColors = ChannelBrandingService.customizeColorsForChannel(
            branding.info.id,
            template.colors,
            intensity
        );
        
        return {
            ...template,
            colors: customizedColors,
            typography: {
                ...template.typography,
                // Aplicar tipografía del canal si la intensidad es alta
                ...(intensity > 0.6 ? {
                    fontFamily: branding.typography.fontFamily,
                    fontWeight: branding.typography.fontWeight,
                    textTransform: branding.typography.textTransform,
                    textShadow: branding.typography.textShadow
                } : {})
            }
        };
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Registra el uso de una plantilla para tracking
     */
    private static trackTemplateUsage(templateId: string): void {
        const tracker = ThumbnailService.usageTracker;
        
        // Añadir a recientes (máximo 10)
        tracker.recentTemplates.push(templateId);
        if (tracker.recentTemplates.length > 10) {
            tracker.recentTemplates.shift();
        }
        
        // Incrementar contador
        tracker.usageCount[templateId] = (tracker.usageCount[templateId] || 0) + 1;
    }

    /**
     * Busca una imagen de fondo en Pexels
     */
    private static async fetchBackgroundImage(
        visualPrompt?: string,
        isShort?: boolean
    ): Promise<string> {
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            console.log('⚠️ PEXELS_API_KEY no configurada, usando gradiente');
            return '';
        }

        try {
            const searchQuery = visualPrompt || 'artificial intelligence technology';
            const orientation = isShort ? 'portrait' : 'landscape';
            
            let response = await axios.get(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&orientation=${orientation}&per_page=5`,
                { headers: { Authorization: apiKey } }
            );

            if (!response.data.photos || response.data.photos.length === 0) {
                console.log(`⚠️ Sin imágenes para "${searchQuery}", usando fallback...`);
                response = await axios.get(
                    `https://api.pexels.com/v1/search?query=brain technology&orientation=${orientation}&per_page=5`,
                    { headers: { Authorization: apiKey } }
                );
            }

            if (response.data.photos && response.data.photos.length > 0) {
                const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.photos.length));
                const photo = response.data.photos[randomIndex];
                console.log(`📷 Usando Pexels imagen ID ${photo.id}`);
                return photo.src.large2x || photo.src.large;
            }
        } catch (error: any) {
            console.log(`⚠️ Error Pexels API: ${error.message}`);
        }

        return '';
    }

    /**
     * Renderiza el thumbnail usando Puppeteer con la plantilla especificada
     */
    private static async renderWithPuppeteer(
        outputPath: string,
        width: number,
        height: number,
        title: string,
        backgroundImageUrl: string,
        template: ThumbnailTemplate,
        channelName: string,
        dynamicElements: DynamicElement[] = [],
        highlightKeywords: string[] = HIGHLIGHT_KEYWORDS
    ): Promise<void> {
        const html = ThumbnailService.buildHTML(
            width, height, title, backgroundImageUrl, template, channelName, dynamicElements, highlightKeywords
        );

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Esperar a que carguen las fuentes
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            await page.screenshot({
                path: outputPath,
                type: 'jpeg',
                quality: 92
            });
        } finally {
            await browser.close();
        }
    }

    /**
     * Construye el HTML del thumbnail usando la plantilla
     */
    private static buildHTML(
        width: number,
        height: number,
        title: string,
        backgroundImageUrl: string,
        template: ThumbnailTemplate,
        channelName: string,
        dynamicElements: DynamicElement[] = [],
        highlightKeywords: string[] = HIGHLIGHT_KEYWORDS
    ): string {
        const { colors, layout, typography, effects } = template;
        const isLandscape = width > height;
        const fontSize = isLandscape ? typography.titleSizeLandscape : typography.titleSizePortrait;
        const escapedTitle = ThumbnailService.escapeHtml(title);
        const highlightedTitle = ThumbnailService.highlightKeywordsInTitle(escapedTitle, colors.accent, highlightKeywords);
        
        // Construir estilo de fondo
        const backgroundStyle = backgroundImageUrl
            ? `background-image: linear-gradient(${colors.overlay}, ${colors.overlay}), url('${backgroundImageUrl}'); background-size: cover; background-position: center;`
            : `background: ${colors.gradient};`;
        
        // Construir posición del título
        const titlePositionCSS = ThumbnailService.getTitlePositionCSS(layout);
        const brandPositionCSS = ThumbnailService.getBrandPositionCSS(layout);
        
        // Efecto viñeta
        const vignetteCSS = effects.vignette 
            ? `box-shadow: inset 0 0 ${Math.round(width/4)}px rgba(0,0,0,0.5);` 
            : '';
        
        // Glow para texto de acento
        const accentGlow = effects.accentGlow 
            ? `text-shadow: ${typography.textShadow}, 0 0 30px ${colors.accent}80;` 
            : '';
        
        // Renderizar elementos dinámicos (REQ-5.1.2)
        const dynamicElementsHTML = dynamicElements.length > 0
            ? DynamicElementsRenderer.renderAllElements(dynamicElements, width, height)
            : '';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&family=Poppins:wght@600;700;800&family=Roboto:wght@700;800&family=Open+Sans:wght@700;800&display=swap');
                
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    width: ${width}px;
                    height: ${height}px;
                    ${backgroundStyle}
                    display: flex;
                    overflow: hidden;
                    position: relative;
                    ${vignetteCSS}
                }
                
                .title-container {
                    position: absolute;
                    ${titlePositionCSS}
                    padding: ${layout.padding}px;
                    max-width: ${layout.maxTitleWidth}%;
                    text-align: ${layout.titleAlign};
                    ${effects.textContainerBackground !== 'transparent' 
                        ? `background: ${effects.textContainerBackground}; border-radius: ${effects.borderRadius}px;` 
                        : ''}
                    ${effects.textContainerShadow !== 'none' ? `box-shadow: ${effects.textContainerShadow};` : ''}
                    z-index: 20;
                }
                
                .title {
                    font-family: ${typography.fontFamily};
                    font-size: ${fontSize}px;
                    font-weight: ${typography.fontWeight};
                    color: ${colors.textPrimary};
                    text-transform: ${typography.textTransform};
                    line-height: ${typography.lineHeight};
                    text-shadow: ${typography.textShadow};
                    letter-spacing: ${typography.letterSpacing}px;
                }
                
                .highlight {
                    color: ${colors.accent};
                    ${accentGlow}
                }
                
                .brand {
                    position: absolute;
                    ${brandPositionCSS}
                    font-family: ${typography.fontFamily};
                    font-size: ${Math.round(fontSize * 0.4)}px;
                    font-weight: ${typography.fontWeight};
                    color: ${colors.textSecondary};
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
                    z-index: 20;
                    ${layout.brandPosition === 'none' ? 'display: none;' : ''}
                }
                
                /* Estilos para elementos dinámicos (REQ-5.1.2) */
                .dynamic-element {
                    pointer-events: none;
                }
                
                .dynamic-element.emoji {
                    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
                }
            </style>
        </head>
        <body>
            <div class="title-container">
                <div class="title">${highlightedTitle}</div>
            </div>
            <div class="brand">${channelName}</div>
            ${dynamicElementsHTML}
        </body>
        </html>
        `;
    }

    /**
     * Genera CSS para la posición del título
     */
    private static getTitlePositionCSS(layout: typeof ALL_TEMPLATES[0]['layout']): string {
        switch (layout.titlePosition) {
            case 'top':
                return 'top: 0; left: 0; right: 0;';
            case 'center':
                return 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
            case 'bottom':
                return 'bottom: 0; left: 0; right: 0;';
            case 'top-left':
                return 'top: 0; left: 0;';
            case 'bottom-right':
                return 'bottom: 0; right: 0;';
            default:
                return 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
        }
    }

    /**
     * Genera CSS para la posición del branding
     */
    private static getBrandPositionCSS(layout: typeof ALL_TEMPLATES[0]['layout']): string {
        const offset = '30px';
        switch (layout.brandPosition) {
            case 'top-right':
                return `top: ${offset}; right: ${offset};`;
            case 'bottom-right':
                return `bottom: ${offset}; right: ${offset};`;
            case 'bottom-left':
                return `bottom: ${offset}; left: ${offset};`;
            case 'top-left':
                return `top: ${offset}; left: ${offset};`;
            default:
                return `bottom: ${offset}; right: ${offset};`;
        }
    }

    /**
     * Resalta keywords con el color de acento
     * 
     * @param title - Título a procesar
     * @param accentColor - Color de acento para el resaltado
     * @param keywords - Keywords a resaltar (usa HIGHLIGHT_KEYWORDS por defecto)
     * @returns HTML con keywords resaltados
     */
    private static highlightKeywordsInTitle(
        title: string, 
        accentColor: string,
        keywords: string[] = HIGHLIGHT_KEYWORDS
    ): string {
        let result = title.toUpperCase();
        
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
            result = result.replace(regex, '<span class="highlight">$1</span>');
        }
        
        return result;
    }
    
    /**
     * Resalta keywords con el color de acento (método legacy para compatibilidad)
     * @deprecated Usar highlightKeywordsInTitle con array de keywords
     */
    private static highlightKeywords(title: string, accentColor: string): string {
        return ThumbnailService.highlightKeywordsInTitle(title, accentColor, HIGHLIGHT_KEYWORDS);
    }

    /**
     * Escapa caracteres HTML especiales
     */
    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Reinicia el tracker de plantillas (útil para tests)
     */
    public static resetTracker(): void {
        ThumbnailService.usageTracker = {
            recentTemplates: [],
            usageCount: {},
            roundRobinIndex: 0
        };
    }

    /**
     * Obtiene estadísticas de uso de plantillas
     */
    public static getUsageStats(): { 
        recentTemplates: string[]; 
        usageCount: Record<string, number> 
    } {
        return {
            recentTemplates: [...ThumbnailService.usageTracker.recentTemplates],
            usageCount: { ...ThumbnailService.usageTracker.usageCount }
        };
    }
    
    /**
     * Obtiene el branding de un canal específico
     * REQ-5.1.4
     * 
     * @param channelId - ID del canal
     * @returns Configuración de branding del canal
     */
    public static getChannelBranding(channelId: ChannelId): ChannelBrandingConfig {
        return ChannelBrandingService.getBranding(channelId);
    }
    
    /**
     * Obtiene la lista de canales disponibles
     * REQ-5.1.4
     * 
     * @returns Array de IDs de canales
     */
    public static getAvailableChannels(): ChannelId[] {
        return ChannelBrandingService.getAllChannels();
    }
    
    /**
     * Obtiene un resumen de branding de todos los canales
     * REQ-5.1.4
     * 
     * @returns Resumen de branding por canal
     */
    public static getChannelBrandingSummary(): Record<ChannelId, { name: string; niche: string; accent: string }> {
        return ChannelBrandingService.getBrandingSummary();
    }
}

// Re-exportar tipos de ChannelBranding para uso externo
export { ChannelId, ChannelBrandingConfig } from './ChannelBranding';
export { ChannelBrandingService } from './ChannelBranding';
