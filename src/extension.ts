import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Anthropic();

interface Conversation {
    id: string;
    title: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    lastUpdated: number;
}

interface ConversationStore {
    conversations: Conversation[];
    activeId: string | null;
}

const SYSTEM_PROMPT = `You are Cowork, a coding assistant embedded in VS Code.
You help with code suggestions, explanations, debugging, and general programming questions.
When the user shares selected code, analyze it carefully before responding.
Be concise and direct. Format code in markdown code blocks.`;

function getWebviewContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"></script>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: #1e1e1e;
                color: #d4d4d4;
                display: flex;
                flex-direction: column;
                height: 100vh;
                overflow: hidden;
            }

            #header {
                padding: 10px 16px;
                background: #252526;
                border-bottom: 1px solid #3c3c3c;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            #header-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            #header-left > span {
                font-size: 13px;
                font-weight: 600;
                color: #cccccc;
                letter-spacing: 0.5px;
            }

            #tabs-container {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .tab {
                padding: 4px 12px;
                font-size: 12px;
                background: #2d2d30;
                border: 1px solid #3c3c3c;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                max-width: 150px;
                transition: all 0.15s;
            }

            .tab:hover { background: #3e3e42; }

            .tab.active {
                background: #0e7fd4;
                border-color: #0e7fd4;
            }

            .tab-title {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .tab-close {
                opacity: 0.6;
                font-size: 16px;
                line-height: 1;
                padding: 0 2px;
            }

            .tab-close:hover { opacity: 1; }

            #new-tab-btn {
                background: none;
                border: 1px solid #3c3c3c;
                color: #888;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #new-tab-btn:hover { border-color: #888; color: #ccc; }

            #header-actions { display: flex; gap: 8px; }

            .header-btn {
                background: none;
                border: 1px solid #3c3c3c;
                color: #888;
                padding: 3px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }

            .header-btn:hover { border-color: #888; color: #ccc; }

            #messages {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            #messages::-webkit-scrollbar { width: 6px; }
            #messages::-webkit-scrollbar-track { background: transparent; }
            #messages::-webkit-scrollbar-thumb { background: #3c3c3c; border-radius: 3px; }

            .message {
                max-width: 90%;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.6;
            }
            .user .content pre {
                background: #0a3a5f;  /* Darker blue for code blocks in user messages */
                margin: 8px 0;
                border-radius: 6px;
                overflow-x: auto;
            }

            .user .content code:not(pre code) {
                background: #0a3a5f;
                padding: 1px 5px;
                border-radius: 3px;
                font-size: 12px;
            }
                
            .user {
                align-self: flex-end;
                background: #0e4f8b;
                color: #ffffff;
                border-bottom-right-radius: 2px;
            }

            .assistant {
                align-self: flex-start;
                background: #252526;
                border: 1px solid #3c3c3c;
                border-bottom-left-radius: 2px;
                position: relative;
            }

            .assistant p { margin-bottom: 8px; }
            .assistant p:last-child { margin-bottom: 0; }

            .assistant pre {
                margin: 8px 0;
                border-radius: 6px;
                overflow-x: auto;
                position: relative;
            }

            .code-actions {
                position: absolute;
                top: 4px;
                right: 4px;
                display: flex;
                gap: 4px;
                opacity: 0;
                transition: opacity 0.2s;
            }

            .assistant pre:hover .code-actions { opacity: 1; }

            .code-action-btn {
                background: #3c3c3c;
                border: none;
                color: #ccc;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.15s;
            }

            .code-action-btn:hover { background: #4c4c4c; color: #fff; }

            .assistant code:not(pre code) {
                background: #2d2d2d;
                padding: 1px 5px;
                border-radius: 3px;
                font-size: 12px;
                font-family: 'Cascadia Code', 'Fira Code', monospace;
            }

            .assistant pre code {
                font-family: 'Cascadia Code', 'Fira Code', monospace;
                font-size: 12px;
            }

            .label {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                margin-bottom: 4px;
                opacity: 0.6;
            }

            .cursor {
                display: inline-block;
                width: 2px;
                height: 14px;
                background: #d4d4d4;
                margin-left: 2px;
                vertical-align: middle;
                animation: blink 0.7s infinite;
            }

            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
            }

            #empty-state {
                margin: auto;
                text-align: center;
                opacity: 0.3;
                font-size: 13px;
            }

            #empty-state div:first-child {
                font-size: 28px;
                margin-bottom: 8px;
            }

            #input-area {
                padding: 12px 16px;
                background: #252526;
                border-top: 1px solid #3c3c3c;
                display: flex;
                gap: 8px;
                align-items: flex-end;
            }

            #input {
                flex: 1;
                background: #3c3c3c;
                border: 1px solid #555;
                border-radius: 6px;
                color: #d4d4d4;
                font-size: 13px;
                font-family: inherit;
                padding: 8px 12px;
                resize: none;
                min-height: 38px;
                max-height: 120px;
                line-height: 1.5;
                outline: none;
            }

            #input:focus { border-color: #0e7fd4; }
            #input::placeholder { color: #666; }

            #send-btn {
                background: #0e7fd4;
                border: none;
                color: white;
                width: 38px;
                height: 38px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: background 0.15s;
            }

            #send-btn:hover { background: #1b8fe0; }
            #send-btn:disabled { background: #3c3c3c; color: #666; cursor: not-allowed; }

            #paste-code-btn {
                background: none;
                border: 1px solid #555;
                color: #888;
                width: 38px;
                height: 38px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s;
                flex-shrink: 0;
            }

            #paste-code-btn:hover { border-color: #0e7fd4; color: #d4d4d4; }
        </style>
    </head>
    <body>
        <div id="header">
            <div id="header-left">
                <span>⚡ Cowork</span>
                <div id="tabs-container"></div>
                <button id="new-tab-btn" title="New conversation">+</button>
            </div>
            <div id="header-actions">
                <button class="header-btn" id="clear-btn">Clear</button>
                <button class="header-btn" id="clear-all-btn">Clear All</button>
            </div>
        </div>

        <div id="messages">
            <div id="empty-state">
                <div>🤖</div>
                <div>Ask Claude anything</div>
            </div>
        </div>

        <div id="input-area">
            <textarea id="input" placeholder="Ask Claude... (Shift+Enter for new line)" rows="1"></textarea>
            <button id="paste-code-btn" title="Paste as code block">📋</button>
            <button id="send-btn">→</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const messagesEl = document.getElementById('messages');
            const inputEl = document.getElementById('input');
            const sendBtn = document.getElementById('send-btn');
            const clearBtn = document.getElementById('clear-btn');
            const clearAllBtn = document.getElementById('clear-all-btn');
            const tabsContainer = document.getElementById('tabs-container');
            const newTabBtn = document.getElementById('new-tab-btn');
            const pasteCodeBtn = document.getElementById('paste-code-btn');

            marked.setOptions({
                highlight: (code, lang) => {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return hljs.highlightAuto(code).value;
                }
            });

            let currentAssistantEl = null;
            let currentContent = '';

            function scrollToBottom() {
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }

            function addUserMessage(text) {
                const emptyState = document.getElementById('empty-state');
                if (emptyState) { emptyState.remove(); }
                const div = document.createElement('div');
                div.className = 'message user';
                
        // Parse markdown for user messages too!
                div.innerHTML = '<div class="label">You</div><div class="content">' + 
                    marked.parse(text) + '</div>';
                
        // Add syntax highlighting to any code blocks
                div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
                
                messagesEl.appendChild(div);
                scrollToBottom();
            }

            function startAssistantMessage() {
                currentContent = '';
                const div = document.createElement('div');
                div.className = 'message assistant';
                div.innerHTML = '<div class="label">Claude</div><div class="content"><span class="cursor"></span></div>';
                messagesEl.appendChild(div);
                currentAssistantEl = div.querySelector('.content');
                scrollToBottom();
            }

            function appendAssistantChunk(chunk) {
                currentContent += chunk;
                currentAssistantEl.innerHTML = marked.parse(currentContent) + '<span class="cursor"></span>';
                addCodeActions();
                currentAssistantEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
                scrollToBottom();
            }

            function finalizeAssistantMessage() {
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
                document.querySelectorAll('pre:not([data-actions-added])').forEach(pre => {
                    pre.setAttribute('data-actions-added', 'true');
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'code-actions';

                    const insertBtn = document.createElement('button');
                    insertBtn.className = 'code-action-btn';
                    insertBtn.textContent = 'Insert';
                    insertBtn.onclick = () => {
                        const code = pre.querySelector('code').textContent;
                        vscode.postMessage({ type: 'insertCode', code });
                    };

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'code-action-btn';
                    copyBtn.textContent = 'Copy';
                    copyBtn.onclick = () => {
                        const code = pre.querySelector('code').textContent;
                        navigator.clipboard.writeText(code);
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    };

                    actionsDiv.appendChild(insertBtn);
                    actionsDiv.appendChild(copyBtn);
                    pre.appendChild(actionsDiv);
                });
            }

            function renderTabs(conversations, activeId) {
                tabsContainer.innerHTML = '';
                conversations.forEach(conv => {
                    const tab = document.createElement('div');
                    tab.className = 'tab' + (conv.id === activeId ? ' active' : '');
                    tab.innerHTML = \`
                        <span class="tab-title">\${conv.title}</span>
                        <span class="tab-close">×</span>
                    \`;
                    tab.querySelector('.tab-title').onclick = () => {
                        vscode.postMessage({ type: 'switchConversation', id: conv.id });
                    };
                    tab.querySelector('.tab-close').onclick = (e) => {
                        e.stopPropagation();
                        vscode.postMessage({ type: 'closeConversation', id: conv.id });
                    };
                    tabsContainer.appendChild(tab);
                });
            }

            function renderMessages(messages) {
                messagesEl.innerHTML = '';
                if (messages.length === 0) {
                    messagesEl.innerHTML = '<div id="empty-state"><div>🤖</div><div>Ask Claude anything</div></div>';
                } else {
                    messages.forEach(msg => {
                        if (msg.role === 'user') {
                            addUserMessage(msg.content);
                        } else {
                            const div = document.createElement('div');
                            div.className = 'message assistant';
                            div.innerHTML = '<div class="label">Claude</div><div class="content">' +
                                marked.parse(msg.content) + '</div>';
                            messagesEl.appendChild(div);
                        }
                    });
                    addCodeActions();
                    document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
                }
                scrollToBottom();
            }

            function sendMessage() {
                const text = inputEl.value.trim();
                if (!text) { return; }
                inputEl.value = '';
                inputEl.style.height = 'auto';
                sendBtn.disabled = true;
                addUserMessage(text);
                startAssistantMessage();
                vscode.postMessage({ type: 'userMessage', text });
            }

            sendBtn.addEventListener('click', sendMessage);

            pasteCodeBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        const currentText = inputEl.value;
                        const cursorPos = inputEl.selectionStart;
                        const formattedCode = \`\\\`\\\`\\\`\\n\${text}\\n\\\`\\\`\\\`\`;
                        inputEl.value = currentText.slice(0, cursorPos) + formattedCode + currentText.slice(cursorPos);
                        inputEl.selectionStart = inputEl.selectionEnd = cursorPos + formattedCode.length;
                        inputEl.focus();
                        inputEl.dispatchEvent(new Event('input'));
                    }
                } catch (err) {
                    console.error('Failed to read clipboard:', err);
                }
            });

            inputEl.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            inputEl.addEventListener('input', () => {
                inputEl.style.height = 'auto';
                inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
            });

            inputEl.addEventListener('paste', (e) => {
                const pastedText = e.clipboardData?.getData('text');
                if (!pastedText) { return; }

                const looksLikeCode = /[\{\}\[\];=\(\)]|function|const|let|var|if|for|while|class|def|import|#include/.test(pastedText);

                if (looksLikeCode && pastedText.includes('\\n')) {
                    e.preventDefault();

                    const start = inputEl.selectionStart;
                    const end = inputEl.selectionEnd;
                    const text = inputEl.value;

                    let lang = '';
                    if (/\\b(function|const|let|var|=>)\\b/.test(pastedText)) { lang = 'javascript'; }
                    else if (/\\b(def|import|class|print)\\b/.test(pastedText)) { lang = 'python'; }
                    else if (/\\b(public|private|void|int|String)\\b/.test(pastedText)) { lang = 'java'; }

                    const formattedCode = \`\\n\\\`\\\`\\\`\${lang}\\n\${pastedText}\\n\\\`\\\`\\\`\\n\`;

                    inputEl.value = text.substring(0, start) + formattedCode + text.substring(end);
                    inputEl.selectionStart = inputEl.selectionEnd = start + formattedCode.length;
                    inputEl.dispatchEvent(new Event('input'));
                }
            });

            clearBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'clearConversation' });
            });

            clearAllBtn.addEventListener('click', () => {
                if (confirm('Clear all conversation history? This cannot be undone.')) {
                    vscode.postMessage({ type: 'clearAll' });
                }
            });

            newTabBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'newConversation' });
            });

            window.addEventListener('message', e => {
                const msg = e.data;
                switch (msg.type) {
                    case 'chunk':
                        appendAssistantChunk(msg.text);
                        break;
                    case 'done':
                        finalizeAssistantMessage();
                        sendBtn.disabled = false;
                        break;
                    case 'error':
                        if (currentAssistantEl) {
                            const span = document.createElement('span');
                            span.style.color = '#f48771';
                            span.textContent = 'Error: ' + msg.text;
                            currentAssistantEl.replaceChildren(span);
                            currentAssistantEl = null;
                        }
                        sendBtn.disabled = false;
                        break;
                    case 'updateState':
                        renderTabs(msg.conversations, msg.activeId);
                        renderMessages(msg.messages);
                        break;
                }
            });

            vscode.postMessage({ type: 'getState' });
        </script>
    </body>
    </html>`;
}

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined;
    let conversationStore: ConversationStore;

    function loadConversations(): ConversationStore {
        const stored = context.globalState.get<ConversationStore>('cowork.conversations');
        if (stored && stored.conversations) {
            return stored;
        }
        const initialConv: Conversation = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            lastUpdated: Date.now()
        };
        return {
            conversations: [initialConv],
            activeId: initialConv.id
        };
    }

    function saveConversations() {
        context.globalState.update('cowork.conversations', conversationStore);
    }

    function getActiveConversation(): Conversation | undefined {
        return conversationStore.conversations.find(c => c.id === conversationStore.activeId);
    }

    function updateConversationTitle(conv: Conversation) {
        if (conv.messages.length > 0 && conv.title === 'New Chat') {
            const firstMessage = conv.messages[0].content;
            conv.title = firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '');
        }
    }

    function updateWebviewState() {
        const activeConv = getActiveConversation();
        panel?.webview.postMessage({
            type: 'updateState',
            conversations: conversationStore.conversations,
            activeId: conversationStore.activeId,
            messages: activeConv?.messages || []
        });
    }

    function createPanel() {
        panel = vscode.window.createWebviewPanel(
            'coworkChat',
            'Cowork',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: []
            }
        );

        panel.webview.html = getWebviewContent();

        panel.onDidDispose(() => {
            panel = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.type) {
                case 'getState': {
                    updateWebviewState();
                    break;
                }

                case 'newConversation': {
                    const newConv: Conversation = {
                        id: Date.now().toString(),
                        title: 'New Chat',
                        messages: [],
                        lastUpdated: Date.now()
                    };
                    conversationStore.conversations.push(newConv);
                    conversationStore.activeId = newConv.id;
                    saveConversations();
                    updateWebviewState();
                    break;
                }

                case 'switchConversation': {
                    conversationStore.activeId = msg.id;
                    saveConversations();
                    updateWebviewState();
                    break;
                }

                case 'closeConversation': {
                    conversationStore.conversations = conversationStore.conversations.filter(c => c.id !== msg.id);
                    if (conversationStore.conversations.length === 0) {
                        const newConv: Conversation = {
                            id: Date.now().toString(),
                            title: 'New Chat',
                            messages: [],
                            lastUpdated: Date.now()
                        };
                        conversationStore.conversations.push(newConv);
                        conversationStore.activeId = newConv.id;
                    } else if (conversationStore.activeId === msg.id) {
                        conversationStore.activeId = conversationStore.conversations[0].id;
                    }
                    saveConversations();
                    updateWebviewState();
                    break;
                }

                case 'clearConversation': {
                    const activeConv = getActiveConversation();
                    if (activeConv) {
                        activeConv.messages = [];
                        activeConv.title = 'New Chat';
                        activeConv.lastUpdated = Date.now();
                        saveConversations();
                        updateWebviewState();
                    }
                    break;
                }

                case 'clearAll': {
                    const newConvAfterClear: Conversation = {
                        id: Date.now().toString(),
                        title: 'New Chat',
                        messages: [],
                        lastUpdated: Date.now()
                    };
                    conversationStore = {
                        conversations: [newConvAfterClear],
                        activeId: newConvAfterClear.id
                    };
                    saveConversations();
                    updateWebviewState();
                    break;
                }

                case 'insertCode': {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(editBuilder => {
                            editBuilder.insert(editor.selection.active, msg.code);
                        });
                    }
                    break;
                }

                case 'userMessage': {
                    const currentConv = getActiveConversation();
                    if (!currentConv) { break; }

                    let prompt = msg.text;

                    const activeEditor = vscode.window.activeTextEditor;
                    const selectedText = activeEditor?.document.getText(activeEditor.selection);
                    if (selectedText && selectedText.trim().length > 0) {
                        prompt = `The following code is selected in my editor:\n\`\`\`\n${selectedText}\n\`\`\`\n\n${prompt}`;
                    }

                    currentConv.messages.push({ role: 'user', content: prompt });
                    updateConversationTitle(currentConv);
                    currentConv.lastUpdated = Date.now();

                    try {
                        const stream = await client.messages.stream({
                            model: 'claude-opus-4-20250514',
                            max_tokens: 8192,
                            system: SYSTEM_PROMPT,
                            messages: currentConv.messages
                        });

                        let reply = '';

                        for await (const chunk of stream) {
                            if (
                                chunk.type === 'content_block_delta' &&
                                chunk.delta.type === 'text_delta'
                            ) {
                                reply += chunk.delta.text;
                                panel?.webview.postMessage({ type: 'chunk', text: chunk.delta.text });
                            }
                        }

                        currentConv.messages.push({ role: 'assistant', content: reply });
                        panel?.webview.postMessage({ type: 'done' });
                        saveConversations();

                    } catch (err) {
                        panel?.webview.postMessage({ type: 'error', text: String(err) });
                    }
                    break;
                }
            }
        }, undefined, context.subscriptions);
    }

    conversationStore = loadConversations();
    createPanel();

    const askCommand = vscode.commands.registerCommand('cowork.ask', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.Beside);
        } else {
            createPanel();
        }
    });

    const clearCommand = vscode.commands.registerCommand('cowork.clear', () => {
        const activeConv = getActiveConversation();
        if (activeConv) {
            activeConv.messages = [];
            activeConv.title = 'New Chat';
            activeConv.lastUpdated = Date.now();
            saveConversations();
            updateWebviewState();
        }
    });

    context.subscriptions.push(askCommand, clearCommand);
}

export function deactivate() {}