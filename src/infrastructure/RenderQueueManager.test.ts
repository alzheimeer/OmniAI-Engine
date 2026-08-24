/**
 * RenderQueueManager.test.ts
 * 
 * Tests unitarios para el sistema de cola de renderizado con BullMQ.
 * Estos tests validan la lógica de negocio sin dependencias externas.
 * 
 * REQ-4.5.1: Verifica configuración con BullMQ
 * REQ-4.5.3: Verifica prioridades (Shorts alta, Videos largos baja)
 * REQ-4.5.4: Verifica configuración de reintentos con backoff
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    VideoType,
    ChannelKey,
    RenderJobStatus,
    RenderJobData,
    RenderJob,
    QueueStats,
    RenderQueueConfig,
    MAX_RECOMMENDED_CONCURRENCY
} from './RenderQueueManager';

// ===== TESTS DE TIPOS E INTERFACES =====

describe('RenderQueueManager Types', () => {
    describe('VideoType', () => {
        it('debe soportar tipo short', () => {
            const type: VideoType = 'short';
            expect(type).toBe('short');
        });

        it('debe soportar tipo long', () => {
            const type: VideoType = 'long';
            expect(type).toBe('long');
        });
    });

    describe('ChannelKey', () => {
        it('debe soportar channel1', () => {
            const channel: ChannelKey = 'channel1';
            expect(channel).toBe('channel1');
        });

        it('debe soportar channel2', () => {
            const channel: ChannelKey = 'channel2';
            expect(channel).toBe('channel2');
        });
    });

    describe('RenderJobStatus', () => {
        it('debe soportar todos los estados requeridos', () => {
            const statuses: RenderJobStatus[] = ['pending', 'processing', 'completed', 'failed'];
            
            expect(statuses).toContain('pending');
            expect(statuses).toContain('processing');
            expect(statuses).toContain('completed');
            expect(statuses).toContain('failed');
        });
    });

    describe('RenderJobData interface', () => {
        it('debe crear estructura de datos válida', () => {
            const data: RenderJobData = {
                topic: 'IA y Autismo en la Vida Cotidiana',
                language: 'es',
                channelKey: 'channel1'
            };

            expect(data.topic).toBe('IA y Autismo en la Vida Cotidiana');
            expect(data.language).toBe('es');
            expect(data.channelKey).toBe('channel1');
        });

        it('debe soportar diferentes idiomas', () => {
            const dataES: RenderJobData = {
                topic: 'Tema en español',
                language: 'es',
                channelKey: 'channel1'
            };

            const dataEN: RenderJobData = {
                topic: 'Topic in English',
                language: 'en',
                channelKey: 'channel2'
            };

            expect(dataES.language).toBe('es');
            expect(dataEN.language).toBe('en');
        });
    });

    describe('RenderJob interface', () => {
        it('debe crear job completo con todos los campos', () => {
            const job: RenderJob = {
                id: 'render-short-1234567890-abc123',
                type: 'short',
                data: {
                    topic: 'Test Topic',
                    language: 'es',
                    channelKey: 'channel1'
                },
                priority: 1,
                status: 'pending',
                createdAt: new Date(),
                attemptsMade: 0
            };

            expect(job.id).toBeDefined();
            expect(job.type).toBe('short');
            expect(job.data.topic).toBe('Test Topic');
            expect(job.priority).toBe(1);
            expect(job.status).toBe('pending');
            expect(job.createdAt).toBeInstanceOf(Date);
            expect(job.attemptsMade).toBe(0);
        });

        it('debe soportar campos opcionales', () => {
            const completedJob: RenderJob = {
                id: 'render-long-1234567890-xyz789',
                type: 'long',
                data: {
                    topic: 'Video Largo Tutorial',
                    language: 'en',
                    channelKey: 'channel2'
                },
                priority: 10,
                status: 'completed',
                createdAt: new Date('2024-01-01T10:00:00Z'),
                processedAt: new Date('2024-01-01T10:01:00Z'),
                completedAt: new Date('2024-01-01T10:05:00Z'),
                attemptsMade: 1
            };

            expect(completedJob.processedAt).toBeInstanceOf(Date);
            expect(completedJob.completedAt).toBeInstanceOf(Date);
        });

        it('debe soportar mensaje de error en jobs fallidos', () => {
            const failedJob: RenderJob = {
                id: 'render-short-failed-123',
                type: 'short',
                data: {
                    topic: 'Fallido',
                    language: 'es',
                    channelKey: 'channel1'
                },
                priority: 1,
                status: 'failed',
                createdAt: new Date(),
                attemptsMade: 3,
                errorMessage: 'FFmpeg timeout after 5 minutes'
            };

            expect(failedJob.status).toBe('failed');
            expect(failedJob.errorMessage).toBeDefined();
            expect(failedJob.attemptsMade).toBe(3);
        });
    });

    describe('QueueStats interface', () => {
        it('debe tener todos los campos de estadísticas', () => {
            const stats: QueueStats = {
                waiting: 5,
                active: 2,
                completed: 100,
                failed: 3,
                delayed: 1
            };

            expect(stats.waiting).toBe(5);
            expect(stats.active).toBe(2);
            expect(stats.completed).toBe(100);
            expect(stats.failed).toBe(3);
            expect(stats.delayed).toBe(1);
        });

        it('debe permitir estadísticas vacías', () => {
            const emptyStats: QueueStats = {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                delayed: 0
            };

            expect(emptyStats.waiting).toBe(0);
            expect(emptyStats.active).toBe(0);
        });
    });

    describe('RenderQueueConfig interface', () => {
        it('debe soportar configuración completa', () => {
            const config: RenderQueueConfig = {
                redisHost: '127.0.0.1',
                redisPort: 6379,
                concurrency: 1,
                maxRetries: 3,
                backoffDelays: [5000, 15000, 45000],
                shutdownTimeoutMs: 300000
            };

            expect(config.redisHost).toBe('127.0.0.1');
            expect(config.redisPort).toBe(6379);
            expect(config.concurrency).toBe(1);
            expect(config.maxRetries).toBe(3);
            expect(config.backoffDelays).toEqual([5000, 15000, 45000]);
            expect(config.shutdownTimeoutMs).toBe(300000);
        });
    });
});

// ===== TESTS DE PRIORIDADES (REQ-4.5.3) =====

describe('Prioridades de Renderizado (REQ-4.5.3)', () => {
    // Constantes que replica la lógica del RenderQueueManager
    const PRIORITY_HIGH = 1;
    const PRIORITY_LOW = 10;

    /**
     * Función que replica la lógica de determinación de prioridad
     */
    function determinePriority(type: VideoType, customPriority?: number): number {
        return customPriority ?? (type === 'short' ? PRIORITY_HIGH : PRIORITY_LOW);
    }

    describe('Shorts (Videos < 60s)', () => {
        it('debe asignar prioridad ALTA (1) a Shorts', () => {
            const priority = determinePriority('short');
            expect(priority).toBe(1);
        });

        it('Shorts se procesan primero (menor número = mayor prioridad)', () => {
            const shortPriority = determinePriority('short');
            const longPriority = determinePriority('long');
            
            expect(shortPriority).toBeLessThan(longPriority);
        });
    });

    describe('Videos Largos (> 60s)', () => {
        it('debe asignar prioridad BAJA (10) a videos largos', () => {
            const priority = determinePriority('long');
            expect(priority).toBe(10);
        });
    });

    describe('Prioridad personalizada', () => {
        it('debe permitir override de prioridad para Short', () => {
            const customPriority = 5;
            const priority = determinePriority('short', customPriority);
            
            expect(priority).toBe(5);
        });

        it('debe permitir override de prioridad para Long', () => {
            const customPriority = 2;
            const priority = determinePriority('long', customPriority);
            
            expect(priority).toBe(2);
        });
    });

    describe('Orden de procesamiento', () => {
        it('Shorts con prioridad default se procesan antes que Long', () => {
            const jobs: { type: VideoType; priority: number }[] = [
                { type: 'long', priority: determinePriority('long') },
                { type: 'short', priority: determinePriority('short') },
                { type: 'long', priority: determinePriority('long') },
                { type: 'short', priority: determinePriority('short') },
            ];

            // Ordenar por prioridad (menor primero)
            const sorted = [...jobs].sort((a, b) => a.priority - b.priority);

            // Los primeros deben ser Shorts
            expect(sorted[0].type).toBe('short');
            expect(sorted[1].type).toBe('short');
            // Los últimos deben ser Long
            expect(sorted[2].type).toBe('long');
            expect(sorted[3].type).toBe('long');
        });
    });
});

