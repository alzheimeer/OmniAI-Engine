import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { SEOStrategy } from '../agents/SEOAgent';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { FallbackStrategies, FallbackResult } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';
import { VisualStyle } from './ModelConfig';

dotenv.config();

// Instancia de RetryHandler preconfigurada para DeepSeek API
const deepSeekRetry = RetryHandler.forAPI('DeepSeek');

// Logger para ScriptGenerator
const logger = new Logger('ScriptGenerator');

/**
 * Interface para prompts optimizados para ComfyUI (Requirement 13.7)
 * Contiene descripción detallada (20-50 palabras) y estilo visual asignado
 */
export interface ComfyPrompt {
    /** Descripción detallada optimizada para Text-to-Video con Wan (20-50 palabras) */
    prompt: string;
    /** Estilo visual asignado: cinemagraph_plotagraph, moody_lofi_ambient, o analog_horror_liminal */
    style: VisualStyle;
}

export interface VideoScript {
    title: string;
    description: string;
    tags: string[];
    hook?: string; // Compelling first 3 seconds to maximize retention
    spokenText: string;
    visualPrompts: string[];
    /** Prompts detallados para ComfyUI con estilo visual asignado (Requirement 13.7) */
    comfyPrompts?: ComfyPrompt[];
    chapters?: { time: string; title: string }[]; // For long videos, helps with SEO
}

