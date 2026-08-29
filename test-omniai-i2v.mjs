// Test I2V desde OmniAI 
import 'dotenv/config'; 
import { VideoSourceRouter } from './dist/generators/VideoSourceRouter.js'; 
import { ComfyUIClient } from './dist/generators/ComfyUIClient.js'; 
import { ComfyUIHealthMonitor } from './dist/generators/ComfyUIHealthMonitor.js'; 
console.log('Modo generacion:', process.env.COMFYUI_GENERATION_MODE); 
const client = new ComfyUIClient(); 
const monitor = new ComfyUIHealthMonitor(client); 
const router = new VideoSourceRouter({ 
    mode: 'comfyui', 
    comfyClient: client, 
    healthMonitor: monitor 
}); 
console.log('Generando video I2V...'); 
const result = await router.generateVideo({ 
    visualPrompt: 'beautiful sunset over mountains', 
    comfyPrompt: 'A breathtaking sunset over mountain peaks, golden hour lighting, atmospheric clouds, cinematic composition, slow camera movement', 
    videoType: 'short', 
    videoId: 'test-i2v-' + Date.now(), 
    segmentIndex: 0, 
    totalSegments: 1 
}); 
console.log('Resultado:', result); 
