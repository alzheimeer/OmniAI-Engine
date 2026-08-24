/**
 * MetricsCollector.ts
 * 
 * Sistema centralizado de recolección de métricas internas del motor OmniAI-Engine.
 * Registra métricas de rendimiento en SQLite para análisis y generación de reportes.
 * 
 * REQ-4.3.1: Crear MetricsCollector.ts que registre métricas en SQLite
 * REQ-4.3.2: Registrar: tiempo de renderizado, tasa éxito/fallo, uso de caché, tamaño de output
 * REQ-4.3.3: Generar reporte semanal de métricas enviado por Telegram
 * 
 * Características:
 * - Registro de métricas por operación con timestamps
 * - Cálculo automático de tasas de éxito/fallo
 * - Tracking de uso de caché (hits/misses)
 * - Generación de reportes semanales formateados
 * - Integración con sistema de alertas Telegram
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger, LogMeta } from './Logger';

// ===== TIPOS E INTERFACES =====

/**
 * Tipos de operación que pueden ser medidas.
 */
export type OperationType = 
    | 'video_transform'
    | 'thumbnail_transform'
    | 'audio_generate'
    | 'music_transform'
    | 'script_generate'
    | 'script_humanize'
    | 'subtitle_generate'
    | 'video_render'
    | 'video_publish'
    | 'api_call';

/**
 * Estado de una operación registrada.
 */
export type OperationStatus = 'success' | 'failure';

/**
 * Registro individual de una métrica de operación.
 */
export interface MetricRecord {
    /** ID único de la métrica (auto-generado) */
    id?: number;
    
    /** Tipo de operación realizada */
    operationType: OperationType;
    
    /** Estado de la operación */
    status: OperationStatus;
    
    /** Tiempo de ejecución en milisegundos */
    durationMs: number;
    
    /** Tamaño del output en bytes (si aplica) */
    outputSizeBytes?: number;
    
    /** Si se usó caché para esta operación */
    cacheUsed?: boolean;
    
    /** Si fue un cache hit (true) o miss (false) */
    cacheHit?: boolean;
    
    /** ID de correlación del pipeline */
    correlationId?: string;
    
    /** Identificador del canal (channel1 o channel2) */
    channelId?: string;
    
    /** Mensaje de error si falló */
    errorMessage?: string;
    
    /** Timestamp de cuando se registró */
    createdAt?: Date;
    
    /** Metadatos adicionales en formato JSON */
    metadata?: Record<string, unknown>;
}

/**
 * Estadísticas agregadas de métricas.
 */
export interface MetricStats {
    /** Período de tiempo de las estadísticas */
    period: {
        from: Date;
        to: Date;
    };
    
    /** Estadísticas por tipo de operación */
    byOperationType: Record<OperationType, OperationStats>;
    
    /** Estadísticas de caché */
    cache: {
        totalHits: number;
        totalMisses: number;
        hitRate: number;
    };
    
    /** Totales globales */
    totals: {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        successRate: number;
        totalOutputSizeBytes: number;
        avgDurationMs: number;
    };
}

/**
 * Estadísticas de una operación específica.
 */
export interface OperationStats {
    /** Total de operaciones */
    count: number;
    
    /** Operaciones exitosas */
    successCount: number;
    
    /** Operaciones fallidas */
    failureCount: number;
    
    /** Tasa de éxito (0-1) */
    successRate: number;
    
    /** Tiempo promedio en ms */
    avgDurationMs: number;
    
    /** Tiempo mínimo en ms */
    minDurationMs: number;
    
    /** Tiempo máximo en ms */
    maxDurationMs: number;
    
    /** Tamaño total de outputs en bytes */
    totalOutputSizeBytes: number;
}

/**
 * Configuración del MetricsCollector.
 */
export interface MetricsCollectorConfig {
    /** Ruta al archivo de base de datos SQLite */
    dbPath: string;
    
    /** Si debe inicializar las tablas automáticamente */
    autoInitialize: boolean;
    
