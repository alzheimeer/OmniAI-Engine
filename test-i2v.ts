/**
 * test-i2v.ts - Prueba de Image-to-Video con Pollinations.ai + ComfyUI
 * 
 * Este script:
 * 1. Genera una imagen con Pollinations.ai (API gratuita)
 * 2. La sube a ComfyUI
 * 3. Usa el modelo Wan 2.2 I2V para animarla
 * 
 * Uso: npx ts-node test-i2v.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

const COMFYUI_URL = 'http://127.0.0.1:8188';

async function testI2V() {
    console.log('🎬 TEST I2V (Image-to-Video)');
    console.log('============================\n');
    
    // 1. Generar imagen con Pollinations.ai
    console.log('1️⃣ Generando imagen con Pollinations.ai...');
    const prompt = 'serene mountain landscape at golden hour, misty valleys, dramatic clouds, cinematic composition, 4k, high detail, professional photography';
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=576&height=1024&enhance=true`;
    
    console.log('   Prompt:', prompt.substring(0, 60) + '...');
    console.log('   Descargando imagen...');
    
    const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 120000
    });
    
    const imageDir = path.join(process.cwd(), 'content', 'test_i2v');
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }
    
    const imagePath = path.join(imageDir, 'input_image.png');
    fs.writeFileSync(imagePath, imageResponse.data);
    console.log('   ✅ Imagen guardada:', imagePath);
    console.log('   Tamaño:', Math.round(imageResponse.data.length / 1024), 'KB\n');
    
    // 2. Verificar ComfyUI disponible
    console.log('2️⃣ Verificando ComfyUI...');
    try {
        const statsRes = await axios.get(`${COMFYUI_URL}/system_stats`);
        console.log('   GPU:', statsRes.data.devices[0].name);
        console.log('   VRAM libre:', Math.round(statsRes.data.devices[0].vram_free / 1024 / 1024 / 1024 * 10) / 10, 'GB\n');
    } catch (err) {
        console.error('   ❌ ComfyUI no está disponible en', COMFYUI_URL);
        process.exit(1);
    }
    
    // 3. Subir imagen a ComfyUI
    console.log('3️⃣ Subiendo imagen a ComfyUI...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath), {
        filename: 'i2v_input_' + Date.now() + '.png',
        contentType: 'image/png'
    });
    
    const uploadRes = await axios.post(`${COMFYUI_URL}/upload/image`, formData, {
        headers: formData.getHeaders()
    });
    console.log('   ✅ Imagen subida:', JSON.stringify(uploadRes.data));
    const uploadedImageName = uploadRes.data.name;
    
    // 4. Crear workflow I2V
    console.log('\n4️⃣ Enviando workflow I2V a ComfyUI...');
    
    const workflow: Record<string, any> = {
        '1': {
            class_type: 'UNETLoader',
            inputs: {
                unet_name: 'wan2.2_ti2v_5B_fp16.safetensors',
                weight_dtype: 'default'
            }
        },
        '2': {
            class_type: 'CLIPLoader', 
            inputs: {
                clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
                type: 'wan'
            }
        },
        '3': {
            class_type: 'VAELoader',
            inputs: {
                vae_name: 'wan2.2_vae.safetensors'
            }
        },
        '4': {
            class_type: 'LoadImage',
            inputs: {
                image: uploadedImageName
            }
        },
        '5': {
            class_type: 'CLIPTextEncode',
            inputs: {
                clip: ['2', 0],
                text: 'cinematic slow camera movement, clouds drifting slowly, mist rolling through valley, golden sunlight rays, peaceful atmosphere, high quality, smooth motion, seamless loop'
            }
        },
        '6': {
            class_type: 'CLIPTextEncode',
            inputs: {
                clip: ['2', 0],
                text: 'blurry, low quality, distorted, text, watermark, ugly, deformed, shaky camera, fast movement, jittery'
            }
        },
        '7': {
            class_type: 'WanImageToVideo',
            inputs: {
                positive: ['5', 0],
                negative: ['6', 0],
                vae: ['3', 0],
                image: ['4', 0],
                width: 576,
                height: 1024,
                length: 33,  // ~1.4 segundos a 24fps
                batch_size: 1
            }
        },
        '8': {
            class_type: 'KSampler',
            inputs: {
                model: ['1', 0],
                positive: ['7', 0],
                negative: ['7', 1],
                latent_image: ['7', 2],
                seed: Math.floor(Math.random() * 1000000),
                steps: 20,
                cfg: 5.0,
                sampler_name: 'euler',
                scheduler: 'normal',
                denoise: 1.0
            }
        },
        '9': {
            class_type: 'VAEDecode',
            inputs: {
                samples: ['8', 0],
                vae: ['3', 0]
            }
        },
        '10': {
            class_type: 'SaveAnimatedWEBP',
            inputs: {
                images: ['9', 0],
                filename_prefix: 'i2v_test_' + Date.now(),
                fps: 24.0,
                lossless: false,
                quality: 85,
                method: 'default'
            }
        }
    };
    
    const clientId = 'omniai_i2v_test_' + Date.now();
    const promptPayload = {
        prompt: workflow,
        client_id: clientId
    };
    
    const queueRes = await axios.post(`${COMFYUI_URL}/prompt`, promptPayload);
    console.log('   ✅ Workflow enviado!');
    console.log('   Prompt ID:', queueRes.data.prompt_id);
    console.log('   Client ID:', clientId);
    
    console.log('\n🎉 I2V iniciado! El video se generará en ~10-15 minutos.');
    console.log('   Puedes ver el progreso en: http://127.0.0.1:8188/');
    console.log('   El video se guardará en: D:\\ComfyUI\\output\\');
    console.log('\n   Para verificar el estado:');
    console.log('   curl http://127.0.0.1:8188/queue');
}

testI2V().catch(err => {
    console.error('❌ Error:', err.message);
    if (err.response) {
        console.error('   Response:', err.response.data);
    }
    process.exit(1);
});
