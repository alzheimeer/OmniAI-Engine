/**
 * ChannelBranding.test.ts
 * 
 * Tests para el sistema de branding específico por canal.
 * REQ-5.1.4: Generar thumbnail específico por canal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    ChannelBrandingService,
    ChannelId,
    CHANNEL1_BRANDING,
    CHANNEL2_BRANDING,
    CHANNEL_BRANDING_MAP
} from './ChannelBranding';
import { ALL_TEMPLATES, TEMPLATES_BY_ID } from './ThumbnailTemplates';

describe('ChannelBranding', () => {
    describe('Configuración de canales', () => {
        it('debe tener configuración para canal 1 (NeuroSync AI)', () => {
            expect(CHANNEL1_BRANDING).toBeDefined();
            expect(CHANNEL1_BRANDING.info.id).toBe('channel1');
            expect(CHANNEL1_BRANDING.info.name).toBe('NeuroSync AI');
            expect(CHANNEL1_BRANDING.info.niche).toContain('Autismo');
        });

        it('debe tener configuración para canal 2 (NeuroTech AI)', () => {
            expect(CHANNEL2_BRANDING).toBeDefined();
            expect(CHANNEL2_BRANDING.info.id).toBe('channel2');
            expect(CHANNEL2_BRANDING.info.name).toBe('NeuroTech AI');
            expect(CHANNEL2_BRANDING.info.niche).toContain('TDAH');
        });

        it('los canales deben tener colores diferentes', () => {
            expect(CHANNEL1_BRANDING.colors.accent).not.toBe(CHANNEL2_BRANDING.colors.accent);
            expect(CHANNEL1_BRANDING.colors.primary).not.toBe(CHANNEL2_BRANDING.colors.primary);
        });

        it('los canales deben tener keywords de resaltado específicos', () => {
            // Canal 1 debe incluir keywords relacionados con autismo
            expect(CHANNEL1_BRANDING.info.highlightKeywords).toContain('AUTISMO');
            expect(CHANNEL1_BRANDING.info.highlightKeywords).toContain('TEA');
            
            // Canal 2 debe incluir keywords relacionados con TDAH
            expect(CHANNEL2_BRANDING.info.highlightKeywords).toContain('TDAH');
            expect(CHANNEL2_BRANDING.info.highlightKeywords).toContain('PRODUCTIVIDAD');
        });

        it('los canales deben tener plantillas preferidas diferentes', () => {
            // Canal 1 prefiere plantillas calmadas
            expect(CHANNEL1_BRANDING.preferredTemplates).toContain('calm');
            
            // Canal 2 prefiere plantillas energéticas
            expect(CHANNEL2_BRANDING.preferredTemplates).toContain('energy');
        });

        it('los canales deben tener emojis característicos diferentes', () => {
            // Canal 1 tiene emojis relacionados con calma/cerebro
            expect(CHANNEL1_BRANDING.signatureEmojis).toContain('🧠');
            expect(CHANNEL1_BRANDING.signatureEmojis).toContain('💙');
            
            // Canal 2 tiene emojis relacionados con energía
            expect(CHANNEL2_BRANDING.signatureEmojis).toContain('🔥');
            expect(CHANNEL2_BRANDING.signatureEmojis).toContain('⚡');
        });
    });

    describe('ChannelBrandingService.getBranding', () => {
        it('debe retornar el branding correcto para channel1', () => {
            const branding = ChannelBrandingService.getBranding('channel1');
            expect(branding).toBe(CHANNEL1_BRANDING);
        });

        it('debe retornar el branding correcto para channel2', () => {
            const branding = ChannelBrandingService.getBranding('channel2');
            expect(branding).toBe(CHANNEL2_BRANDING);
        });

        it('debe retornar canal 1 por defecto para canal inválido', () => {
            // @ts-expect-error - Probando con valor inválido
            const branding = ChannelBrandingService.getBranding('invalid');
            expect(branding).toBe(CHANNEL1_BRANDING);
        });
    });

    describe('ChannelBrandingService.getChannelName', () => {
        it('debe retornar "NeuroSync AI" para channel1', () => {
            expect(ChannelBrandingService.getChannelName('channel1')).toBe('NeuroSync AI');
        });

        it('debe retornar "NeuroTech AI" para channel2', () => {
            expect(ChannelBrandingService.getChannelName('channel2')).toBe('NeuroTech AI');
        });
    });

    describe('ChannelBrandingService.selectTemplateForChannel', () => {
        it('debe seleccionar plantilla preferida para canal 1', () => {
            const template = ChannelBrandingService.selectTemplateForChannel('channel1');
            // Debe ser una de las plantillas preferidas del canal 1
            expect(
                CHANNEL1_BRANDING.preferredTemplates.includes(template.id) ||
                template.tags.some(t => CHANNEL1_BRANDING.preferredMoodTags.includes(t.toLowerCase()))
            ).toBe(true);
        });

        it('debe seleccionar plantilla preferida para canal 2', () => {
            const template = ChannelBrandingService.selectTemplateForChannel('channel2');
            // Debe ser una de las plantillas preferidas del canal 2
            expect(
                CHANNEL2_BRANDING.preferredTemplates.includes(template.id) ||
                template.tags.some(t => CHANNEL2_BRANDING.preferredMoodTags.includes(t.toLowerCase()))
            ).toBe(true);
        });

        it('debe evitar plantillas especificadas en avoidTemplateIds', () => {
            const avoid = ['calm', 'ocean', 'purple'];
            const template = ChannelBrandingService.selectTemplateForChannel('channel1', undefined, avoid);
            expect(avoid).not.toContain(template.id);
        });

        it('debe considerar mood tags adicionales', () => {
            const template = ChannelBrandingService.selectTemplateForChannel(
                'channel1',
                ['tecnología', 'cyber']
            );
            expect(template).toBeDefined();
        });
    });

    describe('ChannelBrandingService.customizeColorsForChannel', () => {
        it('debe personalizar colores con el acento del canal', () => {
            const baseColors = ALL_TEMPLATES[0].colors;
            const customized = ChannelBrandingService.customizeColorsForChannel(
                'channel1',
                baseColors,
                0.5
            );
            
            // El acento debe ser siempre del canal
            expect(customized.accent).toBe(CHANNEL1_BRANDING.colors.accent);
        });

        it('debe aplicar intensidad de branding correctamente', () => {
            const baseColors = ALL_TEMPLATES[0].colors;
            
            // Con intensidad 0, debe mantener más del color base
            const lowIntensity = ChannelBrandingService.customizeColorsForChannel(
                'channel2',
                baseColors,
                0.2
            );
            
            // Con intensidad 1, debe ser más del canal
            const highIntensity = ChannelBrandingService.customizeColorsForChannel(
                'channel2',
                baseColors,
                0.9
            );
            
            // Ambos deben tener el acento del canal
            expect(lowIntensity.accent).toBe(CHANNEL2_BRANDING.colors.accent);
            expect(highIntensity.accent).toBe(CHANNEL2_BRANDING.colors.accent);
        });
    });

    describe('ChannelBrandingService.getChannelEmojis', () => {
        it('debe retornar emojis del canal 1', () => {
            const emojis = ChannelBrandingService.getChannelEmojis('channel1', 2);
            expect(emojis.length).toBe(2);
            emojis.forEach(emoji => {
                expect(CHANNEL1_BRANDING.signatureEmojis).toContain(emoji);
            });
        });

        it('debe retornar emojis del canal 2', () => {
            const emojis = ChannelBrandingService.getChannelEmojis('channel2', 2);
            expect(emojis.length).toBe(2);
            emojis.forEach(emoji => {
                expect(CHANNEL2_BRANDING.signatureEmojis).toContain(emoji);
            });
        });

        it('debe respetar el límite de emojis solicitados', () => {
            const emojis = ChannelBrandingService.getChannelEmojis('channel1', 1);
            expect(emojis.length).toBe(1);
        });
    });

    describe('ChannelBrandingService.getAccentColor', () => {
        it('debe retornar el color de acento correcto para canal 1', () => {
            const accent = ChannelBrandingService.getAccentColor('channel1');
            expect(accent).toBe(CHANNEL1_BRANDING.colors.accent);
            expect(accent).toBe('#64b5f6'); // Azul claro
        });

        it('debe retornar el color de acento correcto para canal 2', () => {
            const accent = ChannelBrandingService.getAccentColor('channel2');
            expect(accent).toBe(CHANNEL2_BRANDING.colors.accent);
            expect(accent).toBe('#ff6b35'); // Naranja energético
        });
    });

    describe('ChannelBrandingService.isValidChannel', () => {
        it('debe validar channel1 como válido', () => {
            expect(ChannelBrandingService.isValidChannel('channel1')).toBe(true);
        });

        it('debe validar channel2 como válido', () => {
            expect(ChannelBrandingService.isValidChannel('channel2')).toBe(true);
        });

        it('debe rechazar canales inválidos', () => {
            expect(ChannelBrandingService.isValidChannel('channel3')).toBe(false);
            expect(ChannelBrandingService.isValidChannel('invalid')).toBe(false);
            expect(ChannelBrandingService.isValidChannel('')).toBe(false);
        });
    });

    describe('ChannelBrandingService.getAllChannels', () => {
        it('debe retornar todos los canales disponibles', () => {
            const channels = ChannelBrandingService.getAllChannels();
            expect(channels).toContain('channel1');
            expect(channels).toContain('channel2');
            expect(channels.length).toBe(2);
        });
    });

    describe('ChannelBrandingService.getBrandingSummary', () => {
        it('debe retornar un resumen de todos los canales', () => {
            const summary = ChannelBrandingService.getBrandingSummary();
            
            expect(summary.channel1.name).toBe('NeuroSync AI');
            expect(summary.channel1.niche).toContain('Autismo');
            expect(summary.channel1.accent).toBe('#64b5f6');
            
            expect(summary.channel2.name).toBe('NeuroTech AI');
            expect(summary.channel2.niche).toContain('TDAH');
            expect(summary.channel2.accent).toBe('#ff6b35');
        });
    });

    describe('Integración con ThumbnailTemplates', () => {
        it('las plantillas preferidas de cada canal deben existir', () => {
            CHANNEL1_BRANDING.preferredTemplates.forEach(templateId => {
                expect(TEMPLATES_BY_ID[templateId]).toBeDefined();
            });
            
            CHANNEL2_BRANDING.preferredTemplates.forEach(templateId => {
                expect(TEMPLATES_BY_ID[templateId]).toBeDefined();
            });
        });

        it('la plantilla por defecto de cada canal debe existir', () => {
            expect(TEMPLATES_BY_ID[CHANNEL1_BRANDING.defaultTemplate]).toBeDefined();
            expect(TEMPLATES_BY_ID[CHANNEL2_BRANDING.defaultTemplate]).toBeDefined();
        });
    });
});
