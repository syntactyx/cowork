const fs = require('fs');
let html = fs.readFileSync('src/renderer/index.html', 'utf8');

// Find and remove duplicate compact button
const single = '<button class="toolbar-btn" id="compact-btn">&#128220; Compact</button>';
const double = single + '\n                ' + single;

if (html.includes(double)) {
    html = html.replace(double, single);
    console.log('Duplicate removed!');
} else {
    console.log('Pattern not found - checking what is there:');
    const lines = html.split('\n');
    lines.forEach((l, i) => {
        if (l.includes('compact-btn')) console.log(i+1, l);
    });
}

fs.writeFileSync('src/renderer/index.html', html, 'utf8');