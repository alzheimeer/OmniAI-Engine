import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import clipboardy from 'clipboardy'; // We need this to paste large text fast

dotenv.config();
puppeteer.use(StealthPlugin());

export class HashnodePublisher {
    private static cookieVal = process.env.HASHNODE_COOKIE;

    static async publish(title: string, content: string, keywords: string[] = []): Promise<string | null> {
        if (!this.cookieVal) {
            console.error('HASHNODE_COOKIE missing in .env');
            return null;
        }

        console.log('Starting Puppeteer to publish to Hashnode...');
        
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            headless: process.env.DRY_RUN === 'true' ? false : true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--window-size=1366,768'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            await page.setCookie({
                name: 'hashnode-session',
                value: this.cookieVal,
                domain: '.hashnode.com',
                path: '/',
                secure: true,
                httpOnly: true
            });

            console.log('Navigating to Hashnode drafts...');
            await page.goto('https://hashnode.com/drafts', { waitUntil: 'networkidle2' });

            console.log('Clicking New draft button...');
            await new Promise(r => setTimeout(r, 2000));
            const clickedDraft = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent?.trim() === 'New' || el.textContent?.includes('New draft'));
                if (btn) { (btn as HTMLElement).click(); return true; }
                return false;
            });
            
            if (clickedDraft) {
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
            } else {
                await page.screenshot({ path: 'hashnode_fail.png' });
                throw new Error('New draft button not found');
            }

            console.log('Successfully opened editor. Typing content...');
            
            // Wait for editor to fully load (bypass skeleton)
            try {
                await page.waitForSelector('.ProseMirror, textarea[placeholder*="Title"], [data-placeholder*="Title"]', { timeout: 15000 });
            } catch (e) {
                console.log('Timeout waiting for editor selector. Proceeding anyway...');
            }
            await new Promise(r => setTimeout(r, 2000));

            // Hashnode's editor usually has a textarea for the title
            const titleInput = await page.$('textarea[placeholder*="Title"], input[placeholder*="Title"], [data-placeholder*="Title"]');
            if (titleInput) {
                await titleInput.click();
            } else {
                // Fallback: just click in the upper-middle part of the screen
                await page.mouse.click(640, 300);
            }
            
            await page.keyboard.type(title);
            await new Promise(r => setTimeout(r, 500));

            // Press Enter to go to the body
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 500));

            // Explicitly focus the body editor before typing
            const bodyEditor = await page.$('.ProseMirror');
            if (bodyEditor) {
                await bodyEditor.click();
            } else {
                await page.mouse.click(640, 400);
            }
            await new Promise(r => setTimeout(r, 500));

            // Type content paragraph by paragraph with realistic human delay to avoid AutoMod instant-paste flag
            const paragraphs = content.split('\n\n');
            for (let i = 0; i < paragraphs.length; i++) {
                const para = paragraphs[i].trim();
                if (!para) continue;

                // Paste paragraph
                await page.evaluate((text) => {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.setData('text/plain', text);
                    const event = new ClipboardEvent('paste', {
                        clipboardData: dataTransfer,
                        bubbles: true,
                        cancelable: true
                    });
                    document.activeElement?.dispatchEvent(event);
                }, para);

                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
            }
            
            // Trigger keyboard activity so ProseMirror registers active human authoring
            await page.keyboard.press('Space');
            await page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 2000));
            
            console.log('Content inserted. Clicking Publish button in editor header...');

            if (process.env.DRY_RUN === 'true') {
                console.log('DRY_RUN is true. Not publishing to Hashnode.');
                await browser.close();
                return 'dry-run-hashnode-url';
            }

            // Step 1: Click the top-right "Publish" button to open modal
            const clickedPublishHeader = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent?.trim() === 'Publish' || b.textContent?.includes('Publish'));
                if (btn) { (btn as HTMLElement).click(); return true; }
                return false;
            });

            if (!clickedPublishHeader) {
                await page.screenshot({ path: 'hashnode_fail_header_publish.png' });
                throw new Error('Header Publish button not found');
            }

            console.log('Publish modal opened. Waiting for confirmation modal...');
            await new Promise(r => setTimeout(r, 3000));

            // Step 2: Handle optional tags input inside modal if present
            if (keywords && keywords.length > 0) {
                try {
                    const tagInput = await page.$('input[placeholder*="tag"], input[placeholder*="Tag"]');
                    if (tagInput) {
                        await tagInput.click();
                        await page.keyboard.type(keywords[0]);
                        await new Promise(r => setTimeout(r, 1000));
                        await page.keyboard.press('Enter');
                        await new Promise(r => setTimeout(r, 500));
                    }
                } catch {
                    // Tag selection optional fallback
                }
            }

            // Step 3: Click final "Publish now" or primary confirm button in modal
            const clickedConfirmModal = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                // Look for "Publish now" or primary button in modal
                const modalConfirm = btns.find(b => 
                    b.textContent?.toLowerCase().includes('publish now') || 
                    (b.textContent?.toLowerCase().includes('publish') && b.className.includes('primary'))
                );
                if (modalConfirm) { (modalConfirm as HTMLElement).click(); return true; }

                // Fallback: click last "Publish" button in DOM
                const publishBtns = btns.filter(b => b.textContent?.toLowerCase().includes('publish'));
                if (publishBtns.length > 0) {
                    (publishBtns[publishBtns.length - 1] as HTMLElement).click();
                    return true;
                }
                return false;
            });

            if (!clickedConfirmModal) {
                await page.screenshot({ path: 'hashnode_fail_modal_confirm.png' });
                throw new Error('Modal confirm Publish button not found');
            }

            console.log('Clicked confirm in modal. Waiting for Hashnode backend to complete publishing...');

            // Step 4: Wait up to 30s for page to finish publishing and redirect away from /edit/ or /draft/
            let finalUrl = page.url();
            for (let attempt = 0; attempt < 30; attempt++) {
                await new Promise(r => setTimeout(r, 1000));
                finalUrl = page.url();
                
                // Check if editor Publish button is no longer in "Publishing..." state
                const isStillPublishing = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    return btns.some(b => b.textContent?.includes('Publishing...'));
                });

                if (!isStillPublishing && !finalUrl.includes('/edit/') && !finalUrl.includes('/draft/')) {
                    console.log(`Successfully published and redirected to public URL: ${finalUrl}`);
                    break;
                }
            }

            await page.screenshot({ path: 'hashnode_final_state.png' });
            console.log(`Hashnode Publishing Process Completed. Final URL: ${finalUrl}`);

            await browser.close();
            return finalUrl;

        } catch (error: any) {
            console.error('Error publishing to Hashnode via Puppeteer:', error.message);
            await browser.close();
            return null;
        }
    }
}
