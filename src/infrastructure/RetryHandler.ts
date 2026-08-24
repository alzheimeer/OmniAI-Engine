/**
 * RetryHandler.ts
 * 
 * Sistema de reintentos con backoff exponencial para APIs externas.
 * Proporciona resiliencia ante fallos transitorios con configuración flexible.
 * 
 * REQ-4.4.1: Crear RetryHandler con backoff exponencial configurable
 * REQ-4.4.2: Aplicar retry a APIs externas (DeepSeek, Google TTS, Pexels, YouTube)
 * REQ-4.4.3: Crear fallbacks específicos por componente
 * 
 * Características:
 * - Backoff exponencial con jitter aleatorio para evitar thundering herd
 * - Configuración flexible de número de reintentos, delays y factores
 * - Distinción entre errores retryable y non-retryable
 * - Integración con Logger para trazabilidad completa
 * - Soporte para timeouts por operación
 */

import { Logger, LogMeta } from './Logger';

// ===== TIPOS E INTERFACES =====

/**
 * Configuración del handler de reintentos.
 * Todos los valores tienen defaults sensibles para APIs externas.
 */
export interface RetryConfig {
    /** Número máximo de reintentos (default: 3) */
    maxRetries: number;
    
    /** Delay base en milisegundos (default: 1000) */
    baseDelayMs: number;
    
    /** Factor de multiplicación para backoff exponencial (default: 2) */
    backoffFactor: number;
    
    /** Máximo delay en milisegundos para evitar esperas excesivas (default: 30000) */
    maxDelayMs: number;
    
    /** Añadir jitter aleatorio para evitar thundering herd (default: true) */
    jitter: boolean;
    
    /** 
     * Errores que NO deben reintentar.
     * Puede ser código HTTP (400, 401, 403, 404) o nombre de error.
     * Los errores de autenticación/autorización no deben reintentarse.
     */
    nonRetryableErrors?: (string | number)[];
    
    /** Timeout en ms para cada intento individual (default: 30000) */
    timeoutMs?: number;
}

/**
 * Resultado de una operación con reintentos.
 * Incluye métricas para observabilidad.
 */
export interface RetryResult<T> {
    /** Resultado de la operación si fue exitosa */
    result: T;
    
    /** Número de intentos realizados (1 = éxito en primer intento) */
    attempts: number;
    
    /** Tiempo total transcurrido en ms (incluye delays) */
    totalTimeMs: number;
    
    /** Si hubo reintentos antes del éxito */
    hadRetries: boolean;
}

/**
 * Error extendido con información de reintentos.
 * Se lanza cuando se agotan todos los reintentos.
 */
export class RetryError extends Error {
    /** Número de intentos realizados antes de fallar */
    public readonly attempts: number;
    
    /** Tiempo total transcurrido en ms */
    public readonly totalTimeMs: number;
    
    /** Último error que causó el fallo */
    public readonly lastError: Error;
    
    /** Nombre de la operación que falló */
    public readonly operationName: string;
    
    /** Todos los errores encontrados durante los reintentos */
    public readonly allErrors: Error[];

    constructor(
        message: string,
        operationName: string,
        attempts: number,
        totalTimeMs: number,
        lastError: Error,
        allErrors: Error[]
    ) {
        super(message);
        this.name = 'RetryError';
        this.operationName = operationName;
        this.attempts = attempts;
        this.totalTimeMs = totalTimeMs;
        this.lastError = lastError;
        this.allErrors = allErrors;
    }
}

/**
 * Opciones adicionales para una ejecución específica.
 */
export interface ExecuteOptions {
    /** Callback llamado antes de cada reintento */
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
    
    /** Función para determinar si un error específico es retryable */
    isRetryable?: (error: Error) => boolean;
    
    /** Metadatos adicionales para logging */
    meta?: LogMeta;
}

// ===== CONSTANTES =====

/**
 * Configuración por defecto optimizada para APIs externas.
 */
const DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    backoffFactor: 2,
    maxDelayMs: 30000,
    jitter: true,
    nonRetryableErrors: [400, 401, 403, 404, 422],
    timeoutMs: 30000
};

