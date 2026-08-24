/**
 * ScriptStructureRandomizer.ts - Sistema de variabilidad estructural narrativa.
 * REQ-2.7.1: Crear ScriptStructureRandomizer.ts con 6+ estructuras narrativas rotables.
 * Aplica diferentes estructuras para evitar detección de patrones por YouTube.
 */

// ===== TIPOS =====
/** 6 estructuras narrativas: storytelling, inverted-list, rhetorical, debate, error-tutorial, case-study */
export type NarrativeStructure = 'storytelling' | 'inverted-list' | 'rhetorical' | 'debate' | 'error-tutorial' | 'case-study';
export const ALL_STRUCTURES: readonly NarrativeStructure[] = ['storytelling', 'inverted-list', 'rhetorical', 'debate', 'error-tutorial', 'case-study'] as const;
export type CTAPosition = 'start' | 'middle' | 'end';
export type KeywordDensity = 'low' | 'medium' | 'high';
export type TransitionType = 'smooth' | 'abrupt' | 'question' | 'callback' | 'teaser';
export type HookType = 'opening' | 'closing';

// ===== INTERFACES =====
export interface ScriptSection { name: string; purpose: string; relativeDuration: number; content: string; }
export interface HookConfig { type: HookType; content: string; relativeDuration: number; }
export interface NarrativeStructureDefinition { type: NarrativeStructure; sections: ScriptSection[]; transitions: TransitionType[]; hooks: HookConfig[]; }
export interface StructureConfig { structure: NarrativeStructure; sentenceLengthVariation: number; keywordDensity: KeywordDensity; ctaPosition: CTAPosition; }
export interface StructuredScript { originalScript: string; structuredScript: string; appliedStructure: NarrativeStructure; sentenceCount: number; avgSentenceLength: number; ctaPosition: CTAPosition; structureDefinition: NarrativeStructureDefinition; }
export interface StructureUsageRecord { id?: number; videoId: string; channelId: string; structure: NarrativeStructure; ctaPosition: CTAPosition; keywordDensity: KeywordDensity; createdAt: Date; }

// ===== CONSTANTES =====
export const MAX_CONSECUTIVE_SAME_STRUCTURE = 3;
export const KEYWORD_DENSITY_CONFIG: Record<KeywordDensity, { min: number; max: number }> = {
    low: { min: 0.01, max: 0.02 }, medium: { min: 0.02, max: 0.04 }, high: { min: 0.04, max: 0.06 }
};

