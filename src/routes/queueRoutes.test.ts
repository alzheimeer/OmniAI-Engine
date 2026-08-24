/**
 * Tests para queueRoutes.ts
 * 
 * Verifica los endpoints HTTP de la dead-letter queue y estado de cola:
 * - GET  /queue/status - Estado de la cola de renderizado (REQ-6.3.2)
 * - GET  /queue/dead-letter - Listar jobs
 * - GET  /queue/dead-letter/stats - Estadísticas
 * - GET  /queue/dead-letter/:jobId - Obtener job específico
 * - POST /queue/dead-letter/:jobId/reprocess - Reintentar job
 * - POST /queue/dead-letter/:jobId/resolve - Marcar como resuelto
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import queueRoutes from './queueRoutes';
import { DeadLetterQueue, deadLetterQueue } from '../infrastructure/DeadLetterQueue';
import { RenderJob, VideoType, ChannelKey, renderQueueManager, QueueStats } from '../infrastructure/RenderQueueManager';
import fs from 'fs';
import path from 'path';

// ===== CONFIGURACIÓN DE TEST =====

const TEST_DB_PATH = 'test-output/queue-routes-test/dead-letter.db';
let app: Express;

/**
 * Crea un job de prueba para mover a dead-letter.
 */
function createTestJob(overrides?: Partial<RenderJob>): RenderJob {
    const baseJob: RenderJob = {
        id: `test-job-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: 'short' as VideoType,
        data: {
            topic: 'Test Topic',
            language: 'es',
            channelKey: 'channel1' as ChannelKey
        },
        priority: 10,
        status: 'failed',
        attemptsMade: 3,
        createdAt: new Date(),
        completedAt: new Date()
    };
    return { ...baseJob, ...overrides };
}

// ===== SETUP Y TEARDOWN =====

beforeAll(async () => {
    // Crear directorio de test si no existe
    const testDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    // Configurar DeadLetterQueue para tests
    // Usar la instancia singleton pero apuntar a una DB de test
    const dlqConfig = {
        databasePath: TEST_DB_PATH,
        maxAgeDays: 30,
        maxReprocessAttempts: 3
    };

    // Reinicializar con configuración de test
    // Nota: En un escenario real, podríamos necesitar un método para reconfigurar
    // Por ahora, usamos directamente la instancia singleton que se inicializa con defaults

    // Crear app Express para tests
    app = express();
    app.use(express.json());
    app.use('/queue', queueRoutes);

    // Inicializar la dead-letter queue
    try {
        await deadLetterQueue.initialize();
    } catch (err) {
        // Si ya está inicializada, continuar
        console.log('DeadLetterQueue ya inicializada o error:', err);
    }
});

afterAll(async () => {
    // Cerrar conexión
    await deadLetterQueue.close();

    // Limpiar archivos de test
    try {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    } catch (err) {
        // Ignorar errores de limpieza
    }
});

// ===== TESTS =====

describe('GET /queue/dead-letter', () => {
    it('debería retornar lista vacía cuando no hay jobs', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
    });

    it('debería aceptar filtros válidos', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({
                status: 'dead-letter',
                type: 'short',
                limit: '10',
                offset: '0',
                orderBy: 'desc'
            })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.filters).toBeDefined();
        expect(response.body.data.filters.status).toBe('dead-letter');
        expect(response.body.data.filters.type).toBe('short');
    });

    it('debería rechazar status inválido', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({ status: 'invalid-status' })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Status inválido');
    });

    it('debería rechazar tipo de video inválido', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({ type: 'medium' })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Tipo inválido');
    });

    it('debería rechazar canal inválido', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({ channelKey: 'channel99' })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Canal inválido');
    });

    it('debería rechazar limit fuera de rango', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({ limit: '5000' })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Limit debe ser un número entre 1 y 1000');
    });

    it('debería rechazar offset negativo', async () => {
        const response = await request(app)
            .get('/queue/dead-letter')
            .query({ offset: '-5' })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Offset debe ser un número mayor o igual a 0');
    });
});

describe('GET /queue/dead-letter/stats', () => {
    it('debería retornar estadísticas', async () => {
        const response = await request(app)
            .get('/queue/dead-letter/stats')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(typeof response.body.data.total).toBe('number');
        expect(typeof response.body.data.pending).toBe('number');
        expect(typeof response.body.data.reprocessing).toBe('number');
        expect(typeof response.body.data.resolved).toBe('number');
        expect(typeof response.body.data.oldestJobDays).toBe('number');
        expect(typeof response.body.data.avgAttemptsMade).toBe('number');
    });
});

describe('GET /queue/dead-letter/:jobId', () => {
    it('debería retornar 404 para job inexistente', async () => {
        const response = await request(app)
            .get('/queue/dead-letter/nonexistent-job-id')
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Job no encontrado');
    });

    it('debería retornar job existente', async () => {
        // Primero, crear un job en dead-letter
        const testJob = createTestJob();
        await deadLetterQueue.moveToDeadLetter(testJob, 'Test error for API');

        const response = await request(app)
            .get(`/queue/dead-letter/${testJob.id}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.id).toBe(testJob.id);
        expect(response.body.data.failureInfo.message).toBe('Test error for API');
    });
});

