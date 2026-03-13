const fs = require('fs');
let js = fs.readFileSync('src/renderer/renderer.js', 'utf8');

// Fix finalizeMessage - remove the broken button injection
js = js.replace(
`function finalizeMessage() {
    if (currentAssistantEl) {
        const parentDiv = currentAssistantEl.parentElement;
        currentAssistantEl.innerHTML = marked.parse(currentContent);
        addCodeActions();
        currentAssistantEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
        // Add action buttons to finalized message
        const conv = getActiveConversation();
        if (conv) {
            parentDiv.appendChild(makeMessageActions(conv.messages.length)); // will be index after push
        }
        currentAssistantEl = null;
        currentContent = '';
        scrollToBottom();
    }
}`,
`function finalizeMessage() {
    if (currentAssistantEl) {
        currentAssistantEl.innerHTML = marked.parse(currentContent);
        addCodeActions();
        currentAssistantEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
        currentAssistantEl = null;
        currentContent = '';
        scrollToBottom();
    }
}`
);

// Fix onDone - add renderMessages() so all buttons get correct indices
js = js.replace(
`    window.cowork.onDone(() => {
        conv.messages.push({ role: 'assistant', content: currentContent });
        finalizeMessage();
        sendBtn.disabled = false;
        saveState();
        renderSidebar();
    });`,
`    window.cowork.onDone(() => {
        conv.messages.push({ role: 'assistant', content: currentContent });
        finalizeMessage();
        sendBtn.disabled = false;
        saveState();
        renderSidebar();
        renderMessages();
    });`
);

fs.writeFileSync('src/renderer/renderer.js', js, 'utf8');
console.log('Done');
