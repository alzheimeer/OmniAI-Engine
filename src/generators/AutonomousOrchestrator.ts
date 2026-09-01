import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { TelegramReporter } from '../reporters/TelegramReporter';
import { SystemReporter } from '../reporters/SystemReporter';
import { contentQueue, publishQueue } from '../queue/QueueManager';
import { ScriptGenerator } from './ScriptGenerator';
import { AudioGenerator } from './AudioGenerator';
import { VideoRenderer } from './VideoRenderer';
// import { YouTubePublisher } from '../publishers/YouTubePublisher'; // Removido por el uso del PublishQueue
import { BlogGenerator } from './BlogGenerator';
import { BlogDispatcher } from '../publishers/BlogDispatcher';
import { SEOAgent } from '../agents/SEOAgent';
import { AnalyticsEngine } from '../agents/AnalyticsEngine';
import { Database } from '../db/Database';
import { Logger } from '../utils/Logger';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class AutonomousOrchestrator {
    
    /**
     * Extrae la duración de un archivo de video en segundos
     */
    private static getVideoDuration(filePath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    console.error(`[getVideoDuration] Error leyendo metadata de ${filePath}:`, err);
                    resolve(60); // Fallback safe
                } else {
                    resolve(metadata.format.duration || 60);
                }
            });
        });
    }

    /**
     * Inicia los cron jobs principales del motor
     */
    public static start() {
        console.log('🤖 Autonomous Orchestrator iniciado. Esperando ciclos...');
        TelegramReporter.sendMessage('🤖 <b>OmniAI Orchestrator Iniciado</b>\nEl motor ha despertado y el cronograma de 7 días está activo.');

        const cronOpts = { timezone: "America/Bogota" };

        // 1. Reporte Matutino Diario (8:00 AM)
        cron.schedule('0 8 * * *', async () => {
            await TelegramReporter.sendMessage('🌅 <b>Buenos días!</b> Iniciando operaciones de análisis y creación de contenido para hoy.');
        }, cronOpts);

        // --- CANAL 1: NeuroSync AI (Autismo e Inteligencia Artificial) ---
        // Shadowban Protocol: 1 Short cada 48h y 1 Largo Semanal
        cron.schedule('0 13 * * 1,3,5', async () => contentQueue.add('runShortPipeline', { language: 'English', channelKey: 'channel1' }), cronOpts);
        cron.schedule('0 15 * * 2', async () => contentQueue.add('runLongPipeline', { language: 'English', channelKey: 'channel1' }), cronOpts);

        // --- CANAL 2: NeuroTech AI (Productividad, Trabajo & Negocios con IA para Neurodivergentes) ---
        // Shadowban Protocol: 1 Short cada 48h y 1 Largo Semanal
        cron.schedule('30 13 * * 2,4,6', async () => contentQueue.add('runShortPipeline', { language: 'English', channelKey: 'channel2' }), cronOpts);
        cron.schedule('30 15 * * 1', async () => contentQueue.add('runLongPipeline', { language: 'English', channelKey: 'channel2' }), cronOpts);

        // --- CANAL 3: ColombianDreamm (Curiosidades Universales - VIRALIDAD PURA) ---
        // Viral Protocol: 1 Short Diario, 1 Largo Semanal (Domingos)
        // Optamos por Inglés para maximizar RPM, pero se podría ajustar a Español si se requiere.
        cron.schedule('0 18 * * *', async () => contentQueue.add('runShortPipeline', { language: 'English', channelKey: 'channel3' }), cronOpts);
        cron.schedule('0 12 * * 0', async () => contentQueue.add('runLongPipeline', { language: 'English', channelKey: 'channel3' }), cronOpts);

        // 3. DIARIAMENTE - ARTÍCULOS DE BLOG MULTI-PLATAFORMA (6:00 AM, 7 DÍAS A LA SEMANA)
        cron.schedule('0 6 * * *', async () => contentQueue.add('runBlogPipeline', {}), cronOpts);

        // Monitoreo de Sistema de Archivos y Espacio en Disco (Cada Hora)
        cron.schedule('0 * * * *', async () => {
            await SystemReporter.checkHealth(5);
        }, cronOpts);

        // 5. Sincronización Nocturna de Analytics (1:00 AM) - Actualiza métricas de AMBOS canales
        cron.schedule('0 1 * * *', async () => {
            console.log('📊 [1:00 AM] Sincronización nocturna de analytics iniciada...');
            try {
                const { ch1, ch2 } = await AnalyticsEngine.syncAllChannels();
                console.log(`📊 Analytics sync completado: NeuroSync AI (${ch1.subscriberCount} subs), NeuroTech AI (${ch2.subscriberCount} subs)`);
                Logger.success('Orchestrator', `Nightly analytics sync completed for both channels.`);
            } catch (error: any) {
                Logger.error('Orchestrator.nightlySync', 'Error syncing analytics at 1AM', error);
            }
        }, cronOpts);

        // 5.5. Informe Diario de Estadísticas (4:00 AM) - Resumen completo de AMBOS CANALES a Telegram
        cron.schedule('0 4 * * *', async () => {
            console.log('📈 [4:00 AM] Generando informe diario de estadísticas...');
            try {
                const { ch1, ch2 } = await AnalyticsEngine.syncAllChannels();
                const dbStats = await Database.getStats();
                
                const today = new Date();
                const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
                const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

                const report = `
📊 <b>INFORME DIARIO DE CANALES DUALES</b>
📅 ${dayNames[dayOfWeek]} ${today.toLocaleDateString('es-CO')}

━━━━━━━━━━━━━━━━━━━━
🔵 <b>NeuroSync AI (Canal 1 - Autismo & IA)</b>
👥 Suscriptores: <b>${ch1.subscriberCount.toLocaleString()}</b>
👁️ Vistas Totales: <b>${ch1.totalViews.toLocaleString()}</b>
🎬 Videos Publicados: <b>${ch1.totalVideos}</b>

━━━━━━━━━━━━━━━━━━━━
🟣 <b>NeuroTech AI (Canal 2 - Productividad & TDAH)</b>
👥 Suscriptores: <b>${ch2.subscriberCount.toLocaleString()}</b>
👁️ Vistas Totales: <b>${ch2.totalViews.toLocaleString()}</b>
🎬 Videos Publicados: <b>${ch2.totalVideos}</b>

━━━━━━━━━━━━━━━━━━━━
📚 <b>CONTENIDO GENERAL EN BD</b>
🎬 Videos totales: ${dbStats.totalVideos} (${dbStats.shorts} shorts, ${dbStats.longs} largos)
📝 Blogs creados: ${dbStats.totalBlogs}
🔑 Temas únicos aislados: ${dbStats.uniqueTopics}

🤖 <i>Informe automático generado por OmniAI Engine 24/7</i>
                `.trim();

                await TelegramReporter.sendMessage(report);
                Logger.success('Orchestrator', 'Dual-channel daily stats report sent to Telegram at 4AM');
            } catch (error: any) {
                Logger.error('Orchestrator.dailyStatsReport', 'Error generating 4AM stats report', error);
                await TelegramReporter.sendMessage(`❌ Error generando informe de 4AM: ${error.message}`);
            }
        }, cronOpts);

        // 6. Reporte Nocturno Diario (8:00 PM) + Limpieza + Analíticas Reales
        cron.schedule('0 20 * * *', async () => {
            this.cleanupOldFiles();
            const { ch1, ch2 } = await AnalyticsEngine.syncAllChannels();
            const topVideosText = ch1.topVideos.map(v => `• ${v.title} (${v.views} vistas)`).join('\n');
            
            await TelegramReporter.sendDailySummary({
                videosPublished: 'Ejecutado según cronograma',
                articlesPublished: 'Ejecutado según cronograma',
                subscriberCount: ch1.subscriberCount + ch2.subscriberCount,
                totalViews: ch1.totalViews + ch2.totalViews,
                topVideosText: topVideosText,
                seoAnalysis: 'Analíticas procesadas por SQLite y alimentadas a DeepSeek.',
                nextAction: 'Revisión de tendencias para el siguiente ciclo.'
            });
        }, cronOpts);
    }

    /**
     * Ejecuta el pipeline completo de un Short
     */
    public static async runShortPipeline(language: string, channelKey: 'channel1' | 'channel2' | 'channel3' = 'channel1') {
        const channelName = channelKey === 'channel3' ? 'ColombianDreamm' : (channelKey === 'channel2' ? 'NeuroTech AI' : 'NeuroSync AI');
        const tokenPath = channelKey === 'channel3' ? 'oauth2.tokens.channel3.json' : (channelKey === 'channel2' ? 'oauth2.tokens.channel2.json' : 'oauth2.tokens.json');
        const hashtagBlock = channelKey === 'channel3' ? '#Curiosities #Mystery #MindBlown' : (channelKey === 'channel2' ? '#NeuroTech #AI #Productivity #ADHD' : '#Autism #AI #Neurodiversity');

        try {
            await TelegramReporter.sendMessage(`⚙️ Iniciando Short en <b>${language}</b> para <b>${channelName}</b>...`);
            
            // FIX: Sincronizar métricas del canal ESPECÍFICO que estamos procesando
            const analytics = await AnalyticsEngine.syncMetrics(channelKey);
            const seo = await SEOAgent.generateDailySEOStrategy(language, analytics.performanceSummary, 'video', channelKey);
            if (seo.developerActionRequired && seo.developerActionRequired.trim() !== '') {
                await TelegramReporter.sendMessage(`🚨 <b>SEOAgent Developer Request:</b>\n<pre>${seo.developerActionRequired}</pre>`);
            }
            const script = await ScriptGenerator.generateShortScript(seo, language, channelKey);
            
            // If language is Spanish, use the viral SEO title directly.
            // If English, use the title translated by the LLM in ScriptGenerator.
            if (language.toLowerCase() === 'spanish') {
                script.title = seo.viralTitle;
                script.tags = seo.keywords;
            } else {
                // Keep script.title (which was generated by LLM in English)
                // Translate tags by passing them through LLM? For now just use LLM tags or fallback
                script.tags = script.tags || seo.keywords;
            }

            const audioFile = `short-${channelKey}-${language.toLowerCase()}.mp3`;
            const videoFile = `final-short-${channelKey}-${language.toLowerCase()}.mp4`;

            await AudioGenerator.generateAudio(script.spokenText, audioFile, language);
            
            await VideoRenderer.renderVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);

            const videoDuration = await this.getVideoDuration(path.join(__dirname, '../../content', videoFile));

            // Preparar metadatos para publicación diferida y multiplataforma
            const sourceContent = {
                fullVideoPath: path.join(__dirname, '../../content', videoFile),
                shortVideoPath: path.join(__dirname, '../../content', videoFile),
                title: script.title,
                description: `${script.description}\n\n${hashtagBlock}`,
                tags: script.tags,
                hashtags: hashtagBlock.split(' '),
                fullVideoDuration: Math.round(videoDuration), 
                shortDuration: Math.round(videoDuration),
                tokenFilePath: tokenPath,
                thumbnailPath: script.visualPrompts?.[0] || ""
            };

            // Retraso inicial aleatorio para evadir patrones (0 a 45 minutos)
            const randomStartDelayMs = Math.floor(Math.random() * (45 * 60 * 1000));

            await publishQueue.add('dispatchMultiPlatform', {
                sourceContent,
                options: {
                    platforms: ['youtube', 'tiktok', 'instagram']
                },
                videoMetadata: {
                    title: script.title,
                    language,
                    rawTopic: seo.rawTopic,
                    keywords: seo.keywords,
                    type: 'short',
                    channelKey,
                    channelName
                }
            }, {
                delay: randomStartDelayMs
            });

            await TelegramReporter.sendMessage(`✅ <b>Short de ${channelName} ENCOLADO para publicación!</b>\nIdioma: ${language}\nRetraso aleatorio: ${Math.round(randomStartDelayMs/60000)} minutos.`);
            Logger.success('Orchestrator', `Short (${channelName}) queued for multi-platform dispatch with ${Math.round(randomStartDelayMs/60000)}m delay.`);
        } catch (error: any) {
            Logger.error('Orchestrator.runShortPipeline', `Error in Short pipeline (${channelName} - ${language})`, error);
            await TelegramReporter.sendMessage(`❌ <b>Error crítico en Short de ${channelName} (${language}):</b>\n<pre>${error.message}</pre>`);
        }
    }

    /**
     * Ejecuta el pipeline completo de un Artículo de Blog
     */
    public static async runBlogPipeline() {
        if (process.env.ENABLE_BLOG_PUBLISHING !== 'true') {
            console.log('📝 Publicación en Blogs desactivada por configuración (ENABLE_BLOG_PUBLISHING=false)');
            return;
        }

        try {
            await TelegramReporter.sendMessage(`📝 Iniciando redacción y publicación de <b>Artículo de Blog</b>...`);
            
            // 1. Sincronizar Analíticas previas
            const analytics = await AnalyticsEngine.syncMetrics();
            
            // 2. Investigar Tema y SEO Diario con Retroalimentación (CON DEDUPLICACIÓN)
            const seo = await SEOAgent.generateDailySEOStrategy('Spanish', analytics.performanceSummary, 'blog');
            if (seo.developerActionRequired && seo.developerActionRequired.trim() !== '') {
                await TelegramReporter.sendMessage(`🚨 <b>SEOAgent Developer Request:</b>\n<pre>${seo.developerActionRequired}</pre>`);
            }
            
            // 3. Escribir el Artículo usando la estrategia SEO
            const article = await BlogGenerator.generateArticle(seo);
            
            // Forzar el título y tags SEO al artículo
            article.title = seo.viralTitle;
            article.keywords = seo.keywords;

            // Guardar copia local en Markdown para el Servidor Web (server.ts / puerto 3003)
            const slug = seo.viralTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
            const filename = `${new Date().toISOString().split('T')[0]}-${slug}.md`;
            const filePath = path.join(__dirname, '../../content', filename);
            fs.writeFileSync(filePath, `# ${article.title}\n\n${article.contentMarkdown}`);
            console.log(`Saved local blog copy to: ${filePath}`);
            
            // Publicación Multi-Plataforma simultánea (Hashnode, Medium, Dev.to)
            const result = await BlogDispatcher.publishToAll(article.title, article.contentMarkdown, article.keywords);

            // Guardar en BD para deduplicación futura
            await Database.saveBlog(
                article.title, 
                result.hashnodeUrl, 
                result.mediumUrl, 
                result.devToUrl,
                seo.rawTopic,
                seo.keywords
            );

            let msg = `✅ <b>Artículo publicado simultáneamente en Múltiples Plataformas!</b>\nTítulo: ${article.title}\n`;
            if (result.hashnodeUrl) msg += `• <b>Hashnode:</b> ${result.hashnodeUrl}\n`;
            if (result.mediumUrl) msg += `• <b>Medium:</b> ${result.mediumUrl}\n`;
            if (result.devToUrl) msg += `• <b>Dev.to:</b> ${result.devToUrl}\n`;

            await TelegramReporter.sendMessage(msg);
            Logger.success('Orchestrator', `Blog published multi-platform: ${article.title}`);
        } catch (error: any) {
            Logger.error('Orchestrator.runBlogPipeline', 'Error in Blog pipeline', error);
            await TelegramReporter.sendMessage(`❌ <b>Error crítico en pipeline de Blog:</b>\n<pre>${error.message}</pre>`);
        }
    }

    /**
     * Ejecuta el pipeline completo de un Documental / Video Largo
     */
    public static async runLongPipeline(language: string, channelKey: 'channel1' | 'channel2' | 'channel3' = 'channel1') {
        const channelName = channelKey === 'channel3' ? 'ColombianDreamm' : (channelKey === 'channel2' ? 'NeuroTech AI' : 'NeuroSync AI');
        const tokenPath = channelKey === 'channel3' ? 'oauth2.tokens.channel3.json' : (channelKey === 'channel2' ? 'oauth2.tokens.channel2.json' : 'oauth2.tokens.json');
        const hashtagBlock = channelKey === 'channel3' ? '#Curiosities #Mystery #MindBlown' : (channelKey === 'channel2' ? '#NeuroTech #AI #Productivity #ADHD' : '#Autism #AI #Neurodiversity');

        try {
            await TelegramReporter.sendMessage(`🎬 Iniciando Documental en <b>${language}</b> para <b>${channelName}</b>...`);
            
            // FIX: Sincronizar métricas del canal ESPECÍFICO que estamos procesando
            const analytics = await AnalyticsEngine.syncMetrics(channelKey);
            const seo = await SEOAgent.generateDailySEOStrategy(language, analytics.performanceSummary, 'video', channelKey);
            if (seo.developerActionRequired && seo.developerActionRequired.trim() !== '') {
                await TelegramReporter.sendMessage(`🚨 <b>SEOAgent Developer Request:</b>\n<pre>${seo.developerActionRequired}</pre>`);
            }
            const script = await ScriptGenerator.generateLongScript(seo, language, channelKey);
            
            if (language.toLowerCase() === 'spanish') {
                script.title = seo.viralTitle;
                script.tags = seo.keywords;
            } else {
                script.tags = script.tags || seo.keywords;
            }

            const audioFile = `long-${channelKey}-${language.toLowerCase()}.mp3`;
            const videoFile = `final-long-${channelKey}-${language.toLowerCase()}.mp4`;

            await AudioGenerator.generateAudio(script.spokenText, audioFile, language);
            
            if (!script.visualPrompts || script.visualPrompts.length === 0) {
                console.warn('⚠️ No visual prompts in script. Using fallback visual prompts...');
                script.visualPrompts = [seo.viralTitle, 'technology workplace', 'artificial intelligence future', 'neurodiversity success'];
            }

            await VideoRenderer.renderLongVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);

            const videoDuration = await this.getVideoDuration(path.join(__dirname, '../../content', videoFile));

            const sourceContent = {
                fullVideoPath: path.join(__dirname, '../../content', videoFile),
                shortVideoPath: path.join(__dirname, '../../content', videoFile), // No usamos recortes para largos en IG/TT aún
                title: script.title,
                description: `${script.description}\n\n${hashtagBlock}`,
                tags: script.tags,
                hashtags: hashtagBlock.split(' '),
                fullVideoDuration: Math.round(videoDuration),
                shortDuration: Math.round(videoDuration),
                tokenFilePath: tokenPath,
                thumbnailPath: script.visualPrompts[0]
            };

            const randomStartDelayMs = Math.floor(Math.random() * (45 * 60 * 1000));

            await publishQueue.add('dispatchMultiPlatform', {
                sourceContent,
                options: {
                    platforms: ['youtube', 'tiktok', 'instagram']
                },
                videoMetadata: {
                    title: script.title,
                    language,
                    rawTopic: seo.rawTopic,
                    keywords: seo.keywords,
                    type: 'long',
                    channelKey,
                    channelName
                }
            }, {
                delay: randomStartDelayMs
            });

            await TelegramReporter.sendMessage(`✅ <b>Documental de ${channelName} ENCOLADO para publicación!</b>\nIdioma: ${language}\nRetraso aleatorio: ${Math.round(randomStartDelayMs/60000)} minutos.`);
            Logger.success('Orchestrator', `Long video (${channelName}) queued for multi-platform dispatch with ${Math.round(randomStartDelayMs/60000)}m delay.`);
        } catch (error: any) {
            Logger.error('Orchestrator.runLongPipeline', `Error in Long video pipeline (${channelName} - ${language})`, error);
            await TelegramReporter.sendMessage(`❌ <b>Error crítico en Documental de ${channelName} (${language}):</b>\n<pre>${error.message}</pre>`);
        }
    }

    /**
     * Limpia archivos de audio/video temporales más antiguos a 7 días en /content
     */
    private static async cleanupOldFiles() {
        try {
            const contentDir = path.join(__dirname, '../../content');
            if (!fs.existsSync(contentDir)) return;

            const files = await fs.promises.readdir(contentDir);
            const now = Date.now();
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

            await Promise.all(files.map(async (file) => {
                if (file.endsWith('.mp3') || file.endsWith('.mp4')) {
                    const filePath = path.join(contentDir, file);
                    const stats = await fs.promises.stat(filePath);
                    if (now - stats.mtimeMs > SEVEN_DAYS_MS) {
                        console.log(`🧹 Limpiando archivo antiguo: ${file}`);
                        await fs.promises.unlink(filePath);
                    }
                }
            }));
        } catch (err) {
            console.error('Error durante limpieza de temporales:', err);
        }
    }
}
