# Requirements Document

## Introduction

Este documento especifica los requerimientos para integrar generación de video con IA local mediante ComfyUI en OmniAI-Engine. El sistema soporta tres modos de operación configurables: 'comfyui' (solo generación local con GPU), 'pexels' (solo videos de stock para servidores sin GPU), y 'hybrid' (ComfyUI como primario con Pexels como fallback). El sistema debe gestionar automáticamente el proceso ComfyUI (inicio, monitoreo, reinicio), soportar múltiples modelos Wan (2.2 5B y 2.1 1.3B), y proporcionar comportamiento resiliente según el modo configurado.

## Glossary

- **ComfyUI_Process_Manager**: Componente que gestiona el ciclo de vida del proceso ComfyUI (inicio, monitoreo, reinicio automático)
- **ComfyUI_Client**: Cliente HTTP existente que comunica con la API de ComfyUI para enviar workflows y obtener resultados
- **Video_Generator**: Componente que orquesta la generación de videos según el modo configurado
- **Health_Monitor**: Subsistema que verifica periódicamente la disponibilidad y estado de ComfyUI
- **Model_Config**: Configuración que define qué modelo Wan usar (2.2 5B o 2.1 1.3B) con sus parámetros específicos
- **T2V**: Text-to-Video, generación de video a partir de descripción textual (prompt)
- **Workflow**: Definición JSON de nodos y conexiones que ComfyUI ejecuta para generar video
- **Video_Source_Mode**: Modo de operación que determina la fuente de videos ('comfyui', 'pexels', o 'hybrid')
- **Hybrid_Mode**: Modo de operación donde ComfyUI es la fuente primaria y Pexels API actúa como respaldo automático
- **Clip_Pool_Manager**: Componente que gestiona el pool de clips pre-generados, incluyendo generación nocturna y mantenimiento
- **Clip_Database**: Base de datos SQLite que almacena metadata de clips y registros de uso para control y auditoría
- **Key_Segment**: Segmento importante del video (intro, outro, transiciones) que requiere contenido único generado con ComfyUI
- **Filler_Segment**: Segmento intermedio del video que puede usar clips pre-generados o de Pexels
- **Pre_Generation_Scheduler**: Proceso programado que genera clips durante horarios de baja carga (por defecto 2:00 AM - 6:00 AM)
- **comfyPrompts**: Array de descripciones detalladas (20-50 palabras) optimizadas para generación de video con ComfyUI/Wan, incluyendo escena, iluminación, movimiento de cámara y estilo visual
- **visualPrompts**: Array de keywords cortos (1-3 palabras) optimizados para búsqueda de stock video en Pexels API
- **Short_Resolution**: Resolución para videos verticales tipo Short/Reel (default: 576x1024, ratio 9:16)
- **Long_Resolution**: Resolución para videos horizontales tipo YouTube (default: 832x480, ratio ~16:9)
- **Visual_Style**: Estilo predefinido que determina la estética y tipo de movimiento de los videos generados con ComfyUI
- **cinemagraph_plotagraph**: Estilo visual donde la imagen es mayormente estática con un único elemento en movimiento sutil en loop infinito (humo, agua, luz parpadeante)
- **moody_lofi_ambient**: Estilo visual con atmósfera acogedora pero melancólica, típico de videos lo-fi con lluvia, niebla, luces cálidas y movimiento ambiental lento
- **analog_horror_liminal**: Estilo visual que evoca espacios liminales perturbadores con iluminación fluorescente, niebla volumétrica, y atmósfera inquietante de "algo está mal"

## Requirements

### Requirement 1: Gestión Automática del Proceso ComfyUI

**User Story:** Como desarrollador de OmniAI-Engine, quiero que el sistema inicie y mantenga ComfyUI automáticamente, para no tener que gestionar manualmente el proceso cada vez que arranco el sistema.

#### Acceptance Criteria

