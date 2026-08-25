const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/generators/VideoRenderer.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add SubtitleGenerator import
code = code.replace(
    "import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';",
    "import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';\nimport { SubtitleGenerator } from './SubtitleGenerator';"
);

// 2. Modify renderVideo signature and logic
code = code.replace(
    /public static async renderVideo\(visualPrompt: string, audioFilename: string, outputFilename: string\): Promise<string> {[\s\S]*?logger\.info\('Video descargado\. Mezclando audio y video con FFmpeg'\);/m,
    `public static async renderVideo(visualPrompts: string[], audioFilename: string, outputFilename: string, text: string): Promise<string> {
        logger.info(\`Iniciando render de video corto\`, { promptsCount: visualPrompts.length });
        const apiKey = process.env.PEXELS_API_KEY;
        if (!apiKey) {
            throw new Error('PEXELS_API_KEY is not set in .env');
        }

        const headers = {
            ...VideoRenderer.DEFAULT_HEADERS,
            'Authorization': apiKey
        };

        const audioPath = path.join(__dirname, '../../content', audioFilename);
        const outputPath = path.join(__dirname, '../../content', outputFilename);
        
        // 1. Generar Subtítulos
        const srtFilename = outputFilename.replace('.mp4', '.srt');
        await SubtitleGenerator.generateSRT(audioPath, text, srtFilename);
        const srtPath = path.join(__dirname, '../../content', srtFilename);

        // 2. Descargar 3 videos de Pexels
        const downloadedVideos = [];
        const promptsToUse = visualPrompts.slice(0, 3);
        if (promptsToUse.length === 0) promptsToUse.push('technology');
        while (promptsToUse.length < 3) promptsToUse.push(promptsToUse[0]); // asegurar 3 clips

        for (let i = 0; i < promptsToUse.length; i++) {
            const prompt = promptsToUse[i];
            const tempVideoPath = path.join(__dirname, '../../content', \`short_scene_\${i}.mp4\`);
            const normVideoPath = path.join(__dirname, '../../content', \`short_scene_norm_\${i}.mp4\`);
            
            try {
                let response = await pexelsRetry.execute(
                    () => axios.get(\`https://api.pexels.com/videos/search?query=\${encodeURIComponent(prompt)}&orientation=portrait&per_page=1\`, { headers }),
                    \`Pexels search short scene \${i + 1}\`
                );

                if (!response.data.videos || response.data.videos.length === 0) {
                    response = await pexelsRetry.execute(
                        () => axios.get(\`https://api.pexels.com/videos/search?query=technology&orientation=portrait&per_page=1\`, { headers }),
                        \`Pexels fallback search short scene \${i + 1}\`
                    );
                }

                if (response.data.videos && response.data.videos.length > 0) {
                    const videoData = response.data.videos[0];
                    const videoFile = videoData.video_files.find((v) => v.height >= 1080) || videoData.video_files[0];
                    const writer = fs.createWriteStream(tempVideoPath);
                    const downloadResponse = await pexelsRetry.execute(
                        () => axios({ url: videoFile.link, method: 'GET', responseType: 'stream', headers: { 'User-Agent': VideoRenderer.DEFAULT_HEADERS['User-Agent'] } }),
                        \`Pexels download short scene \${i + 1}\`
                    );
                    downloadResponse.data.pipe(writer);
                    await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
                    
                    // Normalizar
                    await new Promise((resolve, reject) => {
                        ffmpeg().input(tempVideoPath).outputOptions(['-c:v libx264', '-preset ultrafast', '-r 30', '-s 1080x1920', '-t 15', '-pix_fmt yuv420p']).save(normVideoPath).on('end', resolve).on('error', reject);
                    });
                    downloadedVideos.push(normVideoPath);
                }
            } catch (err) {
                logger.warn(\`Error descargando escena \${i + 1}\`, err);
            }
        }

        if (downloadedVideos.length === 0) throw new Error('No se pudo descargar ningún video de Pexels para el Short');

        // 3. Concatenar clips descargados
        const concatListFile = path.join(__dirname, '../../content', '_short_concat.txt');
        fs.writeFileSync(concatListFile, downloadedVideos.map(v => \`file '\${path.basename(v)}'\`).join('\\n'));
        const concatVideoPath = path.join(__dirname, '../../content', '_short_concat.mp4');
        
        await new Promise((resolve, reject) => {
            ffmpeg().input(concatListFile).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).save(concatVideoPath).on('end', resolve).on('error', reject);
        });

        logger.info('Videos concatenados. Mezclando audio, video y subtítulos con FFmpeg');`
);

// 3. Update the FFmpeg command for renderVideo
code = code.replace(
    /return new Promise\(\(resolve, reject\) => \{[\s\S]*?ffmpeg\(\)[\s\S]*?\.input\(tempVideoPath\)[\s\S]*?\.inputOptions\(\['-stream_loop -1'\]\)[\s\S]*?\.input\(audioPath\)[\s\S]*?\.outputOptions\(\[([\s\S]*?)\]\)[\s\S]*?\.save\(outputPath\)/m,
    `return new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatVideoPath)
                .inputOptions(['-stream_loop -1'])
                .input(audioPath)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 23',
                    '-pix_fmt yuv420p',
                    // Hook Visual Epiléptico + Subtítulos SRT
                    \`-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness='if(between(t,0,3),sin(t*25)*0.3,0)':contrast='if(between(t,0,3),1+sin(t*15)*0.4,1)',subtitles=\${srtPath}:force_style='FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=60'\`,
                    '-c:a aac',
                    '-b:a 128k',
                    '-shortest',
                    '-fflags +shortest',
                    '-max_interleave_delta 100M'
                ])
                .save(outputPath)`
);

// 4. Also update renderLongVideo to include subtitles
code = code.replace(
    /public static async renderLongVideo\(visualPrompts: string\[\], audioFilename: string, outputFilename: string\): Promise<string> {/,
    `public static async renderLongVideo(visualPrompts: string[], audioFilename: string, outputFilename: string, text: string): Promise<string> {`
);

code = code.replace(
    /const audioPath = path\.join\(__dirname, '\.\.\/\.\.\/content', audioFilename\);/,
    `const audioPath = path.join(__dirname, '../../content', audioFilename);\n        const srtFilename = outputFilename.replace('.mp4', '.srt');\n        await SubtitleGenerator.generateSRT(audioPath, text, srtFilename);\n        const srtPath = path.join(__dirname, '../../content', srtFilename);`
);

code = code.replace(
    /ffmpeg\(\)[\s\S]*?\.input\(concatVideoPath\)[\s\S]*?\.input\(audioPath\)[\s\S]*?\.outputOptions\(\[[\s\S]*?'-c:a aac'/m,
    `ffmpeg()
                .input(concatVideoPath)
                .input(audioPath)
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 23',
                    '-pix_fmt yuv420p',
                    \`-vf subtitles=\${srtPath}:force_style='FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=60'\`,
                    '-c:a aac'`
);

fs.writeFileSync(filePath, code);
