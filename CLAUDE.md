# CLAUDE.md - Contexto y Guía del Proyecto OmniAI-Engine

OmniAI-Engine es un motor autónomo de generación y distribución de contenido (Shorts de YouTube, Documentales Largos y Artículos de Blog) enfocado al 100% en el nicho de **Autismo e Inteligencia Artificial**. Operado mediante un orquestador pasivo, agentes de IA (DeepSeek), síntesis de voz (Google Cloud TTS), renderizado de video (FFmpeg) y automatizaciones de publicación (YouTube Data API, Puppeteer, Dev.to API).

**Estado Actual:** PRODUCCIÓN ACTIVA (Flujo completo implementado y orquestado).

---

## Módulos Principales (Estructura de Carpetas)

El código fuente se encuentra en `src/`:

### 0. Infraestructura (Docker & Base de Datos)
- **`Dockerfile` & `docker-compose.yml`**: El sistema está diseñado para correr 24/7 en un contenedor aislado con dependencias de sistema inyectadas (Chromium nativo para Puppeteer y librerías FFmpeg).
- **`src/db/Database.ts`**: Gestor de base de datos **SQLite** (`content/database.sqlite`). Registra publicaciones de videos y blogs, vistas, likes y suscriptores para análisis histórico.
  - **NUEVO:** Sistema de deduplicación de temas:
    - `rawTopic`: Tema original generado por SEOAgent
    - `topicHash`: Hash MD5 del tema normalizado para comparación
    - `keywords`: JSON de tags SEO
    - `videoType`: 'short' o 'long'
  - Métodos de deduplicación:
    - `checkTopicDuplicate(rawTopic)`: Verifica si un tema de video ya existe
    - `checkBlogTopicDuplicate(rawTopic)`: Verifica si un tema de blog ya existe
    - `getRecentTopics(50)`: Obtiene últimos 50 temas para contexto del LLM
    - `getRecentBlogTopics(30)`: Obtiene últimos 30 temas de blogs

### 1. `src/agents/` (Los Cerebros)
- **`SEOAgent.ts`**: El cerebro de marketing. Consulta a DeepSeek para descubrir tendencias virales bajo barreras estrictas de nicho (**Autismo e Inteligencia Artificial**), formula títulos hiper-optimizados, genera 15-20 keywords exactas y analiza métricas históricas de la base de datos para retroalimentación autónoma.
  - **NUEVO:** Grounding Empírico / RAG RSS (`rss-parser`). Extrae noticias reales diarias de *Spectrum News* (Autismo) o *ScienceDaily* (IA) para anclar el conocimiento del LLM y evitar contenido genérico (AI Slop).
  - **NUEVO:** Sistema de deduplicación integrado:
    - Carga los últimos 50 temas de videos (o 30 de blogs) antes de generar
    - Incluye lista de temas previos en el prompt del LLM
    - Verifica hash del tema generado contra BD
    - Reintenta automáticamente hasta 3 veces si detecta duplicado
    - Temperatura aumentada a 0.85 para mayor creatividad
- **`AnalyticsEngine.ts`**: Motor de analíticas que consulta en tiempo real la **YouTube Data API v3** (`youtube.videos.list`, `youtube.channels.list`), extrae reproducciones, likes y suscriptores, y actualiza la base de datos SQLite.

### 2. `src/generators/` (Los Creadores)
- **`ScriptGenerator.ts`**: Redacta guiones para Shorts y Videos Largos aplicando la estrategia del `SEOAgent`. Incluye campo `hook` (primeros 3-10 segundos) y `chapters` con timestamps para videos largos.
  - **NUEVO (Agosto 2026):** Generación de prompts duales:
    - `visualPrompts`: Keywords optimizadas para búsqueda en Pexels
    - `comfyPrompts`: Descripciones de 20-50 palabras para generación con ComfyUI
    - Asignación automática de estilos visuales por tipo de contenido
