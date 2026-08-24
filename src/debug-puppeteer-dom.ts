import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import fs from 'fs';

puppeteer.use(StealthPlugin());
dotenv.config();

(async () => {
    const uid = process.env.MEDIUM_UID;
    const sid = process.env.MEDIUM_SID;
    
    if (!uid || !sid) {
        process.exit(1);
    }
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setCookie(
        { name: 'uid', value: uid, domain: '.medium.com' },
        { name: 'sid', value: sid, domain: '.medium.com' }
    );
    
    await page.goto('https://medium.com/new-story', { waitUntil: 'networkidle2' });
    
    const html = await page.content();
    fs.writeFileSync('medium_dom.html', html);
    
    await browser.close();
})();
