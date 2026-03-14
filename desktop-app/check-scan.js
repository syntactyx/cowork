const fs = require('fs');
const path = require('path');

const folderPath = 'B:\\Users\\Mason\\Desktop\\Documents and Files\\Programming\\Git\\cowork\\desktop-app';
const EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".md", ".py", ".txt"];
const SKIP_DIRS = ["node_modules", "dist", ".git", "out", ".api_venv", "__pycache__"];

function readDirRecursive(dir) {
    const results = [];
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return results; }
    for (const entry of entries) {
        if (SKIP_DIRS.includes(entry)) { continue; }
        const fullPath = path.join(dir, entry);
        let stat;
        try { stat = fs.statSync(fullPath); } catch (e) { continue; }
        if (stat.isDirectory()) {
            results.push(...readDirRecursive(fullPath));
        } else if (EXTENSIONS.includes(path.extname(entry).toLowerCase())) {
            results.push(fullPath);
        }
    }
    return results;
}

const files = readDirRecursive(folderPath);
console.log('Files found:', files.length);
let total = 0;
files.forEach(f => {
    try {
        const size = fs.readFileSync(f, 'utf-8').length;
        total += size;
        console.log(size, path.relative(folderPath, f));
    } catch (e) {}
});
console.log('Total chars:', total);