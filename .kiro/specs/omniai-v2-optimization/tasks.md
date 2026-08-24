# Implementation Plan: OmniAI-Engine V2 - Optimización Integral

## Overview

Este plan implementa la optimización integral del motor OmniAI-Engine V2 con enfoque en:

1. **Anti-detección completa** (video + thumbnails + música) - Fases 1-2
2. **Humanización profunda** con variabilidad estructural narrativa - Fase 2
3. **Infraestructura básica** simplificada para 2 canales - Fase 3
4. **Validación de monetización** antes de escalar - Fase 4
5. **Expansión multiplataforma** controlada por gates - Fase 5
6. **Infraestructura avanzada** post-monetización - Fase 6

**4 Gaps Críticos Integrados:**
- GAP 1: ThumbnailTransformer (Task 2, Fase 1)
- GAP 2: ScriptStructureRandomizer (Task 5, Fase 2)
- GAP 3: MusicTransformer (Task 6, Fase 2)
- GAP 4: YPPValidationGate (Task 17, Fase 4)

**8 Reglas de Oro:** NO canal 3 sin YPP | NO IG/TikTok sin $ | NO misma firma | Human-in-loop | Triple anti-detección | Variabilidad estructural | Revisión manual | Horarios aleatorios

**Guardrails de Nicho:** Canal 1 (NeuroSync AI): Autismo+IA | Canal 2 (NeuroTech AI): TDAH+IA

## Tasks

- [x] 1. VideoTransformer - Sistema de Transformación Visual
  - [x] 1.1 Crear `src/generators/VideoTransformer.ts` con interfaces `TransformationParams` y `VideoTransformResult` #REQ-1.1.1
  - [x] 1.2 Implementar `generateUniqueParams(seed?)` para parámetros aleatorios reproducibles #REQ-1.1.1
  - [x] 1.3 Implementar alteración geométrica: zoom 102-108%, rotación ±0.5°, crop asimétrico 2-5px #REQ-1.1.2
  - [x] 1.4 Implementar alteración cromática: hue ±10, saturación ±15%, contraste ±8%, brillo ±5% #REQ-1.1.3
  - [x] 1.5 Implementar alteración temporal: velocidad variable 0.95x-1.05x por escena #REQ-1.1.4
  - [x] 1.6 Implementar overlays: grain aleatorio 3-8, viñeta dinámica #REQ-1.1.5
  - [x] 1.7 Implementar metadatos únicos: CRF variable 18-23, timestamp único, encoder hash #REQ-1.1.6
- [x] 2. ThumbnailTransformer - Anti-Detección Visual de Thumbnails ⭐NUEVO
  - [x] 2.1 Crear `src/generators/ThumbnailTransformer.ts` con interfaces sincronizadas con VideoTransformer #REQ-1.4.1
  - [x] 2.2 Implementar importación de `TransformationParams` desde VideoTransformer #REQ-1.4.7
  - [x] 2.3 Implementar zoom aleatorio 102-108% al thumbnail base #REQ-1.4.2
  - [x] 2.4 Aplicar transformaciones cromáticas sincronizadas: hue, saturación, contraste #REQ-1.4.3
  - [x] 2.5 Implementar grain de película sutil intensidad 3-8 #REQ-1.4.4
  - [x] 2.6 Implementar variación de posición texto/emojis ±20px offset aleatorio #REQ-1.4.5
  - [x] 2.7 Implementar `generateThumbnailHash()` para hash único por thumbnail #REQ-1.4.6
  - [x] 2.8 Exportar interface compartida para sincronización video↔thumbnail #REQ-1.4.8
- [x] 3. Variabilidad de Edición y Estilos
  - [x] 3.1 Implementar 5+ presets de estilos de edición aleatorios #REQ-1.2.1
  - [x] 3.2 Implementar intervalos de corte variables 2-8 segundos #REQ-1.2.2
  - [x] 3.3 Implementar rotación de transiciones: fade, dissolve, wipe, zoom, cut directo #REQ-1.2.3
  - [x] 3.4 Implementar posiciones de texto variables: top, center, bottom, corners #REQ-1.2.4
