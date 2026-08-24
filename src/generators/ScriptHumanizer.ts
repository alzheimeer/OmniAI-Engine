/**
 * ScriptHumanizer.ts - Sistema de humanización de guiones generados por IA
 * REQ-2.1.1: Crear ScriptHumanizer.ts que post-procese guiones generados por DeepSeek
 * 
 * Este módulo transforma guiones de IA para que suenen más naturales al hablar,
 * agregando muletillas, pausas, autocorrecciones y ganchos emocionales.
 * 
 * FLUJO: ScriptStructureRandomizer.applyStructure() → ScriptHumanizer.humanize() → script final
 */

import {
    IScriptHumanizer,
    HumanizationConfig,
    HumanizedScript,
    SupportedLanguage,
    EmotionalHook
} from './ScriptHumanizerIntegration';

// ===== INTERFACES =====

/**
 * Configuración del humanizador por idioma
 */
export interface LanguageHumanizationConfig {
    /** Muletillas naturales del idioma (REQ-2.1.2) */
    fillers: string[];
    
    /** Frases de autocorrección (REQ-2.1.3) */
    autoCorrections: string[];
    
    /** Marcadores de pausa (REQ-2.1.4) */
    pauseMarkers: string[];
    
    /** Preguntas retóricas para conexión emocional (REQ-2.1.5) */
    rhetoricalQuestions: string[];
    
    /** Micro-anécdotas para conexión emocional */
    microAnecdotes: string[];
}

/**
 * Resultado interno del proceso de humanización con métricas detalladas
 */
export interface HumanizerResult {
    /** Script humanizado */
    humanizedScript: string;
    
    /** Estadísticas de transformaciones aplicadas */
    stats: {
        fillersAdded: number;
        autoCorrectionsAdded: number;
        pauseMarkersAdded: number;
        rhetoricalQuestionsAdded: number;
    };
    
    /** Idioma procesado */
    language: SupportedLanguage;
}

// ===== CONSTANTES DE HUMANIZACIÓN POR IDIOMA =====

/**
 * Muletillas naturales por idioma (REQ-2.1.2)
 * ES: "o sea", "bueno", "mira", "sabes", "pues"
 * EN: "you know", "like", "actually", "basically", "so"
 * PT: "tipo", "né", "olha", "sabe", "então"
 */
export const LANGUAGE_FILLERS: Record<SupportedLanguage, string[]> = {
    es: ['o sea', 'bueno', 'mira', 'sabes', 'pues', 'digamos', 'vamos', 'claro'],
    en: ['you know', 'like', 'actually', 'basically', 'so', 'well', 'I mean', 'right'],
    pt: ['tipo', 'né', 'olha', 'sabe', 'então', 'bom', 'assim', 'enfim']
};

/**
 * Autocorrecciones naturales (REQ-2.1.3)
 * Frases que simulan correcciones espontáneas al hablar
 */
export const LANGUAGE_AUTO_CORRECTIONS: Record<SupportedLanguage, string[]> = {
    es: [
        'Es decir... no, mejor dicho...',
        'O mejor dicho...',
        'Bueno, en realidad lo que quiero decir es...',
        'Perdón, me explico mejor...',
        'A ver, déjame reformularlo...'
    ],
    en: [
        'I mean... actually, let me rephrase that...',
        'Well, what I really mean is...',
        'Sorry, let me put it this way...',
        'Or rather...',
        'Actually, scratch that...'
    ],
    pt: [
        'Quer dizer... na verdade...',
        'Ou melhor dizendo...',
        'Deixa eu reformular...',
        'O que eu quero dizer é...',
        'Melhor ainda...'
    ]
};

/**
 * Marcadores de pausa para TTS (REQ-2.1.4)
 */
export const LANGUAGE_PAUSE_MARKERS: Record<SupportedLanguage, string[]> = {
    es: ['...', '(pausa)', '—', 'Hmm...', 'A ver...'],
    en: ['...', '(pause)', '—', 'Hmm...', 'Let me think...'],
    pt: ['...', '(pausa)', '—', 'Hmm...', 'Deixa ver...']
};

