# ComfyUI — Referencia Rápida

## Iniciar servidor
D:\ComfyUI\start_comfyui.bat

## URL
http://127.0.0.1:8188

## Modelos Instalados
| Tipo    | Archivo                                         | Uso                | Tiempo 8GB  |
|---------|-------------------------------------------------|--------------------|-------------|
| Imagen  | unet/flux1-schnell-Q4_K_S.gguf                 | Thumbnails         | ~20s        |
| Video   | diffusion_models/wan2.2_ti2v_5B_fp16.safetensors | I2V + T2V (NUEVO) | ~3-5 min   |
| Video   | diffusion_models/wan2.1_t2v_1.3B.safetensors   | T2V (backup)       | ~20s        |

## VAEs
| Modelo   | Archivo                     |
|----------|-----------------------------|
| Wan 2.2  | vae/wan2.2_vae.safetensors  |
| Wan 2.1  | vae/Wan2_1_VAE_bf16.safetensors |

## Text Encoders
| Modelo   | Archivo                                      |
|----------|----------------------------------------------|
| Wan 2.2  | text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors |
| Wan 2.1  | text_encoders/umt5-xxl-enc-fp8_e4m3fn.safetensors |

## Flujo Óptimo para OmniAI-Engine (8GB VRAM)
```
FLUX.1 Schnell → Imagen base (20s)
       ↓
Wan 2.2 TI2V-5B I2V → Video animado (3-5 min)
```

## Params Wan 2.2 5B (RECOMENDADO)
- Resolución: 672x384 (8GB seguro) | 848x480 (límite)
- Frames: 33 (~1.3s) | 49 (~2s)
- FPS: 24
- Steps: 25 | CFG: 5.0 | Scheduler: normal | Sampler: euler

## Params Wan 2.1 1.3B (backup rápido)
- Resolución: 480x256 (rápido) | 640x360 (normal)
- Steps: 4 | CFG: 1.0 | Scheduler: flowmatch_distill
- TeaCache: rel_l1_thresh=0.07, use_coefficients=true
- Frames: 17 (1s) | 33 (2s)

## Params imagen (FLUX.1 Schnell)
steps: 4 | cfg: 1.0 | scheduler: simple | sampler: euler

## Prompts para canales IA/Neurodiversidad
Imagen: "futuristic brain neural connections, glowing, dark bg, purple blue, no text"
Video (I2V): "gentle camera zoom, neural pathways pulsing with light, smooth cinematic motion"
Video (T2V): "abstract neural pathways visualized, glowing synapses, cinematic, no faces"

## API Endpoints
| Endpoint                          | Método | Descripción                        |
|---|---|---|
| /system_stats                     | GET    | Estado del servidor y GPU          |
| /prompt                           | POST   | Enviar workflow para ejecución     |
| /history/{id}                     | GET    | Consultar resultado de un prompt   |
| /view?filename=X&type=output      | GET    | Descargar archivo generado         |
