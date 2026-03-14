const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const attachBtn = document.getElementById('attach-btn');
const pasteBtn = document.getElementById('paste-btn');
const modelSelect = document.getElementById('model-select');
const conversationsList = document.getElementById('conversations-list');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const systemPromptInput = document.getElementById('system-prompt-input');
const attachmentPreview = document.getElementById('attachment-preview');
const attachmentName = document.getElementById('attachment-name');
const removeAttachment = document.getElementById('remove-attachment');

const DEFAULT_SYSTEM_PROMPT = `You are Cowork, a coding assistant running as a standalone desktop app.
You help with code suggestions, explanations, debugging, and general programming questions.
When the user shares files or code, analyze them carefully before responding.
Be concise and direct. Format code in markdown code blocks.`;

let state = {
    conversations: [],
    activeId: null,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    attachment: null,
    savedMessages: []
};

// ── Marked setup ──────────────────────────────────────────────────────────────
marked.setOptions({
    highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
});

// ── Persistence ───────────────────────────────────────────────────────────────
async function saveState() {
    await window.cowork.saveConversations({
        conversations: state.conversations,
        activeId: state.activeId,
        systemPrompt: state.systemPrompt,
        savedMessages: state.savedMessages
    });
}

async function loadState() {
    const saved = await window.cowork.loadConversations();
    if (saved && saved.conversations && saved.conversations.length > 0) {
        state.conversations = saved.conversations;
        state.activeId = saved.activeId || saved.conversations[0].id;
        state.systemPrompt = saved.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        state.savedMessages = saved.savedMessages || [];
    } else {
        newConversation();
    }
    systemPromptInput.value = state.systemPrompt;
    renderSidebar();
    renderMessages();
}

// ── Conversations ─────────────────────────────────────────────────────────────
function newConversation() {
    const conv = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        lastUpdated: Date.now()
    };
    state.conversations.unshift(conv);
    state.activeId = conv.id;
    saveState();
    renderSidebar();
    renderMessages();
}

function getActiveConversation() {
    return state.conversations.find(c => c.id === state.activeId);
}

function switchConversation(id) {
    state.activeId = id;
    saveState();
    renderSidebar();
    renderMessages();
}

function deleteConversation(id) {
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.conversations.length === 0) {
        newConversation();
        return;
    }
    if (state.activeId === id) {
        state.activeId = state.conversations[0].id;
    }
    saveState();
    renderSidebar();
    renderMessages();
}

function updateTitle(conv) {
    if (conv.messages.length > 0 && conv.title === 'New Chat') {
        const first = conv.messages[0].content;
        const text = typeof first === 'string' ? first : (Array.isArray(first) ? first.find(b => !b._isFile)?.text || '' : '');
        conv.title = text.substring(0, 32) + (text.length > 32 ? '...' : '');
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderSidebar() {
    conversationsList.innerHTML = '';
    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv.id === state.activeId ? ' active' : '');
        item.innerHTML = `
            <span class="conv-title">${conv.title}</span>
            <span class="conv-delete" data-id="${conv.id}">&times;</span>
        `;
        item.querySelector('.conv-title').addEventListener('click', () => switchConversation(conv.id));
        item.querySelector('.conv-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });
        conversationsList.appendChild(item);
    });
}

function renderMessages() {
    messagesEl.innerHTML = '';
    const conv = getActiveConversation();

    if (!conv || conv.messages.length === 0) {
        messagesEl.innerHTML = '<div id="empty-state"><div>&#129302;</div><div>Ask Claude anything</div></div>';
        return;
    }

    conv.messages.forEach((msg, index) => {
        if (msg.role === 'user') {
            addUserMessage(msg.content, false, index);
        } else {
            const div = document.createElement('div');
            div.className = 'message assistant';
            div.innerHTML = '<div class="label">Claude</div><div class="content">' + marked.parse(msg.content) + '</div>';
            div.appendChild(makeMessageActions(index));
            messagesEl.appendChild(div);
        }
    });

    addCodeActions();
    messagesEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    scrollToBottom();
}

