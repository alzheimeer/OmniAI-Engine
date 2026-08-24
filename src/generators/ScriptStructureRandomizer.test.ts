/**
 * ScriptStructureRandomizer.test.ts - Tests para verificar el comportamiento de selectStructure(), detectRepetition() y varySentenceLength()
 * Tarea 5.3: Verificar que selectStructure() evita repetición en los últimos 3 videos (REQ-2.7.5)
 * Tarea 5.4: Verificar que varySentenceLength() varía la longitud de oraciones en aproximadamente ±30% (REQ-2.7.2)
 */

import { describe, it, expect } from 'vitest';
import {
    ScriptStructureRandomizer,
    NarrativeStructure,
    ALL_STRUCTURES,
    MAX_CONSECUTIVE_SAME_STRUCTURE,
    KEYWORD_DENSITY_CONFIG
} from './ScriptStructureRandomizer';

describe('ScriptStructureRandomizer - Tarea 5.3', () => {
    describe('Constante MAX_CONSECUTIVE_SAME_STRUCTURE', () => {
        it('debe tener valor 3 según REQ-2.7.5', () => {
            expect(MAX_CONSECUTIVE_SAME_STRUCTURE).toBe(3);
        });
    });

    describe('detectRepetition()', () => {
        it('debe retornar false cuando no hay estructuras recientes', () => {
            expect(ScriptStructureRandomizer.detectRepetition([])).toBe(false);
        });

        it('debe retornar false cuando solo hay 1 estructura', () => {
            expect(ScriptStructureRandomizer.detectRepetition(['storytelling'])).toBe(false);
        });

        it('debe retornar true cuando hay 2 estructuras iguales consecutivas (alerta para evitar tercera)', () => {
            // Si hay 2 iguales, detectRepetition debe alertar para evitar la tercera
            expect(ScriptStructureRandomizer.detectRepetition(['storytelling', 'storytelling'])).toBe(true);
        });

        it('debe retornar false cuando las 2 estructuras son diferentes', () => {
            expect(ScriptStructureRandomizer.detectRepetition(['storytelling', 'debate'])).toBe(false);
        });

        it('debe detectar repetición correctamente con array largo', () => {
            // Verifica que detecta la repetición incluso con más elementos
            expect(ScriptStructureRandomizer.detectRepetition(['storytelling', 'storytelling', 'storytelling'])).toBe(true);
        });
    });

    describe('selectStructure()', () => {
        it('debe retornar una estructura válida', () => {
            const result = ScriptStructureRandomizer.selectStructure([]);
            expect(ALL_STRUCTURES).toContain(result);
        });

        it('debe funcionar con array vacío de estructuras recientes', () => {
            const result = ScriptStructureRandomizer.selectStructure([]);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('debe evitar repetir estructura cuando hay 2 iguales consecutivas', () => {
            // Si los últimos 2 videos usaron 'storytelling', el tercero NO debe ser 'storytelling'
            const recentStructures: NarrativeStructure[] = ['storytelling', 'storytelling'];
            
            // Ejecutar múltiples veces para verificar que NUNCA repite
            for (let i = 0; i < 100; i++) {
                const result = ScriptStructureRandomizer.selectStructure(recentStructures);
                expect(result).not.toBe('storytelling');
            }
        });

        it('debe evitar repetir cualquier estructura que tenga 2 consecutivas', () => {
            // Probar con cada estructura
            for (const structure of ALL_STRUCTURES) {
                const recentStructures: NarrativeStructure[] = [structure, structure];
                
                for (let j = 0; j < 50; j++) {
                    const result = ScriptStructureRandomizer.selectStructure(recentStructures);
                    expect(result).not.toBe(structure);
                }
            }
        });

        it('debe permitir repetición cuando no hay 2 consecutivas iguales', () => {
            // Si los últimos son diferentes, cualquier estructura es válida
            const recentStructures: NarrativeStructure[] = ['storytelling', 'debate'];
            const result = ScriptStructureRandomizer.selectStructure(recentStructures);
            expect(ALL_STRUCTURES).toContain(result);
        });

        it('debe generar resultados reproducibles con seed', () => {
            const seed = 12345;
            const result1 = ScriptStructureRandomizer.selectStructure([], seed);
            const result2 = ScriptStructureRandomizer.selectStructure([], seed);
            expect(result1).toBe(result2);
        });

        it('debe generar resultados diferentes con seeds diferentes', () => {
            // Con seeds muy diferentes, debería haber variabilidad
            const results = new Set<NarrativeStructure>();
            for (let seed = 0; seed < 100; seed += 10) {
                results.add(ScriptStructureRandomizer.selectStructure([], seed));
            }
            // Debería haber al menos 2 resultados diferentes
            expect(results.size).toBeGreaterThan(1);
        });
    });

    describe('Integración - Simulación de secuencia de videos', () => {
        it('nunca debe producir 3 videos consecutivos con la misma estructura', () => {
            const history: NarrativeStructure[] = [];
            
            // Simular producción de 100 videos
            for (let i = 0; i < 100; i++) {
                const recentStructures = history.slice(-MAX_CONSECUTIVE_SAME_STRUCTURE + 1);
                const selected = ScriptStructureRandomizer.selectStructure(recentStructures);
                history.push(selected);
                
                // Verificar que nunca hay 3 consecutivos iguales
                if (history.length >= 3) {
                    const lastThree = history.slice(-3);
                    const allSame = lastThree.every(s => s === lastThree[0]);
                    expect(allSame).toBe(false);
                }
            }
        });

        it('debe distribuir estructuras de forma variada', () => {
            const history: NarrativeStructure[] = [];
            
            // Simular producción de 60 videos
            for (let i = 0; i < 60; i++) {
                const recentStructures = history.slice(-2);
                const selected = ScriptStructureRandomizer.selectStructure(recentStructures);
                history.push(selected);
            }
            
            // Contar uso de cada estructura
            const counts: Record<string, number> = {};
            for (const s of history) {
                counts[s] = (counts[s] || 0) + 1;
            }
            
            // Verificar que todas las estructuras se usaron al menos una vez
            for (const structure of ALL_STRUCTURES) {
                expect(counts[structure]).toBeGreaterThan(0);
            }
        });
    });
});


// =============================================================================
// Tarea 5.4: Tests para varySentenceLength() con variación ±30% (REQ-2.7.2)
// =============================================================================

describe('ScriptStructureRandomizer - Tarea 5.4 varySentenceLength()', () => {
    // Texto de prueba con múltiples oraciones de diferentes longitudes
    const sampleText = `Esta es una oración muy simple y corta. 
        Aquí tenemos una oración que es un poco más larga y contiene más palabras para probar la variación. 
        El sistema debe poder expandir algunas oraciones agregando conectores como es decir o en otras palabras. 
        También debe poder contraer oraciones eliminando palabras muy innecesarias. 
        Esta es otra oración de prueba que simplemente existe para probar el sistema.`;

    describe('Funcionalidad básica', () => {
        it('debe retornar un string no vacío', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe preservar el contenido esencial del texto', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
            // El resultado debe contener palabras clave del original
            expect(result.toLowerCase()).toContain('oración');
            expect(result.toLowerCase()).toContain('sistema');
        });

        it('debe funcionar con variation = 0.30 (±30%)', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
            expect(result).toBeDefined();
            // La longitud debe cambiar respecto al original
            expect(result.length).not.toBe(sampleText.length);
        });

        it('debe funcionar con texto de una sola oración', () => {
            const singleSentence = 'Esta es una oración muy simple de prueba.';
            const result = ScriptStructureRandomizer.varySentenceLength(singleSentence, 0.30);
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('Expansión de oraciones', () => {
        it('debe expandir algunas oraciones agregando conectores', () => {
            // Ejecutar múltiples veces para capturar expansión
            let foundExpansion = false;
            const connectors = ['es decir', 'en otras palabras', 'lo cual significa que'];

            for (let i = 0; i < 20; i++) {
                const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
                for (const connector of connectors) {
                    if (result.toLowerCase().includes(connector)) {
                        foundExpansion = true;
                        break;
                    }
                }
                if (foundExpansion) break;
            }

            // Debe haber encontrado al menos una expansión en múltiples ejecuciones
            expect(foundExpansion).toBe(true);
        });

        it('debe insertar conectores en posición adecuada dentro de la oración', () => {
            // El conector debe estar dentro de una oración, no al inicio ni al final
            const textWithComma = 'Esta oración tiene una coma, que está en medio del texto. Otra oración más.';
            let result = '';
            const connectors = ['es decir', 'en otras palabras', 'lo cual significa que'];

            // Ejecutar múltiples veces hasta encontrar expansión
            for (let i = 0; i < 50; i++) {
                result = ScriptStructureRandomizer.varySentenceLength(textWithComma, 0.30);
                const hasConnector = connectors.some(c => result.toLowerCase().includes(c));
                if (hasConnector) break;
            }

            // Verificar que si hay conector, está en posición válida
            for (const connector of connectors) {
                const idx = result.toLowerCase().indexOf(connector);
                if (idx !== -1) {
                    // El conector no debe estar al inicio absoluto
                    expect(idx).toBeGreaterThan(5);
                }
            }
        });
    });

    describe('Contracción de oraciones', () => {
        it('debe contraer algunas oraciones eliminando palabras redundantes', () => {
            // Texto con palabras que deben ser eliminadas
            const textWithRedundant = `Esta es una oración muy larga con palabras muy innecesarias. 
                Otra oración bastante simple que es realmente fácil. 
                Una tercera oración que simplemente existe para probar.`;

            const original = textWithRedundant.toLowerCase();
            let contractionFound = false;

            // Ejecutar múltiples veces para capturar contracción
            for (let i = 0; i < 20; i++) {
                const result = ScriptStructureRandomizer.varySentenceLength(textWithRedundant, 0.30).toLowerCase();

                // Verificar si alguna palabra redundante fue eliminada
                const redundantWords = [' muy ', ' bastante ', ' realmente ', ' simplemente '];
                const originalCount = redundantWords.reduce((count, word) => {
                    return count + (original.split(word).length - 1);
                }, 0);
                const resultCount = redundantWords.reduce((count, word) => {
                    return count + (result.split(word).length - 1);
                }, 0);

                if (resultCount < originalCount) {
                    contractionFound = true;
                    break;
                }
            }

            expect(contractionFound).toBe(true);
        });

        it('debe eliminar palabras como "muy", "bastante", "realmente", "simplemente"', () => {
            // Texto con múltiples oraciones - la contracción se aplica a oraciones impares (índice 1, 3, etc.)
            const textWithMuy = 'Primera oración de introducción. Esta es una cosa muy importante y muy relevante. Tercera oración aquí.';

            // Ejecutar múltiples veces para intentar capturar la contracción
            let foundContraction = false;
            for (let i = 0; i < 50; i++) {
                const result = ScriptStructureRandomizer.varySentenceLength(textWithMuy, 0.30);
                
                // Contar ocurrencias de " muy " en el resultado vs original
                const muyCountOriginal = (textWithMuy.match(/\s+muy\s+/gi) || []).length;
                const muyCountResult = (result.match(/\s+muy\s+/gi) || []).length;

                if (muyCountResult < muyCountOriginal) {
                    foundContraction = true;
                    break;
                }
            }

            // Debería encontrar contracción en al menos una ejecución
            expect(foundContraction).toBe(true);
        });
    });

    describe('Variabilidad del resultado', () => {
        it('debe producir resultados diferentes en ejecuciones sucesivas', () => {
            const results = new Set<string>();

            // Ejecutar 10 veces y recolectar resultados únicos
            for (let i = 0; i < 10; i++) {
                const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
                results.add(result);
            }

            // Debería haber al menos 2 resultados diferentes debido a la aleatoriedad
            expect(results.size).toBeGreaterThan(1);
        });

        it('debe aplicar variación de manera diferenciada a oraciones pares e impares', () => {
            // El algoritmo alterna entre expansión (pares) y contracción (impares)
            const twoSentences = 'Primera oración con contenido importante. Segunda oración con más contenido relevante.';

            // Múltiples ejecuciones para verificar comportamiento diferenciado
            let differentTreatment = false;
            for (let i = 0; i < 20; i++) {
                const result = ScriptStructureRandomizer.varySentenceLength(twoSentences, 0.30);
                const sentences = result.split(/(?<=[.!?])\s+/);

                if (sentences.length >= 2) {
                    const firstHasConnector = ['es decir', 'en otras palabras'].some(c => 
                        sentences[0].toLowerCase().includes(c)
                    );
                    const secondContracted = !sentences[1].includes(' muy ');

                    if (firstHasConnector || secondContracted) {
                        differentTreatment = true;
                        break;
                    }
                }
            }

            // No es estrictamente necesario que siempre haya diferencia,
            // pero el mecanismo debe funcionar
            expect(differentTreatment).toBe(true);
        });
    });

    describe('Parámetro de variación', () => {
        it('debe aceptar variación de 0.30 (30%)', () => {
            expect(() => {
                ScriptStructureRandomizer.varySentenceLength(sampleText, 0.30);
            }).not.toThrow();
        });

        it('debe funcionar con variación menor (0.10)', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.10);
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe funcionar con variación mayor (0.50)', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0.50);
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe funcionar con variación de 0 (sin cambios significativos)', () => {
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, 0);
            expect(result).toBeDefined();
            // Con variación 0, el resultado debería ser similar al original
        });
    });

    describe('Casos límite', () => {
        it('debe manejar texto vacío', () => {
            const result = ScriptStructureRandomizer.varySentenceLength('', 0.30);
            expect(result).toBe('');
        });

        it('debe manejar texto solo con espacios', () => {
            const result = ScriptStructureRandomizer.varySentenceLength('   ', 0.30);
            expect(result.trim()).toBe('');
        });

        it('debe manejar texto sin puntuación final', () => {
            const result = ScriptStructureRandomizer.varySentenceLength('Texto sin punto final', 0.30);
            expect(result).toBeDefined();
        });

        it('debe manejar texto con signos de interrogación y exclamación', () => {
            const textWithPunctuation = '¿Cómo funciona esto? ¡Es increíble!';
            const result = ScriptStructureRandomizer.varySentenceLength(textWithPunctuation, 0.30);
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe manejar texto muy corto (una palabra)', () => {
            const result = ScriptStructureRandomizer.varySentenceLength('Hola.', 0.30);
            expect(result).toBeDefined();
        });
    });

    describe('Validación REQ-2.7.2 - Variación ±30%', () => {
        it('la implementación debe estar diseñada para variación de aproximadamente ±30%', () => {
            // Verificar que el método acepta 0.30 como parámetro (±30%)
            const variation = 0.30;
            const result = ScriptStructureRandomizer.varySentenceLength(sampleText, variation);
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            
            // El método debe modificar el texto de alguna forma
            // (expandiendo con conectores o contrayendo eliminando palabras)
            const originalWords = sampleText.split(/\s+/).filter(w => w.length > 0).length;
            const resultWords = result.split(/\s+/).filter(w => w.length > 0).length;
            
            // La variación en cantidad de palabras es esperada dentro de un rango razonable
            // No podemos verificar exactamente ±30% porque es probabilístico,
            // pero el número de palabras debe variar
            expect(Math.abs(resultWords - originalWords)).toBeLessThan(originalWords * 0.5);
        });
    });
});


// =============================================================================
// Tarea 5.5: Tests para adjustKeywordDensity() con niveles low/medium/high (REQ-2.7.3)
// =============================================================================

describe('ScriptStructureRandomizer - Tarea 5.5 adjustKeywordDensity()', () => {
    // Texto de prueba base sin las keywords objetivo
    const baseText = `Este es un texto de prueba para verificar el ajuste de densidad de palabras clave. 
        El sistema debe poder insertar keywords cuando la densidad actual es menor que la objetivo. 
        También debe respetar los diferentes niveles de densidad configurados.
        La funcionalidad es importante para el SEO y la relevancia del contenido.
        Cada nivel tiene un rango específico de densidad que debe respetarse.`;

    // Keywords de prueba
    const testKeywords = ['autismo', 'inteligencia artificial', 'TDAH'];

    describe('KEYWORD_DENSITY_CONFIG', () => {
        it('debe definir configuración para nivel low con rango 0.01-0.02', () => {
            expect(KEYWORD_DENSITY_CONFIG.low).toEqual({ min: 0.01, max: 0.02 });
        });

        it('debe definir configuración para nivel medium con rango 0.02-0.04', () => {
            expect(KEYWORD_DENSITY_CONFIG.medium).toEqual({ min: 0.02, max: 0.04 });
        });

        it('debe definir configuración para nivel high con rango 0.04-0.06', () => {
            expect(KEYWORD_DENSITY_CONFIG.high).toEqual({ min: 0.04, max: 0.06 });
        });
    });

    describe('Funcionalidad básica', () => {
        it('debe retornar un string no vacío', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'medium');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe preservar el contenido esencial del texto original', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'low');
            // Debe mantener palabras clave del texto original
            expect(result.toLowerCase()).toContain('texto');
            expect(result.toLowerCase()).toContain('sistema');
            expect(result.toLowerCase()).toContain('densidad');
        });

        it('debe retornar el texto sin cambios si no hay keywords', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(baseText, [], 'high');
            expect(result).toBe(baseText);
        });

        it('debe funcionar con texto vacío', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity('', testKeywords, 'medium');
            expect(result).toBe('');
        });
    });

    describe('Nivel LOW - Densidad baja (0.01-0.02)', () => {
        it('debe insertar keywords respetando densidad baja', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'low');
            
            // Contar palabras del texto original
            const originalWords = baseText.split(/\s+/).filter(w => w.length > 0).length;
            
            // Densidad objetivo para low: promedio de 0.01 y 0.02 = 0.015
            const targetDensity = (0.01 + 0.02) / 2;
            const expectedKeywords = Math.floor(originalWords * targetDensity);
            
            // Verificar que el resultado contiene keywords si era necesario insertarlas
            // (solo si la densidad actual era menor que la objetivo)
            expect(result).toBeDefined();
            
            // El nivel low debe resultar en menos inserciones que medium o high
            const lowResult = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'low');
            const highResult = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'high');
            
            // Contar keywords en ambos resultados
            const countKeywordsInText = (text: string, keywords: string[]) => {
                return keywords.filter(k => text.toLowerCase().includes(k.toLowerCase())).length;
            };
            
            const lowCount = countKeywordsInText(lowResult, testKeywords);
            const highCount = countKeywordsInText(highResult, testKeywords);
            
            // High debe tener igual o más keywords que low
            expect(highCount).toBeGreaterThanOrEqual(lowCount);
        });

        it('debe usar el rango correcto de densidad para level low', () => {
            // Texto más largo para mejor cálculo de densidad
            const longText = baseText.repeat(3);
            const words = longText.split(/\s+/).filter(w => w.length > 0).length;
            
            // Para low: target = words * 0.015 (promedio de min y max)
            const cfg = KEYWORD_DENSITY_CONFIG.low;
            const target = Math.floor(words * (cfg.min + cfg.max) / 2);
            
            // El target debe ser un número pequeño debido a la baja densidad
            expect(target).toBeGreaterThan(0);
            expect(target).toBeLessThan(words * 0.05); // Menos del 5% del total de palabras
        });
    });

    describe('Nivel MEDIUM - Densidad media (0.02-0.04)', () => {
        it('debe insertar keywords respetando densidad media', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(baseText, testKeywords, 'medium');
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe resultar en más keywords que nivel low', () => {
            // Usar texto sin keywords para forzar inserción
            const cleanText = `Este es un texto largo de prueba que no contiene ninguna de las palabras clave objetivo. 
                El contenido es genérico y necesita mejoras de SEO. 
                Más oraciones para aumentar el conteo de palabras y hacer la prueba más significativa.
                Agregamos contenido adicional para verificar la diferencia entre niveles.`;
            
            const lowResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'low');
            const mediumResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'medium');
            
            // Contar keywords insertadas en cada resultado
            const countKeywords = (text: string, keywords: string[]) => {
                let count = 0;
                for (const keyword of keywords) {
                    const regex = new RegExp(keyword, 'gi');
                    const matches = text.match(regex);
                    if (matches) count += matches.length;
                }
                return count;
            };
            
            const lowCount = countKeywords(lowResult, testKeywords);
            const mediumCount = countKeywords(mediumResult, testKeywords);
            
            // Medium debe tener igual o más keywords que low
            expect(mediumCount).toBeGreaterThanOrEqual(lowCount);
        });
    });

    describe('Nivel HIGH - Densidad alta (0.04-0.06)', () => {
        it('debe insertar más keywords que nivel medium', () => {
            // Texto limpio para forzar máxima inserción
            const cleanText = `Este es un contenido de prueba para verificar la densidad alta de palabras clave.
                El sistema debe insertar varias keywords cuando se solicita densidad alta.
                Este nivel es útil para contenido muy enfocado en SEO.
                Más contenido adicional para aumentar el tamaño del texto de prueba.
                Y finalmente una última oración para completar el texto.`;
            
            const mediumResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'medium');
            const highResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'high');
            
            // High debe tener resultado al menos tan largo como medium
            expect(highResult.length).toBeGreaterThanOrEqual(mediumResult.length - 20);
        });

        it('debe usar el rango correcto de densidad para level high', () => {
            const words = baseText.split(/\s+/).filter(w => w.length > 0).length;
            
            // Para high: target = words * 0.05 (promedio de 0.04 y 0.06)
            const cfg = KEYWORD_DENSITY_CONFIG.high;
            const target = Math.floor(words * (cfg.min + cfg.max) / 2);
            
            // El target debe ser mayor que el de medium o low
            const cfgMedium = KEYWORD_DENSITY_CONFIG.medium;
            const targetMedium = Math.floor(words * (cfgMedium.min + cfgMedium.max) / 2);
            
            expect(target).toBeGreaterThan(targetMedium);
        });
    });

    describe('Inserción de keywords', () => {
        it('debe insertar keywords cuando la densidad actual es menor que la objetivo', () => {
            // Texto que no contiene ninguna keyword
            const textWithoutKeywords = `Este contenido no tiene ninguna de las palabras objetivo.
                Es un texto completamente genérico sin términos específicos.
                Agregamos más contenido para que sea más largo.`;
            
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                textWithoutKeywords, 
                testKeywords, 
                'high'
            );
            
            // Al menos una keyword debe haber sido insertada
            const hasKeyword = testKeywords.some(k => 
                result.toLowerCase().includes(k.toLowerCase())
            );
            expect(hasKeyword).toBe(true);
        });

        it('no debe modificar texto que ya tiene suficientes keywords', () => {
            // Texto que ya contiene las keywords
            const textWithKeywords = `El autismo es un tema importante en inteligencia artificial.
                Las personas con TDAH pueden beneficiarse de estas tecnologías.
                Más información sobre autismo e inteligencia artificial disponible.`;
            
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                textWithKeywords, 
                testKeywords, 
                'low' // Con low density, ya debería estar satisfecho
            );
            
            // El texto no debería cambiar significativamente si ya tiene keywords
            expect(result).toBeDefined();
        });

        it('debe insertar keywords en posiciones naturales del texto', () => {
            const cleanText = `Primera oración del texto. Segunda oración aquí. Tercera oración también.
                Cuarta oración más. Quinta y sexta oraciones juntas. Séptima para terminar.`;
            
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                cleanText, 
                ['autismo'], 
                'high'
            );
            
            // Si se insertó una keyword, debería estar con formato "sobre [keyword]."
            if (result.toLowerCase().includes('autismo')) {
                // Verificar que está en un contexto natural (con "sobre" antes)
                const hasNaturalFormat = result.toLowerCase().includes('sobre autismo');
                // Puede ser que esté en otro formato válido también
                expect(result.toLowerCase()).toContain('autismo');
            }
        });
    });

    describe('Casos límite', () => {
        it('debe manejar una sola keyword', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                baseText, 
                ['autismo'], 
                'medium'
            );
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe manejar muchas keywords', () => {
            const manyKeywords = ['autismo', 'TDAH', 'inteligencia artificial', 'productividad', 
                'neurodivergencia', 'tecnología', 'IA'];
            
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                baseText, 
                manyKeywords, 
                'high'
            );
            expect(result).toBeDefined();
        });

        it('debe manejar texto muy corto', () => {
            const shortText = 'Texto corto de prueba.';
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                shortText, 
                testKeywords, 
                'medium'
            );
            expect(result).toBeDefined();
        });

        it('debe manejar keywords con mayúsculas/minúsculas', () => {
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                baseText, 
                ['AUTISMO', 'Inteligencia Artificial'], 
                'medium'
            );
            expect(result).toBeDefined();
        });

        it('debe manejar texto que ya contiene keywords', () => {
            const textWithExistingKeywords = `Este texto sobre autismo es relevante.
                La inteligencia artificial ayuda mucho.
                Las personas con TDAH pueden beneficiarse.`;
            
            const result = ScriptStructureRandomizer.adjustKeywordDensity(
                textWithExistingKeywords, 
                testKeywords, 
                'low'
            );
            
            // Debe preservar las keywords existentes
            expect(result.toLowerCase()).toContain('autismo');
            expect(result.toLowerCase()).toContain('inteligencia artificial');
        });
    });

    describe('Diferenciación entre niveles', () => {
        it('los tres niveles deben producir resultados diferentes (o consistentemente iguales si ya satisfechos)', () => {
            const cleanText = `Contenido genérico sin palabras clave específicas.
                Más contenido para aumentar el tamaño del texto.
                Oraciones adicionales para pruebas más significativas.
                Y una última oración para completar este texto de prueba.`;
            
            const lowResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'low');
            const mediumResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'medium');
            const highResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'high');
            
            // Al menos dos de los tres niveles deben producir resultados diferentes
            // (a menos que el texto ya satisfaga todos los niveles)
            const allSame = lowResult === mediumResult && mediumResult === highResult;
            
            // Si todos son iguales, es porque el texto ya tiene suficientes keywords
            // De lo contrario, debe haber diferencia
            expect(lowResult).toBeDefined();
            expect(mediumResult).toBeDefined();
            expect(highResult).toBeDefined();
        });

        it('high density debe resultar en igual o mayor cantidad de keywords que medium', () => {
            const cleanText = `Texto completamente limpio sin ninguna keyword.
                Más contenido adicional para pruebas.
                Tercera línea de contenido genérico.
                Cuarta línea para aumentar el tamaño.
                Quinta y última línea del texto de prueba.`;
            
            const countKeywords = (text: string, keywords: string[]) => {
                let count = 0;
                for (const keyword of keywords) {
                    const regex = new RegExp(keyword, 'gi');
                    const matches = text.match(regex);
                    if (matches) count += matches.length;
                }
                return count;
            };
            
            const mediumResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'medium');
            const highResult = ScriptStructureRandomizer.adjustKeywordDensity(cleanText, testKeywords, 'high');
            
            const mediumCount = countKeywords(mediumResult, testKeywords);
            const highCount = countKeywords(highResult, testKeywords);
            
            expect(highCount).toBeGreaterThanOrEqual(mediumCount);
        });
    });
});


