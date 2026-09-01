/**
 * RenderQueueManager.ts
 * 
 * Sistema de gestión de cola de renderizado con BullMQ para OmniAI-Engine.
 * Proporciona encolado de trabajos de renderizado de video con prioridades,
 * seguimiento de estados y métricas para observabilidad.
 * 
 * REQ-4.5.1: Crear RenderQueueManager usando BullMQ con configuración simple
 * REQ-4.5.2: Implementar 1-2 workers concurrentes máximo
 * REQ-4.5.3: Implementar prioridades: ALTA (Shorts <60s), BAJA (Videos largos)
 * REQ-4.5.4: Implementar reintentos: backoff 5s→15s→45s, máx 3 intentos
 * REQ-4.5.5: Implementar graceful shutdown: no nuevos jobs, esperar job actual
 * 
 * Características:
 * - Cola FIFO con prioridades básicas (Shorts primero)
 * - Estados de trabajo: pending, processing, completed, failed
 * - Backoff exponencial para reintentos: 5s → 15s → 45s
 * - Integración con Logger estructurado
 * - Graceful shutdown con espera de jobs activos
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { Logger, LogMeta } from './Logger';

// ===== TIPOS E INTERFACES =====

/**
 * Tipo de video a renderizar.
 * short: Videos cortos (<60s) - Alta prioridad
 * long: Videos largos (>60s) - Baja prioridad
 */
export type VideoType = 'short' | 'long';

/**
 * Canal de destino del video.
 */
export type ChannelKey = 'channel1' | 'channel2' | 'channel3';

/**
 * Estados posibles de un trabajo de renderizado.
 */
export type RenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Datos del trabajo de renderizado.
 */
export interface RenderJobData {
    /** Tema o título del video */
    topic: string;
    
    /** Idioma del contenido */
    language: string;
    
    /** Canal de destino */
    channelKey: ChannelKey;
}

/**
 * Trabajo de renderizado completo con metadatos.
 */
export interface RenderJob {
    /** ID único del trabajo */
    id: string;
    
    /** Tipo de video (short/long) */
    type: VideoType;
    
    /** Datos específicos del renderizado */
    data: RenderJobData;
    
    /** Prioridad del trabajo (menor número = mayor prioridad) */
    priority: number;
    
    /** Estado actual del trabajo */
    status: RenderJobStatus;
    
    /** Fecha de creación */
    createdAt: Date;
    
    /** Fecha de procesamiento (si aplica) */
    processedAt?: Date;
    
    /** Fecha de finalización (si aplica) */
    completedAt?: Date;
    
    /** Número de intentos realizados */
    attemptsMade: number;
    
    /** Mensaje de error si falló */
    errorMessage?: string;
}

/**
 * Estadísticas de la cola de renderizado.
 */
export interface QueueStats {
    /** Total de jobs esperando */
    waiting: number;
    
    /** Total de jobs en proceso */
    active: number;
    
    /** Total de jobs completados */
    completed: number;
    
    /** Total de jobs fallidos */
    failed: number;
    
    /** Total de jobs delayed (esperando reintento) */
    delayed: number;
}

/**
 * Configuración del RenderQueueManager.
 */
export interface RenderQueueConfig {
    /** Host de Redis */
    redisHost: string;
    
    /** Puerto de Redis */
    redisPort: number;
    
    /**
     * Número de workers concurrentes.
     * 
     * **IMPORTANTE - LÍMITE DE CONCURRENCIA:**
     * - Default: 1 worker (recomendado para la mayoría de casos)
     * - Máximo recomendado: 2 workers
     * 
     * **Justificación del límite de 1-2 workers:**
     * - FFmpeg es intensivo en CPU y memoria
     * - Múltiples instancias FFmpeg simultáneas pueden saturar la máquina local
     * - Con 2 workers, permite procesar un Short mientras se renderiza un video largo
     * - Más de 2 workers causa degradación de rendimiento y posibles timeouts
     * 
     * @default 1
     * @max 2 (recomendado)
     */
    concurrency: number;
    
    /** Máximo de reintentos por job */
    maxRetries: number;
    
    /** Delays de backoff en ms [5000, 15000, 45000] */
    backoffDelays: number[];
    
    /** Timeout máximo para graceful shutdown en ms */
    shutdownTimeoutMs: number;
}

/**
 * Procesador de jobs de renderizado.
 * Función que ejecuta el renderizado real.
 */
export type RenderJobProcessor = (job: RenderJob) => Promise<void>;

// ===== CONSTANTES =====

/** Nombre de la cola de renderizado */
const QUEUE_NAME = 'RenderQueue';

/** Prioridad alta para Shorts (número bajo = mayor prioridad) */
const PRIORITY_HIGH = 1;

/** Prioridad baja para Videos largos */
const PRIORITY_LOW = 10;

