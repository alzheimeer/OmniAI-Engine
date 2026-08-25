import { ScriptGenerator } from './generators/ScriptGenerator';
import { AudioGenerator } from './generators/AudioGenerator';
import { VideoRenderer } from './generators/VideoRenderer';
import { YouTubePublisher } from './publishers/YouTubePublisher';
import { SEOStrategy } from './agents/SEOAgent';

(async () => {
    try {
        console.log('==================================================');
        console.log('🚀 INICIANDO PRUEBA COMPLETA DEL MOTOR (FASE 3) 🚀');
        console.log('==================================================\n');

        const seo: SEOStrategy = {
            rawTopic: '3 Mitos sobre el Autismo y la Inteligencia Artificial',
            viralTitle: '3 Mitos sobre IA y Autismo',
            keywords: ['autismo', 'ia', 'mitos']
        };

        // 1. Generar Guion con DeepSeek
        console.log('🧠 PASO 1: DeepSeek escribiendo guion...');
        const script = await ScriptGenerator.generateShortScript(seo);
        console.log(`\n✅ Guion listo! Título: "${script.title}"`);
        console.log(`Texto a narrar: "${script.spokenText.substring(0, 50)}..."\n`);

        // 2. Generar Audio con Google Cloud TTS
        console.log('🎙️ PASO 2: Google TTS narrando el guion...');
        const audioFile = 'short-audio.mp3';
        await AudioGenerator.generateAudio(script.spokenText, audioFile);
        console.log('✅ Audio generado correctamente!\n');

        // 3. Renderizar Video con Pexels y FFmpeg
        console.log('🎥 PASO 3: Buscando video de fondo y renderizando...');
        const videoFile = 'final-short.mp4';
        // Usamos el primer prompt visual que nos dio DeepSeek, o un fallback
        await VideoRenderer.renderVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);
        console.log('✅ Video final renderizado correctamente!\n');

        // 4. Subir a YouTube (como PRIVADO para no asustar a los suscriptores todavía)
        console.log('📤 PASO 4: Omitiendo subida a YouTube para la prueba local...');
        const youtubeUrl = "local_only_no_upload";
        
        console.log('\n==================================================');
        console.log('🎉 ¡FLUJO COMPLETO TERMINADO CON ÉXITO! 🎉');
        console.log(`🔗 Puedes ver tu video aquí: ${youtubeUrl}`);
        console.log('==================================================');

    } catch (error) {
        console.error('\n❌ Hubo un error en la tubería (pipeline):', error);
    }
})();
