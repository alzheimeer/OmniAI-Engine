import { AutonomousOrchestrator } from './generators/AutonomousOrchestrator';

async function main() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("   🚀 INICIANDO PRUEBA END-TO-END PARA COLOMBIANDREAMM");
    console.log("═══════════════════════════════════════════════════════════");
    
    console.log("\n[1/2] Ejecutando Pipeline de Short (Inglés)...");
    try {
        await AutonomousOrchestrator.runShortPipeline('English', 'channel3');
        console.log("✅ Pipeline de Short completado.");
    } catch (e) {
        console.error("❌ Error en Short:", e);
    }

    console.log("\n[2/2] Ejecutando Pipeline de Video Largo (Inglés)...");
    try {
        await AutonomousOrchestrator.runLongPipeline('English', 'channel3');
        console.log("✅ Pipeline de Video Largo completado.");
    } catch (e) {
        console.error("❌ Error en Video Largo:", e);
    }
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("   🏁 PRUEBA FINALIZADA");
    console.log("═══════════════════════════════════════════════════════════");
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
