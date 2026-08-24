# Requirements: OmniAI-Engine V2 - Optimización Integral

## Resumen Ejecutivo

Optimización masiva del motor OmniAI-Engine para lograr:

1. **Anti-detección de YouTube** - Evitar flags de "Contenido Reutilizado" mediante transformación visual de videos Y thumbnails
2. **Humanización de IA** - Guiones y voces indetectables como generados por IA, con variabilidad estructural narrativa
3. **Evasión de Content ID Musical** - Transformación de pistas de audio para evitar matches
4. **Validación de Monetización** - Gate que bloquea escalado hasta lograr YPP aprobado
5. **Expansión Multiplataforma** - Instagram Reels y TikTok (SOLO después de monetizar)
6. **Infraestructura Moderna** - Caché, métricas, resiliencia (simplificada para 2 canales)

**Deployment:** Local (Node.js directo) - Docker PAUSADO hasta nueva orden

---

## 🏆 8 REGLAS DE ORO (INMUTABLES)

> Estas reglas tienen prioridad absoluta sobre cualquier otra decisión técnica o de producto.

| # | Regla | Justificación |
|---|-------|---------------|
| 1 | **NO crear canal 3 hasta que canal 1 o 2 esté monetizado (YPP aprobado)** | Evita dispersión de recursos sin validar modelo |
| 2 | **NO expandir a IG/TikTok hasta que YouTube pague el primer dólar** | Monetización primero, alcance después |
| 3 | **NO usar la misma firma de producción en múltiples canales** | Evita detección cruzada por YouTube |
| 4 | **NO automatizar 100% sin supervisión humana en el bucle** | Revisión manual antes de publicar |
| 5 | **SIEMPRE aplicar transformaciones a videos, thumbnails Y música** | Triple capa de anti-detección |
| 6 | **SIEMPRE humanizar guiones con variabilidad estructural** | Evita patrones detectables por algoritmo |
| 7 | **SIEMPRE validar que el contenido pasa revisión manual antes de publicar** | Human-in-the-loop obligatorio |
| 8 | **La publicación de videos debe hacerse en horarios diferentes cada vez, siempre aleatorios** | Evita patrones temporales detectables |

---

## 📅 Cronograma de Fases (PRIORIZADO)

| Fase | Semanas | Enfoque | Prioridad |
|------|---------|---------|-----------|
| **1** | 1-2 | Anti-Detección Total (VideoTransformer + ThumbnailTransformer) | ⭐⭐⭐ |
| **2** | 3-4 | Humanización Profunda (ScriptStructureRandomizer, MusicTransformer, SSML Subtitles, AudioMixer) | ⭐⭐⭐ |
| **3** | 5-6 | Infraestructura Básica (Caché, Winston, RetryHandler, Cola BullMQ SIMPLIFICADA) | ⭐⭐ |
| **4** | 7-8 | Validación de Monetización (YPPValidationGate, Analytics, iterar sobre retención) | ⭐⭐⭐ |
| **5** | 9-12 | Expansión Multiplataforma (**SOLO SI YPP está aprobado**) | ⭐⭐ |
| **6** | 13+ | Infraestructura Avanzada (Dead-letter queue, Dashboard HTTP, Circuit Breaker) | ⭐ |

---

## Guardrails de Nicho (INMUTABLE)

- **Canal 1 (NeuroSync AI):** Autismo + Inteligencia Artificial
- **Canal 2 (NeuroTech AI):** Productividad/TDAH + IA para Neurodivergentes

Todos los módulos DEBEN respetar estos nichos sin excepción.

---

## Restricciones Técnicas

- **Deployment:** Local (Node.js directo). Docker PAUSADO.
- **Stack:** TypeScript, FFmpeg, BullMQ, SQLite, Winston, Google Cloud TTS (capa gratuita con SSML)
- **APIs:** DeepSeek (guiones), Google TTS (voz), Pexels (stock footage), YouTube Data API
- **Código:** 100% TypeScript con tipos estrictos, máximo 300 líneas por archivo

---

## Módulo 1: Sistema Anti-Detección de Contenido

