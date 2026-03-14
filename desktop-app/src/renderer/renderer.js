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

const DEFAULT_SYSTEM_PROMPT = `You are Cowork, a coding assistant running as a standalone desktop app.
You help with code suggestions, explanations, debugging, and general programming questions.
When the user shares files or code, analyze them carefully before responding.
Be concise and direct. Format code in markdown code blocks.`;

let state = {
    conversations: [],
    activeId: null,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    attachment: null,       // kept for legacy read compatibility
    attachments: [],
    savedMessages: [],
    autoTrigger: {
        enabled: false,
        threshold: 50,
        confirm: true
    }
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
let _stateReady = false;

async function saveState() {
    if (!_stateReady) return;
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
        if (saved.autoTrigger) {
            state.autoTrigger = Object.assign({}, state.autoTrigger, saved.autoTrigger);
        }
    }
    _stateReady = true;
    if (state.conversations.length === 0) {
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
            <span class="conv-delete" data-id="${conv.id}" title="Delete this conversation">&times;</span>
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
        <button class="message-action-btn" title="Copy message to clipboard">&#128203; Copy</button>
        <button class="message-action-btn" title="Save message to collection">&#128190; Save</button>
        <button class="message-action-btn" title="Export message as a markdown file">&#128229; Export</button>
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
        const fileBlocks = content.filter(b => b.type === 'text' && b._isFile);
        const textBlock = content.find(b => b.type === 'text' && !b._isFile);
        fileBlocks.forEach(fb => {
            html += `<div class="attachment-badge">&#128206; ${fb._fileName}</div>`;
        });
        if (fileBlocks.length > 0) { html += '<br>'; }
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
        copyBtn.title = 'Copy code to clipboard';
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

    const div = document.createElement('div');
    div.id = 'saved-msgs-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;';

    const inner = document.createElement('div');
    inner.style.cssText = 'background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:600px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;gap:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = '<h3 style="font-size:14px;color:#fff;">&#128190; Saved Messages</h3>';
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:18px;cursor:pointer;';
    closeBtn.innerHTML = '&#215;';
    closeBtn.title = 'Close saved messages';
    closeBtn.addEventListener('click', closeSavedMessages);
    header.appendChild(closeBtn);
    inner.appendChild(header);

    // List
    const listEl = document.createElement('div');
    listEl.style.cssText = 'overflow-y:auto;max-height:65vh;';

    if (!state.savedMessages || state.savedMessages.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">No saved messages yet.</p>';
    } else {
        state.savedMessages.forEach(s => {
            const card = document.createElement('div');
            card.style.cssText = 'border:1px solid #3c3c3c;border-radius:6px;padding:14px;margin-bottom:10px;background:#1e1e1e;';

            // Title row
            const titleRow = document.createElement('div');
            titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;';
            titleRow.innerHTML = '<strong style="color:#d4d4d4;font-size:13px;">' + s.title.replace(/</g,'&lt;') + '</strong>'
                + '<span style="font-size:11px;color:#666;">' + new Date(s.savedAt).toLocaleDateString() + '</span>';
            card.appendChild(titleRow);

            // Tags row
            const tagsRow = document.createElement('div');
            tagsRow.style.cssText = 'margin-bottom:8px;';
            const roleBadge = document.createElement('span');
            roleBadge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;'
                + 'background:' + (s.role === 'user' ? '#0e4f8b' : '#2d2d2d') + ';'
                + 'color:' + (s.role === 'user' ? '#fff' : '#aaa') + ';'
                + 'border:1px solid #3c3c3c;';
            roleBadge.textContent = s.role === 'user' ? 'You' : 'Claude';
            tagsRow.appendChild(roleBadge);
            (s.tags || []).forEach(t => {
                const tag = document.createElement('span');
                tag.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:#2d2d2d;color:#888;margin-left:4px;';
                tag.textContent = t;
                tagsRow.appendChild(tag);
            });
            card.appendChild(tagsRow);

            // Action buttons — bound with addEventListener, not inline onclick
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:6px;';

            const viewBtn = document.createElement('button');
            viewBtn.style.cssText = 'background:#3c3c3c;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;';
            viewBtn.textContent = 'View';
            viewBtn.title = 'View full saved message';
            viewBtn.addEventListener('click', () => viewSavedMessage(s.id));

            const copyBtn = document.createElement('button');
            copyBtn.style.cssText = 'background:#3c3c3c;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;';
            copyBtn.textContent = 'Copy';
            copyBtn.title = 'Copy saved message to clipboard';
            copyBtn.addEventListener('click', () => copySavedMessage(s.id));

            const delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:#3c3c3c;border:1px solid #555;color:#f48771;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;';
            delBtn.textContent = 'Delete';
            delBtn.title = 'Permanently delete this saved message';
            delBtn.addEventListener('click', () => deleteSavedMessage(s.id));

            btnRow.appendChild(viewBtn);
            btnRow.appendChild(copyBtn);
            btnRow.appendChild(delBtn);
            card.appendChild(btnRow);

            listEl.appendChild(card);
        });
    }

    inner.appendChild(listEl);
    div.appendChild(inner);
    document.body.appendChild(div);
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
    if (state.attachments.length > 0) {
        state.attachments.forEach(f => {
            prompt += `The error is related to this code:\n\n\`\`\`${detectLanguage(f.fileName)}\n${f.content}\n\`\`\`\n\n`;
        });
    }
    prompt += `Please explain:\n1. What this error means\n2. What's likely causing it\n3. How to fix it\n4. Any best practices to prevent this error in the future`;

    inputEl.value = prompt;
    inputEl.dispatchEvent(new Event('input'));
    await sendMessage();
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text && state.attachments.length === 0) { return; }

    const conv = getActiveConversation();
    if (!conv) { return; }

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    let userContent;

    if (state.attachments.length > 0) {
        userContent = state.attachments.map(f => ({
            type: 'text',
            text: `File: ${f.fileName}\n\n${f.content}`,
            _isFile: true,
            _fileName: f.fileName
        }));
        userContent.push({ type: 'text', text: text || 'Please review these files.' });
        clearAttachments();
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
        checkAutoTrigger(conv);
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
function renderAttachmentPreview() {
    attachmentPreview.innerHTML = '';
    if (state.attachments.length === 0) {
        attachmentPreview.classList.remove('visible');
        return;
    }
    attachmentPreview.classList.add('visible');
    state.attachments.forEach((file, i) => {
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#3c3c3c;border:1px solid #555;border-radius:4px;padding:2px 8px;font-size:11px;color:#d4d4d4;';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = '📎 ' + file.fileName;
        const removeBtn = document.createElement('button');
        removeBtn.style.cssText = 'background:none;border:none;color:#888;cursor:pointer;font-size:13px;padding:0 2px;line-height:1;';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove ' + file.fileName;
        removeBtn.addEventListener('click', () => {
            state.attachments.splice(i, 1);
            renderAttachmentPreview();
        });
        badge.appendChild(nameSpan);
        badge.appendChild(removeBtn);
        attachmentPreview.appendChild(badge);
    });
}

function clearAttachments() {
    state.attachments = [];
    renderAttachmentPreview();
}

attachBtn.addEventListener('click', async () => {
    const files = await window.cowork.openFile();
    if (files && files.length > 0) {
        state.attachments.push(...files);
        renderAttachmentPreview();
    }
});

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

// -- Scan Project ------------------------------------------------------------
async function scanProject() {
    const folderPath = await window.cowork.openFolder();
    if (!folderPath) { return; }

    const scanBtn = document.getElementById("scan-project-btn");
    scanBtn.textContent = "Scanning...";
    scanBtn.disabled = true;

    try {
        const { briefing, fileCount, folderName } = await window.cowork.scanProject({ folderPath });

        const blob = new Blob([briefing], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cowork-scan-" + folderName.replace(/[^a-z0-9]/gi, "_") + "-" + Date.now() + ".md";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Scanned " + fileCount + " files from " + folderName + "!");

    } catch (err) {
        showToast("Scan failed: " + err.message);
        console.error("Scan error:", err);
    } finally {
        scanBtn.textContent = "Scan Project";
        scanBtn.disabled = false;
    }
}

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
        const ts = Date.now().toString();
        const blob = new Blob([result], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cowork-compact-" + conv.title.replace(/[^a-z0-9]/gi, "_") + "-" + ts + ".md";
        a.click();
        URL.revokeObjectURL(url);
        // Save briefing for diff mode (fire-and-forget, non-blocking)
        window.cowork.saveBriefing({ content: result, title: conv.title, timestamp: ts })
            .catch(err => console.error("Failed to save briefing for diff:", err));
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

    // Inject auto-trigger controls if not already present
    if (!document.getElementById('autotrigger-section')) {
        const section = document.createElement('div');
        section.id = 'autotrigger-section';
        section.style.cssText = 'border-top:1px solid #3c3c3c;padding-top:14px;display:flex;flex-direction:column;gap:10px;';
        section.innerHTML = [
            '<div style="font-size:12px;font-weight:600;color:#aaa;letter-spacing:0.05em;">AUTO-TRIGGER COMPACTION</div>',
            '<div style="display:flex;align-items:center;gap:10px;">',
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#d4d4d4;">',
                    '<input type="checkbox" id="at-enabled" style="accent-color:#0e7fd4;width:14px;height:14px;">',
                    'Enable auto-trigger',
                '</label>',
            '</div>',
            '<div style="display:flex;align-items:center;gap:10px;">',
                '<label style="font-size:13px;color:#d4d4d4;white-space:nowrap;">Threshold (messages):</label>',
                '<input type="number" id="at-threshold" min="10" max="200" step="5"',
                    'style="width:70px;background:#3c3c3c;border:1px solid #555;border-radius:6px;',
                    'color:#d4d4d4;font-size:13px;padding:5px 8px;outline:none;">',
            '</div>',
            '<div style="display:flex;align-items:center;gap:10px;">',
                '<label style="font-size:13px;color:#d4d4d4;white-space:nowrap;">When triggered:</label>',
                '<select id="at-behavior"',
                    'style="background:#3c3c3c;border:1px solid #555;border-radius:6px;',
                    'color:#d4d4d4;font-size:13px;padding:5px 8px;outline:none;cursor:pointer;">',
                    '<option value="confirm">Ask before compacting</option>',
                    '<option value="silent">Compact silently</option>',
                '</select>',
            '</div>'
        ].join('');

        // Insert before the modal button row (last child)
        const modalContent = systemPromptInput.closest('div') || modalOverlay.querySelector('div');
        const buttonRow = modalOverlay.querySelector('div > div:last-child') || modalSave.parentElement;
        buttonRow.parentElement.insertBefore(section, buttonRow);
    }

    // Populate controls from state
    document.getElementById('at-enabled').checked = state.autoTrigger.enabled;
    document.getElementById('at-threshold').value = state.autoTrigger.threshold;
    document.getElementById('at-behavior').value = state.autoTrigger.confirm ? 'confirm' : 'silent';

    modalOverlay.classList.add('visible');
});

modalCancel.addEventListener('click', () => {
    modalOverlay.classList.remove('visible');
});

modalSave.addEventListener('click', () => {
    state.systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;

    // Read auto-trigger settings if the controls were injected
    const atEnabled = document.getElementById('at-enabled');
    const atThreshold = document.getElementById('at-threshold');
    const atBehavior = document.getElementById('at-behavior');
    if (atEnabled && atThreshold && atBehavior) {
        const threshold = parseInt(atThreshold.value, 10);
        state.autoTrigger = {
            enabled: atEnabled.checked,
            threshold: isNaN(threshold) || threshold < 10 ? 50 : threshold,
            confirm: atBehavior.value === 'confirm'
        };
    }

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
document.getElementById('scan-project-btn').addEventListener('click', scanProject);
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

function showApiKeyModal() {
    apiKeyInput.value = '';
    apiKeyInput.style.borderColor = '#555';
    apiModalOverlay.style.display = 'flex';
    setTimeout(() => apiKeyInput.focus(), 50);
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

// ── Diff Mode ────────────────────────────────────────────────────────────────

/**
 * LCS-based line diff.
 * Returns array of {type: 'same'|'add'|'remove', text: string}.
 */
function diffLines(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    // Build LCS table
    const dp = [];
    for (let i = 0; i <= m; i++) {
        dp[i] = new Array(n + 1).fill(0);
    }
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            result.unshift({ type: 'same', text: oldLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'add', text: newLines[j - 1] });
            j--;
        } else {
            result.unshift({ type: 'remove', text: oldLines[i - 1] });
            i--;
        }
    }
    return result;
}

/**
 * Parse a briefing into sections keyed by heading text.
 * Sections are split on ## headings. Content before the first ## goes into '__preamble__'.
 */
function parseBriefingSections(content) {
    const sections = {};
    const lines = content.split('');
    let current = '__preamble__';
    let buffer = [];
    for (const line of lines) {
        if (line.startsWith('## ')) {
            sections[current] = buffer.join('').trim();
            current = line.slice(3).trim();
            buffer = [];
        } else {
            buffer.push(line);
        }
    }
    sections[current] = buffer.join('').trim();
    return sections;
}

/**
 * Render a line diff array as HTML with colored lines.
 */
function renderLineDiff(diffResult) {
    if (diffResult.every(d => d.type === 'same')) {
        return '<div style="color:#666;font-style:italic;padding:6px 0;">No changes in this section.</div>';
    }
    return diffResult.map(d => {
        const escaped = d.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '&nbsp;';
        if (d.type === 'add') {
            return '<div style="background:#1a3a1a;color:#89d185;padding:1px 8px;white-space:pre-wrap;font-family:monospace;font-size:12px;">+ ' + escaped + '</div>';
        } else if (d.type === 'remove') {
            return '<div style="background:#3a1a1a;color:#f48771;padding:1px 8px;white-space:pre-wrap;font-family:monospace;font-size:12px;text-decoration:line-through;">- ' + escaped + '</div>';
        } else {
            return '<div style="color:#888;padding:1px 8px;white-space:pre-wrap;font-family:monospace;font-size:12px;">&nbsp;&nbsp;' + escaped + '</div>';
        }
    }).join('');
}

async function showDiffModal() {
    const existing = document.getElementById('diff-modal');
    if (existing) { existing.remove(); }

    let briefings = [];
    try {
        briefings = await window.cowork.listBriefings();
    } catch (err) {
        showToast('Could not load briefings: ' + err.message);
        return;
    }

    if (briefings.length < 2) {
        showToast('Need at least 2 saved briefings to diff. Run Compact on a conversation first.');
        return;
    }

    function formatLabel(b) {
        const d = new Date(parseInt(b.timestamp));
        const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return b.title + ' — ' + dateStr;
    }

    const optionsHtml = briefings.map((b, i) =>
        '<option value="' + i + '">' + formatLabel(b).replace(/"/g, '&quot;') + '</option>'
    ).join('');

    const div = document.createElement('div');
    div.id = 'diff-modal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:300;display:flex;align-items:center;justify-content:center;';
    div.innerHTML = [
        '<div style="background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:860px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;gap:14px;">',
            '<div style="display:flex;justify-content:space-between;align-items:center;">',
                '<h3 style="font-size:14px;color:#fff;">&#9141; Diff Briefings</h3>',
                '<button id="close-diff-modal-btn" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">&#215;</button>',
            '</div>',
            '<div style="display:flex;gap:12px;align-items:flex-end;">',
                '<div style="flex:1;">',
                    '<div style="font-size:11px;color:#888;margin-bottom:4px;">Older (A)</div>',
                    '<select id="diff-select-a" style="width:100%;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#d4d4d4;font-size:12px;padding:6px 10px;">',
                        optionsHtml,
                    '</select>',
                '</div>',
                '<div style="flex:1;">',
                    '<div style="font-size:11px;color:#888;margin-bottom:4px;">Newer (B)</div>',
                    '<select id="diff-select-b" style="width:100%;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#d4d4d4;font-size:12px;padding:6px 10px;">',
                        optionsHtml,
                    '</select>',
                '</div>',
                '<button id="run-diff-btn" style="background:#0e7fd4;border:none;color:#fff;padding:7px 18px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;">Compare</button>',
            '</div>',
            '<div id="diff-output" style="overflow-y:auto;flex:1;min-height:200px;max-height:65vh;background:#1e1e1e;border-radius:6px;padding:12px;">',
                '<div style="color:#555;text-align:center;padding:40px 0;font-size:13px;">Select two briefings and click Compare.</div>',
            '</div>',
            '<div style="display:flex;gap:12px;font-size:11px;color:#666;align-items:center;">',
                '<span style="background:#1a3a1a;color:#89d185;padding:2px 8px;border-radius:3px;font-family:monospace;">+ added</span>',
                '<span style="background:#3a1a1a;color:#f48771;padding:2px 8px;border-radius:3px;font-family:monospace;text-decoration:line-through;">- removed</span>',
                '<span style="color:#888;padding:2px 8px;">unchanged</span>',
            '</div>',
        '</div>'
    ].join('');

    document.body.appendChild(div);

    // Default selects: A = index 1 (older), B = index 0 (newest)
    document.getElementById('diff-select-a').value = '1';
    document.getElementById('diff-select-b').value = '0';

    document.getElementById('close-diff-modal-btn').onclick = () => div.remove();
    div.addEventListener('click', e => { if (e.target === div) div.remove(); });

    document.getElementById('run-diff-btn').addEventListener('click', async () => {
        const idxA = parseInt(document.getElementById('diff-select-a').value);
        const idxB = parseInt(document.getElementById('diff-select-b').value);

        if (idxA === idxB) {
            showToast('Select two different briefings to compare.');
            return;
        }

        const btn = document.getElementById('run-diff-btn');
        btn.textContent = 'Loading...';
        btn.disabled = true;

        const outputEl = document.getElementById('diff-output');
        outputEl.innerHTML = '<div style="color:#555;text-align:center;padding:40px 0;font-size:13px;">Computing diff...</div>';

        try {
            const [contentA, contentB] = await Promise.all([
                window.cowork.loadBriefing({ filename: briefings[idxA].filename }),
                window.cowork.loadBriefing({ filename: briefings[idxB].filename })
            ]);

            const sectionsA = parseBriefingSections(contentA);
            const sectionsB = parseBriefingSections(contentB);

            // Union of all section headings, preserving order from B then any A-only sections
            const seen = new Set();
            const allSections = [];
            for (const k of Object.keys(sectionsB)) { if (k !== '__preamble__') { seen.add(k); allSections.push(k); } }
            for (const k of Object.keys(sectionsA)) { if (k !== '__preamble__' && !seen.has(k)) { allSections.push(k); } }

            if (allSections.length === 0) {
                outputEl.innerHTML = '<div style="color:#f48771;text-align:center;padding:20px;">Could not parse sections. Are these valid compact briefings?</div>';
                return;
            }

            let html = '';
            let changedSections = 0;

            for (const section of allSections) {
                const textA = sectionsA[section] || '';
                const textB = sectionsB[section] || '';
                const linesA = textA.split('');
                const linesB = textB.split('');
                const diff = diffLines(linesA, linesB);
                const hasChanges = diff.some(d => d.type !== 'same');
                if (hasChanges) changedSections++;

                html += [
                    '<div style="margin-bottom:16px;">',
                        '<div style="font-size:12px;font-weight:600;color:' + (hasChanges ? '#d4d4d4' : '#555') + ';',
                            'border-bottom:1px solid ' + (hasChanges ? '#3c3c3c' : '#2a2a2a') + ';',
                            'padding-bottom:4px;margin-bottom:6px;">',
                            '## ' + section + (hasChanges ? '' : ' <span style="font-weight:normal;color:#444;">(unchanged)</span>'),
                        '</div>',
                        '<div>' + renderLineDiff(diff) + '</div>',
                    '</div>'
                ].join('');
            }

            // Summary bar at top
            const summaryColor = changedSections > 0 ? '#d4d4d4' : '#666';
            const summary = '<div style="font-size:12px;color:' + summaryColor + ';background:#2a2a2a;border-radius:4px;padding:8px 12px;margin-bottom:16px;">'
                + (changedSections === 0
                    ? '&#10003; No differences found between these two briefings.'
                    : changedSections + ' of ' + allSections.length + ' section(s) changed between A and B.')
                + '</div>';

            outputEl.innerHTML = summary + html;

        } catch (err) {
            outputEl.innerHTML = '<div style="color:#f48771;padding:20px;">Error: ' + err.message + '</div>';
        } finally {
            btn.textContent = 'Compare';
            btn.disabled = false;
        }
    });
}

// ── Auto-trigger compaction ──────────────────────────────────────────────────

function checkAutoTrigger(conv) {
    if (!state.autoTrigger.enabled) { return; }
    if (!conv || conv.messages.length < state.autoTrigger.threshold) { return; }

    if (state.autoTrigger.confirm) {
        showAutoTriggerPrompt(conv);
    } else {
        runAutoCompact(conv);
    }
}

function showAutoTriggerPrompt(conv) {
    // Don't stack prompts
    if (document.getElementById('autotrigger-prompt')) { return; }

    const div = document.createElement('div');
    div.id = 'autotrigger-prompt';
    div.style.cssText = [
        'position:fixed;bottom:80px;right:20px;',
        'background:#252526;border:1px solid #0e7fd4;border-radius:8px;',
        'padding:16px 18px;width:320px;z-index:400;',
        'box-shadow:0 4px 16px rgba(0,0,0,0.5);'
    ].join('');
    div.innerHTML = [
        '<div style="font-size:13px;color:#d4d4d4;margin-bottom:10px;">',
            '<strong style="color:#fff;">Auto-compact ready</strong><br>',
            'This conversation has reached ' + conv.messages.length + ' messages. ',
            'Compact now to reduce API costs?',
        '</div>',
        '<div style="display:flex;gap:8px;justify-content:flex-end;">',
            '<button id="at-dismiss-btn"',
                'style="background:#3c3c3c;border:none;color:#ccc;padding:5px 14px;',
                'border-radius:5px;cursor:pointer;font-size:12px;">Not now</button>',
            '<button id="at-compact-btn"',
                'style="background:#0e7fd4;border:none;color:#fff;padding:5px 14px;',
                'border-radius:5px;cursor:pointer;font-size:12px;">Compact</button>',
        '</div>'
    ].join('');

    document.body.appendChild(div);

    document.getElementById('at-dismiss-btn').title = 'Skip auto-compaction this time';
    document.getElementById('at-dismiss-btn').onclick = () => div.remove();
    document.getElementById('at-compact-btn').title = 'Compact conversation now and clear history';
    document.getElementById('at-compact-btn').onclick = () => {
        div.remove();
        runAutoCompact(conv);
    };

    // Auto-dismiss after 30 seconds if ignored
    setTimeout(() => { if (div.parentElement) { div.remove(); } }, 30000);
}

async function runAutoCompact(conv) {
    const compactBtn = document.getElementById('compact-btn');
    if (compactBtn) { compactBtn.textContent = 'Compacting...'; compactBtn.disabled = true; }

    try {
        const result = await window.cowork.compactConversation({
            messages: conv.messages,
            title: conv.title
        });

        const ts = Date.now().toString();
        const blob = new Blob([result], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cowork-compact-' + conv.title.replace(/[^a-z0-9]/gi, '_') + '-' + ts + '.md';
        a.click();
        URL.revokeObjectURL(url);

        window.cowork.saveBriefing({ content: result, title: conv.title, timestamp: ts })
            .catch(err => console.error('Failed to save briefing for diff:', err));

        // Clear the conversation history after compacting
        conv.messages = [];
        conv.title = 'New Chat';
        conv.lastUpdated = Date.now();
        saveState();
        renderSidebar();
        renderMessages();

        showToast('Auto-compacted! Briefing downloaded, history cleared.');
    } catch (err) {
        showToast('Auto-compact failed: ' + err.message);
        console.error('Auto-compact error:', err);
    } finally {
        if (compactBtn) { compactBtn.textContent = 'Compact'; compactBtn.disabled = false; }
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Inject Diff Briefings button into sidebar next to Scan Project
(function injectDiffButton() {
    const scanBtn = document.getElementById('scan-project-btn');
    if (!scanBtn) { return; }
    const btn = document.createElement('button');
    btn.id = 'diff-briefings-btn';
    btn.innerHTML = '&#9141; Diff Briefings';
    btn.title = 'Compare two saved briefings to see what changed';
    btn.className = scanBtn.className;
    btn.style.cssText = scanBtn.style.cssText;
    scanBtn.parentNode.insertBefore(btn, scanBtn.nextSibling);
    btn.addEventListener('click', showDiffModal);
})();

(function injectApiKeyButton() {
    const scanBtn = document.getElementById('scan-project-btn');
    if (!scanBtn) { return; }
    const btn = document.createElement('button');
    btn.id = 'change-api-key-btn';
    btn.innerHTML = '&#128273; API Key';
    btn.title = 'Change your Anthropic API key';
    btn.className = scanBtn.className;
    btn.style.cssText = scanBtn.style.cssText;
    scanBtn.parentNode.appendChild(btn);
    btn.addEventListener('click', showApiKeyModal);
})();

loadState();
initApiKey();
