/**
 * QueueStatePersistence.test.ts
 * 
 * Tests unitarios para el sistema de persistencia del estado de cola.
 * Verifica la funcionalidad de almacenamiento, recuperación y auditoría de jobs.
 * 
 * REQ-6.3.4: Implementar persistencia de estado de cola en SQLite
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    QueueStatePersistence,
    PersistedJobState,
    PersistedJobFilters,
    QueueStatePersistenceConfig
} from './QueueStatePersistence';
import { RenderJob, RenderJobStatus, VideoType, ChannelKey } from './RenderQueueManager';

// ===== CONFIGURACIÓN DE TESTS =====

// Usar una base de datos temporal para tests
const TEST_DB_PATH = 'data/test-queue-state.db';

// Helper para crear config de test
function getTestConfig(): Partial<QueueStatePersistenceConfig> {
    return {
        databasePath: TEST_DB_PATH,
        completedJobsRetentionDays: 1,
        transitionHistoryRetentionDays: 1,
        cleanupIntervalHours: 24
    };
}

// Helper para crear un job de ejemplo
function createTestJobState(overrides?: Partial<PersistedJobState>): PersistedJobState {
    return {
        jobId: `test-job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'short' as VideoType,
        topic: 'Test Topic sobre IA y Autismo',
        language: 'es',
        channelKey: 'channel1' as ChannelKey,
        priority: 1,
        status: 'pending' as RenderJobStatus,
        attemptsMade: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

// Helper para crear un RenderJob de ejemplo
function createTestRenderJob(overrides?: Partial<RenderJob>): RenderJob {
    return {
        id: `render-job-${Date.now()}`,
        type: 'short' as VideoType,
        data: {
            topic: 'Test Topic',
            language: 'es',
            channelKey: 'channel1' as ChannelKey
        },
        priority: 1,
        status: 'pending' as RenderJobStatus,
        createdAt: new Date(),
        attemptsMade: 0,
        ...overrides
    };
}

// ===== TESTS =====

describe('QueueStatePersistence', () => {
    let persistence: QueueStatePersistence;

    beforeEach(async () => {
        // Eliminar base de datos de test si existe
        const dbPath = path.resolve(process.cwd(), TEST_DB_PATH);
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }

        // Crear nueva instancia
        persistence = new QueueStatePersistence(getTestConfig());
        await persistence.initialize();
    });

    afterEach(async () => {
        // Cerrar conexión
        await persistence.close();

        // Eliminar base de datos de test
        const dbPath = path.resolve(process.cwd(), TEST_DB_PATH);
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    // ===== TESTS DE INICIALIZACIÓN =====

    describe('Inicialización', () => {
        it('debería inicializar correctamente', async () => {
            // El beforeEach ya inicializó, verificar que no lanza error
            expect(persistence).toBeDefined();
        });

        it('debería manejar doble inicialización sin error', async () => {
            await expect(persistence.initialize()).resolves.not.toThrow();
        });

        it('debería crear el directorio si no existe', async () => {
            const customPath = 'data/test-subdir/queue-state.db';
            const customPersistence = new QueueStatePersistence({
                ...getTestConfig(),
                databasePath: customPath
            });

            await customPersistence.initialize();

            const dir = path.dirname(path.resolve(process.cwd(), customPath));
            expect(fs.existsSync(dir)).toBe(true);

            await customPersistence.close();

            // Limpiar
            if (fs.existsSync(path.resolve(process.cwd(), customPath))) {
                fs.unlinkSync(path.resolve(process.cwd(), customPath));
            }
        });
    });

    // ===== TESTS DE GUARDAR Y OBTENER =====

    describe('Guardar y obtener estado de job', () => {
        it('debería guardar un nuevo job correctamente', async () => {
            const job = createTestJobState();

            await persistence.saveJobState(job);

            const saved = await persistence.getJobState(job.jobId);
            expect(saved).not.toBeNull();
            expect(saved!.jobId).toBe(job.jobId);
            expect(saved!.topic).toBe(job.topic);
            expect(saved!.status).toBe('pending');
        });

        it('debería actualizar un job existente', async () => {
            const job = createTestJobState();
            await persistence.saveJobState(job);

            // Actualizar
            job.status = 'processing';
            job.attemptsMade = 1;
            job.updatedAt = new Date();
            await persistence.saveJobState(job);

            const updated = await persistence.getJobState(job.jobId);
            expect(updated!.status).toBe('processing');
            expect(updated!.attemptsMade).toBe(1);
        });

        it('debería retornar null para job inexistente', async () => {
            const result = await persistence.getJobState('nonexistent-job-id');
            expect(result).toBeNull();
        });
    });

    // ===== TESTS DE ACTUALIZACIÓN DE ESTADO =====

    describe('Actualización de estado', () => {
        it('debería actualizar el estado de un job', async () => {
            const job = createTestJobState({ status: 'pending' });
            await persistence.saveJobState(job);

            const updated = await persistence.updateJobStatus(job.jobId, 'processing');
            expect(updated).toBe(true);

            const saved = await persistence.getJobState(job.jobId);
            expect(saved!.status).toBe('processing');
            expect(saved!.previousStatus).toBe('pending');
        });

        it('debería incrementar attemptsMade al pasar a processing', async () => {
            const job = createTestJobState({ status: 'pending', attemptsMade: 0 });
            await persistence.saveJobState(job);

            await persistence.updateJobStatus(job.jobId, 'processing');

            const saved = await persistence.getJobState(job.jobId);
            expect(saved!.attemptsMade).toBe(1);
            expect(saved!.processingStartedAt).toBeDefined();
        });

        it('debería guardar errorMessage cuando falla', async () => {
            const job = createTestJobState({ status: 'processing' });
            await persistence.saveJobState(job);

            await persistence.updateJobStatus(
                job.jobId, 
                'failed', 
                'Test failure reason',
                'Error: Something went wrong'
            );

            const saved = await persistence.getJobState(job.jobId);
            expect(saved!.status).toBe('failed');
            expect(saved!.errorMessage).toBe('Error: Something went wrong');
            expect(saved!.completedAt).toBeDefined();
        });

        it('debería retornar false para job inexistente', async () => {
            const result = await persistence.updateJobStatus('nonexistent', 'completed');
            expect(result).toBe(false);
        });

        it('debería registrar transición de estado', async () => {
            const job = createTestJobState({ status: 'pending' });
            await persistence.saveJobState(job);

            await persistence.updateJobStatus(job.jobId, 'processing');
            await persistence.updateJobStatus(job.jobId, 'completed');

            const transitions = await persistence.getStateTransitions(job.jobId);
            expect(transitions.length).toBeGreaterThanOrEqual(3); // creación + 2 transiciones
            
            // Las transiciones están ordenadas DESC, la más reciente primero
            expect(transitions[0].toStatus).toBe('completed');
            expect(transitions[0].fromStatus).toBe('processing');
        });
    });

    // ===== TESTS DE FILTROS Y CONSULTAS =====

    describe('Filtros y consultas', () => {
        beforeEach(async () => {
            // Crear varios jobs de prueba
            const jobs: PersistedJobState[] = [
                createTestJobState({ jobId: 'job-1', status: 'pending', type: 'short', channelKey: 'channel1', priority: 1 }),
                createTestJobState({ jobId: 'job-2', status: 'processing', type: 'long', channelKey: 'channel1', priority: 5 }),
                createTestJobState({ jobId: 'job-3', status: 'completed', type: 'short', channelKey: 'channel2', priority: 2 }),
                createTestJobState({ jobId: 'job-4', status: 'failed', type: 'long', channelKey: 'channel2', priority: 10 }),
                createTestJobState({ jobId: 'job-5', status: 'pending', type: 'short', channelKey: 'channel1', priority: 3 }),
            ];

            for (const job of jobs) {
                await persistence.saveJobState(job);
            }
        });

        it('debería filtrar por status', async () => {
            const pending = await persistence.getJobs({ status: 'pending' });
            expect(pending.length).toBe(2);
            expect(pending.every(j => j.status === 'pending')).toBe(true);
        });

        it('debería filtrar por tipo', async () => {
            const shorts = await persistence.getJobs({ type: 'short' });
            expect(shorts.length).toBe(3);
            expect(shorts.every(j => j.type === 'short')).toBe(true);
        });

        it('debería filtrar por canal', async () => {
            const channel2 = await persistence.getJobs({ channelKey: 'channel2' });
            expect(channel2.length).toBe(2);
            expect(channel2.every(j => j.channelKey === 'channel2')).toBe(true);
        });

        it('debería combinar múltiples filtros', async () => {
            const filtered = await persistence.getJobs({
                status: 'pending',
                type: 'short',
                channelKey: 'channel1'
            });
            expect(filtered.length).toBe(2);
        });

        it('debería respetar limit y offset', async () => {
            const page1 = await persistence.getJobs({ limit: 2, offset: 0 });
            const page2 = await persistence.getJobs({ limit: 2, offset: 2 });

            expect(page1.length).toBe(2);
            expect(page2.length).toBe(2);
            expect(page1[0].jobId).not.toBe(page2[0].jobId);
        });

        it('debería ordenar por campo especificado', async () => {
            const byPriorityAsc = await persistence.getJobs({ 
                orderField: 'priority', 
                orderBy: 'asc' 
            });

            expect(byPriorityAsc[0].priority).toBeLessThanOrEqual(byPriorityAsc[1].priority);
        });
    });

    // ===== TESTS DE RECUPERACIÓN =====

    describe('Recuperación de jobs', () => {
        it('debería obtener jobs recuperables', async () => {
            // Crear jobs en diferentes estados
            await persistence.saveJobState(createTestJobState({ jobId: 'pending-1', status: 'pending' }));
            await persistence.saveJobState(createTestJobState({ jobId: 'pending-2', status: 'pending' }));
            await persistence.saveJobState(createTestJobState({ jobId: 'processing-1', status: 'processing' }));
            await persistence.saveJobState(createTestJobState({ jobId: 'completed-1', status: 'completed' }));

            const recoverable = await persistence.getRecoverableJobs();

            expect(recoverable.pending.length).toBe(2);
            expect(recoverable.processing.length).toBe(1);
            expect(recoverable.total).toBe(3);
        });

        it('debería marcar jobs en processing para recovery', async () => {
            await persistence.saveJobState(createTestJobState({ jobId: 'proc-1', status: 'processing' }));
            await persistence.saveJobState(createTestJobState({ jobId: 'proc-2', status: 'processing' }));

            const count = await persistence.markProcessingJobsForRecovery();
            expect(count).toBe(2);

            const jobs = await persistence.getJobs({ status: 'pending' });
            expect(jobs.length).toBe(2);

            // Verificar que se registraron transiciones
            const transitions = await persistence.getStateTransitions('proc-1');
            expect(transitions.some(t => 
                t.fromStatus === 'processing' && 
                t.toStatus === 'pending' &&
                t.reason?.includes('Recuperación')
            )).toBe(true);
        });
    });

    // ===== TESTS DE ESTADÍSTICAS =====

    describe('Estadísticas', () => {
        beforeEach(async () => {
            await persistence.saveJobState(createTestJobState({ jobId: 's1', status: 'pending', type: 'short', channelKey: 'channel1' }));
            await persistence.saveJobState(createTestJobState({ jobId: 's2', status: 'processing', type: 'short', channelKey: 'channel1' }));
            await persistence.saveJobState(createTestJobState({ jobId: 's3', status: 'completed', type: 'long', channelKey: 'channel2', attemptsMade: 1 }));
            await persistence.saveJobState(createTestJobState({ jobId: 's4', status: 'failed', type: 'long', channelKey: 'channel2', attemptsMade: 3 }));
        });

        it('debería calcular estadísticas correctamente', async () => {
            const stats = await persistence.getStats();

            expect(stats.total).toBe(4);
            expect(stats.pending).toBe(1);
            expect(stats.processing).toBe(1);
            expect(stats.completed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.byType.short).toBe(2);
            expect(stats.byType.long).toBe(2);
            expect(stats.byChannel.channel1).toBe(2);
            expect(stats.byChannel.channel2).toBe(2);
            expect(stats.avgAttempts).toBe(2); // (1 + 3) / 2 = 2
            expect(stats.timestamp).toBeInstanceOf(Date);
        });
    });

    // ===== TESTS DE CONVERSIÓN =====

    describe('Conversión RenderJob <-> PersistedJobState', () => {
        it('debería convertir RenderJob a PersistedJobState', () => {
            const renderJob = createTestRenderJob({
                id: 'render-123',
                type: 'long',
                status: 'processing',
                processedAt: new Date(),
                attemptsMade: 2
            });

            const persisted = persistence.renderJobToPersistedState(renderJob);

            expect(persisted.jobId).toBe('render-123');
            expect(persisted.type).toBe('long');
            expect(persisted.topic).toBe(renderJob.data.topic);
            expect(persisted.language).toBe(renderJob.data.language);
            expect(persisted.channelKey).toBe(renderJob.data.channelKey);
            expect(persisted.status).toBe('processing');
            expect(persisted.attemptsMade).toBe(2);
            expect(persisted.processingStartedAt).toBeDefined();
        });

        it('debería convertir PersistedJobState a RenderJob', async () => {
            const persisted = createTestJobState({
                jobId: 'persist-456',
                type: 'short',
                status: 'completed',
                completedAt: new Date()
            });

            const renderJob = persistence.persistedStateToRenderJob(persisted);

            expect(renderJob.id).toBe('persist-456');
            expect(renderJob.type).toBe('short');
            expect(renderJob.data.topic).toBe(persisted.topic);
            expect(renderJob.status).toBe('completed');
            expect(renderJob.completedAt).toBeDefined();
        });
    });

    // ===== TESTS DE ELIMINACIÓN =====

    describe('Eliminación de jobs', () => {
        it('debería eliminar un job y sus transiciones', async () => {
            const job = createTestJobState({ jobId: 'to-delete' });
            await persistence.saveJobState(job);
            await persistence.updateJobStatus('to-delete', 'processing');

            const deleted = await persistence.deleteJob('to-delete');
            expect(deleted).toBe(true);

            const result = await persistence.getJobState('to-delete');
            expect(result).toBeNull();

            const transitions = await persistence.getStateTransitions('to-delete');
            expect(transitions.length).toBe(0);
        });

        it('debería retornar false para job inexistente', async () => {
            const deleted = await persistence.deleteJob('nonexistent');
            expect(deleted).toBe(false);
        });
    });

    // ===== TESTS DE LIMPIEZA =====

    describe('Limpieza automática', () => {
        it('debería limpiar jobs antiguos', async () => {
            // Crear un job "antiguo" modificando la fecha manualmente
            const oldJob = createTestJobState({ 
                jobId: 'old-job', 
                status: 'completed',
                createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 días atrás
                updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
            });
            await persistence.saveJobState(oldJob);

            // Crear un job reciente
            await persistence.saveJobState(createTestJobState({ 
                jobId: 'new-job', 
                status: 'completed' 
            }));

            // Ejecutar limpieza (retention es 1 día en tests)
            const result = await persistence.cleanup();

            expect(result.jobsDeleted).toBe(1);

            const remaining = await persistence.getJobState('new-job');
            expect(remaining).not.toBeNull();

            const deleted = await persistence.getJobState('old-job');
            expect(deleted).toBeNull();
        });
    });

    // ===== TESTS DE ERRORES =====

    describe('Manejo de errores', () => {
        it('debería lanzar error si no está inicializado', async () => {
            const uninit = new QueueStatePersistence(getTestConfig());

            await expect(uninit.saveJobState(createTestJobState()))
                .rejects.toThrow('no está inicializada');

            await expect(uninit.getJobs())
                .rejects.toThrow('no está inicializada');
        });
    });
});
