/**
 * DeadLetterQueue.ts
 * 
 * Sistema de Dead-Letter Queue para jobs de renderizado que fallaron múltiples veces.
 * Almacena jobs fallidos después de 3+ intentos para inspección manual y reintento.
 * 
 * REQ-6.2.1: Crear estado dead-letter para jobs que fallaron 3+ veces
 * REQ-6.2.2: Mover jobs fallidos a cola separada con detalles del error
 * REQ-6.2.3: Permitir reintento manual desde dashboard
 * REQ-6.2.4: Crear endpoint HTTP /queue/dead-letter para listar jobs fallidos
 * 
 * Características:
 * - Almacenamiento persistente de jobs fallidos en SQLite
 * - Detalles completos del error incluyendo stack trace
 * - Capacidad de reintento manual
 * - Purga automática de jobs antiguos
 * - Integración con Logger para trazabilidad
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger } from './Logger';
import { RenderJob, VideoType, ChannelKey } from './RenderQueueManager';

// ===== TIPOS E INTERFACES =====

/**
 * Estado de un job en la dead-letter queue.
 */
export type DeadLetterJobStatus = 'dead-letter' | 'reprocessing' | 'resolved';

/**
 * Información de fallo de un job.
 */
export interface FailureInfo {
    /** Mensaje de error principal */
    message: string;
    
    /** Stack trace completo si está disponible */
    stackTrace?: string;
    
    /** Número de intentos antes de fallar definitivamente */
    attemptsMade: number;
    
    /** Timestamp del último intento */
    lastAttemptAt: Date;
    
    /** Historial de errores de intentos anteriores */
    errorHistory?: string[];
}

/**
 * Job en la dead-letter queue con información extendida.
 */
export interface DeadLetterJob {
    /** ID único del job (mismo que en la cola original) */
    id: string;
    
    /** ID único en la dead-letter queue */
    deadLetterId: string;
    
    /** Tipo de video original */
    type: VideoType;
    
    /** Datos del job original */
    data: {
        topic: string;
        language: string;
        channelKey: ChannelKey;
    };
    
    /** Prioridad original */
    priority: number;
    
    /** Estado actual en dead-letter */
    status: DeadLetterJobStatus;
    
    /** Información detallada del fallo */
    failureInfo: FailureInfo;
    
    /** Fecha cuando entró a dead-letter */
    movedToDeadLetterAt: Date;
    
    /** Fecha de creación original */
    originalCreatedAt: Date;
    
    /** Número de reintentos desde dead-letter */
    reprocessAttempts: number;
    
    /** Fecha del último reintento (si aplica) */
    lastReprocessAt?: Date;
    
    /** Notas manuales del operador */
    notes?: string;
}

/**
 * Filtros para listar jobs en dead-letter.
 */
export interface DeadLetterFilters {
    /** Filtrar por estado */
    status?: DeadLetterJobStatus;
    
    /** Filtrar por tipo de video */
    type?: VideoType;
    
    /** Filtrar por canal */
    channelKey?: ChannelKey;
    
    /** Límite de resultados */
    limit?: number;
    
    /** Offset para paginación */
    offset?: number;
    
    /** Ordenar por fecha (ascendente o descendente) */
    orderBy?: 'asc' | 'desc';
}

/**
 * Estadísticas de la dead-letter queue.
 */
export interface DeadLetterStats {
    /** Total de jobs en dead-letter */
    total: number;
    
    /** Jobs pendientes de revisión */
    pending: number;
    
    /** Jobs en proceso de reintento */
    reprocessing: number;
    
    /** Jobs resueltos */
    resolved: number;
    
    /** Jobs más antiguo (días) */
    oldestJobDays: number;
    
    /** Promedio de intentos antes de dead-letter */
    avgAttemptsMade: number;
}

/**
 * Resultado de una operación de reintento.
 */
export interface ReprocessResult {
    /** Si el reintento fue exitoso */
    success: boolean;
    
