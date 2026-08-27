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

async function runTestOrPublishFlow() {
    const isPublishCommand = process.argv.includes('--publish');
    const isDraftCommand = process.argv.includes('--draft');

    // -------------------------------------------------------------------------
    // FLUJO DE PUBLICACIÓN DE BORRADOR GUARDADO PREVIAMENTE
    // -------------------------------------------------------------------------
    if (isPublishCommand) {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📤 PUBLICANDO BORRADOR GUARDADO A YOUTUBE');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (!fs.existsSync(DRAFT_METADATA_FILE)) {
            console.error('❌ No hay ningún borrador guardado en content/pending_publish_draft.json. Ejecuta primero `node publish-direct.mjs --draft`.');
            return;
        }

        const draftData = JSON.parse(fs.readFileSync(DRAFT_METADATA_FILE, 'utf-8'));
        const { channelKey, channelName, tokenPath, hashtagBlock, short, long } = draftData;

        try {
            // Publicar Short si existe
            if (short && fs.existsSync(short.videoFilePath)) {
                console.log(`📱 Subiendo Short borrador: "${short.title}"...`);
                const shortUrl = await YouTubePublisher.publishVideo(
                    short.videoFileName,
                    {
                        title: short.title,
                        description: `${short.description}\n\n${hashtagBlock}`,
                        tags: short.tags,
                        privacyStatus: 'public',
                        isShort: true,
                        visualPrompt: short.visualPrompt
                    },
                    tokenPath
                );
                console.log(`✅ SHORT PUBLICADO: ${shortUrl}`);
                const shortYoutubeId = shortUrl.split('v=')[1] || shortUrl;
                await Database.saveVideo(shortYoutubeId, short.title, 'Spanish');
                await TelegramReporter.sendMessage(`✅ <b>Short Publicado desde Borrador en ${channelName}!</b>\nTítulo: ${short.title}\nURL: ${shortUrl}`);
            }

            // Publicar Video Largo si existe
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

            // Limpiar borrador para no republicar por error
            fs.unlinkSync(DRAFT_METADATA_FILE);
            console.log('🎉 Borrador publicado exitosamente y limpiado.');
        } catch (error) {
            console.error('❌ Error publicando el borrador guardado:', error);
        }
        return;
    }

    // -------------------------------------------------------------------------
    // FLUJO DE GENERACIÓN Y PRUEBA (MODO DRAFT POR DEFECTO)
    // -------------------------------------------------------------------------
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🧪 MODO DRAFT / TEST: GENERANDO VIDEO LOCAL (SIN PUBLICAR)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const channelKey = 'channel2';
    const channelName = 'NeuroTech AI';
    const tokenPath = 'oauth2.tokens.channel2.json';
    const hashtagBlock = '#NeuroTech #AI #Productivity #ADHD';

    try {
        // 1. GENERAR SHORT
        console.log('📱 [1/2] Generando SHORT con Wan 2.1 1.3B (ComfyUI)...');
        const analyticsShort = await AnalyticsEngine.syncMetrics(channelKey);
        const seoShort = await SEOAgent.generateDailySEOStrategy('Spanish', analyticsShort.performanceSummary, 'video', channelKey);
        const scriptShort = await ScriptGenerator.generateShortScript(seoShort, 'Spanish', channelKey);
        
        scriptShort.title = seoShort.viralTitle;
        scriptShort.tags = seoShort.keywords;

        const audioFileShort = `short-${channelKey}-spanish.mp3`;
        const videoFileShort = `final-short-${channelKey}-spanish.mp4`;

        console.log('   🔊 Generando voz TTS...');
        await AudioGenerator.generateAudio(scriptShort.spokenText, audioFileShort, 'Spanish');
        
        console.log('   🎥 Renderizando video Short (Wan 2.1 IA local)...');
        const renderedShortPath = await VideoRenderer.renderVideo(
            scriptShort.visualPrompts, 
            audioFileShort, 
            videoFileShort, 
            scriptShort.spokenText, 
            scriptShort.comfyPrompts
        );
        console.log(`   ✅ Short renderizado localmente en: ${renderedShortPath}`);

        // 2. GENERAR VIDEO LARGO
        console.log('\n🎬 [2/2] Generando VIDEO LARGO (Documental) con Wan 2.1 1.3B...');
        const analyticsLong = await AnalyticsEngine.syncMetrics(channelKey);
        const seoLong = await SEOAgent.generateDailySEOStrategy('Spanish', analyticsLong.performanceSummary, 'video', channelKey);
        const scriptLong = await ScriptGenerator.generateLongScript(seoLong, 'Spanish', channelKey);
        
        scriptLong.title = seoLong.viralTitle;
        scriptLong.tags = seoLong.keywords;

        const audioFileLong = `long-${channelKey}-spanish.mp3`;
        const videoFileLong = `final-long-${channelKey}-spanish.mp4`;

        console.log('   🔊 Generando voz TTS...');
        await AudioGenerator.generateAudio(scriptLong.spokenText, audioFileLong, 'Spanish');

        if (!scriptLong.visualPrompts || scriptLong.visualPrompts.length === 0) {
            scriptLong.visualPrompts = [seoLong.viralTitle, 'technology workplace', 'artificial intelligence future', 'productivity app'];
        }
        
        console.log('   🎥 Renderizando Video Largo (Wan 2.1 IA local)...');
        const renderedLongPath = await VideoRenderer.renderLongVideo(
            scriptLong.visualPrompts, 
            audioFileLong, 
            videoFileLong, 
            scriptLong.spokenText, 
            scriptLong.comfyPrompts
        );
        console.log(`   ✅ Video Largo renderizado localmente en: ${renderedLongPath}`);

        // Guardar metadata en borrador pendiente
        const draftMetadata = {
            generatedAt: new Date().toISOString(),
            channelKey,
            channelName,
            tokenPath,
            hashtagBlock,
            short: {
                title: scriptShort.title,
                description: scriptShort.description,
                tags: scriptShort.tags,
                videoFileName: videoFileShort,
                videoFilePath: renderedShortPath,
                visualPrompt: scriptShort.visualPrompts?.[0]
            },
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

        await TelegramReporter.sendMessage(`🧪 <b>Video de Prueba Generado (Borrador):</b>\nShort: "${scriptShort.title}"\nLargo: "${scriptLong.title}"\n\n📌 <i>Los archivos MP4 están listos localmente. Para publicar en YouTube ejecuta: node publish-direct.mjs --publish</i>`);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('🎉 PIPELINE MODO DRAFT COMPLETADO CON ÉXITO (SIN PUBLICAR EN YOUTUBE)');
        console.log(`📱 Short Renderizado: ${renderedShortPath}`);
        console.log(`🎬 Video Largo Renderizado: ${renderedLongPath}`);
        console.log('\n📌 Si apruebas el resultado y deseas publicar este mismo material en YouTube, ejecuta:');
        console.log('   node publish-direct.mjs --publish');
        console.log('═══════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error en generación de borrador:', error);
    }
}

runTestOrPublishFlow();