describe('POST /queue/dead-letter/:jobId/reprocess', () => {
    it('debería retornar 400 para job inexistente', async () => {
        const response = await request(app)
            .post('/queue/dead-letter/nonexistent-job-id/reprocess')
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Job no encontrado');
    });

    it('debería fallar si no hay callback de reencolado', async () => {
        // Crear un job para intentar reprocesar
        const testJob = createTestJob();
        await deadLetterQueue.moveToDeadLetter(testJob, 'Test error for reprocess');

        const response = await request(app)
            .post(`/queue/dead-letter/${testJob.id}/reprocess`)
            .expect(400);

        expect(response.body.success).toBe(false);
        // Puede fallar por varias razones dependiendo del estado
        expect(response.body.error).toBeDefined();
    });
});

describe('POST /queue/dead-letter/:jobId/resolve', () => {
    it('debería retornar 404 para job inexistente', async () => {
        const response = await request(app)
            .post('/queue/dead-letter/nonexistent-job-id/resolve')
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Job no encontrado');
    });

    it('debería marcar job como resuelto', async () => {
        // Crear un job para resolver
        const testJob = createTestJob();
        await deadLetterQueue.moveToDeadLetter(testJob, 'Test error to resolve');

        const response = await request(app)
            .post(`/queue/dead-letter/${testJob.id}/resolve`)
            .send({ notes: 'Resuelto manualmente por test' })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('resolved');
        expect(response.body.message).toContain('marcado como resuelto');
    });

    it('debería marcar job como resuelto sin notas', async () => {
        const testJob = createTestJob();
        await deadLetterQueue.moveToDeadLetter(testJob, 'Test error to resolve without notes');

        const response = await request(app)
            .post(`/queue/dead-letter/${testJob.id}/resolve`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('resolved');
    });

    it('debería retornar 404 si job ya está resuelto', async () => {
        const testJob = createTestJob();
        await deadLetterQueue.moveToDeadLetter(testJob, 'Test error already resolved');
        
        // Resolver primero
        await request(app)
            .post(`/queue/dead-letter/${testJob.id}/resolve`)
            .expect(200);

        // Intentar resolver de nuevo
        const response = await request(app)
            .post(`/queue/dead-letter/${testJob.id}/resolve`)
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('ya resuelto');
    });
});

// ===== TESTS PARA GET /queue/status (REQ-6.3.2) =====

describe('GET /queue/status', () => {
    /**
     * Helper para crear estadísticas mock de la cola
     */
    function createMockStats(overrides?: Partial<QueueStats>): QueueStats {
        return {
            waiting: 5,
            active: 2,
            completed: 100,
            failed: 3,
            delayed: 1,
            ...overrides
        };
    }

    /**
     * Helper para crear jobs pendientes mock
     */
    function createMockPendingJobs(count: number): RenderJob[] {
        return Array.from({ length: count }, (_, i) => ({
            id: `pending-job-${i}`,
            type: 'short' as VideoType,
            data: {
                topic: `Test Topic ${i}`,
                language: 'es',
                channelKey: 'channel1' as ChannelKey
            },
            priority: i < 3 ? 1 : 10, // Primeros 3 alta prioridad
            status: 'pending' as const,
            attemptsMade: 0,
            createdAt: new Date()
        }));
    }

    beforeEach(() => {
        // Restaurar mocks antes de cada test
        vi.restoreAllMocks();
    });

    it('debería retornar estado básico de la cola sin includePending', async () => {
        // Mock de getStats
        const mockStats = createMockStats();
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);

        const response = await request(app)
            .get('/queue/status')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        
        // Verificar stats
        expect(response.body.data.stats).toEqual(mockStats);
        
        // Verificar summary
        const summary = response.body.data.summary;
        expect(summary.pending).toBe(mockStats.waiting + mockStats.delayed); // 5 + 1 = 6
        expect(summary.inProgress).toBe(mockStats.active); // 2
        expect(summary.completed).toBe(mockStats.completed); // 100
        expect(summary.failed).toBe(mockStats.failed); // 3
        expect(summary.total).toBe(mockStats.waiting + mockStats.active + mockStats.delayed); // 5 + 2 + 1 = 8
        
        // Verificar que no incluye pendingJobs por defecto
        expect(response.body.data.pendingJobs).toBeUndefined();
        
        // Verificar timestamp
        expect(response.body.data.timestamp).toBeDefined();
        expect(new Date(response.body.data.timestamp)).toBeInstanceOf(Date);
        
        // Verificar systemStatus
        expect(response.body.data.systemStatus).toBe('healthy');
    });

    it('debería retornar jobs pendientes cuando includePending=true', async () => {
        const mockStats = createMockStats();
        const mockPendingJobs = createMockPendingJobs(5);
        
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);
        vi.spyOn(renderQueueManager, 'getPendingJobs').mockResolvedValue(mockPendingJobs);

        const response = await request(app)
            .get('/queue/status')
            .query({ includePending: 'true' })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.pendingJobs).toBeDefined();
        expect(Array.isArray(response.body.data.pendingJobs)).toBe(true);
        expect(response.body.data.pendingJobs.length).toBe(5);
        
        // Verificar que getPendingJobs fue llamado con el limit por defecto (10)
        expect(renderQueueManager.getPendingJobs).toHaveBeenCalledWith(10);
    });

    it('debería respetar el parámetro limit para jobs pendientes', async () => {
        const mockStats = createMockStats();
        const mockPendingJobs = createMockPendingJobs(3);
        
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);
        vi.spyOn(renderQueueManager, 'getPendingJobs').mockResolvedValue(mockPendingJobs);

        const response = await request(app)
            .get('/queue/status')
            .query({ includePending: 'true', limit: '3' })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.pendingJobs).toHaveLength(3);
        
        // Verificar que getPendingJobs fue llamado con el limit especificado
        expect(renderQueueManager.getPendingJobs).toHaveBeenCalledWith(3);
    });

    it('debería limitar el parámetro limit a máximo 50', async () => {
        const mockStats = createMockStats();
        const mockPendingJobs = createMockPendingJobs(50);
        
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);
        vi.spyOn(renderQueueManager, 'getPendingJobs').mockResolvedValue(mockPendingJobs);

        const response = await request(app)
            .get('/queue/status')
            .query({ includePending: 'true', limit: '100' }) // Solicita 100, debe limitar a 50
            .expect(200);

        expect(response.body.success).toBe(true);
        
        // Verificar que getPendingJobs fue llamado con el máximo de 50
        expect(renderQueueManager.getPendingJobs).toHaveBeenCalledWith(50);
    });

    it('debería retornar systemStatus="degraded" cuando hay más de 50 jobs pendientes', async () => {
        const mockStats = createMockStats({ waiting: 55, delayed: 5 }); // 60 pendientes
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);

        const response = await request(app)
            .get('/queue/status')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.systemStatus).toBe('degraded');
        expect(response.body.data.summary.pending).toBe(60);
    });

    it('debería retornar systemStatus="overloaded" cuando hay más de 100 jobs pendientes', async () => {
        const mockStats = createMockStats({ waiting: 90, delayed: 15 }); // 105 pendientes
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);

        const response = await request(app)
            .get('/queue/status')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.systemStatus).toBe('overloaded');
    });

    it('debería retornar systemStatus="overloaded" cuando la tasa de fallos es alta', async () => {
        // Más de 10 fallidos y más del 20% de completados
        const mockStats = createMockStats({ 
            completed: 40, 
            failed: 15, // 15 > 40 * 0.2 = 8
            waiting: 10,
            delayed: 0 
        });
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);

        const response = await request(app)
            .get('/queue/status')
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.systemStatus).toBe('overloaded');
    });

    it('debería manejar error cuando la cola no está inicializada (503)', async () => {
        vi.spyOn(renderQueueManager, 'getStats').mockRejectedValue(
            new Error('RenderQueueManager no está inicializado. Llama a initialize() primero.')
        );

        const response = await request(app)
            .get('/queue/status')
            .expect(503);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Cola de renderizado no disponible');
        expect(response.body.message).toContain('no está inicializado');
    });

    it('debería manejar errores genéricos con 500', async () => {
        vi.spyOn(renderQueueManager, 'getStats').mockRejectedValue(
            new Error('Error de conexión a Redis')
        );

        const response = await request(app)
            .get('/queue/status')
            .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Error interno del servidor');
        expect(response.body.message).toBe('Error de conexión a Redis');
    });

    it('debería usar valores por defecto cuando los query params son inválidos', async () => {
        const mockStats = createMockStats();
        vi.spyOn(renderQueueManager, 'getStats').mockResolvedValue(mockStats);
        vi.spyOn(renderQueueManager, 'getPendingJobs').mockResolvedValue([]);

        const response = await request(app)
            .get('/queue/status')
            .query({ includePending: 'true', limit: 'invalid' }) // limit inválido
            .expect(200);

        expect(response.body.success).toBe(true);
        
        // Debe usar el default de 10 cuando el limit es inválido
        expect(renderQueueManager.getPendingJobs).toHaveBeenCalledWith(10);
    });
});