    /** Días de retención de métricas antiguas */
    retentionDays: number;
}

/**
 * Callback para enviar reportes por Telegram.
 */
export type TelegramReportCallback = (report: string) => Promise<void>;

// ===== CONSTANTES =====

/**
 * Configuración por defecto del MetricsCollector.
 */
const DEFAULT_CONFIG: MetricsCollectorConfig = {
    dbPath: 'content/metrics.sqlite',
    autoInitialize: true,
    retentionDays: 90
};

/**
 * Todos los tipos de operación disponibles.
 */
const ALL_OPERATION_TYPES: OperationType[] = [
    'video_transform',
    'thumbnail_transform',
    'audio_generate',
    'music_transform',
    'script_generate',
    'script_humanize',
    'subtitle_generate',
    'video_render',
    'video_publish',
    'api_call'
];

// ===== CLASE PRINCIPAL =====

/**
 * MetricsCollector - Sistema de recolección de métricas internas.
 * 
 * Esta clase implementa:
 * - Registro de métricas de operaciones en SQLite
 * - Cálculo de tasas de éxito/fallo
 * - Tracking de uso de caché
 * - Generación de reportes semanales
 * 
 * Uso básico:
 * ```typescript
 * const metrics = new MetricsCollector();
 * 
 * // Registrar una operación exitosa
 * await metrics.record({
 *     operationType: 'video_render',
 *     status: 'success',
 *     durationMs: 45000,
 *     outputSizeBytes: 50000000,
 *     cacheUsed: true,
 *     cacheHit: false
 * });
 * 
 * // Obtener estadísticas semanales
 * const stats = await metrics.getStats(7);
 * console.log(`Tasa de éxito: ${stats.totals.successRate * 100}%`);
 * ```
 */
export class MetricsCollector {
    /** Configuración activa */
    private config: MetricsCollectorConfig;
    
    /** Conexión a la base de datos SQLite */
    private db: sqlite3.Database | null = null;
    
    /** Logger para trazabilidad */
    private logger: Logger;
    
    /** Callback para envío de reportes por Telegram */
    private telegramCallback?: TelegramReportCallback;
    
    /** Flag de inicialización */
    private initialized: boolean = false;

