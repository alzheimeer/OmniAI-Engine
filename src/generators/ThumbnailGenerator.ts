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
    channelKey?: 'channel1' | 'channel2' | 'channel3';
    channelName?: string;
}

export class ThumbnailGenerator {
    
    /**
     * Simple hash function to consistently pick a style based on title
     */
    private static getStyleIndex(title: string, max: number): number {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % max;
    }

    /**
     * Construye un prompt estructurado siguiendo las mejores prácticas de 
     * Prompt Engineering para Thumbnails 2026 (alto contraste, diferenciación, sin texto).
     */
    public static buildAIPrompt(title: string, visualPrompt?: string, isShort: boolean = true, channelKey?: string): string {
        const theme = visualPrompt || title || 'artificial intelligence technology';
        
        let subjectStyle = '';
        let lightingStyle = '';
        
        if (channelKey === 'channel3') {
            const styles = [
                { s: `${theme}, hyper-realistic, dramatic cinematic scene, NO cyborgs, NO robots, movie poster style`, l: `Ultra dramatic lighting, deep shadows, neon accents, high contrast` },
                { s: `${theme}, vintage documentary style, gritty texture, retro mystery, NO cyborgs`, l: `Sepia tones with vibrant red accents, dramatic side lighting` },
                { s: `${theme}, surreal ethereal dreamscape, impossible geometry, NO cyborgs`, l: `Glowing ethereal lighting, mysterious fog, soft diffuse light` },
                { s: `${theme}, extreme close-up macro photography, high detail, NO cyborgs`, l: `Shallow depth of field, neon rim lighting, deep black shadows` },
                { s: `${theme}, supernatural vibrant glow, otherworldly atmosphere, NO cyborgs`, l: `High contrast, vivid colors, magical luminescent glow` }
            ];
            const selected = styles[this.getStyleIndex(title, styles.length)];
            subjectStyle = selected.s;
            lightingStyle = selected.l;
        } else if (channelKey === 'channel2' || channelKey === 'channel1') {
            const styles = [
                { s: `${theme}, clean minimalist 3d render, glossy finish`, l: `Soft white and light blue studio lighting` },
                { s: `${theme}, cyberpunk sleek productivity tech, glowing neural AI interface`, l: `High-contrast dramatic cinematic lighting, glowing neon cyan and purple accents, deep black shadows` },
                { s: `${theme}, abstract geometric shapes, glassmorphism, corporate tech`, l: `Bright optimistic lighting, clear reflections` },
                { s: `${theme}, glowing holographic projection, futuristic interface, wireframe accents`, l: `Dark background, bright neon blue holograms` },
                { s: `${theme}, 3d claymation cute UI style, trendy tech`, l: `Pastel colors, soft isometric lighting` }
            ];
            const selected = styles[this.getStyleIndex(title, styles.length)];
            subjectStyle = selected.s;
            lightingStyle = selected.l;
        } else {
            subjectStyle = `${theme}, clean clinical medical illustration style, modern science, bright and optimistic`;
            lightingStyle = `Bright studio lighting, soft glowing white and light blue accents, clean light background`;
        }
        
        if (isShort) {
            // Formato Vertical (Shorts 9:16)
            return [
                `Vertical YouTube Short thumbnail background (1080x1920):`,
                `- SUBJECT: ${subjectStyle}`,
                `- COMPOSITION: Vertical portrait, focal subject centered in middle-lower third, clean space at top for title`,
                `- LIGHTING: ${lightingStyle}`,
                `- STYLE: 8k resolution, cinematic Octane render, highly detailed, photorealistic concept art`,
                `- NEGATIVE: No text, no letters, no words, no arrows, no watermarks, no blurry artifacts`
            ].join('\n');
        } else {
            // Formato Horizontal (Videos Largos 16:9)
            return [
                `Horizontal YouTube video thumbnail background (1280x720, 16:9):`,
                `- SUBJECT: ${subjectStyle}`,
                `- COMPOSITION: Rule of thirds, strong focal point on the RIGHT side, empty negative space on the LEFT 50% for text`,
                `- LIGHTING: ${lightingStyle}`,
                `- STYLE: 8k Unreal Engine 5 render, cinematic movie poster style, sharp focus`,
                `- NEGATIVE: No text, no letters, no words, no signs, no logos, no watermark, no blurred low-res`
            ].join('\n');
        }
    }