- **`BlogGenerator.ts`**: Redacta artículos de más de 1000 palabras en Markdown listos para ser publicados, aplicando la estrategia del `SEOAgent`.
- **`AudioGenerator.ts`**: Conecta con Google Cloud TTS para sintetizar la voz del guion generado.
  - **Velocidad Natural (1.0x):** Configurado a ritmo conversacional humano (~140 wpm), respetando pausas y respiraciones de puntuación sin recortes acelerados.
  - **Masterización Broadcast:** Filtro FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` (estándar EBU R128 de YouTube) + compresor dinámico para máxima presencia, claridad y calidez vocal.
  - **Sistema de Chunking:** Divide guiones largos por oraciones respetando el límite de 1800 bytes y los une con `_concat_list.txt`.
  - **Rotación Multi-Voz:** Soporta `[VOICE_A]` y `[VOICE_B]` para dinámicas de podcast/diálogo con voces Neural2 y Journey.
- **`SubtitleGenerator.ts`**: **ACTUALIZADO (Agosto 2026)** - Motor de subtítulos dinámicos responsivos:
  - **Shorts (9:16):** Subtítulos animados flotantes en el centro (110pt) con giros y zooms cinéticos.
  - **Videos Largos (16:9):** Subtítulos inferiores elegantes (54pt) con fundidos suaves y posicionamiento cinematográfico.
- **`VideoRenderer.ts`**: Automatiza la obtención de videos de fondo y utiliza `FFmpeg` para superponer el audio y renderizar.
  - **NUEVO (Agosto 2026):** Modo `hibridoTigre` que combina 70% video real Pexels + 30% conceptos IA con Ken Burns + Sound Design atenuado (-22dB) + Subtítulos responsivos 16:9
  - Integración con `VideoSourceRouter` para fuentes múltiples (ComfyUI, Pexels, Pool)
  - Caché de sesión para evitar repetición de clips dentro del mismo video
  - Soporte para campo `sourceUsed` en metadatos de segmentos
- **`KenBurnsEngine.ts`**: **NUEVO (Agosto 2026)** - Convierte imágenes estáticas de IA en clips de video animados Full HD de 3.2s:
  - Efectos: `zoom-in` suave (1.0 ➔ 1.25), `zoom-out` (1.25 ➔ 1.0) y paneos laterales a 30fps
  - Optimización de color: Contraste 1.15 y saturación 1.1 para acabado cinemático
- **`SoundDesignEngine.ts`**: **ACTUALIZADO (Agosto 2026)** - Motor de diseño sonoro profesional:
  - Aplica ecualización vocal de alta definición (`highpass=80Hz`, `lowpass=12kHz`)
  - Mezcla pistas de música ambiental atenuadas a `-22dB` sin generar ruidos ni distorsiones armónicas
- **`ThumbnailGenerator.ts`**: **NUEVO (Versión 2026)** - Generador de miniaturas de alto CTR:
  - **Prompt Engineering 2026:** Estructura visual anti-"AI sameness", eliminando flechas rojas y caras genéricas
  - **Diseño Asimétrico 16:9:** Regla de tercios con texto en gradiente izquierdo (40%) y arte libre de alta definición (60% derecho)
  - **Formato Vertical 9:16:** Tarjetas compactas flotantes para Shorts
  - **Failover Multi-Nivel:** Google Gemini / Imagen 3 ➔ Flux Cloud / Turbo AI ➔ Pexels API ➔ Degradado
  - Texto con fuente Montserrat 900, palabras clave en cyan neón (`#00d4ff`) y branding "NeuroSync AI"
- **`QueueManager.ts`** y **`WorkerManager.ts`**: **NUEVO** - Gestión de colas asíncrona usando **BullMQ** conectado a Redis. Garantiza la ejecución secuencial (`concurrency: 1`) en `ContentQueue` para trabajos pesados (FFmpeg) para evitar el agotamiento de recursos (OOM) en el contenedor, e implementa `PublishQueue` (`concurrency: 5`) para la distribución y subida de videos de forma no bloqueante.

### 2.1 Sistema de Generación de Video con IA Local (ComfyUI) - NUEVO Agosto 2026

El sistema ahora soporta **generación local de video con IA** usando **ComfyUI con modelos Wan 2.2**, reduciendo la dependencia de videos de stock de Pexels.

#### Componentes Nuevos Creados:

- **`src/comfyui/ModelConfig.ts`**: Configuración singleton para modelos y estilos visuales:
  - **Modelos:** `wan22_5B` (alta calidad), `wan21_1_3B` (rápido)
  - **Resoluciones:** `576x1024` (Shorts verticales), `832x480` (videos largos)
  - **Estilos Visuales:**
    - `cinemagraph_plotagraph`: Escena estática con un elemento sutil en movimiento (vapor, agua, partículas). Uso: contenido de producto/marca.
    - `moody_lofi_ambient`: Atmósfera melancólica y acogedora con movimiento lento. Uso: contenido educativo.
    - `analog_horror_liminal`: Espacios liminales perturbadores con calma inquietante. Uso: contenido misterioso/hooks impactantes.

