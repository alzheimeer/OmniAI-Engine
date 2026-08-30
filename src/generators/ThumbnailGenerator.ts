import fs from 'fs';
import path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

export interface ThumbnailConfig {
    title: string;
    isShort: boolean;
    visualPrompt?: string;
    outputFilename: string;
    channelKey?: 'channel1' | 'channel2';
    channelName?: string;
}

export class ThumbnailGenerator {
    
    /**
     * Construye un prompt estructurado siguiendo las mejores prácticas de 
     * Prompt Engineering para Thumbnails 2026 (alto contraste, diferenciación, sin texto).
     */
    public static buildAIPrompt(title: string, visualPrompt?: string, isShort: boolean = true): string {
        const theme = visualPrompt || title || 'autism and artificial intelligence technology';
        const resolution = isShort ? '1080x1920 vertical' : '1280x720 landscape';

        return [
            `YouTube thumbnail background, ${resolution}:`,
            `- TEMA: ${theme}`,
            `- ESTILO: Fotografía macro de circuito neural con luz cyan bioluminiscente y tecnología futurista`,
            `- COMPOSICIÓN: Rule of thirds, espacio negativo 40% para texto, punto focal único y nítido`,
            `- ILUMINACIÓN: Contraste dramático, rim light cyan brillante, sombras profundas`,
            `- MOOD: Futurista, accesible, impactante, profesional`,
            `- COLORES: Negro #0a0a0a, Cyan neón #00d4ff, Azul profundo #0f172a, Blanco #ffffff`,
            `- EVITAR: Rostros genéricos, flechas rojas, texto escrito, letras, marcas de agua, baja calidad`
        ].join('\n');
    }