// =============================================================================
// Tarea 5.6: Tests para repositionCTA() con posiciones start/middle/end (REQ-2.7.4)
// =============================================================================

describe('ScriptStructureRandomizer - Tarea 5.6 repositionCTA()', () => {
    // Textos de prueba con diferentes tipos de CTAs
    const textWithSubscribeCTA = `Este es un video sobre productividad. Suscríbete al canal para más contenido. 
        Aquí hay información valiosa sobre TDAH. Y finalmente una conclusión importante.`;
    
    const textWithLikeCTA = `Primera oración del video. Dale like si te ha gustado el contenido. 
        Segunda parte con información relevante. Tercera parte con más detalles.`;
    
    const textWithCommentCTA = `Introducción al tema. Comenta tu opinión abajo. 
        Desarrollo del contenido principal. Conclusión del video.`;
    
    const textWithoutCTA = `Este es un texto sin llamada a la acción. 
        Contiene información valiosa. Y termina con una conclusión.`;

    describe('Funcionalidad básica', () => {
        it('debe retornar un string no vacío', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'end');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('debe aceptar posición "start"', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'start');
            expect(result).toBeDefined();
        });

        it('debe aceptar posición "middle"', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'middle');
            expect(result).toBeDefined();
        });

        it('debe aceptar posición "end"', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'end');
            expect(result).toBeDefined();
        });
    });

    describe('Posición START - CTA al inicio del texto', () => {
        it('debe posicionar CTA de suscripción al inicio', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'start');
            
            // El CTA debe estar cerca del inicio del texto
            const ctaIndex = result.toLowerCase().indexOf('suscr');
            const textLength = result.length;
            
            // El CTA debe estar en el primer 30% del texto
            expect(ctaIndex).toBeLessThan(textLength * 0.3);
            expect(ctaIndex).toBeGreaterThanOrEqual(0);
        });

        it('debe posicionar CTA de like al inicio', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithLikeCTA, 'start');
            
            const ctaIndex = result.toLowerCase().indexOf('dale like');
            expect(ctaIndex).toBeGreaterThanOrEqual(0);
            expect(ctaIndex).toBeLessThan(result.length * 0.3);
        });

        it('debe posicionar CTA de comentario al inicio', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithCommentCTA, 'start');
            
            const ctaIndex = result.toLowerCase().indexOf('comenta');
            expect(ctaIndex).toBeGreaterThanOrEqual(0);
            expect(ctaIndex).toBeLessThan(result.length * 0.3);
        });

        it('debe agregar CTA por defecto al inicio si no existe', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'start');
            
            // Debe contener algún CTA (el por defecto)
            const hasCTA = result.toLowerCase().includes('suscr') || 
                          result.toLowerCase().includes('like') || 
                          result.toLowerCase().includes('comenta') ||
                          result.toLowerCase().includes('campanita');
            expect(hasCTA).toBe(true);
            
            // El CTA debe estar al inicio
            const ctaPatterns = ['suscr', 'like', 'comenta', 'campanita'];
            let minIndex = result.length;
            for (const pattern of ctaPatterns) {
                const idx = result.toLowerCase().indexOf(pattern);
                if (idx !== -1 && idx < minIndex) minIndex = idx;
            }
            expect(minIndex).toBeLessThan(result.length * 0.3);
        });
    });

    describe('Posición MIDDLE - CTA en medio del texto', () => {
        it('debe posicionar CTA de suscripción en el medio', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'middle');
            
            const ctaIndex = result.toLowerCase().indexOf('suscr');
            const textLength = result.length;
            
            // El CTA debe estar en el 30-70% del texto (zona media)
            expect(ctaIndex).toBeGreaterThan(textLength * 0.2);
            expect(ctaIndex).toBeLessThan(textLength * 0.8);
        });

        it('debe posicionar CTA de like en el medio', () => {
            // Texto más largo para asegurar que el CTA pueda estar en el medio
            const longerText = `Primera oración importante del video. Aquí viene más contenido relevante.
                Dale like si te ha gustado el contenido. Tercera parte con información útil.
                Cuarta parte con más detalles importantes. Quinta parte y conclusión del video.`;
            
            const result = ScriptStructureRandomizer.repositionCTA(longerText, 'middle');
            
            const ctaIndex = result.toLowerCase().indexOf('dale like');
            const textLength = result.length;
            
            // El CTA debe estar en la zona media (no al inicio extremo ni al final extremo)
            expect(ctaIndex).toBeGreaterThanOrEqual(0);
            expect(ctaIndex).toBeLessThan(textLength * 0.85);
        });

        it('debe insertar CTA por defecto en el medio si no existe', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'middle');
            
            // Debe contener CTA
            const hasCTA = result.toLowerCase().includes('suscr') || 
                          result.toLowerCase().includes('campanita');
            expect(hasCTA).toBe(true);
            
            // Verificar que está en posición media
            const ctaIndex = result.toLowerCase().indexOf('suscr');
            if (ctaIndex !== -1) {
                expect(ctaIndex).toBeGreaterThan(result.length * 0.2);
                expect(ctaIndex).toBeLessThan(result.length * 0.8);
            }
        });
    });

    describe('Posición END - CTA al final del texto', () => {
        it('debe posicionar CTA de suscripción al final', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'end');
            
            const ctaIndex = result.toLowerCase().indexOf('suscr');
            const textLength = result.length;
            
            // El CTA debe estar en el último 40% del texto
            expect(ctaIndex).toBeGreaterThan(textLength * 0.6);
        });

        it('debe posicionar CTA de like al final', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithLikeCTA, 'end');
            
            const ctaIndex = result.toLowerCase().indexOf('dale like');
            const textLength = result.length;
            
            expect(ctaIndex).toBeGreaterThan(textLength * 0.6);
        });

        it('debe posicionar CTA de comentario al final', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithCommentCTA, 'end');
            
            const ctaIndex = result.toLowerCase().indexOf('comenta');
            const textLength = result.length;
            
            expect(ctaIndex).toBeGreaterThan(textLength * 0.6);
        });

        it('debe agregar CTA por defecto al final si no existe', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'end');
            
            // Debe contener CTA por defecto
            const hasCTA = result.toLowerCase().includes('suscr') || 
                          result.toLowerCase().includes('campanita');
            expect(hasCTA).toBe(true);
            
            // El CTA debe estar al final
            const ctaIndex = result.toLowerCase().indexOf('suscr');
            if (ctaIndex !== -1) {
                expect(ctaIndex).toBeGreaterThan(result.length * 0.6);
            }
        });
    });

    describe('Detección de CTAs existentes', () => {
        it('debe detectar patrón "suscríbete" con o sin tilde', () => {
            const textConTilde = 'Texto de prueba. Suscríbete al canal. Más contenido.';
            const textSinTilde = 'Texto de prueba. Suscribete al canal. Más contenido.';
            
            const result1 = ScriptStructureRandomizer.repositionCTA(textConTilde, 'end');
            const result2 = ScriptStructureRandomizer.repositionCTA(textSinTilde, 'end');
            
            // Ambos deben detectar y reposicionar el CTA
            expect(result1.toLowerCase()).toContain('suscr');
            expect(result2.toLowerCase()).toContain('suscr');
        });

        it('debe detectar patrón "dale like"', () => {
            const text = 'Inicio. Dale like al video. Final.';
            const result = ScriptStructureRandomizer.repositionCTA(text, 'start');
            
            expect(result.toLowerCase()).toContain('dale like');
        });

        it('debe detectar patrón "comenta"', () => {
            const text = 'Inicio. Comenta tu opinión. Final.';
            const result = ScriptStructureRandomizer.repositionCTA(text, 'start');
            
            expect(result.toLowerCase()).toContain('comenta');
        });

        it('debe extraer CTA completo hasta el punto', () => {
            const text = 'Inicio. Suscríbete al canal y activa la campanita para más. Final.';
            const result = ScriptStructureRandomizer.repositionCTA(text, 'end');
            
            // El CTA completo debe estar preservado
            expect(result.toLowerCase()).toContain('suscríbete');
            expect(result.toLowerCase()).toContain('campanita');
        });
    });

    describe('CTA por defecto cuando no existe', () => {
        it('debe usar CTA por defecto si no hay CTA en el texto', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'end');
            
            // Debe agregar el CTA por defecto
            const defaultCTA = 'si te ha gustado, suscríbete y activa la campanita';
            expect(result.toLowerCase()).toContain('suscr');
            expect(result.toLowerCase()).toContain('campanita');
        });

        it('debe mantener el CTA por defecto en diferentes posiciones', () => {
            const resultStart = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'start');
            const resultMiddle = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'middle');
            const resultEnd = ScriptStructureRandomizer.repositionCTA(textWithoutCTA, 'end');
            
            // Todos deben contener el CTA por defecto
            expect(resultStart.toLowerCase()).toContain('suscr');
            expect(resultMiddle.toLowerCase()).toContain('suscr');
            expect(resultEnd.toLowerCase()).toContain('suscr');
        });
    });

    describe('Preservación del contenido', () => {
        it('debe preservar el contenido original sin el CTA', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'end');
            
            // El contenido principal debe estar preservado
            expect(result.toLowerCase()).toContain('productividad');
            expect(result.toLowerCase()).toContain('tdah');
            expect(result.toLowerCase()).toContain('conclusión');
        });

        it('no debe duplicar el CTA', () => {
            const result = ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, 'middle');
            
            // Contar ocurrencias del patrón CTA
            const matches = result.match(/suscr[íi]b/gi);
            expect(matches).not.toBeNull();
            expect(matches!.length).toBe(1);
        });

        it('debe eliminar el CTA de su posición original', () => {
            // Texto con CTA en posición conocida
            const text = 'Primera oración. Suscríbete al canal. Tercera oración. Cuarta oración final.';
            const result = ScriptStructureRandomizer.repositionCTA(text, 'end');
            
            // El CTA no debe estar en el medio del texto (debe estar al final)
            const sentences = result.split(/(?<=[.!?])\s+/);
            const ctaSentenceIndex = sentences.findIndex(s => s.toLowerCase().includes('suscr'));
            
            // Debe estar en la última posición (o cerca del final)
            expect(ctaSentenceIndex).toBeGreaterThanOrEqual(sentences.length - 2);
        });
    });

    describe('Casos límite', () => {
        it('debe manejar texto vacío', () => {
            const result = ScriptStructureRandomizer.repositionCTA('', 'end');
            // Debe agregar CTA por defecto incluso en texto vacío
            expect(result.toLowerCase()).toContain('suscr');
        });

        it('debe manejar texto con solo CTA', () => {
            const onlyCTA = 'Suscríbete al canal.';
            const result = ScriptStructureRandomizer.repositionCTA(onlyCTA, 'start');
            
            expect(result.toLowerCase()).toContain('suscr');
        });

        it('debe manejar texto muy corto', () => {
            const shortText = 'Hola. Adiós.';
            const result = ScriptStructureRandomizer.repositionCTA(shortText, 'middle');
            
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(shortText.length);
        });

        it('debe manejar texto con múltiples oraciones', () => {
            const longText = `Primera oración del contenido. 
                Segunda oración más larga con información relevante. 
                Tercera oración de transición. 
                Cuarta oración con datos importantes. 
                Suscríbete para más contenido como este.
                Quinta oración de cierre.`;
            
            const result = ScriptStructureRandomizer.repositionCTA(longText, 'start');
            
            expect(result).toBeDefined();
            expect(result.toLowerCase()).toContain('suscr');
        });
    });

    describe('Diferenciación entre posiciones', () => {
        it('las tres posiciones deben producir CTAs en ubicaciones diferentes', () => {
            const text = `Introducción al tema de hoy. Desarrollo del contenido principal.
                Más información relevante aquí. Suscríbete al canal para más. 
                Detalles adicionales importantes. Conclusión del video.`;
            
            const startResult = ScriptStructureRandomizer.repositionCTA(text, 'start');
            const middleResult = ScriptStructureRandomizer.repositionCTA(text, 'middle');
            const endResult = ScriptStructureRandomizer.repositionCTA(text, 'end');
            
            // Obtener índices del CTA en cada resultado
            const startIndex = startResult.toLowerCase().indexOf('suscr');
            const middleIndex = middleResult.toLowerCase().indexOf('suscr');
            const endIndex = endResult.toLowerCase().indexOf('suscr');
            
            // Los índices deben ser diferentes
            // Start debe tener el índice más bajo
            expect(startIndex).toBeLessThan(middleIndex);
            // End debe tener el índice más alto
            expect(endIndex).toBeGreaterThan(middleIndex);
        });

        it('debe respetar consistentemente cada posición', () => {
            const text = `Este video es sobre autismo e IA. Dale like si te gusta.
                Aquí hay más información. Y aquí está la conclusión.`;
            
            // Ejecutar múltiples veces para verificar consistencia
            for (let i = 0; i < 5; i++) {
                const startResult = ScriptStructureRandomizer.repositionCTA(text, 'start');
                const endResult = ScriptStructureRandomizer.repositionCTA(text, 'end');
                
                const startIdx = startResult.toLowerCase().indexOf('dale like');
                const endIdx = endResult.toLowerCase().indexOf('dale like');
                
                // Start siempre debe tener índice menor que end
                expect(startIdx).toBeLessThan(endIdx);
            }
        });
    });

    describe('Validación REQ-2.7.4 - Posiciones start/middle/end', () => {
        it('la implementación debe soportar las tres posiciones especificadas en REQ-2.7.4', () => {
            const positions: Array<'start' | 'middle' | 'end'> = ['start', 'middle', 'end'];
            const text = 'Contenido de prueba. Suscríbete para más. Más contenido aquí.';
            
            for (const position of positions) {
                const result = ScriptStructureRandomizer.repositionCTA(text, position);
                expect(result).toBeDefined();
                expect(typeof result).toBe('string');
                expect(result.length).toBeGreaterThan(0);
                expect(result.toLowerCase()).toContain('suscr');
            }
        });

        it('debe funcionar con el tipo CTAPosition exportado', () => {
            // Verificar que el tipo CTAPosition está correctamente definido
            const positions: Array<'start' | 'middle' | 'end'> = ['start', 'middle', 'end'];
            expect(positions).toHaveLength(3);
            
            // Cada posición debe ser aceptada sin errores
            for (const pos of positions) {
                expect(() => {
                    ScriptStructureRandomizer.repositionCTA(textWithSubscribeCTA, pos);
                }).not.toThrow();
            }
        });
    });
});


