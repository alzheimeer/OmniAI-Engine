/**
 * ThumbnailTemplates.ts
 * 
 * Sistema de plantillas de thumbnail rotables para evitar monotonía visual
 * y detección de "producción en masa" por YouTube.
 * 
 * REQ-5.1.1: Crear 5+ plantillas de thumbnail rotables para evitar monotonía
 * 
 * Cada plantilla define:
 * - Colores: primarios, secundarios, acentos, degradados
 * - Layout: posición del título, branding, elementos decorativos
 * - Tipografía: fuentes, tamaños, pesos, sombras
 * - Efectos: overlays, viñetas, brillos
 */

// ===== INTERFACES =====

/**
 * Configuración de colores para una plantilla de thumbnail
 */
export interface ThumbnailColorScheme {
    /** Color primario del fondo (hex) */
    primary: string;
    
    /** Color secundario del fondo (hex) */
    secondary: string;
    
    /** Color de acento para highlights (hex) */
    accent: string;
    
    /** Color del texto principal (hex) */
    textPrimary: string;
    
    /** Color del texto secundario (hex) */
    textSecondary: string;
    
    /** Gradiente CSS para el fondo (cuando no hay imagen) */
    gradient: string;
    
    /** Overlay sobre la imagen de fondo (rgba) */
    overlay: string;
}

/**
 * Configuración del layout de elementos
 */
export interface ThumbnailLayout {
    /** Posición del título */
    titlePosition: 'top' | 'center' | 'bottom' | 'top-left' | 'bottom-right';
    
    /** Alineación del título */
    titleAlign: 'left' | 'center' | 'right';
    
    /** Posición del branding/logo */
    brandPosition: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left' | 'none';
    
    /** Padding general (px) */
    padding: number;
    
    /** Máximo ancho del título como porcentaje */
    maxTitleWidth: number;
}

/**
 * Configuración de tipografía
 */
export interface ThumbnailTypography {
    /** Familia de fuentes (con fallbacks) */
    fontFamily: string;
    
    /** Tamaño del título para landscape (px) */
    titleSizeLandscape: number;
    
    /** Tamaño del título para portrait (px) */
    titleSizePortrait: number;
    
    /** Peso de la fuente */
    fontWeight: number;
    
    /** Espaciado entre letras (px) */
    letterSpacing: number;
    
    /** Altura de línea */
    lineHeight: number;
    
    /** Transform del texto */
    textTransform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    
    /** Sombra del texto (CSS) */
    textShadow: string;
}

/**
 * Efectos visuales de la plantilla
 */
export interface ThumbnailEffects {
    /** Intensidad del overlay (0-1) */
    overlayIntensity: number;
    
    /** Aplicar viñeta */
    vignette: boolean;
    
    /** Radio del border de los elementos (px) */
    borderRadius: number;
    
    /** Efecto glow en el texto de acento */
    accentGlow: boolean;
    
    /** Box shadow para el contenedor de texto */
    textContainerShadow: string;
    
    /** Fondo del contenedor de texto (rgba) */
    textContainerBackground: string;
}

// ===== ELEMENTOS DINÁMICOS (REQ-5.1.2) =====

/**
 * Tipos de elementos dinámicos disponibles para thumbnails
 */
export type DynamicElementType = 'arrow' | 'circle' | 'emoji';

/**
 * Posición de un elemento dinámico (porcentaje del canvas)
 */
export interface ElementPosition {
    /** Posición X (0-100% del ancho) */
    x: number;
    /** Posición Y (0-100% de la altura) */
    y: number;
}

/**
 * Configuración base para todos los elementos dinámicos
 */
export interface BaseDynamicElement {
    /** Tipo de elemento */
    type: DynamicElementType;
    /** Posición del elemento */
    position: ElementPosition;
    /** Rotación en grados (-180 a 180) */
    rotation: number;
    /** Escala del elemento (0.5 a 2) */
    scale: number;
    /** Opacidad (0 a 1) */
    opacity: number;
    /** Z-index para orden de capas */
    zIndex: number;
}

/**
 * Estilos de flecha disponibles
 */
export type ArrowStyle = 'solid' | 'outline' | 'curved' | 'double' | 'hand-drawn';

/**
 * Dirección de la flecha
 */
export type ArrowDirection = 'up' | 'down' | 'left' | 'right' | 'up-right' | 'up-left' | 'down-right' | 'down-left';

/**
 * Elemento flecha
 */
export interface ArrowElement extends BaseDynamicElement {
    type: 'arrow';
    /** Estilo de la flecha */
    style: ArrowStyle;
    /** Dirección de la flecha */
    direction: ArrowDirection;
    /** Color de la flecha (hex) */
    color: string;
    /** Grosor del trazo (px) */
    strokeWidth: number;
    /** Tamaño de la flecha (px) */
    size: number;
    /** Añadir sombra */
    shadow: boolean;
}

/**
 * Estilos de círculo disponibles
 */
export type CircleStyle = 'solid' | 'outline' | 'dashed' | 'glow' | 'double';

/**
 * Elemento círculo
 */
export interface CircleElement extends BaseDynamicElement {
    type: 'circle';
    /** Estilo del círculo */
    style: CircleStyle;
    /** Color del círculo (hex) */
    color: string;
    /** Grosor del borde (px) para outline/dashed */
    strokeWidth: number;
    /** Radio del círculo (px) */
    radius: number;
    /** Añadir sombra */
    shadow: boolean;
    /** Relleno del círculo (solo para solid) */
    fillOpacity: number;
}

