# ComfyUI — Guía Completa de Uso
## Para integración con OmniAI-Engine

> Documentación técnica interna | `D:\ComfyUI` | Servidor: `http://127.0.0.1:8188`

---

## Índice

1. [Qué es ComfyUI](#1-qué-es-comfyui)
2. [Arquitectura instalada](#2-arquitectura-instalada)
3. [Modelos disponibles](#3-modelos-disponibles)
4. [Cómo iniciar el servidor](#4-cómo-iniciar-el-servidor)
5. [Cómo generar una imagen](#5-cómo-generar-una-imagen)
6. [Cómo generar un video](#6-cómo-generar-un-video)
7. [Integración con OmniAI-Engine](#7-integración-con-omniai-engine)
8. [Referencia de la API REST](#8-referencia-de-la-api-rest)
9. [Parámetros recomendados por caso de uso](#9-parámetros-recomendados-por-caso-de-uso)

---

## 1. Qué es ComfyUI

ComfyUI es un generador visual basado en nodos para crear imágenes y videos con IA.
Expone una API REST en `http://127.0.0.1:8188` que permite enviar workflows en formato
JSON y recibir los resultados generados.

**Ventajas para OmniAI-Engine:**
- Genera thumbnails únicos con IA (mejores que Pexels)
- Genera clips de video originales para B-roll de YouTube
- Evita copyright de imágenes de stock
- 100% local — sin costos por API call

---

## 2. Arquitectura instalada

`
D:\ComfyUI\
├── start_comfyui.bat          <- Script de inicio (doble clic)
├── venv_cuda\                 <- Entorno Python 3.11 + CUDA
├── models\
│   ├── diffusion_models\      <- Modelos de video (Wan)
│   ├── unet\                  <- Modelos de imagen (FLUX)
│   ├── vae\                   <- VAE para video
│   ├── clip\                  <- CLIP encoders (FLUX)
│   ├── text_encoders\         <- T5 encoder (Wan video)
│   └── LLM\                   <- Encoders alternativos
├── custom_nodes\
│   ├── ComfyUI-GGUF\          <- Soporte modelos cuantizados
│   ├── ComfyUI-WanVideoWrapper\ <- Nodos para generación de video
│   └── ComfyUI-Manager\       <- Gestor de plugins
└── output\                    <- Videos e imágenes generadas
`

**GPU:** RTX 4060 8GB VRAM | **Modo:** --lowvram

---

## 3. Modelos disponibles

### 3.1 Generación de Imágenes — FLUX.1 Schnell

| Propiedad   | Valor |
|---|---|
| Archivo     | models/unet/flux1-schnell-Q4_K_S.gguf |
| Tamaño      | ~4 GB (cuantizado Q4) |
| Tipo        | Text-to-Image |
| Steps       | 4 pasos (muy rápido) |
| Resolución  | Hasta 1024x1024 |
| Tiempo est. | ~15-30 segundos en RTX 4060 |
| Uso ideal   | Thumbnails, banners, ilustraciones de blog |

**Encoder T5 (requerido para FLUX):**
- models/clip/t5-v1_1-xxl-encoder-Q4_K_S.gguf (~4 GB)
- models/clip/clip_l.safetensors

### 3.2 Generación de Video — Wan 2.2 TI2V-5B (RECOMENDADO)

| Propiedad   | Valor |
|---|---|
| Archivo     | models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors |
| Tamaño      | ~10 GB |
| Tipo        | **Text-to-Video + Image-to-Video** (híbrido) |
| Steps       | 20-30 (recomendado) |
| Resolución  | 672x384 (8GB VRAM) / 1280x704 (720p, 24GB VRAM) |
| Frames      | 33=~1.3s @ 24fps | 49=~2s | 81=~3.4s |
| Tiempo est. | ~3-5 min (672x384, 33 frames en RTX 4060 8GB) |
| Uso ideal   | B-roll de alta calidad, animación de thumbnails |

**Modelos auxiliares para Wan 2.2:**
- models/vae/wan2.2_vae.safetensors — VAE específico para 2.2 (~1.4 GB)
- models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors — T5 encoder (~6.7 GB)

> **IMPORTANTE:** Para 8GB VRAM, usar resolución máxima 672x384 con 33 frames y activar
> offloading nativo de ComfyUI. El modelo soporta tanto T2V como I2V en un solo archivo.

### 3.3 Generación de Video — Wan 2.1 T2V 1.3B (Legacy/Backup)

| Propiedad   | Valor |
|---|---|
| Archivo     | models/diffusion_models/wan2.1_t2v_1.3B.safetensors |
| Tamaño      | ~2.5 GB |
| Tipo        | Text-to-Video (solo) |
| Steps       | 4 (distill) o 15-20 (calidad) |
| Resolución  | 480x256 (rápido) / 640x360 (normal) / 832x480 (alta) |
| Frames      | 17=~1s | 33=~2s | 81=~5s |
| Tiempo est. | ~20s (optimizado) / ~4 min (calidad alta) |
| Uso ideal   | Fallback rápido cuando se necesita velocidad sobre calidad |

**Modelos auxiliares para Wan 2.1:**
- models/vae/Wan2_1_VAE_bf16.safetensors — VAE para 2.1
- models/text_encoders/umt5-xxl-enc-fp8_e4m3fn.safetensors — T5 encoder

---

## 4. Cómo iniciar el servidor

### Opción A — Doble clic (Windows)
Ejecuta: D:\ComfyUI\start_comfyui.bat

### Opción B — Terminal PowerShell
`powershell
cd D:\ComfyUI
.\venv_cuda\Scripts\activate.bat
python main.py --lowvram
`

### Verificar que está corriendo
`powershell
Invoke-RestMethod http://127.0.0.1:8188/system_stats
`

El servidor queda disponible en: http://127.0.0.1:8188

NOTA: El servidor debe estar activo antes de llamar la API desde OmniAI-Engine.

---

## 5. Cómo generar una imagen (FLUX.1 Schnell)

### Desde la interfaz visual
1. Abre http://127.0.0.1:8188
2. Clic en Load, carga un workflow de FLUX
3. Edita el prompt en el nodo de texto
4. Clic en Queue Prompt

### Desde la API — enviar workflow JSON

POST http://127.0.0.1:8188/prompt
Content-Type: application/json

`json
{
  "prompt": {
    "1": {
      "class_type": "UnetLoaderGGUF",
      "inputs": { "unet_name": "flux1-schnell-Q4_K_S.gguf" }
    },
    "2": {
      "class_type": "DualCLIPLoaderGGUF",
      "inputs": {
        "clip_name1": "t5-v1_1-xxl-encoder-Q4_K_S.gguf",
        "clip_name2": "clip_l.safetensors",
        "type": "flux"
      }
    },
    "3": {
      "class_type": "VAELoader",
      "inputs": { "vae_name": "ae.safetensors" }
    },
    "4": {
      "class_type": "EmptyLatentImage",
      "inputs": { "width": 1280, "height": 720, "batch_size": 1 }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": { "clip": ["2", 0], "text": "TU PROMPT AQUI" }
    },
    "6": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["5", 0],
        "negative": ["7", 0],
        "latent_image": ["4", 0],
        "seed": 42,
        "steps": 4,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1.0
      }
    },
    "7": {
      "class_type": "CLIPTextEncode",
      "inputs": { "clip": ["2", 0], "text": "" }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": { "samples": ["6", 0], "vae": ["3", 0] }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": { "images": ["8", 0], "filename_prefix": "thumbnail" }
    }
  }
}
`

**Respuesta:** { "prompt_id": "uuid-xxx" }

**Consultar resultado:**
GET http://127.0.0.1:8188/history/{prompt_id}

Cuando history[prompt_id].status.status_str === "success", los archivos están en:
http://127.0.0.1:8188/view?filename=FILENAME&type=output

---

## 6. Cómo generar un video

### 6.1 Wan 2.2 TI2V-5B — Image-to-Video (RECOMENDADO para 8GB)

Este es el flujo óptimo: FLUX genera una imagen → Wan 2.2 la anima.
Produce videos más coherentes y con mejor calidad visual.

**Workflow Image-to-Video optimizado para RTX 4060 8GB:**

POST http://127.0.0.1:8188/prompt

```json
{
  "prompt": {
    "1": {
      "class_type": "LoadDiffusionModel",
      "inputs": {
        "model": "wan2.2_ti2v_5B_fp16.safetensors"
      }
    },
    "2": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "type": "wan"
      }
    },
    "3": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "wan2.2_vae.safetensors"
      }
    },
    "4": {
      "class_type": "LoadImage",
      "inputs": {
        "image": "INPUT_IMAGE.png"
      }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "TU PROMPT DESCRIBIENDO EL MOVIMIENTO"
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "low quality, blurry, distorted, static, no motion"
      }
    },
    "7": {
      "class_type": "Wan22ImageToVideoLatent",
      "inputs": {
        "image": ["4", 0],
        "vae": ["3", 0],
        "width": 672,
        "height": 384,
        "length": 33
      }
    },
    "8": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["7", 0],
        "seed": 12345,
        "steps": 25,
        "cfg": 5.0,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1.0
      }
    },
    "9": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["8", 0],
        "vae": ["3", 0]
      }
    },
    "10": {
      "class_type": "SaveAnimatedWEBP",
      "inputs": {
        "images": ["9", 0],
        "filename_prefix": "i2v_output",
        "fps": 24.0,
        "lossless": false,
        "quality": 85,
        "method": "default"
      }
    }
  }
}
```

### Tabla de resoluciones para Wan 2.2 5B (8GB VRAM)

| Uso               | Res.     | Frames | Duración | Tiempo est. RTX 4060 |
|---|---|---|---|---|
| Preview rápido    | 512x288  | 25     | ~1s      | ~2-3 min             |
| B-roll estándar   | 672x384  | 33     | ~1.3s    | ~3-5 min             |
| B-roll largo      | 672x384  | 49     | ~2s      | ~5-8 min             |
| Alta calidad*     | 848x480  | 33     | ~1.3s    | ~8-12 min            |

*Alta calidad puede requerir offloading agresivo

---

### 6.2 Wan 2.2 TI2V-5B — Text-to-Video

Si no tienes una imagen de referencia, puedes generar video directamente desde texto.
Mismo modelo, solo cambia el latent inicial.

POST http://127.0.0.1:8188/prompt

```json
{
  "prompt": {
    "1": {
      "class_type": "LoadDiffusionModel",
      "inputs": {
        "model": "wan2.2_ti2v_5B_fp16.safetensors"
      }
    },
    "2": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "type": "wan"
      }
    },
    "3": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "wan2.2_vae.safetensors"
      }
    },
    "4": {
      "class_type": "EmptyHunyuanLatentVideo",
      "inputs": {
        "width": 672,
        "height": 384,
        "length": 33,
        "batch_size": 1
      }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "TU PROMPT AQUI"
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": "low quality, blurry, distorted"
      }
    },
    "7": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["4", 0],
        "seed": 12345,
        "steps": 25,
        "cfg": 5.0,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1.0
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["7", 0],
        "vae": ["3", 0]
      }
    },
    "9": {
      "class_type": "SaveAnimatedWEBP",
      "inputs": {
        "images": ["8", 0],
        "filename_prefix": "t2v_output",
        "fps": 24.0,
        "lossless": false,
        "quality": 85,
        "method": "default"
      }
    }
  }
}
```

---

### 6.3 Wan 2.1 T2V 1.3B (Legacy/Backup rápido)

### Workflow optimizado (~20 segundos para 17 frames)
Usa TeaCache + flowmatch_distill para velocidad máxima.

POST http://127.0.0.1:8188/prompt

`json
{
  "prompt": {
    "1": {
      "class_type": "WanVideoModelLoader",
      "inputs": {
        "model": "wan2.1_t2v_1.3B.safetensors",
        "base_precision": "bf16",
        "quantization": "disabled",
        "load_device": "offload_device"
      }
    },
    "2": {
      "class_type": "WanVideoVAELoader",
      "inputs": { "model_name": "Wan2_1_VAE_bf16.safetensors", "precision": "bf16" }
    },
    "3": {
      "class_type": "LoadWanVideoT5TextEncoder",
      "inputs": {
        "model_name": "umt5-xxl-enc-fp8_e4m3fn.safetensors",
        "precision": "bf16",
        "load_device": "offload_device"
      }
    },
    "4": {
      "class_type": "WanVideoEmptyEmbeds",
      "inputs": { "width": 480, "height": 256, "num_frames": 17 }
    },
    "5": {
      "class_type": "WanVideoTextEncode",
      "inputs": {
        "t5": ["3", 0],
        "positive_prompt": "TU PROMPT AQUI",
        "negative_prompt": "low quality, blurry, distorted",
        "force_offload": true
      }
    },
    "9": {
      "class_type": "WanVideoTeaCache",
      "inputs": {
        "rel_l1_thresh": 0.07,
        "start_step": 1,
        "end_step": -1,
        "cache_device": "offload_device",
        "use_coefficients": true
      }
    },
    "6": {
      "class_type": "WanVideoSampler",
      "inputs": {
        "model": ["1", 0],
        "image_embeds": ["4", 0],
        "text_embeds": ["5", 0],
        "cache_args": ["9", 0],
        "steps": 4,
        "cfg": 1.0,
        "shift": 8.0,
        "seed": 12345,
        "force_offload": true,
        "scheduler": "flowmatch_distill",
        "riflex_freq_index": 0
      }
    },
    "7": {
      "class_type": "WanVideoDecode",
      "inputs": {
        "vae": ["2", 0],
        "samples": ["6", 0],
        "enable_vae_tiling": true,
        "tile_x": 272,
        "tile_y": 272,
        "tile_stride_x": 144,
        "tile_stride_y": 128
      }
    },
    "8": {
      "class_type": "SaveAnimatedWEBP",
      "inputs": {
        "images": ["7", 0],
        "filename_prefix": "video_output",
        "fps": 16.0,
        "lossless": false,
        "quality": 80,
        "method": "default"
      }
    }
  }
}
`

### Tabla de resoluciones y tiempos

| Uso               | Res.     | Frames | Duración | Tiempo est. |
|---|---|---|---|---|
| Preview rápido    | 320x192  | 17     | ~1s      | ~10s        |
| B-roll corto      | 480x256  | 17     | ~1s      | ~20s        |
| B-roll normal     | 640x360  | 33     | ~2s      | ~60s        |
| Short (fondo)     | 480x832  | 81     | ~5s      | ~5-8 min    |

---

## 7. Integración con OmniAI-Engine

### 7.1 Clase sugerida: ComfyUIClient.ts
Crear en: src/generators/ComfyUIClient.ts

`	ypescript
const COMFYUI_URL = 'http://127.0.0.1:8188';

export class ComfyUIClient {

  // Verifica si el servidor esta activo
  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(${COMFYUI_URL}/system_stats);
      return res.ok;
    } catch {
      return false;
    }
  }

  // Envia un workflow y espera el resultado
  static async runWorkflow(workflow: object): Promise<string[]> {
    const res = await fetch(${COMFYUI_URL}/prompt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow })
    });
    if (!res.ok) throw new Error(ComfyUI error: );
    const { prompt_id } = await res.json();
    return this.waitForOutput(prompt_id);
  }

  // Polling hasta completar
  private static async waitForOutput(promptId: string): Promise<string[]> {
    const timeout = Date.now() + 15 * 60 * 1000;
    while (Date.now() < timeout) {
      await new Promise(r => setTimeout(r, 3000));
      const res = await fetch(${COMFYUI_URL}/history/);
      const history = await res.json();
      if (history[promptId]) {
        const h = history[promptId];
        if (h.status?.status_str === 'error') throw new Error('ComfyUI generation error');
        const files: string[] = [];
        for (const out of Object.values(h.outputs || {}) as any[]) {
          if (out.images) {
            for (const img of out.images) {
              files.push(${COMFYUI_URL}/view?filename=&type=output);
            }
          }
        }
        return files;
      }
    }
    throw new Error('ComfyUI timeout after 15 minutes');
  }

  // Genera thumbnail con FLUX.1 Schnell
  static async generateThumbnail(prompt: string, width = 1280, height = 720): Promise<string[]> {
    const workflow = buildFluxWorkflow(prompt, width, height); // ver seccion 5
    return this.runWorkflow(workflow);
  }

  // Genera video B-roll con Wan 2.1 T2V 1.3B
  static async generateVideoClip(prompt: string, frames = 17, w = 480, h = 256): Promise<string[]> {
    const workflow = buildWanWorkflow(prompt, frames, w, h); // ver seccion 6
    return this.runWorkflow(workflow);
  }
}
`

### 7.2 Integrar en ThumbnailGenerator.ts (reemplazar Pexels)

`	ypescript
import { ComfyUIClient } from './ComfyUIClient';

// Al inicio de generateThumbnail():
const comfyAvailable = await ComfyUIClient.isAvailable();
if (comfyAvailable) {
  const comfyPrompt = ${config.visualPrompt}, YouTube thumbnail, 
    vibrant colors, cinematic lighting, 8K quality, no text;
  const urls = await ComfyUIClient.generateThumbnail(comfyPrompt, width, height);
  return await downloadAndSave(urls[0], outputPath);
}
// Si falla, continua con logica actual de Pexels como fallback
`

### 7.3 Integrar en VideoRenderer.ts (B-roll sin copyright)

`	ypescript
import { ComfyUIClient } from './ComfyUIClient';

static async generateAIBroll(topic: string): Promise<string | null> {
  if (!await ComfyUIClient.isAvailable()) return null;
  const prompt = cinematic , smooth camera movement, 
    professional lighting, no text, no faces, 4K;
  const urls = await ComfyUIClient.generateVideoClip(prompt, 33, 640, 360);
  return urls.length > 0 ? await downloadAndSave(urls[0], content/broll_.webp) : null;
}
`

### 7.4 Variables de entorno (.env)

`
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_ENABLED=true
COMFYUI_TIMEOUT_MS=900000
`

---

## 8. Referencia de la API REST

| Endpoint                          | Método | Descripción                        |
|---|---|---|
| /system_stats                     | GET    | Estado del servidor y GPU          |
| /prompt                           | POST   | Enviar workflow para ejecución     |
| /history/{id}                     | GET    | Consultar resultado de un prompt   |
| /queue                            | GET    | Ver cola de ejecución              |
| /object_info/{node}               | GET    | Parámetros de un nodo específico   |
| /view?filename=X&type=output      | GET    | Descargar archivo generado         |

---

## 9. Parámetros recomendados por caso de uso

### Thumbnails de YouTube (FLUX.1)
- Resolución: 1280x720 (landscape) | 1080x1920 (shorts)
- Steps: 4 | CFG: 1.0 | Scheduler: simple/euler

**Prompts efectivos:**
`
"futuristic brain with glowing neural connections, dark background,
 purple and blue colors, professional, high contrast, no text"

"split brain showing autism and AI connection, digital art,
 vibrant colors, dramatic lighting, 4K"
`

### B-roll de Video (Wan 1.3B)
- Resolución: 480x256 (rápido) | 640x360 (normal)
- Steps: 4 (distill) | CFG: 1.0 | TeaCache: 0.07

**Prompts efectivos para canales de IA:**
`
"abstract visualization of neural pathways in the brain, 
 glowing synapses, dark background, blue and purple colors,
 smooth cinematic motion, no faces"

"futuristic AI data streams flowing through digital space,
 neon lights, clean minimal look, professional"

"time-lapse night city with AI data overlay,
 aerial view, cyberpunk aesthetic, smooth motion"
`

---

Documentación generada: 25 de agosto 2026
Hardware: RTX 4060 8GB | ComfyUI v0.33.0 | Wan 2.1 1.3B | FLUX.1 Schnell