    /** ID del nuevo job en la cola principal (si exitoso) */
    newJobId?: string;
    
    /** Mensaje de resultado */
    message: string;
}

/**
 * Configuración de la dead-letter queue.
 */
export interface DeadLetterQueueConfig {
    /** Ruta al archivo de base de datos SQLite */
    databasePath: string;
    
    /** Días máximos para mantener jobs en dead-letter antes de purga */
    maxAgeDays: number;
    
    /** Máximo de reintentos permitidos desde dead-letter */
    maxReprocessAttempts: number;
    
    /** Notificar por callback cuando un job entra a dead-letter */
    onJobDeadLettered?: (job: DeadLetterJob) => Promise<void>;
}

// ===== CONSTANTES =====

/** Configuración por defecto */
const DEFAULT_CONFIG: DeadLetterQueueConfig = {
    databasePath: 'data/dead-letter-queue.db',
    maxAgeDays: 30,
    maxReprocessAttempts: 3
};

/** Umbral de fallos para mover a dead-letter */
export const DEAD_LETTER_THRESHOLD = 3;

// ===== CLASE PRINCIPAL =====

/**
 * DeadLetterQueue - Sistema de gestión de jobs fallidos.
 * 
 * Implementa una cola de dead-letter para jobs que fallaron 3+ veces,
 * permitiendo inspección manual, reintentos y purga de jobs antiguos.
 * 
 * Uso básico:
 * ```typescript
 * const dlq = new DeadLetterQueue();
 * await dlq.initialize();
 * 
 * // Mover job fallido a dead-letter
 * await dlq.moveToDeadLetter(failedJob, 'Timeout processing video');
 * 
 * // Listar jobs en dead-letter
 * const jobs = await dlq.getDeadLetterJobs({ status: 'dead-letter' });
 * 
 * // Reintentar job
 * const result = await dlq.reprocessJob('job-123');
 * 
 * // Purgar jobs antiguos
 * const purged = await dlq.purgeOld(30);
 * ```
 */
export class DeadLetterQueue {
    /** Configuración activa */
    private readonly config: DeadLetterQueueConfig;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Conexión a SQLite */
    private db: sqlite3.Database | null = null;
    
    /** Flag de inicialización */
    private isInitialized: boolean = false;
    
    /** Callback para reencolar jobs (inyectado externamente) */
    private reenqueueCallback?: (job: DeadLetterJob) => Promise<string>;

    /**
     * Crea una nueva instancia de DeadLetterQueue.
     * 
     * @param config - Configuración parcial (se mezcla con defaults)
     */
    constructor(config?: Partial<DeadLetterQueueConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger('DeadLetterQueue');
    }

    // ===== MÉTODOS DE INICIALIZACIÓN =====

