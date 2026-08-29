const fs = require('fs'); 
const code = fs.readFileSync('./new_method_src.txt', 'utf8'); 
fs.writeFileSync('./new_method.b64', Buffer.from(code).toString('base64')); 
console.log('B64 generado'); 