- **`src/comfyui/ComfyUIProcessManager.ts`**: Gestión del ciclo de vida del proceso ComfyUI:
  - Inicio/parada automática del servidor ComfyUI
  - Auto-reinicio en caso de crash (máximo 3 reintentos)
  - Integración con sistema de logs

- **`src/comfyui/ComfyUIHealthMonitor.ts`**: Monitoreo de salud periódico:
  - Health checks cada 60 segundos
  - Marca como no disponible tras 3 fallos consecutivos
  - Notificación a Telegram si ComfyUI cae

- **`src/comfyui/ComfyUIClient.ts`**: Cliente de generación T2V e I2V:
  - Soporte para Text-to-Video (T2V) e Image-to-Video (I2V)
  - Archivos de modelo dinámicos según configuración
  - Soporte para VideoType (short/long) y estilos visuales
  - Logging mejorado y manejo de errores estructurado

- **`src/comfyui/ClipDatabase.ts`**: Base de datos SQLite para clips pre-generados:
  - Almacena clips usando `better-sqlite3` para acceso síncrono
  - Tracking de uso (veces usado, última fecha de uso)
  - Categorización por tema y estilo visual

- **`src/comfyui/ClipPoolManager.ts`**: Gestión del pool de clips pre-generados:
  - **6 categorías:** nature, technology, business, abstract, lifestyle, urban
  - Selección inteligente evitando clips usados recientemente
  - Reposición automática cuando el pool baja de umbral

- **`src/comfyui/VideoSourceRouter.ts`**: Orquestador de fuentes de video:
  - **`hibridoTigre` (NUEVO):** 70% Pexels stock + 30% IA Ken Burns + Sound Design atenuado (-22dB) + Subtítulos dinámicos
  - **`hybrid` (default):** Segmentos clave → ComfyUI, Relleno → Pool/Pexels, cadena de fallback automática
  - **`pexels`:** Solo Pexels, fallback sintético
  - **`comfyui`:** Solo ComfyUI, 2 reintentos, error si falla

- **`src/comfyui/VideoGenerationError.ts`**: Manejo de errores estructurado:
  - Códigos de error específicos (COMFYUI_UNAVAILABLE, GENERATION_TIMEOUT, etc.)
  - Flags de recuperabilidad para lógica de retry
- **`PollinationsClient.ts`**: **(NUEVO)** Fallback gratuito para generación de imágenes sin API key ni límites. Usado para I2V o cuando ComfyUI no está disponible.

#### Variables de Entorno Clave:

```env
VIDEO_SOURCE_MODE=hibridoTigre        # hibridoTigre | pexels | hybrid | comfyui
COMFYUI_MODEL=wan22_5B               # wan22_5B | wan21_1_3B
COMFYUI_PATH=D:\ComfyUI              # Ruta local a ComfyUI
COMFYUI_URL=http://127.0.0.1:8188   # URL del servidor ComfyUI
CLIP_PREGENERATION_SCHEDULE=02:00-06:00  # Horario de pre-generación nocturna
```

#### Flujo de Generación de Video (Modo Híbrido):

```
VideoRenderer.renderSegment(segment)
  │
  ├─► VideoSourceRouter.getVideo(prompt, type)
  │     │
  │     ├─► Clasifica segmento como 'key' (intro/outro) o 'filler'
  │     │
  │     ├─► Segmento KEY:
  │     │     ├─► ComfyUI (T2V con estilo visual)
  │     │     ├─► Fallback: Pexels
  │     │     └─► Fallback: Sintético
  │     │
  │     └─► Segmento FILLER:
  │           ├─► ClipPool (pre-generados)
  │           ├─► Fallback: Pexels
  │           └─► Fallback: Sintético
  │
  └─► Retorna { videoPath, sourceUsed: 'comfyui' | 'pexels' | 'pool' | 'synthetic' }
```

#### Asignación de Estilos Visuales por Tipo de Contenido:

| Tipo de Contenido | Estilo Visual | Razón |
|-------------------|---------------|-------|
| Producto/Marca | `cinemagraph_plotagraph` | Elegancia sutil, foco en el producto |
| Educativo | `moody_lofi_ambient` | Atmósfera relajante, retención prolongada |
| Hooks/Misterio | `analog_horror_liminal` | Impacto visual, curiosidad |

