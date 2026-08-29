import fs from 'fs'; 
const p = 'c:/Users/fogni/OneDrive/Escritorio/proyecto1a/OmniAI-Engine/src/generators/VideoSourceRouter.ts'; 
let c = fs.readFileSync(p, 'utf8'); 
const old = 'result = await this.comfyClient.generateT2V({\n            prompt,'; 
const nu = 'result = await this.comfyClient.generateT2V({\n                prompt,'; 
c = c.replace(old, nu); 
fs.writeFileSync(p, c); console.log('OK'); 
