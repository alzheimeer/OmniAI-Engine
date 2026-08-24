import { AutonomousOrchestrator } from './generators/AutonomousOrchestrator';

async function runLongVideo() {
    console.log('🚀 EJECUTANDO PIPELINE REAL DEL DOCUMENTAL LARGO (NeuroTech AI - Spanish)...');
    try {
        await AutonomousOrchestrator.runLongPipeline('Spanish', 'channel2');
        console.log('✅ Documental largo completado y publicado exitosamente!');
    } catch (err: any) {
        console.error('❌ Error en ejecución:', err.message);
    }
}

runLongVideo();
