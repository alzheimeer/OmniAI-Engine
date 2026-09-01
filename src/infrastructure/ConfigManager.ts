/**
 * ConfigManager.ts
 * 
 * Gestor centralizado de configuración para OmniAI-Engine.
 * Carga y valida configuraciones desde archivos JSON con validación de schema.
 * Proporciona acceso tipado y seguro a la configuración del sistema y canales.
 * 
 * REQ-4.6.1: Cargar config/default.json con constantes del sistema
 * REQ-4.6.2: Cargar config/channel1.json y config/channel2.json por canal
 * REQ-4.6.4: Validación de schema para configuraciones
 * REQ-4.6.5: Permitir override por variables de entorno
 */

import fs from 'fs';
import path from 'path';

// ===== TIPOS DE CONFIGURACIÓN DEL SISTEMA =====

/**
 * Configuración de reintentos para APIs externas
 */
export interface RetryConfig {
    /** Número máximo de reintentos */
    maxRetries: number;
    /** Delay base en milisegundos entre reintentos */
    baseDelay: number;
}

/**
 * Configuración de TTL (Time To Live) para caché
 */
export interface CacheTTLConfig {
    /** TTL para videos cacheados (e.g., "30d") */
    videos: string;
    /** TTL para audios cacheados (e.g., "7d") */
    audio: string;
    /** TTL para thumbnails cacheados (e.g., "3d") */
    thumbnails: string;
    /** TTL para música cacheada (e.g., "14d") */
    music: string;
}

/**
 * Configuración de caché del sistema
 */
export interface CacheConfig {
    /** TTL por tipo de asset */
    ttl: CacheTTLConfig;
}

/**
 * Configuración de reintentos para todas las APIs
 */
export interface RetryConfigs {
    /** Reintentos para DeepSeek API */
    deepSeek: RetryConfig;
    /** Reintentos para Google TTS */
    googleTTS: RetryConfig;
    /** Reintentos para Pexels API */
    pexels: RetryConfig;
    /** Reintentos para YouTube API */
    youtube: RetryConfig;
}

/**
 * Configuración de renderizado
 */
export interface RenderConfig {
    /** Concurrencia actual de workers */
    concurrency: number;
    /** Concurrencia máxima permitida */
    maxConcurrency: number;
    /** Delays para backoff exponencial en ms */
    backoffDelays: number[];
    /** Timeout para graceful shutdown en ms */
    shutdownTimeoutMs: number;
}

/**
 * Configuración de video
 */
export interface VideoConfig {
    /** Duración máxima para considerar un video como Short (segundos) */
    shortMaxDuration: number;
    /** Duración mínima para videos largos (segundos) */
    longMinDuration: number;
    /** Resolución por defecto */
    defaultResolution: string;
}

/**
 * Configuración de Redis
 */
export interface RedisConfig {
    /** Host por defecto de Redis */
    defaultHost: string;
    /** Puerto por defecto de Redis */
    defaultPort: number;
}

/**
 * Configuración completa del sistema (default.json)
 */
export interface SystemConfig {
    /** Configuración de caché */
    cache: CacheConfig;
    /** Configuración de reintentos por servicio */
    retry: RetryConfigs;
    /** Configuración de renderizado */
    render: RenderConfig;
    /** Configuración de video */
    video: VideoConfig;
    /** Configuración de Redis */
    redis: RedisConfig;
}

// ===== TIPOS DE CONFIGURACIÓN DE CANAL =====

/**
 * Configuración específica de un canal de YouTube
 */
export interface ChannelConfig {
    /** Nombre del canal */
    name: string;
    /** Descripción del canal */
    description: string;
    /** Áreas de enfoque temático */
    focus: string[];
    /** Idiomas soportados */
    languages: string[];
    /** Idioma por defecto */
    defaultLanguage: string;
    /** Archivo de tokens OAuth2 */
    tokenFile: string;
    /** Categoría de YouTube (ID numérico como string) */
    category: string;
    /** Si se debe notificar a suscriptores */
    notifySubscribers: boolean;
}

/**
 * Canales disponibles en el sistema
 */
export type ChannelId = 'channel1' | 'channel2' | 'channel3';

// ===== TIPOS DE VALIDACIÓN =====

/**
 * Resultado de validación de configuración
 */
export interface ValidationResult {
    /** Si la validación fue exitosa */
    valid: boolean;
    /** Errores encontrados durante la validación */
    errors: string[];
}

