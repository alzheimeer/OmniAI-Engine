/**
 * ClipPoolManager - Gestiona el pool de clips pre-generados
 * 
 * Funcionalidades:
 * - Selección inteligente de clips del pool
 * - Pre-generación nocturna de clips
 * - Gestión de niveles del pool por categoría
 * - Tracking de uso para evitar repeticiones
 * 
 * @see Requirements: 10.1-10.7, 11.1-11.7
 */

import { ClipDatabase, Clip, ClipCategory, ClipInsert } from './ClipDatabase';
import { ComfyUIClient } from './ComfyUIClient';
import { ModelConfig, VisualStyle } from './ModelConfig';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// INTERFACES Y TIPOS (Tarea 8.1)
// ============================================================================

/**
 * Horario de pre-generación.
 * Define el período durante el cual se ejecuta la pre-generación nocturna.
 * @see Requirement 10.2
 */
export interface PreGenerationSchedule {
    /** Hora de inicio (0-23) */
    startHour: number;
    /** Minuto de inicio (0-59) */
    startMinute: number;
    /** Hora de fin (0-23) */
    endHour: number;
    /** Minuto de fin (0-59) */
    endMinute: number;
}

/**
 * Configuración del ClipPoolManager.
 * Define parámetros para gestión del pool y pre-generación.
 * @see Requirements 10.1, 10.2, 11.4, 11.5
 */
export interface ClipPoolManagerConfig {
    /** Directorio del pool de clips (default: content/clip_pool/) */
    poolDirectory: string;
    /** Horario de pre-generación (default: 02:00-06:00) */
    schedule: PreGenerationSchedule;
    /** Mínimo de clips por categoría (default: 20) */
    minClipsPerCategory: number;
    /** Umbral para priorizar reuso (default: 200) - Req 11.4 */
    reuseThreshold: number;
    /** Umbral para priorizar generación (default: 50) - Req 11.5 */
    generateThreshold: number;
    /** Máximo de usos antes de retirar un clip (default: 10) - Req 11.7 */
    maxUsesBeforeRetire: number;
    /** Días para considerar uso reciente (default: 7) - Req 11.3 */
    recentUseDays: number;
    /** Máximo de clips a generar por sesión por categoría (default: 5) */
    maxClipsPerSessionPerCategory: number;
}

/**
 * Estadísticas del pool de clips.
 * Proporciona métricas para monitoreo y decisiones de priorización.
 * @see Requirements 10.1, 11.4, 11.5
 */
export interface PoolStatistics {
    /** Total de clips en el pool */
    totalClips: number;
    /** Clips por categoría */
    clipsByCategory: Record<ClipCategory, number>;
    /** Número de clips activos */
    activeClips: number;
    /** Número de clips retirados */
    retiredClips: number;
    /** Categorías con menos clips que el mínimo configurado */
    lowCategories: ClipCategory[];
}

// ============================================================================
// CONSTANTES (Tarea 8.1)
// ============================================================================

/**
 * Categorías genéricas de clips.
 * Usadas para clasificar y buscar clips en el pool.
 * @see Requirement 10.4
 */
export const CLIP_CATEGORIES: ClipCategory[] = [
    'nature',
    'technology', 
    'business',
    'abstract',
    'lifestyle',
    'urban'
];

/**
 * Prompts por defecto por categoría con estilo visual.
 * Cada categoría tiene múltiples prompts para variedad en la pre-generación.
 * @see Requirements 10.4, 15.1-15.9
 */