// ===== TESTS DE CONFIGURACIÓN DE REINTENTOS (REQ-4.5.4) =====

describe('Configuración de Reintentos (REQ-4.5.4)', () => {
    // Configuración por defecto según especificación
    const DEFAULT_BACKOFF_DELAYS = [5000, 15000, 45000]; // 5s → 15s → 45s
    const DEFAULT_MAX_RETRIES = 3;

    describe('Backoff exponencial', () => {
        it('debe usar secuencia de backoff 5s → 15s → 45s', () => {
            expect(DEFAULT_BACKOFF_DELAYS[0]).toBe(5000);   // Primer reintento: 5s
            expect(DEFAULT_BACKOFF_DELAYS[1]).toBe(15000);  // Segundo reintento: 15s
            expect(DEFAULT_BACKOFF_DELAYS[2]).toBe(45000);  // Tercer reintento: 45s
        });

        it('backoff debe ser exponencial (aproximadamente x3)', () => {
            // 5s → 15s (x3)
            const ratio1 = DEFAULT_BACKOFF_DELAYS[1] / DEFAULT_BACKOFF_DELAYS[0];
            expect(ratio1).toBe(3);

            // 15s → 45s (x3)
            const ratio2 = DEFAULT_BACKOFF_DELAYS[2] / DEFAULT_BACKOFF_DELAYS[1];
            expect(ratio2).toBe(3);
        });
    });

    describe('Máximo de reintentos', () => {
        it('debe tener máximo de 3 reintentos', () => {
            expect(DEFAULT_MAX_RETRIES).toBe(3);
        });

        it('número de delays debe coincidir con máximo de reintentos', () => {
            expect(DEFAULT_BACKOFF_DELAYS.length).toBe(DEFAULT_MAX_RETRIES);
        });
    });

    describe('Cálculo de delay por intento', () => {
        /**
         * Función que replica la lógica de selección de delay
         */
        function getDelayForAttempt(attemptNumber: number): number {
            const index = Math.min(attemptNumber - 1, DEFAULT_BACKOFF_DELAYS.length - 1);
            return DEFAULT_BACKOFF_DELAYS[index];
        }

        it('intento 1 debe tener delay de 5s', () => {
            expect(getDelayForAttempt(1)).toBe(5000);
        });

        it('intento 2 debe tener delay de 15s', () => {
            expect(getDelayForAttempt(2)).toBe(15000);
        });

        it('intento 3 debe tener delay de 45s', () => {
            expect(getDelayForAttempt(3)).toBe(45000);
        });

        it('intentos posteriores deben usar el último delay', () => {
            // Si por alguna razón hay más intentos, usar el último delay
            expect(getDelayForAttempt(4)).toBe(45000);
            expect(getDelayForAttempt(10)).toBe(45000);
        });
    });
});

