const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let anthropicClient = null;

// ── API Key Management ───────────────────────────────────────────────────────

function getKeyPath() {
    return path.join(app.getPath("userData"), "apikey.txt");
}

async function loadApiKey() {
    try {
        const raw = fs.readFileSync(getKeyPath());
        let key;
        if (safeStorage.isEncryptionAvailable() && raw[0] !== 115) {
            key = safeStorage.decryptString(raw).trim();
        } else {
            key = raw.toString("utf8").trim();
        }
        if (key) {
            // Dynamic import for Anthropic
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            anthropicClient = new Anthropic({ apiKey: key });
            return true;
        }
    } catch (e) {}
    return false;
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: "#1e1e1e",
        title: "Labrador"
    });
    mainWindow.loadFile(path.join(__dirname, "src", "renderer", "index.html"));
}

app.whenReady().then(async () => {
    await loadApiKey();
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── API Key IPC ──────────────────────────────────────────────────────────────

ipcMain.handle("get-api-key", () => {
    try {
        const raw = fs.readFileSync(getKeyPath());
        if (safeStorage.isEncryptionAvailable() && raw[0] !== 115) {
            return safeStorage.decryptString(raw).trim();
        }
        return raw.toString("utf8").trim();
    } catch (e) {
        return "";
    }
});

ipcMain.handle('set-api-key', async (event, key) => {
    const trimmed = key.trim();
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(trimmed);
        fs.writeFileSync(getKeyPath(), encrypted);
    } else {
        fs.writeFileSync(getKeyPath(), trimmed, "utf8");
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: trimmed });
    return true;
});

// ── Sessions Directory ───────────────────────────────────────────────────────

function getSessionsDir() {
    const dir = path.join(app.getPath("userData"), "sessions");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getSessionFilePath(sessionId) {
    return path.join(getSessionsDir(), sessionId + ".json");
}

// ── Session Persistence IPC ──────────────────────────────────────────────────

ipcMain.handle("save-session", async (event, { sessionId, data }) => {
    const filePath = getSessionFilePath(sessionId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
});

ipcMain.handle("load-session", async (event, { sessionId }) => {
    const filePath = getSessionFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
});

ipcMain.handle("list-sessions", async () => {
    const dir = getSessionsDir();
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    const sessions = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
            sessions.push({
                sessionId: file.replace(".json", ""),
                title: data.title || "Untitled",
                phase: data.phase || 1,
                complete: data.complete || false,
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
            });
        } catch (e) { continue; }
    }
    sessions.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return sessions;
});

ipcMain.handle("delete-session", async (event, { sessionId }) => {
    const filePath = getSessionFilePath(sessionId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
});

// ── File Upload IPC ──────────────────────────────────────────────────────────

ipcMain.handle("upload-procedure-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [
            { name: "Documents", extensions: ["txt", "md", "pdf", "png", "jpg", "jpeg", "gif", "bmp", "webp"] },
            { name: "All Files", extensions: ["*"] }
        ],
        title: "Upload Procedure or Assignment"
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString("base64");
        const mediaType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
            : ext === ".png" ? "image/png"
            : ext === ".gif" ? "image/gif"
            : ext === ".bmp" ? "image/bmp"
            : "image/webp";
        return { type: "image", fileName, base64, mediaType };
    } else if (ext === ".pdf") {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString("base64");
        return { type: "pdf", fileName, base64, mediaType: "application/pdf" };
    } else {
        const content = fs.readFileSync(filePath, "utf-8");
        return { type: "text", fileName, content };
    }
});

// ── Phase 1: Intake — Parse Procedure with Claude (non-streaming) ────────────