- [x] 4. Checkpoint Fase 1 - Validación Anti-Detección
  - [x] 4.1 Test: VideoTransformer genera hash MD5 diferente en cada ejecución #REQ-1.1.7
  - [x] 4.2 Test: ThumbnailTransformer sincroniza parámetros con video correspondiente
  - [x] 4.3 Test: Presets de edición rotan correctamente sin repetición consecutiva
  - [x] 4.4 Integración: Pipeline completo video+thumbnail con parámetros compartidos
- [x] 5. ScriptStructureRandomizer - Variabilidad Narrativa ⭐NUEVO
  - [x] 5.1 Crear `src/generators/ScriptStructureRandomizer.ts` con tipo `NarrativeStructure` #REQ-2.7.1
  - [x] 5.2 Implementar 6 estructuras narrativas: storytelling, inverted-list, rhetorical, debate, error-tutorial, case-study #REQ-2.7.1
  - [x] 5.3 Implementar `selectStructure()` que evita repetición en últimos 3 videos #REQ-2.7.5
  - [x] 5.4 Implementar `varySentenceLength()` con variación ±30% #REQ-2.7.2
  - [x] 5.5 Implementar `adjustKeywordDensity()` con niveles low/medium/high #REQ-2.7.3
  - [x] 5.6 Implementar `repositionCTA()` con posiciones start/middle/end #REQ-2.7.4
  - [x] 5.7 Implementar `detectRepetition()` para 3+ videos consecutivos #REQ-2.7.5
  - [x] 5.8 Implementar guardado de estructura en SQLite para tracking #REQ-2.7.6
  - [x] 5.9 Integrar con ScriptHumanizer: estructura antes de humanización #REQ-2.7.7
  - [x] 5.10 Test: Validar que nunca se repite estructura 3 veces consecutivas
- [x] 6. MusicTransformer - Evasión de Content ID ⭐NUEVO
  - [x] 6.1 Crear `src/generators/MusicTransformer.ts` con interface `MusicTransformationParams` #REQ-2.8.1
  - [x] 6.2 Implementar `generateUniqueParams()` con rangos: pitch ±2%, tempo ±3% #REQ-2.8.2
  - [x] 6.3 Implementar EQ único: boost/cut ±2dB en 1kHz, 4kHz, 8kHz #REQ-2.8.4
  - [x] 6.4 Implementar reverb sutil: room size 0.05-0.15 #REQ-2.8.5
  - [x] 6.5 Implementar `buildFFmpegFilter()` con comando de referencia #REQ-2.8.9
  - [x] 6.6 Implementar `getTransformedHash()` para hash único por pista #REQ-2.8.6
  - [x] 6.7 Implementar caché de pistas transformadas por parámetros #REQ-2.8.7
  - [x] 6.8 Integrar con AudioMixer: transformar ANTES de mezclar #REQ-2.8.8
- [x] 7. ScriptHumanizer - Humanización de Guiones
  - [x] 7.1 Crear `src/generators/ScriptHumanizer.ts` #REQ-2.1.1
  - [x] 7.2 Implementar muletillas por idioma: ES, EN, PT #REQ-2.1.2
  - [x] 7.3 Implementar autocorrecciones naturales #REQ-2.1.3
  - [x] 7.4 Implementar marcadores de pausa y preguntas retóricas #REQ-2.1.4
  - [x] 7.5 Implementar ganchos emocionales rotativos #REQ-2.1.6
- [x] 8. AudioMixer - Mezcla Profesional Voz + Música ⭐CRÍTICO
  - [x] 8.1 Crear `src/generators/AudioMixer.ts` #REQ-2.6.1
  - [x] 8.2 Implementar banco de música por mood: ambient, upbeat, cinematic, calm, dramatic #REQ-2.6.2
  - [x] 8.3 Configurar volúmenes: voz -1dB, música -22dB #REQ-2.6.3
  - [x] 8.4 Implementar ducking automático -6dB con sidechaincompress #REQ-2.6.4
  - [x] 8.5 Implementar fade-in intro 2s y fade-out outro 2s #REQ-2.6.6
  - [x] 8.6 Implementar normalización loudnorm -16 LUFS #REQ-2.6.8
  - [x] 8.7 Validar truePeak menor a -1.5dB para evitar clipping #REQ-2.6.9
  - [x] 8.8 Implementar loop automático con crossfade 1s si video mayor que pista #REQ-2.6.11