    /**
     * Genera una miniatura personalizada de alto impacto (CTR) para YouTube
     * utilizando IA (Google Gemini / Imagen / Flux) + renderizado HTML/CSS vía Puppeteer.
     * @param config Configuración de la miniatura
     * @returns Ruta del archivo generado
     */
    public static async generateThumbnail(config: ThumbnailConfig): Promise<string> {
        console.log(`🖼️ ThumbnailGenerator: Creando thumbnail de alto impacto para "${config.title}"...`);
        
        const contentDir = path.join(__dirname, '../../content');
        if (!fs.existsSync(contentDir)) {
            fs.mkdirSync(contentDir, { recursive: true });
        }
        const outputPath = path.join(contentDir, config.outputFilename);
        
        const width = config.isShort ? 1080 : 1280;
        const height = config.isShort ? 1920 : 720;
        const brandName = config.channelKey === 'channel2' || config.channelName?.includes('NeuroTech') 
            ? 'NeuroTech AI' 
            : 'NeuroSync AI';

        let backgroundDataUrl = '';

        // 1. Intentar generar fondo con Google Gemini / Imagen 3 API
        const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        if (googleKey) {
            try {
                const prompt = this.buildAIPrompt(config.title, config.visualPrompt, config.isShort);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${googleKey}`;
                const response = await axios.post(url, {
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: config.isShort ? '9:16' : '16:9',
                        outputMimeType: 'image/jpeg'
                    }
                }, { timeout: 15000 });

                const b64 = response.data?.predictions?.[0]?.bytesBase64Encoded;
                if (b64) {
                    backgroundDataUrl = `data:image/jpeg;base64,${b64}`;
                    console.log(`🤖 Background generado con éxito mediante Google Imagen 3!`);
                }
            } catch (googleErr: any) {
                // Silencioso: fallback a Flux/Pollinations
            }
        }

        // 2. Si Google API no está activa, usar Flux AI (100% gratuito, ilimitado y de máxima calidad)
        if (!backgroundDataUrl) {
            try {
                const prompt = this.buildAIPrompt(config.title, config.visualPrompt, config.isShort);
                const seed = Math.floor(Math.random() * 999999);
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;
                
                console.log(`🎨 Generando fondo visual único con Flux AI...`);
                const response = await axios.get(pollinationsUrl, { 
                    responseType: 'arraybuffer', 
                    timeout: 35000 
                });

                if (response.data && response.data.length > 0) {
                    const b64 = Buffer.from(response.data).toString('base64');
                    backgroundDataUrl = `data:image/jpeg;base64,${b64}`;
                    console.log(`✅ Background generado exitosamente con Flux AI (${response.data.length} bytes)`);
                }
            } catch (fluxErr: any) {
                console.log(`⚠️ Flux AI no disponible (${fluxErr.message}), probando Pexels API...`);
            }
        }

        // 3. Fallback a Pexels API si las IAs no responden
        if (!backgroundDataUrl) {
            const apiKey = process.env.PEXELS_API_KEY;
            if (apiKey) {
                try {
                    const searchQuery = config.visualPrompt || 'artificial intelligence brain technology';
                    const orientation = config.isShort ? 'portrait' : 'landscape';
                    const pexelsRes = await axios.get(
                        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&orientation=${orientation}&per_page=5`,
                        { headers: { Authorization: apiKey }, timeout: 10000 }
                    );

                    if (pexelsRes.data.photos && pexelsRes.data.photos.length > 0) {
                        const photo = pexelsRes.data.photos[0];
                        backgroundDataUrl = photo.src.large2x || photo.src.large;
                        console.log(`📷 Background obtenido de Pexels (ID: ${photo.id})`);
                    }
                } catch (pexelsErr: any) {
                    console.log(`⚠️ Pexels error: ${pexelsErr.message}`);
                }
            }
        }

        // 4. Renderizado HTML/CSS de alto impacto con Puppeteer
        await this.renderThumbnailWithPuppeteer(
            outputPath,
            width,
            height,
            config.title,
            backgroundDataUrl,
            brandName,
            config.isShort
        );
        
        console.log(`✅ ThumbnailGenerator: Miniatura guardada en ${outputPath}`);
        return outputPath;
    }

    /**
     * Renderiza la plantilla HTML de alta conversión usando Puppeteer
     */
    private static async renderThumbnailWithPuppeteer(
        outputPath: string,
        width: number,
        height: number,
        title: string,
        backgroundImageUrl: string,
        brandName: string,
        isShort: boolean
    ): Promise<void> {
        
        const fontSize = isShort ? 74 : 68;
        const escapedTitle = this.escapeHtml(title);
        const highlightedTitle = this.highlightKeywords(escapedTitle);
        
        const backgroundStyle = backgroundImageUrl
            ? `background-image: linear-gradient(180deg, rgba(5,10,25,0.75) 0%, rgba(5,10,25,0.15) 45%, rgba(5,10,25,0.85) 100%), url('${backgroundImageUrl}'); background-size: cover; background-position: center;`
            : `background: linear-gradient(135deg, #0a0e1a 0%, #061126 50%, #031b33 100%);`;

        const containerPadding = isShort ? 'padding-top: 240px;' : 'padding: 60px 80px; justify-content: center;';
        const cardMaxWidth = isShort ? 'max-width: 90%;' : 'max-width: 820px;';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    width: ${width}px;
                    height: ${height}px;
                    ${backgroundStyle}
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    ${containerPadding}
                    overflow: hidden;
                }
                
                .title-card {
                    background: rgba(8, 14, 28, 0.86);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 3px solid #00d4ff;
                    border-radius: 28px;
                    padding: ${isShort ? '42px 34px' : '36px 48px'};
                    ${cardMaxWidth}
                    text-align: center;
                    box-shadow: 0 25px 60px rgba(0,0,0,0.92), 0 0 45px rgba(0,212,255,0.4);
                }
                
                .badge {
                    display: inline-block;
                    background: #00d4ff;
                    color: #050b14;
                    font-family: 'Montserrat', sans-serif;
                    font-size: ${isShort ? '26px' : '22px'};
                    font-weight: 900;
                    padding: 8px 24px;
                    border-radius: 10px;
                    margin-bottom: 22px;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                }
                
                .title {
                    font-family: 'Montserrat', 'Arial Black', Arial, sans-serif;
                    font-size: ${fontSize}px;
                    font-weight: 900;
                    color: #ffffff;
                    text-transform: uppercase;
                    line-height: 1.16;
                    letter-spacing: 1.5px;
                    text-shadow: 0 4px 14px rgba(0,0,0,0.95);
                }
                
                .highlight {
                    color: #00d4ff;
                    text-shadow: 0 0 30px rgba(0, 212, 255, 0.85);
                }
                
                .brand {
                    position: absolute;
                    bottom: ${isShort ? '45px' : '30px'};
                    ${isShort ? 'left: 50%; transform: translateX(-50%);' : 'right: 50px;'}
                    font-family: 'Montserrat', sans-serif;
                    font-size: ${isShort ? '28px' : '24px'};
                    font-weight: 900;
                    color: #00d4ff;
                    letter-spacing: 3px;
                    text-shadow: 0 3px 10px rgba(0,0,0,0.95);
                }
            </style>
        </head>
        <body>
            <div class="title-card">
                <div class="badge">NUEVA IA</div>
                <div class="title">${highlightedTitle}</div>
            </div>
            <div class="brand">${brandName.toUpperCase()}</div>
        </body>
        </html>
        `;

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 800));
            
            await page.screenshot({
                path: outputPath,
                type: 'jpeg',
                quality: 95
            });
        } finally {
            await browser.close();
        }
    }

    /**
     * Resalta palabras clave con color neón Cyan #00d4ff
     */
    private static highlightKeywords(title: string): string {
        const keywords = [
            'IA', 'AI', 'AUTISMO', 'AUTISTA', 'AUTISTAS', 'TDAH', 'ADHD', 
            'CEREBRO', 'BRAIN', 'FUTURO', 'FUTURE', 'CHATGPT', 'CLAUDE',
            'CRISIS', 'PREDICE', 'SECRETO', 'REVOLUCIÓN', 'GUÍA', 'MÉTODO', '7 DÍAS'
        ];
        let result = title.toUpperCase();
        
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
            result = result.replace(regex, '<span class="highlight">$1</span>');
        }
        
        return result;
    }

    /**
     * Escapa caracteres especiales de HTML
     */
    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