    /**
     * Crea una nueva instancia de MetricsCollector.
     * 
     * @param config - Configuración personalizada (opcional)
     */
    constructor(config?: Partial<MetricsCollectorConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger('MetricsCollector');
        
        if (this.config.autoInitialize) {
            this.initialize();
        }
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Inicializa la conexión a la base de datos y crea las tablas necesarias.
     */
    public initialize(): void {
        if (this.initialized) {
            return;
        }
        
        // Asegurar que el directorio existe
        const dbDir = path.dirname(path.resolve(process.cwd(), this.config.dbPath));
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // Crear conexión a SQLite
        const dbPath = path.resolve(process.cwd(), this.config.dbPath);
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                this.logger.error('Error conectando a base de datos de métricas', err);
            } else {
                this.logger.info('Conexión a base de datos de métricas establecida', { path: dbPath });
            }
        });
        
        // Inicializar tablas
        this.initTables();
        this.initialized = true;
    }

    /**
     * Registra una métrica de operación en la base de datos.
     * 
     * @param metric - Datos de la métrica a registrar
     * @returns ID de la métrica registrada
     */
    public async record(metric: MetricRecord): Promise<number> {
        this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const now = new Date();
            const metadataJson = metric.metadata ? JSON.stringify(metric.metadata) : null;
            
            db.run(
                `INSERT INTO metrics (
                    operation_type, status, duration_ms, output_size_bytes,
                    cache_used, cache_hit, correlation_id, channel_id,
                    error_message, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    metric.operationType,
                    metric.status,
                    metric.durationMs,
                    metric.outputSizeBytes ?? null,
                    metric.cacheUsed ? 1 : 0,
                    metric.cacheHit ? 1 : 0,
                    metric.correlationId ?? null,
                    metric.channelId ?? null,
                    metric.errorMessage ?? null,
                    metadataJson,
                    now.toISOString()
                ],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    /**
     * Registra el inicio de una operación y retorna un finalizador.
     * Útil para medir duración automáticamente.
     * 
     * @param operationType - Tipo de operación
     * @param options - Opciones adicionales
     * @returns Función para finalizar y registrar la operación
     * 
     * Ejemplo:
     * ```typescript
     * const finish = metrics.startOperation('video_render', { correlationId: 'abc123' });
     * // ... hacer trabajo ...
     * await finish('success', { outputSizeBytes: 50000000 });
     * ```
     */
    public startOperation(
        operationType: OperationType,
        options?: {
            correlationId?: string;
            channelId?: string;
            cacheUsed?: boolean;
            metadata?: Record<string, unknown>;
        }
    ): (status: OperationStatus, result?: {
        outputSizeBytes?: number;
        cacheHit?: boolean;
        errorMessage?: string;
        additionalMetadata?: Record<string, unknown>;
    }) => Promise<number> {
        const startTime = Date.now();
        
        return async (status, result) => {
            const durationMs = Date.now() - startTime;
            
            return this.record({
                operationType,
                status,
                durationMs,
                outputSizeBytes: result?.outputSizeBytes,
                cacheUsed: options?.cacheUsed,
                cacheHit: result?.cacheHit,
                correlationId: options?.correlationId,
                channelId: options?.channelId,
                errorMessage: result?.errorMessage,
                metadata: {
                    ...options?.metadata,
                    ...result?.additionalMetadata
                }
            });
        };
    }

    /**
     * Obtiene estadísticas de métricas para un período de días.
     * 
     * @param days - Número de días hacia atrás (default: 7 para semanal)
     * @returns Estadísticas agregadas del período
     */
    public async getStats(days: number = 7): Promise<MetricStats> {
        this.ensureInitialized();
        
        const to = new Date();
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
        
        // Obtener todas las métricas del período
        const metrics = await this.getMetricsInRange(from, to);
        
        // Calcular estadísticas por tipo de operación
        const byOperationType: Record<OperationType, OperationStats> = {} as Record<OperationType, OperationStats>;
        
        for (const opType of ALL_OPERATION_TYPES) {
            const opMetrics = metrics.filter(m => m.operationType === opType);
            byOperationType[opType] = this.calculateOperationStats(opMetrics);
        }
        
        // Calcular estadísticas de caché
        const cacheMetrics = metrics.filter(m => m.cacheUsed);
        const cacheHits = cacheMetrics.filter(m => m.cacheHit).length;
        const cacheMisses = cacheMetrics.filter(m => !m.cacheHit).length;
        const cacheTotal = cacheHits + cacheMisses;
        
        // Calcular totales
        const successfulOps = metrics.filter(m => m.status === 'success').length;
        const totalOps = metrics.length;
        const totalDuration = metrics.reduce((sum, m) => sum + m.durationMs, 0);
        const totalOutputSize = metrics.reduce((sum, m) => sum + (m.outputSizeBytes ?? 0), 0);
        
        return {
            period: { from, to },
            byOperationType,
            cache: {
                totalHits: cacheHits,
                totalMisses: cacheMisses,
                hitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0
            },
            totals: {
                totalOperations: totalOps,
                successfulOperations: successfulOps,
                failedOperations: totalOps - successfulOps,
                successRate: totalOps > 0 ? successfulOps / totalOps : 0,
                totalOutputSizeBytes: totalOutputSize,
                avgDurationMs: totalOps > 0 ? totalDuration / totalOps : 0
            }
        };
    }

    /**
     * Genera un reporte semanal formateado para envío por Telegram.
     * REQ-4.3.3: Generar reporte semanal de métricas
     * 
     * @returns Texto del reporte formateado con emojis
     */
    public async generateWeeklyReport(): Promise<string> {
        const stats = await this.getStats(7);
        
        const lines: string[] = [
            '📊 *REPORTE SEMANAL DE MÉTRICAS*',
            `📅 ${this.formatDate(stats.period.from)} - ${this.formatDate(stats.period.to)}`,
            '',
            '═══════════════════════════════',
            '',
            '📈 *RESUMEN GENERAL*',
            `• Total operaciones: ${stats.totals.totalOperations}`,
            `• ✅ Exitosas: ${stats.totals.successfulOperations}`,
            `• ❌ Fallidas: ${stats.totals.failedOperations}`,
            `• 📊 Tasa de éxito: ${(stats.totals.successRate * 100).toFixed(1)}%`,
            `• ⏱️ Tiempo promedio: ${this.formatDuration(stats.totals.avgDurationMs)}`,
            `• 💾 Output total: ${this.formatBytes(stats.totals.totalOutputSizeBytes)}`,
            '',
            '═══════════════════════════════',
            '',
            '🗄️ *USO DE CACHÉ*',
            `• 🎯 Hits: ${stats.cache.totalHits}`,
            `• ❌ Misses: ${stats.cache.totalMisses}`,
            `• 📊 Hit rate: ${(stats.cache.hitRate * 100).toFixed(1)}%`,
            '',
            '═══════════════════════════════',
            '',
            '🔄 *POR TIPO DE OPERACIÓN*'
        ];
        
        // Añadir estadísticas por tipo de operación (solo las que tienen datos)
        for (const [opType, opStats] of Object.entries(stats.byOperationType)) {
            if (opStats.count > 0) {
                lines.push('');
                lines.push(`*${this.formatOperationType(opType as OperationType)}*`);
                lines.push(`  • Operaciones: ${opStats.count}`);
                lines.push(`  • Tasa éxito: ${(opStats.successRate * 100).toFixed(1)}%`);
                lines.push(`  • Tiempo prom: ${this.formatDuration(opStats.avgDurationMs)}`);
                if (opStats.totalOutputSizeBytes > 0) {
                    lines.push(`  • Output: ${this.formatBytes(opStats.totalOutputSizeBytes)}`);
                }
            }
        }
        
        lines.push('');
        lines.push('═══════════════════════════════');
        lines.push('');
        lines.push('🤖 _OmniAI-Engine v2 - Métricas Automatizadas_');
        
        return lines.join('\n');
    }

    /**
     * Envía el reporte semanal por Telegram.
     * Requiere que se haya configurado el callback de Telegram.
     * 
     * @returns true si se envió correctamente, false si no hay callback configurado
     */
    public async sendWeeklyReport(): Promise<boolean> {
        if (!this.telegramCallback) {
            this.logger.warn('No hay callback de Telegram configurado para envío de reportes');
            return false;
        }
        
        try {
            const report = await this.generateWeeklyReport();
            await this.telegramCallback(report);
            this.logger.info('Reporte semanal enviado por Telegram');
            return true;
        } catch (error) {
            this.logger.error('Error enviando reporte semanal por Telegram', error as Error);
            return false;
        }
    }

    /**
     * Configura el callback para envío de reportes por Telegram.
     * 
     * @param callback - Función async que envía el mensaje
     */
    public setTelegramCallback(callback: TelegramReportCallback): void {
        this.telegramCallback = callback;
    }

    /**
     * Limpia métricas antiguas según el período de retención configurado.
     * 
     * @returns Número de registros eliminados
     */
    public async cleanup(): Promise<number> {
        this.ensureInitialized();
        
        const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
        
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.run(
                `DELETE FROM metrics WHERE created_at < ?`,
                [cutoffDate.toISOString()],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    /**
     * Cierra la conexión a la base de datos.
     */
    public close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.db = null;
                        this.initialized = false;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Obtiene la configuración actual.
     * 
     * @returns Copia de la configuración activa
     */
    public getConfig(): MetricsCollectorConfig {
        return { ...this.config };
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Obtiene la conexión a la base de datos.
     */
    private getDB(): sqlite3.Database {
        if (!this.db) {
            throw new Error('MetricsCollector no inicializado. Llama a initialize() primero.');
        }
        return this.db;
    }

    /**
     * Asegura que el collector esté inicializado.
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            this.initialize();
        }
    }

    /**
     * Inicializa las tablas de la base de datos.
     */
    private initTables(): void {
        const db = this.getDB();
        
        db.serialize(() => {
            // Tabla principal de métricas
            db.run(`
                CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    operation_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    output_size_bytes INTEGER,
                    cache_used INTEGER DEFAULT 0,
                    cache_hit INTEGER DEFAULT 0,
                    correlation_id TEXT,
                    channel_id TEXT,
                    error_message TEXT,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Índices para consultas eficientes
            db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(operation_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_status ON metrics(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics(created_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_correlation ON metrics(correlation_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_channel ON metrics(channel_id)`);
        });
    }

    /**
     * Obtiene métricas en un rango de fechas.
     */
    private async getMetricsInRange(from: Date, to: Date): Promise<MetricRecord[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT * FROM metrics WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC`,
                [from.toISOString(), to.toISOString()],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const metrics = (rows as any[]).map(row => this.rowToMetric(row));
                        resolve(metrics);
                    }
                }
            );
        });
    }

    /**
     * Convierte una fila de SQLite a MetricRecord.
     */
    private rowToMetric(row: any): MetricRecord {
        return {
            id: row.id,
            operationType: row.operation_type as OperationType,
            status: row.status as OperationStatus,
            durationMs: row.duration_ms,
            outputSizeBytes: row.output_size_bytes ?? undefined,
            cacheUsed: row.cache_used === 1,
            cacheHit: row.cache_hit === 1,
            correlationId: row.correlation_id ?? undefined,
            channelId: row.channel_id ?? undefined,
            errorMessage: row.error_message ?? undefined,
            createdAt: new Date(row.created_at),
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }

    /**
     * Calcula estadísticas para un conjunto de métricas.
     */
    private calculateOperationStats(metrics: MetricRecord[]): OperationStats {
        if (metrics.length === 0) {
            return {
                count: 0,
                successCount: 0,
                failureCount: 0,
                successRate: 0,
                avgDurationMs: 0,
                minDurationMs: 0,
                maxDurationMs: 0,
                totalOutputSizeBytes: 0
            };
        }
        
        const successCount = metrics.filter(m => m.status === 'success').length;
        const durations = metrics.map(m => m.durationMs);
        const totalOutputSize = metrics.reduce((sum, m) => sum + (m.outputSizeBytes ?? 0), 0);
        
        return {
            count: metrics.length,
            successCount,
            failureCount: metrics.length - successCount,
            successRate: successCount / metrics.length,
            avgDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDurationMs: Math.min(...durations),
            maxDurationMs: Math.max(...durations),
            totalOutputSizeBytes: totalOutputSize
        };
    }

    /**
     * Formatea un tipo de operación para mostrar.
     */
    private formatOperationType(opType: OperationType): string {
        const labels: Record<OperationType, string> = {
            'video_transform': '🎬 Video Transform',
            'thumbnail_transform': '🖼️ Thumbnail Transform',
            'audio_generate': '🎙️ Audio Generate',
            'music_transform': '🎵 Music Transform',
            'script_generate': '📝 Script Generate',
            'script_humanize': '✍️ Script Humanize',
            'subtitle_generate': '💬 Subtitle Generate',
            'video_render': '🎥 Video Render',
            'video_publish': '📤 Video Publish',
            'api_call': '🌐 API Call'
        };
        return labels[opType] || opType;
    }

    /**
     * Formatea una fecha para mostrar.
     */
    private formatDate(date: Date): string {
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Formatea una duración en ms para mostrar.
     */
    private formatDuration(ms: number): string {
        if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.round((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Formatea bytes para mostrar.
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton del MetricsCollector con configuración por defecto.
 * Usar esta instancia para operaciones de métricas en toda la aplicación.
 */
export const metricsCollector = new MetricsCollector();

// ===== EXPORTAR POR DEFECTO =====

export default MetricsCollector;
