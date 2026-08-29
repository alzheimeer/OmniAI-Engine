# Implementation Plan: ComfyUI Video Generation Integration

## Overview

Este plan implementa la integración de generación de video con IA local mediante ComfyUI en OmniAI-Engine. La implementación sigue un enfoque incremental: primero la infraestructura core (configuración y gestión de procesos), luego la base de datos y pool de clips, después el router de fuentes de video, y finalmente las modificaciones a componentes existentes y tests.

## Tasks

- [x] 1. Configuración del proyecto y dependencias
  - [x] 1.1 Agregar dependencias necesarias al proyecto
    - Instalar `better-sqlite3` para base de datos SQLite síncrona
    - Instalar `fast-check` como devDependency para property-based testing
    - Instalar `@types/better-sqlite3` como devDependency
    - _Requirements: 12.6_
  
  - [x] 1.2 Crear estructura de directorios necesaria
    - Crear directorio `data/` para base de datos SQLite
    - Crear directorio `content/clip_pool/` para clips pre-generados
    - Crear directorio `content/generated_videos/` si no existe
    - _Requirements: 10.1, 12.6_
  
  - [x] 1.3 Agregar variables de entorno al archivo .env.example
    - VIDEO_SOURCE_MODE, COMFYUI_MODEL, COMFYUI_PATH, COMFYUI_URL
    - COMFYUI_SHORT_RESOLUTION, COMFYUI_LONG_RESOLUTION, COMFYUI_DEFAULT_FRAMES
    - CLIP_PREGENERATION_SCHEDULE, CLIP_POOL_MIN_PER_CATEGORY, CLIP_POOL_DIRECTORY
    - _Requirements: 3.2, 8.2, 10.2, 14.7, 14.9_

- [x] 2. Implementar ModelConfig - Configuración de modelos y resoluciones
  - [x] 2.1 Crear archivo src/generators/ModelConfig.ts con tipos e interfaces
    - Definir tipos: WanModelType, VisualStyle, VideoSourceMode, VideoType
    - Definir interfaces: ModelFiles, QualityPreset, StyleParams, Resolution, ModelConfiguration
    - Definir constantes MODEL_FILES y STYLE_PARAMS según diseño
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 15.9_
  
  - [x] 2.2 Implementar clase ModelConfig con patrón singleton
    - Implementar getInstance() para singleton
    - Leer COMFYUI_MODEL desde .env con default 'wan22_5B'
    - Lanzar error descriptivo si COMFYUI_MODEL es inválido
    - Registrar modelo configurado en log al iniciar
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 2.3 Implementar métodos de configuración de resolución
    - Implementar getResolution(videoType) retornando 576x1024 para short, 832x480 para long
    - Implementar parseResolution() para leer de variables de entorno
    - Implementar validateResolution() que valide múltiplos de 16
    - Lanzar error si resoluciones no son múltiplos de 16
    - _Requirements: 14.1, 14.2, 14.5, 14.7, 14.8_
  
  - [x] 2.4 Implementar validación de VideoSourceMode
    - Implementar validateVideoSourceMode() que acepte solo 'comfyui', 'pexels', 'hybrid'
    - Retornar 'hybrid' como default si VIDEO_SOURCE_MODE no está definida
    - Lanzar error si el valor es inválido
    - _Requirements: 8.2, 8.3, 8.10, 8.11_
  
  - [ ]* 2.5 Escribir property tests para ModelConfig
    - **Property 3: Configuración de Modelo Retorna Archivos Correctos**
    - **Property 4: Resolución Correcta Según Tipo de Video**
    - Usar fast-check con mínimo 100 iteraciones
    - **Validates: Requirements 3.3, 3.5, 3.7, 3.8, 14.1, 14.2, 14.5**

- [x] 3. Checkpoint - Validar ModelConfig
  - Ejecutar `npm run build` para verificar compilación
  - Ejecutar `npm test` para verificar que todos los tests pasan
  - Asegurar que no hay errores de configuración

