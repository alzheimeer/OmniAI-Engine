// Test script para generar thumbnail de prueba
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function generateTestThumbnail() {
    console.log('🖼️ Test de generación de Thumbnail...\n');
    
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
        console.error('❌ PEXELS_API_KEY no está configurada en .env');
        process.exit(1);
    }

    // Configuración de prueba
    const testConfigs = [
        {
            title: "Por qué el AUTISMO es una VENTAJA en la IA",
            isShort: false,
            visualPrompt: "artificial intelligence brain",
            outputFilename: "test-thumbnail-largo.jpg"
        },
        {
            title: "ChatGPT para personas con TDAH",
            isShort: true,
            visualPrompt: "technology coding",
            outputFilename: "test-thumbnail-short.jpg"
        }
    ];

    for (const config of testConfigs) {
        console.log(`\n📝 Generando: ${config.title}`);
        console.log(`   Tipo: ${config.isShort ? 'Short (1080x1920)' : 'Largo (1280x720)'}`);
        
        const width = config.isShort ? 1080 : 1280;
        const height = config.isShort ? 1920 : 720;
        const outputPath = path.join(__dirname, 'content', config.outputFilename);

        let backgroundImageUrl = '';

        // 1. Buscar imagen en Pexels
        try {
            console.log(`   🔍 Buscando en Pexels: "${config.visualPrompt}"...`);
            const orientation = config.isShort ? 'portrait' : 'landscape';
            
            const response = await axios.get(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(config.visualPrompt)}&orientation=${orientation}&per_page=5`,
                { headers: { Authorization: apiKey } }
            );

            if (response.data.photos && response.data.photos.length > 0) {
                const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.photos.length));
                const photo = response.data.photos[randomIndex];
                backgroundImageUrl = photo.src.large2x || photo.src.large;
                console.log(`   ✅ Imagen encontrada: ID ${photo.id} por ${photo.photographer}`);
            }
        } catch (error) {
            console.log(`   ⚠️ Error Pexels: ${error.message}, usando gradiente`);
        }

        // 2. Generar thumbnail con Puppeteer
        const fontSize = width > height ? 64 : 72;
        const escapedTitle = escapeHtml(config.title);
        
        const backgroundStyle = backgroundImageUrl
            ? `background-image: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url('${backgroundImageUrl}'); background-size: cover; background-position: center;`
            : `background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap');
                
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    width: ${width}px;
                    height: ${height}px;
                    ${backgroundStyle}
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }
                
                .title-container {
                    padding: 40px;
                    text-align: center;
                    max-width: 90%;
                }
                
                .title {
                    font-family: 'Montserrat', 'Arial Black', Arial, sans-serif;
                    font-size: ${fontSize}px;
                    font-weight: 900;
                    color: white;
                    text-transform: uppercase;
                    line-height: 1.2;
                    text-shadow: 
                        3px 3px 0 #000,
                        -3px -3px 0 #000,
                        3px -3px 0 #000,
                        -3px 3px 0 #000,
                        0 5px 10px rgba(0,0,0,0.8);
                    letter-spacing: 2px;
                }
                
                .highlight {
                    color: #00d4ff;
                    text-shadow: 
                        3px 3px 0 #000,
                        -3px -3px 0 #000,
                        3px -3px 0 #000,
                        -3px 3px 0 #000,
                        0 0 30px rgba(0,212,255,0.5);
                }
                
                .brand {
                    position: absolute;
                    bottom: 30px;
                    right: 40px;
                    font-family: 'Montserrat', Arial, sans-serif;
                    font-size: 24px;
                    font-weight: 900;
                    color: #00d4ff;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
                }
            </style>
        </head>
        <body>
            <div class="title-container">
                <div class="title">${highlightKeywords(escapedTitle)}</div>
            </div>
            <div class="brand">NeuroSync AI</div>
        </body>
        </html>
        `;

        console.log(`   🚀 Iniciando Puppeteer...`);
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Esperar a que carguen las fuentes
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await page.screenshot({
                path: outputPath,
                type: 'jpeg',
                quality: 90
            });
            
            const stats = fs.statSync(outputPath);
            console.log(`   ✅ Thumbnail guardado: ${outputPath}`);
            console.log(`   📊 Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
            console.log(`   📐 Dimensiones: ${width}x${height}`);
        } finally {
            await browser.close();
        }
    }

    console.log('\n✅ Test completado! Revisa los archivos en OmniAI-Engine/content/');
    console.log('   - test-thumbnail-largo.jpg (1280x720)');
    console.log('   - test-thumbnail-short.jpg (1080x1920)');
}

function highlightKeywords(title) {
    const keywords = ['IA', 'AI', 'AUTISMO', 'AUTISM', 'TDAH', 'ADHD', 'CEREBRO', 'BRAIN', 'FUTURO', 'FUTURE', 'CHATGPT'];
    let result = title.toUpperCase();
    
    for (const keyword of keywords) {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
        result = result.replace(regex, '<span class="highlight">$1</span>');
    }
    
    return result;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

generateTestThumbnail().catch(console.error);
