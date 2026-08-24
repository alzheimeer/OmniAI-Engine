/**
 * CircuitBreaker.ts
 * 
 * Implementación del patrón Circuit Breaker para resiliencia del sistema.
 * Protege contra fallos en cascada en llamadas a APIs externas.
 * 
 * REQ-6.1.1: Crear CircuitBreaker con estados closed/open/half-open
 * REQ-6.1.2: Abrir circuito después de 5 fallos consecutivos
 * REQ-6.1.3: Auto-cerrar después de timeout configurable (1 minuto)
 * REQ-6.1.4: Loguear cambios de estado del circuit breaker
 * 
 * Estados:
 * - CLOSED: Operación normal, las peticiones pasan. Registra fallos.
 * - OPEN: Rechaza peticiones inmediatamente (fail-fast). Espera timeout.
 * - HALF_OPEN: Permite peticiones de prueba para verificar recuperación.
 * 
 * Uso:
 * ```typescript
 * const breaker = new CircuitBreaker({ 
 *     name: 'DeepSeek-API',
 *     failureThreshold: 5 
 * });
 * 
 * try {
 *     const result = await breaker.execute(() => callDeepSeekAPI());
 * } catch (error) {
 *     if (error instanceof CircuitOpenError) {
 *         // Circuito abierto, usar fallback
 *     }
 * }
 * ```
 */

import { Logger, LogMeta } from './Logger';

// ===== TIPOS E INTERFACES =====

/**
 * Estados posibles del Circuit Breaker.
 */
export enum CircuitState {
    /** Operación normal, las peticiones pasan. Registra fallos. */
    CLOSED = 'CLOSED',
    
    /** Rechaza peticiones inmediatamente (fail-fast). */
    OPEN = 'OPEN',
    
    /** Permite peticiones de prueba para verificar recuperación. */
    HALF_OPEN = 'HALF_OPEN'
}

/**
 * Configuración del Circuit Breaker.
 */
export interface CircuitBreakerConfig {
    /** Nombre identificador del circuito (para logging) */
    name: string;
    
    /** Número de fallos consecutivos antes de abrir (default: 5) */
    failureThreshold?: number;
    
    /** Tiempo en ms antes de intentar half-open (default: 60000 = 1 minuto) */
    resetTimeout?: number;
    
    /** Éxitos necesarios en half-open para cerrar (default: 3) */
    successThreshold?: number;
    
    /** Función para determinar si un error debe contar como fallo */
    shouldTripOnError?: (error: Error) => boolean;
    
    /** Callback cuando el estado cambia */
    onStateChange?: (from: CircuitState, to: CircuitState, reason: string) => void;
}

/**
 * Estadísticas del Circuit Breaker.
 */
export interface CircuitBreakerStats {
    /** Estado actual del circuito */
    state: CircuitState;
    
    /** Número de fallos consecutivos actuales */
    failureCount: number;
    
    /** Número de éxitos en half-open */
    halfOpenSuccesses: number;
    
    /** Total de llamadas exitosas */
    totalSuccesses: number;
    
    /** Total de fallos */
    totalFailures: number;
    
    /** Total de rechazos por circuito abierto */
    totalRejections: number;
    
    /** Última vez que el circuito se abrió (timestamp) */
    lastOpenedAt?: number;
    
    /** Última vez que hubo un fallo (timestamp) */
    lastFailureAt?: number;
    
    /** Tiempo restante hasta half-open (ms), solo si está abierto */
    timeUntilHalfOpen?: number;
}

/**
 * Error lanzado cuando el circuito está abierto.
 */
export class CircuitOpenError extends Error {
    /** Nombre del circuito que rechazó la petición */
    public readonly circuitName: string;
    
    /** Tiempo restante hasta que el circuito intente half-open */
    public readonly timeUntilRetry: number;
    
    /** Estado actual del circuito */
    public readonly state: CircuitState;

    constructor(circuitName: string, timeUntilRetry: number, state: CircuitState) {
        super(
            `Circuito '${circuitName}' está ${state}. ` +
            `Reintento en ${Math.ceil(timeUntilRetry / 1000)} segundos.`
        );
        this.name = 'CircuitOpenError';
        this.circuitName = circuitName;
        this.timeUntilRetry = timeUntilRetry;
        this.state = state;
    }
}

// ===== CONSTANTES =====

/**
 * Configuración por defecto.
 */
