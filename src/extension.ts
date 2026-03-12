import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Anthropic();
const messages: { role: 'user' | 'assistant'; content: string }[] = [];

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

    // Create the sidebar panel
    const panel = vscode.window.createWebviewPanel(
        'coworkChat',
        'Cowork - Claude',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(messages);

    // Register the Ask Claude command
    const askCommand = vscode.commands.registerCommand('cowork.ask', async () => {

        // Optionally grab selected text as context
        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection);

        let prompt = await vscode.window.showInputBox({
            prompt: 'Ask Claude',
            placeHolder: 'What would you like help with?'
        });

        if (!prompt) { return; }

        // Prepend selected code if there is any
        if (selectedText && selectedText.trim().length > 0) {
            prompt = `The following code is selected in my editor:\n\`\`\`\n${selectedText}\n\`\`\`\n\n${prompt}`;
        }

        messages.push({ role: 'user', content: prompt });
        panel.webview.html = getWebviewContent(messages);

        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Claude is thinking...',
                cancellable: false
            }, async () => {
                const response = await client.messages.create({
                    model: 'claude-opus-4-6',
                    max_tokens: 1024,
                    messages
                });

                const reply = response.content[0].type === 'text'
                    ? response.content[0].text
                    : '';

                messages.push({ role: 'assistant', content: reply });
                panel.webview.html = getWebviewContent(messages);
            });

        } catch (err) {
            vscode.window.showErrorMessage(`Claude API error: ${err}`);
        }
    });

    // Register the Clear Chat command
    const clearCommand = vscode.commands.registerCommand('cowork.clear', () => {
        messages.length = 0;
        panel.webview.html = getWebviewContent(messages);
        vscode.window.showInformationMessage('Cowork chat cleared.');
    });

    context.subscriptions.push(askCommand, clearCommand);
}

export function deactivate() {}