export const CATEGORY_PROMPTS: Record<ClipCategory, Array<{ prompt: string; style: VisualStyle }>> = {
    nature: [
        { 
            prompt: 'serene forest with gentle wind moving leaves, soft sunlight filtering through trees, peaceful atmosphere, subtle motion, gentle drift', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'calm ocean waves at sunset, warm golden light, slow motion water movement, reflections on water surface, seamless loop', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'mountain landscape with subtle cloud movement, mist rolling through valleys, peaceful atmosphere, slow movement', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'rain drops on window with blurred forest background, cozy atmosphere, water droplets sliding down glass', 
            style: 'moody_lofi_ambient' 
        }
    ],
    technology: [
        { 
            prompt: 'abstract data visualization with glowing nodes and connections, futuristic blue aesthetic, subtle particle movement, seamless loop', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'close-up of circuit board with LED lights pulsing gently, tech aesthetic, minimal motion, static camera', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'holographic interface with floating elements, sci-fi ambience, blue and purple glow, atmospheric drift', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'server room with blinking lights, dark atmosphere with blue LED glow, subtle cable movement from fans', 
            style: 'moody_lofi_ambient' 
        }
    ],
    business: [
        { 
            prompt: 'modern office space with soft ambient lighting, minimal movement, professional atmosphere, subtle dust particles in light', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'city skyline at dusk with twinkling lights, urban business aesthetic, slow movement, atmospheric drift', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'professional workspace with warm lighting, coffee cup with steam rising, calm productive atmosphere', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'conference room with large windows, city view, rain on glass, corporate atmosphere, lo-fi aesthetic', 
            style: 'moody_lofi_ambient' 
        }
    ],
    abstract: [
        { 
            prompt: 'flowing gradient colors with slow morphing shapes, meditative visual, seamless loop motion, gentle drift', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'geometric patterns with subtle rotation, hypnotic minimal design, static camera with minimal motion', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'particle cloud with gentle drift, abstract digital art, floating particles, seamless loop', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'liquid metal texture with slow ripples, reflective surface, minimal movement, mesmerizing visual', 
            style: 'cinemagraph_plotagraph' 
        }
    ],
    lifestyle: [
        { 
            prompt: 'cozy coffee shop interior with steam rising from cup, warm ambience, soft lighting, gentle drift of steam', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'home office with plants, natural light from window, calm productive space, subtle curtain movement', 
            style: 'cinemagraph_plotagraph' 
        },
        { 
            prompt: 'bookshelf with soft lamp light, intellectual cozy atmosphere, dust particles floating in light', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'vinyl record player spinning, warm room lighting, nostalgic atmosphere, subtle motion, seamless loop', 
            style: 'moody_lofi_ambient' 
        }
    ],
    urban: [
        { 
            prompt: 'rainy city street at night, neon reflections on wet pavement, lo-fi mood, slow rain drops, atmospheric', 
            style: 'moody_lofi_ambient' 
        },
        { 
            prompt: 'empty corridor with flickering fluorescent lights, liminal space aesthetic, unsettling calm, slow movement', 
            style: 'analog_horror_liminal' 
        },
        { 
            prompt: 'pedestrian crossing at night, single distant figure standing still, flickering street lamp, volumetric fog', 
            style: 'analog_horror_liminal' 
        },
        { 
            prompt: 'abandoned shopping mall interior at night, dim emergency lights, liminal space, eerie stillness', 
            style: 'analog_horror_liminal' 
        }
    ]
};

/** Configuración por defecto del ClipPoolManager */
const DEFAULT_CONFIG: ClipPoolManagerConfig = {
    poolDirectory: path.join(process.cwd(), 'content', 'clip_pool'),
    schedule: { startHour: 2, startMinute: 0, endHour: 6, endMinute: 0 },
    minClipsPerCategory: 20,
    reuseThreshold: 200,
    generateThreshold: 50,
    maxUsesBeforeRetire: 10,
    recentUseDays: 7,
    maxClipsPerSessionPerCategory: 5
};

// ============================================================================
// CLASE CLIPPOOLMANAGER (Tareas 8.2-8.5)
// ============================================================================

/**
 * ClipPoolManager - Gestiona el pool de clips pre-generados.
 * 
 * Responsabilidades:
 * - Selección inteligente de clips evitando repeticiones (Req 11.1-11.3)
 * - Priorización de reuso vs generación según nivel del pool (Req 11.4-11.5)
 * - Pre-generación nocturna de clips (Req 10.2-10.7)
 * - Tracking de uso y retiro de clips muy usados (Req 11.6-11.7)
 * 
 * @example
 * ```typescript
 * const db = new ClipDatabase();
 * db.initialize();
 * 
 * const poolManager = new ClipPoolManager(db);
 * 
 * // Iniciar scheduler para pre-generación nocturna
 * poolManager.startScheduler();
 * 
 * // Obtener un clip del pool
 * const clip = await poolManager.getClip('nature', ['forest', 'peaceful']);
 * 
 * // Registrar uso
 * if (clip) {
 *   poolManager.recordUsage(clip.id, 'video_123', 'short', 'filler', 'youtube');
 * }
 * 
 * // Detener scheduler al cerrar
 * poolManager.stopScheduler();
 * ```
 */
