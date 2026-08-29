const fs=require('fs');const b=fs.readFileSync('./test-gguf.b64','utf8').trim();fs.writeFileSync('./test-wan22-gguf-i2v.mjs',Buffer.from(b,'base64').toString());console.log('OK')
