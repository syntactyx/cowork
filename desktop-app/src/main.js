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
