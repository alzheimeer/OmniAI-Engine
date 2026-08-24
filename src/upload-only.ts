import { YouTubePublisher } from './publishers/YouTubePublisher';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    try {
        console.log('Uploading already rendered video...');
        
        const videoMetadata = {
            title: 'IA y Autismo: 5 Herramientas que Cambian Vidas',
            description: 'Las mejores herramientas de IA para personas con Autismo.',
            tags: ['autismo', 'inteligencia artificial', 'NeuroSync AI'],
            privacyStatus: 'public' as const
        };

        const url = await YouTubePublisher.publishVideo('final-long-video.mp4', videoMetadata);
        console.log('🎉 SUCCESS! Video published publicly at:', url);
    } catch (error) {
        console.error('Error during upload test:', error);
    }
})();
