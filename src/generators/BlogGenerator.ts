import OpenAI from 'openai';
import dotenv from 'dotenv';
import { SEOStrategy } from '../agents/SEOAgent';
import { RetryHandler } from '../infrastructure/RetryHandler';
dotenv.config();

// Instancia de RetryHandler preconfigurada para DeepSeek API
const deepSeekRetry = RetryHandler.forAPI('DeepSeek');

export interface BlogArticle {
    title: string;
    contentMarkdown: string;
    keywords: string[];
}

export class BlogGenerator {
    private static openai = new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    });

    /**
     * Generates a long-form article using DeepSeek, formatted in Markdown.
     * @param seo The SEO Strategy containing the viral title and keywords
     */
    public static async generateArticle(seo: SEOStrategy): Promise<BlogArticle> {
        console.log(`Generating Blog Article in Spanish for topic: "${seo.rawTopic}" using DeepSeek...`);

        const systemPrompt = `You are a human neurodivergent software engineer, AI researcher, and parent writing for 'NeuroSync AI'.
Your writing style is deeply authentic, personal, technical, and humanized.

CRITICAL HUMANIZATION & ANTI-AUTOMOD RULES:
1. NEVER start with generic AI cliches like "En el mundo actual", "En la era digital", "La inteligencia artificial ha revolucionado", "En este artículo exploraremos".
2. Start with an organic, relatable personal story, a real-world dilemma, or a concrete situation written in the first person ("Llevo años utilizando...", "Hace unos meses descubrí...").
3. Include at least ONE markdown code block containing a real, copy-pasteable prompt template or workflow script.
4. Include at least ONE markdown comparison table (e.g. comparing approaches, tools, or techniques).
5. DO NOT use mechanical summary conclusions ("En conclusión", "En resumen"). Use a natural final section titled with a conversational closing thought.
6. Use varied sentence structures, authentic tone, technical precision, and genuine empathy.
7. Seamlessly weave in the viral title "${seo.viralTitle}" and the target keywords: ${seo.keywords.join(', ')}.
8. Ensure keywords are clean, single-word or short alphanumeric phrases (no long punctuation or special characters).
9. Output ONLY a valid JSON object.`;

        const userPrompt = `Write a deeply humanized, 1200+ word technical and empathetic blog article in Spanish on the topic: "${seo.rawTopic}".

Output ONLY a raw JSON object with this exact structure (no markdown formatting around the JSON):
{
  "title": "An engaging, natural, humanized title",
  "contentMarkdown": "The full article in Markdown format with H2, H3, code blocks, comparison table, and personal narrative. Use \\n for line breaks.",
  "keywords": ["autismo", "inteligencia-artificial", "productividad", "claude-ai", "rutinas"]
}`;

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas DeepSeek
            const response = await deepSeekRetry.execute(
                () => this.openai.chat.completions.create({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                }),
                'DeepSeek generateArticle'
            );

            const rawJson = response.choices[0].message.content?.trim() || '{}';
            
            // Remove markdown code blocks if the AI ignored the instruction
            let cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            
            const article = JSON.parse(cleanJson) as BlogArticle;
            console.log('Blog Article generated successfully!');
            console.log(`Title: ${article.title}`);
            console.log(`Word Count: ${article.contentMarkdown.split(' ').length}`);
            return article;
        } catch (error) {
            console.error('Failed to generate article with DeepSeek:', error);
            throw error;
        }
    }
}
