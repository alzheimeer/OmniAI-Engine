import axios from 'axios';
import dotenv from 'dotenv';
import { RetryHandler } from '../infrastructure/RetryHandler';

dotenv.config();

// Instancia de RetryHandler preconfigurada para DeepSeek API
const deepSeekRetry = RetryHandler.forAPI('DeepSeek');

export class ModelRouter {
    private static apiKey = process.env.DEEPSEEK_API_KEY;
    private static baseUrl = 'https://api.deepseek.com';

    /**
     * Completes a chat request using the specified model.
     * @param prompt The user prompt
     * @param model e.g., 'deepseek-chat'
     */
    static async generateText(prompt: string, model: string = 'deepseek-chat', systemPrompt?: string): Promise<string | null> {
        if (!this.apiKey) {
            console.error('DEEPSEEK_API_KEY is not defined.');
            return null;
        }

        try {
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas DeepSeek
            const response = await deepSeekRetry.execute(
                () => axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model: model,
                        messages: [
                            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                            { role: 'user', content: prompt }
                        ]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                        }
                    }
                ),
                `DeepSeek generateText (${model})`
            );

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating text with model:', model, error);
            return null;
        }
    }
}
