const fs = require('fs');
const path = require('path');

// ── Patch main.js ─────────────────────────────────────────────────────────────
let main = fs.readFileSync('src/main.js', 'utf8');

const scanHandlers = [
'',
'ipcMain.handle("open-folder", async () => {',
'    const result = await dialog.showOpenDialog(mainWindow, {',
'        properties: ["openDirectory"],',
'        title: "Select Project Folder"',
'    });',
'    if (!result.canceled && result.filePaths.length > 0) {',
'        return result.filePaths[0];',
'    }',
'    return null;',
'});',
'',
'ipcMain.handle("scan-project", async (event, { folderPath }) => {',
'    if (!anthropicClient) { throw new Error("No API key set."); }',
'',
'    const EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".md", ".py", ".txt"];',
'    const SKIP_DIRS = ["node_modules", "dist", ".git", "out", ".api_venv", "__pycache__"];',
'',
'    function readDirRecursive(dir) {',
'        const results = [];',
'        let entries;',
'        try { entries = fs.readdirSync(dir); } catch (e) { return results; }',
'        for (const entry of entries) {',
'            if (SKIP_DIRS.includes(entry)) { continue; }',
'            const fullPath = path.join(dir, entry);',
'            let stat;',
'            try { stat = fs.statSync(fullPath); } catch (e) { continue; }',
'            if (stat.isDirectory()) {',
'                results.push(...readDirRecursive(fullPath));',
'            } else if (EXTENSIONS.includes(path.extname(entry).toLowerCase())) {',
'                results.push(fullPath);',
'            }',
'        }',
'        return results;',
'    }',
'',
'    const files = readDirRecursive(folderPath);',
'    const fileContents = [];',
'    let totalChars = 0;',
'    const MAX_CHARS = 150000;',
'',
'    for (const filePath of files) {',
'        try {',
'            const content = fs.readFileSync(filePath, "utf-8");',
'            const relativePath = path.relative(folderPath, filePath);',
'            const entry = "### " + relativePath + String.fromCharCode(10) + "```" + String.fromCharCode(10) + content + String.fromCharCode(10) + "```";',
'            if (totalChars + entry.length > MAX_CHARS) {',
'                fileContents.push("### [Remaining files truncated - limit reached]");',
'                break;',
'            }',
'            fileContents.push(entry);',
'            totalChars += entry.length;',
'        } catch (e) { continue; }',
'    }',
'',
'    const projectText = fileContents.join(String.fromCharCode(10) + String.fromCharCode(10));',
'    const folderName = path.basename(folderPath);',
'',
'    const sysPrompt = "You are a technical documentation assistant. Read the following project codebase and produce a single dense structured markdown document that primes a future Claude instance with full context. Include: project overview and purpose, complete file structure with descriptions, architecture and data flow, key functions and their roles, dependencies and configuration, known patterns and conventions used, and suggested next steps or improvements. Be thorough but concise. Optimize for information density.";',
'    const userMsg = "Project: " + folderName + String.fromCharCode(10) + String.fromCharCode(10) + "Files:" + String.fromCharCode(10) + String.fromCharCode(10) + projectText;',
'',
'    const response = await anthropicClient.messages.create({',
'        model: "claude-opus-4-20250514",',
'        max_tokens: 8192,',
'        system: sysPrompt,',
'        messages: [{ role: "user", content: userMsg }]',
'    });',
'',
'    return { briefing: response.content[0].text, fileCount: files.length, folderName };',
'});',
''
].join('\n');

main = main.replace('ipcMain.handle("compact-conversation"', scanHandlers + 'ipcMain.handle("compact-conversation"');
fs.writeFileSync('src/main.js', main, 'utf8');
console.log('main.js:', main.includes('scan-project') ? 'Done!' : 'FAILED');

// ── Patch preload.js ──────────────────────────────────────────────────────────
let pre = fs.readFileSync('src/preload.js', 'utf8');
pre = pre.replace(
    'compactConversation: (payload) => ipcRenderer.invoke("compact-conversation", payload)',
    'compactConversation: (payload) => ipcRenderer.invoke("compact-conversation", payload),\n    openFolder: () => ipcRenderer.invoke("open-folder"),\n    scanProject: (payload) => ipcRenderer.invoke("scan-project", payload)'
);
fs.writeFileSync('src/preload.js', pre, 'utf8');
console.log('preload.js:', pre.includes('scan-project') ? 'Done!' : 'FAILED');

// ── Patch renderer.js ─────────────────────────────────────────────────────────
let js = fs.readFileSync('src/renderer/renderer.js', 'utf8');

const scanFn = [
'// -- Scan Project ------------------------------------------------------------',
'async function scanProject() {',
'    const folderPath = await window.cowork.openFolder();',
'    if (!folderPath) { return; }',
'',
'    const scanBtn = document.getElementById("scan-project-btn");',
'    scanBtn.textContent = "Scanning...";',
'    scanBtn.disabled = true;',
'',
'    try {',
'        const { briefing, fileCount, folderName } = await window.cowork.scanProject({ folderPath });',
'',
'        const blob = new Blob([briefing], { type: "text/markdown" });',
'        const url = URL.createObjectURL(blob);',
'        const a = document.createElement("a");',
'        a.href = url;',
'        a.download = "cowork-scan-" + folderName.replace(/[^a-z0-9]/gi, "_") + "-" + Date.now() + ".md";',
'        a.click();',
'        URL.revokeObjectURL(url);',
'        showToast("Scanned " + fileCount + " files from " + folderName + "!");',
'',
'    } catch (err) {',
'        showToast("Scan failed: " + err.message);',
'        console.error("Scan error:", err);',
'    } finally {',
'        scanBtn.textContent = "Scan Project";',
'        scanBtn.disabled = false;',
'    }',
'}',
''
].join('\n');

const lines = js.split('\n');
const targetLine = lines.findIndex(l => l.includes('// -- Compact & Export'));
lines.splice(targetLine, 0, ...scanFn.split('\n'));
js = lines.join('\n');

js = js.replace(
    "document.getElementById('saved-msgs-btn').addEventListener('click', showSavedMessages);",
    "document.getElementById('saved-msgs-btn').addEventListener('click', showSavedMessages);\ndocument.getElementById('scan-project-btn').addEventListener('click', scanProject);"
);

fs.writeFileSync('src/renderer/renderer.js', js, 'utf8');
console.log('renderer.js:', js.includes('scanProject') ? 'Done!' : 'FAILED');

// ── Patch index.html ──────────────────────────────────────────────────────────
let html = fs.readFileSync('src/renderer/index.html', 'utf8');
html = html.replace(
    '<button id="saved-msgs-btn">&#128190; Saved Messages</button>',
    '<button id="saved-msgs-btn">&#128190; Saved Messages</button>\n            <button id="scan-project-btn" style="width:100%;background:none;border:1px solid #3c3c3c;color:#888;padding:7px;border-radius:6px;cursor:pointer;font-size:12px;transition:all 0.15s;">&#128269; Scan Project</button>'
);
fs.writeFileSync('src/renderer/index.html', html, 'utf8');
console.log('index.html:', html.includes('scan-project-btn') ? 'Done!' : 'FAILED');