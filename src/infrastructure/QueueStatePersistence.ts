/**
 * QueueStatePersistence.ts
 * 
 * Sistema de persistencia del estado de la cola de renderizado en SQLite.
 * Permite guardar y recuperar el estado de jobs después de reinicios del proceso.
 * 
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 * 
 * Características:
 * - Almacenamiento persistente del estado de jobs en SQLite
 * - Registro de estados: pending, processing, completed, failed
 * - Recuperación del estado tras reinicio del proceso
 * - Histórico de transiciones de estado para auditoría
 * - Integración con RenderQueueManager y DeadLetterQueue
 * - Limpieza automática de registros antiguos
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger } from './Logger';
import { RenderJob, RenderJobStatus, VideoType, ChannelKey } from './RenderQueueManager';

// ===== TIPOS E INTERFACES =====

/**
 * Estado persistido de un job en la cola.
 */
export interface PersistedJobState {
    /** ID único del job */
    jobId: string;
    
    /** Tipo de video (short/long) */
    type: VideoType;
    
    /** Tema o título del video */
    topic: string;
    
    /** Idioma del contenido */
    language: string;
    
    /** Canal de destino */
    channelKey: ChannelKey;
    
    /** Prioridad del job */
    priority: number;
    
    /** Estado actual */
    status: RenderJobStatus;
    
    /** Estado anterior (para auditoría) */
    previousStatus?: RenderJobStatus;
    
    /** Número de intentos realizados */
    attemptsMade: number;
    
    /** Mensaje de error si falló */
    errorMessage?: string;
    
    /** Timestamp de creación del job */
    createdAt: Date;
    
    /** Timestamp de última actualización */
    updatedAt: Date;
    
    /** Timestamp cuando empezó a procesarse */
    processingStartedAt?: Date;
    
    /** Timestamp cuando completó o falló */
    completedAt?: Date;
    
    /** Metadata adicional en JSON */
    metadata?: Record<string, unknown>;
}

/**
 * Transición de estado para auditoría.
 */
export interface StateTransition {
    /** ID de la transición */
    id: number;
    
    /** ID del job */
    jobId: string;
    
    /** Estado anterior */
    fromStatus: RenderJobStatus | null;
    
    /** Estado nuevo */
    toStatus: RenderJobStatus;
    
    /** Razón del cambio (opcional) */
    reason?: string;
    
    /** Timestamp de la transición */
    timestamp: Date;
}

/**
 * Filtros para consultar jobs persistidos.
 */
export interface PersistedJobFilters {
    /** Filtrar por estado */
    status?: RenderJobStatus;
    
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
    
    /** Campo por el cual ordenar */
    orderField?: 'createdAt' | 'updatedAt' | 'priority';
}

/**
 * Estadísticas del estado de la cola persistido.
 */
export interface PersistedQueueStats {
    /** Total de jobs en cualquier estado */
    total: number;
    
    /** Jobs pendientes */
    pending: number;
    
    /** Jobs en proceso */
    processing: number;
    
    /** Jobs completados */
    completed: number;
    
    /** Jobs fallidos */
    failed: number;
    
    /** Jobs por tipo */
    byType: {
        short: number;
        long: number;
    };
    
    /** Jobs por canal */
    byChannel: {
        channel1: number;
        channel2: number;
    };
    
    /** Promedio de intentos antes de éxito/fallo */
    avgAttempts: number;
    
    /** Timestamp de la estadística */
    timestamp: Date;
}

/**
 * Jobs recuperables después de un reinicio.
 */
export interface RecoverableJobs {
    /** Jobs que estaban pendientes */
    pending: PersistedJobState[];
    
    /** Jobs que estaban en proceso (deben reprocesarse) */
    processing: PersistedJobState[];
    
    /** Total de jobs recuperables */
    total: number;
}

/**
 * Configuración del sistema de persistencia.
 */
export interface QueueStatePersistenceConfig {
    /** Ruta al archivo de base de datos SQLite */
    databasePath: string;
    
    /** Días máximos para mantener jobs completados/fallidos */
    completedJobsRetentionDays: number;
    
    /** Días máximos para mantener historial de transiciones */
    transitionHistoryRetentionDays: number;
    
    /** Intervalo de limpieza automática en horas */
    cleanupIntervalHours: number;
}

