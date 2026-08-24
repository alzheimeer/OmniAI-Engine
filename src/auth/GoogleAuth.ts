import fs from 'fs';
import path from 'path';
import { google, Auth } from 'googleapis';
import readline from 'readline';

const CREDENTIALS_PATH = path.join(__dirname, '../../oauth2.keys.json');
const TOKEN_PATH = path.join(__dirname, '../../oauth2.tokens.json');

export class GoogleAuth {
    private static oauth2Client: Auth.OAuth2Client | null = null;

    /**
     * Initializes the OAuth2 Client and retrieves tokens.
     * @param tokenFilePath Optional path to token file. Defaults to oauth2.tokens.json (Channel 1).
     */
    public static async getClient(tokenFilePath?: string): Promise<Auth.OAuth2Client> {
        const targetTokenPath = tokenFilePath || TOKEN_PATH;

        // Load client secrets from a local file.
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}`);
        }

        const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed;

        const oauthClient = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]
        );

        // Check if we have previously stored a token.
        if (fs.existsSync(targetTokenPath)) {
            const tokenContent = fs.readFileSync(targetTokenPath, 'utf-8');
            const tokens = JSON.parse(tokenContent);
            oauthClient.setCredentials(tokens);
            
            // Check if access_token is expired and refresh if needed
            const now = Date.now();
            const expiryDate = tokens.expiry_date || 0;
            const isExpired = now >= expiryDate - 60000; // 1 minute buffer
            
            if (isExpired && tokens.refresh_token) {
                console.log(`[GoogleAuth] Access token expired for ${path.basename(targetTokenPath)}, refreshing...`);
                try {
                    const { credentials: newTokens } = await oauthClient.refreshAccessToken();
                    const updatedTokens = {
                        ...tokens,
                        ...newTokens,
                        refresh_token: newTokens.refresh_token || tokens.refresh_token
                    };
                    fs.writeFileSync(targetTokenPath, JSON.stringify(updatedTokens, null, 2));
                    oauthClient.setCredentials(updatedTokens);
                    console.log(`[GoogleAuth] Token refreshed for ${path.basename(targetTokenPath)}.`);
                } catch (refreshError: any) {
                    console.error(`[GoogleAuth] Failed to refresh token for ${path.basename(targetTokenPath)}:`, refreshError.message);
                    throw new Error(`Token refresh failed: ${refreshError.message}`);
                }
            }
        }

        oauthClient.on('tokens', (tokens) => {
            const currentTokens = fs.existsSync(targetTokenPath) ? JSON.parse(fs.readFileSync(targetTokenPath, 'utf-8')) : {};
            const updatedTokens = { 
                ...currentTokens, 
                ...tokens,
                refresh_token: tokens.refresh_token || currentTokens.refresh_token
            };
            fs.writeFileSync(targetTokenPath, JSON.stringify(updatedTokens, null, 2));
        });

        return oauthClient;
    }

    private static getNewToken(oAuth2Client: Auth.OAuth2Client): Promise<void> {
        return new Promise((resolve, reject) => {
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline', // Requests a refresh token
                prompt: 'select_account',
                scope: [
                    'https://www.googleapis.com/auth/youtube.upload', // For YouTube Upload
                    'https://www.googleapis.com/auth/youtube.readonly'
                ],
            });
            console.log('--- ACTION REQUIRED ---');
            console.log('Authorize this app by visiting this URL:');
            console.log(authUrl);
            console.log('-----------------------');

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            rl.question('Enter the code from that page here: ', (code) => {
                rl.close();
                oAuth2Client.getToken(code, (err, token) => {
                    if (err) {
                        console.error('Error retrieving access token', err);
                        return reject(err);
                    }
                    if (token) {
                        oAuth2Client.setCredentials(token);
                        // Store the token to disk for later program executions
                        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
                        console.log('Token stored to', TOKEN_PATH);
                        resolve();
                    }
                });
            });
        });
    }
}
