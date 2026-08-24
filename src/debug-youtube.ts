import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

puppeteer.use(StealthPlugin());

async function main() {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log('Navigating to youtube.com...');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'youtube_debug.png' });
    
    console.log('Saving DOM...');
    const html = await page.content();
    require('fs').writeFileSync('youtube_debug.html', html);

    await browser.close();
    console.log('Done.');
}

main().catch(console.error);
