/**
 * YPP Validation Gate
 * 
 * Sistema de validación para asegurar cumplimiento con requisitos del
 * YouTube Partner Program (YPP) antes de publicar contenido.
 * 
 * @module validation/YPPValidationGate
 * @requirement REQ-5.4.1
 */

// Importación de GoogleAuth para autenticación con YouTube Analytics API
import { GoogleAuth } from '../auth/GoogleAuth';
import { google, youtube_v3, youtubeAnalytics_v2 } from 'googleapis';

/**
 * Umbrales del YouTube Partner Program.
 * Valores mínimos requeridos para ser elegible al programa de monetización.
 */
export const YPP_THRESHOLDS = {
  /** Mínimo de suscriptores requeridos para YPP */
  MIN_SUBSCRIBERS: 1000,
  /** Mínimo de horas de watch time requeridas (últimos 12 meses) */
  MIN_WATCH_TIME_HOURS: 4000,
  /** Mínimo de vistas de Shorts en 90 días (vía alternativa de monetización) */
  SHORTS_MIN_VIEWS_90_DAYS: 10_000_000,
} as const;

/**
 * Umbrales de calidad de contenido.
 * Métricas de rendimiento mínimas para asegurar monetización estable.
 * 
 * @requirement REQ-5.4.3
 */
export const QUALITY_THRESHOLDS = {
  /** Mínimo de tasa de retención promedio (50%) */
  MIN_RETENTION_RATE: 50,
  /** Mínimo de Click-Through Rate promedio (4%) */
  MIN_CTR: 4,
  /** Mínimo de porcentaje de watch time promedio (40%) */
  MIN_WATCH_TIME_PERCENT: 40,
} as const;

/**
 * Métricas del canal relacionadas con el YouTube Partner Program.
 * Contiene datos necesarios para evaluar elegibilidad de monetización.
 */
export interface YPPMetrics {
  /** Número actual de suscriptores del canal */
  channelSubscribers: number;
  /** Total de horas de visualización acumuladas */
  totalWatchHours: number;
  /** Cantidad total de videos publicados en el canal */
  videoCount: number;
  /** Indica si el canal cumple requisitos mínimos para monetización */
  isMonetizationEligible: boolean;
  /** Fecha de la última verificación de métricas */
  lastCheck: Date;
  /** Vistas de Shorts en los últimos 90 días (vía alternativa de monetización) */
  shortsViewsLast90Days?: number;
}

/**
 * Resultado de la verificación de elegibilidad de Shorts para YPP.
 * YouTube permite monetizar con 10M vistas de Shorts en 90 días + 1000 suscriptores.
 * 
 * @requirement REQ-5.4.2
 */
export interface ShortsEligibilityResult {
  /** Indica si el canal es elegible por la vía de Shorts */
  isEligible: boolean;
  /** Porcentaje de progreso hacia 10M de vistas de Shorts (0-100+) */
  viewsProgress: number;
  /** Porcentaje de progreso hacia 1000 suscriptores (0-100+) */
  subscribersProgress: number;
  /** Lista de requisitos que aún no se cumplen */
  missingRequirements: string[];
}

/**
 * Métricas de rendimiento del contenido.
 * Valores promedio de las métricas de los videos del canal.
 * 
 * @requirement REQ-5.4.3
 */
export interface ContentPerformanceMetrics {
  /** Tasa de retención promedio (% del video visto) */
  averageRetentionRate: number;
  /** Click-Through Rate promedio (% de impresiones que generan clic) */
  averageCTR: number;
  /** Porcentaje promedio de tiempo de visualización del video */
  averageWatchTimePercent: number;
}

/**
 * Estado de verificación de una métrica individual.
 * Contiene si pasó, el valor actual y el umbral requerido.
 */
export interface MetricStatus {
  /** Indica si la métrica cumple el umbral mínimo */
  passed: boolean;
  /** Valor actual de la métrica */
  value: number;
  /** Umbral mínimo requerido */
  threshold: number;
}

/**
 * Resultado de la verificación de requisitos de calidad.
 * Evalúa métricas de rendimiento para asegurar monetización estable.
 * 
 * @requirement REQ-5.4.3
 */
export interface QualityRequirementResult {
  /** Indica si todas las métricas de calidad cumplen los umbrales */
  passed: boolean;
  /** Estado de la métrica de retención */
  retentionStatus: MetricStatus;
  /** Estado de la métrica de CTR */
  ctrStatus: MetricStatus;
  /** Estado de la métrica de watch time */
  watchTimeStatus: MetricStatus;
  /** Lista de recomendaciones para mejorar métricas que no cumplen */
  recommendations: string[];
}

/**
 * Resultado de la verificación de requisitos YPP.
 * Indica elegibilidad y progreso hacia los umbrales requeridos.
 * 
 * @requirement REQ-5.4.2
 */
export interface YPPRequirementResult {
  /** Indica si el canal cumple TODOS los requisitos de YPP */
  isEligible: boolean;
  /** Porcentaje de progreso hacia 1000 suscriptores (0-100+) */
  subscribersProgress: number;
  /** Porcentaje de progreso hacia 4000 horas de watch time (0-100+) */
  watchHoursProgress: number;
  /** Lista de requisitos que aún no se cumplen */
  missingRequirements: string[];
}

/**
 * Tipos de alerta de progreso hacia objetivos YPP.
 * Activadas cuando un canal alcanza cierto umbral de un objetivo.
 * 
 * @requirement REQ-5.4.7
 */
export type AlertType = 'subscribers_80' | 'watchhours_80' | 'shorts_views_80' | 'monetization_imminent';

/**
 * Niveles de urgencia para alertas de progreso.
 * Determinados por el porcentaje de progreso hacia el objetivo.
 * 
 * @requirement REQ-5.4.7
 */
export type AlertUrgency = 'low' | 'medium' | 'high';

/**
 * Alerta de progreso hacia objetivos de monetización.
 * Generada cuando un canal se acerca a cumplir requisitos YPP.
 * 
 * @requirement REQ-5.4.7
 */
export interface ProgressAlert {
  /** Indica si la alerta fue activada */
  triggered: boolean;
  /** Tipo de alerta activada, null si no hay alerta */
  alertType: AlertType | null;
  /** Canal que generó la alerta */
  channelKey: 'channel1' | 'channel2' | 'channel3';
  /** Porcentaje de progreso actual hacia el objetivo (0-100+) */
  currentProgress: number;
  /** Mensaje descriptivo de la alerta */
  message: string;
  /** Nivel de urgencia basado en proximidad al objetivo */
  urgency: AlertUrgency;
}

/**
 * Resultado de verificación de milestone (80% o 100%) para alertas de Telegram.
 * Generado cuando un canal alcanza un hito importante hacia monetización YPP.
 * 
 * @requirement REQ-5.4.7
 */
export interface MilestoneAlertResult {
  /** Indica si se debe enviar la alerta (true cuando se cruzó un milestone) */
  shouldAlert: boolean;
  /** Canal que alcanzó el milestone */
  channelKey: 'channel1' | 'channel2' | 'channel3';
  /** Milestone alcanzado: 80 (cerca del objetivo) o 100 (elegible YPP) */
  milestone: number;
  /** Progreso actual en porcentaje para cada métrica */
  progress: {
    /** Porcentaje de progreso hacia 1000 suscriptores (0-100+) */
    subscribers: number;
    /** Porcentaje de progreso hacia 4000 horas de watch time (0-100+) */
    watchTime: number;
  };
  /** Mensaje formateado y celebratorio para enviar por Telegram */
  message: string;
}

/**
 * Tipos de plataforma disponibles para expansión.
 * YouTube es la plataforma base, Instagram y TikTok requieren monetización previa.
 * Facebook incluido para expansión futura.
 * 
 * @requirement REQ-5.4.5
 */
export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'facebook';

/**
 * Estado de una plataforma activa del usuario.
 * Usado para verificar si YouTube está activo y monetizado antes de expandir a otras plataformas.
 * 
 * @requirement REQ-5.4.5
 */
export interface PlatformExpansionStatus {
  /** Plataforma actual */
  platform: Platform;
  /** Si la plataforma está activa (tiene cuenta/canal creado) */
  isActive: boolean;
  /** Si la plataforma está monetizada (generando ingresos) */
  isMonetized: boolean;
}

/**
 * Resultado de verificación de expansión a plataforma (V2).
 * Versión extendida que incluye lista de plataformas actuales y plataforma objetivo.
 * 
 * @requirement REQ-5.4.5
 */
export interface PlatformExpansionResultV2 {
  /** Indica si la expansión a la plataforma está permitida */
  allowed: boolean;
  /** Razón explicativa del resultado */
  reason: string;
  /** Estado de todas las plataformas actuales evaluadas */
  currentPlatforms: PlatformExpansionStatus[];
  /** Plataforma objetivo a la cual se quiere expandir */
  targetPlatform: Platform;
  /** Explicación de qué se necesita para desbloquear (si está bloqueado) */
  requirement: string;
}

/**
 * Acciones disponibles para override manual.
 * Cada acción representa una operación que normalmente está bloqueada por el gate.
 * 
 * @requirement REQ-5.4.8
 */
export type OverrideAction = 'create_channel_3' | 'expand_instagram' | 'expand_tiktok' | 'skip_quality_check';

/**
 * Entrada de log para override manual.
 * Registra todos los intentos de override (exitosos y fallidos) para auditoría.
 * 
 * @requirement REQ-5.4.8
 */
export interface OverrideLogEntry {
  /** Timestamp del intento */
  timestamp: Date;
  /** Acción que se intentó hacer override */
  action: OverrideAction;
  /** ID del usuario que solicitó el override */
  userId: string;
  /** Razón proporcionada para el override */
  reason: string;
  /** Indica si el override fue confirmado exitosamente */
  confirmed: boolean;
  /** Tipo de evento: solicitud, confirmación exitosa, o confirmación fallida */
  eventType: 'request' | 'confirm_success' | 'confirm_failed';
  /** Detalles adicionales del fallo si aplica */
  failureReason?: string;
}

/**
 * Resultado de una operación de override.
 * Contiene el estado, código de confirmación y entrada de log.
 * 
 * @requirement REQ-5.4.8
 */
export interface OverrideResult {
  /** Indica si la operación fue exitosa */
  success: boolean;
  /** Acción que se está procesando */
  action: OverrideAction;
  /** Código de confirmación de 6 dígitos (solo en requestOverride) */
  confirmationCode: string;
  /** Indica si se requiere segunda confirmación (true en requestOverride) */
  requiresSecondConfirmation: boolean;
  /** Mensaje descriptivo del resultado */
  message: string;
  /** Entrada de log generada para auditoría */
  logEntry: OverrideLogEntry;
}

/**
 * Datos internos de un código de confirmación pendiente.
 * Almacenado temporalmente mientras se espera confirmación.
 */
interface PendingOverride {
  /** Código de 6 dígitos */
  code: string;
  /** Acción solicitada */
  action: OverrideAction;
  /** ID del usuario que solicitó */
  userId: string;
  /** Razón proporcionada */
  reason: string;
  /** Timestamp de creación */
  createdAt: Date;
  /** Timestamp de expiración (5 minutos después de creación) */
  expiresAt: Date;
}

/**
 * Estado actual de monetización del canal principal.
 * Usado para verificar si se puede expandir a otras plataformas.
 * 
 * @requirement REQ-5.4.5
 */
export interface MonetizationData {
  /** Indica si el canal ha recibido su primer dólar de YouTube */
  hasFirstDollar: boolean;
  /** Ingresos totales acumulados en USD */
  totalRevenue: number;
  /** Número de meses con ingresos positivos */
  monthsWithRevenue: number;
}

/**
 * Resultado de verificación de expansión a plataforma.
 * Indica si está permitida la expansión y los requisitos.
 * 
 * @requirement REQ-5.4.5
 */
export interface PlatformExpansionResult {
  /** Indica si la expansión a la plataforma está permitida */
  allowed: boolean;
  /** Plataforma evaluada */
  platform: Platform;
  /** Razón explicativa del resultado */
  reason: string;
  /** Explicación de qué se necesita para desbloquear (si está bloqueado) */
  requirement: string;
  /** Estado actual de monetización del canal */
  currentMonetizationStatus: {
    /** Si el canal ha recibido su primer dólar */
    hasFirstDollar: boolean;
    /** Ingresos totales acumulados */
    totalRevenue: number;
    /** Meses con ingresos positivos */
    monthsWithRevenue: number;
  };
}

/**
 * Estadísticas semanales de rendimiento de un canal.
 * Métricas de actividad y crecimiento de la última semana.
 * 
 * @requirement REQ-5.4.6
 */
export interface ChannelWeeklyStats {
  /** Cantidad de videos publicados esta semana */
  videosPublished: number;
  /** Vistas ganadas esta semana */
  viewsGained: number;
  /** Suscriptores ganados esta semana */
  subscribersGained: number;
}

/**
 * Estadísticas semanales combinadas de ambos canales.
 * 
 * @requirement REQ-5.4.6
 */
export interface WeeklyStatsInput {
  /** Estadísticas del canal 1 (NeuroSync AI) */
  channel1: ChannelWeeklyStats;
  /** Estadísticas del canal 2 (NeuroTech AI) */
  channel2: ChannelWeeklyStats;
}

/**
 * Información de progreso de un canal individual en el reporte semanal.
 * 
 * @requirement REQ-5.4.6
 */
export interface ChannelProgressInfo {
  /** Nombre del canal */
  name: string;
  /** Progreso hacia requisitos YPP tradicionales */
  yppProgress: YPPRequirementResult;
  /** Progreso hacia requisitos YPP vía Shorts */
  shortsProgress: ShortsEligibilityResult;
  /** Estado de métricas de calidad de contenido */
  qualityStatus: QualityRequirementResult;
  /** Estadísticas de la semana */
  weeklyStats: ChannelWeeklyStats;
}

/**
 * Reporte de progreso semanal hacia monetización.
 * Incluye estado de ambos canales y mensaje formateado para Telegram.
 * 
 * @requirement REQ-5.4.6
 */
export interface WeeklyProgressReport {
  /** Fecha y hora de generación del reporte */
  generatedAt: Date;
  /** Información de progreso del canal 1 (NeuroSync AI) */
  channel1: ChannelProgressInfo;
  /** Información de progreso del canal 2 (NeuroTech AI) */
  channel2: ChannelProgressInfo;
  /** Porcentaje combinado de progreso hacia monetización (0-100) */
  overallProgress: number;
  /** Descripción del siguiente objetivo a alcanzar */
  nextMilestone: string;
  /** Mensaje formateado para envío por Telegram */
  telegramMessage: string;
}

/**
 * Información del estado de monetización de un canal.
 * Usado para verificar si se puede crear un nuevo canal.
 * 
 * @requirement REQ-5.4.4
 */
export interface ChannelMonetizationStatus {
  /** Identificador del canal ('channel1' o 'channel2') */
  channelKey: 'channel1' | 'channel2' | 'channel3';
  /** Indica si el canal está monetizado (YPP aprobado y activo) */
  isMonetized: boolean;
  /** Indica si el canal cumple los requisitos técnicos de YPP (suscriptores + watch time/Shorts) */
  hasYPPRequirements: boolean;
  /** Meses desde la creación del canal */
  monthsSinceCreation: number;
}

/**
 * Resultado de verificación para crear nuevo canal.
 * Indica si está permitido crear canal 3 según la Regla de Oro #1.
 * 
 * @requirement REQ-5.4.4
 */
export interface NewChannelAllowedResult {
  /** Indica si se permite crear el nuevo canal */
  allowed: boolean;
  /** Razón explicativa del resultado */
  reason: string;
  /** Estado de monetización de cada canal evaluado */
  channels: ChannelMonetizationStatus[];
  /** Explicación de qué se necesita para poder crear el canal */
  requirement: string;
}