/**
 * Categorías de emojis disponibles
 */
export type EmojiCategory = 'reaction' | 'tech' | 'brain' | 'energy' | 'warning' | 'custom';

/**
 * Elemento emoji
 */
export interface EmojiElement extends BaseDynamicElement {
    type: 'emoji';
    /** El emoji a mostrar */
    emoji: string;
    /** Categoría del emoji */
    category: EmojiCategory;
    /** Tamaño del emoji (px) */
    size: number;
    /** Añadir sombra */
    shadow: boolean;
}

/**
 * Unión de todos los tipos de elementos dinámicos
 */
export type DynamicElement = ArrowElement | CircleElement | EmojiElement;

/**
 * Configuración de elementos dinámicos para una plantilla
 */
export interface DynamicElementsConfig {
    /** Si los elementos dinámicos están habilitados */
    enabled: boolean;
    /** Número máximo de elementos por thumbnail */
    maxElements: number;
    /** Elementos predefinidos para esta plantilla */
    presetElements: DynamicElement[];
    /** Probabilidad de añadir elementos aleatorios (0-1) */
    randomElementProbability: number;
    /** Tipos de elementos permitidos para aleatorios */
    allowedRandomTypes: DynamicElementType[];
}

/**
 * Emojis predefinidos por categoría
 */
export const EMOJI_LIBRARY: Record<EmojiCategory, string[]> = {
    reaction: ['🔥', '💯', '⚡', '✨', '💪', '👀', '🚀', '💡', '🎯', '👆'],
    tech: ['🤖', '💻', '🧠', '🔬', '📊', '⚙️', '🔧', '📱', '🌐', '💾'],
    brain: ['🧠', '💭', '🎓', '📚', '🔍', '💡', '🧩', '🎯', '🌟', '✅'],
    energy: ['⚡', '🔥', '💥', '🚀', '✨', '💫', '🌟', '⭐', '🎆', '🎇'],
    warning: ['⚠️', '❗', '❌', '🚫', '⛔', '🔴', '⏰', '📢', '🔔', '❓'],
    custom: []
};

/**
 * Colores predefinidos para elementos por estilo de plantilla
 */
export const ELEMENT_COLORS: Record<string, string[]> = {
    cyber: ['#00d4ff', '#ff00ff', '#00ff41', '#ffffff', '#ffff00'],
    calm: ['#64b5f6', '#90caf9', '#ffffff', '#81d4fa', '#b3e5fc'],
    energy: ['#ffffff', '#ff6b35', '#ffff00', '#ff0000', '#1a1a1a'],
    purple: ['#bb86fc', '#ffffff', '#cf6679', '#03dac6', '#ffde03'],
    matrix: ['#00ff41', '#00cc33', '#ffffff', '#00ff00', '#39ff14'],
    sunset: ['#ff7e5f', '#feb47b', '#ffffff', '#ff6b6b', '#ffecd2'],
    ocean: ['#4fc3f7', '#81d4fa', '#ffffff', '#29b6f6', '#03a9f4']
};

/**
 * Plantilla completa de thumbnail
 */
export interface ThumbnailTemplate {
    /** Identificador único de la plantilla */
    id: string;
    
    /** Nombre descriptivo */
    name: string;
    
    /** Descripción de cuándo usar esta plantilla */
    description: string;
    
    /** Esquema de colores */
    colors: ThumbnailColorScheme;
    
    /** Configuración del layout */
    layout: ThumbnailLayout;
    
    /** Configuración de tipografía */
    typography: ThumbnailTypography;
    
    /** Efectos visuales */
    effects: ThumbnailEffects;
    
    /** Configuración de elementos dinámicos (REQ-5.1.2) */
    dynamicElements: DynamicElementsConfig;
    
    /** Tags para selección por mood/tema */
    tags: string[];
}

// ===== PLANTILLAS PREDEFINIDAS =====

/**
 * Plantilla 1: NeuroTech Cyber
 * Estilo cyberpunk con neones y colores vibrantes
 * Ideal para contenido de tecnología e IA
 */
export const TEMPLATE_CYBER: ThumbnailTemplate = {
    id: 'cyber',
    name: 'NeuroTech Cyber',
    description: 'Estilo cyberpunk con neones, ideal para tecnología e IA',
    colors: {
        primary: '#0a0a1a',
        secondary: '#1a1a3e',
        accent: '#00d4ff',
        textPrimary: '#ffffff',
        textSecondary: '#00d4ff',
        gradient: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0f3460 100%)',
        overlay: 'rgba(10, 10, 26, 0.6)'
    },
    layout: {
        titlePosition: 'center',
        titleAlign: 'center',
        brandPosition: 'bottom-right',
        padding: 40,
        maxTitleWidth: 90
    },
    typography: {
        fontFamily: "'Montserrat', 'Arial Black', Arial, sans-serif",
        titleSizeLandscape: 64,
        titleSizePortrait: 72,
        fontWeight: 900,
        letterSpacing: 2,
        lineHeight: 1.2,
        textTransform: 'uppercase',
        textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 5px 10px rgba(0,0,0,0.8)'
    },
    effects: {
        overlayIntensity: 0.6,
        vignette: true,
        borderRadius: 0,
        accentGlow: true,
        textContainerShadow: 'none',
        textContainerBackground: 'transparent'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 3,
        randomElementProbability: 0.7,
        allowedRandomTypes: ['arrow', 'circle', 'emoji'],
        presetElements: [
            {
                type: 'arrow',
                position: { x: 85, y: 70 },
                rotation: -45,
                scale: 1.2,
                opacity: 0.9,
                zIndex: 10,
                style: 'solid',
                direction: 'up-left',
                color: '#00d4ff',
                strokeWidth: 4,
                size: 60,
                shadow: true
            },
            {
                type: 'emoji',
                position: { x: 10, y: 15 },
                rotation: 15,
                scale: 1,
                opacity: 0.95,
                zIndex: 11,
                emoji: '🤖',
                category: 'tech',
                size: 48,
                shadow: true
            }
        ]
    },
    tags: ['tecnología', 'ia', 'futurista', 'cyber', 'neón']
};

