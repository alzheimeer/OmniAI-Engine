/**
 * ComfyUIProcessManager - Gestiona el ciclo de vida del proceso ComfyUI
 * 
 * Responsabilidades:
 * - Iniciar ComfyUI automáticamente según el modo de video
 * - Monitorear el proceso y detectar crashes
 * - Reiniciar automáticamente si hay generaciones pendientes
 * - Proporcionar shutdown graceful
 * 
 * Este componente extiende EventEmitter para permitir a otros componentes
 * reaccionar a eventos del ciclo de vida del proceso (inicio, parada, crash, reinicio).
 * 
 * @see Requirements: 1.6, 2.4, 2.5
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import axios from 'axios';
import { VideoSourceMode } from './ModelConfig';
import { 
    VideoGenerationError, 
    VideoGenerationErrorCode,
    createComfyUIProcessCrashError
} from './VideoGenerationError';

// ============================================================================
// INTERFACES Y TIPOS
// ============================================================================

/**
 * Eventos emitidos por el ProcessManager.
 * Estos eventos permiten a otros componentes reaccionar a cambios en el
 * estado del proceso ComfyUI.
 * 
 * @see Requirement 2.4: Emitir evento cuando ComfyUI pasa de disponible a no disponible
 * @see Requirement 2.5: Emitir evento cuando ComfyUI pasa de no disponible a disponible
 */
export interface ProcessManagerEvents {
    /** Emitido cuando el proceso ComfyUI inicia correctamente */
    'process:started': () => void;
    /** Emitido cuando el proceso ComfyUI se detiene de forma controlada */
    'process:stopped': () => void;
    /** Emitido cuando el proceso ComfyUI termina inesperadamente (crash) */
    'process:crashed': (exitCode: number | null) => void;
    /** Emitido cuando el proceso se reinicia después de un crash */
    'process:restarted': (attempt: number) => void;
    /** Emitido cuando el startup de ComfyUI excede el timeout configurado */
    'startup:timeout': () => void;
}

/**
 * Estado del proceso ComfyUI.
 * Representa los diferentes estados en los que puede encontrarse el proceso.
 * 
 * - stopped: El proceso no está corriendo
 * - starting: El proceso está iniciándose (esperando que esté disponible)
 * - running: El proceso está corriendo y disponible
 * - crashed: El proceso terminó inesperadamente
 * - unavailable: ComfyUI no está disponible (timeout o error)
 * 
 * @see Requirement 1.6: Detectar cuando el proceso termina inesperadamente
 */
export type ProcessState = 'stopped' | 'starting' | 'running' | 'crashed' | 'unavailable';

/**
 * Configuración del ProcessManager.
 * Todos los valores tienen defaults sensatos que pueden sobrescribirse.
 */
export interface ProcessManagerConfig {
    /** 
     * Ruta al script de inicio de ComfyUI.
     * @default Se construye desde COMFYUI_PATH env o 'D:\\ComfyUI\\start_comfyui.bat'
     */
    startScript: string;
    
    /** 
     * URL base de ComfyUI para verificar disponibilidad.
     * @default Se lee desde COMFYUI_URL env o 'http://127.0.0.1:8188'
     */
    comfyUrl: string;
    
    /** 
     * Timeout de startup en milisegundos.
     * Si ComfyUI no responde dentro de este tiempo, se marca como unavailable.
     * @default 120000 (2 minutos)
     * @see Requirement 1.4: Esperar hasta 120 segundos verificando disponibilidad
     */
    startupTimeoutMs: number;
    
    /** 
     * Intervalo de verificación durante startup en milisegundos.
     * Con qué frecuencia se verifica si ComfyUI ya está disponible.
     * @default 5000 (5 segundos)
     * @see Requirement 1.4: Verificar disponibilidad cada 5 segundos
     */
    startupPollIntervalMs: number;
    
