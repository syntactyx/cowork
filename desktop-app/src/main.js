const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1e1e1e',
        title: 'Cowork'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
});

// Handle chat messages
ipcMain.handle('send-message', async (event, { messages, systemPrompt }) => {
    try {
        const stream = await client.messages.stream({
            model: 'claude-opus-4-20250514',
            max_tokens: 8192,
            system: systemPrompt,
            messages
        });

        for await (const chunk of stream) {
            if (
                chunk.type === 'content_block_delta' &&
                chunk.delta.type === 'text_delta'
            ) {
                event.sender.send('stream-chunk', chunk.delta.text);
            }
        }

        event.sender.send('stream-done');

    } catch (err) {
        event.sender.send('stream-error', String(err));
    }
});

// Handle file attachments
ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Text Files', extensions: ['txt', 'md', 'js', 'ts', 'py', 'json', 'html', 'css'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        return { fileName, content };
    }

    return null;
});

// Handle conversation persistence
ipcMain.handle('save-conversations', async (event, data) => {
    const storePath = path.join(app.getPath('userData'), 'conversations.json');
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
});

ipcMain.handle('load-conversations', async () => {
    const storePath = path.join(app.getPath('userData'), 'conversations.json');
    if (fs.existsSync(storePath)) {
        return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    }
    return null;
});