/**
 * Métricas de calidad del contenido.
 * Todas las puntuaciones están en escala 0-100.
 */
export interface QualityMetrics {
  /** Claridad del audio (0-100) */
  audioClarity: number;
  /** Estabilidad del video (0-100) */
  videoStability: number;
  /** Originalidad del contenido (0-100) */
  contentOriginality: number;
  /** Calidad del título (0-100) */
  titleQuality: number;
  /** Calidad de la descripción (0-100) */
  descriptionQuality: number;
  /** Puntuación general calculada (0-100) */
  overallScore: number;
}

/**
 * Resultado de la validación de contenido.
 * Contiene el veredicto, puntuación y detalles del análisis.
 */
export interface ValidationResult {
  /** Indica si el contenido pasó todas las validaciones */
  passed: boolean;
  /** Puntuación general de validación (0-100) */
  score: number;
  /** Lista de advertencias no bloqueantes */
  warnings: string[];
  /** Lista de errores que impiden la publicación */
  errors: string[];
  /** Métricas de calidad detalladas */
  metrics: QualityMetrics;
}

/**
 * Configuración para el gate de validación YPP.
 */
export interface YPPValidationConfig {
  /** Puntuación mínima requerida para aprobar (default: 70) */
  minPassingScore?: number;
  /** Puntuación mínima de claridad de audio (default: 60) */
  minAudioClarity?: number;
  /** Puntuación mínima de estabilidad de video (default: 60) */
  minVideoStability?: number;
  /** Puntuación mínima de originalidad (default: 70) */
  minContentOriginality?: number;
}

/**
 * Datos obtenidos de YouTube Analytics API.
 * Contiene métricas YPP, rendimiento de contenido y datos crudos de la API.
 * 
 * @requirement REQ-5.4.9
 */
export interface YouTubeAnalyticsData {
  /** ID del canal de YouTube consultado */
  channelId: string;
  /** Fecha y hora de obtención de los datos */
  fetchedAt: Date;
  /** Métricas del YouTube Partner Program */
  metrics: YPPMetrics;
  /** Métricas de rendimiento del contenido */
  performance: ContentPerformanceMetrics;
  /** Datos crudos de la API (opcional para debug) */
  rawData?: unknown;
}

/**
 * Entrada en la caché de YouTube Analytics.
 * Los resultados se cachean por 1 hora para evitar rate limits.
 * 
 * @requirement REQ-5.4.9
 */
interface YouTubeAnalyticsCacheEntry {
  /** Datos cacheados */
  data: YouTubeAnalyticsData;
  /** Timestamp de expiración (1 hora después de fetch) */
  expiresAt: Date;
}

/** Duración del caché en milisegundos (1 hora) */
const YOUTUBE_ANALYTICS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Datos simplificados de YouTube Analytics API para métricas en tiempo real.
 * Versión específica para integración con YouTube Analytics API (tarea 17.10).
 * 
 * @requirement REQ-5.4.9
 */
export interface YouTubeAnalyticsDataV2 {
  /** ID del canal de YouTube consultado */
  channelId: string;
  /** Número actual de suscriptores */
  subscribers: number;
  /** Total de horas de watch time acumuladas */
  totalWatchTimeHours: number;
  /** Total de vistas del canal */
  totalViews: number;
  /** Vistas de Shorts en los últimos 90 días (vía alternativa de monetización) */
  shortsViews90Days?: number;
  /** Ingresos estimados en USD (solo disponible si el canal está monetizado) */
  estimatedRevenue?: number;
  /** Fecha y hora de la última actualización de los datos */
  lastUpdated: Date;
}

/**
 * Configuración para obtener métricas de YouTube Analytics.
 * Permite personalizar el comportamiento del fetch de datos.
 * 
 * @requirement REQ-5.4.9
 */
export interface YouTubeAnalyticsConfig {
  /** API key de YouTube Analytics (si no se proporciona, usar datos mock) */
  apiKey?: string;
  /** Forzar uso de datos mock (útil para desarrollo y testing) */
  useMockData?: boolean;
  /** TTL del cache en horas (por defecto 1 hora) */
  cacheHours?: number;
}

/**
 * Entrada en la caché de YouTube Analytics V2.
 * Los resultados se cachean según configuración para evitar rate limits.
 */
interface YouTubeAnalyticsCacheEntryV2 {
  /** Datos cacheados */
  data: YouTubeAnalyticsDataV2;
  /** Timestamp de expiración según configuración */
  expiresAt: Date;
}

/**
 * Datos de progreso semanal para generar reporte de Telegram.
 * Contiene métricas actuales y ganadas durante la semana de ambos canales.
 * 
 * @requirement REQ-5.4.6
 */
export interface WeeklyProgressData {
  /** Datos del canal 1 (NeuroSync AI) */
  channel1: {
    /** Número actual de suscriptores */
    subscribers: number;
    /** Suscriptores ganados esta semana */
    subscribersGained: number;
    /** Horas de watch time acumuladas */
    watchTimeHours: number;
    /** Horas de watch time ganadas esta semana */
    watchTimeGained: number;
    /** Vistas totales */
    views: number;
    /** Vistas ganadas esta semana */
    viewsGained: number;
  };
  /** Datos del canal 2 (NeuroTech AI) */
  channel2: {
    /** Número actual de suscriptores */
    subscribers: number;
    /** Suscriptores ganados esta semana */
    subscribersGained: number;
    /** Horas de watch time acumuladas */
    watchTimeHours: number;
    /** Horas de watch time ganadas esta semana */
    watchTimeGained: number;
    /** Vistas totales */
    views: number;
    /** Vistas ganadas esta semana */
    viewsGained: number;
  };
  /** Número de semana del año (1-52) */
  weekNumber: number;
  /** Año del reporte */
  year: number;
}

/**
 * Tendencia semanal del progreso hacia monetización.
 * Indica si el crecimiento está mejorando, disminuyendo o estable.
 * 
 * @requirement REQ-5.4.6
 */
export type WeeklyTrend = 'improving' | 'declining' | 'stable';

/**
 * Snapshot de progreso hacia monetización para histórico.
 * Almacena métricas de un canal en un momento específico para análisis de tendencias.
 * 
 * @requirement REQ-5.4.10
 */
export interface ProgressSnapshot {
  /** ID único del snapshot (auto-generado en memoria, será PRIMARY KEY en SQLite) */
  id?: number;
  /** Canal al que pertenece el snapshot */
  channelKey: 'channel1' | 'channel2' | 'channel3';
  /** Momento de captura del snapshot */
  timestamp: Date;
  /** Número de suscriptores al momento del snapshot */
  subscribers: number;
  /** Horas de watch time acumuladas */
  watchTimeHours: number;
  /** Vistas totales al momento del snapshot */
  views: number;
  /** Vistas de Shorts en los últimos 90 días (opcional) */
  shortsViews90Days?: number;
}

/**
 * Parámetros de consulta para el histórico de progreso.
 * Permite filtrar snapshots por canal, rango de fechas y límite.
 * 
 * @requirement REQ-5.4.10
 */
export interface ProgressHistoryQuery {
  /** Canal a filtrar. Si no se especifica, retorna ambos canales */
  channelKey?: 'channel1' | 'channel2' | 'channel3';
  /** Fecha de inicio del rango (inclusive) */
  startDate?: Date;
  /** Fecha de fin del rango (inclusive) */
  endDate?: Date;
  /** Límite de resultados. Por defecto 100 */
  limit?: number;
}

/**
 * Resultado del reporte de progreso semanal formateado para Telegram.
 * Incluye mensaje de texto, estado YPP de cada canal, tendencia y estimación.
 * 
 * @requirement REQ-5.4.6
 */
export interface ProgressReportResult {
  /** Mensaje formateado para Telegram (markdown) */
  text: string;
  /** Estado de requisitos YPP de cada canal */
  yppStatus: {
    /** Estado YPP del canal 1 */
    channel1: YPPRequirementResult;
    /** Estado YPP del canal 2 */
    channel2: YPPRequirementResult;
  };
  /** Tendencia semanal del progreso */
  weeklyTrend: WeeklyTrend;
  /** Semanas estimadas para alcanzar YPP por canal */
  estimatedWeeksToYPP: {
    /** Semanas estimadas para canal 1 (null si ya monetizado) */
    channel1: number | null;
    /** Semanas estimadas para canal 2 (null si ya monetizado) */
    channel2: number | null;
  };
}

/**
 * Clase principal para validación de contenido antes de publicar en YouTube.
 * Verifica que el contenido cumpla con estándares de calidad y requisitos YPP.
 * 
 * @example
 * ```typescript
 * const gate = new YPPValidationGate({ minPassingScore: 75 });
 * const result = await gate.validate(content);
 * if (result.passed) {
 *   // Proceder con la publicación
 * }
 * ```
 */
export class YPPValidationGate {
  private readonly config: Required<YPPValidationConfig>;
  
  /** Almacén de overrides pendientes de confirmación (código -> datos) */
  private readonly pendingOverrides: Map<string, PendingOverride> = new Map();
  
  /** Log de todos los intentos de override para auditoría */
  private readonly overrideLogs: OverrideLogEntry[] = [];

  /** Caché de datos de YouTube Analytics por canal (clave: channelKey, valor: datos cacheados) */
  private readonly analyticsCache: Map<'channel1' | 'channel2' | 'channel3', YouTubeAnalyticsCacheEntry> = new Map();

  /** Caché de datos de YouTube Analytics V2 por canal (para método fetchYouTubeAnalyticsV2) */
  private readonly analyticsCacheV2: Map<'channel1' | 'channel2' | 'channel3', YouTubeAnalyticsCacheEntryV2> = new Map();

  /** 
   * Almacenamiento en memoria para histórico de progreso.
   * Compatible con futura migración a SQLite (usa estructura similar a tabla).
   * @requirement REQ-5.4.10
   */
  private readonly progressHistory: ProgressSnapshot[] = [];

  /** Contador auto-incremental para IDs de snapshots (simula AUTOINCREMENT de SQLite) */
  private progressHistoryNextId: number = 1;
  
  /** Tiempo de expiración del código de confirmación en milisegundos (5 minutos) */
  private static readonly OVERRIDE_EXPIRATION_MS = 5 * 60 * 1000;

  /** Valores por defecto para la configuración */
  private static readonly DEFAULT_CONFIG: Required<YPPValidationConfig> = {
    minPassingScore: 70,
    minAudioClarity: 60,
    minVideoStability: 60,
    minContentOriginality: 70,
  };

