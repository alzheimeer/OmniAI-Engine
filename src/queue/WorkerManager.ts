import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { AutonomousOrchestrator } from '../generators/AutonomousOrchestrator';
import { TelegramReporter } from '../reporters/TelegramReporter';
import { MultiPlatformDispatcher } from '../orchestration/MultiPlatformDispatcher';
import { Database } from '../db/Database';
import { Logger } from '../utils/Logger';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null
});

export class WorkerManager {
    public static start() {
        console.log('👷 WorkerManager iniciado. Esperando trabajos en ContentQueue...');
        
        const worker = new Worker('ContentQueue', async (job: Job) => {
            console.log(`[Worker] Procesando trabajo ${job.name} (ID: ${job.id})`);
            
            try {
                if (job.name === 'runShortPipeline') {
                    const { language, channelKey } = job.data;
                    await AutonomousOrchestrator.runShortPipeline(language, channelKey);
                } else if (job.name === 'runLongPipeline') {
                    const { language, channelKey } = job.data;
                    await AutonomousOrchestrator.runLongPipeline(language, channelKey);
                } else if (job.name === 'runBlogPipeline') {
                    await AutonomousOrchestrator.runBlogPipeline();
                } else {
                    console.warn(`[Worker] Trabajo desconocido: ${job.name}`);
                }
            } catch (error: any) {
                console.error(`[Worker] Error en trabajo ${job.name}:`, error);
                await TelegramReporter.sendMessage(`❌ <b>Worker Error</b> en <i>${job.name}</i>:\n<pre>${error.message}</pre>`);
                throw error; // Para que BullMQ sepa que falló
            }
        }, { 
            connection,
            concurrency: 1 // Crucial: Evitar múltiples instancias de FFmpeg simultáneas
        });

        worker.on('completed', job => {
            console.log(`[ContentWorker] Trabajo completado con éxito: ${job.id}`);
        });

        worker.on('failed', (job, err) => {
            console.error(`[ContentWorker] Trabajo fallido: ${job?.id} con error ${err.message}`);
        });
        
        console.log('📡 WorkerManager: Iniciando PublishWorker (concurrency: 5)...');
        
        const publishWorker = new Worker('PublishQueue', async (job: Job) => {
            console.log(`[PublishWorker] Procesando trabajo de publicación (ID: ${job.id})`);
            
            try {
                if (job.name === 'dispatchMultiPlatform') {
                    const dispatcher = new MultiPlatformDispatcher();
                    
                    // Solo inicializar Instagram/TikTok si existen cookies
                    // Por simplicidad, aquí inicializamos solo los básicos. 
                    // (Los paths reales deben venir de ENV o configuración)
                    dispatcher.configurePublishers(); 
                    
                    const result = await dispatcher.dispatch(job.data.sourceContent, job.data.options);
                    const ytResult = result.platformResults?.find(r => r.platform === 'youtube');
                    
                    if (result.success || (ytResult && ytResult.success)) {
                        Logger.success('PublishWorker', `Dispatch completado exitosamente: ${result.dispatchId}`);
                        
                        // Guardar en BD (Simulando la lógica que estaba en Orchestrator)
                        if (job.data.videoMetadata && ytResult && ytResult.success) {
                            const url = ytResult.contentUrl || '';
                            const youtubeId = url.split('v=')[1] || url.split('/').pop() || '';
                            
                            if (youtubeId && !url.includes('dry-run') && !url.startsWith('DEFERRED:')) {
                                await Database.saveVideo(
                                    youtubeId, 
                                    job.data.videoMetadata.title, 
                                    job.data.videoMetadata.language, 
                                    job.data.videoMetadata.rawTopic, 
                                    job.data.videoMetadata.keywords, 
                                    job.data.videoMetadata.type, 
                                    job.data.videoMetadata.channelKey
                                );
                            }
                            
                            await TelegramReporter.sendMessage(`✅ <b>Video de ${job.data.videoMetadata.channelName} publicado con éxito!</b>\nIdioma: ${job.data.videoMetadata.language}\nURL: ${url}`);
                        }

                        if (result.failedPlatforms && result.failedPlatforms.length > 0) {
                            Logger.warn('PublishWorker', `Dispatch completado en YouTube pero falló en: ${result.failedPlatforms.join(', ')}`);
                        }
                    } else {
                        throw new Error(`Dispatch falló: ${result.failedPlatforms?.join(', ') || 'No se pudo publicar en ninguna plataforma'}`);
                    }
                }
            } catch (error: any) {
                console.error(`[PublishWorker] Error en trabajo de publicación:`, error);
                await TelegramReporter.sendMessage(`❌ <b>PublishWorker Error</b>:\n<pre>${error.message}</pre>`);
                throw error;
            }
        }, {
            connection,
            concurrency: 5 // Más alto porque principalmente espera en delays
        });
        
        publishWorker.on('completed', job => {
            console.log(`[PublishWorker] Trabajo completado con éxito: ${job.id}`);
        });

        publishWorker.on('failed', (job, err) => {
            console.error(`[PublishWorker] Trabajo fallido: ${job?.id} con error ${err.message}`);
        });
    }
}
