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
- **`ScriptGenerator.ts`**: Redacta guiones para Shorts y Videos Largos aplicando la estrategia del `SEOAgent`. Genera prompts duales: `visualPrompts` (keywords Pexels) y `comfyPrompts` (descripciones 20-50 palabras para ComfyUI).
- **`BlogGenerator.ts`**: Redacta artículos de más de 1000 palabras en Markdown listos para ser publicados, aplicando la estrategia del `SEOAgent`.
- **`AudioGenerator.ts`**: Conecta con Google Cloud TTS para sintetizar la voz del guion generado. Integra **velocidad natural 1.0x (~140 wpm)** con respeto a pausas de puntuación, **Masterización Broadcast EBU R128 (`loudnorm=I=-16:TP=-1.5:LRA=11`)** + compresión dinámica suave, y rotación multi-voz con Neural2 y Journey.
- **`SubtitleGenerator.ts`**: **(ACTUALIZADO)** Genera subtítulos ASS adaptativos: animados centrados de 110pt para Shorts (9:16) y franja cinematográfica inferior de 54pt para Videos Largos (16:9).
- **`VideoRenderer.ts`**: Obtiene videos de fondo y renderiza con `FFmpeg`. Integrado con modo `hibridoTigre` (70% Pexels + 30% IA Ken Burns + Sound Design a -22dB + Subtítulos 16:9).
- **`KenBurnsEngine.ts`**: **(NUEVO)** Anima imágenes fijas de IA con zoom suave (1.0 ➔ 1.25) y paneos a 30fps para convertirlas en clips de video cinemáticos.
- **`SoundDesignEngine.ts`**: **(ACTUALIZADO)** Ecualiza el audio vocal (`highpass=80Hz`, `lowpass=12kHz`) y mezcla pista musical ambiental atenuada a `-22dB` para lograr una atmósfera inmersiva tipo podcast/documental sin distorsiones armónicas.
- **`ThumbnailGenerator.ts`**: **(NUEVO Versión 2026)** Generador de miniaturas de alto CTR con **Prompt Engineering 2026** anti-"AI sameness", regla de tercios asimétrica 16:9 (`1280x720`) y tarjetas compactas 9:16 (`1080x1920`). Failover: Google Gemini/Imagen ➔ Flux Cloud / Turbo AI ➔ Pexels API ➔ Degradado.
- **`PollinationsClient.ts`**: Cliente para la API gratuita de Pollinations.ai. Genera imágenes sin API key ni límites. Usado como fallback cuando ComfyUI no está disponible, o para generar imágenes de referencia para I2V.
- **`QueueManager.ts`** y **`WorkerManager.ts`**: Gestión de colas asíncrona usando **BullMQ** conectado a Redis. Garantiza la ejecución secuencial (`concurrency: 1`) en `ContentQueue` de trabajos pesados (FFmpeg) y usa `PublishQueue` (`concurrency: 5`) para evadir la detección de horarios aplicando retrasos de publicación aleatorios.

### 2.1 Sistema de Generación de Video con IA Local (ComfyUI) - Agosto 2026

El sistema soporta **generación local de video con IA** usando **ComfyUI con modelos Wan 2.2 y FLUX.1**, reduciendo dependencia de videos de stock.

#### Componentes Clave:

- **`ModelConfig.ts`**: Singleton con modelos (`wan22_5B`, `wan21_1_3B`), resoluciones, estilos visuales y modos (`hibridoTigre`, `hybrid`, `pexels`, `comfyui`)
- **`ComfyUIProcessManager.ts`**: Gestión del proceso con auto-reinicio (máx 3 reintentos)
- **`ComfyUIHealthMonitor.ts`**: Health checks cada 60s, marca no disponible tras 3 fallos
- **`ComfyUIClient.ts`**: Cliente T2V/I2V con soporte de VideoType y estilos visuales
- **`ClipDatabase.ts`**: SQLite (better-sqlite3) para clips pre-generados con tracking de uso
- **`ClipPoolManager.ts`**: Pool con 6 categorías (nature, technology, business, abstract, lifestyle, urban)
- **`VideoSourceRouter.ts`**: Orquestador con modos:
  - `hibridoTigre` (NUEVO): 70% Pexels stock + 30% IA Ken Burns + Sound Design a -22dB
  - `hybrid` (default): Key segments → I2V/ComfyUI, Filler → Pool/Pexels
  - `pexels`: Solo Pexels, fallback sintético
  - `comfyui`: Solo ComfyUI, 2 reintentos