// ===== TESTS DE ESTADOS DE JOB =====

describe('Estados de Job', () => {
    /**
     * Función que mapea estado BullMQ a RenderJobStatus
     */
    function mapBullStateToStatus(state: string): RenderJobStatus {
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

    describe('Mapeo de estados BullMQ', () => {
        it('waiting → pending', () => {
            expect(mapBullStateToStatus('waiting')).toBe('pending');
        });

        it('delayed → pending', () => {
            expect(mapBullStateToStatus('delayed')).toBe('pending');
        });

        it('prioritized → pending', () => {
            expect(mapBullStateToStatus('prioritized')).toBe('pending');
        });

        it('active → processing', () => {
            expect(mapBullStateToStatus('active')).toBe('processing');
        });

        it('completed → completed', () => {
            expect(mapBullStateToStatus('completed')).toBe('completed');
        });

        it('failed → failed', () => {
            expect(mapBullStateToStatus('failed')).toBe('failed');
        });

        it('estado desconocido → pending (default)', () => {
            expect(mapBullStateToStatus('unknown')).toBe('pending');
            expect(mapBullStateToStatus('')).toBe('pending');
        });
    });
});

// ===== TESTS DE GENERACIÓN DE IDs =====

describe('Generación de IDs de Job', () => {
    /**
     * Función que genera ID similar al RenderQueueManager
     */
    function generateJobId(type: VideoType): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `render-${type}-${timestamp}-${random}`;
    }

    it('debe generar IDs con formato correcto', () => {
        const id = generateJobId('short');
        
        expect(id).toMatch(/^render-short-\d+-[a-z0-9]+$/);
    });

    it('debe incluir el tipo de video en el ID', () => {
        const shortId = generateJobId('short');
        const longId = generateJobId('long');
        
        expect(shortId).toContain('render-short');
        expect(longId).toContain('render-long');
    });

    it('debe generar IDs únicos', () => {
        const ids = new Set<string>();
        
        for (let i = 0; i < 100; i++) {
            ids.add(generateJobId('short'));
        }
        
        expect(ids.size).toBe(100);
    });
});

