import fs from 'fs';
import path from 'path';
import { HashnodePublisher } from './publishers/HashnodePublisher';

(async () => {
    try {
        console.log('Reading real article from disk...');
        const filePath = path.join(__dirname, '../content/2026-08-03-why-neurodivergent-talent-is-the-secret-weapon-for-building-safer-more-ethical-ai-systems.md');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        // Extract title from the first line (# Title)
        const lines = fileContent.split('\n');
        const title = lines[0].replace('# ', '').trim();
        const body = lines.slice(1).join('\n').trim();
        
        console.log(`Publishing real article to Hashnode: "${title}"...`);
        const keywords = ['AI', 'Neurodiversity', 'Technology', 'Future', 'Ethics'];
        
        const url = await HashnodePublisher.publish(title, body, keywords);
        console.log(`Success! URL: ${url}`);
    } catch (error) {
        console.error('Failed to publish real article to Hashnode:', error);
    }
})();