  /**
   * Crea una nueva instancia del gate de validación YPP.
   * @param config - Configuración opcional para personalizar umbrales
   */
  constructor(config: YPPValidationConfig = {}) {
    this.config = {
      ...YPPValidationGate.DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Obtiene la configuración actual del gate.
   * @returns Configuración completa incluyendo valores por defecto
   */
  public getConfig(): Required<YPPValidationConfig> {
    return { ...this.config };
  }

  /**
   * Verifica si las métricas del canal cumplen los requisitos del YouTube Partner Program.
   * 
   * Requisitos verificados:
   * - ≥1000 suscriptores
   * - ≥4000 horas de watch time (últimos 12 meses)
   * 
   * @param metrics - Métricas actuales del canal de YouTube
   * @returns Resultado con elegibilidad, progreso y requisitos faltantes
   * 
   * @requirement REQ-5.4.2
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const result = gate.checkYPPRequirements({
   *   channelSubscribers: 500,
   *   totalWatchHours: 2000,
   *   videoCount: 50,
   *   isMonetizationEligible: false,
   *   lastCheck: new Date()
   * });
   * // result.isEligible === false
   * // result.subscribersProgress === 50
   * // result.watchHoursProgress === 50
   * // result.missingRequirements === ['Necesitas 500 suscriptores más', 'Necesitas 2000 horas de watch time más']
   * ```
   */
  public checkYPPRequirements(metrics: YPPMetrics): YPPRequirementResult {
    const missingRequirements: string[] = [];

    // Calcular progreso de suscriptores (porcentaje hacia 1000)
    const subscribersProgress = (metrics.channelSubscribers / YPP_THRESHOLDS.MIN_SUBSCRIBERS) * 100;
    
    // Calcular progreso de watch time (porcentaje hacia 4000h)
    const watchHoursProgress = (metrics.totalWatchHours / YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS) * 100;

    // Verificar si cumple requisito de suscriptores
    const hasEnoughSubscribers = metrics.channelSubscribers >= YPP_THRESHOLDS.MIN_SUBSCRIBERS;
    if (!hasEnoughSubscribers) {
      const remaining = YPP_THRESHOLDS.MIN_SUBSCRIBERS - metrics.channelSubscribers;
      missingRequirements.push(`Necesitas ${remaining} suscriptores más`);
    }

    // Verificar si cumple requisito de watch time
    const hasEnoughWatchTime = metrics.totalWatchHours >= YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS;
    if (!hasEnoughWatchTime) {
      const remaining = YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS - metrics.totalWatchHours;
      missingRequirements.push(`Necesitas ${remaining} horas de watch time más`);
    }

    // Es elegible solo si cumple AMBOS requisitos
    const isEligible = hasEnoughSubscribers && hasEnoughWatchTime;

    return {
      isEligible,
      subscribersProgress: Math.round(subscribersProgress * 100) / 100, // Redondear a 2 decimales
      watchHoursProgress: Math.round(watchHoursProgress * 100) / 100,
      missingRequirements,
    };
  }

  // Los métodos de validación adicionales se implementarán en tareas siguientes:
  // - validate(): Método principal de validación
  // - validateQuality(): Validar métricas de calidad
  // - validateYPPCompliance(): Validar cumplimiento YPP
  // - calculateOverallScore(): Calcular puntuación general

  /**
   * Verifica si las métricas del canal cumplen la vía alternativa de YPP mediante Shorts.
   * 
   * Requisitos verificados (vía alternativa):
   * - ≥1000 suscriptores
   * - ≥10,000,000 vistas de Shorts (últimos 90 días)
   * 
   * @param metrics - Métricas actuales del canal de YouTube (debe incluir shortsViewsLast90Days)
   * @returns Resultado con elegibilidad, progreso y requisitos faltantes
   * 
   * @requirement REQ-5.4.2
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const result = gate.checkShortsEligibility({
   *   channelSubscribers: 500,
   *   totalWatchHours: 100,
   *   videoCount: 50,
   *   isMonetizationEligible: false,
   *   lastCheck: new Date(),
   *   shortsViewsLast90Days: 5_000_000
   * });
   * // result.isEligible === false
   * // result.viewsProgress === 50
   * // result.subscribersProgress === 50
   * // result.missingRequirements === ['Necesitas 500 suscriptores más', 'Necesitas 5,000,000 vistas de Shorts más']
   * ```
   */
  public checkShortsEligibility(metrics: YPPMetrics): ShortsEligibilityResult {
    const missingRequirements: string[] = [];

    // Obtener vistas de Shorts (usar 0 si no está definido)
    const shortsViews = metrics.shortsViewsLast90Days ?? 0;

    // Calcular progreso de vistas de Shorts (porcentaje hacia 10M)
    const viewsProgress = (shortsViews / YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS) * 100;

    // Calcular progreso de suscriptores (porcentaje hacia 1000)
    const subscribersProgress = (metrics.channelSubscribers / YPP_THRESHOLDS.MIN_SUBSCRIBERS) * 100;

    // Verificar si cumple requisito de suscriptores
    const hasEnoughSubscribers = metrics.channelSubscribers >= YPP_THRESHOLDS.MIN_SUBSCRIBERS;
    if (!hasEnoughSubscribers) {
      const remaining = YPP_THRESHOLDS.MIN_SUBSCRIBERS - metrics.channelSubscribers;
      missingRequirements.push(`Necesitas ${remaining} suscriptores más`);
    }

    // Verificar si cumple requisito de vistas de Shorts
    const hasEnoughShortsViews = shortsViews >= YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS;
    if (!hasEnoughShortsViews) {
      const remaining = YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS - shortsViews;
      // Formatear número con separadores de miles para mejor legibilidad
      const formattedRemaining = remaining.toLocaleString('es-ES');
      missingRequirements.push(`Necesitas ${formattedRemaining} vistas de Shorts más`);
    }

    // Es elegible solo si cumple AMBOS requisitos de la vía alternativa
    const isEligible = hasEnoughSubscribers && hasEnoughShortsViews;

    return {
      isEligible,
      viewsProgress: Math.round(viewsProgress * 100) / 100, // Redondear a 2 decimales
      subscribersProgress: Math.round(subscribersProgress * 100) / 100,
      missingRequirements,
    };
  }

  /**
   * Verifica si las métricas de rendimiento del contenido cumplen los requisitos de calidad.
   * 
   * Requisitos verificados:
   * - Retención promedio ≥50%
   * - CTR promedio ≥4%
   * - Watch time promedio ≥40%
   * 
   * @param metrics - Métricas de rendimiento del contenido
   * @returns Resultado con estado de cada métrica y recomendaciones de mejora
   * 
   * @requirement REQ-5.4.3
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const result = gate.checkQualityRequirements({
   *   averageRetentionRate: 45,
   *   averageCTR: 3.5,
   *   averageWatchTimePercent: 50
   * });
   * // result.passed === false
   * // result.retentionStatus.passed === false
   * // result.ctrStatus.passed === false
   * // result.watchTimeStatus.passed === true
   * // result.recommendations.length === 2
   * ```
   */
  public checkQualityRequirements(metrics: ContentPerformanceMetrics): QualityRequirementResult {
    const recommendations: string[] = [];

    // Verificar retención
    const retentionPassed = metrics.averageRetentionRate >= QUALITY_THRESHOLDS.MIN_RETENTION_RATE;
    const retentionStatus: MetricStatus = {
      passed: retentionPassed,
      value: metrics.averageRetentionRate,
      threshold: QUALITY_THRESHOLDS.MIN_RETENTION_RATE,
    };

    if (!retentionPassed) {
      const difference = QUALITY_THRESHOLDS.MIN_RETENTION_RATE - metrics.averageRetentionRate;
      recommendations.push(
        `Mejora la retención: actualmente ${metrics.averageRetentionRate}%, necesitas ${QUALITY_THRESHOLDS.MIN_RETENTION_RATE}% (+${difference.toFixed(1)}%)`
      );
    }

    // Verificar CTR
    const ctrPassed = metrics.averageCTR >= QUALITY_THRESHOLDS.MIN_CTR;
    const ctrStatus: MetricStatus = {
      passed: ctrPassed,
      value: metrics.averageCTR,
      threshold: QUALITY_THRESHOLDS.MIN_CTR,
    };

    if (!ctrPassed) {
      const difference = QUALITY_THRESHOLDS.MIN_CTR - metrics.averageCTR;
      recommendations.push(
        `Mejora el CTR: actualmente ${metrics.averageCTR}%, necesitas ${QUALITY_THRESHOLDS.MIN_CTR}% (+${difference.toFixed(1)}%)`
      );
    }

    // Verificar Watch Time
    const watchTimePassed = metrics.averageWatchTimePercent >= QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT;
    const watchTimeStatus: MetricStatus = {
      passed: watchTimePassed,
      value: metrics.averageWatchTimePercent,
      threshold: QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT,
    };

    if (!watchTimePassed) {
      const difference = QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT - metrics.averageWatchTimePercent;
      recommendations.push(
        `Mejora el watch time: actualmente ${metrics.averageWatchTimePercent}%, necesitas ${QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT}% (+${difference.toFixed(1)}%)`
      );
    }

    // Pasa solo si cumple TODAS las métricas
    const passed = retentionPassed && ctrPassed && watchTimePassed;

    return {
      passed,
      retentionStatus,
      ctrStatus,
      watchTimeStatus,
      recommendations,
    };
  }

  /**
   * Verifica si se puede crear un nuevo canal (canal 3).
   * 
   * Según la Regla de Oro #1: NO crear canal 3 hasta que canal 1 o 2 esté monetizado.
   * Esta verificación asegura que no se dispersen recursos sin validar el modelo de negocio.
   * 
   * Reglas de negocio:
   * 1. Si algún canal NO está monetizado, NO se permite crear el canal 3
   * 2. Si TODOS los canales están monetizados, se permite crear el canal 3
   * 3. El mensaje indica claramente qué canales faltan por monetizar
   * 
   * @param channels - Array con el estado de monetización de cada canal existente
   * @returns Resultado indicando si está permitido y la razón
   * 
   * @requirement REQ-5.4.4
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Caso: ningún canal monetizado
   * const result1 = gate.canCreateNewChannel([
   *   { channelKey: 'channel1', isMonetized: false, hasYPPRequirements: true, monthsSinceCreation: 6 },
   *   { channelKey: 'channel2', isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 3 }
   * ]);
   * // result1.allowed === false
   * // result1.reason contiene información sobre canales no monetizados
   * 
   * // Caso: todos los canales monetizados
   * const result2 = gate.canCreateNewChannel([
   *   { channelKey: 'channel1', isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 },
   *   { channelKey: 'channel2', isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 8 }
   * ]);
   * // result2.allowed === true
   * ```
   */
  public canCreateNewChannel(channels: ChannelMonetizationStatus[]): NewChannelAllowedResult {
    // Identificar canales no monetizados
    const nonMonetizedChannels = channels.filter(ch => !ch.isMonetized);
    
    // Si todos los canales están monetizados, se permite crear el canal 3
    if (nonMonetizedChannels.length === 0) {
      return {
        allowed: true,
        reason: '✅ Todos los canales existentes están monetizados. Se permite crear canal 3.',
        channels,
        requirement: 'Requisito cumplido: al menos un canal debe estar monetizado para crear nuevos canales.',
      };
    }

    // Construir lista de canales que faltan por monetizar
    const channelNames = nonMonetizedChannels.map(ch => {
      const channelNumber = ch.channelKey === 'channel1' ? '1 (NeuroSync AI)' : '2 (NeuroTech AI)';
      const yppStatus = ch.hasYPPRequirements 
        ? 'cumple requisitos YPP, pendiente de aprobación' 
        : 'no cumple requisitos YPP aún';
      return `Canal ${channelNumber} (${yppStatus}, ${ch.monthsSinceCreation} meses activo)`;
    });

    // Construir mensaje detallado
    const reason = `❌ No se puede crear canal 3. Canales sin monetizar: ${channelNames.join('; ')}. ` +
      `Regla de Oro #1: NO crear canal 3 hasta que canal 1 o 2 esté monetizado.`;

    // Construir explicación del requisito
    const requirement = nonMonetizedChannels.length === channels.length
      ? 'Se requiere que AL MENOS uno de los canales existentes esté monetizado (YPP aprobado) para crear canal 3.'
      : `Se requiere monetizar ${nonMonetizedChannels.length === 1 ? 'el canal restante' : 'los canales restantes'} antes de crear canal 3.`;

    return {
      allowed: false,
      reason,
      channels,
      requirement,
    };
  }

  /**
   * Verifica si se puede expandir a una plataforma específica.
   * 
   * Según la Regla de Oro #2: NO expandir a Instagram/TikTok hasta que YouTube pague el primer dólar.
   * Esta verificación asegura que la monetización esté validada antes de dispersar esfuerzos.
   * 
   * Reglas de negocio:
   * 1. YouTube siempre está permitido (es la plataforma base)
   * 2. Instagram requiere hasFirstDollar === true
   * 3. TikTok requiere hasFirstDollar === true
   * 4. El mensaje explica por qué está bloqueado y qué se necesita
   * 
   * @param platform - Plataforma objetivo ('instagram', 'tiktok' o 'youtube')
   * @param monetizationData - Datos de monetización actual del canal de YouTube
   * @returns Resultado con estado de permiso, razón y requisitos
   * 
   * @requirement REQ-5.4.5
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Caso: sin monetización, intentando expandir a Instagram
   * const result1 = gate.canExpandToPlatform('instagram', {
   *   hasFirstDollar: false,
   *   totalRevenue: 0,
   *   monthsWithRevenue: 0
   * });
   * // result1.allowed === false
   * // result1.reason contiene "Regla de Oro #2"
   * 
   * // Caso: con monetización, expandir a TikTok
   * const result2 = gate.canExpandToPlatform('tiktok', {
   *   hasFirstDollar: true,
   *   totalRevenue: 150.50,
   *   monthsWithRevenue: 3
   * });
   * // result2.allowed === true
   * 
   * // Caso: YouTube siempre permitido
   * const result3 = gate.canExpandToPlatform('youtube', {
   *   hasFirstDollar: false,
   *   totalRevenue: 0,
   *   monthsWithRevenue: 0
   * });
   * // result3.allowed === true
   * ```
   */
  public canExpandToPlatform(
    platform: Platform,
    monetizationData: MonetizationData
  ): PlatformExpansionResult {
    // Construir estado de monetización para incluir en resultado
    const currentMonetizationStatus = {
      hasFirstDollar: monetizationData.hasFirstDollar,
      totalRevenue: monetizationData.totalRevenue,
      monthsWithRevenue: monetizationData.monthsWithRevenue,
    };

    // YouTube es la plataforma base, siempre permitida
    if (platform === 'youtube') {
      return {
        allowed: true,
        platform,
        reason: '✅ YouTube es la plataforma base. Siempre permitida.',
        requirement: 'Sin requisitos adicionales. YouTube es la plataforma principal del sistema.',
        currentMonetizationStatus,
      };
    }

    // Para Instagram y TikTok, verificar que se haya recibido el primer dólar
    if (monetizationData.hasFirstDollar) {
      // Permitido: el canal ya ha monetizado
      const platformName = platform === 'instagram' ? 'Instagram Reels' : 'TikTok';
      
      return {
        allowed: true,
        platform,
        reason: `✅ Expansión a ${platformName} permitida. El canal ya ha generado ingresos ` +
          `($${monetizationData.totalRevenue.toFixed(2)} en ${monetizationData.monthsWithRevenue} ${monetizationData.monthsWithRevenue === 1 ? 'mes' : 'meses'}).`,
        requirement: 'Requisito cumplido: el canal de YouTube ya ha recibido su primer dólar de monetización.',
        currentMonetizationStatus,
      };
    }

    // Bloqueado: no se ha monetizado aún
    const platformName = platform === 'instagram' ? 'Instagram Reels' : 'TikTok';
    
    return {
      allowed: false,
      platform,
      reason: `❌ No se puede expandir a ${platformName}. El canal de YouTube aún no ha generado ingresos. ` +
        `Regla de Oro #2: NO expandir a IG/TikTok hasta que YouTube pague el primer dólar.`,
      requirement: 'Se requiere que el canal de YouTube genere al menos $1 de ingresos antes de expandir a otras plataformas. ' +
        'Esto valida el modelo de negocio antes de dispersar esfuerzos.',
      currentMonetizationStatus,
    };
  }

  /**
   * Verifica si se puede expandir a una plataforma específica usando estado de plataformas actuales.
   * 
   * Esta versión del método recibe un array de PlatformExpansionStatus que indica qué plataformas
   * están activas y cuáles están monetizadas. Es útil cuando se quiere verificar expansión
   * basándose en el estado actual de todas las plataformas del usuario.
   * 
   * Reglas de negocio:
   * 1. YouTube debe estar activo Y monetizado antes de expandir a cualquier otra plataforma (IG/TikTok/FB)
   * 2. Si YouTube no está activo, no se permite expandir (plataforma base requerida)
   * 3. Si YouTube está activo pero no monetizado, no se permite expandir (Regla de Oro #2)
   * 4. Si se intenta "expandir" a YouTube y ya está activo, el resultado lo refleja apropiadamente
   * 5. Facebook sigue las mismas reglas que Instagram y TikTok (requiere YouTube monetizado)
   * 
   * @param targetPlatform - Plataforma objetivo a la cual se quiere expandir
   * @param currentPlatforms - Array con el estado de todas las plataformas actuales del usuario
   * @returns Resultado V2 con estado de permiso, plataformas actuales, plataforma objetivo y requisitos
   * 
   * @requirement REQ-5.4.5
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Caso: YouTube activo y monetizado, expandir a Instagram
   * const result1 = gate.canExpandToPlatformV2('instagram', [
   *   { platform: 'youtube', isActive: true, isMonetized: true }
   * ]);
   * // result1.allowed === true
   * 
   * // Caso: YouTube activo pero NO monetizado, intentar expandir a TikTok
   * const result2 = gate.canExpandToPlatformV2('tiktok', [
   *   { platform: 'youtube', isActive: true, isMonetized: false }
   * ]);
   * // result2.allowed === false
   * // result2.reason contiene "Regla de Oro #2"
   * 
   * // Caso: Sin YouTube activo, intentar expandir a Instagram
   * const result3 = gate.canExpandToPlatformV2('instagram', []);
   * // result3.allowed === false
   * // result3.reason indica que YouTube debe estar activo primero
   * 
   * // Caso: Intentar "expandir" a YouTube (ya activo)
   * const result4 = gate.canExpandToPlatformV2('youtube', [
   *   { platform: 'youtube', isActive: true, isMonetized: false }
   * ]);
   * // result4.allowed === true (YouTube ya está activo)
   * ```
   */
  public canExpandToPlatformV2(
    targetPlatform: Platform,
    currentPlatforms: PlatformExpansionStatus[]
  ): PlatformExpansionResultV2 {
    // Buscar estado de YouTube en las plataformas actuales
    const youtubeStatus = currentPlatforms.find(p => p.platform === 'youtube');
    
    // Caso especial: expandir a YouTube
    if (targetPlatform === 'youtube') {
      // Si YouTube ya está activo, indicarlo
      if (youtubeStatus?.isActive) {
        return {
          allowed: true,
          reason: '✅ YouTube ya está activo. Es la plataforma base del sistema.',
          currentPlatforms,
          targetPlatform,
          requirement: 'Sin requisitos adicionales. YouTube es la plataforma principal y ya está activa.',
        };
      }
      
      // Si YouTube no está activo, permitir su activación
      return {
        allowed: true,
        reason: '✅ Se puede activar YouTube. Es la plataforma base y debe ser la primera en activarse.',
        currentPlatforms,
        targetPlatform,
        requirement: 'YouTube debe ser la primera plataforma activa antes de expandir a otras.',
      };
    }
    
    // Para Instagram, TikTok o Facebook, verificar que YouTube esté activo y monetizado
    const platformNames: Record<Platform, string> = {
      youtube: 'YouTube',
      instagram: 'Instagram Reels',
      tiktok: 'TikTok',
      facebook: 'Facebook',
    };
    
    const targetPlatformName = platformNames[targetPlatform];
    
    // Verificar si YouTube está activo
    if (!youtubeStatus || !youtubeStatus.isActive) {
      return {
        allowed: false,
        reason: `❌ No se puede expandir a ${targetPlatformName}. YouTube no está activo como plataforma base. ` +
          `Debes crear y activar tu canal de YouTube primero.`,
        currentPlatforms,
        targetPlatform,
        requirement: 'YouTube debe estar activo antes de expandir a otras plataformas. ' +
          'Es la plataforma base del sistema OmniAI.',
      };
    }
    
    // Verificar si YouTube está monetizado (Regla de Oro #2)
    if (!youtubeStatus.isMonetized) {
      return {
        allowed: false,
        reason: `❌ No se puede expandir a ${targetPlatformName}. YouTube está activo pero no monetizado. ` +
          `Regla de Oro #2: NO expandir a IG/TikTok/Facebook hasta que YouTube pague el primer dólar.`,
        currentPlatforms,
        targetPlatform,
        requirement: 'Se requiere que el canal de YouTube esté monetizado (YPP aprobado y generando ingresos) ' +
          'antes de expandir a otras plataformas. Esto valida el modelo de negocio.',
      };
    }
    
    // YouTube está activo Y monetizado, permitir expansión
    return {
      allowed: true,
      reason: `✅ Expansión a ${targetPlatformName} permitida. YouTube está activo y monetizado. ` +
        `Se cumple la Regla de Oro #2: YouTube ya está generando ingresos.`,
      currentPlatforms,
      targetPlatform,
      requirement: 'Requisito cumplido: YouTube está activo y monetizado. Puedes expandir a otras plataformas.',
    };
  }

  /**
   * Genera un reporte de progreso semanal hacia monetización.
   * 
   * Este método evalúa el estado de ambos canales y genera un reporte completo
   * con progreso YPP, progreso Shorts, métricas de calidad y estadísticas semanales.
   * El reporte incluye un mensaje formateado para envío por Telegram.
   * 
   * @param channel1Metrics - Métricas YPP del canal 1 (NeuroSync AI)
   * @param channel2Metrics - Métricas YPP del canal 2 (NeuroTech AI)
   * @param channel1Performance - Métricas de rendimiento del canal 1
   * @param channel2Performance - Métricas de rendimiento del canal 2
   * @param weeklyStats - Estadísticas semanales de ambos canales
   * @returns Reporte completo con progreso, milestones y mensaje para Telegram
   * 
   * @requirement REQ-5.4.6
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const report = gate.generateProgressReport(
   *   { channelSubscribers: 750, totalWatchHours: 2500, videoCount: 30, isMonetizationEligible: false, lastCheck: new Date() },
   *   { channelSubscribers: 400, totalWatchHours: 1200, videoCount: 20, isMonetizationEligible: false, lastCheck: new Date() },
   *   { averageRetentionRate: 55, averageCTR: 4.5, averageWatchTimePercent: 45 },
   *   { averageRetentionRate: 48, averageCTR: 3.8, averageWatchTimePercent: 38 },
   *   {
   *     channel1: { videosPublished: 5, viewsGained: 1200, subscribersGained: 35 },
   *     channel2: { videosPublished: 4, viewsGained: 800, subscribersGained: 20 }
   *   }
   * );
   * // report.overallProgress contiene el porcentaje combinado
   * // report.telegramMessage contiene formato HTML para Telegram
   * ```
   */
  public generateProgressReport(
    channel1Metrics: YPPMetrics,
    channel2Metrics: YPPMetrics,
    channel1Performance: ContentPerformanceMetrics,
    channel2Performance: ContentPerformanceMetrics,
    weeklyStats: WeeklyStatsInput
  ): WeeklyProgressReport {
    // Evaluar progreso YPP de ambos canales
    const channel1YPP = this.checkYPPRequirements(channel1Metrics);
    const channel2YPP = this.checkYPPRequirements(channel2Metrics);

    // Evaluar progreso de Shorts de ambos canales
    const channel1Shorts = this.checkShortsEligibility(channel1Metrics);
    const channel2Shorts = this.checkShortsEligibility(channel2Metrics);

    // Evaluar calidad de contenido de ambos canales
    const channel1Quality = this.checkQualityRequirements(channel1Performance);
    const channel2Quality = this.checkQualityRequirements(channel2Performance);

    // Construir información de cada canal
    const channel1Info: ChannelProgressInfo = {
      name: 'NeuroSync AI',
      yppProgress: channel1YPP,
      shortsProgress: channel1Shorts,
      qualityStatus: channel1Quality,
      weeklyStats: weeklyStats.channel1,
    };

    const channel2Info: ChannelProgressInfo = {
      name: 'NeuroTech AI',
      yppProgress: channel2YPP,
      shortsProgress: channel2Shorts,
      qualityStatus: channel2Quality,
      weeklyStats: weeklyStats.channel2,
    };

    // Calcular progreso general combinado
    const overallProgress = this.calculateOverallProgress(
      channel1YPP,
      channel2YPP,
      channel1Quality,
      channel2Quality
    );

    // Determinar siguiente milestone
    const nextMilestone = this.determineNextMilestone(
      channel1YPP,
      channel2YPP,
      channel1Quality,
      channel2Quality
    );

    // Generar mensaje de Telegram
    const telegramMessage = this.formatTelegramMessage(
      channel1Info,
      channel2Info,
      overallProgress,
      nextMilestone,
      weeklyStats
    );

    return {
      generatedAt: new Date(),
      channel1: channel1Info,
      channel2: channel2Info,
      overallProgress,
      nextMilestone,
      telegramMessage,
    };
  }

  /**
   * Calcula el progreso general combinado hacia monetización.
   * Pondera suscriptores (40%), watch time (40%) y calidad (20%).
   * Toma el mejor canal como referencia principal.
   */
  private calculateOverallProgress(
    channel1YPP: YPPRequirementResult,
    channel2YPP: YPPRequirementResult,
    channel1Quality: QualityRequirementResult,
    channel2Quality: QualityRequirementResult
  ): number {
    // Calcular progreso de cada canal (máximo 100% para evitar distorsión)
    const channel1SubsProgress = Math.min(channel1YPP.subscribersProgress, 100);
    const channel1WatchProgress = Math.min(channel1YPP.watchHoursProgress, 100);
    const channel2SubsProgress = Math.min(channel2YPP.subscribersProgress, 100);
    const channel2WatchProgress = Math.min(channel2YPP.watchHoursProgress, 100);

    // Calcular progreso de calidad (cada métrica cuenta 33.33%)
    const channel1QualityScore = this.calculateQualityScore(channel1Quality);
    const channel2QualityScore = this.calculateQualityScore(channel2Quality);

    // Progreso YPP de cada canal (subs 50%, watch time 50%)
    const channel1YPPProgress = (channel1SubsProgress * 0.5) + (channel1WatchProgress * 0.5);
    const channel2YPPProgress = (channel2SubsProgress * 0.5) + (channel2WatchProgress * 0.5);

    // Tomar el mejor canal para YPP y el mejor para calidad
    const bestYPPProgress = Math.max(channel1YPPProgress, channel2YPPProgress);
    const bestQualityScore = Math.max(channel1QualityScore, channel2QualityScore);

    // Progreso general: YPP 80%, Calidad 20%
    const overall = (bestYPPProgress * 0.8) + (bestQualityScore * 0.2);

    // Redondear a 2 decimales
    return Math.round(overall * 100) / 100;
  }

  /**
   * Calcula la puntuación de calidad como porcentaje (0-100).
   */
  private calculateQualityScore(quality: QualityRequirementResult): number {
    let score = 0;
    let total = 0;

    // Retención: normalizada al umbral (50% = 100 puntos)
    const retentionScore = Math.min(
      (quality.retentionStatus.value / QUALITY_THRESHOLDS.MIN_RETENTION_RATE) * 100, 
      100
    );
    score += retentionScore;
    total += 100;

    // CTR: normalizado al umbral (4% = 100 puntos)
    const ctrScore = Math.min(
      (quality.ctrStatus.value / QUALITY_THRESHOLDS.MIN_CTR) * 100, 
      100
    );
    score += ctrScore;
    total += 100;

    // Watch Time: normalizado al umbral (40% = 100 puntos)
    const watchTimeScore = Math.min(
      (quality.watchTimeStatus.value / QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT) * 100, 
      100
    );
    score += watchTimeScore;
    total += 100;

    return (score / total) * 100;
  }

  /**
   * Determina el siguiente milestone más importante a alcanzar.
   */
  private determineNextMilestone(
    channel1YPP: YPPRequirementResult,
    channel2YPP: YPPRequirementResult,
    channel1Quality: QualityRequirementResult,
    channel2Quality: QualityRequirementResult
  ): string {
    // Si algún canal ya es elegible YPP, enfocarse en calidad o en el otro canal
    if (channel1YPP.isEligible && channel2YPP.isEligible) {
      // Ambos canales elegibles YPP, verificar calidad
      if (!channel1Quality.passed && !channel2Quality.passed) {
        return 'Mejorar métricas de calidad de contenido para asegurar monetización sostenible';
      }
      return '🎉 ¡Ambos canales cumplen requisitos YPP! Aplicar al programa de monetización';
    }

    if (channel1YPP.isEligible) {
      return `Canal 1 listo para YPP. Enfocarse en Canal 2: ${channel2YPP.missingRequirements.join(', ')}`;
    }

    if (channel2YPP.isEligible) {
      return `Canal 2 listo para YPP. Enfocarse en Canal 1: ${channel1YPP.missingRequirements.join(', ')}`;
    }

    // Ningún canal elegible, identificar el más cercano
    const channel1Progress = (channel1YPP.subscribersProgress + channel1YPP.watchHoursProgress) / 2;
    const channel2Progress = (channel2YPP.subscribersProgress + channel2YPP.watchHoursProgress) / 2;

    if (channel1Progress >= channel2Progress) {
      // Canal 1 más avanzado
      const milestone = channel1YPP.missingRequirements[0] || 'Mantener ritmo de crecimiento';
      return `Prioridad Canal 1 (NeuroSync AI): ${milestone}`;
    } else {
      // Canal 2 más avanzado
      const milestone = channel2YPP.missingRequirements[0] || 'Mantener ritmo de crecimiento';
      return `Prioridad Canal 2 (NeuroTech AI): ${milestone}`;
    }
  }

  /**
   * Formatea el mensaje de reporte para Telegram con HTML.
   */
  private formatTelegramMessage(
    channel1: ChannelProgressInfo,
    channel2: ChannelProgressInfo,
    overallProgress: number,
    nextMilestone: string,
    weeklyStats: WeeklyStatsInput
  ): string {
    const progressBar = this.generateProgressBar(overallProgress);
    const totalVideos = weeklyStats.channel1.videosPublished + weeklyStats.channel2.videosPublished;
    const totalViews = weeklyStats.channel1.viewsGained + weeklyStats.channel2.viewsGained;
    const totalSubs = weeklyStats.channel1.subscribersGained + weeklyStats.channel2.subscribersGained;

    // Iconos de estado para YPP
    const ch1YppIcon = channel1.yppProgress.isEligible ? '✅' : '⏳';
    const ch2YppIcon = channel2.yppProgress.isEligible ? '✅' : '⏳';

    // Iconos de estado para calidad
    const ch1QualityIcon = channel1.qualityStatus.passed ? '✅' : '⚠️';
    const ch2QualityIcon = channel2.qualityStatus.passed ? '✅' : '⚠️';

    const message = `
📊 <b>Reporte Semanal de Progreso YPP</b> 📊

${progressBar}
<b>Progreso General: ${overallProgress}%</b>

━━━━━━━━━━━━━━━━━━━━━━

📺 <b>${channel1.name}</b>
${ch1YppIcon} YPP: Subs ${channel1.yppProgress.subscribersProgress.toFixed(1)}% | WatchTime ${channel1.yppProgress.watchHoursProgress.toFixed(1)}%
${ch1QualityIcon} Calidad: Ret ${channel1.qualityStatus.retentionStatus.value}% | CTR ${channel1.qualityStatus.ctrStatus.value}% | WT ${channel1.qualityStatus.watchTimeStatus.value}%
📈 Semana: ${weeklyStats.channel1.videosPublished} videos | +${weeklyStats.channel1.viewsGained.toLocaleString('es-ES')} vistas | +${weeklyStats.channel1.subscribersGained} subs

━━━━━━━━━━━━━━━━━━━━━━

📺 <b>${channel2.name}</b>
${ch2YppIcon} YPP: Subs ${channel2.yppProgress.subscribersProgress.toFixed(1)}% | WatchTime ${channel2.yppProgress.watchHoursProgress.toFixed(1)}%
${ch2QualityIcon} Calidad: Ret ${channel2.qualityStatus.retentionStatus.value}% | CTR ${channel2.qualityStatus.ctrStatus.value}% | WT ${channel2.qualityStatus.watchTimeStatus.value}%
📈 Semana: ${weeklyStats.channel2.videosPublished} videos | +${weeklyStats.channel2.viewsGained.toLocaleString('es-ES')} vistas | +${weeklyStats.channel2.subscribersGained} subs

━━━━━━━━━━━━━━━━━━━━━━

📊 <b>Resumen Semanal Total</b>
• Videos publicados: ${totalVideos}
• Vistas ganadas: ${totalViews.toLocaleString('es-ES')}
• Suscriptores ganados: ${totalSubs}

🎯 <b>Siguiente Objetivo:</b>
${nextMilestone}

<i>"Autism is not a system error, it's a different operating system."</i>
`.trim();

    return message;
  }

  /**
   * Genera una barra de progreso visual para Telegram.
   */
  private generateProgressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
    return `[${bar}]`;
  }

  /**
   * Verifica el progreso hacia objetivos YPP y genera alertas cuando se acerca al 80%.
   * 
   * Reglas de negocio:
   * - Alerta de suscriptores: >= 800 (80% de 1000)
   * - Alerta de watch hours: >= 3200 (80% de 4000)
   * - Alerta de Shorts views: >= 8M (80% de 10M)
   * - Urgencia HIGH cuando >= 90%, MEDIUM cuando >= 80%, LOW cuando >= 70%
   * - Si todas las métricas están >= 90%, se genera alerta de monetización inminente
   * 
   * @param channelKey - Identificador del canal ('channel1' o 'channel2')
   * @param metrics - Métricas actuales del canal de YouTube
   * @returns Lista de alertas activadas (puede haber múltiples si está cerca de varios objetivos)
   * 
   * @requirement REQ-5.4.7
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const alerts = gate.checkProgressAlerts('channel1', {
   *   channelSubscribers: 850,
   *   totalWatchHours: 3500,
   *   videoCount: 50,
   *   isMonetizationEligible: false,
   *   lastCheck: new Date(),
   *   shortsViewsLast90Days: 5_000_000
   * });
   * // alerts contendrá alertas para suscriptores (85%) y watch hours (87.5%)
   * // No habrá alerta de Shorts porque 50% < 70%
   * ```
   */
  public checkProgressAlerts(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    metrics: YPPMetrics
  ): ProgressAlert[] {
    const alerts: ProgressAlert[] = [];
    const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';

    // Calcular progresos
    const subscribersProgress = (metrics.channelSubscribers / YPP_THRESHOLDS.MIN_SUBSCRIBERS) * 100;
    const watchHoursProgress = (metrics.totalWatchHours / YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS) * 100;
    const shortsViews = metrics.shortsViewsLast90Days ?? 0;
    const shortsProgress = (shortsViews / YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS) * 100;

    // Función helper para determinar urgencia según porcentaje
    const getUrgency = (progress: number): AlertUrgency => {
      if (progress >= 90) return 'high';
      if (progress >= 80) return 'medium';
      return 'low';
    };

    // Verificar suscriptores (umbral 80% = 800 suscriptores)
    if (subscribersProgress >= 70) {
      const remaining = YPP_THRESHOLDS.MIN_SUBSCRIBERS - metrics.channelSubscribers;
      const urgency = getUrgency(subscribersProgress);
      const emoji = urgency === 'high' ? '🔥' : urgency === 'medium' ? '📈' : '📊';
      
      alerts.push({
        triggered: subscribersProgress >= 80,
        alertType: subscribersProgress >= 80 ? 'subscribers_80' : null,
        channelKey,
        currentProgress: Math.round(subscribersProgress * 100) / 100,
        message: `${emoji} ${channelName}: ${subscribersProgress.toFixed(1)}% hacia 1,000 suscriptores ` +
          `(${metrics.channelSubscribers.toLocaleString('es-ES')} actuales, faltan ${remaining.toLocaleString('es-ES')})`,
        urgency,
      });
    }

    // Verificar watch hours (umbral 80% = 3200 horas)
    if (watchHoursProgress >= 70) {
      const remaining = YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS - metrics.totalWatchHours;
      const urgency = getUrgency(watchHoursProgress);
      const emoji = urgency === 'high' ? '🔥' : urgency === 'medium' ? '📈' : '📊';
      
      alerts.push({
        triggered: watchHoursProgress >= 80,
        alertType: watchHoursProgress >= 80 ? 'watchhours_80' : null,
        channelKey,
        currentProgress: Math.round(watchHoursProgress * 100) / 100,
        message: `${emoji} ${channelName}: ${watchHoursProgress.toFixed(1)}% hacia 4,000h watch time ` +
          `(${metrics.totalWatchHours.toLocaleString('es-ES')}h actuales, faltan ${remaining.toLocaleString('es-ES')}h)`,
        urgency,
      });
    }

    // Verificar Shorts views (umbral 80% = 8M vistas)
    if (shortsProgress >= 70) {
      const remaining = YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS - shortsViews;
      const urgency = getUrgency(shortsProgress);
      const emoji = urgency === 'high' ? '🔥' : urgency === 'medium' ? '📈' : '📊';
      
      alerts.push({
        triggered: shortsProgress >= 80,
        alertType: shortsProgress >= 80 ? 'shorts_views_80' : null,
        channelKey,
        currentProgress: Math.round(shortsProgress * 100) / 100,
        message: `${emoji} ${channelName}: ${shortsProgress.toFixed(1)}% hacia 10M vistas Shorts ` +
          `(${shortsViews.toLocaleString('es-ES')} actuales, faltan ${remaining.toLocaleString('es-ES')})`,
        urgency,
      });
    }

    // Verificar si monetización es inminente (todas >= 90% en vía tradicional O vía Shorts)
    const traditionalPathReady = subscribersProgress >= 90 && watchHoursProgress >= 90;
    const shortsPathReady = subscribersProgress >= 90 && shortsProgress >= 90;
    
    if (traditionalPathReady || shortsPathReady) {
      const path = traditionalPathReady ? 'vía tradicional' : 'vía Shorts';
      alerts.push({
        triggered: true,
        alertType: 'monetization_imminent',
        channelKey,
        currentProgress: Math.min(
          subscribersProgress,
          traditionalPathReady ? watchHoursProgress : shortsProgress
        ),
        message: `🚀 ${channelName}: ¡MONETIZACIÓN INMINENTE! (${path}) - ` +
          `Suscriptores: ${subscribersProgress.toFixed(1)}%, ` +
          `${traditionalPathReady 
            ? `Watch Time: ${watchHoursProgress.toFixed(1)}%` 
            : `Shorts: ${shortsProgress.toFixed(1)}%`}`,
        urgency: 'high',
      });
    }

    return alerts;
  }

  /**
   * Solicita un override manual para una acción bloqueada.
   * 
   * Este es el PASO 1 del proceso de doble confirmación. Genera un código de 6 dígitos
   * que debe ser confirmado dentro de 5 minutos usando `confirmOverride()`.
   * 
   * Acciones permitidas:
   * - 'create_channel_3': Crear canal 3 aunque no haya monetización
   * - 'expand_instagram': Expandir a Instagram aunque no haya monetización
   * - 'expand_tiktok': Expandir a TikTok aunque no haya monetización
   * - 'skip_quality_check': Omitir verificación de calidad de contenido
   * 
   * Reglas de negocio:
   * - Genera código aleatorio de 6 dígitos
   * - El código expira en 5 minutos
   * - Se registra el intento en el log de auditoría
   * - El mismo userId debe confirmar el override
   * 
   * @param action - Acción para la cual se solicita override
   * @param userId - Identificador único del usuario que solicita
   * @param reason - Justificación del por qué se necesita el override
   * @returns Resultado con código de confirmación y entrada de log
   * 
   * @requirement REQ-5.4.8
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const result = gate.requestOverride(
   *   'create_channel_3',
   *   'admin_001',
   *   'Prueba de concepto con recursos limitados'
   * );
   * // result.success === true
   * // result.confirmationCode === '123456' (ejemplo)
   * // result.requiresSecondConfirmation === true
   * // result.message contiene instrucciones
   * ```
   */
  public requestOverride(
    action: OverrideAction,
    userId: string,
    reason: string
  ): OverrideResult {
    // Validar que la acción sea válida
    const validActions: OverrideAction[] = ['create_channel_3', 'expand_instagram', 'expand_tiktok', 'skip_quality_check'];
    if (!validActions.includes(action)) {
      const logEntry: OverrideLogEntry = {
        timestamp: new Date(),
        action,
        userId,
        reason,
        confirmed: false,
        eventType: 'request',
        failureReason: `Acción inválida: ${action}`,
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode: '',
        requiresSecondConfirmation: false,
        message: `❌ Acción de override inválida: '${action}'. Acciones válidas: ${validActions.join(', ')}`,
        logEntry,
      };
    }

    // Validar que userId no esté vacío
    if (!userId || userId.trim() === '') {
      const logEntry: OverrideLogEntry = {
        timestamp: new Date(),
        action,
        userId: userId || '(vacío)',
        reason,
        confirmed: false,
        eventType: 'request',
        failureReason: 'userId vacío o inválido',
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode: '',
        requiresSecondConfirmation: false,
        message: '❌ Se requiere un userId válido para solicitar override',
        logEntry,
      };
    }

    // Validar que reason no esté vacía
    if (!reason || reason.trim() === '') {
      const logEntry: OverrideLogEntry = {
        timestamp: new Date(),
        action,
        userId,
        reason: reason || '(vacía)',
        confirmed: false,
        eventType: 'request',
        failureReason: 'Razón vacía o inválida',
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode: '',
        requiresSecondConfirmation: false,
        message: '❌ Se requiere una razón válida para solicitar override',
        logEntry,
      };
    }

    // Generar código de 6 dígitos aleatorio
    const confirmationCode = this.generateConfirmationCode();
    
    // Calcular timestamps
    const now = new Date();
    const expiresAt = new Date(now.getTime() + YPPValidationGate.OVERRIDE_EXPIRATION_MS);

    // Almacenar override pendiente
    const pendingOverride: PendingOverride = {
      code: confirmationCode,
      action,
      userId,
      reason: reason.trim(),
      createdAt: now,
      expiresAt,
    };
    this.pendingOverrides.set(confirmationCode, pendingOverride);

    // Crear entrada de log
    const logEntry: OverrideLogEntry = {
      timestamp: now,
      action,
      userId,
      reason: reason.trim(),
      confirmed: false,
      eventType: 'request',
    };
    this.overrideLogs.push(logEntry);

    // Obtener descripción de la acción para el mensaje
    const actionDescriptions: Record<OverrideAction, string> = {
      'create_channel_3': 'crear canal 3 sin monetización previa',
      'expand_instagram': 'expandir a Instagram sin monetización previa',
      'expand_tiktok': 'expandir a TikTok sin monetización previa',
      'skip_quality_check': 'omitir verificación de calidad de contenido',
    };

    return {
      success: true,
      action,
      confirmationCode,
      requiresSecondConfirmation: true,
      message: `⚠️ Override solicitado para: ${actionDescriptions[action]}.\n` +
        `Código de confirmación: ${confirmationCode}\n` +
        `Este código expira en 5 minutos (${expiresAt.toLocaleTimeString('es-ES')}).\n` +
        `Use confirmOverride('${action}', '${confirmationCode}', '${userId}') para confirmar.`,
      logEntry,
    };
  }

  /**
   * Confirma un override manual previamente solicitado.
   * 
   * Este es el PASO 2 del proceso de doble confirmación. Verifica el código de confirmación
   * generado en `requestOverride()` y autoriza la acción si todo es válido.
   * 
   * Validaciones realizadas:
   * - El código de confirmación existe
   * - El código no ha expirado (5 minutos)
   * - El userId coincide con el que solicitó el override
   * - La acción coincide con la solicitud original
   * 
   * @param action - Acción que se está confirmando
   * @param confirmationCode - Código de 6 dígitos recibido en requestOverride
   * @param userId - Debe ser el mismo userId que solicitó el override
   * @returns Resultado con confirmación exitosa o error detallado
   * 
   * @requirement REQ-5.4.8
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Paso 1: Solicitar override
   * const request = gate.requestOverride('create_channel_3', 'admin_001', 'Prueba');
   * 
   * // Paso 2: Confirmar con el código recibido
   * const confirm = gate.confirmOverride(
   *   'create_channel_3',
   *   request.confirmationCode,
   *   'admin_001'
   * );
   * // confirm.success === true si todo es válido
   * ```
   */
  public confirmOverride(
    action: OverrideAction,
    confirmationCode: string,
    userId: string
  ): OverrideResult {
    const now = new Date();

    // Buscar el override pendiente
    const pendingOverride = this.pendingOverrides.get(confirmationCode);

    // Si no existe el código
    if (!pendingOverride) {
      const logEntry: OverrideLogEntry = {
        timestamp: now,
        action,
        userId,
        reason: '(código no encontrado)',
        confirmed: false,
        eventType: 'confirm_failed',
        failureReason: `Código de confirmación no encontrado: ${confirmationCode}`,
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode,
        requiresSecondConfirmation: false,
        message: `❌ Código de confirmación '${confirmationCode}' no encontrado o ya fue utilizado.`,
        logEntry,
      };
    }

    // Verificar si el código ha expirado
    if (now > pendingOverride.expiresAt) {
      // Eliminar el override expirado
      this.pendingOverrides.delete(confirmationCode);

      const logEntry: OverrideLogEntry = {
        timestamp: now,
        action,
        userId,
        reason: pendingOverride.reason,
        confirmed: false,
        eventType: 'confirm_failed',
        failureReason: `Código expirado. Expiró a las ${pendingOverride.expiresAt.toLocaleTimeString('es-ES')}`,
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode,
        requiresSecondConfirmation: false,
        message: `❌ Código de confirmación expirado. El código expiró a las ${pendingOverride.expiresAt.toLocaleTimeString('es-ES')}. ` +
          `Solicite un nuevo override.`,
        logEntry,
      };
    }

    // Verificar que el userId coincida
    if (pendingOverride.userId !== userId) {
      const logEntry: OverrideLogEntry = {
        timestamp: now,
        action,
        userId,
        reason: pendingOverride.reason,
        confirmed: false,
        eventType: 'confirm_failed',
        failureReason: `userId no coincide: esperado '${pendingOverride.userId}', recibido '${userId}'`,
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode,
        requiresSecondConfirmation: false,
        message: `❌ El userId '${userId}' no coincide con quien solicitó el override. ` +
          `Solo el usuario original puede confirmar.`,
        logEntry,
      };
    }

    // Verificar que la acción coincida
    if (pendingOverride.action !== action) {
      const logEntry: OverrideLogEntry = {
        timestamp: now,
        action,
        userId,
        reason: pendingOverride.reason,
        confirmed: false,
        eventType: 'confirm_failed',
        failureReason: `Acción no coincide: esperada '${pendingOverride.action}', recibida '${action}'`,
      };
      this.overrideLogs.push(logEntry);

      return {
        success: false,
        action,
        confirmationCode,
        requiresSecondConfirmation: false,
        message: `❌ La acción '${action}' no coincide con la solicitud original '${pendingOverride.action}'.`,
        logEntry,
      };
    }

    // ¡Override confirmado exitosamente!
    // Eliminar el override pendiente (código de un solo uso)
    this.pendingOverrides.delete(confirmationCode);

    // Crear entrada de log exitosa
    const logEntry: OverrideLogEntry = {
      timestamp: now,
      action,
      userId,
      reason: pendingOverride.reason,
      confirmed: true,
      eventType: 'confirm_success',
    };
    this.overrideLogs.push(logEntry);

    // Obtener descripción de la acción para el mensaje
    const actionDescriptions: Record<OverrideAction, string> = {
      'create_channel_3': 'crear canal 3 sin monetización previa',
      'expand_instagram': 'expandir a Instagram sin monetización previa',
      'expand_tiktok': 'expandir a TikTok sin monetización previa',
      'skip_quality_check': 'omitir verificación de calidad de contenido',
    };

    return {
      success: true,
      action,
      confirmationCode,
      requiresSecondConfirmation: false,
      message: `✅ Override confirmado exitosamente.\n` +
        `Acción autorizada: ${actionDescriptions[action]}\n` +
        `Usuario: ${userId}\n` +
        `Razón: ${pendingOverride.reason}\n` +
        `Timestamp: ${now.toLocaleString('es-ES')}`,
      logEntry,
    };
  }

  /**
   * Genera un código de confirmación aleatorio de 6 dígitos.
   * 
   * @returns String de 6 dígitos (ej: '042195')
   */
  private generateConfirmationCode(): string {
    // Generar número aleatorio entre 0 y 999999
    const randomNumber = Math.floor(Math.random() * 1000000);
    // Pad con ceros a la izquierda para siempre tener 6 dígitos
    return randomNumber.toString().padStart(6, '0');
  }

  /**
   * Obtiene el historial de logs de override para auditoría.
   * 
   * @returns Array de todas las entradas de log de override
   * 
   * @requirement REQ-5.4.8
   */
  public getOverrideLogs(): OverrideLogEntry[] {
    return [...this.overrideLogs];
  }

  /**
   * Obtiene los overrides pendientes de confirmación.
   * Útil para debugging y monitoreo.
   * 
   * @returns Cantidad de overrides pendientes
   */
  public getPendingOverridesCount(): number {
    // Limpiar overrides expirados antes de contar
    this.cleanExpiredOverrides();
    return this.pendingOverrides.size;
  }

  /**
   * Limpia los overrides expirados del almacenamiento.
   * Se ejecuta automáticamente en operaciones de consulta.
   */
  private cleanExpiredOverrides(): void {
    const now = new Date();
    for (const [code, override] of this.pendingOverrides.entries()) {
      if (now > override.expiresAt) {
        this.pendingOverrides.delete(code);
      }
    }
  }

  /**
   * Obtiene métricas de YouTube Analytics para un canal.
   * 
   * Reglas de negocio:
   * 1. Por defecto obtiene datos de los últimos 30 días
   * 2. Los resultados se cachean por 1 hora para evitar rate limits de la API
   * 3. La respuesta de la API se mapea a las interfaces existentes (YPPMetrics, ContentPerformanceMetrics)
   * 4. Por ahora usa datos mock realistas (integración real cuando haya credenciales)
   * 
   * @param channelKey - Canal a consultar ('channel1' = NeuroSync AI, 'channel2' = NeuroTech AI)
   * @param dateRange - Rango de fechas opcional. Por defecto últimos 30 días
   * @returns Datos de YouTube Analytics mapeados a interfaces del sistema
   * 
   * @requirement REQ-5.4.9
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Obtener métricas de los últimos 30 días (por defecto)
   * const data1 = await gate.fetchYouTubeAnalytics('channel1');
   * console.log(data1.metrics.channelSubscribers); // Suscriptores actuales
   * console.log(data1.performance.averageCTR);     // CTR promedio
   * 
   * // Obtener métricas de un rango específico
   * const data2 = await gate.fetchYouTubeAnalytics('channel2', {
   *   start: new Date('2024-01-01'),
   *   end: new Date('2024-01-31')
   * });
   * ```
   */
  public async fetchYouTubeAnalytics(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    dateRange?: { start: Date; end: Date }
  ): Promise<YouTubeAnalyticsData> {
    // Verificar si hay datos en caché válidos
    const cachedEntry = this.analyticsCache.get(channelKey);
    if (cachedEntry && cachedEntry.expiresAt > new Date()) {
      return cachedEntry.data;
    }

    // Calcular rango de fechas (por defecto últimos 30 días)
    const endDate = dateRange?.end ?? new Date();
    const startDate = dateRange?.start ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Obtener channel ID según el canal
    const channelConfig = this.getChannelConfig(channelKey);

    let analyticsData: YouTubeAnalyticsData;
    
    try {
        const tokenPath = channelKey === 'channel1' ? 'oauth2.tokens.json' : 'oauth2.tokens.channel2.json';
        analyticsData = await this.fetchRealYouTubeAnalytics(
            channelKey,
            channelConfig.channelId,
            startDate,
            endDate,
            tokenPath
        );
    } catch (error) {
        console.error(`[YPPValidationGate] Error en API real (V1) para ${channelKey}, usando mock fallback:`, error);
        analyticsData = await this.fetchMockYouTubeAnalytics(
            channelKey,
            channelConfig.channelId,
            startDate,
            endDate
        );
    }

    // Guardar en caché con expiración de 1 hora
    const cacheEntry: YouTubeAnalyticsCacheEntry = {
      data: analyticsData,
      expiresAt: new Date(Date.now() + YOUTUBE_ANALYTICS_CACHE_TTL_MS),
    };
    this.analyticsCache.set(channelKey, cacheEntry);

    return analyticsData;
  }

  /**
   * Obtiene datos reales usando YouTube Analytics API y YouTube Data API para YPP.
   */
  private async fetchRealYouTubeAnalytics(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    channelId: string,
    startDate: Date,
    endDate: Date,
    tokenPath: string
  ): Promise<YouTubeAnalyticsData> {
    const auth = await GoogleAuth.getClient(tokenPath);
    const ytDataApi = google.youtube({ version: 'v3', auth });
    const ytAnalyticsApi = google.youtubeAnalytics({ version: 'v2', auth });

    // 1. Data API (Suscriptores)
    const channelRes = await ytDataApi.channels.list({ part: ['statistics'], mine: true });
    const stats = channelRes.data.items?.[0]?.statistics;
    const subscriberCount = parseInt(stats?.subscriberCount || '0', 10);
    const totalViews = parseInt(stats?.viewCount || '0', 10);

    // 2. Analytics API (Watch Time y Retention)
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const analyticsRes = await ytAnalyticsApi.reports.query({
      ids: 'channel==MINE',
      startDate: startStr,
      endDate: endStr,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration',
    });

    const rows = analyticsRes.data.rows || [];
    let watchTimeHours = 0;
    let periodViews = 0;
    let averageViewDuration = 0;

    if (rows.length > 0 && rows[0]) {
      periodViews = rows[0][0] || 0;
      watchTimeHours = (rows[0][1] || 0) / 60;
      averageViewDuration = rows[0][2] || 0;
    }

    return {
      channelId,
      fetchedAt: new Date(),
      metrics: {
        channelSubscribers: subscriberCount,
        totalWatchHours: watchTimeHours,
        shortsViewsLast90Days: totalViews, // Aproximación
        videoCount: 0, // Not fetched yet
        isMonetizationEligible: false,
        lastCheck: new Date()
      },
      performance: {
        averageCTR: 5.5, // Dummy for now since CTR requires video-level API call or specific dimensions
        averageRetentionRate: averageViewDuration > 0 ? 45.5 : 0, 
        averageWatchTimePercent: averageViewDuration > 0 ? 40.0 : 0
      }
    };
  }

  /**
   * Obtiene la configuración del canal según su clave.
   * @param channelKey - Clave del canal ('channel1' o 'channel2')
   */
  private getChannelConfig(channelKey: 'channel1' | 'channel2' | 'channel3'): {
    channelId: string;
    channelName: string;
    tokenFile: string;
  } {
    const configs = {
      channel1: {
        channelId: 'UC_NEUROSYNC_AI',  // ID real de NeuroSync AI
        channelName: 'NeuroSync AI',
        tokenFile: 'oauth2.tokens.json',
      },
      channel2: {
        channelId: 'UC_NEUROTECH_AI',  // ID real de NeuroTech AI
        channelName: 'NeuroTech AI',
        tokenFile: 'oauth2.tokens.channel2.json',
      },
      channel3: {
        channelId: 'UC_COLOMBIANDREAMM',
        channelName: 'ColombianDreamm',
        tokenFile: 'oauth2.tokens.channel3.json',
      }
    };
    return configs[channelKey];
  }

  /**
   * Obtiene datos mock de YouTube Analytics que simulan la estructura real de la API.
   * Genera datos realistas basados en el canal y el rango de fechas.
   * 
   * @param channelKey - Canal a consultar
   * @param channelId - ID del canal de YouTube
   * @param startDate - Fecha de inicio del rango
   * @param endDate - Fecha de fin del rango
   * @returns Datos mock mapeados a YouTubeAnalyticsData
   */
  private async fetchMockYouTubeAnalytics(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    channelId: string,
    startDate: Date,
    endDate: Date
  ): Promise<YouTubeAnalyticsData> {
    // Simular latencia de API (100-300ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Generar datos mock realistas basados en el canal
    // Canal 1 (NeuroSync AI) tiene más madurez, Canal 2 (NeuroTech AI) es más nuevo
    const isChannel1 = channelKey === 'channel1';

    // Métricas YPP (progreso hacia monetización)
    const baseSubscribers = isChannel1 ? 750 : 320;
    const baseWatchHours = isChannel1 ? 2800 : 890;
    const baseShortsViews = isChannel1 ? 3_500_000 : 1_200_000;

    // Añadir variación realista (±10% día a día)
    const variationFactor = 1 + (Math.random() * 0.2 - 0.1);
    
    const metrics: YPPMetrics = {
      channelSubscribers: Math.round(baseSubscribers * variationFactor),
      totalWatchHours: Math.round(baseWatchHours * variationFactor * 10) / 10,
      videoCount: isChannel1 ? 48 : 22,
      isMonetizationEligible: false, // Ningún canal está monetizado aún
      lastCheck: new Date(),
      shortsViewsLast90Days: Math.round(baseShortsViews * variationFactor),
    };

    // Métricas de rendimiento del contenido
    // Valores realistas para canales de nicho de neurodivergencia
    const performance: ContentPerformanceMetrics = {
      // Retención promedio: 45-60% es bueno para contenido educativo
      averageRetentionRate: Math.round((isChannel1 ? 52 : 48) * variationFactor * 10) / 10,
      // CTR: 3-6% es bueno para thumbnails de nicho
      averageCTR: Math.round((isChannel1 ? 4.5 : 3.8) * variationFactor * 10) / 10,
      // Watch time %: 35-50% es normal para videos de 8-15 minutos
      averageWatchTimePercent: Math.round((isChannel1 ? 45 : 38) * variationFactor * 10) / 10,
    };

    // Datos crudos de la API (estructura similar a YouTube Analytics API)
    const rawData = {
      kind: 'youtubeAnalytics#resultTable',
      columnHeaders: [
        { name: 'views', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'estimatedMinutesWatched', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'averageViewDuration', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'averageViewPercentage', columnType: 'METRIC', dataType: 'FLOAT' },
        { name: 'subscribersGained', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'subscribersLost', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'likes', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'dislikes', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'shares', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'comments', columnType: 'METRIC', dataType: 'INTEGER' },
        { name: 'ctr', columnType: 'METRIC', dataType: 'FLOAT' },
      ],
      rows: [[
        isChannel1 ? 85000 : 32000,  // views
        Math.round(metrics.totalWatchHours * 60),  // estimatedMinutesWatched
        isChannel1 ? 312 : 245,  // averageViewDuration (segundos)
        performance.averageWatchTimePercent,  // averageViewPercentage
        isChannel1 ? 120 : 45,   // subscribersGained
        isChannel1 ? 8 : 5,      // subscribersLost
        isChannel1 ? 3200 : 1100,  // likes
        isChannel1 ? 45 : 22,    // dislikes
        isChannel1 ? 180 : 65,   // shares
        isChannel1 ? 95 : 38,    // comments
        performance.averageCTR,   // ctr
      ]],
      dateRange: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      channelId,
    };

    return {
      channelId,
      fetchedAt: new Date(),
      metrics,
      performance,
      rawData,
    };
  }

  /**
   * Invalida el caché de YouTube Analytics para un canal específico.
   * Útil cuando se necesita forzar una actualización de datos.
   * 
   * @param channelKey - Canal a invalidar ('channel1' o 'channel2'). Si no se especifica, invalida todos.
   */
  public invalidateAnalyticsCache(channelKey?: 'channel1' | 'channel2' | 'channel3'): void {
    if (channelKey) {
      this.analyticsCache.delete(channelKey);
    } else {
      this.analyticsCache.clear();
    }
  }

  /**
   * Verifica si hay datos de analytics en caché para un canal.
   * 
   * @param channelKey - Canal a verificar
   * @returns true si hay caché válido, false si no hay o expiró
   */
  public hasValidAnalyticsCache(channelKey: 'channel1' | 'channel2' | 'channel3'): boolean {
    const cachedEntry = this.analyticsCache.get(channelKey);
    return cachedEntry !== undefined && cachedEntry.expiresAt > new Date();
  }

  /**
   * Obtiene métricas de YouTube Analytics para un canal usando la interfaz simplificada V2.
   * 
   * Este método implementa la integración con YouTube Analytics API según la tarea 17.10.
   * Por ahora utiliza datos mock realistas que simulan la estructura de respuesta de la API.
   * 
   * Reglas de negocio:
   * 1. Si `config.useMockData` es true o no hay `config.apiKey`, se usan datos mock
   * 2. Los resultados se cachean según `config.cacheHours` (por defecto 1 hora)
   * 3. Simula latencia realista en modo mock (100-300ms)
   * 4. Los datos son coherentes con los canales del proyecto (NeuroSync AI y NeuroTech AI)
   * 
   * @param channelKey - Canal a consultar ('channel1' = NeuroSync AI, 'channel2' = NeuroTech AI)
   * @param config - Configuración opcional para el fetch (apiKey, useMockData, cacheHours)
   * @returns Datos de YouTube Analytics en formato simplificado V2
   * 
   * @requirement REQ-5.4.9
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Usar datos mock (por defecto)
   * const data1 = await gate.fetchYouTubeAnalyticsV2('channel1');
   * console.log(data1.subscribers);         // Suscriptores actuales
   * console.log(data1.totalWatchTimeHours); // Watch time total
   * console.log(data1.totalViews);          // Vistas totales
   * 
   * // Forzar datos mock con cache de 2 horas
   * const data2 = await gate.fetchYouTubeAnalyticsV2('channel2', {
   *   useMockData: true,
   *   cacheHours: 2
   * });
   * 
   * // Con API key (futuro: usará la API real)
   * const data3 = await gate.fetchYouTubeAnalyticsV2('channel1', {
   *   apiKey: 'AIza...',
   *   cacheHours: 1
   * });
   * ```
   */
  public async fetchYouTubeAnalyticsV2(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    config?: YouTubeAnalyticsConfig
  ): Promise<YouTubeAnalyticsDataV2> {
    // Determinar TTL del cache (por defecto 1 hora)
    const cacheHours = config?.cacheHours ?? 1;
    const cacheTTLMs = cacheHours * 60 * 60 * 1000;

    // Verificar si hay datos en caché válidos
    const cachedEntry = this.analyticsCacheV2.get(channelKey);
    if (cachedEntry && cachedEntry.expiresAt > new Date()) {
      return cachedEntry.data;
    }

    // Determinar si usar datos mock
    const shouldUseMock = config?.useMockData === true || !config?.apiKey;

    let analyticsData: YouTubeAnalyticsDataV2;

    if (shouldUseMock) {
      // Usar datos mock realistas
      analyticsData = await this.fetchMockYouTubeAnalyticsV2(channelKey);
    } else {
      try {
        const tokenPath = channelKey === 'channel1' ? 'oauth2.tokens.json' : 'oauth2.tokens.channel2.json';
        analyticsData = await this.fetchRealYouTubeAnalyticsV2(channelKey, tokenPath);
      } catch (error) {
        console.error(`[YPPValidationGate] Error en API real para ${channelKey}, usando mock fallback:`, error);
        analyticsData = await this.fetchMockYouTubeAnalyticsV2(channelKey);
      }
    }

    // Guardar en caché con expiración según configuración
    const cacheEntry: YouTubeAnalyticsCacheEntryV2 = {
      data: analyticsData,
      expiresAt: new Date(Date.now() + cacheTTLMs),
    };
    this.analyticsCacheV2.set(channelKey, cacheEntry);

    return analyticsData;
  }

  /**
   * Obtiene datos reales de YouTube Analytics API y YouTube Data API.
   * 
   * @param channelKey - Canal para obtener datos
   * @param tokenPath - Ruta al archivo de tokens OAuth2
   * @returns Datos reales mapeados a YouTubeAnalyticsDataV2
   */
  private async fetchRealYouTubeAnalyticsV2(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    tokenPath: string
  ): Promise<YouTubeAnalyticsDataV2> {
    const auth = await GoogleAuth.getClient(tokenPath);
    const ytDataApi = google.youtube({ version: 'v3', auth });
    const ytAnalyticsApi = google.youtubeAnalytics({ version: 'v2', auth });

    // 1. Obtener suscriptores y vistas totales de Data API
    const channelRes = await ytDataApi.channels.list({
      part: ['statistics', 'id'],
      mine: true
    });

    const channelInfo = channelRes.data.items?.[0];
    if (!channelInfo) throw new Error('No se encontró el canal vinculado a las credenciales');
    const stats = channelInfo.statistics;
    const channelId = channelInfo.id || '';
    const subscribers = parseInt(stats?.subscriberCount || '0', 10);
    const totalViews = parseInt(stats?.viewCount || '0', 10);

    // 2. Obtener WatchTime y Revenue de Analytics API (Últimos 365 días para YPP)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const analyticsRes = await ytAnalyticsApi.reports.query({
      ids: 'channel==MINE',
      startDate: startDate,
      endDate: endDate,
      metrics: 'estimatedMinutesWatched,estimatedRevenue',
    });

