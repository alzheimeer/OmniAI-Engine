import { TelegramReporter } from './reporters/TelegramReporter';

(async () => {
    try {
        console.log('Sending test message to Telegram...');
        
        await TelegramReporter.sendDailySummary({
            videosPublished: 3,
            articlesPublished: 2,
            nextAction: 'Iniciando investigación autónoma para el día de mañana. Tema: Herramientas de IA para funciones ejecutivas.'
        });

        console.log('Done!');
    } catch (error) {
        console.error('Error in test:', error);
    }
})();
