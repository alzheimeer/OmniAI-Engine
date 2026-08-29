import 'dotenv/config';
import { ComfyUIClient } from './dist/generators/ComfyUIClient.js';
import { ImageGeneratorRouter } from './dist/generators/ImageGeneratorRouter.js';

const client = new ComfyUIClient();
const imageRouter = new ImageGeneratorRouter();

console.log('1. Verificando ComfyUI...');
const available = await client.isAvailable();
console.log('ComfyUI disponible:', available);
if (!available) process.exit(1);

console.log('2. Generando imagen 320x576...');
const imageResult = await imageRouter.generateImage({
    prompt: 'Beautiful mountain sunset, golden hour, cinematic',
    orientation: 'portrait',
    width: 256,
    height: 448
});
console.log('Imagen generada:', imageResult.imagePath);

console.log('3. Generando video I2V...');
const result = await client.generateI2V({
    prompt: 'Beautiful mountain sunset with clouds moving slowly',
    negativePrompt: 'blurry, low quality',
    inputImage: imageResult.imagePath,
    orientation: 'portrait'
}, 30 * 60 * 1000);

console.log('Video generado:', result);
