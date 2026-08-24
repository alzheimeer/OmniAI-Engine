/**
 * ScriptHumanizerIntegration.ts - Integración ScriptStructureRandomizer → ScriptHumanizer
 * REQ-2.7.7: Integrar con ScriptHumanizer para aplicar estructura antes de humanización.
 * 
 * FLUJO DE PROCESAMIENTO:
 * raw script → ScriptStructureRandomizer.applyStructure() → ScriptHumanizer.humanize() → script final
 * 
 * NOTA: ScriptHumanizer se implementará en tareas 7.1-7.5. Este módulo prepara la integración.
 */

import {
    ScriptStructureRandomizer,
    StructureConfig,
    StructuredScript,
    NarrativeStructure,
    CTAPosition,
    KeywordDensity,
    StructureUsageRecord
} from './ScriptStructureRandomizer';

// ===== INTERFACES PARA ScriptHumanizer (a implementar en Task 7) =====

/**
 * Idiomas soportados para humanización
 * REQ-2.1.2: Muletillas por idioma ES, EN, PT
 */
export type SupportedLanguage = 'es' | 'en' | 'pt';

/**
 * Tipos de ganchos emocionales rotativos
 * REQ-2.1.6: Ganchos emocionales rotativos: curiosidad, FOMO, controversia
 */
export type EmotionalHook = 'curiosity' | 'fomo' | 'controversy' | 'empathy' | 'surprise';

/**
 * Configuración para humanización de guiones
 * REQ-2.1: Humanización de Guiones
 */
export interface HumanizationConfig {
    /** Idioma del guión */
    language: SupportedLanguage;
    
    /** Nivel de muletillas a insertar (REQ-2.1.2) */
    fillerLevel: 'minimal' | 'moderate' | 'natural';
    
    /** Si incluir autocorrecciones naturales (REQ-2.1.3) */
    includeAutoCorrections: boolean;
    
    /** Si incluir marcadores de pausa (REQ-2.1.4) */
    includePauseMarkers: boolean;
    
    /** Si incluir preguntas retóricas (REQ-2.1.5) */
    includeRhetoricalQuestions: boolean;
    
    /** Tipo de gancho emocional a usar (REQ-2.1.6) */
    emotionalHook: EmotionalHook;
}

/**
 * Resultado de la humanización
 */
export interface HumanizedScript {
    /** Script original antes de humanizar */
    originalScript: string;
    
    /** Script humanizado */
    humanizedScript: string;
    
    /** Configuración aplicada */
    config: HumanizationConfig;
    
    /** Estadísticas de humanización */
    stats: {
        fillersAdded: number;
        autoCorrectionsAdded: number;
        pauseMarkersAdded: number;
        rhetoricalQuestionsAdded: number;
    };
}

/**
 * Interface para ScriptHumanizer (a implementar en Task 7)
 * REQ-2.1.1: Crear ScriptHumanizer.ts que post-procese guiones
 */
export interface IScriptHumanizer {
    /**
     * Humaniza un guión estructurado
     * @param script - Guión ya estructurado por ScriptStructureRandomizer
     * @param config - Configuración de humanización
     */
    humanize(script: string, config: HumanizationConfig): Promise<HumanizedScript>;
    
    /**
     * Genera configuración de humanización aleatoria
     * @param language - Idioma del guión
     */
    generateRandomConfig(language: SupportedLanguage): HumanizationConfig;
}

// ===== CONFIGURACIÓN DE INTEGRACIÓN =====

/**
 * Configuración completa del pipeline de procesamiento de guiones
 */
export interface ScriptProcessingConfig {
    /** Configuración de estructura narrativa */
    structure: StructureConfig;
    
    /** Configuración de humanización (opcional hasta que exista ScriptHumanizer) */
    humanization?: HumanizationConfig;
    
    /** Keywords para ajuste de densidad */
    keywords?: string[];
    
    /** Metadata del video para tracking */
    videoMetadata?: {
        videoId: string;
        channelId: string;
    };
}

/**
 * Resultado completo del procesamiento de guiones
 */
export interface ProcessedScript {
    /** Script original sin procesar */
    rawScript: string;
    
