const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cowork', {
    sendMessage: (payload) => ipcRenderer.invoke('send-message', payload),
    openFile: () => ipcRenderer.invoke('open-file'),
    saveConversations: (data) => ipcRenderer.invoke('save-conversations', data),
    loadConversations: () => ipcRenderer.invoke('load-conversations'),
    onChunk: (callback) => ipcRenderer.on('stream-chunk', (_, text) => callback(text)),
    onDone: (callback) => ipcRenderer.on('stream-done', () => callback()),
    onError: (callback) => ipcRenderer.on('stream-error', (_, err) => callback(err)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