1. WHEN VIDEO_SOURCE_MODE es 'pexels', THE ComfyUI_Process_Manager SHALL omitir completamente la inicialización de ComfyUI
2. WHEN OmniAI-Engine se inicia y VIDEO_SOURCE_MODE es 'comfyui' o 'hybrid', THE ComfyUI_Process_Manager SHALL verificar si ComfyUI ya está corriendo en http://127.0.0.1:8188
3. IF ComfyUI no está corriendo al iniciar OmniAI-Engine, THEN THE ComfyUI_Process_Manager SHALL ejecutar el script D:\ComfyUI\start_comfyui.bat como proceso de fondo
4. WHILE ComfyUI está iniciándose, THE ComfyUI_Process_Manager SHALL esperar hasta 120 segundos verificando la disponibilidad cada 5 segundos
5. IF ComfyUI no responde después de 120 segundos de espera, THEN THE ComfyUI_Process_Manager SHALL registrar un error y marcar ComfyUI como no disponible
6. WHEN el proceso ComfyUI termina inesperadamente, THE ComfyUI_Process_Manager SHALL detectarlo y registrar el evento
7. IF ComfyUI termina inesperadamente y hay generaciones pendientes, THEN THE ComfyUI_Process_Manager SHALL intentar reiniciar el proceso automáticamente hasta 3 veces
8. THE ComfyUI_Process_Manager SHALL exponer un método shutdown() que detenga el proceso ComfyUI de forma graceful

### Requirement 2: Monitoreo de Salud de ComfyUI

**User Story:** Como sistema, quiero monitorear continuamente la salud de ComfyUI, para detectar problemas y reaccionar antes de que afecten la generación de videos.

#### Acceptance Criteria

1. WHILE ComfyUI está marcado como disponible, THE Health_Monitor SHALL verificar la salud cada 60 segundos
2. WHEN se realiza un health check, THE Health_Monitor SHALL consultar el endpoint /system_stats de ComfyUI
3. IF ComfyUI no responde al health check después de 3 intentos consecutivos, THEN THE Health_Monitor SHALL marcar ComfyUI como no disponible
4. WHEN ComfyUI pasa de disponible a no disponible, THE Health_Monitor SHALL emitir un evento comfyui:unavailable
5. WHEN ComfyUI pasa de no disponible a disponible, THE Health_Monitor SHALL emitir un evento comfyui:available
6. THE Health_Monitor SHALL registrar métricas de VRAM disponible y estado de la cola en cada health check exitoso

### Requirement 3: Configuración de Modelos Wan

**User Story:** Como desarrollador, quiero poder seleccionar entre diferentes modelos Wan según mis necesidades de calidad vs velocidad, para optimizar el balance tiempo-calidad según el contexto.

#### Acceptance Criteria

1. THE Model_Config SHALL soportar dos configuraciones de modelo: wan22_5B (alta calidad) y wan21_1_3B (rápido)
2. THE Model_Config SHALL leer la configuración del modelo desde la variable de entorno COMFYUI_MODEL en el archivo .env
3. THE Model_Config SHALL aceptar dos valores válidos para COMFYUI_MODEL: 'wan22_5B' y 'wan21_1_3B'
4. IF COMFYUI_MODEL no está definida en .env, THEN THE Model_Config SHALL usar 'wan22_5B' como valor por defecto
5. IF COMFYUI_MODEL contiene un valor inválido, THEN THE Model_Config SHALL lanzar un error de configuración al iniciar con mensaje descriptivo
6. THE Model_Config SHALL registrar en el log qué modelo está configurado al iniciar el sistema
7. WHEN se selecciona wan22_5B, THE Model_Config SHALL usar los archivos wan2.2_ti2v_5B_fp16.safetensors, wan2.2_vae.safetensors, y umt5_xxl_fp8_e4m3fn_scaled.safetensors
8. WHEN se selecciona wan21_1_3B, THE Model_Config SHALL usar los archivos wan2.1_t2v_1.3B.safetensors, Wan2_1_VAE_bf16.safetensors, y umt5-xxl-enc-fp8_e4m3fn.safetensors
9. THE Model_Config SHALL definir presets de calidad (fast, balanced, quality) con parámetros específicos para cada modelo

### Requirement 4: Generación de Video con ComfyUI

**User Story:** Como sistema de generación de contenido, quiero generar videos de fondo usando ComfyUI y modelos Wan, para producir contenido visual único sin depender de stock footage externo.

#### Acceptance Criteria