- **`VideoGenerationError.ts`**: Errores estructurados con códigos y flags de recuperabilidad
- **`PollinationsClient.ts`**: Fallback gratuito para generación de imágenes (sin API key, sin límites)

#### Modos de Generación de Video:

| Modo | Descripción | Uso |
|------|-------------|-----|
| **hibridoTigre** (NUEVO) | 70% Stock Pexels + 30% IA Ken Burns + Sound Design -22dB | Máxima retención en YouTube, ritmo dinámico y diferenciación |
| **T2V (Text-to-Video)** | Genera video directamente desde prompt de texto | Pool de clips, segmentos de relleno |
| **I2V (Image-to-Video)** | Anima una imagen estática con movimiento controlado | Segmentos KEY (intro/outro), mayor control visual |

#### Estrategia I2V Híbrida:
1. **Segmentos KEY** (intro, outro, momentos de impacto): Usan I2V para control visual preciso
   - Pollinations.ai genera imagen base → ComfyUI anima con modelo I2V
   - Resultado: video con composición exacta + movimiento cinematográfico
2. **Segmentos FILLER** (contenido intermedio): Usan T2V del pool pre-generado
   - Más eficiente, aprovecha clips ya generados
   - Variedad visual sin costo de tiempo de generación

#### Variables de Entorno:
```env
VIDEO_SOURCE_MODE=hibridoTigre    # hibridoTigre | pexels | hybrid | comfyui
COMFYUI_MODEL=wan22_5B     # wan22_5B | wan21_1_3B
COMFYUI_PATH=D:\ComfyUI
COMFYUI_URL=http://127.0.0.1:8188
CLIP_PREGENERATION_SCHEDULE=02:00-06:00  # Horario de pre-generación
CLIP_POOL_MIN_PER_CATEGORY=20            # Mínimo de clips por categoría
```

#### Tiempos de Generación (RTX 4060 8GB --lowvram):
| Preset | Tiempo | Resolución | Frames | Uso |
|--------|--------|------------|--------|-----|
| fast | ~4.5 min | 480×288 | 17 | Pool masivo |
| balanced | ~10-15 min | 576×1024 | 33 | Uso normal |
| quality | ~25-35 min | 832×480 | 49 | Segmentos KEY |

#### Estilos Visuales:
- **cinemagraph_plotagraph**: Escena estática, un elemento sutil en movimiento. Para producto/marca.
- **moody_lofi_ambient**: Atmósfera melancólica con movimiento lento. Para educativo.
- **analog_horror_liminal**: Espacios liminales perturbadores. Para hooks/misterio.

#### Script de Inicialización del Pool:
```bash
# Iniciar generación del pool de clips (ejecuta en background)
npx ts-node src/init-clip-pool.ts
# - o después de compilar -
node dist/init-clip-pool.js
```
El script `init-clip-pool.ts` verifica conexión con ComfyUI, inicializa la base de datos de clips, y genera clips faltantes para completar el pool mínimo por categoría.

### 2.2 Cambios de Seguridad en Video y Audio (NUEVO Agosto 2026)

#### Hook Visual Seguro: Glitch RGB (0.5s)
**Problema anterior:** El efecto "strobing epiléptico" de 3 segundos violaba las políticas de accesibilidad de YouTube y representaba riesgo de:
- Activar filtro automático de accesibilidad
- Reportes de usuarios sensibles a epilepsia
- Desmonetización o shadowban por "contenido sensorialmente agresivo"

**Solución implementada (VideoRenderer.ts):**
```
Glitch RGB (0.5s) - Efecto de aberración cromática seguro:
- Separación de canales RGB con rgbashift
- Variación sutil de brillo con sin(t*10)*0.15
- Solo activo en los primeros 0.5 segundos
- 100% seguro para epilepsia, cumple políticas YouTube
```

