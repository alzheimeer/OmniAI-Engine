/**
 * EditingStylePresets.ts
 * 
 * Sistema de estilos de edición aleatorios para variabilidad en videos.
 * Implementa 5+ presets diferentes para evitar patrones detectables.
 * 
 * REQ-1.2.1: Implementar sistema de estilos de edición aleatorios con 5+ presets diferentes
 * 
 * Cada preset define:
 * - Intervalos de corte característicos
 * - Tipos de transición preferidos
 * - Ajustes de color
 * - Posición del texto overlay
 */

import { TransformationParams } from './VideoTransformer';

// ============================================================
// TIPOS Y ENUMS
// ============================================================

/**
 * Tipos de transición soportados para edición de video.
 * REQ-1.2.3: Rotar entre tipos de transición - fade, dissolve, wipe, zoom, cut directo
 */
export type TransitionType = 
    | 'cut'       // Corte directo sin transición
    | 'fade'      // Fade a negro y vuelta
    | 'dissolve'  // Disolución cruzada entre clips
    | 'wipe'      // Barrido horizontal/vertical
    | 'zoom'      // Zoom in/out como transición
    | 'slide'     // Deslizamiento lateral
    | 'blur';     // Desenfoque como transición

/**
 * Posiciones válidas para texto overlay en el video.
 * REQ-1.2.4: Variar posiciones de texto - top, center, bottom, corners
 */
export type TextPosition = 
    | 'top'           // Parte superior centrada
    | 'center'        // Centro del video
    | 'bottom'        // Parte inferior centrada
    | 'top-left'      // Esquina superior izquierda
    | 'top-right'     // Esquina superior derecha
    | 'bottom-left'   // Esquina inferior izquierda
    | 'bottom-right'; // Esquina inferior derecha

/**
 * Ajustes de color característicos para cada preset.
 * Extiende parcialmente TransformationParams para consistencia.
 */
export interface ColorAdjustments {
    /** Multiplicador de saturación (0.85-1.15) */
    saturation: number;
    /** Multiplicador de contraste (0.92-1.08) */
    contrast: number;
    /** Multiplicador de brillo (0.95-1.05) */
    brightness: number;
    /** Hue shift en grados (-10 a +10) */
    hue: number;
    /** Intensidad de viñeta (0.1-0.3) */
    vignetteStrength: number;
}

// ============================================================
// INTERFACE PRINCIPAL
// ============================================================

/**
 * Interface para un preset de estilo de edición.
 * Define todas las características visuales y de ritmo de un estilo.
 * 
 * REQ-1.2.1: Cada preset define configuración completa de estilo de edición
 */
export interface EditingPreset {
    /** Nombre único del preset (identificador) */
    name: string;
    
    /** Descripción legible del estilo */
    description: string;
    
    /** 
     * Rango de intervalo de corte en segundos.
     * REQ-1.2.2: Intervalos de corte variables 2-8 segundos
     */
    cutInterval: {
        min: number;  // Mínimo segundos entre cortes
        max: number;  // Máximo segundos entre cortes
    };
    
    /** 
     * Array de tipos de transición preferidos para este estilo.
     * Se seleccionará aleatoriamente de este array.
     * REQ-1.2.3: Rotar entre tipos de transición
     */
    transitionTypes: TransitionType[];
    
    /** 
     * Ajustes de color característicos del estilo.
     * REQ-1.1.3: Alteración cromática variable
     */
    colorAdjustments: ColorAdjustments;
    
    /** 
     * Posición preferida del texto overlay.
     * REQ-1.2.4: Variar posiciones de texto
     */
    textPosition: TextPosition;
    
    /** 
     * Duración promedio de transiciones en milisegundos.
     * Afecta el ritmo visual del video.
     */
    transitionDurationMs: number;
    
    /**
     * Intensidad del grain de película (3-8).
     * REQ-1.1.5: Grain aleatorio variable por estilo
     */
    grainIntensity: number;
}

// ============================================================
// PRESETS PREDEFINIDOS (5+ ESTILOS)
// ============================================================

/**
 * Preset CINEMATIC: Estilo cinematográfico profesional.
 * - Cortes lentos para permitir apreciación visual
 * - Transiciones suaves (dissolve, fade)
 * - Colores cálidos con alto contraste
 * - Viñeta pronunciada para efecto película
 */