- [x] 4. Implementar ComfyUIProcessManager - Gestión del proceso ComfyUI
  - [x] 4.1 Crear archivo src/generators/ComfyUIProcessManager.ts con interfaces
    - Definir ProcessManagerEvents, ProcessState, ProcessManagerConfig
    - Extender EventEmitter para emisión de eventos
    - _Requirements: 1.6, 2.4, 2.5_
  
  - [x] 4.2 Implementar lógica de inicio del proceso
    - Implementar checkIfRunning() que verifique http://127.0.0.1:8188
    - Implementar start() que omita inicialización si modo es 'pexels'
    - Ejecutar D:\ComfyUI\start_comfyui.bat como proceso de fondo si no está corriendo
    - _Requirements: 1.1, 1.2, 1.3, 8.7_
  
  - [x] 4.3 Implementar espera de startup con timeout
    - Implementar waitForStartup() con polling cada 5 segundos
    - Timeout de 120 segundos máximo
    - Marcar como unavailable y registrar error si no responde
    - _Requirements: 1.4, 1.5_
  
  - [x] 4.4 Implementar manejo de crash y reinicio automático
    - Detectar cuando proceso termina inesperadamente via evento 'exit'
    - Reiniciar automáticamente hasta 3 veces si hay generaciones pendientes
    - Implementar setPendingGenerations(pending: boolean)
    - Registrar todos los eventos de ciclo de vida
    - _Requirements: 1.6, 1.7, 7.1_
  
  - [x] 4.5 Implementar shutdown graceful
    - Implementar shutdown() que detenga el proceso de forma graceful
    - Emitir evento 'process:stopped' al detener
    - _Requirements: 1.8_
  
  - [ ]* 4.6 Escribir unit tests para ComfyUIProcessManager
    - Test: Inicialización omitida cuando modo es 'pexels'
    - Test: Llamada a checkIfRunning antes de spawn
    - Test: Timeout de 120 segundos con polling cada 5 segundos
    - Test: Handler de evento 'exit' registra correctamente
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**

- [x] 5. Implementar ComfyUIHealthMonitor - Monitoreo de salud
  - [x] 5.1 Crear archivo src/generators/ComfyUIHealthMonitor.ts con interfaces
    - Definir HealthMonitorEvents, HealthMetrics, HealthMonitorConfig
    - Extender EventEmitter para eventos de disponibilidad
    - _Requirements: 2.4, 2.5_
  
  - [x] 5.2 Implementar health checks periódicos
    - Implementar performHealthCheck() que consulte /system_stats
    - Implementar start() que ejecute checks cada 60 segundos
    - Registrar métricas de VRAM y estado de cola en cada check exitoso
    - _Requirements: 2.1, 2.2, 2.6_
  
  - [x] 5.3 Implementar lógica de disponibilidad con threshold
    - Marcar como unavailable después de 3 fallos consecutivos
    - Emitir evento 'comfyui:unavailable' al cambiar a no disponible
    - Emitir evento 'comfyui:available' al recuperar disponibilidad
    - Resetear contador de fallos en cualquier check exitoso
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [ ]* 5.4 Escribir property test para HealthMonitor
    - **Property 2: Health Checks Consecutivos Fallidos Marcan Unavailable**
    - Usar fast-check con mínimo 100 iteraciones
    - **Validates: Requirements 2.3, 2.4, 2.5**

- [x] 6. Checkpoint - Validar Process Manager y Health Monitor
  - Ejecutar `npm run build` para verificar compilación
  - Ejecutar `npm test` para verificar que todos los tests pasan
  - Verificar que los eventos se emiten correctamente

- [x] 7. Implementar ClipDatabase - Base de datos SQLite
  - [x] 7.1 Crear archivo src/generators/ClipDatabase.ts con interfaces
    - Definir tipos ClipCategory, ClipStatus
    - Definir interfaces Clip, ClipUsage, ClipStatistics, ClipDatabaseConfig
    - _Requirements: 12.1, 12.2_
  
  - [x] 7.2 Implementar inicialización y migraciones
    - Usar better-sqlite3 para almacenamiento local en data/clips.db
    - Implementar initialize() que ejecute migraciones automáticamente
    - Crear tablas clips, clip_usages, migrations según esquema del diseño
    - _Requirements: 12.6, 12.7_
  
  - [x] 7.3 Implementar CRUD de clips
    - Implementar insertClip() que genere UUID y guarde metadata completa
    - Implementar getClip(id) para obtener clip por ID
    - Implementar findClipsByKeywords() para búsqueda por keywords y categoría
    - _Requirements: 12.1_
  
  - [x] 7.4 Implementar tracking de uso
    - Implementar recordUsage() que registre uso con video_id, segment_type, platform
    - Implementar incrementUsageCount() que incremente times_used
    - Implementar retireClip() que marque como 'retired'
    - _Requirements: 12.2, 11.6, 11.7_
  
  - [x] 7.5 Implementar queries de consulta
    - Implementar getClipsNotUsedSince(days) para clips no usados en N días
    - Implementar getClipsByCategory(category, orderBy) ordenados por menor uso
    - Implementar getStatistics() con métricas completas del pool
    - Implementar countByCategory() para conteo por categoría
    - _Requirements: 12.3, 12.4, 12.5_
  
  - [ ]* 7.6 Escribir integration tests para ClipDatabase
    - Test: Creación de tablas y migraciones
    - Test: CRUD completo de clips
    - Test: Queries de búsqueda por categoría y keywords
    - Test: Tracking de uso y estadísticas
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**