export class ClipPoolManager {
    private config: ClipPoolManagerConfig;
    private database: ClipDatabase;
    private comfyClient: ComfyUIClient | null;
    private scheduledTask: NodeJS.Timeout | null = null;
    private isGenerating: boolean = false;

    /**
     * Crea una nueva instancia de ClipPoolManager.
     * @param database Instancia de ClipDatabase para acceso a datos
     * @param comfyClient Cliente ComfyUI opcional para generación
     * @param config Configuración parcial (se mezcla con defaults)
     */
    constructor(
        database: ClipDatabase,
        comfyClient?: ComfyUIClient,
        config?: Partial<ClipPoolManagerConfig>
    ) {
        this.database = database;
        this.comfyClient = comfyClient || null;
        
        // Parsear schedule desde variable de entorno si existe (Req 10.2)
        const scheduleEnv = process.env.CLIP_PREGENERATION_SCHEDULE;
        let schedule = DEFAULT_CONFIG.schedule;
        if (scheduleEnv) {
            schedule = this.parseSchedule(scheduleEnv);
        }
        
        // Mezclar configuración con defaults
        this.config = {
            ...DEFAULT_CONFIG,
            schedule,
            poolDirectory: process.env.CLIP_POOL_DIRECTORY || DEFAULT_CONFIG.poolDirectory,
            minClipsPerCategory: parseInt(process.env.CLIP_POOL_MIN_PER_CATEGORY || '20', 10),
            ...config
        };
        
        // Asegurar que el directorio del pool existe (Req 10.1)
        if (!fs.existsSync(this.config.poolDirectory)) {
            fs.mkdirSync(this.config.poolDirectory, { recursive: true });
            console.log(`[ClipPoolManager] Directorio del pool creado: ${this.config.poolDirectory}`);
        }
        
        console.log(`[ClipPoolManager] Inicializado con pool en: ${this.config.poolDirectory}`);
        console.log(`[ClipPoolManager] Schedule: ${this.formatSchedule(this.config.schedule)}`);
        console.log(`[ClipPoolManager] Mínimo por categoría: ${this.config.minClipsPerCategory}`);
    }

    // ========================================================================
    // PARSEO DE HORARIO (Tarea 8.4)
    // ========================================================================

    /**
     * Parsea horario desde string "HH:MM-HH:MM".
     * @param scheduleStr String con formato "HH:MM-HH:MM" (ejemplo: "02:00-06:00")
     * @returns Objeto PreGenerationSchedule o default si el formato es inválido
     * @see Requirement 10.2
     */
    private parseSchedule(scheduleStr: string): PreGenerationSchedule {
        const match = scheduleStr.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
        if (!match) {
            console.warn(`[ClipPoolManager] Formato de schedule inválido: '${scheduleStr}', usando default 02:00-06:00`);
            return DEFAULT_CONFIG.schedule;
        }
        
        const startHour = parseInt(match[1], 10);
        const startMinute = parseInt(match[2], 10);
        const endHour = parseInt(match[3], 10);
        const endMinute = parseInt(match[4], 10);
        
        // Validar rangos
        if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
            startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
            console.warn(`[ClipPoolManager] Valores de schedule fuera de rango: '${scheduleStr}', usando default`);
            return DEFAULT_CONFIG.schedule;
        }
        
