/**
 * queueRoutes.ts
 * 
 * Router Express para endpoints HTTP de la cola de renderizado y dead-letter queue.
 * Expone funcionalidades de DeadLetterQueue, RenderQueueManager y QueueStatePersistence vía API REST.
 * 
 * REQ-6.2.4: Crear endpoint HTTP /queue/dead-letter para listar jobs fallidos
 * REQ-6.3.2: Crear endpoint HTTP /queue/status para estado de cola
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 * 
 * Endpoints:
 * - GET  /queue/status - Estado actual de la cola (jobs pendientes, activos, etc.)
 * - GET  /queue/dead-letter - Listar jobs en dead-letter con filtros
 * - GET  /queue/dead-letter/stats - Obtener estadísticas
 * - GET  /queue/dead-letter/:jobId - Obtener un job específico
 * - POST /queue/dead-letter/:jobId/reprocess - Reintentar un job
 * - POST /queue/dead-letter/:jobId/resolve - Marcar como resuelto
 * - GET  /queue/persisted - Listar jobs persistidos con filtros (REQ-6.3.4)
 * - GET  /queue/persisted/stats - Obtener estadísticas del estado persistido (REQ-6.3.4)
 * - GET  /queue/persisted/recoverable - Obtener jobs recuperables tras reinicio (REQ-6.3.4)
 * - GET  /queue/persisted/:jobId - Obtener estado persistido de un job (REQ-6.3.4)
 * - GET  /queue/persisted/:jobId/transitions - Obtener historial de transiciones (REQ-6.3.4)
 * - POST /queue/persisted/recover - Marcar jobs en processing para reprocesamiento (REQ-6.3.4)
 * - POST /queue/persisted/cleanup - Limpiar registros antiguos (REQ-6.3.4)
 */

import { Router, Request, Response } from 'express';
import { 
    DeadLetterQueue, 
    DeadLetterFilters, 
    DeadLetterJobStatus,
    deadLetterQueue 
} from '../infrastructure/DeadLetterQueue';
import { 
    VideoType, 
    ChannelKey, 
    renderQueueManager,
    QueueStats,
    RenderJob,
    RenderJobStatus
} from '../infrastructure/RenderQueueManager';
import {
    queueStatePersistence,
    PersistedJobFilters,
    PersistedJobState,
    PersistedQueueStats,
    RecoverableJobs,
    StateTransition
} from '../infrastructure/QueueStatePersistence';
import { Logger } from '../infrastructure/Logger';

// ===== TIPOS =====

/**
 * Query params para GET /queue/dead-letter
 */
interface DeadLetterQueryParams {
    status?: DeadLetterJobStatus;
    type?: VideoType;
    channelKey?: ChannelKey;
    limit?: string;
    offset?: string;
    orderBy?: 'asc' | 'desc';
}

/**
 * Body para POST /queue/dead-letter/:jobId/resolve
 */
interface ResolveBody {
    notes?: string;
}

/**
 * Respuesta estándar de la API
 */
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ===== ROUTER =====

const router = Router();
const logger = new Logger('QueueRoutes');

// ===== ENDPOINT /queue/status =====

/**
 * Respuesta del endpoint /queue/status
 */
interface QueueStatusResponse {
    /** Estadísticas de la cola */
    stats: QueueStats;
    
    /** Resumen de estados */
    summary: {
        /** Jobs esperando a ser procesados */
        pending: number;
        
        /** Jobs actualmente en proceso */
        inProgress: number;
        
        /** Jobs completados exitosamente */
        completed: number;
        
        /** Jobs fallidos */
        failed: number;
        
        /** Total de jobs en la cola (excluyendo completados/fallidos) */
        total: number;
    };
    
    /** Jobs pendientes (primeros 10 por prioridad) */
    pendingJobs?: RenderJob[];
    
    /** Timestamp de la consulta */
    timestamp: string;
    
    /** Estado del sistema */
    systemStatus: 'healthy' | 'degraded' | 'overloaded';
}