export const PRESET_CINEMATIC: EditingPreset = {
    name: 'cinematic',
    description: 'Estilo cinematográfico con cortes lentos, transiciones suaves y colores cálidos',
    cutInterval: { min: 5, max: 8 },
    transitionTypes: ['dissolve', 'fade', 'blur'],
    colorAdjustments: {
        saturation: 0.95,      // Saturación ligeramente reducida
        contrast: 1.08,        // Alto contraste
        brightness: 0.98,      // Ligeramente oscuro
        hue: 8,                // Tono cálido (hacia naranja)
        vignetteStrength: 0.25 // Viñeta pronunciada
    },
    textPosition: 'bottom',
    transitionDurationMs: 800,
    grainIntensity: 6
};

/**
 * Preset ENERGETIC: Estilo dinámico y vibrante.
 * - Cortes rápidos para mantener energía
 * - Transiciones dinámicas (zoom, wipe)
 * - Colores vibrantes con alta saturación
 * - Poco o nada de viñeta para claridad
 */
export const PRESET_ENERGETIC: EditingPreset = {
    name: 'energetic',
    description: 'Estilo enérgico con cortes rápidos, transiciones dinámicas y colores vibrantes',
    cutInterval: { min: 2, max: 4 },
    transitionTypes: ['cut', 'zoom', 'wipe', 'slide'],
    colorAdjustments: {
        saturation: 1.12,      // Alta saturación
        contrast: 1.05,        // Contraste elevado
        brightness: 1.02,      // Ligeramente brillante
        hue: 5,                // Tono ligeramente cálido
        vignetteStrength: 0.12 // Viñeta mínima
    },
    textPosition: 'center',
    transitionDurationMs: 300,
    grainIntensity: 4
};

/**
 * Preset MINIMAL: Estilo limpio y minimalista.
 * - Cortes directos sin transiciones elaboradas
 * - Principalmente cortes secos
 * - Colores neutros sin alteraciones fuertes
 * - Texto en posición clásica inferior
 */
export const PRESET_MINIMAL: EditingPreset = {
    name: 'minimal',
    description: 'Estilo minimalista con cortes directos, pocas transiciones y colores neutros',
    cutInterval: { min: 4, max: 6 },
    transitionTypes: ['cut', 'fade'],
    colorAdjustments: {
        saturation: 1.0,       // Saturación neutral
        contrast: 1.0,         // Contraste neutral
        brightness: 1.0,       // Brillo neutral
        hue: 0,                // Sin shift de color
        vignetteStrength: 0.1  // Viñeta muy sutil
    },
    textPosition: 'bottom',
    transitionDurationMs: 400,
    grainIntensity: 3
};

/**
 * Preset DOCUMENTARY: Estilo documental informativo.
 * - Cortes medianos para dar tiempo de absorber información
 * - Transiciones informativas (dissolve, fade)
 * - Colores naturales y realistas
 * - Texto en posición tradicional inferior
 */
export const PRESET_DOCUMENTARY: EditingPreset = {
    name: 'documentary',
    description: 'Estilo documental con cortes medianos, transiciones informativas y colores naturales',
    cutInterval: { min: 4, max: 7 },
    transitionTypes: ['dissolve', 'fade', 'cut'],
    colorAdjustments: {
        saturation: 0.98,      // Saturación ligeramente reducida
        contrast: 1.02,        // Contraste sutil
        brightness: 1.0,       // Brillo neutral
        hue: -2,               // Tono ligeramente frío
        vignetteStrength: 0.15 // Viñeta moderada
    },
    textPosition: 'bottom-left',
    transitionDurationMs: 600,
    grainIntensity: 5
};

/**
 * Preset DRAMATIC: Estilo dramático e impactante.
 * - Cortes variables para crear tensión
 * - Transiciones impactantes (zoom, blur)
 * - Alto contraste con colores intensos
 * - Viñeta fuerte para enfoque dramático
 */
export const PRESET_DRAMATIC: EditingPreset = {
    name: 'dramatic',
    description: 'Estilo dramático con cortes variables, transiciones impactantes y alto contraste',
    cutInterval: { min: 2, max: 6 },
    transitionTypes: ['zoom', 'blur', 'fade', 'cut'],
    colorAdjustments: {
        saturation: 1.08,      // Saturación aumentada
        contrast: 1.08,        // Alto contraste
        brightness: 0.96,      // Ligeramente oscuro
        hue: -5,               // Tono frío dramático
        vignetteStrength: 0.28 // Viñeta fuerte
    },
    textPosition: 'center',
    transitionDurationMs: 500,
    grainIntensity: 7
};

/**
 * Preset VINTAGE: Estilo retro/nostálgico (OPCIONAL).
 * - Cortes clásicos de películas antiguas
 * - Transiciones de época (fade, dissolve)
 * - Colores desaturados con tono sepia
 * - Mucho grain para efecto película antigua
 */