ipcMain.handle("parse-procedure", async (event, { procedureText, fileData }) => {
    if (!anthropicClient) throw new Error("No API key set. Please add your key in Settings.");

    const NL = "\n";
    const systemPrompt = [
        "You are a chemistry lab assistant AI. The user will provide a laboratory procedure, assignment sheet, or experiment description.",
        "",
        "Parse this and output ONLY valid JSON (no markdown fences, no commentary) with this exact structure:",
        "",
        "{",
        '  "title": "string — experiment title",',
        '  "type": "string — e.g. synthesis, titration, spectroscopy, calorimetry, kinetics, equilibrium, electrochemistry, other",',
        '  "summary": "string — 2-3 sentence summary of the experiment",',
        '  "requiredInputs": [',
        "    {",
        '      "id": "string — camelCase identifier",',
        '      "label": "string — human-readable label",',
        '      "unit": "string or null — e.g. g, mL, M, °C",',
        '      "dataType": "string — number, text, boolean, select",',
        '      "options": ["array of strings — only for select type, otherwise omit"],',
        '      "dependsOn": ["array of input ids this depends on, or empty array"],',
        '      "group": "string — logical grouping label, e.g. Reagents, Measurements, Observations"',
        "    }",
        "  ],",
        '  "optionalInputs": [',
        "    { same structure as requiredInputs }",
        "  ],",
        '  "knownConstants": [',
        "    {",
        '      "id": "string",',
        '      "label": "string",',
        '      "value": "string or number",',
        '      "unit": "string or null"',
        "    }",
        "  ],",
        '  "calculations": [',
        "    {",
        '      "id": "string — camelCase identifier for the result",',
        '      "label": "string — human-readable label",',
        '      "formula": "string — JavaScript-evaluable expression using input ids and constant ids as variables",',
        '      "unit": "string or null",',
        '      "dependsOn": ["array of input/constant ids needed"]',
        "    }",
        "  ]",
        "}",
        "",
        "Rules:",
        "- Extract ALL measurable quantities from the procedure as required inputs.",
        "- Include observations (color changes, precipitate formation, etc.) as text inputs.",
        "- For titrations, include buret readings, endpoint observations, etc.",
        "- For synthesis, include masses of reactants and products.",
        "- Include temperature, pressure, and other conditions as inputs where relevant.",
        "- Add calculations for moles, concentrations, percent yield, percent error, etc. as appropriate.",
        "- The formula field must be a valid JS expression. Use Math.abs(), etc. as needed.",
        "- Order required inputs in the logical sequence a chemist would record them.",
        "- Group inputs logically (Reagents, Measurements, Observations, etc.).",
        "- If values are given in the procedure (e.g. 'use 25.00 mL of NaOH'), put them in knownConstants."
    ].join(NL);

    const userContent = [];

    if (fileData) {
        if (fileData.type === "image") {
            userContent.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: fileData.mediaType,
                    data: fileData.base64
                }
            });
            userContent.push({
                type: "text",
                text: "Parse this lab procedure/assignment image and extract the experiment schema."
            });
        } else if (fileData.type === "pdf") {
            userContent.push({
                type: "document",
                source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: fileData.base64
                }
            });
            userContent.push({
                type: "text",
                text: "Parse this lab procedure/assignment PDF and extract the experiment schema."
            });
        } else {
            userContent.push({
                type: "text",
                text: "Parse this lab procedure and extract the experiment schema:\n\n" + fileData.content
            });
        }
    } else if (procedureText) {
        userContent.push({
            type: "text",
            text: "Parse this lab procedure and extract the experiment schema:\n\n" + procedureText
        });
    } else {
        throw new Error("No procedure text or file provided.");
    }

    const response = await anthropicClient.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }]
    });

    const responseText = response.content[0].text.trim();

    // Try to extract JSON — Claude sometimes wraps in markdown fences despite instructions
    let jsonStr = responseText;
    const fenceMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    try {
        const schema = JSON.parse(jsonStr);
        return schema;
    } catch (e) {
        throw new Error("Failed to parse Claude's response as JSON. Raw response:\n" + responseText.slice(0, 500));
    }
});

// ── Phase 2: Inline Claude Assist (streaming) ───────────────────────────────

ipcMain.handle("inline-assist", async (event, { question, sessionContext }) => {
    if (!anthropicClient) {
        event.sender.send("assist-error", "No API key set.");
        return;
    }

    const NL = "\n";
    const systemPrompt = [
        "You are a chemistry lab assistant embedded in a digital lab notebook.",
        "The researcher is in the middle of an experiment and has a question or needs you to evaluate a data point.",
        "",
        "Context about the current experiment:",
        JSON.stringify(sessionContext, null, 2),
        "",
        "Rules:",
        "- Be concise and direct.",
        "- If flagging an anomaly, explain why the value is unexpected and suggest possible causes.",
        "- If asked to interpret a result, provide scientific reasoning.",
        "- Use appropriate significant figures.",
        "- If a calculation is needed, show your work briefly.",
        "- Respond in markdown format."
    ].join(NL);

    try {
        const stream = await anthropicClient.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: question }]
        });
        for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
                event.sender.send("assist-chunk", chunk.delta.text);
            }
        }
        event.sender.send("assist-done");
    } catch (err) {
        event.sender.send("assist-error", String(err));
    }
});