1. WHEN se solicita generar un video y ComfyUI está disponible, THE Video_Generator SHALL construir un workflow T2V con los parámetros configurados
2. THE Video_Generator SHALL enviar el workflow a ComfyUI mediante el endpoint /prompt y obtener un prompt_id
3. WHILE el workflow está en ejecución, THE Video_Generator SHALL consultar el estado cada 5 segundos mediante /queue y /history/{prompt_id}
4. WHEN el workflow completa exitosamente, THE Video_Generator SHALL copiar el archivo de salida desde D:\ComfyUI\output al directorio local content/generated_videos
5. IF el workflow falla o excede el timeout configurado, THEN THE Video_Generator SHALL cancelar el job y registrar el error
6. THE Video_Generator SHALL aplicar timeout de 30 minutos por defecto para generaciones T2V
7. WHEN se genera un video para Short, THE Video_Generator SHALL usar orientación portrait (ancho < alto)
8. WHEN se genera un video para Long Video, THE Video_Generator SHALL usar orientación landscape (ancho > alto)
9. WHEN se genera un video con ComfyUI, THE Video_Generator SHALL usar el comfyPrompt correspondiente del array comfyPrompts en lugar del visualPrompt

### Requirement 5: Comportamiento por Modo

**User Story:** Como sistema resiliente, quiero que el comportamiento ante fallos varíe según el modo configurado, para optimizar entre fiabilidad y calidad según el contexto de ejecución.

#### Acceptance Criteria

1. WHEN el modo es 'comfyui' y la generación falla, THE Video_Generator SHALL reintentar hasta 2 veces antes de fallar definitivamente
2. WHEN el modo es 'comfyui' y la generación falla después de los reintentos, THE Video_Generator SHALL lanzar un error sin intentar alternativas
3. WHEN el modo es 'pexels' y Pexels falla, THE Video_Generator SHALL generar un video sintético con FFmpeg usando color sólido animado
4. WHEN el modo es 'hybrid' y ComfyUI falla o no está disponible, THE Video_Generator SHALL usar Pexels API automáticamente
5. WHEN el modo es 'hybrid' y tanto ComfyUI como Pexels fallan, THE Video_Generator SHALL generar un video sintético con FFmpeg
6. WHEN se usa una fuente alternativa en modo 'hybrid', THE Video_Generator SHALL registrar un warning indicando qué fuente se utilizó
7. THE Video_Generator SHALL retornar un resultado con campo sourceUsed indicando 'comfyui', 'pexels', o 'synthetic'

### Requirement 6: Integración con Pipeline Existente

**User Story:** Como desarrollador de OmniAI-Engine, quiero que la generación con ComfyUI se integre transparentemente con el pipeline existente, para no tener que modificar los componentes de alto nivel.

#### Acceptance Criteria

1. THE Video_Generator SHALL exponer la misma interfaz que VideoRenderer para generación de clips de fondo
2. WHEN se llama a renderVideo para Shorts, THE Video_Generator SHALL usar ComfyUI si está disponible, manteniendo compatibilidad con el flujo actual
3. WHEN se llama a renderLongVideo, THE Video_Generator SHALL generar múltiples clips con ComfyUI y concatenarlos
4. THE Video_Generator SHALL convertir el prompt de búsqueda de Pexels a prompt descriptivo para Wan si es necesario
5. THE Video_Generator SHALL mantener el cache de videos usados para evitar repeticiones en sesiones cercanas

### Requirement 7: Logging y Métricas

**User Story:** Como operador del sistema, quiero tener visibilidad completa sobre la generación de videos con ComfyUI, para diagnosticar problemas y optimizar rendimiento.

#### Acceptance Criteria

1. THE ComfyUI_Process_Manager SHALL registrar todos los eventos de ciclo de vida (inicio, parada, crash, reinicio)
2. THE Video_Generator SHALL registrar el tiempo de generación de cada video en segundos
3. THE Video_Generator SHALL registrar el modelo y preset utilizado para cada generación
4. THE Health_Monitor SHALL registrar el uso de VRAM y estado de cola en cada health check
5. IF la generación excede 10 minutos, THEN THE Video_Generator SHALL emitir un log de warning con el progreso estimado
6. THE Video_Generator SHALL registrar la fuente utilizada (comfyui, pexels, o synthetic) para cada generación

### Requirement 8: Modos de Fuente de Video

**User Story:** Como operador del sistema, quiero configurar el modo de fuente de video mediante una variable de entorno, para poder ejecutar OmniAI-Engine tanto en máquinas con GPU como en servidores sin GPU.

