import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Anthropic();
const messages: { role: 'user' | 'assistant'; content: string }[] = [];

const SYSTEM_PROMPT = `You are Cowork, a coding assistant embedded in VS Code.
You help with code suggestions, explanations, debugging, and general programming questions.
When the user shares selected code, analyze it carefully before responding.
Be concise and direct. Format code in markdown code blocks.`;

function getWebviewContent(conversation: { role: string; content: string }[]): string {
    const formatted = conversation.map(m => `
        <div class="message ${m.role}">
            <strong>${m.role === 'user' ? 'You' : 'Claude'}:</strong>
            <p>${m.content.replace(/\n/g, '<br>')}</p>
        </div>
    `).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: sans-serif; padding: 16px; }
            .message { margin-bottom: 16px; padding: 10px; border-radius: 6px; }
            .user { background: #1e3a5f; }
            .assistant { background: #1e3a2f; }
            strong { text-transform: capitalize; }
            p { margin: 6px 0 0 0; }
        </style>
    </head>
    <body>
        ${formatted.length ? formatted : '<p style="opacity:0.5">No conversation yet. Use Ctrl+Shift+A to ask Claude.</p>'}
        <script>window.scrollTo(0, document.body.scrollHeight);</script>
    </body>
    </html>`;
}

export function activate(context: vscode.ExtensionContext) {

    const panel = vscode.window.createWebviewPanel(
        'coworkChat',
        'Cowork - Claude',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(messages);

    const askCommand = vscode.commands.registerCommand('cowork.ask', async () => {

        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection);

        let prompt = await vscode.window.showInputBox({
            prompt: 'Ask Claude',
            placeHolder: 'What would you like help with?'
        });

        if (!prompt) { return; }

        if (selectedText && selectedText.trim().length > 0) {
            prompt = `The following code is selected in my editor:\n\`\`\`\n${selectedText}\n\`\`\`\n\n${prompt}`;
        }

        messages.push({ role: 'user', content: prompt });
        messages.push({ role: 'assistant', content: '' });
        panel.webview.html = getWebviewContent(messages);

        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Claude is thinking...',
                cancellable: false
            }, async () => {
                let reply = '';

                const stream = await client.messages.stream({
                    model: 'claude-opus-4-6',
                    max_tokens: 1024,
                    system: SYSTEM_PROMPT,
                    messages: messages.slice(0, -1)
                });

                for await (const chunk of stream) {
                    if (
                        chunk.type === 'content_block_delta' &&
                        chunk.delta.type === 'text_delta'
                    ) {
                        reply += chunk.delta.text;
                        messages[messages.length - 1] = { role: 'assistant', content: reply };
                        panel.webview.html = getWebviewContent(messages);
                    }
                }

                messages[messages.length - 1] = { role: 'assistant', content: reply };
                panel.webview.html = getWebviewContent(messages);
            });

        } catch (err) {
            vscode.window.showErrorMessage(`Claude API error: ${err}`);
        }
    });

    const clearCommand = vscode.commands.registerCommand('cowork.clear', () => {
        messages.length = 0;
        panel.webview.html = getWebviewContent(messages);
        vscode.window.showInformationMessage('Cowork chat cleared.');
    });

    context.subscriptions.push(askCommand, clearCommand);
}

export function deactivate() {}