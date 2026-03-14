const fs = require('fs');
let main = fs.readFileSync('src/main.js', 'utf8');

main = main.replace(
    'const SKIP_DIRS = ["node_modules", "dist", ".git", "out", ".api_venv", "__pycache__"];',
    'const SKIP_DIRS = ["node_modules", "dist", ".git", "out", ".api_venv", "__pycache__"];\n    const SKIP_FILES = ["package-lock.json", "yarn.lock", "fix-pkg.js", "fix-pkg2.js", "fix-renderer.js", "fix-send.js", "fix-compact-btn.js", "patch-html.js", "patch-main.js", "patch-main2.js", "patch-preload.js", "patch-renderer.js", "write-main.js", "build-scan.js", "check-scan.js", "add-api-modal.js", "add-api-key-logic.js"];'
);

// Also add SKIP_FILES check in the file loop
main = main.replace(
    '} else if (EXTENSIONS.includes(path.extname(entry).toLowerCase())) {',
    '} else if (EXTENSIONS.includes(path.extname(entry).toLowerCase()) && !SKIP_FILES.includes(entry)) {'
);

fs.writeFileSync('src/main.js', main, 'utf8');
console.log(main.includes('SKIP_FILES') ? 'Done!' : 'FAILED');