/**
 * Máximo de workers concurrentes recomendado.
 * Más de 2 workers puede saturar la máquina con múltiples instancias FFmpeg.
 */
export const MAX_RECOMMENDED_CONCURRENCY = 2;

/** Configuración por defecto */
const DEFAULT_CONFIG: RenderQueueConfig = {
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
    concurrency: 1, // Default: 1 worker para evitar saturar la máquina con FFmpeg
    maxRetries: 3,
    backoffDelays: [5000, 15000, 45000], // 5s → 15s → 45s
    shutdownTimeoutMs: 300000 // 5 minutos
};

// ===== CLASE PRINCIPAL =====

/**
 * RenderQueueManager - Gestor de cola de renderizado con BullMQ.
 * 
 * Implementa una cola de trabajos de renderizado con:
 * - Prioridades (Shorts primero, Videos largos después)
 * - Reintentos con backoff exponencial
 * - Seguimiento de estados
 * - Graceful shutdown
 * 
 * Uso básico:
 * ```typescript
 * const manager = new RenderQueueManager();
 * await manager.initialize();
 * 
 * // Encolar un Short (alta prioridad)
 * const job = await manager.enqueue('short', {
 *     topic: 'IA y Autismo',
 *     language: 'es',
 *     channelKey: 'channel1'
 * });
 * 
 * // Obtener estado
 * const status = await manager.getStatus(job.id);
 * 
 * // Obtener estadísticas
 * const stats = await manager.getStats();
 * ```
 */
export class RenderQueueManager {
    /** Configuración activa */
    private readonly config: RenderQueueConfig;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Conexión a Redis */
    private connection: Redis | null = null;
    
    /** Cola BullMQ */
    private queue: Queue | null = null;
    
    /** Worker BullMQ */
    private worker: Worker | null = null;
    
    /** Eventos de la cola */
    private queueEvents: QueueEvents | null = null;
    
    /** Procesador de jobs personalizado */
    private processor: RenderJobProcessor | null = null;
    
    /** Flag de shutdown en progreso */
    private isShuttingDown: boolean = false;
    
    /** Flag de inicialización */
    private isInitialized: boolean = false;

    /**
     * Crea una nueva instancia de RenderQueueManager.
     * 
     * @param config - Configuración parcial (se mezcla con defaults)
     */
    constructor(config?: Partial<RenderQueueConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger('RenderQueueManager');
        
        // Advertir si se excede el máximo recomendado de concurrencia
        if (this.config.concurrency > MAX_RECOMMENDED_CONCURRENCY) {
            this.logger.warn(
                `Concurrencia configurada (${this.config.concurrency}) excede el máximo recomendado (${MAX_RECOMMENDED_CONCURRENCY}). ` +
                'Esto puede saturar la máquina con múltiples instancias FFmpeg simultáneas.'
            );
        }
    }

    // ===== MÉTODOS DE INICIALIZACIÓN =====

    /**
     * Inicializa la conexión a Redis y la cola BullMQ.
     * Debe llamarse antes de usar cualquier otro método.
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('RenderQueueManager ya está inicializado');
            return;
        }

        try {
            // Crear conexión a Redis
            this.connection = new Redis({
                host: this.config.redisHost,
                port: this.config.redisPort,
                maxRetriesPerRequest: null,
                enableReadyCheck: false
            });

            // Crear cola
            this.queue = new Queue(QUEUE_NAME, {
                connection: this.connection,
                defaultJobOptions: {
                    attempts: this.config.maxRetries,
                    backoff: {
                        type: 'custom'
                    },
                    removeOnComplete: {
                        count: 100 // Mantener últimos 100 completados
                    },
                    removeOnFail: {
                        count: 50 // Mantener últimos 50 fallidos
                    }
                }
            });

            // Crear eventos de cola para seguimiento
            this.queueEvents = new QueueEvents(QUEUE_NAME, {
                connection: this.connection.duplicate()
            });

            this.setupEventListeners();
            this.isInitialized = true;

            this.logger.info('RenderQueueManager inicializado correctamente', {
                redisHost: this.config.redisHost,
                redisPort: this.config.redisPort,
                concurrency: this.config.concurrency
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Error inicializando RenderQueueManager', err);
            throw err;
        }
    }

    /**
     * Registra un procesador de jobs y arranca el worker.
     * 
     * @param processor - Función que procesa cada job de renderizado
     */
    public async startWorker(processor: RenderJobProcessor): Promise<void> {
        this.ensureInitialized();

        if (this.worker) {
            this.logger.warn('Worker ya está en ejecución');
            return;
        }

        this.processor = processor;

        this.worker = new Worker(
            QUEUE_NAME,
            async (job: Job) => {
                return this.processJob(job);
            },
            {
                connection: this.connection!.duplicate(),
                concurrency: this.config.concurrency,
                settings: {
                    backoffStrategy: (attemptsMade: number) => {
                        // Backoff personalizado: 5s → 15s → 45s
                        const index = Math.min(attemptsMade - 1, this.config.backoffDelays.length - 1);
                        return this.config.backoffDelays[index];
                    }
                }
            }
        );

        this.setupWorkerListeners();

        this.logger.info('Worker de renderizado iniciado', {
            concurrency: this.config.concurrency,
            maxRetries: this.config.maxRetries
        });
    }

