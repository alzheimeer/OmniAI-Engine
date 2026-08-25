import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { SEOStrategy } from '../agents/SEOAgent';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';
import { FallbackStrategies, FallbackResult } from '../infrastructure/FallbackStrategies';
import { Logger } from '../infrastructure/Logger';

dotenv.config();

// Instancia de RetryHandler preconfigurada para DeepSeek API
const deepSeekRetry = RetryHandler.forAPI('DeepSeek');

// Logger para ScriptGenerator
const logger = new Logger('ScriptGenerator');

export interface VideoScript {
    title: string;
    description: string;
    tags: string[];
    hook?: string; // Compelling first 3 seconds to maximize retention
    spokenText: string;
    visualPrompts: string[];
    chapters?: { time: string; title: string }[]; // For long videos, helps with SEO
}

export class ScriptGenerator {
    private static openai = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    });

    /**
     * Generates a YouTube Short script about Autism and AI using DeepSeek.
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

FORMAT YOUR RESPONSE EXACTLY AS A VALID JSON OBJECT WITH NO MARKDOWN FORMATTING OR EXTRA TEXT.
The JSON must have this exact structure:
{
  "title": "A viral, clickbaity YouTube title under 60 chars",
  "description": "A 3 sentence SEO optimized description",
  "tags": ["autism", "ai", "neurodiversity", "tech", "etc"],
  "hook": "The exact words for the first 3 seconds - must grab attention IMMEDIATELY",
  "spokenText": "The REST of the script AFTER the hook. The hook will be prepended automatically. Keep it punchy, conversational, no emojis, around 130-140 words.",
  "visualPrompts": ["CRITICAL: 1 to 3 words ONLY, general stock video keywords (e.g., 'technology', 'neon brain', 'sad boy')", "abstract data", "coding screen"]
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
            
            const scriptData = JSON.parse(cleanJson) as VideoScript;
            
            // Combine hook with spoken text for final script
            if (scriptData.hook && scriptData.spokenText) {
                scriptData.spokenText = `${scriptData.hook} ${scriptData.spokenText}`;
            }
            
            // Save it to a file for debugging/record keeping
            const outPath = path.join(__dirname, '../../content', 'latest-script.json');
            fs.writeFileSync(outPath, JSON.stringify(scriptData, null, 2));
            
            // REQ-4.4.3: Cachear script exitoso para uso futuro como fallback
            await FallbackStrategies.cacheScript(seo.rawTopic, language, scriptData);
            
            logger.info('Script generado exitosamente', { topic: seo.rawTopic, language });
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
                
                // Guardar script de fallback para debugging
                const outPath = path.join(__dirname, '../../content', 'latest-script.json');
                fs.writeFileSync(outPath, JSON.stringify(fallbackResult.result, null, 2));
                
                return fallbackResult.result;
            }
            
            logger.error('Error fatal generando script con DeepSeek', error as Error);
            throw error;
        }
    }

    /**
     * Generates a Long-Form YouTube script (3-5 minutes) about Autism and AI using DeepSeek.
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
- EXACTLY 10 "visualPrompts" representing different scenes
- EXACTLY 6 "chapters" with timestamps for YouTube chapters feature

FORMAT YOUR RESPONSE EXACTLY AS A VALID JSON OBJECT WITH NO MARKDOWN FORMATTING OR EXTRA TEXT.
The JSON must have this exact structure:
{
  "title": "A highly clickable YouTube title under 60 chars",
  "description": "A detailed SEO optimized description with key points mentioned",
  "tags": ["autism", "ai", "neurodiversity", "tech", "etc"],
  "hook": "The exact words for the first 10 seconds - must grab attention",
  "spokenText": "The entire script text for the voiceover (1200-1500 words). MUST start with the hook. Keep it engaging, educational, and professional.",
  "visualPrompts": ["CRITICAL: 1 to 3 words ONLY, general stock video keywords (e.g., 'technology', 'neon brain', 'sad boy')", "abstract data", "coding screen", "happy family", "office", "robot", "light bulb", "medical", "future", "brain"],
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
            
            const scriptData = JSON.parse(cleanJson) as VideoScript;
            
            // Note: We do NOT prepend the hook here for long videos,
            // because the prompt explicitly tells the LLM to start spokenText with it.
            
            // Add chapters to description for YouTube timestamps feature
            if (scriptData.chapters && scriptData.chapters.length > 0) {
                const chaptersText = scriptData.chapters.map(ch => `${ch.time} ${ch.title}`).join('\n');
                scriptData.description = `${scriptData.description}\n\n📋 Chapters:\n${chaptersText}`;
            }
            
            const outPath = path.join(__dirname, '../../content', 'latest-long-script.json');
            fs.writeFileSync(outPath, JSON.stringify(scriptData, null, 2));
            
            // REQ-4.4.3: Cachear script exitoso para uso futuro como fallback
            await FallbackStrategies.cacheScript(seo.rawTopic, language, scriptData);
            
            logger.info('Long Script generado exitosamente', { topic: seo.rawTopic, language });
            if (!scriptData.visualPrompts || !Array.isArray(scriptData.visualPrompts) || scriptData.visualPrompts.length === 0) {
                logger.warn('DeepSeek no retornó visualPrompts, generando desde keywords');
                const keywords = seo.keywords && seo.keywords.length > 0 ? seo.keywords : ['technology', 'neurodiversity', 'future', 'artificial intelligence'];
                scriptData.visualPrompts = keywords.map(kw => `${kw} tech workplace`);
            }

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
                
                // Guardar script de fallback para debugging
                const outPath = path.join(__dirname, '../../content', 'latest-long-script.json');
                fs.writeFileSync(outPath, JSON.stringify(fallbackResult.result, null, 2));
                
                return fallbackResult.result;
            }
            
            logger.error('Error fatal generando long script con DeepSeek', error as Error);
            throw error;
        }
    }
}

