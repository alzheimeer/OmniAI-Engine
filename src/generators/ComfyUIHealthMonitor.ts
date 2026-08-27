/**
 * ComfyUIHealthMonitor - Monitorea la salud de ComfyUI
 * 
 * Responsabilidades:
 * - Verificar periódicamente la disponibilidad de ComfyUI
 * - Registrar métricas de VRAM y estado de cola
 * - Emitir eventos cuando cambia la disponibilidad
 * 
 * @see Requirements: 2.1-2.6
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { 
    VideoGenerationError, 
    VideoGenerationErrorCode 
} from './VideoGenerationError';

// ============================================================================
// INTERFACES Y TIPOS
// ============================================================================

/**
 * Eventos emitidos por el HealthMonitor.
 * @see Requirement 2.4: Emitir evento cuando pasa de disponible a no disponible
 * @see Requirement 2.5: Emitir evento cuando pasa de no disponible a disponible
 */
export interface HealthMonitorEvents {
    /** Emitido cuando ComfyUI está disponible (después de estar no disponible) */
    'comfyui:available': () => void;
    /** Emitido cuando ComfyUI no está disponible (después de estar disponible) */
    'comfyui:unavailable': () => void;
    /** Emitido en cada health check exitoso con las métricas */
    'health:check': (metrics: HealthMetrics) => void;
}

/**
 * Métricas de salud de ComfyUI.
 * Capturadas en cada health check exitoso.
 * @see Requirement 2.6: Registrar métricas de VRAM y estado de cola
 */
export interface HealthMetrics {
    /** VRAM disponible en MB */
    vramAvailableMB: number;
    /** VRAM total en MB */
    vramTotalMB: number;
    /** Porcentaje de VRAM usado */
    vramUsagePercent: number;
    /** Número de jobs en cola */
    queuePending: number;
    /** Número de jobs ejecutándose */
    queueRunning: number;
    /** Timestamp del health check */
    timestamp: Date;
}

/**
 * Configuración del HealthMonitor.
 */
export interface HealthMonitorConfig {
    /** URL base de ComfyUI */
    comfyUrl: string;
    /** 
     * Intervalo entre health checks en ms.
     * @default 60000 (1 minuto)
     * @see Requirement 2.1: Verificar cada 60 segundos
     */
    checkIntervalMs: number;
    /** 
     * Número de fallos consecutivos para marcar unavailable.
     * @default 3
     * @see Requirement 2.3: Marcar unavailable después de 3 fallos consecutivos
     */
    failureThreshold: number;
    /** 
     * Timeout para cada health check en ms.
     * @default 5000 (5 segundos)
     */
    checkTimeoutMs: number;
}

// ============================================================================
// CONFIGURACIÓN POR DEFECTO
// ============================================================================

/**
 * Configuración por defecto del HealthMonitor.
 */
export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
    comfyUrl: 'http://127.0.0.1:8188',
    checkIntervalMs: 60000,    // 1 minuto (Requirement 2.1)
    failureThreshold: 3,       // 3 fallos (Requirement 2.3)
    checkTimeoutMs: 5000       // 5 segundos timeout
};

// ============================================================================
// CLASE COMFYUIHEALTHMONITOR
// ============================================================================

/**
 * ComfyUIHealthMonitor - Monitorea la salud de ComfyUI con health checks periódicos.
 * 
 * Esta clase es responsable de:
 * 1. Ejecutar health checks periódicos al endpoint /system_stats
 * 2. Registrar métricas de VRAM y estado de cola
 * 3. Detectar cuando ComfyUI deja de estar disponible
 * 4. Emitir eventos de cambio de disponibilidad
 * 
 * @example
 * ```typescript
 * const monitor = new ComfyUIHealthMonitor();
 * 
 * monitor.on('comfyui:unavailable', () => console.log('ComfyUI no disponible!'));
 * monitor.on('comfyui:available', () => console.log('ComfyUI disponible!'));
 * monitor.on('health:check', (metrics) => console.log('Métricas:', metrics));
 * 
 * monitor.start();
 * ```
 */
export class ComfyUIHealthMonitor extends EventEmitter {
    /** Si ComfyUI está actualmente disponible */
    private isAvailable: boolean = false;
    
    /** Contador de fallos consecutivos */
    private consecutiveFailures: number = 0;
    
    /** Timer del intervalo de health checks */
    private checkInterval: NodeJS.Timeout | null = null;
    
    /** Últimas métricas registradas */
    private latestMetrics: HealthMetrics | null = null;
    
    /** Configuración del monitor */
    private config: HealthMonitorConfig;

    /**
     * Crea una nueva instancia del HealthMonitor.
     * @param config Configuración parcial (se mezcla con defaults)
     */
    constructor(config?: Partial<HealthMonitorConfig>) {
        super();
        this.config = {
            comfyUrl: process.env.COMFYUI_URL || DEFAULT_HEALTH_MONITOR_CONFIG.comfyUrl,
            checkIntervalMs: DEFAULT_HEALTH_MONITOR_CONFIG.checkIntervalMs,
            failureThreshold: DEFAULT_HEALTH_MONITOR_CONFIG.failureThreshold,
            checkTimeoutMs: DEFAULT_HEALTH_MONITOR_CONFIG.checkTimeoutMs,
            ...config
        };
    }

