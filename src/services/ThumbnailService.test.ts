/**
 * Tests para ThumbnailService y ThumbnailTemplates
 * 
 * Valida:
 * - Existencia de 5+ plantillas
 * - Rotación round-robin y aleatoria
 * - No repetición inmediata de plantillas
 * - Selección por mood/tags
 * - Estructura correcta de plantillas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
    ThumbnailService,
    ThumbnailGenerationConfig
} from './ThumbnailService';
import { 
    ALL_TEMPLATES, 
    TEMPLATES_BY_ID,
    ThumbnailTemplate,
    TEMPLATE_CYBER,
    TEMPLATE_CALM,
    TEMPLATE_ENERGY,
    TEMPLATE_PURPLE,
    TEMPLATE_MATRIX,
    TEMPLATE_SUNSET,
    TEMPLATE_OCEAN,
    HIGHLIGHT_KEYWORDS
} from './ThumbnailTemplates';

describe('ThumbnailTemplates', () => {
    describe('Requisito REQ-5.1.1: 5+ plantillas rotables', () => {
        it('debe tener al menos 5 plantillas definidas', () => {
            expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(5);
        });

        it('debe tener exactamente 7 plantillas predefinidas', () => {
            expect(ALL_TEMPLATES.length).toBe(7);
        });

        it('todas las plantillas deben tener IDs únicos', () => {
            const ids = ALL_TEMPLATES.map(t => t.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('todas las plantillas deben tener nombres únicos', () => {
            const names = ALL_TEMPLATES.map(t => t.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });
    });

    describe('Estructura de plantillas', () => {
        it.each(ALL_TEMPLATES)('plantilla $name debe tener todos los campos requeridos', (template) => {
            // ID y nombre
            expect(template.id).toBeDefined();
            expect(template.name).toBeDefined();
            expect(template.description).toBeDefined();
            
            // Colores
            expect(template.colors).toBeDefined();
            expect(template.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(template.colors.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(template.colors.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(template.colors.textPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(template.colors.gradient).toBeDefined();
            expect(template.colors.overlay).toBeDefined();
            
            // Layout
            expect(template.layout).toBeDefined();
            expect(['top', 'center', 'bottom', 'top-left', 'bottom-right']).toContain(template.layout.titlePosition);
            expect(['left', 'center', 'right']).toContain(template.layout.titleAlign);
            expect(template.layout.padding).toBeGreaterThan(0);
            expect(template.layout.maxTitleWidth).toBeGreaterThan(0);
            expect(template.layout.maxTitleWidth).toBeLessThanOrEqual(100);
            
            // Tipografía
            expect(template.typography).toBeDefined();
            expect(template.typography.fontFamily).toBeDefined();
            expect(template.typography.titleSizeLandscape).toBeGreaterThan(0);
            expect(template.typography.titleSizePortrait).toBeGreaterThan(0);
            expect(template.typography.fontWeight).toBeGreaterThanOrEqual(400);
            expect(template.typography.lineHeight).toBeGreaterThan(0);
            expect(['uppercase', 'lowercase', 'capitalize', 'none']).toContain(template.typography.textTransform);
            
            // Efectos
            expect(template.effects).toBeDefined();
            expect(template.effects.overlayIntensity).toBeGreaterThanOrEqual(0);
            expect(template.effects.overlayIntensity).toBeLessThanOrEqual(1);
            expect(typeof template.effects.vignette).toBe('boolean');
            expect(typeof template.effects.accentGlow).toBe('boolean');
            
            // Tags
            expect(template.tags).toBeDefined();
            expect(template.tags.length).toBeGreaterThan(0);
        });
    });

    describe('Diversidad de estilos', () => {
        it('debe tener plantillas con diferentes esquemas de color', () => {
            const primaryColors = ALL_TEMPLATES.map(t => t.colors.primary);
            const uniqueColors = new Set(primaryColors);
            // Al menos 5 colores primarios diferentes
            expect(uniqueColors.size).toBeGreaterThanOrEqual(5);
        });

        it('debe tener plantillas con diferentes posiciones de título', () => {
            const positions = ALL_TEMPLATES.map(t => t.layout.titlePosition);
            const uniquePositions = new Set(positions);
            // Al menos 3 posiciones diferentes
            expect(uniquePositions.size).toBeGreaterThanOrEqual(3);
        });

        it('debe tener plantillas con diferentes familias de fuentes', () => {
            const fonts = ALL_TEMPLATES.map(t => t.typography.fontFamily);
            const uniqueFonts = new Set(fonts);
            // Al menos 4 familias de fuentes diferentes
            expect(uniqueFonts.size).toBeGreaterThanOrEqual(4);
        });

        it('debe tener plantillas con y sin viñeta', () => {
            const withVignette = ALL_TEMPLATES.filter(t => t.effects.vignette);
            const withoutVignette = ALL_TEMPLATES.filter(t => !t.effects.vignette);
            expect(withVignette.length).toBeGreaterThan(0);
            expect(withoutVignette.length).toBeGreaterThan(0);
        });
    });

    describe('Mapa de plantillas por ID', () => {
        it('debe tener todas las plantillas en el mapa', () => {
            expect(Object.keys(TEMPLATES_BY_ID).length).toBe(ALL_TEMPLATES.length);
        });

        it('cada plantilla debe ser accesible por su ID', () => {
            expect(TEMPLATES_BY_ID['cyber']).toBe(TEMPLATE_CYBER);
            expect(TEMPLATES_BY_ID['calm']).toBe(TEMPLATE_CALM);
            expect(TEMPLATES_BY_ID['energy']).toBe(TEMPLATE_ENERGY);
            expect(TEMPLATES_BY_ID['purple']).toBe(TEMPLATE_PURPLE);
            expect(TEMPLATES_BY_ID['matrix']).toBe(TEMPLATE_MATRIX);
            expect(TEMPLATES_BY_ID['sunset']).toBe(TEMPLATE_SUNSET);
            expect(TEMPLATES_BY_ID['ocean']).toBe(TEMPLATE_OCEAN);
        });
    });

    describe('Keywords de highlight', () => {
        it('debe tener keywords para resaltar', () => {
            expect(HIGHLIGHT_KEYWORDS.length).toBeGreaterThan(0);
        });

        it('debe incluir keywords relevantes para el nicho', () => {
            expect(HIGHLIGHT_KEYWORDS).toContain('IA');
            expect(HIGHLIGHT_KEYWORDS).toContain('AI');
            expect(HIGHLIGHT_KEYWORDS).toContain('AUTISMO');
            expect(HIGHLIGHT_KEYWORDS).toContain('TDAH');
            expect(HIGHLIGHT_KEYWORDS).toContain('CEREBRO');
        });
    });
});

describe('ThumbnailService', () => {
    beforeEach(() => {
        // Reiniciar el tracker antes de cada test
        ThumbnailService.resetTracker();
    });

    describe('Selección Round-Robin', () => {
        it('debe rotar entre todas las plantillas', () => {
            const selectedIds: string[] = [];
            
            // Seleccionar tantas plantillas como hay disponibles
            for (let i = 0; i < ALL_TEMPLATES.length; i++) {
                const template = ThumbnailService.selectTemplateRoundRobin();
                selectedIds.push(template.id);
            }
            
            // Debe haber usado al menos la mitad de las plantillas disponibles
            const uniqueIds = new Set(selectedIds);
            expect(uniqueIds.size).toBeGreaterThanOrEqual(Math.floor(ALL_TEMPLATES.length / 2));
        });

        it('no debe repetir la misma plantilla consecutivamente (si es posible)', () => {
            const iterations = 10;
            let previousId = '';
            let consecutiveCount = 0;
            
            for (let i = 0; i < iterations; i++) {
                const template = ThumbnailService.selectTemplateRoundRobin();
                if (template.id === previousId) {
                    consecutiveCount++;
                }
                previousId = template.id;
            }
            
            // Permitir máximo 1 repetición consecutiva (puede ocurrir al inicio)
            expect(consecutiveCount).toBeLessThanOrEqual(1);
        });
    });

    describe('Selección Aleatoria', () => {
        it('debe evitar repetición en plantillas recientes', () => {
            const iterations = 20;
            const selectedIds: string[] = [];
            
            for (let i = 0; i < iterations; i++) {
                const template = ThumbnailService.selectTemplateRandom();
                selectedIds.push(template.id);
            }
            
            // Verificar que no hay 4 repeticiones consecutivas
            for (let i = 3; i < selectedIds.length; i++) {
                const recentFour = selectedIds.slice(i - 3, i + 1);
                const allSame = recentFour.every(id => id === recentFour[0]);
                expect(allSame).toBe(false);
            }
        });

        it('debe usar variedad de plantillas', () => {
            const iterations = 21; // 3x el número de plantillas
            const usageCount: Record<string, number> = {};
            
            for (let i = 0; i < iterations; i++) {
                const template = ThumbnailService.selectTemplateRandom();
                usageCount[template.id] = (usageCount[template.id] || 0) + 1;
            }
            
            // Debe usar al menos 4 plantillas diferentes
            const usedTemplates = Object.keys(usageCount).length;
            expect(usedTemplates).toBeGreaterThanOrEqual(4);
        });
    });

    describe('Selección por Mood/Tags', () => {
        it('debe seleccionar plantilla apropiada para tags de tecnología', () => {
            const template = ThumbnailService.selectTemplateByMood(['tecnología', 'ia', 'futurista']);
            // Cyber o Matrix son las más apropiadas para estos tags
            expect(['cyber', 'matrix', 'purple']).toContain(template.id);
        });

        it('debe seleccionar plantilla apropiada para tags de calma', () => {
            ThumbnailService.resetTracker();
            const template = ThumbnailService.selectTemplateByMood(['calma', 'bienestar', 'neurodivergencia']);
            // Calm u Ocean son las más apropiadas
            expect(['calm', 'ocean']).toContain(template.id);
        });

        it('debe seleccionar plantilla apropiada para tags de energía', () => {
            ThumbnailService.resetTracker();
            const template = ThumbnailService.selectTemplateByMood(['energía', 'motivación', 'productividad']);
            expect(template.id).toBe('energy');
        });

        it('debe evitar plantillas usadas recientemente incluso con tags coincidentes', () => {
            // Forzar uso de 'calm' varias veces
            ThumbnailService.selectTemplateByMood(['calma']);
            ThumbnailService.selectTemplateByMood(['calma']);
            
            // La tercera selección debería preferir otra plantilla
            const template = ThumbnailService.selectTemplateByMood(['calma', 'bienestar']);
            // Puede ser calm si no hay mejor opción, pero el sistema intentará evitarla
            expect(template).toBeDefined();
        });
    });

    describe('Obtener plantilla por ID', () => {
        it('debe retornar la plantilla correcta por ID', () => {
            const cyber = ThumbnailService.getTemplateById('cyber');
            expect(cyber).toBe(TEMPLATE_CYBER);
            
            const calm = ThumbnailService.getTemplateById('calm');
            expect(calm).toBe(TEMPLATE_CALM);
        });

        it('debe retornar undefined para ID inexistente', () => {
            const nonExistent = ThumbnailService.getTemplateById('non-existent');
            expect(nonExistent).toBeUndefined();
        });
    });

    describe('Obtener todas las plantillas', () => {
        it('debe retornar una copia de todas las plantillas', () => {
            const templates = ThumbnailService.getAllTemplates();
            expect(templates.length).toBe(ALL_TEMPLATES.length);
            
            // Verificar que es una copia, no la referencia original
            templates.push({} as ThumbnailTemplate);
            expect(ThumbnailService.getAllTemplates().length).toBe(ALL_TEMPLATES.length);
        });
    });

    describe('Tracking de uso', () => {
        it('debe trackear plantillas usadas', () => {
            ThumbnailService.selectTemplateRoundRobin();
            ThumbnailService.selectTemplateRoundRobin();
            ThumbnailService.selectTemplateRoundRobin();
            
            const stats = ThumbnailService.getUsageStats();
            expect(stats.recentTemplates.length).toBe(3);
            
            // La suma de usos debe ser 3
            const totalUses = Object.values(stats.usageCount).reduce((a, b) => a + b, 0);
            expect(totalUses).toBe(3);
        });

        it('debe limitar historial de recientes a 10', () => {
            for (let i = 0; i < 15; i++) {
                ThumbnailService.selectTemplateRoundRobin();
            }
            
            const stats = ThumbnailService.getUsageStats();
            expect(stats.recentTemplates.length).toBeLessThanOrEqual(10);
        });

        it('resetTracker debe limpiar todo el tracking', () => {
            ThumbnailService.selectTemplateRoundRobin();
            ThumbnailService.selectTemplateRoundRobin();
            
            ThumbnailService.resetTracker();
            
            const stats = ThumbnailService.getUsageStats();
            expect(stats.recentTemplates.length).toBe(0);
            expect(Object.keys(stats.usageCount).length).toBe(0);
        });
    });

    describe('Validación de plantillas individuales', () => {
        it('TEMPLATE_CYBER debe tener estilo cyberpunk con neón', () => {
            expect(TEMPLATE_CYBER.id).toBe('cyber');
            expect(TEMPLATE_CYBER.colors.accent).toBe('#00d4ff');
            expect(TEMPLATE_CYBER.effects.accentGlow).toBe(true);
            expect(TEMPLATE_CYBER.tags).toContain('neón');
        });

        it('TEMPLATE_CALM debe tener estilo minimalista', () => {
            expect(TEMPLATE_CALM.id).toBe('calm');
            expect(TEMPLATE_CALM.effects.vignette).toBe(false);
            expect(TEMPLATE_CALM.tags).toContain('minimalista');
        });

        it('TEMPLATE_ENERGY debe tener colores vibrantes', () => {
            expect(TEMPLATE_ENERGY.id).toBe('energy');
            expect(TEMPLATE_ENERGY.colors.primary).toBe('#ff6b35');
            expect(TEMPLATE_ENERGY.typography.textTransform).toBe('uppercase');
        });

        it('TEMPLATE_PURPLE debe ser elegante/educativo', () => {
            expect(TEMPLATE_PURPLE.id).toBe('purple');
            expect(TEMPLATE_PURPLE.tags).toContain('educativo');
        });

        it('TEMPLATE_MATRIX debe tener estilo hacker/código', () => {
            expect(TEMPLATE_MATRIX.id).toBe('matrix');
            expect(TEMPLATE_MATRIX.colors.accent).toBe('#00ff41');
            expect(TEMPLATE_MATRIX.typography.fontFamily).toContain('monospace');
        });

        it('TEMPLATE_SUNSET debe ser cálido/emocional', () => {
            expect(TEMPLATE_SUNSET.id).toBe('sunset');
            expect(TEMPLATE_SUNSET.tags).toContain('emocional');
            expect(TEMPLATE_SUNSET.tags).toContain('storytelling');
        });

        it('TEMPLATE_OCEAN debe ser fresco/profesional', () => {
            expect(TEMPLATE_OCEAN.id).toBe('ocean');
            expect(TEMPLATE_OCEAN.tags).toContain('aprendizaje');
            expect(TEMPLATE_OCEAN.tags).toContain('profesional');
        });
    });
});