// ===== CONSTANTES =====

/** Configuración por defecto */
const DEFAULT_CONFIG: QueueStatePersistenceConfig = {
    databasePath: 'data/queue-state.db',
    completedJobsRetentionDays: 7,
    transitionHistoryRetentionDays: 30,
    cleanupIntervalHours: 24
};

// ===== CLASE PRINCIPAL =====

/**
 * QueueStatePersistence - Sistema de persistencia del estado de cola.
 * 
 * Proporciona almacenamiento persistente del estado de jobs de renderizado
 * para recuperación después de reinicios del proceso.
 * 
 * Uso básico:
 * ```typescript
 * const persistence = new QueueStatePersistence();
 * await persistence.initialize();
 * 
 * // Guardar estado de un job
 * await persistence.saveJobState({
 *     jobId: 'render-short-123',
 *     type: 'short',
 *     topic: 'IA y Autismo',
 *     language: 'es',
 *     channelKey: 'channel1',
 *     priority: 1,
 *     status: 'pending',
 *     attemptsMade: 0,
 *     createdAt: new Date(),
 *     updatedAt: new Date()
 * });
 * 
 * // Actualizar estado
 * await persistence.updateJobStatus('render-short-123', 'processing');
 * 
 * // Recuperar jobs después de reinicio
 * const recoverable = await persistence.getRecoverableJobs();
 * ```
 */
export class QueueStatePersistence {
    /** Configuración activa */
    private readonly config: QueueStatePersistenceConfig;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Conexión a SQLite */
    private db: sqlite3.Database | null = null;
    
    /** Flag de inicialización */
    private isInitialized: boolean = false;
    
    /** Timer de limpieza automática */
    private cleanupTimer: NodeJS.Timeout | null = null;

    /**
     * Crea una nueva instancia de QueueStatePersistence.
     * 
     * @param config - Configuración parcial (se mezcla con defaults)
     */
    constructor(config?: Partial<QueueStatePersistenceConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger('QueueStatePersistence');
    }

    // ===== MÉTODOS DE INICIALIZACIÓN =====

    /**
     * Inicializa la base de datos SQLite y crea las tablas necesarias.
     * Debe llamarse antes de usar cualquier otro método.
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('QueueStatePersistence ya está inicializada');
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
            
            // Iniciar limpieza automática
            this.startAutoCleanup();
            
            this.isInitialized = true;
            
            this.logger.info('QueueStatePersistence inicializada correctamente', {
                databasePath: this.config.databasePath,
                completedJobsRetentionDays: this.config.completedJobsRetentionDays
            });

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Error inicializando QueueStatePersistence', err);
            throw err;
        }
    }

    // ===== MÉTODOS PÚBLICOS DE PERSISTENCIA =====

    /**
     * Guarda el estado de un job en la base de datos.
     * Si el job ya existe, actualiza su estado.
     * 
     * @param jobState - Estado del job a guardar
     */
    public async saveJobState(jobState: PersistedJobState): Promise<void> {
        this.ensureInitialized();

        const existing = await this.getJobState(jobState.jobId);
        
        if (existing) {
            // Actualizar job existente
            await this.updateJobState(jobState);
        } else {
            // Insertar nuevo job
            await this.insertJobState(jobState);
        }
    }

    /**
     * Obtiene el estado de un job por su ID.
     * 
     * @param jobId - ID del job
     * @returns Estado del job o null si no existe
     */
    public async getJobState(jobId: string): Promise<PersistedJobState | null> {
        this.ensureInitialized();

        const row = await this.getQuery(
            'SELECT * FROM queue_state WHERE job_id = ?',
            [jobId]
        ) as QueueStateRow | undefined;

        if (!row) {
            return null;
        }

        return this.rowToPersistedJobState(row);
    }

