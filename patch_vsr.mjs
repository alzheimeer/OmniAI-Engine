import fs from 'fs'; 
const filePath = 'c:/Users/fogni/OneDrive/Escritorio/proyecto1a/OmniAI-Engine/src/generators/VideoSourceRouter.ts'; 
let content = fs.readFileSync(filePath, 'utf8'); 
const oldCode = "const result = await this.comfyClient.generateT2V({"; 
const newCode = `// Verificar modo de generacion (T2V o I2V) 
        const generationMode = process.env.COMFYUI_GENERATION_MODE?.toLowerCase(); 
        let result; 
        if (generationMode === 'i2v') { 
            // Modo I2V: Generar imagen con Pollinations y luego animarla 
            console.log('[VideoSourceRouter] Usando modo I2V (Image-to-Video)'); 
            const { ImageGeneratorRouter } = await import('./ImageGeneratorRouter.js'); 
            const imageRouter = new ImageGeneratorRouter(); 
            const imageResult = await imageRouter.generateImage({ 
                prompt, 
                orientation: request.videoType === 'short' ? 'portrait' : 'landscape' 
            }); 
            result = await this.comfyClient.generateI2V({ 
                prompt, 
                negativePrompt: 'blurry, low quality, distorted, text, watermark, ugly, deformed', 
                width: resolution.width, 
                height: resolution.height, 
                frames, 
                inputImage: imageResult.imagePath, 
                orientation: request.videoType === 'short' ? 'portrait' : 'landscape' 
            }, this.comfyTimeoutMs); 
        } else { 
            // Modo T2V: Generacion directa de texto a video 
            result = await this.comfyClient.generateT2V({`; 
content = content.replace(oldCode, newCode); 
const oldClose = "}, this.comfyTimeoutMs);"; 
const newClose = "}, this.comfyTimeoutMs);\n        }"; 
content = content.replace(oldClose, newClose); 
fs.writeFileSync(filePath, content); 
console.log('VideoSourceRouter editado para soportar I2V'); 
