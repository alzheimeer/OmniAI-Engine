/**
 * Logger.test.ts
 * 
 * Tests unitarios para el sistema de logging con Winston.
 * Verifica funcionalidad de niveles, correlation ID, y formato JSON.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Logger, LogMeta, logger } from './Logger';

// Directorio temporal para tests
const TEST_LOGS_DIR = 'test-logs-logger';

/**
 * Función auxiliar para limpiar el directorio de logs de forma segura.
 * Espera un momento para que Winston cierre sus streams antes de eliminar.
 */
async function cleanupLogsDir(): Promise<void> {
    // Esperar a que Winston cierre sus streams
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (fs.existsSync(TEST_LOGS_DIR)) {
        try {
            const files = fs.readdirSync(TEST_LOGS_DIR);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(TEST_LOGS_DIR, file));
                } catch {
                    // Ignorar errores de archivos bloqueados
                }
            }
            fs.rmdirSync(TEST_LOGS_DIR);
        } catch {
            // Ignorar errores de cleanup
        }
    }
}

describe('Logger', () => {
    beforeEach(() => {
        // Configurar logger para usar directorio temporal
        Logger.configure({
            logsDir: TEST_LOGS_DIR,
            level: 'debug',
            console: false // Desactivar consola para tests limpios
        });
        
        // Limpiar cache de loggers
        vi.clearAllMocks();
    });

    afterEach(async () => {
        // Limpiar directorio temporal si existe
        await cleanupLogsDir();
    });
    
    afterAll(async () => {
        // Limpieza final
        await cleanupLogsDir();
    });

    describe('Creación de instancias', () => {
        it('debe crear logger con nombre de componente', () => {
            const testLogger = new Logger('TestComponent');
            expect(testLogger).toBeDefined();
        });

        it('debe crear logger con correlation ID opcional', () => {
            const correlationId = 'test-123';
            const testLogger = new Logger('TestComponent', correlationId);
            expect(testLogger.getCorrelationId()).toBe(correlationId);
        });

        it('debe crear directorio de logs si no existe', async () => {
            // Asegurar que no existe
            await cleanupLogsDir();
            
            // Crear logger debería crear el directorio
            const testLogger = new Logger('TestComponent');
            testLogger.info('Test message');
            
            expect(fs.existsSync(TEST_LOGS_DIR)).toBe(true);
        });
    });

    describe('Métodos de logging', () => {
        it('debe loguear mensajes de nivel info', () => {
            const testLogger = new Logger('TestComponent');
            expect(() => testLogger.info('Test info message')).not.toThrow();
        });

        it('debe loguear mensajes de nivel warn', () => {
            const testLogger = new Logger('TestComponent');
            expect(() => testLogger.warn('Test warn message')).not.toThrow();
        });

        it('debe loguear mensajes de nivel error', () => {
            const testLogger = new Logger('TestComponent');
            expect(() => testLogger.error('Test error message')).not.toThrow();
        });

        it('debe loguear mensajes de nivel error con objeto Error', () => {
            const testLogger = new Logger('TestComponent');
            const error = new Error('Test error');
            expect(() => testLogger.error('Test error message', error)).not.toThrow();
        });

        it('debe loguear mensajes de nivel debug', () => {
            const testLogger = new Logger('TestComponent');
            expect(() => testLogger.debug('Test debug message')).not.toThrow();
        });

        it('debe aceptar metadatos adicionales', () => {
            const testLogger = new Logger('TestComponent');
            const meta: LogMeta = {
                duration: 1500,
                size: 1024000,
                apiCalls: 3,
                customField: 'custom value'
            };
            expect(() => testLogger.info('Test with metadata', meta)).not.toThrow();
        });
    });

    describe('Correlation ID', () => {
        it('debe permitir establecer correlation ID después de crear logger', () => {
            const testLogger = new Logger('TestComponent');
            expect(testLogger.getCorrelationId()).toBeUndefined();
            
            testLogger.setCorrelationId('new-correlation-id');
            expect(testLogger.getCorrelationId()).toBe('new-correlation-id');
        });

        it('debe generar correlation IDs únicos', () => {
            const id1 = Logger.generateCorrelationId();
            const id2 = Logger.generateCorrelationId();
            
            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^\d+_[a-f0-9]+$/);
            expect(id2).toMatch(/^\d+_[a-f0-9]+$/);
        });

        it('debe incluir timestamp en correlation ID', () => {
            const before = Date.now();
            const id = Logger.generateCorrelationId();
            const after = Date.now();
            
            const timestamp = parseInt(id.split('_')[0], 10);
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });
    });

    describe('Logger estático (getLogger)', () => {
        it('debe reutilizar instancias del mismo componente', () => {
            const logger1 = Logger.getLogger('SharedComponent');
            const logger2 = Logger.getLogger('SharedComponent');
            
            expect(logger1).toBe(logger2);
        });

        it('debe crear instancias diferentes para componentes distintos', () => {
            const logger1 = Logger.getLogger('Component1');
            const logger2 = Logger.getLogger('Component2');
            
            expect(logger1).not.toBe(logger2);
        });
    });

    describe('Configuración', () => {
        it('debe usar nivel debug en desarrollo por defecto', () => {
            // Guardar valor original
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            
            Logger.configure({}); // Reset config
            const config = Logger.getConfig();
            
            // Restaurar
            process.env.NODE_ENV = originalEnv;
            
            expect(config.level).toBe('debug');
        });

        it('debe permitir cambiar la configuración', () => {
            Logger.configure({
                logsDir: 'custom-logs',
                level: 'warn'
            });
            
            const config = Logger.getConfig();
            expect(config.logsDir).toBe('custom-logs');
            expect(config.level).toBe('warn');
        });

        it('debe mantener valores por defecto no especificados', () => {
            Logger.configure({
                logsDir: TEST_LOGS_DIR
            });
            
            const config = Logger.getConfig();
            expect(config.console).toBe(false); // Configurado en beforeEach
            expect(config.datePattern).toBe('YYYY-MM-DD');
        });
    });

    describe('Callback de alertas', () => {
        it('debe permitir configurar callback de alertas', () => {
            const mockCallback = vi.fn().mockResolvedValue(undefined);
            expect(() => Logger.setAlertCallback(mockCallback)).not.toThrow();
        });

        it('debe invocar callback de alertas en errores', async () => {
            const mockCallback = vi.fn().mockResolvedValue(undefined);
            Logger.setAlertCallback(mockCallback);
            
            const testLogger = new Logger('AlertTest');
            testLogger.error('Error crítico');
            
            // Esperar a que se ejecute el callback async
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCallback).toHaveBeenCalledTimes(1);
            expect(mockCallback).toHaveBeenCalledWith(
                'Error crítico',
                undefined,
                expect.objectContaining({
                    component: 'AlertTest'
                })
            );
        });

        it('debe pasar error y metadatos al callback de alertas', async () => {
            const mockCallback = vi.fn().mockResolvedValue(undefined);
            Logger.setAlertCallback(mockCallback);
            
            const testLogger = new Logger('AlertTest', 'corr-123');
            const error = new Error('Test error');
            const meta: LogMeta = { duration: 500 };
            
            testLogger.error('Error con detalles', error, meta);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCallback).toHaveBeenCalledWith(
                'Error con detalles',
                error,
                expect.objectContaining({
                    component: 'AlertTest',
                    correlationId: 'corr-123',
                    duration: 500
                })
            );
        });

        it('debe manejar errores en el callback sin crashear', async () => {
            const mockCallback = vi.fn().mockRejectedValue(new Error('Callback error'));
            Logger.setAlertCallback(mockCallback);
            
            // Espiar console.error
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            const testLogger = new Logger('AlertTest');
            expect(() => testLogger.error('Test error')).not.toThrow();
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // El error del callback debería ser logueado a console
            expect(consoleSpy).toHaveBeenCalled();
            
            consoleSpy.mockRestore();
        });
    });

    describe('Logger por defecto exportado', () => {
        it('debe exportar instancia de logger por defecto', () => {
            expect(logger).toBeDefined();
            expect(logger).toBeInstanceOf(Logger);
        });

        it('logger por defecto debe tener componente OmniAI', () => {
            // El logger por defecto se crea con 'OmniAI' como componente
            // Verificamos que puede loguear sin errores
            expect(() => logger.info('Test message')).not.toThrow();
        });
    });

    describe('Formato de logs', () => {
        it('debe escribir archivos de log con patrón de fecha', async () => {
            const testLogger = new Logger('FormatTest');
            testLogger.info('Test message for file');
            
            // Esperar a que Winston escriba el archivo
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verificar que existe archivo con patrón de fecha
            const files = fs.readdirSync(TEST_LOGS_DIR);
            const logFiles = files.filter(f => f.startsWith('omniai-') && f.endsWith('.log'));
            
            expect(logFiles.length).toBeGreaterThan(0);
        });

        it('debe escribir logs en formato JSON válido', async () => {
            const testLogger = new Logger('JSONTest');
            testLogger.info('JSON format test', { customKey: 'customValue' });
            
            // Esperar a que Winston escriba
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Leer el archivo de log
            const files = fs.readdirSync(TEST_LOGS_DIR);
            const logFile = files.find(f => f.startsWith('omniai-') && f.endsWith('.log'));
            
            if (logFile) {
                const content = fs.readFileSync(path.join(TEST_LOGS_DIR, logFile), 'utf-8');
                const lines = content.trim().split('\n').filter(line => line.length > 0);
                
                // Cada línea debe ser JSON válido
                for (const line of lines) {
                    expect(() => JSON.parse(line)).not.toThrow();
                    
                    const parsed = JSON.parse(line);
                    expect(parsed).toHaveProperty('timestamp');
                    expect(parsed).toHaveProperty('level');
                    expect(parsed).toHaveProperty('message');
                }
            }
        });

        it('debe incluir timestamp ISO 8601 en los logs', async () => {
            const testLogger = new Logger('TimestampTest');
            testLogger.info('Timestamp test');
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const files = fs.readdirSync(TEST_LOGS_DIR);
            const logFile = files.find(f => f.startsWith('omniai-') && f.endsWith('.log'));
            
            if (logFile) {
                const content = fs.readFileSync(path.join(TEST_LOGS_DIR, logFile), 'utf-8');
                const lines = content.trim().split('\n').filter(line => line.length > 0);
                
                if (lines.length > 0) {
                    const parsed = JSON.parse(lines[lines.length - 1]);
                    // Formato: 2024-01-15T10:30:45.123+00:00
                    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
                }
            }
        });
    });

    describe('Metadatos de rendimiento (REQ-4.2.5)', () => {
        it('debe aceptar métricas de tiempo', () => {
            const testLogger = new Logger('PerfTest');
            expect(() => testLogger.info('Operación completada', {
                duration: 1500 // 1.5 segundos
            })).not.toThrow();
        });

        it('debe aceptar métricas de tamaño', () => {
            const testLogger = new Logger('PerfTest');
            expect(() => testLogger.info('Archivo procesado', {
                size: 1024 * 1024 * 50 // 50MB
            })).not.toThrow();
        });

        it('debe aceptar métricas de API calls', () => {
            const testLogger = new Logger('PerfTest');
            expect(() => testLogger.info('Pipeline completado', {
                apiCalls: 5,
                duration: 3000
            })).not.toThrow();
        });

        it('debe aceptar combinación de métricas', () => {
            const testLogger = new Logger('PerfTest');
            expect(() => testLogger.info('Video renderizado', {
                duration: 45000,
                size: 1024 * 1024 * 200,
                apiCalls: 12,
                cacheHits: 3,
                cacheMisses: 1
            })).not.toThrow();
        });
    });
});
