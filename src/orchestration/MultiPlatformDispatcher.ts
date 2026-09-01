/**
 * MultiPlatformDispatcher.ts
 * 
 * Coordinador de publicación multiplataforma para OmniAI-Engine.
 * Parte de la Fase 5: Expansión Multiplataforma (bloqueada por YPPValidationGate.passed === true)
 * 
 * REQ-3.4.1: Crear MultiPlatformDispatcher.ts que coordine publicación en 3 plataformas
 * REQ-3.4.2: Implementar delay aleatorio de 30-90 minutos entre plataformas
 * REQ-3.4.3: Implementar horarios ALEATORIOS de publicación (Regla de Oro #8)
 * REQ-3.4.4: Crear estrategia de contenido diferenciado por plataforma
 * 
 * Funcionalidades:
 * - Coordina publicación en YouTube, Instagram Reels y TikTok
 * - Implementa delays aleatorios entre plataformas (30-90 min)
 * - Genera horarios de publicación aleatorios (evita patrones detectables)
 * - Estrategia de contenido diferenciado por plataforma:
 *   - YouTube: Video completo + Short
 *   - Instagram: 30s Reel (via ReelsAdapter)
 *   - TikTok: 15s video (via TikTokAdapter)
 * - Verifica YPPValidationGate antes de dispatch cross-platform
 * - Logging estructurado y tracking de estado
 * 
 * IMPORTANTE: Esta funcionalidad está BLOQUEADA por YPPValidationGate.
 * Solo se activa cuando la monetización de YouTube está aprobada (Regla de Oro #2).
 * 
 * 🏆 Regla de Oro #8: La publicación de videos debe hacerse en horarios diferentes 
 * cada vez, siempre aleatorios - evita patrones temporales detectables.
 */

import crypto from 'crypto';
import { Logger } from '../infrastructure/Logger';
import { YPPValidationGate, MonetizationData, Platform as YPPPlatform } from '../validation/YPPValidationGate';
import { ReelsAdapter, ReelsConfig, ReelsOutput } from '../adapters/ReelsAdapter';
import { TikTokAdapter, TikTokConfig, TikTokOutput } from '../adapters/TikTokAdapter';
import { InstagramPublisher, InstagramReelMetadata, InstagramPublishResult } from '../publishers/InstagramPublisher';
import { TikTokPublisher, TikTokVideoMetadata, TikTokPublishResult } from '../publishers/TikTokPublisher';
import { YouTubePublisher } from '../publishers/YouTubePublisher';

// ===== TIPOS Y INTERFACES =====

/**
 * Plataformas de destino soportadas por el dispatcher.
 */
export type Platform = 'youtube' | 'instagram' | 'tiktok';

/**
 * Estado de publicación para tracking.
 */
export type DispatchStatus = 
    | 'pending'          // Esperando
    | 'validating'       // Validando YPP gate
    | 'adapting'         // Adaptando contenido
    | 'waiting_delay'    // Esperando delay entre plataformas
    | 'publishing'       // Publicando
    | 'completed'        // Completado exitosamente
    | 'failed'           // Falló
    | 'blocked';         // Bloqueado por YPP gate

/**
 * Configuración de contenido fuente para dispatch.
 * REQ-3.4.4: Video completo para YouTube, recortado para IG/TT
 */
export interface SourceContent {
    /** Ruta al video completo (para YouTube) */
    fullVideoPath: string;
    
    /** Ruta al Short de YouTube (60s o menos) */
    shortVideoPath: string;
    
    /** Ruta al archivo de subtítulos .ASS */
    subtitlesPath?: string;
    
    /** Título del video */
    title: string;
    
    /** Descripción del video */
    description: string;
    
    /** Tags/keywords del video */
    tags: string[];
    
    /** Hashtags para redes sociales */
    hashtags: string[];
    
    /** Ruta al thumbnail base */
    thumbnailPath?: string;
    
    /** Duración del video completo en segundos */
    fullVideoDuration: number;
    
    /** Duración del Short en segundos */
    shortDuration: number;
    
    /** Ruta al token de autenticación (para canales múltiples) */
    tokenFilePath?: string;
}

/**
 * Configuración por plataforma para la estrategia de contenido diferenciado.
 * REQ-3.4.4: YouTube full + Short, Instagram 30s Reel, TikTok 15s
 */
export interface PlatformContentStrategy {
    /** Plataforma de destino */
    platform: Platform;
    
    /** Si usar video completo o Short */
    useFullVideo: boolean;
    
    /** Duración objetivo en segundos (null = sin recorte) */
    targetDurationSeconds: number | null;
    
    /** Si forzar subtítulos */
    forceSubtitles: boolean;
    
    /** Boost de saturación de color (1.0 = sin cambio) */
    saturationBoost: number;
    
    /** Boost de contraste (1.0 = sin cambio) */
    contrastBoost: number;
    
    /** Duración del hook en segundos (TikTok = 0.5s, otros = 3s) */
    hookDurationSeconds: number;
}