/**
 * Error específico de configuración
 */
export class ConfigError extends Error {
    /** Errores de validación encontrados */
    public readonly validationErrors: string[];
    /** Ruta del archivo que falló */
    public readonly filePath: string;

    constructor(message: string, filePath: string, validationErrors: string[] = []) {
        super(message);
        this.name = 'ConfigError';
        this.filePath = filePath;
        this.validationErrors = validationErrors;
    }
}

// ===== CLASE PRINCIPAL =====

/**
 * ConfigManager - Gestor centralizado de configuración.
 * 
 * Proporciona:
 * - Carga de configuración desde archivos JSON
 * - Validación de schema para detectar valores faltantes o inválidos
 * - Acceso tipado a configuración del sistema y canales
 * - Override por variables de entorno
 * - Singleton para acceso global consistente
 * 
 * Uso:
 * ```typescript
 * // Cargar configuración del sistema
 * const systemConfig = ConfigManager.getSystemConfig();
 * console.log(systemConfig.cache.ttl.videos); // "30d"
 * 
 * // Cargar configuración de un canal
 * const channel1 = ConfigManager.getChannelConfig('channel1');
 * console.log(channel1.name); // "NeuroSync AI"
 * 
 * // Acceso por ruta con tipado
 * const ttl = ConfigManager.get<string>('cache.ttl.videos');
 * ```
 */
export class ConfigManager {
    /** Configuración del sistema cacheada */
    private static systemConfig: SystemConfig | null = null;
    
    /** Configuraciones de canales cacheadas */
    private static channelConfigs: Map<ChannelId, ChannelConfig> = new Map();
    
    /** Directorio de configuración */
    private static configDir: string = path.join(process.cwd(), 'config');
    
    /** Flag para indicar si ya se inicializó */
    private static initialized: boolean = false;

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Obtiene la configuración del sistema (default.json).
     * Carga y valida la configuración en la primera llamada.
     * 
     * @returns Configuración del sistema tipada
     * @throws ConfigError si el archivo no existe o la validación falla
     */
    public static getSystemConfig(): SystemConfig {
        if (!ConfigManager.systemConfig) {
            ConfigManager.loadSystemConfig();
        }
        return ConfigManager.systemConfig!;
    }

    /**
     * Obtiene la configuración de un canal específico.
     * Carga y valida la configuración en la primera llamada.
     * 
     * @param channel - ID del canal ('channel1' o 'channel2')
     * @returns Configuración del canal tipada
     * @throws ConfigError si el archivo no existe o la validación falla
     */
    public static getChannelConfig(channel: ChannelId): ChannelConfig {
        if (!ConfigManager.channelConfigs.has(channel)) {
            ConfigManager.loadChannelConfig(channel);
        }
        return ConfigManager.channelConfigs.get(channel)!;
    }

    /**
     * Acceso genérico a valores de configuración por ruta.
     * Soporta rutas con puntos (e.g., 'cache.ttl.videos').
     * 
     * @param pathStr - Ruta al valor (e.g., 'retry.deepSeek.maxRetries')
     * @returns Valor en la ruta especificada o undefined si no existe
     */
    public static get<T>(pathStr: string): T | undefined {
        const config = ConfigManager.getSystemConfig();
        return ConfigManager.getNestedValue(config, pathStr) as T | undefined;
    }

    /**
     * Recarga todas las configuraciones desde disco.
     * Útil para testing o cuando los archivos cambian.
     */
    public static reload(): void {
        ConfigManager.systemConfig = null;
        ConfigManager.channelConfigs.clear();
        ConfigManager.initialized = false;
    }

    /**
     * Establece un directorio de configuración personalizado.
     * Útil para testing con configuraciones mock.
     * 
     * @param dir - Ruta al directorio de configuración
     */
    public static setConfigDir(dir: string): void {
        ConfigManager.configDir = dir;
        ConfigManager.reload();
    }

    /**
     * Verifica si un archivo de configuración existe.
     * 
     * @param filename - Nombre del archivo (e.g., 'default.json')
     * @returns true si el archivo existe
     */
    public static configExists(filename: string): boolean {
        const filePath = path.join(ConfigManager.configDir, filename);
        return fs.existsSync(filePath);
    }

    // ===== MÉTODOS DE CARGA =====

    /**
     * Carga y valida la configuración del sistema.
     */
    private static loadSystemConfig(): void {
        const filePath = path.join(ConfigManager.configDir, 'default.json');
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            throw new ConfigError(
                `Archivo de configuración no encontrado: ${filePath}`,
                filePath
            );
        }
        