        return { startHour, startMinute, endHour, endMinute };
    }

    /**
     * Formatea un schedule a string legible.
     * @param schedule Schedule a formatear
     * @returns String en formato "HH:MM-HH:MM"
     */
    private formatSchedule(schedule: PreGenerationSchedule): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(schedule.startHour)}:${pad(schedule.startMinute)}-${pad(schedule.endHour)}:${pad(schedule.endMinute)}`;
    }

    // ========================================================================
    // SCHEDULER DE PRE-GENERACIÓN (Tarea 8.4)
    // ========================================================================

    /**
     * Inicia el scheduler de pre-generación nocturna.
     * Verifica cada 5 minutos si estamos en horario de pre-generación.
     * @see Requirement 10.2
     */
    public startScheduler(): void {
        if (this.scheduledTask) {
            console.log('[ClipPoolManager] Scheduler ya está corriendo');
            return;
        }
        
        console.log(`[ClipPoolManager] Scheduler iniciado: ${this.formatSchedule(this.config.schedule)}`);
        
        // Verificar cada 5 minutos si estamos en horario
        this.scheduledTask = setInterval(async () => {
            if (this.isWithinSchedule() && !this.isGenerating) {
                console.log('[ClipPoolManager] Dentro del horario de pre-generación, iniciando sesión...');
                await this.triggerPreGeneration();
            }
        }, 5 * 60 * 1000); // 5 minutos
        
        // Verificar inmediatamente por si ya estamos en horario
        if (this.isWithinSchedule() && !this.isGenerating) {
            console.log('[ClipPoolManager] Ya estamos en horario, iniciando pre-generación...');
            this.triggerPreGeneration().catch(err => {
                console.error('[ClipPoolManager] Error en pre-generación inicial:', err);
            });
        }
    }

    /**
     * Detiene el scheduler de pre-generación.
     */
    public stopScheduler(): void {
        if (this.scheduledTask) {
            clearInterval(this.scheduledTask);
            this.scheduledTask = null;
            console.log('[ClipPoolManager] Scheduler detenido');
        }
    }

    /**
     * Verifica si el momento actual está dentro del horario de pre-generación.
     * @returns true si estamos en horario de pre-generación
     * @see Requirement 10.2
     */
    public isWithinSchedule(): boolean {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = this.config.schedule.startHour * 60 + this.config.schedule.startMinute;
        const endMinutes = this.config.schedule.endHour * 60 + this.config.schedule.endMinute;
        
        // Manejar el caso donde el horario cruza medianoche
        if (startMinutes > endMinutes) {
            // Ejemplo: 22:00-06:00
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        }
        
        // Caso normal: 02:00-06:00
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    // ========================================================================
    // SESIÓN DE PRE-GENERACIÓN (Tarea 8.5)
    // ========================================================================

    /**
     * Dispara manualmente una sesión de pre-generación.
     * Útil para testing o para llenar el pool fuera del horario programado.
     * @see Requirement 10.7
     */
    public async triggerPreGeneration(): Promise<void> {
        if (this.isGenerating) {
            console.log('[ClipPoolManager] Pre-generación ya en progreso, ignorando solicitud');
            return;
        }
        
        if (!this.comfyClient) {
            console.error('[ClipPoolManager] No hay cliente ComfyUI configurado para pre-generación');
            return;
        }
        
        this.isGenerating = true;
        console.log('[ClipPoolManager] Iniciando sesión de pre-generación...');
        
        try {
            await this.runPreGenerationSession();
        } catch (error) {
            console.error('[ClipPoolManager] Error durante pre-generación:', error);
        } finally {
            this.isGenerating = false;
            console.log('[ClipPoolManager] Sesión de pre-generación finalizada');
        }
    }

    /**
     * Ejecuta una sesión de pre-generación.
     * Genera clips para categorías que tienen menos del mínimo configurado.
     * @see Requirements 10.3, 10.4, 10.5
     */
    private async runPreGenerationSession(): Promise<void> {
        const lowCategories = await this.getLowCategories();
        
        if (lowCategories.length === 0) {
            console.log('[ClipPoolManager] Todas las categorías tienen suficientes clips');
            return;
        }
        
        console.log(`[ClipPoolManager] Categorías con bajo nivel (< ${this.config.minClipsPerCategory}): ${lowCategories.join(', ')}`);
        
        // Procesar cada categoría con bajo nivel
        for (const category of lowCategories) {
            // Verificar si seguimos en horario (si hay scheduler activo)
            if (this.scheduledTask && !this.isWithinSchedule()) {
                console.log('[ClipPoolManager] Fuera del horario de pre-generación, deteniendo sesión');
                return;
            }
            
            const counts = this.database.countByCategory();
            const currentCount = counts[category] || 0;
            const needed = this.config.minClipsPerCategory - currentCount;
            const toGenerate = Math.min(needed, this.config.maxClipsPerSessionPerCategory);
            
            console.log(`[ClipPoolManager] Categoría '${category}': ${currentCount} clips, necesita ${needed}, generando ${toGenerate}`);
            
            for (let i = 0; i < toGenerate; i++) {
                // Verificar horario en cada iteración
                if (this.scheduledTask && !this.isWithinSchedule()) {
                    console.log('[ClipPoolManager] Fuera del horario, deteniendo generación');
                    return;
                }
                
                try {
                    await this.generateClipForCategory(category);
                    console.log(`[ClipPoolManager] Clip ${i + 1}/${toGenerate} generado para '${category}'`);
                } catch (error) {
                    console.error(`[ClipPoolManager] Error generando clip para '${category}':`, error);
                    // Continuar con el siguiente clip en caso de error
                }
                
                // Pequeña pausa entre generaciones para no sobrecargar
                await this.sleep(2000);
            }
        }
    }

    /**
     * Genera un clip para una categoría específica.
     * Selecciona un prompt aleatorio de la categoría y genera con ComfyUI.
     * @param category Categoría para la cual generar
     * @see Requirements 10.4, 10.6
     */
    private async generateClipForCategory(category: ClipCategory): Promise<void> {
        if (!this.comfyClient) {
            throw new Error('Cliente ComfyUI no configurado');
        }
        
        // Seleccionar prompt aleatorio de la categoría
        const prompts = CATEGORY_PROMPTS[category];
        const promptData = prompts[Math.floor(Math.random() * prompts.length)];
        
        // Obtener configuración de modelo y estilo
        const modelConfig = ModelConfig.getInstance();
        const resolution = modelConfig.getResolution('short'); // Por defecto generamos shorts
        const styleParams = modelConfig.getStyleParams(promptData.style);
        
        // Añadir sufijo de estilo al prompt
        const fullPrompt = `${promptData.prompt}, ${styleParams.promptSuffix}`;
        
        console.log(`[ClipPoolManager] Generando clip: ${fullPrompt.substring(0, 60)}...`);
        
        // Generar con ComfyUI
        // generateT2V lanza excepción si falla, así que el resultado siempre tiene outputPath válido
        const result = await this.comfyClient.generateT2V({
            prompt: fullPrompt,
            negativePrompt: 'blurry, low quality, distorted, text, watermark, ugly, deformed, shaky camera',
            width: resolution.width,
            height: resolution.height,
            frames: styleParams.frames,
            steps: 20,
            cfg: 5.0
        });
        
        // Verificar que el archivo de salida existe
        if (!result.outputPath || !fs.existsSync(result.outputPath)) {
            throw new Error('No se generó archivo de salida');
        }
        
        // Copiar al directorio del pool con nombre descriptivo
        const timestamp = Date.now();
        const extension = path.extname(result.outputPath);
        const filename = `${category}_${timestamp}${extension}`;
        const destPath = path.join(this.config.poolDirectory, filename);
        
        fs.copyFileSync(result.outputPath, destPath);
        
        // Registrar en base de datos (Req 10.6)
        const clipData: ClipInsert = {
            filepath: destPath,
            prompt: fullPrompt,
            negativePrompt: 'blurry, low quality, distorted, text, watermark, ugly, deformed, shaky camera',
            modelUsed: modelConfig.getConfig().modelType,
            visualStyle: promptData.style,
            generationTimeSeconds: result.generationTimeSeconds,
            category,
            tags: this.extractTags(fullPrompt, category),
            resolution: `${resolution.width}x${resolution.height}`,
            frames: styleParams.frames,
            durationSeconds: styleParams.frames / 24, // Asumiendo 24 FPS
            videoType: 'short'
        };
        
        const clipId = this.database.insertClip(clipData);
        console.log(`[ClipPoolManager] Clip registrado: ${clipId} (${filename})`)
    }

    /**
     * Extrae tags del prompt y categoría para búsqueda.
     * @param prompt Prompt usado para generar
     * @param category Categoría del clip
     * @returns Array de tags extraídos
     */
    private extractTags(prompt: string, category: ClipCategory): string[] {
        const tags: string[] = [category];
        
        // Palabras clave relevantes para búsqueda
        const keywords = [
            'forest', 'ocean', 'mountain', 'rain', 'sunset', 'night', 'city',
            'coffee', 'office', 'book', 'tech', 'data', 'holographic', 'abstract',
            'gradient', 'particle', 'geometric', 'cozy', 'warm', 'calm', 'peaceful',
            'neon', 'liminal', 'corridor', 'urban', 'street', 'lo-fi', 'lofi'
        ];
        
        const promptLower = prompt.toLowerCase();
        for (const keyword of keywords) {
            if (promptLower.includes(keyword) && !tags.includes(keyword)) {
                tags.push(keyword);
            }
        }
        
        return tags.slice(0, 10); // Limitar a 10 tags
    }

    /**
     * Obtiene categorías que tienen menos clips que el mínimo configurado.
     * @returns Lista de categorías con bajo nivel
     * @see Requirement 10.5
     */
    private async getLowCategories(): Promise<ClipCategory[]> {
        const counts = this.database.countByCategory();
        return CLIP_CATEGORIES.filter(cat => (counts[cat] || 0) < this.config.minClipsPerCategory);
    }

    /**
     * Utilidad para pausar ejecución.
     * @param ms Milisegundos a esperar
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================================================
    // SELECCIÓN DE CLIPS (Tarea 8.2)
    // ========================================================================

    /**
     * Obtiene un clip del pool que coincida con la solicitud.
     * Implementa la lógica de selección inteligente evitando repeticiones.
     * @param category Categoría del clip deseado
     * @param keywords Keywords para matching adicional
     * @returns Clip seleccionado o null si no hay disponible
     * @see Requirements 11.1, 11.2, 11.3, 11.6, 11.7
     */
    public async getClip(category: ClipCategory, keywords: string[]): Promise<Clip | null> {
        // Obtener clips de la categoría ordenados por menor uso (Req 11.2)
        const clips = this.database.getClipsByCategory(category, 'least_used');
        
        if (clips.length === 0) {
            console.log(`[ClipPoolManager] No hay clips disponibles en categoría '${category}'`);
            return null;
        }
        
        for (const clip of clips) {
            // Verificar uso reciente - evitar clips usados en últimos 7 días (Req 11.3)
            if (this.database.wasUsedInLastDays(clip.id, this.config.recentUseDays)) {
                continue;
            }
            
            // Verificar si debe retirarse (Req 11.7)
            if (clip.timesUsed >= this.config.maxUsesBeforeRetire) {
                console.log(`[ClipPoolManager] Clip ${clip.id} retirado por exceso de uso (${clip.timesUsed} usos)`);
                this.database.retireClip(clip.id);
                continue;
            }
            
            // Verificar coincidencia de keywords si se especificaron
            if (keywords.length > 0) {
                const matchesKeywords = this.matchesKeywords(clip, keywords);
                if (!matchesKeywords) {
                    continue;
                }
            }
            
            console.log(`[ClipPoolManager] Clip seleccionado: ${clip.id} (${clip.timesUsed} usos previos)`);
            return clip;
        }
        
        // Si no encontramos clip con keywords, intentar sin keywords
        if (keywords.length > 0) {
            console.log(`[ClipPoolManager] No hay clips que coincidan con keywords, buscando sin filtro`);
            return this.getClip(category, []);
        }
        
        console.log(`[ClipPoolManager] No hay clips disponibles que cumplan criterios en '${category}'`);
        return null;
    }

    /**
     * Verifica si un clip coincide con los keywords dados.
     * Busca en prompt y tags del clip.
     * @param clip Clip a verificar
     * @param keywords Keywords a buscar
     * @returns true si hay coincidencia
     */
    private matchesKeywords(clip: Clip, keywords: string[]): boolean {
        const promptLower = clip.prompt.toLowerCase();
        const tagsLower = clip.tags.map(t => t.toLowerCase());
        
        return keywords.some(kw => {
            const kwLower = kw.toLowerCase();
            return promptLower.includes(kwLower) || tagsLower.some(tag => tag.includes(kwLower));
        });
    }

    // ========================================================================
    // LÓGICA DE PRIORIZACIÓN (Tarea 8.3)
    // ========================================================================

    /**
     * Indica si se debe priorizar reuso sobre generación nueva.
     * Retorna true si el pool tiene más de 200 clips activos.
     * @returns true si debe priorizar reuso
     * @see Requirement 11.4
     */
    public shouldPrioritizeReuse(): boolean {
        const stats = this.database.getStatistics();
        const activeClips = stats.clipsByStatus.active || 0;
        const shouldReuse = activeClips > this.config.reuseThreshold;
        
        if (shouldReuse) {
            console.log(`[ClipPoolManager] Priorizando reuso (${activeClips} clips activos > ${this.config.reuseThreshold})`);
        }
        
        return shouldReuse;
    }

    /**
     * Indica si se debe priorizar generación nueva sobre reuso.
     * Retorna true si el pool tiene menos de 50 clips activos.
     * @returns true si debe priorizar generación
     * @see Requirement 11.5
     */
    public shouldPrioritizeGeneration(): boolean {
        const stats = this.database.getStatistics();
        const activeClips = stats.clipsByStatus.active || 0;
        const shouldGenerate = activeClips < this.config.generateThreshold;
        
        if (shouldGenerate) {
            console.log(`[ClipPoolManager] Priorizando generación (${activeClips} clips activos < ${this.config.generateThreshold})`);
        }
        
        return shouldGenerate;
    }

    // ========================================================================
    // TRACKING DE USO
    // ========================================================================

    /**
     * Registra el uso de un clip.
     * Incrementa contador y registra en historial de uso.
     * @param clipId ID del clip usado
     * @param videoId ID del video donde se usó
     * @param videoType Tipo de video (short/long)
     * @param segmentType Tipo de segmento (key/filler)
     * @param platform Plataforma de publicación (opcional)
     * @see Requirement 11.6
     */
    public recordUsage(
        clipId: string, 
        videoId: string, 
        videoType: 'short' | 'long', 
        segmentType: 'key' | 'filler', 
        platform?: string
    ): void {
        this.database.recordUsage({
            clipId,
            videoId,
            videoType,
            segmentType,
            platform
        });
        
        // Verificar si el clip debe retirarse después del uso
        const clip = this.database.getClip(clipId);
        if (clip && clip.timesUsed >= this.config.maxUsesBeforeRetire) {
            console.log(`[ClipPoolManager] Clip ${clipId} alcanzó ${clip.timesUsed} usos, retirando`);
            this.database.retireClip(clipId);
        }
    }

    // ========================================================================
    // ESTADÍSTICAS
    // ========================================================================

    /**
     * Obtiene estadísticas completas del pool.
     * @returns Estadísticas del pool incluyendo categorías con bajo nivel
     */
    public async getStatistics(): Promise<PoolStatistics> {
        const dbStats = this.database.getStatistics();
        const lowCategories = await this.getLowCategories();
        
        return {
            totalClips: dbStats.totalClips,
            clipsByCategory: dbStats.clipsByCategory,
            activeClips: dbStats.clipsByStatus.active || 0,
            retiredClips: dbStats.clipsByStatus.retired || 0,
            lowCategories
        };
    }

    // ========================================================================
    // CONFIGURACIÓN
    // ========================================================================

    /**
     * Establece el cliente ComfyUI para generación.
     * @param client Instancia de ComfyUIClient
     */
    public setComfyClient(client: ComfyUIClient): void {
        this.comfyClient = client;
        console.log('[ClipPoolManager] Cliente ComfyUI configurado');
    }

    /**
     * Obtiene la configuración actual.
     * @returns Copia de la configuración actual
     */
    public getConfig(): ClipPoolManagerConfig {
        return { ...this.config };
    }

    /**
     * Verifica si hay una sesión de generación en progreso.
     * @returns true si hay generación en progreso
     */
    public isGeneratingClips(): boolean {
        return this.isGenerating;
    }

    /**
     * Verifica si el scheduler está activo.
     * @returns true si el scheduler está corriendo
     */
    public isSchedulerRunning(): boolean {
        return this.scheduledTask !== null;
    }
}