/**
 * Configuración de delays entre publicaciones.
 * REQ-3.4.2: Delay aleatorio 30-90 minutos entre plataformas
 */
export interface DelayConfig {
    /** Delay mínimo en minutos (default: 30) */
    minDelayMinutes: number;
    
    /** Delay máximo en minutos (default: 90) */
    maxDelayMinutes: number;
    
    /** Si usar delay fijo (para testing) */
    useFixedDelay: boolean;
    
    /** Delay fijo en minutos (solo si useFixedDelay=true) */
    fixedDelayMinutes?: number;
}

/**
 * Configuración de horarios de publicación aleatorios.
 * REQ-3.4.3: Regla de Oro #8 - horarios ALEATORIOS, evitar patrones
 */
export interface ScheduleConfig {
    /** Hora más temprana permitida (default: 8) */
    earliestHour: number;
    
    /** Hora más tardía permitida (default: 22) */
    latestHour: number;
    
    /** Días de la semana permitidos (0=Domingo, 6=Sábado) */
    allowedDays: number[];
    
    /** Si evitar publicar a horas exactas (ej: 10:00, 14:00) */
    avoidExactHours: boolean;
    
    /** Variación en minutos para evitar patrones (default: ±15min) */
    minuteVariation: number;
}

/**
 * Resultado de publicación por plataforma.
 */
export interface PlatformPublishResult {
    /** Plataforma */
    platform: Platform;
    
    /** Si fue exitoso */
    success: boolean;
    
    /** URL del contenido publicado (si disponible) */
    contentUrl?: string;
    
    /** ID del contenido (si disponible) */
    contentId?: string;
    
    /** Mensaje de error (si falló) */
    error?: string;
    
    /** Hora de publicación */
    publishedAt?: Date;
    
    /** Duración del proceso en ms */
    durationMs: number;
    
    /** Si hubo reintentos */
    hadRetries: boolean;
}

/**
 * Resultado completo del dispatch multiplataforma.
 */
export interface DispatchResult {
    /** ID único del dispatch */
    dispatchId: string;
    
    /** Si el dispatch general fue exitoso (todas las plataformas seleccionadas) */
    success: boolean;
    
    /** Estado final */
    status: DispatchStatus;
    
    /** Resultados por plataforma */
    platformResults: PlatformPublishResult[];
    
    /** Plataformas que fallaron */
    failedPlatforms: Platform[];
    
    /** Plataformas completadas exitosamente */
    successfulPlatforms: Platform[];
    
    /** Si fue bloqueado por YPP gate */
    blockedByYPP: boolean;
    
    /** Razón del bloqueo (si aplica) */
    blockReason?: string;
    
    /** Hora de inicio del dispatch */
    startedAt: Date;
    
    /** Hora de finalización del dispatch */
    completedAt: Date;
    
    /** Duración total en ms */
    totalDurationMs: number;
    
    /** Schedule utilizado (hora programada de cada plataforma) */
    schedule: DispatchSchedule;
}

/**
 * Schedule de publicación generado aleatoriamente.
 * REQ-3.4.3: Horarios ALEATORIOS de publicación
 */
export interface DispatchSchedule {
    /** Fecha/hora de publicación en YouTube */
    youtubePublishAt: Date;
    
    /** Fecha/hora de publicación en Instagram */
    instagramPublishAt: Date;
    
    /** Fecha/hora de publicación en TikTok */
    tiktokPublishAt: Date;
    
    /** Delay entre YouTube e Instagram (minutos) */
    youtubeToInstagramDelayMinutes: number;
    
    /** Delay entre Instagram y TikTok (minutos) */
    instagramToTiktokDelayMinutes: number;
    
    /** Si los horarios fueron generados aleatoriamente */
    randomized: boolean;
}

/**
 * Opciones para el dispatch.
 */
export interface DispatchOptions {
    /** Plataformas a publicar (default: todas) */
    platforms?: Platform[];
    
    /** Configuración de delays */
    delayConfig?: Partial<DelayConfig>;
    
    /** Configuración de horarios */
    scheduleConfig?: Partial<ScheduleConfig>;
    
    /** Si forzar bypass del YPP gate (solo para testing) */
    bypassYPPGate?: boolean;
    
    /** Datos de monetización para validar YPP gate */
    monetizationData?: MonetizationData;
    
    /** Si ejecutar en modo dry-run (no publica realmente) */
    dryRun?: boolean;
    
    /** Si ejecutar secuencialmente (esperar cada plataforma) */
    sequential?: boolean;
    
    /** Timeout máximo por plataforma en ms */
    platformTimeoutMs?: number;
    
    /** Callback de progreso */
    onProgress?: (status: DispatchStatus, platform: Platform | null, message: string) => void;
}

/**
 * Callback para notificar cambios de estado durante el dispatch.
 */
export type DispatchProgressCallback = (
    status: DispatchStatus, 
    platform: Platform | null, 
    message: string
) => void;

// ===== CONSTANTES =====

/**
 * Configuración por defecto de delays.
 * REQ-3.4.2: Delay aleatorio 30-90 minutos entre plataformas
 */
