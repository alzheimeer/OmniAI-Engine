import axios from 'axios';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const COMFY_HOST = '127.0.0.1:8188';
const CLIENT_ID = 'flux_5min_' + Math.random().toString(36).substring(7);
const outputDir = path.join(process.cwd(), 'content', 'frames_flux_5min');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 120 Prompts narrativos detallados para ritmo dinámico de ~1.9s por escena
const rawThemes = [
    "futuristic glowing human brain with cyan neural synapses and deep dark background",
    "close-up of advanced biometric wearable headset detecting brain activity calmly",
    "macro photography of bio-digital holographic data streams in gentle turquoise",
    "calm autistic person working in an ergonomic futuristic room with ambient lighting",
    "smartwatch with glowing cyan interface analyzing sensory stress levels",
    "holographic soundwave equalizer dampening loud noisy environmental frequencies",
    "cybernetic neural network glowing softly in dark navy and electric blue",
    "wearable augmented reality glasses filtering overwhelming visual bright lights",
    "cinematic AI assistant avatar providing gentle emotional guidance",
    "peaceful futuristic workspace designed for neurodivergent focus with dual monitors",
    "microscopic view of glowing neuro-circuit chip syncing with brain waves",
    "abstract visualization of sensory chaos turning into harmonious cyan patterns",
    "holographic daily schedule planner organizing complex tasks visually in 3D",
    "human eye with gentle digital iris reflection of serene AI algorithms",
    "futuristic city at dusk with tranquil blue skyline and peaceful atmosphere",
    "AI algorithm detecting early fatigue markers before sensory meltdown occurs",
    "glowing digital shield wrapping around a human silhouette for sensory comfort",
    "bioluminescent neural interface showing balanced dopamine and serotonin pathways",
    "ergonomic smart workstation with ambient light adjusting to eye fatigue",
    "friendly AI companion interface displaying comforting audio visualizers",
    "futuristic medical laboratory developing non-invasive neural monitoring tech",
    "close-up of hands typing on a holographic keyboard with soothing blue glow",
    "smart environment adjusting room temperature and soundproof walls automatically",
    "neural network visualization forming a protective geometric lattice",
    "gentle cybernetic headset glowing with pulsing cyan light in dim ambient room",
    "high-tech sensory decompression room with soft fiber-optic light displays",
    "AI generated visual communication board for non-verbal expression in 3D space",
    "smart earplugs with adaptive active noise cancellation interface floating in air",
    "macro view of synaptic transmission stimulated by gentle cognitive therapy tech",
    "futuristic classroom with adaptive AI learning desks tailored to sensory needs",
    "holographic timer breaking overwhelming project into 5-minute calm steps",
    "biometric ring tracking pulse variability with soft turquoise indicator light",
    "neural feedback monitor displaying stable green and cyan brain wave frequencies",
    "human profile illuminated by soft neon cybernetic circuitry along the temple",
    "cozy futuristic relaxation pod with gentle starry ceiling projection",
    "AI voice synthesizer converting thoughts into clear melodic audio waves",
    "close-up of digital neuro-sensory interface with crystal clear glass optics",
    "abstract 3D sculpture of neurodiversity with interconnected glowing nodes",
    "futuristic library with silent holographic study cubicles and ambient gloom",
    "smart glasses highlighting safe quiet walking routes in a busy city",
    "digital cognitive assistant categorizing complex emails into visual color cards",
    "wearable vibration bracelet delivering gentle grounding rhythmic pulses",
    "futuristic smart home entrance door scanning and reducing sensory stress",
    "holographic neural map showing enhanced creative pattern recognition in autism",
    "peaceful evening scene with AI ambient lights slowly dimming to deep indigo",
    "brain computer interface chip resting delicately on a high-tech circuit board",
    "softly glowing digital mentor offering positive encouragement in 3D space",
    "cinematic shot of human looking out at starry sky with faint cyan auroras",
    "interconnected global neural network of neurodivergent innovators sharing ideas",
    "inspiring visualization of a human mind radiating bright harmonious cyan light",
    "macro lens of organic carbon nanotube sensors interfacing with skin receptors",
    "3D holographic visualization of sensory overload decreasing in real time",
    "futuristic neurodivergent artist creating digital art with eye-tracking AI",
    "gentle soothing blue light therapy lamp synchronized with circadian rhythm",
    "smart tactile gloves with micro-haptic feedback providing soothing sensations",
    "holographic AI dashboard summarizing complex daily tasks into visual icons",
    "close-up of brain neural pathway restructuring through cognitive neuroplasticity",
    "futuristic soundproof podcast studio with ambient cyan acoustic foam panels",
    "holographic timeline showing gradual cognitive recovery after stressful day",
    "cybernetic origami bird glowing in neon turquoise symbolizing creative thought"
];