/** Templates de estructura para cada tipo narrativo */
export const STRUCTURE_TEMPLATES: Record<NarrativeStructure, NarrativeStructureDefinition> = {
    'storytelling': {
        type: 'storytelling',
        sections: [
            { name: 'anecdote', purpose: 'Historia personal relatable', relativeDuration: 0.35, content: '' },
            { name: 'lesson', purpose: 'Lección derivada', relativeDuration: 0.35, content: '' },
            { name: 'application', purpose: 'Aplicación práctica', relativeDuration: 0.30, content: '' }
        ],
        transitions: ['smooth', 'callback'],
        hooks: [{ type: 'opening', content: '¿Te ha pasado que...?', relativeDuration: 0.05 }, { type: 'closing', content: 'Ahora sabes cómo...', relativeDuration: 0.05 }]
    },
    'inverted-list': {
        type: 'inverted-list',
        sections: [
            { name: 'conclusion', purpose: 'Conclusión impactante primero', relativeDuration: 0.20, content: '' },
            { name: 'evidence_1', purpose: 'Primera evidencia', relativeDuration: 0.25, content: '' },
            { name: 'evidence_2', purpose: 'Segunda evidencia', relativeDuration: 0.25, content: '' },
            { name: 'evidence_3', purpose: 'Tercera evidencia', relativeDuration: 0.30, content: '' }
        ],
        transitions: ['abrupt', 'smooth', 'smooth'],
        hooks: [{ type: 'opening', content: 'Esto cambiará tu perspectiva...', relativeDuration: 0.05 }, { type: 'closing', content: 'Y esa es la verdad que pocos conocen.', relativeDuration: 0.05 }]
    },
    'rhetorical': {
        type: 'rhetorical',
        sections: [
            { name: 'intriguing_question', purpose: 'Pregunta que despierta curiosidad', relativeDuration: 0.15, content: '' },
            { name: 'investigation', purpose: 'Exploración del tema', relativeDuration: 0.50, content: '' },
            { name: 'answer', purpose: 'Respuesta reveladora', relativeDuration: 0.35, content: '' }
        ],
        transitions: ['question', 'teaser'],
        hooks: [{ type: 'opening', content: '¿Alguna vez te has preguntado...?', relativeDuration: 0.05 }, { type: 'closing', content: 'Ahora ya lo sabes.', relativeDuration: 0.05 }]
    },
    'debate': {
        type: 'debate',
        sections: [
            { name: 'thesis', purpose: 'Tesis principal', relativeDuration: 0.30, content: '' },
            { name: 'antithesis', purpose: 'Argumentos contrarios', relativeDuration: 0.30, content: '' },
            { name: 'synthesis', purpose: 'Conclusión equilibrada', relativeDuration: 0.40, content: '' }
        ],
        transitions: ['abrupt', 'smooth'],
        hooks: [{ type: 'opening', content: 'Hay dos formas de ver esto...', relativeDuration: 0.05 }, { type: 'closing', content: 'La verdad está en el equilibrio.', relativeDuration: 0.05 }]
    },
    'error-tutorial': {
        type: 'error-tutorial',
        sections: [
            { name: 'common_error', purpose: 'Demostración del error', relativeDuration: 0.25, content: '' },
            { name: 'why_it_fails', purpose: 'Por qué falla', relativeDuration: 0.35, content: '' },
            { name: 'correct_solution', purpose: 'Solución correcta', relativeDuration: 0.40, content: '' }
        ],
        transitions: ['abrupt', 'question'],
        hooks: [{ type: 'opening', content: 'El error más común que cometes es...', relativeDuration: 0.05 }, { type: 'closing', content: 'Evita este error y verás resultados.', relativeDuration: 0.05 }]
    },
    'case-study': {
        type: 'case-study',
        sections: [
            { name: 'real_problem', purpose: 'Problema real', relativeDuration: 0.25, content: '' },
            { name: 'detailed_analysis', purpose: 'Análisis profundo', relativeDuration: 0.40, content: '' },
            { name: 'resolution', purpose: 'Resolución y aprendizajes', relativeDuration: 0.35, content: '' }
        ],
        transitions: ['smooth', 'callback'],
        hooks: [{ type: 'opening', content: 'Déjame contarte un caso real...', relativeDuration: 0.05 }, { type: 'closing', content: 'Este caso demuestra que...', relativeDuration: 0.05 }]
    }
};

// ===== CLASE PRINCIPAL =====
/** ScriptStructureRandomizer - Aplica variabilidad estructural a guiones (REQ-2.7) */
export class ScriptStructureRandomizer {
    /** Selecciona estructura evitando repetición en últimos 3 videos (REQ-2.7.5) */
    public static selectStructure(recentStructures: NarrativeStructure[], seed?: number): NarrativeStructure {
        const random = seed !== undefined ? this.seededRandom(seed) : () => Math.random();
        let available = [...ALL_STRUCTURES];
        if (this.detectRepetition(recentStructures)) available = available.filter(s => s !== recentStructures[0]);
        if (available.length === 0) available = [...ALL_STRUCTURES];
        return available[Math.floor(random() * available.length)];
    }

    /** Detecta repetición de 2+ videos consecutivos con misma estructura (REQ-2.7.5) */
    public static detectRepetition(structures: NarrativeStructure[]): boolean {
        if (structures.length < 2) return false;
        let count = 1;
        for (let i = 1; i < structures.length && i < MAX_CONSECUTIVE_SAME_STRUCTURE; i++) {
            if (structures[i] === structures[0]) count++; else break;
        }
        return count >= MAX_CONSECUTIVE_SAME_STRUCTURE - 1;
    }

