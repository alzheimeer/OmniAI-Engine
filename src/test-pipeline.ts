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
            rawTopic: 'Por qué el hiperfoco autista es la mejor habilidad para programar IA',
            viralTitle: 'Hiperfoco Autista: La Habilidad Secreta en la Era de la IA',
            keywords: ['autismo', 'hiperfoco', 'ia', 'programacion']
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
        const visualPrompt = script.visualPrompts[0] || 'futuristic technology'; 
        await VideoRenderer.renderVideo(visualPrompt, audioFile, videoFile);
        console.log('✅ Video final renderizado correctamente!\n');

        // 4. Subir a YouTube (como PRIVADO para no asustar a los suscriptores todavía)
        console.log('📤 PASO 4: Subiendo video a YouTube...');
        const youtubeUrl = await YouTubePublisher.publishVideo(videoFile, {
            title: script.title,
            description: script.description + '\n\n#Autism #AI #Neurodiversity',
            tags: script.tags,
            privacyStatus: 'private' // ¡Privado por ahora para revisar que todo esté bien!
        });
        
        console.log('\n==================================================');
        console.log('🎉 ¡FLUJO COMPLETO TERMINADO CON ÉXITO! 🎉');
        console.log(`🔗 Puedes ver tu video aquí: ${youtubeUrl}`);
        console.log('==================================================');

    } catch (error) {
        console.error('\n❌ Hubo un error en la tubería (pipeline):', error);
    }
})();