// Generar 120 temas expandiendo los ángulos de cámara y detalles
const sceneThemes = [];
for (let i = 0; i < 120; i++) {
    const base = rawThemes[i % rawThemes.length];
    const cameraAngles = [
        "wide cinematic angle",
        "dramatic macro close-up",
        "low angle hero shot",
        "isometric 3D perspective",
        "cinematic depth of field focal shot",
        "atmospheric side profile shot"
    ];
    const angle = cameraAngles[i % cameraAngles.length];
    sceneThemes.push(`${base}, ${angle}`);
}

function buildWorkflow(promptText, width = 1024, height = 576) {
    return {
        "1": {
            "inputs": { "unet_name": "flux1-schnell-Q4_K_S.gguf" },
            "class_type": "UnetLoaderGGUF"
        },
        "2": {
            "inputs": {
                "clip_name1": "clip_l.safetensors",
                "clip_name2": "t5-v1_1-xxl-encoder-Q4_K_S.gguf",
                "type": "flux"
            },
            "class_type": "DualCLIPLoaderGGUF"
        },
        "3": {
            "inputs": { "vae_name": "taef1" },
            "class_type": "VAELoader"
        },
        "4": {
            "inputs": {
                "text": promptText + ", cinematic lighting, dark mood, vibrant cyan neon accents #00d4ff, deep black background, hyperrealistic 8k, Unreal Engine 5 render, no text, no letters",
                "clip": ["2", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "5": {
            "inputs": { "text": "", "clip": ["2", 0] },
            "class_type": "CLIPTextEncode"
        },
        "6": {
            "inputs": { "width": width, "height": height, "batch_size": 1 },
            "class_type": "EmptyLatentImage"
        },
        "7": {
            "inputs": {
                "seed": Math.floor(Math.random() * 99999999),
                "steps": 4,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0]
            },
            "class_type": "KSampler"
        },
        "8": {
            "inputs": { "samples": ["7", 0], "vae": ["3", 0] },
            "class_type": "VAEDecode"
        },
        "9": {
            "inputs": { "filename_prefix": "FLUX_120_FRAME", "images": ["8", 0] },
            "class_type": "SaveImage"
        }
    };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateAllFrames(ws) {
    const totalScenes = sceneThemes.length;
    const downloadedFrames = [];

    console.log(`==================================================`);
    console.log(`🎬 GENERANDO ${totalScenes} FOTOGRAMAS CON FLUX LOCAL`);
    console.log(`==================================================\n`);

    for (let i = 0; i < totalScenes; i++) {
        const frameFilename = `frame_${String(i + 1).padStart(3, '0')}.png`;
        const targetPath = path.join(outputDir, frameFilename);

        // Si ya existe de una ejecución previa, reutilizar
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 10000) {
            console.log(`⏩ [${i + 1}/${totalScenes}] Ya generado en disco: ${frameFilename}`);
            downloadedFrames.push(targetPath);
            continue;
        }

        const theme = sceneThemes[i];
        console.log(`\n⏳ [${i + 1}/${totalScenes}] Generando: "${theme.substring(0, 50)}..."`);
        const workflow = buildWorkflow(theme, 1024, 576);

        const promptPromise = new Promise(async (resolve, reject) => {
            const onMessage = async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'executing' && msg.data.node) {
                        process.stdout.write(` > N${msg.data.node}`);
                    }
                    if (msg.type === 'executed' && msg.data.node === '9') {
                        const images = msg.data.output?.images;
                        if (images && images.length > 0) {
                            const img = images[0];
                            const imgRes = await axios.get(`http://${COMFY_HOST}/view?filename=${img.filename}&type=${img.type}`, {
                                responseType: 'arraybuffer'
                            });
                            fs.writeFileSync(targetPath, imgRes.data);
                            ws.removeListener('message', onMessage);
                            resolve(targetPath);
                        }
                    }
                } catch (e) {
                    // ignore parse
                }
            };

            ws.on('message', onMessage);

            try {
                await axios.post(`http://${COMFY_HOST}/prompt`, {
                    prompt: workflow,
                    client_id: CLIENT_ID
                });
            } catch (err) {
                ws.removeListener('message', onMessage);
                reject(err);
            }
        });

        try {
            const savedPath = await promptPromise;
            downloadedFrames.push(savedPath);
            console.log(`\n✅ [${i + 1}/${totalScenes}] Guardado (${frameFilename})`);
        } catch (err) {
            console.error(`\n❌ Error en escena ${i + 1}:`, err.message);
        }

        await sleep(400);
    }

    return downloadedFrames;
}

