// Test de autenticación de YouTube para verificar que el refresh token funciona
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'oauth2.keys.json');
const TOKEN_PATH = path.join(__dirname, 'oauth2.tokens.json');

async function testAuth() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   🔑 TEST DE AUTENTICACIÓN YOUTUBE');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // 1. Verificar archivos
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('❌ oauth2.keys.json NO encontrado');
        return;
    }
    console.log('✅ oauth2.keys.json encontrado');
    
    if (!fs.existsSync(TOKEN_PATH)) {
        console.log('❌ oauth2.tokens.json NO encontrado');
        return;
    }
    console.log('✅ oauth2.tokens.json encontrado\n');
    
    // 2. Leer tokens actuales
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    console.log('📋 Tokens actuales:');
    console.log('   - access_token:', tokens.access_token?.substring(0, 30) + '...');
    console.log('   - refresh_token:', tokens.refresh_token ? '✅ PRESENTE' : '❌ FALTA');
    console.log('   - expiry_date:', new Date(tokens.expiry_date).toISOString());
    console.log('   - ¿Expirado?:', Date.now() >= tokens.expiry_date ? '⚠️ SÍ' : '✅ NO');
    console.log();
    
    // 3. Crear cliente OAuth
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oauth2Client.setCredentials(tokens);
    
    // 4. Si está expirado, intentar refresh
    if (Date.now() >= tokens.expiry_date - 60000) {
        console.log('🔄 Intentando refresh del token...');
        try {
            const { credentials: newTokens } = await oauth2Client.refreshAccessToken();
            const updatedTokens = {
                ...tokens,
                ...newTokens,
                refresh_token: newTokens.refresh_token || tokens.refresh_token
            };
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(updatedTokens));
            oauth2Client.setCredentials(updatedTokens);
            console.log('✅ Token refrescado exitosamente!');
            console.log('   - Nuevo expiry:', new Date(updatedTokens.expiry_date).toISOString());
        } catch (err) {
            console.log('❌ Error al refrescar:', err.message);
            return;
        }
    }
    
    // 5. Probar API de YouTube
    console.log('\n🎬 Probando conexión a YouTube API...');
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    try {
        const response = await youtube.channels.list({
            part: ['snippet', 'statistics'],
            mine: true
        });
        
        const channel = response.data.items?.[0];
        if (channel) {
            console.log('✅ Conexión exitosa!');
            console.log('   - Canal:', channel.snippet?.title);
            console.log('   - Suscriptores:', channel.statistics?.subscriberCount);
            console.log('   - Videos:', channel.statistics?.videoCount);
            console.log('   - Vistas totales:', channel.statistics?.viewCount);
        } else {
            console.log('⚠️ No se encontró canal asociado');
        }
    } catch (err) {
        console.log('❌ Error al conectar con YouTube:', err.message);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
}

testAuth().catch(console.error);