    /** 
     * Máximo de reintentos automáticos ante crash.
     * Si hay generaciones pendientes, se reintentará iniciar hasta este número de veces.
     * @default 3
     * @see Requirement 1.7: Reintentar hasta 3 veces si hay generaciones pendientes
     */
    maxRestartAttempts: number;
    
    /** 
     * Modo de video configurado.
     * Determina si ComfyUI debe iniciarse o no.
     * @see Requirement 1.1: Omitir inicialización si modo es 'pexels'
     */
    videoSourceMode: VideoSourceMode;
}

// ============================================================================
// CONFIGURACIÓN POR DEFECTO
// ============================================================================

/**
 * Configuración por defecto del ProcessManager.
 * Estos valores son sensatos para la mayoría de los casos de uso.
 */
export const DEFAULT_PROCESS_MANAGER_CONFIG: ProcessManagerConfig = {
    startScript: 'D:\\ComfyUI\\start_comfyui.bat',
    comfyUrl: 'http://127.0.0.1:8188',
    startupTimeoutMs: 120000,      // 2 minutos (Requirement 1.4)
    startupPollIntervalMs: 5000,   // 5 segundos (Requirement 1.4)
    maxRestartAttempts: 3,         // 3 reintentos (Requirement 1.7)
    videoSourceMode: 'hybrid'
};

// ============================================================================
// CLASE COMFYUIPROCESSMANAGER
// ============================================================================

/**
 * ComfyUIProcessManager - Gestiona el ciclo de vida del proceso ComfyUI.
 * 
 * Esta clase es responsable de:
 * 1. Iniciar ComfyUI automáticamente cuando el modo lo requiere
 * 2. Verificar si ComfyUI ya está corriendo antes de iniciar
 * 3. Esperar a que ComfyUI esté disponible con timeout configurable
 * 4. Detectar y manejar crashes del proceso
 * 5. Reiniciar automáticamente si hay generaciones pendientes
 * 6. Proporcionar shutdown graceful
 * 
 * Extiende EventEmitter para emitir eventos de ciclo de vida que otros
 * componentes pueden escuchar (process:started, process:stopped, etc.)
 * 
 * @example
 * ```typescript
 * const manager = new ComfyUIProcessManager({ videoSourceMode: 'hybrid' });
 * 
 * manager.on('process:started', () => console.log('ComfyUI iniciado'));
 * manager.on('process:crashed', (code) => console.log(`Crash con código ${code}`));
 * 
 * await manager.start();
 * ```
 * 
 * @see Requirement 1.6: Detectar cuando proceso termina inesperadamente
 * @see Requirement 2.4, 2.5: Emitir eventos de cambio de disponibilidad
 */
export class ComfyUIProcessManager extends EventEmitter {
    /** Referencia al proceso hijo de ComfyUI (si fue iniciado por nosotros) */
    private process: ChildProcess | null = null;
    
    /** Estado actual del proceso */
    private state: ProcessState = 'stopped';
    
    /** Contador de intentos de reinicio tras crash */
    private restartAttempts: number = 0;
    
    /** Indica si hay generaciones de video pendientes */
    private hasPendingGenerations: boolean = false;
    
    /** Configuración del manager */
    private config: ProcessManagerConfig;

