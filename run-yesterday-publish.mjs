import { AutonomousOrchestrator } from './dist/generators/AutonomousOrchestrator.js';
import { TelegramReporter } from './dist/reporters/TelegramReporter.js';
import { Database } from './dist/db/Database.js';

async function publishYesterdayContent() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 EJECUTANDO PUBLICACIÓN MANUAL DE CONTENIDO PENDIENTE (MIÉRCOLES/CANAL 2)');
    console.log('Canal: NeuroTech AI (channel2)');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        console.log('📱 1. Generando y publicando SHORT para NeuroTech AI (channel2)...');
        await AutonomousOrchestrator.runShortPipeline('Spanish', 'channel2');
        console.log('✅ Short para canal 2 encolado/publicado con éxito.\n');

        console.log('🎬 2. Generando y publicando VIDEO LARGO (Documental) para NeuroTech AI (channel2)...');
        await AutonomousOrchestrator.runLongPipeline('Spanish', 'channel2');
        console.log('✅ Video Largo para canal 2 encolado/publicado con éxito.\n');

        console.log('🎉 Proceso completado exitosamente.');
    } catch (error) {
        console.error('❌ Error ejecutando la publicación:', error);
    }
}

publishYesterdayContent();