function makeMessageActions(index) {
    const div = document.createElement('div');
    div.className = 'message-actions';
    div.innerHTML = `
        <button class="message-action-btn" title="Copy">&#128203; Copy</button>
        <button class="message-action-btn" title="Save">&#128190; Save</button>
        <button class="message-action-btn" title="Export">&#128229; Export</button>
    `;
    const [copyBtn, saveBtn, exportMsgBtn] = div.querySelectorAll('button');
    copyBtn.onclick = () => copyMessage(index);
    saveBtn.onclick = () => saveMessage(index);
    exportMsgBtn.onclick = () => exportMessage(index);
    return div;
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Messages ──────────────────────────────────────────────────────────────────
function addUserMessage(content, scroll = true, index = null) {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) { emptyState.remove(); }

    const div = document.createElement('div');
    div.className = 'message user';

    let html = '<div class="label">You</div>';

    if (Array.isArray(content)) {
        const fileBlock = content.find(b => b.type === 'text' && b._isFile);
        const textBlock = content.find(b => b.type === 'text' && !b._isFile);
        if (fileBlock) {
            html += `<div class="attachment-badge">&#128206; ${fileBlock._fileName}</div><br>`;
        }
        if (textBlock) {
            html += textBlock.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
        }
    } else {
        html += content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    }

    div.innerHTML = html;
    if (index !== null) { div.appendChild(makeMessageActions(index)); }
    messagesEl.appendChild(div);
    if (scroll) { scrollToBottom(); }
}

let currentAssistantEl = null;
let currentContent = '';

function startAssistantMessage() {
    currentContent = '';
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = '<div class="label">Claude</div><div class="content"><span class="cursor"></span></div>';
    messagesEl.appendChild(div);
    currentAssistantEl = div.querySelector('.content');
    scrollToBottom();
}

function appendChunk(chunk) {
    currentContent += chunk;
    currentAssistantEl.innerHTML = marked.parse(currentContent) + '<span class="cursor"></span>';
    addCodeActions();
    currentAssistantEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    scrollToBottom();
}

function finalizeMessage() {
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
}

function addCodeActions() {
    messagesEl.querySelectorAll('pre:not([data-actions-added])').forEach(pre => {
        pre.setAttribute('data-actions-added', 'true');
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'code-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(pre.querySelector('code').textContent);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        };

        actionsDiv.appendChild(copyBtn);
        pre.appendChild(actionsDiv);
    });
}

// ── Message Actions ───────────────────────────────────────────────────────────
function copyMessage(index) {
    const conv = getActiveConversation();
    if (!conv || !conv.messages[index]) { return; }
    const msg = conv.messages[index];
    let text = Array.isArray(msg.content)
        ? msg.content.map(b => b._isFile ? `[File: ${b._fileName}]\n${b.text || ''}` : b.text).join('\n')
        : msg.content;
    text = `${msg.role === 'user' ? 'You' : 'Claude'}:\n${text}`;
    navigator.clipboard.writeText(text).then(() => showToast('Message copied to clipboard!'));
}