#### Acceptance Criteria

1. THE Video_Generator SHALL soportar tres modos de operación: 'comfyui', 'pexels', y 'hybrid'
2. THE Video_Generator SHALL leer el modo desde la variable de entorno VIDEO_SOURCE_MODE
3. WHEN VIDEO_SOURCE_MODE no está definida, THE Video_Generator SHALL usar 'hybrid' como valor por defecto
4. WHEN el modo es 'comfyui', THE Video_Generator SHALL usar exclusivamente ComfyUI para generar videos
5. WHEN el modo es 'comfyui' y ComfyUI no está disponible, THE Video_Generator SHALL lanzar un error claro indicando que ComfyUI es requerido
6. WHEN el modo es 'pexels', THE Video_Generator SHALL usar exclusivamente Pexels API sin intentar iniciar ComfyUI
7. WHEN el modo es 'pexels', THE ComfyUI_Process_Manager SHALL omitir la inicialización del proceso ComfyUI
8. WHEN el modo es 'hybrid', THE Video_Generator SHALL intentar ComfyUI primero y usar Pexels como fallback si falla
9. WHEN el modo es 'hybrid' y ComfyUI no está disponible, THE Video_Generator SHALL usar Pexels registrando un warning en lugar de error
10. THE Video_Generator SHALL validar que el modo configurado sea uno de los tres valores permitidos al iniciar
11. IF VIDEO_SOURCE_MODE contiene un valor inválido, THEN THE Video_Generator SHALL lanzar un error de configuración al iniciar

### Requirement 9: Modo Híbrido Inteligente

**User Story:** Como sistema de generación de contenido, quiero usar ComfyUI para partes clave del video (intros, outros, momentos importantes) y Pexels para relleno, para balancear unicidad con tiempo de generación.

#### Acceptance Criteria

1. WHEN el modo es 'hybrid', THE Video_Generator SHALL clasificar cada segmento del video como 'key' (Key_Segment) o 'filler' (Filler_Segment)
2. THE Video_Generator SHALL clasificar como Key_Segment: intro (primeros 10 segundos), outro (últimos 10 segundos), y transiciones principales
3. THE Video_Generator SHALL clasificar como Filler_Segment: segmentos intermedios de contenido repetitivo o genérico
4. WHEN un segmento es Key_Segment, THE Video_Generator SHALL usar ComfyUI para generar video único
5. WHEN un segmento es Filler_Segment, THE Video_Generator SHALL usar Pexels o clips del pool pre-generado
6. THE Video_Generator SHALL permitir override manual de clasificación mediante campo segment_type en metadata del script

### Requirement 10: Pre-generación Nocturna de Clips

**User Story:** Como operador del sistema, quiero pre-generar un pool de clips genéricos durante la noche cuando no hay carga, para tener videos listos y reducir tiempos de generación en horario productivo.

#### Acceptance Criteria

1. THE Clip_Pool_Manager SHALL mantener un pool de clips pre-generados en el directorio content/clip_pool/
2. THE Clip_Pool_Manager SHALL soportar configuración de horario para pre-generación mediante variable de entorno CLIP_PREGENERATION_SCHEDULE (default: "02:00-06:00")
3. WHEN se activa la pre-generación nocturna, THE Clip_Pool_Manager SHALL generar clips hasta alcanzar el mínimo configurado por categoría (default: 20 clips por categoría)
4. THE Clip_Pool_Manager SHALL generar clips basados en seis categorías genéricas: nature, technology, business, abstract, lifestyle, urban
5. WHEN el pool tiene menos de 20 clips en una categoría, THE Clip_Pool_Manager SHALL priorizar esa categoría en la próxima sesión de pre-generación
6. THE Clip_Pool_Manager SHALL almacenar metadata de cada clip: prompt, fecha_generacion, categoria, duracion_segundos, resolucion, veces_usado
7. THE Clip_Pool_Manager SHALL exponer un método triggerPreGeneration() para iniciar pre-generación manual

### Requirement 11: Gestión de Pool y Reuso de Clips

**User Story:** Como sistema eficiente, quiero reutilizar clips pre-generados cuando sea apropiado, manteniendo control total de qué se usa y cuándo, para optimizar recursos sin sacrificar variedad.

#### Acceptance Criteria

