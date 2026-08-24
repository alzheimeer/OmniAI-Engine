import { HashnodePublisher } from './HashnodePublisher';
import { MediumPublisher } from './MediumPublisher';
import { DevToPublisher } from './DevToPublisher';
import { Database } from '../db/Database';

export interface MultiBlogResult {
    title: string;
    hashnodeUrl?: string;
    mediumUrl?: string;
    devToUrl?: string;
}

export class BlogDispatcher {
    /**
     * Publica simultáneamente un artículo en Hashnode, Medium y Dev.to
     */
    public static async publishToAll(title: string, contentMarkdown: string, keywords: string[]): Promise<MultiBlogResult> {
        console.log(`🚀 BlogDispatcher: Iniciando publicación masiva multi-plataforma para: "${title}"...`);

        // Lanzar publicaciones en paralelo
        const [hashnodeRes, mediumRes, devToRes] = await Promise.allSettled([
            HashnodePublisher.publish(title, contentMarkdown, keywords),
            MediumPublisher.publish(title, contentMarkdown, keywords, 'public'),
            DevToPublisher.publish(title, contentMarkdown, keywords)
        ]);

        const hashnodeUrl = hashnodeRes.status === 'fulfilled' ? hashnodeRes.value || undefined : undefined;
        const mediumUrl = mediumRes.status === 'fulfilled' ? mediumRes.value || undefined : undefined;
        const devToUrl = devToRes.status === 'fulfilled' ? devToRes.value || undefined : undefined;

        console.log('📊 Resultados de publicación Multi-Plataforma:');
        console.log(`- Hashnode: ${hashnodeUrl || '❌ Falló / No configurado'}`);
        console.log(`- Medium:   ${mediumUrl || '❌ Falló / No configurado'}`);
        console.log(`- Dev.to:   ${devToUrl || '❌ Falló / No configurado'}`);

        // Guardar registro en la Base de Datos SQLite
        await Database.saveBlog(title, hashnodeUrl, mediumUrl, devToUrl);

        return {
            title,
            hashnodeUrl,
            mediumUrl,
            devToUrl
        };
    }
}
