const fs = require('fs');
const path = require('path');

const fileListPath = path.join(__dirname, 'file-list.md');
const outPath = path.join(__dirname, 'relevant-files.md');

const fileListContent = fs.readFileSync(fileListPath, 'utf8');

let files = [];
let inModified = false;
for (const line of fileListContent.split('\n')) {
    if (line.startsWith('### Files to be Modified')) {
        inModified = true;
    } else if (line.startsWith('### ')) {
        inModified = false;
    } else if (inModified && line.startsWith('- ')) {
        files.push(line.substring(2).trim());
    }
}

let outContent = '';

for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${file}`);
        continue;
    }

    const ext = path.extname(file).substring(1);
    const lang = ['ts', 'tsx'].includes(ext) ? 'typescript' : ext === 'js' || ext === 'mjs' ? 'javascript' : ext;

    outContent += `### ${file}\n`;
    outContent += `\`\`\`${lang}\n`;

    const content = fs.readFileSync(filePath, 'utf8');

    if (ext === 'json') {
        // Just extract top-level keys
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.match(/^\s*"[^"]+"\s*:\s*\{/)) {
                outContent += line + '\n';
            } else if (line.match(/^\s*"[^"]+"\s*:/) && !line.includes('{')) {
                // Keep it
                outContent += line + '\n';
            } else if (line.trim() === '{' || line.trim() === '}') {
                outContent += line + '\n';
            } else if (line.trim() === '},' || line.trim() === ']') {
                outContent += line + '\n';
            }
        }
    } else {
        const lines = content.split('\n');
        let inMultiLineImport = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

            if (inMultiLineImport) {
                outContent += line + '\n';
                if (trimmed.includes('} from') || trimmed.includes("from '") || trimmed.includes('from "') || trimmed.endsWith(';')) {
                    inMultiLineImport = false;
                }
                continue;
            }

            // check import/export
            if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.startsWith('require(') || trimmed.startsWith('include ') || trimmed.startsWith('use ')) {
                outContent += line + '\n';
                if (trimmed.startsWith('import {') && !trimmed.includes('} from')) {
                    inMultiLineImport = true;
                }
                continue;
            }

            // class, interface, type, function
            if (trimmed.match(/^(export\s+)?(default\s+)?(async\s+)?(class|interface|function|type)\b/)) {
                outContent += line + '\n';
                continue;
            }

            // arrow functions
            if (trimmed.includes('=>') && (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var '))) {
                outContent += line + '\n';
                continue;
            }

            // Top-level variables
            if (line.match(/^(export\s+)?(const|let|var)\s+\w+/)) {
                outContent += line + '\n';
                continue;
            }

            // Closing brackets
            if (trimmed === '}' || trimmed === '};' || trimmed === '});') {
                outContent += line + '\n';
                continue;
            }
        }
    }

    outContent += `\`\`\`\n\n`;
}

fs.writeFileSync(outPath, outContent);
console.log('Successfully generated relevant-files.md');
