/**
 * ChannelBranding.ts
 * 
 * Sistema de branding específico por canal para thumbnails.
 * Define colores, estilos y plantillas preferidas para cada canal.
 * 
 * REQ-5.1.4: Generar thumbnail específico por canal (branding diferenciado)
 * 
 * Canales soportados:
 * - Canal 1 (NeuroSync AI): Autismo + IA - Colores calmados, azules/púrpuras
 * - Canal 2 (NeuroTech AI): TDAH + IA - Colores energéticos, naranjas/verdes
 */

import { ThumbnailColorScheme, ThumbnailTemplate, ALL_TEMPLATES, TEMPLATES_BY_ID } from './ThumbnailTemplates';

// ===== TIPOS E INTERFACES =====

/**
 * Identificador de canal soportado
 */
export type ChannelId = 'channel1' | 'channel2';

/**
 * Información básica del canal
 */
export interface ChannelInfo {
    /** ID único del canal */
    id: ChannelId;
    
    /** Nombre para mostrar */
    name: string;
    
    /** Descripción del nicho */
    niche: string;
    
    /** Focus del contenido */
    focus: string[];
    
    /** Keywords que se resaltarán en thumbnails */
    highlightKeywords: string[];
}

/**
 * Esquema de colores específico del canal
 */
export interface ChannelColorScheme {
    /** Color primario del branding */
    primary: string;
    
    /** Color secundario del branding */
    secondary: string;
    
    /** Color de acento para highlights */
    accent: string;
    
    /** Color alternativo de acento */
    accentAlt: string;
    
    /** Gradiente de fondo por defecto */
    gradient: string;
    
    /** Overlay para imágenes de fondo */
    overlay: string;
}

/**
 * Estilo de tipografía del canal
 */
export interface ChannelTypographyStyle {
    /** Familia de fuentes preferida */
    fontFamily: string;
    
    /** Peso de fuente por defecto */
    fontWeight: number;
    
    /** Transform del texto */
    textTransform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    
    /** Sombra del texto */
    textShadow: string;
}

/**
 * Configuración completa de branding del canal
 */
export interface ChannelBrandingConfig {
    /** Información básica del canal */
    info: ChannelInfo;
    
    /** Esquema de colores */
    colors: ChannelColorScheme;
    
    /** Estilo de tipografía */
    typography: ChannelTypographyStyle;
    
    /** IDs de plantillas preferidas (ordenadas por preferencia) */
    preferredTemplates: string[];
    
    /** Plantilla por defecto si ninguna coincide */
    defaultTemplate: string;
    
    /** Emojis característicos del canal */
    signatureEmojis: string[];
    
    /** Tags de mood preferidos */
    preferredMoodTags: string[];
}

// ===== CONFIGURACIÓN DE CANALES =====

/**
 * Branding para Canal 1: NeuroSync AI (Autismo + IA)
 * 
 * Estilo: Calmado, profesional, confiable
 * Colores: Azules calmados, púrpuras suaves
 * Enfoque visual: Transmitir calma, confianza, claridad
 */
export const CHANNEL1_BRANDING: ChannelBrandingConfig = {
    info: {
        id: 'channel1',
        name: 'NeuroSync AI',
        niche: 'Autismo + Inteligencia Artificial',
        focus: ['autismo', 'herramientas cognitivas', 'soporte sensorial', 'habilidades sociales'],
        highlightKeywords: [
            'AUTISMO', 'AUTISM', 'TEA', 'ASD', 'NEURO', 'CEREBRO', 'BRAIN',
            'IA', 'AI', 'SENSORIAL', 'COGNITIVO', 'INTELIGENCIA'
        ]
    },
    colors: {
        primary: '#1a2634',      // Azul oscuro calmado
        secondary: '#2d3e50',    // Azul grisáceo
        accent: '#64b5f6',       // Azul claro (tranquilidad)
        accentAlt: '#90caf9',    // Azul más claro
        gradient: 'linear-gradient(180deg, #1a2634 0%, #2d3e50 50%, #3d5a73 100%)',
        overlay: 'rgba(26, 38, 52, 0.55)'
    },
    typography: {
        fontFamily: "'Poppins', 'Segoe UI', Tahoma, sans-serif",
        fontWeight: 700,
        textTransform: 'none',
        textShadow: '2px 2px 8px rgba(0,0,0,0.7)'
    },
    preferredTemplates: ['calm', 'ocean', 'purple'],
    defaultTemplate: 'calm',
    signatureEmojis: ['🧠', '💙', '✨', '🧩', '🌟'],
    preferredMoodTags: ['calma', 'bienestar', 'neurodivergencia', 'autismo', 'cerebro']
};

