const fs = require('fs'); const f = 'src/generators/ComfyUIClient.ts'; let c = fs.readFileSync(f,'utf8'); c = c.replace(/sageattn/g,'sdpa'); fs.writeFileSync(f,c); console.log('Fixed'); 