    /**
     * Actualiza el estado de un job existente.
     * Registra la transición de estado para auditoría.
     * 
     * @param jobId - ID del job
     * @param newStatus - Nuevo estado
     * @param reason - Razón del cambio (opcional)
     * @param errorMessage - Mensaje de error si el estado es 'failed'
     * @returns true si se actualizó, false si no existe
     */
    public async updateJobStatus(
        jobId: string,
        newStatus: RenderJobStatus,
        reason?: string,
        errorMessage?: string
    ): Promise<boolean> {
        this.ensureInitialized();

        const existing = await this.getJobState(jobId);
        
        if (!existing) {
            return false;
        }

        const now = new Date();
        const previousStatus = existing.status;

        // Preparar campos adicionales según el nuevo estado
        let processingStartedAt = existing.processingStartedAt;
        let completedAt = existing.completedAt;
        let attemptsMade = existing.attemptsMade;

        if (newStatus === 'processing' && previousStatus !== 'processing') {
            processingStartedAt = now;
            attemptsMade = existing.attemptsMade + 1;
        }

        if (newStatus === 'completed' || newStatus === 'failed') {
            completedAt = now;
        }

        // Actualizar el job
        await this.runQuery(
            `UPDATE queue_state SET
                status = ?,
                previous_status = ?,
                attempts_made = ?,
                error_message = ?,
                processing_started_at = ?,
                completed_at = ?,
                updated_at = ?
            WHERE job_id = ?`,
            [
                newStatus,
                previousStatus,
                attemptsMade,
                newStatus === 'failed' ? errorMessage || null : existing.errorMessage,
                processingStartedAt?.toISOString() || null,
                completedAt?.toISOString() || null,
                now.toISOString(),
                jobId
            ]
        );

        // Registrar transición de estado
        await this.recordStateTransition(jobId, previousStatus, newStatus, reason);

        this.logger.debug(`Estado de job actualizado: ${jobId}`, {
            previousStatus,
            newStatus,
            attemptsMade
        });

        return true;
    }