Filtro FFmpeg aplicado:
```bash
eq=brightness='if(between(t,0,0.5),sin(t*10)*0.15,0)':contrast=1.2:saturation=1.1,
rgbashift=rh='if(between(t,0,0.5),-5,0)':rv='if(between(t,0,0.5),5,0)':
gh='if(between(t,0,0.5),5,0)':gv='if(between(t,0,0.5),-5,0)':
bh='if(between(t,0,0.5),-5,0)':bv='if(between(t,0,0.5),5,0)'
```

#### Humanización de Audio: Formant Shift (reemplaza atempo)
**Problema anterior:** `atempo=1.02` era detectable por YouTube como "audio manipulado" y podía activar flags de contenido sintético.

**Solución implementada (AudioGenerator.ts):**
```
Formant Shift - Altera timbre sin cambiar velocidad:
1. asetrate=44100*1.02  → Sube el formante 2%
2. aresample=44100      → Normaliza sample rate
3. atempo=0.9804        → Compensa velocidad (1/1.02)
Resultado: misma duración, timbre diferente, INDETECTABLE
```

La voz suena un 2% más "pequeña" o "diferente", rompiendo el hash digital del TTS sin afectar la velocidad percibida.

### 2.3 Pollinations.ai - Fallback Gratuito para Imágenes (NUEVO)

**PollinationsClient.ts** proporciona acceso a una API de generación de imágenes 100% gratuita:
- Sin autenticación requerida
- Sin límites de uso
- Modelos disponibles: `flux` (mejor calidad), `turbo`, `stable-diffusion`

**Usos principales:**
1. **Fallback** cuando ComfyUI no está disponible
2. **Imágenes para I2V**: Genera la imagen base que ComfyUI animará
3. **Thumbnails alternativos**: Generación rápida de fondos

```typescript
const client = new PollinationsClient();
// Generar imagen para I2V (optimizada)
const result = await client.generateForI2V(
    "serene mountain landscape at sunset",
    "portrait" // para Shorts 9:16
);
```

- **`AutonomousOrchestrator.ts`**: El reloj maestro (Cron jobs). Coordina todo el sistema de forma pasiva, inyectando tareas en la cola en vez de ejecutarlas de forma bloqueante:
  - Lunes, Miércoles, Viernes: Shorts Trilingües (Guarda ID en SQLite)
  - Martes, Jueves y Sábados: Documentales Largos Trilingües (Martes: 🇪🇸 Español, Jueves: 🇺🇸 Inglés, Sábados: 🇧🇷 Portugués)
  - Diariamente (6:00 AM): Artículos de Blog Multi-Plataforma (Hashnode, Medium, Dev.to) - **PAUSADO** mediante `ENABLE_BLOG_PUBLISHING=false` por detección antibot en plataformas.
  - Diariamente (8:00 PM): Reporte Telegram con analíticas reales, rendimiento de videos y limpieza automática de archivos multimedia mayores a 7 días.

### 3. `src/publishers/` y `src/orchestration/` (Los Distribuidores)
- **`MultiPlatformDispatcher.ts`**: Toma los videos generados desde la cola `PublishQueue` y les aplica un **retraso aleatorio de 0 a 45 minutos** antes de publicar en YouTube, rompiendo los patrones exactos de publicación detectables por el algoritmo. Además de esto orquesta a TikTok e Instagram.
- **`YouTubePublisher.ts`**: Utiliza Google OAuth2 para subir los videos generados directamente al canal de YouTube. Inyecta automáticamente los tags del SEOAgent como hashtags en la descripción.
  - **Estrategia de Publicación Híbrida:** 1 de cada 5 videos se publica como **privado/no listado** en lugar de público. Esto permite que un humano revise el contenido y lo publique manualmente, garantizando interacción humana consistente y evitando el "shadowban de API" por patrones de publicación 100% automatizados.
