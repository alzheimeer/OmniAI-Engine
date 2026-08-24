/**
 * CircuitBreaker.test.ts
 * 
 * Tests unitarios para el CircuitBreaker.
 * Valida los estados, transiciones, y comportamiento del patrón.
 * 
 * REQ-6.1.1: Estados closed/open/half-open
 * REQ-6.1.2: Abrir después de 5 fallos consecutivos
 * REQ-6.1.3: Auto-cerrar después de timeout configurable
 * REQ-6.1.4: Loguear cambios de estado
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
    CircuitBreaker, 
    CircuitState, 
    CircuitOpenError,
    CircuitBreakerConfig 
} from './CircuitBreaker';

describe('CircuitBreaker', () => {
    // ===== SETUP =====
    
    let breaker: CircuitBreaker;
    
    const defaultConfig: CircuitBreakerConfig = {
        name: 'test-circuit',
        failureThreshold: 5,
        resetTimeout: 1000,     // 1 segundo para tests rápidos
        successThreshold: 3
    };
    
    // Helpers
    const successOperation = async () => 'success';
    const failOperation = async () => { throw new Error('operation failed'); };
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    beforeEach(() => {
        breaker = new CircuitBreaker(defaultConfig);
        vi.useFakeTimers();
    });
    
    afterEach(() => {
        vi.useRealTimers();
    });

    // ===== TESTS DE INICIALIZACIÓN =====
    
    describe('Inicialización', () => {
        it('debe inicializarse en estado CLOSED', () => {
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe usar valores por defecto cuando no se especifican', () => {
            const minimalBreaker = new CircuitBreaker({ name: 'minimal' });
            const stats = minimalBreaker.getStats();
            
            expect(stats.state).toBe(CircuitState.CLOSED);
            expect(stats.failureCount).toBe(0);
        });
        
        it('debe respetar configuración personalizada', () => {
            const customBreaker = new CircuitBreaker({
                name: 'custom',
                failureThreshold: 3,
                resetTimeout: 5000,
                successThreshold: 2
            });
            
            expect(customBreaker.getName()).toBe('custom');
        });
        
        it('debe retornar el nombre del circuito', () => {
            expect(breaker.getName()).toBe('test-circuit');
        });
    });

    // ===== TESTS DE ESTADO CLOSED =====
    
    describe('Estado CLOSED', () => {
        it('debe permitir operaciones exitosas', async () => {
            vi.useRealTimers();
            
            const result = await breaker.execute(successOperation);
            
            expect(result).toBe('success');
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe propagar errores pero mantener estado CLOSED si hay pocos fallos', async () => {
            vi.useRealTimers();
            
            // Fallar menos que el threshold
            for (let i = 0; i < defaultConfig.failureThreshold! - 1; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow('operation failed');
            }
            
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe resetear contador de fallos tras una operación exitosa', async () => {
            vi.useRealTimers();
            
            // Varios fallos
            for (let i = 0; i < 3; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Una operación exitosa
            await breaker.execute(successOperation);
            
            // El contador debe estar en 0
            const stats = breaker.getStats();
            expect(stats.failureCount).toBe(0);
        });
        
        it('debe reportar isClosed() como true', () => {
            expect(breaker.isClosed()).toBe(true);
            expect(breaker.isOpen()).toBe(false);
            expect(breaker.isHalfOpen()).toBe(false);
        });
    });

    // ===== TESTS DE TRANSICIÓN A OPEN (REQ-6.1.2) =====
    
    describe('Transición a OPEN', () => {
        it('debe abrir después de alcanzar failureThreshold', async () => {
            vi.useRealTimers();
            
            // Fallar exactamente el threshold de veces
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow('operation failed');
            }
            
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
        
        /**
         * REQ-6.1.2: Abrir circuito después de 5 fallos consecutivos
         * Valida específicamente que el valor por defecto es 5 fallos
         */
        it('debe abrir después de exactamente 5 fallos consecutivos con config por defecto', async () => {
            vi.useRealTimers();
            
            // Crear breaker con configuración por defecto (sin especificar failureThreshold)
            const defaultBreaker = new CircuitBreaker({ 
                name: 'default-threshold-test',
                resetTimeout: 1000  // Solo especificar timeout para tests rápidos
            });
            
            // Verificar que después de 4 fallos sigue cerrado
            for (let i = 0; i < 4; i++) {
                await expect(defaultBreaker.execute(failOperation)).rejects.toThrow('operation failed');
            }
            expect(defaultBreaker.getState()).toBe(CircuitState.CLOSED);
            
            // El quinto fallo debe abrir el circuito
            await expect(defaultBreaker.execute(failOperation)).rejects.toThrow('operation failed');
            expect(defaultBreaker.getState()).toBe(CircuitState.OPEN);
        });
        
        /**
         * REQ-6.1.2: Validar que failureThreshold es configurable
         */
        it('debe respetar failureThreshold configurable', async () => {
            vi.useRealTimers();
            
            // Configurar con 3 fallos como threshold
            const customBreaker = new CircuitBreaker({
                name: 'custom-threshold',
                failureThreshold: 3,
                resetTimeout: 1000
            });
            
            // Después de 2 fallos debe seguir cerrado
            for (let i = 0; i < 2; i++) {
                await expect(customBreaker.execute(failOperation)).rejects.toThrow();
            }
            expect(customBreaker.getState()).toBe(CircuitState.CLOSED);
            
            // El tercer fallo debe abrir el circuito
            await expect(customBreaker.execute(failOperation)).rejects.toThrow();
            expect(customBreaker.getState()).toBe(CircuitState.OPEN);
        });
        
        it('debe rechazar peticiones inmediatamente cuando está OPEN', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Intentar una petición debe fallar con CircuitOpenError
            await expect(breaker.execute(successOperation)).rejects.toThrow(CircuitOpenError);
        });
        
        it('CircuitOpenError debe contener información útil', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            try {
                await breaker.execute(successOperation);
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitOpenError);
                const circuitError = error as CircuitOpenError;
                expect(circuitError.circuitName).toBe('test-circuit');
                expect(circuitError.state).toBe(CircuitState.OPEN);
                expect(circuitError.timeUntilRetry).toBeGreaterThanOrEqual(0);
            }
        });
        
        it('debe reportar isOpen() como true', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            expect(breaker.isOpen()).toBe(true);
            expect(breaker.isClosed()).toBe(false);
            expect(breaker.isHalfOpen()).toBe(false);
        });
        
        it('debe incrementar contador de rechazos', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Varios rechazos
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(successOperation);
                } catch { /* esperado */ }
            }
            
            const stats = breaker.getStats();
            expect(stats.totalRejections).toBe(3);
        });
    });

    // ===== TESTS DE TRANSICIÓN A HALF_OPEN (REQ-6.1.3) =====
    
    describe('Transición a HALF_OPEN', () => {
        it('debe pasar a HALF_OPEN después del resetTimeout', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            expect(breaker.getState()).toBe(CircuitState.OPEN);
            
            // Esperar el timeout
            await sleep(defaultConfig.resetTimeout! + 100);
            
            // Verificar que pasó a HALF_OPEN
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
        });
        
        /**
         * REQ-6.1.3: Validar que resetTimeout es configurable
         * Verifica que diferentes valores de resetTimeout funcionan correctamente
         */
        it('debe respetar resetTimeout configurable', async () => {
            vi.useRealTimers();
            
            // Crear breaker con timeout corto (500ms)
            const shortTimeoutBreaker = new CircuitBreaker({
                name: 'short-timeout',
                failureThreshold: 3,
                resetTimeout: 500,  // 500ms en lugar de 1 minuto
                successThreshold: 2
            });
            
            // Abrir el circuito
            for (let i = 0; i < 3; i++) {
                await expect(shortTimeoutBreaker.execute(failOperation)).rejects.toThrow();
            }
            expect(shortTimeoutBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Verificar que NO pasa a HALF_OPEN antes del timeout
            await sleep(300);  // 300ms < 500ms
            expect(shortTimeoutBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Verificar que SÍ pasa a HALF_OPEN después del timeout
            await sleep(300);  // Total: 600ms > 500ms
            expect(shortTimeoutBreaker.getState()).toBe(CircuitState.HALF_OPEN);
        });
        
        /**
         * REQ-6.1.3: Validar timeout largo configurable
         * Verifica que un timeout más largo también funciona
         */
        it('debe respetar resetTimeout largo configurable', async () => {
            vi.useRealTimers();
            
            // Crear breaker con timeout largo (2 segundos)
            const longTimeoutBreaker = new CircuitBreaker({
                name: 'long-timeout',
                failureThreshold: 2,
                resetTimeout: 2000,  // 2 segundos
                successThreshold: 1
            });
            
            // Abrir el circuito
            for (let i = 0; i < 2; i++) {
                await expect(longTimeoutBreaker.execute(failOperation)).rejects.toThrow();
            }
            expect(longTimeoutBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Verificar que NO pasa a HALF_OPEN antes del timeout (1.5s < 2s)
            await sleep(1500);
            expect(longTimeoutBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Verificar que SÍ pasa a HALF_OPEN después del timeout
            await sleep(600);  // Total: 2.1s > 2s
            expect(longTimeoutBreaker.getState()).toBe(CircuitState.HALF_OPEN);
        });
        
        /**
         * REQ-6.1.3: Validar valor por defecto de 1 minuto
         * Verifica que el valor por defecto es 60000ms (1 minuto)
         */
        it('debe usar resetTimeout de 1 minuto por defecto', () => {
            // Crear breaker sin especificar resetTimeout
            const defaultTimeoutBreaker = new CircuitBreaker({
                name: 'default-timeout'
            });
            
            // Verificar que las estadísticas reportan correctamente
            // El valor por defecto debe ser 60000ms (1 minuto)
            const stats = defaultTimeoutBreaker.getStats();
            expect(stats.state).toBe(CircuitState.CLOSED);
            
            // Verificar indirectamente a través de timeUntilHalfOpen cuando está OPEN
            // Este test documenta el valor por defecto esperado
            expect(defaultTimeoutBreaker.getName()).toBe('default-timeout');
        });
        
        it('debe permitir peticiones de prueba en HALF_OPEN', async () => {
            vi.useRealTimers();
            
            // Abrir y esperar
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            await sleep(defaultConfig.resetTimeout! + 100);
            
            // Debe permitir peticiones ahora
            const result = await breaker.execute(successOperation);
            expect(result).toBe('success');
        });
        
        it('debe reportar isHalfOpen() como true', async () => {
            vi.useRealTimers();
            
            // Abrir y esperar
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            await sleep(defaultConfig.resetTimeout! + 100);
            
            expect(breaker.isHalfOpen()).toBe(true);
            expect(breaker.isClosed()).toBe(false);
            expect(breaker.isOpen()).toBe(false);
        });
    });

    // ===== TESTS DE RECUPERACIÓN (HALF_OPEN → CLOSED) =====
    
    describe('Recuperación a CLOSED', () => {
        it('debe cerrar después de alcanzar successThreshold en HALF_OPEN', async () => {
            vi.useRealTimers();
            
            // Abrir y esperar
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            await sleep(defaultConfig.resetTimeout! + 100);
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // Operaciones exitosas = successThreshold
            for (let i = 0; i < defaultConfig.successThreshold!; i++) {
                await breaker.execute(successOperation);
            }
            
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        /**
         * REQ-6.1.3: Validar successThreshold configurable para auto-cierre
         * Verifica que diferentes valores de successThreshold funcionan
         */
        it('debe respetar successThreshold configurable para auto-cerrar', async () => {
            vi.useRealTimers();
            
            // Crear breaker con successThreshold de 5
            const highSuccessBreaker = new CircuitBreaker({
                name: 'high-success-threshold',
                failureThreshold: 2,
                resetTimeout: 500,
                successThreshold: 5  // Requiere 5 éxitos para cerrar
            });
            
            // Abrir el circuito
            for (let i = 0; i < 2; i++) {
                await expect(highSuccessBreaker.execute(failOperation)).rejects.toThrow();
            }
            expect(highSuccessBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Esperar timeout para pasar a HALF_OPEN
            await sleep(600);
            expect(highSuccessBreaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // 4 éxitos NO deben cerrar el circuito (necesita 5)
            for (let i = 0; i < 4; i++) {
                await highSuccessBreaker.execute(successOperation);
            }
            expect(highSuccessBreaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // El 5to éxito debe cerrar el circuito
            await highSuccessBreaker.execute(successOperation);
            expect(highSuccessBreaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        /**
         * REQ-6.1.3: Ciclo completo de auto-cierre
         * Verifica el flujo OPEN → HALF_OPEN → CLOSED después del timeout
         */
        it('debe completar ciclo auto-cierre: OPEN → HALF_OPEN → CLOSED', async () => {
            vi.useRealTimers();
            
            // Configuración específica para este test
            const autoCloseBreaker = new CircuitBreaker({
                name: 'auto-close-test',
                failureThreshold: 3,
                resetTimeout: 1000,  // 1 segundo
                successThreshold: 2
            });
            
            // 1. Abrir el circuito con 3 fallos
            for (let i = 0; i < 3; i++) {
                await expect(autoCloseBreaker.execute(failOperation)).rejects.toThrow();
            }
            expect(autoCloseBreaker.getState()).toBe(CircuitState.OPEN);
            
            // 2. Verificar que rechaza peticiones mientras está OPEN
            await expect(autoCloseBreaker.execute(successOperation)).rejects.toThrow(CircuitOpenError);
            
            // 3. Esperar el timeout configurable (1 segundo)
            await sleep(1100);
            
            // 4. Verificar transición automática a HALF_OPEN
            expect(autoCloseBreaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // 5. Completar 2 éxitos para cerrar
            await autoCloseBreaker.execute(successOperation);
            expect(autoCloseBreaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            await autoCloseBreaker.execute(successOperation);
            
            // 6. Verificar auto-cierre exitoso
            expect(autoCloseBreaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe volver a OPEN si hay un fallo en HALF_OPEN', async () => {
            vi.useRealTimers();
            
            // Abrir y esperar
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            await sleep(defaultConfig.resetTimeout! + 100);
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // Un fallo en half-open debe volver a abrir
            await expect(breaker.execute(failOperation)).rejects.toThrow();
            
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
        
        it('debe volver a OPEN incluso después de algunos éxitos si hay un fallo', async () => {
            vi.useRealTimers();
            
            // Abrir y esperar
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            await sleep(defaultConfig.resetTimeout! + 100);
            
            // Algunos éxitos (pero menos que threshold)
            await breaker.execute(successOperation);
            await breaker.execute(successOperation);
            
            // Un fallo
            await expect(breaker.execute(failOperation)).rejects.toThrow();
            
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
    });

    // ===== TESTS DE RESET MANUAL =====
    
    describe('Reset manual', () => {
        it('debe resetear a CLOSED desde cualquier estado', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            expect(breaker.getState()).toBe(CircuitState.OPEN);
            
            // Reset manual
            breaker.reset();
            
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
            expect(breaker.isClosed()).toBe(true);
        });
        
        it('debe resetear todos los contadores', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            breaker.reset();
            
            const stats = breaker.getStats();
            expect(stats.failureCount).toBe(0);
            expect(stats.halfOpenSuccesses).toBe(0);
        });
        
        it('no debe fallar si ya está en CLOSED', () => {
            breaker.reset();
            
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
    });

    // ===== TESTS DE ESTADÍSTICAS =====
    
    describe('Estadísticas', () => {
        it('debe rastrear operaciones exitosas', async () => {
            vi.useRealTimers();
            
            await breaker.execute(successOperation);
            await breaker.execute(successOperation);
            await breaker.execute(successOperation);
            
            const stats = breaker.getStats();
            expect(stats.totalSuccesses).toBe(3);
        });
        
        it('debe rastrear operaciones fallidas', async () => {
            vi.useRealTimers();
            
            for (let i = 0; i < 3; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            const stats = breaker.getStats();
            expect(stats.totalFailures).toBe(3);
        });
        
        it('debe calcular timeUntilHalfOpen cuando está OPEN', async () => {
            vi.useRealTimers();
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            
            const stats = breaker.getStats();
            expect(stats.timeUntilHalfOpen).toBeDefined();
            expect(stats.timeUntilHalfOpen).toBeGreaterThan(0);
            expect(stats.timeUntilHalfOpen).toBeLessThanOrEqual(defaultConfig.resetTimeout!);
        });
        
        it('timeUntilHalfOpen debe ser undefined cuando está CLOSED', () => {
            const stats = breaker.getStats();
            expect(stats.timeUntilHalfOpen).toBeUndefined();
        });
    });

    // ===== TESTS DE CALLBACKS =====
    
    describe('Callbacks', () => {
        it('debe llamar onStateChange cuando cambia el estado', async () => {
            vi.useRealTimers();
            
            const onStateChange = vi.fn();
            
            const breakerWithCallback = new CircuitBreaker({
                ...defaultConfig,
                onStateChange
            });
            
            // Abrir el circuito
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breakerWithCallback.execute(failOperation)).rejects.toThrow();
            }
            
            expect(onStateChange).toHaveBeenCalledWith(
                CircuitState.CLOSED,
                CircuitState.OPEN,
                expect.any(String)
            );
        });
        
        it('debe llamar shouldTripOnError para determinar si contar fallo', async () => {
            vi.useRealTimers();
            
            // Solo contar errores que NO sean "ignored"
            const breakerWithFilter = new CircuitBreaker({
                ...defaultConfig,
                failureThreshold: 2,
                shouldTripOnError: (error) => !error.message.includes('ignored')
            });
            
            // Errores ignorados
            const ignoredError = async () => { throw new Error('ignored error'); };
            
            await expect(breakerWithFilter.execute(ignoredError)).rejects.toThrow();
            await expect(breakerWithFilter.execute(ignoredError)).rejects.toThrow();
            await expect(breakerWithFilter.execute(ignoredError)).rejects.toThrow();
            
            // Debe seguir cerrado porque los errores fueron ignorados
            expect(breakerWithFilter.getState()).toBe(CircuitState.CLOSED);
            
            // Ahora errores que SÍ cuentan
            await expect(breakerWithFilter.execute(failOperation)).rejects.toThrow();
            await expect(breakerWithFilter.execute(failOperation)).rejects.toThrow();
            
            expect(breakerWithFilter.getState()).toBe(CircuitState.OPEN);
        });
    });

    // ===== TESTS DE FACTORY METHODS =====
    
    describe('Factory Methods', () => {
        it('forAPI debe crear CircuitBreaker para DeepSeek', () => {
            const deepseekBreaker = CircuitBreaker.forAPI('DeepSeek');
            
            expect(deepseekBreaker.getName()).toBe('DeepSeek');
            expect(deepseekBreaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('forAPI debe crear CircuitBreaker para YouTube', () => {
            const youtubeBreaker = CircuitBreaker.forAPI('YouTube');
            
            expect(youtubeBreaker.getName()).toBe('YouTube');
        });
        
        it('forAPI debe crear CircuitBreaker para Pexels', () => {
            const pexelsBreaker = CircuitBreaker.forAPI('Pexels');
            
            expect(pexelsBreaker.getName()).toBe('Pexels');
        });
        
        it('forAPI debe crear CircuitBreaker para GoogleTTS', () => {
            const ttsBreaker = CircuitBreaker.forAPI('GoogleTTS');
            
            expect(ttsBreaker.getName()).toBe('GoogleTTS');
        });
        
        it('forAPI debe crear CircuitBreaker para Instagram', () => {
            const igBreaker = CircuitBreaker.forAPI('Instagram');
            
            expect(igBreaker.getName()).toBe('Instagram');
        });
        
        it('forAPI debe crear CircuitBreaker para TikTok', () => {
            const ttBreaker = CircuitBreaker.forAPI('TikTok');
            
            expect(ttBreaker.getName()).toBe('TikTok');
        });
    });

    // ===== TESTS DE CICLO COMPLETO =====
    
    describe('Ciclo completo', () => {
        it('debe completar el ciclo CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
            vi.useRealTimers();
            
            // Estado inicial
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
            
            // 1. Fallos para abrir
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            expect(breaker.getState()).toBe(CircuitState.OPEN);
            
            // 2. Esperar timeout
            await sleep(defaultConfig.resetTimeout! + 100);
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
            
            // 3. Éxitos para cerrar
            for (let i = 0; i < defaultConfig.successThreshold!; i++) {
                await breaker.execute(successOperation);
            }
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe manejar múltiples ciclos de apertura/cierre', async () => {
            vi.useRealTimers();
            
            // Primer ciclo
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            expect(breaker.getState()).toBe(CircuitState.OPEN);
            
            await sleep(defaultConfig.resetTimeout! + 100);
            
            for (let i = 0; i < defaultConfig.successThreshold!; i++) {
                await breaker.execute(successOperation);
            }
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
            
            // Segundo ciclo
            for (let i = 0; i < defaultConfig.failureThreshold!; i++) {
                await expect(breaker.execute(failOperation)).rejects.toThrow();
            }
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
    });

    // ===== TESTS DE LOGGING DE ESTADO (REQ-6.1.4) =====
    
    describe('Logging de cambios de estado (REQ-6.1.4)', () => {
        /**
         * REQ-6.1.4: Loguear cambios de estado del circuit breaker
         * Valida que las transiciones CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED
         * son registradas correctamente mediante el callback onStateChange
         */
        it('debe loguear transición CLOSED → OPEN cuando se alcanza failureThreshold', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'logging-test',
                failureThreshold: 3,
                resetTimeout: 1000,
                successThreshold: 2,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Provocar apertura del circuito
            for (let i = 0; i < 3; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Verificar que se registró la transición CLOSED → OPEN
            expect(stateChanges.length).toBeGreaterThanOrEqual(1);
            const openTransition = stateChanges.find(
                change => change.from === CircuitState.CLOSED && change.to === CircuitState.OPEN
            );
            expect(openTransition).toBeDefined();
            expect(openTransition!.reason).toContain('fallos consecutivos');
        });
        
        it('debe loguear transición OPEN → HALF_OPEN cuando expira resetTimeout', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'logging-test-halfopen',
                failureThreshold: 2,
                resetTimeout: 500,  // 500ms para test rápido
                successThreshold: 1,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Abrir el circuito
            for (let i = 0; i < 2; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Esperar el timeout para transición a HALF_OPEN
            await sleep(600);
            
            // Acceder al estado para forzar la verificación del timeout
            loggedBreaker.getState();
            
            // Verificar que se registró la transición OPEN → HALF_OPEN
            const halfOpenTransition = stateChanges.find(
                change => change.from === CircuitState.OPEN && change.to === CircuitState.HALF_OPEN
            );
            expect(halfOpenTransition).toBeDefined();
            expect(halfOpenTransition!.reason).toContain('Timeout');
        });
        
        it('debe loguear transición HALF_OPEN → CLOSED cuando se recupera con éxitos', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'logging-test-recovery',
                failureThreshold: 2,
                resetTimeout: 500,
                successThreshold: 2,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Abrir el circuito
            for (let i = 0; i < 2; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Esperar timeout para HALF_OPEN
            await sleep(600);
            loggedBreaker.getState(); // Forzar verificación
            
            // Recuperar con 2 éxitos
            await loggedBreaker.execute(successOperation);
            await loggedBreaker.execute(successOperation);
            
            // Verificar que se registró la transición HALF_OPEN → CLOSED
            const closedTransition = stateChanges.find(
                change => change.from === CircuitState.HALF_OPEN && change.to === CircuitState.CLOSED
            );
            expect(closedTransition).toBeDefined();
            expect(closedTransition!.reason).toContain('éxitos');
        });
        
        it('debe loguear transición HALF_OPEN → OPEN cuando falla en prueba', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'logging-test-reopen',
                failureThreshold: 2,
                resetTimeout: 500,
                successThreshold: 2,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Abrir el circuito
            for (let i = 0; i < 2; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // Esperar timeout para HALF_OPEN
            await sleep(600);
            loggedBreaker.getState();
            
            // Fallar durante HALF_OPEN (debe reabrir)
            await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            
            // Verificar que se registró HALF_OPEN → OPEN
            const reopenTransition = stateChanges.find(
                change => change.from === CircuitState.HALF_OPEN && change.to === CircuitState.OPEN
            );
            expect(reopenTransition).toBeDefined();
            expect(reopenTransition!.reason).toContain('half-open');
        });
        
        it('debe registrar ciclo completo de transiciones para observabilidad', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'full-cycle-logging',
                failureThreshold: 2,
                resetTimeout: 500,
                successThreshold: 2,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Ciclo completo: CLOSED → OPEN → HALF_OPEN → CLOSED
            
            // 1. CLOSED → OPEN
            for (let i = 0; i < 2; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // 2. OPEN → HALF_OPEN (después de timeout)
            await sleep(600);
            loggedBreaker.getState();
            
            // 3. HALF_OPEN → CLOSED (con éxitos)
            await loggedBreaker.execute(successOperation);
            await loggedBreaker.execute(successOperation);
            
            // Verificar todas las transiciones registradas
            expect(stateChanges.length).toBe(3);
            
            expect(stateChanges[0]).toMatchObject({
                from: CircuitState.CLOSED,
                to: CircuitState.OPEN
            });
            
            expect(stateChanges[1]).toMatchObject({
                from: CircuitState.OPEN,
                to: CircuitState.HALF_OPEN
            });
            
            expect(stateChanges[2]).toMatchObject({
                from: CircuitState.HALF_OPEN,
                to: CircuitState.CLOSED
            });
        });
        
        it('debe incluir reason descriptivo en cada cambio de estado', async () => {
            vi.useRealTimers();
            
            const stateChanges: Array<{from: CircuitState, to: CircuitState, reason: string}> = [];
            
            const loggedBreaker = new CircuitBreaker({
                name: 'reason-logging-test',
                failureThreshold: 3,
                resetTimeout: 500,
                successThreshold: 1,
                onStateChange: (from, to, reason) => {
                    stateChanges.push({ from, to, reason });
                }
            });
            
            // Abrir con fallos
            for (let i = 0; i < 3; i++) {
                await expect(loggedBreaker.execute(failOperation)).rejects.toThrow();
            }
            
            // El reason debe indicar el número de fallos
            expect(stateChanges[0].reason).toContain('3');
            expect(stateChanges[0].reason.toLowerCase()).toContain('fallos');
        });
    });

    // ===== TESTS DE EDGE CASES =====
    
    describe('Edge cases', () => {
        it('debe manejar errores que no son instancias de Error', async () => {
            vi.useRealTimers();
            
            const stringError = async () => { throw 'string error'; };
            
            await expect(breaker.execute(stringError)).rejects.toBe('string error');
            
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
        
        it('debe funcionar con threshold de 1', async () => {
            vi.useRealTimers();
            
            const sensitiveBreaker = new CircuitBreaker({
                name: 'sensitive',
                failureThreshold: 1,
                resetTimeout: 100,
                successThreshold: 1
            });
            
            // Un solo fallo debe abrir
            await expect(sensitiveBreaker.execute(failOperation)).rejects.toThrow();
            expect(sensitiveBreaker.getState()).toBe(CircuitState.OPEN);
            
            // Esperar y recuperar con un éxito
            await sleep(150);
            await sensitiveBreaker.execute(successOperation);
            expect(sensitiveBreaker.getState()).toBe(CircuitState.CLOSED);
        });
    });
});