1. WHEN se necesita un clip de tipo Filler_Segment, THE Video_Generator SHALL buscar primero en el pool de clips pre-generados
2. THE Video_Generator SHALL seleccionar clips del pool usando matching por categoría y keywords extraídos del prompt
3. THE Video_Generator SHALL evitar usar el mismo clip en videos publicados en los últimos 7 días
4. WHEN el pool tiene más de 200 clips activos, THE Video_Generator SHALL priorizar reuso sobre generación nueva para Filler_Segments
5. WHEN el pool tiene menos de 50 clips activos, THE Video_Generator SHALL priorizar generación nueva incluso para Filler_Segments
6. THE Video_Generator SHALL incrementar el contador veces_usado cada vez que un clip se utiliza
7. IF un clip ha sido usado más de 10 veces, THEN THE Video_Generator SHALL marcar el clip como 'retired' y excluirlo de selección futura

### Requirement 12: Base de Datos de Control de Clips

**User Story:** Como operador del sistema, quiero tener control total sobre los clips generados y su uso mediante una base de datos, para auditoría, optimización y evitar repeticiones.

#### Acceptance Criteria

1. THE Clip_Database SHALL almacenar registro de cada clip generado con campos: id, filepath, prompt, negative_prompt, model_used, preset_used, generation_time_seconds, created_at, category, tags, status (active/retired/deleted)
2. THE Clip_Database SHALL almacenar registro de cada uso de clip con campos: clip_id, video_id, video_type (short/long), segment_type (key/filler), used_at, platform (youtube/tiktok/instagram)
3. THE Clip_Database SHALL proveer método getClipsNotUsedSince(days: number) para obtener clips no usados en los últimos N días
4. THE Clip_Database SHALL proveer método getClipsByCategory(category: string, orderBy: 'least_used') para obtener clips ordenados por menor uso
5. THE Clip_Database SHALL proveer método getStatistics() que retorne: total_clips, clips_por_categoria, clips_mas_usados, clips_sin_usar, promedio_usos
6. THE Clip_Database SHALL usar SQLite para almacenamiento local en data/clips.db
7. WHEN OmniAI-Engine inicia, THE Clip_Database SHALL ejecutar migraciones de esquema automáticamente si existen cambios pendientes

### Requirement 13: Generación Dual de Prompts Visuales

**User Story:** Como sistema de generación de contenido, quiero que DeepSeek genere tanto prompts para Pexels (keywords cortos) como prompts para ComfyUI (descripciones detalladas) en la misma llamada, para evitar transformaciones adicionales y mantener coherencia entre ambos.

#### Acceptance Criteria

1. THE ScriptGenerator SHALL solicitar a DeepSeek dos arrays de prompts visuales: visualPrompts (para Pexels) y comfyPrompts (para ComfyUI)
2. THE ScriptGenerator SHALL incluir en el prompt de DeepSeek instrucciones para generar visualPrompts como keywords de 1-3 palabras para búsqueda de stock video
3. THE ScriptGenerator SHALL incluir en el prompt de DeepSeek instrucciones para generar comfyPrompts como descripciones detalladas de 20-50 palabras optimizadas para Text-to-Video con Wan
4. THE ScriptGenerator SHALL requerir que comfyPrompts incluyan: descripción de escena, iluminación, movimiento de cámara, y estilo visual
5. THE ScriptGenerator SHALL validar que visualPrompts y comfyPrompts tengan la misma cantidad de elementos (correspondencia 1:1)
6. IF DeepSeek no retorna comfyPrompts, THEN THE ScriptGenerator SHALL generar comfyPrompts básicos expandiendo los visualPrompts con template genérico
7. THE ScriptGenerator SHALL retornar un objeto Script con ambos arrays: visualPrompts y comfyPrompts

### Requirement 14: Especificaciones de Resolución por Tipo de Video

**User Story:** Como sistema de generación de contenido, quiero que los videos se generen con las dimensiones correctas según el tipo de contenido (Short vertical o Long Video horizontal), para asegurar compatibilidad con las plataformas de publicación.

#### Acceptance Criteria

