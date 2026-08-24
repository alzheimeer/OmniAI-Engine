/**
 * Logger.ts
 * 
 * Sistema de logging estructurado con Winston para OmniAI-Engine.
 * Proporciona logs JSON con timestamps ISO 8601, correlation IDs para
 * trazabilidad de pipelines, y preparación para alertas Telegram.
 * 
 * REQ-4.2.1: Reemplazar console.log por Winston con niveles (error, warn, info, debug)
 * REQ-4.2.2: Crear logs estructurados JSON en logs/omniai-YYYY-MM-DD.log
 * REQ-4.2.3: Mantener logs de Telegram para alertas críticas únicamente
 * REQ-4.2.4: Añadir correlation ID por pipeline para trazar flujo completo
 * REQ-4.2.5: Loguear métricas de rendimiento: tiempo, tamaño, API calls
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ===== TIPOS =====

/**
 * Metadatos adicionales que pueden acompañar a un log.
 * Útil para métricas de rendimiento y trazabilidad.
 */
export interface LogMeta {
    /** Nombre del componente que emite el log */
    component?: string;
    
    /** ID de correlación para trazar flujo completo del pipeline */
    correlationId?: string;
    
    /** Duración de una operación en milisegundos */
    duration?: number;
    
    /** Tamaño de archivos o datos en bytes */
    size?: number;
    
    /** Número de llamadas a APIs externas realizadas */
    apiCalls?: number;
    
    /** Metadatos adicionales de cualquier tipo */
    [key: string]: unknown;
}

/**
 * Configuración del sistema de logging.
 */
export interface LoggerConfig {
    /** Directorio donde se almacenan los logs */
    logsDir: string;
    
    /** Nivel mínimo de logging */
    level: 'error' | 'warn' | 'info' | 'debug';
    
    /** Si true, también imprime logs en consola */
    console: boolean;
    
    /** Formato de fecha para rotación de archivos */
    datePattern: string;
    
    /** Días máximos a mantener logs antiguos */
    maxFiles: string;
    
    /** Tamaño máximo por archivo antes de rotar */
    maxSize: string;
}

/**
 * Callback para alertas externas (e.g., Telegram).
 * Se invoca automáticamente en logs de nivel 'error'.
 */
export type AlertCallback = (message: string, error?: Error, meta?: LogMeta) => Promise<void>;

// ===== CONSTANTES =====

/**
 * Configuración por defecto del logger.
 */
const DEFAULT_CONFIG: LoggerConfig = {
    logsDir: 'logs',
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    console: true,
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    maxSize: '50m'
};

/**
 * Colores para cada nivel de log en consola.
 */
const LOG_COLORS = {
    error: '\x1b[31m',   // Rojo
    warn: '\x1b[33m',    // Amarillo
    info: '\x1b[36m',    // Cian
    debug: '\x1b[35m',   // Magenta
    reset: '\x1b[0m'     // Reset
};

/**
 * Emojis para cada nivel de log en consola.
 */
const LOG_EMOJIS = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍'
};

// ===== CLASE PRINCIPAL =====

/**
 * Logger - Sistema de logging estructurado con Winston.
 * 
 * Características:
 * - Logs JSON estructurados para fácil parsing
 * - Timestamps ISO 8601
 * - Correlation ID para trazabilidad de pipelines
 * - Rotación diaria de archivos de log
 * - Soporte para alertas externas (Telegram) en errores críticos
 * - Consola colorizada para desarrollo
 * 
 * Uso básico:
 * ```typescript
 * const logger = new Logger('VideoTransformer');
 * logger.info('Procesando video', { duration: 1500, size: 1024000 });
 * logger.error('Error procesando', error, { correlationId: 'abc123' });
 * ```
 */
export class Logger {
    /** Instancia de Winston logger */
    private logger: winston.Logger;
    
    /** Nombre del componente que usa este logger */
    private component: string;
    
    /** ID de correlación para trazabilidad del pipeline actual */
    private correlationId?: string;
    
