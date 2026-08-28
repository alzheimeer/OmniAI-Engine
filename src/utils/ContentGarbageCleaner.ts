import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility class for automated garbage and temporary file cleanup in the content directory.
 * Keeps the workspace clean and prevents disk bloat over long autonomous runs.
 */
export class ContentGarbageCleaner {
    private static CONTENT_DIR = path.join(process.cwd(), 'content');
    private static GENERATED_VIDEOS_DIR = path.join(process.cwd(), 'content', 'generated_videos');
    private static POLLINATIONS_DIR = path.join(process.cwd(), 'content', 'pollinations_images');

    /**
     * Clean all temporary rendering files, raw WEBP animations, test artifacts, and orphan assets.
     */
    public static cleanTemporaryFiles(): { deletedCount: number; freedBytes: number } {
        let deletedCount = 0;
        let freedBytes = 0;

        console.log('[ContentGarbageCleaner] 🧹 Iniciando limpieza automática de archivos temporales...');

        // 1. Clean .webp animations in content/generated_videos (converted to .mp4)
        if (fs.existsSync(this.GENERATED_VIDEOS_DIR)) {
            const videoFiles = fs.readdirSync(this.GENERATED_VIDEOS_DIR);
            for (const file of videoFiles) {
                if (file.endsWith('.webp') || file.startsWith('test_') || file.length === 0) {
                    const filePath = path.join(this.GENERATED_VIDEOS_DIR, file);
                    try {
                        const stat = fs.statSync(filePath);
                        freedBytes += stat.size;
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch (e: any) {
                        // ignore file locked errors
                    }
                }
            }
        }

        // 2. Clean temporary scene segments and concat files in content/
        if (fs.existsSync(this.CONTENT_DIR)) {
            const contentFiles = fs.readdirSync(this.CONTENT_DIR);
            const tempPatterns = [
                /^short_scene_.*\.mp4$/i,
                /^long_scene_.*\.mp4$/i,
                /^_short_concat\..*$/i,
                /^_long_concat\..*$/i,
                /^test_.*\.mp4$/i,
                /^temp_.*$/i
            ];

            for (const file of contentFiles) {
                const isTemp = tempPatterns.some(pattern => pattern.test(file));
                if (isTemp) {
                    const filePath = path.join(this.CONTENT_DIR, file);
                    try {
                        const stat = fs.statSync(filePath);
                        freedBytes += stat.size;
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch (e: any) {
                        // ignore file locked errors
                    }
                }
            }
        }

        // 3. Clean old Pollinations temporary images older than 1 day
        if (fs.existsSync(this.POLLINATIONS_DIR)) {
            const imageFiles = fs.readdirSync(this.POLLINATIONS_DIR);
            const now = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;

            for (const file of imageFiles) {
                if (file === '.gitkeep') continue;
                const filePath = path.join(this.POLLINATIONS_DIR, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > oneDayMs) {
                        freedBytes += stat.size;
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                } catch (e: any) {
                    // ignore errors
                }
            }
        }

        const freedMB = (freedBytes / (1024 * 1024)).toFixed(2);
        console.log(`[ContentGarbageCleaner] ✅ Limpieza completada: ${deletedCount} archivos eliminados (${freedMB} MB liberados).`);
        return { deletedCount, freedBytes };
    }
}