    /** Aplica estructura narrativa al guión raw */
    public static applyStructure(rawScript: string, config: StructureConfig): StructuredScript {
        const template = STRUCTURE_TEMPLATES[config.structure];
        const sentences = this.splitSentences(rawScript);
        const varied = this.varySentenceLengthArray(sentences, config.sentenceLengthVariation);
        const sections = this.distributeSentences(varied, template);
        const script = this.buildScript(sections, template.hooks, config.ctaPosition);
        const final = this.splitSentences(script);
        const avg = final.reduce((s, x) => s + x.length, 0) / (final.length || 1);
        return { originalScript: rawScript, structuredScript: script, appliedStructure: config.structure, sentenceCount: final.length, avgSentenceLength: Math.round(avg), ctaPosition: config.ctaPosition, structureDefinition: { ...template, sections } };
    }

    /** Varía longitud de oraciones ±variation% (REQ-2.7.2) */
    public static varySentenceLength(text: string, variation: number): string {
        return this.varySentenceLengthArray(this.splitSentences(text), variation).join(' ');
    }

    /** Ajusta densidad de keywords (REQ-2.7.3) */
    public static adjustKeywordDensity(text: string, keywords: string[], density: KeywordDensity): string {
        if (!keywords.length) return text;
        const words = text.split(/\s+/).length;
        const cfg = KEYWORD_DENSITY_CONFIG[density];
        const target = Math.floor(words * (cfg.min + cfg.max) / 2);
        const current = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase())).length;
        return current < target ? this.insertKeywords(text, keywords, target - current) : text;
    }

    /** Reposiciona CTA: start/middle/end (REQ-2.7.4) */
    public static repositionCTA(text: string, position: CTAPosition): string {
        const patterns = [/suscr[íi]bete[^.]*\./gi, /dale like[^.]*\./gi, /comenta[^.]*\./gi];
        let cta = 'Si te ha gustado, suscríbete y activa la campanita.', clean = text;
        for (const p of patterns) { const m = text.match(p); if (m) { cta = m[0]; clean = text.replace(p, '').trim(); break; } }
        const s = this.splitSentences(clean);
        if (position === 'start') return `${cta} ${s.join(' ')}`;
        if (position === 'middle') { s.splice(Math.floor(s.length / 2), 0, cta); return s.join(' '); }
        return `${s.join(' ')} ${cta}`;
    }

    /** Obtiene definición de estructura */
    public static getStructureDefinition(structure: NarrativeStructure): NarrativeStructureDefinition { return STRUCTURE_TEMPLATES[structure]; }

    /** Genera configuración aleatoria */
    public static generateRandomConfig(recent: NarrativeStructure[] = [], seed?: number): StructureConfig {
        const r = seed !== undefined ? this.seededRandom(seed) : () => Math.random();
        const densities: KeywordDensity[] = ['low', 'medium', 'high'];
        const positions: CTAPosition[] = ['start', 'middle', 'end'];
        return { structure: this.selectStructure(recent, seed), sentenceLengthVariation: 0.30, keywordDensity: densities[Math.floor(r() * densities.length)], ctaPosition: positions[Math.floor(r() * positions.length)] };
    }

    /** Crea registro para SQLite (REQ-2.7.6) */
    public static createUsageRecord(videoId: string, channelId: string, config: StructureConfig): StructureUsageRecord {
        return { videoId, channelId, structure: config.structure, ctaPosition: config.ctaPosition, keywordDensity: config.keywordDensity, createdAt: new Date() };
    }

    // Métodos privados
    private static seededRandom(seed: number): () => number { let s = seed; return () => { s = (s * 1103515245 + 12345) % (2 ** 31); return s / (2 ** 31); }; }
    private static splitSentences(text: string): string[] { return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0); }
    
    /**
     * Varía longitud de oraciones con la variación especificada (REQ-2.7.2)
     * Alterna entre expansión y contracción basado en el índice y un factor aleatorio
     */
    private static varySentenceLengthArray(sentences: string[], variation: number): string[] {
        // Crear una copia del array para no mutar el original
        const result: string[] = [];
        
        for (let i = 0; i < sentences.length; i++) {
            const s = sentences[i];
            // Factor aleatorio para decidir si expandir, contraer o mantener
            const randomFactor = Math.random();
            
            // Variación basada en el índice y un factor aleatorio
            // Para oraciones pares: tendencia a expandir
            // Para oraciones impares: tendencia a contraer
            if (i % 2 === 0) {
                // Oraciones pares: probabilidad de expandir basada en variation
                if (randomFactor < variation && s.includes(',')) {
                    result.push(this.expandSentence(s));
                } else {
                    result.push(s);
                }
            } else {
                // Oraciones impares: probabilidad de contraer basada en variation
                if (randomFactor < variation) {
                    result.push(this.contractSentence(s));
                } else {
                    result.push(s);
                }
            }
        }
        
        return result;
    }
    
    /**
     * Expande una oración agregando conectores explicativos (REQ-2.7.2)
     * Inserta conectores como "es decir", "en otras palabras", "lo cual significa que"
     */
    private static expandSentence(s: string): string {
        const connectors = [', es decir,', ', en otras palabras,', ', lo cual significa que'];
        const selectedConnector = connectors[Math.floor(Math.random() * connectors.length)];
        
        // Buscar una coma cerca del medio de la oración para insertar el conector
        const midPoint = Math.floor(s.length / 2);
        const searchStart = Math.max(0, midPoint - 30);
        const searchEnd = Math.min(s.length, midPoint + 30);
        
        // Buscar la coma más cercana al punto medio
        let bestCommaIndex = -1;
        let minDistance = Infinity;
        
        for (let i = searchStart; i < searchEnd; i++) {
            if (s[i] === ',') {
                const distance = Math.abs(i - midPoint);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestCommaIndex = i;
                }
            }
        }
        
        if (bestCommaIndex !== -1) {
            // Insertar el conector después de la coma encontrada
            return s.slice(0, bestCommaIndex + 1) + selectedConnector + s.slice(bestCommaIndex + 1);
        }
        
        // Si no hay coma, buscar un punto de inserción natural (después de "que", "y", "pero")
        const insertPoints = [' que ', ' y ', ' pero ', ' porque '];
        for (const point of insertPoints) {
            const idx = s.toLowerCase().indexOf(point);
            if (idx !== -1 && idx > 10 && idx < s.length - 10) {
                return s.slice(0, idx + point.length) + selectedConnector.slice(2) + ' ' + s.slice(idx + point.length);
            }
        }
        
        return s;
    }
    
    /**
     * Contrae una oración eliminando palabras redundantes (REQ-2.7.2)
     * Elimina palabras como "muy", "bastante", "realmente", "simplemente"
     */
    private static contractSentence(s: string): string {
        let result = s;
        
        // Lista de palabras redundantes a eliminar (con variantes de mayúsculas)
        const redundantPatterns = [
            /\s+muy\s+/gi,
            /\s+bastante\s+/gi,
            /\s+realmente\s+/gi,
            /\s+simplemente\s+/gi,
            /\s+totalmente\s+/gi,
            /\s+absolutamente\s+/gi,
            /\s+completamente\s+/gi,
            /\s+verdaderamente\s+/gi
        ];
        
        // Aplicar cada patrón de reemplazo
        for (const pattern of redundantPatterns) {
            result = result.replace(pattern, ' ');
        }
        
        // Limpiar espacios múltiples
        result = result.replace(/\s+/g, ' ').trim();
        
        return result;
    }
    private static distributeSentences(sentences: string[], template: NarrativeStructureDefinition): ScriptSection[] {
        let idx = 0;
        return template.sections.map(sec => {
            const count = Math.max(1, Math.floor(sentences.length * sec.relativeDuration));
            const content = sentences.slice(idx, idx + count).join(' '); idx += count;
            return { ...sec, content };
        });
    }
    private static buildScript(sections: ScriptSection[], hooks: HookConfig[], ctaPos: CTAPosition): string {
        const open = hooks.find(h => h.type === 'opening'), close = hooks.find(h => h.type === 'closing');
        const parts: string[] = [];
        if (open) parts.push(open.content);
        for (const sec of sections) if (sec.content) parts.push(sec.content);
        if (close) parts.push(close.content);
        return this.repositionCTA(parts.join(' '), ctaPos);
    }
    private static insertKeywords(text: string, keywords: string[], count: number): string {
        const sentences = this.splitSentences(text);
        const toInsert = keywords.slice(0, count);
        let ki = 0;
        return sentences.map((s, i) => {
            if (ki < toInsert.length && i % 3 === 0) { const kw = toInsert[ki++]; if (!s.toLowerCase().includes(kw.toLowerCase())) return `${s} sobre ${kw}.`; }
            return s;
        }).join(' ');
    }
}
