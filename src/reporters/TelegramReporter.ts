import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class TelegramReporter {
    private static botToken = process.env.TELEGRAM_BOT_TOKEN;
    private static chatId = process.env.TELEGRAM_CHAT_ID;

    /**
     * Sends a message to the configured Telegram chat.
     * @param message The message to send. Supports basic HTML formatting (e.g. <b>bold</b>, <i>italic</i>, <a>links</a>)
     */
    public static async sendMessage(message: string): Promise<void> {
        if (!this.botToken || !this.chatId) {
            console.warn('⚠️ Telegram credentials not found in .env. Skipping report.');
            return;
        }

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        try {
            await axios.post(url, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            });
            console.log('✅ Telegram report sent successfully.');
        } catch (error: any) {
            console.error('❌ Failed to send Telegram report:', error.response?.data || error.message);
        }
    }

    /**
     * Sends a formatted daily summary report with real analytics
     */
    public static async sendDailySummary(stats: {
        videosPublished: number | string;
        articlesPublished: number | string;
        subscriberCount?: number;
        totalViews?: number;
        topVideosText?: string;
        seoAnalysis?: string;
        nextAction?: string;
    }): Promise<void> {
        const message = `
🤖 <b>OmniAI Engine - Reporte Diario & Analíticas</b> 🤖

📈 <b>Métricas de Rendimiento Reales:</b>
- Suscriptores YouTube: <b>${stats.subscriberCount ?? 'N/A'}</b>
- Vistas Totales Canal: <b>${stats.totalViews ?? 'N/A'}</b>
- Videos Generados Hoy: ${stats.videosPublished}
- Artículos Publicados Hoy: ${stats.articlesPublished}

🏆 <b>Rendimiento Destacado:</b>
${stats.topVideosText || 'Sin datos de reproducción aún.'}

🧠 <b>Retroalimentación SEO Agent:</b>
${stats.seoAnalysis || 'Analizando tendencias activamente...'}

🚀 <b>Próxima Estrategia:</b>
${stats.nextAction || 'Seguir ejecutando cronograma automatizado.'}

<i>"Autism is not a system error, it's a different operating system."</i>
        `;
        await this.sendMessage(message);
    }
}