### REQ-1.1: Transformación Visual de Videos

- [ ] **REQ-1.1.1:** Crear `VideoTransformer.ts` que aplique transformaciones únicas a cada video descargado de Pexels
- [ ] **REQ-1.1.2:** Implementar alteración geométrica con zoom aleatorio (102-108%), micro-rotación (-0.5° a +0.5°), y crop asimétrico (2-5px en bordes)
- [ ] **REQ-1.1.3:** Implementar alteración cromática con hue shift (±10), saturación (±15%), contraste (±8%), y brillo (±5%)
- [ ] **REQ-1.1.4:** Implementar alteración temporal con velocidad variable (0.95x-1.05x) por escena
- [ ] **REQ-1.1.5:** Añadir overlays únicos: grain de película aleatorio (intensidad 3-8), viñeta dinámica
- [ ] **REQ-1.1.6:** Generar metadatos únicos: re-encoding con CRF variable (18-23), timestamp único, encoder string con hash
- [ ] **REQ-1.1.7:** Verificar que el hash MD5 del output es diferente cada vez

### REQ-1.2: Variabilidad Algorítmica en Edición

- [ ] **REQ-1.2.1:** Implementar sistema de estilos de edición aleatorios con 5+ presets diferentes
- [ ] **REQ-1.2.2:** Variar intervalos de corte (2-8 segundos) en lugar de cortes fijos
- [ ] **REQ-1.2.3:** Rotar entre tipos de transición: fade, dissolve, wipe, zoom, cut directo
- [ ] **REQ-1.2.4:** Variar posiciones de texto overlay: top, center, bottom, top-left, bottom-right
- [ ] **REQ-1.2.5:** Aplicar CRF variable (18-23) para diferentes niveles de compresión

### REQ-1.3: Caché de Assets Transformados

- [ ] **REQ-1.3.1:** Crear sistema de caché para videos transformados con hash de parámetros
- [ ] **REQ-1.3.2:** Almacenar videos procesados en `content/cache/` con TTL de 30 días
- [ ] **REQ-1.3.3:** Implementar limpieza automática de caché cuando supere 10GB
- [ ] **REQ-1.3.4:** Log de caché hits/misses para métricas de eficiencia

### REQ-1.4: ThumbnailTransformer (Anti-Detección Visual de Thumbnails) ⭐⭐⭐ NUEVO

> **Justificación:** YouTube indexa thumbnails por hash visual. Si 60 videos comparten plantilla base, te marca como "producción en masa".

- [ ] **REQ-1.4.1:** Crear `ThumbnailTransformer.ts` que aplique las MISMAS transformaciones cromáticas que VideoTransformer
- [ ] **REQ-1.4.2:** Implementar zoom aleatorio (102-108%) al thumbnail base
- [ ] **REQ-1.4.3:** Aplicar hue shift, saturación y contraste con los mismos parámetros del video correspondiente
- [ ] **REQ-1.4.4:** Añadir grain de película sutil (intensidad 3-8) al thumbnail
- [ ] **REQ-1.4.5:** Variar posición de texto/emojis con ±20px de offset aleatorio
- [ ] **REQ-1.4.6:** Generar hash único por thumbnail
- [ ] **REQ-1.4.7:** Integrar con VideoTransformer para reutilizar `TransformationParams`
- [ ] **REQ-1.4.8:** Exportar interface compartida para sincronización de parámetros video↔thumbnail

---

## Módulo 2: Humanización de Contenido IA

### REQ-2.1: Humanización de Guiones

- [ ] **REQ-2.1.1:** Crear `ScriptHumanizer.ts` que post-procese guiones generados por DeepSeek
- [ ] **REQ-2.1.2:** Añadir muletillas naturales por idioma: ES ("o sea", "bueno", "mira"), EN ("you know", "like", "actually"), PT ("tipo", "né", "olha")
- [ ] **REQ-2.1.3:** Insertar autocorrecciones naturales: "Es decir... no, mejor dicho..."
- [ ] **REQ-2.1.4:** Añadir marcadores de pausa: "..." y "(pausa)" para procesamiento TTS
- [ ] **REQ-2.1.5:** Incluir preguntas retóricas y micro-anécdotas para conexión emocional
- [ ] **REQ-2.1.6:** Implementar ganchos emocionales rotativos: curiosidad, FOMO, controversia

