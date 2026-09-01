const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.resolve('./oauth2.keys.json');
const TOKEN_PATH_CHANNEL3 = path.resolve('./oauth2.tokens.channel3.json');

async function main() {
    const code = '4/0ATsMZqAG0ZWFAOQBQ3MbsbSopnahAxJe8c4-yw3Ttnd-GIm2gQEqrYUaNluqvVNhsel8rg';
    
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    const oauth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]
    );

    try {
        const { tokens } = await oauth2Client.getToken(code);
        fs.writeFileSync(TOKEN_PATH_CHANNEL3, JSON.stringify(tokens, null, 2));
        console.log('✅ Token successfully generated and saved to oauth2.tokens.channel3.json');
    } catch (e) {
        console.error('Error exchanging code:', e.message);
    }
}
main();