/**
 * Preguntas retóricas para conexión emocional (REQ-2.1.5)
 */
export const LANGUAGE_RHETORICAL_QUESTIONS: Record<SupportedLanguage, string[]> = {
    es: [
        '¿Te ha pasado alguna vez?',
        '¿Tiene sentido, verdad?',
        '¿No te parece increíble?',
        '¿Alguna vez te has preguntado...?',
        '¿Y sabes qué es lo mejor?'
    ],
    en: [
        'Has this ever happened to you?',
        'Makes sense, right?',
        'Isn\'t that amazing?',
        'Have you ever wondered...?',
        'And you know what\'s the best part?'
    ],
    pt: [
        'Já aconteceu com você?',
        'Faz sentido, né?',
        'Não é incrível?',
        'Você já se perguntou...?',
        'E sabe qual é a melhor parte?'
    ]
};

/**
 * Micro-anécdotas para conexión emocional (REQ-2.1.5)
 */
export const LANGUAGE_MICRO_ANECDOTES: Record<SupportedLanguage, string[]> = {
    es: [
        'Te cuento algo curioso...',
        'Mira, yo antes pensaba lo mismo...',
        'Un amigo me dijo una vez...',
        'La primera vez que descubrí esto...',
        'Hace poco leí que...'
    ],
    en: [
        'Let me tell you something interesting...',
        'I used to think the same thing...',
        'A friend once told me...',
        'The first time I discovered this...',
        'I recently read that...'
    ],
    pt: [
        'Deixa eu te contar uma coisa...',
        'Olha, eu costumava pensar assim...',
        'Um amigo me disse uma vez...',
        'A primeira vez que descobri isso...',
        'Li recentemente que...'
    ]
};

/**
 * Ganchos emocionales rotativos (REQ-2.1.6)
 * Patrones para diferentes tipos de engagement emocional
 */
export const EMOTIONAL_HOOKS: Record<EmotionalHook, Record<SupportedLanguage, string[]>> = {
    curiosity: {
        es: ['Lo que viene te va a sorprender...', '¿Quieres saber el secreto?', 'Esto pocos lo saben...'],
        en: ['What comes next will surprise you...', 'Want to know the secret?', 'Few people know this...'],
        pt: ['O que vem agora vai te surpreender...', 'Quer saber o segredo?', 'Pouca gente sabe disso...']
    },
    fomo: {
        es: ['No puedes perderte esto...', 'Si no actúas ahora...', 'Esta oportunidad no durará...'],
        en: ['You can\'t miss this...', 'If you don\'t act now...', 'This opportunity won\'t last...'],
        pt: ['Você não pode perder isso...', 'Se não agir agora...', 'Essa oportunidade não vai durar...']
    },
    controversy: {
        es: ['Esto va a generar debate...', 'Muchos no estarán de acuerdo, pero...', 'La verdad incómoda es que...'],
        en: ['This will spark debate...', 'Many will disagree, but...', 'The uncomfortable truth is...'],
        pt: ['Isso vai gerar debate...', 'Muitos não vão concordar, mas...', 'A verdade desconfortável é que...']
    },
    empathy: {
        es: ['Sé exactamente cómo te sientes...', 'Todos hemos pasado por esto...', 'No estás solo en esto...'],
        en: ['I know exactly how you feel...', 'We\'ve all been there...', 'You\'re not alone in this...'],
        pt: ['Sei exatamente como você se sente...', 'Todos já passamos por isso...', 'Você não está sozinho nisso...']
    },
    surprise: {
        es: ['¡No vas a creer lo que viene!', 'Prepárate para esto...', '¡Esto me dejó sin palabras!'],
        en: ['You won\'t believe what\'s coming!', 'Get ready for this...', 'This left me speechless!'],
        pt: ['Você não vai acreditar!', 'Se prepare para isso...', 'Isso me deixou sem palavras!']
    }
};