### REQ-2.2: Sistema de Voces TTS Mejorado

- [ ] **REQ-2.2.1:** Crear pool de 5+ voces por idioma para variabilidad (evitar fingerprinting)
- [ ] **REQ-2.2.2:** Selección aleatoria de voz del pool en cada video
- [ ] **REQ-2.2.3:** Variar speakingRate (0.95-1.10) y pitch (-2 a +2 semitonos) por video
- [ ] **REQ-2.2.4:** Implementar marcadores SSML para pausas, énfasis, y velocidad
- [ ] **REQ-2.2.5:** Crear `AudioHumanizer.ts` para post-procesamiento de audio

### REQ-2.3: Post-Procesamiento de Audio

- [ ] **REQ-2.3.1:** Aplicar EQ sutil variable (treble boost o bass boost aleatorio)
- [ ] **REQ-2.3.2:** Añadir compresión suave como micrófono real (threshold -20dB, ratio 3:1)
- [ ] **REQ-2.3.3:** Insertar ruido ambiente casi imperceptible (pink noise 0.001-0.003)
- [ ] **REQ-2.3.4:** Normalizar con loudnorm a -16 LUFS (estándar YouTube)
- [ ] **REQ-2.3.5:** Añadir reverb de sala sutil (room size 0.1-0.2)

### REQ-2.4: Subtítulos Animados

- [ ] **REQ-2.4.1:** Integrar Whisper o similar para transcripción con timestamps precisos
- [ ] **REQ-2.4.2:** Generar subtítulos estilo CapCut con animación palabra por palabra
- [ ] **REQ-2.4.3:** Crear 3+ estilos de subtítulos rotables (minimal, bold, glow)
- [ ] **REQ-2.4.4:** Posicionar subtítulos en zona segura para cada plataforma

### REQ-2.5: Sincronización Profesional de Subtítulos con SSML Timestamps ⭐⭐⭐ CRÍTICO