/**
 * Plantilla 2: Calm Focus
 * Estilo minimalista y calmado
 * Ideal para contenido sobre neurodivergencia y bienestar
 */
export const TEMPLATE_CALM: ThumbnailTemplate = {
    id: 'calm',
    name: 'Calm Focus',
    description: 'Estilo minimalista y calmado para neurodivergencia y bienestar',
    colors: {
        primary: '#1a2634',
        secondary: '#2d3e50',
        accent: '#64b5f6',
        textPrimary: '#ffffff',
        textSecondary: '#90caf9',
        gradient: 'linear-gradient(180deg, #1a2634 0%, #2d3e50 50%, #3d5a73 100%)',
        overlay: 'rgba(26, 38, 52, 0.5)'
    },
    layout: {
        titlePosition: 'bottom',
        titleAlign: 'left',
        brandPosition: 'top-right',
        padding: 50,
        maxTitleWidth: 85
    },
    typography: {
        fontFamily: "'Poppins', 'Segoe UI', Tahoma, sans-serif",
        titleSizeLandscape: 56,
        titleSizePortrait: 64,
        fontWeight: 700,
        letterSpacing: 0,
        lineHeight: 1.3,
        textTransform: 'none',
        textShadow: '2px 2px 8px rgba(0,0,0,0.7)'
    },
    effects: {
        overlayIntensity: 0.5,
        vignette: false,
        borderRadius: 12,
        accentGlow: false,
        textContainerShadow: '0 4px 20px rgba(0,0,0,0.4)',
        textContainerBackground: 'rgba(26, 38, 52, 0.85)'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 2,
        randomElementProbability: 0.5,
        allowedRandomTypes: ['circle', 'emoji'],
        presetElements: [
            {
                type: 'circle',
                position: { x: 90, y: 20 },
                rotation: 0,
                scale: 1,
                opacity: 0.6,
                zIndex: 5,
                style: 'outline',
                color: '#64b5f6',
                strokeWidth: 3,
                radius: 40,
                shadow: false,
                fillOpacity: 0
            },
            {
                type: 'emoji',
                position: { x: 88, y: 75 },
                rotation: -10,
                scale: 0.9,
                opacity: 0.9,
                zIndex: 11,
                emoji: '🧠',
                category: 'brain',
                size: 40,
                shadow: true
            }
        ]
    },
    tags: ['calma', 'bienestar', 'neurodivergencia', 'minimalista', 'tdah', 'autismo']
};

/**
 * Plantilla 3: Energy Burst
 * Estilo energético con colores vibrantes
 * Ideal para contenido motivacional y productividad
 */
export const TEMPLATE_ENERGY: ThumbnailTemplate = {
    id: 'energy',
    name: 'Energy Burst',
    description: 'Estilo energético para contenido motivacional y productividad',
    colors: {
        primary: '#ff6b35',
        secondary: '#ff9f1c',
        accent: '#ffffff',
        textPrimary: '#ffffff',
        textSecondary: '#1a1a1a',
        gradient: 'linear-gradient(135deg, #ff6b35 0%, #ff9f1c 50%, #ffca3a 100%)',
        overlay: 'rgba(0, 0, 0, 0.4)'
    },
    layout: {
        titlePosition: 'top',
        titleAlign: 'center',
        brandPosition: 'bottom-left',
        padding: 35,
        maxTitleWidth: 95
    },
    typography: {
        fontFamily: "'Impact', 'Arial Black', Arial, sans-serif",
        titleSizeLandscape: 72,
        titleSizePortrait: 80,
        fontWeight: 900,
        letterSpacing: 3,
        lineHeight: 1.1,
        textTransform: 'uppercase',
        textShadow: '4px 4px 0 #000, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000'
    },
    effects: {
        overlayIntensity: 0.4,
        vignette: true,
        borderRadius: 0,
        accentGlow: false,
        textContainerShadow: 'none',
        textContainerBackground: 'transparent'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 4,
        randomElementProbability: 0.8,
        allowedRandomTypes: ['arrow', 'emoji'],
        presetElements: [
            {
                type: 'arrow',
                position: { x: 90, y: 50 },
                rotation: 0,
                scale: 1.3,
                opacity: 1,
                zIndex: 10,
                style: 'solid',
                direction: 'down',
                color: '#ffffff',
                strokeWidth: 5,
                size: 70,
                shadow: true
            },
            {
                type: 'emoji',
                position: { x: 8, y: 80 },
                rotation: -15,
                scale: 1.2,
                opacity: 1,
                zIndex: 11,
                emoji: '🔥',
                category: 'energy',
                size: 56,
                shadow: true
            },
            {
                type: 'emoji',
                position: { x: 92, y: 85 },
                rotation: 10,
                scale: 1,
                opacity: 0.95,
                zIndex: 11,
                emoji: '💪',
                category: 'reaction',
                size: 48,
                shadow: true
            }
        ]
    },
    tags: ['energía', 'motivación', 'productividad', 'vibrante', 'acción']
};

