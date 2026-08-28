import { SEOAgent } from './dist/agents/SEOAgent.js';
import { AnalyticsEngine } from './dist/agents/AnalyticsEngine.js';
import { ScriptGenerator } from './dist/generators/ScriptGenerator.js';
import { AudioGenerator } from './dist/generators/AudioGenerator.js';
import { VideoRenderer } from './dist/generators/VideoRenderer.js';
import { YouTubePublisher } from './dist/publishers/YouTubePublisher.js';
import { Database } from './dist/db/Database.js';
import { TelegramReporter } from './dist/reporters/TelegramReporter.js';
import fs from 'fs';
import path from 'path';

const DRAFT_METADATA_FILE = path.join(process.cwd(), 'content', 'pending_publish_draft.json');

async function runLongVideoDraftOnly() {
    const isPublishCommand = process.argv.includes('--publish');

    // -------------------------------------------------------------------------
    // PUBLICAR BORRADOR SI SE INDICA --publish
    // -------------------------------------------------------------------------
    if (isPublishCommand) {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📤 PUBLICANDO BORRADOR GUARDADO A YOUTUBE');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (!fs.existsSync(DRAFT_METADATA_FILE)) {
            console.error('❌ No hay ningún borrador guardado en content/pending_publish_draft.json.');
            return;
        }

        const draftData = JSON.parse(fs.readFileSync(DRAFT_METADATA_FILE, 'utf-8'));
        const { channelKey, channelName, tokenPath, hashtagBlock, long } = draftData;

        try {
            if (long && fs.existsSync(long.videoFilePath)) {
                console.log(`🎬 Subiendo Video Largo borrador: "${long.title}"...`);
                const longUrl = await YouTubePublisher.publishVideo(
                    long.videoFileName,
                    {
                        title: long.title,
                        description: `${long.description}\n\n${hashtagBlock}`,
                        tags: long.tags,
                        privacyStatus: 'public',
                        isShort: false,
                        visualPrompt: long.visualPrompt
                    },
                    tokenPath
                );
                console.log(`✅ VIDEO LARGO PUBLICADO: ${longUrl}`);
                const longYoutubeId = longUrl.split('v=')[1] || longUrl;
                await Database.saveVideo(longYoutubeId, long.title, 'Spanish');
                await TelegramReporter.sendMessage(`✅ <b>Documental Publicado desde Borrador en ${channelName}!</b>\nTítulo: ${long.title}\nURL: ${longUrl}`);
            }

            fs.unlinkSync(DRAFT_METADATA_FILE);
            console.log('🎉 Borrador publicado exitosamente.');
        } catch (error) {
            console.error('❌ Error publicando borrador:', error);
        }
        return;
    }

    // -------------------------------------------------------------------------
    // MODO GENERACIÓN DE VIDEO LARGO (DOCUMENTAL) BORRADOR
    // -------------------------------------------------------------------------
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 GENERANDO VIDEO LARGO (DOCUMENTAL) BORRADOR LOCAL - SÓLO CANAL 2');
    console.log('═══════════════════════════════════════════════════════════\n');

    const channelKey = 'channel2';
    const channelName = 'NeuroTech AI';
    const tokenPath = 'oauth2.tokens.channel2.json';
    const hashtagBlock = '#NeuroTech #AI #Productivity #ADHD #Neurodivergent';

    try {
        console.log('📊 Sincronizando analíticas y generando SEO...');
        const analyticsLong = await AnalyticsEngine.syncMetrics(channelKey);
        const seoLong = await SEOAgent.generateDailySEOStrategy('Spanish', analyticsLong.performanceSummary, 'video', channelKey);
        
        console.log('📝 Generando guion de Video Largo...');
        const scriptLong = await ScriptGenerator.generateLongScript(seoLong, 'Spanish', channelKey);
        scriptLong.title = seoLong.viralTitle;
        scriptLong.tags = seoLong.keywords;

        const audioFileLong = `long-${channelKey}-spanish.mp3`;
        const videoFileLong = `final-long-${channelKey}-spanish.mp4`;

        console.log('🔊 Generando voz TTS...');
        await AudioGenerator.generateAudio(scriptLong.spokenText, audioFileLong, 'Spanish');

        if (!scriptLong.visualPrompts || scriptLong.visualPrompts.length === 0) {
            scriptLong.visualPrompts = [seoLong.viralTitle, 'technology workplace', 'artificial intelligence future', 'productivity app'];
        }
        
        console.log('🎥 Renderizando Video Largo (Wan 2.1 IA local + Pexels HD)...');
        const renderedLongPath = await VideoRenderer.renderLongVideo(
            scriptLong.visualPrompts, 
            audioFileLong, 
            videoFileLong, 
            scriptLong.spokenText, 
            scriptLong.comfyPrompts
        );
        console.log(`✅ Video Largo renderizado localmente en: ${renderedLongPath}`);

        const draftMetadata = {
            generatedAt: new Date().toISOString(),
            channelKey,
            channelName,
            tokenPath,
            hashtagBlock,
            long: {
                title: scriptLong.title,
                description: scriptLong.description,
                tags: scriptLong.tags,
                videoFileName: videoFileLong,
                videoFilePath: renderedLongPath,
                visualPrompt: scriptLong.visualPrompts?.[0]
            }
        };

        const contentDir = path.join(process.cwd(), 'content');
        if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true });
        fs.writeFileSync(DRAFT_METADATA_FILE, JSON.stringify(draftMetadata, null, 2));

        await TelegramReporter.sendMessage(`🎬 <b>Video Largo de Prueba listo para revisar:</b>\nTítulo: "${scriptLong.title}"\nUbicación: content/${videoFileLong}\n\n📌 <i>Para publicar en YouTube cuando regreses, ejecuta: node publish-direct.mjs --publish</i>`);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('🎉 VIDEO LARGO GENERADO CON ÉXITO Y GUARDADO LOCALMENTE');
        console.log(`🎬 Archivo MP4: ${renderedLongPath}`);
        console.log('\n📌 Cuando regreses y apruebes el video, ejecutas:');
        console.log('   node publish-direct.mjs --publish');
        console.log('═══════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error generando Video Largo:', error);
    }
}

runLongVideoDraftOnly();
