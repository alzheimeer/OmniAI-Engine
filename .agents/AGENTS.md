# Reglas Generales del Agente (OmniAI-Engine)

## 1. Ejecución Directa de Comandos de Terminal
**SIEMPRE** que se requiera ejecutar un comando de terminal (construir el proyecto, arrancar contenedores Docker, levantar servicios, etc.), **DEBES ejecutarlo directamente tú mismo** mediante la herramienta `run_command` sin pedirle al usuario que los ejecute manualmente.

## 2. Actualización Obligatoria de Documentación
**SIEMPRE** que corrijas un bug, añadas una nueva funcionalidad, modifiques la arquitectura o refactorices código en este proyecto, **DEBES** actualizar automáticamente los archivos de documentación para reflejar estos cambios.

Archivos que deben mantenerse sincronizados tras cada intervención importante:
- `CLAUDE.md`
- `GEMINI.md`
- `README.md`

## 3. Memoria Central: Funcionamiento Clave del Proyecto
OmniAI-Engine es el cerebro generador de contenido 100% autónomo (Content Factory). Su ciclo de vida inquebrantable es el siguiente:

- **EJE TEMÁTICO ÚNICO E INNEGOCIABLE:** `"AUTISMO E INTELIGENCIA ARTIFICIAL"`. Cada pieza de contenido (video o artículo) debe combinar estrictamente estos dos conceptos. No se permiten desviaciones fuera del nicho.
- **Orquestación:** `AutonomousOrchestrator.ts` dicta el ritmo (Shorts Trilingües L-M-V, Videos Largos Trilingües M-J-S, Blogs Multi-Plataforma DIARIOS a las 6:00 AM).
- **Estrategia (SEOAgent & AnalyticsEngine):** JAMÁS se genera contenido a ciegas. `AnalyticsEngine` consulta en tiempo real la YouTube Data API v3 y registra métricas en `content/database.sqlite`. El `SEOAgent` analiza estas métricas antes de cada publicación para adaptar títulos virales y 15-20 keywords en torno al tema de Autismo e IA.
- **Generación (Script / Blog):** Se inyectan el título y las keywords en el prompt maestro. DeepSeek redacta bajo estrictos parámetros (cero relleno, estructura JSON o Markdown).
- **Multimedia:** Se narra con Google TTS y se buscan fondos gratuitos en Pexels (con búsqueda de fallback). Se une y renderiza usando `FFmpeg`.
- **Publicación Multi-Plataforma:** `YouTubePublisher` usa la API oficial de Google (sin pisar tokens en `oauth2.tokens.json`). `BlogDispatcher` publica **simultáneamente** en Hashnode (Puppeteer), Medium (Puppeteer) y Dev.to (API REST), guardando copia `.md` local para el servidor web (`http://localhost:3003`).
- **Reporte y Logging:** Todo éxito, métrica de rendimiento o fallo crítico se reporta vía `TelegramReporter` y se escribe de forma estructurada con `Logger.ts` en `content/logs/app.log` y `content/logs/error.log` (accesible en la web en `http://localhost:3003/logs` y `/logs/errors`).

**No modifiques esta arquitectura base** sin autorización explícita del usuario, ya que este sistema opera en producción 24/7 sin intervención humana.