/**
 * Plantilla 4: Deep Purple
 * Estilo elegante con púrpuras profundos
 * Ideal para contenido educativo y científico
 */
export const TEMPLATE_PURPLE: ThumbnailTemplate = {
    id: 'purple',
    name: 'Deep Purple',
    description: 'Estilo elegante con púrpuras para contenido educativo',
    colors: {
        primary: '#2d1b4e',
        secondary: '#4a2c7a',
        accent: '#bb86fc',
        textPrimary: '#ffffff',
        textSecondary: '#bb86fc',
        gradient: 'linear-gradient(160deg, #2d1b4e 0%, #4a2c7a 40%, #6a3fa0 100%)',
        overlay: 'rgba(45, 27, 78, 0.55)'
    },
    layout: {
        titlePosition: 'center',
        titleAlign: 'center',
        brandPosition: 'bottom-right',
        padding: 45,
        maxTitleWidth: 88
    },
    typography: {
        fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
        titleSizeLandscape: 60,
        titleSizePortrait: 68,
        fontWeight: 800,
        letterSpacing: 1,
        lineHeight: 1.25,
        textTransform: 'none',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(187,134,252,0.3)'
    },
    effects: {
        overlayIntensity: 0.55,
        vignette: true,
        borderRadius: 8,
        accentGlow: true,
        textContainerShadow: '0 0 30px rgba(187,134,252,0.2)',
        textContainerBackground: 'transparent'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 3,
        randomElementProbability: 0.6,
        allowedRandomTypes: ['circle', 'emoji'],
        presetElements: [
            {
                type: 'circle',
                position: { x: 15, y: 25 },
                rotation: 0,
                scale: 1.1,
                opacity: 0.5,
                zIndex: 5,
                style: 'glow',
                color: '#bb86fc',
                strokeWidth: 2,
                radius: 50,
                shadow: false,
                fillOpacity: 0.1
            },
            {
                type: 'emoji',
                position: { x: 92, y: 15 },
                rotation: 0,
                scale: 1,
                opacity: 0.9,
                zIndex: 11,
                emoji: '🎓',
                category: 'brain',
                size: 44,
                shadow: true
            }
        ]
    },
    tags: ['educativo', 'ciencia', 'elegante', 'cerebro', 'neurociencia']
};

/**
 * Plantilla 5: Green Matrix
 * Estilo inspirado en Matrix con verdes neón
 * Ideal para contenido sobre tecnología y código
 */
export const TEMPLATE_MATRIX: ThumbnailTemplate = {
    id: 'matrix',
    name: 'Green Matrix',
    description: 'Estilo Matrix con verdes neón para tech y código',
    colors: {
        primary: '#0d0d0d',
        secondary: '#1a1a1a',
        accent: '#00ff41',
        textPrimary: '#00ff41',
        textSecondary: '#00cc33',
        gradient: 'linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 50%, #0d1f0d 100%)',
        overlay: 'rgba(0, 0, 0, 0.7)'
    },
    layout: {
        titlePosition: 'center',
        titleAlign: 'left',
        brandPosition: 'top-right',
        padding: 40,
        maxTitleWidth: 90
    },
    typography: {
        fontFamily: "'Courier New', Consolas, monospace",
        titleSizeLandscape: 58,
        titleSizePortrait: 66,
        fontWeight: 700,
        letterSpacing: 4,
        lineHeight: 1.3,
        textTransform: 'uppercase',
        textShadow: '0 0 10px #00ff41, 0 0 20px #00ff41, 0 0 30px #00ff41, 0 0 40px #00ff41'
    },
    effects: {
        overlayIntensity: 0.7,
        vignette: true,
        borderRadius: 0,
        accentGlow: true,
        textContainerShadow: 'none',
        textContainerBackground: 'transparent'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 3,
        randomElementProbability: 0.65,
        allowedRandomTypes: ['arrow', 'circle', 'emoji'],
        presetElements: [
            {
                type: 'arrow',
                position: { x: 8, y: 60 },
                rotation: 45,
                scale: 1,
                opacity: 0.85,
                zIndex: 10,
                style: 'outline',
                direction: 'right',
                color: '#00ff41',
                strokeWidth: 3,
                size: 55,
                shadow: true
            },
            {
                type: 'emoji',
                position: { x: 90, y: 20 },
                rotation: 0,
                scale: 1.1,
                opacity: 0.9,
                zIndex: 11,
                emoji: '💻',
                category: 'tech',
                size: 50,
                shadow: true
            }
        ]
    },
    tags: ['código', 'programación', 'tech', 'hacker', 'futurista']
};

/**
 * Plantilla 6: Warm Sunset
 * Estilo cálido con tonos naranjas y rojos
 * Ideal para contenido emocional y storytelling
 */
