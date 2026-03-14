const fs = require('fs');
let html = fs.readFileSync('src/renderer/index.html', 'utf8');
html = html.replace(
    '<button class="toolbar-btn" id="analyze-error-btn" title="Analyze Error (Ctrl+E)">&#128269; Analyze Error</button>',
    '<button class="toolbar-btn" id="analyze-error-btn" title="Analyze Error (Ctrl+E)">&#128269; Analyze Error</button>\n                <button class="toolbar-btn" id="compact-btn">&#128220; Compact</button>'
);
fs.writeFileSync('src/renderer/index.html', html, 'utf8');
console.log(html.includes('compact-btn') ? 'index.html done!' : 'index.html FAILED');
