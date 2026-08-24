# GEMINI.md - Contexto y Guía del Proyecto OmniAI-Engine

OmniAI-Engine es un motor autónomo de generación y distribución de contenido (Shorts de YouTube, Documentales Largos y Artículos de Blog) enfocado al 100% en el nicho de **Autismo e Inteligencia Artificial**. Operado mediante un orquestador pasivo, agentes de IA (DeepSeek), síntesis de voz (Google Cloud TTS), renderizado de video (FFmpeg) y automatizaciones de publicación (YouTube Data API, Puppeteer, Dev.to API).

**Estado Actual:** PRODUCCIÓN ACTIVA (Flujo completo implementado y orquestado).

---

## Módulos Principales (Estructura de Carpetas)

El código fuente se encuentra en `src/`:

### 0. Infraestructura (Docker & Base de Datos)
- **`Dockerfile` & `docker-compose.yml`**: El sistema está diseñado para correr 24/7 en un contenedor aislado con dependencias de sistema inyectadas (Chromium nativo para Puppeteer y librerías FFmpeg).
- **`src/db/Database.ts`**: Gestor de base de datos **SQLite** (`content/database.sqlite`). Registra publicaciones de videos y blogs, vistas, likes y suscriptores para análisis histórico.

### 1. `src/agents/` (Los Cerebros)
- **`SEOAgent.ts`**: El cerebro de marketing. Consulta a DeepSeek para descubrir tendencias virales bajo barreras estrictas de nicho (**Autismo e Inteligencia Artificial**), formula títulos hiper-optimizados, genera 15-20 keywords exactas y analiza métricas históricas de la base de datos para retroalimentación autónoma.
- **`AnalyticsEngine.ts`**: Motor de analíticas que consulta en tiempo real la **YouTube Data API v3** (`youtube.videos.list`, `youtube.channels.list`), extrae reproducciones, likes y suscriptores, y actualiza la base de datos SQLite.

### 2. `src/generators/` (Los Creadores)
- **`ScriptGenerator.ts`**: Redacta guiones para Shorts y Videos Largos aplicando la estrategia del `SEOAgent`.
- **`BlogGenerator.ts`**: Redacta artículos de más de 1000 palabras en Markdown listos para ser publicados, aplicando la estrategia del `SEOAgent`.
- **`AudioGenerator.ts`**: Conecta con Google Cloud TTS para sintetizar la voz del guion generado. Integra **rotación aleatoria de voces Premium** (Neural2/Chirp/Journey) para evadir la detección algorítmica de audios robóticos y divide textos largos en chunks automáticamente.
- **`VideoRenderer.ts`**: Automatiza la descarga de videos de fondo gratuitos (usando la API de Pexels con búsqueda de fallback) y utiliza `FFmpeg` para superponer el audio y renderizar.
- **`QueueManager.ts`** y **`WorkerManager.ts`**: **(NUEVO)** Gestión de colas asíncrona usando **BullMQ** conectado a Redis. Garantiza la ejecución secuencial (`concurrency: 1`) en `ContentQueue` de trabajos pesados (FFmpeg) y usa `PublishQueue` (`concurrency: 5`) para evadir la detección de horarios aplicando retrasos de publicación aleatorios.
- **`AutonomousOrchestrator.ts`**: El reloj maestro (Cron jobs). Coordina todo el sistema de forma pasiva, inyectando tareas en la cola en vez de ejecutarlas de forma bloqueante:
  - Lunes, Miércoles, Viernes: Shorts Trilingües (Guarda ID en SQLite)
  - Martes, Jueves y Sábados: Documentales Largos Trilingües (Martes: 🇪🇸 Español, Jueves: 🇺🇸 Inglés, Sábados: 🇧🇷 Portugués)
  - Diariamente (6:00 AM): Artículos de Blog Multi-Plataforma (Hashnode, Medium, Dev.to) - **PAUSADO** mediante `ENABLE_BLOG_PUBLISHING=false` por detección antibot en plataformas.
  - Diariamente (8:00 PM): Reporte Telegram con analíticas reales, rendimiento de videos y limpieza automática de archivos multimedia mayores a 7 días.

