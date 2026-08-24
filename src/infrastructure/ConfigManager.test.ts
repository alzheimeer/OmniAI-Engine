/**
 * ConfigManager.test.ts
 * 
 * Tests unitarios para el ConfigManager.
 * Valida carga de configuración, validación de schema, y manejo de errores.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    ConfigManager,
    ConfigError,
    SystemConfig,
    ChannelConfig,
    ChannelId
} from './ConfigManager';

// ===== UTILIDADES DE TEST =====

/**
 * Crea un directorio temporal para tests
 */
function createTempDir(): string {
    const tempDir = path.join(os.tmpdir(), `configmanager-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
}

/**
 * Limpia un directorio temporal
 */
function cleanupTempDir(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Configuración de sistema válida para tests
 */
function getValidSystemConfig(): SystemConfig {
    return {
        cache: {
            ttl: {
                videos: '30d',
                audio: '7d',
                thumbnails: '3d',
                music: '14d'
            }
        },
        retry: {
            deepSeek: { maxRetries: 3, baseDelay: 2000 },
            googleTTS: { maxRetries: 3, baseDelay: 1000 },
            pexels: { maxRetries: 5, baseDelay: 1000 },
            youtube: { maxRetries: 3, baseDelay: 2000 }
        },
        render: {
            concurrency: 1,
            maxConcurrency: 2,
            backoffDelays: [5000, 15000, 45000],
            shutdownTimeoutMs: 300000
        },
        video: {
            shortMaxDuration: 60,
            longMinDuration: 180,
            defaultResolution: '1080p'
        },
        redis: {
            defaultHost: '127.0.0.1',
            defaultPort: 6379
        }
    };
}

/**
 * Configuración de canal válida para tests
 */
function getValidChannelConfig(): ChannelConfig {
    return {
        name: 'Test Channel',
        description: 'Canal de prueba',
        focus: ['test', 'automation'],
        languages: ['Spanish', 'English'],
        defaultLanguage: 'Spanish',
        tokenFile: 'oauth2.tokens.test.json',
        category: '27',
        notifySubscribers: true
    };
}

// ===== TESTS =====

describe('ConfigManager', () => {
    let tempDir: string;
    
    beforeEach(() => {
        // Crear directorio temporal para cada test
        tempDir = createTempDir();
        ConfigManager.setConfigDir(tempDir);
    });
    
    afterEach(() => {
        // Limpiar después de cada test
        ConfigManager.reload();
        cleanupTempDir(tempDir);
    });
    
    // ===== TESTS DE CONFIGURACIÓN DEL SISTEMA =====
    
    describe('getSystemConfig', () => {
        it('debería cargar configuración válida del sistema', () => {
            // Arrange
            const validConfig = getValidSystemConfig();
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(validConfig, null, 2)
            );
            
            // Act
            const config = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config).toBeDefined();
            expect(config.cache.ttl.videos).toBe('30d');
            expect(config.retry.deepSeek.maxRetries).toBe(3);
            expect(config.render.concurrency).toBe(1);
            expect(config.video.shortMaxDuration).toBe(60);
            expect(config.redis.defaultPort).toBe(6379);
        });
        
        it('debería lanzar error si el archivo no existe', () => {
            // Act & Assert
            expect(() => ConfigManager.getSystemConfig()).toThrow(ConfigError);
            expect(() => ConfigManager.getSystemConfig()).toThrow(/no encontrado/);
        });
        
        it('debería lanzar error si el JSON es inválido', () => {
            // Arrange
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                '{ invalid json }'
            );
            
            // Act & Assert
            expect(() => ConfigManager.getSystemConfig()).toThrow(ConfigError);
            expect(() => ConfigManager.getSystemConfig()).toThrow(/Error parseando/);
        });
        
        it('debería cachear la configuración después de la primera carga', () => {
            // Arrange
            const validConfig = getValidSystemConfig();
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(validConfig, null, 2)
            );
            
            // Act
            const config1 = ConfigManager.getSystemConfig();
            
            // Modificar el archivo (no debería afectar)
            validConfig.cache.ttl.videos = '99d';
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(validConfig, null, 2)
            );
            
            const config2 = ConfigManager.getSystemConfig();
            
            // Assert - debería usar la versión cacheada
            expect(config2.cache.ttl.videos).toBe('30d');
            expect(config1).toBe(config2); // Misma referencia
        });
    });
    
    // ===== TESTS DE VALIDACIÓN DEL SISTEMA =====
    
    describe('validación de schema del sistema', () => {
        it('debería fallar si falta la sección cache', () => {
            // Arrange
            const config = getValidSystemConfig();
            const configObj = config as unknown as Record<string, unknown>;
            delete configObj.cache;
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getSystemConfig()).toThrow(ConfigError);
        });
        
        it('debería fallar si falta cache.ttl.videos', () => {
            // Arrange
            const config = getValidSystemConfig();
            const ttlObj = config.cache.ttl as unknown as Record<string, unknown>;
            delete ttlObj.videos;
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getSystemConfig()).toThrow(ConfigError);
        });
        
        it('debería fallar si retry.deepSeek.maxRetries no es número', () => {
            // Arrange
            const config = getValidSystemConfig();
            const deepSeekObj = config.retry.deepSeek as unknown as Record<string, unknown>;
            deepSeekObj.maxRetries = 'tres';
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getSystemConfig()).toThrow(ConfigError);
        });
        
        it('debería incluir errores de validación en la excepción', () => {
            // Arrange
            const config = {} as SystemConfig;
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            try {
                ConfigManager.getSystemConfig();
                expect.fail('Debería haber lanzado ConfigError');
            } catch (error) {
                expect(error).toBeInstanceOf(ConfigError);
                const configError = error as ConfigError;
                expect(configError.validationErrors.length).toBeGreaterThan(0);
                expect(configError.filePath).toContain('default.json');
            }
        });
    });
    
    // ===== TESTS DE CONFIGURACIÓN DE CANAL =====
    
    describe('getChannelConfig', () => {
        it('debería cargar configuración válida de channel1', () => {
            // Arrange
            const channelConfig = getValidChannelConfig();
            channelConfig.name = 'NeuroSync AI';
            fs.writeFileSync(
                path.join(tempDir, 'channel1.json'),
                JSON.stringify(channelConfig, null, 2)
            );
            
            // Act
            const config = ConfigManager.getChannelConfig('channel1');
            
            // Assert
            expect(config).toBeDefined();
            expect(config.name).toBe('NeuroSync AI');
            expect(config.focus).toContain('test');
            expect(config.languages).toContain('Spanish');
        });
        
        it('debería cargar configuración válida de channel2', () => {
            // Arrange
            const channelConfig = getValidChannelConfig();
            channelConfig.name = 'NeuroTech AI';
            fs.writeFileSync(
                path.join(tempDir, 'channel2.json'),
                JSON.stringify(channelConfig, null, 2)
            );
            
            // Act
            const config = ConfigManager.getChannelConfig('channel2');
            
            // Assert
            expect(config).toBeDefined();
            expect(config.name).toBe('NeuroTech AI');
        });
        
        it('debería lanzar error si el archivo de canal no existe', () => {
            // Act & Assert
            expect(() => ConfigManager.getChannelConfig('channel1')).toThrow(ConfigError);
            expect(() => ConfigManager.getChannelConfig('channel1')).toThrow(/no encontrado/);
        });
        
        it('debería cachear configuraciones de canal independientemente', () => {
            // Arrange
            const channel1Config = getValidChannelConfig();
            channel1Config.name = 'Channel 1';
            const channel2Config = getValidChannelConfig();
            channel2Config.name = 'Channel 2';
            
            fs.writeFileSync(
                path.join(tempDir, 'channel1.json'),
                JSON.stringify(channel1Config, null, 2)
            );
            fs.writeFileSync(
                path.join(tempDir, 'channel2.json'),
                JSON.stringify(channel2Config, null, 2)
            );
            
            // Act
            const config1 = ConfigManager.getChannelConfig('channel1');
            const config2 = ConfigManager.getChannelConfig('channel2');
            
            // Assert
            expect(config1.name).toBe('Channel 1');
            expect(config2.name).toBe('Channel 2');
        });
    });
    
    // ===== TESTS DE VALIDACIÓN DE CANAL =====
    
    describe('validación de schema de canal', () => {
        it('debería fallar si name está vacío', () => {
            // Arrange
            const config = getValidChannelConfig();
            config.name = '';
            fs.writeFileSync(
                path.join(tempDir, 'channel1.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getChannelConfig('channel1')).toThrow(ConfigError);
        });
        
        it('debería fallar si focus está vacío', () => {
            // Arrange
            const config = getValidChannelConfig();
            config.focus = [];
            fs.writeFileSync(
                path.join(tempDir, 'channel1.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getChannelConfig('channel1')).toThrow(ConfigError);
        });
        
        it('debería fallar si notifySubscribers no es boolean', () => {
            // Arrange
            const config = getValidChannelConfig();
            const configObj = config as unknown as Record<string, unknown>;
            configObj.notifySubscribers = 'yes';
            fs.writeFileSync(
                path.join(tempDir, 'channel1.json'),
                JSON.stringify(config, null, 2)
            );
            
            // Act & Assert
            expect(() => ConfigManager.getChannelConfig('channel1')).toThrow(ConfigError);
        });
    });
    
    // ===== TESTS DE ACCESO POR RUTA =====
    
    describe('get (acceso por ruta)', () => {
        beforeEach(() => {
            // Configurar archivo válido para estos tests
            const validConfig = getValidSystemConfig();
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(validConfig, null, 2)
            );
        });
        
        it('debería obtener valores anidados por ruta', () => {
            // Act
            const ttl = ConfigManager.get<string>('cache.ttl.videos');
            
            // Assert
            expect(ttl).toBe('30d');
        });
        
        it('debería obtener objetos completos', () => {
            // Act
            const retry = ConfigManager.get<{ maxRetries: number; baseDelay: number }>('retry.deepSeek');
            
            // Assert
            expect(retry).toEqual({ maxRetries: 3, baseDelay: 2000 });
        });
        
        it('debería retornar undefined para rutas inexistentes', () => {
            // Act
            const result = ConfigManager.get<string>('nonexistent.path');
            
            // Assert
            expect(result).toBeUndefined();
        });
        
        it('debería manejar rutas de un solo nivel', () => {
            // Act
            const redis = ConfigManager.get<{ defaultHost: string; defaultPort: number }>('redis');
            
            // Assert
            expect(redis).toBeDefined();
            expect(redis?.defaultHost).toBe('127.0.0.1');
        });
    });
    
    // ===== TESTS DE RELOAD =====
    
    describe('reload', () => {
        it('debería limpiar el cache y recargar desde disco', () => {
            // Arrange
            const initialConfig = getValidSystemConfig();
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(initialConfig, null, 2)
            );
            
            // Primera carga
            const config1 = ConfigManager.getSystemConfig();
            expect(config1.cache.ttl.videos).toBe('30d');
            
            // Modificar archivo
            initialConfig.cache.ttl.videos = '60d';
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(initialConfig, null, 2)
            );
            
            // Act
            ConfigManager.reload();
            const config2 = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config2.cache.ttl.videos).toBe('60d');
        });
    });
    
    // ===== TESTS DE UTILIDADES =====
    
    describe('configExists', () => {
        it('debería retornar true si el archivo existe', () => {
            // Arrange
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                '{}'
            );
            
            // Act & Assert
            expect(ConfigManager.configExists('default.json')).toBe(true);
        });
        
        it('debería retornar false si el archivo no existe', () => {
            // Act & Assert
            expect(ConfigManager.configExists('nonexistent.json')).toBe(false);
        });
    });
    
    // ===== TESTS DE OVERRIDE POR VARIABLES DE ENTORNO =====
    
    describe('environment variable overrides', () => {
        const originalEnv = process.env;
        
        beforeEach(() => {
            // Configurar archivo válido
            const validConfig = getValidSystemConfig();
            fs.writeFileSync(
                path.join(tempDir, 'default.json'),
                JSON.stringify(validConfig, null, 2)
            );
        });
        
        afterEach(() => {
            // Restaurar variables de entorno
            process.env = originalEnv;
            ConfigManager.reload();
        });
        
        it('debería aplicar override de REDIS_HOST', () => {
            // Arrange
            process.env.REDIS_HOST = 'redis.example.com';
            ConfigManager.reload();
            
            // Act
            const config = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config.redis.defaultHost).toBe('redis.example.com');
        });
        
        it('debería aplicar override de REDIS_PORT', () => {
            // Arrange
            process.env.REDIS_PORT = '6380';
            ConfigManager.reload();
            
            // Act
            const config = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config.redis.defaultPort).toBe(6380);
        });
        
        it('debería aplicar override de OMNIAI_RENDER_CONCURRENCY', () => {
            // Arrange
            process.env.OMNIAI_RENDER_CONCURRENCY = '4';
            ConfigManager.reload();
            
            // Act
            const config = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config.render.concurrency).toBe(4);
        });
        
        it('debería ignorar REDIS_PORT inválido', () => {
            // Arrange
            process.env.REDIS_PORT = 'not-a-number';
            ConfigManager.reload();
            
            // Act
            const config = ConfigManager.getSystemConfig();
            
            // Assert
            expect(config.redis.defaultPort).toBe(6379); // Valor original
        });
    });
});
