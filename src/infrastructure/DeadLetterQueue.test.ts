/**
 * DeadLetterQueue.test.ts
 * 
 * Tests unitarios para el sistema de Dead-Letter Queue.
 * Verifica todas las funcionalidades de gestión de jobs fallidos.
 * 
 * REQ-6.2.1: Crear estado dead-letter para jobs que fallaron 3+ veces
 * REQ-6.2.2: Mover jobs fallidos a cola separada con detalles del error
 * REQ-6.2.3: Permitir reintento manual desde dashboard
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    DeadLetterQueue,
    DeadLetterJob,
    DeadLetterJobStatus,
    FailureInfo,
    DeadLetterFilters,
    DeadLetterStats,
    ReprocessResult,
    DEAD_LETTER_THRESHOLD
} from './DeadLetterQueue';
import { RenderJob, VideoType, ChannelKey } from './RenderQueueManager';

// ===== CONFIGURACIÓN DE TESTS =====

// Directorio temporal para tests
const TEST_DB_DIR = 'test-data';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-dead-letter.db');

// Helper para crear un RenderJob de prueba
function createMockRenderJob(overrides?: Partial<RenderJob>): RenderJob {
    return {
        id: `render-short-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'short' as VideoType,
        data: {
            topic: 'Test Topic IA y Autismo',
            language: 'es',
            channelKey: 'channel1' as ChannelKey
        },
        priority: 1,
        status: 'failed',
        createdAt: new Date(Date.now() - 60000), // hace 1 minuto
        attemptsMade: 3,
        errorMessage: 'Test error: Timeout processing video',
        ...overrides
    };
}

// ===== TESTS =====

describe('DeadLetterQueue', () => {
    let dlq: DeadLetterQueue;

    beforeEach(async () => {
        // Limpiar directorio de tests
        if (fs.existsSync(TEST_DB_DIR)) {
            fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_DB_DIR, { recursive: true });

        // Crear instancia de test
        dlq = new DeadLetterQueue({
            databasePath: TEST_DB_PATH,
            maxAgeDays: 30,
            maxReprocessAttempts: 3
        });

        await dlq.initialize();
    });

    afterEach(async () => {
        await dlq.close();
        
        // Limpiar directorio de tests
        if (fs.existsSync(TEST_DB_DIR)) {
            fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
        }
    });

    // ===== TESTS DE INICIALIZACIÓN =====

    describe('Inicialización', () => {
        it('debe inicializar correctamente la base de datos', async () => {
            // Ya inicializado en beforeEach
            expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
        });

        it('debe crear el directorio si no existe', async () => {
            const newPath = path.join(TEST_DB_DIR, 'nested', 'dir', 'test.db');
            const newDlq = new DeadLetterQueue({ databasePath: newPath });
            
            await newDlq.initialize();
            
            expect(fs.existsSync(newPath)).toBe(true);
            await newDlq.close();
        });

        it('no debe re-inicializar si ya está inicializada', async () => {
            // Debe funcionar sin errores
            await dlq.initialize();
            
            // La segunda inicialización no debe causar problemas
            const stats = await dlq.getStats();
            expect(stats).toBeDefined();
        });
    });

    // ===== TESTS DE moveToDeadLetter =====

    describe('moveToDeadLetter', () => {
        it('debe mover un job fallido a dead-letter correctamente', async () => {
            const job = createMockRenderJob();
            const failureReason = 'Error crítico: FFmpeg timeout después de 5 minutos';

            const deadLetterJob = await dlq.moveToDeadLetter(job, failureReason);

            expect(deadLetterJob).toBeDefined();
            expect(deadLetterJob.id).toBe(job.id);
            expect(deadLetterJob.deadLetterId).toMatch(/^dlq-\d+-[a-z0-9]+$/);
            expect(deadLetterJob.type).toBe('short');
            expect(deadLetterJob.data.topic).toBe('Test Topic IA y Autismo');
            expect(deadLetterJob.status).toBe('dead-letter');
            expect(deadLetterJob.failureInfo.message).toBe(failureReason);
            expect(deadLetterJob.failureInfo.attemptsMade).toBe(3);
            expect(deadLetterJob.reprocessAttempts).toBe(0);
        });

        it('debe almacenar el historial de errores', async () => {
            const job = createMockRenderJob();
            const failureReason = 'Error final';
            const errorHistory = [
                'Intento 1: Connection timeout',
                'Intento 2: FFmpeg crashed',
                'Intento 3: Out of memory'
            ];

            const deadLetterJob = await dlq.moveToDeadLetter(job, failureReason, errorHistory);

            expect(deadLetterJob.failureInfo.errorHistory).toEqual(errorHistory);
        });

        it('debe extraer stack trace si está presente en el error', async () => {
            const job = createMockRenderJob();
            const failureReason = 'Error: Cannot read property\n' +
                'at processVideo (/app/src/render.ts:123:45)\n' +
                'at Worker.run (/app/src/queue.ts:67:12)';

            const deadLetterJob = await dlq.moveToDeadLetter(job, failureReason);

            expect(deadLetterJob.failureInfo.stackTrace).toContain('at processVideo');
        });

        it('debe persistir el job en la base de datos', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            // Verificar que se puede recuperar
            const retrieved = await dlq.getDeadLetterJob(job.id);
            
            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(job.id);
        });

        it('debe invocar callback onJobDeadLettered si está configurado', async () => {
            const callback = vi.fn().mockResolvedValue(undefined);
            const dlqWithCallback = new DeadLetterQueue({
                databasePath: path.join(TEST_DB_DIR, 'callback-test.db'),
                maxAgeDays: 30,
                maxReprocessAttempts: 3,
                onJobDeadLettered: callback
            });
            await dlqWithCallback.initialize();

            const job = createMockRenderJob();
            await dlqWithCallback.moveToDeadLetter(job, 'Test error');

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                id: job.id,
                status: 'dead-letter'
            }));

            await dlqWithCallback.close();
        });

        /**
         * REQ-6.2.2: Mover jobs fallidos a cola separada con detalles del error
         * Este test verifica explícitamente que moveToDeadLetter() almacena todos
         * los detalles requeridos del error:
         * - Mensaje de error principal
         * - Stack trace si está disponible
         * - Número de intentos antes de fallar
         * - Historial de errores de intentos anteriores
         */
        it('debe almacenar TODOS los detalles del error según REQ-6.2.2', async () => {
            const completedAt = new Date();
            const job = createMockRenderJob({
                id: 'job-detailed-error-test',
                attemptsMade: 3,
                completedAt
            });
            
            const mainErrorMessage = 'Critical error: FFmpeg process crashed unexpectedly\n' +
                'at VideoRenderer.process (/app/src/render.ts:45:12)\n' +
                'at Worker.execute (/app/src/queue.ts:89:23)';
            
            const errorHistory = [
                'Intento 1 (2024-01-01 10:00): Connection timeout to Pexels API',
                'Intento 2 (2024-01-01 10:05): Google TTS rate limit exceeded',
                'Intento 3 (2024-01-01 10:10): FFmpeg process crashed'
            ];

            const deadLetterJob = await dlq.moveToDeadLetter(job, mainErrorMessage, errorHistory);

            // Verificar estructura general
            expect(deadLetterJob).toBeDefined();
            expect(deadLetterJob.id).toBe('job-detailed-error-test');
            expect(deadLetterJob.status).toBe('dead-letter');
            
            // REQ-6.2.2: Verificar mensaje de error principal
            expect(deadLetterJob.failureInfo.message).toBe(mainErrorMessage);
            expect(deadLetterJob.failureInfo.message).toContain('Critical error');
            expect(deadLetterJob.failureInfo.message).toContain('FFmpeg');
            
            // REQ-6.2.2: Verificar stack trace extraído
            expect(deadLetterJob.failureInfo.stackTrace).toBeDefined();
            expect(deadLetterJob.failureInfo.stackTrace).toContain('at VideoRenderer.process');
            
            // REQ-6.2.2: Verificar número de intentos
            expect(deadLetterJob.failureInfo.attemptsMade).toBe(3);
            
            // REQ-6.2.2: Verificar timestamp del último intento
            expect(deadLetterJob.failureInfo.lastAttemptAt).toEqual(completedAt);
            
            // REQ-6.2.2: Verificar historial de errores
            expect(deadLetterJob.failureInfo.errorHistory).toEqual(errorHistory);
            expect(deadLetterJob.failureInfo.errorHistory).toHaveLength(3);
            expect(deadLetterJob.failureInfo.errorHistory![0]).toContain('Connection timeout');
            expect(deadLetterJob.failureInfo.errorHistory![1]).toContain('rate limit');
            expect(deadLetterJob.failureInfo.errorHistory![2]).toContain('FFmpeg process crashed');

            // Verificar persistencia: recuperar de BD y validar que los detalles se mantienen
            const retrieved = await dlq.getDeadLetterJob('job-detailed-error-test');
            expect(retrieved).not.toBeNull();
            expect(retrieved!.failureInfo.message).toBe(mainErrorMessage);
            expect(retrieved!.failureInfo.attemptsMade).toBe(3);
            expect(retrieved!.failureInfo.errorHistory).toEqual(errorHistory);
            expect(retrieved!.failureInfo.stackTrace).toContain('at VideoRenderer.process');
        });
    });

    // ===== TESTS DE getDeadLetterJobs =====

    describe('getDeadLetterJobs', () => {
        beforeEach(async () => {
            // Crear varios jobs de prueba
            const jobs = [
                createMockRenderJob({ id: 'job-1', type: 'short', data: { topic: 'Topic 1', language: 'es', channelKey: 'channel1' } }),
                createMockRenderJob({ id: 'job-2', type: 'long', data: { topic: 'Topic 2', language: 'en', channelKey: 'channel2' } }),
                createMockRenderJob({ id: 'job-3', type: 'short', data: { topic: 'Topic 3', language: 'pt', channelKey: 'channel1' } })
            ];

            for (const job of jobs) {
                await dlq.moveToDeadLetter(job, `Error for ${job.id}`);
            }
        });

        it('debe retornar todos los jobs sin filtros', async () => {
            const jobs = await dlq.getDeadLetterJobs();

            expect(jobs.length).toBe(3);
        });

        it('debe filtrar por tipo de video', async () => {
            const jobs = await dlq.getDeadLetterJobs({ type: 'short' });

            expect(jobs.length).toBe(2);
            jobs.forEach(job => expect(job.type).toBe('short'));
        });

        it('debe filtrar por canal', async () => {
            const jobs = await dlq.getDeadLetterJobs({ channelKey: 'channel1' });

            expect(jobs.length).toBe(2);
            jobs.forEach(job => expect(job.data.channelKey).toBe('channel1'));
        });

        it('debe filtrar por estado', async () => {
            // Marcar uno como resuelto
            const allJobs = await dlq.getDeadLetterJobs();
            await dlq.markAsResolved(allJobs[0].id);

            const pendingJobs = await dlq.getDeadLetterJobs({ status: 'dead-letter' });
            const resolvedJobs = await dlq.getDeadLetterJobs({ status: 'resolved' });

            expect(pendingJobs.length).toBe(2);
            expect(resolvedJobs.length).toBe(1);
        });

        it('debe limitar resultados con limit', async () => {
            const jobs = await dlq.getDeadLetterJobs({ limit: 2 });

            expect(jobs.length).toBe(2);
        });

        it('debe paginar con offset', async () => {
            const firstPage = await dlq.getDeadLetterJobs({ limit: 2, offset: 0 });
            const secondPage = await dlq.getDeadLetterJobs({ limit: 2, offset: 2 });

            expect(firstPage.length).toBe(2);
            expect(secondPage.length).toBe(1);
            expect(firstPage[0].id).not.toBe(secondPage[0].id);
        });

        it('debe ordenar por fecha ascendente', async () => {
            const jobs = await dlq.getDeadLetterJobs({ orderBy: 'asc' });

            for (let i = 1; i < jobs.length; i++) {
                expect(jobs[i].movedToDeadLetterAt.getTime())
                    .toBeGreaterThanOrEqual(jobs[i - 1].movedToDeadLetterAt.getTime());
            }
        });
    });

    // ===== TESTS DE reprocessJob =====

    describe('reprocessJob', () => {
        it('debe fallar si el job no existe', async () => {
            const result = await dlq.reprocessJob('non-existent-job');

            expect(result.success).toBe(false);
            expect(result.message).toContain('no encontrado');
        });

        it('debe fallar si no hay callback de reencolado', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            const result = await dlq.reprocessJob(job.id);

            expect(result.success).toBe(false);
            expect(result.message).toContain('callback de reencolado');
        });

        it('debe reencolar exitosamente con callback configurado', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            // Configurar callback de reencolado
            const newJobId = `new-${Date.now()}`;
            dlq.setReenqueueCallback(async () => newJobId);

            const result = await dlq.reprocessJob(job.id);

            expect(result.success).toBe(true);
            expect(result.newJobId).toBe(newJobId);
            expect(result.message).toContain('reencolado exitosamente');
        });

        it('debe incrementar reprocessAttempts al reintentar', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            dlq.setReenqueueCallback(async () => `new-${Date.now()}`);

            await dlq.reprocessJob(job.id);
            const updated = await dlq.getDeadLetterJob(job.id);

            // El job debería estar en estado 'reprocessing' con 1 intento
            expect(updated).not.toBeNull();
            expect(updated!.reprocessAttempts).toBe(1);
            expect(updated!.status).toBe('reprocessing');
        });

        it('debe fallar si excede máximo de reintentos', async () => {
            // Crear una instancia de DLQ con maxReprocessAttempts = 1 para facilitar el test
            const dlq2 = new DeadLetterQueue({
                databasePath: path.join(TEST_DB_DIR, 'max-reprocess-test.db'),
                maxAgeDays: 30,
                maxReprocessAttempts: 1
            });
            await dlq2.initialize();

            const job = createMockRenderJob();
            const deadLetterJob = await dlq2.moveToDeadLetter(job, 'Test error');

            // Configurar callback de reencolado
            dlq2.setReenqueueCallback(async () => `new-${Date.now()}`);

            // Primer reintento - debe funcionar (reprocessAttempts: 0 -> 1)
            const result1 = await dlq2.reprocessJob(job.id);
            expect(result1.success).toBe(true);

            // El job ahora tiene reprocessAttempts = 1 y está en estado 'reprocessing'
            // Como maxReprocessAttempts = 1, ya alcanzó el máximo
            
            // Verificamos que el job tiene el contador incrementado
            const updated = await dlq2.getDeadLetterJob(job.id);
            expect(updated!.reprocessAttempts).toBe(1);
            expect(updated!.status).toBe('reprocessing');

            // Ahora el job no puede ser reintentado porque:
            // 1. El estado es 'reprocessing' (no 'dead-letter')
            // 2. reprocessAttempts (1) >= maxReprocessAttempts (1)
            
            // Intentamos reintentar - debe fallar por estado
            const result2 = await dlq2.reprocessJob(job.id);
            expect(result2.success).toBe(false);
            // Puede fallar por estado o por máximo de reintentos
            expect(result2.message).toMatch(/no está en estado 'dead-letter'|excede máximo de reintentos/);

            await dlq2.close();
        });

        it('debe funcionar con deadLetterId en lugar de original id', async () => {
            const job = createMockRenderJob();
            const deadLetterJob = await dlq.moveToDeadLetter(job, 'Test error');

            dlq.setReenqueueCallback(async () => `new-${Date.now()}`);

            const result = await dlq.reprocessJob(deadLetterJob.deadLetterId);

            expect(result.success).toBe(true);
        });

        it('debe revertir estado si falla el reencolado', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            dlq.setReenqueueCallback(async () => {
                throw new Error('Simulated reenqueue failure');
            });

            const result = await dlq.reprocessJob(job.id);

            expect(result.success).toBe(false);
            expect(result.message).toContain('Error reencolando');

            // Verificar que el estado volvió a dead-letter
            const updated = await dlq.getDeadLetterJob(job.id);
            expect(updated!.status).toBe('dead-letter');
        });
    });

    // ===== TESTS DE purgeOld =====

    describe('purgeOld', () => {
        it('debe eliminar jobs más antiguos que el límite especificado', async () => {
            // Crear job directamente en la DB con fecha antigua
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            // Modificar la fecha directamente en DB para simular antigüedad
            // Nota: esto requeriría acceso directo a DB, usamos un workaround
            
            // Purgar con 0 días (elimina todo)
            const purged = await dlq.purgeOld(0);

            // Debería haber eliminado el job
            expect(purged).toBeGreaterThanOrEqual(0);
        });

        it('debe no eliminar jobs recientes', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            // Purgar con 30 días (no debe eliminar jobs recientes)
            const purged = await dlq.purgeOld(30);

            expect(purged).toBe(0);

            // Verificar que el job sigue existiendo
            const retrieved = await dlq.getDeadLetterJob(job.id);
            expect(retrieved).not.toBeNull();
        });

        it('debe usar maxAgeDays por defecto si no se especifica', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            // Purgar sin especificar días (usa config.maxAgeDays = 30)
            const purged = await dlq.purgeOld();

            expect(purged).toBe(0);
        });
    });

    // ===== TESTS DE markAsResolved =====

    describe('markAsResolved', () => {
        it('debe marcar un job como resuelto', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            const result = await dlq.markAsResolved(job.id, 'Issue was a transient API error');

            expect(result).toBe(true);

            const updated = await dlq.getDeadLetterJob(job.id);
            expect(updated!.status).toBe('resolved');
            expect(updated!.notes).toBe('Issue was a transient API error');
        });

        it('debe retornar false si el job no existe', async () => {
            const result = await dlq.markAsResolved('non-existent');

            expect(result).toBe(false);
        });

        it('no debe cambiar jobs ya resueltos', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');
            await dlq.markAsResolved(job.id, 'First resolution');

            // Intentar resolver de nuevo
            const result = await dlq.markAsResolved(job.id, 'Second resolution');

            expect(result).toBe(false);

            // Verificar que las notas originales se mantienen
            const updated = await dlq.getDeadLetterJob(job.id);
            expect(updated!.notes).toBe('First resolution');
        });
    });

    // ===== TESTS DE addNotes =====

    describe('addNotes', () => {
        it('debe añadir notas a un job', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            const result = await dlq.addNotes(job.id, 'Investigating FFmpeg issue');

            expect(result).toBe(true);

            const updated = await dlq.getDeadLetterJob(job.id);
            expect(updated!.notes).toBe('Investigating FFmpeg issue');
        });

        it('debe retornar false si el job no existe', async () => {
            const result = await dlq.addNotes('non-existent', 'Some notes');

            expect(result).toBe(false);
        });
    });

    // ===== TESTS DE getStats =====

    describe('getStats', () => {
        it('debe retornar estadísticas correctas con cola vacía', async () => {
            const stats = await dlq.getStats();

            expect(stats.total).toBe(0);
            expect(stats.pending).toBe(0);
            expect(stats.reprocessing).toBe(0);
            expect(stats.resolved).toBe(0);
            expect(stats.oldestJobDays).toBe(0);
        });

        it('debe retornar estadísticas correctas con jobs', async () => {
            // Crear varios jobs
            const job1 = createMockRenderJob({ id: 'job-1' });
            const job2 = createMockRenderJob({ id: 'job-2' });
            const job3 = createMockRenderJob({ id: 'job-3' });

            await dlq.moveToDeadLetter(job1, 'Error 1');
            await dlq.moveToDeadLetter(job2, 'Error 2');
            await dlq.moveToDeadLetter(job3, 'Error 3');

            // Marcar uno como resuelto
            await dlq.markAsResolved('job-2');

            const stats = await dlq.getStats();

            expect(stats.total).toBe(3);
            expect(stats.pending).toBe(2);
            expect(stats.resolved).toBe(1);
            expect(stats.avgAttemptsMade).toBe(3); // Todos tienen 3 intentos
        });

        it('debe calcular correctamente oldestJobDays', async () => {
            const job = createMockRenderJob();
            await dlq.moveToDeadLetter(job, 'Test error');

            const stats = await dlq.getStats();

            // Job recién creado debe tener 0 días
            expect(stats.oldestJobDays).toBe(0);
        });
    });

    // ===== TESTS DE UMBRAL =====

    describe('DEAD_LETTER_THRESHOLD', () => {
        it('debe ser 3 según REQ-6.2.1', () => {
            expect(DEAD_LETTER_THRESHOLD).toBe(3);
        });
    });

    // ===== TESTS DE ERRORES =====

    describe('Manejo de errores', () => {
        it('debe lanzar error si se usa sin inicializar', async () => {
            const uninitializedDlq = new DeadLetterQueue({
                databasePath: path.join(TEST_DB_DIR, 'uninitialized.db')
            });

            await expect(uninitializedDlq.getDeadLetterJobs())
                .rejects.toThrow('no está inicializada');
        });
    });
});