export const PRESET_VINTAGE: EditingPreset = {
    name: 'vintage',
    description: 'Estilo retro con colores desaturados, tono sepia y efecto de película antigua',
    cutInterval: { min: 5, max: 8 },
    transitionTypes: ['fade', 'dissolve'],
    colorAdjustments: {
        saturation: 0.88,      // Baja saturación
        contrast: 1.05,        // Contraste moderado
        brightness: 0.98,      // Ligeramente oscuro
        hue: 10,               // Tono sepia/cálido
        vignetteStrength: 0.3  // Viñeta muy pronunciada
    },
    textPosition: 'bottom',
    transitionDurationMs: 700,
    grainIntensity: 8
};

/**
 * Preset MODERN: Estilo moderno y tech (OPCIONAL).
 * - Cortes rápidos estilo contenido digital
 * - Transiciones tech (slide, zoom)
 * - Colores fríos y tech
 * - Mínimo grain para look digital limpio
 */
export const PRESET_MODERN: EditingPreset = {
    name: 'modern',
    description: 'Estilo moderno tech con cortes rápidos, transiciones digitales y colores fríos',
    cutInterval: { min: 2, max: 5 },
    transitionTypes: ['slide', 'zoom', 'cut', 'wipe'],
    colorAdjustments: {
        saturation: 1.05,      // Saturación moderada
        contrast: 1.06,        // Contraste tech
        brightness: 1.03,      // Ligeramente brillante
        hue: -8,               // Tono frío/azulado
        vignetteStrength: 0.12 // Viñeta mínima
    },
    textPosition: 'top',
    transitionDurationMs: 350,
    grainIntensity: 3
};

/**
 * Preset TUTORIAL: Estilo educativo/tutorial (OPCIONAL).
 * - Cortes estables para facilitar seguimiento
 * - Transiciones claras y simples
 * - Colores neutros para no distraer
 * - Texto en posición visible superior
 */
export const PRESET_TUTORIAL: EditingPreset = {
    name: 'tutorial',
    description: 'Estilo educativo con cortes estables, transiciones simples y colores neutros',
    cutInterval: { min: 5, max: 8 },
    transitionTypes: ['cut', 'fade', 'dissolve'],
    colorAdjustments: {
        saturation: 1.02,      // Saturación ligeramente aumentada
        contrast: 1.03,        // Contraste sutil
        brightness: 1.02,      // Ligeramente brillante para claridad
        hue: 0,                // Sin shift de color
        vignetteStrength: 0.1  // Viñeta mínima
    },
    textPosition: 'top',
    transitionDurationMs: 500,
    grainIntensity: 3
};

// ============================================================
// COLECCIÓN DE PRESETS
// ============================================================

/**
 * Array con todos los presets disponibles.
 * Incluye los 5 principales + 3 opcionales = 8 presets totales.
 */
export const ALL_PRESETS: EditingPreset[] = [
    PRESET_CINEMATIC,
    PRESET_ENERGETIC,
    PRESET_MINIMAL,
    PRESET_DOCUMENTARY,
    PRESET_DRAMATIC,
    PRESET_VINTAGE,
    PRESET_MODERN,
    PRESET_TUTORIAL
];

/**
 * Mapa de presets por nombre para acceso rápido.
 */
export const PRESETS_BY_NAME: Record<string, EditingPreset> = {
    cinematic: PRESET_CINEMATIC,
    energetic: PRESET_ENERGETIC,
    minimal: PRESET_MINIMAL,
    documentary: PRESET_DOCUMENTARY,
    dramatic: PRESET_DRAMATIC,
    vintage: PRESET_VINTAGE,
    modern: PRESET_MODERN,
    tutorial: PRESET_TUTORIAL
};

// ============================================================
// FUNCIONES DE SELECCIÓN
// ============================================================

/**
 * Historial de presets usados recientemente.
 * Se usa para evitar repetición en los últimos N videos.
 */
let recentPresets: string[] = [];

/**
 * Número de presets recientes a recordar para evitar repetición.
 * Por defecto 3: no se repetirá un preset en los últimos 3 videos.
 */
const RECENT_HISTORY_SIZE = 3;