### 3. `src/publishers/` y `src/orchestration/` (Los Distribuidores)
- **`MultiPlatformDispatcher.ts`**: Toma los videos generados desde la cola `PublishQueue` y les aplica un **retraso aleatorio de 0 a 45 minutos** antes de publicar en YouTube, rompiendo los patrones exactos de publicación detectables por el algoritmo. Además de esto orquesta a TikTok e Instagram.
- **`YouTubePublisher.ts`**: Utiliza Google OAuth2 para subir los videos generados directamente al canal de YouTube. Inyecta automáticamente los tags del SEOAgent como hashtags en la descripción.
- **`InstagramPublisher.ts` / `TikTokPublisher.ts`**: Totalmente funcionales mediante inyección de Cookies y `Puppeteer Stealth`. Suben el material respectivo (Reels de 30s y TikToks de 15s) automáticamente, sin embargo, **ESTÁN BLOQUEADOS** de ejecutarse debido al `YPPValidationGate` (Regla de oro #2) hasta que la API verifique el "primer dólar" en YouTube.
- **Plataformas de Blog (`HashnodePublisher`, `MediumPublisher`, `DevToPublisher`)**: Soportan la publicación usando Puppeteer o API. Actualmente la ejecución se rige por el flag `ENABLE_BLOG_PUBLISHING`.
- **`YouTubePublisher.ts`**: Utiliza Google OAuth2 para subir los videos generados directamente al canal de YouTube. Inyecta automáticamente los tags del SEOAgent como hashtags en la descripción.
- **`HashnodePublisher.ts`**: Publicación en Hashnode mediante Puppeteer en modo silencioso (soporta Docker).
- **`MediumPublisher.ts`**: Publicación en Medium mediante Puppeteer.
- **`DevToPublisher.ts`**: Publicación en Dev.to mediante la API oficial REST.

### 4. `src/utils/` y `src/reporters/` (Monitoreo & Logs)
- **`SystemReporter.ts`**: **(NUEVO)** Monitorea asíncronamente el espacio en disco disponible e informa a Telegram preventivamente si cae por debajo de 5GB.
- **`Logger.ts`**: Sistema de logs centralizado. Escribe logs estructurados en consola y en archivos persistentes (`content/logs/app.log` y `content/logs/error.log`). Expone visor en vivo desde la web.
- **`TelegramReporter.ts`**: Notifica al dueño (Mauricio) a través de Telegram sobre el inicio de operaciones, éxito de publicación de videos/blogs, o cualquier error crítico en el sistema.

### 5. `src/auth/` & `src/config/`
- Maneja la persistencia de credenciales OAuth de Google (`oauth2.tokens.json`) y configuraciones de enrutamiento de modelos (`ModelRouter.ts`).

---

## Flujo de Vida de una Tarea (Ej. Pipeline de Blog)

1. El Cron (`AutonomousOrchestrator`) se activa a las 4:00 PM (Jueves).
2. Llama a `SEOAgent.generateDailySEOStrategy('Spanish')` para obtener el tema, título y keywords virales.
3. Le pasa el tema a `BlogGenerator.generateArticle()`, el cual redacta el artículo en Markdown con DeepSeek.
4. El Orchestrator sobreescribe el título y tags del artículo con los estrictos generados por el SEOAgent.
5. Pasa el texto a `HashnodePublisher.publish()`, que abre Puppeteer, redacta y publica.
6. Notifica el resultado vía `TelegramReporter`.

---

## Stack Técnico y Reglas para el AI

- **Lenguaje:** TypeScript (node ts-node).
- **LLM Primario:** DeepSeek API (`deepseek-chat` model).
- **APIs Externas:** Google Cloud TTS, YouTube Data API v3, Pexels API.
- **Automatización Web:** Puppeteer (para Hashnode).
- **Procesamiento Multimedia:** FFmpeg (requiere ffmpeg instalado en el sistema).
- **Regla Importante:** Nunca sobreescribas `oauth2.tokens.json` o se perderá el acceso a la cuenta de YouTube.
- **Contexto Heredado:** Comparte filosofía con `autonomous-income-node`. El agente no debe requerir intervención humana; si ocurre un fallo (ej. de red), debe atraparlo, notificar a Telegram y abortar limpiamente.

---

## Scripts de Prueba Aislados (.mjs)

En la raíz del proyecto encontrarás scripts terminados en `.mjs` (por ejemplo, `test-thumbnail-sync.mjs`, `test-integration-pipeline.mjs`). Estos son **entornos de prueba aislados** que te permiten validar o depurar funciones individuales sin encender todo el orquestador autónomo. Al interactuar con el proyecto, puedes utilizarlos libremente ejecutando `node test-[nombre].mjs`.

---

## V2 Optimización Integral (Completada Agosto 2026)

Implementación exhaustiva según spec `omniai-v2-optimization`, enfocada en evasión de algoritmos, monetización y resiliencia:

1. **Anti-Detección Total (Fase 1):** 
   - `VideoTransformer` y `ThumbnailTransformer`: Alteración geométrica, cromática y de metadatos.
2. **Humanización Profunda (Fase 2):** 
   - `ScriptStructureRandomizer`: 6 estructuras narrativas (evitando repetición).
   - `MusicTransformer`: Evasión de Content ID variando pitch, tempo, EQ y reverb sutil.
3. **Infraestructura Básica (Fase 3):**
   - Caché con TTL (`CacheManager`), Logs con Winston, `RetryHandler` con backoff.
4. **Validación Monetización (Fase 4 - YPPValidationGate y AnalyticsIntegration):**
   - **CRÍTICO:** Bloquea canal 3 o expansión a IG/TikTok si no se cumplen requisitos del Programa de Partners de YouTube (YPP).
   - Utiliza **YouTube Analytics API v2** en código real para verificar retención, ingresos (`hasFirstDollar`) y suscriptores para habilitar el motor multiplataforma.
5. **Expansión Multiplataforma (Fase 5):**
   - Implementaciones completas de `InstagramPublisher` y `TikTokPublisher` mediante Puppeteer Stealth (en espera de desactivación de la Regla de oro YPP).
   - `MultiPlatformDispatcher`: Horarios aleatorios de publicación y retrasos secuenciales.
6. **Infraestructura Avanzada (Fase 6):**
   - `CircuitBreaker`, Dead-Letter Queue (BullMQ) y endpoints de métricas.