export const TEMPLATE_SUNSET: ThumbnailTemplate = {
    id: 'sunset',
    name: 'Warm Sunset',
    description: 'Estilo cálido para contenido emocional y storytelling',
    colors: {
        primary: '#1a0a1a',
        secondary: '#3d1a3d',
        accent: '#ff7e5f',
        textPrimary: '#ffffff',
        textSecondary: '#feb47b',
        gradient: 'linear-gradient(135deg, #1a0a1a 0%, #3d1a3d 30%, #ff7e5f 70%, #feb47b 100%)',
        overlay: 'rgba(26, 10, 26, 0.5)'
    },
    layout: {
        titlePosition: 'bottom',
        titleAlign: 'center',
        brandPosition: 'top-left',
        padding: 45,
        maxTitleWidth: 90
    },
    typography: {
        fontFamily: "'Georgia', 'Times New Roman', serif",
        titleSizeLandscape: 62,
        titleSizePortrait: 70,
        fontWeight: 700,
        letterSpacing: 1,
        lineHeight: 1.35,
        textTransform: 'none',
        textShadow: '3px 3px 6px rgba(0,0,0,0.9)'
    },
    effects: {
        overlayIntensity: 0.5,
        vignette: true,
        borderRadius: 16,
        accentGlow: false,
        textContainerShadow: '0 8px 32px rgba(0,0,0,0.5)',
        textContainerBackground: 'rgba(26, 10, 26, 0.7)'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 2,
        randomElementProbability: 0.5,
        allowedRandomTypes: ['emoji'],
        presetElements: [
            {
                type: 'emoji',
                position: { x: 90, y: 10 },
                rotation: 10,
                scale: 1,
                opacity: 0.9,
                zIndex: 11,
                emoji: '✨',
                category: 'energy',
                size: 42,
                shadow: true
            },
            {
                type: 'circle',
                position: { x: 10, y: 85 },
                rotation: 0,
                scale: 0.8,
                opacity: 0.4,
                zIndex: 5,
                style: 'outline',
                color: '#ff7e5f',
                strokeWidth: 2,
                radius: 35,
                shadow: false,
                fillOpacity: 0
            }
        ]
    },
    tags: ['emocional', 'storytelling', 'cálido', 'inspirador', 'personal']
};

/**
 * Plantilla 7: Ocean Blue
 * Estilo fresco con azules oceánicos
 * Ideal para contenido sobre aprendizaje y concentración
 */
export const TEMPLATE_OCEAN: ThumbnailTemplate = {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Estilo fresco oceánico para aprendizaje y concentración',
    colors: {
        primary: '#0c2340',
        secondary: '#1a4a6e',
        accent: '#4fc3f7',
        textPrimary: '#ffffff',
        textSecondary: '#81d4fa',
        gradient: 'linear-gradient(180deg, #0c2340 0%, #1a4a6e 50%, #2e7d9e 100%)',
        overlay: 'rgba(12, 35, 64, 0.55)'
    },
    layout: {
        titlePosition: 'top-left',
        titleAlign: 'left',
        brandPosition: 'bottom-right',
        padding: 50,
        maxTitleWidth: 80
    },
    typography: {
        fontFamily: "'Open Sans', 'Segoe UI', Tahoma, sans-serif",
        titleSizeLandscape: 54,
        titleSizePortrait: 62,
        fontWeight: 800,
        letterSpacing: 0,
        lineHeight: 1.3,
        textTransform: 'none',
        textShadow: '2px 2px 10px rgba(0,0,0,0.6)'
    },
    effects: {
        overlayIntensity: 0.55,
        vignette: false,
        borderRadius: 20,
        accentGlow: false,
        textContainerShadow: '0 4px 24px rgba(79,195,247,0.2)',
        textContainerBackground: 'rgba(12, 35, 64, 0.8)'
    },
    dynamicElements: {
        enabled: true,
        maxElements: 3,
        randomElementProbability: 0.6,
        allowedRandomTypes: ['arrow', 'circle', 'emoji'],
        presetElements: [
            {
                type: 'arrow',
                position: { x: 85, y: 45 },
                rotation: -30,
                scale: 1,
                opacity: 0.85,
                zIndex: 10,
                style: 'curved',
                direction: 'up-right',
                color: '#4fc3f7',
                strokeWidth: 3,
                size: 50,
                shadow: true
            },
            {
                type: 'emoji',
                position: { x: 92, y: 80 },
                rotation: 5,
                scale: 1,
                opacity: 0.9,
                zIndex: 11,
                emoji: '📚',
                category: 'brain',
                size: 44,
                shadow: true
            }
        ]
    },
    tags: ['aprendizaje', 'concentración', 'fresco', 'profesional', 'educación']
};

// ===== COLECCIÓN DE PLANTILLAS =====

/**
 * Array con todas las plantillas disponibles
 */
export const ALL_TEMPLATES: ThumbnailTemplate[] = [
    TEMPLATE_CYBER,
    TEMPLATE_CALM,
    TEMPLATE_ENERGY,
    TEMPLATE_PURPLE,
    TEMPLATE_MATRIX,
    TEMPLATE_SUNSET,
    TEMPLATE_OCEAN
];

/**
 * Mapa de plantillas por ID para acceso rápido
 */
export const TEMPLATES_BY_ID: Record<string, ThumbnailTemplate> = {
    'cyber': TEMPLATE_CYBER,
    'calm': TEMPLATE_CALM,
    'energy': TEMPLATE_ENERGY,
    'purple': TEMPLATE_PURPLE,
    'matrix': TEMPLATE_MATRIX,
    'sunset': TEMPLATE_SUNSET,
    'ocean': TEMPLATE_OCEAN
};

