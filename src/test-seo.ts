import { SEOAgent } from './agents/SEOAgent';

(async () => {
    try {
        console.log('Testing SEO Agent...');
        const strategy = await SEOAgent.generateDailySEOStrategy('Spanish');
        console.log('\n=== RESULTADO FINAL ===');
        console.log('Tema Base:', strategy.rawTopic);
        console.log('Título Viral:', strategy.viralTitle);
        console.log('Tags (Cantidad):', strategy.keywords.length);
        console.log('Lista de Tags:', strategy.keywords.join(', '));
    } catch (error) {
        console.error(error);
    }
})();