const DEFAULT_CONFIG = {
    failureThreshold: 5,
    resetTimeout: 60000,  // 1 minuto
    successThreshold: 3
};

// ===== CLASE PRINCIPAL =====

/**
 * CircuitBreaker - Patrón de resiliencia para proteger contra fallos en cascada.
 * 
 * El Circuit Breaker funciona como un interruptor eléctrico:
 * 1. CLOSED: Todo funciona normal, las peticiones pasan.
 * 2. Si hay muchos fallos consecutivos → se abre (OPEN).
 * 3. OPEN: Rechaza todas las peticiones inmediatamente (fail-fast).
 * 4. Después de un timeout → pasa a HALF_OPEN.
 * 5. HALF_OPEN: Permite algunas peticiones de prueba.
 * 6. Si las pruebas son exitosas → vuelve a CLOSED.
 * 7. Si hay un fallo en HALF_OPEN → vuelve a OPEN.
 */
export class CircuitBreaker {
    // ===== PROPIEDADES PRIVADAS =====
    
    /** Nombre del circuito */
    private readonly name: string;
    
    /** Configuración activa */
    private readonly config: Required<Omit<CircuitBreakerConfig, 'onStateChange' | 'shouldTripOnError'>> & 
        Pick<CircuitBreakerConfig, 'onStateChange' | 'shouldTripOnError'>;
    
    /** Estado actual del circuito */
    private state: CircuitState = CircuitState.CLOSED;
    
    /** Contador de fallos consecutivos */
    private failureCount: number = 0;
    
    /** Contador de éxitos en half-open */
    private halfOpenSuccesses: number = 0;
    
    /** Timestamp cuando el circuito se abrió */
    private openedAt?: number;
    
    /** Timestamp del último fallo */
    private lastFailureAt?: number;
    
    /** Estadísticas totales */
    private totalSuccesses: number = 0;
    private totalFailures: number = 0;
    private totalRejections: number = 0;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;

    // ===== CONSTRUCTOR =====