    /**
     * Obtiene una imagen de fondo de alta calidad usando Google Imagen / Flux AI / Pollinations / Pexels
     */
    public static async fetchBackgroundImage(
        title: string, 
        visualPrompt: string | undefined, 
        isShort: boolean, 
        width: number, 
        height: number,
        channelKey?: string
    ): Promise<string> {
        const prompt = this.buildAIPrompt(title, visualPrompt, isShort, channelKey);

        // 1. Google Gemini / Imagen 3
        const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        if (googleKey) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${googleKey}`;
                const response = await axios.post(url, {
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: isShort ? '9:16' : '16:9',
                        outputMimeType: 'image/jpeg'
                    }
                }, { timeout: 15000 });

                const b64 = response.data?.predictions?.[0]?.bytesBase64Encoded;
                if (b64) {
                    console.log(`🤖 Background generado con Google Imagen 3!`);
                    return `data:image/jpeg;base64,${b64}`;
                }
            } catch (err) {
                // Continuar al siguiente nivel
            }
        }

        // 2. Pollinations Flux / Turbo AI (Calidad cine / 3D)
        const models = ['flux', 'turbo'];
        for (const model of models) {
            try {
                const seed = Math.floor(Math.random() * 9999999);
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&nologo=true&seed=${seed}`;
                console.log(`🎨 Generando fondo visual (${model.toUpperCase()} ${isShort ? '9:16' : '16:9'})...`);
                
                const response = await axios.get(pollinationsUrl, { 
                    responseType: 'arraybuffer', 
                    timeout: 45000 
                });

                if (response.data && response.data.length > 5000) {
                    const b64 = Buffer.from(response.data).toString('base64');
                    console.log(`✅ Background generado con ${model.toUpperCase()} (${response.data.length} bytes)`);
                    return `data:image/jpeg;base64,${b64}`;
                }
            } catch (err: any) {
                console.log(`⚠️ ${model} no respondió rápido (${err.message}), probando alternativa...`);
            }
        }

        // 3. Fallback a Pexels
        const pexelsKey = process.env.PEXELS_API_KEY;
        if (pexelsKey) {
            try {
                const searchQuery = visualPrompt || 'futuristic artificial intelligence neural network dark cyan';
                const orientation = isShort ? 'portrait' : 'landscape';
                const pexelsRes = await axios.get(
                    `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&orientation=${orientation}&per_page=5`,
                    { headers: { Authorization: pexelsKey }, timeout: 10000 }
                );

                if (pexelsRes.data.photos && pexelsRes.data.photos.length > 0) {
                    const photo = pexelsRes.data.photos[0];
                    console.log(`📷 Background obtenido de Pexels (ID: ${photo.id})`);
                    return photo.src.large2x || photo.src.large;
                }
            } catch (pexelsErr: any) {
                console.log(`⚠️ Pexels error: ${pexelsErr.message}`);
            }
        }

        return '';
    }

    /**
     * Genera una miniatura personalizada de alto impacto (CTR) para YouTube
     */
    public static async generateThumbnail(config: ThumbnailConfig): Promise<string> {
        console.log(`🖼️ ThumbnailGenerator: Creando thumbnail para "${config.title}" (${config.isShort ? 'Short 9:16' : 'Video Largo 16:9'})...`);
        
        const contentDir = path.join(__dirname, '../../content');
        if (!fs.existsSync(contentDir)) {
            fs.mkdirSync(contentDir, { recursive: true });
        }
        const outputPath = path.join(contentDir, config.outputFilename);
        
        const width = config.isShort ? 1080 : 1280;
        const height = config.isShort ? 1920 : 720;
        let brandName = 'NeuroSync AI';
        if (config.channelKey === 'channel3') {
            brandName = 'ColombianDreamm';
        } else if (config.channelKey === 'channel2' || config.channelName?.includes('NeuroTech')) {
            brandName = 'NeuroTech AI';
        }

        // 1. Obtener imagen de fondo con IA
        const backgroundDataUrl = await this.fetchBackgroundImage(
            config.title, 
            config.visualPrompt, 
            config.isShort, 
            width, 
            height,
            config.channelKey
        );

        // 2. Renderizado HTML/CSS especializado por formato con Puppeteer
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
        
        const escapedTitle = this.escapeHtml(title);
        const highlightedTitle = this.highlightKeywords(escapedTitle);

        let html = '';

        if (isShort) {
            // ==========================================
            // PLANTILLA SHORTS VERTICALES (9:16 - 1080x1920)
            // ==========================================
            const backgroundStyle = backgroundImageUrl
                ? `background-image: linear-gradient(180deg, rgba(6,10,22,0.85) 0%, rgba(6,10,22,0.1) 40%, rgba(6,10,22,0.85) 100%), url('${backgroundImageUrl}'); background-size: cover; background-position: center;`
                : `background: linear-gradient(135deg, #0a0e1a 0%, #061126 50%, #031b33 100%);`;

            html = `
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
                        flex-direction: column;
                        align-items: center;
                        padding-top: 200px;
                        overflow: hidden;
                        font-family: 'Montserrat', sans-serif;
                    }
                    .title-card {
                        background: rgba(6, 11, 24, 0.82);
                        backdrop-filter: blur(20px);
                        -webkit-backdrop-filter: blur(20px);
                        border: 3px solid #00d4ff;
                        border-radius: 26px;
                        padding: 38px 32px;
                        max-width: 90%;
                        text-align: center;
                        box-shadow: 0 25px 60px rgba(0,0,0,0.95), 0 0 40px rgba(0,212,255,0.4);
                    }
                    .badge {
                        display: inline-block;
                        background: #00d4ff;
                        color: #030712;
                        font-size: 24px;
                        font-weight: 900;
                        padding: 8px 22px;
                        border-radius: 10px;
                        margin-bottom: 18px;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                    }
                    .title {
                        font-size: 70px;
                        font-weight: 900;
                        color: #ffffff;
                        text-transform: uppercase;
                        line-height: 1.15;
                        letter-spacing: 1px;
                        text-shadow: 0 4px 16px rgba(0,0,0,0.95);
                    }
                    .highlight {
                        color: #00d4ff;
                        text-shadow: 0 0 35px rgba(0, 212, 255, 0.9);
                    }
                    .brand {
                        position: absolute;
                        bottom: 45px;
                        font-size: 28px;
                        font-weight: 900;
                        color: #00d4ff;
                        letter-spacing: 3px;
                        text-shadow: 0 3px 12px rgba(0,0,0,0.95);
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
        } else {
            // ==========================================
            // PLANTILLA VIDEOS LARGOS HORIZONTALES (16:9 - 1280x720)
            // DISEÑO ASIMÉTRICO (REGLA DE TERCIOS: TEXTO IZQUIERDA, ARTE DERECHA)
            // ==========================================
            const backgroundStyle = backgroundImageUrl
                ? `background-image: linear-gradient(90deg, rgba(4,7,16,0.95) 0%, rgba(4,7,16,0.85) 45%, rgba(4,7,16,0.2) 80%, rgba(4,7,16,0.05) 100%), url('${backgroundImageUrl}'); background-size: cover; background-position: right center;`
                : `background: linear-gradient(135deg, #0a0e1a 0%, #061126 50%, #031b33 100%);`;

            html = `
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
                        justify-content: flex-start;
                        padding: 0 60px;
                        overflow: hidden;
                        font-family: 'Montserrat', 'Arial Black', sans-serif;
                    }
                    .text-column {
                        max-width: 58%;
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        z-index: 10;
                    }
                    .badge-row {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 18px;
                    }
                    .badge {
                        background: #00d4ff;
                        color: #030712;
                        font-size: 20px;
                        font-weight: 900;
                        padding: 6px 18px;
                        border-radius: 8px;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        box-shadow: 0 0 20px rgba(0,212,255,0.6);
                    }
                    .badge-secondary {
                        background: rgba(255,255,255,0.15);
                        border: 1px solid rgba(255,255,255,0.3);
                        color: #ffffff;
                        font-size: 18px;
                        font-weight: 900;
                        padding: 6px 16px;
                        border-radius: 8px;
                        letter-spacing: 1.5px;
                        text-transform: uppercase;
                        backdrop-filter: blur(10px);
                    }
                    .title {
                        font-size: 58px;
                        font-weight: 900;
                        color: #ffffff;
                        text-transform: uppercase;
                        line-height: 1.08;
                        letter-spacing: 1px;
                        text-shadow: 
                            3px 3px 0 #000,
                            -3px -3px 0 #000,
                            3px -3px 0 #000,
                            -3px 3px 0 #000,
                            0 10px 30px rgba(0,0,0,0.95);
                    }
                    .highlight {
                        color: #00d4ff;
                        text-shadow: 
                            3px 3px 0 #000,
                            -3px -3px 0 #000,
                            0 0 35px rgba(0, 212, 255, 0.95);
                    }
                    .brand {
                        position: absolute;
                        bottom: 28px;
                        left: 60px;
                        font-size: 20px;
                        font-weight: 900;
                        color: #00d4ff;
                        letter-spacing: 2.5px;
                        text-shadow: 0 2px 8px rgba(0,0,0,0.9);
                    }
                </style>
            </head>
            <body>
                <div class="text-column">
                    <div class="badge-row">
                        <div class="badge">NUEVA IA</div>
                        <div class="badge-secondary">GUÍA DEFINITIVA</div>
                    </div>
                    <div class="title">${highlightedTitle}</div>
                </div>
                <div class="brand">${brandName.toUpperCase()}</div>
            </body>
            </html>
            `;
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
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
            'CRISIS', 'PREDICE', 'SECRETO', 'REVOLUCIÓN', 'GUÍA', 'MÉTODO', 
            '7 DÍAS', '48 HORAS', 'ANTI-CAOS', 'PRODUCTIVIDAD', 'ENFOQUE'
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
