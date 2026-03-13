const fs = require('fs');
let html = fs.readFileSync('src/renderer/index.html', 'utf8');
html = html.replace('<button id="send-btn">?</button>', '<button id="send-btn">&#8594;</button>');
fs.writeFileSync('src/renderer/index.html', html, 'utf8');
console.log('Done');