/**
 * Branding para Canal 2: NeuroTech AI (TDAH + IA)
 * 
 * Estilo: Energético, motivacional, dinámico
 * Colores: Naranjas vibrantes, verdes energéticos
 * Enfoque visual: Transmitir energía, productividad, acción
 */
export const CHANNEL2_BRANDING: ChannelBrandingConfig = {
    info: {
        id: 'channel2',
        name: 'NeuroTech AI',
        niche: 'TDAH + IA para Productividad',
        focus: ['TDAH', 'productividad', 'automatización', 'negocio digital'],
        highlightKeywords: [
            'TDAH', 'ADHD', 'PRODUCTIVIDAD', 'PRODUCTIVITY', 'FOCUS', 'ENFOQUE',
            'IA', 'AI', 'AUTOMATIZACIÓN', 'HACKS', 'NEURO', 'CEREBRO'
        ]
    },
    colors: {
        primary: '#1a1a1a',      // Negro profundo
        secondary: '#2d2d2d',    // Gris oscuro
        accent: '#ff6b35',       // Naranja energético
        accentAlt: '#00ff41',    // Verde neón (productividad/tech)
        gradient: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 40%, #ff6b35 100%)',
        overlay: 'rgba(26, 26, 26, 0.5)'
    },
    typography: {
        fontFamily: "'Montserrat', 'Arial Black', Arial, sans-serif",
        fontWeight: 900,
        textTransform: 'uppercase',
        textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000'
    },
    preferredTemplates: ['energy', 'cyber', 'matrix'],
    defaultTemplate: 'energy',
    signatureEmojis: ['🔥', '⚡', '🚀', '💪', '🎯'],
    preferredMoodTags: ['energía', 'productividad', 'motivación', 'tech', 'acción']
};

// ===== MAPA DE BRANDING POR CANAL =====

/**
 * Mapa de configuraciones de branding por ID de canal
 */
export const CHANNEL_BRANDING_MAP: Record<ChannelId, ChannelBrandingConfig> = {
    'channel1': CHANNEL1_BRANDING,
    'channel2': CHANNEL2_BRANDING
};

// ===== CLASE DE SERVICIO DE BRANDING =====

/**
 * ChannelBrandingService - Servicio para gestionar branding específico por canal
 * 
 * Proporciona métodos para:
 * - Obtener configuración de branding por canal
 * - Seleccionar plantillas preferidas por canal
 * - Generar esquemas de color personalizados
 * - Aplicar branding a plantillas existentes
 */
export class ChannelBrandingService {
    
    // ===== OBTENCIÓN DE CONFIGURACIÓN =====
    
    /**
     * Obtiene la configuración de branding para un canal específico
     * 
     * @param channelId - ID del canal ('channel1' | 'channel2')
     * @returns Configuración de branding del canal
     */
    public static getBranding(channelId: ChannelId): ChannelBrandingConfig {
        const branding = CHANNEL_BRANDING_MAP[channelId];
        if (!branding) {
            console.warn(`⚠️ Canal desconocido: ${channelId}, usando canal 1 por defecto`);
            return CHANNEL1_BRANDING;
        }
        return branding;
    }
    
    /**
     * Obtiene el nombre del canal
     * 
     * @param channelId - ID del canal
     * @returns Nombre del canal para mostrar
     */
    public static getChannelName(channelId: ChannelId): string {
        return ChannelBrandingService.getBranding(channelId).info.name;
    }
    