/**
 * Códigos HTTP que indican errores transitorios (retryable).
 */
const RETRYABLE_HTTP_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Nombres de errores de red que son retryable.
 */
const RETRYABLE_ERROR_NAMES = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH'
];

// ===== CLASE PRINCIPAL =====

/**
 * RetryHandler - Sistema de reintentos con backoff exponencial.
 * 
 * Implementa el patrón de retry con backoff exponencial y jitter
 * para manejar fallos transitorios en llamadas a APIs externas.
 * 
 * Uso básico:
 * ```typescript
 * const retryHandler = new RetryHandler({ maxRetries: 3 });
 * 
 * const result = await retryHandler.execute(
 *     () => fetchFromPexelsAPI(query),
 *     'Pexels API'
 * );
 * ```
 * 
 * Uso con opciones avanzadas:
 * ```typescript
 * const result = await retryHandler.executeWithResult(
 *     () => googleTTS.synthesize(text),
 *     'Google TTS',
 *     {
 *         onRetry: (attempt, error, delay) => {
 *             console.log(`Reintento ${attempt}, delay: ${delay}ms`);
 *         }
 *     }
 * );
 * console.log(`Éxito en ${result.attempts} intentos`);
 * ```
 */
export class RetryHandler {
    /** Configuración activa del handler */
    private readonly config: RetryConfig;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;