export const DEFAULT_DELAY_CONFIG: DelayConfig = {
    minDelayMinutes: 30,
    maxDelayMinutes: 90,
    useFixedDelay: false
};

/**
 * Configuración por defecto de horarios.
 * REQ-3.4.3: Horarios ALEATORIOS de publicación (Regla de Oro #8)
 */
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
    earliestHour: 8,   // 8 AM
    latestHour: 22,    // 10 PM
    allowedDays: [0, 1, 2, 3, 4, 5, 6], // Todos los días
    avoidExactHours: true,
    minuteVariation: 15
};

/**
 * Estrategias de contenido por plataforma.
 * REQ-3.4.4: Contenido diferenciado por plataforma
 */
export const PLATFORM_CONTENT_STRATEGIES: Record<Platform, PlatformContentStrategy> = {
    youtube: {
        platform: 'youtube',
        useFullVideo: false,      // Usar Short para consistencia multiplataforma
        targetDurationSeconds: 60, // YouTube Short máximo
        forceSubtitles: true,
        saturationBoost: 1.0,     // Sin modificación para YouTube
        contrastBoost: 1.0,
        hookDurationSeconds: 3    // Hook estándar de YouTube
    },
    instagram: {
        platform: 'instagram',
        useFullVideo: false,
        targetDurationSeconds: 30, // REQ-3.1.2: 30 segundos óptimo para Reels
        forceSubtitles: true,      // REQ-3.1.3: 85% audiencia sin sonido
        saturationBoost: 1.20,     // REQ-3.1.4: +20% saturación
        contrastBoost: 1.10,       // REQ-3.1.4: +10% contraste
        hookDurationSeconds: 3
    },
    tiktok: {
        platform: 'tiktok',
        useFullVideo: false,
        targetDurationSeconds: 15, // REQ-3.2.2: 15 segundos óptimo para TikTok
        forceSubtitles: true,
        saturationBoost: 1.25,     // +25% para TikTok (más intenso)
        contrastBoost: 1.12,       // +12% para TikTok
        hookDurationSeconds: 0.5   // REQ-3.2.3: Hook ultra-agresivo 0.5s
    }
};

/**
 * Orden de publicación por defecto (YouTube primero por ser plataforma principal).
 */
export const DEFAULT_PUBLISH_ORDER: Platform[] = ['youtube', 'instagram', 'tiktok'];

// ===== CLASE PRINCIPAL =====

/**
 * MultiPlatformDispatcher - Coordinador de publicación multiplataforma.
 * 
 * Esta clase implementa la lógica para:
 * - Coordinar publicación en YouTube, Instagram Reels y TikTok (REQ-3.4.1)
 * - Aplicar delay aleatorio 30-90 minutos entre plataformas (REQ-3.4.2)
 * - Generar horarios de publicación aleatorios (REQ-3.4.3, Regla de Oro #8)
 * - Estrategia de contenido diferenciado por plataforma (REQ-3.4.4)
 * 
 * IMPORTANTE: 
 * - Esta funcionalidad está bloqueada por YPPValidationGate
 * - Solo se activa cuando YouTube está monetizado (Regla de Oro #2)
 * 
 * Uso básico:
 * ```typescript
 * const dispatcher = new MultiPlatformDispatcher();
 * 
 * const result = await dispatcher.dispatch(
 *     sourceContent,
 *     { platforms: ['youtube', 'instagram', 'tiktok'] }
 * );
 * 
 * if (result.success) {
 *     console.log('Publicación exitosa en todas las plataformas');
 * }
 * ```
 */
export class MultiPlatformDispatcher {
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Gate de validación YPP */
    private readonly yppGate: YPPValidationGate;
    
    /** Publisher de Instagram */
    private instagramPublisher: InstagramPublisher | null = null;
    
    /** Publisher de TikTok */
    private tiktokPublisher: TikTokPublisher | null = null;
    
    /** Callback de progreso */
    private progressCallback?: DispatchProgressCallback;
    
    /** Historial de publicaciones recientes (para evitar patrones) */
    private readonly publishHistory: Array<{ platform: Platform; publishedAt: Date }> = [];

