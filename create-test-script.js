const fs=require('fs');const code=`// Test Wan 2.2 GGUF I2V
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const COMFYUI_URL='http://127.0.0.1:8188';
console.log('Test GGUF script cargado correctamente');
`;fs.writeFileSync('./test-wan22-gguf-i2v.mjs',code);console.log('Script creado');