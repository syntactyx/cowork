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
    attachment: null
};

// -- Marked setup --------------------------------------------------------------
marked.setOptions({
    highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
});

// -- Persistence ---------------------------------------------------------------
async function saveState() {
    await window.cowork.saveConversations({
        conversations: state.conversations,
        activeId: state.activeId,
        systemPrompt: state.systemPrompt
    });
}

async function loadState() {
    const saved = await window.cowork.loadConversations();
    if (saved && saved.conversations && saved.conversations.length > 0) {
        state.conversations = saved.conversations;
        state.activeId = saved.activeId || saved.conversations[0].id;
        state.systemPrompt = saved.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    } else {
        newConversation();
    }
    systemPromptInput.value = state.systemPrompt;
    renderSidebar();
    renderMessages();
}

// -- Conversations -------------------------------------------------------------
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
        const text = typeof first === 'string' ? first : first[0]?.text || '';
        conv.title = text.substring(0, 32) + (text.length > 32 ? '...' : '');
    }
}

// -- Render --------------------------------------------------------------------
function renderSidebar() {
    conversationsList.innerHTML = '';
    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv.id === state.activeId ? ' active' : '');
        item.innerHTML = `
            <span class="conv-title">${conv.title}</span>
            <span class="conv-delete" data-id="${conv.id}">×</span>
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
    conv.messages.forEach(msg => {
        if (msg.role === 'user') {
            addUserMessage(msg.content, false);
        } else {
            const div = document.createElement('div');
            div.className = 'message assistant';
            div.innerHTML = '<div class="label">Claude</div><div class="content">' +
                marked.parse(msg.content) + '</div>';
            messagesEl.appendChild(div);
        }
    });
    addCodeActions();
    messagesEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    scrollToBottom();
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// -- Messages ------------------------------------------------------------------
function addUserMessage(content, scroll = true) {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) { emptyState.remove(); }

    const div = document.createElement('div');
    div.className = 'message user';

    let html = '<div class="label">You</div>';

    if (Array.isArray(content)) {
        const fileBlock = content.find(b => b.type === 'text' && b._isFile);
        const textBlock = content.find(b => b.type === 'text' && !b._isFile);
        if (fileBlock) {
            html += `<div class="attachment-badge">?? ${fileBlock._fileName}</div><br>`;
        }
        if (textBlock) {
            html += textBlock.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
        }
    } else {
        html += content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    }

    div.innerHTML = html;
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
        currentAssistantEl.innerHTML = marked.parse(currentContent);
        addCodeActions();
        currentAssistantEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
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

// -- Send ----------------------------------------------------------------------
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

    // Build messages array for API (strip display-only fields)
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

// -- Attachments ---------------------------------------------------------------
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

// -- Paste as code -------------------------------------------------------------
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            const pos = inputEl.selectionStart;
            const formatted = `\`\`\`\n${text}\n\`\`\``;
            inputEl.value = inputEl.value.slice(0, pos) + formatted + inputEl.value.slice(pos);
            inputEl.selectionStart = inputEl.selectionEnd = pos + formatted.length;
            inputEl.focus();
            inputEl.dispatchEvent(new Event('input'));
        }
    } catch (err) {
        console.error('Clipboard error:', err);
    }
});

// -- Export --------------------------------------------------------------------
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

// -- Clear ---------------------------------------------------------------------
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

// -- System prompt modal -------------------------------------------------------
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

// -- Input ---------------------------------------------------------------------
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

// -- Init ----------------------------------------------------------------------
loadState();