    /**
     * Crea una nueva instancia de RetryHandler.
     * 
     * @param config - Configuración parcial (se mezcla con defaults)
     * @param componentName - Nombre del componente para logging
     */
    constructor(config?: Partial<RetryConfig>, componentName: string = 'RetryHandler') {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger(componentName);
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Ejecuta una operación con reintentos automáticos.
     * Versión simplificada que retorna solo el resultado.
     * 
     * @param operation - Función async a ejecutar
     * @param operationName - Nombre descriptivo para logging
     * @param options - Opciones adicionales
     * @returns Resultado de la operación
     * @throws RetryError si se agotan todos los reintentos
     */
    public async execute<T>(
        operation: () => Promise<T>,
        operationName: string = 'Operación',
        options?: ExecuteOptions
    ): Promise<T> {
        const result = await this.executeWithResult(operation, operationName, options);
        return result.result;
    }

    /**
     * Ejecuta una operación con reintentos y retorna métricas detalladas.
     * Útil cuando se necesita información sobre el número de intentos.
     * 
     * @param operation - Función async a ejecutar
     * @param operationName - Nombre descriptivo para logging
     * @param options - Opciones adicionales
     * @returns Resultado con métricas de reintentos
     * @throws RetryError si se agotan todos los reintentos
     */
    public async executeWithResult<T>(
        operation: () => Promise<T>,
        operationName: string = 'Operación',
        options?: ExecuteOptions
    ): Promise<RetryResult<T>> {
        const startTime = Date.now();
        const allErrors: Error[] = [];
        let lastError: Error = new Error('Sin intentos realizados');
        
        // Número total de intentos = 1 (inicial) + maxRetries
        const totalAttempts = 1 + this.config.maxRetries;

        for (let attempt = 1; attempt <= totalAttempts; attempt++) {
            try {
                // Ejecutar la operación (con timeout si está configurado)
                const result = await this.executeWithTimeout(operation);
                
                const totalTimeMs = Date.now() - startTime;
                const hadRetries = attempt > 1;
                
                // Log de éxito
                if (hadRetries) {
                    this.logger.info(`${operationName} exitoso después de ${attempt} intentos`, {
                        ...options?.meta,
                        duration: totalTimeMs,
                        attempts: attempt
                    });
                }

                return {
                    result,
                    attempts: attempt,
                    totalTimeMs,
                    hadRetries
                };
                
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                lastError = err;
                allErrors.push(err);
                
                // Verificar si el error es retryable
                const retryable = this.shouldRetry(err, options?.isRetryable);
                
                // Si no es retryable o es el último intento, fallar
                if (!retryable || attempt === totalAttempts) {
                    const totalTimeMs = Date.now() - startTime;
                    
                    this.logger.error(
                        `${operationName} falló después de ${attempt} intentos`,
                        err,
                        {
                            ...options?.meta,
                            duration: totalTimeMs,
                            attempts: attempt,
                            retryable
                        }
                    );
                    
                    throw new RetryError(
                        `${operationName} falló después de ${attempt} intentos: ${err.message}`,
                        operationName,
                        attempt,
                        totalTimeMs,
                        lastError,
                        allErrors
                    );
                }
                
                // Calcular delay para siguiente intento
                const delayMs = this.calculateDelay(attempt);
                
                // Log de reintento
                this.logger.warn(`${operationName} falló (intento ${attempt}/${totalAttempts}), reintentando en ${delayMs}ms`, {
                    ...options?.meta,
                    error: err.message,
                    nextDelay: delayMs
                });
                
                // Callback de reintento si está configurado
                if (options?.onRetry) {
                    options.onRetry(attempt, err, delayMs);
                }
                
                // Esperar antes del siguiente intento
                await this.sleep(delayMs);
            }
        }

        // Este código no debería alcanzarse, pero TypeScript lo requiere
        const totalTimeMs = Date.now() - startTime;
        throw new RetryError(
            `${operationName} falló después de ${totalAttempts} intentos`,
            operationName,
            totalAttempts,
            totalTimeMs,
            lastError,
            allErrors
        );
    }

    /**
     * Calcula el delay para el próximo reintento usando backoff exponencial.
     * Fórmula: min(baseDelay * (backoffFactor ^ attempt) + jitter, maxDelay)
     * 
     * @param attempt - Número de intento actual (1-based)
     * @returns Delay en milisegundos
     */
    public calculateDelay(attempt: number): number {
        // Backoff exponencial: baseDelay * factor^(attempt-1)
        // attempt-1 porque el primer reintento debe usar baseDelay * factor^0 = baseDelay
        const exponentialDelay = this.config.baseDelayMs * 
            Math.pow(this.config.backoffFactor, attempt - 1);
        
        // Aplicar límite máximo
        let delay = Math.min(exponentialDelay, this.config.maxDelayMs);
        
        // Añadir jitter aleatorio (±25% del delay)
        if (this.config.jitter) {
            const jitterRange = delay * 0.25;
            const jitter = (Math.random() * jitterRange * 2) - jitterRange;
            delay = Math.max(0, delay + jitter);
        }
        
        return Math.round(delay);
    }

    /**
     * Determina si un error es retriable basándose en la configuración.
     * 
     * @param error - Error a evaluar
     * @returns true si el error debe reintentarse
     */
    public isRetryable(error: Error): boolean {
        return this.shouldRetry(error);
    }

    /**
     * Obtiene la configuración activa del handler.
     * 
     * @returns Copia de la configuración actual
     */
    public getConfig(): RetryConfig {
        return { ...this.config };
    }

    // ===== MÉTODOS ESTÁTICOS =====

    /**
     * Crea un RetryHandler preconfigurado para APIs externas específicas.
     * 
     * @param apiName - Nombre de la API (DeepSeek, GoogleTTS, Pexels, YouTube)
     * @returns RetryHandler configurado para esa API
     */
    public static forAPI(apiName: 'DeepSeek' | 'GoogleTTS' | 'Pexels' | 'YouTube'): RetryHandler {
        const configs: Record<string, Partial<RetryConfig>> = {
            DeepSeek: {
                maxRetries: 3,
                baseDelayMs: 2000,      // DeepSeek puede tardar
                backoffFactor: 2,
                maxDelayMs: 30000,
                nonRetryableErrors: [400, 401, 403, 422]
            },
            GoogleTTS: {
                maxRetries: 3,
                baseDelayMs: 1000,
                backoffFactor: 2,
                maxDelayMs: 15000,
                nonRetryableErrors: [400, 401, 403, 404]
            },
            Pexels: {
                maxRetries: 5,          // Pexels tiene rate limiting
                baseDelayMs: 1000,
                backoffFactor: 2,
                maxDelayMs: 60000,      // Esperar más por rate limit
                nonRetryableErrors: [400, 401, 403, 404]
            },
            YouTube: {
                maxRetries: 3,
                baseDelayMs: 2000,
                backoffFactor: 2.5,
                maxDelayMs: 30000,
                nonRetryableErrors: [400, 401, 403, 404, 409, 410]
            }
        };

        return new RetryHandler(configs[apiName], `RetryHandler-${apiName}`);
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Determina si un error debe reintentarse.
     */
    private shouldRetry(error: Error, customCheck?: (error: Error) => boolean): boolean {
        // Si hay verificación personalizada, usarla primero
        if (customCheck) {
            return customCheck(error);
        }

        // Verificar si está en la lista de no-retryable
        if (this.isNonRetryableError(error)) {
            return false;
        }

        // Verificar si es un error de red retryable
        if (this.isNetworkError(error)) {
            return true;
        }

        // Verificar código HTTP retryable
        if (this.isRetryableHttpError(error)) {
            return true;
        }

        // Por defecto, reintentar errores desconocidos
        return true;
    }

    /**
     * Verifica si el error está en la lista de non-retryable.
     */
    private isNonRetryableError(error: Error): boolean {
        const nonRetryable = this.config.nonRetryableErrors || [];
        
        // Buscar código HTTP en el error
        const statusCode = this.extractStatusCode(error);
        if (statusCode && nonRetryable.includes(statusCode)) {
            return true;
        }
        
        // Buscar nombre de error
        if (nonRetryable.includes(error.name)) {
            return true;
        }
        
        // Buscar en mensaje (para errores de validación)
        const message = error.message.toLowerCase();
        if (message.includes('invalid') || message.includes('validation')) {
            // Errores de validación generalmente no son retryable
            if (nonRetryable.includes(400) || nonRetryable.includes(422)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Verifica si es un error de red retryable.
     */
    private isNetworkError(error: Error): boolean {
        // Verificar código de error de Node.js
        const errorAny = error as NodeJS.ErrnoException;
        if (errorAny.code && RETRYABLE_ERROR_NAMES.includes(errorAny.code)) {
            return true;
        }
        
        // Verificar mensaje de error
        const message = error.message.toLowerCase();
        const networkKeywords = [
            'network',
            'timeout',
            'econnreset',
            'econnrefused',
            'socket hang up',
            'connection reset',
            'connection refused'
        ];
        
        return networkKeywords.some(keyword => message.includes(keyword));
    }

    /**
     * Verifica si es un error HTTP retryable (5xx, 429).
     */
    private isRetryableHttpError(error: Error): boolean {
        const statusCode = this.extractStatusCode(error);
        if (statusCode && RETRYABLE_HTTP_CODES.includes(statusCode)) {
            return true;
        }
        
        // Verificar mensaje para rate limiting
        const message = error.message.toLowerCase();
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return true;
        }
        
        return false;
    }

    /**
     * Extrae código HTTP de un error si está disponible.
     */
    private extractStatusCode(error: Error): number | undefined {
        // Errores de Axios
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status) {
            return axiosError.response.status;
        }
        
        // Errores con statusCode directo
        const httpError = error as { statusCode?: number; status?: number };
        if (httpError.statusCode) {
            return httpError.statusCode;
        }
        if (httpError.status) {
            return httpError.status;
        }
        
        // Buscar en mensaje
        const match = error.message.match(/\b([45]\d{2})\b/);
        if (match) {
            return parseInt(match[1], 10);
        }
        
        return undefined;
    }

    /**
     * Ejecuta operación con timeout opcional.
     */
    private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
        if (!this.config.timeoutMs) {
            return operation();
        }

        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout después de ${this.config.timeoutMs}ms`));
            }, this.config.timeoutMs);

            operation()
                .then(result => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Pausa la ejecución por el tiempo especificado.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== EXPORTACIONES =====

export default RetryHandler;