    /** Script después de aplicar estructura */
    structuredScript: StructuredScript;
    
    /** Script después de humanización (null si humanizer no disponible) */
    humanizedScript: HumanizedScript | null;
    
    /** Script final listo para TTS */
    finalScript: string;
    
    /** Registro de uso para SQLite */
    usageRecord?: StructureUsageRecord;
    
    /** Timestamp de procesamiento */
    processedAt: Date;
}

// ===== CLASE PRINCIPAL DE INTEGRACIÓN =====

/**
 * ScriptProcessingPipeline - Orquesta el flujo completo de procesamiento de guiones
 * 
 * FLUJO:
 * 1. raw script → ScriptStructureRandomizer.applyStructure() (estructura narrativa)
 * 2. structured script → ScriptHumanizer.humanize() (humanización IA)
 * 3. humanized script → script final listo para TTS
 */
export class ScriptProcessingPipeline {
    private humanizer: IScriptHumanizer | null = null;
    private recentStructures: NarrativeStructure[] = [];
    
    /**
     * Configura el humanizer cuando esté disponible (Task 7)
     * @param humanizer - Instancia de ScriptHumanizer
     */
    public setHumanizer(humanizer: IScriptHumanizer): void {
        this.humanizer = humanizer;
    }
    
    /**
     * Verifica si el humanizer está configurado
     */
    public isHumanizerAvailable(): boolean {
        return this.humanizer !== null;
    }
    
    /**
     * Procesa un guión completo: estructura → humanización → final
     * REQ-2.7.7: Estructura ANTES de humanización
     * 
     * @param rawScript - Guión raw generado por DeepSeek
     * @param config - Configuración completa de procesamiento
     */
    public async processScript(
        rawScript: string,
        config: ScriptProcessingConfig
    ): Promise<ProcessedScript> {
        // ===== PASO 1: Aplicar estructura narrativa =====
        // ScriptStructureRandomizer aplica la estructura PRIMERO
        const structuredScript = ScriptStructureRandomizer.applyStructure(
            rawScript,
            config.structure
        );
        
        // Ajustar densidad de keywords si se proporcionan
        let processedText = structuredScript.structuredScript;
        if (config.keywords && config.keywords.length > 0) {
            processedText = ScriptStructureRandomizer.adjustKeywordDensity(
                processedText,
                config.keywords,
                config.structure.keywordDensity
            );
        }
        
        // Actualizar script estructurado con keywords ajustados
        const finalStructured: StructuredScript = {
            ...structuredScript,
            structuredScript: processedText
        };
        
        // ===== PASO 2: Humanización (si está disponible) =====
        let humanizedResult: HumanizedScript | null = null;
        
        if (this.humanizer && config.humanization) {
            // ScriptHumanizer procesa el script YA estructurado
            humanizedResult = await this.humanizer.humanize(
                processedText,
                config.humanization
            );
            processedText = humanizedResult.humanizedScript;
        }
        
        // ===== PASO 3: Tracking y resultado =====
        // Actualizar historial de estructuras recientes
        this.recentStructures.unshift(config.structure.structure);
        if (this.recentStructures.length > 10) {
            this.recentStructures = this.recentStructures.slice(0, 10);
        }
        
        // Crear registro de uso si hay metadata
        let usageRecord: StructureUsageRecord | undefined;
        if (config.videoMetadata) {
            usageRecord = ScriptStructureRandomizer.createUsageRecord(
                config.videoMetadata.videoId,
                config.videoMetadata.channelId,
                config.structure
            );
        }
        
        return {
            rawScript,
            structuredScript: finalStructured,
            humanizedScript: humanizedResult,
            finalScript: processedText,
            usageRecord,
            processedAt: new Date()
        };
    }
    