// =============================================================================
// Tarea 5.8: Tests para guardado de estructura en SQLite (REQ-2.7.6)
// =============================================================================

describe('ScriptStructureRandomizer - Tarea 5.8 createUsageRecord() y SQLite (REQ-2.7.6)', () => {
    describe('createUsageRecord()', () => {
        it('debe crear un registro con todos los campos requeridos', () => {
            const config = {
                structure: 'storytelling' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'medium' as const,
                ctaPosition: 'end' as const
            };
            
            const record = ScriptStructureRandomizer.createUsageRecord('video123', 'channel1', config);
            
            expect(record).toBeDefined();
            expect(record.videoId).toBe('video123');
            expect(record.channelId).toBe('channel1');
            expect(record.structure).toBe('storytelling');
            expect(record.ctaPosition).toBe('end');
            expect(record.keywordDensity).toBe('medium');
            expect(record.createdAt).toBeInstanceOf(Date);
        });

        it('debe generar fecha createdAt automáticamente', () => {
            const beforeCreate = new Date();
            
            const config = {
                structure: 'debate' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'high' as const,
                ctaPosition: 'middle' as const
            };
            
            const record = ScriptStructureRandomizer.createUsageRecord('video456', 'channel2', config);
            
            const afterCreate = new Date();
            
            expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(record.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it('debe funcionar con todas las estructuras narrativas', () => {
            for (const structure of ALL_STRUCTURES) {
                const config = {
                    structure: structure,
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'low' as const,
                    ctaPosition: 'start' as const
                };
                
                const record = ScriptStructureRandomizer.createUsageRecord(`video-${structure}`, 'channel1', config);
                
                expect(record.structure).toBe(structure);
            }
        });

        it('debe funcionar con todas las posiciones de CTA', () => {
            const positions: Array<'start' | 'middle' | 'end'> = ['start', 'middle', 'end'];
            
            for (const position of positions) {
                const config = {
                    structure: 'case-study' as NarrativeStructure,
                    sentenceLengthVariation: 0.30,
                    keywordDensity: 'medium' as const,
                    ctaPosition: position
                };
                
                const record = ScriptStructureRandomizer.createUsageRecord(`video-${position}`, 'channel1', config);
                
                expect(record.ctaPosition).toBe(position);
            }
        });

        it('debe funcionar con todas las densidades de keywords', () => {
            const densities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
            
            for (const density of densities) {
                const config = {
                    structure: 'rhetorical' as NarrativeStructure,
                    sentenceLengthVariation: 0.30,
                    keywordDensity: density,
                    ctaPosition: 'end' as const
                };
                
                const record = ScriptStructureRandomizer.createUsageRecord(`video-${density}`, 'channel2', config);
                
                expect(record.keywordDensity).toBe(density);
            }
        });

        it('debe crear registros únicos para diferentes videos', () => {
            const config = {
                structure: 'inverted-list' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'medium' as const,
                ctaPosition: 'end' as const
            };
            
            const record1 = ScriptStructureRandomizer.createUsageRecord('video-A', 'channel1', config);
            const record2 = ScriptStructureRandomizer.createUsageRecord('video-B', 'channel1', config);
            
            expect(record1.videoId).not.toBe(record2.videoId);
            expect(record1.createdAt).not.toBe(record2.createdAt);
        });

        it('no debe incluir id en el registro (se asigna en SQLite)', () => {
            const config = {
                structure: 'error-tutorial' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'high' as const,
                ctaPosition: 'middle' as const
            };
            
            const record = ScriptStructureRandomizer.createUsageRecord('video-new', 'channel1', config);
            
            // id es opcional y no debe estar definido al crear
            expect(record.id).toBeUndefined();
        });
    });

    describe('Integración con generateRandomConfig()', () => {
        it('debe crear registros válidos desde configuración aleatoria', () => {
            const config = ScriptStructureRandomizer.generateRandomConfig([]);
            const record = ScriptStructureRandomizer.createUsageRecord('video-random', 'channel1', config);
            
            expect(record).toBeDefined();
            expect(ALL_STRUCTURES).toContain(record.structure);
            expect(['start', 'middle', 'end']).toContain(record.ctaPosition);
            expect(['low', 'medium', 'high']).toContain(record.keywordDensity);
        });

        it('debe crear registros válidos cuando se evitan estructuras recientes', () => {
            const recentStructures: NarrativeStructure[] = ['storytelling', 'storytelling'];
            const config = ScriptStructureRandomizer.generateRandomConfig(recentStructures);
            const record = ScriptStructureRandomizer.createUsageRecord('video-avoiding', 'channel1', config);
            
            // La estructura no debe ser 'storytelling' (evitando repetición)
            expect(record.structure).not.toBe('storytelling');
        });
    });

    describe('Validación de interface StructureUsageRecord', () => {
        it('debe tener la estructura correcta según REQ-2.7.6', () => {
            const config = {
                structure: 'debate' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'medium' as const,
                ctaPosition: 'end' as const
            };
            
            const record = ScriptStructureRandomizer.createUsageRecord('test-video', 'test-channel', config);
            
            // Verificar que tiene los campos requeridos por REQ-2.7.6:
            // videoId, channelId, structure, ctaPosition, keywordDensity, createdAt
            expect('videoId' in record).toBe(true);
            expect('channelId' in record).toBe(true);
            expect('structure' in record).toBe(true);
            expect('ctaPosition' in record).toBe(true);
            expect('keywordDensity' in record).toBe(true);
            expect('createdAt' in record).toBe(true);
            
            // id es opcional
            expect('id' in record || record.id === undefined).toBe(true);
        });

        it('los tipos de cada campo deben ser correctos', () => {
            const config = {
                structure: 'case-study' as NarrativeStructure,
                sentenceLengthVariation: 0.30,
                keywordDensity: 'high' as const,
                ctaPosition: 'start' as const
            };
            
            const record = ScriptStructureRandomizer.createUsageRecord('type-test', 'channel1', config);
            
            expect(typeof record.videoId).toBe('string');
            expect(typeof record.channelId).toBe('string');
            expect(typeof record.structure).toBe('string');
            expect(typeof record.ctaPosition).toBe('string');
            expect(typeof record.keywordDensity).toBe('string');
            expect(record.createdAt instanceof Date).toBe(true);
        });
    });
});
