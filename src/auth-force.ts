import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_PATH = path.join(__dirname, '../oauth2.tokens.json');
const keys = JSON.parse(fs.readFileSync(path.join(__dirname, '../oauth2.keys.json'), 'utf8'));
const oAuth2Client = new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
);

const code = process.argv[2];

if (!code) {
    console.error('Please provide a code');
    process.exit(1);
}

oAuth2Client.getToken(code, (err, token) => {
    if (err) {
        console.error('Error retrieving access token:', err);
        return;
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    console.log('Token successfully stored to', TOKEN_PATH);
});
