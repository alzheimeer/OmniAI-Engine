/**
 * ScriptHumanizerIntegration.test.ts - Tests para la integración ScriptStructureRandomizer → ScriptHumanizer
 * REQ-2.7.7: Validar que estructura se aplica ANTES de humanización
 */

import { describe, it, expect, beforeEach, test } from 'vitest';

import {
    ScriptProcessingPipeline,
    getScriptPipeline,
    processScriptAuto,
    applyStructureOnly,
    registerStructureUsage,
    ScriptProcessingConfig,
    IScriptHumanizer,
    HumanizationConfig,
    HumanizedScript,
    SupportedLanguage,
    ProcessedScript
} from './ScriptHumanizerIntegration';

import {
    ScriptStructureRandomizer,
    NarrativeStructure,
    StructureConfig
} from './ScriptStructureRandomizer';

// ===== MOCK DE ScriptHumanizer =====

/**
 * Mock de ScriptHumanizer para testing
 * Simula el comportamiento esperado cuando se implemente en Task 7
 */
class MockScriptHumanizer implements IScriptHumanizer {
    public callCount = 0;
    public lastInput: string = '';
    public lastConfig: HumanizationConfig | null = null;
    
    async humanize(script: string, config: HumanizationConfig): Promise<HumanizedScript> {
        this.callCount++;
        this.lastInput = script;
        this.lastConfig = config;
        
        // Simular humanización básica
        const humanized = script
            .replace(/\./g, '... bueno,')
            .replace(/\?/g, '? O sea,');
        
        return {
            originalScript: script,
            humanizedScript: humanized,
            config,
            stats: {
                fillersAdded: 3,
                autoCorrectionsAdded: 1,
                pauseMarkersAdded: 2,
                rhetoricalQuestionsAdded: 1
            }
        };
    }
    
    generateRandomConfig(language: SupportedLanguage): HumanizationConfig {
        return {
            language,
            fillerLevel: 'moderate',
            includeAutoCorrections: true,
            includePauseMarkers: true,
            includeRhetoricalQuestions: true,
            emotionalHook: 'curiosity'
        };
    }
}

// ===== SCRIPT DE PRUEBA =====

const TEST_SCRIPT = `
La inteligencia artificial está transformando nuestra forma de trabajar.
Muchas personas con TDAH encuentran en la IA una herramienta poderosa.
¿Sabías que los asistentes de IA pueden ayudar a organizar tareas?
Estudios demuestran que la productividad aumenta un 40% con estas herramientas.
Pero no todo es perfecto, hay desafíos que debemos considerar.
La clave está en encontrar el equilibrio correcto.
Suscríbete para más contenido sobre neurodivergencia e IA.
`;

// ===== TESTS =====

