import { BlogGenerator } from './generators/BlogGenerator';
import { HashnodePublisher } from './publishers/HashnodePublisher';
import { SEOStrategy } from './agents/SEOAgent';

(async () => {
    try {
        console.log('Testing Blog Pipeline...');
        
        // 1. Generate Article
        const seo: SEOStrategy = {
            rawTopic: 'Las mejores herramientas de IA para autistas en 2026',
            viralTitle: 'Las 5 Herramientas de IA que Cambiarán la Vida de las Personas con Autismo',
            keywords: ['autismo', 'inteligencia artificial', 'neurodiversidad', 'herramientas ia']
        };
        const article = await BlogGenerator.generateArticle(seo);
        
        console.log('Article generated! Publishing to Hashnode...');
        
        // 2. Publish to Hashnode
        const url = await HashnodePublisher.publish(article.title, article.contentMarkdown, article.keywords);
        
        if (url) {
            console.log('✅ TEST SUCCESS! Blog published at:', url);
        } else {
            console.log('❌ TEST FAILED! Blog was not published.');
        }
    } catch (error) {
        console.error('Error in blog test:', error);
    }
})();