/**
 * GET /queue/status
 * 
 * Retorna el estado actual de la cola de renderizado.
 * Incluye: jobs pendientes, en proceso, completados, fallidos.
 * 
 * Query params:
 * - includePending: 'true' para incluir lista de jobs pendientes (default: false)
 * - limit: número máximo de jobs pendientes a incluir (default: 10)
 * 
 * REQ-6.3.2: Crear endpoint HTTP /queue/status para estado de cola
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        // Parsear query params
        const includePending = req.query.includePending === 'true';
        const limit = Math.min(
            parseInt(req.query.limit as string, 10) || 10,
            50 // Máximo 50 jobs para evitar respuestas muy grandes
        );

        // Obtener estadísticas de la cola
        const stats = await renderQueueManager.getStats();

        // Calcular resumen
        const summary = {
            pending: stats.waiting + stats.delayed,
            inProgress: stats.active,
            completed: stats.completed,
            failed: stats.failed,
            total: stats.waiting + stats.active + stats.delayed
        };

        // Determinar estado del sistema
        let systemStatus: 'healthy' | 'degraded' | 'overloaded' = 'healthy';
        
        // Si hay más de 50 jobs pendientes, consideramos degradado
        if (summary.pending > 50) {
            systemStatus = 'degraded';
        }
        
        // Si hay más de 100 jobs pendientes o la tasa de fallos es alta, overloaded
        if (summary.pending > 100 || (summary.failed > 10 && summary.failed > summary.completed * 0.2)) {
            systemStatus = 'overloaded';
        }

        // Construir respuesta
        const response: QueueStatusResponse = {
            stats,
            summary,
            timestamp: new Date().toISOString(),
            systemStatus
        };

        // Incluir jobs pendientes si se solicita
        if (includePending) {
            response.pendingJobs = await renderQueueManager.getPendingJobs(limit);
        }

        logger.debug('Estado de cola consultado', {
            pending: summary.pending,
            inProgress: summary.inProgress,
            systemStatus
        });

        res.json({
            success: true,
            data: response
        } as ApiResponse<QueueStatusResponse>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo estado de cola', err);
        
        // Verificar si el error es porque la cola no está inicializada
        if (err.message.includes('no está inicializado')) {
            res.status(503).json({
                success: false,
                error: 'Cola de renderizado no disponible',
                message: 'El sistema de colas no está inicializado. Verifique la conexión a Redis.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

// ===== ENDPOINTS /queue/dead-letter =====

/**
 * GET /queue/dead-letter
 * 
 * Lista jobs en la dead-letter queue con filtros opcionales.
 * 
 * Query params:
 * - status: 'dead-letter' | 'reprocessing' | 'resolved'
 * - type: 'short' | 'long'
 * - channelKey: 'channel1' | 'channel2'
 * - limit: número (default 100)
 * - offset: número (default 0)
 * - orderBy: 'asc' | 'desc' (default 'desc')
 */
