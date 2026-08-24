import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
import dotenv from 'dotenv';

dotenv.config();

export class MediumPublisher {
    private static uid = process.env.MEDIUM_UID;
    private static sid = process.env.MEDIUM_SID;

    static async publish(title: string, content: string, tags: string[] = ['AI', 'Technology'], publishStatus: 'public' | 'draft' = 'draft'): Promise<string | null> {
        if (!this.uid || !this.sid) {
            console.error('Medium cookies (UID or SID) missing in .env');
            return null;
        }

        console.log(`Starting Puppeteer to publish to Medium...`);
        let browser;
        try {
            browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const page = await browser.newPage();

            await page.setCookie(
                { name: 'uid', value: this.uid, domain: '.medium.com' },
                { name: 'sid', value: this.sid, domain: '.medium.com' }
            );

            await page.goto('https://medium.com/new-story', { waitUntil: 'networkidle2' });
            await page.waitForSelector('h3[data-testid="editorTitleParagraph"]', { timeout: 10000 });
            console.log('Successfully logged in. Pasting content...');

            await page.type('h3[data-testid="editorTitleParagraph"]', title, { delay: 50 });
            await page.keyboard.press('Enter');

            await page.type('p[data-testid="editorParagraphText"]', content, { delay: 10 });
            console.log('Content typed. Medium autosaves drafts automatically.');
            
            if (publishStatus === 'public') {
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for auto-save navigation to settle
                
                const clickedPublish = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const btn = btns.find(b => b.textContent?.trim() === 'Publish');
                    if (btn) { btn.click(); return true; }
                    return false;
                });
                
                if (clickedPublish) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    for (const tag of tags.slice(0, 5)) {
                        await page.keyboard.type(tag);
                        await page.keyboard.press('Enter');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    const clickedPublishNow = await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const btn = btns.find(b => b.textContent?.includes('Publish now'));
                        if (btn) { btn.click(); return true; }
                        return false;
                    });
                    
                    if (clickedPublishNow) {
                        console.log('Article published publicly!');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }

            const currentUrl = page.url();
            console.log(`Draft saved at: ${currentUrl}`);
            await browser.close();
            return currentUrl;

        } catch (error) {
            console.error('Error publishing via Puppeteer:', error);
            if (browser) await browser.close();
            return null;
        }
    }
}
