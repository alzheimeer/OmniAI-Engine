import { AutonomousOrchestrator } from './generators/AutonomousOrchestrator';

async function testDualShorts() {
    console.log('🚀 INICIANDO PRUEBA END-TO-END DE SHORTS EN AMBOS CANALES...\n');

    console.log('1️⃣ === GENERANDO Y PUBLICANDO SHORT EN CANAL 1 (NeuroSync AI) ===');
    try {
        await AutonomousOrchestrator.runShortPipeline('Spanish', 'channel1');
        console.log('✅ Short para Canal 1 (NeuroSync AI) completado con éxito.\n');
    } catch (err: any) {
        console.error('❌ Error en Short Canal 1:', err.message);
    }

    console.log('2️⃣ === GENERANDO Y PUBLICANDO SHORT EN CANAL 2 (NeuroTech AI) ===');
    try {
        await AutonomousOrchestrator.runShortPipeline('Spanish', 'channel2');
        console.log('✅ Short para Canal 2 (NeuroTech AI) completado con éxito.\n');
    } catch (err: any) {
        console.error('❌ Error en Short Canal 2:', err.message);
    }

    console.log('🎉 PRUEBA DE AMBOS CANALES FINALIZADA.');
}

testDualShorts();