- [ ] 8. Implementar ClipPoolManager - Pool de clips pre-generados
  - [-] 8.1 Crear archivo src/generators/ClipPoolManager.ts con interfaces
    - Definir PreGenerationSchedule, ClipPoolManagerConfig, PoolStatistics
    - Definir constantes CLIP_CATEGORIES y CATEGORY_PROMPTS
    - _Requirements: 10.1, 10.4_
  
  - [-] 8.2 Implementar gestión del pool y selección de clips
    - Implementar getClip(category, keywords) con matching por categoría
    - Evitar clips usados en últimos 7 días
    - Priorizar clips con menor times_used
    - Marcar como 'retired' clips con times_used > 10
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7_
  
  - [-] 8.3 Implementar lógica de priorización del pool
    - Si pool tiene >200 clips activos, priorizar reuso sobre generación nueva
    - Si pool tiene <50 clips activos, priorizar generación nueva
    - _Requirements: 11.4, 11.5_
  
  - [-] 8.4 Implementar scheduler de pre-generación nocturna
    - Parsear CLIP_PREGENERATION_SCHEDULE (default: "02:00-06:00")
    - Implementar startScheduler() que programe pre-generación
    - Implementar isWithinSchedule() para verificar horario
    - _Requirements: 10.2_
  
  - [-] 8.5 Implementar sesión de pre-generación
    - Implementar runPreGenerationSession() que genere clips hasta mínimo por categoría
    - Generar clips para 6 categorías: nature, technology, business, abstract, lifestyle, urban
    - Priorizar categorías con menos de 20 clips
    - Implementar triggerPreGeneration() para inicio manual
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7_
  
  - [ ]* 8.6 Escribir property test para selección del pool
    - **Property 7: Selección de Pool Evita Repeticiones**
    - Usar fast-check con mínimo 100 iteraciones
    - **Validates: Requirements 11.3, 11.6, 11.7**

- [x] 9. Checkpoint - Validar Database y Pool Manager
  - Ejecutar `npm run build` para verificar compilación
  - Ejecutar `npm test` para verificar que todos los tests pasan
  - Verificar que la base de datos se crea correctamente

- [ ] 10. Implementar VideoSourceRouter - Orquestador de fuentes de video
  - [x] 10.1 Crear archivo src/generators/VideoSourceRouter.ts con interfaces
    - Definir SegmentType, VideoGenerationResult, VideoGenerationRequest
    - Definir VideoSourceRouterConfig
    - _Requirements: 5.7, 9.1_
  
  - [x] 10.2 Implementar clasificación de segmentos
    - Implementar classifySegment() que clasifique key vs filler
    - Primeros 10 segundos = key, últimos 10 segundos = key, resto = filler
    - Soportar override manual via segment_type en metadata
    - _Requirements: 9.1, 9.2, 9.3, 9.6_
  
  - [x] 10.3 Implementar routing según modo 'comfyui'
    - Usar exclusivamente ComfyUI para generar videos
    - Reintentar hasta 2 veces si falla
    - Lanzar error sin alternativas si falla después de reintentos
    - _Requirements: 5.1, 5.2, 8.4, 8.5_
  
  - [x] 10.4 Implementar routing según modo 'pexels'
    - Usar exclusivamente Pexels API sin intentar ComfyUI
    - Generar video sintético con FFmpeg si Pexels falla
    - _Requirements: 5.3, 8.6_
  
  - [x] 10.5 Implementar routing según modo 'hybrid'
    - Para Key_Segment usar ComfyUI
    - Para Filler_Segment buscar primero en pool, luego Pexels
    - Si ComfyUI falla, usar Pexels registrando warning
    - Si ambos fallan, generar video sintético
    - _Requirements: 5.4, 5.5, 5.6, 8.8, 8.9, 9.4, 9.5_
  
  - [x] 10.6 Implementar generación sintética con FFmpeg
    - Crear video con color sólido animado como último fallback
    - Registrar que se usó fuente 'synthetic'
    - _Requirements: 5.3, 5.5_
  
  - [x] 10.7 Implementar tracking de uso y resultado
    - Retornar sourceUsed indicando 'comfyui', 'pexels', 'synthetic', o 'pool'
    - Registrar tiempo de generación en segundos
    - Registrar warning cuando se usa fuente alternativa
    - _Requirements: 5.6, 5.7, 7.2, 7.6_
  
  - [ ]* 10.8 Escribir property tests para VideoSourceRouter
    - **Property 5: Comportamiento de Fallback Según Modo**
    - **Property 6: Clasificación de Segmentos Key/Filler**
    - Usar fast-check con mínimo 100 iteraciones
    - **Validates: Requirements 5.1-5.7, 8.4-8.9, 9.1-9.6**

