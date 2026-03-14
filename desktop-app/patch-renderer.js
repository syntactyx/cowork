const fs = require('fs');
let js = fs.readFileSync('src/renderer/renderer.js', 'utf8');

const compactFn = `
// -- Compact & Export ---------------------------------------------------------
async function compactConversation() {
    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) {
        showToast('Nothing to compact - conversation is empty.');
        return;
    }

    const compactBtn = document.getElementById('compact-btn');
    compactBtn.textContent = 'Compacting...';
    compactBtn.disabled = true;

    try {
        const result = await window.cowork.compactConversation({
            messages: conv.messages,
            title: conv.title
        });

        const blob = new Blob([result], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cowork-compact-' + conv.title.replace(/[^a-z0-9]/gi, '_') + '-' + Date.now() + '.md';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Conversation compacted and saved!');

    } catch (err) {
        showToast('Compact failed: ' + err.message);
        console.error('Compact error:', err);
    } finally {
        compactBtn.textContent = '&#128220; Compact';
        compactBtn.disabled = false;
    }
}

`;

js = js.replace('// -- Export conversation', compactFn + '// -- Export conversation');
js = js.replace(
    "document.getElementById('saved-msgs-btn').addEventListener('click', showSavedMessages);",
    "document.getElementById('saved-msgs-btn').addEventListener('click', showSavedMessages);\ndocument.getElementById('compact-btn').addEventListener('click', compactConversation);"
);

fs.writeFileSync('src/renderer/renderer.js', js, 'utf8');
console.log(js.includes('compactConversation') ? 'renderer.js done!' : 'renderer.js FAILED');