1. WHEN se genera un video para Short, THE Video_Generator SHALL usar resolución portrait de 576x1024 píxeles (ratio 9:16)
2. WHEN se genera un video para Long Video, THE Video_Generator SHALL usar resolución landscape de 832x480 píxeles (ratio aproximado 16:9)
3. THE Video_Generator SHALL determinar el tipo de video basándose en el parámetro videoType ('short' o 'long') pasado a la función de generación
4. IF videoType no se especifica, THEN THE Video_Generator SHALL inferir el tipo basándose en la orientación solicitada (portrait=short, landscape=long)
5. THE Video_Generator SHALL validar que las dimensiones sean múltiplos de 16 (requerimiento de los modelos Wan)
6. THE Video_Generator SHALL registrar en el log las dimensiones utilizadas para cada generación
7. THE Model_Config SHALL permitir override de resoluciones mediante variables de entorno COMFYUI_SHORT_RESOLUTION y COMFYUI_LONG_RESOLUTION (formato: "WIDTHxHEIGHT")
8. IF COMFYUI_SHORT_RESOLUTION o COMFYUI_LONG_RESOLUTION contienen dimensiones no múltiplos de 16, THEN THE Model_Config SHALL lanzar un error de configuración al iniciar
9. THE Model_Config SHALL permitir configurar el número de frames mediante variable de entorno COMFYUI_DEFAULT_FRAMES (default: 49)

### Requirement 15: Estilos Visuales Predefinidos para Generación ComfyUI

**User Story:** Como sistema de generación de contenido, quiero que los videos generados con ComfyUI sigan estilos visuales predefinidos que maximizan el engagement con movimiento sutil y atmósfera envolvente, para crear contenido visualmente atrapante y distintivo.

#### Acceptance Criteria

1. THE ScriptGenerator SHALL instruir a DeepSeek para asignar uno de tres estilos visuales a cada comfyPrompt: 'cinemagraph_plotagraph', 'moody_lofi_ambient', o 'analog_horror_liminal'
2. WHEN el estilo es 'cinemagraph_plotagraph', THE comfyPrompt SHALL describir escenas mayormente estáticas con un único elemento en movimiento sutil en loop, incluyendo: humo, vapor, agua, cabello con brisa, parpadeo de luz, o partículas flotantes
3. WHEN el estilo es 'moody_lofi_ambient', THE comfyPrompt SHALL describir escenas acogedoras pero melancólicas con atmósfera envolvente, incluyendo: cafeterías nocturnas con lluvia en ventana, escritorios con luz cálida, paisajes urbanos nocturnos con niebla, neón difuso, y movimiento lento de elementos atmosféricos
4. WHEN el estilo es 'analog_horror_liminal', THE comfyPrompt SHALL describir espacios liminales perturbadores con atmósfera inquietante, incluyendo: pasillos vacíos, cruces peatonales solitarios, centros comerciales abandonados, figuras distantes y estáticas, iluminación fluorescente parpadeante, y niebla volumétrica
5. THE ScriptGenerator SHALL incluir en el prompt de DeepSeek ejemplos de cada estilo para guiar la generación: cinemagraph_plotagraph ("coffee cup with gentle steam rising, static background, warm cafe interior, soft focus, seamless loop motion"), moody_lofi_ambient ("rainy night city street seen through foggy window, neon signs reflection, lo-fi aesthetic, melancholic atmosphere, slow rain drops"), analog_horror_liminal ("empty pedestrian crossing at night, single distant figure standing still, flickering street lamp, volumetric fog, liminal space, unsettling calm")
6. THE ScriptGenerator SHALL permitir que DeepSeek seleccione el estilo más apropiado basándose en el tono del contenido del script: educativo hacia moody_lofi_ambient, misterioso hacia analog_horror_liminal, producto o marca hacia cinemagraph_plotagraph
7. THE comfyPrompt SHALL siempre incluir indicadores de movimiento sutil específicos del estilo: "subtle motion", "gentle drift", "slow movement", "seamless loop", o "static camera with minimal motion"
8. THE ScriptGenerator SHALL retornar el estilo seleccionado junto con cada comfyPrompt en el objeto Script para que Video_Generator pueda ajustar parámetros de generación
9. THE Model_Config SHALL definir parámetros de generación optimizados por estilo: cinemagraph_plotagraph con 33 frames y movimiento mínimo con alta estabilidad, moody_lofi_ambient con 49 frames y movimiento atmosférico suave, analog_horror_liminal con 49 frames y movimiento lento y perturbador