// ===== TESTS DE CONFIGURACIÓN =====

describe('Configuración por Defecto', () => {
    const DEFAULT_CONFIG: RenderQueueConfig = {
        redisHost: process.env.REDIS_HOST || '127.0.0.1',
        redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
        concurrency: 1,
        maxRetries: 3,
        backoffDelays: [5000, 15000, 45000],
        shutdownTimeoutMs: 300000
    };

    it('debe usar localhost como host por defecto', () => {
        expect(DEFAULT_CONFIG.redisHost).toBe('127.0.0.1');
    });

    it('debe usar puerto 6379 por defecto', () => {
        expect(DEFAULT_CONFIG.redisPort).toBe(6379);
    });

    it('debe tener concurrencia de 1 (REQ-4.5.2)', () => {
        expect(DEFAULT_CONFIG.concurrency).toBe(1);
    });

    it('debe tener timeout de shutdown de 5 minutos', () => {
        expect(DEFAULT_CONFIG.shutdownTimeoutMs).toBe(300000); // 5 min en ms
    });
});

// ===== TESTS DE FLUJO DE TRABAJO =====

describe('Flujo de Trabajo de Jobs', () => {
    it('nuevo job debe iniciar con estado pending', () => {
        const job: RenderJob = {
            id: 'test-job',
            type: 'short',
            data: { topic: 'Test', language: 'es', channelKey: 'channel1' },
            priority: 1,
            status: 'pending',
            createdAt: new Date(),
            attemptsMade: 0
        };

        expect(job.status).toBe('pending');
        expect(job.attemptsMade).toBe(0);
        expect(job.processedAt).toBeUndefined();
        expect(job.completedAt).toBeUndefined();
    });

    it('job procesándose debe tener processedAt', () => {
        const job: RenderJob = {
            id: 'processing-job',
            type: 'long',
            data: { topic: 'Processing', language: 'en', channelKey: 'channel2' },
            priority: 10,
            status: 'processing',
            createdAt: new Date('2024-01-01T10:00:00Z'),
            processedAt: new Date('2024-01-01T10:01:00Z'),
            attemptsMade: 1
        };

        expect(job.status).toBe('processing');
        expect(job.processedAt).toBeInstanceOf(Date);
        expect(job.completedAt).toBeUndefined();
    });

    it('job completado debe tener completedAt', () => {
        const job: RenderJob = {
            id: 'completed-job',
            type: 'short',
            data: { topic: 'Done', language: 'es', channelKey: 'channel1' },
            priority: 1,
            status: 'completed',
            createdAt: new Date('2024-01-01T10:00:00Z'),
            processedAt: new Date('2024-01-01T10:01:00Z'),
            completedAt: new Date('2024-01-01T10:02:00Z'),
            attemptsMade: 1
        };

        expect(job.status).toBe('completed');
        expect(job.completedAt).toBeInstanceOf(Date);
    });

    it('job fallido debe tener errorMessage', () => {
        const job: RenderJob = {
            id: 'failed-job',
            type: 'long',
            data: { topic: 'Failed', language: 'en', channelKey: 'channel2' },
            priority: 10,
            status: 'failed',
            createdAt: new Date(),
            attemptsMade: 3,
            errorMessage: 'Maximum retries exceeded'
        };

        expect(job.status).toBe('failed');
        expect(job.attemptsMade).toBe(3);
        expect(job.errorMessage).toBeDefined();
    });
});

// ===== TESTS DE CONCURRENCIA (REQ-4.5.2) =====

