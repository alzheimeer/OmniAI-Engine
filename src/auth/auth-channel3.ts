import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import readline from 'readline';

const CREDENTIALS_PATH = path.join(__dirname, '../../oauth2.keys.json');
const TOKEN_PATH_CHANNEL3 = path.join(__dirname, '../../oauth2.tokens.channel3.json');

async function main() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error(`Error: Keys file not found at ${CREDENTIALS_PATH}`);
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    const oauth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force refresh token prompt
        scope: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
        ],
    });

    console.log('\n======================================================');
    console.log('🚀 AUTORIZACIÓN PARA CANAL #3 (ColombianDreamm)');
    console.log('======================================================\n');
    console.log('1. Abre la siguiente URL en tu navegador:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Inicia sesión y SELECCIONA EL CANAL DE 385 SUBS (ColombianDreamm).');
    console.log('3. Copia el código de autorización que te da la pantalla y pégalo abajo:\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('👉 Pega el código de autorización aquí: ', (code) => {
        rl.close();
        oauth2Client.getToken(code.trim(), (err, token) => {
            if (err) {
                console.error('❌ Error al obtener el token:', err.message);
                process.exit(1);
            }
            if (token) {
                fs.writeFileSync(TOKEN_PATH_CHANNEL3, JSON.stringify(token, null, 2));
                console.log('\n✅ ¡TOKEN DEL CANAL #3 GUARDADO EXITOSAMENTE!');
                console.log(`Archivo: ${TOKEN_PATH_CHANNEL3}`);
                console.log('\n¡El Canal ha quedado 100% conectado! OmniAI-Engine ahora puede publicar allí.');
            }
        });
    });
}

main();
