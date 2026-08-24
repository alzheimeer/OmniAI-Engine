import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';

puppeteer.use(StealthPlugin());
dotenv.config();

(async () => {
    const uid = process.env.MEDIUM_UID;
    const sid = process.env.MEDIUM_SID;
    
    if (!uid || !sid) {
        console.error("Missing cookies");
        process.exit(1);
    }
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setCookie(
        { name: 'uid', value: uid, domain: '.medium.com' },
        { name: 'sid', value: sid, domain: '.medium.com' }
    );
    
    await page.goto('https://medium.com/new-story', { waitUntil: 'networkidle2' });
    
    // Save screenshot
    const screenshotPath = path.join(__dirname, '..', 'medium_debug_stealth.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to', screenshotPath);
    
    await browser.close();
})();
