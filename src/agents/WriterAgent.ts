import { ModelRouter } from '../config/ModelRouter';

export class WriterAgent {
    /**
     * Writes an SEO-optimized article based on the strategy.
     */
    static async writeArticle(title: string, keywords: string[]): Promise<string | null> {
        const systemPrompt = `You are an expert SEO content writer and data analyst, specializing in the intersection of Artificial Intelligence and Neurodiversity (specifically Autism).
Your goal is to write highly engaging, human-like, and algorithm-friendly articles.
Always format the output in Markdown.
Use clear H1, H2, and H3 tags.
Include bullet points where appropriate.
Naturally integrate the provided keywords.
Make the tone analytical, accessible, and uniquely insightful by connecting technological trends (AI) with the autistic perspective or how neurodivergent minds interact with tech.`;

        const userPrompt = `Write a comprehensive, 1000-word article titled "${title}".
Make sure to include the following keywords naturally: ${keywords.join(', ')}.
The article must have:
1. An engaging introduction that hooks the reader.
2. 3-4 main sections (H2) with actionable insights.
3. A conclusion that encourages comments.
Output only the markdown content, no extra chat text.`;

        console.log(`Generating article for title: "${title}"...`);
        // Using a fast model for writing the bulk of the content
        const articleContent = await ModelRouter.generateText(userPrompt, 'deepseek-chat', systemPrompt);
        
        return articleContent;
    }
}