// ===== CLASE PRINCIPAL =====

/**
 * ScriptHumanizer - Humaniza guiones generados por IA
 * REQ-2.1.1: Sistema de post-procesamiento para guiones de DeepSeek
 * 
 * Implementa IScriptHumanizer para integración con ScriptProcessingPipeline
 */
export class ScriptHumanizer implements IScriptHumanizer {
    private recentHooks: EmotionalHook[] = [];
    
    /**
     * Humaniza un guión estructurado aplicando elementos naturales
     * @param script - Guión ya estructurado por ScriptStructureRandomizer
     * @param config - Configuración de humanización
     * @returns Script humanizado con estadísticas
     */
    public async humanize(script: string, config: HumanizationConfig): Promise<HumanizedScript> {
        const result = this.processHumanization(script, config);
        
        return {
            originalScript: script,
            humanizedScript: result.humanizedScript,
            config,
            stats: result.stats
        };
    }
    
    /**
     * Genera configuración de humanización aleatoria para un idioma
     * @param language - Idioma del guión
     * @returns Configuración de humanización
     */
    public generateRandomConfig(language: SupportedLanguage): HumanizationConfig {
        const fillerLevels: Array<'minimal' | 'moderate' | 'natural'> = ['minimal', 'moderate', 'natural'];
        const hooks: EmotionalHook[] = ['curiosity', 'fomo', 'controversy', 'empathy', 'surprise'];
        
        return {
            language,
            fillerLevel: fillerLevels[Math.floor(Math.random() * fillerLevels.length)],
            includeAutoCorrections: Math.random() > 0.3, // 70% de probabilidad
            includePauseMarkers: Math.random() > 0.2,    // 80% de probabilidad
            includeRhetoricalQuestions: Math.random() > 0.4, // 60% de probabilidad
            emotionalHook: this.selectHookAvoidingRepetition(hooks)
        };
    }
    
    /**
     * Obtiene la configuración de humanización completa para un idioma
     * @param language - Idioma
     * @returns Configuración completa del idioma
     */
    public static getLanguageConfig(language: SupportedLanguage): LanguageHumanizationConfig {
        return {
            fillers: LANGUAGE_FILLERS[language],
            autoCorrections: LANGUAGE_AUTO_CORRECTIONS[language],
            pauseMarkers: LANGUAGE_PAUSE_MARKERS[language],
            rhetoricalQuestions: LANGUAGE_RHETORICAL_QUESTIONS[language],
            microAnecdotes: LANGUAGE_MICRO_ANECDOTES[language]
        };
    }
    
    // ===== MÉTODOS PRIVADOS =====
    
    /**
     * Proceso interno de humanización
     */
    private processHumanization(script: string, config: HumanizationConfig): HumanizerResult {
        let humanizedScript = script;
        const stats = {
            fillersAdded: 0,
            autoCorrectionsAdded: 0,
            pauseMarkersAdded: 0,
            rhetoricalQuestionsAdded: 0
        };
        
        // 1. Añadir muletillas según nivel (REQ-2.1.2)
        const fillerResult = this.addFillers(humanizedScript, config.language, config.fillerLevel);
        humanizedScript = fillerResult.text;
        stats.fillersAdded = fillerResult.count;
        
        // 2. Añadir autocorrecciones si están habilitadas (REQ-2.1.3)
        if (config.includeAutoCorrections) {
            const correctionResult = this.addAutoCorrections(humanizedScript, config.language);
            humanizedScript = correctionResult.text;
            stats.autoCorrectionsAdded = correctionResult.count;
        }
        
        // 3. Añadir marcadores de pausa (REQ-2.1.4)
        if (config.includePauseMarkers) {
            const pauseResult = this.addPauseMarkers(humanizedScript, config.language);
            humanizedScript = pauseResult.text;
            stats.pauseMarkersAdded = pauseResult.count;
        }
        
        // 4. Añadir preguntas retóricas (REQ-2.1.5)
        if (config.includeRhetoricalQuestions) {
            const questionResult = this.addRhetoricalQuestions(humanizedScript, config.language);
            humanizedScript = questionResult.text;
            stats.rhetoricalQuestionsAdded = questionResult.count;
        }
        
        // 5. Insertar gancho emocional (REQ-2.1.6)
        humanizedScript = this.insertEmotionalHook(humanizedScript, config.language, config.emotionalHook);
        
        return {
            humanizedScript,
            stats,
            language: config.language
        };
    }
    