    /**
     * Crea una nueva instancia del ProcessManager.
     * 
     * @param config Configuración parcial (se mezcla con defaults)
     * @example
     * ```typescript
     * // Usar defaults
     * const manager = new ComfyUIProcessManager();
     * 
     * // Sobrescribir algunas opciones
     * const manager = new ComfyUIProcessManager({
     *     startupTimeoutMs: 60000,
     *     videoSourceMode: 'comfyui'
     * });
     * ```
     */
    constructor(config?: Partial<ProcessManagerConfig>) {
        super();
        
        // Construir configuración mezclando defaults con valores proporcionados
        // y valores de variables de entorno
        this.config = {
            startScript: process.env.COMFYUI_PATH 
                ? `${process.env.COMFYUI_PATH}\\start_comfyui.bat`
                : DEFAULT_PROCESS_MANAGER_CONFIG.startScript,
            comfyUrl: process.env.COMFYUI_URL || DEFAULT_PROCESS_MANAGER_CONFIG.comfyUrl,
            startupTimeoutMs: DEFAULT_PROCESS_MANAGER_CONFIG.startupTimeoutMs,
            startupPollIntervalMs: DEFAULT_PROCESS_MANAGER_CONFIG.startupPollIntervalMs,
            maxRestartAttempts: DEFAULT_PROCESS_MANAGER_CONFIG.maxRestartAttempts,
            videoSourceMode: DEFAULT_PROCESS_MANAGER_CONFIG.videoSourceMode,
            ...config
        };
    }

    /**
     * Inicia el proceso ComfyUI si no está corriendo.
     * 
     * Comportamiento:
     * 1. Si el modo es 'pexels', retorna true sin hacer nada (Requirement 1.1)
     * 2. Verifica si ComfyUI ya está corriendo (Requirement 1.2)
     * 3. Si no está corriendo, ejecuta el script de inicio (Requirement 1.3)
     * 4. Espera hasta que esté disponible o timeout (Requirement 1.4)
     * 
     * @returns true si ComfyUI está disponible, false si no
     * @throws Error si hay problemas al iniciar el proceso
     * @see Requirement 1.1, 1.2, 1.3, 1.4, 1.5
     */
    public async start(): Promise<boolean> {
        // Requirement 1.1: Omitir si modo es 'pexels'
        if (this.config.videoSourceMode === 'pexels') {
            console.log('[ProcessManager] Modo pexels: omitiendo inicialización de ComfyUI');
            return true;
        }
        
        // Requirement 1.2: Verificar si ya está corriendo
        if (await this.checkIfRunning()) {
            console.log('[ProcessManager] ComfyUI ya está corriendo');
            this.state = 'running';
            this.emit('process:started');
            return true;
        }
        
        // Requirement 1.3: Ejecutar script de inicio
        console.log(`[ProcessManager] Iniciando ComfyUI desde ${this.config.startScript}`);
        this.state = 'starting';
        
        this.process = spawn('cmd', ['/c', this.config.startScript], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        
        this.process.on('exit', (code) => this.handleProcessExit(code));
        this.process.unref();
        
        // Requirement 1.4: Esperar a que esté disponible
        const available = await this.waitForStartup();
        
        if (available) {
            this.state = 'running';
            this.restartAttempts = 0;
            console.log('[ProcessManager] ComfyUI iniciado correctamente');
            this.emit('process:started');
            return true;
        }
        
        // Requirement 1.5: Registrar error si no responde
        this.state = 'unavailable';
        console.error('[ProcessManager] ComfyUI no respondió después del timeout');
        this.emit('startup:timeout');
        return false;
    }

    /**
     * Detiene el proceso ComfyUI de forma graceful.
     * 
     * Si el proceso fue iniciado por nosotros, lo termina de forma controlada.
     * Si ComfyUI ya estaba corriendo externamente, simplemente limpia el estado.
     * 
     * Emite el evento 'process:stopped' al completar.
     * 
     * @see Requirement 1.8: Exponer método shutdown() que detenga el proceso gracefully
     */
    public async shutdown(): Promise<void> {
        console.log('[ProcessManager] Deteniendo ComfyUI...');
        this.state = 'stopped';
        
        if (this.process && !this.process.killed) {
            this.process.kill('SIGTERM');
            // Dar tiempo para terminar gracefully
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!this.process.killed) {
                this.process.kill('SIGKILL');
            }
        }
        
        this.process = null;
        this.emit('process:stopped');
        console.log('[ProcessManager] ComfyUI detenido');
    }

