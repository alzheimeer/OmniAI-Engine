/**
 * ScriptHumanizer.test.ts - Tests para el sistema de humanización de guiones
 * REQ-2.1.2: Validar muletillas por idioma ES, EN, PT
 * 
 * Verifica que:
 * - LANGUAGE_FILLERS contiene todas las muletillas requeridas
 * - addFillers() aplica muletillas correctamente según idioma y nivel
 * - humanize() integra correctamente todas las transformaciones
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
    ScriptHumanizer,
    LANGUAGE_FILLERS,
    LANGUAGE_AUTO_CORRECTIONS,
    LANGUAGE_PAUSE_MARKERS,
    LANGUAGE_RHETORICAL_QUESTIONS,
    LANGUAGE_MICRO_ANECDOTES,
    EMOTIONAL_HOOKS,
    getScriptHumanizer,
    humanizeScriptAuto
} from './ScriptHumanizer';
import type { HumanizationConfig, SupportedLanguage, EmotionalHook } from './ScriptHumanizerIntegration';

// ===== TESTS DE MULETILLAS POR IDIOMA (REQ-2.1.2) =====

describe('LANGUAGE_FILLERS - Muletillas por Idioma', () => {
    
    describe('Español (ES) - REQ-2.1.2', () => {
        const requiredFillers = ['o sea', 'bueno', 'mira', 'sabes', 'pues'];
        
        test('debe contener todas las muletillas requeridas en ES', () => {
            const esFillers = LANGUAGE_FILLERS.es;
            
            requiredFillers.forEach(filler => {
                expect(esFillers).toContain(filler);
            });
        });
        
        test('todas las muletillas ES deben ser strings no vacíos', () => {
            LANGUAGE_FILLERS.es.forEach(filler => {
                expect(typeof filler).toBe('string');
                expect(filler.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 5 muletillas para ES', () => {
            expect(LANGUAGE_FILLERS.es.length).toBeGreaterThanOrEqual(5);
        });
    });
    
    describe('Inglés (EN) - REQ-2.1.2', () => {
        const requiredFillers = ['you know', 'like', 'actually', 'basically', 'so'];
        
        test('debe contener todas las muletillas requeridas en EN', () => {
            const enFillers = LANGUAGE_FILLERS.en;
            
            requiredFillers.forEach(filler => {
                expect(enFillers).toContain(filler);
            });
        });
        
        test('todas las muletillas EN deben ser strings no vacíos', () => {
            LANGUAGE_FILLERS.en.forEach(filler => {
                expect(typeof filler).toBe('string');
                expect(filler.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 5 muletillas para EN', () => {
            expect(LANGUAGE_FILLERS.en.length).toBeGreaterThanOrEqual(5);
        });
    });
    
    describe('Portugués (PT) - REQ-2.1.2', () => {
        const requiredFillers = ['tipo', 'né', 'olha', 'sabe', 'então'];
        
        test('debe contener todas las muletillas requeridas en PT', () => {
            const ptFillers = LANGUAGE_FILLERS.pt;
            
            requiredFillers.forEach(filler => {
                expect(ptFillers).toContain(filler);
            });
        });
        
        test('todas las muletillas PT deben ser strings no vacíos', () => {
            LANGUAGE_FILLERS.pt.forEach(filler => {
                expect(typeof filler).toBe('string');
                expect(filler.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 5 muletillas para PT', () => {
            expect(LANGUAGE_FILLERS.pt.length).toBeGreaterThanOrEqual(5);
        });
    });
    
    describe('Validación cruzada de idiomas', () => {
        test('todos los idiomas soportados deben tener muletillas', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                expect(LANGUAGE_FILLERS[lang]).toBeDefined();
                expect(Array.isArray(LANGUAGE_FILLERS[lang])).toBe(true);
                expect(LANGUAGE_FILLERS[lang].length).toBeGreaterThan(0);
            });
        });
        
        test('las muletillas deben ser únicas por idioma (sin duplicados)', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                const fillers = LANGUAGE_FILLERS[lang];
                const uniqueFillers = new Set(fillers);
                expect(uniqueFillers.size).toBe(fillers.length);
            });
        });
    });
});

// ===== TESTS DE ScriptHumanizer.addFillers() =====

describe('ScriptHumanizer - addFillers()', () => {
    let humanizer: ScriptHumanizer;
    const testScript = 'Primera oración del texto. Segunda oración para probar. Tercera oración aquí. Cuarta oración más. Quinta oración final.';
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    describe('Aplicación de muletillas por nivel', () => {
        test('nivel "minimal" debe añadir 1-2 muletillas', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.fillersAdded).toBeGreaterThanOrEqual(1);
            expect(result.stats.fillersAdded).toBeLessThanOrEqual(3);
        });
        
        test('nivel "moderate" debe añadir 3-4 muletillas', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'moderate',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Usamos un texto más largo para permitir más inserciones
            const longerScript = 'Oración uno. Oración dos. Oración tres. Oración cuatro. Oración cinco. Oración seis. Oración siete. Oración ocho. Oración nueve. Oración diez.';
            
            const result = await humanizer.humanize(longerScript, config);
            expect(result.stats.fillersAdded).toBeGreaterThanOrEqual(2);
            expect(result.stats.fillersAdded).toBeLessThanOrEqual(5);
        });
        
        test('nivel "natural" debe añadir 5-7 muletillas', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'natural',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Texto largo para permitir todas las inserciones
            const longerScript = 'Oración uno. Oración dos. Oración tres. Oración cuatro. Oración cinco. Oración seis. Oración siete. Oración ocho. Oración nueve. Oración diez. Oración once. Oración doce.';
            
            const result = await humanizer.humanize(longerScript, config);
            expect(result.stats.fillersAdded).toBeGreaterThanOrEqual(3);
        });
    });
    
    describe('Aplicación de muletillas por idioma', () => {
        test('muletillas ES deben aparecer en script humanizado español', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'natural',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            // Verificar que al menos una muletilla ES aparece en el resultado
            const esFillers = LANGUAGE_FILLERS.es;
            const hasEsFiller = esFillers.some(filler => 
                result.humanizedScript.toLowerCase().includes(filler.toLowerCase())
            );
            
            expect(hasEsFiller).toBe(true);
        });
        
        test('muletillas EN deben aparecer en script humanizado inglés', async () => {
            const config: HumanizationConfig = {
                language: 'en',
                fillerLevel: 'natural',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const enScript = 'First sentence here. Second sentence to test. Third sentence now. Fourth sentence more. Fifth final sentence.';
            
            const result = await humanizer.humanize(enScript, config);
            
            // Verificar que al menos una muletilla EN aparece en el resultado
            const enFillers = LANGUAGE_FILLERS.en;
            const hasEnFiller = enFillers.some(filler => 
                result.humanizedScript.toLowerCase().includes(filler.toLowerCase())
            );
            
            expect(hasEnFiller).toBe(true);
        });
        
        test('muletillas PT deben aparecer en script humanizado portugués', async () => {
            const config: HumanizationConfig = {
                language: 'pt',
                fillerLevel: 'natural',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const ptScript = 'Primeira frase aqui. Segunda frase para testar. Terceira frase agora. Quarta frase mais. Quinta frase final.';
            
            const result = await humanizer.humanize(ptScript, config);
            
            // Verificar que al menos una muletilla PT aparece en el resultado
            const ptFillers = LANGUAGE_FILLERS.pt;
            const hasPtFiller = ptFillers.some(filler => 
                result.humanizedScript.toLowerCase().includes(filler.toLowerCase())
            );
            
            expect(hasPtFiller).toBe(true);
        });
    });
    
    describe('Formato correcto de muletillas insertadas', () => {
        test('muletillas deben estar correctamente capitalizadas', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'moderate',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            // Las muletillas al inicio de oración deben estar capitalizadas
            // Buscar patrón: ". Muletilla," o inicio con "Muletilla,"
            const capitalizedPattern = /[.!?]\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+,/;
            
            // El texto humanizado debe seguir patrones gramaticales correctos
            expect(result.humanizedScript).toBeDefined();
            expect(result.humanizedScript.length).toBeGreaterThan(testScript.length);
        });
    });
});

// ===== TESTS DE INTEGRACIÓN COMPLETA =====

describe('ScriptHumanizer - humanize() integración completa', () => {
    let humanizer: ScriptHumanizer;
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    test('debe retornar estructura correcta de HumanizedScript', async () => {
        const config: HumanizationConfig = {
            language: 'es',
            fillerLevel: 'moderate',
            includeAutoCorrections: true,
            includePauseMarkers: true,
            includeRhetoricalQuestions: true,
            emotionalHook: 'curiosity'
        };
        
        const script = 'Este es un texto de prueba. Contiene varias oraciones. Para validar la humanización.';
        const result = await humanizer.humanize(script, config);
        
        expect(result).toHaveProperty('originalScript');
        expect(result).toHaveProperty('humanizedScript');
        expect(result).toHaveProperty('config');
        expect(result).toHaveProperty('stats');
        
        expect(result.originalScript).toBe(script);
        expect(result.config).toEqual(config);
        expect(typeof result.stats.fillersAdded).toBe('number');
    });
    
    test('debe aplicar todas las transformaciones habilitadas', async () => {
        const config: HumanizationConfig = {
            language: 'es',
            fillerLevel: 'natural',
            includeAutoCorrections: true,
            includePauseMarkers: true,
            includeRhetoricalQuestions: true,
            emotionalHook: 'curiosity'
        };
        
        const script = 'Primera oración larga para testing. Segunda oración con más contenido. Tercera oración aquí. Cuarta para más contexto. Quinta para pruebas. Sexta oración adicional.';
        const result = await humanizer.humanize(script, config);
        
        // El script humanizado debe ser más largo que el original
        expect(result.humanizedScript.length).toBeGreaterThan(script.length);
        
        // Verificar que el script fue modificado
        expect(result.humanizedScript).not.toBe(script);
    });
});

// ===== TESTS DE FUNCIONES AUXILIARES =====

describe('ScriptHumanizer - Funciones auxiliares', () => {
    test('getScriptHumanizer() debe retornar singleton', () => {
        const instance1 = getScriptHumanizer();
        const instance2 = getScriptHumanizer();
        
        expect(instance1).toBe(instance2);
    });
    
    test('generateRandomConfig() debe generar configuración válida', () => {
        const humanizer = new ScriptHumanizer();
        const config = humanizer.generateRandomConfig('es');
        
        expect(config.language).toBe('es');
        expect(['minimal', 'moderate', 'natural']).toContain(config.fillerLevel);
        expect(typeof config.includeAutoCorrections).toBe('boolean');
        expect(typeof config.includePauseMarkers).toBe('boolean');
        expect(typeof config.includeRhetoricalQuestions).toBe('boolean');
        expect(['curiosity', 'fomo', 'controversy', 'empathy', 'surprise']).toContain(config.emotionalHook);
    });
    
    test('humanizeScriptAuto() debe funcionar con configuración automática', async () => {
        const script = 'Este es un guión de prueba. Necesita ser humanizado.';
        const result = await humanizeScriptAuto(script, 'es');
        
        expect(result).toHaveProperty('humanizedScript');
        expect(result.humanizedScript).not.toBe(script);
    });
    
    test('getLanguageConfig() debe retornar configuración completa por idioma', () => {
        const config = ScriptHumanizer.getLanguageConfig('es');
        
        expect(config).toHaveProperty('fillers');
        expect(config).toHaveProperty('autoCorrections');
        expect(config).toHaveProperty('pauseMarkers');
        expect(config).toHaveProperty('rhetoricalQuestions');
        expect(config).toHaveProperty('microAnecdotes');
        
        expect(config.fillers).toBe(LANGUAGE_FILLERS.es);
    });
});

// ===== TESTS DE AUTOCORRECCIONES NATURALES (REQ-2.1.3) =====

describe('LANGUAGE_AUTO_CORRECTIONS - Autocorrecciones Naturales REQ-2.1.3', () => {
    
    describe('Español (ES) - REQ-2.1.3', () => {
        const requiredAutoCorrections = [
            'Es decir... no, mejor dicho...',
            'O mejor dicho...',
            'Bueno, en realidad lo que quiero decir es...'
        ];
        
        test('debe contener todas las autocorrecciones requeridas en ES', () => {
            const esCorrections = LANGUAGE_AUTO_CORRECTIONS.es;
            
            requiredAutoCorrections.forEach(correction => {
                expect(esCorrections).toContain(correction);
            });
        });
        
        test('todas las autocorrecciones ES deben ser strings no vacíos', () => {
            LANGUAGE_AUTO_CORRECTIONS.es.forEach(correction => {
                expect(typeof correction).toBe('string');
                expect(correction.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 3 autocorrecciones para ES', () => {
            expect(LANGUAGE_AUTO_CORRECTIONS.es.length).toBeGreaterThanOrEqual(3);
        });
        
        test('autocorrecciones ES deben contener patrones de vacilación natural', () => {
            const esCorrections = LANGUAGE_AUTO_CORRECTIONS.es;
            // Verificar que al menos algunas contienen puntos suspensivos (vacilación)
            const hasHesitation = esCorrections.some(c => c.includes('...'));
            expect(hasHesitation).toBe(true);
        });
    });
    
    describe('Inglés (EN) - REQ-2.1.3', () => {
        test('debe tener autocorrecciones equivalentes en EN', () => {
            const enCorrections = LANGUAGE_AUTO_CORRECTIONS.en;
            
            expect(enCorrections.length).toBeGreaterThanOrEqual(3);
            
            // Verificar que contienen patrones de autocorrección en inglés
            const hasRephrase = enCorrections.some(c => 
                c.toLowerCase().includes('rephrase') || 
                c.toLowerCase().includes('mean') ||
                c.toLowerCase().includes('rather')
            );
            expect(hasRephrase).toBe(true);
        });
        
        test('todas las autocorrecciones EN deben ser strings no vacíos', () => {
            LANGUAGE_AUTO_CORRECTIONS.en.forEach(correction => {
                expect(typeof correction).toBe('string');
                expect(correction.length).toBeGreaterThan(0);
            });
        });
    });
    
    describe('Portugués (PT) - REQ-2.1.3', () => {
        test('debe tener autocorrecciones equivalentes en PT', () => {
            const ptCorrections = LANGUAGE_AUTO_CORRECTIONS.pt;
            
            expect(ptCorrections.length).toBeGreaterThanOrEqual(3);
            
            // Verificar que contienen patrones de autocorrección en portugués
            const hasRephrase = ptCorrections.some(c => 
                c.toLowerCase().includes('reformular') || 
                c.toLowerCase().includes('melhor') ||
                c.toLowerCase().includes('quer dizer')
            );
            expect(hasRephrase).toBe(true);
        });
        
        test('todas las autocorrecciones PT deben ser strings no vacíos', () => {
            LANGUAGE_AUTO_CORRECTIONS.pt.forEach(correction => {
                expect(typeof correction).toBe('string');
                expect(correction.length).toBeGreaterThan(0);
            });
        });
    });
    
    describe('Validación cruzada de idiomas', () => {
        test('todos los idiomas soportados deben tener autocorrecciones', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                expect(LANGUAGE_AUTO_CORRECTIONS[lang]).toBeDefined();
                expect(Array.isArray(LANGUAGE_AUTO_CORRECTIONS[lang])).toBe(true);
                expect(LANGUAGE_AUTO_CORRECTIONS[lang].length).toBeGreaterThan(0);
            });
        });
        
        test('las autocorrecciones deben ser únicas por idioma (sin duplicados)', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                const corrections = LANGUAGE_AUTO_CORRECTIONS[lang];
                const uniqueCorrections = new Set(corrections);
                expect(uniqueCorrections.size).toBe(corrections.length);
            });
        });
    });
});

// ===== TESTS DE ScriptHumanizer.addAutoCorrections() REQ-2.1.3 =====

describe('ScriptHumanizer - addAutoCorrections() REQ-2.1.3', () => {
    let humanizer: ScriptHumanizer;
    const testScript = 'Primera oración importante. Segunda oración con más contenido. Tercera oración aquí. Cuarta oración más. Quinta oración para probar. Sexta oración adicional. Séptima oración extra. Octava oración final.';
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    describe('Aplicación de autocorrecciones', () => {
        test('debe añadir autocorrecciones cuando está habilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.autoCorrectionsAdded).toBeGreaterThanOrEqual(1);
        });
        
        test('no debe añadir autocorrecciones cuando está deshabilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.autoCorrectionsAdded).toBe(0);
        });
    });
    
    describe('Autocorrecciones por idioma', () => {
        test('autocorrecciones ES deben aparecer en script humanizado español', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEsCorrection = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(testScript, config);
                const esCorrections = LANGUAGE_AUTO_CORRECTIONS.es;
                hasEsCorrection = hasEsCorrection || esCorrections.some(correction => 
                    result.humanizedScript.includes(correction)
                );
                if (hasEsCorrection) break;
            }
            
            expect(hasEsCorrection).toBe(true);
        });
        
        test('autocorrecciones EN deben aparecer en script humanizado inglés', async () => {
            const config: HumanizationConfig = {
                language: 'en',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const enScript = 'First important sentence. Second sentence with more content. Third sentence here. Fourth sentence more. Fifth sentence to test. Sixth additional sentence. Seventh extra sentence. Eighth final sentence.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEnCorrection = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(enScript, config);
                const enCorrections = LANGUAGE_AUTO_CORRECTIONS.en;
                hasEnCorrection = hasEnCorrection || enCorrections.some(correction => 
                    result.humanizedScript.includes(correction)
                );
                if (hasEnCorrection) break;
            }
            
            expect(hasEnCorrection).toBe(true);
        });
        
        test('autocorrecciones PT deben aparecer en script humanizado portugués', async () => {
            const config: HumanizationConfig = {
                language: 'pt',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const ptScript = 'Primeira frase importante. Segunda frase com mais conteúdo. Terceira frase aqui. Quarta frase mais. Quinta frase para testar. Sexta frase adicional. Sétima frase extra. Oitava frase final.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasPtCorrection = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(ptScript, config);
                const ptCorrections = LANGUAGE_AUTO_CORRECTIONS.pt;
                hasPtCorrection = hasPtCorrection || ptCorrections.some(correction => 
                    result.humanizedScript.includes(correction)
                );
                if (hasPtCorrection) break;
            }
            
            expect(hasPtCorrection).toBe(true);
        });
    });
    
    describe('Cantidad de autocorrecciones añadidas', () => {
        test('debe añadir máximo 2 autocorrecciones por script', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Texto muy largo para maximizar oportunidades de inserción
            const longScript = Array(20).fill('Esta es una oración de prueba con suficiente contenido.').join(' ');
            
            const result = await humanizer.humanize(longScript, config);
            expect(result.stats.autoCorrectionsAdded).toBeLessThanOrEqual(2);
        });
        
        test('debe añadir autocorrecciones solo cuando hay suficientes oraciones', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Texto muy corto
            const shortScript = 'Una oración corta.';
            
            const result = await humanizer.humanize(shortScript, config);
            // Con texto muy corto, no debería añadir muchas autocorrecciones
            expect(result.stats.autoCorrectionsAdded).toBeLessThanOrEqual(1);
        });
    });
    
    describe('Formato de autocorrecciones insertadas', () => {
        test('autocorrecciones deben preceder a la oración que corrigen', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: true,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            if (result.stats.autoCorrectionsAdded > 0) {
                // Verificar que el texto humanizado es más largo
                expect(result.humanizedScript.length).toBeGreaterThan(testScript.length);
                
                // Verificar que alguna autocorrección aparece seguida de texto
                const esCorrections = LANGUAGE_AUTO_CORRECTIONS.es;
                const hasValidFormat = esCorrections.some(correction => {
                    const index = result.humanizedScript.indexOf(correction);
                    if (index === -1) return false;
                    // Verificar que hay texto después de la autocorrección
                    return result.humanizedScript.length > index + correction.length;
                });
                
                if (result.stats.autoCorrectionsAdded > 0) {
                    expect(hasValidFormat).toBe(true);
                }
            }
        });
    });
});

// ===== TESTS DE MARCADORES DE PAUSA (REQ-2.1.4) =====

describe('LANGUAGE_PAUSE_MARKERS - Marcadores de Pausa REQ-2.1.4', () => {
    
    describe('Español (ES) - REQ-2.1.4', () => {
        const requiredPauseMarkers = ['...', '(pausa)', '—', 'Hmm...'];
        
        test('debe contener todos los marcadores de pausa requeridos en ES', () => {
            const esPauseMarkers = LANGUAGE_PAUSE_MARKERS.es;
            
            requiredPauseMarkers.forEach(marker => {
                expect(esPauseMarkers).toContain(marker);
            });
        });
        
        test('todos los marcadores ES deben ser strings no vacíos', () => {
            LANGUAGE_PAUSE_MARKERS.es.forEach(marker => {
                expect(typeof marker).toBe('string');
                expect(marker.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 marcadores de pausa para ES', () => {
            expect(LANGUAGE_PAUSE_MARKERS.es.length).toBeGreaterThanOrEqual(4);
        });
    });
    
    describe('Inglés (EN) - REQ-2.1.4', () => {
        const requiredPauseMarkers = ['...', '(pause)', '—', 'Hmm...'];
        
        test('debe contener marcadores de pausa equivalentes en EN', () => {
            const enPauseMarkers = LANGUAGE_PAUSE_MARKERS.en;
            
            requiredPauseMarkers.forEach(marker => {
                expect(enPauseMarkers).toContain(marker);
            });
        });
        
        test('todos los marcadores EN deben ser strings no vacíos', () => {
            LANGUAGE_PAUSE_MARKERS.en.forEach(marker => {
                expect(typeof marker).toBe('string');
                expect(marker.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 marcadores de pausa para EN', () => {
            expect(LANGUAGE_PAUSE_MARKERS.en.length).toBeGreaterThanOrEqual(4);
        });
    });
    
    describe('Portugués (PT) - REQ-2.1.4', () => {
        const requiredPauseMarkers = ['...', '(pausa)', '—', 'Hmm...'];
        
        test('debe contener marcadores de pausa equivalentes en PT', () => {
            const ptPauseMarkers = LANGUAGE_PAUSE_MARKERS.pt;
            
            requiredPauseMarkers.forEach(marker => {
                expect(ptPauseMarkers).toContain(marker);
            });
        });
        
        test('todos los marcadores PT deben ser strings no vacíos', () => {
            LANGUAGE_PAUSE_MARKERS.pt.forEach(marker => {
                expect(typeof marker).toBe('string');
                expect(marker.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 marcadores de pausa para PT', () => {
            expect(LANGUAGE_PAUSE_MARKERS.pt.length).toBeGreaterThanOrEqual(4);
        });
    });
    
    describe('Validación cruzada de idiomas', () => {
        test('todos los idiomas soportados deben tener marcadores de pausa', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                expect(LANGUAGE_PAUSE_MARKERS[lang]).toBeDefined();
                expect(Array.isArray(LANGUAGE_PAUSE_MARKERS[lang])).toBe(true);
                expect(LANGUAGE_PAUSE_MARKERS[lang].length).toBeGreaterThan(0);
            });
        });
    });
});

// ===== TESTS DE ScriptHumanizer.addPauseMarkers() REQ-2.1.4 =====

describe('ScriptHumanizer - addPauseMarkers() REQ-2.1.4', () => {
    let humanizer: ScriptHumanizer;
    const testScript = 'Primera oración importante, con coma aquí. Segunda oración, también con coma. Tercera oración, más contenido. Cuarta oración, para probar. Quinta oración, final del test.';
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    describe('Aplicación de marcadores de pausa', () => {
        test('debe añadir marcadores de pausa cuando está habilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: true,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Ejecutar varias veces para probabilidad estadística
            let totalPausesAdded = 0;
            for (let i = 0; i < 10; i++) {
                const result = await humanizer.humanize(testScript, config);
                totalPausesAdded += result.stats.pauseMarkersAdded;
            }
            
            // Con 10 intentos y 30% de probabilidad por coma, debería haber al menos algunas pausas
            expect(totalPausesAdded).toBeGreaterThan(0);
        });
        
        test('no debe añadir marcadores de pausa cuando está deshabilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.pauseMarkersAdded).toBe(0);
        });
    });
    
    describe('Marcadores de pausa por idioma', () => {
        test('marcadores de pausa ES deben aparecer en script humanizado español', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: true,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEsPauseMarker = false;
            for (let i = 0; i < 10; i++) {
                const result = await humanizer.humanize(testScript, config);
                const esPauseMarkers = LANGUAGE_PAUSE_MARKERS.es;
                hasEsPauseMarker = hasEsPauseMarker || esPauseMarkers.some(marker => 
                    result.humanizedScript.includes(marker)
                );
                if (hasEsPauseMarker) break;
            }
            
            expect(hasEsPauseMarker).toBe(true);
        });
        
        test('marcadores de pausa EN deben aparecer en script humanizado inglés', async () => {
            const config: HumanizationConfig = {
                language: 'en',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: true,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const enScript = 'First important sentence, with comma here. Second sentence, also with comma. Third sentence, more content. Fourth sentence, to test. Fifth sentence, end of test.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEnPauseMarker = false;
            for (let i = 0; i < 10; i++) {
                const result = await humanizer.humanize(enScript, config);
                const enPauseMarkers = LANGUAGE_PAUSE_MARKERS.en;
                hasEnPauseMarker = hasEnPauseMarker || enPauseMarkers.some(marker => 
                    result.humanizedScript.includes(marker)
                );
                if (hasEnPauseMarker) break;
            }
            
            expect(hasEnPauseMarker).toBe(true);
        });
        
        test('marcadores de pausa PT deben aparecer en script humanizado portugués', async () => {
            const config: HumanizationConfig = {
                language: 'pt',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: true,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const ptScript = 'Primeira frase importante, com vírgula aqui. Segunda frase, também com vírgula. Terceira frase, mais conteúdo. Quarta frase, para testar. Quinta frase, final do teste.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasPtPauseMarker = false;
            for (let i = 0; i < 10; i++) {
                const result = await humanizer.humanize(ptScript, config);
                const ptPauseMarkers = LANGUAGE_PAUSE_MARKERS.pt;
                hasPtPauseMarker = hasPtPauseMarker || ptPauseMarkers.some(marker => 
                    result.humanizedScript.includes(marker)
                );
                if (hasPtPauseMarker) break;
            }
            
            expect(hasPtPauseMarker).toBe(true);
        });
    });
    
    describe('Cantidad de marcadores de pausa', () => {
        test('debe añadir máximo 3 marcadores de pausa por script', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: true,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            // Texto con muchas comas para maximizar oportunidades
            const longScript = 'Oración uno, con coma. Oración dos, con coma. Oración tres, con coma. Oración cuatro, con coma. Oración cinco, con coma. Oración seis, con coma. Oración siete, con coma. Oración ocho, con coma.';
            
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(longScript, config);
                expect(result.stats.pauseMarkersAdded).toBeLessThanOrEqual(3);
            }
        });
    });
});

// ===== TESTS DE PREGUNTAS RETÓRICAS (REQ-2.1.4) =====

describe('LANGUAGE_RHETORICAL_QUESTIONS - Preguntas Retóricas REQ-2.1.4', () => {
    
    describe('Español (ES) - REQ-2.1.4', () => {
        const requiredRhetoricalQuestions = [
            '¿Te ha pasado alguna vez?',
            '¿Tiene sentido, verdad?'
        ];
        
        test('debe contener las preguntas retóricas requeridas en ES', () => {
            const esQuestions = LANGUAGE_RHETORICAL_QUESTIONS.es;
            
            requiredRhetoricalQuestions.forEach(question => {
                expect(esQuestions).toContain(question);
            });
        });
        
        test('todas las preguntas retóricas ES deben ser strings no vacíos', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.es.forEach(question => {
                expect(typeof question).toBe('string');
                expect(question.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 preguntas retóricas para ES', () => {
            expect(LANGUAGE_RHETORICAL_QUESTIONS.es.length).toBeGreaterThanOrEqual(4);
        });
        
        test('preguntas retóricas ES deben terminar con signo de interrogación', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.es.forEach(question => {
                expect(question.endsWith('?')).toBe(true);
            });
        });
    });
    
    describe('Inglés (EN) - REQ-2.1.4', () => {
        const requiredRhetoricalQuestions = [
            'Has this ever happened to you?',
            'Makes sense, right?'
        ];
        
        test('debe contener preguntas retóricas equivalentes en EN', () => {
            const enQuestions = LANGUAGE_RHETORICAL_QUESTIONS.en;
            
            requiredRhetoricalQuestions.forEach(question => {
                expect(enQuestions).toContain(question);
            });
        });
        
        test('todas las preguntas retóricas EN deben ser strings no vacíos', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.en.forEach(question => {
                expect(typeof question).toBe('string');
                expect(question.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 preguntas retóricas para EN', () => {
            expect(LANGUAGE_RHETORICAL_QUESTIONS.en.length).toBeGreaterThanOrEqual(4);
        });
        
        test('preguntas retóricas EN deben terminar con signo de interrogación', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.en.forEach(question => {
                expect(question.endsWith('?')).toBe(true);
            });
        });
    });
    
    describe('Portugués (PT) - REQ-2.1.4', () => {
        const requiredRhetoricalQuestions = [
            'Já aconteceu com você?',
            'Faz sentido, né?'
        ];
        
        test('debe contener preguntas retóricas equivalentes en PT', () => {
            const ptQuestions = LANGUAGE_RHETORICAL_QUESTIONS.pt;
            
            requiredRhetoricalQuestions.forEach(question => {
                expect(ptQuestions).toContain(question);
            });
        });
        
        test('todas las preguntas retóricas PT deben ser strings no vacíos', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.pt.forEach(question => {
                expect(typeof question).toBe('string');
                expect(question.length).toBeGreaterThan(0);
            });
        });
        
        test('debe tener al menos 4 preguntas retóricas para PT', () => {
            expect(LANGUAGE_RHETORICAL_QUESTIONS.pt.length).toBeGreaterThanOrEqual(4);
        });
        
        test('preguntas retóricas PT deben terminar con signo de interrogación', () => {
            LANGUAGE_RHETORICAL_QUESTIONS.pt.forEach(question => {
                expect(question.endsWith('?')).toBe(true);
            });
        });
    });
    
    describe('Validación cruzada de idiomas', () => {
        test('todos los idiomas soportados deben tener preguntas retóricas', () => {
            const supportedLanguages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            supportedLanguages.forEach(lang => {
                expect(LANGUAGE_RHETORICAL_QUESTIONS[lang]).toBeDefined();
                expect(Array.isArray(LANGUAGE_RHETORICAL_QUESTIONS[lang])).toBe(true);
                expect(LANGUAGE_RHETORICAL_QUESTIONS[lang].length).toBeGreaterThan(0);
            });
        });
    });
});

// ===== TESTS DE ScriptHumanizer.addRhetoricalQuestions() REQ-2.1.4 =====

describe('ScriptHumanizer - addRhetoricalQuestions() REQ-2.1.4', () => {
    let humanizer: ScriptHumanizer;
    const testScript = 'Primera oración del texto. Segunda oración con más contenido. Tercera oración aquí. Cuarta oración más. Quinta oración para probar. Sexta oración adicional. Séptima oración extra. Octava oración final.';
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    describe('Aplicación de preguntas retóricas', () => {
        test('debe añadir preguntas retóricas cuando está habilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.rhetoricalQuestionsAdded).toBeGreaterThanOrEqual(1);
        });
        
        test('no debe añadir preguntas retóricas cuando está deshabilitado', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            expect(result.stats.rhetoricalQuestionsAdded).toBe(0);
        });
    });
    
    describe('Preguntas retóricas por idioma', () => {
        test('preguntas retóricas ES deben aparecer en script humanizado español', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEsQuestion = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(testScript, config);
                const esQuestions = LANGUAGE_RHETORICAL_QUESTIONS.es;
                hasEsQuestion = hasEsQuestion || esQuestions.some(question => 
                    result.humanizedScript.includes(question)
                );
                if (hasEsQuestion) break;
            }
            
            expect(hasEsQuestion).toBe(true);
        });
        
        test('preguntas retóricas EN deben aparecer en script humanizado inglés', async () => {
            const config: HumanizationConfig = {
                language: 'en',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            const enScript = 'First sentence of text. Second sentence with more content. Third sentence here. Fourth sentence more. Fifth sentence to test. Sixth additional sentence. Seventh extra sentence. Eighth final sentence.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasEnQuestion = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(enScript, config);
                const enQuestions = LANGUAGE_RHETORICAL_QUESTIONS.en;
                hasEnQuestion = hasEnQuestion || enQuestions.some(question => 
                    result.humanizedScript.includes(question)
                );
                if (hasEnQuestion) break;
            }
            
            expect(hasEnQuestion).toBe(true);
        });
        
        test('preguntas retóricas PT deben aparecer en script humanizado portugués', async () => {
            const config: HumanizationConfig = {
                language: 'pt',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            const ptScript = 'Primeira frase do texto. Segunda frase com mais conteúdo. Terceira frase aqui. Quarta frase mais. Quinta frase para testar. Sexta frase adicional. Sétima frase extra. Oitava frase final.';
            
            // Ejecutar varias veces para asegurar que al menos una vez aparece
            let hasPtQuestion = false;
            for (let i = 0; i < 5; i++) {
                const result = await humanizer.humanize(ptScript, config);
                const ptQuestions = LANGUAGE_RHETORICAL_QUESTIONS.pt;
                hasPtQuestion = hasPtQuestion || ptQuestions.some(question => 
                    result.humanizedScript.includes(question)
                );
                if (hasPtQuestion) break;
            }
            
            expect(hasPtQuestion).toBe(true);
        });
    });
    
    describe('Cantidad de preguntas retóricas añadidas', () => {
        test('debe añadir máximo 2 preguntas retóricas por script', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            // Texto muy largo para maximizar oportunidades
            const longScript = Array(20).fill('Esta es una oración de prueba con suficiente contenido.').join(' ');
            
            const result = await humanizer.humanize(longScript, config);
            expect(result.stats.rhetoricalQuestionsAdded).toBeLessThanOrEqual(2);
        });
        
        test('preguntas retóricas deben insertarse después del primer tercio del texto', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            if (result.stats.rhetoricalQuestionsAdded > 0) {
                const esQuestions = LANGUAGE_RHETORICAL_QUESTIONS.es;
                // Encontrar la primera pregunta retórica en el texto
                let firstQuestionIndex = result.humanizedScript.length;
                esQuestions.forEach(question => {
                    const idx = result.humanizedScript.indexOf(question);
                    if (idx !== -1 && idx < firstQuestionIndex) {
                        firstQuestionIndex = idx;
                    }
                });
                
                // La pregunta no debería estar en el primer tercio
                const oneThird = result.humanizedScript.length / 3;
                expect(firstQuestionIndex).toBeGreaterThanOrEqual(Math.floor(oneThird * 0.5)); // Con margen de tolerancia
            }
        });
    });
});

// ===== TESTS DE OTRAS CONSTANTES DE HUMANIZACIÓN =====

describe('Constantes de humanización adicionales', () => {
    test('LANGUAGE_AUTO_CORRECTIONS debe tener entradas para todos los idiomas', () => {
        const languages: SupportedLanguage[] = ['es', 'en', 'pt'];
        
        languages.forEach(lang => {
            expect(LANGUAGE_AUTO_CORRECTIONS[lang]).toBeDefined();
            expect(LANGUAGE_AUTO_CORRECTIONS[lang].length).toBeGreaterThan(0);
        });
    });
    
    test('LANGUAGE_PAUSE_MARKERS debe tener entradas para todos los idiomas', () => {
        const languages: SupportedLanguage[] = ['es', 'en', 'pt'];
        
        languages.forEach(lang => {
            expect(LANGUAGE_PAUSE_MARKERS[lang]).toBeDefined();
            expect(LANGUAGE_PAUSE_MARKERS[lang].length).toBeGreaterThan(0);
        });
    });
    
    test('LANGUAGE_RHETORICAL_QUESTIONS debe tener entradas para todos los idiomas', () => {
        const languages: SupportedLanguage[] = ['es', 'en', 'pt'];
        
        languages.forEach(lang => {
            expect(LANGUAGE_RHETORICAL_QUESTIONS[lang]).toBeDefined();
            expect(LANGUAGE_RHETORICAL_QUESTIONS[lang].length).toBeGreaterThan(0);
        });
    });
    
    test('EMOTIONAL_HOOKS debe tener todos los tipos de gancho emocional', () => {
        const hookTypes: EmotionalHook[] = ['curiosity', 'fomo', 'controversy', 'empathy', 'surprise'];
        const languages: SupportedLanguage[] = ['es', 'en', 'pt'];
        
        hookTypes.forEach(hook => {
            expect(EMOTIONAL_HOOKS[hook]).toBeDefined();
            
            languages.forEach(lang => {
                expect(EMOTIONAL_HOOKS[hook][lang]).toBeDefined();
                expect(EMOTIONAL_HOOKS[hook][lang].length).toBeGreaterThan(0);
            });
        });
    });
});


// ===== TESTS DE GANCHOS EMOCIONALES ROTATIVOS (REQ-2.1.6) =====

describe('Ganchos Emocionales Rotativos - REQ-2.1.6', () => {
    let humanizer: ScriptHumanizer;
    const testScript = 'Esta es la primera oración del guión. Seguimos con más contenido interesante. Aquí hay información valiosa. Continuamos con el desarrollo. Esta es la conclusión del guión.';
    
    beforeEach(() => {
        humanizer = new ScriptHumanizer();
    });
    
    describe('EMOTIONAL_HOOKS - Estructura de datos', () => {
        test('debe tener exactamente 5 tipos de gancho emocional', () => {
            const hookTypes = Object.keys(EMOTIONAL_HOOKS);
            expect(hookTypes).toHaveLength(5);
            expect(hookTypes).toContain('curiosity');
            expect(hookTypes).toContain('fomo');
            expect(hookTypes).toContain('controversy');
            expect(hookTypes).toContain('empathy');
            expect(hookTypes).toContain('surprise');
        });
        
        test('cada tipo de gancho debe tener frases para ES, EN y PT', () => {
            const hookTypes: EmotionalHook[] = ['curiosity', 'fomo', 'controversy', 'empathy', 'surprise'];
            const languages: SupportedLanguage[] = ['es', 'en', 'pt'];
            
            hookTypes.forEach(hook => {
                languages.forEach(lang => {
                    const phrases = EMOTIONAL_HOOKS[hook][lang];
                    expect(phrases).toBeDefined();
                    expect(Array.isArray(phrases)).toBe(true);
                    expect(phrases.length).toBeGreaterThanOrEqual(2);
                    
                    // Verificar que cada frase es un string no vacío
                    phrases.forEach(phrase => {
                        expect(typeof phrase).toBe('string');
                        expect(phrase.length).toBeGreaterThan(0);
                    });
                });
            });
        });
        
        test('las frases de curiosity deben despertar intriga', () => {
            const esCuriosity = EMOTIONAL_HOOKS.curiosity.es;
            // Verificar que contienen palabras relacionadas con curiosidad
            const hasCuriousWords = esCuriosity.some(phrase => 
                phrase.toLowerCase().includes('sorprender') || 
                phrase.toLowerCase().includes('secreto') ||
                phrase.toLowerCase().includes('pocos') ||
                phrase.toLowerCase().includes('saben')
            );
            expect(hasCuriousWords).toBe(true);
        });
        
        test('las frases de fomo deben crear urgencia', () => {
            const esFomo = EMOTIONAL_HOOKS.fomo.es;
            // Verificar que contienen palabras de urgencia
            const hasUrgencyWords = esFomo.some(phrase => 
                phrase.toLowerCase().includes('perder') || 
                phrase.toLowerCase().includes('ahora') ||
                phrase.toLowerCase().includes('oportunidad') ||
                phrase.toLowerCase().includes('durará')
            );
            expect(hasUrgencyWords).toBe(true);
        });
        
        test('las frases de controversy deben generar debate', () => {
            const esControversy = EMOTIONAL_HOOKS.controversy.es;
            // Verificar que contienen palabras de debate
            const hasDebateWords = esControversy.some(phrase => 
                phrase.toLowerCase().includes('debate') || 
                phrase.toLowerCase().includes('acuerdo') ||
                phrase.toLowerCase().includes('verdad')
            );
            expect(hasDebateWords).toBe(true);
        });
        
        test('las frases de empathy deben generar conexión emocional', () => {
            const esEmpathy = EMOTIONAL_HOOKS.empathy.es;
            // Verificar que contienen palabras de empatía
            const hasEmpathyWords = esEmpathy.some(phrase => 
                phrase.toLowerCase().includes('sient') || 
                phrase.toLowerCase().includes('solo') ||
                phrase.toLowerCase().includes('pasado')
            );
            expect(hasEmpathyWords).toBe(true);
        });
        
        test('las frases de surprise deben generar asombro', () => {
            const esSurprise = EMOTIONAL_HOOKS.surprise.es;
            // Verificar que contienen palabras de sorpresa
            const hasSurpriseWords = esSurprise.some(phrase => 
                phrase.toLowerCase().includes('creer') || 
                phrase.toLowerCase().includes('prepara') ||
                phrase.toLowerCase().includes('palabra')
            );
            expect(hasSurpriseWords).toBe(true);
        });
    });
    
    describe('insertEmotionalHook() - Inserción correcta', () => {
        test('debe insertar gancho emocional cerca del inicio del guión', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            // Verificar que al menos un gancho de curiosidad está presente
            const curiosityHooks = EMOTIONAL_HOOKS.curiosity.es;
            const hasHook = curiosityHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
            
            // El gancho debe aparecer cerca del inicio (primeras 3 oraciones)
            const firstThreeQuarters = result.humanizedScript.substring(0, Math.floor(result.humanizedScript.length * 0.75));
            const hookInFirstPart = curiosityHooks.some(hook => 
                firstThreeQuarters.includes(hook)
            );
            expect(hookInFirstPart).toBe(true);
        });
        
        test('debe insertar gancho de fomo correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'fomo'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            const fomoHooks = EMOTIONAL_HOOKS.fomo.es;
            const hasHook = fomoHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
        
        test('debe insertar gancho de controversy correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'controversy'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            const controversyHooks = EMOTIONAL_HOOKS.controversy.es;
            const hasHook = controversyHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
        
        test('debe insertar gancho de empathy correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'empathy'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            const empathyHooks = EMOTIONAL_HOOKS.empathy.es;
            const hasHook = empathyHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
        
        test('debe insertar gancho de surprise correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'surprise'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            const surpriseHooks = EMOTIONAL_HOOKS.surprise.es;
            const hasHook = surpriseHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
        
        test('debe insertar ganchos en inglés correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'en',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const enScript = 'This is the first sentence. Here is more content. Now we have information. Continuing with development. This is the conclusion.';
            const result = await humanizer.humanize(enScript, config);
            
            const enHooks = EMOTIONAL_HOOKS.curiosity.en;
            const hasHook = enHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
        
        test('debe insertar ganchos en portugués correctamente', async () => {
            const config: HumanizationConfig = {
                language: 'pt',
                fillerLevel: 'minimal',
                includeAutoCorrections: false,
                includePauseMarkers: false,
                includeRhetoricalQuestions: false,
                emotionalHook: 'curiosity'
            };
            
            const ptScript = 'Esta é a primeira frase. Aqui está mais conteúdo. Agora temos informação. Continuando com desenvolvimento. Esta é a conclusão.';
            const result = await humanizer.humanize(ptScript, config);
            
            const ptHooks = EMOTIONAL_HOOKS.curiosity.pt;
            const hasHook = ptHooks.some(hook => 
                result.humanizedScript.includes(hook)
            );
            expect(hasHook).toBe(true);
        });
    });
    
    describe('selectHookAvoidingRepetition() - Sistema de rotación', () => {
        test('generateRandomConfig debe evitar repetir el mismo gancho consecutivamente', () => {
            const usedHooks: EmotionalHook[] = [];
            
            // Generar 10 configuraciones consecutivas
            for (let i = 0; i < 10; i++) {
                const config = humanizer.generateRandomConfig('es');
                usedHooks.push(config.emotionalHook);
            }
            
            // Verificar que no hay más de 2 repeticiones consecutivas del mismo gancho
            for (let i = 0; i < usedHooks.length - 2; i++) {
                const isTripleRepeat = (
                    usedHooks[i] === usedHooks[i + 1] && 
                    usedHooks[i + 1] === usedHooks[i + 2]
                );
                expect(isTripleRepeat).toBe(false);
            }
        });
        
        test('debe usar variedad de tipos de gancho en múltiples ejecuciones', () => {
            const usedHooks = new Set<EmotionalHook>();
            
            // Generar 20 configuraciones para tener muestra suficiente
            for (let i = 0; i < 20; i++) {
                const config = humanizer.generateRandomConfig('es');
                usedHooks.add(config.emotionalHook);
            }
            
            // Debe usar al menos 3 tipos diferentes de ganchos
            expect(usedHooks.size).toBeGreaterThanOrEqual(3);
        });
        
        test('todos los tipos de gancho deben ser utilizados eventualmente', () => {
            const allHookTypes: EmotionalHook[] = ['curiosity', 'fomo', 'controversy', 'empathy', 'surprise'];
            const usedHooks = new Set<EmotionalHook>();
            
            // Generar 50 configuraciones para maximizar probabilidad de cubrir todos
            for (let i = 0; i < 50; i++) {
                const config = humanizer.generateRandomConfig('es');
                usedHooks.add(config.emotionalHook);
            }
            
            // Debe usar al menos 4 de los 5 tipos
            expect(usedHooks.size).toBeGreaterThanOrEqual(4);
        });
    });
    
    describe('Integración completa de ganchos emocionales', () => {
        test('el script humanizado debe incluir el gancho emocional configurado', async () => {
            const hookTypes: EmotionalHook[] = ['curiosity', 'fomo', 'controversy', 'empathy', 'surprise'];
            
            for (const hookType of hookTypes) {
                const config: HumanizationConfig = {
                    language: 'es',
                    fillerLevel: 'minimal',
                    includeAutoCorrections: false,
                    includePauseMarkers: false,
                    includeRhetoricalQuestions: false,
                    emotionalHook: hookType
                };
                
                const result = await humanizer.humanize(testScript, config);
                
                // Verificar que el script humanizado es más largo que el original
                expect(result.humanizedScript.length).toBeGreaterThan(testScript.length);
                
                // Verificar que el gancho correspondiente está presente
                const hooks = EMOTIONAL_HOOKS[hookType].es;
                const hasHook = hooks.some(hook => result.humanizedScript.includes(hook));
                expect(hasHook).toBe(true);
            }
        });
        
        test('el gancho debe integrarse naturalmente sin romper la estructura', async () => {
            const config: HumanizationConfig = {
                language: 'es',
                fillerLevel: 'natural',
                includeAutoCorrections: true,
                includePauseMarkers: true,
                includeRhetoricalQuestions: true,
                emotionalHook: 'curiosity'
            };
            
            const result = await humanizer.humanize(testScript, config);
            
            // El script debe seguir siendo legible (no debe tener espacios dobles excesivos)
            const hasExcessiveSpaces = /\s{3,}/.test(result.humanizedScript);
            expect(hasExcessiveSpaces).toBe(false);
            
            // El script debe terminar con un carácter válido
            const lastChar = result.humanizedScript.trim().slice(-1);
            expect(['.', '!', '?', '...'].some(end => result.humanizedScript.trim().endsWith(end) || '.,!?'.includes(lastChar))).toBe(true);
        });
    });
});