    // ===== MÉTODOS PÚBLICOS DE COLA =====

    /**
     * Encola un nuevo trabajo de renderizado.
     * 
     * @param type - Tipo de video (short/long)
     * @param data - Datos del trabajo
     * @param priority - Prioridad opcional (default según tipo)
     * @returns Trabajo encolado con su ID
     */
    public async enqueue(
        type: VideoType,
        data: RenderJobData,
        priority?: number
    ): Promise<RenderJob> {
        this.ensureInitialized();

        if (this.isShuttingDown) {
            throw new Error('No se aceptan nuevos jobs durante shutdown');
        }

        // Determinar prioridad: Shorts = alta, Long = baja
        const jobPriority = priority ?? (type === 'short' ? PRIORITY_HIGH : PRIORITY_LOW);
        
        const jobData = {
            type,
            data,
            priority: jobPriority,
            createdAt: new Date().toISOString()
        };

        const bullJob = await this.queue!.add(
            `render-${type}`,
            jobData,
            {
                priority: jobPriority,
                jobId: `render-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }
        );

        const renderJob: RenderJob = {
            id: bullJob.id!,
            type,
            data,
            priority: jobPriority,
            status: 'pending',
            createdAt: new Date(),
            attemptsMade: 0
        };

        this.logger.info(`Job encolado: ${renderJob.id}`, {
            type,
            priority: jobPriority,
            topic: data.topic,
            channelKey: data.channelKey
        });

        return renderJob;
    }

    /**
     * Obtiene información de un trabajo por su ID.
     * 
     * @param jobId - ID del trabajo
     * @returns Trabajo o null si no existe
     */
    public async getJob(jobId: string): Promise<RenderJob | null> {
        this.ensureInitialized();

        const bullJob = await this.queue!.getJob(jobId);
        
        if (!bullJob) {
            return null;
        }

        return this.bullJobToRenderJob(bullJob);
    }

    /**
     * Obtiene el estado actual de un trabajo.
     * 
     * @param jobId - ID del trabajo
     * @returns Estado del trabajo
     */
    public async getStatus(jobId: string): Promise<RenderJobStatus | null> {
        this.ensureInitialized();

        const bullJob = await this.queue!.getJob(jobId);
        
        if (!bullJob) {
            return null;
        }

        const state = await bullJob.getState();
        return this.mapBullStateToStatus(state);
    }

    /**
     * Obtiene estadísticas de la cola de renderizado.
     * 
     * @returns Estadísticas actuales
     */
    public async getStats(): Promise<QueueStats> {
        this.ensureInitialized();

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.queue!.getWaitingCount(),
            this.queue!.getActiveCount(),
            this.queue!.getCompletedCount(),
            this.queue!.getFailedCount(),
            this.queue!.getDelayedCount()
        ]);

        const stats: QueueStats = {
            waiting,
            active,
            completed,
            failed,
            delayed
        };

        this.logger.debug('Estadísticas de cola obtenidas', {
            waiting: stats.waiting,
            active: stats.active,
            completed: stats.completed,
            failed: stats.failed,
            delayed: stats.delayed
        });

        return stats;
    }

    /**
     * Obtiene todos los trabajos pendientes ordenados por prioridad.
     * 
     * @param limit - Máximo de trabajos a retornar (default: 20)
     * @returns Lista de trabajos pendientes
     */
    public async getPendingJobs(limit: number = 20): Promise<RenderJob[]> {
        this.ensureInitialized();

        const bullJobs = await this.queue!.getJobs(['waiting', 'delayed'], 0, limit - 1);
        
        return Promise.all(bullJobs.map(job => this.bullJobToRenderJob(job)));
    }

    // ===== MÉTODOS DE SHUTDOWN =====

    /**
     * Realiza graceful shutdown de la cola.
     * No acepta nuevos jobs y espera que el job actual termine.
     */
    public async shutdown(): Promise<void> {
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown ya en progreso');
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('Iniciando graceful shutdown...');

        try {
            // Pausar el worker para no aceptar nuevos jobs
            if (this.worker) {
                await this.worker.pause();
                this.logger.info('Worker pausado, esperando jobs activos...');
                
                // Esperar a que termine el job actual con timeout
                await this.worker.close();
                this.logger.info('Worker cerrado correctamente');
            }

            // Cerrar eventos de cola
            if (this.queueEvents) {
                await this.queueEvents.close();
            }

            // Cerrar cola (no borra jobs pendientes)
            if (this.queue) {
                await this.queue.close();
            }

            // Cerrar conexión Redis
            if (this.connection) {
                await this.connection.quit();
            }

            this.isInitialized = false;
            this.logger.info('Graceful shutdown completado');

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Error durante shutdown', err);
            throw err;
        }
    }

    /**
     * Verifica si el manager está en proceso de shutdown.
     */
    public isInShutdown(): boolean {
        return this.isShuttingDown;
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Procesa un job de renderizado.
     */
    private async processJob(bullJob: Job): Promise<void> {
        const correlationId = Logger.generateCorrelationId();
        this.logger.setCorrelationId(correlationId);

        const renderJob = await this.bullJobToRenderJob(bullJob);

        this.logger.info(`Procesando job: ${renderJob.id}`, {
            type: renderJob.type,
            topic: renderJob.data.topic,
            attempt: bullJob.attemptsMade + 1,
            correlationId
        });

        if (!this.processor) {
            throw new Error('No hay procesador de jobs registrado');
        }

        try {
            await this.processor(renderJob);
            
            this.logger.info(`Job completado: ${renderJob.id}`, {
                type: renderJob.type,
                duration: Date.now() - renderJob.createdAt.getTime(),
                correlationId
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            
            this.logger.error(`Error procesando job: ${renderJob.id}`, err, {
                type: renderJob.type,
                attempt: bullJob.attemptsMade + 1,
                maxAttempts: this.config.maxRetries,
                correlationId
            });

            throw err; // Re-lanzar para que BullMQ maneje el reintento
        }
    }

    /**
     * Convierte un Job de BullMQ a RenderJob.
     */
    private async bullJobToRenderJob(bullJob: Job): Promise<RenderJob> {
        const state = await bullJob.getState();
        const status = this.mapBullStateToStatus(state);

        return {
            id: bullJob.id!,
            type: bullJob.data.type as VideoType,
            data: bullJob.data.data as RenderJobData,
            priority: bullJob.opts.priority ?? PRIORITY_LOW,
            status,
            createdAt: new Date(bullJob.data.createdAt || bullJob.timestamp),
            processedAt: bullJob.processedOn ? new Date(bullJob.processedOn) : undefined,
            completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
            attemptsMade: bullJob.attemptsMade,
            errorMessage: bullJob.failedReason
        };
    }

    /**
     * Mapea estado de BullMQ a RenderJobStatus.
     */
    private mapBullStateToStatus(state: string): RenderJobStatus {
        switch (state) {
            case 'waiting':
            case 'delayed':
            case 'prioritized':
                return 'pending';
            case 'active':
                return 'processing';
            case 'completed':
                return 'completed';
            case 'failed':
                return 'failed';
            default:
                return 'pending';
        }
    }

    /**
     * Configura listeners de eventos de la cola.
     */
    private setupEventListeners(): void {
        if (!this.queueEvents) return;

        this.queueEvents.on('completed', ({ jobId }) => {
            this.logger.debug(`Evento: Job ${jobId} completado`);
        });

        this.queueEvents.on('failed', ({ jobId, failedReason }) => {
            this.logger.warn(`Evento: Job ${jobId} falló`, {
                reason: failedReason
            });
        });

        this.queueEvents.on('stalled', ({ jobId }) => {
            this.logger.warn(`Evento: Job ${jobId} estancado (stalled)`);
        });
    }

    /**
     * Configura listeners del worker.
     */
    private setupWorkerListeners(): void {
        if (!this.worker) return;

        this.worker.on('completed', (job) => {
            this.logger.info(`Worker: Job ${job.id} completado exitosamente`);
        });

        this.worker.on('failed', (job, err) => {
            const isFinalFailure = job && job.attemptsMade >= this.config.maxRetries;
            
            if (isFinalFailure) {
                this.logger.error(`Worker: Job ${job?.id} falló definitivamente después de ${job?.attemptsMade} intentos`, err);
            } else {
                this.logger.warn(`Worker: Job ${job?.id} falló (intento ${job?.attemptsMade}/${this.config.maxRetries})`, {
                    error: err.message
                });
            }
        });

        this.worker.on('error', (err) => {
            this.logger.error('Worker: Error general', err);
        });
    }

    /**
     * Verifica que el manager esté inicializado.
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('RenderQueueManager no está inicializado. Llama a initialize() primero.');
        }
    }
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton del RenderQueueManager.
 * Usar para acceso global sin crear nuevas instancias.
 */
export const renderQueueManager = new RenderQueueManager();

// ===== EXPORTAR POR DEFECTO =====

export default RenderQueueManager;
