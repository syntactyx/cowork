const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("labrador", {
    // API Key
    getApiKey: () => ipcRenderer.invoke("get-api-key"),
    setApiKey: (key) => ipcRenderer.invoke("set-api-key", key),

    // Session persistence
    saveSession: (sessionId, data) => ipcRenderer.invoke("save-session", { sessionId, data }),
    loadSession: (sessionId) => ipcRenderer.invoke("load-session", { sessionId }),
    listSessions: () => ipcRenderer.invoke("list-sessions"),
    deleteSession: (sessionId) => ipcRenderer.invoke("delete-session", { sessionId }),

    // File upload
    uploadProcedureFile: () => ipcRenderer.invoke("upload-procedure-file"),

    // Phase 1: Intake
    parseProcedure: (procedureText, fileData) =>
        ipcRenderer.invoke("parse-procedure", { procedureText, fileData }),

    // Phase 2: Inline assist (streaming)
    inlineAssist: (question, sessionContext) =>
        ipcRenderer.invoke("inline-assist", { question, sessionContext }),
    onAssistChunk: (callback) => ipcRenderer.on("assist-chunk", (event, text) => callback(text)),
    onAssistDone: (callback) => ipcRenderer.on("assist-done", () => callback()),
    onAssistError: (callback) => ipcRenderer.on("assist-error", (event, err) => callback(err)),
    removeAssistListeners: () => {
        ipcRenderer.removeAllListeners("assist-chunk");
        ipcRenderer.removeAllListeners("assist-done");
        ipcRenderer.removeAllListeners("assist-error");
    },

    // Phase 2: Value validation
    validateValue: (inputLabel, value, unit, sessionContext) =>
        ipcRenderer.invoke("validate-value", { inputLabel, value, unit, sessionContext }),

    // Phase 3: Report generation
    generateReport: (sessionData, format, formality) =>
        ipcRenderer.invoke("generate-report", { sessionData, format, formality }),

    // Export
    exportDocx: (content, defaultName) => ipcRenderer.invoke("export-docx", { content, defaultName }),
    exportLatex: (content, defaultName) => ipcRenderer.invoke("export-latex", { content, defaultName }),
    exportPdf: (content, defaultName) => ipcRenderer.invoke("export-pdf", { content, defaultName }),
    exportXlsx: (content, defaultName) => ipcRenderer.invoke("export-xlsx", { content, defaultName }),
    exportMarkdown: (content, defaultName) => ipcRenderer.invoke("export-markdown", { content, defaultName })
});
