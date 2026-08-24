import checkDiskSpace from 'check-disk-space';
import { TelegramReporter } from './TelegramReporter';
import { Logger } from '../utils/Logger';
import path from 'path';

export class SystemReporter {
    /**
     * Revisa el espacio en disco y alerta si está bajo un límite (default 5GB)
     */
    public static async checkHealth(minFreeGB: number = 5) {
        try {
            // Revisar la partición donde está el contenido (o la raíz '/' en Linux)
            const contentPath = path.resolve(__dirname, '../../content');
            const diskSpace = await checkDiskSpace(contentPath);
            
            const freeGB = diskSpace.free / (1024 * 1024 * 1024);
            const totalGB = diskSpace.size / (1024 * 1024 * 1024);
            const usedPercentage = ((diskSpace.size - diskSpace.free) / diskSpace.size) * 100;

            console.log(`🖥️ Health Check: Espacio libre: ${freeGB.toFixed(2)} GB (${usedPercentage.toFixed(1)}% usado)`);

            if (freeGB < minFreeGB) {
                const alertMsg = `🚨 <b>ALERTA CRÍTICA DE SISTEMA</b> 🚨
El espacio en disco está peligrosamente bajo.
<b>Directorio:</b> ${contentPath}
<b>Libre:</b> ${freeGB.toFixed(2)} GB
<b>Total:</b> ${totalGB.toFixed(2)} GB
<b>Uso:</b> ${usedPercentage.toFixed(1)}%

Por favor, revisa la limpieza de archivos o aumenta el volumen del servidor para evitar la caída de FFmpeg y descargas de Pexels.`;
                
                await TelegramReporter.sendMessage(alertMsg);
                Logger.warn('SystemReporter', `Low disk space alert triggered. Free: ${freeGB.toFixed(2)}GB`);
            }
        } catch (error: any) {
            console.error('Error durante checkHealth:', error);
            Logger.error('SystemReporter', 'Failed to check disk space', error);
        }
    }
}