    /**
     * Crea una nueva instancia de MultiPlatformDispatcher.
     */
    constructor() {
        this.logger = new Logger('MultiPlatformDispatcher');
        this.yppGate = new YPPValidationGate();
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Ejecuta el dispatch multiplataforma con el contenido proporcionado.
     * 
     * Pipeline de dispatch:
     * 1. Validar YPP gate (Regla de Oro #2)
     * 2. Generar schedule aleatorio (REQ-3.4.3)
     * 3. Para cada plataforma en orden:
     *    a. Adaptar contenido según estrategia (REQ-3.4.4)
     *    b. Esperar delay aleatorio si no es primera (REQ-3.4.2)
     *    c. Publicar contenido
     *    d. Registrar resultado
     * 4. Retornar resultado consolidado
     * 
     * @param content - Contenido fuente a publicar
     * @param options - Opciones de dispatch
     * @returns Resultado del dispatch
     */
    public async dispatch(
        content: SourceContent,
        options: DispatchOptions = {}
    ): Promise<DispatchResult> {
        const dispatchId = this.generateDispatchId();
        const startedAt = new Date();
        const correlationId = Logger.generateCorrelationId();
        this.logger.setCorrelationId(correlationId);
        
        this.progressCallback = options.onProgress;
        
        this.logger.info('Iniciando dispatch multiplataforma', {
            dispatchId,
            platforms: options.platforms || DEFAULT_PUBLISH_ORDER,
            dryRun: options.dryRun || false
        });

        // 1. Validar plataformas y filtrar por YPP gate si aplica
        let requestedPlatforms = options.platforms || DEFAULT_PUBLISH_ORDER;
        const platformResults: PlatformPublishResult[] = [];
        const blockedPlatforms: Platform[] = [];

        if (!options.bypassYPPGate) {
            this.updateProgress('validating', null, 'Validando YPP gate para plataformas secundarias...');
            
            const monetizationData: MonetizationData = options.monetizationData || {
                hasFirstDollar: false,
                totalRevenue: 0,
                monthsWithRevenue: 0
            };

            const allowedPlatforms: Platform[] = [];
            for (const p of requestedPlatforms) {
                if (p === 'youtube') {
                    allowedPlatforms.push(p);
                } else {
                    const yppCheck = this.yppGate.canExpandToPlatform(p as YPPPlatform, monetizationData);
                    if (yppCheck.allowed) {
                        allowedPlatforms.push(p);
                    } else {
                        this.logger.info(`Plataforma ${p} bloqueada por YPP Gate (esperando primer dólar en YouTube)`, {
                            reason: yppCheck.reason
                        });
                        blockedPlatforms.push(p);
                    }
                }
            }

            if (allowedPlatforms.length === 0) {
                this.logger.warn('Todas las plataformas solicitadas están bloqueadas por YPP gate');
                return this.createBlockedResult(
                    dispatchId,
                    startedAt,
                    'Plataformas bloqueadas por YPP Gate',
                    options
                );
            }

            requestedPlatforms = allowedPlatforms;
        }

        // 2. Generar schedule aleatorio (REQ-3.4.3)
        const schedule = this.generateRandomSchedule(
            options.delayConfig,
            options.scheduleConfig
        );
        
        this.logger.info('Schedule generado', {
            youtube: schedule.youtubePublishAt.toISOString(),
            instagram: schedule.instagramPublishAt.toISOString(),
            tiktok: schedule.tiktokPublishAt.toISOString(),
            activePlatforms: requestedPlatforms,
            blockedPlatforms
        });

        // 3. Preparar plataformas a publicar
        const platforms = requestedPlatforms;
        let previousPublishTime: Date | null = null;

        // 4. Ejecutar publicación por plataforma
        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            const scheduledTime = this.getScheduledTimeForPlatform(platform, schedule);
            
            // 4a. Calcular y aplicar delay si no es primera plataforma (REQ-3.4.2)
            if (previousPublishTime && options.sequential !== false) {
                const delayMinutes = this.calculateDelayMinutes(
                    previousPublishTime,
                    scheduledTime,
                    options.delayConfig
                );
                
                if (delayMinutes > 0 && !options.dryRun) {
                    this.updateProgress(
                        'waiting_delay', 
                        platform, 
                        `Esperando ${delayMinutes} minutos antes de publicar en ${platform}...`
                    );
                    
                    await this.delay(delayMinutes * 60 * 1000);
                }
            }
            
            // 4b. Publicar en plataforma
            const result = await this.publishToPlatform(
                platform,
                content,
                options.dryRun || false,
                options.platformTimeoutMs
            );
            
            platformResults.push(result);
            
            if (result.success) {
                previousPublishTime = result.publishedAt || new Date();
                this.recordPublish(platform);
            }
        }

        // 5. Consolidar y retornar resultado
        const completedAt = new Date();
        const successfulPlatforms = platformResults
            .filter(r => r.success)
            .map(r => r.platform);
        const failedPlatforms = platformResults
            .filter(r => !r.success)
            .map(r => r.platform);
        
        const success = failedPlatforms.length === 0;
        
        this.updateProgress(
            success ? 'completed' : 'failed',
            null,
            success 
                ? `Dispatch completado en ${successfulPlatforms.length} plataformas`
                : `Dispatch falló en ${failedPlatforms.length} plataformas`
        );

        const result: DispatchResult = {
            dispatchId,
            success,
            status: success ? 'completed' : 'failed',
            platformResults,
            successfulPlatforms,
            failedPlatforms,
            blockedByYPP: false,
            startedAt,
            completedAt,
            totalDurationMs: completedAt.getTime() - startedAt.getTime(),
            schedule
        };

        this.logger.info('Dispatch completado', {
            dispatchId,
            success,
            successfulPlatforms,
            failedPlatforms,
            totalDurationMs: result.totalDurationMs
        });

        return result;
    }

    /**
     * Genera un schedule de publicación con horarios aleatorios.
     * REQ-3.4.3: Implementar horarios ALEATORIOS de publicación (Regla de Oro #8)
     * 
     * Los horarios se generan para evitar patrones detectables:
     * - Cada plataforma tiene hora diferente
     * - Se evitan horas exactas (10:00, 14:00)
     * - Se aplica variación de ±15 minutos
     * - Se respetan delays entre plataformas (30-90 min)
     * 
     * @param delayConfig - Configuración de delays (opcional)
     * @param scheduleConfig - Configuración de horarios (opcional)
     * @returns Schedule generado
     */
    public generateRandomSchedule(
        delayConfig?: Partial<DelayConfig>,
        scheduleConfig?: Partial<ScheduleConfig>
    ): DispatchSchedule {
        const delay = { ...DEFAULT_DELAY_CONFIG, ...delayConfig };
        const schedule = { ...DEFAULT_SCHEDULE_CONFIG, ...scheduleConfig };
        
        // Generar hora base aleatoria para YouTube (plataforma principal)
        const youtubePublishAt = this.generateRandomPublishTime(schedule);
        
        // Generar delay aleatorio entre YouTube e Instagram (REQ-3.4.2)
        const youtubeToInstagramDelayMinutes = delay.useFixedDelay && delay.fixedDelayMinutes
            ? delay.fixedDelayMinutes
            : this.randomInRange(delay.minDelayMinutes, delay.maxDelayMinutes);
        
        const instagramPublishAt = new Date(
            youtubePublishAt.getTime() + youtubeToInstagramDelayMinutes * 60 * 1000
        );
        
        // Generar delay aleatorio entre Instagram y TikTok (REQ-3.4.2)
        const instagramToTiktokDelayMinutes = delay.useFixedDelay && delay.fixedDelayMinutes
            ? delay.fixedDelayMinutes
            : this.randomInRange(delay.minDelayMinutes, delay.maxDelayMinutes);
        
        const tiktokPublishAt = new Date(
            instagramPublishAt.getTime() + instagramToTiktokDelayMinutes * 60 * 1000
        );
        
        return {
            youtubePublishAt,
            instagramPublishAt,
            tiktokPublishAt,
            youtubeToInstagramDelayMinutes,
            instagramToTiktokDelayMinutes,
            randomized: !delay.useFixedDelay
        };
    }

    /**
     * Genera un horario de publicación aleatorio respetando la configuración.
     * REQ-3.4.3: Evitar patrones temporales detectables (Regla de Oro #8)
     * 
     * @param config - Configuración de horarios
     * @returns Fecha/hora aleatoria para publicación
     */
    public generateRandomPublishTime(config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG): Date {
        const now = new Date();
        let publishDate = new Date(now);
        
        // Buscar siguiente día permitido si hoy no es válido
        let attempts = 0;
        while (!config.allowedDays.includes(publishDate.getDay()) && attempts < 7) {
            publishDate.setDate(publishDate.getDate() + 1);
            attempts++;
        }
        
        // Generar hora aleatoria dentro del rango permitido
        let hour = this.randomInRange(config.earliestHour, config.latestHour);
        let minute = this.randomInRange(0, 59);
        
        // Evitar horas exactas si está configurado (REQ-3.4.3)
        if (config.avoidExactHours && minute < 5) {
            // Si estamos cerca de hora exacta, añadir variación
            minute += this.randomInRange(5, config.minuteVariation);
        }
        
        // Aplicar variación para evitar patrones
        const variation = this.randomInRange(-config.minuteVariation, config.minuteVariation);
        minute = Math.max(0, Math.min(59, minute + variation));
        
        publishDate.setHours(hour, minute, 0, 0);
        
        // Si el horario calculado es en el pasado, mover al día siguiente
        if (publishDate.getTime() < now.getTime()) {
            publishDate.setDate(publishDate.getDate() + 1);
            // Re-verificar día permitido
            while (!config.allowedDays.includes(publishDate.getDay())) {
                publishDate.setDate(publishDate.getDate() + 1);
            }
        }
        
        // Verificar que no sea muy similar a publicaciones recientes (anti-patrón)
        if (this.isTooSimilarToRecentPublish(publishDate)) {
            // Añadir offset aleatorio de 20-40 minutos
            const offset = this.randomInRange(20, 40);
            publishDate.setMinutes(publishDate.getMinutes() + offset);
        }
        
        return publishDate;
    }

    /**
     * Genera delay aleatorio en minutos entre plataformas.
     * REQ-3.4.2: Delay aleatorio de 30-90 minutos entre plataformas
     * 
     * @param config - Configuración de delays
     * @returns Delay en minutos
     */
    public generateRandomDelayMinutes(config: DelayConfig = DEFAULT_DELAY_CONFIG): number {
        if (config.useFixedDelay && config.fixedDelayMinutes !== undefined) {
            return config.fixedDelayMinutes;
        }
        
        return this.randomInRange(config.minDelayMinutes, config.maxDelayMinutes);
    }

    /**
     * Obtiene la estrategia de contenido para una plataforma específica.
     * REQ-3.4.4: Estrategia de contenido diferenciado por plataforma
     * 
     * @param platform - Plataforma de destino
     * @returns Estrategia de contenido
     */
    public getContentStrategy(platform: Platform): PlatformContentStrategy {
        return PLATFORM_CONTENT_STRATEGIES[platform];
    }

    /**
     * Verifica si el dispatch está permitido por el YPP gate.
     * 
     * @param monetizationData - Datos de monetización del canal (opcional)
     * @returns true si el dispatch está permitido
     */
    public isDispatchAllowed(monetizationData?: MonetizationData): {
        allowed: boolean;
        reason: string;
    } {
        const data: MonetizationData = monetizationData || {
            hasFirstDollar: false,
            totalRevenue: 0,
            monthsWithRevenue: 0
        };
        
        const result = this.yppGate.canExpandToPlatform('instagram' as YPPPlatform, data);
        return {
            allowed: result.allowed,
            reason: result.reason
        };
    }

    /**
     * Configura los publishers de Instagram y TikTok.
     * 
     * @param instagramCookiesPath - Ruta al archivo de cookies de Instagram
     * @param tiktokCookiesPath - Ruta al archivo de cookies de TikTok
     */
    public configurePublishers(
        instagramCookiesPath?: string,
        tiktokCookiesPath?: string
    ): void {
        if (instagramCookiesPath) {
            this.instagramPublisher = new InstagramPublisher({
                cookiesPath: instagramCookiesPath
            });
            this.logger.info('Instagram publisher configurado');
        }
        
        if (tiktokCookiesPath) {
            this.tiktokPublisher = new TikTokPublisher({
                cookiesPath: tiktokCookiesPath
            });
            this.logger.info('TikTok publisher configurado');
        }
    }

    /**
     * Establece un callback para recibir actualizaciones de progreso.
     * 
     * @param callback - Función a llamar cuando cambia el estado
     */
    public onProgress(callback: DispatchProgressCallback): void {
        this.progressCallback = callback;
    }

    /**
     * Cierra recursos (publishers) de forma limpia.
     */
    public async close(): Promise<void> {
        if (this.instagramPublisher) {
            await this.instagramPublisher.close();
        }
        if (this.tiktokPublisher) {
            await this.tiktokPublisher.close();
        }
        this.logger.info('Dispatcher cerrado');
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Publica contenido en una plataforma específica.
     */
    private async publishToPlatform(
        platform: Platform,
        content: SourceContent,
        dryRun: boolean,
        timeoutMs?: number
    ): Promise<PlatformPublishResult> {
        const startTime = Date.now();
        
        this.updateProgress('adapting', platform, `Adaptando contenido para ${platform}...`);
        
        try {
            const strategy = this.getContentStrategy(platform);
            
            // Adaptar contenido según plataforma (REQ-3.4.4)
            const adaptedContent = await this.adaptContentForPlatform(
                content,
                strategy,
                platform
            );
            
            if (dryRun) {
                this.logger.info(`[DRY RUN] Publicación simulada en ${platform}`, {
                    adaptedVideoPath: adaptedContent.videoPath,
                    duration: adaptedContent.duration
                });
                
                return {
                    platform,
                    success: true,
                    contentUrl: `https://${platform}.com/dry-run-${Date.now()}`,
                    contentId: `dry-run-${Date.now()}`,
                    publishedAt: new Date(),
                    durationMs: Date.now() - startTime,
                    hadRetries: false
                };
            }
            
            this.updateProgress('publishing', platform, `Publicando en ${platform}...`);
            
            // Publicar según plataforma
            let result: PlatformPublishResult;
            
            switch (platform) {
                case 'youtube':
                    result = await this.publishToYouTube(content, adaptedContent);
                    break;
                case 'instagram':
                    result = await this.publishToInstagram(content, adaptedContent);
                    break;
                case 'tiktok':
                    result = await this.publishToTikTok(content, adaptedContent);
                    break;
                default:
                    throw new Error(`Plataforma no soportada: ${platform}`);
            }
            
            result.durationMs = Date.now() - startTime;
            return result;
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            
            this.logger.error(`Error publicando en ${platform}`, err);
            
            return {
                platform,
                success: false,
                error: err.message,
                durationMs: Date.now() - startTime,
                hadRetries: false
            };
        }
    }

    /**
     * Adapta contenido según la estrategia de la plataforma.
     * REQ-3.4.4: Estrategia de contenido diferenciado
     */
    private async adaptContentForPlatform(
        content: SourceContent,
        strategy: PlatformContentStrategy,
        platform: Platform
    ): Promise<{ videoPath: string; duration: number; coverPath?: string }> {
        // Seleccionar video fuente según estrategia
        const isLongVideo = (content.fullVideoDuration && content.fullVideoDuration > 60) || 
                            (content.fullVideoPath && content.fullVideoPath.includes('long'));
        const useFull = (platform === 'youtube' && isLongVideo) || strategy.useFullVideo;

        const sourceVideo = useFull 
            ? content.fullVideoPath 
            : content.shortVideoPath;
        
        const sourceDuration = useFull
            ? content.fullVideoDuration
            : content.shortDuration;
        
        // Si no necesita adaptación, retornar video original
        if (platform === 'youtube') {
            return {
                videoPath: sourceVideo,
                duration: sourceDuration
            };
        }
        
        // Adaptar para Instagram (30s) usando ReelsAdapter
        if (platform === 'instagram') {
            const reelsConfig: ReelsConfig = ReelsAdapter.getDefaultConfig(sourceVideo);
            reelsConfig.maxDurationSeconds = strategy.targetDurationSeconds || 30;
            reelsConfig.colorPop.saturationBoost = strategy.saturationBoost;
            reelsConfig.colorPop.contrastBoost = strategy.contrastBoost;
            reelsConfig.subtitles.enabled = strategy.forceSubtitles;
            if (content.subtitlesPath) {
                reelsConfig.subtitles.subtitlePath = content.subtitlesPath;
            }
            
            const outputPath = sourceVideo.replace(/\.[^.]+$/, '_reels.mp4');
            const result: ReelsOutput = await ReelsAdapter.adaptVideoForReels(
                reelsConfig, 
                outputPath
            );
            
            return {
                videoPath: result.videoPath,
                duration: result.durationSeconds,
                coverPath: result.coverPath
            };
        }
        
        // Adaptar para TikTok (15s) usando TikTokAdapter
        if (platform === 'tiktok') {
            const tiktokConfig: TikTokConfig = TikTokAdapter.getDefaultConfig(sourceVideo);
            tiktokConfig.maxDurationSeconds = strategy.targetDurationSeconds || 15;
            tiktokConfig.colorPop.saturationBoost = strategy.saturationBoost;
            tiktokConfig.colorPop.contrastBoost = strategy.contrastBoost;
            tiktokConfig.subtitles.enabled = strategy.forceSubtitles;
            tiktokConfig.hook.durationSeconds = strategy.hookDurationSeconds;
            if (content.subtitlesPath) {
                tiktokConfig.subtitles.subtitlePath = content.subtitlesPath;
            }
            
            const outputPath = sourceVideo.replace(/\.[^.]+$/, '_tiktok.mp4');
            const result: TikTokOutput = await TikTokAdapter.adaptVideoForTikTok(
                tiktokConfig, 
                outputPath
            );
            
            return {
                videoPath: result.videoPath,
                duration: result.durationSeconds,
                coverPath: result.coverPath
            };
        }
        
        return { videoPath: sourceVideo, duration: sourceDuration };
    }

    /**
     * Publica en YouTube utilizando YouTubePublisher.
     */
    private async publishToYouTube(
        content: SourceContent,
        adaptedContent: { videoPath: string; duration: number }
    ): Promise<PlatformPublishResult> {
        this.logger.info('Publicando en YouTube', {
            videoPath: adaptedContent.videoPath,
            title: content.title
        });
        
        try {
            // Extraer solo el nombre del archivo para YouTubePublisher
            const videoFileName = adaptedContent.videoPath.split(/[\/\\]/).pop() || adaptedContent.videoPath;
            
            // Inferir el canal desde el tokenFilePath si no está explícito en otro lado
            let inferredChannelKey = 'channel1';
            if (content.tokenFilePath?.includes('channel3')) inferredChannelKey = 'channel3';
            else if (content.tokenFilePath?.includes('channel2')) inferredChannelKey = 'channel2';
            
            const videoUrl = await YouTubePublisher.publishVideo(videoFileName, {
                title: content.title,
                description: content.description,
                tags: content.tags,
                isShort: adaptedContent.duration <= 60,
                visualPrompt: content.thumbnailPath, // Aprovechamos para pasar el prompt o thumbnail
                channelKey: inferredChannelKey
            }, content.tokenFilePath);
            
            return {
                platform: 'youtube',
                success: true,
                contentUrl: videoUrl,
                publishedAt: new Date(),
                durationMs: 0, // Calculado en el llamador
                hadRetries: false
            };
        } catch (error: any) {
            this.logger.error('Error publicando en YouTube', error);
            throw error;
        }
    }

    /**
     * Publica en Instagram usando InstagramPublisher.
     */
    private async publishToInstagram(
        content: SourceContent,
        adaptedContent: { videoPath: string; duration: number; coverPath?: string }
    ): Promise<PlatformPublishResult> {
        if (!this.instagramPublisher) {
            return {
                platform: 'instagram',
                success: false,
                error: 'Instagram publisher no configurado. Use configurePublishers() primero.',
                durationMs: 0,
                hadRetries: false
            };
        }
        
        const metadata: InstagramReelMetadata = {
            caption: content.description.substring(0, 2200),
            hashtags: content.hashtags,
            coverImagePath: adaptedContent.coverPath
        };
        
        const result: InstagramPublishResult = await this.instagramPublisher.publishReel(
            adaptedContent.videoPath,
            metadata
        );
        
        return {
            platform: 'instagram',
            success: result.success,
            contentUrl: result.reelUrl,
            contentId: result.reelId,
            error: result.error,
            publishedAt: result.publishedAt ? new Date(result.publishedAt) : undefined,
            durationMs: result.metadata.durationMs,
            hadRetries: result.metadata.hadRetries
        };
    }

    /**
     * Publica en TikTok usando TikTokPublisher.
     */
    private async publishToTikTok(
        content: SourceContent,
        adaptedContent: { videoPath: string; duration: number; coverPath?: string }
    ): Promise<PlatformPublishResult> {
        if (!this.tiktokPublisher) {
            return {
                platform: 'tiktok',
                success: false,
                error: 'TikTok publisher no configurado. Use configurePublishers() primero.',
                durationMs: 0,
                hadRetries: false
            };
        }
        
        const metadata: TikTokVideoMetadata = {
            caption: content.description.substring(0, 2200),
            hashtags: content.hashtags,
            coverImagePath: adaptedContent.coverPath
        };
        
        const result: TikTokPublishResult = await this.tiktokPublisher.publishVideo(
            adaptedContent.videoPath,
            metadata
        );
        
        return {
            platform: 'tiktok',
            success: result.success,
            contentUrl: result.videoUrl,
            contentId: result.videoId,
            error: result.error,
            publishedAt: result.publishedAt ? new Date(result.publishedAt) : undefined,
            durationMs: result.metadata.durationMs,
            hadRetries: result.metadata.hadRetries
        };
    }

    /**
     * Crea resultado de dispatch bloqueado por YPP gate.
     */
    private createBlockedResult(
        dispatchId: string,
        startedAt: Date,
        blockReason: string,
        options: DispatchOptions
    ): DispatchResult {
        const completedAt = new Date();
        const platforms = options.platforms || DEFAULT_PUBLISH_ORDER;
        
        return {
            dispatchId,
            success: false,
            status: 'blocked',
            platformResults: [],
            successfulPlatforms: [],
            failedPlatforms: platforms,
            blockedByYPP: true,
            blockReason,
            startedAt,
            completedAt,
            totalDurationMs: completedAt.getTime() - startedAt.getTime(),
            schedule: {
                youtubePublishAt: new Date(),
                instagramPublishAt: new Date(),
                tiktokPublishAt: new Date(),
                youtubeToInstagramDelayMinutes: 0,
                instagramToTiktokDelayMinutes: 0,
                randomized: false
            }
        };
    }

    /**
     * Obtiene la hora programada para una plataforma del schedule.
     */
    private getScheduledTimeForPlatform(platform: Platform, schedule: DispatchSchedule): Date {
        switch (platform) {
            case 'youtube':
                return schedule.youtubePublishAt;
            case 'instagram':
                return schedule.instagramPublishAt;
            case 'tiktok':
                return schedule.tiktokPublishAt;
            default:
                return new Date();
        }
    }

    /**
     * Calcula delay en minutos entre publicaciones.
     */
    private calculateDelayMinutes(
        previousTime: Date,
        scheduledTime: Date,
        config?: Partial<DelayConfig>
    ): number {
        const diff = scheduledTime.getTime() - previousTime.getTime();
        const diffMinutes = Math.floor(diff / (60 * 1000));
        
        // Si el tiempo programado ya pasó, usar delay aleatorio
        if (diffMinutes <= 0) {
            return this.generateRandomDelayMinutes({ ...DEFAULT_DELAY_CONFIG, ...config });
        }
        
        return diffMinutes;
    }

    /**
     * Verifica si un horario es muy similar a publicaciones recientes.
     * Para evitar patrones detectables (REQ-3.4.3, Regla de Oro #8).
     */
    private isTooSimilarToRecentPublish(proposedTime: Date): boolean {
        const SIMILARITY_THRESHOLD_MINUTES = 10;
        
        return this.publishHistory.some(record => {
            const diff = Math.abs(
                proposedTime.getTime() - record.publishedAt.getTime()
            );
            const diffMinutes = diff / (60 * 1000);
            return diffMinutes < SIMILARITY_THRESHOLD_MINUTES;
        });
    }

    /**
     * Registra una publicación en el historial.
     */
    private recordPublish(platform: Platform): void {
        this.publishHistory.push({
            platform,
            publishedAt: new Date()
        });
        
        // Mantener solo últimas 50 publicaciones
        if (this.publishHistory.length > 50) {
            this.publishHistory.shift();
        }
    }

    /**
     * Genera un ID único para el dispatch.
     */
    private generateDispatchId(): string {
        return `dispatch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Genera número aleatorio en rango [min, max].
     */
    private randomInRange(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Promise de delay.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Actualiza progreso y notifica callback.
     */
    private updateProgress(
        status: DispatchStatus,
        platform: Platform | null,
        message: string
    ): void {
        this.logger.debug(message, { status, platform });
        
        if (this.progressCallback) {
            this.progressCallback(status, platform, message);
        }
    }
}

// ===== EXPORTS =====

export default MultiPlatformDispatcher;
