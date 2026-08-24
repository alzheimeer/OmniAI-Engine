/**
 * RetryHandler.test.ts
 * 
 * Tests unitarios para el sistema de reintentos con backoff exponencial.
 * Verifica funcionalidad de retry, backoff, jitter, y manejo de errores.
 * 
 * REQ-4.4.1: Crear RetryHandler con backoff exponencial configurable
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryHandler, RetryConfig, RetryError, RetryResult } from './RetryHandler';
import { Logger } from './Logger';

// Deshabilitar logging durante tests
beforeEach(() => {
    Logger.configure({
        logsDir: 'test-logs-retry',
        console: false,
        level: 'error'
    });
});

describe('RetryHandler', () => {
    describe('Creación de instancias', () => {
        it('debe crear handler con configuración por defecto', () => {
            const handler = new RetryHandler();
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(3);
            expect(config.baseDelayMs).toBe(1000);
            expect(config.backoffFactor).toBe(2);
            expect(config.maxDelayMs).toBe(30000);
            expect(config.jitter).toBe(true);
        });

        it('debe aceptar configuración parcial', () => {
            const handler = new RetryHandler({ maxRetries: 5, baseDelayMs: 500 });
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(5);
            expect(config.baseDelayMs).toBe(500);
            // Valores por defecto para el resto
            expect(config.backoffFactor).toBe(2);
            expect(config.jitter).toBe(true);
        });

        it('debe aceptar configuración completa', () => {
            const customConfig: Partial<RetryConfig> = {
                maxRetries: 5,
                baseDelayMs: 500,
                backoffFactor: 3,
                maxDelayMs: 10000,
                jitter: false,
                nonRetryableErrors: [400, 401, 'CustomError'],
                timeoutMs: 5000
            };
            
            const handler = new RetryHandler(customConfig);
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(5);
            expect(config.baseDelayMs).toBe(500);
            expect(config.backoffFactor).toBe(3);
            expect(config.maxDelayMs).toBe(10000);
            expect(config.jitter).toBe(false);
            expect(config.nonRetryableErrors).toEqual([400, 401, 'CustomError']);
            expect(config.timeoutMs).toBe(5000);
        });
    });

    describe('execute() - Ejecución básica', () => {
        it('debe ejecutar operación exitosa sin reintentos', async () => {
            const handler = new RetryHandler({ maxRetries: 3 });
            const operation = vi.fn().mockResolvedValue('success');
            
            const result = await handler.execute(operation, 'TestOp');
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('debe retornar resultado de operación exitosa', async () => {
            const handler = new RetryHandler();
            const expectedData = { id: 1, name: 'test' };
            const operation = vi.fn().mockResolvedValue(expectedData);
            
            const result = await handler.execute(operation, 'TestOp');
            
            expect(result).toEqual(expectedData);
        });

        it('debe reintentar operación que falla inicialmente', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 3, 
                baseDelayMs: 10, // Delay bajo para tests rápidos
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo temporal'))
                .mockResolvedValue('success');
            
            const result = await handler.execute(operation, 'TestOp');
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('debe reintentar múltiples veces antes de éxito', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 5, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo 1'))
                .mockRejectedValueOnce(new Error('Fallo 2'))
                .mockRejectedValueOnce(new Error('Fallo 3'))
                .mockResolvedValue('success');
            
            const result = await handler.execute(operation, 'TestOp');
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(4);
        });
    });

    describe('execute() - Fallos y RetryError', () => {
        it('debe lanzar RetryError cuando se agotan los reintentos', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 2, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const operation = vi.fn().mockRejectedValue(new Error('Fallo permanente'));
            
            await expect(handler.execute(operation, 'FailingOp'))
                .rejects.toThrow(RetryError);
            
            // 1 intento inicial + 2 reintentos = 3 llamadas
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('RetryError debe contener información del fallo', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 2, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const originalError = new Error('Error original');
            const operation = vi.fn().mockRejectedValue(originalError);
            
            try {
                await handler.execute(operation, 'FailingOp');
                expect.fail('Debería haber lanzado error');
            } catch (error) {
                expect(error).toBeInstanceOf(RetryError);
                const retryError = error as RetryError;
                
                expect(retryError.operationName).toBe('FailingOp');
                expect(retryError.attempts).toBe(3);
                expect(retryError.lastError.message).toBe('Error original');
                expect(retryError.allErrors).toHaveLength(3);
                expect(retryError.totalTimeMs).toBeGreaterThan(0);
            }
        });

        it('debe incluir todos los errores en allErrors', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 2, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockRejectedValueOnce(new Error('Error 3'));
            
            try {
                await handler.execute(operation, 'FailingOp');
                expect.fail('Debería haber lanzado error');
            } catch (error) {
                const retryError = error as RetryError;
                expect(retryError.allErrors).toHaveLength(3);
                expect(retryError.allErrors[0].message).toBe('Error 1');
                expect(retryError.allErrors[1].message).toBe('Error 2');
                expect(retryError.allErrors[2].message).toBe('Error 3');
            }
        });
    });

    describe('executeWithResult() - Métricas detalladas', () => {
        it('debe retornar métricas de ejecución exitosa', async () => {
            const handler = new RetryHandler({ maxRetries: 3 });
            const operation = vi.fn().mockResolvedValue('success');
            
            const result = await handler.executeWithResult(operation, 'TestOp');
            
            expect(result.result).toBe('success');
            expect(result.attempts).toBe(1);
            expect(result.hadRetries).toBe(false);
            expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('debe indicar hadRetries=true cuando hubo reintentos', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 3, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo'))
                .mockResolvedValue('success');
            
            const result = await handler.executeWithResult(operation, 'TestOp');
            
            expect(result.result).toBe('success');
            expect(result.attempts).toBe(2);
            expect(result.hadRetries).toBe(true);
        });

        it('debe medir tiempo total incluyendo delays', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 2, 
                baseDelayMs: 50,
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo'))
                .mockResolvedValue('success');
            
            const result = await handler.executeWithResult(operation, 'TestOp');
            
            // Debe incluir el delay de ~50ms
            expect(result.totalTimeMs).toBeGreaterThanOrEqual(40);
        });
    });

    describe('calculateDelay() - Backoff exponencial', () => {
        it('debe calcular delay exponencial correctamente', () => {
            const handler = new RetryHandler({ 
                baseDelayMs: 100, 
                backoffFactor: 2,
                maxDelayMs: 10000,
                jitter: false 
            });
            
            // Intento 1: 100 * 2^0 = 100
            expect(handler.calculateDelay(1)).toBe(100);
            // Intento 2: 100 * 2^1 = 200
            expect(handler.calculateDelay(2)).toBe(200);
            // Intento 3: 100 * 2^2 = 400
            expect(handler.calculateDelay(3)).toBe(400);
            // Intento 4: 100 * 2^3 = 800
            expect(handler.calculateDelay(4)).toBe(800);
        });

        it('debe respetar maxDelayMs', () => {
            const handler = new RetryHandler({ 
                baseDelayMs: 1000, 
                backoffFactor: 2,
                maxDelayMs: 3000,
                jitter: false 
            });
            
            // Intento 1: 1000
            expect(handler.calculateDelay(1)).toBe(1000);
            // Intento 2: 2000
            expect(handler.calculateDelay(2)).toBe(2000);
            // Intento 3: 4000 -> limitado a 3000
            expect(handler.calculateDelay(3)).toBe(3000);
            // Intento 4: 8000 -> limitado a 3000
            expect(handler.calculateDelay(4)).toBe(3000);
        });

        it('debe añadir jitter cuando está habilitado', () => {
            const handler = new RetryHandler({ 
                baseDelayMs: 1000, 
                backoffFactor: 2,
                maxDelayMs: 10000,
                jitter: true 
            });
            
            const delays: number[] = [];
            for (let i = 0; i < 10; i++) {
                delays.push(handler.calculateDelay(1));
            }
            
            // Con jitter, los delays deberían variar
            const uniqueDelays = new Set(delays);
            expect(uniqueDelays.size).toBeGreaterThan(1);
            
            // Todos los delays deben estar en rango ±25%
            const baseDelay = 1000;
            const minDelay = baseDelay * 0.75;
            const maxDelay = baseDelay * 1.25;
            
            delays.forEach(delay => {
                expect(delay).toBeGreaterThanOrEqual(minDelay - 1);
                expect(delay).toBeLessThanOrEqual(maxDelay + 1);
            });
        });

        it('debe producir delays consistentes sin jitter', () => {
            const handler = new RetryHandler({ 
                baseDelayMs: 100, 
                backoffFactor: 2,
                jitter: false 
            });
            
            const delays1 = handler.calculateDelay(1);
            const delays2 = handler.calculateDelay(1);
            
            expect(delays1).toBe(delays2);
            expect(delays1).toBe(100);
        });
    });

    describe('isRetryable() - Clasificación de errores', () => {
        it('debe clasificar errores de red como retryable', () => {
            const handler = new RetryHandler();
            
            const networkErrors = [
                Object.assign(new Error('Connection error'), { code: 'ECONNRESET' }),
                Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }),
                Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' }),
                new Error('Network timeout occurred'),
                new Error('Socket hang up')
            ];
            
            networkErrors.forEach(error => {
                expect(handler.isRetryable(error)).toBe(true);
            });
        });

        it('debe clasificar errores HTTP 5xx como retryable', () => {
            const handler = new RetryHandler();
            
            const serverErrors = [
                Object.assign(new Error('Internal Server Error'), { status: 500 }),
                Object.assign(new Error('Bad Gateway'), { status: 502 }),
                Object.assign(new Error('Service Unavailable'), { status: 503 }),
                Object.assign(new Error('Gateway Timeout'), { status: 504 }),
                new Error('HTTP 500 error occurred')
            ];
            
            serverErrors.forEach(error => {
                expect(handler.isRetryable(error)).toBe(true);
            });
        });

        it('debe clasificar HTTP 429 (rate limit) como retryable', () => {
            const handler = new RetryHandler();
            
            const rateLimitErrors = [
                Object.assign(new Error('Too Many Requests'), { status: 429 }),
                new Error('Rate limit exceeded'),
                new Error('Too many requests, please try again later')
            ];
            
            rateLimitErrors.forEach(error => {
                expect(handler.isRetryable(error)).toBe(true);
            });
        });

        it('debe clasificar errores 4xx configurados como non-retryable', () => {
            const handler = new RetryHandler({
                nonRetryableErrors: [400, 401, 403, 404]
            });
            
            const clientErrors = [
                Object.assign(new Error('Bad Request'), { status: 400 }),
                Object.assign(new Error('Unauthorized'), { status: 401 }),
                Object.assign(new Error('Forbidden'), { status: 403 }),
                Object.assign(new Error('Not Found'), { status: 404 })
            ];
            
            clientErrors.forEach(error => {
                expect(handler.isRetryable(error)).toBe(false);
            });
        });

        it('debe respetar nonRetryableErrors personalizados', () => {
            const handler = new RetryHandler({
                nonRetryableErrors: [409, 'ConflictError']
            });
            
            const conflictError = Object.assign(new Error('Conflict'), { status: 409 });
            const customError = new Error('Custom error');
            customError.name = 'ConflictError';
            
            expect(handler.isRetryable(conflictError)).toBe(false);
            expect(handler.isRetryable(customError)).toBe(false);
        });

        it('debe manejar errores de Axios correctamente', () => {
            const handler = new RetryHandler();
            
            const axiosError = Object.assign(new Error('Request failed'), {
                response: { status: 503 }
            });
            
            expect(handler.isRetryable(axiosError)).toBe(true);
            
            const axiosError401 = Object.assign(new Error('Unauthorized'), {
                response: { status: 401 }
            });
            
            expect(handler.isRetryable(axiosError401)).toBe(false);
        });
    });

    describe('Opciones de ejecución', () => {
        it('debe llamar onRetry callback en cada reintento', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 3, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const onRetry = vi.fn();
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo 1'))
                .mockRejectedValueOnce(new Error('Fallo 2'))
                .mockResolvedValue('success');
            
            await handler.execute(operation, 'TestOp', { onRetry });
            
            expect(onRetry).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
            expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
        });

        it('debe usar isRetryable personalizado cuando se proporciona', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 3, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            // Forzar que un error normalmente retryable no lo sea
            const customIsRetryable = vi.fn().mockReturnValue(false);
            const operation = vi.fn().mockRejectedValue(new Error('Network error'));
            
            await expect(handler.execute(operation, 'TestOp', { 
                isRetryable: customIsRetryable 
            })).rejects.toThrow(RetryError);
            
            // Solo debería intentar una vez porque isRetryable retorna false
            expect(operation).toHaveBeenCalledTimes(1);
            expect(customIsRetryable).toHaveBeenCalled();
        });
    });

    describe('Errores non-retryable', () => {
        it('debe fallar inmediatamente con errores non-retryable', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 5, 
                baseDelayMs: 10,
                nonRetryableErrors: [401]
            });
            
            const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
            const operation = vi.fn().mockRejectedValue(authError);
            
            await expect(handler.execute(operation, 'AuthOp'))
                .rejects.toThrow(RetryError);
            
            // Solo debe intentar una vez
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('debe fallar inmediatamente con errores de validación', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 5, 
                baseDelayMs: 10,
                nonRetryableErrors: [400, 422]
            });
            
            const validationError = Object.assign(
                new Error('Validation failed: invalid input'), 
                { status: 400 }
            );
            const operation = vi.fn().mockRejectedValue(validationError);
            
            await expect(handler.execute(operation, 'ValidateOp'))
                .rejects.toThrow(RetryError);
            
            expect(operation).toHaveBeenCalledTimes(1);
        });
    });

    describe('forAPI() - Presets por API', () => {
        it('debe crear handler preconfigurado para DeepSeek', () => {
            const handler = RetryHandler.forAPI('DeepSeek');
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(3);
            expect(config.baseDelayMs).toBe(2000);
            expect(config.backoffFactor).toBe(2);
        });

        it('debe crear handler preconfigurado para Pexels con más reintentos', () => {
            const handler = RetryHandler.forAPI('Pexels');
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(5);
            expect(config.maxDelayMs).toBe(60000);
        });

        it('debe crear handler preconfigurado para GoogleTTS', () => {
            const handler = RetryHandler.forAPI('GoogleTTS');
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(3);
            expect(config.baseDelayMs).toBe(1000);
        });

        it('debe crear handler preconfigurado para YouTube', () => {
            const handler = RetryHandler.forAPI('YouTube');
            const config = handler.getConfig();
            
            expect(config.maxRetries).toBe(3);
            expect(config.backoffFactor).toBe(2.5);
            expect(config.nonRetryableErrors).toContain(409);
            expect(config.nonRetryableErrors).toContain(410);
        });
    });

    describe('Timeout', () => {
        it('debe lanzar error cuando operación excede timeout', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 1, 
                baseDelayMs: 10,
                timeoutMs: 50
            });
            
            // Operación que tarda más que el timeout
            const slowOperation = () => new Promise<string>((resolve) => {
                setTimeout(() => resolve('done'), 200);
            });
            
            await expect(handler.execute(slowOperation, 'SlowOp'))
                .rejects.toThrow(/Timeout/);
        });

        it('debe completar operación rápida dentro de timeout', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 1,
                timeoutMs: 1000
            });
            
            const fastOperation = () => Promise.resolve('fast result');
            
            const result = await handler.execute(fastOperation, 'FastOp');
            expect(result).toBe('fast result');
        });
    });

    describe('Integración con Logger', () => {
        it('debe aceptar metadatos adicionales para logging', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 2, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Fallo'))
                .mockResolvedValue('success');
            
            const result = await handler.execute(
                operation, 
                'TestOp',
                { 
                    meta: { 
                        correlationId: 'test-123',
                        component: 'TestComponent' 
                    } 
                }
            );
            
            expect(result).toBe('success');
        });
    });

    describe('Casos edge', () => {
        it('debe manejar operaciones que lanzan strings', async () => {
            const handler = new RetryHandler({ 
                maxRetries: 1, 
                baseDelayMs: 10,
                jitter: false 
            });
            
            // eslint-disable-next-line prefer-promise-reject-errors
            const operation = vi.fn().mockRejectedValue('String error');
            
            await expect(handler.execute(operation, 'StringErrorOp'))
                .rejects.toThrow(RetryError);
        });

        it('debe manejar maxRetries = 0', async () => {
            const handler = new RetryHandler({ maxRetries: 0 });
            
            const operation = vi.fn().mockRejectedValue(new Error('Fallo'));
            
            await expect(handler.execute(operation, 'NoRetryOp'))
                .rejects.toThrow(RetryError);
            
            // Solo el intento inicial, sin reintentos
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('debe manejar operación que resuelve a undefined', async () => {
            const handler = new RetryHandler();
            const operation = vi.fn().mockResolvedValue(undefined);
            
            const result = await handler.execute(operation, 'UndefinedOp');
            expect(result).toBeUndefined();
        });

        it('debe manejar operación que resuelve a null', async () => {
            const handler = new RetryHandler();
            const operation = vi.fn().mockResolvedValue(null);
            
            const result = await handler.execute(operation, 'NullOp');
            expect(result).toBeNull();
        });
    });
});