- [ ] **REQ-2.5.1:** Crear `SubtitleGenerator.ts` que genere subtítulos sincronizados frame-a-frame con el audio TTS
- [ ] **REQ-2.5.2:** Usar timepoints de Google Cloud TTS (SSML con `<mark>`) para obtener timestamps exactos por palabra
- [ ] **REQ-2.5.3:** Generar archivo .ASS (Advanced SubStation Alpha) con timing preciso por palabra
- [ ] **REQ-2.5.4:** Implementar estilo profesional de subtítulos:
  - Fuente: Montserrat Bold o Arial Black
  - Tamaño: 20-24px (ajustable por plataforma)
  - Color: Blanco (#FFFFFF) con borde negro 2px
  - Sombra: Negro con offset 2px para contraste
  - Posición: Inferior centrada (MarginV: 50-80px desde borde inferior)
- [ ] **REQ-2.5.5:** Quemar subtítulos con FFmpeg usando filtro `ass` para máxima compatibilidad
- [ ] **REQ-2.5.6:** Implementar aparición/desaparición suave (fade 100ms) sincronizada exacta con palabras
- [ ] **REQ-2.5.7:** Crear fallback a Whisper cuando SSML timestamps no están disponibles
- [ ] **REQ-2.5.8:** Validar sincronización: máximo ±50ms de desfase entre audio y subtítulo

### REQ-2.6: Mezcla Profesional de Audio (Voz + Música de Fondo) ⭐⭐⭐ CRÍTICO

- [ ] **REQ-2.6.1:** Crear `AudioMixer.ts` que combine voz TTS con música de fondo de forma profesional
- [ ] **REQ-2.6.2:** Implementar banco de música royalty-free organizado por mood:
  - `ambient/` - Música ambiental suave para contenido educativo
  - `upbeat/` - Música energética para contenido motivacional
  - `cinematic/` - Música épica para contenido dramático
  - `calm/` - Música calmante para contenido sobre neurodivergencia
  - `dramatic/` - Música intensa para ganchos y revelaciones
- [ ] **REQ-2.6.3:** Ajustar volúmenes correctamente usando estándares broadcast:
  - Voz: -1dB (protagonista)
  - Música de fondo: -22dB (apenas perceptible pero presente)
- [ ] **REQ-2.6.4:** Implementar ducking automático: bajar música -6dB adicionales cuando hay voz activa
- [ ] **REQ-2.6.5:** Usar filtro `sidechaincompress` de FFmpeg para ducking profesional
- [ ] **REQ-2.6.6:** Implementar fade-in de música en intro (primeros 2 segundos)
- [ ] **REQ-2.6.7:** Implementar fade-out de música en outro (últimos 2 segundos)
- [ ] **REQ-2.6.8:** Normalizar audio final a -16 LUFS con `loudnorm` (estándar YouTube) para evitar clipping
- [ ] **REQ-2.6.9:** Verificar que truePeak < -1.5dB para evitar clipping en compresión
- [ ] **REQ-2.6.10:** Selección inteligente de música basada en mood del script (detectado por SEOAgent)
- [ ] **REQ-2.6.11:** Loopear música automáticamente si el video es más largo que la pista (con crossfade 1s)

### REQ-2.7: ScriptStructureRandomizer (Variabilidad Narrativa) ⭐⭐⭐ NUEVO

> **Justificación:** YouTube detecta patrones de estructura (siempre Hook→3 puntos→CTA). Hay que variar la estructura.

- [ ] **REQ-2.7.1:** Crear `ScriptStructureRandomizer.ts` con 6+ estructuras narrativas rotables:
  - **Storytelling:** anécdota → lección → aplicación
  - **Lista Invertida:** conclusión primero → evidencia que la soporta
  - **Pregunta Retórica:** pregunta intrigante → investigación → respuesta
  - **Debate:** tesis vs antítesis → síntesis
  - **Tutorial con Error:** demostración de error común → por qué falla → solución correcta
  - **Caso de Estudio:** problema real → análisis detallado → resolución
- [ ] **REQ-2.7.2:** Variar longitud de oraciones (±30% respecto al promedio del guión)
- [ ] **REQ-2.7.3:** Rotar densidad de keywords (baja/media/alta por video)
- [ ] **REQ-2.7.4:** Variar posición del CTA: inicio (teaser), medio (refuerzo), final (tradicional)
- [ ] **REQ-2.7.5:** Detectar estructura repetitiva (si 3 videos seguidos usan misma estructura, forzar cambio)
- [ ] **REQ-2.7.6:** Guardar estructura usada en metadata del video en SQLite para tracking
- [ ] **REQ-2.7.7:** Integrar con ScriptHumanizer para aplicar estructura antes de humanización

### REQ-2.8: MusicTransformer (Evasión de Content ID) ⭐⭐⭐ NUEVO

> **Justificación:** Pistas de bancos gratuitos (Pixabay, Free Music Archive) están indexadas en Content ID de YouTube.

- [ ] **REQ-2.8.1:** Crear `MusicTransformer.ts` que altere pistas de música antes de mezclar con voz
- [ ] **REQ-2.8.2:** Implementar pitch shift sutil: ±2% (equivale a ±0.35 semitonos) por video
- [ ] **REQ-2.8.3:** Implementar tempo shift sutil: ±3% por video sin distorsión audible
- [ ] **REQ-2.8.4:** Aplicar EQ único por video: boost/cut aleatorio en frecuencias específicas (±2dB en 1kHz, 4kHz, 8kHz)
- [ ] **REQ-2.8.5:** Añadir reverb sutil único: room size aleatorio entre 0.05-0.15
- [ ] **REQ-2.8.6:** Generar hash único por pista transformada
- [ ] **REQ-2.8.7:** Cachear pistas transformadas por parámetros para evitar reprocesar
- [ ] **REQ-2.8.8:** Integrar con AudioMixer: transformar música ANTES de mezclar con voz
- [ ] **REQ-2.8.9:** Comando FFmpeg de referencia:
  ```
  asetrate=44100*1.02,aresample=44100,equalizer=f=1000:t=q:w=2:g=2,areverb=reverberance=15
  ```

---

## Módulo 3: Expansión Multiplataforma

> ⚠️ **FASE 5 - SOLO SI YPP ESTÁ APROBADO** (ver REQ-5.4 YPPValidationGate)

### REQ-3.1: Adaptador para Instagram Reels

- [ ] **REQ-3.1.1:** Crear `ReelsAdapter.ts` que adapte contenido de YouTube Shorts
- [ ] **REQ-3.1.2:** Recortar duración a 30 segundos (óptimo para Reels)
- [ ] **REQ-3.1.3:** Forzar subtítulos animados (85% audiencia sin sonido)
- [ ] **REQ-3.1.4:** Aplicar color pop (saturación +20%, contraste +10%)
- [ ] **REQ-3.1.5:** Implementar zoom dinámico sutil durante el video
- [ ] **REQ-3.1.6:** Generar cover/thumbnail específico para Reels (diferente a YouTube)

### REQ-3.2: Adaptador para TikTok

- [ ] **REQ-3.2.1:** Crear `TikTokAdapter.ts` con especificaciones de la plataforma
- [ ] **REQ-3.2.2:** Recortar duración a 15 segundos (óptimo para TikTok)
- [ ] **REQ-3.2.3:** Implementar hook ultra-agresivo de 0.5 segundos (vs 3s de YouTube)
- [ ] **REQ-3.2.4:** Aumentar ritmo de cortes a cada 1.5 segundos promedio
- [ ] **REQ-3.2.5:** Sincronizar cortes visuales con beats del audio cuando aplique

> ❌ **ELIMINADO:** `TikTokTrendingAudio.ts` - No viable sin API oficial de TikTok

### REQ-3.3: Publishers para Nuevas Plataformas

- [ ] **REQ-3.3.1:** Crear `InstagramPublisher.ts` usando Instagram Graph API o Puppeteer stealth
- [ ] **REQ-3.3.2:** Crear `TikTokPublisher.ts` usando TikTok API o Puppeteer stealth
- [ ] **REQ-3.3.3:** Manejar autenticación OAuth2 o cookies para ambas plataformas
- [ ] **REQ-3.3.4:** Implementar rate limiting para evitar bans

### REQ-3.4: Dispatcher Multiplataforma (SIMPLIFICADO)

- [ ] **REQ-3.4.1:** Crear `MultiPlatformDispatcher.ts` que coordine publicación en 3 plataformas
- [ ] **REQ-3.4.2:** Implementar delay aleatorio de 30-90 minutos entre plataformas (evitar detección)
- [ ] **REQ-3.4.3:** Implementar horarios ALEATORIOS de publicación (ver Regla de Oro #8)
- [ ] **REQ-3.4.4:** Crear estrategia de contenido diferenciado: video completo en YT, recortado en IG/TT

### REQ-3.5: SEO Multiplataforma

- [ ] **REQ-3.5.1:** Extender `SEOAgent.ts` para generar hashtags específicos por plataforma
- [ ] **REQ-3.5.2:** Generar descripciones optimizadas para cada plataforma (longitud, CTAs, emojis)
- [ ] **REQ-3.5.3:** Adaptar títulos: YT (60 chars SEO), IG (ninguno/caption), TT (caption corto)

---

## Módulo 4: Optimización de Infraestructura

### REQ-4.1: Sistema de Caché Inteligente

- [ ] **REQ-4.1.1:** Crear `CacheManager.ts` centralizado para todos los assets
- [ ] **REQ-4.1.2:** Implementar caché de videos de Pexels por query+transformación
- [ ] **REQ-4.1.3:** Implementar caché de audios TTS por texto+voz+parámetros
- [ ] **REQ-4.1.4:** Implementar caché de música transformada por pista+parámetros
- [ ] **REQ-4.1.5:** Almacenar en `content/cache/` con estructura: `/videos/`, `/audio/`, `/thumbnails/`, `/music/`
- [ ] **REQ-4.1.6:** Configurar TTL por tipo de asset: videos 30d, audio 7d, thumbnails 3d, música 14d
- [ ] **REQ-4.1.7:** Crear job de limpieza que corra diario a las 3AM

### REQ-4.2: Logging y Observabilidad

- [ ] **REQ-4.2.1:** Reemplazar console.log por Winston con niveles (error, warn, info, debug)
- [ ] **REQ-4.2.2:** Crear logs estructurados JSON en `logs/omniai-YYYY-MM-DD.log`
- [ ] **REQ-4.2.3:** Mantener logs de Telegram para alertas críticas únicamente
- [ ] **REQ-4.2.4:** Añadir correlation ID por pipeline para trazar flujo completo
- [ ] **REQ-4.2.5:** Loguear métricas de rendimiento: tiempo por fase, tamaño de archivos, API calls

### REQ-4.3: Métricas de Rendimiento (SIMPLIFICADO)

- [ ] **REQ-4.3.1:** Crear `MetricsCollector.ts` que registre métricas en SQLite
- [ ] **REQ-4.3.2:** Registrar: tiempo de renderizado, tasa éxito/fallo, uso de caché, tamaño de output
- [ ] **REQ-4.3.3:** Generar reporte semanal de métricas enviado por Telegram

> ❌ **MOVIDO A FASE 6:** Endpoint HTTP `/metrics` - over-engineering para 2 canales

### REQ-4.4: Resiliencia y Retry

- [ ] **REQ-4.4.1:** Crear `RetryHandler.ts` con backoff exponencial configurable
- [ ] **REQ-4.4.2:** Aplicar retry a todas las llamadas API externas (DeepSeek, Google TTS, Pexels, YouTube)
- [ ] **REQ-4.4.3:** Crear fallbacks específicos por componente (ej: si Pexels falla, usar video sintético)

> ❌ **MOVIDO A FASE 6:** CircuitBreaker - over-engineering para volumen actual

### REQ-4.5: Gestión de Colas de Renderizado (SIMPLIFICADO) ⭐⭐ FASE 3

- [ ] **REQ-4.5.1:** Crear `RenderQueueManager.ts` usando BullMQ con configuración simple
- [ ] **REQ-4.5.2:** Implementar 1-2 workers concurrentes máximo (no saturar máquina local)
- [ ] **REQ-4.5.3:** Implementar cola FIFO con prioridades básicas:
  - Prioridad ALTA: Shorts (< 60s) - procesan primero
  - Prioridad BAJA: Videos largos (> 60s)
- [ ] **REQ-4.5.4:** Implementar sistema de reintentos básico:
  - Retry automático en errores transitorios
  - Backoff exponencial: 5s → 15s → 45s
  - Máximo 3 reintentos antes de marcar como fallido
- [ ] **REQ-4.5.5:** Implementar graceful shutdown básico:
  - No aceptar nuevos jobs
  - Esperar que job actual termine (max 5 min)
- [ ] **REQ-4.5.6:** Notificar por Telegram cuando un job falle 3 veces

> ❌ **MOVIDO A FASE 6:** Dead-letter queue, Dashboard HTTP `/queue/status`, persistencia SQLite compleja, monitoreo CPU/RAM en tiempo real

### REQ-4.6: Configuración Externalizada

- [ ] **REQ-4.6.1:** Crear `config/default.json` con todas las constantes del sistema
- [ ] **REQ-4.6.2:** Crear `config/channel1.json` y `config/channel2.json` para configuración por canal
- [ ] **REQ-4.6.3:** Implementar feature flags para activar/desactivar módulos
- [ ] **REQ-4.6.4:** Cargar configuración con `convict` o similar para validación de schema
- [ ] **REQ-4.6.5:** Permitir override por variables de entorno

---

## Módulo 5: Mejoras de Contenido YouTube y Validación

### REQ-5.1: Mejoras de Thumbnails

- [ ] **REQ-5.1.1:** Crear 5+ plantillas de thumbnail rotables para evitar monotonía
- [ ] **REQ-5.1.2:** Añadir elementos visuales dinámicos: flechas, círculos, emojis
- [ ] **REQ-5.1.3:** Implementar A/B testing de thumbnails guardando versiones alternativas
- [ ] **REQ-5.1.4:** Generar thumbnail específico por canal (branding diferenciado)

### REQ-5.2: Mejoras de Analytics

- [ ] **REQ-5.2.1:** Integrar YouTube Analytics API para obtener Watch Time y CTR reales
- [ ] **REQ-5.2.2:** Segmentar métricas por tipo de video (Short vs Largo)
- [ ] **REQ-5.2.3:** Alimentar datos de retención al SEOAgent para optimización continua
- [ ] **REQ-5.2.4:** Crear alertas cuando CTR < 2% o Watch Time < 30%

### REQ-5.3: Automatización de Playlists

- [ ] **REQ-5.3.1:** Crear playlists automáticas por idioma (ES, EN, PT)
- [ ] **REQ-5.3.2:** Crear playlists automáticas por tema/keyword principal
- [ ] **REQ-5.3.3:** Añadir videos nuevos a playlists correspondientes automáticamente

### REQ-5.4: YPPValidationGate (Gate de Monetización) ⭐⭐⭐ NUEVO CRÍTICO

> **Justificación:** NO escalar a más canales ni expandir a IG/TikTok hasta monetizar YouTube. Monetización primero, alcance después.

- [ ] **REQ-5.4.1:** Crear `YPPValidationGate.ts` que bloquee escalado hasta monetizar
- [ ] **REQ-5.4.2:** Verificar métricas mínimas YPP antes de permitir nuevo canal:
  - 1,000 suscriptores en canal actual
  - 4,000 horas de watch time (o 10M vistas de Shorts)
  - Aprobación oficial de YouTube Partner Program
- [ ] **REQ-5.4.3:** Verificar métricas de calidad de contenido:
  - Al menos 1 video con >50% retención en primeros 30 segundos
  - CTR promedio > 4% en últimos 10 videos
  - Watch time promedio > 40% del video
- [ ] **REQ-5.4.4:** Bloquear creación de canal 3 hasta que gate se cumpla (Regla de Oro #1)
- [ ] **REQ-5.4.5:** Bloquear expansión a IG/TikTok hasta que gate se cumpla (Regla de Oro #2)
- [ ] **REQ-5.4.6:** Generar reporte semanal de progreso hacia monetización enviado por Telegram
- [ ] **REQ-5.4.7:** Enviar alerta por Telegram cuando se acerque a métricas (80% del objetivo)
- [ ] **REQ-5.4.8:** Permitir override manual con confirmación explícita (doble confirmación requerida, log de quién y cuándo)
- [ ] **REQ-5.4.9:** Consultar YouTube Analytics API para obtener métricas en tiempo real
- [ ] **REQ-5.4.10:** Guardar histórico de progreso en SQLite para análisis de tendencias

---

## Módulo 6: Infraestructura Avanzada (FASE 6 - Post-Monetización)

> ⚠️ **SOLO IMPLEMENTAR DESPUÉS DE MONETIZACIÓN** - Over-engineering para 2 canales con 30 vistas

### REQ-6.1: Circuit Breaker

- [ ] **REQ-6.1.1:** Crear `CircuitBreaker.ts` con estados: closed, open, half-open
- [ ] **REQ-6.1.2:** Abrir circuito después de 5 fallos consecutivos
- [ ] **REQ-6.1.3:** Auto-cerrar después de timeout configurable (1 minuto)
- [ ] **REQ-6.1.4:** Loguear cambios de estado del circuit breaker

### REQ-6.2: Dead-Letter Queue Avanzada

- [ ] **REQ-6.2.1:** Crear estado `dead-letter` para jobs que fallaron 3+ veces
- [ ] **REQ-6.2.2:** Mover jobs fallidos a cola separada con detalles del error
- [ ] **REQ-6.2.3:** Permitir reintento manual desde dashboard
- [ ] **REQ-6.2.4:** Crear endpoint HTTP `/queue/dead-letter` para listar jobs fallidos

### REQ-6.3: Dashboard HTTP de Métricas

- [ ] **REQ-6.3.1:** Crear endpoint HTTP `/metrics` para consultar métricas (opcional Prometheus format)
- [ ] **REQ-6.3.2:** Crear endpoint HTTP `/queue/status` para estado de cola
- [ ] **REQ-6.3.3:** Monitorear CPU/RAM en tiempo real con `os.cpus()` y `os.freemem()`
- [ ] **REQ-6.3.4:** Implementar persistencia de estado de cola en SQLite

---

## Requisitos No Funcionales

### RNF-1: Rendimiento

- [ ] Pipeline completo de Short: máximo 5 minutos
- [ ] Pipeline completo de Video Largo: máximo 15 minutos
- [ ] Uso de CPU pico: máximo 80% durante renderizado
- [ ] Uso de RAM pico: máximo 3GB

### RNF-2: Escalabilidad

- [ ] Soportar 10 videos/día para 2 canales sin degradación
- [ ] Soportar 30 publicaciones/día cuando se expanda a 3 plataformas
- [ ] Cola de trabajos debe manejar backpressure correctamente

### RNF-3: Fiabilidad

- [ ] Uptime 95% en ejecución local 24/7
- [ ] Recuperación automática de fallos transitorios
- [ ] Datos persistidos en SQLite con backup diario

### RNF-4: Seguridad

- [ ] Tokens y API keys nunca en logs (sanitización automática)
- [ ] Credenciales rotables sin reinicio del sistema
- [ ] OAuth tokens renovados automáticamente antes de expirar

### RNF-5: Mantenibilidad

- [ ] Código modular con máximo 300 líneas por archivo
- [ ] Cobertura de tipos TypeScript al 100%
- [ ] Documentación inline para todas las funciones públicas

---

## Dependencias Técnicas

### Dependencias NPM

```json
{
  "winston": "^3.11.0",
  "convict": "^6.2.4",
  "p-retry": "^6.2.0",
  "bullmq": "^5.0.0",
  "better-sqlite3": "^9.0.0",
  "fluent-ffmpeg": "^2.1.2",
  "@google-cloud/text-to-speech": "^5.0.0"
}
```

### APIs Externas

- **DeepSeek API:** Generación de guiones
- **Google Cloud TTS:** Síntesis de voz con SSML
- **Pexels API:** Stock footage
- **YouTube Data API:** Publicación y analytics
- **Instagram Graph API:** Publicación en Reels (Fase 5)
- **TikTok API:** Publicación (Fase 5)

---

## Comandos FFmpeg de Referencia

### Transformación de Música (MusicTransformer)

```bash
ffmpeg -i music.mp3 \
  -af "asetrate=44100*1.02,aresample=44100,equalizer=f=1000:t=q:w=2:g=2,areverb=reverberance=15" \
  -c:a libmp3lame -q:a 2 \
  music_transformed.mp3
```

### Transformación de Video (VideoTransformer)

```bash
ffmpeg -i input.mp4 \
  -vf "scale=iw*1.05:ih*1.05,rotate=0.003*PI,crop=1080:1920,\
       eq=saturation=1.1:contrast=1.05,hue=h=5,\
       noise=alls=5:allf=t+u,vignette=PI/5,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 \
  -metadata creation_time="2026-08-21T10:30:45" \
  output.mp4
```

### Mezcla de Audio con Ducking (AudioMixer)

```bash
ffmpeg -i voice.mp3 -i music_transformed.mp3 \
  -filter_complex "[1:a]volume=-22dB,afade=t=in:d=2,afade=t=out:st=58:d=2[m];
                   [m][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=500[mc];
                   [0:a][mc]amix=inputs=2:duration=first[out];
                   [out]loudnorm=I=-16:TP=-1.5:LRA=11[final]" \
  -map "[final]" output.mp3
```

### Quemar Subtítulos ASS

```bash
ffmpeg -i video.mp4 -vf "ass=subtitles.ass:fontsdir=/fonts" -c:a copy output.mp4
```