function exportMessage(index) {
    const conv = getActiveConversation();
    if (!conv || !conv.messages[index]) { return; }
    const msg = conv.messages[index];
    let content = Array.isArray(msg.content)
        ? msg.content.map(b => b._isFile ? `[File: ${b._fileName}]\n${b.text || ''}` : b.text).join('\n')
        : msg.content;
    const md = `# ${msg.role === 'user' ? 'You' : 'Claude'}\n\n${content}\n\n---\n\nExported from Cowork on ${new Date().toLocaleString()}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cowork-message-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Message exported!');
}

// ── Save Messages ─────────────────────────────────────────────────────────────
function saveMessage(index) {
    const conv = getActiveConversation();
    if (!conv || !conv.messages[index]) { return; }
    showSaveMessageModal(conv.messages[index], conv.title);
}

function showSaveMessageModal(message, convTitle) {
    const existing = document.getElementById('save-msg-modal');
    if (existing) { existing.remove(); }

    const defaultTitle = `${convTitle} - ${message.role === 'user' ? 'Question' : 'Answer'}`;
    const div = document.createElement('div');
    div.id = 'save-msg-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;';
    div.innerHTML = `
        <div style="background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:480px;max-width:90vw;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="font-size:14px;color:#fff;">&#128190; Save Message</h3>
                <button id="close-save-modal-btn" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">&#215;</button>
            </div>
            <input id="save-title-input" type="text" value="${defaultTitle.replace(/"/g, '&quot;')}" placeholder="Title..."
                style="background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#d4d4d4;font-size:13px;padding:8px 12px;outline:none;width:100%;">
            <input id="save-tags-input" type="text" placeholder="Tags (comma separated, optional)..."
                style="background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#d4d4d4;font-size:13px;padding:8px 12px;outline:none;width:100%;">
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="cancel-save-btn" style="background:#3c3c3c;border:none;color:#ccc;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>
                <button id="confirm-save-btn" style="background:#0e7fd4;border:none;color:white;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Save to Collection</button>
            </div>
        </div>`;

    document.body.appendChild(div);
    document.getElementById('save-title-input').focus();
    document.getElementById('close-save-modal-btn').onclick = closeSaveModal;
    document.getElementById('cancel-save-btn').onclick = closeSaveModal;
    document.getElementById('confirm-save-btn').onclick = () => {
        const title = document.getElementById('save-title-input').value.trim();
        const tags = document.getElementById('save-tags-input').value.split(',').map(t => t.trim()).filter(Boolean);
        if (!title) {
            document.getElementById('save-title-input').style.borderColor = '#f48771';
            return;
        }
        state.savedMessages.unshift({
            id: Date.now().toString(),
            title,
            content: message.content,
            role: message.role,
            savedAt: Date.now(),
            tags
        });
        closeSaveModal();
        saveState();
        showToast('Message saved to collection!');
    };
}

function closeSaveModal() {
    const m = document.getElementById('save-msg-modal');
    if (m) { m.remove(); }
}

function showSavedMessages() {
    const existing = document.getElementById('saved-msgs-modal');
    if (existing) { existing.remove(); }

    const listHtml = !state.savedMessages || state.savedMessages.length === 0
        ? '<p style="text-align:center;color:#666;padding:20px;">No saved messages yet.</p>'
        : state.savedMessages.map(s => `
            <div style="border:1px solid #3c3c3c;border-radius:6px;padding:14px;margin-bottom:10px;background:#1e1e1e;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                    <strong style="color:#d4d4d4;font-size:13px;">${s.title}</strong>
                    <span style="font-size:11px;color:#666;">${new Date(s.savedAt).toLocaleDateString()}</span>
                </div>
                <div style="margin-bottom:8px;">
                    <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${s.role === 'user' ? '#0e4f8b' : '#2d2d2d'};color:${s.role === 'user' ? '#fff' : '#aaa'};border:1px solid #3c3c3c;">
                        ${s.role === 'user' ? 'You' : 'Claude'}
                    </span>
                    ${s.tags.map(t => `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#2d2d2d;color:#888;margin-left:4px;">${t}</span>`).join('')}
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="viewSavedMessage('${s.id}')" style="background:#3c3c3c;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">View</button>
                    <button onclick="copySavedMessage('${s.id}')" style="background:#3c3c3c;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Copy</button>
                    <button onclick="deleteSavedMessage('${s.id}')" style="background:#3c3c3c;border:1px solid #555;color:#f48771;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Delete</button>
                </div>
            </div>`).join('');

    const div = document.createElement('div');
    div.id = 'saved-msgs-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;';
    div.innerHTML = `
        <div style="background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:600px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="font-size:14px;color:#fff;">&#128190; Saved Messages</h3>
                <button id="close-saved-msgs-btn" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">&#215;</button>
            </div>
            <div style="overflow-y:auto;max-height:65vh;">${listHtml}</div>
        </div>`;

    document.body.appendChild(div);
    document.getElementById('close-saved-msgs-btn').onclick = closeSavedMessages;
}

function closeSavedMessages() {
    const m = document.getElementById('saved-msgs-modal');
    if (m) { m.remove(); }
}

function viewSavedMessage(id) {
    const saved = state.savedMessages.find(s => s.id === id);
    if (!saved) { return; }

    let content = saved.content;
    if (Array.isArray(content)) {
        content = content.map(b => b._isFile ? `[File: ${b._fileName}]\n${b.text || ''}` : b.text).join('\n');
    }

    const div = document.createElement('div');
    div.id = 'view-saved-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;display:flex;align-items:center;justify-content:center;';
    div.innerHTML = `
        <div style="background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:700px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="font-size:14px;color:#fff;">${saved.title}</h3>
                <button id="close-view-saved-btn" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">&#215;</button>
            </div>
            <div style="overflow-y:auto;max-height:65vh;padding:16px;background:#1e1e1e;border-radius:6px;" class="assistant">
                ${marked.parse(content)}
            </div>
        </div>`;

    document.body.appendChild(div);
    document.getElementById('close-view-saved-btn').onclick = () => div.remove();
    div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
}

function copySavedMessage(id) {
    const saved = state.savedMessages.find(s => s.id === id);
    if (!saved) { return; }
    let text = Array.isArray(saved.content)
        ? saved.content.map(b => b._isFile ? `[File: ${b._fileName}]\n${b.text || ''}` : b.text).join('\n')
        : saved.content;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
}

function deleteSavedMessage(id) {
    if (!confirm('Delete this saved message?')) { return; }
    state.savedMessages = state.savedMessages.filter(s => s.id !== id);
    saveState();
    closeSavedMessages();
    showSavedMessages();
    showToast('Saved message deleted.');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#3c3c3c;color:#d4d4d4;padding:10px 18px;border-radius:6px;border:1px solid #555;font-size:13px;z-index:500;';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ── Error Analysis ────────────────────────────────────────────────────────────
function showErrorModal() {
    document.getElementById('error-modal').style.display = 'flex';
    document.getElementById('error-input').focus();
}

function closeErrorModal() {
    document.getElementById('error-modal').style.display = 'none';
    document.getElementById('error-input').value = '';
}

function detectLanguage(fileName) {
    if (!fileName) { return ''; }
    const ext = fileName.split('.').pop().toLowerCase();
    const map = { js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript', py:'python',
        java:'java', cpp:'cpp', c:'c', cs:'csharp', rb:'ruby', go:'go', rs:'rust', php:'php',
        swift:'swift', kt:'kotlin', r:'r', sql:'sql', html:'html', css:'css', json:'json',
        xml:'xml', yaml:'yaml', yml:'yaml', md:'markdown' };
    return map[ext] || ext;
}

async function analyzeError() {
    const errorText = document.getElementById('error-input').value.trim();
    if (!errorText) {
        document.getElementById('error-input').style.borderColor = '#f48771';
        setTimeout(() => { document.getElementById('error-input').style.borderColor = '#555'; }, 1500);
        return;
    }
    closeErrorModal();

    let prompt = `Please analyze this error and help me understand what's causing it:\n\n\`\`\`\n${errorText}\n\`\`\`\n\n`;
    if (state.attachment) {
        prompt += `The error is related to this code:\n\n\`\`\`${detectLanguage(state.attachment.fileName)}\n${state.attachment.content}\n\`\`\`\n\n`;
    }
    prompt += `Please explain:\n1. What this error means\n2. What's likely causing it\n3. How to fix it\n4. Any best practices to prevent this error in the future`;

    inputEl.value = prompt;
    inputEl.dispatchEvent(new Event('input'));
    await sendMessage();
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text && !state.attachment) { return; }

    const conv = getActiveConversation();
    if (!conv) { return; }

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    let userContent;

    if (state.attachment) {
        userContent = [
            {
                type: 'text',
                text: `File: ${state.attachment.fileName}\n\n${state.attachment.content}`,
                _isFile: true,
                _fileName: state.attachment.fileName
            },
            { type: 'text', text: text || 'Please review this file.' }
        ];
        clearAttachment();
    } else {
        userContent = text;
    }

    addUserMessage(userContent);
    startAssistantMessage();

    const apiMessages = conv.messages.map(m => ({
        role: m.role,
        content: Array.isArray(m.content)
            ? m.content.map(b => ({ type: b.type, text: b.text }))
            : m.content
    }));

    const userApiContent = Array.isArray(userContent)
        ? userContent.map(b => ({ type: b.type, text: b.text }))
        : userContent;

    apiMessages.push({ role: 'user', content: userApiContent });

    conv.messages.push({ role: 'user', content: userContent });
    updateTitle(conv);
    conv.lastUpdated = Date.now();

    window.cowork.removeAllListeners('stream-chunk');
    window.cowork.removeAllListeners('stream-done');
    window.cowork.removeAllListeners('stream-error');

    window.cowork.onChunk(chunk => appendChunk(chunk));

    window.cowork.onDone(() => {
        conv.messages.push({ role: 'assistant', content: currentContent });
        finalizeMessage();
        sendBtn.disabled = false;
        saveState();
        renderSidebar();
    });

    window.cowork.onError(err => {
        if (currentAssistantEl) {
            currentAssistantEl.innerHTML = `<span style="color:#f48771">Error: ${err}</span>`;
            currentAssistantEl = null;
        }
        sendBtn.disabled = false;
    });

    await window.cowork.sendMessage({
        messages: apiMessages,
        systemPrompt: state.systemPrompt,
        model: modelSelect.value
    });
}

