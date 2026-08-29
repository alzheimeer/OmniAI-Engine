import fs from 'fs'; 
const p = 'c:/Users/fogni/OneDrive/Escritorio/proyecto1a/OmniAI-Engine/src/generators/VideoSourceRouter.ts'; 
let c = fs.readFileSync(p, 'utf8'); 
c = c.replace('        } \n        } else {', '        } else {'); 
c = c.replace('        }, this.comfyTimeoutMs);\n\n        const generationTimeMs', '        }, this.comfyTimeoutMs);\n        }\n\n        const generationTimeMs'); 
fs.writeFileSync(p, c); console.log('OK'); 
