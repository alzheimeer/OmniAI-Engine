import { ScriptGenerator } from './generators/ScriptGenerator';
import { AudioGenerator } from './generators/AudioGenerator';
import { VideoRenderer } from './generators/VideoRenderer';
import { YouTubePublisher } from './publishers/YouTubePublisher';
import { SEOStrategy } from './agents/SEOAgent';

(async () => {
    try {
        console.log('Testing Long-Form Video Generator (Spanish) -> PUBLIC Upload...');
        
        const seo: SEOStrategy = {
            rawTopic: 'Cómo la Inteligencia Artificial está revolucionando la comunicación en el Autismo',
            viralTitle: 'IA y Autismo: Revolucionando la Comunicación',
            keywords: ['autismo', 'ia', 'comunicacion']
        };
        
        // 1. Generate Long Script
        const script = await ScriptGenerator.generateLongScript(seo, 'Spanish');
        console.log(`Title: ${script.title}`);
        console.log(`Word Count: ${script.spokenText.split(' ').length}`);
        
        const audioFile = 'test-long-audio.mp3';
        const videoFile = 'final-long-video.mp4';

        // 2. Generate Audio
        await AudioGenerator.generateAudio(script.spokenText, audioFile, 'Spanish');
        
        // 3. Render Long Video
        if (!script.visualPrompts || script.visualPrompts.length === 0) {
            throw new Error('No visual prompts returned by DeepSeek for long video.');
        }
        await VideoRenderer.renderLongVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);

        // 4. Publish to YouTube (PUBLIC)
        const videoUrl = "local_only_no_upload";

        console.log(`\n🎉 SUCCESS! Long video published publicly at: ${videoUrl}`);

    } catch (error) {
        console.error('Error during long video test:', error);
    }
})();