        // Leer y parsear JSON
        let rawConfig: unknown;
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            rawConfig = JSON.parse(content);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            throw new ConfigError(
                `Error parseando configuración: ${message}`,
                filePath
            );
        }
        
        // Validar schema
        const validation = ConfigManager.validateSystemConfig(rawConfig);
        if (!validation.valid) {
            throw new ConfigError(
                `Configuración del sistema inválida`,
                filePath,
                validation.errors
            );
        }
        
        // Aplicar overrides de variables de entorno
        const config = ConfigManager.applyEnvOverrides(rawConfig as SystemConfig);
        
        ConfigManager.systemConfig = config;
        ConfigManager.initialized = true;
    }

    /**
     * Carga y valida la configuración de un canal.
     */
    private static loadChannelConfig(channel: ChannelId): void {
        const filePath = path.join(ConfigManager.configDir, `${channel}.json`);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            throw new ConfigError(
                `Archivo de configuración de canal no encontrado: ${filePath}`,
                filePath
            );
        }
        
        // Leer y parsear JSON
        let rawConfig: unknown;
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            rawConfig = JSON.parse(content);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            throw new ConfigError(
                `Error parseando configuración de canal: ${message}`,
                filePath
            );
        }
        
        // Validar schema
        const validation = ConfigManager.validateChannelConfig(rawConfig);
        if (!validation.valid) {
            throw new ConfigError(
                `Configuración del canal ${channel} inválida`,
                filePath,
                validation.errors
            );
        }
        
        ConfigManager.channelConfigs.set(channel, rawConfig as ChannelConfig);
    }

    // ===== MÉTODOS DE VALIDACIÓN =====

    /**
     * Valida la configuración del sistema contra el schema esperado.
     */
    private static validateSystemConfig(config: unknown): ValidationResult {
        const errors: string[] = [];
        
        if (!config || typeof config !== 'object') {
            return { valid: false, errors: ['La configuración debe ser un objeto'] };
        }
        
        const cfg = config as Record<string, unknown>;
        
        // Validar sección cache
        if (!cfg.cache || typeof cfg.cache !== 'object') {
            errors.push('Falta sección "cache"');
        } else {
            const cache = cfg.cache as Record<string, unknown>;
            if (!cache.ttl || typeof cache.ttl !== 'object') {
                errors.push('Falta "cache.ttl"');
            } else {
                const ttl = cache.ttl as Record<string, unknown>;
                const requiredTTL = ['videos', 'audio', 'thumbnails', 'music'];
                for (const key of requiredTTL) {
                    if (typeof ttl[key] !== 'string') {
                        errors.push(`"cache.ttl.${key}" debe ser un string (ej: "30d")`);
                    }
                }
            }
        }
        
        // Validar sección retry
        if (!cfg.retry || typeof cfg.retry !== 'object') {
            errors.push('Falta sección "retry"');
        } else {
            const retry = cfg.retry as Record<string, unknown>;
            const services = ['deepSeek', 'googleTTS', 'pexels', 'youtube'];
            for (const service of services) {
                if (!retry[service] || typeof retry[service] !== 'object') {
                    errors.push(`Falta "retry.${service}"`);
                } else {
                    const svc = retry[service] as Record<string, unknown>;
                    if (typeof svc.maxRetries !== 'number' || svc.maxRetries < 0) {
                        errors.push(`"retry.${service}.maxRetries" debe ser un número >= 0`);
                    }
                    if (typeof svc.baseDelay !== 'number' || svc.baseDelay < 0) {
                        errors.push(`"retry.${service}.baseDelay" debe ser un número >= 0`);
                    }
                }
            }
        }
        
        // Validar sección render
        if (!cfg.render || typeof cfg.render !== 'object') {
            errors.push('Falta sección "render"');
        } else {
            const render = cfg.render as Record<string, unknown>;
            if (typeof render.concurrency !== 'number' || render.concurrency < 1) {
                errors.push('"render.concurrency" debe ser un número >= 1');
            }
            if (typeof render.maxConcurrency !== 'number' || render.maxConcurrency < 1) {
                errors.push('"render.maxConcurrency" debe ser un número >= 1');
            }
            if (!Array.isArray(render.backoffDelays)) {
                errors.push('"render.backoffDelays" debe ser un array de números');
            }
            if (typeof render.shutdownTimeoutMs !== 'number') {
                errors.push('"render.shutdownTimeoutMs" debe ser un número');
            }
        }
        
        // Validar sección video
        if (!cfg.video || typeof cfg.video !== 'object') {
            errors.push('Falta sección "video"');
        } else {
            const video = cfg.video as Record<string, unknown>;
            if (typeof video.shortMaxDuration !== 'number') {
                errors.push('"video.shortMaxDuration" debe ser un número');
            }
            if (typeof video.longMinDuration !== 'number') {
                errors.push('"video.longMinDuration" debe ser un número');
            }
            if (typeof video.defaultResolution !== 'string') {
                errors.push('"video.defaultResolution" debe ser un string');
            }
        }
        
        // Validar sección redis
        if (!cfg.redis || typeof cfg.redis !== 'object') {
            errors.push('Falta sección "redis"');
        } else {
            const redis = cfg.redis as Record<string, unknown>;
            if (typeof redis.defaultHost !== 'string') {
                errors.push('"redis.defaultHost" debe ser un string');
            }
            if (typeof redis.defaultPort !== 'number') {
                errors.push('"redis.defaultPort" debe ser un número');
            }
        }
        
        return { valid: errors.length === 0, errors };
    }

    /**
     * Valida la configuración de un canal contra el schema esperado.
     */
    private static validateChannelConfig(config: unknown): ValidationResult {
        const errors: string[] = [];
        
        if (!config || typeof config !== 'object') {
            return { valid: false, errors: ['La configuración debe ser un objeto'] };
        }
        
        const cfg = config as Record<string, unknown>;
        
        // Validar campos requeridos
        if (typeof cfg.name !== 'string' || cfg.name.length === 0) {
            errors.push('"name" es requerido y debe ser un string no vacío');
        }
        
        if (typeof cfg.description !== 'string') {
            errors.push('"description" debe ser un string');
        }
        
        if (!Array.isArray(cfg.focus) || cfg.focus.length === 0) {
            errors.push('"focus" debe ser un array no vacío de strings');
        } else {
            for (let i = 0; i < cfg.focus.length; i++) {
                if (typeof cfg.focus[i] !== 'string') {
                    errors.push(`"focus[${i}]" debe ser un string`);
                }
            }
        }
        
        if (!Array.isArray(cfg.languages) || cfg.languages.length === 0) {
            errors.push('"languages" debe ser un array no vacío de strings');
        }
        
        if (typeof cfg.defaultLanguage !== 'string') {
            errors.push('"defaultLanguage" debe ser un string');
        }
        
        if (typeof cfg.tokenFile !== 'string') {
            errors.push('"tokenFile" debe ser un string');
        }
        
        if (typeof cfg.category !== 'string') {
            errors.push('"category" debe ser un string');
        }
        
        if (typeof cfg.notifySubscribers !== 'boolean') {
            errors.push('"notifySubscribers" debe ser un boolean');
        }
        
        return { valid: errors.length === 0, errors };
    }

    // ===== MÉTODOS DE UTILIDAD =====

    /**
     * Aplica overrides de variables de entorno a la configuración.
     * Soporta formato: OMNIAI_SECTION_KEY=value
     */
    private static applyEnvOverrides(config: SystemConfig): SystemConfig {
        const result = JSON.parse(JSON.stringify(config)) as SystemConfig;
        
        // Override de Redis desde variables de entorno
        if (process.env.REDIS_HOST) {
            result.redis.defaultHost = process.env.REDIS_HOST;
        }
        if (process.env.REDIS_PORT) {
            const port = parseInt(process.env.REDIS_PORT, 10);
            if (!isNaN(port)) {
                result.redis.defaultPort = port;
            }
        }
        
        // Override de concurrencia de renderizado
        if (process.env.OMNIAI_RENDER_CONCURRENCY) {
            const concurrency = parseInt(process.env.OMNIAI_RENDER_CONCURRENCY, 10);
            if (!isNaN(concurrency) && concurrency >= 1) {
                result.render.concurrency = concurrency;
            }
        }
        
        return result;
    }

    /**
     * Obtiene un valor anidado de un objeto usando una ruta con puntos.
     */
    private static getNestedValue(obj: unknown, pathStr: string): unknown {
        const parts = pathStr.split('.');
        let current: unknown = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[part];
        }
        
        return current;
    }
}

// ===== EXPORTACIONES =====

export default ConfigManager;
