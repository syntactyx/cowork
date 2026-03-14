const fs = require('fs');
let pre = fs.readFileSync('src/preload.js', 'utf8');
pre = pre.replace(
    'removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)',
    'removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),\n    compactConversation: (payload) => ipcRenderer.invoke("compact-conversation", payload)'
);
fs.writeFileSync('src/preload.js', pre, 'utf8');
console.log(pre.includes('compact-conversation') ? 'preload.js done!' : 'preload.js FAILED');