    /**
     * Genera configuración automática para el pipeline
     * Evita repetición de estructuras en los últimos 3 videos
     * 
     * @param language - Idioma del guión
     * @param seed - Semilla opcional para reproducibilidad
     */
    public generateAutoConfig(
        language: SupportedLanguage = 'es',
        seed?: number
    ): ScriptProcessingConfig {
        // Configuración de estructura evitando repetición
        const structureConfig = ScriptStructureRandomizer.generateRandomConfig(
            this.recentStructures,
            seed
        );
        
        // Configuración de humanización (preparada para Task 7)
        const humanizationConfig: HumanizationConfig = {
            language,
            fillerLevel: 'moderate',
            includeAutoCorrections: true,
            includePauseMarkers: true,
            includeRhetoricalQuestions: true,
            emotionalHook: this.selectRandomHook(seed)
        };
        
        return {
            structure: structureConfig,
            humanization: humanizationConfig
        };
    }
    
    /**
     * Obtiene las estructuras usadas recientemente
     * Útil para verificar que no hay repetición
     */
    public getRecentStructures(): NarrativeStructure[] {
        return [...this.recentStructures];
    }
    
    /**
     * Limpia el historial de estructuras recientes
     */
    public clearRecentStructures(): void {
        this.recentStructures = [];
    }
    
    /**
     * Verifica si la configuración actual evitaría repetición
     * @param structure - Estructura a verificar
     */
    public wouldRepeat(structure: NarrativeStructure): boolean {
        return ScriptStructureRandomizer.detectRepetition([
            structure,
            ...this.recentStructures
        ]);
    }
    
    // ===== MÉTODOS PRIVADOS =====
    
    /**
     * Selecciona un gancho emocional aleatorio
     */
    private selectRandomHook(seed?: number): EmotionalHook {
        const hooks: EmotionalHook[] = [
            'curiosity', 'fomo', 'controversy', 'empathy', 'surprise'
        ];
        
        const random = seed !== undefined
            ? this.seededRandom(seed)
            : Math.random();
        
        return hooks[Math.floor(random * hooks.length)];
    }
    
    /**
     * Generador de números aleatorios con semilla
     */
    private seededRandom(seed: number): number {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
}

// ===== FUNCIONES DE CONVENIENCIA =====

/**
 * Instancia singleton del pipeline para uso global
 */
let pipelineInstance: ScriptProcessingPipeline | null = null;

/**
 * Obtiene la instancia global del pipeline
 */
export function getScriptPipeline(): ScriptProcessingPipeline {
    if (!pipelineInstance) {
        pipelineInstance = new ScriptProcessingPipeline();
    }
    return pipelineInstance;
}

/**
 * Procesa un guión con configuración automática (función de conveniencia)
 * 
 * @param rawScript - Guión raw
 * @param language - Idioma del guión
 * @param videoMetadata - Metadata opcional del video
 */
export async function processScriptAuto(
    rawScript: string,
    language: SupportedLanguage = 'es',
    videoMetadata?: { videoId: string; channelId: string }
): Promise<ProcessedScript> {
    const pipeline = getScriptPipeline();
    const config = pipeline.generateAutoConfig(language);
    
    if (videoMetadata) {
        config.videoMetadata = videoMetadata;
    }
    
    return pipeline.processScript(rawScript, config);
}

/**
 * Aplica solo estructura sin humanización (útil antes de Task 7)
 * 
 * @param rawScript - Guión raw
 * @param structureConfig - Configuración de estructura opcional
 */
export function applyStructureOnly(
    rawScript: string,
    structureConfig?: Partial<StructureConfig>
): StructuredScript {
    const pipeline = getScriptPipeline();
    const defaultConfig = pipeline.generateAutoConfig();
    
    const finalConfig: StructureConfig = {
        ...defaultConfig.structure,
        ...structureConfig
    };
    
    return ScriptStructureRandomizer.applyStructure(rawScript, finalConfig);
}

/**
 * Registra uso de estructura en el tracking del pipeline
 * (Para sincronizar con usos externos)
 * 
 * @param structure - Estructura usada
 */
export function registerStructureUsage(structure: NarrativeStructure): void {
    const pipeline = getScriptPipeline();
    // Accedemos internamente para registrar
    const recent = pipeline.getRecentStructures();
    recent.unshift(structure);
}

// ===== EXPORTACIONES =====

export {
    ScriptStructureRandomizer,
    StructureConfig,
    StructuredScript,
    NarrativeStructure,
    CTAPosition,
    KeywordDensity,
    StructureUsageRecord
} from './ScriptStructureRandomizer';