- [x] 9. SubtitleGenerator con SSML - Sincronización Profesional ⭐CRÍTICO
  - [x] 9.1 Crear `src/generators/SubtitleGenerator.ts` #REQ-2.5.1
  - [x] 9.2 Integrar timepoints de Google Cloud TTS con SSML mark #REQ-2.5.2
  - [x] 9.3 Generar archivo .ASS con timing preciso por palabra #REQ-2.5.3
  - [x] 9.4 Implementar estilo profesional: Montserrat Bold, blanco con borde negro 2px #REQ-2.5.4
  - [x] 9.5 Quemar subtítulos con FFmpeg filtro ass #REQ-2.5.5
  - [x] 9.6 Implementar fallback a Whisper cuando SSML no disponible #REQ-2.5.7
- [x] 10. Checkpoint Fase 2 - Validación Humanización
  - [x] 10.1 Test: ScriptStructureRandomizer no repite estructura 3 veces
  - [x] 10.2 Test: MusicTransformer genera hash único por transformación
  - [x] 10.3 Test: AudioMixer produce audio sin clipping truePeak menor a -1.5dB
  - [x] 10.4 Test: SubtitleGenerator sincroniza con desfase máximo ±50ms #REQ-2.5.8
- [x] 11. CacheManager - Sistema de Caché Centralizado
  - [x] 11.1 Crear `src/infrastructure/CacheManager.ts` #REQ-4.1.1
  - [x] 11.2 Implementar caché de videos Pexels por query+transformación #REQ-4.1.2
  - [x] 11.3 Implementar caché de audios TTS por texto+voz+parámetros #REQ-4.1.3
  - [x] 11.4 Implementar estructura de carpetas: videos, audio, thumbnails, music #REQ-4.1.5
  - [x] 11.5 Implementar TTL por tipo: videos 30d, audio 7d, thumbnails 3d, música 14d #REQ-4.1.6
- [x] 12. Winston Logger - Logging Estructurado
  - [x] 12.1 Crear `src/infrastructure/Logger.ts` con Winston #REQ-4.2.1
  - [x] 12.2 Configurar logs JSON en logs/omniai-YYYY-MM-DD.log #REQ-4.2.2
  - [x] 12.3 Mantener alertas Telegram para errores críticos #REQ-4.2.3
  - [x] 12.4 Implementar correlation ID por pipeline #REQ-4.2.4
  - [x] 12.5 Loguear métricas de rendimiento: tiempo, tamaño, API calls #REQ-4.2.5
- [x] 13. RetryHandler - Resiliencia Básica
  - [x] 13.1 Crear `src/infrastructure/RetryHandler.ts` con backoff exponencial #REQ-4.4.1
  - [x] 13.2 Aplicar retry a APIs externas: DeepSeek, Google TTS, Pexels, YouTube #REQ-4.4.2
  - [x] 13.3 Crear fallbacks específicos por componente #REQ-4.4.3
- [x] 14. RenderQueueManager SIMPLIFICADO - Cola BullMQ
  - [x] 14.1 Crear `src/infrastructure/RenderQueueManager.ts` con BullMQ #REQ-4.5.1
  - [x] 14.2 Configurar 1-2 workers concurrentes máximo #REQ-4.5.2
  - [x] 14.3 Implementar prioridades: ALTA Shorts menor 60s, BAJA videos largos #REQ-4.5.3
  - [x] 14.4 Implementar reintentos: backoff 5s-15s-45s, máx 3 intentos #REQ-4.5.4
  - [x] 14.5 Implementar graceful shutdown: no nuevos jobs, esperar job actual #REQ-4.5.5
- [x] 15. ConfigManager - Configuración Externalizada
  - [x] 15.1 Crear config/default.json con constantes del sistema #REQ-4.6.1
  - [x] 15.2 Crear config/channel1.json y config/channel2.json #REQ-4.6.2
  - [x] 15.3 Implementar carga con validación de schema #REQ-4.6.4
- [x] 16. Checkpoint Fase 3 - Validación Infraestructura
  - [x] 16.1 Test: CacheManager respeta TTL y limpia correctamente
  - [x] 16.2 Test: Logger genera JSON válido con correlation ID
  - [x] 16.3 Test: RetryHandler aplica backoff exponencial correctamente
  - [x] 16.4 Test: RenderQueueManager procesa jobs en orden de prioridad