// ── Attachments ───────────────────────────────────────────────────────────────
function clearAttachment() {
    state.attachment = null;
    attachmentPreview.classList.remove('visible');
    attachmentName.textContent = '';
}

attachBtn.addEventListener('click', async () => {
    const file = await window.cowork.openFile();
    if (file) {
        state.attachment = file;
        attachmentName.textContent = file.fileName;
        attachmentPreview.classList.add('visible');
    }
});

removeAttachment.addEventListener('click', clearAttachment);

// ── Paste as code ─────────────────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            const pos = inputEl.selectionStart;
            const formatted = '```\n' + text + '\n```';
            inputEl.value = inputEl.value.slice(0, pos) + formatted + inputEl.value.slice(pos);
            inputEl.selectionStart = inputEl.selectionEnd = pos + formatted.length;
            inputEl.focus();
            inputEl.dispatchEvent(new Event('input'));
        }
    } catch (err) {
        console.error('Clipboard error:', err);
    }
});

// -- Compact & Export ---------------------------------------------------------
async function compactConversation() {
    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) {
        showToast("Nothing to compact - conversation is empty.");
        return;
    }
    const compactBtn = document.getElementById("compact-btn");
    compactBtn.textContent = "Compacting...";
    compactBtn.disabled = true;
    try {
        const result = await window.cowork.compactConversation({
            messages: conv.messages,
            title: conv.title
        });
        const blob = new Blob([result], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cowork-compact-" + conv.title.replace(/[^a-z0-9]/gi, "_") + "-" + Date.now() + ".md";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Conversation compacted and saved!");
    } catch (err) {
        showToast("Compact failed: " + err.message);
        console.error("Compact error:", err);
    } finally {
        compactBtn.textContent = "Compact";
        compactBtn.disabled = false;
    }
}