    /**
     * Crea una nueva instancia de CircuitBreaker.
     * 
     * @param config - Configuración del circuit breaker
     */
    constructor(config: CircuitBreakerConfig) {
        this.name = config.name;
        this.config = {
            name: config.name,
            failureThreshold: config.failureThreshold ?? DEFAULT_CONFIG.failureThreshold,
            resetTimeout: config.resetTimeout ?? DEFAULT_CONFIG.resetTimeout,
            successThreshold: config.successThreshold ?? DEFAULT_CONFIG.successThreshold,
            onStateChange: config.onStateChange,
            shouldTripOnError: config.shouldTripOnError
        };
        this.logger = new Logger(`CircuitBreaker-${this.name}`);
        
        this.logger.info(`Circuit Breaker '${this.name}' inicializado`, {
            failureThreshold: this.config.failureThreshold,
            resetTimeout: this.config.resetTimeout,
            successThreshold: this.config.successThreshold
        });
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Ejecuta una operación protegida por el circuit breaker.
     * 
     * @param operation - Función async a ejecutar
     * @returns Resultado de la operación
     * @throws CircuitOpenError si el circuito está abierto
     * @throws Error original si la operación falla y el circuito no se abre
     */
    public async execute<T>(operation: () => Promise<T>): Promise<T> {
        // Verificar si podemos ejecutar la operación
        this.checkAndUpdateState();
        
        if (this.state === CircuitState.OPEN) {
            const timeUntilRetry = this.getTimeUntilHalfOpen();
            this.totalRejections++;
            
            this.logger.warn(`Petición rechazada - circuito abierto`, {
                state: this.state,
                timeUntilRetry,
                totalRejections: this.totalRejections
            });
            
            throw new CircuitOpenError(this.name, timeUntilRetry, this.state);
        }

        try {
            // Ejecutar la operación
            const result = await operation();
            
            // Registrar éxito
            this.onSuccess();
            
            return result;
        } catch (error) {
            // Registrar fallo
            const err = error instanceof Error ? error : new Error(String(error));
            this.onFailure(err);
            
            throw error;
        }
    }

    /**
     * Obtiene el estado actual del circuito.
     * 
     * @returns Estado actual (CLOSED, OPEN, HALF_OPEN)
     */
    public getState(): CircuitState {
        // Actualizar estado antes de retornar (por si pasó el timeout)
        this.checkAndUpdateState();
        return this.state;
    }

    /**
     * Reinicia el circuit breaker a su estado inicial (CLOSED).
     * Útil para testing o reset manual.
     */
    public reset(): void {
        const previousState = this.state;
        
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.halfOpenSuccesses = 0;
        this.openedAt = undefined;
        this.lastFailureAt = undefined;
        
        if (previousState !== CircuitState.CLOSED) {
            this.logStateChange(previousState, CircuitState.CLOSED, 'Reset manual');
        }
        
        this.logger.info(`Circuit Breaker '${this.name}' reseteado`, {
            previousState,
            newState: CircuitState.CLOSED
        });
    }

    /**
     * Obtiene estadísticas completas del circuit breaker.
     * 
     * @returns Estadísticas actuales
     */
    public getStats(): CircuitBreakerStats {
        this.checkAndUpdateState();
        
        return {
            state: this.state,
            failureCount: this.failureCount,
            halfOpenSuccesses: this.halfOpenSuccesses,
            totalSuccesses: this.totalSuccesses,
            totalFailures: this.totalFailures,
            totalRejections: this.totalRejections,
            lastOpenedAt: this.openedAt,
            lastFailureAt: this.lastFailureAt,
            timeUntilHalfOpen: this.state === CircuitState.OPEN 
                ? this.getTimeUntilHalfOpen() 
                : undefined
        };
    }

    /**
     * Obtiene el nombre del circuit breaker.
     * 
     * @returns Nombre del circuito
     */
    public getName(): string {
        return this.name;
    }

    /**
     * Verifica si el circuito está cerrado (operando normalmente).
     * 
     * @returns true si está cerrado
     */
    public isClosed(): boolean {
        return this.getState() === CircuitState.CLOSED;
    }

    /**
     * Verifica si el circuito está abierto (rechazando peticiones).
     * 
     * @returns true si está abierto
     */
    public isOpen(): boolean {
        return this.getState() === CircuitState.OPEN;
    }

    /**
     * Verifica si el circuito está en half-open (probando recuperación).
     * 
     * @returns true si está en half-open
     */
    public isHalfOpen(): boolean {
        return this.getState() === CircuitState.HALF_OPEN;
    }

    // ===== MÉTODOS ESTÁTICOS =====

    /**
     * Crea un CircuitBreaker preconfigurado para APIs externas específicas.
     * 
     * @param apiName - Nombre de la API
     * @returns CircuitBreaker configurado para esa API
     */
    public static forAPI(apiName: 'DeepSeek' | 'GoogleTTS' | 'Pexels' | 'YouTube' | 'Instagram' | 'TikTok'): CircuitBreaker {
        const configs: Record<string, Partial<CircuitBreakerConfig>> = {
            DeepSeek: {
                failureThreshold: 5,
                resetTimeout: 60000,    // 1 minuto
                successThreshold: 2
            },
            GoogleTTS: {
                failureThreshold: 5,
                resetTimeout: 30000,    // 30 segundos
                successThreshold: 2
            },
            Pexels: {
                failureThreshold: 8,    // Más tolerante (rate limiting)
                resetTimeout: 120000,   // 2 minutos
                successThreshold: 3
            },
            YouTube: {
                failureThreshold: 5,
                resetTimeout: 60000,
                successThreshold: 2
            },
            Instagram: {
                failureThreshold: 5,
                resetTimeout: 90000,    // 1.5 minutos
                successThreshold: 3
            },
            TikTok: {
                failureThreshold: 5,
                resetTimeout: 90000,
                successThreshold: 3
            }
        };

        return new CircuitBreaker({
            name: apiName,
            ...configs[apiName]
        });
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Verifica y actualiza el estado del circuito basándose en el tiempo.
     * Si está OPEN y pasó el timeout, cambia a HALF_OPEN.
     */
    private checkAndUpdateState(): void {
        if (this.state === CircuitState.OPEN && this.openedAt) {
            const elapsed = Date.now() - this.openedAt;
            
            if (elapsed >= this.config.resetTimeout) {
                this.transitionTo(CircuitState.HALF_OPEN, 'Timeout de reset alcanzado');
            }
        }
    }

    /**
     * Maneja una operación exitosa.
     */
    private onSuccess(): void {
        this.totalSuccesses++;
        
        switch (this.state) {
            case CircuitState.CLOSED:
                // Resetear contador de fallos en estado cerrado
                this.failureCount = 0;
                break;
                
            case CircuitState.HALF_OPEN:
                // Contar éxitos en half-open
                this.halfOpenSuccesses++;
                
                this.logger.debug(`Éxito en half-open (${this.halfOpenSuccesses}/${this.config.successThreshold})`, {
                    halfOpenSuccesses: this.halfOpenSuccesses,
                    successThreshold: this.config.successThreshold
                });
                
                // Si alcanzamos el umbral de éxitos, cerrar el circuito
                if (this.halfOpenSuccesses >= this.config.successThreshold) {
                    this.transitionTo(
                        CircuitState.CLOSED, 
                        `${this.config.successThreshold} éxitos consecutivos en half-open`
                    );
                }
                break;
        }
    }

    /**
     * Maneja una operación fallida.
     */
    private onFailure(error: Error): void {
        this.totalFailures++;
        this.lastFailureAt = Date.now();
        
        // Verificar si este error debe contar como fallo
        if (this.config.shouldTripOnError && !this.config.shouldTripOnError(error)) {
            this.logger.debug(`Error ignorado por shouldTripOnError: ${error.message}`);
            return;
        }
        
        switch (this.state) {
            case CircuitState.CLOSED:
                // Incrementar contador de fallos
                this.failureCount++;
                
                this.logger.warn(`Fallo registrado (${this.failureCount}/${this.config.failureThreshold})`, {
                    failureCount: this.failureCount,
                    failureThreshold: this.config.failureThreshold,
                    error: error.message
                });
                
                // Si alcanzamos el umbral, abrir el circuito
                if (this.failureCount >= this.config.failureThreshold) {
                    this.transitionTo(
                        CircuitState.OPEN,
                        `${this.config.failureThreshold} fallos consecutivos`
                    );
                }
                break;
                
            case CircuitState.HALF_OPEN:
                // Un fallo en half-open vuelve a abrir el circuito inmediatamente
                this.logger.warn(`Fallo en half-open, reabriendo circuito`, {
                    error: error.message
                });
                
                this.transitionTo(CircuitState.OPEN, 'Fallo durante half-open');
                break;
        }
    }

    /**
     * Realiza la transición a un nuevo estado.
     */
    private transitionTo(newState: CircuitState, reason: string): void {
        const previousState = this.state;
        
        if (previousState === newState) {
            return;
        }
        
        this.state = newState;
        
        // Acciones específicas por estado
        switch (newState) {
            case CircuitState.OPEN:
                this.openedAt = Date.now();
                this.halfOpenSuccesses = 0;
                break;
                
            case CircuitState.HALF_OPEN:
                this.halfOpenSuccesses = 0;
                break;
                
            case CircuitState.CLOSED:
                this.failureCount = 0;
                this.halfOpenSuccesses = 0;
                this.openedAt = undefined;
                break;
        }
        
        this.logStateChange(previousState, newState, reason);
    }

    /**
     * Loguea un cambio de estado.
     */
    private logStateChange(from: CircuitState, to: CircuitState, reason: string): void {
        const meta: LogMeta = {
            circuitName: this.name,
            fromState: from,
            toState: to,
            reason,
            failureCount: this.failureCount,
            halfOpenSuccesses: this.halfOpenSuccesses
        };
        
        // Loguear según severidad del cambio
        if (to === CircuitState.OPEN) {
            this.logger.error(
                `⚠️ CIRCUITO ABIERTO: '${this.name}' - ${reason}`,
                new Error(`Circuit ${this.name} opened`),
                meta
            );
        } else if (to === CircuitState.CLOSED && from === CircuitState.HALF_OPEN) {
            this.logger.info(
                `✅ CIRCUITO RECUPERADO: '${this.name}' - ${reason}`,
                meta
            );
        } else {
            this.logger.info(
                `Circuit Breaker '${this.name}': ${from} → ${to} - ${reason}`,
                meta
            );
        }
        
        // Llamar callback si está configurado
        if (this.config.onStateChange) {
            this.config.onStateChange(from, to, reason);
        }
    }

    /**
     * Calcula el tiempo restante hasta que el circuito intente half-open.
     */
    private getTimeUntilHalfOpen(): number {
        if (!this.openedAt) {
            return 0;
        }
        
        const elapsed = Date.now() - this.openedAt;
        const remaining = this.config.resetTimeout - elapsed;
        
        return Math.max(0, remaining);
    }
}

// ===== EXPORTACIONES =====

export default CircuitBreaker;
