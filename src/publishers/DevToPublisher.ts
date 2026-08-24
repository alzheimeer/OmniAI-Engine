import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class DevToPublisher {
    private static apiKey = process.env.DEV_TO_API_KEY;

    static async publish(title: string, content: string, tags: string[] = ['AI', 'Autism', 'Tech']): Promise<string | null> {
        if (!this.apiKey) {
            console.error('DEV_TO_API_KEY missing in .env');
            return null;
        }

        console.log(`Starting to publish to Dev.to...`);

        try {
            const cleanTags = tags
                .map(t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""))
                .filter(t => t.length > 0)
                .slice(0, 4);

            const response = await axios.post('https://dev.to/api/articles', {
                article: {
                    title: title,
                    body_markdown: content,
                    published: true,
                    tags: cleanTags.length > 0 ? cleanTags : ['ai', 'tech', 'autism']
                }
            }, {
                headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            const url = response.data.url;
            console.log(`Successfully published to Dev.to! URL: ${url}`);
            return url;

        } catch (error: any) {
            console.error('Error publishing to Dev.to:', error.response?.data || error.message);
            return null;
        }
    }
}
