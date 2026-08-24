// Ejecutar manualmente un Short en español
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar módulos compilados de dist/
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   🎬 EJECUTANDO SHORT PIPELINE MANUALMENTE');
    console.log('   Idioma: Spanish');
    console.log('   Fecha:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
        // Importar módulos dinámicamente desde dist/
        const { SEOAgent } = await import('./dist/agents/SEOAgent.js');
        const { AnalyticsEngine } = await import('./dist/agents/AnalyticsEngine.js');
        const { ScriptGenerator } = await import('./dist/generators/ScriptGenerator.js');
        const { AudioGenerator } = await import('./dist/generators/AudioGenerator.js');
        const { VideoRenderer } = await import('./dist/generators/VideoRenderer.js');
        const { YouTubePublisher } = await import('./dist/publishers/YouTubePublisher.js');
        const { Database } = await import('./dist/db/Database.js');
        const { TelegramReporter } = await import('./dist/reporters/TelegramReporter.js');
        
        const language = 'Spanish';
        
        console.log('📊 1. Sincronizando analíticas...');
        const analytics = await AnalyticsEngine.syncMetrics();
        console.log('   ✅ Analíticas obtenidas');
        
        console.log('\n🔍 2. Generando estrategia SEO...');
        const seo = await SEOAgent.generateDailySEOStrategy(language, analytics.performanceSummary);
        console.log('   ✅ Tema:', seo.viralTitle);
        console.log('   ✅ Keywords:', seo.keywords.slice(0, 5).join(', '));
        
        console.log('\n✍️  3. Generando guión del Short...');
        const script = await ScriptGenerator.generateShortScript(seo, language);
        script.title = seo.viralTitle;
        script.tags = seo.keywords;
        console.log('   ✅ Guión generado');
        console.log('   - Título:', script.title);
        console.log('   - Duración texto:', script.spokenText.length, 'caracteres');
        
        const audioFile = `short-${language.toLowerCase()}.mp3`;
        const videoFile = `final-short-${language.toLowerCase()}.mp4`;
        
        console.log('\n🔊 4. Generando audio con TTS...');
        await AudioGenerator.generateAudio(script.spokenText, audioFile, language);
        console.log('   ✅ Audio generado:', audioFile);
        
        console.log('\n🎥 5. Renderizando video...');
        const visualPrompt = script.visualPrompts[0] || 'technology data artificial intelligence';
        await VideoRenderer.renderVideo(visualPrompt, audioFile, videoFile);
        console.log('   ✅ Video renderizado:', videoFile);
        
        console.log('\n📤 6. Subiendo a YouTube...');
        const url = await YouTubePublisher.publishVideo(videoFile, {
            title: script.title,
            description: script.description + '\n\n#Autism #AI #Neurodiversity #NeuroSyncAI',
            tags: script.tags,
            privacyStatus: 'public'
        });
        console.log('   ✅ VIDEO PUBLICADO:', url);
        
        // Guardar en DB
        const youtubeId = url.split('v=')[1] || url;
        await Database.saveVideo(youtubeId, script.title, language);
        console.log('   ✅ Guardado en base de datos');
        
        // Notificar por Telegram
        await TelegramReporter.sendMessage(`✅ <b>Short publicado manualmente!</b>\nIdioma: ${language}\nTítulo: ${script.title}\nURL: ${url}`);
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('   ✅ PIPELINE COMPLETADO EXITOSAMENTE');
        console.log('   URL:', url);
        console.log('═══════════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

main();