// ── Phase 2: Value Validation (non-streaming, quick check) ──────────────────

ipcMain.handle("validate-value", async (event, { inputLabel, value, unit, sessionContext }) => {
    if (!anthropicClient) return { ok: true };

    const systemPrompt = "You are a chemistry data validator. Given an experimental measurement, quickly assess if it seems reasonable. Respond with ONLY valid JSON: {\"ok\": true/false, \"warning\": \"string or null\"}. If the value seems fine, ok=true and warning=null. If suspicious, ok=false and provide a brief warning string.";

    const userMsg = `Experiment: ${sessionContext.title}\nType: ${sessionContext.type}\nInput: ${inputLabel}\nValue: ${value} ${unit || ""}\n\nKnown constants: ${JSON.stringify(sessionContext.knownConstants || [])}`;

    try {
        const response = await anthropicClient.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 256,
            system: systemPrompt,
            messages: [{ role: "user", content: userMsg }]
        });
        const text = response.content[0].text.trim();
        let jsonStr = text;
        const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        return { ok: true, warning: null };
    }
});

// ── Phase 3: Report Generation (non-streaming) ──────────────────────────────

ipcMain.handle("generate-report", async (event, { sessionData, format, formality }) => {
    if (!anthropicClient) throw new Error("No API key set.");

    const NL = "\n";

    const formalityDescriptions = {
        formal: "formal academic assignment submission — use passive voice, formal scientific register, include all required sections (title, objective, materials, procedure, data, calculations, results, discussion, conclusion, references placeholder)",
        publication: "research publication draft — use active voice where appropriate, concise and precise scientific language, include abstract, introduction, experimental, results and discussion, conclusion",
        informal: "informal personal lab record — conversational but accurate, focus on key data and observations, include notes about what worked and what didn't"
    };

    const formatInstructions = {
        latex: "Output the report as a complete LaTeX document using the article document class. Include all necessary \\usepackage commands. Use \\begin{table} for data tables, \\begin{equation} for equations.",
        docx: "Output the report as structured markdown with clear headings (# ## ###), tables using markdown table syntax, and equations clearly labeled. This will be converted to a Word document.",
        pdf: "Output the report as structured markdown with clear headings, tables, and equations. This will be converted to PDF.",
        xlsx: "Output the report data as a JSON object with this structure: {\"sheets\": [{\"name\": \"string\", \"headers\": [\"string\"], \"rows\": [[values]]}]}. Include sheets for: Raw Data, Calculations, Results Summary. All numeric values should be actual numbers, not strings.",
        markdown: "Output the report as clean markdown."
    };

    const systemPrompt = [
        "You are a chemistry report writer. Generate a complete lab report from the provided experimental data.",
        "",
        "Formality level: " + (formalityDescriptions[formality] || formalityDescriptions.formal),
        "",
        "Output format: " + (formatInstructions[format] || formatInstructions.markdown),
        "",
        "Rules:",
        "- Include ALL data from the session — every measurement, observation, and calculated value.",
        "- Show sample calculations with proper units and significant figures.",
        "- Include data tables with all recorded values.",
        "- State conclusions with appropriate hedging (e.g. 'the data suggest' rather than 'this proves').",
        "- Flag any data gaps, anomalous results, or potential sources of error.",
        "- Use proper chemical nomenclature and formulas.",
        "- For percent error calculations, state the accepted value used.",
        "- Do NOT include any markdown fences around the entire output — just output the document content directly."
    ].join(NL);

    const userMsg = "Generate a complete lab report from this experimental session data:\n\n" + JSON.stringify(sessionData, null, 2);

    const response = await anthropicClient.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }]
    });

    return response.content[0].text;
});

// ── Export Handlers ──────────────────────────────────────────────────────────