describe('ScriptHumanizerIntegration', () => {
    
    describe('ScriptProcessingPipeline', () => {
        let pipeline: ScriptProcessingPipeline;
        
        beforeEach(() => {
            pipeline = new ScriptProcessingPipeline();
        });
        
        test('debe inicializar sin humanizer', () => {
            expect(pipeline.isHumanizerAvailable()).toBe(false);
        });
        
        test('debe configurar humanizer correctamente', () => {
            const mockHumanizer = new MockScriptHumanizer();
            pipeline.setHumanizer(mockHumanizer);
            expect(pipeline.isHumanizerAvailable()).toBe(true);
        });
        
        test('debe procesar script con solo estructura (sin humanizer)', async () => {
            const config: ScriptProcessingConfig = {
                structure: {
                    structure: 'storytelling',
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'medium',
                    ctaPosition: 'end'
                }
            };
            
            const result = await pipeline.processScript(TEST_SCRIPT, config);
            
            expect(result.rawScript).toBe(TEST_SCRIPT);
            expect(result.structuredScript).toBeDefined();
            expect(result.structuredScript.appliedStructure).toBe('storytelling');
            expect(result.humanizedScript).toBeNull(); // No hay humanizer
            expect(result.finalScript).toBeDefined();
            expect(result.processedAt).toBeInstanceOf(Date);
        });
        
        test('debe procesar script con estructura Y humanización', async () => {
            const mockHumanizer = new MockScriptHumanizer();
            pipeline.setHumanizer(mockHumanizer);
            
            const config: ScriptProcessingConfig = {
                structure: {
                    structure: 'rhetorical',
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'high',
                    ctaPosition: 'middle'
                },
                humanization: {
                    language: 'es',
                    fillerLevel: 'moderate',
                    includeAutoCorrections: true,
                    includePauseMarkers: true,
                    includeRhetoricalQuestions: true,
                    emotionalHook: 'curiosity'
                }
            };
            
            const result = await pipeline.processScript(TEST_SCRIPT, config);
            
            // Verificar que estructura se aplicó PRIMERO
            expect(result.structuredScript.appliedStructure).toBe('rhetorical');
            
            // Verificar que humanización se aplicó DESPUÉS
            expect(result.humanizedScript).not.toBeNull();
            expect(mockHumanizer.callCount).toBe(1);
            
            // El input del humanizer debe ser el script YA estructurado
            expect(mockHumanizer.lastInput).toBe(result.structuredScript.structuredScript);
            
            // El script final debe ser el humanizado
            expect(result.finalScript).toBe(result.humanizedScript!.humanizedScript);
        });
        
        test('debe aplicar estructura ANTES de humanización (REQ-2.7.7)', async () => {
            const mockHumanizer = new MockScriptHumanizer();
            pipeline.setHumanizer(mockHumanizer);
            
            const config: ScriptProcessingConfig = {
                structure: {
                    structure: 'debate',
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'low',
                    ctaPosition: 'start'
                },
                humanization: {
                    language: 'es',
                    fillerLevel: 'natural',
                    includeAutoCorrections: true,
                    includePauseMarkers: true,
                    includeRhetoricalQuestions: false,
                    emotionalHook: 'fomo'
                }
            };
            
            const result = await pipeline.processScript(TEST_SCRIPT, config);
            
            // La estructura 'debate' incluye hooks específicos
            const structuredText = result.structuredScript.structuredScript;
            
            // El humanizer recibió el texto YA estructurado
            expect(mockHumanizer.lastInput).toContain(structuredText);
            
            // El orden es: raw → structured → humanized
            expect(result.structuredScript.originalScript).toBe(TEST_SCRIPT);
        });
        
        test('debe trackear estructuras recientes', async () => {
            const config1: ScriptProcessingConfig = {
                structure: { structure: 'storytelling', sentenceLengthVariation: 0.30, keywordDensity: 'medium', ctaPosition: 'end' }
            };
            const config2: ScriptProcessingConfig = {
                structure: { structure: 'debate', sentenceLengthVariation: 0.30, keywordDensity: 'medium', ctaPosition: 'end' }
            };
            
            await pipeline.processScript(TEST_SCRIPT, config1);
            await pipeline.processScript(TEST_SCRIPT, config2);
            
            const recent = pipeline.getRecentStructures();
            expect(recent).toContain('storytelling');
            expect(recent).toContain('debate');
            expect(recent[0]).toBe('debate'); // Más reciente primero
        });
        
        test('debe detectar cuando se repetiría estructura', () => {
            // Simular historial con 2 repeticiones
            const config1: ScriptProcessingConfig = {
                structure: { structure: 'storytelling', sentenceLengthVariation: 0.30, keywordDensity: 'medium', ctaPosition: 'end' }
            };
            
            pipeline['recentStructures'] = ['storytelling', 'storytelling'];
            
            expect(pipeline.wouldRepeat('storytelling')).toBe(true);
            expect(pipeline.wouldRepeat('debate')).toBe(false);
        });
        
        test('debe generar configuración automática', () => {
            const config = pipeline.generateAutoConfig('es');
            
            expect(config.structure).toBeDefined();
            expect(config.structure.structure).toBeDefined();
            expect(config.humanization).toBeDefined();
            expect(config.humanization!.language).toBe('es');
        });
        
        test('debe crear registro de uso con metadata', async () => {
            const config: ScriptProcessingConfig = {
                structure: {
                    structure: 'case-study',
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'medium',
                    ctaPosition: 'end'
                },
                videoMetadata: {
                    videoId: 'video-123',
                    channelId: 'channel-456'
                }
            };
            
            const result = await pipeline.processScript(TEST_SCRIPT, config);
            
            expect(result.usageRecord).toBeDefined();
            expect(result.usageRecord!.videoId).toBe('video-123');
            expect(result.usageRecord!.channelId).toBe('channel-456');
            expect(result.usageRecord!.structure).toBe('case-study');
        });
    });
    
    describe('Funciones de conveniencia', () => {
        
        test('getScriptPipeline debe retornar singleton', () => {
            const pipeline1 = getScriptPipeline();
            const pipeline2 = getScriptPipeline();
            expect(pipeline1).toBe(pipeline2);
        });
        
        test('processScriptAuto debe procesar con configuración automática', async () => {
            const result = await processScriptAuto(TEST_SCRIPT, 'es');
            
            expect(result.rawScript).toBe(TEST_SCRIPT);
            expect(result.structuredScript).toBeDefined();
            expect(result.finalScript).toBeDefined();
        });
        
        test('applyStructureOnly debe aplicar solo estructura', () => {
            const result = applyStructureOnly(TEST_SCRIPT, {
                structure: 'inverted-list'
            });
            
            expect(result.appliedStructure).toBe('inverted-list');
            expect(result.originalScript).toBe(TEST_SCRIPT);
        });
    });
    
    describe('Flujo de integración REQ-2.7.7', () => {
        
        test('flujo completo: raw → structure → humanize', async () => {
            const pipeline = new ScriptProcessingPipeline();
            const mockHumanizer = new MockScriptHumanizer();
            pipeline.setHumanizer(mockHumanizer);
            
            // Configuración completa
            const config: ScriptProcessingConfig = {
                structure: {
                    structure: 'error-tutorial',
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'high',
                    ctaPosition: 'end'
                },
                humanization: {
                    language: 'es',
                    fillerLevel: 'moderate',
                    includeAutoCorrections: true,
                    includePauseMarkers: true,
                    includeRhetoricalQuestions: true,
                    emotionalHook: 'surprise'
                },
                keywords: ['IA', 'TDAH', 'productividad'],
                videoMetadata: {
                    videoId: 'test-video',
                    channelId: 'test-channel'
                }
            };
            
            const result = await pipeline.processScript(TEST_SCRIPT, config);
            
            // Verificaciones del flujo
            expect(result.rawScript).toBe(TEST_SCRIPT);
            expect(result.structuredScript.appliedStructure).toBe('error-tutorial');
            expect(result.humanizedScript).not.toBeNull();
            expect(result.usageRecord).toBeDefined();
            
            // El humanizer recibió texto estructurado, no raw
            expect(mockHumanizer.lastInput).not.toBe(TEST_SCRIPT);
            expect(mockHumanizer.lastInput).toBe(result.structuredScript.structuredScript);
            
            // El final es el humanizado
            expect(result.finalScript).toBe(result.humanizedScript!.humanizedScript);
        });
    });
});