    /**
     * Obtiene el estado actual del proceso ComfyUI.
     * 
     * @returns Estado actual ('stopped', 'starting', 'running', 'crashed', 'unavailable')
     */
    public getState(): ProcessState {
        return this.state;
    }

    /**
     * Marca si hay generaciones de video pendientes.
     * 
     * Esto determina si el proceso debe reiniciarse automáticamente tras un crash.
     * Si hay generaciones pendientes y el proceso crashea, se intentará reiniciar
     * hasta maxRestartAttempts veces.
     * 
     * @param pending true si hay generaciones pendientes, false si no
     * @see Requirement 1.7: Reintentar si hay generaciones pendientes
     */
    public setPendingGenerations(pending: boolean): void {
        this.hasPendingGenerations = pending;
    }

    /**
     * Verifica si ComfyUI ya está corriendo en la URL configurada.
     * 
     * Realiza una petición HTTP al endpoint base de ComfyUI para verificar
     * si está disponible y respondiendo.
     * 
     * @returns true si ComfyUI responde correctamente, false si no
     * @see Requirement 1.2: Verificar si ComfyUI ya está corriendo
     */
    private async checkIfRunning(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.config.comfyUrl}/system_stats`, { 
                timeout: 5000 
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    /**
     * Espera a que ComfyUI esté disponible después de iniciar el proceso.
     * 
     * Realiza polling cada startupPollIntervalMs hasta que ComfyUI responda
     * o se alcance el startupTimeoutMs.
     * 
     * @returns true si ComfyUI está disponible, false si timeout
     * @see Requirement 1.4: Esperar hasta 120 segundos verificando cada 5 segundos
     */
    private async waitForStartup(): Promise<boolean> {
        const startTime = Date.now();
        const timeoutMs = this.config.startupTimeoutMs;
        const pollIntervalMs = this.config.startupPollIntervalMs;
        
        while (Date.now() - startTime < timeoutMs) {
            if (await this.checkIfRunning()) {
                return true;
            }
            console.log(`[ProcessManager] Esperando a ComfyUI... (${Math.round((Date.now() - startTime) / 1000)}s)`);
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        
        return false;
    }

    /**
     * Handler para cuando el proceso ComfyUI termina.
     * 
     * Se ejecuta cuando el proceso hijo emite el evento 'exit'.
     * Determina si fue un crash o una terminación controlada y
     * decide si reiniciar basándose en hasPendingGenerations.
     * 
     * @param code Código de salida del proceso (null si fue terminado por señal)
     * @see Requirement 1.6: Detectar cuando proceso termina inesperadamente
     * @see Requirement 1.7: Reintentar si hay generaciones pendientes
     */
    private handleProcessExit(code: number | null): void {
        // Requirement 1.6: Detectar terminación inesperada
        console.log(`[ProcessManager] Proceso ComfyUI terminó con código: ${code}`);
        
        // Si el estado era 'stopped', fue un shutdown controlado
        if (this.state === 'stopped') {
            return;
        }
        
        this.state = 'crashed';
        
        // Crear error estructurado para logging y eventos
        const crashError = createComfyUIProcessCrashError(code);
        console.error(`[ProcessManager] ${crashError.toString()}`);
        
        this.emit('process:crashed', code);
        
        // Requirement 1.7: Reintentar si hay generaciones pendientes
        if (this.hasPendingGenerations && this.restartAttempts < this.config.maxRestartAttempts) {
            this.restartAttempts++;
            console.log(`[ProcessManager] Reintentando inicio (${this.restartAttempts}/${this.config.maxRestartAttempts})...`);
            this.emit('process:restarted', this.restartAttempts);
            this.start().catch(err => {
                console.error('[ProcessManager] Error al reiniciar:', err);
            });
        } else if (this.hasPendingGenerations) {
            console.error(`[ProcessManager] Se alcanzó el máximo de reintentos (${this.config.maxRestartAttempts})`);
        }
    }
}
