import { AudioGenerator } from './generators/AudioGenerator';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    try {
        console.log('Testing Audio Generator and OAuth Flow...');
        const text = "Hola mundo. Soy el cerebro de OmniAI Engine. El autismo no es un error de sistema, es un sistema operativo diferente, diseñado para la hiperconcentración.";
        const path = await AudioGenerator.generateAudio(text, 'test-voice.mp3');
        console.log(`Test complete! Listen to the audio at: ${path}`);
    } catch (error) {
        console.error('Error in test:', error);
    }
})();
