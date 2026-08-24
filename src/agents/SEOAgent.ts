import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Database } from '../db/Database';
import { RetryHandler } from '../infrastructure/RetryHandler';

dotenv.config();

// Instancia de RetryHandler preconfigurada para DeepSeek API
const deepSeekRetry = RetryHandler.forAPI('DeepSeek');

export interface SEOStrategy {
    rawTopic: string;
    viralTitle: string;
    keywords: string[];
    recommendedPostingFrequency?: string; // e.g. "Publicar 2 veces al día para aprovechar tendencia"
    feedbackAnalysis?: string; // e.g. "Basado en que 'TDAH en la IA' tuvo un 300% más de vistas, doblamos la apuesta"
    
    // NUEVOS PARÁMETROS DINÁMICOS
    targetDurationMinutes?: number;
    wordCountRange?: string;
    developerActionRequired?: string;
}

// ====================================================================================
// INTERFACES MULTIPLATAFORMA (REQ-3.5.1, REQ-3.5.2, REQ-3.5.3)
// ====================================================================================

/**
 * Plataformas de distribución soportadas
 */
export type Platform = 'youtube' | 'instagram' | 'tiktok';

/**
 * Hashtags específicos por plataforma
 * @requirement REQ-3.5.1
 */
export interface PlatformHashtags {
    /** YouTube: Keywords buscables, SEO-optimizados */
    youtube: string[];
    /** Instagram: Mix de populares (#fyp) y nicho */
    instagram: string[];
    /** TikTok: Trending + #fyp + #viral + nicho */
    tiktok: string[];
}

/**
 * Descripciones optimizadas por plataforma
 * @requirement REQ-3.5.2
 */
export interface PlatformDescriptions {
    /** YouTube: Descripción detallada con timestamps */
    youtube: string;
    /** Instagram: Caption con emojis, max 2200 chars */
    instagram: string;
    /** TikTok: Caption muy corto, hook + trending */
    tiktok: string;
}

/**
 * Títulos adaptados por plataforma
 * @requirement REQ-3.5.3
 */
export interface PlatformTitles {
    /** YouTube: Max 60 caracteres, SEO optimizado */
    youtube: string;
    /** Instagram: Caption format con hooks */
    instagram: string;
    /** TikTok: Ultra-corto, punchy caption */
    tiktok: string;
}

/**
 * Estrategia SEO completa multiplataforma
 * Extiende la estrategia base con optimizaciones por plataforma
 */
export interface MultiPlatformSEOStrategy {
    /** Estrategia SEO base (YouTube-centric) */
    base: SEOStrategy;
    /** Hashtags específicos por plataforma */
    hashtags: PlatformHashtags;
    /** Descripciones optimizadas por plataforma */
    descriptions: PlatformDescriptions;
    /** Títulos adaptados por plataforma */
    titles: PlatformTitles;
    /** Mood detectado del contenido para selección de música */
    detectedMood: 'ambient' | 'upbeat' | 'cinematic' | 'calm' | 'dramatic';
    /** Canal objetivo */
    channelKey: 'channel1' | 'channel2';
}

/**
 * Configuración de nicho para hashtags por canal
 */
interface NicheHashtagConfig {
    /** Tags de nicho específicos del canal */
    nicheTags: string[];
    /** Tags de AI genéricos */
    aiTags: string[];
    /** Tags trending universales */
    trendingTags: string[];
}