- [x] 17. YPPValidationGate - Gate de Monetización ⭐NUEVO CRÍTICO
  - [x] 17.1 Crear `src/validation/YPPValidationGate.ts` con interfaces YPPMetrics y QualityMetrics #REQ-5.4.1
  - [x] 17.2 Implementar checkYPPRequirements: 1000 subs, 4000h watch time #REQ-5.4.2
  - [x] 17.3 Implementar verificación alternativa: 10M vistas Shorts en 90 días #REQ-5.4.2
  - [x] 17.4 Implementar checkQualityRequirements: retención mayor 50%, CTR mayor 4%, watch time mayor 40% #REQ-5.4.3
  - [x] 17.5 Implementar canCreateNewChannel que bloquea canal 3 #REQ-5.4.4
  - [x] 17.6 Implementar canExpandToPlatform que bloquea IG/TikTok #REQ-5.4.5
  - [x] 17.7 Implementar generateProgressReport semanal por Telegram #REQ-5.4.6
  - [x] 17.8 Implementar alerta Telegram al 80% del objetivo #REQ-5.4.7
  - [x] 17.9 Implementar manualOverride con doble confirmación y log #REQ-5.4.8
  - [x] 17.10 Integrar YouTube Analytics API para métricas en tiempo real #REQ-5.4.9
  - [x] 17.11 Implementar histórico de progreso en SQLite #REQ-5.4.10
- [x] 18. Analytics Integration - Integración de Métricas YouTube
  - [x] 18.1 Integrar YouTube Analytics API para Watch Time y CTR reales #REQ-5.2.1
  - [x] 18.2 Segmentar métricas por tipo: Short vs Largo #REQ-5.2.2
  - [x] 18.3 Alimentar datos de retención al SEOAgent #REQ-5.2.3
  - [x] 18.4 Crear alertas cuando CTR menor 2% o Watch Time menor 30% #REQ-5.2.4
- [x] 19. MetricsCollector - Recopilación de Métricas Internas
  - [x] 19.1 Crear `src/infrastructure/MetricsCollector.ts` con registro en SQLite #REQ-4.3.1
  - [x] 19.2 Registrar: tiempo renderizado, tasa éxito/fallo, uso caché, tamaño output #REQ-4.3.2
  - [x] 19.3 Generar reporte semanal de métricas por Telegram #REQ-4.3.3
- [x] 20. Checkpoint Fase 4 - Validación Monetización
  - [x] 20.1 Test: YPPValidationGate bloquea canal 3 cuando no hay monetización
  - [x] 20.2 Test: YPPValidationGate bloquea IG/TikTok hasta primer dólar
  - [x] 20.3 Test: manualOverride requiere doble confirmación y genera log
  - [x] 20.4 Test: Reporte semanal se genera y envía correctamente
- [x] 21. ReelsAdapter - Adaptador Instagram (SOLO SI YPP APROBADO)
  - [x] 21.1 Crear `src/adapters/ReelsAdapter.ts` #REQ-3.1.1
  - [x] 21.2 Implementar recorte a 30 segundos óptimo #REQ-3.1.2
  - [x] 21.3 Forzar subtítulos animados (85% audiencia sin sonido) #REQ-3.1.3
  - [x] 21.4 Aplicar color pop: saturación +20%, contraste +10% #REQ-3.1.4
  - [x] 21.5 Generar cover/thumbnail específico para Reels #REQ-3.1.6
- [x] 22. TikTokAdapter - Adaptador TikTok (SOLO SI YPP APROBADO)
  - [x] 22.1 Crear `src/adapters/TikTokAdapter.ts` #REQ-3.2.1
  - [x] 22.2 Implementar recorte a 15 segundos óptimo #REQ-3.2.2
  - [x] 22.3 Implementar hook ultra-agresivo de 0.5 segundos #REQ-3.2.3
  - [x] 22.4 Aumentar ritmo de cortes a cada 1.5 segundos #REQ-3.2.4
- [x] 23. Publishers - Publicadores Multiplataforma
  - [x] 23.1 Crear `src/publishers/InstagramPublisher.ts` con Graph API o Puppeteer #REQ-3.3.1
  - [x] 23.2 Crear `src/publishers/TikTokPublisher.ts` con API o Puppeteer #REQ-3.3.2