    /**
     * Obtiene los keywords a resaltar para un canal
     * 
     * @param channelId - ID del canal
     * @returns Array de keywords para resaltar
     */
    public static getHighlightKeywords(channelId: ChannelId): string[] {
        return ChannelBrandingService.getBranding(channelId).info.highlightKeywords;
    }
    
    // ===== SELECCIÓN DE PLANTILLAS =====
    
    /**
     * Selecciona la mejor plantilla para un canal basándose en preferencias
     * 
     * @param channelId - ID del canal
     * @param moodTags - Tags de mood adicionales (opcional)
     * @param avoidTemplateIds - IDs de plantillas a evitar (para no repetir)
     * @returns Plantilla seleccionada
     */
    public static selectTemplateForChannel(
        channelId: ChannelId,
        moodTags?: string[],
        avoidTemplateIds?: string[]
    ): ThumbnailTemplate {
        const branding = ChannelBrandingService.getBranding(channelId);
        const avoid = avoidTemplateIds || [];
        
        // Combinar mood tags de la petición con los preferidos del canal
        const combinedMoodTags = [
            ...(moodTags || []),
            ...branding.preferredMoodTags
        ];
        
        // Primero intentar con plantillas preferidas del canal
        for (const templateId of branding.preferredTemplates) {
            if (!avoid.includes(templateId)) {
                const template = TEMPLATES_BY_ID[templateId];
                if (template) {
                    console.log(`📐 Seleccionada plantilla preferida para ${branding.info.name}: ${template.name}`);
                    return template;
                }
            }
        }
        
        // Si todas las preferidas están evitadas, buscar por mood tags
        const matchingTemplates = ALL_TEMPLATES.filter(t => {
            if (avoid.includes(t.id)) return false;
            return t.tags.some(tag => 
                combinedMoodTags.some(mt => 
                    tag.toLowerCase().includes(mt.toLowerCase()) ||
                    mt.toLowerCase().includes(tag.toLowerCase())
                )
            );
        });
        
        if (matchingTemplates.length > 0) {
            const selected = matchingTemplates[Math.floor(Math.random() * matchingTemplates.length)];
            console.log(`📐 Seleccionada plantilla por mood para ${branding.info.name}: ${selected.name}`);
            return selected;
        }
        
        // Fallback a la plantilla por defecto del canal
        const defaultTemplate = TEMPLATES_BY_ID[branding.defaultTemplate] || ALL_TEMPLATES[0];
        console.log(`📐 Usando plantilla por defecto para ${branding.info.name}: ${defaultTemplate.name}`);
        return defaultTemplate;
    }
    
    // ===== PERSONALIZACIÓN DE COLORES =====
    
    /**
     * Genera un esquema de colores personalizado para un canal
     * Mezcla los colores de la plantilla base con el branding del canal
     * 
     * @param channelId - ID del canal
     * @param baseColors - Colores base de la plantilla
     * @param intensity - Intensidad de aplicación del branding (0-1, default 0.5)
     * @returns Esquema de colores personalizado
     */
    public static customizeColorsForChannel(
        channelId: ChannelId,
        baseColors: ThumbnailColorScheme,
        intensity: number = 0.5
    ): ThumbnailColorScheme {
        const branding = ChannelBrandingService.getBranding(channelId);
        const channelColors = branding.colors;
        
        // Mezclar colores con la intensidad especificada
        return {
            primary: ChannelBrandingService.blendColors(baseColors.primary, channelColors.primary, intensity),
            secondary: ChannelBrandingService.blendColors(baseColors.secondary, channelColors.secondary, intensity),
            accent: channelColors.accent, // El acento siempre es del canal
            textPrimary: baseColors.textPrimary,
            textSecondary: channelColors.accent, // Texto secundario usa el acento del canal
            gradient: channelColors.gradient, // Gradiente siempre del canal
            overlay: ChannelBrandingService.blendColors(baseColors.overlay, channelColors.overlay, intensity)
        };
    }
    
