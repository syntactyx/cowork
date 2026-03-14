const fs = require('fs');
let js = fs.readFileSync('src/renderer/renderer.js', 'utf8');

// Remove duplicate button listener
js = js.replace(
    "document.getElementById('compact-btn').addEventListener('click', compactConversation);\ndocument.getElementById('compact-btn').addEventListener('click', compactConversation);",
    "document.getElementById('compact-btn').addEventListener('click', compactConversation);"
);

// Add the function before the export conversation section
const compactFn = [
'// -- Compact & Export ---------------------------------------------------------',
'async function compactConversation() {',
'    const conv = getActiveConversation();',
'    if (!conv || conv.messages.length === 0) {',
'        showToast("Nothing to compact - conversation is empty.");',
'        return;',
'    }',
'    const compactBtn = document.getElementById("compact-btn");',
'    compactBtn.textContent = "Compacting...";',
'    compactBtn.disabled = true;',
'    try {',
'        const result = await window.cowork.compactConversation({',
'            messages: conv.messages,',
'            title: conv.title',
'        });',
'        const blob = new Blob([result], { type: "text/markdown" });',
'        const url = URL.createObjectURL(blob);',
'        const a = document.createElement("a");',
'        a.href = url;',
'        a.download = "cowork-compact-" + conv.title.replace(/[^a-z0-9]/gi, "_") + "-" + Date.now() + ".md";',
'        a.click();',
'        URL.revokeObjectURL(url);',
'        showToast("Conversation compacted and saved!");',
'    } catch (err) {',
'        showToast("Compact failed: " + err.message);',
'        console.error("Compact error:", err);',
'    } finally {',
'        compactBtn.textContent = "Compact";',
'        compactBtn.disabled = false;',
'    }',
'}',
'',
''
].join('\n');

js = js.replace('// \u2500\u2500 Export conversation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', compactFn + '// \u2500\u2500 Export conversation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

fs.writeFileSync('src/renderer/renderer.js', js, 'utf8');

// Verify
const lines = js.split('\n');
const fnLine = lines.findIndex(l => l.includes('async function compactConversation'));
console.log('Function added at line:', fnLine + 1);
console.log('Duplicate listener removed:', !js.includes('compactConversation);\ndocument.getElementById(\'compact-btn\')'));