describe('Integración de flujo completo', () => {
    it('debería permitir listar, obtener detalles y resolver un job', async () => {
        // 1. Crear job en dead-letter
        const testJob = createTestJob({ 
            data: { 
                topic: 'Integration Test Topic', 
                language: 'en', 
                channelKey: 'channel2' 
            } 
        });
        await deadLetterQueue.moveToDeadLetter(testJob, 'Integration test error');

        // 2. Listar jobs
        const listResponse = await request(app)
            .get('/queue/dead-letter')
            .query({ channelKey: 'channel2' })
            .expect(200);

        expect(listResponse.body.success).toBe(true);
        const jobs = listResponse.body.data.jobs;
        const foundJob = jobs.find((j: { id: string }) => j.id === testJob.id);
        expect(foundJob).toBeDefined();

        // 3. Obtener detalles del job
        const detailResponse = await request(app)
            .get(`/queue/dead-letter/${testJob.id}`)
            .expect(200);

        expect(detailResponse.body.success).toBe(true);
        expect(detailResponse.body.data.data.topic).toBe('Integration Test Topic');

        // 4. Obtener estadísticas
        const statsResponse = await request(app)
            .get('/queue/dead-letter/stats')
            .expect(200);

        expect(statsResponse.body.success).toBe(true);
        expect(statsResponse.body.data.total).toBeGreaterThan(0);

        // 5. Resolver el job
        const resolveResponse = await request(app)
            .post(`/queue/dead-letter/${testJob.id}/resolve`)
            .send({ notes: 'Resuelto en test de integración' })
            .expect(200);

        expect(resolveResponse.body.success).toBe(true);

        // 6. Verificar que el job está resuelto
        const verifyResponse = await request(app)
            .get(`/queue/dead-letter/${testJob.id}`)
            .expect(200);

        expect(verifyResponse.body.data.status).toBe('resolved');
        expect(verifyResponse.body.data.notes).toBe('Resuelto en test de integración');
    });
});