- [x] 24. MultiPlatformDispatcher - Coordinador de Publicación
  - [x] 24.1 Crear `src/orchestration/MultiPlatformDispatcher.ts` #REQ-3.4.1
  - [x] 24.2 Implementar delay aleatorio 30-90 minutos entre plataformas #REQ-3.4.2
  - [x] 24.3 Implementar horarios ALEATORIOS de publicación (Regla 8) #REQ-3.4.3
  - [x] 24.4 Crear estrategia contenido diferenciado por plataforma #REQ-3.4.4
- [x] 25. SEO Multiplataforma - Optimización por Plataforma
  - [x] 25.1 Extender SEOAgent para hashtags específicos por plataforma #REQ-3.5.1
  - [x] 25.2 Generar descripciones optimizadas por plataforma #REQ-3.5.2
  - [x] 25.3 Adaptar títulos: YT 60 chars, IG caption, TT caption corto #REQ-3.5.3
- [x] 26. Checkpoint Fase 5 - Validación Multiplataforma
  - [x] 26.1 Test: ReelsAdapter genera video 30s con subtítulos
  - [x] 26.2 Test: TikTokAdapter genera video 15s con hook 0.5s
  - [x] 26.3 Test: MultiPlatformDispatcher respeta delays y horarios aleatorios
  - [x] 26.4 Integración: Publicación coordinada en 3 plataformas
- [x] 27. CircuitBreaker - Patrón de Resiliencia (POST-MONETIZACIÓN)
  - [x] 27.1 Crear `src/infrastructure/CircuitBreaker.ts` con estados closed/open/half-open #REQ-6.1.1
  - [x] 27.2 Abrir circuito después de 5 fallos consecutivos #REQ-6.1.2
  - [x] 27.3 Auto-cerrar después de timeout configurable 1 minuto #REQ-6.1.3
  - [x] 27.4 Loguear cambios de estado del circuit breaker #REQ-6.1.4
- [x] 28. Dead-Letter Queue - Cola de Fallos (POST-MONETIZACIÓN)
  - [x] 28.1 Crear estado dead-letter para jobs fallidos 3+ veces #REQ-6.2.1
  - [x] 28.2 Mover jobs fallidos a cola separada con detalles error #REQ-6.2.2
  - [x] 28.3 Permitir reintento manual desde dashboard #REQ-6.2.3
  - [x] 28.4 Crear endpoint HTTP /queue/dead-letter #REQ-6.2.4
- [x] 29. Dashboard HTTP - Endpoints de Métricas (POST-MONETIZACIÓN)
  - [x] 29.1 Crear endpoint HTTP /metrics con formato Prometheus opcional #REQ-6.3.1
  - [x] 29.2 Crear endpoint HTTP /queue/status #REQ-6.3.2
  - [x] 29.3 Monitorear CPU/RAM en tiempo real #REQ-6.3.3
  - [x] 29.4 Implementar persistencia estado cola en SQLite #REQ-6.3.4
- [x] 30. Mejoras Thumbnails - A/B Testing (POST-MONETIZACIÓN)
  - [x] 30.1 Crear 5+ plantillas de thumbnail rotables #REQ-5.1.1
  - [x] 30.2 Añadir elementos dinámicos: flechas, círculos, emojis #REQ-5.1.2
  - [x] 30.3 Implementar A/B testing con versiones alternativas #REQ-5.1.3
  - [x] 30.4 Generar thumbnail específico por canal #REQ-5.1.4
- [x] 31. Automatización Playlists (POST-MONETIZACIÓN)
  - [x] 31.1 Crear playlists automáticas por idioma #REQ-5.3.1
  - [x] 31.2 Crear playlists automáticas por tema/keyword #REQ-5.3.2
  - [x] 31.3 Añadir videos nuevos a playlists automáticamente #REQ-5.3.3
- [x] 32. Checkpoint Final - Validación Sistema Completo
  - [x] 32.1 Test: CircuitBreaker abre/cierra correctamente según fallos
  - [x] 32.2 Test: Dead-letter queue captura jobs fallidos
  - [x] 32.3 Test: Dashboard HTTP responde con métricas válidas
  - [x] 32.4 Test end-to-end: Pipeline completo desde idea hasta publicación

## Notes

### Cronograma de Fases

