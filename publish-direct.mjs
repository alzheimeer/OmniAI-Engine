import { SEOAgent } from './dist/agents/SEOAgent.js';
import { AnalyticsEngine } from './dist/agents/AnalyticsEngine.js';
import { ScriptGenerator } from './dist/generators/ScriptGenerator.js';
import { AudioGenerator } from './dist/generators/AudioGenerator.js';
import { VideoRenderer } from './dist/generators/VideoRenderer.js';
import { YouTubePublisher } from './dist/publishers/YouTubePublisher.js';
import { Database } from './dist/db/Database.js';
import { TelegramReporter } from './dist/reporters/TelegramReporter.js';
import path from 'path';

async function directPublishYesterday() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 PUBLICACIÓN DIRECTA A YOUTUBE: CANAL 2 (NeuroTech AI)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const channelKey = 'channel2';
    const channelName = 'NeuroTech AI';
    const tokenPath = 'oauth2.tokens.channel2.json';
    const hashtagBlock = '#NeuroTech #AI #Productivity #ADHD';

    try {
        // ---------------------------------------------------------------------
        // 1. GENERAR Y PUBLICAR SHORT
        // ---------------------------------------------------------------------
        console.log('📱 [1/2] Generando y publicando SHORT para NeuroTech AI...');
        const analyticsShort = await AnalyticsEngine.syncMetrics(channelKey);
        const seoShort = await SEOAgent.generateDailySEOStrategy('Spanish', analyticsShort.performanceSummary, 'video', channelKey);
        const scriptShort = await ScriptGenerator.generateShortScript(seoShort, 'Spanish', channelKey);
        
        scriptShort.title = seoShort.viralTitle;
        scriptShort.tags = seoShort.keywords;

        const audioFileShort = `short-${channelKey}-spanish.mp3`;
        const videoFileShort = `final-short-${channelKey}-spanish.mp4`;

        console.log('   🔊 Generando voz TTS...');
        await AudioGenerator.generateAudio(scriptShort.spokenText, audioFileShort, 'Spanish');
        
        console.log('   🎥 Renderizando video Short...');
        await VideoRenderer.renderVideo(scriptShort.visualPrompts, audioFileShort, videoFileShort, scriptShort.spokenText, scriptShort.comfyPrompts);

        console.log('   📤 Subiendo Short directamente a YouTube (Channel 2)...');
        const shortUrl = await YouTubePublisher.publishVideo(
            videoFileShort,
            {
                title: scriptShort.title,
                description: `${scriptShort.description}\n\n${hashtagBlock}`,
                tags: scriptShort.tags,
                privacyStatus: 'public',
                isShort: true,
                visualPrompt: scriptShort.visualPrompts?.[0]
            },
            tokenPath
        );
        console.log(`   ✅ SHORT PUBLICADO EXITOSAMENTE: ${shortUrl}`);

        const shortYoutubeId = shortUrl.split('v=')[1] || shortUrl;
        await Database.saveVideo(shortYoutubeId, scriptShort.title, 'Spanish');
        await TelegramReporter.sendMessage(`✅ <b>Short Publicado en ${channelName}!</b>\nTítulo: ${scriptShort.title}\nURL: ${shortUrl}`);

        // ---------------------------------------------------------------------
        // 2. GENERAR Y PUBLICAR VIDEO LARGO (DOCUMENTAL)
        // ---------------------------------------------------------------------
        console.log('\n🎬 [2/2] Generando y publicando VIDEO LARGO (Documental) para NeuroTech AI...');
        const analyticsLong = await AnalyticsEngine.syncMetrics(channelKey);
        const seoLong = await SEOAgent.generateDailySEOStrategy('Spanish', analyticsLong.performanceSummary, 'video', channelKey);
        const scriptLong = await ScriptGenerator.generateLongScript(seoLong, 'Spanish', channelKey);
        
        scriptLong.title = seoLong.viralTitle;
        scriptLong.tags = seoLong.keywords;

        const audioFileLong = `long-${channelKey}-spanish.mp3`;
        const videoFileLong = `final-long-${channelKey}-spanish.mp4`;

        console.log('   🔊 Generando voz TTS para documental...');
        await AudioGenerator.generateAudio(scriptLong.spokenText, audioFileLong, 'Spanish');

        if (!scriptLong.visualPrompts || scriptLong.visualPrompts.length === 0) {
            scriptLong.visualPrompts = [seoLong.viralTitle, 'technology workplace', 'artificial intelligence future', 'productivity app'];
        }
        
        console.log('   🎥 Renderizando Video Largo...');
        await VideoRenderer.renderLongVideo(scriptLong.visualPrompts, audioFileLong, videoFileLong, scriptLong.spokenText, scriptLong.comfyPrompts);

        console.log('   📤 Subiendo Video Largo directamente a YouTube (Channel 2)...');
        const longUrl = await YouTubePublisher.publishVideo(
            videoFileLong,
            {
                title: scriptLong.title,
                description: `${scriptLong.description}\n\n${hashtagBlock}`,
                tags: scriptLong.tags,
                privacyStatus: 'public',
                isShort: false,
                visualPrompt: scriptLong.visualPrompts[0]
            },
            tokenPath
        );
        console.log(`   ✅ VIDEO LARGO PUBLICADO EXITOSAMENTE: ${longUrl}`);

        const longYoutubeId = longUrl.split('v=')[1] || longUrl;
        await Database.saveVideo(longYoutubeId, scriptLong.title, 'Spanish');
        await TelegramReporter.sendMessage(`✅ <b>Documental Publicado en ${channelName}!</b>\nTítulo: ${scriptLong.title}\nURL: ${longUrl}`);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('🎉 PIPELINE MANUAL COMPLETADO CON ÉXITO Y PUBLICADO EN YOUTUBE');
        console.log(`📱 Short: ${shortUrl}`);
        console.log(`🎬 Video Largo: ${longUrl}`);
        console.log('═══════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error en publicación directa:', error);
    }
}

directPublishYesterday();
