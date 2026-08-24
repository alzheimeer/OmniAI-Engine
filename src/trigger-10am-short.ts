import { AutonomousOrchestrator } from './generators/AutonomousOrchestrator';

async function run10amShort() {
    console.log('🚀 EJECUTANDO PIPELINE REAL DEL SHORT DE LAS 10:00 AM (NeuroSync AI - Español)...');
    try {
        await AutonomousOrchestrator.runShortPipeline('Spanish', 'channel1');
        console.log('✅ Short de las 10:00 AM completado y publicado exitosamente!');
    } catch (err: any) {
        console.error('❌ Error en ejecución:', err.message);
    }
}

run10amShort();