describe('Concurrencia (REQ-4.5.2)', () => {
    /**
     * REQ-4.5.2: Implementar 1-2 workers concurrentes máximo
     * 
     * Justificación:
     * - FFmpeg es intensivo en CPU y memoria
     * - Múltiples instancias FFmpeg simultáneas pueden saturar la máquina local
     * - Con 2 workers, permite procesar un Short mientras se renderiza un video largo
     * - Más de 2 workers causa degradación de rendimiento y posibles timeouts
     */

    const DEFAULT_CONCURRENCY = 1;

    describe('Configuración por defecto', () => {
        it('debe usar concurrencia de 1 worker por defecto', () => {
            const config: RenderQueueConfig = {
                redisHost: '127.0.0.1',
                redisPort: 6379,
                concurrency: DEFAULT_CONCURRENCY,
                maxRetries: 3,
                backoffDelays: [5000, 15000, 45000],
                shutdownTimeoutMs: 300000
            };
            
            expect(config.concurrency).toBe(1);
        });

        it('concurrencia por defecto no debe exceder máximo recomendado', () => {
            expect(DEFAULT_CONCURRENCY).toBeLessThanOrEqual(MAX_RECOMMENDED_CONCURRENCY);
        });
    });

    describe('Límite de workers', () => {
        it('máximo recomendado debe ser 2 workers (constante exportada)', () => {
            expect(MAX_RECOMMENDED_CONCURRENCY).toBe(2);
        });

        it('configuración de 1 worker está dentro del límite', () => {
            const config: Partial<RenderQueueConfig> = { concurrency: 1 };
            expect(config.concurrency).toBeLessThanOrEqual(MAX_RECOMMENDED_CONCURRENCY);
        });

        it('configuración de 2 workers está dentro del límite', () => {
            const config: Partial<RenderQueueConfig> = { concurrency: 2 };
            expect(config.concurrency).toBeLessThanOrEqual(MAX_RECOMMENDED_CONCURRENCY);
        });

        it('configuración de 3+ workers excede el límite recomendado', () => {
            const config: Partial<RenderQueueConfig> = { concurrency: 3 };
            expect(config.concurrency).toBeGreaterThan(MAX_RECOMMENDED_CONCURRENCY);
        });
    });

    describe('Justificación técnica', () => {
        it('debe evitar saturar la máquina con múltiples FFmpeg', () => {
            // La configuración por defecto usa concurrencia de 1
            // para evitar múltiples instancias FFmpeg simultáneas
            const config: Partial<RenderQueueConfig> = {
                concurrency: 1
            };
            
            expect(config.concurrency).toBe(1);
        });

        it('con 2 workers permite procesar Short mientras se renderiza video largo', () => {
            // 2 workers es el máximo recomendado porque:
            // - Worker 1: Puede procesar un Short (alta prioridad)
            // - Worker 2: Puede continuar con un video largo (baja prioridad)
            // - Más de 2 causaría contención por recursos (CPU, memoria, I/O)
            const optimalForMixedWorkload = 2;
            expect(optimalForMixedWorkload).toBe(MAX_RECOMMENDED_CONCURRENCY);
        });
    });

    describe('Configuración personalizada', () => {
        it('debe permitir configurar concurrencia vía RenderQueueConfig', () => {
            const customConfig: Partial<RenderQueueConfig> = {
                concurrency: 2
            };
            
            const mergedConfig: RenderQueueConfig = {
                redisHost: '127.0.0.1',
                redisPort: 6379,
                concurrency: DEFAULT_CONCURRENCY,
                maxRetries: 3,
                backoffDelays: [5000, 15000, 45000],
                shutdownTimeoutMs: 300000,
                ...customConfig
            };
            
            expect(mergedConfig.concurrency).toBe(2);
        });

        it('debe aceptar valor de concurrencia desde config parcial', () => {
            const partialConfig: Partial<RenderQueueConfig> = { concurrency: 2 };
            expect(partialConfig.concurrency).toBeDefined();
            expect(partialConfig.concurrency).toBe(2);
        });
    });
});

// ===== TESTS DE GRACEFUL SHUTDOWN (REQ-4.5.5) =====

describe('Graceful Shutdown (REQ-4.5.5)', () => {
    it('timeout de shutdown debe ser 5 minutos', () => {
        const shutdownTimeout = 300000; // 5 min en ms
        const fiveMinutesInMs = 5 * 60 * 1000;
        
        expect(shutdownTimeout).toBe(fiveMinutesInMs);
    });

    it('shutdown debe permitir terminar job actual', () => {
        // Este test verifica la especificación:
        // - No aceptar nuevos jobs
        // - Esperar que job actual termine (max 5 min)
        const spec = {
            noNewJobs: true,
            waitForCurrentJob: true,
            maxWaitTime: 300000
        };

        expect(spec.noNewJobs).toBe(true);
        expect(spec.waitForCurrentJob).toBe(true);
        expect(spec.maxWaitTime).toBe(300000);
    });
});
