/**
 * init-clip-pool.ts
 * 
 * Script para inicializar y llenar el pool de clips pre-generados con ComfyUI.
 * Puede ejecutarse manualmente o ser llamado desde el servidor.
 * 
 * Uso:
 *   npx ts-node src/init-clip-pool.ts
 *   - o -
 *   node dist/init-clip-pool.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { ClipDatabase } from './generators/ClipDatabase';
import { ClipPoolManager, CLIP_CATEGORIES } from './generators/ClipPoolManager';
import { ComfyUIClient } from './generators/ComfyUIClient';
import { TelegramReporter } from './reporters/TelegramReporter';

async function initClipPool() {
    console.log('🎬 ============================================');
    console.log('🎬 INICIALIZANDO POOL DE CLIPS CON COMFYUI');
    console.log('🎬 ============================================\n');

    // 1. Verificar que ComfyUI está disponible
    console.log('1️⃣ Verificando conexión con ComfyUI...');
    const comfyClient = new ComfyUIClient();
    const isAvailable = await comfyClient.isAvailable();
    
    if (!isAvailable) {
        console.error('❌ ComfyUI no está disponible en http://127.0.0.1:8188');
        console.error('   Por favor, inicia ComfyUI con: python main.py --lowvram');
        process.exit(1);
    }
    
    const stats = await comfyClient.getSystemStats();
    console.log(`✅ ComfyUI conectado (versión ${stats.system.comfyui_version})`);
    console.log(`   GPU: ${stats.devices[0]?.name || 'N/A'}`);
    console.log(`   VRAM libre: ${Math.round((stats.devices[0]?.vram_free || 0) / 1024 / 1024 / 1024 * 10) / 10} GB\n`);

    // 2. Inicializar base de datos de clips
    console.log('2️⃣ Inicializando base de datos de clips...');
    const clipDatabase = new ClipDatabase();
    clipDatabase.initialize();
    
    const dbStats = clipDatabase.getStatistics();
    console.log(`✅ Base de datos lista`);
    console.log(`   Clips totales: ${dbStats.totalClips}`);
    console.log(`   Clips activos: ${dbStats.clipsByStatus.active || 0}\n`);

    // 3. Mostrar estado actual del pool por categoría
    console.log('3️⃣ Estado actual del pool por categoría:');
    const counts = clipDatabase.countByCategory();
    const minPerCategory = parseInt(process.env.CLIP_POOL_MIN_PER_CATEGORY || '20', 10);
    
    let totalNeeded = 0;
    for (const cat of CLIP_CATEGORIES) {
        const current = counts[cat] || 0;
        const needed = Math.max(0, minPerCategory - current);
        totalNeeded += needed;
        const status = current >= minPerCategory ? '✅' : '⚠️';
        console.log(`   ${status} ${cat}: ${current}/${minPerCategory} (${needed > 0 ? 'necesita ' + needed : 'OK'})`);
    }
    console.log('');

    if (totalNeeded === 0) {
        console.log('🎉 Pool completamente lleno! No se necesita generar más clips.');
        clipDatabase.close();
        return;
    }

    // 4. Inicializar ClipPoolManager y comenzar generación
    console.log(`4️⃣ Iniciando generación de ${totalNeeded} clips faltantes...\n`);
    
    const poolManager = new ClipPoolManager(clipDatabase, comfyClient, {
        minClipsPerCategory: minPerCategory,
        maxClipsPerSessionPerCategory: 3 // Limitar para no sobrecargar
    });

    // Notificar inicio por Telegram
    await TelegramReporter.sendMessage(
        `🎬 <b>Iniciando generación de pool de clips</b>\n\n` +
        `Clips necesarios: ${totalNeeded}\n` +
        `GPU: ${stats.devices[0]?.name || 'N/A'}\n` +
        `Esto puede tardar varias horas.`
    ).catch(() => {});

    // Disparar generación (no espera schedule, genera ahora)
    await poolManager.triggerPreGeneration();

    // Mostrar resumen final
    const finalStats = clipDatabase.getStatistics();
    console.log('\n📊 Resumen final:');
    console.log(`   Clips totales: ${finalStats.totalClips}`);
    console.log(`   Clips activos: ${finalStats.clipsByStatus.active || 0}`);
    
    const finalCounts = clipDatabase.countByCategory();
    console.log('\n   Por categoría:');
    for (const cat of CLIP_CATEGORIES) {
        console.log(`   - ${cat}: ${finalCounts[cat] || 0}`);
    }

    // Notificar finalización por Telegram
    await TelegramReporter.sendMessage(
        `✅ <b>Sesión de generación de pool completada</b>\n\n` +
        `Clips generados: ${finalStats.totalClips - dbStats.totalClips}\n` +
        `Total en pool: ${finalStats.totalClips}`
    ).catch(() => {});

    clipDatabase.close();
    console.log('\n🎬 Generación completada!');
}

// Ejecutar si es el script principal
initClipPool().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