async function renderFinalVideo(imagePaths) {
    console.log(`\n==================================================`);
    console.log(`🎞️ ENSAMBLANDO VIDEO FINAL CON FFMPEG (${imagePaths.length} ESCENAS)`);
    console.log(`==================================================`);

    const audioPath = path.join(process.cwd(), 'content', 'long-channel1-spanish.mp3');
    const finalVideoPath = path.join(process.cwd(), 'content', 'final_flux_5min_video.mp4');
    const concatListPath = path.join(outputDir, 'concat_list.txt');

    // Duración exacta por imagen para sincronizar los 230 segundos con las 120 imágenes
    const secondsPerImage = 230.4 / imagePaths.length;
    console.log(`⏱️ Duración por fotograma: ${secondsPerImage.toFixed(2)} segundos (ritmo dinámico de alta retención)`);

    let concatContent = '';
    for (const img of imagePaths) {
        const normalized = img.replace(/\\/g, '/');
        concatContent += `file '${normalized}'\nduration ${secondsPerImage.toFixed(3)}\n`;
    }
    concatContent += `file '${imagePaths[imagePaths.length - 1].replace(/\\/g, '/')}'\n`;
    fs.writeFileSync(concatListPath, concatContent);

    return new Promise((resolve, reject) => {
        const cmd = ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .input(audioPath)
            .outputOptions([
                '-c:v libx264',
                '-preset fast',
                '-pix_fmt yuv420p',
                '-vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
                '-c:a aac',
                '-b:a 192k',
                '-shortest'
            ])
            .output(finalVideoPath)
            .on('start', (c) => console.log(`⚙️ FFmpeg iniciado...`))
            .on('end', () => {
                console.log(`\n==================================================`);
                console.log(`🎉 ¡VIDEO FINAL DE 120 ESCENAS COMPLETADO!`);
                console.log(`📁 Archivo: ${finalVideoPath}`);
                console.log(`==================================================`);
                resolve(finalVideoPath);
            })
            .on('error', (err) => {
                console.error(`❌ Error en FFmpeg:`, err);
                reject(err);
            });

        cmd.run();
    });
}

async function main() {
    console.log(`Conectando con ComfyUI local en ${COMFY_HOST}...`);
    const ws = new WebSocket(`ws://${COMFY_HOST}/ws?clientId=${CLIENT_ID}`);

    ws.on('open', async () => {
        console.log(`✅ Conexión establecida con ComfyUI!`);
        const frames = await generateAllFrames(ws);
        await renderFinalVideo(frames);
        ws.close();
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error(`❌ Error de conexión con ComfyUI:`, err.message);
        process.exit(1);
    });
}

main();