| Fase | Semanas | Enfoque | Tasks | Prioridad |
|------|---------|---------|-------|-----------|
| 1 | 1-2 | Anti-Detección Total | 1-4 | ⭐⭐⭐ |
| 2 | 3-4 | Humanización Profunda | 5-10 | ⭐⭐⭐ |
| 3 | 5-6 | Infraestructura Básica | 11-16 | ⭐⭐ |
| 4 | 7-8 | Validación Monetización | 17-20 | ⭐⭐⭐ |
| 5 | 9-12 | Expansión Multiplataforma | 21-26 | ⭐⭐ |
| 6 | 13+ | Infraestructura Avanzada | 27-32 | ⭐ |

### 4 Gaps Críticos Integrados

| Gap | Task | Fase | Componente |
|-----|------|------|------------|
| GAP 1 | Task 2 | Fase 1 | ThumbnailTransformer |
| GAP 2 | Task 5 | Fase 2 | ScriptStructureRandomizer |
| GAP 3 | Task 6 | Fase 2 | MusicTransformer |
| GAP 4 | Task 17 | Fase 4 | YPPValidationGate |

### Componentes Movidos a Fase 6 (Over-Engineering)

- CircuitBreaker (Task 27)
- Dead-letter queue (Task 28)
- Dashboard HTTP (Task 29)

### Gates de Bloqueo

- **Fase 5** bloqueada por: YPPValidationGate.passed === true
- **Fase 6** bloqueada por: monetizationActive === true

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "phase": "Fase 1: Anti-Detección Total",
      "tasks": ["1"]
    },
    {
      "wave": 2,
      "phase": "Fase 1: Anti-Detección Total",
      "tasks": ["2", "3"]
    },
    {
      "wave": 3,
      "phase": "Fase 1: Anti-Detección Total",
      "tasks": ["4"]
    },
    {
      "wave": 4,
      "phase": "Fase 2: Humanización Profunda",
      "tasks": ["5", "6"]
    },
    {
      "wave": 5,
      "phase": "Fase 2: Humanización Profunda",
      "tasks": ["7", "8"]
    },
    {
      "wave": 6,
      "phase": "Fase 2: Humanización Profunda",
      "tasks": ["9"]
    },
    {
      "wave": 7,
      "phase": "Fase 2: Humanización Profunda",
      "tasks": ["10"]
    },
    {
      "wave": 8,
      "phase": "Fase 3: Infraestructura Básica",
      "tasks": ["11", "12", "13", "15"]
    },
    {
      "wave": 9,
      "phase": "Fase 3: Infraestructura Básica",
      "tasks": ["14"]
    },
    {
      "wave": 10,
      "phase": "Fase 3: Infraestructura Básica",
      "tasks": ["16"]
    },
    {
      "wave": 11,
      "phase": "Fase 4: Validación Monetización",
      "tasks": ["17"]
    },
    {
      "wave": 12,
      "phase": "Fase 4: Validación Monetización",
      "tasks": ["18", "19"]
    },
    {
      "wave": 13,
      "phase": "Fase 4: Validación Monetización",
      "tasks": ["20"]
    },
    {
      "wave": 14,
      "phase": "Fase 5: Expansión Multiplataforma",
      "gate": "YPPValidationGate.passed",
      "tasks": ["21", "22"]
    },
    {
      "wave": 15,
      "phase": "Fase 5: Expansión Multiplataforma",
      "tasks": ["23"]
    },
    {
      "wave": 16,
      "phase": "Fase 5: Expansión Multiplataforma",
      "tasks": ["24"]
    },
    {
      "wave": 17,
      "phase": "Fase 5: Expansión Multiplataforma",
      "tasks": ["25"]
    },
    {
      "wave": 18,
      "phase": "Fase 5: Expansión Multiplataforma",
      "tasks": ["26"]
    },
    {
      "wave": 19,
      "phase": "Fase 6: Infraestructura Avanzada",
      "gate": "monetizationActive",
      "tasks": ["27", "30", "31"]
    },
    {
      "wave": 20,
      "phase": "Fase 6: Infraestructura Avanzada",
      "tasks": ["28"]
    },
    {
      "wave": 21,
      "phase": "Fase 6: Infraestructura Avanzada",
      "tasks": ["29"]
    },
    {
      "wave": 22,
      "phase": "Fase 6: Infraestructura Avanzada",
      "tasks": ["32"]
    }
  ]
}
```
