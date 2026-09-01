/**
 * YPPValidationGate.test.ts
 * 
 * Tests unitarios para el método checkYPPRequirements del sistema de validación YPP.
 * 
 * @requirement REQ-5.4.2: Verificar métricas mínimas YPP (1000 subs, 4000h watch time)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  YPPValidationGate, 
  YPPMetrics, 
  YPPRequirementResult,
  ShortsEligibilityResult,
  YPP_THRESHOLDS,
  QUALITY_THRESHOLDS,
  ContentPerformanceMetrics,
  QualityRequirementResult,
  MetricStatus,
  ChannelMonetizationStatus,
  NewChannelAllowedResult,
  Platform,
  MonetizationData,
  PlatformExpansionResult,
  PlatformExpansionStatus,
  PlatformExpansionResultV2,
  AlertType,
  AlertUrgency,
  ProgressAlert,
  WeeklyProgressReport,
  WeeklyStatsInput,
  ChannelProgressInfo,
  ChannelWeeklyStats,
  OverrideAction,
  OverrideResult,
  OverrideLogEntry,
  YouTubeAnalyticsData,
  WeeklyProgressData,
  ProgressReportResult,
  WeeklyTrend,
  MilestoneAlertResult,
  YouTubeAnalyticsDataV2,
  YouTubeAnalyticsConfig,
  ProgressSnapshot,
  ProgressHistoryQuery
} from './YPPValidationGate';

describe('YPPValidationGate', () => {
  let gate: YPPValidationGate;

  beforeEach(() => {
    gate = new YPPValidationGate();
  });

  // Helper para crear métricas de prueba
  const createMetrics = (overrides: Partial<YPPMetrics> = {}): YPPMetrics => ({
    channelSubscribers: 0,
    totalWatchHours: 0,
    videoCount: 10,
    isMonetizationEligible: false,
    lastCheck: new Date(),
    ...overrides,
  });

  describe('checkYPPRequirements', () => {
    describe('Umbrales YPP', () => {
      it('debe usar 1000 como umbral mínimo de suscriptores', () => {
        expect(YPP_THRESHOLDS.MIN_SUBSCRIBERS).toBe(1000);
      });

      it('debe usar 4000 como umbral mínimo de horas de watch time', () => {
        expect(YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS).toBe(4000);
      });
    });

    describe('Elegibilidad', () => {
      it('debe retornar isEligible=false cuando no cumple ningún requisito', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando solo tiene suficientes suscriptores', () => {
        const metrics = createMetrics({
          channelSubscribers: 1500,
          totalWatchHours: 2000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando solo tiene suficiente watch time', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 5000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=true cuando cumple ambos requisitos exactamente', () => {
        const metrics = createMetrics({
          channelSubscribers: 1000,
          totalWatchHours: 4000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(true);
      });

      it('debe retornar isEligible=true cuando excede ambos requisitos', () => {
        const metrics = createMetrics({
          channelSubscribers: 5000,
          totalWatchHours: 10000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(true);
      });

      it('debe retornar isEligible=false cuando suscriptores es 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 0,
          totalWatchHours: 5000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando watch time es 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 2000,
          totalWatchHours: 0,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
      });
    });

    describe('Cálculo de progreso de suscriptores', () => {
      it('debe calcular 0% cuando tiene 0 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 0 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.subscribersProgress).toBe(0);
      });

      it('debe calcular 50% cuando tiene 500 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 500 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.subscribersProgress).toBe(50);
      });

      it('debe calcular 100% cuando tiene exactamente 1000 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 1000 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.subscribersProgress).toBe(100);
      });

      it('debe calcular >100% cuando excede 1000 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 2500 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.subscribersProgress).toBe(250);
      });

      it('debe redondear el progreso a 2 decimales', () => {
        const metrics = createMetrics({ channelSubscribers: 333 });
        const result = gate.checkYPPRequirements(metrics);
        // 333/1000 * 100 = 33.3
        expect(result.subscribersProgress).toBe(33.3);
      });
    });

    describe('Cálculo de progreso de watch time', () => {
      it('debe calcular 0% cuando tiene 0 horas', () => {
        const metrics = createMetrics({ totalWatchHours: 0 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.watchHoursProgress).toBe(0);
      });

      it('debe calcular 50% cuando tiene 2000 horas', () => {
        const metrics = createMetrics({ totalWatchHours: 2000 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.watchHoursProgress).toBe(50);
      });

      it('debe calcular 100% cuando tiene exactamente 4000 horas', () => {
        const metrics = createMetrics({ totalWatchHours: 4000 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.watchHoursProgress).toBe(100);
      });

      it('debe calcular >100% cuando excede 4000 horas', () => {
        const metrics = createMetrics({ totalWatchHours: 8000 });
        const result = gate.checkYPPRequirements(metrics);
        expect(result.watchHoursProgress).toBe(200);
      });

      it('debe redondear el progreso a 2 decimales', () => {
        const metrics = createMetrics({ totalWatchHours: 1333 });
        const result = gate.checkYPPRequirements(metrics);
        // 1333/4000 * 100 = 33.325 -> 33.32 (Math.round redondea .5 hacia abajo en ciertos casos)
        expect(result.watchHoursProgress).toBe(33.32);
      });
    });

    describe('Requisitos faltantes (missingRequirements)', () => {
      it('debe incluir ambos requisitos cuando no se cumplen', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.missingRequirements).toHaveLength(2);
        expect(result.missingRequirements).toContain('Necesitas 500 suscriptores más');
        expect(result.missingRequirements).toContain('Necesitas 2000 horas de watch time más');
      });

      it('debe incluir solo requisito de suscriptores cuando falta', () => {
        const metrics = createMetrics({
          channelSubscribers: 800,
          totalWatchHours: 5000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.missingRequirements).toHaveLength(1);
        expect(result.missingRequirements).toContain('Necesitas 200 suscriptores más');
      });

      it('debe incluir solo requisito de watch time cuando falta', () => {
        const metrics = createMetrics({
          channelSubscribers: 1500,
          totalWatchHours: 3000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.missingRequirements).toHaveLength(1);
        expect(result.missingRequirements).toContain('Necesitas 1000 horas de watch time más');
      });

      it('debe retornar array vacío cuando cumple todos los requisitos', () => {
        const metrics = createMetrics({
          channelSubscribers: 1000,
          totalWatchHours: 4000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.missingRequirements).toHaveLength(0);
      });

      it('debe calcular correctamente faltantes desde 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 0,
          totalWatchHours: 0,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.missingRequirements).toContain('Necesitas 1000 suscriptores más');
        expect(result.missingRequirements).toContain('Necesitas 4000 horas de watch time más');
      });
    });

    describe('Retorno de estructura YPPRequirementResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result).toHaveProperty('isEligible');
        expect(result).toHaveProperty('subscribersProgress');
        expect(result).toHaveProperty('watchHoursProgress');
        expect(result).toHaveProperty('missingRequirements');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(typeof result.isEligible).toBe('boolean');
        expect(typeof result.subscribersProgress).toBe('number');
        expect(typeof result.watchHoursProgress).toBe('number');
        expect(Array.isArray(result.missingRequirements)).toBe(true);
      });
    });

    describe('Casos límite', () => {
      it('debe manejar valores justo por debajo de los umbrales', () => {
        const metrics = createMetrics({
          channelSubscribers: 999,
          totalWatchHours: 3999,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(false);
        expect(result.subscribersProgress).toBe(99.9);
        expect(result.watchHoursProgress).toBe(99.98);
      });

      it('debe manejar valores muy grandes', () => {
        const metrics = createMetrics({
          channelSubscribers: 1000000,
          totalWatchHours: 1000000,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.isEligible).toBe(true);
        expect(result.subscribersProgress).toBe(100000);
        expect(result.watchHoursProgress).toBe(25000);
      });

      it('debe manejar valores decimales en métricas', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1234.56,
        });

        const result = gate.checkYPPRequirements(metrics);

        expect(result.watchHoursProgress).toBe(30.86); // 1234.56/4000*100 = 30.864
      });
    });
  });

  describe('checkShortsEligibility', () => {
    describe('Umbrales de Shorts YPP', () => {
      it('debe usar 10,000,000 como umbral mínimo de vistas de Shorts en 90 días', () => {
        expect(YPP_THRESHOLDS.SHORTS_MIN_VIEWS_90_DAYS).toBe(10_000_000);
      });

      it('debe usar 1000 como umbral mínimo de suscriptores (mismo que vía tradicional)', () => {
        expect(YPP_THRESHOLDS.MIN_SUBSCRIBERS).toBe(1000);
      });
    });

    describe('Elegibilidad por vía Shorts', () => {
      it('debe retornar isEligible=false cuando no cumple ningún requisito', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          shortsViewsLast90Days: 5_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando solo tiene suficientes suscriptores', () => {
        const metrics = createMetrics({
          channelSubscribers: 1500,
          shortsViewsLast90Days: 5_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando solo tiene suficientes vistas de Shorts', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          shortsViewsLast90Days: 15_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=true cuando cumple ambos requisitos exactamente', () => {
        const metrics = createMetrics({
          channelSubscribers: 1000,
          shortsViewsLast90Days: 10_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(true);
      });

      it('debe retornar isEligible=true cuando excede ambos requisitos', () => {
        const metrics = createMetrics({
          channelSubscribers: 5000,
          shortsViewsLast90Days: 25_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(true);
      });

      it('debe retornar isEligible=false cuando shortsViewsLast90Days es undefined', () => {
        const metrics = createMetrics({
          channelSubscribers: 2000,
        });
        // shortsViewsLast90Days no está definido

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
      });

      it('debe retornar isEligible=false cuando shortsViewsLast90Days es 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 2000,
          shortsViewsLast90Days: 0,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
      });
    });

    describe('Cálculo de progreso de vistas de Shorts', () => {
      it('debe calcular 0% cuando tiene 0 vistas de Shorts', () => {
        const metrics = createMetrics({ shortsViewsLast90Days: 0 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.viewsProgress).toBe(0);
      });

      it('debe calcular 0% cuando shortsViewsLast90Days es undefined', () => {
        const metrics = createMetrics({});
        const result = gate.checkShortsEligibility(metrics);
        expect(result.viewsProgress).toBe(0);
      });

      it('debe calcular 50% cuando tiene 5M de vistas de Shorts', () => {
        const metrics = createMetrics({ shortsViewsLast90Days: 5_000_000 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.viewsProgress).toBe(50);
      });

      it('debe calcular 100% cuando tiene exactamente 10M de vistas', () => {
        const metrics = createMetrics({ shortsViewsLast90Days: 10_000_000 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.viewsProgress).toBe(100);
      });

      it('debe calcular >100% cuando excede 10M de vistas', () => {
        const metrics = createMetrics({ shortsViewsLast90Days: 25_000_000 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.viewsProgress).toBe(250);
      });

      it('debe redondear el progreso a 2 decimales', () => {
        const metrics = createMetrics({ shortsViewsLast90Days: 3_333_333 });
        const result = gate.checkShortsEligibility(metrics);
        // 3333333/10000000 * 100 = 33.33333 -> 33.33
        expect(result.viewsProgress).toBe(33.33);
      });
    });

    describe('Cálculo de progreso de suscriptores', () => {
      it('debe calcular 0% cuando tiene 0 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 0 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.subscribersProgress).toBe(0);
      });

      it('debe calcular 50% cuando tiene 500 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 500 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.subscribersProgress).toBe(50);
      });

      it('debe calcular 100% cuando tiene exactamente 1000 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 1000 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.subscribersProgress).toBe(100);
      });

      it('debe calcular >100% cuando excede 1000 suscriptores', () => {
        const metrics = createMetrics({ channelSubscribers: 2500 });
        const result = gate.checkShortsEligibility(metrics);
        expect(result.subscribersProgress).toBe(250);
      });
    });

    describe('Requisitos faltantes (missingRequirements)', () => {
      it('debe incluir ambos requisitos cuando no se cumplen', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          shortsViewsLast90Days: 5_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.missingRequirements).toHaveLength(2);
        expect(result.missingRequirements).toContain('Necesitas 500 suscriptores más');
        // El mensaje de vistas debe tener formato con separador de miles
        expect(result.missingRequirements.some(req => req.includes('vistas de Shorts'))).toBe(true);
      });

      it('debe incluir solo requisito de suscriptores cuando falta', () => {
        const metrics = createMetrics({
          channelSubscribers: 800,
          shortsViewsLast90Days: 15_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.missingRequirements).toHaveLength(1);
        expect(result.missingRequirements).toContain('Necesitas 200 suscriptores más');
      });

      it('debe incluir solo requisito de vistas cuando falta', () => {
        const metrics = createMetrics({
          channelSubscribers: 1500,
          shortsViewsLast90Days: 8_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.missingRequirements).toHaveLength(1);
        expect(result.missingRequirements.some(req => req.includes('vistas de Shorts'))).toBe(true);
      });

      it('debe retornar array vacío cuando cumple todos los requisitos', () => {
        const metrics = createMetrics({
          channelSubscribers: 1000,
          shortsViewsLast90Days: 10_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.missingRequirements).toHaveLength(0);
      });

      it('debe calcular correctamente faltantes desde 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 0,
          shortsViewsLast90Days: 0,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.missingRequirements).toContain('Necesitas 1000 suscriptores más');
        expect(result.missingRequirements.some(req => req.includes('10.000.000') || req.includes('10,000,000'))).toBe(true);
      });
    });

    describe('Retorno de estructura ShortsEligibilityResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          shortsViewsLast90Days: 5_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result).toHaveProperty('isEligible');
        expect(result).toHaveProperty('viewsProgress');
        expect(result).toHaveProperty('subscribersProgress');
        expect(result).toHaveProperty('missingRequirements');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          shortsViewsLast90Days: 5_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(typeof result.isEligible).toBe('boolean');
        expect(typeof result.viewsProgress).toBe('number');
        expect(typeof result.subscribersProgress).toBe('number');
        expect(Array.isArray(result.missingRequirements)).toBe(true);
      });
    });

    describe('Casos límite de Shorts', () => {
      it('debe manejar valores justo por debajo de los umbrales', () => {
        const metrics = createMetrics({
          channelSubscribers: 999,
          shortsViewsLast90Days: 9_999_999,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
        expect(result.subscribersProgress).toBe(99.9);
        expect(result.viewsProgress).toBeCloseTo(100, 1); // 99.99999%
      });

      it('debe manejar valores muy grandes', () => {
        const metrics = createMetrics({
          channelSubscribers: 1_000_000,
          shortsViewsLast90Days: 100_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(true);
        expect(result.subscribersProgress).toBe(100000);
        expect(result.viewsProgress).toBe(1000);
      });

      it('debe manejar canal con muchas vistas de Shorts pero sin suscriptores', () => {
        const metrics = createMetrics({
          channelSubscribers: 0,
          shortsViewsLast90Days: 50_000_000,
        });

        const result = gate.checkShortsEligibility(metrics);

        expect(result.isEligible).toBe(false);
        expect(result.viewsProgress).toBe(500);
        expect(result.subscribersProgress).toBe(0);
      });
    });
  });

  describe('checkQualityRequirements', () => {
    // Helper para crear métricas de rendimiento de prueba
    const createPerformanceMetrics = (overrides: Partial<ContentPerformanceMetrics> = {}): ContentPerformanceMetrics => ({
      averageRetentionRate: 0,
      averageCTR: 0,
      averageWatchTimePercent: 0,
      ...overrides,
    });

    describe('Umbrales de Calidad', () => {
      it('debe usar 50% como umbral mínimo de retención', () => {
        expect(QUALITY_THRESHOLDS.MIN_RETENTION_RATE).toBe(50);
      });

      it('debe usar 4% como umbral mínimo de CTR', () => {
        expect(QUALITY_THRESHOLDS.MIN_CTR).toBe(4);
      });

      it('debe usar 40% como umbral mínimo de watch time', () => {
        expect(QUALITY_THRESHOLDS.MIN_WATCH_TIME_PERCENT).toBe(40);
      });
    });

    describe('Verificación de aprobación general', () => {
      it('debe retornar passed=false cuando ninguna métrica cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 30,
          averageCTR: 2,
          averageWatchTimePercent: 20,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
      });

      it('debe retornar passed=false cuando solo retención cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 60,
          averageCTR: 2,
          averageWatchTimePercent: 20,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
      });

      it('debe retornar passed=false cuando solo CTR cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 30,
          averageCTR: 6,
          averageWatchTimePercent: 20,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
      });

      it('debe retornar passed=false cuando solo watch time cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 30,
          averageCTR: 2,
          averageWatchTimePercent: 60,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
      });

      it('debe retornar passed=false cuando falta una métrica', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 60,
          averageCTR: 6,
          averageWatchTimePercent: 30, // No cumple
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
      });

      it('debe retornar passed=true cuando todas las métricas cumplen exactamente', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 4,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(true);
      });

      it('debe retornar passed=true cuando todas las métricas exceden los umbrales', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 80,
          averageCTR: 10,
          averageWatchTimePercent: 70,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(true);
      });
    });

    describe('Estado de métrica de retención', () => {
      it('debe indicar passed=true cuando retención >= 50%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 0,
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.retentionStatus.passed).toBe(true);
        expect(result.retentionStatus.value).toBe(50);
        expect(result.retentionStatus.threshold).toBe(50);
      });

      it('debe indicar passed=false cuando retención < 50%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 45,
          averageCTR: 0,
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.retentionStatus.passed).toBe(false);
        expect(result.retentionStatus.value).toBe(45);
        expect(result.retentionStatus.threshold).toBe(50);
      });

      it('debe manejar retención en 0%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.retentionStatus.passed).toBe(false);
        expect(result.retentionStatus.value).toBe(0);
      });

      it('debe manejar retención superior a 100%', () => {
        // Teóricamente imposible, pero el sistema debe manejarlo
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 110,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.retentionStatus.passed).toBe(true);
        expect(result.retentionStatus.value).toBe(110);
      });
    });

    describe('Estado de métrica de CTR', () => {
      it('debe indicar passed=true cuando CTR >= 4%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
          averageCTR: 4,
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.ctrStatus.passed).toBe(true);
        expect(result.ctrStatus.value).toBe(4);
        expect(result.ctrStatus.threshold).toBe(4);
      });

      it('debe indicar passed=false cuando CTR < 4%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
          averageCTR: 3.5,
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.ctrStatus.passed).toBe(false);
        expect(result.ctrStatus.value).toBe(3.5);
        expect(result.ctrStatus.threshold).toBe(4);
      });

      it('debe manejar CTR en 0%', () => {
        const metrics = createPerformanceMetrics({
          averageCTR: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.ctrStatus.passed).toBe(false);
        expect(result.ctrStatus.value).toBe(0);
      });

      it('debe manejar CTR con decimales', () => {
        const metrics = createPerformanceMetrics({
          averageCTR: 4.567,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.ctrStatus.passed).toBe(true);
        expect(result.ctrStatus.value).toBe(4.567);
      });
    });

    describe('Estado de métrica de watch time', () => {
      it('debe indicar passed=true cuando watch time >= 40%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
          averageCTR: 0,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.watchTimeStatus.passed).toBe(true);
        expect(result.watchTimeStatus.value).toBe(40);
        expect(result.watchTimeStatus.threshold).toBe(40);
      });

      it('debe indicar passed=false cuando watch time < 40%', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
          averageCTR: 0,
          averageWatchTimePercent: 35,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.watchTimeStatus.passed).toBe(false);
        expect(result.watchTimeStatus.value).toBe(35);
        expect(result.watchTimeStatus.threshold).toBe(40);
      });

      it('debe manejar watch time en 0%', () => {
        const metrics = createPerformanceMetrics({
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.watchTimeStatus.passed).toBe(false);
        expect(result.watchTimeStatus.value).toBe(0);
      });

      it('debe manejar watch time con decimales', () => {
        const metrics = createPerformanceMetrics({
          averageWatchTimePercent: 40.5,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.watchTimeStatus.passed).toBe(true);
        expect(result.watchTimeStatus.value).toBe(40.5);
      });
    });

    describe('Recomendaciones', () => {
      it('debe generar 3 recomendaciones cuando ninguna métrica cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 30,
          averageCTR: 2,
          averageWatchTimePercent: 20,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(3);
      });

      it('debe generar recomendación de retención cuando no cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 45,
          averageCTR: 6,
          averageWatchTimePercent: 60,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0]).toContain('retención');
        expect(result.recommendations[0]).toContain('45%');
        expect(result.recommendations[0]).toContain('50%');
        expect(result.recommendations[0]).toContain('+5.0%');
      });

      it('debe generar recomendación de CTR cuando no cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 60,
          averageCTR: 3,
          averageWatchTimePercent: 60,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0]).toContain('CTR');
        expect(result.recommendations[0]).toContain('3%');
        expect(result.recommendations[0]).toContain('4%');
        expect(result.recommendations[0]).toContain('+1.0%');
      });

      it('debe generar recomendación de watch time cuando no cumple', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 60,
          averageCTR: 6,
          averageWatchTimePercent: 30,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0]).toContain('watch time');
        expect(result.recommendations[0]).toContain('30%');
        expect(result.recommendations[0]).toContain('40%');
        expect(result.recommendations[0]).toContain('+10.0%');
      });

      it('debe retornar array vacío cuando todas las métricas cumplen', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 4,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(0);
      });

      it('debe formatear decimales correctamente en las recomendaciones', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 47.5,
          averageCTR: 6,
          averageWatchTimePercent: 60,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0]).toContain('47.5%');
        expect(result.recommendations[0]).toContain('+2.5%');
      });
    });

    describe('Retorno de estructura QualityRequirementResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 4,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('retentionStatus');
        expect(result).toHaveProperty('ctrStatus');
        expect(result).toHaveProperty('watchTimeStatus');
        expect(result).toHaveProperty('recommendations');
      });

      it('debe retornar estructura correcta en cada status', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 4,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        // Verificar estructura de retentionStatus
        expect(result.retentionStatus).toHaveProperty('passed');
        expect(result.retentionStatus).toHaveProperty('value');
        expect(result.retentionStatus).toHaveProperty('threshold');

        // Verificar estructura de ctrStatus
        expect(result.ctrStatus).toHaveProperty('passed');
        expect(result.ctrStatus).toHaveProperty('value');
        expect(result.ctrStatus).toHaveProperty('threshold');

        // Verificar estructura de watchTimeStatus
        expect(result.watchTimeStatus).toHaveProperty('passed');
        expect(result.watchTimeStatus).toHaveProperty('value');
        expect(result.watchTimeStatus).toHaveProperty('threshold');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 50,
          averageCTR: 4,
          averageWatchTimePercent: 40,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(typeof result.passed).toBe('boolean');
        expect(typeof result.retentionStatus.passed).toBe('boolean');
        expect(typeof result.retentionStatus.value).toBe('number');
        expect(typeof result.retentionStatus.threshold).toBe('number');
        expect(typeof result.ctrStatus.passed).toBe('boolean');
        expect(typeof result.ctrStatus.value).toBe('number');
        expect(typeof result.ctrStatus.threshold).toBe('number');
        expect(typeof result.watchTimeStatus.passed).toBe('boolean');
        expect(typeof result.watchTimeStatus.value).toBe('number');
        expect(typeof result.watchTimeStatus.threshold).toBe('number');
        expect(Array.isArray(result.recommendations)).toBe(true);
      });
    });

    describe('Casos límite de métricas de calidad', () => {
      it('debe manejar valores justo por debajo de los umbrales', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 49.9,
          averageCTR: 3.9,
          averageWatchTimePercent: 39.9,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
        expect(result.retentionStatus.passed).toBe(false);
        expect(result.ctrStatus.passed).toBe(false);
        expect(result.watchTimeStatus.passed).toBe(false);
      });

      it('debe manejar valores de 0 en todas las métricas', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 0,
          averageCTR: 0,
          averageWatchTimePercent: 0,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(false);
        expect(result.recommendations).toHaveLength(3);
      });

      it('debe manejar valores muy altos', () => {
        const metrics = createPerformanceMetrics({
          averageRetentionRate: 100,
          averageCTR: 50,
          averageWatchTimePercent: 100,
        });

        const result = gate.checkQualityRequirements(metrics);

        expect(result.passed).toBe(true);
        expect(result.recommendations).toHaveLength(0);
      });
    });
  });

  describe('canCreateNewChannel', () => {
    // Helper para crear estado de monetización de canal
    const createChannelStatus = (
      channelKey: 'channel1' | 'channel2' | 'channel3',
      overrides: Partial<Omit<ChannelMonetizationStatus, 'channelKey'>> = {}
    ): ChannelMonetizationStatus => ({
      channelKey,
      isMonetized: false,
      hasYPPRequirements: false,
      monthsSinceCreation: 0,
      ...overrides,
    });

    describe('Regla de Oro #1: NO crear canal 3 hasta que canal 1 o 2 esté monetizado', () => {
      it('debe bloquear canal 3 cuando ningún canal está monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 3 }),
          createChannelStatus('channel2', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 1 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('No se puede crear canal 3');
        expect(result.reason).toContain('Regla de Oro #1');
      });

      it('debe bloquear canal 3 cuando canal 1 no está monetizado pero canal 2 sí', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: true, monthsSinceCreation: 6 }),
          createChannelStatus('channel2', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 8 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        // Ahora permite si AL MENOS uno está monetizado según la Regla de Oro #1
        // La regla dice "hasta que canal 1 o 2 esté monetizado"
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Canal 1');
      });

      it('debe bloquear canal 3 cuando canal 2 no está monetizado pero canal 1 sí', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 }),
          createChannelStatus('channel2', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 4 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Canal 2');
      });

      it('debe permitir canal 3 cuando AMBOS canales están monetizados', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 }),
          createChannelStatus('channel2', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 8 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('Todos los canales existentes están monetizados');
      });
    });

    describe('Mensajes detallados de bloqueo', () => {
      it('debe indicar qué canales faltan por monetizar', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 3 }),
          createChannelStatus('channel2', { isMonetized: false, hasYPPRequirements: true, monthsSinceCreation: 6 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.reason).toContain('Canal 1 (NeuroSync AI)');
        expect(result.reason).toContain('Canal 2 (NeuroTech AI)');
      });

      it('debe indicar el estado de requisitos YPP de cada canal no monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: true, monthsSinceCreation: 6 }),
          createChannelStatus('channel2', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 2 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.reason).toContain('cumple requisitos YPP');
        expect(result.reason).toContain('no cumple requisitos YPP');
      });

      it('debe incluir meses de antigüedad de cada canal no monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 6 }),
          createChannelStatus('channel2', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.reason).toContain('6 meses activo');
      });
    });

    describe('Estructura de resultado NewChannelAllowedResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false }),
          createChannelStatus('channel2', { isMonetized: false }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result).toHaveProperty('allowed');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('channels');
        expect(result).toHaveProperty('requirement');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true }),
          createChannelStatus('channel2', { isMonetized: true }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.reason).toBe('string');
        expect(Array.isArray(result.channels)).toBe(true);
        expect(typeof result.requirement).toBe('string');
      });

      it('debe retornar los canales originales en el resultado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: true, monthsSinceCreation: 6 }),
          createChannelStatus('channel2', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 8 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.channels).toHaveLength(2);
        expect(result.channels[0].channelKey).toBe('channel1');
        expect(result.channels[1].channelKey).toBe('channel2');
      });
    });

    describe('Campo requirement (explicación de qué se necesita)', () => {
      it('debe explicar requisito cuando ningún canal está monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false }),
          createChannelStatus('channel2', { isMonetized: false }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.requirement).toContain('AL MENOS uno');
        expect(result.requirement).toContain('monetizado');
      });

      it('debe explicar requisito cuando un canal está monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true }),
          createChannelStatus('channel2', { isMonetized: false }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.requirement).toContain('monetizar');
        expect(result.requirement).toContain('canal restante');
      });

      it('debe indicar requisito cumplido cuando todos los canales están monetizados', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true }),
          createChannelStatus('channel2', { isMonetized: true }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.requirement).toContain('Requisito cumplido');
      });
    });

    describe('Casos límite', () => {
      it('debe manejar array vacío de canales (permite crear primer canal)', () => {
        const channels: ChannelMonetizationStatus[] = [];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(true);
      });

      it('debe manejar un solo canal monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(true);
      });

      it('debe manejar un solo canal no monetizado', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 1 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Canal 1');
      });

      it('debe manejar canal con 0 meses de antigüedad', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false, hasYPPRequirements: false, monthsSinceCreation: 0 }),
          createChannelStatus('channel2', { isMonetized: true, hasYPPRequirements: true, monthsSinceCreation: 12 }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('0 meses activo');
      });
    });

    describe('Integración con nombres de canales del proyecto', () => {
      it('debe mostrar nombre NeuroSync AI para channel1', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: false }),
          createChannelStatus('channel2', { isMonetized: true }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.reason).toContain('NeuroSync AI');
      });

      it('debe mostrar nombre NeuroTech AI para channel2', () => {
        const channels = [
          createChannelStatus('channel1', { isMonetized: true }),
          createChannelStatus('channel2', { isMonetized: false }),
        ];

        const result = gate.canCreateNewChannel(channels);

        expect(result.reason).toContain('NeuroTech AI');
      });
    });
  });

  describe('canExpandToPlatform', () => {
    // Helper para crear datos de monetización de prueba
    const createMonetizationData = (overrides: Partial<MonetizationData> = {}): MonetizationData => ({
      hasFirstDollar: false,
      totalRevenue: 0,
      monthsWithRevenue: 0,
      ...overrides,
    });

    describe('Regla de Oro #2: NO expandir a IG/TikTok hasta que YouTube pague el primer dólar', () => {
      it('debe bloquear Instagram cuando no hay monetización', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: false,
          totalRevenue: 0,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.allowed).toBe(false);
        expect(result.platform).toBe('instagram');
        expect(result.reason).toContain('Regla de Oro #2');
        expect(result.reason).toContain('Instagram Reels');
      });

      it('debe bloquear TikTok cuando no hay monetización', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: false,
          totalRevenue: 0,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.allowed).toBe(false);
        expect(result.platform).toBe('tiktok');
        expect(result.reason).toContain('Regla de Oro #2');
        expect(result.reason).toContain('TikTok');
      });

      it('debe permitir Instagram cuando hay primer dólar', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 1.00,
          monthsWithRevenue: 1,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.platform).toBe('instagram');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('Instagram Reels');
      });

      it('debe permitir TikTok cuando hay primer dólar', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 50.00,
          monthsWithRevenue: 2,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.platform).toBe('tiktok');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('TikTok');
      });
    });

    describe('YouTube como plataforma base', () => {
      it('debe permitir YouTube siempre, incluso sin monetización', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: false,
          totalRevenue: 0,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('youtube', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.platform).toBe('youtube');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('plataforma base');
      });

      it('debe permitir YouTube con monetización', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 1000.00,
          monthsWithRevenue: 12,
        });

        const result = gate.canExpandToPlatform('youtube', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.platform).toBe('youtube');
      });
    });

    describe('Mensajes detallados', () => {
      it('debe incluir detalles de ingresos cuando está permitido', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 150.50,
          monthsWithRevenue: 3,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.reason).toContain('$150.50');
        expect(result.reason).toContain('3 meses');
      });

      it('debe usar singular para 1 mes', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 5.00,
          monthsWithRevenue: 1,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.reason).toContain('1 mes');
        expect(result.reason).not.toContain('1 meses');
      });

      it('debe explicar requisito cuando está bloqueado', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: false,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.requirement).toContain('al menos $1');
        expect(result.requirement).toContain('modelo de negocio');
      });

      it('debe indicar requisito cumplido cuando está permitido', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 100,
          monthsWithRevenue: 2,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.requirement).toContain('Requisito cumplido');
      });
    });

    describe('Estado de monetización en resultado', () => {
      it('debe incluir currentMonetizationStatus con datos correctos', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 250.75,
          monthsWithRevenue: 5,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.currentMonetizationStatus).toBeDefined();
        expect(result.currentMonetizationStatus.hasFirstDollar).toBe(true);
        expect(result.currentMonetizationStatus.totalRevenue).toBe(250.75);
        expect(result.currentMonetizationStatus.monthsWithRevenue).toBe(5);
      });

      it('debe incluir currentMonetizationStatus incluso cuando está bloqueado', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: false,
          totalRevenue: 0,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.currentMonetizationStatus).toBeDefined();
        expect(result.currentMonetizationStatus.hasFirstDollar).toBe(false);
        expect(result.currentMonetizationStatus.totalRevenue).toBe(0);
        expect(result.currentMonetizationStatus.monthsWithRevenue).toBe(0);
      });
    });

    describe('Estructura de resultado PlatformExpansionResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const monetizationData = createMonetizationData();

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result).toHaveProperty('allowed');
        expect(result).toHaveProperty('platform');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('requirement');
        expect(result).toHaveProperty('currentMonetizationStatus');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 100,
          monthsWithRevenue: 2,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.platform).toBe('string');
        expect(typeof result.reason).toBe('string');
        expect(typeof result.requirement).toBe('string');
        expect(typeof result.currentMonetizationStatus).toBe('object');
        expect(typeof result.currentMonetizationStatus.hasFirstDollar).toBe('boolean');
        expect(typeof result.currentMonetizationStatus.totalRevenue).toBe('number');
        expect(typeof result.currentMonetizationStatus.monthsWithRevenue).toBe('number');
      });
    });

    describe('Casos límite', () => {
      it('debe manejar totalRevenue = 0 con hasFirstDollar = true (caso edge)', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 0,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        // hasFirstDollar es la fuente de verdad
        expect(result.allowed).toBe(true);
      });

      it('debe manejar totalRevenue muy alto', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 1000000.99,
          monthsWithRevenue: 36,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('$1000000.99');
      });

      it('debe manejar valores decimales en totalRevenue', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 0.01,
          monthsWithRevenue: 1,
        });

        const result = gate.canExpandToPlatform('instagram', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('$0.01');
      });

      it('debe manejar monthsWithRevenue = 0 con ingresos', () => {
        const monetizationData = createMonetizationData({
          hasFirstDollar: true,
          totalRevenue: 50,
          monthsWithRevenue: 0,
        });

        const result = gate.canExpandToPlatform('tiktok', monetizationData);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('0 meses');
      });
    });

    describe('Diferenciación entre plataformas', () => {
      it('debe mostrar "Instagram Reels" para instagram', () => {
        const monetizationData = createMonetizationData({ hasFirstDollar: false });
        const result = gate.canExpandToPlatform('instagram', monetizationData);
        expect(result.reason).toContain('Instagram Reels');
        // Nota: la Regla de Oro #2 menciona "IG/TikTok" como parte de la cita
        expect(result.reason).toContain('Regla de Oro #2');
      });

      it('debe mostrar "TikTok" para tiktok', () => {
        const monetizationData = createMonetizationData({ hasFirstDollar: false });
        const result = gate.canExpandToPlatform('tiktok', monetizationData);
        expect(result.reason).toContain('TikTok');
        expect(result.reason).not.toContain('Instagram Reels');
      });

      it('debe indicar "plataforma base" para youtube', () => {
        const monetizationData = createMonetizationData({ hasFirstDollar: false });
        const result = gate.canExpandToPlatform('youtube', monetizationData);
        expect(result.reason).toContain('plataforma base');
      });
    });
  });

  describe('canExpandToPlatformV2', () => {
    // Helper para crear estado de plataforma
    const createPlatformStatus = (
      platform: Platform,
      isActive: boolean,
      isMonetized: boolean
    ): PlatformExpansionStatus => ({
      platform,
      isActive,
      isMonetized,
    });

    describe('Regla de Oro #2: Bloqueo de IG/TikTok/Facebook hasta monetización de YouTube', () => {
      it('debe bloquear Instagram cuando YouTube no está activo', () => {
        const currentPlatforms: PlatformExpansionStatus[] = [];

        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.targetPlatform).toBe('instagram');
        expect(result.reason).toContain('YouTube no está activo');
        expect(result.currentPlatforms).toEqual(currentPlatforms);
      });

      it('debe bloquear TikTok cuando YouTube no está activo', () => {
        const currentPlatforms: PlatformExpansionStatus[] = [];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.targetPlatform).toBe('tiktok');
        expect(result.reason).toContain('YouTube no está activo');
      });

      it('debe bloquear Instagram cuando YouTube está activo pero NO monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, false),
        ];

        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.targetPlatform).toBe('instagram');
        expect(result.reason).toContain('Regla de Oro #2');
        expect(result.reason).toContain('no monetizado');
      });

      it('debe bloquear TikTok cuando YouTube está activo pero NO monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, false),
        ];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.targetPlatform).toBe('tiktok');
        expect(result.reason).toContain('Regla de Oro #2');
        expect(result.reason).toContain('no monetizado');
      });

      it('debe bloquear Facebook cuando YouTube está activo pero NO monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, false),
        ];

        const result = gate.canExpandToPlatformV2('facebook', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.targetPlatform).toBe('facebook');
        expect(result.reason).toContain('Regla de Oro #2');
      });

      it('debe permitir Instagram cuando YouTube está activo Y monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
        ];

        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('instagram');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('Instagram Reels');
        expect(result.reason).toContain('monetizado');
      });

      it('debe permitir TikTok cuando YouTube está activo Y monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
        ];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('tiktok');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('TikTok');
      });

      it('debe permitir Facebook cuando YouTube está activo Y monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
        ];

        const result = gate.canExpandToPlatformV2('facebook', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('facebook');
        expect(result.reason).toContain('✅');
        expect(result.reason).toContain('Facebook');
      });
    });

    describe('YouTube como plataforma base', () => {
      it('debe permitir "expandir" a YouTube cuando no hay plataformas activas', () => {
        const currentPlatforms: PlatformExpansionStatus[] = [];

        const result = gate.canExpandToPlatformV2('youtube', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('youtube');
        expect(result.reason).toContain('plataforma base');
        expect(result.reason).toContain('primera');
      });

      it('debe indicar que YouTube ya está activo si ya lo está', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, false),
        ];

        const result = gate.canExpandToPlatformV2('youtube', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('youtube');
        expect(result.reason).toContain('ya está activo');
      });

      it('debe indicar que YouTube ya está activo incluso si está monetizado', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
        ];

        const result = gate.canExpandToPlatformV2('youtube', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('youtube');
        expect(result.reason).toContain('ya está activo');
      });
    });

    describe('Estructura del resultado', () => {
      it('debe incluir todas las propiedades requeridas en PlatformExpansionResultV2', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
        ];

        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);

        expect(result).toHaveProperty('allowed');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('currentPlatforms');
        expect(result).toHaveProperty('targetPlatform');
        expect(result).toHaveProperty('requirement');
      });

      it('debe retornar el array de currentPlatforms exactamente como se pasó', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
          createPlatformStatus('instagram', true, false),
        ];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.currentPlatforms).toEqual(currentPlatforms);
        expect(result.currentPlatforms.length).toBe(2);
      });

      it('debe retornar la plataforma objetivo correcta', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, true)];

        expect(gate.canExpandToPlatformV2('instagram', currentPlatforms).targetPlatform).toBe('instagram');
        expect(gate.canExpandToPlatformV2('tiktok', currentPlatforms).targetPlatform).toBe('tiktok');
        expect(gate.canExpandToPlatformV2('facebook', currentPlatforms).targetPlatform).toBe('facebook');
        expect(gate.canExpandToPlatformV2('youtube', currentPlatforms).targetPlatform).toBe('youtube');
      });
    });

    describe('Casos con múltiples plataformas activas', () => {
      it('debe permitir expansión a TikTok si YouTube está monetizado aunque Instagram esté activo sin monetizar', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, true),
          createPlatformStatus('instagram', true, false),
        ];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.allowed).toBe(true);
        expect(result.targetPlatform).toBe('tiktok');
      });

      it('debe bloquear expansión si YouTube no está monetizado aunque otras plataformas lo estén', () => {
        const currentPlatforms = [
          createPlatformStatus('youtube', true, false),
          createPlatformStatus('instagram', true, true), // Monetizado pero no importa
        ];

        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Regla de Oro #2');
      });
    });

    describe('Nombres de plataforma en mensajes', () => {
      it('debe mostrar "Instagram Reels" para instagram', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, false)];
        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);
        expect(result.reason).toContain('Instagram Reels');
      });

      it('debe mostrar "TikTok" para tiktok', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, false)];
        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);
        expect(result.reason).toContain('TikTok');
      });

      it('debe mostrar "Facebook" para facebook', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, false)];
        const result = gate.canExpandToPlatformV2('facebook', currentPlatforms);
        expect(result.reason).toContain('Facebook');
      });
    });

    describe('Requisitos claros', () => {
      it('debe explicar el requisito cuando YouTube no está activo', () => {
        const result = gate.canExpandToPlatformV2('instagram', []);
        expect(result.requirement).toContain('YouTube');
        expect(result.requirement).toContain('activo');
      });

      it('debe explicar el requisito cuando YouTube no está monetizado', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, false)];
        const result = gate.canExpandToPlatformV2('tiktok', currentPlatforms);
        expect(result.requirement).toContain('monetizado');
      });

      it('debe indicar requisito cumplido cuando se permite la expansión', () => {
        const currentPlatforms = [createPlatformStatus('youtube', true, true)];
        const result = gate.canExpandToPlatformV2('instagram', currentPlatforms);
        expect(result.requirement).toContain('cumplido');
      });
    });
  });

  describe('checkProgressAlerts', () => {
    describe('Alertas de suscriptores', () => {
      it('debe generar alerta cuando suscriptores >= 800 (80% de 1000)', () => {
        const metrics = createMetrics({
          channelSubscribers: 800,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const subscriberAlert = alerts.find(a => a.alertType === 'subscribers_80');
        expect(subscriberAlert).toBeDefined();
        expect(subscriberAlert?.triggered).toBe(true);
        expect(subscriberAlert?.currentProgress).toBe(80);
        expect(subscriberAlert?.urgency).toBe('medium');
      });

      it('debe generar alerta con urgency HIGH cuando suscriptores >= 900 (90%)', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const subscriberAlert = alerts.find(a => a.alertType === 'subscribers_80');
        expect(subscriberAlert).toBeDefined();
        expect(subscriberAlert?.currentProgress).toBe(95);
        expect(subscriberAlert?.urgency).toBe('high');
      });

      it('debe generar alerta con urgency LOW cuando suscriptores >= 700 (70%) pero < 800', () => {
        const metrics = createMetrics({
          channelSubscribers: 750,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const subscriberAlert = alerts.find(a => a.channelKey === 'channel1' && a.message.includes('suscriptores'));
        expect(subscriberAlert).toBeDefined();
        expect(subscriberAlert?.triggered).toBe(false);
        expect(subscriberAlert?.alertType).toBe(null);
        expect(subscriberAlert?.urgency).toBe('low');
      });

      it('NO debe generar alerta de suscriptores cuando < 70%', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const subscriberAlert = alerts.find(a => a.message.includes('suscriptores'));
        expect(subscriberAlert).toBeUndefined();
      });
    });

    describe('Alertas de watch hours', () => {
      it('debe generar alerta cuando watch hours >= 3200 (80% de 4000)', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 3200,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const watchHoursAlert = alerts.find(a => a.alertType === 'watchhours_80');
        expect(watchHoursAlert).toBeDefined();
        expect(watchHoursAlert?.triggered).toBe(true);
        expect(watchHoursAlert?.currentProgress).toBe(80);
        expect(watchHoursAlert?.urgency).toBe('medium');
      });

      it('debe generar alerta con urgency HIGH cuando watch hours >= 3600 (90%)', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 3800,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const watchHoursAlert = alerts.find(a => a.alertType === 'watchhours_80');
        expect(watchHoursAlert).toBeDefined();
        expect(watchHoursAlert?.currentProgress).toBe(95);
        expect(watchHoursAlert?.urgency).toBe('high');
      });

      it('debe generar alerta con urgency LOW cuando watch hours >= 2800 (70%) pero < 3200', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 3000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const watchHoursAlert = alerts.find(a => a.message.includes('watch time'));
        expect(watchHoursAlert).toBeDefined();
        expect(watchHoursAlert?.triggered).toBe(false);
        expect(watchHoursAlert?.alertType).toBe(null);
        expect(watchHoursAlert?.urgency).toBe('low');
      });

      it('NO debe generar alerta de watch hours cuando < 70%', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const watchHoursAlert = alerts.find(a => a.message.includes('watch time'));
        expect(watchHoursAlert).toBeUndefined();
      });
    });

    describe('Alertas de Shorts views', () => {
      it('debe generar alerta cuando Shorts views >= 8M (80% de 10M)', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
          shortsViewsLast90Days: 8_000_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const shortsAlert = alerts.find(a => a.alertType === 'shorts_views_80');
        expect(shortsAlert).toBeDefined();
        expect(shortsAlert?.triggered).toBe(true);
        expect(shortsAlert?.currentProgress).toBe(80);
        expect(shortsAlert?.urgency).toBe('medium');
      });

      it('debe generar alerta con urgency HIGH cuando Shorts views >= 9M (90%)', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
          shortsViewsLast90Days: 9_500_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const shortsAlert = alerts.find(a => a.alertType === 'shorts_views_80');
        expect(shortsAlert).toBeDefined();
        expect(shortsAlert?.currentProgress).toBe(95);
        expect(shortsAlert?.urgency).toBe('high');
      });

      it('debe generar alerta con urgency LOW cuando Shorts views >= 7M (70%) pero < 8M', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
          shortsViewsLast90Days: 7_500_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const shortsAlert = alerts.find(a => a.message.includes('Shorts'));
        expect(shortsAlert).toBeDefined();
        expect(shortsAlert?.triggered).toBe(false);
        expect(shortsAlert?.alertType).toBe(null);
        expect(shortsAlert?.urgency).toBe('low');
      });

      it('NO debe generar alerta de Shorts cuando < 70%', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
          shortsViewsLast90Days: 5_000_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const shortsAlert = alerts.find(a => a.message.includes('Shorts'));
        expect(shortsAlert).toBeUndefined();
      });

      it('NO debe generar alerta de Shorts cuando shortsViewsLast90Days es undefined', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const shortsAlert = alerts.find(a => a.message.includes('Shorts'));
        expect(shortsAlert).toBeUndefined();
      });
    });

    describe('Alerta de monetización inminente', () => {
      it('debe generar alerta monetization_imminent cuando vía tradicional >= 90%', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 3800,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const imminentAlert = alerts.find(a => a.alertType === 'monetization_imminent');
        expect(imminentAlert).toBeDefined();
        expect(imminentAlert?.triggered).toBe(true);
        expect(imminentAlert?.urgency).toBe('high');
        expect(imminentAlert?.message).toContain('MONETIZACIÓN INMINENTE');
        expect(imminentAlert?.message).toContain('vía tradicional');
      });

      it('debe generar alerta monetization_imminent cuando vía Shorts >= 90%', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 1000,
          shortsViewsLast90Days: 9_500_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const imminentAlert = alerts.find(a => a.alertType === 'monetization_imminent');
        expect(imminentAlert).toBeDefined();
        expect(imminentAlert?.triggered).toBe(true);
        expect(imminentAlert?.urgency).toBe('high');
        expect(imminentAlert?.message).toContain('MONETIZACIÓN INMINENTE');
        expect(imminentAlert?.message).toContain('vía Shorts');
      });

      it('NO debe generar alerta monetization_imminent si solo suscriptores >= 90%', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 2000,
          shortsViewsLast90Days: 5_000_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const imminentAlert = alerts.find(a => a.alertType === 'monetization_imminent');
        expect(imminentAlert).toBeUndefined();
      });
    });

    describe('Múltiples alertas simultáneas', () => {
      it('debe generar múltiples alertas cuando varias métricas están cerca del objetivo', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 3500,
          shortsViewsLast90Days: 8_500_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        expect(alerts.length).toBeGreaterThanOrEqual(3);
        expect(alerts.some(a => a.alertType === 'subscribers_80')).toBe(true);
        expect(alerts.some(a => a.alertType === 'watchhours_80')).toBe(true);
        expect(alerts.some(a => a.alertType === 'shorts_views_80')).toBe(true);
      });

      it('debe incluir alerta monetization_imminent junto con otras cuando cumple criterios', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 3800,
          shortsViewsLast90Days: 9_500_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        expect(alerts.some(a => a.alertType === 'subscribers_80')).toBe(true);
        expect(alerts.some(a => a.alertType === 'watchhours_80')).toBe(true);
        expect(alerts.some(a => a.alertType === 'shorts_views_80')).toBe(true);
        expect(alerts.some(a => a.alertType === 'monetization_imminent')).toBe(true);
      });
    });

    describe('Identificación de canal', () => {
      it('debe incluir channelKey correcto para channel1', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        alerts.forEach(alert => {
          expect(alert.channelKey).toBe('channel1');
        });
      });

      it('debe incluir channelKey correcto para channel2', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel2', metrics);

        alerts.forEach(alert => {
          expect(alert.channelKey).toBe('channel2');
        });
      });

      it('debe incluir nombre de canal correcto en mensaje para channel1', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        expect(alerts.some(a => a.message.includes('NeuroSync AI'))).toBe(true);
      });

      it('debe incluir nombre de canal correcto en mensaje para channel2', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel2', metrics);

        expect(alerts.some(a => a.message.includes('NeuroTech AI'))).toBe(true);
      });
    });

    describe('Estructura de ProgressAlert', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);
        const alert = alerts[0];

        expect(alert).toHaveProperty('triggered');
        expect(alert).toHaveProperty('alertType');
        expect(alert).toHaveProperty('channelKey');
        expect(alert).toHaveProperty('currentProgress');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('urgency');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);
        const alert = alerts[0];

        expect(typeof alert.triggered).toBe('boolean');
        expect(alert.alertType === null || typeof alert.alertType === 'string').toBe(true);
        expect(typeof alert.channelKey).toBe('string');
        expect(typeof alert.currentProgress).toBe('number');
        expect(typeof alert.message).toBe('string');
        expect(['low', 'medium', 'high']).toContain(alert.urgency);
      });
    });

    describe('Casos límite', () => {
      it('debe retornar array vacío cuando ninguna métrica alcanza 70%', () => {
        const metrics = createMetrics({
          channelSubscribers: 500,
          totalWatchHours: 2000,
          shortsViewsLast90Days: 5_000_000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        expect(alerts).toHaveLength(0);
      });

      it('debe manejar métricas en 0', () => {
        const metrics = createMetrics({
          channelSubscribers: 0,
          totalWatchHours: 0,
          shortsViewsLast90Days: 0,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        expect(alerts).toHaveLength(0);
      });

      it('debe manejar métricas que exceden el 100%', () => {
        const metrics = createMetrics({
          channelSubscribers: 1500,
          totalWatchHours: 5000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const subscriberAlert = alerts.find(a => a.message.includes('suscriptores'));
        const watchHoursAlert = alerts.find(a => a.message.includes('watch time'));
        
        expect(subscriberAlert?.currentProgress).toBe(150);
        expect(watchHoursAlert?.currentProgress).toBe(125);
      });

      it('debe redondear currentProgress a 2 decimales', () => {
        const metrics = createMetrics({
          channelSubscribers: 777,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const alert = alerts.find(a => a.message.includes('suscriptores'));
        expect(alert?.currentProgress).toBe(77.7); // 777/1000 * 100 = 77.7
      });
    });

    describe('Emojis según urgencia', () => {
      it('debe incluir emoji 🔥 para urgency HIGH', () => {
        const metrics = createMetrics({
          channelSubscribers: 950,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const highAlert = alerts.find(a => a.urgency === 'high');
        expect(highAlert?.message).toContain('🔥');
      });

      it('debe incluir emoji 📈 para urgency MEDIUM', () => {
        const metrics = createMetrics({
          channelSubscribers: 850,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const mediumAlert = alerts.find(a => a.urgency === 'medium');
        expect(mediumAlert?.message).toContain('📈');
      });

      it('debe incluir emoji 📊 para urgency LOW', () => {
        const metrics = createMetrics({
          channelSubscribers: 750,
          totalWatchHours: 1000,
        });

        const alerts = gate.checkProgressAlerts('channel1', metrics);

        const lowAlert = alerts.find(a => a.urgency === 'low');
        expect(lowAlert?.message).toContain('📊');
      });
    });
  });

  describe('generateProgressReport', () => {
    // Helpers para crear datos de prueba
    const createPerformanceMetrics = (overrides: Partial<ContentPerformanceMetrics> = {}): ContentPerformanceMetrics => ({
      averageRetentionRate: 50,
      averageCTR: 4,
      averageWatchTimePercent: 40,
      ...overrides,
    });

    const createWeeklyStats = (overrides: Partial<{ 
      channel1: { videosPublished: number; viewsGained: number; subscribersGained: number };
      channel2: { videosPublished: number; viewsGained: number; subscribersGained: number };
    }> = {}) => ({
      channel1: { videosPublished: 5, viewsGained: 1200, subscribersGained: 35, ...overrides.channel1 },
      channel2: { videosPublished: 4, viewsGained: 800, subscribersGained: 20, ...overrides.channel2 },
    });

    describe('Estructura del reporte', () => {
      it('debe retornar todas las propiedades requeridas de WeeklyProgressReport', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report).toHaveProperty('generatedAt');
        expect(report).toHaveProperty('channel1');
        expect(report).toHaveProperty('channel2');
        expect(report).toHaveProperty('overallProgress');
        expect(report).toHaveProperty('nextMilestone');
        expect(report).toHaveProperty('telegramMessage');
      });

      it('debe retornar fecha de generación como Date válida', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const beforeGeneration = new Date();
        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );
        const afterGeneration = new Date();

        expect(report.generatedAt).toBeInstanceOf(Date);
        expect(report.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeGeneration.getTime());
        expect(report.generatedAt.getTime()).toBeLessThanOrEqual(afterGeneration.getTime());
      });

      it('debe incluir información de progreso YPP en cada canal', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.channel1.yppProgress).toBeDefined();
        expect(report.channel1.yppProgress.subscribersProgress).toBe(50);
        expect(report.channel1.yppProgress.watchHoursProgress).toBe(50);
        expect(report.channel2.yppProgress).toBeDefined();
        expect(report.channel2.yppProgress.subscribersProgress).toBe(30);
        expect(report.channel2.yppProgress.watchHoursProgress).toBe(25);
      });

      it('debe incluir estadísticas semanales en cada canal', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats({
          channel1: { videosPublished: 7, viewsGained: 2500, subscribersGained: 50 },
          channel2: { videosPublished: 3, viewsGained: 600, subscribersGained: 15 },
        });

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.channel1.weeklyStats.videosPublished).toBe(7);
        expect(report.channel1.weeklyStats.viewsGained).toBe(2500);
        expect(report.channel1.weeklyStats.subscribersGained).toBe(50);
        expect(report.channel2.weeklyStats.videosPublished).toBe(3);
        expect(report.channel2.weeklyStats.viewsGained).toBe(600);
        expect(report.channel2.weeklyStats.subscribersGained).toBe(15);
      });
    });

    describe('Nombres de canales', () => {
      it('debe asignar "NeuroSync AI" al canal 1', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.channel1.name).toBe('NeuroSync AI');
      });

      it('debe asignar "NeuroTech AI" al canal 2', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.channel2.name).toBe('NeuroTech AI');
      });
    });

    describe('Cálculo de overallProgress', () => {
      it('debe calcular progreso general basado en el mejor canal', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 800, totalWatchHours: 3200 }); // 80% ambos
        const channel2Metrics = createMetrics({ channelSubscribers: 400, totalWatchHours: 1600 }); // 40% ambos
        const channel1Performance = createPerformanceMetrics(); // 100% calidad (cumple umbrales)
        const channel2Performance = createPerformanceMetrics({ averageRetentionRate: 25, averageCTR: 2, averageWatchTimePercent: 20 }); // 50% calidad
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        // Canal 1 YPP: (80*0.5 + 80*0.5) = 80%
        // Mejor calidad: 100%
        // Overall: 80*0.8 + 100*0.2 = 64 + 20 = 84%
        expect(report.overallProgress).toBe(84);
      });

      it('debe limitar progreso YPP a 100% máximo', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 2000, totalWatchHours: 8000 }); // 200% ambos
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        // YPP limitado a 100%, calidad 100%
        // Overall: 100*0.8 + 100*0.2 = 100%
        expect(report.overallProgress).toBe(100);
      });

      it('debe retornar 0 cuando todas las métricas son 0', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 0, totalWatchHours: 0 });
        const channel2Metrics = createMetrics({ channelSubscribers: 0, totalWatchHours: 0 });
        const channel1Performance = createPerformanceMetrics({ averageRetentionRate: 0, averageCTR: 0, averageWatchTimePercent: 0 });
        const channel2Performance = createPerformanceMetrics({ averageRetentionRate: 0, averageCTR: 0, averageWatchTimePercent: 0 });
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.overallProgress).toBe(0);
      });
    });

    describe('Determinación de nextMilestone', () => {
      it('debe indicar aplicar a monetización cuando ambos canales son elegibles YPP y tienen calidad', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 1500, totalWatchHours: 5000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 1200, totalWatchHours: 4500 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.nextMilestone).toContain('¡Ambos canales cumplen requisitos YPP!');
        expect(report.nextMilestone).toContain('Aplicar al programa de monetización');
      });

      it('debe indicar mejorar calidad cuando ambos canales son elegibles YPP pero sin calidad', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 1500, totalWatchHours: 5000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 1200, totalWatchHours: 4500 });
        const channel1Performance = createPerformanceMetrics({ averageRetentionRate: 30, averageCTR: 2, averageWatchTimePercent: 20 });
        const channel2Performance = createPerformanceMetrics({ averageRetentionRate: 25, averageCTR: 1.5, averageWatchTimePercent: 15 });
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.nextMilestone).toContain('Mejorar métricas de calidad');
      });

      it('debe enfocarse en canal 2 cuando canal 1 es elegible', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 1500, totalWatchHours: 5000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.nextMilestone).toContain('Canal 1 listo para YPP');
        expect(report.nextMilestone).toContain('Enfocarse en Canal 2');
      });

      it('debe priorizar canal con más progreso cuando ninguno es elegible', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 700, totalWatchHours: 3000 }); // Más avanzado
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.nextMilestone).toContain('Prioridad Canal 1 (NeuroSync AI)');
      });
    });

    describe('Formato de telegramMessage', () => {
      it('debe incluir título del reporte semanal', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('Reporte Semanal de Progreso YPP');
      });

      it('debe incluir barra de progreso visual', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toMatch(/\[([█░]+)\]/);
      });

      it('debe incluir nombres de ambos canales', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('NeuroSync AI');
        expect(report.telegramMessage).toContain('NeuroTech AI');
      });

      it('debe incluir iconos de estado YPP (⏳ o ✅)', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 1500, totalWatchHours: 5000 }); // Elegible
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 }); // No elegible
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('✅');
        expect(report.telegramMessage).toContain('⏳');
      });

      it('debe incluir resumen de totales semanales', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats({
          channel1: { videosPublished: 5, viewsGained: 1200, subscribersGained: 35 },
          channel2: { videosPublished: 4, viewsGained: 800, subscribersGained: 20 },
        });

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('Resumen Semanal Total');
        expect(report.telegramMessage).toContain('Videos publicados: 9');
        expect(report.telegramMessage).toContain('Suscriptores ganados: 55');
      });

      it('debe incluir el siguiente objetivo', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('Siguiente Objetivo');
        expect(report.telegramMessage).toContain(report.nextMilestone);
      });

      it('debe incluir la frase motivacional', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('Autism is not a system error');
      });

      it('debe usar formato HTML válido para Telegram', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        // Verificar etiquetas HTML válidas para Telegram
        expect(report.telegramMessage).toContain('<b>');
        expect(report.telegramMessage).toContain('</b>');
        expect(report.telegramMessage).toContain('<i>');
        expect(report.telegramMessage).toContain('</i>');
      });
    });

    describe('Barra de progreso visual', () => {
      it('debe generar barra de 10 bloques total', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        const barMatch = report.telegramMessage.match(/\[([█░]+)\]/);
        expect(barMatch).not.toBeNull();
        expect(barMatch![1].length).toBe(10);
      });

      it('debe mostrar barra vacía para 0% de progreso', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 0, totalWatchHours: 0 });
        const channel2Metrics = createMetrics({ channelSubscribers: 0, totalWatchHours: 0 });
        const channel1Performance = createPerformanceMetrics({ averageRetentionRate: 0, averageCTR: 0, averageWatchTimePercent: 0 });
        const channel2Performance = createPerformanceMetrics({ averageRetentionRate: 0, averageCTR: 0, averageWatchTimePercent: 0 });
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('[░░░░░░░░░░]');
      });

      it('debe mostrar barra llena para 100% de progreso', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 2000, totalWatchHours: 8000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 1500, totalWatchHours: 6000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats();

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.telegramMessage).toContain('[██████████]');
      });
    });

    describe('Casos límite', () => {
      it('debe manejar estadísticas semanales en 0', () => {
        const channel1Metrics = createMetrics({ channelSubscribers: 500, totalWatchHours: 2000 });
        const channel2Metrics = createMetrics({ channelSubscribers: 300, totalWatchHours: 1000 });
        const channel1Performance = createPerformanceMetrics();
        const channel2Performance = createPerformanceMetrics();
        const weeklyStats = createWeeklyStats({
          channel1: { videosPublished: 0, viewsGained: 0, subscribersGained: 0 },
          channel2: { videosPublished: 0, viewsGained: 0, subscribersGained: 0 },
        });

        const report = gate.generateProgressReport(
          channel1Metrics,
          channel2Metrics,
          channel1Performance,
          channel2Performance,
          weeklyStats
        );

        expect(report.channel1.weeklyStats.videosPublished).toBe(0);
        expect(report.telegramMessage).toContain('Videos publicados: 0');
      });
    });
  });

  describe('requestOverride', () => {
    /**
     * Tests para el método requestOverride (PASO 1 de doble confirmación)
     * @requirement REQ-5.4.8
     */

    describe('Validación de acción', () => {
      it('debe aceptar acción válida: create_channel_3', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Prueba de concepto');
        expect(result.success).toBe(true);
        expect(result.action).toBe('create_channel_3');
      });

      it('debe aceptar acción válida: expand_instagram', () => {
        const result = gate.requestOverride('expand_instagram', 'admin_001', 'Prueba de concepto');
        expect(result.success).toBe(true);
        expect(result.action).toBe('expand_instagram');
      });

      it('debe aceptar acción válida: expand_tiktok', () => {
        const result = gate.requestOverride('expand_tiktok', 'admin_001', 'Prueba de concepto');
        expect(result.success).toBe(true);
        expect(result.action).toBe('expand_tiktok');
      });

      it('debe aceptar acción válida: skip_quality_check', () => {
        const result = gate.requestOverride('skip_quality_check', 'admin_001', 'Prueba de concepto');
        expect(result.success).toBe(true);
        expect(result.action).toBe('skip_quality_check');
      });

      it('debe rechazar acción inválida', () => {
        const result = gate.requestOverride('accion_invalida' as OverrideAction, 'admin_001', 'Razón');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Acción de override inválida');
        expect(result.logEntry.failureReason).toContain('Acción inválida');
      });
    });

    describe('Validación de userId', () => {
      it('debe rechazar userId vacío', () => {
        const result = gate.requestOverride('create_channel_3', '', 'Razón válida');
        expect(result.success).toBe(false);
        expect(result.message).toContain('userId válido');
        expect(result.logEntry.eventType).toBe('request');
        expect(result.logEntry.confirmed).toBe(false);
      });

      it('debe rechazar userId con solo espacios', () => {
        const result = gate.requestOverride('create_channel_3', '   ', 'Razón válida');
        expect(result.success).toBe(false);
        expect(result.message).toContain('userId válido');
      });

      it('debe aceptar userId válido', () => {
        const result = gate.requestOverride('create_channel_3', 'user_123', 'Razón válida');
        expect(result.success).toBe(true);
        expect(result.logEntry.userId).toBe('user_123');
      });
    });

    describe('Validación de razón', () => {
      it('debe rechazar razón vacía', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', '');
        expect(result.success).toBe(false);
        expect(result.message).toContain('razón válida');
        expect(result.logEntry.eventType).toBe('request');
        expect(result.logEntry.confirmed).toBe(false);
      });

      it('debe rechazar razón con solo espacios', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', '    ');
        expect(result.success).toBe(false);
        expect(result.message).toContain('razón válida');
      });

      it('debe aceptar razón válida', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón de prueba');
        expect(result.success).toBe(true);
        expect(result.logEntry.reason).toBe('Razón de prueba');
      });

      it('debe recortar espacios de la razón', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', '  Razón con espacios  ');
        expect(result.success).toBe(true);
        expect(result.logEntry.reason).toBe('Razón con espacios');
      });
    });

    describe('Generación de código de confirmación', () => {
      it('debe generar código de 6 dígitos', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        expect(result.confirmationCode).toMatch(/^\d{6}$/);
      });

      it('debe requerir segunda confirmación', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        expect(result.requiresSecondConfirmation).toBe(true);
      });

      it('debe incluir código en el mensaje', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        expect(result.message).toContain(result.confirmationCode);
      });

      it('debe indicar tiempo de expiración en el mensaje', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        expect(result.message).toContain('5 minutos');
      });
    });

    describe('Registro en log', () => {
      it('debe registrar intento exitoso en el log', () => {
        const result = gate.requestOverride('create_channel_3', 'admin_001', 'Razón de prueba');
        
        expect(result.logEntry.action).toBe('create_channel_3');
        expect(result.logEntry.userId).toBe('admin_001');
        expect(result.logEntry.reason).toBe('Razón de prueba');
        expect(result.logEntry.eventType).toBe('request');
        expect(result.logEntry.confirmed).toBe(false);
        expect(result.logEntry.timestamp).toBeInstanceOf(Date);
      });

      it('debe registrar intento fallido en el log', () => {
        const result = gate.requestOverride('create_channel_3', '', 'Razón');
        
        expect(result.logEntry.eventType).toBe('request');
        expect(result.logEntry.confirmed).toBe(false);
        expect(result.logEntry.failureReason).toBeTruthy();
      });

      it('debe añadir entrada al historial de logs', () => {
        gate.requestOverride('create_channel_3', 'admin_001', 'Razón 1');
        gate.requestOverride('expand_instagram', 'admin_002', 'Razón 2');
        
        const logs = gate.getOverrideLogs();
        expect(logs.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('confirmOverride', () => {
    /**
     * Tests para el método confirmOverride (PASO 2 de doble confirmación)
     * @requirement REQ-5.4.8
     */

    describe('Código de confirmación inexistente', () => {
      it('debe rechazar código que no existe', () => {
        const result = gate.confirmOverride('create_channel_3', '999999', 'admin_001');
        expect(result.success).toBe(false);
        expect(result.message).toContain('no encontrado');
        expect(result.logEntry.eventType).toBe('confirm_failed');
      });

      it('debe rechazar código vacío', () => {
        const result = gate.confirmOverride('create_channel_3', '', 'admin_001');
        expect(result.success).toBe(false);
        expect(result.message).toContain('no encontrado');
      });
    });

    describe('Verificación de userId', () => {
      it('debe rechazar cuando userId no coincide', () => {
        // Paso 1: Solicitar con usuario original
        const request = gate.requestOverride('create_channel_3', 'user_original', 'Razón');
        
        // Paso 2: Intentar confirmar con otro usuario
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'user_diferente');
        
        expect(confirm.success).toBe(false);
        expect(confirm.message).toContain('no coincide');
        expect(confirm.logEntry.eventType).toBe('confirm_failed');
        expect(confirm.logEntry.failureReason).toContain('userId no coincide');
      });

      it('debe aceptar cuando userId coincide exactamente', () => {
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(true);
      });
    });

    describe('Verificación de acción', () => {
      it('debe rechazar cuando la acción no coincide', () => {
        // Solicitar override para crear canal
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        
        // Intentar confirmar con acción diferente
        const confirm = gate.confirmOverride('expand_instagram', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(false);
        expect(confirm.message).toContain('no coincide');
        expect(confirm.logEntry.eventType).toBe('confirm_failed');
      });

      it('debe aceptar cuando la acción coincide exactamente', () => {
        const request = gate.requestOverride('expand_tiktok', 'admin_001', 'Razón');
        const confirm = gate.confirmOverride('expand_tiktok', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(true);
        expect(confirm.action).toBe('expand_tiktok');
      });
    });

    describe('Confirmación exitosa', () => {
      it('debe confirmar correctamente con datos válidos', () => {
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Prueba de concepto');
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(true);
        expect(confirm.requiresSecondConfirmation).toBe(false);
        expect(confirm.logEntry.eventType).toBe('confirm_success');
        expect(confirm.logEntry.confirmed).toBe(true);
      });

      it('debe incluir razón original en la confirmación', () => {
        const razón = 'Motivo específico para override';
        const request = gate.requestOverride('create_channel_3', 'admin_001', razón);
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        
        expect(confirm.message).toContain(razón);
        expect(confirm.logEntry.reason).toBe(razón);
      });

      it('debe invalidar el código después de usarlo', () => {
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        
        // Primera confirmación exitosa
        const confirm1 = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        expect(confirm1.success).toBe(true);
        
        // Segunda confirmación con el mismo código debe fallar
        const confirm2 = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        expect(confirm2.success).toBe(false);
        expect(confirm2.message).toContain('no encontrado');
      });
    });

    describe('Registro en log de confirmación', () => {
      it('debe registrar confirmación exitosa en el log', () => {
        const request = gate.requestOverride('skip_quality_check', 'admin_001', 'Razón de prueba');
        const confirm = gate.confirmOverride('skip_quality_check', request.confirmationCode, 'admin_001');
        
        expect(confirm.logEntry.action).toBe('skip_quality_check');
        expect(confirm.logEntry.userId).toBe('admin_001');
        expect(confirm.logEntry.confirmed).toBe(true);
        expect(confirm.logEntry.eventType).toBe('confirm_success');
        expect(confirm.logEntry.timestamp).toBeInstanceOf(Date);
      });

      it('debe registrar confirmación fallida en el log', () => {
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón');
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'otro_usuario');
        
        expect(confirm.logEntry.confirmed).toBe(false);
        expect(confirm.logEntry.eventType).toBe('confirm_failed');
        expect(confirm.logEntry.failureReason).toBeTruthy();
      });
    });

    describe('Expiración del código de confirmación', () => {
      /**
       * Tests para validar que el código de confirmación expira después del tiempo establecido.
       * El tiempo de expiración es de 5 minutos según la implementación.
       * @requirement REQ-5.4.8
       */

      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('debe rechazar código después de que expire (5 minutos)', () => {
        // Solicitar override
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón de prueba');
        expect(request.success).toBe(true);
        
        // Avanzar el tiempo 5 minutos y 1 segundo (expirado)
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
        
        // Intentar confirmar después de expirado
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(false);
        expect(confirm.message).toContain('expirado');
        expect(confirm.logEntry.eventType).toBe('confirm_failed');
        expect(confirm.logEntry.failureReason).toContain('expirado');
      });

      it('debe aceptar código antes de que expire (dentro de 5 minutos)', () => {
        // Solicitar override
        const request = gate.requestOverride('create_channel_3', 'admin_001', 'Razón de prueba');
        expect(request.success).toBe(true);
        
        // Avanzar el tiempo 4 minutos y 59 segundos (justo antes de expirar)
        vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
        
        // Confirmar justo antes de expirar
        const confirm = gate.confirmOverride('create_channel_3', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(true);
        expect(confirm.logEntry.eventType).toBe('confirm_success');
      });

      it('debe generar log de expiración con hora exacta de expiración', () => {
        const request = gate.requestOverride('expand_instagram', 'admin_001', 'Prueba expiración');
        
        // Avanzar 6 minutos para asegurar expiración
        vi.advanceTimersByTime(6 * 60 * 1000);
        
        const confirm = gate.confirmOverride('expand_instagram', request.confirmationCode, 'admin_001');
        
        expect(confirm.success).toBe(false);
        expect(confirm.logEntry.failureReason).toContain('Código expirado');
        expect(confirm.message).toContain('expiró');
      });

      it('debe indicar tiempo de expiración en requestOverride', () => {
        const request = gate.requestOverride('skip_quality_check', 'admin_001', 'Test');
        
        // El mensaje debe indicar que el código expira en 5 minutos
        expect(request.message).toContain('5 minutos');
      });

      it('debe limpiar overrides expirados al llamar getPendingOverridesCount', () => {
        // Crear varios overrides
        gate.requestOverride('create_channel_3', 'user1', 'Razón 1');
        gate.requestOverride('expand_instagram', 'user2', 'Razón 2');
        
        expect(gate.getPendingOverridesCount()).toBe(2);
        
        // Avanzar tiempo para que expiren
        vi.advanceTimersByTime(6 * 60 * 1000);
        
        // Al consultar el conteo, debe limpiar los expirados
        expect(gate.getPendingOverridesCount()).toBe(0);
      });
    });
  });

  describe('Flujo completo de override con doble confirmación', () => {
    /**
     * Tests de integración para el flujo completo de doble confirmación
     * @requirement REQ-5.4.8
     */

    it('debe completar flujo exitoso de override para crear canal', () => {
      // Paso 1: Solicitar override
      const request = gate.requestOverride(
        'create_channel_3',
        'admin_principal',
        'Canal de prueba para validar concepto'
      );
      
      expect(request.success).toBe(true);
      expect(request.requiresSecondConfirmation).toBe(true);
      const code = request.confirmationCode;
      
      // Paso 2: Confirmar con el mismo usuario
      const confirm = gate.confirmOverride('create_channel_3', code, 'admin_principal');
      
      expect(confirm.success).toBe(true);
      expect(confirm.requiresSecondConfirmation).toBe(false);
      expect(confirm.message).toContain('✅');
    });

    it('debe completar flujo exitoso de override para expandir a Instagram', () => {
      const request = gate.requestOverride('expand_instagram', 'marketing_lead', 'Campaña de prueba');
      const confirm = gate.confirmOverride('expand_instagram', request.confirmationCode, 'marketing_lead');
      
      expect(confirm.success).toBe(true);
      expect(confirm.logEntry.action).toBe('expand_instagram');
    });

    it('debe completar flujo exitoso de override para expandir a TikTok', () => {
      const request = gate.requestOverride('expand_tiktok', 'social_manager', 'Tendencia viral detectada');
      const confirm = gate.confirmOverride('expand_tiktok', request.confirmationCode, 'social_manager');
      
      expect(confirm.success).toBe(true);
      expect(confirm.logEntry.action).toBe('expand_tiktok');
    });

    it('debe completar flujo exitoso de override para omitir calidad', () => {
      const request = gate.requestOverride('skip_quality_check', 'qa_lead', 'Test urgente');
      const confirm = gate.confirmOverride('skip_quality_check', request.confirmationCode, 'qa_lead');
      
      expect(confirm.success).toBe(true);
      expect(confirm.logEntry.action).toBe('skip_quality_check');
    });

    it('debe mantener historial completo de todas las operaciones', () => {
      // Ejecutar varios overrides
      const req1 = gate.requestOverride('create_channel_3', 'user1', 'Razón 1');
      gate.confirmOverride('create_channel_3', req1.confirmationCode, 'user1');
      
      const req2 = gate.requestOverride('expand_instagram', 'user2', 'Razón 2');
      gate.confirmOverride('expand_instagram', req2.confirmationCode, 'wrong_user'); // Fallido
      gate.confirmOverride('expand_instagram', req2.confirmationCode, 'user2'); // Exitoso
      
      const logs = gate.getOverrideLogs();
      
      // Debe haber: 2 requests + 1 confirm exitoso + 1 confirm fallido + 1 confirm exitoso = 5
      expect(logs.length).toBeGreaterThanOrEqual(5);
      
      // Verificar que hay logs de diferentes tipos
      const requestLogs = logs.filter(l => l.eventType === 'request');
      const confirmSuccessLogs = logs.filter(l => l.eventType === 'confirm_success');
      const confirmFailedLogs = logs.filter(l => l.eventType === 'confirm_failed');
      
      expect(requestLogs.length).toBeGreaterThanOrEqual(2);
      expect(confirmSuccessLogs.length).toBeGreaterThanOrEqual(2);
      expect(confirmFailedLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getOverrideLogs', () => {
    it('debe retornar array vacío cuando no hay logs', () => {
      const freshGate = new YPPValidationGate();
      const logs = freshGate.getOverrideLogs();
      expect(logs).toEqual([]);
    });

    it('debe retornar copia del array (no referencia)', () => {
      gate.requestOverride('create_channel_3', 'admin', 'Razón');
      const logs1 = gate.getOverrideLogs();
      const logs2 = gate.getOverrideLogs();
      
      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });

    it('debe incluir todos los logs en orden cronológico', () => {
      gate.requestOverride('create_channel_3', 'user1', 'Primera');
      gate.requestOverride('expand_instagram', 'user2', 'Segunda');
      
      const logs = gate.getOverrideLogs();
      
      expect(logs[0].reason).toBe('Primera');
      expect(logs[1].reason).toBe('Segunda');
      expect(logs[0].timestamp.getTime()).toBeLessThanOrEqual(logs[1].timestamp.getTime());
    });
  });

  describe('getPendingOverridesCount', () => {
    it('debe retornar 0 cuando no hay overrides pendientes', () => {
      const freshGate = new YPPValidationGate();
      expect(freshGate.getPendingOverridesCount()).toBe(0);
    });

    it('debe incrementar al solicitar override', () => {
      const freshGate = new YPPValidationGate();
      freshGate.requestOverride('create_channel_3', 'admin', 'Razón');
      expect(freshGate.getPendingOverridesCount()).toBe(1);
      
      freshGate.requestOverride('expand_instagram', 'admin', 'Otra razón');
      expect(freshGate.getPendingOverridesCount()).toBe(2);
    });

    it('debe decrementar al confirmar override', () => {
      const freshGate = new YPPValidationGate();
      const req = freshGate.requestOverride('create_channel_3', 'admin', 'Razón');
      expect(freshGate.getPendingOverridesCount()).toBe(1);
      
      freshGate.confirmOverride('create_channel_3', req.confirmationCode, 'admin');
      expect(freshGate.getPendingOverridesCount()).toBe(0);
    });
  });

  describe('fetchYouTubeAnalytics', () => {
    /**
     * Tests para el método fetchYouTubeAnalytics
     * @requirement REQ-5.4.9: Integrar YouTube Analytics API para métricas en tiempo real
     */

    describe('Estructura de datos de retorno', () => {
      it('debe retornar estructura YouTubeAnalyticsData válida', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data).toHaveProperty('channelId');
        expect(data).toHaveProperty('fetchedAt');
        expect(data).toHaveProperty('metrics');
        expect(data).toHaveProperty('performance');
      });

      it('debe incluir datos crudos de API en rawData (opcional para debug)', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data.rawData).toBeDefined();
        expect(typeof data.rawData).toBe('object');
      });

      it('debe retornar fetchedAt como Date válida', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data.fetchedAt).toBeInstanceOf(Date);
        // La fecha debe ser reciente (dentro de los últimos 5 segundos)
        const now = new Date();
        const fiveSecondsAgo = new Date(now.getTime() - 5000);
        expect(data.fetchedAt.getTime()).toBeGreaterThanOrEqual(fiveSecondsAgo.getTime());
      });
    });

    describe('Métricas YPP (metrics)', () => {
      it('debe retornar métricas YPP con todas las propiedades requeridas', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data.metrics).toHaveProperty('channelSubscribers');
        expect(data.metrics).toHaveProperty('totalWatchHours');
        expect(data.metrics).toHaveProperty('videoCount');
        expect(data.metrics).toHaveProperty('isMonetizationEligible');
        expect(data.metrics).toHaveProperty('lastCheck');
        expect(data.metrics).toHaveProperty('shortsViewsLast90Days');
      });

      it('debe retornar valores numéricos válidos para métricas', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(typeof data.metrics.channelSubscribers).toBe('number');
        expect(data.metrics.channelSubscribers).toBeGreaterThanOrEqual(0);
        
        expect(typeof data.metrics.totalWatchHours).toBe('number');
        expect(data.metrics.totalWatchHours).toBeGreaterThanOrEqual(0);
        
        expect(typeof data.metrics.videoCount).toBe('number');
        expect(data.metrics.videoCount).toBeGreaterThanOrEqual(0);
      });

      it('debe retornar lastCheck como Date válida', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data.metrics.lastCheck).toBeInstanceOf(Date);
      });
    });

    describe('Métricas de rendimiento (performance)', () => {
      it('debe retornar métricas de rendimiento con todas las propiedades', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        expect(data.performance).toHaveProperty('averageRetentionRate');
        expect(data.performance).toHaveProperty('averageCTR');
        expect(data.performance).toHaveProperty('averageWatchTimePercent');
      });

      it('debe retornar valores de rendimiento en rangos realistas', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        // Retención: 0-100%
        expect(data.performance.averageRetentionRate).toBeGreaterThanOrEqual(0);
        expect(data.performance.averageRetentionRate).toBeLessThanOrEqual(100);
        
        // CTR: 0-20% (típicamente)
        expect(data.performance.averageCTR).toBeGreaterThanOrEqual(0);
        expect(data.performance.averageCTR).toBeLessThanOrEqual(20);
        
        // Watch Time %: 0-100%
        expect(data.performance.averageWatchTimePercent).toBeGreaterThanOrEqual(0);
        expect(data.performance.averageWatchTimePercent).toBeLessThanOrEqual(100);
      });
    });

    describe('Diferenciación por canal', () => {
      it('debe retornar datos diferentes para channel1 vs channel2', async () => {
        const data1 = await gate.fetchYouTubeAnalytics('channel1');
        // Invalidar caché para obtener datos frescos
        gate.invalidateAnalyticsCache('channel2');
        const data2 = await gate.fetchYouTubeAnalytics('channel2');
        
        expect(data1.channelId).not.toBe(data2.channelId);
      });

      it('channel1 (NeuroSync AI) debe tener más madurez que channel2', async () => {
        gate.invalidateAnalyticsCache();
        const data1 = await gate.fetchYouTubeAnalytics('channel1');
        const data2 = await gate.fetchYouTubeAnalytics('channel2');
        
        // Canal 1 debería tener más suscriptores en promedio
        // Debido a la variación aleatoria, verificamos que hay diferencia notable
        expect(Math.abs(data1.metrics.channelSubscribers - data2.metrics.channelSubscribers)).toBeGreaterThan(100);
      });
    });

    describe('Sistema de caché', () => {
      it('debe cachear resultados y retornar los mismos datos en llamadas consecutivas', async () => {
        // Primera llamada
        const data1 = await gate.fetchYouTubeAnalytics('channel1');
        
        // Segunda llamada (debería usar caché)
        const data2 = await gate.fetchYouTubeAnalytics('channel1');
        
        // Los datos deben ser idénticos
        expect(data1.fetchedAt.getTime()).toBe(data2.fetchedAt.getTime());
        expect(data1.metrics.channelSubscribers).toBe(data2.metrics.channelSubscribers);
      });

      it('hasValidAnalyticsCache debe retornar true después de fetch', async () => {
        // Antes del fetch, no hay caché
        const freshGate = new YPPValidationGate();
        expect(freshGate.hasValidAnalyticsCache('channel1')).toBe(false);
        
        // Después del fetch, hay caché
        await freshGate.fetchYouTubeAnalytics('channel1');
        expect(freshGate.hasValidAnalyticsCache('channel1')).toBe(true);
      });

      it('invalidateAnalyticsCache debe limpiar el caché de un canal específico', async () => {
        const freshGate = new YPPValidationGate();
        await freshGate.fetchYouTubeAnalytics('channel1');
        await freshGate.fetchYouTubeAnalytics('channel2');
        
        expect(freshGate.hasValidAnalyticsCache('channel1')).toBe(true);
        expect(freshGate.hasValidAnalyticsCache('channel2')).toBe(true);
        
        // Invalidar solo channel1
        freshGate.invalidateAnalyticsCache('channel1');
        
        expect(freshGate.hasValidAnalyticsCache('channel1')).toBe(false);
        expect(freshGate.hasValidAnalyticsCache('channel2')).toBe(true);
      });

      it('invalidateAnalyticsCache sin parámetro debe limpiar todo el caché', async () => {
        const freshGate = new YPPValidationGate();
        await freshGate.fetchYouTubeAnalytics('channel1');
        await freshGate.fetchYouTubeAnalytics('channel2');
        
        // Invalidar todo
        freshGate.invalidateAnalyticsCache();
        
        expect(freshGate.hasValidAnalyticsCache('channel1')).toBe(false);
        expect(freshGate.hasValidAnalyticsCache('channel2')).toBe(false);
      });

      it('debe obtener datos frescos después de invalidar caché', async () => {
        // Primera llamada
        const data1 = await gate.fetchYouTubeAnalytics('channel1');
        
        // Invalidar caché
        gate.invalidateAnalyticsCache('channel1');
        
        // Segunda llamada (debe obtener datos frescos)
        const data2 = await gate.fetchYouTubeAnalytics('channel1');
        
        // Los timestamps deben ser diferentes
        expect(data1.fetchedAt.getTime()).not.toBe(data2.fetchedAt.getTime());
      });
    });

    describe('Rango de fechas por defecto', () => {
      it('debe usar últimos 30 días como rango por defecto', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        // Verificar que rawData contiene dateRange
        const rawData = data.rawData as { dateRange?: { startDate: string; endDate: string } };
        expect(rawData.dateRange).toBeDefined();
        
        // Verificar que el rango es de aproximadamente 30 días
        const startDate = new Date(rawData.dateRange!.startDate);
        const endDate = new Date(rawData.dateRange!.endDate);
        const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        expect(daysDiff).toBeGreaterThanOrEqual(29);
        expect(daysDiff).toBeLessThanOrEqual(31);
      });
    });

    describe('Rango de fechas personalizado', () => {
      it('debe aceptar rango de fechas personalizado', async () => {
        gate.invalidateAnalyticsCache('channel1');
        
        const customStart = new Date('2024-01-01');
        const customEnd = new Date('2024-01-15');
        
        const data = await gate.fetchYouTubeAnalytics('channel1', {
          start: customStart,
          end: customEnd
        });
        
        const rawData = data.rawData as { dateRange?: { startDate: string; endDate: string } };
        expect(rawData.dateRange!.startDate).toBe('2024-01-01');
        expect(rawData.dateRange!.endDate).toBe('2024-01-15');
      });
    });

    describe('Estructura de rawData (estructura de API)', () => {
      it('debe incluir columnHeaders de YouTube Analytics API', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        const rawData = data.rawData as { kind?: string; columnHeaders?: unknown[] };
        expect(rawData.kind).toBe('youtubeAnalytics#resultTable');
        expect(rawData.columnHeaders).toBeDefined();
        expect(Array.isArray(rawData.columnHeaders)).toBe(true);
      });

      it('debe incluir rows con datos de métricas', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        const rawData = data.rawData as { rows?: unknown[][] };
        expect(rawData.rows).toBeDefined();
        expect(Array.isArray(rawData.rows)).toBe(true);
        expect(rawData.rows!.length).toBeGreaterThan(0);
      });

      it('debe incluir channelId en rawData', async () => {
        const data = await gate.fetchYouTubeAnalytics('channel1');
        
        const rawData = data.rawData as { channelId?: string };
        expect(rawData.channelId).toBe(data.channelId);
      });
    });
  });

  describe('generateWeeklyProgressReport', () => {
    // Helper para crear datos de progreso semanal
    const createWeeklyData = (overrides: Partial<{
      channel1: Partial<{
        subscribers: number;
        subscribersGained: number;
        watchTimeHours: number;
        watchTimeGained: number;
        views: number;
        viewsGained: number;
      }>;
      channel2: Partial<{
        subscribers: number;
        subscribersGained: number;
        watchTimeHours: number;
        watchTimeGained: number;
        views: number;
        viewsGained: number;
      }>;
      weekNumber: number;
      year: number;
    }> = {}) => ({
      channel1: {
        subscribers: 750,
        subscribersGained: 45,
        watchTimeHours: 2500,
        watchTimeGained: 120,
        views: 85000,
        viewsGained: 5200,
        ...overrides.channel1,
      },
      channel2: {
        subscribers: 320,
        subscribersGained: 28,
        watchTimeHours: 890,
        watchTimeGained: 65,
        views: 32000,
        viewsGained: 2100,
        ...overrides.channel2,
      },
      weekNumber: overrides.weekNumber ?? 24,
      year: overrides.year ?? 2024,
    });

    describe('Estructura del resultado', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('yppStatus');
        expect(result).toHaveProperty('weeklyTrend');
        expect(result).toHaveProperty('estimatedWeeksToYPP');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(typeof result.text).toBe('string');
        expect(result.yppStatus).toHaveProperty('channel1');
        expect(result.yppStatus).toHaveProperty('channel2');
        expect(['improving', 'declining', 'stable']).toContain(result.weeklyTrend);
        expect(result.estimatedWeeksToYPP).toHaveProperty('channel1');
        expect(result.estimatedWeeksToYPP).toHaveProperty('channel2');
      });

      it('debe retornar estado YPP válido para canal 1', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.yppStatus.channel1).toHaveProperty('isEligible');
        expect(result.yppStatus.channel1).toHaveProperty('subscribersProgress');
        expect(result.yppStatus.channel1).toHaveProperty('watchHoursProgress');
        expect(result.yppStatus.channel1).toHaveProperty('missingRequirements');
      });

      it('debe retornar estado YPP válido para canal 2', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.yppStatus.channel2).toHaveProperty('isEligible');
        expect(result.yppStatus.channel2).toHaveProperty('subscribersProgress');
        expect(result.yppStatus.channel2).toHaveProperty('watchHoursProgress');
        expect(result.yppStatus.channel2).toHaveProperty('missingRequirements');
      });
    });

    describe('Cálculo de estado YPP', () => {
      it('debe calcular progreso de suscriptores correctamente para canal 1', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 500, watchTimeHours: 2000 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // 500/1000 * 100 = 50%
        expect(result.yppStatus.channel1.subscribersProgress).toBe(50);
      });

      it('debe calcular progreso de watch time correctamente para canal 1', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 500, watchTimeHours: 2000 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // 2000/4000 * 100 = 50%
        expect(result.yppStatus.channel1.watchHoursProgress).toBe(50);
      });

      it('debe indicar isEligible=false cuando no cumple requisitos', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 500, watchTimeHours: 2000 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.yppStatus.channel1.isEligible).toBe(false);
      });

      it('debe indicar isEligible=true cuando cumple ambos requisitos', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 1500, watchTimeHours: 5000 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.yppStatus.channel1.isEligible).toBe(true);
      });

      it('debe evaluar independientemente ambos canales', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 1500, watchTimeHours: 5000 }, // Elegible
          channel2: { subscribers: 100, watchTimeHours: 500 }     // No elegible
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.yppStatus.channel1.isEligible).toBe(true);
        expect(result.yppStatus.channel2.isEligible).toBe(false);
      });
    });

    describe('Cálculo de tendencia semanal', () => {
      it('debe retornar "improving" cuando ganancia > 1% del total', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 100, subscribersGained: 10 }, // 10% crecimiento
          channel2: { subscribers: 100, subscribersGained: 10 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.weeklyTrend).toBe('improving');
      });

      it('debe retornar "declining" cuando ganancia < 0.3% del total', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 1000, subscribersGained: 1 }, // 0.1% crecimiento
          channel2: { subscribers: 1000, subscribersGained: 1 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.weeklyTrend).toBe('declining');
      });

      it('debe retornar "stable" cuando ganancia está entre 0.3% y 1%', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 500, subscribersGained: 3 }, // ~0.6% crecimiento
          channel2: { subscribers: 500, subscribersGained: 3 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.weeklyTrend).toBe('stable');
      });

      it('debe retornar "improving" cuando suscriptores es 0 pero hay ganancia', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 0, subscribersGained: 10 },
          channel2: { subscribers: 0, subscribersGained: 5 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.weeklyTrend).toBe('improving');
      });

      it('debe retornar "stable" cuando suscriptores y ganancia son 0', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 0, subscribersGained: 0 },
          channel2: { subscribers: 0, subscribersGained: 0 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.weeklyTrend).toBe('stable');
      });
    });

    describe('Estimación de semanas para YPP', () => {
      it('debe retornar null cuando canal ya es elegible YPP', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 1500, watchTimeHours: 5000, subscribersGained: 50, watchTimeGained: 100 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.estimatedWeeksToYPP.channel1).toBeNull();
      });

      it('debe estimar semanas basado en ritmo de suscriptores', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 500, 
            subscribersGained: 50, // 50/semana
            watchTimeHours: 4500,  // Ya cumple watch time
            watchTimeGained: 100 
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // Necesita 500 subs más, a 50/semana = 10 semanas
        expect(result.estimatedWeeksToYPP.channel1).toBe(10);
      });

      it('debe estimar semanas basado en ritmo de watch time', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 1500,     // Ya cumple suscriptores
            subscribersGained: 50,
            watchTimeHours: 2000,  // Necesita 2000h más
            watchTimeGained: 200   // 200h/semana
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // Necesita 2000h más, a 200h/semana = 10 semanas
        expect(result.estimatedWeeksToYPP.channel1).toBe(10);
      });

      it('debe tomar el máximo entre semanas de subs y watch time', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 800,      // Necesita 200 más, a 50/semana = 4 semanas
            subscribersGained: 50,
            watchTimeHours: 2000,  // Necesita 2000h más, a 100h/semana = 20 semanas
            watchTimeGained: 100
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // El máximo es 20 semanas (watch time limita)
        expect(result.estimatedWeeksToYPP.channel1).toBe(20);
      });

      it('debe retornar 999 cuando no hay ganancia de suscriptores y no cumple', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 500,
            subscribersGained: 0,  // Sin ganancia
            watchTimeHours: 5000,
            watchTimeGained: 100
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.estimatedWeeksToYPP.channel1).toBe(999);
      });

      it('debe retornar 999 cuando no hay ganancia de watch time y no cumple', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 1500,
            subscribersGained: 50,
            watchTimeHours: 2000,
            watchTimeGained: 0  // Sin ganancia
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.estimatedWeeksToYPP.channel1).toBe(999);
      });

      it('debe calcular estimación para ambos canales independientemente', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 1500, 
            watchTimeHours: 5000,
            subscribersGained: 50,
            watchTimeGained: 100
          }, // Elegible
          channel2: { 
            subscribers: 500, 
            subscribersGained: 25, // 500/25 = 20 semanas
            watchTimeHours: 3000,  // 1000/100 = 10 semanas
            watchTimeGained: 100 
          }  // No elegible
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.estimatedWeeksToYPP.channel1).toBeNull();
        expect(result.estimatedWeeksToYPP.channel2).toBe(20); // Suscriptores limita
      });
    });

    describe('Formato del texto para Telegram', () => {
      it('debe incluir encabezado con semana y año', () => {
        const data = createWeeklyData({ weekNumber: 24, year: 2024 });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Semana 24/2024');
      });

      it('debe incluir información de ambos canales', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('NeuroSync AI');
        expect(result.text).toContain('NeuroTech AI');
      });

      it('debe incluir progreso de suscriptores', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 750, subscribersGained: 45 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // Progreso: 750/1000 * 100 = 75%
        expect(result.text).toContain('75.0%');
        expect(result.text).toContain('Suscriptores');
      });

      it('debe incluir progreso de watch time', () => {
        const data = createWeeklyData({
          channel1: { watchTimeHours: 2000, watchTimeGained: 120 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // Progreso: 2000/4000 * 100 = 50%
        expect(result.text).toContain('50.0%');
        expect(result.text).toContain('Watch Time');
      });

      it('debe incluir tendencia semanal', () => {
        const data = createWeeklyData({
          channel1: { subscribers: 100, subscribersGained: 10 },
          channel2: { subscribers: 100, subscribersGained: 10 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Tendencia');
        expect(result.text).toContain('Mejorando');
      });

      it('debe incluir estimación de semanas', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 500, 
            subscribersGained: 50, 
            watchTimeHours: 2000, 
            watchTimeGained: 200 
          }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Estimación');
        expect(result.text).toContain('semanas');
      });

      it('debe incluir barras de progreso visual', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        // Las barras usan caracteres █ y ░
        expect(result.text).toMatch(/[█░]+/);
      });

      it('debe usar markdown para formato', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        // Debe tener asteriscos para negrita (formato markdown)
        expect(result.text).toContain('*');
      });

      it('debe incluir cita inspiracional al final', () => {
        const data = createWeeklyData();
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Autism is not a system error');
      });

      it('debe formatear números grandes con separadores', () => {
        const data = createWeeklyData({
          channel1: { views: 85000, viewsGained: 5200 }
        });
        const result = gate.generateWeeklyProgressReport(data);
        
        // Los números grandes deben tener formato español (puntos como separadores)
        expect(result.text).toMatch(/85\.000|85,000/);
      });
    });

    describe('Casos límite', () => {
      it('debe manejar valores de 0 en todas las métricas', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 0, 
            subscribersGained: 0, 
            watchTimeHours: 0, 
            watchTimeGained: 0,
            views: 0,
            viewsGained: 0
          },
          channel2: { 
            subscribers: 0, 
            subscribersGained: 0, 
            watchTimeHours: 0, 
            watchTimeGained: 0,
            views: 0,
            viewsGained: 0
          }
        });
        
        // No debe lanzar error
        expect(() => gate.generateWeeklyProgressReport(data)).not.toThrow();
        
        const result = gate.generateWeeklyProgressReport(data);
        expect(result.yppStatus.channel1.subscribersProgress).toBe(0);
        expect(result.yppStatus.channel1.watchHoursProgress).toBe(0);
      });

      it('debe manejar valores muy grandes', () => {
        const data = createWeeklyData({
          channel1: { 
            subscribers: 1000000, 
            subscribersGained: 50000, 
            watchTimeHours: 100000, 
            watchTimeGained: 5000,
            views: 50000000,
            viewsGained: 2000000
          }
        });
        
        expect(() => gate.generateWeeklyProgressReport(data)).not.toThrow();
        
        const result = gate.generateWeeklyProgressReport(data);
        expect(result.yppStatus.channel1.isEligible).toBe(true);
        expect(result.estimatedWeeksToYPP.channel1).toBeNull();
      });

      it('debe manejar semana 1 del año correctamente', () => {
        const data = createWeeklyData({ weekNumber: 1, year: 2025 });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Semana 1/2025');
      });

      it('debe manejar semana 52 del año correctamente', () => {
        const data = createWeeklyData({ weekNumber: 52, year: 2024 });
        const result = gate.generateWeeklyProgressReport(data);
        
        expect(result.text).toContain('Semana 52/2024');
      });
    });
  });

  describe('checkMilestoneAlert', () => {
    // Helper para crear métricas actuales de canal
    const createCurrentMetrics = (
      overrides: Partial<{ subscribers: number; watchTimeHours: number }> = {}
    ): { subscribers: number; watchTimeHours: number } => ({
      subscribers: 500,
      watchTimeHours: 2000,
      ...overrides,
    });

    // Helper para crear progreso previo
    const createPreviousProgress = (
      overrides: Partial<{ subscribers: number; watchTime: number }> = {}
    ): { subscribers: number; watchTime: number } => ({
      subscribers: 50,
      watchTime: 50,
      ...overrides,
    });

    describe('Estructura del resultado MilestoneAlertResult', () => {
      it('debe retornar todas las propiedades requeridas', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics()
        );

        expect(result).toHaveProperty('shouldAlert');
        expect(result).toHaveProperty('channelKey');
        expect(result).toHaveProperty('milestone');
        expect(result).toHaveProperty('progress');
        expect(result.progress).toHaveProperty('subscribers');
        expect(result.progress).toHaveProperty('watchTime');
        expect(result).toHaveProperty('message');
      });

      it('debe retornar tipos correctos para cada propiedad', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics()
        );

        expect(typeof result.shouldAlert).toBe('boolean');
        expect(typeof result.channelKey).toBe('string');
        expect(typeof result.milestone).toBe('number');
        expect(typeof result.progress.subscribers).toBe('number');
        expect(typeof result.progress.watchTime).toBe('number');
        expect(typeof result.message).toBe('string');
      });

      it('debe identificar correctamente el canal 1', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics()
        );
        
        expect(result.channelKey).toBe('channel1');
        expect(result.message).toContain('NeuroSync AI');
      });

      it('debe identificar correctamente el canal 2', () => {
        const result = gate.checkMilestoneAlert(
          'channel2',
          createCurrentMetrics()
        );
        
        expect(result.channelKey).toBe('channel2');
        expect(result.message).toContain('NeuroTech AI');
      });
    });

    describe('Cálculo de progreso', () => {
      it('debe calcular progreso de suscriptores correctamente', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 500 })
        );
        
        expect(result.progress.subscribers).toBe(50);
      });

      it('debe calcular progreso de watch time correctamente', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ watchTimeHours: 2000 })
        );
        
        expect(result.progress.watchTime).toBe(50);
      });

      it('debe calcular progreso > 100% cuando excede umbral', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1500, watchTimeHours: 5000 })
        );
        
        expect(result.progress.subscribers).toBe(150);
        expect(result.progress.watchTime).toBe(125);
      });

      it('debe redondear progreso a 2 decimales', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 333 })
        );
        
        expect(result.progress.subscribers).toBe(33.3);
      });
    });

    describe('Detección de milestone 80%', () => {
      it('debe alertar cuando suscriptores cruzan 80% desde abajo', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 820, watchTimeHours: 2000 }),
          createPreviousProgress({ subscribers: 75, watchTime: 50 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(80);
        expect(result.message).toContain('MILESTONE');
        expect(result.message).toContain('suscriptores');
      });

      it('debe alertar cuando watch time cruza 80% desde abajo', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 500, watchTimeHours: 3300 }),
          createPreviousProgress({ subscribers: 50, watchTime: 78 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(80);
        expect(result.message).toContain('watch time');
      });

      it('debe alertar cuando ambas métricas cruzan 80% simultáneamente', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 3400 }),
          createPreviousProgress({ subscribers: 75, watchTime: 78 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(80);
        expect(result.message).toContain('suscriptores Y watch time');
      });

      it('NO debe alertar cuando suscriptores ya estaban sobre 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 870, watchTimeHours: 2000 }),
          createPreviousProgress({ subscribers: 85, watchTime: 50 })
        );

        expect(result.shouldAlert).toBe(false);
      });

      it('NO debe alertar cuando watch time ya estaba sobre 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 500, watchTimeHours: 3500 }),
          createPreviousProgress({ subscribers: 50, watchTime: 85 })
        );

        expect(result.shouldAlert).toBe(false);
      });

      it('debe alertar sin progreso previo cuando está en 80%', () => {
        // Sin previousProgress, el umbral anterior se asume 0
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(80);
      });
    });

    describe('Detección de milestone 100% (elegibilidad YPP)', () => {
      it('debe alertar cuando AMBAS métricas cruzan 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1050, watchTimeHours: 4200 }),
          createPreviousProgress({ subscribers: 95, watchTime: 98 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(100);
        expect(result.message).toContain('FELICIDADES');
        expect(result.message).toContain('ELEGIBLE PARA YPP');
      });

      it('debe alertar cuando canal alcanza exactamente 100% en ambas', () => {
        const result = gate.checkMilestoneAlert(
          'channel2',
          createCurrentMetrics({ subscribers: 1000, watchTimeHours: 4000 }),
          createPreviousProgress({ subscribers: 98, watchTime: 99 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(100);
      });

      it('NO debe alertar 100% cuando solo suscriptores llegan a 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1100, watchTimeHours: 3000 }),
          createPreviousProgress({ subscribers: 95, watchTime: 70 })
        );

        // Debería alertar 80% (si cruzó) pero no 100%
        expect(result.milestone).not.toBe(100);
      });

      it('NO debe alertar 100% cuando solo watch time llega a 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 800, watchTimeHours: 4500 }),
          createPreviousProgress({ subscribers: 75, watchTime: 95 })
        );

        expect(result.milestone).not.toBe(100);
      });

      it('debe alertar sin progreso previo cuando es elegible YPP', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1200, watchTimeHours: 5000 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(100);
      });

      it('NO debe alertar de nuevo si ya estaba en 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1300, watchTimeHours: 5500 }),
          createPreviousProgress({ subscribers: 105, watchTime: 110 })
        );

        expect(result.shouldAlert).toBe(false);
        expect(result.milestone).toBe(100);
      });
    });

    describe('Mensaje formateado', () => {
      it('debe incluir nombre del canal en milestone 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 })
        );

        expect(result.message).toContain('NeuroSync AI');
      });

      it('debe incluir emoji del canal 1 (cerebro)', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 })
        );

        expect(result.message).toContain('🧠');
      });

      it('debe incluir emoji del canal 2 (rayo)', () => {
        const result = gate.checkMilestoneAlert(
          'channel2',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 })
        );

        expect(result.message).toContain('⚡');
      });

      it('debe incluir valores actuales formateados en milestone 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1050, watchTimeHours: 4200 })
        );

        // Verificar que contiene los valores (formato puede variar según locale)
        expect(result.message).toMatch(/1[,.]?050|1050/);
        expect(result.message).toMatch(/4[,.]?200|4200/);
      });

      it('debe incluir próximos pasos en mensaje 100%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1000, watchTimeHours: 4000 })
        );

        expect(result.message).toContain('YouTube Studio');
        expect(result.message).toContain('Monetización');
        expect(result.message).toContain('AdSense');
      });

      it('debe incluir mensaje motivador en milestone 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 })
        );

        expect(result.message).toContain('cerca de la monetización');
      });

      it('debe mostrar lo que falta para YPP en milestone 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 3200 })
        );

        expect(result.message).toContain('Faltan');
        expect(result.message).toContain('150'); // Faltan 150 suscriptores
        expect(result.message).toContain('800'); // Faltan 800h de watch time
      });
    });

    describe('Sin cruzar milestone', () => {
      it('debe retornar shouldAlert=false cuando progreso bajo', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 300, watchTimeHours: 1000 }),
          createPreviousProgress({ subscribers: 25, watchTime: 20 })
        );

        expect(result.shouldAlert).toBe(false);
        expect(result.milestone).toBe(0);
      });

      it('debe retornar milestone actual aunque no alerte', () => {
        // Ya estaba sobre 80%, no cruzó nada nuevo
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 850, watchTimeHours: 2000 }),
          createPreviousProgress({ subscribers: 82, watchTime: 50 })
        );

        expect(result.shouldAlert).toBe(false);
        expect(result.milestone).toBe(80); // El milestone actual es 80 aunque no alerte
      });
    });

    describe('Casos límite', () => {
      it('debe manejar valores de 0 en métricas actuales', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 0, watchTimeHours: 0 })
        );

        expect(result.shouldAlert).toBe(false);
        expect(result.progress.subscribers).toBe(0);
        expect(result.progress.watchTime).toBe(0);
        expect(result.milestone).toBe(0);
      });

      it('debe manejar valores justo en el límite 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 800, watchTimeHours: 3200 }),
          createPreviousProgress({ subscribers: 79.9, watchTime: 79.9 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(80);
        expect(result.progress.subscribers).toBe(80);
        expect(result.progress.watchTime).toBe(80);
      });

      it('debe manejar valores justo debajo del límite 80%', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 799, watchTimeHours: 3199 }),
          createPreviousProgress({ subscribers: 70, watchTime: 70 })
        );

        expect(result.shouldAlert).toBe(false);
        expect(result.progress.subscribers).toBe(79.9);
      });

      it('debe manejar valores muy grandes', () => {
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 100000, watchTimeHours: 50000 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(100);
        expect(result.progress.subscribers).toBe(10000);
        expect(result.progress.watchTime).toBe(1250);
      });

      it('debe priorizar milestone 100 sobre 80 cuando ambos cruzan', () => {
        // Caso donde previousProgress era muy bajo y ahora cruza 80% y 100% al mismo tiempo
        const result = gate.checkMilestoneAlert(
          'channel1',
          createCurrentMetrics({ subscribers: 1100, watchTimeHours: 4500 }),
          createPreviousProgress({ subscribers: 50, watchTime: 50 })
        );

        expect(result.shouldAlert).toBe(true);
        expect(result.milestone).toBe(100); // Debe ser 100, no 80
        expect(result.message).toContain('FELICIDADES');
      });
    });
  });

  describe('fetchYouTubeAnalyticsV2', () => {
    describe('Retorno de estructura YouTubeAnalyticsDataV2', () => {
      it('debe retornar todas las propiedades requeridas', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');

        expect(result).toHaveProperty('channelId');
        expect(result).toHaveProperty('subscribers');
        expect(result).toHaveProperty('totalWatchTimeHours');
        expect(result).toHaveProperty('totalViews');
        expect(result).toHaveProperty('lastUpdated');
      });

      it('debe retornar tipos correctos para cada propiedad', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');

        expect(typeof result.channelId).toBe('string');
        expect(typeof result.subscribers).toBe('number');
        expect(typeof result.totalWatchTimeHours).toBe('number');
        expect(typeof result.totalViews).toBe('number');
        expect(result.lastUpdated).toBeInstanceOf(Date);
      });

      it('debe incluir shortsViews90Days como número opcional', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');

        expect(result.shortsViews90Days).toBeDefined();
        expect(typeof result.shortsViews90Days).toBe('number');
      });
    });

    describe('Datos mock por canal', () => {
      it('debe retornar datos coherentes para canal 1 (NeuroSync AI)', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');

        expect(result.channelId).toBe('UC_NEUROSYNC_AI');
        // Canal 1 es más maduro, debe tener más suscriptores
        expect(result.subscribers).toBeGreaterThan(500);
        expect(result.totalWatchTimeHours).toBeGreaterThan(2000);
        expect(result.totalViews).toBeGreaterThan(50000);
      });

      it('debe retornar datos coherentes para canal 2 (NeuroTech AI)', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel2');

        expect(result.channelId).toBe('UC_NEUROTECH_AI');
        // Canal 2 es más nuevo, debe tener menos métricas
        expect(result.subscribers).toBeGreaterThan(200);
        expect(result.totalWatchTimeHours).toBeGreaterThan(600);
        expect(result.totalViews).toBeGreaterThan(20000);
      });

      it('debe retornar métricas diferentes para cada canal', async () => {
        const result1 = await gate.fetchYouTubeAnalyticsV2('channel1');
        const result2 = await gate.fetchYouTubeAnalyticsV2('channel2');

        expect(result1.channelId).not.toBe(result2.channelId);
        // Canal 1 debe tener métricas más altas
        expect(result1.subscribers).toBeGreaterThan(result2.subscribers);
        expect(result1.totalWatchTimeHours).toBeGreaterThan(result2.totalWatchTimeHours);
      });
    });

    describe('Sistema de caché', () => {
      it('debe cachear resultados y retornar datos del caché en llamadas consecutivas', async () => {
        // Invalidar caché para empezar limpio
        gate.invalidateAnalyticsCacheV2('channel1');

        // Primera llamada - debe ir a la "API" (mock)
        const result1 = await gate.fetchYouTubeAnalyticsV2('channel1');
        const timestamp1 = result1.lastUpdated;

        // Segunda llamada inmediata - debe usar caché
        const result2 = await gate.fetchYouTubeAnalyticsV2('channel1');
        const timestamp2 = result2.lastUpdated;

        // El timestamp debería ser el mismo porque viene del caché
        expect(timestamp1.getTime()).toBe(timestamp2.getTime());
      });

      it('debe verificar correctamente si hay caché válido', async () => {
        // Invalidar caché
        gate.invalidateAnalyticsCacheV2('channel1');

        // Sin caché debería retornar false
        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(false);

        // Después de fetch, debería retornar true
        await gate.fetchYouTubeAnalyticsV2('channel1');
        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(true);
      });

      it('debe invalidar el caché de un canal específico', async () => {
        // Poblar caché de ambos canales
        await gate.fetchYouTubeAnalyticsV2('channel1');
        await gate.fetchYouTubeAnalyticsV2('channel2');

        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(true);
        expect(gate.hasValidAnalyticsCacheV2('channel2')).toBe(true);

        // Invalidar solo canal 1
        gate.invalidateAnalyticsCacheV2('channel1');

        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(false);
        expect(gate.hasValidAnalyticsCacheV2('channel2')).toBe(true);
      });

      it('debe invalidar el caché de todos los canales cuando no se especifica', async () => {
        // Poblar caché de ambos canales
        await gate.fetchYouTubeAnalyticsV2('channel1');
        await gate.fetchYouTubeAnalyticsV2('channel2');

        // Invalidar todos
        gate.invalidateAnalyticsCacheV2();

        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(false);
        expect(gate.hasValidAnalyticsCacheV2('channel2')).toBe(false);
      });
    });

    describe('Configuración de caché', () => {
      it('debe usar TTL por defecto de 1 hora cuando no se especifica', async () => {
        // El caché por defecto debería expirar en 1 hora
        gate.invalidateAnalyticsCacheV2('channel1');
        await gate.fetchYouTubeAnalyticsV2('channel1');
        
        // El caché debería estar válido inmediatamente después
        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(true);
      });

      it('debe aceptar configuración de cacheHours personalizada', async () => {
        // Poblar caché con TTL de 2 horas
        await gate.fetchYouTubeAnalyticsV2('channel1', { cacheHours: 2 });
        
        // El caché debería estar válido
        expect(gate.hasValidAnalyticsCacheV2('channel1')).toBe(true);
      });
    });

    describe('Modo mock', () => {
      it('debe usar datos mock cuando useMockData es true', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1', { useMockData: true });

        expect(result.channelId).toBe('UC_NEUROSYNC_AI');
        expect(result.subscribers).toBeGreaterThan(0);
      });

      it('debe usar datos mock cuando no hay apiKey', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1', {});

        expect(result.channelId).toBe('UC_NEUROSYNC_AI');
        expect(result.subscribers).toBeGreaterThan(0);
      });

      it('debe usar datos mock cuando apiKey está vacío', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1', { apiKey: '' });

        // Por ahora usa mock ya que la API real no está implementada
        expect(result.channelId).toBe('UC_NEUROSYNC_AI');
      });

      it('debe simular latencia realista en modo mock (100-300ms)', async () => {
        gate.invalidateAnalyticsCacheV2('channel1');
        
        const startTime = Date.now();
        await gate.fetchYouTubeAnalyticsV2('channel1', { useMockData: true });
        const endTime = Date.now();
        const elapsed = endTime - startTime;

        // Debe haber al menos 100ms de latencia simulada
        expect(elapsed).toBeGreaterThanOrEqual(90); // Margen pequeño por variaciones del sistema
        // No debería tardar más de 500ms en condiciones normales
        expect(elapsed).toBeLessThan(500);
      });
    });

    describe('Valores de métricas', () => {
      it('debe retornar suscriptores como número positivo', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');
        expect(result.subscribers).toBeGreaterThan(0);
      });

      it('debe retornar watch time como número positivo', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');
        expect(result.totalWatchTimeHours).toBeGreaterThan(0);
      });

      it('debe retornar vistas totales como número positivo', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');
        expect(result.totalViews).toBeGreaterThan(0);
      });

      it('debe retornar vistas de Shorts como número positivo', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');
        expect(result.shortsViews90Days).toBeGreaterThan(0);
      });

      it('debe retornar estimatedRevenue como undefined si no está monetizado', async () => {
        const result = await gate.fetchYouTubeAnalyticsV2('channel1');
        // Por ahora ningún canal está monetizado
        expect(result.estimatedRevenue).toBeUndefined();
      });

      it('debe incluir variación realista en datos mock (±10%)', async () => {
        // Hacer múltiples llamadas y verificar que hay variación
        gate.invalidateAnalyticsCacheV2('channel1');
        const result1 = await gate.fetchYouTubeAnalyticsV2('channel1');
        
        gate.invalidateAnalyticsCacheV2('channel1');
        const result2 = await gate.fetchYouTubeAnalyticsV2('channel1');

        // Los valores podrían ser diferentes debido a la variación del ±10%
        // Pero ambos deberían estar en rangos razonables
        expect(result1.subscribers).toBeGreaterThan(600);
        expect(result1.subscribers).toBeLessThan(900);
        expect(result2.subscribers).toBeGreaterThan(600);
        expect(result2.subscribers).toBeLessThan(900);
      });
    });
  });

  // ============================================================================
  // TESTS: Sistema de Histórico de Progreso (REQ-5.4.10)
  // ============================================================================
  describe('Sistema de Histórico de Progreso (REQ-5.4.10)', () => {
    beforeEach(() => {
      // Limpiar histórico antes de cada test
      gate.clearProgressHistory();
    });

    describe('saveProgressSnapshot', () => {
      it('debe guardar un snapshot con ID auto-generado', async () => {
        const snapshot = {
          channelKey: 'channel1' as const,
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        };

        const saved = await gate.saveProgressSnapshot(snapshot);

        expect(saved.id).toBe(1);
        expect(saved.channelKey).toBe('channel1');
        expect(saved.subscribers).toBe(750);
        expect(saved.watchTimeHours).toBe(2800);
        expect(saved.views).toBe(85000);
      });

      it('debe auto-incrementar IDs correctamente', async () => {
        const snapshot1 = await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        const snapshot2 = await gate.saveProgressSnapshot({
          channelKey: 'channel2',
          timestamp: new Date(),
          subscribers: 320,
          watchTimeHours: 890,
          views: 32000,
        });

        const snapshot3 = await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 760,
          watchTimeHours: 2850,
          views: 86000,
        });

        expect(snapshot1.id).toBe(1);
        expect(snapshot2.id).toBe(2);
        expect(snapshot3.id).toBe(3);
      });

      it('debe guardar shortsViews90Days cuando se proporciona', async () => {
        const snapshot = await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
          shortsViews90Days: 3_500_000,
        });

        expect(snapshot.shortsViews90Days).toBe(3_500_000);
      });

      it('debe aceptar timestamp como objeto Date', async () => {
        const timestamp = new Date('2024-06-15T10:30:00Z');
        const snapshot = await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp,
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        expect(snapshot.timestamp.getTime()).toBe(timestamp.getTime());
      });

      it('debe lanzar error si channelKey es inválido', async () => {
        await expect(gate.saveProgressSnapshot({
          channelKey: 'channel3' as 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        })).rejects.toThrow('channelKey inválido');
      });

      it('debe lanzar error si subscribers es negativo', async () => {
        await expect(gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: -100,
          watchTimeHours: 2800,
          views: 85000,
        })).rejects.toThrow('subscribers debe ser un número no negativo');
      });

      it('debe lanzar error si watchTimeHours es negativo', async () => {
        await expect(gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: -500,
          views: 85000,
        })).rejects.toThrow('watchTimeHours debe ser un número no negativo');
      });

      it('debe lanzar error si views es negativo', async () => {
        await expect(gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: -1000,
        })).rejects.toThrow('views debe ser un número no negativo');
      });

      it('debe aceptar 0 como valor válido para métricas', async () => {
        const snapshot = await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 0,
          watchTimeHours: 0,
          views: 0,
        });

        expect(snapshot.subscribers).toBe(0);
        expect(snapshot.watchTimeHours).toBe(0);
        expect(snapshot.views).toBe(0);
      });
    });

    describe('getProgressHistory', () => {
      it('debe retornar array vacío cuando no hay histórico', async () => {
        const history = await gate.getProgressHistory();
        expect(history).toHaveLength(0);
      });

      it('debe retornar todos los snapshots ordenados por timestamp DESC', async () => {
        const date1 = new Date('2024-06-01T10:00:00Z');
        const date2 = new Date('2024-06-08T10:00:00Z');
        const date3 = new Date('2024-06-15T10:00:00Z');

        // Guardar en orden no cronológico
        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date2,
          subscribers: 760,
          watchTimeHours: 2850,
          views: 86000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date1,
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date3,
          subscribers: 780,
          watchTimeHours: 2900,
          views: 88000,
        });

        const history = await gate.getProgressHistory();

        expect(history).toHaveLength(3);
        expect(history[0].timestamp.getTime()).toBe(date3.getTime()); // Más reciente primero
        expect(history[1].timestamp.getTime()).toBe(date2.getTime());
        expect(history[2].timestamp.getTime()).toBe(date1.getTime()); // Más antiguo último
      });

      it('debe filtrar por channelKey', async () => {
        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel2',
          timestamp: new Date(),
          subscribers: 320,
          watchTimeHours: 890,
          views: 32000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 760,
          watchTimeHours: 2850,
          views: 86000,
        });

        const channel1History = await gate.getProgressHistory({ channelKey: 'channel1' });
        const channel2History = await gate.getProgressHistory({ channelKey: 'channel2' });

        expect(channel1History).toHaveLength(2);
        expect(channel2History).toHaveLength(1);
        expect(channel1History.every(s => s.channelKey === 'channel1')).toBe(true);
        expect(channel2History.every(s => s.channelKey === 'channel2')).toBe(true);
      });

      it('debe filtrar por startDate (inclusive)', async () => {
        const date1 = new Date('2024-06-01T10:00:00Z');
        const date2 = new Date('2024-06-08T10:00:00Z');
        const date3 = new Date('2024-06-15T10:00:00Z');

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date1,
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date2,
          subscribers: 760,
          watchTimeHours: 2850,
          views: 86000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date3,
          subscribers: 780,
          watchTimeHours: 2900,
          views: 88000,
        });

        const history = await gate.getProgressHistory({
          startDate: new Date('2024-06-08T00:00:00Z'),
        });

        expect(history).toHaveLength(2);
        expect(history.every(s => s.timestamp >= new Date('2024-06-08T00:00:00Z'))).toBe(true);
      });

      it('debe filtrar por endDate (inclusive)', async () => {
        const date1 = new Date('2024-06-01T10:00:00Z');
        const date2 = new Date('2024-06-08T10:00:00Z');
        const date3 = new Date('2024-06-15T10:00:00Z');

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date1,
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date2,
          subscribers: 760,
          watchTimeHours: 2850,
          views: 86000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: date3,
          subscribers: 780,
          watchTimeHours: 2900,
          views: 88000,
        });

        const history = await gate.getProgressHistory({
          endDate: new Date('2024-06-09T00:00:00Z'),
        });

        expect(history).toHaveLength(2);
        expect(history.every(s => s.timestamp <= new Date('2024-06-09T00:00:00Z'))).toBe(true);
      });

      it('debe filtrar por rango de fechas', async () => {
        const date1 = new Date('2024-06-01T10:00:00Z');
        const date2 = new Date('2024-06-08T10:00:00Z');
        const date3 = new Date('2024-06-15T10:00:00Z');
        const date4 = new Date('2024-06-22T10:00:00Z');

        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date1, subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date2, subscribers: 760, watchTimeHours: 2850, views: 86000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date3, subscribers: 780, watchTimeHours: 2900, views: 88000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date4, subscribers: 800, watchTimeHours: 2950, views: 90000 });

        const history = await gate.getProgressHistory({
          startDate: new Date('2024-06-07T00:00:00Z'),
          endDate: new Date('2024-06-16T00:00:00Z'),
        });

        expect(history).toHaveLength(2);
      });

      it('debe respetar el límite de resultados', async () => {
        // Guardar 10 snapshots
        for (let i = 0; i < 10; i++) {
          await gate.saveProgressSnapshot({
            channelKey: 'channel1',
            timestamp: new Date(Date.now() + i * 1000), // Cada uno 1 segundo después
            subscribers: 750 + i,
            watchTimeHours: 2800 + i,
            views: 85000 + i * 100,
          });
        }

        const history = await gate.getProgressHistory({ limit: 5 });

        expect(history).toHaveLength(5);
      });

      it('debe usar límite por defecto de 100', async () => {
        // Guardar 150 snapshots
        for (let i = 0; i < 150; i++) {
          await gate.saveProgressSnapshot({
            channelKey: 'channel1',
            timestamp: new Date(Date.now() + i * 1000),
            subscribers: 750 + i,
            watchTimeHours: 2800 + i,
            views: 85000 + i * 100,
          });
        }

        const history = await gate.getProgressHistory();

        expect(history).toHaveLength(100);
      });

      it('debe combinar múltiples filtros', async () => {
        const now = new Date();

        // Guardar snapshots de ambos canales
        for (let i = 0; i < 5; i++) {
          await gate.saveProgressSnapshot({
            channelKey: 'channel1',
            timestamp: new Date(now.getTime() + i * 86400000), // Cada día
            subscribers: 750 + i * 10,
            watchTimeHours: 2800 + i * 50,
            views: 85000 + i * 1000,
          });

          await gate.saveProgressSnapshot({
            channelKey: 'channel2',
            timestamp: new Date(now.getTime() + i * 86400000),
            subscribers: 320 + i * 5,
            watchTimeHours: 890 + i * 20,
            views: 32000 + i * 500,
          });
        }

        const history = await gate.getProgressHistory({
          channelKey: 'channel1',
          startDate: new Date(now.getTime() + 86400000), // Desde el día 2
          limit: 3,
        });

        expect(history).toHaveLength(3);
        expect(history.every(s => s.channelKey === 'channel1')).toBe(true);
      });
    });

    describe('getLatestSnapshot', () => {
      it('debe retornar null cuando no hay histórico para el canal', async () => {
        const latest = await gate.getLatestSnapshot('channel1');
        expect(latest).toBeNull();
      });

      it('debe retornar el snapshot más reciente del canal', async () => {
        const date1 = new Date('2024-06-01T10:00:00Z');
        const date2 = new Date('2024-06-08T10:00:00Z');
        const date3 = new Date('2024-06-15T10:00:00Z');

        // Guardar en orden no cronológico para verificar que ordena correctamente
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date2, subscribers: 760, watchTimeHours: 2850, views: 86000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date1, subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: date3, subscribers: 780, watchTimeHours: 2900, views: 88000 });

        const latest = await gate.getLatestSnapshot('channel1');

        expect(latest).not.toBeNull();
        expect(latest!.timestamp.getTime()).toBe(date3.getTime());
        expect(latest!.subscribers).toBe(780);
      });

      it('debe retornar solo snapshots del canal especificado', async () => {
        const now = new Date();

        // Canal 2 tiene el snapshot más reciente globalmente
        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(now.getTime() - 86400000), // Ayer
          subscribers: 750,
          watchTimeHours: 2800,
          views: 85000,
        });

        await gate.saveProgressSnapshot({
          channelKey: 'channel2',
          timestamp: now, // Hoy
          subscribers: 320,
          watchTimeHours: 890,
          views: 32000,
        });

        const latestChannel1 = await gate.getLatestSnapshot('channel1');

        expect(latestChannel1).not.toBeNull();
        expect(latestChannel1!.channelKey).toBe('channel1');
        expect(latestChannel1!.subscribers).toBe(750);
      });
    });

    describe('getProgressHistoryCount', () => {
      it('debe retornar 0 cuando no hay histórico', () => {
        expect(gate.getProgressHistoryCount()).toBe(0);
      });

      it('debe retornar el conteo total de snapshots', async () => {
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel2', timestamp: new Date(), subscribers: 320, watchTimeHours: 890, views: 32000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 760, watchTimeHours: 2850, views: 86000 });

        expect(gate.getProgressHistoryCount()).toBe(3);
      });

      it('debe retornar el conteo por canal cuando se especifica', async () => {
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel2', timestamp: new Date(), subscribers: 320, watchTimeHours: 890, views: 32000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 760, watchTimeHours: 2850, views: 86000 });

        expect(gate.getProgressHistoryCount('channel1')).toBe(2);
        expect(gate.getProgressHistoryCount('channel2')).toBe(1);
      });
    });

    describe('clearProgressHistory', () => {
      it('debe limpiar todo el histórico cuando no se especifica canal', async () => {
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel2', timestamp: new Date(), subscribers: 320, watchTimeHours: 890, views: 32000 });

        gate.clearProgressHistory();

        expect(gate.getProgressHistoryCount()).toBe(0);
      });

      it('debe limpiar solo el histórico del canal especificado', async () => {
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel2', timestamp: new Date(), subscribers: 320, watchTimeHours: 890, views: 32000 });

        gate.clearProgressHistory('channel1');

        expect(gate.getProgressHistoryCount('channel1')).toBe(0);
        expect(gate.getProgressHistoryCount('channel2')).toBe(1);
      });

      it('debe reiniciar el contador de IDs al limpiar todo', async () => {
        const snap1 = await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        expect(snap1.id).toBe(1);

        gate.clearProgressHistory();

        const snap2 = await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 760, watchTimeHours: 2850, views: 86000 });
        expect(snap2.id).toBe(1); // Reiniciado a 1
      });

      it('no debe reiniciar el contador de IDs al limpiar un solo canal', async () => {
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel2', timestamp: new Date(), subscribers: 320, watchTimeHours: 890, views: 32000 });

        gate.clearProgressHistory('channel1');

        const snap3 = await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: new Date(), subscribers: 760, watchTimeHours: 2850, views: 86000 });
        expect(snap3.id).toBe(3); // Continúa desde 3
      });
    });

    describe('Integración con análisis de tendencias', () => {
      it('debe permitir calcular crecimiento de suscriptores entre snapshots', async () => {
        const week1 = new Date('2024-06-01T10:00:00Z');
        const week2 = new Date('2024-06-08T10:00:00Z');
        const week3 = new Date('2024-06-15T10:00:00Z');

        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: week1, subscribers: 700, watchTimeHours: 2500, views: 80000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: week2, subscribers: 750, watchTimeHours: 2800, views: 85000 });
        await gate.saveProgressSnapshot({ channelKey: 'channel1', timestamp: week3, subscribers: 810, watchTimeHours: 3100, views: 92000 });

        const history = await gate.getProgressHistory({ channelKey: 'channel1' });

        // Calcular crecimiento semanal
        const week3Data = history[0];
        const week2Data = history[1];
        const week1Data = history[2];

        const growthWeek2To3 = week3Data.subscribers - week2Data.subscribers;
        const growthWeek1To2 = week2Data.subscribers - week1Data.subscribers;

        expect(growthWeek1To2).toBe(50);
        expect(growthWeek2To3).toBe(60);
      });

      it('debe permitir calcular velocidad promedio de crecimiento', async () => {
        const baseDate = new Date('2024-06-01T10:00:00Z');

        // Guardar 4 semanas de datos
        for (let week = 0; week < 4; week++) {
          await gate.saveProgressSnapshot({
            channelKey: 'channel1',
            timestamp: new Date(baseDate.getTime() + week * 7 * 86400000),
            subscribers: 700 + week * 50, // +50 suscriptores por semana
            watchTimeHours: 2500 + week * 200, // +200 horas por semana
            views: 80000 + week * 5000,
          });
        }

        const history = await gate.getProgressHistory({ channelKey: 'channel1' });

        // Calcular crecimiento promedio
        const oldestSnapshot = history[history.length - 1];
        const newestSnapshot = history[0];

        const totalGrowth = newestSnapshot.subscribers - oldestSnapshot.subscribers;
        const weeks = history.length - 1;
        const avgGrowthPerWeek = totalGrowth / weeks;

        expect(avgGrowthPerWeek).toBe(50);
      });

      it('debe permitir estimar semanas restantes para YPP', async () => {
        await gate.saveProgressSnapshot({
          channelKey: 'channel1',
          timestamp: new Date(),
          subscribers: 800,
          watchTimeHours: 3200,
          views: 90000,
        });

        const latest = await gate.getLatestSnapshot('channel1');

        if (latest) {
          // Calcular progreso actual
          const subscribersRemaining = YPP_THRESHOLDS.MIN_SUBSCRIBERS - latest.subscribers;
          const watchTimeRemaining = YPP_THRESHOLDS.MIN_WATCH_TIME_HOURS - latest.watchTimeHours;

          // Asumiendo crecimiento semanal de 50 subs y 200 horas
          const weeksForSubs = Math.ceil(subscribersRemaining / 50);
          const weeksForWatchTime = Math.ceil(watchTimeRemaining / 200);

          expect(weeksForSubs).toBe(4); // (1000-800) / 50 = 4
          expect(weeksForWatchTime).toBe(4); // (4000-3200) / 200 = 4
        }
      });
    });
  });
});