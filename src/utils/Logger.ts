import fs from 'fs';
import path from 'path';

export class Logger {
    private static logsDir = path.join(__dirname, '../../content/logs');
    private static infoLogPath = path.join(__dirname, '../../content/logs/app.log');
    private static errorLogPath = path.join(__dirname, '../../content/logs/error.log');

    private static ensureLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    private static formatTimestamp(): string {
        return new Date().toISOString();
    }

    private static appendToFile(filePath: string, text: string) {
        try {
            this.ensureLogsDir();
            fs.appendFileSync(filePath, text + '\n', 'utf-8');
        } catch (err) {
            console.error('Failed writing to log file:', err);
        }
    }

    public static info(component: string, message: string) {
        const timestamp = this.formatTimestamp();
        const formatted = `[${timestamp}] [INFO] [${component}]: ${message}`;
        console.log(`ℹ️ ${formatted}`);
        this.appendToFile(this.infoLogPath, formatted);
    }

    public static success(component: string, message: string) {
        const timestamp = this.formatTimestamp();
        const formatted = `[${timestamp}] [SUCCESS] [${component}]: ${message}`;
        console.log(`✅ ${formatted}`);
        this.appendToFile(this.infoLogPath, formatted);
    }

    public static warn(component: string, message: string) {
        const timestamp = this.formatTimestamp();
        const formatted = `[${timestamp}] [WARN] [${component}]: ${message}`;
        console.warn(`⚠️ ${formatted}`);
        this.appendToFile(this.infoLogPath, formatted);
    }

    public static error(component: string, message: string, errorObj?: any) {
        const timestamp = this.formatTimestamp();
        let stack = '';
        if (errorObj) {
            stack = errorObj.stack ? `\nStack: ${errorObj.stack}` : `\nDetails: ${JSON.stringify(errorObj)}`;
        }
        const formatted = `[${timestamp}] [ERROR] [${component}]: ${message}${stack}`;
        console.error(`❌ ${formatted}`);
        
        this.appendToFile(this.infoLogPath, formatted);
        this.appendToFile(this.errorLogPath, formatted);
    }

    /**
     * Lee las últimas N líneas del archivo de error para visualización rápida
     */
    public static getRecentErrorLogs(lines: number = 100): string {
        try {
            if (!fs.existsSync(this.errorLogPath)) return 'No error logs recorded yet.';
            const content = fs.readFileSync(this.errorLogPath, 'utf-8');
            const logLines = content.trim().split('\n');
            return logLines.slice(-lines).join('\n');
        } catch (err) {
            return 'Error reading error log file.';
        }
    }

    /**
     * Lee las últimas N líneas del archivo de logs de aplicación
     */
    public static getRecentAppLogs(lines: number = 100): string {
        try {
            if (!fs.existsSync(this.infoLogPath)) return 'No app logs recorded yet.';
            const content = fs.readFileSync(this.infoLogPath, 'utf-8');
            const logLines = content.trim().split('\n');
            return logLines.slice(-lines).join('\n');
        } catch (err) {
            return 'Error reading app log file.';
        }
    }
}
