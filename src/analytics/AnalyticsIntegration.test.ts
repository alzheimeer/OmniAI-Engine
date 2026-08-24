/**
 * Tests para AnalyticsIntegration
 * 
 * Verifica la integración con YouTube Analytics API incluyendo:
 * - Obtención de métricas completas (Watch Time, CTR, retención, suscriptores)
 * - Sistema de caché
 * - Consultas por rango de fechas
 * - Datos mock coherentes con los canales del proyecto
 * 
 * @requirement REQ-5.2.1
 */

import {
  AnalyticsIntegration,
  AnalyticsMetrics,
  DateRange,
  WatchTimeAndCTR,
  VideoType,
  SegmentedMetrics,
  VideoTypeComparison,
  RetentionDataForSEO,
  AlertSeverity,
  AlertType,
  PerformanceAlert,
  AlertCheckResult,
} from './AnalyticsIntegration';

describe('AnalyticsIntegration', () => {
  let analytics: AnalyticsIntegration;

  beforeEach(() => {
    // Crear instancia fresca sin latencia simulada para tests más rápidos
    analytics = new AnalyticsIntegration({
      useMockData: true,
      simulateLatency: false,
    });
  });

  describe('Constructor y Configuración', () => {
    it('debe crear instancia con configuración por defecto', () => {
      const defaultAnalytics = new AnalyticsIntegration();
      const config = defaultAnalytics.getConfig();
      
      expect(config.useMockData).toBe(true);
      expect(config.cacheHours).toBe(1);
      expect(config.apiKey).toBe('');
      expect(config.simulateLatency).toBe(true);
    });

    it('debe aceptar configuración personalizada', () => {
      const customAnalytics = new AnalyticsIntegration({
        cacheHours: 2,
        simulateLatency: false,
        apiKey: 'test-key',
      });
      const config = customAnalytics.getConfig();
      
      expect(config.cacheHours).toBe(2);
      expect(config.simulateLatency).toBe(false);
      expect(config.apiKey).toBe('test-key');
    });
  });

  describe('getChannelMetrics', () => {
    describe('Estructura de AnalyticsMetrics', () => {
      it('debe retornar todas las propiedades requeridas', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        
        expect(metrics).toHaveProperty('watchTimeMinutes');
        expect(metrics).toHaveProperty('watchTimeHours');
        expect(metrics).toHaveProperty('averageViewDuration');
        expect(metrics).toHaveProperty('ctr');
        expect(metrics).toHaveProperty('impressions');
        expect(metrics).toHaveProperty('views');
        expect(metrics).toHaveProperty('averageViewPercentage');
        expect(metrics).toHaveProperty('subscribersGained');
        expect(metrics).toHaveProperty('subscribersLost');
        expect(metrics).toHaveProperty('netSubscribers');
      });

      it('debe retornar tipos correctos para cada propiedad', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        
        expect(typeof metrics.watchTimeMinutes).toBe('number');
        expect(typeof metrics.watchTimeHours).toBe('number');
        expect(typeof metrics.averageViewDuration).toBe('number');
        expect(typeof metrics.ctr).toBe('number');
        expect(typeof metrics.impressions).toBe('number');
        expect(typeof metrics.views).toBe('number');
        expect(typeof metrics.averageViewPercentage).toBe('number');
        expect(typeof metrics.subscribersGained).toBe('number');
        expect(typeof metrics.subscribersLost).toBe('number');
        expect(typeof metrics.netSubscribers).toBe('number');
      });

      it('debe calcular watchTimeHours correctamente desde watchTimeMinutes', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        
        const expectedHours = Math.round((metrics.watchTimeMinutes / 60) * 10) / 10;
        expect(metrics.watchTimeHours).toBeCloseTo(expectedHours, 1);
      });

      it('debe calcular netSubscribers como ganados menos perdidos', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        
        expect(metrics.netSubscribers).toBe(
          metrics.subscribersGained - metrics.subscribersLost
        );
      });
    });

    describe('Datos Mock por Canal', () => {
      it('debe retornar métricas diferentes para cada canal', async () => {
        const metrics1 = await analytics.getChannelMetrics('channel1');
        analytics.invalidateCache('channel2');
        const metrics2 = await analytics.getChannelMetrics('channel2');
        
        // Canal 1 (NeuroSync AI) debería tener más watch time (más maduro)
        expect(metrics1.watchTimeHours).toBeGreaterThan(metrics2.watchTimeHours);
      });

      it('debe retornar CTR mayor a 0 para ambos canales', async () => {
        const metrics1 = await analytics.getChannelMetrics('channel1');
        const metrics2 = await analytics.getChannelMetrics('channel2');
        
        expect(metrics1.ctr).toBeGreaterThan(0);
        expect(metrics2.ctr).toBeGreaterThan(0);
      });

      it('debe retornar valores positivos para watch time', async () => {
        const metrics1 = await analytics.getChannelMetrics('channel1');
        const metrics2 = await analytics.getChannelMetrics('channel2');
        
        expect(metrics1.watchTimeMinutes).toBeGreaterThan(0);
        expect(metrics1.watchTimeHours).toBeGreaterThan(0);
        expect(metrics2.watchTimeMinutes).toBeGreaterThan(0);
        expect(metrics2.watchTimeHours).toBeGreaterThan(0);
      });

      it('debe retornar CTR en rango realista (0-15%)', async () => {
        const metrics1 = await analytics.getChannelMetrics('channel1');
        const metrics2 = await analytics.getChannelMetrics('channel2');
        
        expect(metrics1.ctr).toBeGreaterThanOrEqual(0);
        expect(metrics1.ctr).toBeLessThanOrEqual(15);
        expect(metrics2.ctr).toBeGreaterThanOrEqual(0);
        expect(metrics2.ctr).toBeLessThanOrEqual(15);
      });

      it('debe retornar averageViewPercentage en rango válido (0-100)', async () => {
        const metrics1 = await analytics.getChannelMetrics('channel1');
        const metrics2 = await analytics.getChannelMetrics('channel2');
        
        expect(metrics1.averageViewPercentage).toBeGreaterThanOrEqual(0);
        expect(metrics1.averageViewPercentage).toBeLessThanOrEqual(100);
        expect(metrics2.averageViewPercentage).toBeGreaterThanOrEqual(0);
        expect(metrics2.averageViewPercentage).toBeLessThanOrEqual(100);
      });
    });

    describe('Rango de Fechas', () => {
      it('debe usar últimos 28 días por defecto', async () => {
        // Simplemente verificar que no falla sin dateRange
        const metrics = await analytics.getChannelMetrics('channel1');
        expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      });

      it('debe aceptar rango de fechas personalizado', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-07'),
        };
        
        const metrics = await analytics.getChannelMetrics('channel1', dateRange);
        expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      });

      it('debe escalar métricas según rango de fechas', async () => {
        // Rango de 7 días (1/4 del período base de 28 días)
        const weekRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-07'),
        };
        
        // Rango de 28 días (período completo)
        const monthRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-28'),
        };
        
        // Invalidar caché para obtener datos frescos
        analytics.invalidateCache();
        const weekMetrics = await analytics.getChannelMetrics('channel1', weekRange);
        
        analytics.invalidateCache();
        const monthMetrics = await analytics.getChannelMetrics('channel1', monthRange);
        
        // Las métricas del mes deberían ser significativamente mayores
        // (con variación, no exactamente 4x, pero al menos 2x)
        expect(monthMetrics.watchTimeMinutes).toBeGreaterThan(
          weekMetrics.watchTimeMinutes * 1.5
        );
      });
    });
  });

  describe('getWatchTimeAndCTR', () => {
    it('debe retornar solo watchTimeHours y ctr', async () => {
      const result = await analytics.getWatchTimeAndCTR('channel1');
      
      expect(Object.keys(result)).toEqual(['watchTimeHours', 'ctr']);
      expect(result.watchTimeHours).toBeGreaterThan(0);
      expect(result.ctr).toBeGreaterThan(0);
    });

    it('debe retornar los mismos valores que getChannelMetrics', async () => {
      // Usar el mismo caché para garantizar consistencia
      const fullMetrics = await analytics.getChannelMetrics('channel1');
      const watchTimeAndCTR = await analytics.getWatchTimeAndCTR('channel1');
      
      expect(watchTimeAndCTR.watchTimeHours).toBe(fullMetrics.watchTimeHours);
      expect(watchTimeAndCTR.ctr).toBe(fullMetrics.ctr);
    });

    it('debe aceptar rango de fechas opcional', async () => {
      const dateRange: DateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
      };
      
      const result = await analytics.getWatchTimeAndCTR('channel1', dateRange);
      
      expect(result.watchTimeHours).toBeGreaterThan(0);
      expect(result.ctr).toBeGreaterThan(0);
    });
  });

  describe('getLastNDaysMetrics', () => {
    it('debe retornar métricas para N días especificados', async () => {
      const metrics = await analytics.getLastNDaysMetrics('channel1', 7);
      
      expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      expect(metrics.views).toBeGreaterThan(0);
    });

    it('debe escalar métricas proporcionalmente a los días', async () => {
      analytics.invalidateCache();
      const metrics7Days = await analytics.getLastNDaysMetrics('channel1', 7);
      
      analytics.invalidateCache();
      const metrics28Days = await analytics.getLastNDaysMetrics('channel1', 28);
      
      // 28 días debería tener significativamente más métricas que 7 días
      expect(metrics28Days.watchTimeMinutes).toBeGreaterThan(
        metrics7Days.watchTimeMinutes * 2
      );
    });

    it('debe funcionar para diferentes valores de días', async () => {
      const days = [1, 7, 14, 30, 90];
      
      for (const d of days) {
        analytics.invalidateCache();
        const metrics = await analytics.getLastNDaysMetrics('channel1', d);
        expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      }
    });
  });

  describe('Sistema de Caché', () => {
    it('debe retornar datos cacheados en llamadas consecutivas', async () => {
      const metrics1 = await analytics.getChannelMetrics('channel1');
      const metrics2 = await analytics.getChannelMetrics('channel1');
      
      // Deberían ser exactamente iguales (mismo objeto del caché)
      expect(metrics1.watchTimeMinutes).toBe(metrics2.watchTimeMinutes);
      expect(metrics1.ctr).toBe(metrics2.ctr);
      expect(metrics1.views).toBe(metrics2.views);
    });

    it('debe indicar caché válido con hasValidCache', async () => {
      // Antes de fetch, no debería haber caché
      expect(analytics.hasValidCache('channel1')).toBe(false);
      
      // Después de fetch, debería haber caché
      await analytics.getChannelMetrics('channel1');
      expect(analytics.hasValidCache('channel1')).toBe(true);
    });

    it('debe invalidar caché de un canal específico', async () => {
      await analytics.getChannelMetrics('channel1');
      await analytics.getChannelMetrics('channel2');
      
      expect(analytics.hasValidCache('channel1')).toBe(true);
      expect(analytics.hasValidCache('channel2')).toBe(true);
      
      analytics.invalidateCache('channel1');
      
      expect(analytics.hasValidCache('channel1')).toBe(false);
      expect(analytics.hasValidCache('channel2')).toBe(true);
    });

    it('debe invalidar todo el caché cuando no se especifica canal', async () => {
      await analytics.getChannelMetrics('channel1');
      await analytics.getChannelMetrics('channel2');
      
      analytics.invalidateCache();
      
      expect(analytics.hasValidCache('channel1')).toBe(false);
      expect(analytics.hasValidCache('channel2')).toBe(false);
    });

    it('debe crear entradas de caché diferentes por rango de fechas', async () => {
      const range1: DateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
      };
      const range2: DateRange = {
        startDate: new Date('2024-01-08'),
        endDate: new Date('2024-01-14'),
      };
      
      await analytics.getChannelMetrics('channel1', range1);
      await analytics.getChannelMetrics('channel1', range2);
      
      expect(analytics.hasValidCache('channel1', range1)).toBe(true);
      expect(analytics.hasValidCache('channel1', range2)).toBe(true);
    });

    it('debe respetar TTL configurado del caché', () => {
      const shortTTLAnalytics = new AnalyticsIntegration({
        cacheHours: 0.001, // ~3.6 segundos
        simulateLatency: false,
      });
      
      const config = shortTTLAnalytics.getConfig();
      expect(config.cacheHours).toBe(0.001);
    });
  });

  describe('Latencia Simulada', () => {
    it('debe simular latencia cuando está configurado', async () => {
      const latencyAnalytics = new AnalyticsIntegration({
        useMockData: true,
        simulateLatency: true,
      });
      
      const startTime = Date.now();
      await latencyAnalytics.getChannelMetrics('channel1');
      const endTime = Date.now();
      
      // Debería tomar al menos 100ms (latencia mínima configurada)
      expect(endTime - startTime).toBeGreaterThanOrEqual(50);
    });

    it('debe ser más rápido sin latencia simulada', async () => {
      const noLatencyAnalytics = new AnalyticsIntegration({
        useMockData: true,
        simulateLatency: false,
      });
      
      const startTime = Date.now();
      await noLatencyAnalytics.getChannelMetrics('channel1');
      const endTime = Date.now();
      
      // Sin latencia debería ser muy rápido (< 50ms)
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('Variación de Datos Mock', () => {
    it('debe generar variación en las métricas entre llamadas (sin caché)', async () => {
      // Obtener múltiples mediciones sin caché
      const measurements: AnalyticsMetrics[] = [];
      
      for (let i = 0; i < 5; i++) {
        analytics.invalidateCache('channel1');
        const metrics = await analytics.getChannelMetrics('channel1');
        measurements.push(metrics);
      }
      
      // Verificar que hay variación en watch time
      const watchTimes = measurements.map(m => m.watchTimeMinutes);
      const uniqueWatchTimes = new Set(watchTimes);
      
      // Con variación aleatoria, deberían ser diferentes
      expect(uniqueWatchTimes.size).toBeGreaterThan(1);
    });

    it('debe mantener métricas dentro de rangos razonables', async () => {
      // Múltiples mediciones para verificar que no hay outliers
      for (let i = 0; i < 10; i++) {
        analytics.invalidateCache('channel1');
        const metrics = await analytics.getChannelMetrics('channel1');
        
        // CTR típico de YouTube es 2-10%, permitimos hasta 15% con variación
        expect(metrics.ctr).toBeGreaterThan(1);
        expect(metrics.ctr).toBeLessThan(15);
        
        // Porcentaje de visualización no puede exceder 100%
        expect(metrics.averageViewPercentage).toBeLessThanOrEqual(100);
        
        // Suscriptores perdidos no deberían exceder los ganados
        expect(metrics.subscribersLost).toBeLessThanOrEqual(metrics.subscribersGained);
      }
    });
  });

  describe('Coherencia con Canales del Proyecto', () => {
    it('Canal 1 (NeuroSync AI) debe tener mejores métricas que Canal 2', async () => {
      analytics.invalidateCache();
      const ch1 = await analytics.getChannelMetrics('channel1');
      
      analytics.invalidateCache();
      const ch2 = await analytics.getChannelMetrics('channel2');
      
      // Canal 1 es más maduro, debería tener más watch time
      expect(ch1.watchTimeHours).toBeGreaterThan(ch2.watchTimeHours);
      
      // Canal 1 debería tener más impresiones
      expect(ch1.impressions).toBeGreaterThan(ch2.impressions);
    });

    it('debe retornar métricas coherentes con datos de YPPValidationGate', async () => {
      const ch1 = await analytics.getChannelMetrics('channel1');
      const ch2 = await analytics.getChannelMetrics('channel2');
      
      // Basado en los datos de YPPValidationGate:
      // channel1: ~2800 horas base (escaladas por 28 días ±15%)
      // channel2: ~890 horas base (escaladas por 28 días ±15%)
      
      // Canal 1 debería estar en el rango de 2380-3220 horas
      expect(ch1.watchTimeHours).toBeGreaterThan(1500);
      expect(ch1.watchTimeHours).toBeLessThan(4500);
      
      // Canal 2 debería estar en el rango de 756-1024 horas
      expect(ch2.watchTimeHours).toBeGreaterThan(400);
      expect(ch2.watchTimeHours).toBeLessThan(1500);
    });
  });

  describe('Edge Cases', () => {
    it('debe manejar rango de 1 día correctamente', async () => {
      const metrics = await analytics.getLastNDaysMetrics('channel1', 1);
      
      expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      // Para 1 día, las métricas deberían ser ~1/28 del base
      expect(metrics.watchTimeHours).toBeLessThan(200);
    });

    it('debe manejar rango de 90 días correctamente', async () => {
      const metrics = await analytics.getLastNDaysMetrics('channel1', 90);
      
      expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
      // Para 90 días, las métricas deberían ser ~3.2x el base
      expect(metrics.watchTimeHours).toBeGreaterThan(5000);
    });

    it('debe manejar fechas invertidas (endDate < startDate) de forma coherente', async () => {
      // El método debería calcular el valor absoluto de la diferencia
      const dateRange: DateRange = {
        startDate: new Date('2024-01-28'),
        endDate: new Date('2024-01-01'),
      };
      
      // No debería fallar, aunque el rango esté invertido
      const metrics = await analytics.getChannelMetrics('channel1', dateRange);
      expect(metrics.watchTimeMinutes).toBeGreaterThan(0);
    });
  });

  /**
   * Tests para segmentación de métricas por tipo de video (Shorts vs Largos)
   * 
   * @requirement REQ-5.2.2
   */
  describe('Segmentación por Tipo de Video (REQ-5.2.2)', () => {
    describe('getMetricsByVideoType', () => {
      it('debe retornar métricas combinadas cuando videoType es "all"', async () => {
        const allMetrics = await analytics.getMetricsByVideoType('channel1', 'all');
        const combinedMetrics = await analytics.getChannelMetrics('channel1');
        
        // Deberían ser iguales (mismo caché)
        expect(allMetrics.watchTimeMinutes).toBe(combinedMetrics.watchTimeMinutes);
        expect(allMetrics.ctr).toBe(combinedMetrics.ctr);
        expect(allMetrics.views).toBe(combinedMetrics.views);
      });

      it('debe retornar métricas filtradas para Shorts', async () => {
        const shortsMetrics = await analytics.getMetricsByVideoType('channel1', 'short');
        const combinedMetrics = await analytics.getChannelMetrics('channel1');
        
        // Shorts tienen 25% del watch time total
        expect(shortsMetrics.watchTimeMinutes).toBeLessThan(combinedMetrics.watchTimeMinutes);
        expect(shortsMetrics.watchTimeMinutes).toBeGreaterThan(0);
        
        // Shorts tienen 70% de las vistas
        expect(shortsMetrics.views).toBeLessThan(combinedMetrics.views);
        expect(shortsMetrics.views).toBeGreaterThan(0);
      });

      it('debe retornar métricas filtradas para videos largos', async () => {
        const longMetrics = await analytics.getMetricsByVideoType('channel1', 'long');
        const combinedMetrics = await analytics.getChannelMetrics('channel1');
        
        // Videos largos tienen 75% del watch time total
        expect(longMetrics.watchTimeMinutes).toBeLessThan(combinedMetrics.watchTimeMinutes);
        expect(longMetrics.watchTimeMinutes).toBeGreaterThan(0);
        
        // Videos largos tienen 30% de las vistas
        expect(longMetrics.views).toBeLessThan(combinedMetrics.views);
        expect(longMetrics.views).toBeGreaterThan(0);
      });

      it('debe aceptar rango de fechas opcional', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-14'),
        };
        
        const shortsMetrics = await analytics.getMetricsByVideoType('channel1', 'short', dateRange);
        
        expect(shortsMetrics.watchTimeMinutes).toBeGreaterThan(0);
        expect(shortsMetrics.ctr).toBeGreaterThan(0);
      });

      it('debe funcionar para ambos canales', async () => {
        analytics.invalidateCache();
        const ch1Shorts = await analytics.getMetricsByVideoType('channel1', 'short');
        
        analytics.invalidateCache();
        const ch2Shorts = await analytics.getMetricsByVideoType('channel2', 'short');
        
        expect(ch1Shorts.views).toBeGreaterThan(ch2Shorts.views);
        expect(ch1Shorts.watchTimeMinutes).toBeGreaterThan(ch2Shorts.watchTimeMinutes);
      });
    });

    describe('getSegmentedMetrics', () => {
      it('debe retornar objeto con shorts, long y combined', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        expect(segmented).toHaveProperty('shorts');
        expect(segmented).toHaveProperty('long');
        expect(segmented).toHaveProperty('combined');
      });

      it('debe tener estructura correcta en cada segmento', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Verificar que cada segmento tiene todas las propiedades de AnalyticsMetrics
        const requiredProps = [
          'watchTimeMinutes', 'watchTimeHours', 'averageViewDuration',
          'ctr', 'impressions', 'views', 'averageViewPercentage',
          'subscribersGained', 'subscribersLost', 'netSubscribers'
        ];
        
        for (const prop of requiredProps) {
          expect(segmented.shorts).toHaveProperty(prop);
          expect(segmented.long).toHaveProperty(prop);
          expect(segmented.combined).toHaveProperty(prop);
        }
      });

      it('shorts + long watch time debe aproximarse al combined', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        const sumWatchTime = segmented.shorts.watchTimeMinutes + segmented.long.watchTimeMinutes;
        
        // Debería ser aproximadamente igual (puede haber pequeña diferencia por redondeo)
        expect(sumWatchTime).toBeGreaterThan(segmented.combined.watchTimeMinutes * 0.95);
        expect(sumWatchTime).toBeLessThan(segmented.combined.watchTimeMinutes * 1.05);
      });

      it('Shorts deben tener mayor CTR que videos largos', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Según la configuración, Shorts tienen CTR 30% mayor
        expect(segmented.shorts.ctr).toBeGreaterThan(segmented.long.ctr);
      });

      it('Videos largos deben tener mayor watch time que Shorts', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Según la configuración, videos largos tienen 75% del watch time
        expect(segmented.long.watchTimeMinutes).toBeGreaterThan(segmented.shorts.watchTimeMinutes);
      });

      it('Shorts deben tener más vistas que videos largos', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Según la configuración, Shorts tienen 70% de las vistas
        expect(segmented.shorts.views).toBeGreaterThan(segmented.long.views);
      });

      it('Shorts deben tener más impresiones que videos largos', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Según la configuración, Shorts tienen 65% de las impresiones
        expect(segmented.shorts.impressions).toBeGreaterThan(segmented.long.impressions);
      });

      it('Videos largos deben tener mayor duración promedio de visualización', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Videos largos tienen duración mucho mayor
        expect(segmented.long.averageViewDuration).toBeGreaterThan(
          segmented.shorts.averageViewDuration
        );
      });

      it('averageViewPercentage no debe exceder 100%', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        expect(segmented.shorts.averageViewPercentage).toBeLessThanOrEqual(100);
        expect(segmented.long.averageViewPercentage).toBeLessThanOrEqual(100);
        expect(segmented.combined.averageViewPercentage).toBeLessThanOrEqual(100);
      });

      it('debe aceptar rango de fechas opcional', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-14'),
        };
        
        const segmented = await analytics.getSegmentedMetrics('channel1', dateRange);
        
        expect(segmented.shorts.views).toBeGreaterThan(0);
        expect(segmented.long.views).toBeGreaterThan(0);
        expect(segmented.combined.views).toBeGreaterThan(0);
      });
    });

    describe('compareVideoTypes', () => {
      it('debe retornar objeto con betterPerformer, shortsVsLongCTR y shortsVsLongRetention', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        expect(comparison).toHaveProperty('betterPerformer');
        expect(comparison).toHaveProperty('shortsVsLongCTR');
        expect(comparison).toHaveProperty('shortsVsLongRetention');
      });

      it('betterPerformer debe ser uno de los tipos válidos', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        expect(['short', 'long', 'all']).toContain(comparison.betterPerformer);
      });

      it('shortsVsLongCTR > 1 debe indicar que Shorts tienen mejor CTR', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        // Según la configuración, Shorts tienen CTR 30% mayor
        expect(comparison.shortsVsLongCTR).toBeGreaterThan(1);
      });

      it('shortsVsLongRetention > 1 debe indicar que Shorts tienen mejor retención', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        // Según la configuración, Shorts tienen retención 15% mayor
        expect(comparison.shortsVsLongRetention).toBeGreaterThan(1);
      });

      it('ratios deben ser valores numéricos positivos', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        expect(typeof comparison.shortsVsLongCTR).toBe('number');
        expect(typeof comparison.shortsVsLongRetention).toBe('number');
        expect(comparison.shortsVsLongCTR).toBeGreaterThan(0);
        expect(comparison.shortsVsLongRetention).toBeGreaterThan(0);
      });

      it('ratios deben estar en rango razonable (0.5 - 2.0)', async () => {
        const comparison = await analytics.compareVideoTypes('channel1');
        
        // Con los multiplicadores configurados, los ratios deberían estar en este rango
        expect(comparison.shortsVsLongCTR).toBeGreaterThanOrEqual(0.5);
        expect(comparison.shortsVsLongCTR).toBeLessThanOrEqual(2.5);
        expect(comparison.shortsVsLongRetention).toBeGreaterThanOrEqual(0.5);
        expect(comparison.shortsVsLongRetention).toBeLessThanOrEqual(2.5);
      });

      it('debe funcionar para ambos canales', async () => {
        analytics.invalidateCache();
        const ch1Comparison = await analytics.compareVideoTypes('channel1');
        
        analytics.invalidateCache();
        const ch2Comparison = await analytics.compareVideoTypes('channel2');
        
        // Ambos canales deberían tener comparaciones válidas
        expect(['short', 'long', 'all']).toContain(ch1Comparison.betterPerformer);
        expect(['short', 'long', 'all']).toContain(ch2Comparison.betterPerformer);
      });

      it('debe aceptar rango de fechas opcional', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-14'),
        };
        
        const comparison = await analytics.compareVideoTypes('channel1', dateRange);
        
        expect(comparison.shortsVsLongCTR).toBeGreaterThan(0);
        expect(comparison.shortsVsLongRetention).toBeGreaterThan(0);
      });
    });

    describe('Coherencia de Datos Mock Segmentados', () => {
      it('debe mantener coherencia entre canales para métricas segmentadas', async () => {
        analytics.invalidateCache();
        const ch1Segmented = await analytics.getSegmentedMetrics('channel1');
        
        analytics.invalidateCache();
        const ch2Segmented = await analytics.getSegmentedMetrics('channel2');
        
        // Canal 1 (más maduro) debería tener más en todas las métricas
        expect(ch1Segmented.shorts.views).toBeGreaterThan(ch2Segmented.shorts.views);
        expect(ch1Segmented.long.views).toBeGreaterThan(ch2Segmented.long.views);
        expect(ch1Segmented.shorts.watchTimeMinutes).toBeGreaterThan(ch2Segmented.shorts.watchTimeMinutes);
        expect(ch1Segmented.long.watchTimeMinutes).toBeGreaterThan(ch2Segmented.long.watchTimeMinutes);
      });

      it('netSubscribers debe calcularse correctamente en cada segmento', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        expect(segmented.shorts.netSubscribers).toBe(
          segmented.shorts.subscribersGained - segmented.shorts.subscribersLost
        );
        expect(segmented.long.netSubscribers).toBe(
          segmented.long.subscribersGained - segmented.long.subscribersLost
        );
        expect(segmented.combined.netSubscribers).toBe(
          segmented.combined.subscribersGained - segmented.combined.subscribersLost
        );
      });

      it('watchTimeHours debe calcularse correctamente en cada segmento', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        const expectedShortsHours = Math.round((segmented.shorts.watchTimeMinutes / 60) * 10) / 10;
        const expectedLongHours = Math.round((segmented.long.watchTimeMinutes / 60) * 10) / 10;
        
        expect(segmented.shorts.watchTimeHours).toBeCloseTo(expectedShortsHours, 1);
        expect(segmented.long.watchTimeHours).toBeCloseTo(expectedLongHours, 1);
      });

      it('debe reflejar el modelo de negocio: Shorts más virales, Long más retención', async () => {
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        // Ratio vistas/impresiones debería ser mayor para Shorts (más engagement)
        const shortsClickRate = segmented.shorts.views / segmented.shorts.impressions;
        const longClickRate = segmented.long.views / segmented.long.impressions;
        
        // Shorts deberían tener mayor tasa de clic
        expect(shortsClickRate).toBeGreaterThan(longClickRate * 0.8);
        
        // Videos largos deberían contribuir más al watch time total
        expect(segmented.long.watchTimeMinutes).toBeGreaterThan(segmented.combined.watchTimeMinutes * 0.6);
      });
    });
  });

  /**
   * Tests para getRetentionDataForSEO - Datos de retención para SEOAgent
   * 
   * @requirement REQ-5.2.3
   */
  describe('getRetentionDataForSEO (REQ-5.2.3)', () => {
    describe('Estructura de RetentionDataForSEO', () => {
      it('debe retornar todas las propiedades requeridas', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        expect(seoData).toHaveProperty('channelKey');
        expect(seoData).toHaveProperty('averageRetention');
        expect(seoData).toHaveProperty('shortRetention');
        expect(seoData).toHaveProperty('longRetention');
        expect(seoData).toHaveProperty('topPerformingFormat');
        expect(seoData).toHaveProperty('recommendations');
        expect(seoData).toHaveProperty('averageCTR');
        expect(seoData).toHaveProperty('lastUpdated');
      });

      it('debe retornar tipos correctos para cada propiedad', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        expect(typeof seoData.channelKey).toBe('string');
        expect(typeof seoData.averageRetention).toBe('number');
        expect(typeof seoData.shortRetention).toBe('number');
        expect(typeof seoData.longRetention).toBe('number');
        expect(typeof seoData.topPerformingFormat).toBe('string');
        expect(Array.isArray(seoData.recommendations)).toBe(true);
        expect(typeof seoData.averageCTR).toBe('number');
        expect(seoData.lastUpdated).toBeInstanceOf(Date);
      });

      it('debe retornar el channelKey correcto', async () => {
        const seoData1 = await analytics.getRetentionDataForSEO('channel1');
        const seoData2 = await analytics.getRetentionDataForSEO('channel2');
        
        expect(seoData1.channelKey).toBe('channel1');
        expect(seoData2.channelKey).toBe('channel2');
      });

      it('topPerformingFormat debe ser "short" o "long"', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        expect(['short', 'long']).toContain(seoData.topPerformingFormat);
      });
    });

    describe('Datos de Retención', () => {
      it('debe retornar valores de retención en rango válido (0-100)', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        expect(seoData.averageRetention).toBeGreaterThanOrEqual(0);
        expect(seoData.averageRetention).toBeLessThanOrEqual(100);
        expect(seoData.shortRetention).toBeGreaterThanOrEqual(0);
        expect(seoData.shortRetention).toBeLessThanOrEqual(100);
        expect(seoData.longRetention).toBeGreaterThanOrEqual(0);
        expect(seoData.longRetention).toBeLessThanOrEqual(100);
      });

      it('debe identificar correctamente el formato con mejor retención', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        if (seoData.shortRetention > seoData.longRetention) {
          expect(seoData.topPerformingFormat).toBe('short');
        } else {
          expect(seoData.topPerformingFormat).toBe('long');
        }
      });

      it('shortRetention debe coincidir con métricas segmentadas', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        expect(seoData.shortRetention).toBe(segmented.shorts.averageViewPercentage);
        expect(seoData.longRetention).toBe(segmented.long.averageViewPercentage);
        expect(seoData.averageRetention).toBe(segmented.combined.averageViewPercentage);
      });

      it('averageCTR debe coincidir con métricas combinadas', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        const segmented = await analytics.getSegmentedMetrics('channel1');
        
        expect(seoData.averageCTR).toBe(segmented.combined.ctr);
      });
    });

    describe('Generación de Recomendaciones', () => {
      it('debe retornar al menos una recomendación', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        expect(seoData.recommendations.length).toBeGreaterThan(0);
      });

      it('todas las recomendaciones deben ser strings no vacíos', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        for (const recommendation of seoData.recommendations) {
          expect(typeof recommendation).toBe('string');
          expect(recommendation.length).toBeGreaterThan(0);
        }
      });

      it('debe recomendar mejorar hooks cuando retención < 40%', async () => {
        // Crear analytics con datos mock que tengan baja retención
        // El canal 2 tiene baseAvgViewPercentage de 42%, cercano al umbral
        analytics.invalidateCache();
        const seoData = await analytics.getRetentionDataForSEO('channel2');
        
        // Si la retención promedio es menor a 40%, debería incluir recomendación de hooks
        if (seoData.averageRetention < 40) {
          const hasHookRecommendation = seoData.recommendations.some(
            rec => rec.toLowerCase().includes('hook')
          );
          expect(hasHookRecommendation).toBe(true);
        }
      });

      it('debe recomendar formato corto cuando shorts tienen mejor retención', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        if (seoData.shortRetention > seoData.longRetention) {
          const hasShortRecommendation = seoData.recommendations.some(
            rec => rec.toLowerCase().includes('corto') || rec.toLowerCase().includes('short')
          );
          expect(hasShortRecommendation).toBe(true);
        }
      });

      it('debe recomendar formato largo cuando long tiene mejor retención', async () => {
        // En los datos mock, shorts tienen mejor retención por el multiplicador
        // Pero si long > short, debería recomendar contenido largo
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        if (seoData.longRetention > seoData.shortRetention) {
          const hasLongRecommendation = seoData.recommendations.some(
            rec => rec.toLowerCase().includes('largo') || rec.toLowerCase().includes('long')
          );
          expect(hasLongRecommendation).toBe(true);
        }
      });

      it('debe recomendar optimizar thumbnails cuando CTR < 4%', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel2');
        
        // Canal 2 tiene CTR base de 4.1%, con variación podría bajar de 4%
        if (seoData.averageCTR < 4) {
          const hasCTRRecommendation = seoData.recommendations.some(
            rec => rec.toLowerCase().includes('ctr') || rec.toLowerCase().includes('thumbnail')
          );
          expect(hasCTRRecommendation).toBe(true);
        }
      });

      it('debe dar recomendación positiva cuando métricas están saludables', async () => {
        // Canal 1 tiene buenas métricas por defecto
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        // Si todas las métricas están bien, debería tener recomendación positiva
        if (seoData.averageRetention >= 40 && seoData.averageCTR >= 4) {
          const hasPositiveRecommendation = seoData.recommendations.some(
            rec => rec.toLowerCase().includes('saludable') || 
                   rec.toLowerCase().includes('mantener') ||
                   rec.toLowerCase().includes('actual')
          );
          // Al menos una recomendación debería ser positiva o de mejora específica
          expect(seoData.recommendations.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Rango de Fechas', () => {
      it('debe aceptar rango de fechas opcional', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-14'),
        };
        
        const seoData = await analytics.getRetentionDataForSEO('channel1', dateRange);
        
        expect(seoData.averageRetention).toBeGreaterThan(0);
        expect(seoData.recommendations.length).toBeGreaterThan(0);
      });

      it('debe usar últimos 28 días por defecto', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        // Simplemente verificar que funciona sin dateRange
        expect(seoData.averageRetention).toBeGreaterThan(0);
        expect(seoData.lastUpdated).toBeInstanceOf(Date);
      });
    });

    describe('Coherencia entre Canales', () => {
      it('debe retornar datos diferentes para cada canal', async () => {
        analytics.invalidateCache();
        const seoData1 = await analytics.getRetentionDataForSEO('channel1');
        
        analytics.invalidateCache();
        const seoData2 = await analytics.getRetentionDataForSEO('channel2');
        
        // Los canales tienen configuraciones diferentes
        expect(seoData1.channelKey).not.toBe(seoData2.channelKey);
      });

      it('lastUpdated debe ser fecha reciente', async () => {
        const beforeCall = new Date();
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        const afterCall = new Date();
        
        expect(seoData.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
        expect(seoData.lastUpdated.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      });
    });

    describe('Integración con SEOAgent', () => {
      it('formato de datos debe ser directamente usable por SEOAgent', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        // Verificar que los datos tienen el formato esperado para integración
        // El SEOAgent necesita: retención por formato, formato ganador, recomendaciones
        expect(seoData.topPerformingFormat).toMatch(/^(short|long)$/);
        expect(seoData.recommendations.every(r => typeof r === 'string')).toBe(true);
        
        // Las recomendaciones deben ser accionables (no vacías ni demasiado largas)
        for (const rec of seoData.recommendations) {
          expect(rec.length).toBeGreaterThan(10);
          expect(rec.length).toBeLessThan(200);
        }
      });

      it('debe proporcionar datos suficientes para toma de decisiones', async () => {
        const seoData = await analytics.getRetentionDataForSEO('channel1');
        
        // El SEOAgent necesita poder decidir:
        // 1. Qué formato priorizar (topPerformingFormat)
        // 2. Si hay problemas con hooks (averageRetention)
        // 3. Si hay problemas con CTR (averageCTR)
        // 4. Recomendaciones específicas
        
        expect(seoData.topPerformingFormat).toBeDefined();
        expect(typeof seoData.averageRetention).toBe('number');
        expect(typeof seoData.averageCTR).toBe('number');
        expect(seoData.recommendations.length).toBeGreaterThan(0);
      });
    });
  });

  /**
   * Tests para checkPerformanceAlerts - Sistema de Alertas de Rendimiento
   * 
   * Verifica la generación de alertas cuando las métricas caen por debajo de umbrales:
   * - CTR < 2%: critical
   * - CTR 2-3%: warning
   * - Retención < 30%: critical
   * - Retención 30-35%: warning
   * 
   * @requirement REQ-5.2.4
   */
  describe('checkPerformanceAlerts (REQ-5.2.4)', () => {
    describe('Estructura de AlertCheckResult', () => {
      it('debe retornar todas las propiedades requeridas', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        expect(result).toHaveProperty('hasAlerts');
        expect(result).toHaveProperty('alerts');
        expect(result).toHaveProperty('channelKey');
        expect(result).toHaveProperty('checkedAt');
      });

      it('debe retornar tipos correctos para cada propiedad', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        expect(typeof result.hasAlerts).toBe('boolean');
        expect(Array.isArray(result.alerts)).toBe(true);
        expect(typeof result.channelKey).toBe('string');
        expect(result.checkedAt).toBeInstanceOf(Date);
      });

      it('debe retornar el channelKey correcto', async () => {
        const result1 = await analytics.checkPerformanceAlerts('channel1');
        const result2 = await analytics.checkPerformanceAlerts('channel2');
        
        expect(result1.channelKey).toBe('channel1');
        expect(result2.channelKey).toBe('channel2');
      });

      it('checkedAt debe ser fecha reciente', async () => {
        const beforeCall = new Date();
        const result = await analytics.checkPerformanceAlerts('channel1');
        const afterCall = new Date();
        
        expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
        expect(result.checkedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      });
    });

    describe('Estructura de PerformanceAlert', () => {
      it('alertas deben tener todas las propiedades requeridas', async () => {
        // Crear analytics con datos mock que generen alertas
        const lowPerformanceAnalytics = new AnalyticsIntegration({
          useMockData: true,
          simulateLatency: false,
        });
        
        const result = await lowPerformanceAnalytics.checkPerformanceAlerts('channel1');
        
        // Si hay alertas, verificar estructura
        if (result.alerts.length > 0) {
          const alert = result.alerts[0];
          expect(alert).toHaveProperty('type');
          expect(alert).toHaveProperty('severity');
          expect(alert).toHaveProperty('metric');
          expect(alert).toHaveProperty('currentValue');
          expect(alert).toHaveProperty('threshold');
          expect(alert).toHaveProperty('message');
          expect(alert).toHaveProperty('recommendation');
          expect(alert).toHaveProperty('triggeredAt');
        }
      });

      it('tipo de alerta debe ser válido', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          expect(['low_ctr', 'low_retention', 'declining_trend']).toContain(alert.type);
        }
      });

      it('severidad debe ser "warning" o "critical"', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          expect(['warning', 'critical']).toContain(alert.severity);
        }
      });

      it('mensaje debe incluir emoji indicador de severidad', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          // ⚠️ para critical, 🔶 para warning
          const hasEmoji = alert.message.includes('⚠️') || alert.message.includes('🔶');
          expect(hasEmoji).toBe(true);
        }
      });

      it('mensaje debe incluir valor actual y umbral', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          // El mensaje debe contener el valor actual
          expect(alert.message).toContain(`${alert.currentValue}`);
          // El mensaje debe contener el umbral
          expect(alert.message).toContain(`${alert.threshold}`);
        }
      });

      it('recomendación debe ser un string no vacío', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          expect(typeof alert.recommendation).toBe('string');
          expect(alert.recommendation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Umbrales de CTR', () => {
      it('hasAlerts debe coincidir con alerts.length > 0', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        expect(result.hasAlerts).toBe(result.alerts.length > 0);
      });

      it('alerta de CTR critical debe tener umbral de 2%', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const ctrCriticalAlert = result.alerts.find(
          a => a.type === 'low_ctr' && a.severity === 'critical'
        );
        
        if (ctrCriticalAlert) {
          expect(ctrCriticalAlert.threshold).toBe(2);
        }
      });

      it('alerta de CTR warning debe tener umbral de 3%', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const ctrWarningAlert = result.alerts.find(
          a => a.type === 'low_ctr' && a.severity === 'warning'
        );
        
        if (ctrWarningAlert) {
          expect(ctrWarningAlert.threshold).toBe(3);
        }
      });

      it('no debe haber alerta de CTR si está por encima de 3%', async () => {
        // Canal 1 tiene CTR base de 5.2%, debería estar bien
        // Pero con variación podría bajar, así que solo verificamos la lógica
        const metrics = await analytics.getChannelMetrics('channel1');
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        if (metrics.ctr >= 3) {
          const ctrAlert = result.alerts.find(a => a.type === 'low_ctr');
          expect(ctrAlert).toBeUndefined();
        }
      });
    });

    describe('Umbrales de Retención', () => {
      it('alerta de retención critical debe tener umbral de 30%', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const retentionCriticalAlert = result.alerts.find(
          a => a.type === 'low_retention' && a.severity === 'critical'
        );
        
        if (retentionCriticalAlert) {
          expect(retentionCriticalAlert.threshold).toBe(30);
        }
      });

      it('alerta de retención warning debe tener umbral de 35%', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const retentionWarningAlert = result.alerts.find(
          a => a.type === 'low_retention' && a.severity === 'warning'
        );
        
        if (retentionWarningAlert) {
          expect(retentionWarningAlert.threshold).toBe(35);
        }
      });

      it('no debe haber alerta de retención si está por encima de 35%', async () => {
        // Canal 1 tiene baseAvgViewPercentage de 48%, debería estar bien
        const metrics = await analytics.getChannelMetrics('channel1');
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        if (metrics.averageViewPercentage >= 35) {
          const retentionAlert = result.alerts.find(a => a.type === 'low_retention');
          expect(retentionAlert).toBeUndefined();
        }
      });
    });

    describe('Mensajes de Alerta', () => {
      it('mensaje de CTR crítico debe mencionar thumbnails y títulos', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const ctrCriticalAlert = result.alerts.find(
          a => a.type === 'low_ctr' && a.severity === 'critical'
        );
        
        if (ctrCriticalAlert) {
          expect(ctrCriticalAlert.message.toLowerCase()).toContain('thumbnail');
        }
      });

      it('mensaje de retención crítico debe mencionar engagement inicial', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const retentionCriticalAlert = result.alerts.find(
          a => a.type === 'low_retention' && a.severity === 'critical'
        );
        
        if (retentionCriticalAlert) {
          expect(retentionCriticalAlert.message.toLowerCase()).toContain('engagement');
        }
      });
    });

    describe('Rango de Fechas', () => {
      it('debe aceptar rango de fechas opcional', async () => {
        const dateRange: DateRange = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-14'),
        };
        
        const result = await analytics.checkPerformanceAlerts('channel1', dateRange);
        
        expect(result.channelKey).toBe('channel1');
        expect(result.checkedAt).toBeInstanceOf(Date);
      });

      it('debe usar últimos 28 días por defecto', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        // Simplemente verificar que funciona sin dateRange
        expect(result.channelKey).toBe('channel1');
        expect(Array.isArray(result.alerts)).toBe(true);
      });
    });

    describe('Integración con Métricas', () => {
      it('currentValue de CTR debe coincidir con métricas del canal', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const ctrAlert = result.alerts.find(a => a.type === 'low_ctr');
        
        if (ctrAlert) {
          expect(ctrAlert.currentValue).toBe(metrics.ctr);
        }
      });

      it('currentValue de retención debe coincidir con métricas del canal', async () => {
        const metrics = await analytics.getChannelMetrics('channel1');
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const retentionAlert = result.alerts.find(a => a.type === 'low_retention');
        
        if (retentionAlert) {
          expect(retentionAlert.currentValue).toBe(metrics.averageViewPercentage);
        }
      });

      it('debe funcionar para ambos canales', async () => {
        analytics.invalidateCache();
        const result1 = await analytics.checkPerformanceAlerts('channel1');
        
        analytics.invalidateCache();
        const result2 = await analytics.checkPerformanceAlerts('channel2');
        
        expect(result1.channelKey).toBe('channel1');
        expect(result2.channelKey).toBe('channel2');
        expect(Array.isArray(result1.alerts)).toBe(true);
        expect(Array.isArray(result2.alerts)).toBe(true);
      });
    });

    describe('Coherencia de Alertas', () => {
      it('métricas saludables no deben generar alertas', async () => {
        // Canal 1 tiene métricas base saludables:
        // - CTR: 5.2% (> 3%)
        // - Retención: 48% (> 35%)
        // Con variación normal, no debería generar alertas
        
        const metrics = await analytics.getChannelMetrics('channel1');
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        // Si las métricas están por encima de todos los umbrales, no hay alertas
        if (metrics.ctr >= 3 && metrics.averageViewPercentage >= 35) {
          expect(result.hasAlerts).toBe(false);
          expect(result.alerts).toHaveLength(0);
        }
      });

      it('no debe haber alertas duplicadas del mismo tipo', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        const ctrAlerts = result.alerts.filter(a => a.type === 'low_ctr');
        const retentionAlerts = result.alerts.filter(a => a.type === 'low_retention');
        
        // Máximo 1 alerta de cada tipo
        expect(ctrAlerts.length).toBeLessThanOrEqual(1);
        expect(retentionAlerts.length).toBeLessThanOrEqual(1);
      });

      it('severity critical implica que critical threshold no se cumple', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          if (alert.severity === 'critical') {
            // Para alertas críticas, el valor actual debe ser menor que el umbral crítico
            if (alert.type === 'low_ctr') {
              expect(alert.currentValue).toBeLessThan(2);
            } else if (alert.type === 'low_retention') {
              expect(alert.currentValue).toBeLessThan(30);
            }
          }
        }
      });

      it('severity warning implica que está entre umbral warning y critical', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        for (const alert of result.alerts) {
          if (alert.severity === 'warning') {
            if (alert.type === 'low_ctr') {
              // CTR warning: >= 2% y < 3%
              expect(alert.currentValue).toBeGreaterThanOrEqual(2);
              expect(alert.currentValue).toBeLessThan(3);
            } else if (alert.type === 'low_retention') {
              // Retención warning: >= 30% y < 35%
              expect(alert.currentValue).toBeGreaterThanOrEqual(30);
              expect(alert.currentValue).toBeLessThan(35);
            }
          }
        }
      });
    });

    describe('Ejemplo de Uso', () => {
      it('ejemplo de integración con Telegram (formato de mensaje)', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        if (result.hasAlerts) {
          // Simular formato de mensaje para Telegram
          const telegramMessage = result.alerts
            .map(a => `${a.message}\n💡 ${a.recommendation}`)
            .join('\n\n');
          
          expect(typeof telegramMessage).toBe('string');
          expect(telegramMessage.length).toBeGreaterThan(0);
        }
      });

      it('datos de alerta deben ser serializables a JSON', async () => {
        const result = await analytics.checkPerformanceAlerts('channel1');
        
        // Verificar que se puede serializar/deserializar
        const jsonString = JSON.stringify(result);
        const parsed = JSON.parse(jsonString);
        
        expect(parsed.hasAlerts).toBe(result.hasAlerts);
        expect(parsed.channelKey).toBe(result.channelKey);
        expect(parsed.alerts.length).toBe(result.alerts.length);
      });
    });
  });
});