export class ScriptGenerator {
    private static openai = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    });

    /**
     * Instrucciones para DeepSeek sobre generación de comfyPrompts con estilos visuales
     * (Requirements 13.1, 13.2, 13.3, 13.4, 15.1, 15.5, 15.6, 15.7, 15.8)
     */
    private static readonly COMFY_PROMPTS_INSTRUCTIONS = `
CRITICAL - DUAL PROMPT GENERATION:
You must generate TWO arrays of visual prompts:
1. "visualPrompts": Keywords of 1-3 words for Pexels stock video search (e.g., "technology", "neon brain", "sad boy")
2. "comfyPrompts": Detailed descriptions of 20-50 words optimized for AI Text-to-Video generation with Wan model

Each comfyPrompt must include:
- Scene description (what is visible)
- Lighting (warm, cool, neon, natural, fluorescent)
- Camera movement indication (static camera, slow pan, minimal motion)
- Visual style indicator for looping/motion type

VISUAL STYLES - Assign ONE of these three styles to each comfyPrompt based on the content tone:
1. "cinemagraph_plotagraph": Mostly static scene with ONE subtle moving element in infinite loop (steam, water, flickering light, floating particles). Use for: product/brand content, professional/corporate content.
   Example: "coffee cup with gentle steam rising, static background, warm cafe interior, soft focus, seamless loop motion, subtle motion, static camera with minimal motion"

2. "moody_lofi_ambient": Cozy but melancholic atmosphere with slow ambient movement. Use for: educational content, introspective themes, relaxing/focus content.
   Example: "rainy night city street seen through foggy window, neon signs reflection, lo-fi aesthetic, melancholic atmosphere, slow rain drops, slow movement, atmospheric drift, seamless loop"

3. "analog_horror_liminal": Disturbing liminal spaces with unsettling calm atmosphere. Use for: mysterious content, psychological themes, attention-grabbing hooks.
   Example: "empty pedestrian crossing at night, single distant figure standing still, flickering street lamp, volumetric fog, liminal space, unsettling calm, slow movement, static camera"

STYLE SELECTION GUIDE:
- Educational/informative tone → moody_lofi_ambient
- Mysterious/intriguing/hook-heavy → analog_horror_liminal  
- Product showcase/professional/brand → cinemagraph_plotagraph

MOTION INDICATORS (REQUIRED in every comfyPrompt):
Include one of: "subtle motion", "gentle drift", "slow movement", "seamless loop", or "static camera with minimal motion"

CORRESPONDENCE RULE: visualPrompts and comfyPrompts MUST have exactly the same number of elements (1:1 correspondence).
`;

    /**
     * Genera comfyPrompts de fallback cuando DeepSeek no los proporciona (Requirement 13.6)
     * Expande visualPrompts simples en descripciones detalladas con estilos asignados
     * @param visualPrompts Array de keywords cortos de Pexels
     * @returns Array de ComfyPrompt con descripciones expandidas y estilos
     */
    private static generateFallbackComfyPrompts(visualPrompts: string[]): ComfyPrompt[] {
        // Mapeo de keywords comunes a estilos apropiados
        const styleKeywordMap: Record<string, VisualStyle> = {
            // Keywords que sugieren cinemagraph_plotagraph
            'coffee': 'cinemagraph_plotagraph',
            'product': 'cinemagraph_plotagraph',
            'office': 'cinemagraph_plotagraph',
            'business': 'cinemagraph_plotagraph',
            'professional': 'cinemagraph_plotagraph',
            'brand': 'cinemagraph_plotagraph',
            'tech': 'cinemagraph_plotagraph',
            'workspace': 'cinemagraph_plotagraph',
            // Keywords que sugieren moody_lofi_ambient
            'study': 'moody_lofi_ambient',
            'rain': 'moody_lofi_ambient',
            'night': 'moody_lofi_ambient',
            'cozy': 'moody_lofi_ambient',
            'calm': 'moody_lofi_ambient',
            'relax': 'moody_lofi_ambient',
            'focus': 'moody_lofi_ambient',
            'book': 'moody_lofi_ambient',
            'nature': 'moody_lofi_ambient',
            'sunset': 'moody_lofi_ambient',
            // Keywords que sugieren analog_horror_liminal
            'empty': 'analog_horror_liminal',
            'alone': 'analog_horror_liminal',
            'mystery': 'analog_horror_liminal',
            'dark': 'analog_horror_liminal',
            'corridor': 'analog_horror_liminal',
            'fog': 'analog_horror_liminal',
            'liminal': 'analog_horror_liminal',
            'abandoned': 'analog_horror_liminal',
        };

        // Templates para expandir prompts por estilo
        const styleTemplates: Record<VisualStyle, (keyword: string) => string> = {
            'cinemagraph_plotagraph': (keyword) => 
                `${keyword} scene with subtle ambient lighting, mostly static composition with one gentle moving element, soft focus background, professional aesthetic, seamless loop motion, static camera with minimal motion`,
            'moody_lofi_ambient': (keyword) =>
                `${keyword} with warm ambient lighting, lo-fi aesthetic atmosphere, soft neon glow, slight atmospheric haze, melancholic mood, slow movement, atmospheric drift, seamless loop`,
            'analog_horror_liminal': (keyword) =>
                `${keyword} in liminal space setting, fluorescent lighting, empty atmosphere, volumetric fog, slight unsettling calm, distant perspective, slow movement, static camera`
        };

        return visualPrompts.map((vp) => {
            const lowerVp = vp.toLowerCase();
            
            // Determinar estilo basado en keywords
            let selectedStyle: VisualStyle = 'moody_lofi_ambient'; // Default educativo
            for (const [keyword, style] of Object.entries(styleKeywordMap)) {
                if (lowerVp.includes(keyword)) {
                    selectedStyle = style;
                    break;
                }
            }

            // Generar prompt expandido
            const expandedPrompt = styleTemplates[selectedStyle](vp);

            logger.debug(`Fallback comfyPrompt generado para "${vp}"`, { 
                style: selectedStyle, 
                promptLength: expandedPrompt.split(' ').length 
            });

            return {
                prompt: expandedPrompt,
                style: selectedStyle
            };
        });
    }

    /**
     * Valida y normaliza la correspondencia 1:1 entre visualPrompts y comfyPrompts (Requirements 13.5, 13.6)
     * @param scriptData Script con visualPrompts y posiblemente comfyPrompts
     * @returns Script con comfyPrompts garantizados
     */
    private static validateAndNormalizeComfyPrompts(scriptData: VideoScript): VideoScript {
        // Si no hay visualPrompts, no hay nada que hacer
        if (!scriptData.visualPrompts || scriptData.visualPrompts.length === 0) {
            logger.warn('Script sin visualPrompts, no se pueden generar comfyPrompts');
            return scriptData;
        }

        // Verificar si DeepSeek proporcionó comfyPrompts
        if (!scriptData.comfyPrompts || !Array.isArray(scriptData.comfyPrompts) || scriptData.comfyPrompts.length === 0) {
            logger.warn('DeepSeek no retornó comfyPrompts, generando fallback desde visualPrompts');
            scriptData.comfyPrompts = this.generateFallbackComfyPrompts(scriptData.visualPrompts);
            return scriptData;
        }

        // Validar correspondencia 1:1 (Requirement 13.5)
        if (scriptData.visualPrompts.length !== scriptData.comfyPrompts.length) {
            logger.warn('Discrepancia en longitud de prompts', {
                visualPromptsCount: scriptData.visualPrompts.length,
                comfyPromptsCount: scriptData.comfyPrompts.length
            });

            // Si hay más visualPrompts, generar comfyPrompts faltantes
            if (scriptData.visualPrompts.length > scriptData.comfyPrompts.length) {
                const missingCount = scriptData.visualPrompts.length - scriptData.comfyPrompts.length;
                const missingVisualPrompts = scriptData.visualPrompts.slice(-missingCount);
                const additionalComfyPrompts = this.generateFallbackComfyPrompts(missingVisualPrompts);
                scriptData.comfyPrompts = [...scriptData.comfyPrompts, ...additionalComfyPrompts];
                logger.info(`Generados ${missingCount} comfyPrompts adicionales para mantener correspondencia 1:1`);
            } else {
                // Si hay más comfyPrompts, truncar al tamaño de visualPrompts
                scriptData.comfyPrompts = scriptData.comfyPrompts.slice(0, scriptData.visualPrompts.length);
                logger.info(`Truncados comfyPrompts a ${scriptData.visualPrompts.length} para mantener correspondencia 1:1`);
            }
        }

        // Validar que cada comfyPrompt tenga estructura correcta
        scriptData.comfyPrompts = scriptData.comfyPrompts.map((cp, index) => {
            // Si el comfyPrompt viene como string (error de DeepSeek), convertirlo
            if (typeof cp === 'string') {
                logger.warn(`comfyPrompt[${index}] vino como string, convirtiendo a objeto`);
                return {
                    prompt: cp,
                    style: 'moody_lofi_ambient' as VisualStyle // Default seguro
                };
            }

            // Validar que tenga prompt y style válidos
            const validStyles: VisualStyle[] = ['cinemagraph_plotagraph', 'moody_lofi_ambient', 'analog_horror_liminal'];
            if (!cp.prompt || typeof cp.prompt !== 'string') {
                logger.warn(`comfyPrompt[${index}] sin prompt válido, usando visualPrompt`);
                cp.prompt = this.generateFallbackComfyPrompts([scriptData.visualPrompts[index]])[0].prompt;
            }
            if (!cp.style || !validStyles.includes(cp.style)) {
                logger.warn(`comfyPrompt[${index}] con estilo inválido: ${cp.style}, usando moody_lofi_ambient`);
                cp.style = 'moody_lofi_ambient';
            }

            return cp;
        });

        logger.info('comfyPrompts validados exitosamente', {
            count: scriptData.comfyPrompts.length,
            styles: scriptData.comfyPrompts.map(cp => cp.style)
        });

        return scriptData;
    }

    /**
     * Generates a YouTube Short script about Autism and AI using DeepSeek.
     * Includes dual prompt generation: visualPrompts (Pexels) and comfyPrompts (ComfyUI)
     * (Requirements 13.1-13.6, 15.1-15.8)
     * @param seo The SEO Strategy containing the viral title and keywords
     * @param language The language of the script (e.g., "Spanish" or "English")
     */
    public static async generateShortScript(seo: SEOStrategy, language: string = 'Spanish', channelKey: 'channel1' | 'channel2' = 'channel1'): Promise<VideoScript> {
        const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';
        logger.info(`Generando YouTube Short script para ${channelName}`, { language, topic: seo.rawTopic });

        const channelContext = channelKey === 'channel2'
            ? `The channel "NeuroTech AI" focuses on AI productivity hacks, workplace automation, and digital business for ADHD & Neurodivergent individuals.`
            : `The channel "NeuroSync AI" focuses on Autism & Artificial Intelligence: empowering autistic minds, cognitive tools, sensory support, and social skills through AI.`;

        const isMultiVoice = Math.random() < 0.25;
        const voiceInstruction = isMultiVoice 
            ? `\nCRITICAL (MULTI-VOICE FORMAT): Write this script as a dynamic podcast-style interview or a conversational dialogue between two people. This breaks semantic fatigue.`
            : ``;

        // Prompt del sistema con instrucciones para prompts duales (Requirements 13.1-13.4, 15.5)
        const systemPrompt = `You are a viral YouTube Shorts scriptwriter for a channel called "${channelName}". 
${channelContext}${voiceInstruction}
Write a highly engaging, fast-paced 60-second script about: ${seo.rawTopic}.
The video's final title will be "${seo.viralTitle}". Ensure the hook and script align with this title.
IMPORTANT: The entire output (title, description, tags, spokenText) MUST be in ${language.toUpperCase()}.

CRITICAL: The first 3 seconds (the "hook") determine if viewers stay or swipe away.
The hook must be:
- A shocking statement, controversial opinion, or intriguing question
- Emotionally provocative (curiosity, surprise, or FOMO)
- Directly related to the video topic

${this.COMFY_PROMPTS_INSTRUCTIONS}

FORMAT YOUR RESPONSE EXACTLY AS A VALID JSON OBJECT WITH NO MARKDOWN FORMATTING OR EXTRA TEXT.
The JSON must have this exact structure:
{
  "title": "A viral, clickbaity YouTube title under 60 chars",
  "description": "A 3 sentence SEO optimized description",
  "tags": ["autism", "ai", "neurodiversity", "tech", "etc"],
  "hook": "The exact words for the first 3 seconds - must grab attention IMMEDIATELY",
  "spokenText": "The REST of the script AFTER the hook. The hook will be prepended automatically. Keep it punchy, conversational, no emojis, around 130-140 words.",
  "visualPrompts": ["1-3 words stock video keyword", "abstract data", "coding screen"],
  "comfyPrompts": [
    {"prompt": "detailed 20-50 word scene description with lighting, camera, motion indicators", "style": "moody_lofi_ambient"},
    {"prompt": "another detailed scene description", "style": "cinemagraph_plotagraph"},
    {"prompt": "third detailed scene description", "style": "analog_horror_liminal"}
  ]
}`;

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas DeepSeek
            const response = await deepSeekRetry.execute(
                () => this.openai.chat.completions.create({
                    model: 'deepseek-chat', // DeepSeek V3/V4 standard model
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Generate the script for: ${seo.rawTopic}` }
                    ],
                    temperature: 0.7,
                }),
                'DeepSeek generateShortScript'
            );

            const rawJson = response.choices[0].message.content?.trim() || '{}';
            
            // Clean up possible markdown code blocks if the LLM hallucinated them
            const cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            
            let scriptData = JSON.parse(cleanJson) as VideoScript;
            
            // Combine hook with spoken text for final script
            if (scriptData.hook && scriptData.spokenText) {
                scriptData.spokenText = `${scriptData.hook} ${scriptData.spokenText}`;
            }
            
            // REQ-13.5, REQ-13.6: Validar y normalizar comfyPrompts con correspondencia 1:1
            scriptData = this.validateAndNormalizeComfyPrompts(scriptData);
            
            // Save it to a file for debugging/record keeping
            const outPath = path.join(__dirname, '../../content', 'latest-script.json');
            fs.writeFileSync(outPath, JSON.stringify(scriptData, null, 2));
            
            // REQ-4.4.3: Cachear script exitoso para uso futuro como fallback
            await FallbackStrategies.cacheScript(seo.rawTopic, language, scriptData);
            
            logger.info('Script generado exitosamente', { 
                topic: seo.rawTopic, 
                language,
                visualPromptsCount: scriptData.visualPrompts?.length || 0,
                comfyPromptsCount: scriptData.comfyPrompts?.length || 0
            });
            return scriptData;
        } catch (error) {
            // REQ-4.4.3: Fallback específico para DeepSeek cuando reintentos se agotan
            if (error instanceof RetryError) {
                logger.warn('DeepSeek API agotó reintentos, usando fallback', { 
                    topic: seo.rawTopic, 
                    language,
                    attempts: error.attempts 
                });
                
                const fallbackResult = await FallbackStrategies.deepSeekFallback(
                    seo.rawTopic,
                    language,
                    error
                );
                
                logger.info('Fallback DeepSeek aplicado exitosamente', {
                    fallbackType: fallbackResult.fallbackType,
                    message: fallbackResult.message
                });
                
                // REQ-13.6: Generar comfyPrompts para script de fallback también
                let fallbackScript = fallbackResult.result as VideoScript;
                fallbackScript = this.validateAndNormalizeComfyPrompts(fallbackScript);
                
                // Guardar script de fallback para debugging
                const outPath = path.join(__dirname, '../../content', 'latest-script.json');
                fs.writeFileSync(outPath, JSON.stringify(fallbackScript, null, 2));
                
                return fallbackScript;
            }
            
            logger.error('Error fatal generando script con DeepSeek', error as Error);
            throw error;
        }
    }

    /**
     * Generates a Long-Form YouTube script (3-5 minutes) about Autism and AI using DeepSeek.
     * Includes dual prompt generation: visualPrompts (Pexels) and comfyPrompts (ComfyUI)
     * (Requirements 13.1-13.6, 15.1-15.8)
     * @param seo The SEO Strategy containing the viral title and keywords
     * @param language The language of the script (e.g., "Spanish" or "English")
     */
    public static async generateLongScript(seo: SEOStrategy, language: string = 'Spanish', channelKey: 'channel1' | 'channel2' = 'channel1'): Promise<VideoScript> {
        const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';
        logger.info(`Generando Long-Form YouTube script para ${channelName}`, { language, topic: seo.rawTopic });

        const channelContext = channelKey === 'channel2'
            ? `The channel "NeuroTech AI" focuses on AI productivity hacks, workplace automation, and digital business for ADHD & Neurodivergent individuals.`
            : `The channel "NeuroSync AI" focuses on Autism & Artificial Intelligence: empowering autistic minds, cognitive tools, sensory support, and social skills through AI.`;

        const duration = seo.targetDurationMinutes || 5;
        const words = seo.wordCountRange || "600-900";

        const isMultiVoice = Math.random() < 0.75;
        const voiceInstruction = isMultiVoice 
            ? `\nCRITICAL (MULTI-VOICE FORMAT): Write this script as a dynamic podcast-style interview or a conversational dialogue between two people. YOU MUST prefix every spoken paragraph with either [VOICE_A]: or [VOICE_B]: to indicate who is speaking. Example: "[VOICE_A]: Did you know that...? [VOICE_B]: Wow, really?". This is mandatory to break semantic fatigue.`
            : ``;

        // Prompt del sistema con instrucciones para prompts duales (Requirements 13.1-13.4, 15.5)
        const systemPrompt = `You are a viral YouTube documentary scriptwriter for a channel called "${channelName}". 
${channelContext}${voiceInstruction}
Write a highly engaging, deep-dive ${duration}-minute script about: ${seo.rawTopic}.
The video's final title will be "${seo.viralTitle}".
IMPORTANT: The entire output (title, description, tags, spokenText) MUST be in ${language.toUpperCase()}.

CRITICAL FOR SCRIPT LENGTH: The script MUST be ${words} words (approx ${duration} minutes) to maximize audience retention and avoid unverified account limits.

The script should follow this structure:
1. HOOK (first 10 seconds) - Provocative statement to grab attention
2. INTRO - Brief overview of what the video covers
3. MAIN CONTENT - 5-6 key points, each with examples
4. CONCLUSION - Summary and call to action

You must provide:
- EXACTLY 10 "visualPrompts" representing different scenes (1-3 words each for stock video search)
- EXACTLY 10 "comfyPrompts" with detailed descriptions (20-50 words each) and visual styles
- EXACTLY 6 "chapters" with timestamps for YouTube chapters feature

${this.COMFY_PROMPTS_INSTRUCTIONS}

FORMAT YOUR RESPONSE EXACTLY AS A VALID JSON OBJECT WITH NO MARKDOWN FORMATTING OR EXTRA TEXT.
The JSON must have this exact structure:
{
  "title": "A highly clickable YouTube title under 60 chars",
  "description": "A detailed SEO optimized description with key points mentioned",
  "tags": ["autism", "ai", "neurodiversity", "tech", "etc"],
  "hook": "The exact words for the first 10 seconds - must grab attention",
  "spokenText": "The entire script text for the voiceover (${words} words). MUST start with the hook. Keep it engaging, educational, and professional.",
  "visualPrompts": ["technology", "neon brain", "abstract data", "coding screen", "happy family", "office", "robot", "light bulb", "medical", "brain"],
  "comfyPrompts": [
    {"prompt": "futuristic holographic brain visualization floating in dark space, soft blue and purple neon lighting, particles drifting slowly, seamless loop motion, static camera with minimal motion", "style": "cinemagraph_plotagraph"},
    {"prompt": "rainy night view through window of cozy home office, warm lamp light, soft neon reflections, lo-fi aesthetic, melancholic atmosphere, slow rain movement, atmospheric drift", "style": "moody_lofi_ambient"},
    {"prompt": "empty modern office corridor at night, flickering fluorescent lights, volumetric fog, liminal space feeling, unsettling calm, slow movement, static camera", "style": "analog_horror_liminal"}
  ],
  "chapters": [
    {"time": "0:00", "title": "Introduction"},
    {"time": "1:30", "title": "Point 1"},
    {"time": "3:00", "title": "Point 2"},
    {"time": "5:00", "title": "Point 3"},
    {"time": "7:00", "title": "Key Insights"},
    {"time": "8:30", "title": "Conclusion"}
  ]
}`;

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas DeepSeek
            const response = await deepSeekRetry.execute(
                () => this.openai.chat.completions.create({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Generate the long script for: ${seo.rawTopic}` }
                    ],
                    temperature: 0.7,
                }),
                'DeepSeek generateLongScript'
            );

            const rawJson = response.choices[0].message.content?.trim() || '{}';
            const cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            
            let scriptData = JSON.parse(cleanJson) as VideoScript;
            
            // Note: We do NOT prepend the hook here for long videos,
            // because the prompt explicitly tells the LLM to start spokenText with it.
            
            // Add chapters to description for YouTube timestamps feature
            if (scriptData.chapters && scriptData.chapters.length > 0) {
                const chaptersText = scriptData.chapters.map(ch => `${ch.time} ${ch.title}`).join('\n');
                scriptData.description = `${scriptData.description}\n\n📋 Chapters:\n${chaptersText}`;
            }
            
            // Generar visualPrompts fallback si DeepSeek no los proporcionó
            if (!scriptData.visualPrompts || !Array.isArray(scriptData.visualPrompts) || scriptData.visualPrompts.length === 0) {
                logger.warn('DeepSeek no retornó visualPrompts, generando desde keywords');
                const keywords = seo.keywords && seo.keywords.length > 0 ? seo.keywords : ['technology', 'neurodiversity', 'future', 'artificial intelligence'];
                scriptData.visualPrompts = keywords.map(kw => `${kw} tech workplace`);
            }
            
            // REQ-13.5, REQ-13.6: Validar y normalizar comfyPrompts con correspondencia 1:1
            scriptData = this.validateAndNormalizeComfyPrompts(scriptData);
            
            const outPath = path.join(__dirname, '../../content', 'latest-long-script.json');
            fs.writeFileSync(outPath, JSON.stringify(scriptData, null, 2));
            
            // REQ-4.4.3: Cachear script exitoso para uso futuro como fallback
            await FallbackStrategies.cacheScript(seo.rawTopic, language, scriptData);
            
            logger.info('Long Script generado exitosamente', { 
                topic: seo.rawTopic, 
                language,
                visualPromptsCount: scriptData.visualPrompts?.length || 0,
                comfyPromptsCount: scriptData.comfyPrompts?.length || 0
            });

            return scriptData;
        } catch (error) {
            // REQ-4.4.3: Fallback específico para DeepSeek cuando reintentos se agotan
            if (error instanceof RetryError) {
                logger.warn('DeepSeek API agotó reintentos para Long Script, usando fallback', { 
                    topic: seo.rawTopic, 
                    language,
                    attempts: error.attempts 
                });
                
                const fallbackResult = await FallbackStrategies.deepSeekFallback(
                    seo.rawTopic,
                    language,
                    error
                );
                
                logger.info('Fallback DeepSeek aplicado exitosamente para Long Script', {
                    fallbackType: fallbackResult.fallbackType,
                    message: fallbackResult.message
                });
                
                // REQ-13.6: Generar comfyPrompts para script de fallback también
                let fallbackScript = fallbackResult.result as VideoScript;
                fallbackScript = this.validateAndNormalizeComfyPrompts(fallbackScript);
                
                // Guardar script de fallback para debugging
                const outPath = path.join(__dirname, '../../content', 'latest-long-script.json');
                fs.writeFileSync(outPath, JSON.stringify(fallbackScript, null, 2));
                
                return fallbackScript;
            }
            
            logger.error('Error fatal generando long script con DeepSeek', error as Error);
            throw error;
        }
    }
}