export class SEOAgent {
    private static openai = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    });

    /**
     * Generates a trending topic and a full SEO strategy (Viral Title + 15-20 Tags)
     * Incorporates historical channel analytics for feedback-driven self-improvement.
     * NOW INCLUDES: Topic deduplication to avoid repeating content.
     * @param language The language for the SEO strategy (e.g., 'Spanish', 'English')
     * @param performanceContext Optional analytics summary from YouTube / SQLite DB
     * @param contentType 'video' or 'blog' - to check appropriate duplicate database
     * @param retryCount Internal counter to prevent infinite recursion
     */
    static async generateDailySEOStrategy(
        language: string = 'Spanish', 
        performanceContext?: string,
        contentType: 'video' | 'blog' = 'video',
        channelKey: 'channel1' | 'channel2' = 'channel1',
        retryCount: number = 0
    ): Promise<SEOStrategy> {
        const MAX_RETRIES = 3;
        
        const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';
        console.log(`🤖 SEOAgent: Investigando tendencias para ${channelName} en ${language}...${retryCount > 0 ? ` (intento ${retryCount + 1}/${MAX_RETRIES + 1})` : ''}`);
        
        // Obtener temas ya usados en ESTE CANAL ESPECÍFICO para evitar duplicados
        let previousTopics: string[] = [];
        try {
            previousTopics = contentType === 'video' 
                ? await Database.getRecentTopics(50, channelKey)
                : await Database.getRecentBlogTopics(30);
            console.log(`📊 SEOAgent: Cargados ${previousTopics.length} temas previos de ${channelName} para evitar duplicados`);
        } catch (error) {
            console.warn('⚠️ SEOAgent: No se pudieron cargar temas previos, continuando sin deduplicación');
        }

        const previousTopicsText = previousTopics.length > 0
            ? `\n\nTEMAS YA PUBLICADOS (NO REPETIR - GENERAR ALGO DIFERENTE):\n${previousTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
            : '';
        
        const isChannel2 = channelKey === 'channel2';
        const channelNiche = isChannel2 
            ? `PRODUCTIVIDAD, TRABAJO Y NEGOCIOS CON IA PARA NEURODIVERGENTES (TDAH / AUTISMO).
Every single topic MUST combine:
1. PILLAR 1: Artificial Intelligence (ChatGPT, Claude, Notion AI, Midjourney, Automation, Workflows).
2. PILLAR 2: Workplace Productivity, Business, Focus Hacks for ADHD & Autism (Procrastinación, Hiperfoco laboral, Organización de tareas, Automatización de Negocios).`
            : `AUTISMO E INTELIGENCIA ARTIFICIAL.
Every single topic MUST combine:
1. PILLAR 1: Artificial Intelligence (ChatGPT, Claude, Generative AI, AI Tools, Automation).
2. PILLAR 2: Autism Spectrum & Neurodiversity (Autismo, Asperger, Hiperfoco, Sensibilidad Sensorial, Terapia).`;

        const personas = [
            "Experto Académico (Tono serio y basado en datos)",
            "Amigo Entusiasta (Tono casual, muy enérgico y cercano)",
            "Periodista Investigativo (Tono misterioso y revelador)"
        ];
        const selectedPersona = personas[Math.floor(Math.random() * personas.length)];

        const systemPrompt = `You are an elite SEO Specialist and AI Content Director for '${channelName}'.
Your mission is to optimize content strategy using historical performance feedback data under STRICT NICHE GUARDRAILS.
You MUST adopt the following persona for your generated content and titles: ${selectedPersona}.

STRICT NICHE GUARDRAILS (DO NOT VIOLATE):
The entire channel is strictly dedicated to: ${channelNiche}
        
CRITICAL - ANTI-FATIGUE (BLACKLIST):
- DO NOT use cliché AI phrases in any generated content.
- FORBIDDEN WORDS: "En este video", "Descubre", "Sumérgete", "Adéntrate", "En conclusión", "Hola a todos".


CRITICAL - TOPIC DEDUPLICATION:
- You will receive a list of topics already published. DO NOT REPEAT ANY OF THEM.
- Each new topic MUST be substantially different from all previous ones.
- Change the angle, the specific AI tool, or the use case.

DYNAMIC CONFIGURATION & DEVELOPER ALERTS:
- You control the execution parameters! You must decide the 'targetDurationMinutes' and 'wordCountRange' for the script based on your SEO strategy.
- If you encounter a limitation you cannot fix by yourself (e.g. you want to publish 3 videos but the Orchestrator limits you to 1, or you want a new platform integrated), you MUST populate the 'developerActionRequired' field with a clear request for the human developer. Otherwise, leave it empty.

All output must be in ${language.toUpperCase()}.
Do not include any greetings or markdown blocks around the JSON. ONLY output valid JSON.`;

        const userPrompt = `Historical Channel & Content Performance Analytics:
${performanceContext || 'No historical data available yet. Start with core trending concepts.'}
${previousTopicsText}

Analyze current tech trends around Artificial Intelligence, Autism, Neurodiversity, and productivity.
IMPORTANT: Generate a topic that is DIFFERENT from all the previous topics listed.
Return EXACTLY a JSON object with this structure:
{
  "rawTopic": "A 1-2 sentence description of the core subject to write about (MUST BE UNIQUE)",
  "viralTitle": "A highly clickable, SEO-optimized title (STRICTLY MAXIMUM 8 WORDS, under 65 chars)",
  "keywords": ["tag1", "tag2", "...", "tag20"], // MUST contain between 15 and 20 highly relevant SEO tags
  "recommendedPostingFrequency": "Short recommendation on how often to publish this week based on engagement",
  "feedbackAnalysis": "1-2 sentences explaining why this topic was chosen AND how it differs from previous content",
  "targetDurationMinutes": 5,
  "wordCountRange": "700-1000",
  "developerActionRequired": "" // Only fill if you need the human developer to change the code/infrastructure
}`;

        const randomTemp = parseFloat((Math.random() * (0.9 - 0.7) + 0.7).toFixed(2));
        
        try {
            // REQ-4.4.2: Usar RetryHandler con backoff exponencial para DeepSeek
            // Reemplaza el retry manual anterior con el sistema estandarizado
            const response = await deepSeekRetry.execute(
                () => this.openai.chat.completions.create({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: randomTemp, // Variable temperature (0.7 to 0.9) to reduce semantic fatigue
                }),
                'DeepSeek generateDailySEOStrategy'
            );

            const rawJson = response.choices[0].message.content?.trim() || '{}';
            const cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            
            const strategy = JSON.parse(cleanJson) as SEOStrategy;
            
            // Verificar si el tema es duplicado EN ESTE CANAL
            const duplicate = contentType === 'video'
                ? await Database.checkTopicDuplicate(strategy.rawTopic, channelKey)
                : await Database.checkBlogTopicDuplicate(strategy.rawTopic);
            
            if (duplicate && retryCount < MAX_RETRIES) {
                console.warn(`⚠️ SEOAgent: Tema duplicado detectado! "${strategy.rawTopic}" similar a contenido existente. Regenerando...`);
                // Recursivamente intentar de nuevo (máximo 3 intentos)
                return this.generateDailySEOStrategy(language, performanceContext, contentType, channelKey, retryCount + 1);
            }
            
            if (duplicate) {
                console.warn(`⚠️ SEOAgent: Tema duplicado después de ${MAX_RETRIES} intentos. Usando de todos modos con advertencia.`);
                strategy.feedbackAnalysis = `[ADVERTENCIA: Tema potencialmente similar a contenido previo] ${strategy.feedbackAnalysis}`;
            }
            
            console.log(`✅ SEOAgent: Estrategia generada con éxito (tema único verificado)!`);
            console.log(`- Título Viral: "${strategy.viralTitle}"`);
            console.log(`- Tags generados: ${strategy.keywords.length}`);
            
            return strategy;
        } catch (error) {
            console.error('❌ SEOAgent Error:', error);
            // Fallback robusto en caso de error de red
            return {
                rawTopic: "Las ventajas ocultas del cerebro neurodivergente en la programación de IA",
                viralTitle: "Por qué el Autismo es una VENTAJA en la Inteligencia Artificial",
                keywords: ['autismo', 'inteligencia artificial', 'neurodivergencia', 'tdah', 'tecnologia', 'programacion', 'desarrollo de software', 'ventajas del autismo', 'espectro autista', 'neurodiversidad', 'futuro de la ia', 'habilidades tech', 'hiperfoco autista', 'chatgpt y autismo', 'trabajo en tecnologia', 'inclusión tech', 'innovación'],
                recommendedPostingFrequency: "Frecuencia recomendada: 1 publicación diaria",
                feedbackAnalysis: "Modo fallback activo.",
                targetDurationMinutes: 5,
                wordCountRange: "700-1000"
            };
        }
    }

    // ====================================================================================
    // SEO MULTIPLATAFORMA (REQ-3.5.1, REQ-3.5.2, REQ-3.5.3)
    // ====================================================================================

    /**
     * Configuración de hashtags de nicho por canal
     * @requirement Guardrails de Nicho
     */
    private static readonly NICHE_HASHTAG_CONFIG: Record<'channel1' | 'channel2', NicheHashtagConfig> = {
        // Canal 1: NeuroSync AI - Autismo + IA
        channel1: {
            nicheTags: [
                'autismo', 'asperger', 'espectroautista', 'neurodivergente',
                'autismoyadultos', 'vidaconautismo', 'autismoespaña',
                'soytea', 'comunidadtea', 'neurodiversidad', 'hiperfoco',
                'sensibilidadsensorial', 'estimming', 'autismopride'
            ],
            aiTags: [
                'inteligenciaartificial', 'chatgpt', 'ia', 'tecnologia',
                'futurodigital', 'automatizacion', 'machinelearning',
                'promptengineering', 'claudeai', 'aitools'
            ],
            trendingTags: [
                'fyp', 'parati', 'viral', 'trending', 'foryou', 'fypシ'
            ]
        },
        // Canal 2: NeuroTech AI - TDAH + Productividad + IA
        channel2: {
            nicheTags: [
                'tdah', 'adhd', 'productividad', 'focushacks', 'procrastinacion',
                'tdahadulto', 'vidacontdah', 'tdahespaña', 'hiperfocotdah',
                'organizacion', 'gestiondeltiempo', 'trabajoremoto',
                'emprendedorneurodivergente', 'focustime', 'deepwork'
            ],
            aiTags: [
                'notionai', 'automatizacion', 'workflow', 'productividadai',
                'chatgpt', 'ia', 'herramientasai', 'aiparatrabajar',
                'optimizacionpersonal', 'secondbrain'
            ],
            trendingTags: [
                'fyp', 'parati', 'viral', 'trending', 'foryou', 'fypシ'
            ]
        }
    };

    /**
     * Genera hashtags específicos por plataforma basados en la estrategia SEO
     * @param baseStrategy Estrategia SEO base generada
     * @param channelKey Canal objetivo (determina nicho)
     * @returns Hashtags optimizados para cada plataforma
     * @requirement REQ-3.5.1
     */
    static generatePlatformHashtags(
        baseStrategy: SEOStrategy,
        channelKey: 'channel1' | 'channel2' = 'channel1'
    ): PlatformHashtags {
        console.log(`🏷️ SEOAgent: Generando hashtags multiplataforma para ${channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI'}...`);

        const config = this.NICHE_HASHTAG_CONFIG[channelKey];
        const baseKeywords = baseStrategy.keywords || [];

        // YouTube: Keywords buscables, SEO-optimizados (sin #, solo texto)
        // Prioriza keywords del tema + tags de IA + tags de nicho
        const youtubeHashtags = [
            ...baseKeywords.slice(0, 10),
            ...config.aiTags.slice(0, 5),
            ...config.nicheTags.slice(0, 5)
        ].slice(0, 15); // YouTube recomienda max 15 tags

        // Instagram: Mix de populares y nicho con #
        // Formato: #fyp + nicho + AI + keywords del tema
        const instagramHashtags = [
            ...config.trendingTags.slice(0, 3),
            ...config.nicheTags.slice(0, 8),
            ...config.aiTags.slice(0, 6),
            ...baseKeywords.slice(0, 8).map(k => k.replace(/\s+/g, '').toLowerCase())
        ].slice(0, 25); // Instagram permite hasta 30, usamos 25 para no ser spammy

        // TikTok: Trending + #fyp + #viral + nicho
        // Más agresivo con trending, menos keywords largos
        const tiktokHashtags = [
            'fyp', 'foryou', 'viral', 'parati', 'fypシ', // Core trending
            ...config.nicheTags.slice(0, 6),
            ...config.aiTags.slice(0, 4),
            ...baseKeywords.slice(0, 3).map(k => k.replace(/\s+/g, '').toLowerCase())
        ].slice(0, 15); // TikTok funciona mejor con menos hashtags pero más relevantes

        console.log(`✅ SEOAgent: Hashtags generados - YT: ${youtubeHashtags.length}, IG: ${instagramHashtags.length}, TT: ${tiktokHashtags.length}`);

        return {
            youtube: youtubeHashtags,
            instagram: instagramHashtags,
            tiktok: tiktokHashtags
        };
    }

    /**
     * Genera descripciones optimizadas por plataforma con hooks, CTAs y elementos de engagement
     * 
     * - YouTube: Descripciones largas con keywords, timestamps, links, CTAs de suscripción
     * - TikTok: Descripciones cortas, hashtags en el cuerpo, hook ultra-agresivo
     * - Instagram: Descripciones medias, emojis, CTA de engagement, hashtags al final
     * 
     * @param baseStrategy Estrategia SEO base
     * @param hashtags Hashtags ya generados para incluir
     * @param channelKey Canal objetivo
     * @returns Descripciones adaptadas para cada plataforma
     * @requirement REQ-3.5.2
     */
    static generatePlatformDescriptions(
        baseStrategy: SEOStrategy,
        hashtags: PlatformHashtags,
        channelKey: 'channel1' | 'channel2' = 'channel1'
    ): PlatformDescriptions {
        console.log(`📝 SEOAgent: Generando descripciones multiplataforma optimizadas...`);

        const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';
        const topic = baseStrategy.rawTopic;
        const title = baseStrategy.viralTitle;
        const keywords = baseStrategy.keywords || [];
        const duration = baseStrategy.targetDurationMinutes || 5;

        // =====================================================================
        // YOUTUBE: Descripción larga con keywords, timestamps, links
        // =====================================================================
        const youtubeHook = this.generateYouTubeHook(topic, channelKey);
        const youtubeTimestamps = this.generateYouTubeTimestamps(duration);
        const youtubeKeywordText = this.generateYouTubeKeywordParagraph(keywords, channelKey);
        
        const youtubeDescription = `${title}

${youtubeHook}

${topic}

${youtubeKeywordText}

⏱️ TIMESTAMPS:
${youtubeTimestamps}

🔔 ¡SUSCRÍBETE a ${channelName} y activa la 🔔 para más contenido sobre neurodiversidad e IA!

👍 Si este video te ayudó, dale LIKE y compártelo con alguien que lo necesite.

💬 COMENTA: ¿Qué herramienta de IA te gustaría que exploremos en el próximo video?

📌 RECURSOS MENCIONADOS:
- ChatGPT: https://chat.openai.com
- Claude: https://claude.ai
- Notion AI: https://notion.so

🔗 CONECTA CON NOSOTROS:
- Instagram: @${channelName.toLowerCase().replace(' ', '')}
- TikTok: @${channelName.toLowerCase().replace(' ', '')}

📧 Colaboraciones: contacto@${channelName.toLowerCase().replace(' ', '')}.com

#${hashtags.youtube.slice(0, 10).join(' #')}

${keywords.slice(0, 8).join(', ')}

---
© ${new Date().getFullYear()} ${channelName} | Contenido sobre neurodiversidad e inteligencia artificial`;

        // =====================================================================
        // INSTAGRAM: Descripción media con emojis, CTA, hashtags al final
        // =====================================================================
        const instagramHook = this.generateInstagramHook(topic);
        const instagramEmojis = this.selectInstagramEmojis(channelKey);
        const instagramCTA = this.generateInstagramCTA();
        
        const instagramCaption = `${instagramEmojis.main} ${title}

${instagramHook}

${instagramEmojis.brain} ${topic.length > 180 ? topic.substring(0, 177) + '...' : topic}

${instagramEmojis.sparkle} 3 cosas que aprenderás:
${instagramEmojis.check} Cómo la IA puede adaptarse a tu forma de pensar
${instagramEmojis.check} Herramientas específicas para cerebros neurodivergentes
${instagramEmojis.check} Tips prácticos que puedes aplicar HOY

${instagramCTA}

${instagramEmojis.point} Link en bio para más recursos sobre neurodiversidad e IA.

${instagramEmojis.save} GUARDA este post para después
${instagramEmojis.share} COMPARTE con alguien que lo necesite

.
.
.
${hashtags.instagram.map(h => `#${h}`).join(' ')}`.substring(0, 2200);

        // =====================================================================
        // TIKTOK: Descripción corta, hashtags EN EL CUERPO, hook ultra-agresivo
        // =====================================================================
        const tiktokHook = this.generateTikTokHook(title);
        // TikTok: hashtags integrados en el texto, no al final
        const tiktokHashtagsInline = hashtags.tiktok.slice(0, 5).map(h => `#${h}`).join(' ');
        const tiktokCTA = this.generateTikTokCTA();
        
        const tiktokCaption = `${tiktokHook} 🧠✨

${tiktokHashtagsInline}

${tiktokCTA}`.substring(0, 150);

        console.log(`✅ SEOAgent: Descripciones optimizadas generadas - YT: ${youtubeDescription.length} chars, IG: ${instagramCaption.length} chars, TT: ${tiktokCaption.length} chars`);

        return {
            youtube: youtubeDescription,
            instagram: instagramCaption,
            tiktok: tiktokCaption
        };
    }

    /**
     * Genera un hook optimizado para YouTube con keywords
     * @private
     */
    private static generateYouTubeHook(topic: string, channelKey: 'channel1' | 'channel2'): string {
        const hooks = channelKey === 'channel1' 
            ? [
                '🧩 ¿Sabías que la inteligencia artificial está revolucionando la forma en que las personas autistas interactúan con el mundo?',
                '🤖 Descubre cómo la IA puede convertirse en tu mejor aliada si eres neurodivergente.',
                '🧠 En este video te revelo las herramientas de IA que están cambiando vidas en la comunidad autista.',
                '✨ Lo que nadie te cuenta sobre cómo la IA puede potenciar las fortalezas del cerebro autista.'
            ]
            : [
                '⚡ ¿Cansado de luchar contra tu TDAH? La IA tiene la solución que estabas buscando.',
                '🚀 Descubre cómo personas con TDAH están triplicando su productividad con estas herramientas de IA.',
                '🧠 El secreto de productividad que está ayudando a miles de personas neurodivergentes.',
                '💡 Si tienes TDAH, este video puede cambiar tu forma de trabajar para siempre.'
            ];
        return hooks[Math.floor(Math.random() * hooks.length)];
    }

    /**
     * Genera timestamps dinámicos basados en la duración del video
     * @private
     */
    private static generateYouTubeTimestamps(durationMinutes: number): string {
        const sections = [
            { label: 'Introducción', percentStart: 0 },
            { label: 'El problema que enfrentamos', percentStart: 0.1 },
            { label: 'La solución con IA', percentStart: 0.25 },
            { label: 'Demostración práctica', percentStart: 0.45 },
            { label: 'Consejos adicionales', percentStart: 0.7 },
            { label: 'Conclusión y próximos pasos', percentStart: 0.85 }
        ];

        const totalSeconds = durationMinutes * 60;
        
        return sections.map(section => {
            const seconds = Math.floor(section.percentStart * totalSeconds);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} - ${section.label}`;
        }).join('\n');
    }

    /**
     * Genera un párrafo rico en keywords para SEO de YouTube
     * @private
     */
    private static generateYouTubeKeywordParagraph(keywords: string[], channelKey: 'channel1' | 'channel2'): string {
        const contextualIntro = channelKey === 'channel1'
            ? 'En este video exploramos la intersección entre autismo e inteligencia artificial,'
            : 'En este video descubrimos cómo la IA puede potenciar la productividad de personas con TDAH,';
        
        const keywordPhrase = keywords.slice(0, 6).join(', ');
        
        return `${contextualIntro} abordando temas como ${keywordPhrase} y mucho más. Este contenido está diseñado específicamente para la comunidad neurodivergente que busca aprovechar la tecnología para mejorar su calidad de vida.`;
    }

    /**
     * Selecciona emojis apropiados para Instagram según el canal
     * @private
     */
    private static selectInstagramEmojis(channelKey: 'channel1' | 'channel2'): Record<string, string> {
        return channelKey === 'channel1'
            ? {
                main: '🧩',
                brain: '🧠',
                sparkle: '✨',
                check: '✅',
                point: '👆',
                save: '📌',
                share: '🔄'
            }
            : {
                main: '⚡',
                brain: '🧠',
                sparkle: '🚀',
                check: '✅',
                point: '👆',
                save: '📌',
                share: '🔄'
            };
    }

    /**
     * Genera un CTA específico para Instagram
     * @private
     */
    private static generateInstagramCTA(): string {
        const ctas = [
            '💬 ¿Te identificas? Comenta con un 💙 si esto resuena contigo.',
            '💬 Comenta "IA" si quieres más contenido como este.',
            '💬 ¿Cuál es tu mayor desafío? Cuéntame en los comentarios.',
            '💬 Etiqueta a alguien que NECESITA ver esto.',
            '💬 ¿Qué herramienta te gustaría que explique? Dímelo abajo 👇'
        ];
        return ctas[Math.floor(Math.random() * ctas.length)];
    }

    /**
     * Genera un CTA específico para TikTok (ultra-corto)
     * @private
     */
    private static generateTikTokCTA(): string {
        const ctas = [
            '¡Sígueme para más! 🔥',
            'Like si te sirve 👍',
            'Comenta 🧠 si quieres pt.2',
            'Follow para más tips 💡',
            'Guárdalo para después 📌'
        ];
        return ctas[Math.floor(Math.random() * ctas.length)];
    }

    /**
     * Adapta títulos por plataforma
     * @param baseStrategy Estrategia SEO base
     * @returns Títulos optimizados para cada plataforma
     * @requirement REQ-3.5.3
     */
    static adaptPlatformTitles(baseStrategy: SEOStrategy): PlatformTitles {
        console.log(`📌 SEOAgent: Adaptando títulos por plataforma...`);

        const originalTitle = baseStrategy.viralTitle;

        // YouTube: Max 60 caracteres, SEO optimizado
        // Mantener keywords importantes, truncar si es necesario
        let youtubeTitle = originalTitle;
        if (youtubeTitle.length > 60) {
            // Intentar cortar en un espacio para no cortar palabras
            const truncated = youtubeTitle.substring(0, 57);
            const lastSpace = truncated.lastIndexOf(' ');
            youtubeTitle = lastSpace > 40 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
        }

        // Instagram: Caption format con hooks
        // No hay título per se, pero usamos el texto principal del caption
        // Añadir emojis y formato más casual
        const instagramTitle = this.formatInstagramTitle(originalTitle);

        // TikTok: Ultra-corto, punchy caption
        // Máximo 30-40 chars, super directo
        let tiktokTitle = this.formatTikTokTitle(originalTitle);

        console.log(`✅ SEOAgent: Títulos adaptados - YT: ${youtubeTitle.length} chars, IG: ${instagramTitle.length} chars, TT: ${tiktokTitle.length} chars`);

        return {
            youtube: youtubeTitle,
            instagram: instagramTitle,
            tiktok: tiktokTitle
        };
    }

    /**
     * Genera una estrategia SEO completa multiplataforma
     * Combina todas las optimizaciones por plataforma en un solo objeto
     * @param language Idioma del contenido
     * @param performanceContext Contexto de rendimiento del canal
     * @param channelKey Canal objetivo
     * @returns Estrategia SEO completa para todas las plataformas
     */
    static async generateMultiPlatformStrategy(
        language: string = 'Spanish',
        performanceContext?: string,
        channelKey: 'channel1' | 'channel2' = 'channel1'
    ): Promise<MultiPlatformSEOStrategy> {
        console.log(`🚀 SEOAgent: Generando estrategia SEO multiplataforma completa...`);

        // 1. Generar estrategia base
        const baseStrategy = await this.generateDailySEOStrategy(
            language,
            performanceContext,
            'video',
            channelKey
        );

        // 2. Generar hashtags específicos por plataforma
        const hashtags = this.generatePlatformHashtags(baseStrategy, channelKey);

        // 3. Generar descripciones optimizadas
        const descriptions = this.generatePlatformDescriptions(baseStrategy, hashtags, channelKey);

        // 4. Adaptar títulos por plataforma
        const titles = this.adaptPlatformTitles(baseStrategy);

        // 5. Detectar mood del contenido para AudioMixer
        const detectedMood = this.detectContentMood(baseStrategy);

        console.log(`✅ SEOAgent: Estrategia multiplataforma completa generada!`);
        console.log(`   - Mood detectado: ${detectedMood}`);
        console.log(`   - Plataformas: YouTube, Instagram, TikTok`);

        return {
            base: baseStrategy,
            hashtags,
            descriptions,
            titles,
            detectedMood,
            channelKey
        };
    }

    // ====================================================================================
    // MÉTODOS AUXILIARES PRIVADOS
    // ====================================================================================

    /**
     * Genera un hook para Instagram basado en el tema
     */
    private static generateInstagramHook(topic: string): string {
        const hooks = [
            '¿Sabías que tu cerebro neurodivergente puede ser tu superpoder? 🦸',
            'POV: Cuando descubres que la IA entiende tu forma de pensar 🤯',
            'Lo que nadie te dice sobre ser neurodivergente en tech... 👀',
            'STOP ✋ Si eres neurodivergente, necesitas ver esto',
            '3 cosas que cambiaron mi vida como persona neurodivergente 💡',
            'La IA que está revolucionando la neurodiversidad 🧠',
            '¿Te sientes diferente? Esto es para ti 💙'
        ];
        return hooks[Math.floor(Math.random() * hooks.length)];
    }

    /**
     * Genera un hook ultra-corto para TikTok
     */
    private static generateTikTokHook(title: string): string {
        // Extraer las primeras palabras clave
        const words = title.split(' ').slice(0, 4);
        const shortened = words.join(' ');
        
        const hooks = [
            `POV: ${shortened}`,
            `Esto NO te lo enseñan 👀`,
            `Wait for it... 🤯`,
            `Cerebro divergente = superpoder`,
            `La IA que NECESITAS 🧠`,
            `STOP 🛑 Mira esto primero`
        ];
        
        return hooks[Math.floor(Math.random() * hooks.length)];
    }

    /**
     * Formatea el título para Instagram con emojis y estilo casual
     */
    private static formatInstagramTitle(title: string): string {
        // Añadir emojis relevantes
        const emojiMap: Record<string, string> = {
            'autismo': '🧩',
            'ia': '🤖',
            'inteligencia artificial': '🤖',
            'tdah': '⚡',
            'productividad': '📈',
            'cerebro': '🧠',
            'ventaja': '✨',
            'secreto': '🔑',
            'hack': '💡'
        };

        let formattedTitle = title;
        
        // Añadir emoji al inicio
        const emoji = Object.entries(emojiMap).find(([key]) => 
            title.toLowerCase().includes(key)
        )?.[1] || '✨';
        
        formattedTitle = `${emoji} ${formattedTitle}`;
        
        // Asegurar que no sea muy largo
        if (formattedTitle.length > 100) {
            formattedTitle = formattedTitle.substring(0, 97) + '...';
        }
        
        return formattedTitle;
    }

    /**
     * Formatea el título para TikTok: ultra-corto y punchy
     */
    private static formatTikTokTitle(title: string): string {
        // Versión super corta
        let tiktokTitle = title;
        
        // Si es muy largo, extraer solo la parte más impactante
        if (tiktokTitle.length > 40) {
            // Buscar palabras clave de impacto
            const impactWords = ['secreto', 'hack', 'truco', 'ventaja', 'poder', 'increíble', 'brutal'];
            const found = impactWords.find(w => tiktokTitle.toLowerCase().includes(w));
            
            if (found) {
                // Mantener contexto alrededor de la palabra impactante
                const idx = tiktokTitle.toLowerCase().indexOf(found);
                const start = Math.max(0, idx - 15);
                const end = Math.min(tiktokTitle.length, idx + found.length + 15);
                tiktokTitle = (start > 0 ? '...' : '') + tiktokTitle.substring(start, end) + (end < tiktokTitle.length ? '...' : '');
            } else {
                // Truncar al espacio más cercano
                const truncated = tiktokTitle.substring(0, 37);
                const lastSpace = truncated.lastIndexOf(' ');
                tiktokTitle = lastSpace > 20 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
            }
        }
        
        return tiktokTitle;
    }

    /**
     * Detecta el mood del contenido para selección de música
     * @param strategy Estrategia SEO base
     * @returns Mood detectado para AudioMixer
     */
    private static detectContentMood(strategy: SEOStrategy): 'ambient' | 'upbeat' | 'cinematic' | 'calm' | 'dramatic' {
        const topic = (strategy.rawTopic + ' ' + strategy.viralTitle).toLowerCase();
        
        // Keywords por mood
        const moodKeywords: Record<string, string[]> = {
            dramatic: ['secreto', 'increíble', 'impactante', 'revelación', 'descubrimiento', 'nunca', 'jamás'],
            upbeat: ['productividad', 'energía', 'motivación', 'éxito', 'lograr', 'conseguir', 'hack', 'truco'],
            calm: ['meditación', 'calma', 'tranquilo', 'sensorial', 'relajación', 'bienestar', 'equilibrio'],
            cinematic: ['futuro', 'revolución', 'cambiar', 'transformar', 'era', 'historia', 'épico'],
            ambient: ['educativo', 'explicar', 'entender', 'aprender', 'conocer', 'guía', 'tutorial']
        };
        
        let maxScore = 0;
        let detectedMood: 'ambient' | 'upbeat' | 'cinematic' | 'calm' | 'dramatic' = 'ambient';
        
        for (const [mood, keywords] of Object.entries(moodKeywords)) {
            const score = keywords.filter(kw => topic.includes(kw)).length;
            if (score > maxScore) {
                maxScore = score;
                detectedMood = mood as typeof detectedMood;
            }
        }
        
        return detectedMood;
    }
}