    /**
     * Inicia el monitoreo periódico.
     * @see Requirement 2.1: Verificar cada 60 segundos
     */
    public start(): void {
        if (this.checkInterval) {
            console.log('[HealthMonitor] Ya está corriendo');
            return;
        }
        
        console.log(`[HealthMonitor] Iniciando monitoreo cada ${this.config.checkIntervalMs / 1000}s`);
        
        // Ejecutar check inmediato
        this.runCheck();
        
        // Requirement 2.1: Verificar cada 60 segundos
        this.checkInterval = setInterval(() => this.runCheck(), this.config.checkIntervalMs);
    }

    /**
     * Detiene el monitoreo.
     */
    public stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[HealthMonitor] Monitoreo detenido');
        }
    }

    /**
     * Realiza un health check inmediato.
     * @returns Métricas si el check fue exitoso, null si falló
     * @see Requirement 2.2: Consultar /system_stats
     */
    public async checkNow(): Promise<HealthMetrics | null> {
        const metrics = await this.performHealthCheck();
        if (metrics) {
            this.latestMetrics = metrics;
            this.consecutiveFailures = 0;
            this.updateAvailability(true);
            this.emit('health:check', metrics);
        }
        return metrics;
    }

    /**
     * Obtiene el estado de disponibilidad actual.
     * @returns true si ComfyUI está disponible
     */
    public isComfyUIAvailable(): boolean {
        return this.isAvailable;
    }

    /**
     * Obtiene las últimas métricas registradas.
     * @returns Últimas métricas o null si no hay datos
     */
    public getLatestMetrics(): HealthMetrics | null {
        return this.latestMetrics;
    }

    /**
     * Ejecuta el health check contra /system_stats.
     * @returns Métricas si el check fue exitoso, null si falló
     */
    private async performHealthCheck(): Promise<HealthMetrics | null> {
        try {
            // Requirement 2.2: Consultar /system_stats
            const [statsResponse, queueResponse] = await Promise.all([
                axios.get(`${this.config.comfyUrl}/system_stats`, { timeout: this.config.checkTimeoutMs }),
                axios.get(`${this.config.comfyUrl}/queue`, { timeout: this.config.checkTimeoutMs })
            ]);
            
            const stats = statsResponse.data;
            const queue = queueResponse.data;
            
            // Extraer métricas de VRAM
            const devices = stats.devices || [];
            const gpu = devices.find((d: { type: string }) => d.type === 'cuda') || devices[0] || {};
            const vramTotalMB = Math.round((gpu.vram_total || 0) / (1024 * 1024));
            const vramFreeMB = Math.round((gpu.vram_free || 0) / (1024 * 1024));
            
            // Requirement 2.6: Registrar métricas
            const metrics: HealthMetrics = {
                vramTotalMB,
                vramAvailableMB: vramFreeMB,
                vramUsagePercent: vramTotalMB > 0 ? Math.round(((vramTotalMB - vramFreeMB) / vramTotalMB) * 100) : 0,
                queuePending: queue.queue_pending?.length || 0,
                queueRunning: queue.queue_running?.length || 0,
                timestamp: new Date()
            };
            
            console.log(`[HealthMonitor] Check OK - VRAM: ${metrics.vramAvailableMB}/${metrics.vramTotalMB}MB (${metrics.vramUsagePercent}% usado), Cola: ${metrics.queuePending} pendientes, ${metrics.queueRunning} ejecutando`);
            
            return metrics;
        } catch (error: unknown) {
            // Crear error estructurado para mejor logging
            const healthError = new VideoGenerationError(
                VideoGenerationErrorCode.HEALTH_CHECK_FAILED,
                error instanceof Error ? error.message : String(error),
                true, // recoverable
                { url: this.config.comfyUrl },
                error instanceof Error ? error : undefined
            );
            console.error(`[HealthMonitor] Health check falló: ${healthError.message}`);
            return null;
        }
    }

    /**
     * Ejecuta un ciclo de health check y actualiza el estado.
     * Método interno usado por start() para el intervalo.
     */
    private async runCheck(): Promise<void> {
        const metrics = await this.performHealthCheck();
        
        if (metrics) {
            this.latestMetrics = metrics;
            this.consecutiveFailures = 0;
            this.updateAvailability(true);
            this.emit('health:check', metrics);
        } else {
            this.consecutiveFailures++;
            console.log(`[HealthMonitor] Fallo consecutivo ${this.consecutiveFailures}/${this.config.failureThreshold}`);
            
            // Requirement 2.3: Marcar unavailable después de 3 fallos
            if (this.consecutiveFailures >= this.config.failureThreshold) {
                this.updateAvailability(false);
            }
        }
    }

    /**
     * Actualiza el estado y emite eventos si cambia.
     * @param available Nuevo estado de disponibilidad
     * @see Requirement 2.3, 2.4, 2.5
     */
    private updateAvailability(available: boolean): void {
        const wasAvailable = this.isAvailable;
        this.isAvailable = available;
        
        // Emitir eventos solo si hay cambio de estado
        if (wasAvailable && !available) {
            // Requirement 2.4: Emitir cuando pasa a no disponible
            console.log('[HealthMonitor] ComfyUI ya no está disponible');
            this.emit('comfyui:unavailable');
        } else if (!wasAvailable && available) {
            // Requirement 2.5: Emitir cuando pasa a disponible
            console.log('[HealthMonitor] ComfyUI está disponible');
            this.emit('comfyui:available');
        }
    }
}
