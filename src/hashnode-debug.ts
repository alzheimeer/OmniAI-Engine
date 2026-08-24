import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
puppeteer.use(StealthPlugin());

(async () => {
    const cookieVal = process.env.HASHNODE_COOKIE;
    
    if (!cookieVal) {
        console.error('Missing HASHNODE_COOKIE');
        return;
    }

    console.log('Starting Puppeteer debug for Hashnode...');
    const browser = await puppeteer.launch({
        headless: true, // Use headless for screenshot
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Set cookie
    await page.setCookie({
        name: 'hashnode-session',
        value: cookieVal,
        domain: '.hashnode.com',
        path: '/',
        secure: true,
        httpOnly: true
    });

    console.log('Navigating to Hashnode drafts...');
    await page.goto('https://hashnode.com/drafts', { waitUntil: 'networkidle2' });

    console.log('Clicking New draft button...');
    
    // Find button containing 'New draft'
    const newDraftBtn = await page.$("::-p-text(New draft)");
    if (newDraftBtn) {
        await newDraftBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    } else {
        console.log('Could not find New draft button');
    }

    console.log('Taking screenshot of editor...');
    await page.screenshot({ path: path.join(__dirname, '../hashnode_editor.png') });

    // Try to dump the HTML for the editor area
    try {
        const html = await page.evaluate(() => document.body.innerHTML);
        console.log('HTML loaded, length:', html.length);
    } catch (e) {
        console.log('Could not get HTML');
    }

    await browser.close();
    console.log('Saved screenshot to hashnode_debug.png');
})();