- **`InstagramPublisher.ts` / `TikTokPublisher.ts`**: Totalmente funcionales mediante inyección de Cookies y `Puppeteer Stealth`. Suben el material respectivo (Reels de 30s y TikToks de 15s) automáticamente, sin embargo, **ESTÁN BLOQUEADOS** de ejecutarse debido al `YPPValidationGate` (Regla de oro #2) hasta que la API verifique el "primer dólar" en YouTube.
- **Plataformas de Blog (`HashnodePublisher`, `MediumPublisher`, `DevToPublisher`)**: Soportan la publicación usando Puppeteer o API. Actualmente la ejecución se rige por el flag `ENABLE_BLOG_PUBLISHING`.
- **`HashnodePublisher.ts`**: Publicación en Hashnode mediante Puppeteer en modo silencioso (soporta Docker).
- **`MediumPublisher.ts`**: Publicación en Medium mediante Puppeteer.
- **`DevToPublisher.ts`**: Publicación en Dev.to mediante la API oficial REST.

### 4. `src/utils/` y `src/reporters/` (Monitoreo & Logs)
- **`SystemReporter.ts`**: Monitorea asíncronamente el espacio en disco disponible e informa a Telegram preventivamente si cae por debajo de 5GB.
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
- **Video IA Local:** ComfyUI con modelos Wan 2.2 (T2V e I2V).
- **Imágenes Fallback:** Pollinations.ai (100% gratuito, sin API key).
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
7. **Evasión de Detección y Retención (Actualizado Agosto 2026):**
   - Estrategia híbrida en `YouTubePublisher.ts` (1 de cada 5 videos en privado para revisión humana).
   - Inyección de Personas, Títulos de 8 palabras, y formato Multi-Voz para evadir fatiga semántica de los LLMs.
   - **Formant Shift** (reemplaza `atempo=1.02`): Altera timbre de voz sin cambiar velocidad, indetectable.
   - **Glitch RGB** (reemplaza strobing 3s): Efecto visual seguro de 0.5s, cumple políticas de epilepsia.
8. **Retención Visual Neurodivergente y Prevención de Repetición:**
   - **Filtros FFmpeg Sensoriales:** Uso de aberración cromática (`chromashift`) y contrastes altos en la renderización de los videos para asimilarse al nicho neurodivergente.
   - **Subtítulos ASS Estrictos:** Filtrado masivo de "stopWords" en el guion, para que los subtítulos destaquen solo términos valiosos con múltiples colores vivos y micro-animaciones hiperactivas.
   - **Pexels Anti-Reuse Engine:** Registro en caché de los últimos 100 clips Pexels usados para diversificar las tomas solicitando lotes más grandes (`per_page=15`).
   - **Fix Hook Largo:** Corrección en el generador de guiones para suprimir duplicaciones molestas del saludo de bienvenida.
9. **Generación de Video con IA Local (ComfyUI) (Agosto 2026):**
   - **Integración ComfyUI:** Sistema completo con `ComfyUIClient`, `ComfyUIProcessManager` y `ComfyUIHealthMonitor`.
   - **Modelos Wan 2.2:** Soporte para `wan22_5B` (alta calidad) y `wan21_1_3B` (rápido).
   - **Estrategia I2V Híbrida:** Segmentos KEY usan Image-to-Video para control visual preciso, segmentos FILLER usan T2V del pool.
   - **VideoSourceRouter:** Orquestador con modo `hybrid` (default) que usa ComfyUI para segmentos clave y Pexels/Pool para relleno.
   - **ClipPoolManager:** Pool de clips pre-generados organizados en 6 categorías con selección inteligente.
   - **Estilos Visuales:** `cinemagraph_plotagraph`, `moody_lofi_ambient`, `analog_horror_liminal` asignados según tipo de contenido.
   - **Prompts Duales:** `ScriptGenerator` genera `visualPrompts` (Pexels) + `comfyPrompts` (20-50 palabras para ComfyUI).
   - **Pollinations.ai Fallback:** API gratuita sin límites para generación de imágenes cuando ComfyUI no está disponible o para I2V.
   - **Script init-clip-pool.ts:** Inicializador del pool que genera clips en background hasta completar el mínimo por categoría.
