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
}

export class ThumbnailGenerator {
    
    /**
     * Generates a custom thumbnail for YouTube videos
     * Uses Pexels for background image + HTML/CSS rendering via Puppeteer
     * @param config Thumbnail configuration
     * @returns Path to generated thumbnail
     */
    public static async generateThumbnail(config: ThumbnailConfig): Promise<string> {
        console.log(`🖼️ ThumbnailGenerator: Creando thumbnail para "${config.title}"...`);
        
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const contentDir = path.join(__dirname, '../../content');
        const outputPath = path.join(contentDir, config.outputFilename);
        
        // Thumbnail dimensions (YouTube recommended)
        const width = config.isShort ? 1080 : 1280;
        const height = config.isShort ? 1920 : 720;

        let backgroundImageUrl = '';

        try {
            // 1. Search Pexels for a relevant background image
            const searchQuery = config.visualPrompt || 'artificial intelligence technology';
            const orientation = config.isShort ? 'portrait' : 'landscape';
            
            let response = await axios.get(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&orientation=${orientation}&per_page=5`,
                { headers: { Authorization: apiKey } }
            );

            // Fallback if no images found
            if (!response.data.photos || response.data.photos.length === 0) {
                console.log(`⚠️ No images for "${searchQuery}", using fallback "brain technology"...`);
                response = await axios.get(
                    `https://api.pexels.com/v1/search?query=${encodeURIComponent('brain technology')}&orientation=${orientation}&per_page=5`,
                    { headers: { Authorization: apiKey } }
                );
            }

            if (response.data.photos && response.data.photos.length > 0) {
                // Pick a random image from top 5 for variety
                const randomIndex = Math.floor(Math.random() * Math.min(5, response.data.photos.length));
                const photo = response.data.photos[randomIndex];
                backgroundImageUrl = photo.src.large2x || photo.src.large;
                console.log(`📷 Using Pexels image ID ${photo.id} by ${photo.photographer}`);
            }
        } catch (error: any) {
            console.log(`⚠️ Pexels API error: ${error.message}, using gradient fallback`);
        }

        // 2. Generate thumbnail using Puppeteer (HTML to image)
        await this.renderThumbnailWithPuppeteer(
            outputPath,
            width,
            height,
            config.title,
            backgroundImageUrl
        );
        
        console.log(`✅ ThumbnailGenerator: Thumbnail saved to ${outputPath}`);
        return outputPath;
    }

    /**
     * Render thumbnail using Puppeteer - converts HTML/CSS to image
     */
    private static async renderThumbnailWithPuppeteer(
        outputPath: string,
        width: number,
        height: number,
        title: string,
        backgroundImageUrl: string
    ): Promise<void> {
        
        const fontSize = width > height ? 64 : 72;
        const escapedTitle = this.escapeHtml(title);
        
        // Create gradient fallback if no image
        const backgroundStyle = backgroundImageUrl
            ? `background-image: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url('${backgroundImageUrl}'); background-size: cover; background-position: center;`
            : `background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);`;

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
                <div class="title">${this.highlightKeywords(escapedTitle)}</div>
            </div>
            <div class="brand">NeuroSync AI</div>
        </body>
        </html>
        `;

        // Launch Puppeteer and render
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width, height });
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Wait a bit for fonts to load
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await page.screenshot({
                path: outputPath,
                type: 'jpeg',
                quality: 90
            });
        } finally {
            await browser.close();
        }
    }

    /**
     * Highlight key words (IA, AI, Autismo, etc.) with accent color
     */
    private static highlightKeywords(title: string): string {
        const keywords = ['IA', 'AI', 'AUTISMO', 'AUTISM', 'TDAH', 'ADHD', 'CEREBRO', 'BRAIN', 'FUTURO', 'FUTURE'];
        let result = title.toUpperCase();
        
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
            result = result.replace(regex, '<span class="highlight">$1</span>');
        }
        
        return result;
    }

    /**
     * Escape HTML special characters
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