/**
 * Keywords que se resaltan con el color de acento
 */
export const HIGHLIGHT_KEYWORDS = [
    'IA', 'AI', 'AUTISMO', 'AUTISM', 'TDAH', 'ADHD', 
    'CEREBRO', 'BRAIN', 'FUTURO', 'FUTURE', 'NEURO',
    'INTELIGENCIA', 'INTELLIGENCE', 'SECRETO', 'SECRET'
];

// ===== GENERADOR DE ELEMENTOS DINÁMICOS (REQ-5.1.2) =====

/**
 * Clase helper para generar elementos dinámicos aleatorios
 */
export class DynamicElementsGenerator {
    /**
     * Genera una posición aleatoria evitando el centro del thumbnail
     * para no obstruir el título
     */
    public static generateRandomPosition(): ElementPosition {
        // Evitar la zona central (30-70% en ambos ejes)
        const zones = [
            { xMin: 5, xMax: 25, yMin: 5, yMax: 95 },   // Izquierda
            { xMin: 75, xMax: 95, yMin: 5, yMax: 95 },  // Derecha
            { xMin: 25, xMax: 75, yMin: 5, yMax: 25 },  // Arriba centro
            { xMin: 25, xMax: 75, yMin: 75, yMax: 95 }  // Abajo centro
        ];
        
        const zone = zones[Math.floor(Math.random() * zones.length)];
        return {
            x: zone.xMin + Math.random() * (zone.xMax - zone.xMin),
            y: zone.yMin + Math.random() * (zone.yMax - zone.yMin)
        };
    }

    /**
     * Genera offset aleatorio para posición (±offsetRange px en porcentaje)
     */
    public static applyPositionOffset(
        position: ElementPosition,
        offsetRange: number = 5
    ): ElementPosition {
        return {
            x: Math.max(2, Math.min(98, position.x + (Math.random() - 0.5) * 2 * offsetRange)),
            y: Math.max(2, Math.min(98, position.y + (Math.random() - 0.5) * 2 * offsetRange))
        };
    }

