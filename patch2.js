const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/generators/AutonomousOrchestrator.ts');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    /const visualPrompt = script\.visualPrompts\[0\] \|\| 'technology data';\n\s*await VideoRenderer\.renderVideo\(visualPrompt, audioFile, videoFile\);/,
    "await VideoRenderer.renderVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);"
);

code = code.replace(
    /await VideoRenderer\.renderLongVideo\(script\.visualPrompts, audioFile, videoFile\);/,
    "await VideoRenderer.renderLongVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);"
);

fs.writeFileSync(filePath, code);

// Patch test scripts as well
const testPipe = path.join(__dirname, 'src/test-pipeline.ts');
if (fs.existsSync(testPipe)) {
    let t1 = fs.readFileSync(testPipe, 'utf8');
    t1 = t1.replace(
        /const visualPrompt = script\.visualPrompts\[0\] \|\| 'futuristic technology'; \n\s*await VideoRenderer\.renderVideo\(visualPrompt, audioFile, videoFile\);/,
        "await VideoRenderer.renderVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);"
    );
    fs.writeFileSync(testPipe, t1);
}

const testLong = path.join(__dirname, 'src/test-long-video.ts');
if (fs.existsSync(testLong)) {
    let t2 = fs.readFileSync(testLong, 'utf8');
    t2 = t2.replace(
        /await VideoRenderer\.renderLongVideo\(script\.visualPrompts, audioFile, videoFile\);/,
        "await VideoRenderer.renderLongVideo(script.visualPrompts, audioFile, videoFile, script.spokenText);"
    );
    fs.writeFileSync(testLong, t2);
}