    /**
     * Añade muletillas naturales al texto (REQ-2.1.2)
     * @param text - Texto a procesar
     * @param language - Idioma
     * @param level - Nivel de muletillas: minimal (1-2), moderate (3-4), natural (5-7)
     */
    private addFillers(
        text: string,
        language: SupportedLanguage,
        level: 'minimal' | 'moderate' | 'natural'
    ): { text: string; count: number } {
        const fillers = LANGUAGE_FILLERS[language];
        const sentences = this.splitSentences(text);
        
        // Determinar cantidad de muletillas según nivel
        const targetCount = level === 'minimal' ? 2 : level === 'moderate' ? 4 : 6;
        const interval = Math.max(1, Math.floor(sentences.length / targetCount));
        
        let count = 0;
        const processed = sentences.map((sentence, index) => {
            // Insertar muletilla cada N oraciones
            if (index > 0 && index % interval === 0 && count < targetCount) {
                const filler = fillers[Math.floor(Math.random() * fillers.length)];
                count++;
                // Capitalizar si está al inicio
                const capitalizedFiller = filler.charAt(0).toUpperCase() + filler.slice(1);
                return `${capitalizedFiller}, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
            }
            return sentence;
        });
        
        return { text: processed.join(' '), count };
    }
    
    /**
     * Añade autocorrecciones naturales (REQ-2.1.3)
     * "Es decir... no, mejor dicho..."
     */
    private addAutoCorrections(
        text: string,
        language: SupportedLanguage
    ): { text: string; count: number } {
        const corrections = LANGUAGE_AUTO_CORRECTIONS[language];
        const sentences = this.splitSentences(text);
        
        // Añadir 1-2 autocorrecciones en el texto
        const targetCount = Math.min(2, Math.floor(sentences.length / 5));
        let count = 0;
        
        // Seleccionar posiciones aleatorias para insertar correcciones
        const positions = this.selectRandomPositions(sentences.length, targetCount, 3);
        
        const processed = sentences.map((sentence, index) => {
            if (positions.includes(index) && count < targetCount) {
                const correction = corrections[Math.floor(Math.random() * corrections.length)];
                count++;
                return `${correction} ${sentence}`;
            }
            return sentence;
        });
        
        return { text: processed.join(' '), count };
    }
    
    /**
     * Añade marcadores de pausa para TTS (REQ-2.1.4)
     */
    private addPauseMarkers(
        text: string,
        language: SupportedLanguage
    ): { text: string; count: number } {
        const pauseMarkers = LANGUAGE_PAUSE_MARKERS[language];
        let processedText = text;
        let count = 0;
        
        // Insertar pausas después de comas largas (simulando pensamiento)
        const commaPattern = /,\s+(?=[A-Za-záéíóúñ])/g;
        let match;
        const insertPositions: number[] = [];
        
        while ((match = commaPattern.exec(text)) !== null) {
            // 30% de probabilidad de insertar pausa después de una coma
            if (Math.random() < 0.3 && count < 3) {
                insertPositions.push(match.index);
                count++;
            }
        }
        
        // Insertar desde el final para no afectar los índices
        for (let i = insertPositions.length - 1; i >= 0; i--) {
            const pos = insertPositions[i];
            const marker = pauseMarkers[Math.floor(Math.random() * 2)]; // Solo ... y (pausa)
            processedText = processedText.slice(0, pos + 2) + marker + ' ' + processedText.slice(pos + 2);
        }
        
        return { text: processedText, count };
    }
    
    /**
     * Añade preguntas retóricas para conexión emocional (REQ-2.1.5)
     */
    private addRhetoricalQuestions(
        text: string,
        language: SupportedLanguage
    ): { text: string; count: number } {
        const questions = LANGUAGE_RHETORICAL_QUESTIONS[language];
        const sentences = this.splitSentences(text);
        
        // Añadir 1-2 preguntas retóricas
        const targetCount = Math.min(2, Math.floor(sentences.length / 4));
        let count = 0;
        
        // Seleccionar posiciones (después del primer tercio del texto)
        const startPos = Math.floor(sentences.length / 3);
        const positions = this.selectRandomPositions(
            sentences.length - startPos,
            targetCount,
            2
        ).map(p => p + startPos);
        
        const processed = sentences.map((sentence, index) => {
            if (positions.includes(index) && count < targetCount) {
                const question = questions[Math.floor(Math.random() * questions.length)];
                count++;
                return `${sentence} ${question}`;
            }
            return sentence;
        });
        
        return { text: processed.join(' '), count };
    }
    
    /**
     * Inserta gancho emocional rotativo (REQ-2.1.6)
     */
    private insertEmotionalHook(
        text: string,
        language: SupportedLanguage,
        hookType: EmotionalHook
    ): string {
        const hooks = EMOTIONAL_HOOKS[hookType][language];
        const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];
        
        // Registrar hook usado para evitar repetición
        this.recentHooks.unshift(hookType);
        if (this.recentHooks.length > 5) {
            this.recentHooks = this.recentHooks.slice(0, 5);
        }
        
        // Insertar hook cerca del inicio (después de la primera o segunda oración)
        const sentences = this.splitSentences(text);
        const insertPos = Math.min(2, sentences.length - 1);
        
        sentences.splice(insertPos, 0, selectedHook);
        
        return sentences.join(' ');
    }
    
    /**
     * Selecciona gancho evitando repetición de los últimos usados
     */
    private selectHookAvoidingRepetition(availableHooks: EmotionalHook[]): EmotionalHook {
        // Filtrar hooks usados recientemente
        const filtered = availableHooks.filter(hook => 
            !this.recentHooks.slice(0, 2).includes(hook)
        );
        
        const pool = filtered.length > 0 ? filtered : availableHooks;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    
    /**
     * Divide texto en oraciones
     */
    private splitSentences(text: string): string[] {
        return text
            .split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }
    
    /**
     * Selecciona posiciones aleatorias evitando adyacentes
     */
    private selectRandomPositions(total: number, count: number, minGap: number): number[] {
        const positions: number[] = [];
        const attempts = 50;
        let tried = 0;
        
        while (positions.length < count && tried < attempts) {
            const pos = Math.floor(Math.random() * total);
            const isFarEnough = positions.every(p => Math.abs(p - pos) >= minGap);
            
            if (isFarEnough && !positions.includes(pos)) {
                positions.push(pos);
            }
            tried++;
        }
        
        return positions.sort((a, b) => a - b);
    }
}

// ===== INSTANCIA SINGLETON =====

let humanizerInstance: ScriptHumanizer | null = null;

/**
 * Obtiene la instancia singleton del humanizador
 */
export function getScriptHumanizer(): ScriptHumanizer {
    if (!humanizerInstance) {
        humanizerInstance = new ScriptHumanizer();
    }
    return humanizerInstance;
}

/**
 * Humaniza un guión con configuración automática (función de conveniencia)
 * @param script - Guión a humanizar
 * @param language - Idioma del guión
 */
export async function humanizeScriptAuto(
    script: string,
    language: SupportedLanguage = 'es'
): Promise<HumanizedScript> {
    const humanizer = getScriptHumanizer();
    const config = humanizer.generateRandomConfig(language);
    return humanizer.humanize(script, config);
}

// ===== EXPORTACIONES =====

export type {
    SupportedLanguage,
    EmotionalHook,
    HumanizationConfig,
    HumanizedScript
} from './ScriptHumanizerIntegration';