ipcMain.handle("export-docx", async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || "lab-report.docx",
        filters: [{ name: "Word Document", extensions: ["docx"] }]
    });
    if (result.canceled) return null;

    const docx = require("docx");

    // Parse markdown-ish content into docx paragraphs
    const lines = content.split("\n");
    const children = [];

    for (const line of lines) {
        if (line.startsWith("### ")) {
            children.push(new docx.Paragraph({
                text: line.slice(4),
                heading: docx.HeadingLevel.HEADING_3,
                spacing: { before: 240, after: 120 }
            }));
        } else if (line.startsWith("## ")) {
            children.push(new docx.Paragraph({
                text: line.slice(3),
                heading: docx.HeadingLevel.HEADING_2,
                spacing: { before: 360, after: 120 }
            }));
        } else if (line.startsWith("# ")) {
            children.push(new docx.Paragraph({
                text: line.slice(2),
                heading: docx.HeadingLevel.HEADING_1,
                spacing: { before: 480, after: 240 }
            }));
        } else if (line.startsWith("|") && line.includes("|")) {
            // Basic table row — accumulate and create table (simplified for v0.1)
            const cells = line.split("|").filter(c => c.trim() && !c.match(/^[\s-:]+$/));
            if (cells.length > 0 && !line.match(/^\|[\s-:|]+\|$/)) {
                const row = new docx.TableRow({
                    children: cells.map(cell => new docx.TableCell({
                        children: [new docx.Paragraph({ text: cell.trim() })],
                        width: { size: Math.floor(9000 / cells.length), type: docx.WidthType.DXA }
                    }))
                });
                // Check if last child is a table to append to
                const lastChild = children[children.length - 1];
                if (lastChild && lastChild._tableRows) {
                    lastChild._tableRows.push(row);
                } else {
                    const table = new docx.Table({
                        rows: [row],
                        width: { size: 9000, type: docx.WidthType.DXA }
                    });
                    table._tableRows = [row];
                    children.push(table);
                }
            }
        } else if (line.trim() === "") {
            children.push(new docx.Paragraph({ text: "" }));
        } else {
            children.push(new docx.Paragraph({
                text: line,
                spacing: { after: 120 }
            }));
        }
    }

    const doc = new docx.Document({
        sections: [{
            properties: {},
            children: children.length > 0 ? children : [new docx.Paragraph({ text: content })]
        }]
    });

    const buffer = await docx.Packer.toBuffer(doc);
    fs.writeFileSync(result.filePath, buffer);
    return result.filePath;
});

ipcMain.handle("export-latex", async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || "lab-report.tex",
        filters: [{ name: "LaTeX Document", extensions: ["tex"] }]
    });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, content, "utf8");
    return result.filePath;
});

ipcMain.handle("export-pdf", async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || "lab-report.pdf",
        filters: [{ name: "PDF Document", extensions: ["pdf"] }]
    });
    if (result.canceled) return null;

    // Use jsPDF from main process
    const { jsPDF } = require("jspdf");
    require("jspdf-autotable");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let y = margin;

    const lines = content.split("\n");

    for (const line of lines) {
        if (y > 270) {
            doc.addPage();
            y = margin;
        }

        if (line.startsWith("# ")) {
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            y += 4;
            doc.text(line.slice(2), margin, y);
            y += 10;
        } else if (line.startsWith("## ")) {
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            y += 3;
            doc.text(line.slice(3), margin, y);
            y += 8;
        } else if (line.startsWith("### ")) {
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            y += 2;
            doc.text(line.slice(4), margin, y);
            y += 7;
        } else if (line.trim() === "") {
            y += 4;
        } else {
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            const wrapped = doc.splitTextToSize(line, maxWidth);
            for (const wl of wrapped) {
                if (y > 270) { doc.addPage(); y = margin; }
                doc.text(wl, margin, y);
                y += 5;
            }
        }
    }

    const buffer = Buffer.from(doc.output("arraybuffer"));
    fs.writeFileSync(result.filePath, buffer);
    return result.filePath;
});

ipcMain.handle("export-xlsx", async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || "lab-data.xlsx",
        filters: [{ name: "Excel Spreadsheet", extensions: ["xlsx"] }]
    });
    if (result.canceled) return null;

    const XLSX = require("xlsx");
    let sheetsData;

    try {
        // Content may be JSON if Claude followed the xlsx format instructions
        const parsed = JSON.parse(content);
        sheetsData = parsed.sheets || [];
    } catch (e) {
        // Fallback: put raw content in a single sheet
        sheetsData = [{
            name: "Report",
            headers: ["Content"],
            rows: content.split("\n").map(line => [line])
        }];
    }

    const wb = XLSX.utils.book_new();
    for (const sheet of sheetsData) {
        const data = [sheet.headers, ...sheet.rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name || "Sheet1");
    }

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(result.filePath, buffer);
    return result.filePath;
});

ipcMain.handle("export-markdown", async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName || "lab-report.md",
        filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, content, "utf8");
    return result.filePath;
});