    /**
     * Obtiene jobs filtrados por criterios.
     * 
     * @param filters - Filtros opcionales
     * @returns Lista de jobs
     */
    public async getJobs(filters?: PersistedJobFilters): Promise<PersistedJobState[]> {
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

        const orderField = filters?.orderField || 'createdAt';
        const orderFieldMap: Record<string, string> = {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            priority: 'priority'
        };
        const orderBy = filters?.orderBy === 'asc' ? 'ASC' : 'DESC';
        const limit = filters?.limit || 100;
        const offset = filters?.offset || 0;

        const query = `
            SELECT * FROM queue_state
            ${whereClause}
            ORDER BY ${orderFieldMap[orderField] || 'created_at'} ${orderBy}
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const rows = await this.allQuery(query, params) as QueueStateRow[];

        return rows.map(row => this.rowToPersistedJobState(row));
    }

    /**
     * Obtiene jobs que pueden ser recuperados después de un reinicio.
     * Incluye jobs pendientes y jobs que estaban en proceso.
     * 
     * @returns Jobs recuperables agrupados por estado
     */
    public async getRecoverableJobs(): Promise<RecoverableJobs> {
        this.ensureInitialized();

        const pendingRows = await this.allQuery(
            `SELECT * FROM queue_state 
             WHERE status = 'pending' 
             ORDER BY priority ASC, created_at ASC`
        ) as QueueStateRow[];

        const processingRows = await this.allQuery(
            `SELECT * FROM queue_state 
             WHERE status = 'processing' 
             ORDER BY priority ASC, created_at ASC`
        ) as QueueStateRow[];

        const pending = pendingRows.map(row => this.rowToPersistedJobState(row));
        const processing = processingRows.map(row => this.rowToPersistedJobState(row));

        this.logger.info('Jobs recuperables obtenidos', {
            pending: pending.length,
            processing: processing.length
        });

        return {
            pending,
            processing,
            total: pending.length + processing.length
        };
    }

    /**
     * Marca jobs en estado 'processing' como 'pending' para recuperación.
     * Útil después de un reinicio inesperado del proceso.
     * 
     * @returns Número de jobs marcados para reprocesar
     */
    public async markProcessingJobsForRecovery(): Promise<number> {
        this.ensureInitialized();

        const now = new Date();

        // Obtener jobs en processing
        const processingJobs = await this.getJobs({ status: 'processing' });

        // Marcar cada uno como pending y registrar transición
        for (const job of processingJobs) {
            await this.updateJobStatus(
                job.jobId,
                'pending',
                'Recuperación automática después de reinicio del proceso'
            );
        }

        if (processingJobs.length > 0) {
            this.logger.warn(`${processingJobs.length} jobs marcados para reprocesamiento después de reinicio`);
        }

        return processingJobs.length;
    }

    /**
     * Obtiene estadísticas del estado de la cola persistido.
     * 
     * @returns Estadísticas actuales
     */
    public async getStats(): Promise<PersistedQueueStats> {
        this.ensureInitialized();

        const totalRow = await this.getQuery(
            'SELECT COUNT(*) as count FROM queue_state'
        ) as { count: number };

        const pendingRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE status = 'pending'"
        ) as { count: number };

        const processingRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE status = 'processing'"
        ) as { count: number };

        const completedRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE status = 'completed'"
        ) as { count: number };

        const failedRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE status = 'failed'"
        ) as { count: number };

        const shortRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE type = 'short'"
        ) as { count: number };

        const longRow = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE type = 'long'"
        ) as { count: number };

        const channel1Row = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE channel_key = 'channel1'"
        ) as { count: number };

        const channel2Row = await this.getQuery(
            "SELECT COUNT(*) as count FROM queue_state WHERE channel_key = 'channel2'"
        ) as { count: number };

        const avgAttemptsRow = await this.getQuery(
            "SELECT AVG(attempts_made) as avg FROM queue_state WHERE status IN ('completed', 'failed')"
        ) as { avg: number | null };

        return {
            total: totalRow.count,
            pending: pendingRow.count,
            processing: processingRow.count,
            completed: completedRow.count,
            failed: failedRow.count,
            byType: {
                short: shortRow.count,
                long: longRow.count
            },
            byChannel: {
                channel1: channel1Row.count,
                channel2: channel2Row.count
            },
            avgAttempts: avgAttemptsRow.avg || 0,
            timestamp: new Date()
        };
    }

    /**
     * Obtiene el historial de transiciones de estado de un job.
     * 
     * @param jobId - ID del job
     * @param limit - Límite de transiciones a retornar
     * @returns Lista de transiciones
     */
    public async getStateTransitions(jobId: string, limit: number = 50): Promise<StateTransition[]> {
        this.ensureInitialized();

        const rows = await this.allQuery(
            `SELECT * FROM state_transitions 
             WHERE job_id = ? 
             ORDER BY timestamp DESC 
             LIMIT ?`,
            [jobId, limit]
        ) as StateTransitionRow[];

        return rows.map(row => ({
            id: row.id,
            jobId: row.job_id,
            fromStatus: row.from_status as RenderJobStatus | null,
            toStatus: row.to_status as RenderJobStatus,
            reason: row.reason || undefined,
            timestamp: new Date(row.timestamp)
        }));
    }

    /**
     * Elimina un job del estado persistido.
     * 
     * @param jobId - ID del job a eliminar
     * @returns true si se eliminó, false si no existía
     */
    public async deleteJob(jobId: string): Promise<boolean> {
        this.ensureInitialized();

        // Primero eliminar transiciones relacionadas
        await this.runQuery(
            'DELETE FROM state_transitions WHERE job_id = ?',
            [jobId]
        );

        // Luego eliminar el job
        const result = await this.runQuery(
            'DELETE FROM queue_state WHERE job_id = ?',
            [jobId]
        );

        if (result.changes > 0) {
            this.logger.debug(`Job eliminado del estado persistido: ${jobId}`);
        }

        return result.changes > 0;
    }

    /**
     * Limpia jobs completados/fallidos antiguos y transiciones antiguas.
     * 
     * @returns Número de registros eliminados
     */
    public async cleanup(): Promise<{ jobsDeleted: number; transitionsDeleted: number }> {
        this.ensureInitialized();

        const jobsCutoff = new Date();
        jobsCutoff.setDate(jobsCutoff.getDate() - this.config.completedJobsRetentionDays);

        const transitionsCutoff = new Date();
        transitionsCutoff.setDate(transitionsCutoff.getDate() - this.config.transitionHistoryRetentionDays);

        // Eliminar jobs completados/fallidos antiguos
        const jobsResult = await this.runQuery(
            `DELETE FROM queue_state 
             WHERE status IN ('completed', 'failed') 
             AND updated_at < ?`,
            [jobsCutoff.toISOString()]
        );

        // Eliminar transiciones huérfanas o antiguas
        const transitionsResult = await this.runQuery(
            `DELETE FROM state_transitions 
             WHERE timestamp < ? 
             OR job_id NOT IN (SELECT job_id FROM queue_state)`,
            [transitionsCutoff.toISOString()]
        );

        if (jobsResult.changes > 0 || transitionsResult.changes > 0) {
            this.logger.info('Limpieza de estado persistido completada', {
                jobsDeleted: jobsResult.changes,
                transitionsDeleted: transitionsResult.changes
            });
        }

        return {
            jobsDeleted: jobsResult.changes,
            transitionsDeleted: transitionsResult.changes
        };
    }

    /**
     * Cierra la conexión a la base de datos y detiene la limpieza automática.
     */
    public async close(): Promise<void> {
        // Detener limpieza automática
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.db = null;
                        this.isInitialized = false;
                        this.logger.info('QueueStatePersistence cerrada');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // ===== MÉTODOS DE CONVERSIÓN DESDE/HACIA RenderJob =====

    /**
     * Convierte un RenderJob a PersistedJobState para persistencia.
     * 
     * @param job - Job de renderizado
     * @returns Estado persistible
     */
    public renderJobToPersistedState(job: RenderJob): PersistedJobState {
        return {
            jobId: job.id,
            type: job.type,
            topic: job.data.topic,
            language: job.data.language,
            channelKey: job.data.channelKey,
            priority: job.priority,
            status: job.status,
            attemptsMade: job.attemptsMade,
            errorMessage: job.errorMessage,
            createdAt: job.createdAt,
            updatedAt: new Date(),
            processingStartedAt: job.processedAt,
            completedAt: job.completedAt
        };
    }

    /**
     * Convierte un PersistedJobState a RenderJob.
     * 
     * @param state - Estado persistido
     * @returns Job de renderizado
     */
    public persistedStateToRenderJob(state: PersistedJobState): RenderJob {
        return {
            id: state.jobId,
            type: state.type,
            data: {
                topic: state.topic,
                language: state.language,
                channelKey: state.channelKey
            },
            priority: state.priority,
            status: state.status,
            createdAt: state.createdAt,
            processedAt: state.processingStartedAt,
            completedAt: state.completedAt,
            attemptsMade: state.attemptsMade,
            errorMessage: state.errorMessage
        };
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Crea las tablas necesarias en SQLite.
     */
    private async createTables(): Promise<void> {
        // Tabla principal de estado de jobs
        const createQueueStateSQL = `
            CREATE TABLE IF NOT EXISTS queue_state (
                job_id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                topic TEXT NOT NULL,
                language TEXT NOT NULL,
                channel_key TEXT NOT NULL,
                priority INTEGER NOT NULL,
                status TEXT NOT NULL,
                previous_status TEXT,
                attempts_made INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                processing_started_at TEXT,
                completed_at TEXT,
                metadata TEXT DEFAULT '{}'
            )
        `;

        // Tabla de historial de transiciones
        const createTransitionsSQL = `
            CREATE TABLE IF NOT EXISTS state_transitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT NOT NULL,
                reason TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (job_id) REFERENCES queue_state(job_id)
            )
        `;

        await this.runQuery(createQueueStateSQL);
        await this.runQuery(createTransitionsSQL);

        // Crear índices para búsquedas eficientes
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_status ON queue_state(status)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_type ON queue_state(type)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_channel ON queue_state(channel_key)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_priority ON queue_state(priority)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_created ON queue_state(created_at)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_qs_updated ON queue_state(updated_at)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_st_job_id ON state_transitions(job_id)');
        await this.runQuery('CREATE INDEX IF NOT EXISTS idx_st_timestamp ON state_transitions(timestamp)');
    }

    /**
     * Inserta un nuevo job en la base de datos.
     */
    private async insertJobState(jobState: PersistedJobState): Promise<void> {
        await this.runQuery(
            `INSERT INTO queue_state (
                job_id, type, topic, language, channel_key, priority, status,
                previous_status, attempts_made, error_message, created_at, updated_at,
                processing_started_at, completed_at, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                jobState.jobId,
                jobState.type,
                jobState.topic,
                jobState.language,
                jobState.channelKey,
                jobState.priority,
                jobState.status,
                jobState.previousStatus || null,
                jobState.attemptsMade,
                jobState.errorMessage || null,
                jobState.createdAt.toISOString(),
                jobState.updatedAt.toISOString(),
                jobState.processingStartedAt?.toISOString() || null,
                jobState.completedAt?.toISOString() || null,
                JSON.stringify(jobState.metadata || {})
            ]
        );

        // Registrar transición inicial
        await this.recordStateTransition(jobState.jobId, null, jobState.status, 'Job creado');

        this.logger.debug(`Job guardado en estado persistido: ${jobState.jobId}`, {
            type: jobState.type,
            status: jobState.status
        });
    }

    /**
     * Actualiza un job existente en la base de datos.
     */
    private async updateJobState(jobState: PersistedJobState): Promise<void> {
        const existing = await this.getJobState(jobState.jobId);
        const previousStatus = existing?.status;

        await this.runQuery(
            `UPDATE queue_state SET
                type = ?, topic = ?, language = ?, channel_key = ?, priority = ?,
                status = ?, previous_status = ?, attempts_made = ?, error_message = ?,
                updated_at = ?, processing_started_at = ?, completed_at = ?, metadata = ?
            WHERE job_id = ?`,
            [
                jobState.type,
                jobState.topic,
                jobState.language,
                jobState.channelKey,
                jobState.priority,
                jobState.status,
                previousStatus || jobState.previousStatus || null,
                jobState.attemptsMade,
                jobState.errorMessage || null,
                jobState.updatedAt.toISOString(),
                jobState.processingStartedAt?.toISOString() || null,
                jobState.completedAt?.toISOString() || null,
                JSON.stringify(jobState.metadata || {}),
                jobState.jobId
            ]
        );

        // Registrar transición si cambió el estado
        if (previousStatus && previousStatus !== jobState.status) {
            await this.recordStateTransition(jobState.jobId, previousStatus, jobState.status);
        }
    }

    /**
     * Registra una transición de estado en el historial.
     */
    private async recordStateTransition(
        jobId: string,
        fromStatus: RenderJobStatus | null,
        toStatus: RenderJobStatus,
        reason?: string
    ): Promise<void> {
        await this.runQuery(
            `INSERT INTO state_transitions (job_id, from_status, to_status, reason, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [
                jobId,
                fromStatus,
                toStatus,
                reason || null,
                new Date().toISOString()
            ]
        );
    }

    /**
     * Inicia el timer de limpieza automática.
     */
    private startAutoCleanup(): void {
        const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
        
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanup();
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.error('Error en limpieza automática', err);
            }
        }, intervalMs);

        // No bloquear el proceso si solo queda este timer
        this.cleanupTimer.unref();
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
     * Convierte una fila de SQLite a PersistedJobState.
     */
    private rowToPersistedJobState(row: QueueStateRow): PersistedJobState {
        return {
            jobId: row.job_id,
            type: row.type as VideoType,
            topic: row.topic,
            language: row.language,
            channelKey: row.channel_key as ChannelKey,
            priority: row.priority,
            status: row.status as RenderJobStatus,
            previousStatus: row.previous_status as RenderJobStatus | undefined,
            attemptsMade: row.attempts_made,
            errorMessage: row.error_message || undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }

    /**
     * Verifica que el sistema esté inicializado.
     */
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('QueueStatePersistence no está inicializada. Llama a initialize() primero.');
        }
    }
}

// ===== TIPOS INTERNOS =====

/**
 * Fila de SQLite para queue_state.
 */
interface QueueStateRow {
    job_id: string;
    type: string;
    topic: string;
    language: string;
    channel_key: string;
    priority: number;
    status: string;
    previous_status: string | null;
    attempts_made: number;
    error_message: string | null;
    created_at: string;
    updated_at: string;
    processing_started_at: string | null;
    completed_at: string | null;
    metadata: string | null;
}

/**
 * Fila de SQLite para state_transitions.
 */
interface StateTransitionRow {
    id: number;
    job_id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    timestamp: string;
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton de QueueStatePersistence.
 * Usar para acceso global sin crear nuevas instancias.
 */
export const queueStatePersistence = new QueueStatePersistence();

// ===== EXPORTAR POR DEFECTO =====

export default QueueStatePersistence;