- [x] 11. Checkpoint - Validar VideoSourceRouter
  - Ejecutar `npm run build` para verificar compilación
  - Ejecutar `npm test` para verificar que todos los tests pasan
  - Verificar lógica de fallback con tests manuales

- [x] 12. Modificar ComfyUIClient - Soporte para modelos y estilos
  - [x] 12.1 Refactorizar para usar ModelConfig
    - Importar ModelConfig y obtener archivos de modelo dinámicamente
    - Eliminar constantes hardcodeadas de modelos
    - Usar getModelFiles() para obtener unetModel, clipModel, vaeModel
    - _Requirements: 3.7, 3.8_
  
  - [x] 12.2 Agregar soporte para VideoType y resoluciones dinámicas
    - Modificar generateT2V() para aceptar parámetro videoType
    - Obtener resolución de ModelConfig.getResolution(videoType)
    - Registrar dimensiones utilizadas en cada generación
    - _Requirements: 4.7, 4.8, 14.3, 14.6_
  
  - [x] 12.3 Agregar soporte para estilos visuales
    - Agregar parámetro opcional style: VisualStyle a generateT2V()
    - Implementar applyStyleParameters() que aplique frames y motionType según estilo
    - Agregar promptSuffix del estilo al prompt
    - _Requirements: 15.9_
  
  - [x] 12.4 Mejorar logging y métricas
    - Registrar modelo y preset utilizado para cada generación
    - Emitir warning si generación excede 10 minutos
    - Registrar tiempo de generación en segundos
    - _Requirements: 7.2, 7.3, 7.5_
  
  - [ ]* 12.5 Escribir property test para workflow T2V
    - **Property 10: Workflow T2V Válido para Cualquier Configuración**
    - Verificar que workflow contiene todos los nodos requeridos
    - **Validates: Requirements 4.1**

- [x] 13. Modificar ScriptGenerator - Prompts duales y estilos
  - [x] 13.1 Definir nuevas interfaces para prompts duales
    - Agregar interface ComfyPrompt { prompt: string; style: VisualStyle; }
    - Extender VideoScript con comfyPrompts?: ComfyPrompt[]
    - _Requirements: 13.7_
  
  - [x] 13.2 Modificar prompt de DeepSeek para generar comfyPrompts
    - Solicitar visualPrompts (1-3 palabras) Y comfyPrompts (20-50 palabras)
    - Incluir instrucciones para escena, iluminación, movimiento de cámara, estilo visual
    - Incluir ejemplos de cada estilo visual en el prompt
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 15.5_
  
  - [x] 13.3 Implementar asignación de estilos visuales
    - Instruir a DeepSeek para asignar 'cinemagraph_plotagraph', 'moody_lofi_ambient', o 'analog_horror_liminal'
    - Guiar selección según tono: educativo→moody_lofi, misterioso→analog_horror, producto→cinemagraph
    - Incluir indicadores de movimiento sutil en cada prompt
    - _Requirements: 15.1, 15.6, 15.7, 15.8_
  
  - [x] 13.4 Implementar validación de correspondencia 1:1
    - Validar que visualPrompts.length === comfyPrompts.length
    - Implementar generateFallbackComfyPrompts() si DeepSeek no retorna comfyPrompts
    - _Requirements: 13.5, 13.6_
  
  - [ ]* 13.5 Escribir property tests para ScriptGenerator
    - **Property 8: Prompts Duales con Correspondencia 1:1**
    - **Property 9: Estilos Visuales Contienen Elementos Requeridos**
    - Usar fast-check con mínimo 100 iteraciones
    - **Validates: Requirements 13.5, 13.6, 15.2, 15.3, 15.4, 15.7**

