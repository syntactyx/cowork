const fs = require('fs');
const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => { if (l.includes('send-btn')) console.log(i+1, JSON.stringify(l.trim())); });
