import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

async function listVoices() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('No GOOGLE_API_KEY found.');
        return;
    }
    const tts = google.texttospeech({ version: 'v1', auth: apiKey });
    try {
        const response = await tts.voices.list();
        const voices = response.data.voices || [];
        
        const esVoices = voices.filter((v: any) => v.languageCodes && v.languageCodes.includes('es-ES'));
        const enVoices = voices.filter((v: any) => v.languageCodes && v.languageCodes.includes('en-US'));
        const ptVoices = voices.filter((v: any) => v.languageCodes && v.languageCodes.includes('pt-BR'));

        console.log('--- VOCES ESPAÑOL (es-ES) Premium (Journey/Neural2/Studio/Wavenet) ---');
        esVoices.forEach((v: any) => {
            if (v.name && !v.name.includes('Standard')) console.log(`${v.name} (${v.ssmlGender})`);
        });

        console.log('\n--- VOCES INGLÉS (en-US) Premium (Journey/Neural2/Studio/Wavenet) ---');
        enVoices.forEach((v: any) => {
             if (v.name && !v.name.includes('Standard')) console.log(`${v.name} (${v.ssmlGender})`);
        });

        console.log('\n--- VOCES PORTUGUÉS (pt-BR) Premium (Journey/Neural2/Studio/Wavenet) ---');
        ptVoices.forEach((v: any) => {
             if (v.name && !v.name.includes('Standard')) console.log(`${v.name} (${v.ssmlGender})`);
        });
        
    } catch (e) {
        console.error(e);
    }
}
listVoices();
