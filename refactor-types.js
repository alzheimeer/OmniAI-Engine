const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, 'src');

function findAndReplace(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findAndReplace(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf-8');
            let modified = false;

            // Replace exact type unions
            const typeUnion1 = /'channel1'\s*\|\s*'channel2'/g;
            if (typeUnion1.test(content)) {
                content = content.replace(/'channel1'\s*\|\s*'channel2'/g, "'channel1' | 'channel2' | 'channel3'");
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated types in: ${fullPath}`);
            }
        }
    }
}

findAndReplace(srcDir);