// ── Export conversation ───────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) { return; }

    const lines = conv.messages.map(m => {
        const role = m.role === 'user' ? 'You' : 'Claude';
        const content = Array.isArray(m.content)
            ? m.content.map(b => b.text).join('\n')
            : m.content;
        return `## ${role}\n\n${content}`;
    });

    const md = `# ${conv.title}\n\n${lines.join('\n\n---\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
    const conv = getActiveConversation();
    if (conv) {
        conv.messages = [];
        conv.title = 'New Chat';
        conv.lastUpdated = Date.now();
        saveState();
        renderSidebar();
        renderMessages();
    }
});

// ── System prompt modal ───────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
    systemPromptInput.value = state.systemPrompt;
    modalOverlay.classList.add('visible');
});

modalCancel.addEventListener('click', () => {
    modalOverlay.classList.remove('visible');
});

modalSave.addEventListener('click', () => {
    state.systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    modalOverlay.classList.remove('visible');
    saveState();
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) { modalOverlay.classList.remove('visible'); }
});

// ── Input ─────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
});

newChatBtn.addEventListener('click', newConversation);

// ── Error analysis button ─────────────────────────────────────────────────────
document.getElementById('analyze-error-btn').addEventListener('click', showErrorModal);
document.getElementById('error-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('error-modal')) { closeErrorModal(); }
});
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); showErrorModal(); }
});

// ── Saved messages button ─────────────────────────────────────────────────────
document.getElementById('saved-msgs-btn').addEventListener('click', showSavedMessages);
document.getElementById('compact-btn').addEventListener('click', compactConversation);

// ── API Key ───────────────────────────────────────────────────────────────────
const apiModalOverlay = document.getElementById('api-modal-overlay');
const apiKeyInput = document.getElementById('api-key-input');
const apiKeySave = document.getElementById('api-key-save');

async function initApiKey() {
    const key = await window.cowork.getApiKey();
    if (key) {
        apiModalOverlay.style.display = 'none';
    } else {
        apiModalOverlay.style.display = 'flex';
    }
}

apiKeySave.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (key.startsWith('sk-ant-')) {
        await window.cowork.setApiKey(key);
        apiModalOverlay.style.display = 'none';
    } else {
        apiKeyInput.style.borderColor = '#f48771';
        setTimeout(() => { apiKeyInput.style.borderColor = '#555'; }, 1500);
    }
});

apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { apiKeySave.click(); }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadState();
initApiKey();