    /**
     * Genera una flecha aleatoria
     */
    public static generateRandomArrow(templateId: string): ArrowElement {
        const colors = ELEMENT_COLORS[templateId] || ELEMENT_COLORS.cyber;
        const styles: ArrowStyle[] = ['solid', 'outline', 'curved', 'hand-drawn'];
        const directions: ArrowDirection[] = ['up', 'down', 'left', 'right', 'up-right', 'up-left', 'down-right', 'down-left'];
        
        return {
            type: 'arrow',
            position: DynamicElementsGenerator.generateRandomPosition(),
            rotation: (Math.random() - 0.5) * 60, // ±30 grados
            scale: 0.8 + Math.random() * 0.6, // 0.8 a 1.4
            opacity: 0.7 + Math.random() * 0.3, // 0.7 a 1.0
            zIndex: 10,
            style: styles[Math.floor(Math.random() * styles.length)],
            direction: directions[Math.floor(Math.random() * directions.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
            strokeWidth: 2 + Math.floor(Math.random() * 4), // 2-5px
            size: 40 + Math.floor(Math.random() * 40), // 40-80px
            shadow: Math.random() > 0.3 // 70% probabilidad de sombra
        };
    }

    /**
     * Genera un círculo aleatorio
     */
    public static generateRandomCircle(templateId: string): CircleElement {
        const colors = ELEMENT_COLORS[templateId] || ELEMENT_COLORS.cyber;
        const styles: CircleStyle[] = ['solid', 'outline', 'dashed', 'glow'];
        
        return {
            type: 'circle',
            position: DynamicElementsGenerator.generateRandomPosition(),
            rotation: 0,
            scale: 0.7 + Math.random() * 0.6, // 0.7 a 1.3
            opacity: 0.4 + Math.random() * 0.4, // 0.4 a 0.8
            zIndex: 5,
            style: styles[Math.floor(Math.random() * styles.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
            strokeWidth: 2 + Math.floor(Math.random() * 3), // 2-4px
            radius: 25 + Math.floor(Math.random() * 35), // 25-60px
            shadow: Math.random() > 0.5, // 50% probabilidad de sombra
            fillOpacity: Math.random() > 0.6 ? 0.1 + Math.random() * 0.2 : 0 // 40% chance de relleno
        };
    }

    /**
     * Genera un emoji aleatorio de una categoría
     */
    public static generateRandomEmoji(
        templateId: string,
        preferredCategories?: EmojiCategory[]
    ): EmojiElement {
        const categories = preferredCategories && preferredCategories.length > 0
            ? preferredCategories
            : (['reaction', 'tech', 'brain', 'energy'] as EmojiCategory[]);
        
        const category = categories[Math.floor(Math.random() * categories.length)];
        const emojis = EMOJI_LIBRARY[category];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        return {
            type: 'emoji',
            position: DynamicElementsGenerator.generateRandomPosition(),
            rotation: (Math.random() - 0.5) * 30, // ±15 grados
            scale: 0.8 + Math.random() * 0.5, // 0.8 a 1.3
            opacity: 0.85 + Math.random() * 0.15, // 0.85 a 1.0
            zIndex: 11,
            emoji,
            category,
            size: 36 + Math.floor(Math.random() * 24), // 36-60px
            shadow: Math.random() > 0.2 // 80% probabilidad de sombra
        };
    }

    /**
     * Genera un elemento aleatorio del tipo especificado
     */
    public static generateRandomElement(
        type: DynamicElementType,
        templateId: string
    ): DynamicElement {
        switch (type) {
            case 'arrow':
                return DynamicElementsGenerator.generateRandomArrow(templateId);
            case 'circle':
                return DynamicElementsGenerator.generateRandomCircle(templateId);
            case 'emoji':
                return DynamicElementsGenerator.generateRandomEmoji(templateId);
        }
    }

    /**
     * Genera elementos aleatorios según la configuración de la plantilla
     */
    public static generateElementsForTemplate(
        template: ThumbnailTemplate,
        seed?: number
    ): DynamicElement[] {
        const config = template.dynamicElements;
        if (!config.enabled) return [];
        
        // Usar semilla si se proporciona para reproducibilidad
        const random = seed !== undefined 
            ? DynamicElementsGenerator.seededRandom(seed)
            : Math.random;
        
        const elements: DynamicElement[] = [];
        
        // Añadir elementos preset con offset aleatorio
        for (const preset of config.presetElements) {
            const elementWithOffset = {
                ...preset,
                position: DynamicElementsGenerator.applyPositionOffset(preset.position, 3)
            };
            elements.push(elementWithOffset as DynamicElement);
        }
        
        // Añadir elementos aleatorios según probabilidad
        if (random() < config.randomElementProbability) {
            const remainingSlots = config.maxElements - elements.length;
            const numRandomElements = Math.min(
                1 + Math.floor(random() * 2), // 1-2 elementos aleatorios
                remainingSlots
            );
            
            for (let i = 0; i < numRandomElements; i++) {
                const typeIndex = Math.floor(random() * config.allowedRandomTypes.length);
                const type = config.allowedRandomTypes[typeIndex];
                const newElement = DynamicElementsGenerator.generateRandomElement(type, template.id);
                
                // Asegurarse de que no se superponga con elementos existentes
                let attempts = 0;
                while (attempts < 5 && DynamicElementsGenerator.checkOverlap(newElement, elements)) {
                    newElement.position = DynamicElementsGenerator.generateRandomPosition();
                    attempts++;
                }
                
                if (attempts < 5) {
                    elements.push(newElement);
                }
            }
        }
        
        return elements;
    }

    /**
     * Verifica si un elemento se superpone con otros
     */
    private static checkOverlap(
        element: DynamicElement,
        existingElements: DynamicElement[]
    ): boolean {
        const minDistance = 15; // Porcentaje mínimo de distancia
        
        for (const existing of existingElements) {
            const dx = Math.abs(element.position.x - existing.position.x);
            const dy = Math.abs(element.position.y - existing.position.y);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Generador de números aleatorios con semilla
     */
    private static seededRandom(seed: number): () => number {
        let s = seed;
        return () => {
            s = Math.sin(s) * 10000;
            return s - Math.floor(s);
        };
    }
}

/**
 * Clase para renderizar elementos dinámicos a HTML/CSS
 */
export class DynamicElementsRenderer {
    /**
     * Genera el HTML para una flecha SVG
     */
    public static renderArrow(element: ArrowElement, width: number, height: number): string {
        const posX = (element.position.x / 100) * width;
        const posY = (element.position.y / 100) * height;
        const size = element.size * element.scale;
        
        // Generar path de la flecha según dirección y estilo
        const arrowPath = DynamicElementsRenderer.getArrowPath(element.direction, element.style, size);
        
        const shadowFilter = element.shadow 
            ? `filter: drop-shadow(3px 3px 4px rgba(0,0,0,0.5));`
            : '';
        
        const strokeStyle = element.style === 'outline' || element.style === 'hand-drawn'
            ? `fill: none; stroke: ${element.color}; stroke-width: ${element.strokeWidth}px;`
            : `fill: ${element.color}; stroke: none;`;
        
        return `
            <svg class="dynamic-element arrow" 
                 style="position: absolute; 
                        left: ${posX}px; 
                        top: ${posY}px; 
                        width: ${size}px; 
                        height: ${size}px; 
                        opacity: ${element.opacity}; 
                        transform: translate(-50%, -50%) rotate(${element.rotation}deg);
                        z-index: ${element.zIndex};
                        ${shadowFilter}"
                 viewBox="0 0 100 100" 
                 xmlns="http://www.w3.org/2000/svg">
                <path d="${arrowPath}" style="${strokeStyle}"/>
            </svg>
        `;
    }

    /**
     * Genera path SVG para diferentes estilos de flecha
     */
    private static getArrowPath(
        direction: ArrowDirection,
        style: ArrowStyle,
        _size: number
    ): string {
        // Path base para flecha hacia arriba
        let path: string;
        
        switch (style) {
            case 'curved':
                path = 'M 30 70 Q 50 30 50 20 Q 50 30 70 70 M 40 40 L 50 20 L 60 40';
                break;
            case 'double':
                path = 'M 35 75 L 50 45 L 65 75 M 35 55 L 50 25 L 65 55';
                break;
            case 'hand-drawn':
                path = 'M 32 72 Q 48 35 50 22 Q 52 35 68 72 M 38 42 Q 50 18 62 42';
                break;
            case 'outline':
            case 'solid':
            default:
                path = 'M 50 15 L 80 50 L 60 50 L 60 85 L 40 85 L 40 50 L 20 50 Z';
        }
        
        // Transformar según dirección (usando rotación CSS en el contenedor)
        const rotations: Record<ArrowDirection, number> = {
            'up': 0,
            'down': 180,
            'left': -90,
            'right': 90,
            'up-right': 45,
            'up-left': -45,
            'down-right': 135,
            'down-left': -135
        };
        
        // La rotación se aplica en el transform del SVG, no en el path
        return path;
    }

    /**
     * Genera el HTML para un círculo
     */
    public static renderCircle(element: CircleElement, width: number, height: number): string {
        const posX = (element.position.x / 100) * width;
        const posY = (element.position.y / 100) * height;
        const radius = element.radius * element.scale;
        
        const shadowStyle = element.shadow 
            ? `filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.4));`
            : '';
        
        let fillStyle: string;
        let strokeStyle: string;
        let extraStyles = '';
        
        switch (element.style) {
            case 'solid':
                fillStyle = element.color;
                strokeStyle = 'none';
                break;
            case 'glow':
                fillStyle = `${element.color}${Math.round(element.fillOpacity * 255).toString(16).padStart(2, '0')}`;
                strokeStyle = element.color;
                extraStyles = `filter: ${element.shadow ? 'drop-shadow(2px 2px 4px rgba(0,0,0,0.4)) ' : ''}drop-shadow(0 0 10px ${element.color});`;
                break;
            case 'dashed':
                fillStyle = element.fillOpacity > 0 
                    ? `${element.color}${Math.round(element.fillOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'none';
                strokeStyle = element.color;
                extraStyles = `stroke-dasharray: ${element.strokeWidth * 3} ${element.strokeWidth * 2};`;
                break;
            case 'double':
                // Doble círculo se renderiza con dos elementos
                fillStyle = 'none';
                strokeStyle = element.color;
                break;
            case 'outline':
            default:
                fillStyle = element.fillOpacity > 0 
                    ? `${element.color}${Math.round(element.fillOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'none';
                strokeStyle = element.color;
        }
        
        if (element.style === 'double') {
            return `
                <svg class="dynamic-element circle" 
                     style="position: absolute; 
                            left: ${posX}px; 
                            top: ${posY}px; 
                            width: ${radius * 2 + 20}px; 
                            height: ${radius * 2 + 20}px; 
                            opacity: ${element.opacity}; 
                            transform: translate(-50%, -50%);
                            z-index: ${element.zIndex};
                            ${shadowStyle}"
                     viewBox="0 0 ${radius * 2 + 20} ${radius * 2 + 20}" 
                     xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${radius + 10}" cy="${radius + 10}" r="${radius}" 
                            fill="none" stroke="${strokeStyle}" stroke-width="${element.strokeWidth}"/>
                    <circle cx="${radius + 10}" cy="${radius + 10}" r="${radius * 0.7}" 
                            fill="none" stroke="${strokeStyle}" stroke-width="${element.strokeWidth * 0.7}"/>
                </svg>
            `;
        }
        
        return `
            <svg class="dynamic-element circle" 
                 style="position: absolute; 
                        left: ${posX}px; 
                        top: ${posY}px; 
                        width: ${radius * 2 + 10}px; 
                        height: ${radius * 2 + 10}px; 
                        opacity: ${element.opacity}; 
                        transform: translate(-50%, -50%);
                        z-index: ${element.zIndex};
                        ${extraStyles || shadowStyle}"
                 viewBox="0 0 ${radius * 2 + 10} ${radius * 2 + 10}" 
                 xmlns="http://www.w3.org/2000/svg">
                <circle cx="${radius + 5}" cy="${radius + 5}" r="${radius}" 
                        fill="${fillStyle}" stroke="${strokeStyle}" stroke-width="${element.strokeWidth}" 
                        style="${extraStyles}"/>
            </svg>
        `;
    }

    /**
     * Genera el HTML para un emoji
     */
    public static renderEmoji(element: EmojiElement, width: number, height: number): string {
        const posX = (element.position.x / 100) * width;
        const posY = (element.position.y / 100) * height;
        const size = element.size * element.scale;
        
        const shadowStyle = element.shadow 
            ? `text-shadow: 2px 2px 4px rgba(0,0,0,0.5);`
            : '';
        
        return `
            <div class="dynamic-element emoji" 
                 style="position: absolute; 
                        left: ${posX}px; 
                        top: ${posY}px; 
                        font-size: ${size}px; 
                        opacity: ${element.opacity}; 
                        transform: translate(-50%, -50%) rotate(${element.rotation}deg);
                        z-index: ${element.zIndex};
                        line-height: 1;
                        ${shadowStyle}">
                ${element.emoji}
            </div>
        `;
    }

    /**
     * Renderiza todos los elementos dinámicos a HTML
     */
    public static renderAllElements(
        elements: DynamicElement[],
        width: number,
        height: number
    ): string {
        return elements.map(element => {
            switch (element.type) {
                case 'arrow':
                    return DynamicElementsRenderer.renderArrow(element, width, height);
                case 'circle':
                    return DynamicElementsRenderer.renderCircle(element, width, height);
                case 'emoji':
                    return DynamicElementsRenderer.renderEmoji(element, width, height);
            }
        }).join('\n');
    }
}