- [x] 14. Modificar VideoRenderer - Integración con router
  - [x] 14.1 Refactorizar para usar VideoSourceRouter
    - Importar VideoSourceRouter en lugar de llamar directamente a Pexels
    - Pasar comfyPrompts además de visualPrompts
    - Agregar parámetro videoId para tracking
    - _Requirements: 6.1, 6.2_
  
  - [x] 14.2 Modificar renderVideo para Shorts
    - Usar ComfyUI si está disponible según modo configurado
    - Mantener compatibilidad con flujo actual
    - _Requirements: 6.2_
  
  - [x] 14.3 Modificar renderLongVideo
    - Generar múltiples clips con ComfyUI según clasificación key/filler
    - Concatenar clips de diferentes fuentes
    - _Requirements: 6.3_
  
  - [x] 14.4 Mantener cache de videos usados
    - Implementar cache para evitar repeticiones en sesiones cercanas
    - _Requirements: 6.5_
  
  - [ ]* 14.5 Escribir integration tests para VideoRenderer
    - Test: Pipeline con modo hybrid
    - Test: Mezcla de fuentes ComfyUI + Pexels + Pool
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

- [x] 15. Checkpoint - Validar modificaciones a componentes existentes
  - Ejecutar `npm run build` para verificar compilación
  - Ejecutar `npm test` para verificar que todos los tests pasan
  - Verificar que el pipeline existente sigue funcionando

- [x] 16. Implementar VideoGenerationError - Manejo de errores
  - [x] 16.1 Crear archivo src/generators/VideoGenerationError.ts
    - Definir enum VideoGenerationErrorCode con todos los códigos del diseño
    - Implementar clase VideoGenerationError extends Error
    - Incluir campos code, recoverable, context
    - _Requirements: 7.1_
  
  - [x] 16.2 Integrar errores en todos los componentes
    - Usar VideoGenerationError en ProcessManager, HealthMonitor, Router
    - Registrar errores con código, mensaje y contexto
    - _Requirements: 7.1, 7.6_

- [ ] 17. Integration tests end-to-end
  - [ ]* 17.1 Escribir test E2E para pipeline Short con modo hybrid
    - Verificar flujo completo desde script hasta video generado
    - Verificar que sourceUsed se registra correctamente
    - **Validates: Requirements 6.2, 5.4, 5.6**
  
  - [ ]* 17.2 Escribir test E2E para pipeline Long Video
    - Verificar generación de múltiples clips
    - Verificar clasificación key/filler
    - Verificar concatenación de clips de diferentes fuentes
    - **Validates: Requirements 6.3, 9.4, 9.5**
  
  - [ ]* 17.3 Escribir test E2E para pre-generación nocturna
    - Verificar que clips se generan por categoría
    - Verificar que metadata se guarda en database
    - **Validates: Requirements 10.3, 10.4, 10.5, 10.6**

- [x] 18. Checkpoint Final - Validación completa
  - Ejecutar `npm run build` para verificar compilación completa
  - Ejecutar `npm test` para verificar que TODOS los tests pasan
  - Verificar que todas las properties del diseño están cubiertas
  - Documentar cualquier desviación o problema encontrado

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before avanzar
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- El proyecto usa Vitest como framework de testing
- La biblioteca `fast-check` debe instalarse para property-based testing
- La base de datos usa `better-sqlite3` (síncrona) en lugar de `sqlite3` (async)
- ComfyUI debe estar instalado en D:\ComfyUI con los modelos Wan configurados
- El modo por defecto es 'hybrid' para máxima resiliencia

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["4.4", "4.5", "5.2", "5.3"] },
    { "id": 6, "tasks": ["4.6", "5.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4", "7.5"] },
    { "id": 9, "tasks": ["7.6", "8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3"] },
    { "id": 11, "tasks": ["8.4", "8.5"] },
    { "id": 12, "tasks": ["8.6", "10.1"] },
    { "id": 13, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 14, "tasks": ["10.5", "10.6", "10.7"] },
    { "id": 15, "tasks": ["10.8", "12.1"] },
    { "id": 16, "tasks": ["12.2", "12.3", "12.4"] },
    { "id": 17, "tasks": ["12.5", "13.1"] },
    { "id": 18, "tasks": ["13.2", "13.3"] },
    { "id": 19, "tasks": ["13.4", "13.5"] },
    { "id": 20, "tasks": ["14.1"] },
    { "id": 21, "tasks": ["14.2", "14.3", "14.4"] },
    { "id": 22, "tasks": ["14.5", "16.1"] },
    { "id": 23, "tasks": ["16.2"] },
    { "id": 24, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
