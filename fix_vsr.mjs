import fs from 'fs'; 
const filePath = 'c:/Users/fogni/OneDrive/Escritorio/proyecto1a/OmniAI-Engine/src/generators/VideoSourceRouter.ts'; 
let c = fs.readFileSync(filePath, 'utf8'); 
c = c.replace('}, this.comfyTimeoutMs);\n        } \n        } else {', '}, this.comfyTimeoutMs);\n        } else {'); 
c = c.replace('}, this.comfyTimeoutMs);\n\n        const', '}, this.comfyTimeoutMs);\n        }\n\n        const'); 
fs.writeFileSync(filePath, c); 
console.log('Fix aplicado'); 