router.get('/dead-letter', async (req: Request<object, object, object, DeadLetterQueryParams>, res: Response) => {
    try {
        // Validar y construir filtros
        const filters: DeadLetterFilters = {};

        if (req.query.status) {
            const validStatuses: DeadLetterJobStatus[] = ['dead-letter', 'reprocessing', 'resolved'];
            if (!validStatuses.includes(req.query.status)) {
                res.status(400).json({
                    success: false,
                    error: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.status = req.query.status;
        }

        if (req.query.type) {
            const validTypes: VideoType[] = ['short', 'long'];
            if (!validTypes.includes(req.query.type)) {
                res.status(400).json({
                    success: false,
                    error: `Tipo inválido. Valores permitidos: ${validTypes.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.type = req.query.type;
        }

        if (req.query.channelKey) {
            const validChannels: ChannelKey[] = ['channel1', 'channel2'];
            if (!validChannels.includes(req.query.channelKey)) {
                res.status(400).json({
                    success: false,
                    error: `Canal inválido. Valores permitidos: ${validChannels.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.channelKey = req.query.channelKey;
        }

        if (req.query.limit) {
            const limit = parseInt(req.query.limit, 10);
            if (isNaN(limit) || limit < 1 || limit > 1000) {
                res.status(400).json({
                    success: false,
                    error: 'Limit debe ser un número entre 1 y 1000'
                } as ApiResponse<null>);
                return;
            }
            filters.limit = limit;
        }

        if (req.query.offset) {
            const offset = parseInt(req.query.offset, 10);
            if (isNaN(offset) || offset < 0) {
                res.status(400).json({
                    success: false,
                    error: 'Offset debe ser un número mayor o igual a 0'
                } as ApiResponse<null>);
                return;
            }
            filters.offset = offset;
        }

        if (req.query.orderBy) {
            if (!['asc', 'desc'].includes(req.query.orderBy)) {
                res.status(400).json({
                    success: false,
                    error: 'OrderBy debe ser "asc" o "desc"'
                } as ApiResponse<null>);
                return;
            }
            filters.orderBy = req.query.orderBy;
        }

        // Obtener jobs
        const jobs = await deadLetterQueue.getDeadLetterJobs(filters);

        logger.debug('Jobs dead-letter listados', { 
            count: jobs.length, 
            filters 
        });

        res.json({
            success: true,
            data: {
                jobs,
                count: jobs.length,
                filters
            }
        } as ApiResponse<{ jobs: unknown[]; count: number; filters: DeadLetterFilters }>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error listando dead-letter jobs', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/dead-letter/stats
 * 
 * Obtiene estadísticas de la dead-letter queue.
 */
router.get('/dead-letter/stats', async (_req: Request, res: Response) => {
    try {
        const stats = await deadLetterQueue.getStats();

        logger.debug('Estadísticas dead-letter obtenidas', { ...stats });

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo estadísticas dead-letter', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/dead-letter/:jobId
 * 
 * Obtiene un job específico de la dead-letter queue.
 */
router.get('/dead-letter/:jobId', async (req: Request<{ jobId: string }>, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            res.status(400).json({
                success: false,
                error: 'jobId es requerido'
            } as ApiResponse<null>);
            return;
        }

        const job = await deadLetterQueue.getDeadLetterJob(jobId);

        if (!job) {
            res.status(404).json({
                success: false,
                error: `Job no encontrado: ${jobId}`
            } as ApiResponse<null>);
            return;
        }

        logger.debug('Job dead-letter obtenido', { jobId, deadLetterId: job.deadLetterId });

        res.json({
            success: true,
            data: job
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo job dead-letter', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * POST /queue/dead-letter/:jobId/reprocess
 * 
 * Reintenta procesar un job desde la dead-letter queue.
 */
router.post('/dead-letter/:jobId/reprocess', async (req: Request<{ jobId: string }>, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            res.status(400).json({
                success: false,
                error: 'jobId es requerido'
            } as ApiResponse<null>);
            return;
        }

        const result = await deadLetterQueue.reprocessJob(jobId);

        if (!result.success) {
            logger.warn('Reintento de job fallido', { jobId, message: result.message });
            
            res.status(400).json({
                success: false,
                error: result.message
            } as ApiResponse<null>);
            return;
        }

        logger.info('Job reencolado desde API', { 
            jobId, 
            newJobId: result.newJobId 
        });

        res.json({
            success: true,
            data: {
                originalJobId: jobId,
                newJobId: result.newJobId,
                message: result.message
            }
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error reprocesando job', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * POST /queue/dead-letter/:jobId/resolve
 * 
 * Marca un job como resuelto (ya no necesita reintento).
 * 
 * Body (opcional):
 * - notes: string - Notas del operador
 */
router.post('/dead-letter/:jobId/resolve', async (req: Request<{ jobId: string }, object, ResolveBody>, res: Response) => {
    try {
        const { jobId } = req.params;
        const { notes } = req.body || {};

        if (!jobId) {
            res.status(400).json({
                success: false,
                error: 'jobId es requerido'
            } as ApiResponse<null>);
            return;
        }

        const updated = await deadLetterQueue.markAsResolved(jobId, notes);

        if (!updated) {
            res.status(404).json({
                success: false,
                error: `Job no encontrado o ya resuelto: ${jobId}`
            } as ApiResponse<null>);
            return;
        }

        logger.info('Job marcado como resuelto desde API', { jobId, notes });

        res.json({
            success: true,
            data: {
                jobId,
                status: 'resolved',
                notes
            },
            message: `Job ${jobId} marcado como resuelto`
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error marcando job como resuelto', err);
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

// ===== ENDPOINTS /queue/persisted (REQ-6.3.4) =====

/**
 * Query params para GET /queue/persisted
 */
interface PersistedQueryParams {
    status?: RenderJobStatus;
    type?: VideoType;
    channelKey?: ChannelKey;
    limit?: string;
    offset?: string;
    orderBy?: 'asc' | 'desc';
    orderField?: 'createdAt' | 'updatedAt' | 'priority';
}

/**
 * GET /queue/persisted
 * 
 * Lista jobs persistidos con filtros opcionales.
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 * 
 * Query params:
 * - status: 'pending' | 'processing' | 'completed' | 'failed'
 * - type: 'short' | 'long'
 * - channelKey: 'channel1' | 'channel2'
 * - limit: número (default 100, max 1000)
 * - offset: número (default 0)
 * - orderBy: 'asc' | 'desc' (default 'desc')
 * - orderField: 'createdAt' | 'updatedAt' | 'priority' (default 'createdAt')
 */
router.get('/persisted', async (req: Request<object, object, object, PersistedQueryParams>, res: Response) => {
    try {
        // Validar y construir filtros
        const filters: PersistedJobFilters = {};

        if (req.query.status) {
            const validStatuses: RenderJobStatus[] = ['pending', 'processing', 'completed', 'failed'];
            if (!validStatuses.includes(req.query.status)) {
                res.status(400).json({
                    success: false,
                    error: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.status = req.query.status;
        }

        if (req.query.type) {
            const validTypes: VideoType[] = ['short', 'long'];
            if (!validTypes.includes(req.query.type)) {
                res.status(400).json({
                    success: false,
                    error: `Tipo inválido. Valores permitidos: ${validTypes.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.type = req.query.type;
        }

        if (req.query.channelKey) {
            const validChannels: ChannelKey[] = ['channel1', 'channel2'];
            if (!validChannels.includes(req.query.channelKey)) {
                res.status(400).json({
                    success: false,
                    error: `Canal inválido. Valores permitidos: ${validChannels.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.channelKey = req.query.channelKey;
        }

        if (req.query.limit) {
            const limit = parseInt(req.query.limit, 10);
            if (isNaN(limit) || limit < 1 || limit > 1000) {
                res.status(400).json({
                    success: false,
                    error: 'Limit debe ser un número entre 1 y 1000'
                } as ApiResponse<null>);
                return;
            }
            filters.limit = limit;
        }

        if (req.query.offset) {
            const offset = parseInt(req.query.offset, 10);
            if (isNaN(offset) || offset < 0) {
                res.status(400).json({
                    success: false,
                    error: 'Offset debe ser un número mayor o igual a 0'
                } as ApiResponse<null>);
                return;
            }
            filters.offset = offset;
        }

        if (req.query.orderBy) {
            if (!['asc', 'desc'].includes(req.query.orderBy)) {
                res.status(400).json({
                    success: false,
                    error: 'OrderBy debe ser "asc" o "desc"'
                } as ApiResponse<null>);
                return;
            }
            filters.orderBy = req.query.orderBy;
        }

        if (req.query.orderField) {
            const validFields = ['createdAt', 'updatedAt', 'priority'];
            if (!validFields.includes(req.query.orderField)) {
                res.status(400).json({
                    success: false,
                    error: `OrderField inválido. Valores permitidos: ${validFields.join(', ')}`
                } as ApiResponse<null>);
                return;
            }
            filters.orderField = req.query.orderField;
        }

        // Obtener jobs persistidos
        const jobs = await queueStatePersistence.getJobs(filters);

        logger.debug('Jobs persistidos listados', { 
            count: jobs.length, 
            filters 
        });

        res.json({
            success: true,
            data: {
                jobs,
                count: jobs.length,
                filters
            }
        } as ApiResponse<{ jobs: PersistedJobState[]; count: number; filters: PersistedJobFilters }>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error listando jobs persistidos', err);
        
        // Verificar si no está inicializado
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada. Verifique la configuración.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/persisted/stats
 * 
 * Obtiene estadísticas del estado persistido de la cola.
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 */
router.get('/persisted/stats', async (_req: Request, res: Response) => {
    try {
        const stats = await queueStatePersistence.getStats();

        logger.debug('Estadísticas de persistencia obtenidas', { 
            total: stats.total,
            pending: stats.pending,
            processing: stats.processing
        });

        res.json({
            success: true,
            data: stats
        } as ApiResponse<PersistedQueueStats>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo estadísticas de persistencia', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/persisted/recoverable
 * 
 * Obtiene jobs que pueden ser recuperados después de un reinicio.
 * Incluye jobs pendientes y jobs que estaban en proceso.
 * REQ-6.3.4: Permitir recuperación del estado tras reinicio del proceso
 */
router.get('/persisted/recoverable', async (_req: Request, res: Response) => {
    try {
        const recoverable = await queueStatePersistence.getRecoverableJobs();

        logger.info('Jobs recuperables consultados', { 
            pending: recoverable.pending.length,
            processing: recoverable.processing.length,
            total: recoverable.total
        });

        res.json({
            success: true,
            data: recoverable,
            message: `${recoverable.total} jobs recuperables encontrados`
        } as ApiResponse<RecoverableJobs>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo jobs recuperables', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/persisted/:jobId
 * 
 * Obtiene el estado persistido de un job específico.
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 */
router.get('/persisted/:jobId', async (req: Request<{ jobId: string }>, res: Response) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            res.status(400).json({
                success: false,
                error: 'jobId es requerido'
            } as ApiResponse<null>);
            return;
        }

        const job = await queueStatePersistence.getJobState(jobId);

        if (!job) {
            res.status(404).json({
                success: false,
                error: `Job no encontrado en estado persistido: ${jobId}`
            } as ApiResponse<null>);
            return;
        }

        logger.debug('Estado persistido de job obtenido', { 
            jobId, 
            status: job.status 
        });

        res.json({
            success: true,
            data: job
        } as ApiResponse<PersistedJobState>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo estado persistido de job', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * GET /queue/persisted/:jobId/transitions
 * 
 * Obtiene el historial de transiciones de estado de un job.
 * Útil para auditoría y debugging.
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 * 
 * Query params:
 * - limit: número máximo de transiciones (default 50)
 */
router.get('/persisted/:jobId/transitions', async (req: Request<{ jobId: string }, object, object, { limit?: string }>, res: Response) => {
    try {
        const { jobId } = req.params;
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

        if (!jobId) {
            res.status(400).json({
                success: false,
                error: 'jobId es requerido'
            } as ApiResponse<null>);
            return;
        }

        // Verificar que el job existe
        const job = await queueStatePersistence.getJobState(jobId);
        if (!job) {
            res.status(404).json({
                success: false,
                error: `Job no encontrado: ${jobId}`
            } as ApiResponse<null>);
            return;
        }

        const transitions = await queueStatePersistence.getStateTransitions(jobId, limit);

        logger.debug('Transiciones de job obtenidas', { 
            jobId, 
            count: transitions.length 
        });

        res.json({
            success: true,
            data: {
                jobId,
                currentStatus: job.status,
                transitions,
                count: transitions.length
            }
        } as ApiResponse<{ jobId: string; currentStatus: RenderJobStatus; transitions: StateTransition[]; count: number }>);

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error obteniendo transiciones de job', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * POST /queue/persisted/recover
 * 
 * Marca jobs en estado 'processing' como 'pending' para recuperación.
 * Útil después de un reinicio inesperado del proceso.
 * REQ-6.3.4: Permitir recuperación del estado tras reinicio del proceso
 */
router.post('/persisted/recover', async (_req: Request, res: Response) => {
    try {
        const recoveredCount = await queueStatePersistence.markProcessingJobsForRecovery();

        logger.info('Jobs marcados para recuperación', { 
            recoveredCount 
        });

        res.json({
            success: true,
            data: {
                recoveredCount
            },
            message: recoveredCount > 0 
                ? `${recoveredCount} jobs marcados para reprocesamiento` 
                : 'No había jobs en proceso que recuperar'
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error marcando jobs para recuperación', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

/**
 * POST /queue/persisted/cleanup
 * 
 * Limpia registros antiguos de jobs completados/fallidos y transiciones.
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 */
router.post('/persisted/cleanup', async (_req: Request, res: Response) => {
    try {
        const result = await queueStatePersistence.cleanup();

        logger.info('Limpieza de estado persistido ejecutada', { 
            jobsDeleted: result.jobsDeleted,
            transitionsDeleted: result.transitionsDeleted
        });

        res.json({
            success: true,
            data: result,
            message: `Limpieza completada: ${result.jobsDeleted} jobs y ${result.transitionsDeleted} transiciones eliminadas`
        });

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error ejecutando limpieza de persistencia', err);
        
        if (err.message.includes('no está inicializada')) {
            res.status(503).json({
                success: false,
                error: 'Sistema de persistencia no disponible',
                message: 'QueueStatePersistence no está inicializada.'
            } as ApiResponse<null>);
            return;
        }
        
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            message: err.message
        } as ApiResponse<null>);
    }
});

export default router;