    /**
     * Mezcla dos colores con una intensidad dada
     * 
     * @param color1 - Primer color (hex)
     * @param color2 - Segundo color (hex)
     * @param ratio - Ratio de mezcla (0 = solo color1, 1 = solo color2)
     * @returns Color mezclado en formato hex
     */
    private static blendColors(color1: string, color2: string, ratio: number): string {
        // Si algún color es rgba, retornar el segundo con la intensidad
        if (color1.startsWith('rgba') || color2.startsWith('rgba')) {
            return ratio > 0.5 ? color2 : color1;
        }
        
        // Parsear colores hex
        const hex1 = color1.replace('#', '');
        const hex2 = color2.replace('#', '');
        
        const r1 = parseInt(hex1.substring(0, 2), 16);
        const g1 = parseInt(hex1.substring(2, 4), 16);
        const b1 = parseInt(hex1.substring(4, 6), 16);
        
        const r2 = parseInt(hex2.substring(0, 2), 16);
        const g2 = parseInt(hex2.substring(2, 4), 16);
        const b2 = parseInt(hex2.substring(4, 6), 16);
        
        // Mezclar
        const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
        const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
        const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // ===== EMOJIS Y ELEMENTOS DINÁMICOS =====
    
    /**
     * Obtiene emojis característicos del canal para elementos dinámicos
     * 
     * @param channelId - ID del canal
     * @param count - Número de emojis a retornar (default 2)
     * @returns Array de emojis
     */
    public static getChannelEmojis(channelId: ChannelId, count: number = 2): string[] {
        const branding = ChannelBrandingService.getBranding(channelId);
        const emojis = branding.signatureEmojis;
        
        // Seleccionar emojis aleatorios del conjunto del canal
        const selected: string[] = [];
        const available = [...emojis];
        
        for (let i = 0; i < Math.min(count, emojis.length); i++) {
            const idx = Math.floor(Math.random() * available.length);
            selected.push(available[idx]);
            available.splice(idx, 1);
        }
        
        return selected;
    }
    
    /**
     * Obtiene el color de acento primario para un canal
     * 
     * @param channelId - ID del canal
     * @returns Color de acento en formato hex
     */
    public static getAccentColor(channelId: ChannelId): string {
        return ChannelBrandingService.getBranding(channelId).colors.accent;
    }
    
    /**
     * Obtiene el color de acento alternativo para un canal
     * 
     * @param channelId - ID del canal
     * @returns Color de acento alternativo en formato hex
     */
    public static getAccentColorAlt(channelId: ChannelId): string {
        return ChannelBrandingService.getBranding(channelId).colors.accentAlt;
    }
    
    // ===== VALIDACIÓN =====
    
    /**
     * Verifica si un ID de canal es válido
     * 
     * @param channelId - ID a verificar
     * @returns true si el canal es válido
     */
    public static isValidChannel(channelId: string): channelId is ChannelId {
        return channelId === 'channel1' || channelId === 'channel2';
    }
    
    /**
     * Obtiene todos los canales disponibles
     * 
     * @returns Array de IDs de canales
     */
    public static getAllChannels(): ChannelId[] {
        return ['channel1', 'channel2'];
    }
    
    /**
     * Obtiene un resumen del branding de todos los canales
     * 
     * @returns Resumen de branding por canal
     */
    public static getBrandingSummary(): Record<ChannelId, { name: string; niche: string; accent: string }> {
        return {
            'channel1': {
                name: CHANNEL1_BRANDING.info.name,
                niche: CHANNEL1_BRANDING.info.niche,
                accent: CHANNEL1_BRANDING.colors.accent
            },
            'channel2': {
                name: CHANNEL2_BRANDING.info.name,
                niche: CHANNEL2_BRANDING.info.niche,
                accent: CHANNEL2_BRANDING.colors.accent
            }
        };
    }
}

// ===== EXPORTACIONES =====

export {
    CHANNEL1_BRANDING as Channel1Branding,
    CHANNEL2_BRANDING as Channel2Branding
};
