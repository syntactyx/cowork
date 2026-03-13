const fs = require("fs");
let html = fs.readFileSync("src/renderer/index.html", "utf8");

const apiModal = `
    <!-- API Key Modal -->
    <div id="api-modal-overlay" class="visible" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:200;display:flex;align-items:center;justify-content:center;">
        <div style="background:#252526;border:1px solid #3c3c3c;border-radius:10px;padding:24px;width:480px;max-width:90vw;">
            <h2 style="font-size:15px;margin-bottom:8px;color:#fff;">&#128273; Anthropic API Key</h2>
            <p style="font-size:12px;color:#888;margin-bottom:12px;">Enter your Anthropic API key to get started. It will be stored locally on your machine.</p>
            <input id="api-key-input" type="password" placeholder="sk-ant-..." style="width:100%;background:#3c3c3c;border:1px solid #555;border-radius:6px;color:#d4d4d4;font-size:13px;padding:10px 12px;outline:none;margin-bottom:16px;">
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="api-key-save" style="background:#0e7fd4;border:none;color:white;padding:7px 20px;border-radius:6px;cursor:pointer;font-size:13px;">Save</button>
            </div>
        </div>
    </div>`;

html = html.replace("</body>", apiModal + "\n</body>");
fs.writeFileSync("src/renderer/index.html", html, "utf8");
console.log("Done");
