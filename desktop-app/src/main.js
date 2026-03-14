const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let anthropicClient = null;

function getKeyPath() {
    return path.join(app.getPath("userData"), "apikey.txt");
}

function loadApiKey() {
    try {
        const key = fs.readFileSync(getKeyPath(), "utf8").trim();
        if (key) {
            const Anthropic = require("@anthropic-ai/sdk");
            anthropicClient = new Anthropic({ apiKey: key });
            return true;
        }
    } catch (e) {}
    return false;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: "#1e1e1e",
        title: "Cowork"
    });
    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
}

app.whenReady().then(() => {
    loadApiKey();
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") { app.quit(); }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
});

ipcMain.handle("get-api-key", () => {
    try { return fs.readFileSync(getKeyPath(), "utf8").trim(); } catch (e) { return ""; }
});

ipcMain.handle("set-api-key", (event, key) => {
    fs.writeFileSync(getKeyPath(), key.trim(), "utf8");
    const Anthropic = require("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({ apiKey: key.trim() });
    return true;
});

ipcMain.handle("send-message", async (event, { messages, systemPrompt, model }) => {
    if (!anthropicClient) {
        event.sender.send("stream-error", "No API key set. Please add your key in Settings.");
        return;
    }
    try {
        const stream = await anthropicClient.messages.stream({
            model: model || "claude-opus-4-20250514",
            max_tokens: 8192,
            system: systemPrompt,
            messages
        });
        for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
                event.sender.send("stream-chunk", chunk.delta.text);
            }
        }
        event.sender.send("stream-done");
    } catch (err) {
        event.sender.send("stream-error", String(err));
    }
});

ipcMain.handle("open-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [
            { name: "Text Files", extensions: ["txt", "md", "js", "ts", "py", "json", "html", "css"] },
            { name: "All Files", extensions: ["*"] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, "utf-8");
        const fileName = path.basename(filePath);
        return { fileName, content };
    }
    return null;
});

ipcMain.handle("save-conversations", async (event, data) => {
    const storePath = path.join(app.getPath("userData"), "conversations.json");
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
});

ipcMain.handle("load-conversations", async () => {
    const storePath = path.join(app.getPath("userData"), "conversations.json");
    if (fs.existsSync(storePath)) {
        return JSON.parse(fs.readFileSync(storePath, "utf-8"));
    }
    return null;
});


ipcMain.handle("open-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Select Project Folder"
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle("scan-project", async (event, { folderPath }) => {
    if (!anthropicClient) { throw new Error("No API key set."); }

    const EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".md", ".py", ".txt"];
    const SKIP_DIRS = ["node_modules", "dist", ".git", "out", ".api_venv", "__pycache__"];
    const SKIP_FILES = ["package-lock.json", "yarn.lock", "fix-pkg.js", "fix-pkg2.js", "fix-renderer.js", "fix-send.js", "fix-compact-btn.js", "patch-html.js", "patch-main.js", "patch-main2.js", "patch-preload.js", "patch-renderer.js", "write-main.js", "build-scan.js", "check-scan.js", "add-api-modal.js", "add-api-key-logic.js"];

    function readDirRecursive(dir) {
        const results = [];
        let entries;
        try { entries = fs.readdirSync(dir); } catch (e) { return results; }
        for (const entry of entries) {
            if (SKIP_DIRS.includes(entry)) { continue; }
            const fullPath = path.join(dir, entry);
            let stat;
            try { stat = fs.statSync(fullPath); } catch (e) { continue; }
            if (stat.isDirectory()) {
                results.push(...readDirRecursive(fullPath));
            } else if (EXTENSIONS.includes(path.extname(entry).toLowerCase()) && !SKIP_FILES.includes(entry)) {
                results.push(fullPath);
            }
        }
        return results;
    }

    const files = readDirRecursive(folderPath);
    const fileContents = [];
    let totalChars = 0;
    const MAX_CHARS = 150000;

    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const relativePath = path.relative(folderPath, filePath);
            const entry = "### " + relativePath + String.fromCharCode(10) + "```" + String.fromCharCode(10) + content + String.fromCharCode(10) + "```";
            if (totalChars + entry.length > MAX_CHARS) {
                fileContents.push("### [Remaining files truncated - limit reached]");
                break;
            }
            fileContents.push(entry);
            totalChars += entry.length;
        } catch (e) { continue; }
    }

    const projectText = fileContents.join(String.fromCharCode(10) + String.fromCharCode(10));
    const folderName = path.basename(folderPath);

    const sysPrompt = "You are a technical documentation assistant. Read the following project codebase and produce a single dense structured markdown document that primes a future Claude instance with full context. Include: project overview and purpose, complete file structure with descriptions, architecture and data flow, key functions and their roles, dependencies and configuration, known patterns and conventions used, and suggested next steps or improvements. Be thorough but concise. Optimize for information density.";
    const userMsg = "Project: " + folderName + String.fromCharCode(10) + String.fromCharCode(10) + "Files:" + String.fromCharCode(10) + String.fromCharCode(10) + projectText;

    const response = await anthropicClient.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 8192,
        system: sysPrompt,
        messages: [{ role: "user", content: userMsg }]
    });

    return { briefing: response.content[0].text, fileCount: files.length, folderName };
});
ipcMain.handle("compact-conversation", async (event, { messages, title }) => {
    if (!anthropicClient) { throw new Error("No API key set."); }
    var NL = String.fromCharCode(10);
    const conversationText = messages.map(function(m) {
        const role = m.role === "user" ? "USER" : "CLAUDE";
        let content = m.content;
        if (Array.isArray(content)) {
            content = content.map(function(b) { return b.text || ""; }).join(" ");
        }
        return role + ": " + content;
    }).join(NL + NL);
    const sysPrompt = "You are a technical documentation assistant. Read the following conversation and produce a single dense structured markdown document to prime a future Claude instance with full context. Include: project overview and current state, all key decisions made and why, all code written with file paths, architecture and data flow, known issues and bugs, immediate next steps, and important developer gotchas. Be thorough but concise. Optimize for information density.";
    const userMsg = "Conversation title: " + title + NL + NL + conversationText;
    const response = await anthropicClient.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 8192,
        system: sysPrompt,
        messages: [{ role: "user", content: userMsg }]
    });
    return response.content[0].text;
});