    /**
     * Inicializa la base de datos SQLite y crea las tablas necesarias.
     * Debe llamarse antes de usar cualquier otro método.
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('DeadLetterQueue ya está inicializada');
            return;
        }

        try {
            // Asegurar que el directorio existe
            const dbDir = path.dirname(path.resolve(process.cwd(), this.config.databasePath));
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Conectar a SQLite
            const dbPath = path.resolve(process.cwd(), this.config.databasePath);
            
            await new Promise<void>((resolve, reject) => {
                this.db = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // Crear tablas
            await this.createTables();
            
            this.isInitialized = true;
            
            this.logger.info('DeadLetterQueue inicializada correctamente', {
                databasePath: this.config.databasePath,
                maxAgeDays: this.config.maxAgeDays
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Error inicializando DeadLetterQueue', err);
            throw err;
        }
    }

    /**
     * Registra un callback para reencolar jobs al reintentar.
     * Este callback debe ser provisto por RenderQueueManager.
     * 
     * @param callback - Función que encola el job y retorna el nuevo ID
     */
    public setReenqueueCallback(callback: (job: DeadLetterJob) => Promise<string>): void {
        this.reenqueueCallback = callback;
        this.logger.debug('Callback de reencolado registrado');
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Mueve un job fallido a la dead-letter queue.
     * 
     * REQ-6.2.1: Crear estado dead-letter para jobs que fallaron 3+ veces
     * REQ-6.2.2: Mover jobs fallidos a cola separada con detalles del error
     * 
     * @param job - Job que falló
     * @param failureReason - Razón del fallo
     * @param errorHistory - Historial de errores de intentos anteriores
     * @returns Job en dead-letter con información completa
     */
    public async moveToDeadLetter(
        job: RenderJob,
        failureReason: string,
        errorHistory?: string[]
    ): Promise<DeadLetterJob> {
        this.ensureInitialized();

        const deadLetterId = this.generateDeadLetterId();
        const now = new Date();

        const failureInfo: FailureInfo = {
            message: failureReason,
            stackTrace: this.extractStackTrace(failureReason),
            attemptsMade: job.attemptsMade,
            lastAttemptAt: job.completedAt || now,
            errorHistory: errorHistory || []
        };

        const deadLetterJob: DeadLetterJob = {
            id: job.id,
            deadLetterId,
            type: job.type,
            data: job.data,
            priority: job.priority,
            status: 'dead-letter',
            failureInfo,
            movedToDeadLetterAt: now,
            originalCreatedAt: job.createdAt,
            reprocessAttempts: 0
        };

        // Insertar en SQLite
        await this.runQuery(
            `INSERT INTO dead_letter_jobs (
                dead_letter_id, original_job_id, type, topic, language, channel_key,
                priority, status, failure_message, failure_stack_trace, attempts_made,
                last_attempt_at, error_history, moved_to_dead_letter_at, original_created_at,
                reprocess_attempts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                deadLetterId,
                job.id,
                job.type,
                job.data.topic,
                job.data.language,
                job.data.channelKey,
                job.priority,
                'dead-letter',
                failureInfo.message,
                failureInfo.stackTrace || null,
                failureInfo.attemptsMade,
                failureInfo.lastAttemptAt.toISOString(),
                JSON.stringify(failureInfo.errorHistory || []),
                now.toISOString(),
                job.createdAt.toISOString(),
                0
            ]
        );

        this.logger.warn(`Job movido a dead-letter: ${job.id}`, {
            deadLetterId,
            type: job.type,
            topic: job.data.topic,
            attemptsMade: failureInfo.attemptsMade,
            failureReason: failureInfo.message.substring(0, 200)
        });

        // Notificar si hay callback configurado
        if (this.config.onJobDeadLettered) {
            try {
                await this.config.onJobDeadLettered(deadLetterJob);
            } catch (err) {
                this.logger.error('Error en callback onJobDeadLettered', 
                    err instanceof Error ? err : new Error(String(err)));
            }
        }

        return deadLetterJob;
    }

    /**
     * Obtiene la lista de jobs en la dead-letter queue.
     * 
     * @param filters - Filtros opcionales para la búsqueda
     * @returns Lista de jobs en dead-letter
     */
    public async getDeadLetterJobs(filters?: DeadLetterFilters): Promise<DeadLetterJob[]> {
        this.ensureInitialized();

        const conditions: string[] = [];
        const params: unknown[] = [];

        if (filters?.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }

        if (filters?.type) {
            conditions.push('type = ?');
            params.push(filters.type);
        }

        if (filters?.channelKey) {
            conditions.push('channel_key = ?');
            params.push(filters.channelKey);
        }

        const whereClause = conditions.length > 0 
            ? `WHERE ${conditions.join(' AND ')}` 
            : '';

        const orderBy = filters?.orderBy === 'asc' ? 'ASC' : 'DESC';
        const limit = filters?.limit || 100;
        const offset = filters?.offset || 0;

        const query = `
            SELECT * FROM dead_letter_jobs
            ${whereClause}
            ORDER BY moved_to_dead_letter_at ${orderBy}
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const rows = await this.allQuery(query, params) as DeadLetterRow[];

        return rows.map(row => this.rowToDeadLetterJob(row));
    }

    /**
     * Obtiene un job específico de la dead-letter queue por su ID.
     * 
     * @param jobId - ID original del job o deadLetterId
     * @returns Job en dead-letter o null si no existe
     */
    public async getDeadLetterJob(jobId: string): Promise<DeadLetterJob | null> {
        this.ensureInitialized();

        const row = await this.getQuery(
            `SELECT * FROM dead_letter_jobs 
             WHERE original_job_id = ? OR dead_letter_id = ?`,
            [jobId, jobId]
        ) as DeadLetterRow | undefined;

        if (!row) {
            return null;
        }

        return this.rowToDeadLetterJob(row);
    }

    /**
     * Reintenta procesar un job desde la dead-letter queue.
     * 
     * REQ-6.2.3: Permitir reintento manual desde dashboard
     * 
     * @param jobId - ID del job a reintentar (original o deadLetterId)
     * @returns Resultado del reintento
     */
    public async reprocessJob(jobId: string): Promise<ReprocessResult> {
        this.ensureInitialized();

        // Obtener el job
        const job = await this.getDeadLetterJob(jobId);

        if (!job) {
            return {
                success: false,
                message: `Job no encontrado: ${jobId}`
            };
        }

        // Verificar que no exceda máximo de reintentos
        if (job.reprocessAttempts >= this.config.maxReprocessAttempts) {
            return {
                success: false,
                message: `Job ${jobId} excede máximo de reintentos desde dead-letter (${this.config.maxReprocessAttempts})`
            };
        }

        // Verificar que esté en estado válido para reintento
        if (job.status !== 'dead-letter') {
            return {
                success: false,
                message: `Job ${jobId} no está en estado 'dead-letter' (estado actual: ${job.status})`
            };
        }

        // Verificar que hay callback de reencolado
        if (!this.reenqueueCallback) {
            return {
                success: false,
                message: 'No hay callback de reencolado configurado. Llama a setReenqueueCallback primero.'
            };
        }

        try {
            // Actualizar estado a reprocessing
            const now = new Date();
            await this.runQuery(
                `UPDATE dead_letter_jobs 
                 SET status = 'reprocessing', 
                     reprocess_attempts = reprocess_attempts + 1,
                     last_reprocess_at = ?
                 WHERE dead_letter_id = ?`,
                [now.toISOString(), job.deadLetterId]
            );

            // Reencolar el job
            const newJobId = await this.reenqueueCallback(job);

            this.logger.info(`Job reencolado desde dead-letter: ${job.id} -> ${newJobId}`, {
                deadLetterId: job.deadLetterId,
                reprocessAttempts: job.reprocessAttempts + 1,
                type: job.type
            });

            return {
                success: true,
                newJobId,
                message: `Job ${jobId} reencolado exitosamente como ${newJobId}`
            };

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            
            // Revertir estado si falla el reencolado
            await this.runQuery(
                `UPDATE dead_letter_jobs 
                 SET status = 'dead-letter'
                 WHERE dead_letter_id = ?`,
                [job.deadLetterId]
            );

            this.logger.error(`Error reencolando job ${jobId}`, err);

            return {
                success: false,
                message: `Error reencolando job: ${err.message}`
            };
        }
    }

    /**
     * Marca un job como resuelto (ya no necesita reintento).
     * 
     * @param jobId - ID del job a marcar como resuelto
     * @param notes - Notas opcionales del operador
     * @returns true si se actualizó, false si no existe
     */
    public async markAsResolved(jobId: string, notes?: string): Promise<boolean> {
        this.ensureInitialized();

        const result = await this.runQuery(
            `UPDATE dead_letter_jobs 
             SET status = 'resolved', notes = ?
             WHERE (original_job_id = ? OR dead_letter_id = ?) 
               AND status != 'resolved'`,
            [notes || null, jobId, jobId]
        );

        if (result.changes > 0) {
            this.logger.info(`Job marcado como resuelto: ${jobId}`, { notes });
            return true;
        }

        return false;
    }

    /**
     * Añade notas a un job en dead-letter.
     * 
     * @param jobId - ID del job
     * @param notes - Notas del operador
     * @returns true si se actualizó, false si no existe
     */
    public async addNotes(jobId: string, notes: string): Promise<boolean> {
        this.ensureInitialized();

        const result = await this.runQuery(
            `UPDATE dead_letter_jobs 
             SET notes = ?
             WHERE original_job_id = ? OR dead_letter_id = ?`,
            [notes, jobId, jobId]
        );

        return result.changes > 0;
    }

    /**
     * Purga jobs antiguos de la dead-letter queue.
     * 
     * @param daysOld - Días de antigüedad mínima para purgar (default: config.maxAgeDays)
     * @returns Número de jobs eliminados
     */
    public async purgeOld(daysOld?: number): Promise<number> {
        this.ensureInitialized();

        const maxDays = daysOld ?? this.config.maxAgeDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxDays);

        const result = await this.runQuery(
            `DELETE FROM dead_letter_jobs 
             WHERE moved_to_dead_letter_at < ?`,
            [cutoffDate.toISOString()]
        );

        if (result.changes > 0) {
            this.logger.info(`Purgados ${result.changes} jobs antiguos de dead-letter`, {
                daysOld: maxDays,
                cutoffDate: cutoffDate.toISOString()
            });
        }

        return result.changes;
    }

    /**
     * Obtiene estadísticas de la dead-letter queue.
     * 
     * @returns Estadísticas actuales
     */
    public async getStats(): Promise<DeadLetterStats> {
        this.ensureInitialized();

        const totalRow = await this.getQuery('SELECT COUNT(*) as count FROM dead_letter_jobs') as { count: number };
        const pendingRow = await this.getQuery("SELECT COUNT(*) as count FROM dead_letter_jobs WHERE status = 'dead-letter'") as { count: number };
        const reprocessingRow = await this.getQuery("SELECT COUNT(*) as count FROM dead_letter_jobs WHERE status = 'reprocessing'") as { count: number };
        const resolvedRow = await this.getQuery("SELECT COUNT(*) as count FROM dead_letter_jobs WHERE status = 'resolved'") as { count: number };
        
        const oldestRow = await this.getQuery(
            `SELECT MIN(moved_to_dead_letter_at) as oldest 
             FROM dead_letter_jobs 
             WHERE status = 'dead-letter'`
        ) as { oldest: string | null };
        
        const avgRow = await this.getQuery('SELECT AVG(attempts_made) as avg FROM dead_letter_jobs') as { avg: number | null };

        let oldestJobDays = 0;
        if (oldestRow.oldest) {
            const oldestDate = new Date(oldestRow.oldest);
            const now = new Date();
            oldestJobDays = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
            total: totalRow.count,
            pending: pendingRow.count,
            reprocessing: reprocessingRow.count,
            resolved: resolvedRow.count,
            oldestJobDays,
            avgAttemptsMade: avgRow.avg || 0
        };
    }

    /**
     * Cierra la conexión a la base de datos.
     */
    public async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.db = null;
                        this.isInitialized = false;
                        this.logger.info('DeadLetterQueue cerrada');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Crea las tablas necesarias en SQLite.
     */
    private async createTables(): Promise<void> {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS dead_letter_jobs (
                dead_letter_id TEXT PRIMARY KEY,
                original_job_id TEXT NOT NULL,
                type TEXT NOT NULL,
                topic TEXT NOT NULL,
                language TEXT NOT NULL,
                channel_key TEXT NOT NULL,
                priority INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'dead-letter',
                failure_message TEXT NOT NULL,
                failure_stack_trace TEXT,
                attempts_made INTEGER NOT NULL,
                last_attempt_at TEXT NOT NULL,
                error_history TEXT DEFAULT '[]',
                moved_to_dead_letter_at TEXT NOT NULL,
                original_created_at TEXT NOT NULL,
                reprocess_attempts INTEGER NOT NULL DEFAULT 0,
                last_reprocess_at TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.runQuery(createTableSQL);
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_dlj_status ON dead_letter_jobs(status)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_dlj_type ON dead_letter_jobs(type)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_dlj_channel ON dead_letter_jobs(channel_key)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_dlj_moved_at ON dead_letter_jobs(moved_to_dead_letter_at)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_dlj_original_id ON dead_letter_jobs(original_job_id)');
    }

    /**
     * Ejecuta una query que modifica datos (INSERT, UPDATE, DELETE).
     */
    private runQuery(sql: string, params: unknown[] = []): Promise<{ changes: number; lastID: number }> {
        return new Promise((resolve, reject) => {
            this.db!.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes, lastID: this.lastID });
                }
            });
        });
    }

    /**
     * Ejecuta una query que obtiene un solo registro.
     */
    private getQuery(sql: string, params: unknown[] = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.db!.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Ejecuta una query que obtiene múltiples registros.
     */
    private allQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.db!.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Genera un ID único para la dead-letter queue.
     */
    private generateDeadLetterId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `dlq-${timestamp}-${random}`;
    }

    /**
     * Extrae el stack trace de un mensaje de error si está disponible.
     */
    private extractStackTrace(errorMessage: string): string | undefined {
        // Buscar patrones comunes de stack trace
        const stackMatch = errorMessage.match(/at\s+.+\(.+:\d+:\d+\)/m);
        if (stackMatch) {
            const stackIndex = errorMessage.indexOf(stackMatch[0]);
            return errorMessage.substring(stackIndex);
        }
        return undefined;
    }

    /**
     * Convierte una fila de SQLite a DeadLetterJob.
     */
    private rowToDeadLetterJob(row: DeadLetterRow): DeadLetterJob {
        return {
            id: row.original_job_id,
            deadLetterId: row.dead_letter_id,
            type: row.type as VideoType,
            data: {
                topic: row.topic,
                language: row.language,
                channelKey: row.channel_key as ChannelKey
            },
            priority: row.priority,
            status: row.status as DeadLetterJobStatus,
            failureInfo: {
                message: row.failure_message,
                stackTrace: row.failure_stack_trace || undefined,
                attemptsMade: row.attempts_made,
                lastAttemptAt: new Date(row.last_attempt_at),
                errorHistory: JSON.parse(row.error_history || '[]')
            },
            movedToDeadLetterAt: new Date(row.moved_to_dead_letter_at),
            originalCreatedAt: new Date(row.original_created_at),
            reprocessAttempts: row.reprocess_attempts,
            lastReprocessAt: row.last_reprocess_at ? new Date(row.last_reprocess_at) : undefined,
            notes: row.notes || undefined
        };
    }

    /**
     * Verifica que la cola esté inicializada.
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('DeadLetterQueue no está inicializada. Llama a initialize() primero.');
        }
    }
}

// ===== TIPOS INTERNOS =====

/**
 * Fila de SQLite para dead_letter_jobs.
 */
interface DeadLetterRow {
    dead_letter_id: string;
    original_job_id: string;
    type: string;
    topic: string;
    language: string;
    channel_key: string;
    priority: number;
    status: string;
    failure_message: string;
    failure_stack_trace: string | null;
    attempts_made: number;
    last_attempt_at: string;
    error_history: string;
    moved_to_dead_letter_at: string;
    original_created_at: string;
    reprocess_attempts: number;
    last_reprocess_at: string | null;
    notes: string | null;
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton de DeadLetterQueue.
 * Usar para acceso global sin crear nuevas instancias.
 */
export const deadLetterQueue = new DeadLetterQueue();

// ===== EXPORTAR POR DEFECTO =====

export default DeadLetterQueue;
