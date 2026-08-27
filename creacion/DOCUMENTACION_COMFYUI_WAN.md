# 🚀 Guía Oficial: Configuración e Integración de ComfyUI en OmniAI-Engine

Esta documentación describe la instalación, modelos optimizados, flujos de trabajo e integración del sistema de generación de imágenes y video por IA (ComfyUI) dentro de la aplicación **OmniAI-Engine**.

---

## 🛠️ 1. Resumen de Instalación y Especificaciones de Hardware

El entorno está configurado e instalado en la unidad local **`D:\ComfyUI`**, adaptado para las especificaciones del equipo:
- **Procesador:** Intel Core i7
- **Memoria RAM:** 24 GB DDR4/DDR5
- **Tarjeta Gráfica (VRAM):** NVIDIA GeForce RTX 4060 con **8 GB VRAM**

### Configuración del Servidor ComfyUI
- **Directorio Principal:** `D:\ComfyUI`
- **Entorno Virtual Python:** `D:\ComfyUI\venv_cuda\Scripts\python.exe`
- **Puerto por Defecto:** `http://127.0.0.1:8188`
- **Parámetro Obligatorio de Inicio:** `--lowvram` (Indispensable para gestionar eficientemente la VRAM de 8GB sin saturar la memoria).

---

## 🧠 2. Catálogo de Modelos Instalados y Rendimiento Medido

En `D:\ComfyUI\models\` hemos instalado y validado los siguientes modelos de generación:

### A. Generación de Imagen (Text-to-Image)
| Modelo | Ubicación | Formato | Velocidad Relleno | Uso Recomendado |
|---|---|---|---|---|
| **FLUX.1 Schnell GGUF** | `models/unet/flux1-schnell-Q4_K_S.gguf` | Quantized Q4_K_S (6.32 GB) | ⚡ **~20 segundos** | Creación de Thumbnails, portadas y banners |

### B. Generación de Video (Text-to-Video & Image-to-Video)
| Modelo | Ubicación | Formato / Tipo | Tiempo Medido | Estado en OmniAI-Engine |
|---|---|---|---|---|
| **Wan 2.1 1.3B (T2V)** | `models/unet/wan2.1_t2v_1.3B.safetensors` | Text-to-Video (5.29 GB) | ⚡ **~45s - 2.5 min** | **CONFIGURADO POR DEFECTO (PROD)** |
| **Wan 2.2 5B FP16 (TI2V)** | `models/unet/wan2.2_ti2v_5B_fp16.safetensors` | Image/Text-to-Video (9.31 GB) | ⏱️ **~7.2 minutos** | Opción para Videos de Alta Calidad |
| **Wan 2.1 14B Q3_K_M** | `models/unet/wan2.1-i2v-14b-480p-Q3_K_M.gguf` | Image-to-Video Quantized (8.00 GB) | 🐌 **~54 minutos** | Uso Nocturno / Producción Pesada |

---

## 🎨 3. ¿Cómo Crear Imágenes y Videos en ComfyUI?

### A. Crear una Imagen (FLUX.1 Schnell)
1. Abrir la interfaz web de ComfyUI (`http://127.0.0.1:8188`).
2. Cargar el modelo **`flux1-schnell-Q4_K_S.gguf`** desde el nodo UNet/Checkpoint.
3. Configurar **Steps = 4**, **CFG = 1.0**.
4. Escribir el prompt deseado (ej. *"A futuristic cyberpunk city banner, neon lights, 8k"*).
5. Hacer clic en **Queue Prompt**. En ~20 segundos la imagen aparecerá en `D:\ComfyUI\output`.

### B. Crear un Video desde Texto (Wan 2.1 1.3B - Modo T2V)
1. Cargar el modelo **`wan2.1_t2v_1.3B.safetensors`** con el nodo `WanVideoModelLoader`.
2. Usar `LoadWanVideoT5TextEncoder` con `umt5-xxl-enc-fp8_e4m3fn.safetensors`.
3. Conectar a `WanVideoEmptyEmbeds` (ancho: 480, alto: 256, frames: 17).
4. Configurar el sampler `WanVideoSampler` con **12 a 20 pasos** y **CFG = 6.0**.
5. Hacer clic en **Queue Prompt**. El video animado WEBP estará listo en `D:\ComfyUI\output`.

---

## 🔄 4. Cómo Integra y Usa ComfyUI la App (`OmniAI-Engine`)

**OmniAI-Engine** utiliza el módulo `ComfyUIClient` y `ComfyUIProcessManager` para comunicarse automáticamente con ComfyUI vía API REST e interactuar sin intervención manual.

### Arquitectura de Integración:
```
┌────────────────────────┐      HTTP / REST API      ┌────────────────────────┐
│     OmniAI-Engine      │ ────────────────────────> │   ComfyUI Local Server │
│  (Node.js / TS App)    │                           │ (http://127.0.0.1:8188)│
└────────────────────────┘ <──────────────────────── └────────────────────────┘
          │                                                       │
          ▼                                                       ▼
 Configuración .env                                      Lee modelos de:
 COMFYUI_MODEL=wan21_1_3B                                D:\ComfyUI\models\
 COMFYUI_GENERATION_MODE=t2v                             Guarda output en:
 VIDEO_SOURCE_MODE=hybrid                                D:\ComfyUI\output\
```

### Flujo Automático del Engine:
1. **Verificación de Servicio:** Al iniciar la app, comprueba si ComfyUI está respondiendo en `http://127.0.0.1:8188`.
2. **Generación en Segundo Plano:** Cuando OmniAI-Engine requiere un clip de video para un post/Short:
   - Envía el prompt generado por IA al endpoint `/prompt` de ComfyUI.
   - Monitorea la cola de renderizado mediante polling cada 5 segundos.
   - Una vez finalizado, descarga o copia el video generado de `D:\ComfyUI\output\` a `content/generated_videos/`.
3. **Modo Híbrido (Pexels + ComfyUI):** Si un video local excede el tiempo o ComfyUI está ocupado, la app conmuta suavemente al banco de Pexels sin detener la publicación.

---

## ⚙️ 5. Variables de Entorno Configuradas (`.env`)

En `c:\Users\fogni\OneDrive\Escritorio\proyecto1a\OmniAI-Engine\.env` los parámetros oficiales son:

```env
# CONFIGURACIÓN COMFYUI Y WAN 2.1 1.3B
VIDEO_SOURCE_MODE=hybrid
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_MODEL=wan21_1_3B
COMFYUI_PATH=D:\ComfyUI
CLIP_PREGENERATION_SCHEDULE=02:00-06:00
CLIP_POOL_DIRECTORY=content/clip_pool
CLIP_POOL_MIN_PER_CATEGORY=20
COMFYUI_GENERATION_MODE=t2v
```

---

## 🚀 6. Comando de Inicio Recomendado

Para iniciar ComfyUI listo para ser consumido por OmniAI-Engine:
```powershell
cd D:\ComfyUI
.\venv_cuda\Scripts\python.exe main.py --lowvram
```