    /** Callback para alertas externas (e.g., Telegram) */
    private static alertCallback?: AlertCallback;
    
    /** Configuración global del logger */
    private static config: LoggerConfig = DEFAULT_CONFIG;
    
    /** Cache de loggers por componente para reutilización */
    private static loggerCache: Map<string, Logger> = new Map();
    
    /** Directorio de logs ya inicializado */
    private static initialized: boolean = false;

    /**
     * Crea una nueva instancia de Logger para un componente específico.
     * 
     * @param component - Nombre del componente (e.g., 'VideoTransformer')
     * @param correlationId - ID de correlación opcional para trazabilidad
     */
    constructor(component: string, correlationId?: string) {
        this.component = component;
        this.correlationId = correlationId;
        
        // Inicializar directorio de logs si no existe
        if (!Logger.initialized) {
            Logger.initializeLogsDirectory();
        }
        
        // Crear instancia de Winston
        this.logger = this.createWinstonLogger();
    }

    // ===== MÉTODOS PÚBLICOS DE LOGGING =====

    /**
     * Registra un mensaje de nivel INFO.
     * Usado para información general de flujo de la aplicación.
     * 
     * @param message - Mensaje descriptivo
     * @param meta - Metadatos adicionales opcionales
     */
    public info(message: string, meta?: LogMeta): void {
        this.log('info', message, undefined, meta);
    }

    /**
     * Registra un mensaje de nivel WARN.
     * Usado para situaciones potencialmente problemáticas.
     * 
     * @param message - Mensaje descriptivo
     * @param meta - Metadatos adicionales opcionales
     */
    public warn(message: string, meta?: LogMeta): void {
        this.log('warn', message, undefined, meta);
    }

    /**
     * Registra un mensaje de nivel ERROR.
     * Usado para errores que requieren atención.
     * Automáticamente dispara alertas externas si están configuradas.
     * 
     * @param message - Mensaje descriptivo
     * @param error - Objeto Error opcional con stack trace
     * @param meta - Metadatos adicionales opcionales
     */
    public error(message: string, error?: Error, meta?: LogMeta): void {
        this.log('error', message, error, meta);
        
        // Disparar alerta externa si está configurada
        if (Logger.alertCallback) {
            Logger.alertCallback(message, error, {
                ...meta,
                component: this.component,
                correlationId: this.correlationId
            }).catch(err => {
                // No usar this.error para evitar recursión
                console.error('Error enviando alerta externa:', err);
            });
        }
    }

    /**
     * Registra un mensaje de nivel DEBUG.
     * Usado para información detallada útil en desarrollo.
     * 
     * @param message - Mensaje descriptivo
     * @param meta - Metadatos adicionales opcionales
     */
    public debug(message: string, meta?: LogMeta): void {
        this.log('debug', message, undefined, meta);
    }

    // ===== MÉTODOS DE CORRELATION ID =====

    /**
     * Establece el correlation ID para este logger.
     * Útil cuando el ID se genera después de crear el logger.
     * 
     * @param id - ID de correlación único
     */
    public setCorrelationId(id: string): void {
        this.correlationId = id;
    }

    /**
     * Obtiene el correlation ID actual.
     * 
     * @returns ID de correlación o undefined si no está establecido
     */
    public getCorrelationId(): string | undefined {
        return this.correlationId;
    }

    /**
     * Genera un nuevo correlation ID único.
     * Formato: timestamp_randomhex (e.g., '1699000000_a1b2c3d4')
     * 
     * @returns Nuevo correlation ID único
     */
    public static generateCorrelationId(): string {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `${timestamp}_${random}`;
    }

    // ===== MÉTODOS ESTÁTICOS =====

    /**
     * Obtiene una instancia de Logger para un componente.
     * Reutiliza instancias existentes para eficiencia.
     * 
     * @param component - Nombre del componente
     * @returns Instancia de Logger
     */
    public static getLogger(component: string): Logger {
        const cached = Logger.loggerCache.get(component);
        if (cached) {
            return cached;
        }
        
        const logger = new Logger(component);
        Logger.loggerCache.set(component, logger);
        return logger;
    }