/**
 * Selecciona un preset aleatorio evitando repetición en los últimos 3 videos.
 * 
 * REQ-1.2.1: Implementar sistema de estilos de edición aleatorios con 5+ presets diferentes
 * 
 * Lógica:
 * 1. Filtra los presets que NO están en el historial reciente
 * 2. Si todos están en el historial (edge case), limpia el historial
 * 3. Selecciona aleatoriamente de los presets disponibles
 * 4. Añade el preset seleccionado al historial
 * 5. Mantiene el historial en tamaño máximo RECENT_HISTORY_SIZE
 * 
 * @param excludeNames - Nombres de presets adicionales a excluir (opcional)
 * @returns EditingPreset seleccionado aleatoriamente sin repetición reciente
 */
export function selectRandomPreset(excludeNames: string[] = []): EditingPreset {
    // Combinar exclusiones: historial reciente + exclusiones explícitas
    const allExclusions = new Set([...recentPresets, ...excludeNames]);
    
    // Filtrar presets disponibles (no en exclusiones)
    let availablePresets = ALL_PRESETS.filter(
        preset => !allExclusions.has(preset.name)
    );
    
    // Edge case: si no hay presets disponibles, limpiar historial y usar todos
    if (availablePresets.length === 0) {
        recentPresets = [];
        availablePresets = ALL_PRESETS.filter(
            preset => !excludeNames.includes(preset.name)
        );
        
        // Si aún no hay disponibles (todas excluidas explícitamente), usar todos
        if (availablePresets.length === 0) {
            availablePresets = ALL_PRESETS;
        }
    }
    
    // Seleccionar aleatoriamente
    const randomIndex = Math.floor(Math.random() * availablePresets.length);
    const selectedPreset = availablePresets[randomIndex];
    
    // Añadir al historial
    recentPresets.push(selectedPreset.name);
    
    // Mantener historial en tamaño máximo
    if (recentPresets.length > RECENT_HISTORY_SIZE) {
        recentPresets.shift(); // Eliminar el más antiguo
    }
    
    return selectedPreset;
}

/**
 * Obtiene un preset por nombre.
 * 
 * @param name - Nombre del preset a obtener
 * @returns EditingPreset o undefined si no existe
 */
export function getPresetByName(name: string): EditingPreset | undefined {
    return PRESETS_BY_NAME[name];
}

/**
 * Obtiene el historial de presets recientes.
 * Útil para debugging y verificación de no-repetición.
 * 
 * @returns Array con los nombres de los últimos presets usados
 */
export function getRecentPresets(): string[] {
    return [...recentPresets];
}

/**
 * Limpia el historial de presets recientes.
 * Útil para reiniciar el sistema o en tests.
 */
export function clearRecentPresets(): void {
    recentPresets = [];
}

/**
 * Genera un intervalo de corte aleatorio basado en el preset.
 * REQ-1.2.2: Variar intervalos de corte (2-8 segundos)
 * 
 * @param preset - Preset del cual tomar el rango de intervalos
 * @returns Número de segundos para el próximo corte
 */
export function generateCutInterval(preset: EditingPreset): number {
    const { min, max } = preset.cutInterval;
    return min + Math.random() * (max - min);
}

/**
 * Selecciona un tipo de transición aleatorio del preset.
 * REQ-1.2.3: Rotar entre tipos de transición
 * 
 * @param preset - Preset del cual tomar las transiciones disponibles
 * @returns Tipo de transición seleccionado
 */
export function selectTransitionType(preset: EditingPreset): TransitionType {
    const types = preset.transitionTypes;
    const randomIndex = Math.floor(Math.random() * types.length);
    return types[randomIndex];
}

/**
 * Genera parámetros de transformación parciales desde un preset.
 * Combina los ajustes de color del preset con los rangos del VideoTransformer.
 * 
 * @param preset - Preset del cual generar parámetros
 * @returns Partial<TransformationParams> con valores del preset
 */
export function generateTransformParamsFromPreset(
    preset: EditingPreset
): Partial<TransformationParams> {
    const { colorAdjustments, grainIntensity } = preset;
    
    return {
        saturation: colorAdjustments.saturation,
        contrast: colorAdjustments.contrast,
        brightness: colorAdjustments.brightness,
        hue: colorAdjustments.hue,
        vignetteStrength: colorAdjustments.vignetteStrength,
        grainIntensity: grainIntensity
    };
}

/**
 * Verifica si un preset existe por nombre.
 * 
 * @param name - Nombre del preset a verificar
 * @returns true si el preset existe
 */
export function presetExists(name: string): boolean {
    return name in PRESETS_BY_NAME;
}

/**
 * Obtiene todos los nombres de presets disponibles.
 * 
 * @returns Array con los nombres de todos los presets
 */
export function getAllPresetNames(): string[] {
    return ALL_PRESETS.map(preset => preset.name);
}