### 2.2 Cambios de Seguridad en Video y Audio (NUEVO Agosto 2026)

#### Hook Visual Seguro: Glitch RGB (0.5s) - Reemplaza Strobing
**Problema anterior:** El efecto "strobing epiléptico" de 3 segundos violaba las políticas de accesibilidad de YouTube:
- Riesgo de activar filtro de accesibilidad
- Reportes de usuarios con epilepsia
- Posible desmonetización o shadowban

**Solución implementada (VideoRenderer.ts):**
```
Glitch RGB (0.5s) - Efecto de aberración cromática seguro:
- Separación de canales RGB con rgbashift (desplazamiento ±5px)
- Variación sutil de brillo: sin(t*10)*0.15
- Solo activo en primeros 0.5 segundos
- 100% seguro para epilepsia, cumple políticas YouTube
```

Filtro FFmpeg:
```bash
eq=brightness='if(between(t,0,0.5),sin(t*10)*0.15,0)':contrast=1.2:saturation=1.1,
rgbashift=rh='if(between(t,0,0.5),-5,0)':rv='if(between(t,0,0.5),5,0)':
gh='if(between(t,0,0.5),5,0)':gv='if(between(t,0,0.5),-5,0)':
bh='if(between(t,0,0.5),-5,0)':bv='if(between(t,0,0.5),5,0)'
```

#### Humanización de Audio: Formant Shift (reemplaza atempo=1.02)
**Problema anterior:** `atempo=1.02` era detectable por YouTube como "audio manipulado" y podía activar flags de contenido sintético.

**Solución implementada (AudioGenerator.ts):**
```
Formant Shift - Altera timbre SIN cambiar velocidad:
1. asetrate=44100*1.02  → Sube formante 2%
2. aresample=44100      → Normaliza sample rate  
3. atempo=0.9804        → Compensa velocidad (inverso de 1.02)
Resultado: misma duración, timbre diferente, INDETECTABLE
```

La voz suena un 2% más "pequeña" o diferente, rompiendo el hash digital del TTS sin afectar la velocidad percibida.

### 2.3 Pollinations.ai - Fallback Gratuito para Imágenes (NUEVO)

**`src/generators/PollinationsClient.ts`** proporciona acceso a una API de imágenes 100% gratuita:
- Sin autenticación requerida (no API key)
- Sin límites de uso
- Modelos: `flux` (mejor calidad), `turbo`, `stable-diffusion`

**Usos principales:**
1. **Fallback** cuando ComfyUI no está disponible
2. **Imágenes para I2V**: Genera imagen base que ComfyUI animará
3. **Thumbnails alternativos**: Generación rápida de fondos

```typescript
const client = new PollinationsClient();
const result = await client.generateForI2V(
    "serene mountain landscape at sunset",
    "portrait" // para Shorts 9:16
);
```

### 2.4 Estrategia I2V Híbrida (NUEVO)

El sistema usa **Image-to-Video (I2V)** para mayor control visual en segmentos importantes:

| Tipo Segmento | Estrategia | Fuente |
|---------------|------------|--------|
| **KEY** (intro/outro) | I2V | Pollinations genera imagen → ComfyUI anima |
| **FILLER** (contenido) | T2V del pool | Clips pre-generados o Pexels |

**Ventajas:**
- Composición exacta en momentos de impacto
- Mayor control sobre estética visual
- Pool eficiente para contenido intermedio

- **`AutonomousOrchestrator.ts`**: El reloj maestro (Cron jobs). Coordina todo el sistema de forma pasiva, inyectando tareas en la cola en vez de ejecutarlas de forma bloqueante:
  - **1:00 AM:** Sincronización nocturna de analíticas (silencioso)
  - **4:00 AM:** 📊 **NUEVO** Informe diario completo a Telegram:
    - Métricas del canal (suscriptores, vistas, videos)
    - Top 5 videos con vistas y likes
    - Estadísticas de base de datos (shorts, largos, blogs, temas únicos)
    - Agenda del día (qué contenido se publicará)
  - **8:00 AM:** Mensaje "Buenos días" de inicio de operaciones
  - **10:00 AM, 2:00 PM, 6:00 PM (Lun/Mié/Vie):** Shorts Trilingües (ES/EN/PT)
  - **3:00 PM (Mar/Jue/Sáb):** Documentales Largos (Mar: ES, Jue: EN, Sáb: PT)
  - Diariamente (6:00 AM): Artículos de Blog Multi-Plataforma (Hashnode, Medium, Dev.to) - **PAUSADO** mediante `ENABLE_BLOG_PUBLISHING=false` por detección antibot en plataformas.
  - Diariamente (8:00 PM): Reporte Telegram con analíticas reales, rendimiento de videos y limpieza automática de archivos multimedia mayores a 7 días.

