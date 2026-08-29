// Test I2V SIN health monitor 
import 'dotenv/config'; 
import { ComfyUIClient } from './dist/generators/ComfyUIClient.js'; 
import { ImageGeneratorRouter } from './dist/generators/ImageGeneratorRouter.js'; 
const client = new ComfyUIClient(); 
const imageRouter = new ImageGeneratorRouter(); 
console.log('1. Verificando ComfyUI...'); 
const available = await client.isAvailable(); 
console.log('ComfyUI disponible:', available); 
if (!available) { console.log('ComfyUI no disponible'); process.exit(1); } 
