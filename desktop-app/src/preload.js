const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cowork", {
    sendMessage: (payload) => ipcRenderer.invoke("send-message", payload),
    openFile: () => ipcRenderer.invoke("open-file"),
    saveConversations: (data) => ipcRenderer.invoke("save-conversations", data),
    loadConversations: () => ipcRenderer.invoke("load-conversations"),
    getApiKey: () => ipcRenderer.invoke("get-api-key"),
    setApiKey: (key) => ipcRenderer.invoke("set-api-key", key),
    onChunk: (callback) => ipcRenderer.on("stream-chunk", (_, text) => callback(text)),
    onDone: (callback) => ipcRenderer.on("stream-done", () => callback()),
    onError: (callback) => ipcRenderer.on("stream-error", (_, err) => callback(err)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    compactConversation: (payload) => ipcRenderer.invoke("compact-conversation", payload)
});