### 3. `src/publishers/` y `src/orchestration/` (Los Distribuidores)
- **`MultiPlatformDispatcher.ts`**: Toma los videos generados desde la cola `PublishQueue` y les aplica un **retraso aleatorio de 0 a 45 minutos** antes de publicar en YouTube, rompiendo los patrones exactos de publicación detectables por el algoritmo. Además de esto orquesta a TikTok e Instagram.
- **`YouTubePublisher.ts`**: Utiliza Google OAuth2 para subir los videos generados directamente al canal de YouTube. Inyecta automáticamente los tags del SEOAgent como hashtags en la descripción.
- **`InstagramPublisher.ts` / `TikTokPublisher.ts`**: Totalmente funcionales mediante inyección de Cookies y `Puppeteer Stealth`. Suben el material respectivo (Reels de 30s y TikToks de 15s) automáticamente, sin embargo, **ESTÁN BLOQUEADOS** de ejecutarse debido al `YPPValidationGate` (Regla de oro #2) hasta que la API verifique el "primer dólar" en YouTube.
- **Plataformas de Blog (`HashnodePublisher`, `MediumPublisher`, `DevToPublisher`)**: Soportan la publicación usando Puppeteer o API. Actualmente la ejecución se rige por el flag `ENABLE_BLOG_PUBLISHING`.
- **`YouTubePublisher.ts` (detalles)**:
  - Genera y sube thumbnail personalizado automáticamente con `ThumbnailGenerator`
  - Añade `#Shorts` automático en descripción para videos cortos
  - Valida títulos < 60 caracteres (trunca si excede)
  - Limita a 30 tags máximo (requisito YouTube)
  - **NUEVO:** Sanitización de tags - elimina caracteres inválidos (`<`, `>`, etc.)
  - `notifySubscribers` inteligente: true para largos, false para Shorts
  - Default a `public` para máxima discoverabilidad
- **Estrategia YMYL Automatizada:** Publicación 100% automatizada (pública por defecto) reemplazando la antigua intervención humana. Inyecta obligatoriamente un disclaimer médico/educativo anti-"AI Slop" para mitigar revisiones de Trust & Safety.
- **`HashnodePublisher.ts`**: Publicación en Hashnode mediante Puppeteer en modo silencioso (soporta Docker).
- **`MediumPublisher.ts`**: Publicación en Medium mediante Puppeteer.
- **`DevToPublisher.ts`**: Publicación en Dev.to mediante la API oficial REST.

### 4. `src/utils/` y `src/reporters/` (Monitoreo & Logs)
- **`SystemReporter.ts`**: **NUEVO** - Monitorea el espacio en disco de forma asíncrona y alerta a Telegram si baja de 5 GB para evitar fallos.
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
- **APIs Externas:** Google Cloud TTS, YouTube Data API v3, Pexels API.
- **Automatización Web:** Puppeteer (para Hashnode).
- **Procesamiento Multimedia:** FFmpeg (requiere ffmpeg instalado en el sistema).
- **Regla Importante:** Nunca sobreescribas `oauth2.tokens.json` o se perderá el acceso a la cuenta de YouTube. Los scripts en la raíz (`test-*.ts`) son exclusivamente para pruebas modulares.
- **Contexto Heredado:** Comparte filosofía con `autonomous-income-node`. El agente no debe requerir intervención humana; si ocurre un fallo (ej. de red), debe atraparlo, notificar a Telegram y abortar limpiamente.

---

## V2 Optimización Integral (Completada Agosto 2026)

Implementación exhaustiva según spec `omniai-v2-optimization`, enfocada en evasión de algoritmos, monetización y resiliencia:

1. **Anti-Detección Total (Fase 1):** 
   - `VideoTransformer` y `ThumbnailTransformer`: Alteración geométrica (zoom, crop), cromática (hue, saturación) y de metadatos (hash único).
   - Variabilidad de edición con 5+ presets.
2. **Humanización Profunda (Fase 2):** 
   - `ScriptStructureRandomizer`: 6 estructuras narrativas (evitando repetición consecutiva), longitud variable de oraciones y ajuste de CTA.
   - `MusicTransformer`: Evasión de Content ID variando pitch, tempo, EQ y reverb sutil (hash único).
   - AudioMixer y Subtitles con SSML.
3. **Infraestructura Básica (Fase 3):**
   - Caché con TTL (`CacheManager`), Logs con Winston, `RetryHandler` con backoff.
4. **Validación Monetización (Fase 4 - YPPValidationGate y AnalyticsIntegration):**
   - **CRÍTICO:** Bloquea canal 3 o expansión a IG/TikTok si no se cumplen requisitos del Programa de Partners de YouTube (YPP).
   - Utiliza **YouTube Analytics API v2** en código real para verificar retención, ingresos (`hasFirstDollar`) y suscriptores para habilitar el motor multiplataforma.
5. **Expansión Multiplataforma (Fase 5):**
   - Implementaciones completas de `InstagramPublisher` y `TikTokPublisher` mediante Puppeteer Stealth (en espera de desactivación de la Regla de oro YPP).
   - `MultiPlatformDispatcher`: Horarios aleatorios de publicación y retrasos secuenciales. **Aislamiento de YPP Gate:** YouTube siempre publica sin interrupción mientras que plataformas secundarias no elegibles son filtradas de manera segura sin abortar el flujo principal.
   - Detección automática de videos largos en `MultiPlatformDispatcher` para asegurar el uso del `fullVideoPath` y duración completa.
6. **Infraestructura Avanzada (Fase 6):**
   - `CircuitBreaker`, Dead-Letter Queue (BullMQ) y dashboard de estado.

## Optimizaciones SEO Implementadas (Agosto 2026)

Auditoría SEO completa documentada en `docs/AUDITORIA-SEO-YOUTUBE.md`.

| Mejora | Archivo | Descripción |
|--------|---------|-------------|
| Thumbnails personalizados | `ThumbnailGenerator.ts` | Pexels + Puppeteer, texto estilizado, branding |
| Hook de 3 segundos | `ScriptGenerator.ts` | Campo `hook` explícito para retención inicial |
| Videos 8-10 min | `ScriptGenerator.ts` | 1200-1500 palabras para mid-roll ads |
| Timestamps/chapters | `ScriptGenerator.ts` | Genera chapters JSON, añade a descripción |
| #Shorts automático | `YouTubePublisher.ts` | Flag `isShort` → añade #Shorts a descripción |
| Validación títulos | `YouTubePublisher.ts` | Trunca a 60 caracteres máximo |
| Videos públicos | `AutonomousOrchestrator.ts` | Cambió de private a public para algoritmo |
| **Deduplicación temas** | `SEOAgent.ts` + `Database.ts` | Evita repetir temas ya publicados |
| **Audio chunking** | `AudioGenerator.ts` | **NUEVO** - Divide textos >5000 bytes para TTS |
| **Tag sanitization** | `YouTubePublisher.ts` | **NUEVO** - Limpia tags con caracteres inválidos |
| **Informe 4AM** | `AutonomousOrchestrator.ts` | **NUEVO** - Reporte diario completo a Telegram |
| **Database stats** | `Database.ts` | **NUEVO** - Método `getStats()` para métricas agregadas |
| **BullMQ & Redis** | `WorkerManager.ts` | **NUEVO** - Ejecución secuencial (`concurrency: 1`) para evitar OOM de FFmpeg |
| **Exponential Backoff**| `SEOAgent.ts` | **NUEVO** - Reintentos exponenciales para proteger ante errores 429/50x |
| **Disk Space Alert** | `SystemReporter.ts` | **NUEVO** - Alerta proactiva en Telegram si el disco es < 5GB |
| **Network Resiliency** | `docker-compose.yml` | **NUEVO** - Conexión de red externa estable para `ain-redis` |
| **ComfyUI Integration** | `src/comfyui/` | **NUEVO** - Generación local de video con IA (Wan 2.2), 3 modos (comfyui/pexels/hybrid), estilos visuales |
| **Dual Prompts** | `ScriptGenerator.ts` | **NUEVO** - `visualPrompts` (Pexels) + `comfyPrompts` (ComfyUI 20-50 palabras) |
| **Video Source Router** | `VideoSourceRouter.ts` | **NUEVO** - Orquestador de fuentes con fallback automático y tracking de uso |
| **Clip Pool** | `ClipPoolManager.ts` | **NUEVO** - Pool de clips pre-generados por categoría (6 categorías) |
| **Disclaimer YMYL** | `YouTubePublisher.ts` | **NUEVO** - Inyecta disclaimer educativo automático anti-Slop |
| **Fatiga Semántica** | `SEOAgent.ts` / `ScriptGenerator.ts` | **NUEVO** - Inyección de Personas, Títulos max 8 palabras, Blacklist de IA, y formato Multi-Voz en guiones (25%) |
| **Máscara TTS** | `AudioGenerator.ts` | **NUEVO** - **Formant Shift** (`asetrate*1.02,aresample,atempo=0.9804`) - indetectable, reemplaza atempo |
| **Retención Extrema** | `VideoRenderer.ts` / `AudioMixer.ts` | **NUEVO** - **Glitch RGB** (0.5s) seguro para epilepsia - reemplaza strobing de 3s |
| **Pollinations Fallback** | `PollinationsClient.ts` | **NUEVO** - API gratuita de imágenes sin límites para I2V o fallback |
| **I2V Híbrido** | `VideoSourceRouter.ts` | **NUEVO** - Image-to-Video para segmentos KEY, T2V pool para filler |
| **init-clip-pool.ts** | `src/init-clip-pool.ts` | **NUEVO** - Script para generar pool de clips en background |

### Sistema de Evasión de Detección y Retención (NUEVO)

**Problema resuelto:** Mitigar el riesgo de que YouTube detecte la automatización (Shadowban por API), monotonía de los LLMs (fatiga semántica) y mejorar la retención en los primeros 3 segundos.

**Solución implementada:**
1. **Automatización 100% y YMYL Shield:** Se removió la estrategia de borrador manual. Publicación 100% pública y autónoma. Se inyecta un *Disclaimer* automatizado anti-Slop en las descripciones y se usa RAG RSS en `SEOAgent` para dotar al canal de credibilidad y evitar strikes por desinformación.
2. **Romper Fatiga Semántica:** `SEOAgent` utiliza temperatura aleatoria (0.7-0.9), bloquea frases cliché de IA y asume Personas (Académico, Amigo, Periodista). Títulos truncados a 8 palabras máximo. `ScriptGenerator` inyecta formato "Multi-Voz/Entrevista" aleatoriamente.
3. **Máscara TTS y Zero-Silence:** Uso de `silenceremove` en `AudioGenerator` para cortar milisegundos muertos al inicio. El 25% de los audios reciben **Formant Shift** (`asetrate*1.02,aresample,atempo=0.9804`) para desdibujar la firma acústica de Google TTS de forma indetectable.
4. **Impacto Máximo (Hook):** `AudioMixer` inyecta ruido rosa filtrado (`anoisesrc`) como impacto en el segundo 0.0. `VideoRenderer` aplica un filtro **Glitch RGB** (aberración cromática con `rgbashift` y variación de brillo) durante los primeros 0.5 segundos de cualquier video, reemplazando el anterior strobing epiléptico de 3s.

### Retención Visual Neurodivergente y Prevención de Repetición (NUEVO - Agosto 2026)

**Problemas resueltos:** Subtítulos aburridos que restaban retención, falta de estilo visual enfocado al nicho (Autismo) y videos de archivo (Pexels) que se repetían en ejecuciones continuas, además de un bug que duplicaba el gancho inicial en videos largos.

**Solución implementada:**
1. **Subtítulos ASS Estrictos (SEO):** Se amplió masivamente el filtro `stopWords` de `SubtitleGenerator` para ignorar verbos conectores y pronombres. Se agregaron colores dinámicos (Magenta, Cian, Verde, Naranja) y animaciones fluidas (Zoom-in, rotaciones, Star Wars) solo a las palabras clave importantes.
2. **Filtros Sensoriales:** En `VideoRenderer`, FFmpeg ahora inyecta `chromashift=cbh=-2:crh=2` (aberración cromática) y elevaciones en saturación/contraste para crear una perspectiva de sobrecarga sensorial visual adecuada para el tema del autismo.
3. **Pexels Anti-Reuse Engine:** `VideoRenderer` mantiene una caché de los últimos 100 clips usados (`content/cache/used_pexels_videos.json`) e incrementa el request de búsqueda a `per_page=15`, escaneando los clips devueltos hasta encontrar uno virgen, lo que previene la fatiga visual por reutilización extrema.
4. **Fix Hooks Largos:** El `ScriptGenerator` ya no fuerza la pre-concatenación del gancho en el texto devuelto por el LLM en videos largos, evitando repetición del saludo.

### Sistema de Deduplicación de Temas (NUEVO - Agosto 2026)

**Problema resuelto:** Con un nicho específico (Autismo + IA), el LLM podía generar temas repetidos después de muchos videos.

**Solución implementada:**

1. **Base de datos extendida:**
   - Nuevas columnas: `rawTopic`, `topicHash`, `keywords`, `videoType`
   - Índices para búsqueda rápida de duplicados

2. **Normalización de temas:**
   - Lowercase, sin acentos, sin puntuación
   - Elimina stop words (el, la, the, a, etc.)
   - Ordena palabras alfabéticamente ("IA y autismo" == "autismo y IA")
   - Hash MD5 de 12 caracteres para comparación

3. **Flujo de generación:**
   ```
   SEOAgent.generateDailySEOStrategy()
     → Carga últimos 50 temas de BD
     → Los incluye en prompt: "NO REPETIR estos temas: ..."
     → Genera nuevo tema con temperatura 0.85
     → Verifica hash contra BD
     → Si duplicado: reintenta (máx 3 veces)
     → Guarda tema + hash en BD
   ```

4. **Escalabilidad:**
   - Funciona con cientos de videos
   - El LLM ve los temas previos y genera variaciones
   - Hash evita duplicados incluso si el LLM no sigue instrucciones

**Test de deduplicación:**
```bash
# Ver temas guardados en BD
docker exec omniai-engine sqlite3 /usr/src/app/content/database.sqlite \
  "SELECT title, rawTopic, topicHash FROM published_videos ORDER BY publishedAt DESC LIMIT 10"
```

---

## Comandos Útiles de Docker

```bash
# Ver logs recientes
docker logs omniai-engine --tail 100

# Seguir logs en tiempo real
docker logs -f omniai-engine

# Reiniciar contenedor
docker compose restart

# Rebuild después de cambios de código
docker compose up -d --build

# Rebuild forzado (después de cambios en .dockerignore)
docker compose up -d --build --no-cache

# Ejecutar pipeline manualmente
docker exec omniai-engine node -e "const { AutonomousOrchestrator } = require('./dist/generators/AutonomousOrchestrator'); AutonomousOrchestrator.runLongPipeline('Spanish');"

# Ver estadísticas de BD
docker exec omniai-engine sqlite3 /usr/src/app/content/database.sqlite "SELECT COUNT(*) as videos FROM published_videos; SELECT COUNT(*) as blogs FROM published_blogs;"

# Verificar archivos en contenedor
docker exec omniai-engine ls -la /usr/src/app/

# Ver archivos de contenido
docker exec omniai-engine ls -la /usr/src/app/content/
```

---

## Scripts de Prueba Aislados (.mjs)

En la raíz del proyecto existen varios scripts `.mjs` (ej. `test-thumbnail-sync.mjs`, `test-video-transformer.mjs`, `test-integration-pipeline.mjs`). Estos scripts sirven como **entornos de prueba modulares**. Permiten probar componentes específicos del motor de forma independiente sin necesidad de levantar el orquestador principal. Son altamente recomendables para depurar flujos aislados. Puedes ejecutarlos con Node: `node test-[nombre].mjs`.

---

## Troubleshooting Común

| Problema | Causa | Solución |
|----------|-------|----------|
| "Credentials file not found" | `oauth2.keys.json` excluido en `.dockerignore` | Quitar del `.dockerignore` y rebuild con `--no-cache` |
| "Text exceeds TTS limit" | Script >5000 bytes | Automático: AudioGenerator hace chunking |
| "Invalid video keywords" | Tags con caracteres `<>` | Automático: YouTubePublisher sanitiza tags |
| Thumbnail upload failed | Canal sin verificar | Verificar canal con teléfono en YouTube Studio |
| Videos no aparecen | Publicados como privados | Cambiar a public en código o YouTube Studio |

## [2026-09-01] Operación Viralidad y Des-Shadowban
- **Tercer Canal (ColombianDreamm)**: Inyección profunda de channel3 en todo el sistema. Nicho configurado: Curiosidades Universales, Misterios y Datos Psicológicos.
- **Protocolo Des-Shadowban**: Reducción de frecuencia de publicación de channel1 y channel2 a 1 Short cada 48 horas (Inglés) y 1 Video Largo semanal.
- **Canal Viral (channel3)**: Configurado a 1 Short diario (Inglés) y 1 Video Largo dominical.