    /**
     * Configura el callback para alertas externas (e.g., Telegram).
     * El callback se invoca automáticamente en cada log de nivel 'error'.
     * 
     * REQ-4.2.3: Preparación para alertas Telegram
     * 
     * @param callback - Función async que maneja el envío de alertas
     */
    public static setAlertCallback(callback: AlertCallback): void {
        Logger.alertCallback = callback;
    }

    /**
     * Actualiza la configuración global del logger.
     * Afecta a nuevas instancias creadas después de la llamada.
     * 
     * @param config - Configuración parcial a aplicar
     */
    public static configure(config: Partial<LoggerConfig>): void {
        Logger.config = { ...Logger.config, ...config };
        Logger.initialized = false; // Forzar reinicialización
        Logger.loggerCache.clear();  // Limpiar cache para aplicar nueva config
    }

    /**
     * Obtiene la configuración actual del logger.
     * 
     * @returns Configuración activa
     */
    public static getConfig(): LoggerConfig {
        return { ...Logger.config };
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Método central de logging que formatea y envía el log.
     */
    private log(
        level: 'error' | 'warn' | 'info' | 'debug',
        message: string,
        error?: Error,
        meta?: LogMeta
    ): void {
        const logData: Record<string, unknown> = {
            component: this.component,
            ...meta
        };
        
        // Añadir correlation ID si está disponible
        if (this.correlationId) {
            logData.correlationId = this.correlationId;
        }
        
        // Añadir información del error si existe
        if (error) {
            logData.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }
        
        this.logger.log(level, message, logData);
    }

    /**
     * Crea y configura la instancia de Winston logger.
     */
    private createWinstonLogger(): winston.Logger {
        const transports: winston.transport[] = [];
        
        // Transport para archivo con rotación diaria
        const fileTransport = new DailyRotateFile({
            filename: path.join(Logger.config.logsDir, 'omniai-%DATE%.log'),
            datePattern: Logger.config.datePattern,
            maxFiles: Logger.config.maxFiles,
            maxSize: Logger.config.maxSize,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
                winston.format.json()
            )
        });
        
        transports.push(fileTransport);
        
        // Transport para consola (desarrollo)
        if (Logger.config.console) {
            const consoleTransport = new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'HH:mm:ss' }),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        const color = LOG_COLORS[level as keyof typeof LOG_COLORS] || '';
                        const emoji = LOG_EMOJIS[level as keyof typeof LOG_EMOJIS] || '';
                        const reset = LOG_COLORS.reset;
                        
                        // Formatear metadatos sin campos internos de Winston
                        const cleanMeta = { ...meta };
                        delete cleanMeta.component;
                        delete cleanMeta.correlationId;
                        
                        let metaStr = '';
                        if (Object.keys(cleanMeta).length > 0) {
                            metaStr = ` ${JSON.stringify(cleanMeta)}`;
                        }
                        
                        const correlationStr = meta.correlationId 
                            ? ` [${meta.correlationId}]` 
                            : '';
                        const componentStr = meta.component 
                            ? `[${meta.component}]` 
                            : '';
                        
                        return `${color}${emoji} [${timestamp}] [${level.toUpperCase()}] ${componentStr}${correlationStr}: ${message}${metaStr}${reset}`;
                    })
                )
            });
            
            transports.push(consoleTransport);
        }
        
        return winston.createLogger({
            level: Logger.config.level,
            transports
        });
    }

    /**
     * Inicializa el directorio de logs si no existe.
     */
    private static initializeLogsDirectory(): void {
        const logsDir = path.resolve(process.cwd(), Logger.config.logsDir);
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        Logger.initialized = true;
    }
}

// ===== INSTANCIA DEFAULT =====

/**
 * Logger por defecto para uso general.
 * Usar Logger.getLogger(component) para loggers específicos.
 */
export const logger = Logger.getLogger('OmniAI');

// ===== EXPORTAR POR DEFECTO =====

export default Logger;
