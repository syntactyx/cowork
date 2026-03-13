const fs = require('fs');

let html = fs.readFileSync('src/renderer/index.html', 'utf8');
html = html.replace(/>\?\?<\/div>\s*<div>Ask Claude/g, '>&#129302;</div><div>Ask Claude');
html = html.replace(/id="send-btn">\?\?</g, 'id="send-btn">&#8594;<');
fs.writeFileSync('src/renderer/index.html', html, 'utf8');
console.log('HTML done');

let js = fs.readFileSync('src/renderer/renderer.js', 'utf8');
js = js.replace(/<div>\?\?<\/div>/g, '<div>&#129302;</div>');
fs.writeFileSync('src/renderer/renderer.js', js, 'utf8');
console.log('JS done');