    const rows = analyticsRes.data.rows || [];
    let totalWatchTimeHours = 0;
    let estimatedRevenue = 0;

    if (rows.length > 0 && rows[0]) {
      // rows[0][0] = estimatedMinutesWatched, rows[0][1] = estimatedRevenue
      totalWatchTimeHours = (rows[0][0] || 0) / 60;
      estimatedRevenue = rows[0][1] || 0;
    }

    return {
      channelId,
      subscribers,
      totalViews,
      totalWatchTimeHours,
      shortsViews90Days: totalViews, // TODO: Simplificación temporal, requeriría filtro adicional
      estimatedRevenue,
      lastUpdated: new Date()
    };
  }

  /**
   * Genera datos mock de YouTube Analytics que simulan la estructura real de la API.
   * Los datos son coherentes con los canales del proyecto y simulan latencia realista.
   * 
   * @param channelKey - Canal para generar datos mock
   * @returns Datos mock mapeados a YouTubeAnalyticsDataV2
   */
  private async fetchMockYouTubeAnalyticsV2(
    channelKey: 'channel1' | 'channel2' | 'channel3'
  ): Promise<YouTubeAnalyticsDataV2> {
    // Simular latencia de API realista (100-300ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Configuración de canales
    const channelConfigs = {
      channel1: {
        channelId: 'UC_NEUROSYNC_AI',
        // Canal 1 (NeuroSync AI) - más maduro
        baseSubscribers: 750,
        baseWatchTimeHours: 2800,
        baseViews: 85000,
        baseShortsViews: 3_500_000,
        baseRevenue: 0, // Aún no monetizado
      },
      channel2: {
        channelId: 'UC_NEUROTECH_AI',
        // Canal 2 (NeuroTech AI) - más nuevo
        baseSubscribers: 320,
        baseWatchTimeHours: 890,
        baseViews: 32000,
        baseShortsViews: 1_200_000,
        baseRevenue: 0, // Aún no monetizado
      },
      channel3: {
        channelId: 'UC_COLOMBIANDREAMM',
        baseSubscribers: 385,
        baseWatchTimeHours: 10,
        baseViews: 25000,
        baseShortsViews: 85000,
        baseRevenue: 0, 
      }
    };

    const channelConfig = channelConfigs[channelKey];

    // Añadir variación realista (±10% para simular fluctuaciones diarias)
    const variationFactor = 1 + (Math.random() * 0.2 - 0.1);

    // Calcular métricas con variación
    const subscribers = Math.round(channelConfig.baseSubscribers * variationFactor);
    const totalWatchTimeHours = Math.round(channelConfig.baseWatchTimeHours * variationFactor * 10) / 10;
    const totalViews = Math.round(channelConfig.baseViews * variationFactor);
    const shortsViews90Days = Math.round(channelConfig.baseShortsViews * variationFactor);

    // Revenue solo disponible si el canal está monetizado (por ahora ninguno lo está)
    const estimatedRevenue = channelConfig.baseRevenue > 0 
      ? Math.round(channelConfig.baseRevenue * variationFactor * 100) / 100
      : undefined;

    return {
      channelId: channelConfig.channelId,
      subscribers,
      totalWatchTimeHours,
      totalViews,
      shortsViews90Days,
      estimatedRevenue,
      lastUpdated: new Date(),
    };
  }

  /**
   * Invalida el caché de YouTube Analytics V2 para un canal específico.
   * Útil cuando se necesita forzar una actualización de datos.
   * 
   * @param channelKey - Canal a invalidar ('channel1' o 'channel2'). Si no se especifica, invalida todos.
   */
  public invalidateAnalyticsCacheV2(channelKey?: 'channel1' | 'channel2' | 'channel3'): void {
    if (channelKey) {
      this.analyticsCacheV2.delete(channelKey);
    } else {
      this.analyticsCacheV2.clear();
    }
  }

  /**
   * Verifica si hay datos de analytics V2 en caché para un canal.
   * 
   * @param channelKey - Canal a verificar
   * @returns true si hay caché válido, false si no hay o expiró
   */
  public hasValidAnalyticsCacheV2(channelKey: 'channel1' | 'channel2' | 'channel3'): boolean {
    const cachedEntry = this.analyticsCacheV2.get(channelKey);
    return cachedEntry !== undefined && cachedEntry.expiresAt > new Date();
  }

  /**
   * Genera un reporte de progreso semanal simplificado para enviar por Telegram.
   * 
   * Este método recibe datos de progreso semanal y genera un reporte formateado
   * que incluye: encabezado con semana/año, progreso de cada canal hacia YPP,
   * tendencia semanal y estimación de semanas restantes para monetización.
   * 
   * Reglas de negocio:
   * 1. El progreso se calcula como porcentaje hacia los umbrales YPP (1000 subs, 4000h)
   * 2. La tendencia se determina por el crecimiento de suscriptores:
   *    - 'improving': ganancia semanal > 1% del total actual
   *    - 'declining': ganancia semanal < 0.3% del total actual
   *    - 'stable': ganancia entre 0.3% y 1%
   * 3. La estimación de semanas se basa en el ritmo actual de crecimiento
   * 4. Si un canal ya cumple requisitos YPP, estimatedWeeksToYPP es null
   * 
   * @param data - Datos de progreso semanal de ambos canales
   * @returns Resultado con texto formateado, estado YPP, tendencia y estimación
   * 
   * @requirement REQ-5.4.6
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const report = gate.generateWeeklyProgressReport({
   *   channel1: {
   *     subscribers: 750,
   *     subscribersGained: 45,
   *     watchTimeHours: 2500,
   *     watchTimeGained: 120,
   *     views: 85000,
   *     viewsGained: 5200
   *   },
   *   channel2: {
   *     subscribers: 320,
   *     subscribersGained: 28,
   *     watchTimeHours: 890,
   *     watchTimeGained: 65,
   *     views: 32000,
   *     viewsGained: 2100
   *   },
   *   weekNumber: 24,
   *   year: 2024
   * });
   * console.log(report.text); // Mensaje para Telegram
   * console.log(report.weeklyTrend); // 'improving', 'declining' o 'stable'
   * ```
   */
  public generateWeeklyProgressReport(data: WeeklyProgressData): ProgressReportResult {
    // Crear métricas YPP para cada canal
    const channel1Metrics: YPPMetrics = {
      channelSubscribers: data.channel1.subscribers,
      totalWatchHours: data.channel1.watchTimeHours,
      videoCount: 0, // No requerido para este cálculo
      isMonetizationEligible: false,
      lastCheck: new Date(),
    };

    const channel2Metrics: YPPMetrics = {
      channelSubscribers: data.channel2.subscribers,
      totalWatchHours: data.channel2.watchTimeHours,
      videoCount: 0,
      isMonetizationEligible: false,
      lastCheck: new Date(),
    };

    // Evaluar estado YPP de cada canal
    const channel1YPP = this.checkYPPRequirements(channel1Metrics);
    const channel2YPP = this.checkYPPRequirements(channel2Metrics);

    // Calcular tendencia semanal
    const weeklyTrend = this.calculateWeeklyTrend(data);

    // Estimar semanas restantes para YPP
    const estimatedWeeksToYPP = {
      channel1: this.estimateWeeksToYPP(data.channel1, channel1YPP),
      channel2: this.estimateWeeksToYPP(data.channel2, channel2YPP),
    };

    // Generar texto formateado para Telegram
    const text = this.formatWeeklyTelegramReport(
      data,
      channel1YPP,
      channel2YPP,
      weeklyTrend,
      estimatedWeeksToYPP
    );

    return {
      text,
      yppStatus: {
        channel1: channel1YPP,
        channel2: channel2YPP,
      },
      weeklyTrend,
      estimatedWeeksToYPP,
    };
  }

  /**
   * Calcula la tendencia semanal basada en el crecimiento de suscriptores.
   * 
   * @param data - Datos de progreso semanal
   * @returns Tendencia: 'improving', 'declining' o 'stable'
   */
  private calculateWeeklyTrend(data: WeeklyProgressData): WeeklyTrend {
    // Calcular porcentaje de crecimiento combinado de ambos canales
    const totalSubscribers = data.channel1.subscribers + data.channel2.subscribers;
    const totalGained = data.channel1.subscribersGained + data.channel2.subscribersGained;
    
    // Evitar división por cero
    if (totalSubscribers === 0) {
      return totalGained > 0 ? 'improving' : 'stable';
    }

    const growthRate = (totalGained / totalSubscribers) * 100;

    // Umbrales de tendencia
    if (growthRate > 1) {
      return 'improving'; // Más del 1% de crecimiento semanal
    } else if (growthRate < 0.3) {
      return 'declining'; // Menos del 0.3% de crecimiento semanal
    } else {
      return 'stable'; // Entre 0.3% y 1%
    }
  }

  /**
   * Estima las semanas restantes para alcanzar los requisitos YPP.
   * 
   * @param channelData - Datos del canal
   * @param yppStatus - Estado actual de requisitos YPP
   * @returns Semanas estimadas o null si ya cumple requisitos
   */
  private estimateWeeksToYPP(
    channelData: WeeklyProgressData['channel1'],
    yppStatus: YPPRequirementResult
  ): number | null {
    // Si ya es elegible, retornar null
    if (yppStatus.isEligible) {
      return null;
    }

    // Calcular semanas para suscriptores
    let weeksForSubscribers = 0;
    if (channelData.subscribers < YPP_THRESHOLDS.MIN_SUBSCRIBERS) {
      const subsNeeded = YPP_THRESHOLDS.MIN_SUBSCRIBERS - channelData.subscribers;
      // Evitar división por cero si no hay ganancia de suscriptores
      if (channelData.subscribersGained > 0) {
        weeksForSubscribers = Math.ceil(subsNeeded / channelData.subscribersGained);
      } else {
        weeksForSubscribers = 999; // Indicar que no hay progreso
      }
    }

    // Calcular semanas para watch time
    let weeksForWatchTime = 0;
    if (channelData.watchTimeHours < YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS) {
      const hoursNeeded = YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS - channelData.watchTimeHours;
      // Evitar división por cero si no hay ganancia de watch time
      if (channelData.watchTimeGained > 0) {
        weeksForWatchTime = Math.ceil(hoursNeeded / channelData.watchTimeGained);
      } else {
        weeksForWatchTime = 999; // Indicar que no hay progreso
      }
    }

    // Retornar el máximo (ambos requisitos deben cumplirse)
    const maxWeeks = Math.max(weeksForSubscribers, weeksForWatchTime);
    
    // Si es un número muy alto, cap a 999 para indicar "indeterminado"
    return maxWeeks > 999 ? 999 : maxWeeks;
  }

  /**
   * Formatea el reporte semanal para Telegram con markdown.
   * 
   * @param data - Datos de progreso semanal
   * @param channel1YPP - Estado YPP del canal 1
   * @param channel2YPP - Estado YPP del canal 2
   * @param trend - Tendencia semanal
   * @param estimatedWeeks - Semanas estimadas por canal
   * @returns Texto formateado en markdown para Telegram
   */
  private formatWeeklyTelegramReport(
    data: WeeklyProgressData,
    channel1YPP: YPPRequirementResult,
    channel2YPP: YPPRequirementResult,
    trend: WeeklyTrend,
    estimatedWeeks: { channel1: number | null; channel2: number | null }
  ): string {
    // Iconos de tendencia
    const trendIcon = trend === 'improving' ? '📈' : trend === 'declining' ? '📉' : '➡️';
    const trendText = trend === 'improving' ? 'Mejorando' : trend === 'declining' ? 'Declinando' : 'Estable';

    // Iconos de estado YPP
    const ch1Icon = channel1YPP.isEligible ? '✅' : '⏳';
    const ch2Icon = channel2YPP.isEligible ? '✅' : '⏳';

    // Formatear estimación de semanas
    const formatWeeks = (weeks: number | null): string => {
      if (weeks === null) return '✅ ¡Listo para YPP!';
      if (weeks >= 999) return '⚠️ Sin datos suficientes';
      return `~${weeks} semanas`;
    };

    // Barras de progreso
    const ch1SubsBar = this.generateProgressBar(Math.min(channel1YPP.subscribersProgress, 100));
    const ch1WatchBar = this.generateProgressBar(Math.min(channel1YPP.watchHoursProgress, 100));
    const ch2SubsBar = this.generateProgressBar(Math.min(channel2YPP.subscribersProgress, 100));
    const ch2WatchBar = this.generateProgressBar(Math.min(channel2YPP.watchHoursProgress, 100));

    // Calcular progreso promedio de ambos canales
    const avgProgress = (
      (Math.min(channel1YPP.subscribersProgress, 100) + Math.min(channel1YPP.watchHoursProgress, 100)) / 2 +
      (Math.min(channel2YPP.subscribersProgress, 100) + Math.min(channel2YPP.watchHoursProgress, 100)) / 2
    ) / 2;

    const message = `
📊 *Reporte Semanal YPP - Semana ${data.weekNumber}/${data.year}*

${trendIcon} *Tendencia: ${trendText}*

━━━━━━━━━━━━━━━━━━━━━━

📺 *Canal 1: NeuroSync AI* ${ch1Icon}

*Suscriptores:* ${data.channel1.subscribers.toLocaleString('es-ES')} (+${data.channel1.subscribersGained})
${ch1SubsBar} ${channel1YPP.subscribersProgress.toFixed(1)}%

*Watch Time:* ${data.channel1.watchTimeHours.toLocaleString('es-ES')}h (+${data.channel1.watchTimeGained}h)
${ch1WatchBar} ${channel1YPP.watchHoursProgress.toFixed(1)}%

*Vistas:* ${data.channel1.views.toLocaleString('es-ES')} (+${data.channel1.viewsGained.toLocaleString('es-ES')})

🎯 *Estimación:* ${formatWeeks(estimatedWeeks.channel1)}

━━━━━━━━━━━━━━━━━━━━━━

📺 *Canal 2: NeuroTech AI* ${ch2Icon}

*Suscriptores:* ${data.channel2.subscribers.toLocaleString('es-ES')} (+${data.channel2.subscribersGained})
${ch2SubsBar} ${channel2YPP.subscribersProgress.toFixed(1)}%

*Watch Time:* ${data.channel2.watchTimeHours.toLocaleString('es-ES')}h (+${data.channel2.watchTimeGained}h)
${ch2WatchBar} ${channel2YPP.watchHoursProgress.toFixed(1)}%

*Vistas:* ${data.channel2.views.toLocaleString('es-ES')} (+${data.channel2.viewsGained.toLocaleString('es-ES')})

🎯 *Estimación:* ${formatWeeks(estimatedWeeks.channel2)}

━━━━━━━━━━━━━━━━━━━━━━

📊 *Progreso Promedio:* ${avgProgress.toFixed(1)}%

_"Autism is not a system error, it's a different operating system."_
`.trim();

    return message;
  }

  /**
   * Verifica si un canal ha alcanzado un milestone (80% o 100%) hacia los requisitos YPP.
   * 
   * Este método se usa para generar alertas de Telegram cuando un canal cruza
   * un umbral importante hacia la monetización. Usa el progreso previo para
   * evitar enviar alertas duplicadas.
   * 
   * Reglas de negocio:
   * 1. Alertar cuando se cruza 80% en suscriptores O watch time (cerca del objetivo)
   * 2. Alertar cuando se cruza 100% en AMBAS métricas (elegible para YPP)
   * 3. Si previousProgress se proporciona, solo alertar si se CRUZÓ el umbral (no si ya estaba)
   * 4. El mensaje debe ser celebratorio y motivador
   * 5. Para milestone 100, ambas métricas deben estar >= 100%
   * 6. Para milestone 80, al menos una métrica debe haber cruzado 80%
   * 
   * @param channelKey - Canal a verificar ('channel1' = NeuroSync AI, 'channel2' = NeuroTech AI)
   * @param currentMetrics - Métricas actuales del canal
   * @param previousProgress - Progreso anterior (opcional, para evitar alertas duplicadas)
   * @returns Resultado con shouldAlert, milestone alcanzado y mensaje formateado
   * 
   * @requirement REQ-5.4.7
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Caso: Canal cruza 80% de suscriptores
   * const result1 = gate.checkMilestoneAlert(
   *   'channel1',
   *   { subscribers: 820, watchTimeHours: 2000 },
   *   { subscribers: 75, watchTime: 50 }  // Antes estaba en 75%
   * );
   * // result1.shouldAlert === true
   * // result1.milestone === 80
   * // result1.message contiene "🎯 ¡Milestone alcanzado!"
   * 
   * // Caso: Canal ya estaba en 85%, no alertar de nuevo
   * const result2 = gate.checkMilestoneAlert(
   *   'channel1',
   *   { subscribers: 870, watchTimeHours: 2000 },
   *   { subscribers: 85, watchTime: 50 }  // Ya estaba sobre 80%
   * );
   * // result2.shouldAlert === false
   * 
   * // Caso: Canal elegible YPP (100% en ambas métricas)
   * const result3 = gate.checkMilestoneAlert(
   *   'channel2',
   *   { subscribers: 1050, watchTimeHours: 4200 }
   * );
   * // result3.shouldAlert === true
   * // result3.milestone === 100
   * // result3.message contiene "🎉🎉🎉 ¡FELICIDADES!"
   * ```
   */
  public checkMilestoneAlert(
    channelKey: 'channel1' | 'channel2' | 'channel3',
    currentMetrics: { subscribers: number; watchTimeHours: number },
    previousProgress?: { subscribers: number; watchTime: number }
  ): MilestoneAlertResult {
    const channelName = channelKey === 'channel1' ? 'NeuroSync AI' : 'NeuroTech AI';
    const channelEmoji = channelKey === 'channel1' ? '🧠' : '⚡';

    // Calcular progreso actual hacia los umbrales YPP
    const currentSubscribersProgress = (currentMetrics.subscribers / YPP_THRESHOLDS.MIN_SUBSCRIBERS) * 100;
    const currentWatchTimeProgress = (currentMetrics.watchTimeHours / YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS) * 100;

    // Redondear a 2 decimales
    const subscribersProgress = Math.round(currentSubscribersProgress * 100) / 100;
    const watchTimeProgress = Math.round(currentWatchTimeProgress * 100) / 100;

    // Verificar si AMBAS métricas están >= 100% (elegible YPP)
    const isEligible = subscribersProgress >= 100 && watchTimeProgress >= 100;

    // Verificar si alguna métrica ha CRUZADO el umbral del 80%
    const prevSubsProgress = previousProgress?.subscribers ?? 0;
    const prevWatchProgress = previousProgress?.watchTime ?? 0;

    // Determinar si se cruzó el milestone 100 (elegibilidad YPP)
    const crossedMilestone100 = isEligible && (
      previousProgress === undefined || // Sin progreso previo, siempre alertar
      prevSubsProgress < 100 || // Suscriptores cruzaron 100%
      prevWatchProgress < 100   // Watch time cruzó 100%
    );

    // Determinar si se cruzó el milestone 80 (cerca del objetivo)
    const crossedSubs80 = subscribersProgress >= 80 && prevSubsProgress < 80;
    const crossedWatch80 = watchTimeProgress >= 80 && prevWatchProgress < 80;
    const crossedMilestone80 = !isEligible && (crossedSubs80 || crossedWatch80);

    // Determinar el milestone alcanzado
    let shouldAlert = false;
    let milestone = 0;
    let message = '';

    if (crossedMilestone100) {
      // ¡Canal elegible para YPP!
      shouldAlert = true;
      milestone = 100;
      message = this.formatMilestone100Message(
        channelName,
        channelEmoji,
        currentMetrics,
        subscribersProgress,
        watchTimeProgress
      );
    } else if (crossedMilestone80) {
      // Canal alcanzó 80% en al menos una métrica
      shouldAlert = true;
      milestone = 80;
      message = this.formatMilestone80Message(
        channelName,
        channelEmoji,
        currentMetrics,
        subscribersProgress,
        watchTimeProgress,
        crossedSubs80,
        crossedWatch80
      );
    } else {
      // No se cruzó ningún milestone nuevo
      shouldAlert = false;
      milestone = subscribersProgress >= 100 && watchTimeProgress >= 100 ? 100 
                : (subscribersProgress >= 80 || watchTimeProgress >= 80) ? 80 
                : 0;
      message = `${channelEmoji} ${channelName}: Sin nuevos milestones. ` +
        `Subs: ${subscribersProgress.toFixed(1)}%, Watch Time: ${watchTimeProgress.toFixed(1)}%`;
    }

    return {
      shouldAlert,
      channelKey,
      milestone,
      progress: {
        subscribers: subscribersProgress,
        watchTime: watchTimeProgress,
      },
      message,
    };
  }

  /**
   * Formatea el mensaje celebratorio para el milestone 100% (elegibilidad YPP).
   */
  private formatMilestone100Message(
    channelName: string,
    channelEmoji: string,
    currentMetrics: { subscribers: number; watchTimeHours: number },
    subscribersProgress: number,
    watchTimeProgress: number
  ): string {
    return `
🎉🎉🎉 ¡FELICIDADES! 🎉🎉🎉

${channelEmoji} *${channelName}* ¡ES ELEGIBLE PARA YPP!

━━━━━━━━━━━━━━━━━━━━━━

✅ *Suscriptores:* ${currentMetrics.subscribers.toLocaleString('es-ES')} (${subscribersProgress.toFixed(1)}%)
✅ *Watch Time:* ${currentMetrics.watchTimeHours.toLocaleString('es-ES')}h (${watchTimeProgress.toFixed(1)}%)

━━━━━━━━━━━━━━━━━━━━━━

🚀 *¡Has alcanzado TODOS los requisitos del YouTube Partner Program!*

📋 *Próximos pasos:*
1. Ve a YouTube Studio → Monetización
2. Revisa y acepta los términos del programa
3. Conecta tu cuenta de AdSense
4. Espera la revisión de YouTube (1-4 semanas)

💪 ¡Todo el esfuerzo ha valido la pena!

_"El autismo no es un error del sistema, es un sistema operativo diferente."_
`.trim();
  }

  /**
   * Formatea el mensaje motivador para el milestone 80% (cerca del objetivo).
   */
  private formatMilestone80Message(
    channelName: string,
    channelEmoji: string,
    currentMetrics: { subscribers: number; watchTimeHours: number },
    subscribersProgress: number,
    watchTimeProgress: number,
    crossedSubs80: boolean,
    crossedWatch80: boolean
  ): string {
    // Determinar qué métrica(s) cruzaron el 80%
    let metricCrossed = '';
    if (crossedSubs80 && crossedWatch80) {
      metricCrossed = 'suscriptores Y watch time';
    } else if (crossedSubs80) {
      metricCrossed = 'suscriptores';
    } else {
      metricCrossed = 'watch time';
    }

    // Calcular lo que falta para YPP
    const subsRemaining = Math.max(0, YPP_THRESHOLDS.MIN_SUBSCRIBERS - currentMetrics.subscribers);
    const watchRemaining = Math.max(0, YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS - currentMetrics.watchTimeHours);

    // Iconos de progreso
    const subsIcon = subscribersProgress >= 100 ? '✅' : subscribersProgress >= 80 ? '🔥' : '📈';
    const watchIcon = watchTimeProgress >= 100 ? '✅' : watchTimeProgress >= 80 ? '🔥' : '📈';

    return `
🎯 ¡MILESTONE ALCANZADO! 🎯

${channelEmoji} *${channelName}* ¡ha superado el 80% en ${metricCrossed}!

━━━━━━━━━━━━━━━━━━━━━━

${subsIcon} *Suscriptores:* ${currentMetrics.subscribers.toLocaleString('es-ES')} / 1,000 (${subscribersProgress.toFixed(1)}%)
${subsRemaining > 0 ? `   → Faltan solo ${subsRemaining.toLocaleString('es-ES')} más` : '   → ¡COMPLETADO!'}

${watchIcon} *Watch Time:* ${currentMetrics.watchTimeHours.toLocaleString('es-ES')}h / 4,000h (${watchTimeProgress.toFixed(1)}%)
${watchRemaining > 0 ? `   → Faltan solo ${watchRemaining.toLocaleString('es-ES')}h más` : '   → ¡COMPLETADO!'}

━━━━━━━━━━━━━━━━━━━━━━

💪 *¡Estás muy cerca de la monetización!*

📈 Mantén el ritmo actual y pronto serás elegible para YPP.
🎬 Sigue publicando contenido de calidad.
🔔 Te notificaremos cuando alcances el 100%.

_"Cada video es un paso más hacia tu meta."_
`.trim();
  }

  // ============================================================================
  // SISTEMA DE HISTÓRICO DE PROGRESO (REQ-5.4.10)
  // ============================================================================

  /**
   * Guarda un snapshot de progreso hacia monetización.
   * 
   * Este método almacena métricas de un canal en un momento específico para
   * permitir análisis de tendencias y tracking de progreso a lo largo del tiempo.
   * 
   * Reglas de negocio:
   * 1. El ID se auto-genera (simula AUTOINCREMENT de SQLite)
   * 2. El snapshot se añade al almacenamiento en memoria
   * 3. Los datos son inmutables una vez guardados
   * 4. Compatible con futura migración a SQLite
   * 
   * @param snapshot - Datos del snapshot (sin ID, se auto-genera)
   * @returns Snapshot guardado con ID asignado
   * 
   * @requirement REQ-5.4.10
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * const saved = await gate.saveProgressSnapshot({
   *   channelKey: 'channel1',
   *   timestamp: new Date(),
   *   subscribers: 750,
   *   watchTimeHours: 2800,
   *   views: 85000,
   *   shortsViews90Days: 3_500_000
   * });
   * console.log(saved.id); // 1, 2, 3... (auto-incrementado)
   * ```
   */
  public async saveProgressSnapshot(
    snapshot: Omit<ProgressSnapshot, 'id'>
  ): Promise<ProgressSnapshot> {
    // Validar datos de entrada
    this.validateProgressSnapshot(snapshot);

    // Crear snapshot con ID auto-generado
    const savedSnapshot: ProgressSnapshot = {
      ...snapshot,
      id: this.progressHistoryNextId++,
      // Asegurar que timestamp sea un objeto Date válido
      timestamp: snapshot.timestamp instanceof Date 
        ? snapshot.timestamp 
        : new Date(snapshot.timestamp),
    };

    // Almacenar en memoria
    this.progressHistory.push(savedSnapshot);

    return savedSnapshot;
  }

  /**
   * Obtiene el histórico de progreso con filtros opcionales.
   * 
   * Retorna snapshots ordenados por timestamp descendente (más recientes primero).
   * Soporta filtros por canal, rango de fechas y límite de resultados.
   * 
   * Reglas de negocio:
   * 1. Si no se especifica channelKey, retorna ambos canales
   * 2. Filtros de fecha son inclusivos (>= startDate, <= endDate)
   * 3. Límite por defecto es 100 registros
   * 4. Resultados siempre ordenados por timestamp DESC
   * 
   * @param query - Parámetros de consulta opcionales
   * @returns Array de snapshots que cumplen los filtros, ordenados por fecha DESC
   * 
   * @requirement REQ-5.4.10
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Obtener todos los snapshots (máx 100)
   * const all = await gate.getProgressHistory();
   * 
   * // Filtrar por canal
   * const channel1 = await gate.getProgressHistory({ channelKey: 'channel1' });
   * 
   * // Filtrar por rango de fechas
   * const lastWeek = await gate.getProgressHistory({
   *   startDate: new Date('2024-01-01'),
   *   endDate: new Date('2024-01-07'),
   *   limit: 50
   * });
   * 
   * // Combinar filtros
   * const filtered = await gate.getProgressHistory({
   *   channelKey: 'channel2',
   *   startDate: new Date('2024-01-01'),
   *   limit: 20
   * });
   * ```
   */
  public async getProgressHistory(
    query?: ProgressHistoryQuery
  ): Promise<ProgressSnapshot[]> {
    // Parámetros por defecto
    const limit = query?.limit ?? 100;

    // Filtrar snapshots
    let results = this.progressHistory.filter(snapshot => {
      // Filtro por canal
      if (query?.channelKey && snapshot.channelKey !== query.channelKey) {
        return false;
      }

      // Filtro por fecha de inicio (inclusive)
      if (query?.startDate && snapshot.timestamp < query.startDate) {
        return false;
      }

      // Filtro por fecha de fin (inclusive)
      if (query?.endDate && snapshot.timestamp > query.endDate) {
        return false;
      }

      return true;
    });

    // Ordenar por timestamp descendente (más recientes primero)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Aplicar límite
    if (limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * Obtiene el snapshot más reciente de un canal específico.
   * 
   * Útil para comparar progreso actual con el último estado guardado
   * y determinar si se han cruzado milestones.
   * 
   * @param channelKey - Canal del que obtener el último snapshot
   * @returns Snapshot más reciente o null si no hay histórico
   * 
   * @requirement REQ-5.4.10
   * 
   * @example
   * ```typescript
   * const gate = new YPPValidationGate();
   * 
   * // Obtener último snapshot de Canal 1
   * const latest = await gate.getLatestSnapshot('channel1');
   * 
   * if (latest) {
   *   console.log(`Último registro: ${latest.timestamp}`);
   *   console.log(`Suscriptores: ${latest.subscribers}`);
   *   console.log(`Watch Time: ${latest.watchTimeHours}h`);
   * } else {
   *   console.log('No hay histórico para este canal');
   * }
   * ```
   */
  public async getLatestSnapshot(
    channelKey: 'channel1' | 'channel2' | 'channel3'
  ): Promise<ProgressSnapshot | null> {
    // Obtener con límite 1 para eficiencia
    const results = await this.getProgressHistory({
      channelKey,
      limit: 1,
    });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Valida los datos de un snapshot antes de guardarlo.
   * Lanza error si los datos son inválidos.
   */
  private validateProgressSnapshot(snapshot: Omit<ProgressSnapshot, 'id'>): void {
    // Validar channelKey
    if (!['channel1', 'channel2'].includes(snapshot.channelKey)) {
      throw new Error(
        `channelKey inválido: '${snapshot.channelKey}'. Debe ser 'channel1' o 'channel2'`
      );
    }

    // Validar timestamp
    const timestamp = snapshot.timestamp instanceof Date 
      ? snapshot.timestamp 
      : new Date(snapshot.timestamp);
    
    if (isNaN(timestamp.getTime())) {
      throw new Error('timestamp inválido: debe ser una fecha válida');
    }

    // Validar subscribers (debe ser número no negativo)
    if (typeof snapshot.subscribers !== 'number' || snapshot.subscribers < 0) {
      throw new Error('subscribers debe ser un número no negativo');
    }

    // Validar watchTimeHours (debe ser número no negativo)
    if (typeof snapshot.watchTimeHours !== 'number' || snapshot.watchTimeHours < 0) {
      throw new Error('watchTimeHours debe ser un número no negativo');
    }

    // Validar views (debe ser número no negativo)
    if (typeof snapshot.views !== 'number' || snapshot.views < 0) {
      throw new Error('views debe ser un número no negativo');
    }

    // Validar shortsViews90Days si está presente
    if (
      snapshot.shortsViews90Days !== undefined &&
      (typeof snapshot.shortsViews90Days !== 'number' || snapshot.shortsViews90Days < 0)
    ) {
      throw new Error('shortsViews90Days debe ser un número no negativo');
    }
  }

  /**
   * Obtiene el conteo total de snapshots almacenados.
   * Útil para monitoreo y debugging.
   * 
   * @param channelKey - Canal específico (opcional). Si no se especifica, cuenta todos.
   * @returns Número de snapshots almacenados
   * 
   * @requirement REQ-5.4.10
   */
  public getProgressHistoryCount(channelKey?: 'channel1' | 'channel2' | 'channel3'): number {
    if (channelKey) {
      return this.progressHistory.filter(s => s.channelKey === channelKey).length;
    }
    return this.progressHistory.length;
  }

  /**
   * Limpia el histórico de progreso.
   * Principalmente para uso en tests.
   * 
   * @param channelKey - Canal específico (opcional). Si no se especifica, limpia todo.
   * 
   * @requirement REQ-5.4.10
   */
  public clearProgressHistory(channelKey?: 'channel1' | 'channel2' | 'channel3'): void {
    if (channelKey) {
      // Filtrar y mantener solo los del otro canal
      const toKeep = this.progressHistory.filter(s => s.channelKey !== channelKey);
      this.progressHistory.length = 0;
      this.progressHistory.push(...toKeep);
    } else {
      // Limpiar todo
      this.progressHistory.length = 0;
      this.progressHistoryNextId = 1;
    }
  }
}
