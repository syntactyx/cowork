const fs = require('fs');
let main = fs.readFileSync('src/main.js', 'utf8');

const handler = `
ipcMain.handle("compact-conversation", async (event, { messages, title }) => {
    if (!anthropicClient) { throw new Error("No API key set."); }

    const conversationText = messages.map(m => {
        const role = m.role === "user" ? "USER" : "CLAUDE";
        const content = Array.isArray(m.content)
            ? m.content.map(b => b.text || "").join("\n")
            : m.content;
        return role + "\n" + content;
    }).join("\n\n---\n\n");

    const response = await anthropicClient.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 8192,
        system: "You are a technical documentation assistant. Read the following conversation and produce a single dense structured markdown document to prime a future Claude instance with full context. Include: project overview and current state, all key decisions made and why, all code written with file paths, architecture and data flow, known issues and bugs, immediate next steps, and important developer gotchas. Be thorough but concise. Optimize for information density.",
        messages: [{ role: "user", content: "Conversation title: " + title + "\n\n" + conversationText }]
    });

    return response.content[0].text;
});

`;

main = main.replace('ipcMain.handle("load-conversations"', handler + 'ipcMain.handle("load-conversations"');
fs.writeFileSync('src/main.js', main, 'utf8');
console.log('Done. Length:', main.length);
