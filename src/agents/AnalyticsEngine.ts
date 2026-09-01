import { google } from 'googleapis';
import { GoogleAuth } from '../auth/GoogleAuth';
import { Database, PublishedVideoRecord } from '../db/Database';
import { RetryHandler } from '../infrastructure/RetryHandler';

// Instancia de RetryHandler preconfigurada para YouTube API
const youtubeRetry = RetryHandler.forAPI('YouTube');

export interface ChannelAnalyticsSummary {
    subscriberCount: number;
    totalViews: number;
    totalVideos: number;
    topVideos: PublishedVideoRecord[];
    performanceSummary: string;
}

export class AnalyticsEngine {
    
    /**
     * Sincroniza todas las métricas de YouTube con la Base de Datos SQLite y calcula analíticas
     */
    /**
     * Sincroniza las métricas de un canal específico de YouTube con la BD
     */
    public static async syncMetrics(channelKey: 'channel1' | 'channel2' | 'channel3' = 'channel1'): Promise<ChannelAnalyticsSummary> {
        let tokenPath = 'oauth2.tokens.json';
        let channelName = 'NeuroSync AI';
        
        if (channelKey === 'channel2') {
            tokenPath = 'oauth2.tokens.channel2.json';
            channelName = 'NeuroTech AI';
        } else if (channelKey === 'channel3') {
            tokenPath = 'oauth2.tokens.channel3.json';
            channelName = 'ColombianDreamm';
        }
        
        console.log(`📊 AnalyticsEngine: Sincronizando analíticas de ${channelName}...`);
        
        try {
            const authClient = await GoogleAuth.getClient(tokenPath);
            const youtube = google.youtube({ version: 'v3', auth: authClient });

            // 1. Obtener métricas del canal con retry
            // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas YouTube API
            const channelRes = await youtubeRetry.execute(
                () => youtube.channels.list({
                    part: ['statistics'],
                    mine: true
                }),
                `YouTube channels.list (${channelName})`
            );

            let subscriberCount = 0;
            let totalViews = 0;
            let totalVideos = 0;

            if (channelRes.data.items && channelRes.data.items.length > 0) {
                const stats = channelRes.data.items[0].statistics;
                subscriberCount = parseInt(stats?.subscriberCount || '0', 10);
                totalViews = parseInt(stats?.viewCount || '0', 10);
                totalVideos = parseInt(stats?.videoCount || '0', 10);
            }

            // 2. Obtener videos registrados en BD para actualizar sus vistas/likes individuales
            // FIX: Usar getVideosByChannel() para obtener SOLO videos del canal que estamos sincronizando
            // Antes usaba getAllVideos() que mezclaba videos de ambos canales, causando que
            // la API de YouTube no retornara estadísticas de videos del otro canal
            const trackedVideos = await Database.getVideosByChannel(channelKey);
            console.log(`📊 AnalyticsEngine: Encontrados ${trackedVideos.length} videos para ${channelName}`);
            
            if (trackedVideos.length > 0) {
                const videoIds = trackedVideos.map(v => v.youtubeId).filter(Boolean);

                if (videoIds.length > 0) {
                    let allItems: any[] = [];
                    // YouTube API limits 'id' parameter to 50 items per request
                    for (let i = 0; i < videoIds.length; i += 50) {
                        const batch = videoIds.slice(i, i + 50);
                        // REQ-4.4.2: Aplicar retry con backoff exponencial a llamadas YouTube API
                        const videoRes = await youtubeRetry.execute(
                            () => youtube.videos.list({
                                part: ['statistics'],
                                id: batch
                            }),
                            `YouTube videos.list batch ${Math.floor(i / 50) + 1} (${channelName})`
                        );
                        if (videoRes.data.items) {
                            allItems.push(...videoRes.data.items);
                        }
                    }

                    const returnedIds = allItems.map(i => i.id) || [];
                    console.log(`📊 AnalyticsEngine: YouTube API retornó stats para ${returnedIds.length}/${videoIds.length} videos`);

                    if (allItems.length > 0) {
                        for (const item of allItems) {
                            const vId = item.id;
                            const views = parseInt(item.statistics?.viewCount || '0', 10);
                            const likes = parseInt(item.statistics?.likeCount || '0', 10);
                            const comments = parseInt(item.statistics?.commentCount || '0', 10);

                            if (vId) {
                                await Database.updateVideoMetrics(vId, views, likes, comments);
                                console.log(`   ↳ Video ${vId}: ${views} vistas, ${likes} likes`);
                            }
                        }
                    }
                    
                    // Detectar videos que no retornaron estadísticas (posible problema de permisos o video eliminado)
                    const missingIds = videoIds.filter(id => !returnedIds.includes(id));
                    if (missingIds.length > 0) {
                        console.log(`⚠️ AnalyticsEngine: ${missingIds.length} videos no retornaron estadísticas (posible video privado/eliminado)`);
                    }
                }
            }

            // 3. Extraer Top Videos de SQLite
            const topVideos = await Database.getTopVideos(5);

            // 4. Formatear resumen ejecutorio para el SEOAgent y Telegram
            let performanceSummary = `Suscriptores: ${subscriberCount} | Vistas Totales: ${totalViews} | Videos: ${totalVideos}\n`;
            if (topVideos.length > 0) {
                performanceSummary += `Top Videos:\n` + topVideos.map(v => `- "${v.title}" (${v.views} vistas, ${v.likes} likes)`).join('\n');
            } else {
                performanceSummary += `Aún no hay suficientes datos de reproducciones individuales registrados.`;
            }

            console.log(`✅ AnalyticsEngine: Sincronización de ${channelName} completada.`);
            return {
                subscriberCount,
                totalViews,
                totalVideos,
                topVideos,
                performanceSummary
            };

        } catch (error: any) {
            console.error(`⚠️ AnalyticsEngine Error para ${channelName}:`, error.message);
            const topVideos = await Database.getTopVideos(5);
            return {
                subscriberCount: 0,
                totalViews: 0,
                totalVideos: 0,
                topVideos,
                performanceSummary: `Error al conectar con YouTube API para ${channelName}. Usando datos guardados.`
            };
        }
    }

    /**
     * Sincroniza y retorna métricas de AMBOS canales simultáneamente
     */
    public static async syncAllChannels() {
        const ch1 = await this.syncMetrics('channel1');
        const ch2 = await this.syncMetrics('channel2');
        return { ch1, ch2 };
    }
}
