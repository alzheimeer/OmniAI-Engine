import { ThumbnailGenerator } from './src/generators/ThumbnailGenerator';

async function run() {
    console.log("Generating test thumbnails...");
    try {
        await ThumbnailGenerator.generateThumbnail({
            title: "Why Millions Remember Things That Never Happened",
            isShort: true,
            visualPrompt: "Mandela Effect, False Memory, Psychology",
            outputFilename: "test_thumb_short.jpg",
            channelKey: "channel3",
            badges: ["MANDELA EFFECT", "PSYCHOLOGY"]
        });
        
        await ThumbnailGenerator.generateThumbnail({
            title: "The Bizarre Truth About Collective False Memories",
            isShort: false,
            visualPrompt: "Brain Science, Mystery, Cognitive Psychology",
            outputFilename: "test_thumb_long.jpg",
            channelKey: "channel3",
            badges: ["MYSTERY", "MIND BLOWN"]
        });
        
        console.log("Done!");
    } catch (e) {
        console.error(e);
    }
}

run();
