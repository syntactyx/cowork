const fs = require("fs");
let js = fs.readFileSync("src/renderer/renderer.js", "utf8");

const apiKeyCode = `
// API Key handling
const apiModalOverlay = document.getElementById("api-modal-overlay");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeySave = document.getElementById("api-key-save");

async function initApiKey() {
    const key = await window.cowork.getApiKey();
    if (key) {
        apiModalOverlay.style.display = "none";
    } else {
        apiModalOverlay.style.display = "flex";
    }
}

apiKeySave.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (key.startsWith("sk-ant-")) {
        await window.cowork.setApiKey(key);
        apiModalOverlay.style.display = "none";
    } else {
        apiKeyInput.style.borderColor = "#f48771";
        setTimeout(() => { apiKeyInput.style.borderColor = "#555"; }, 1500);
    }
});

apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { apiKeySave.click(); }
});
`;

js = js.replace("// -- Init", apiKeyCode + "\n// -- Init");
js = js.replace("loadState();", "loadState();\ninitApiKey();");
fs.writeFileSync("src/renderer/renderer.js", js, "utf8");
console.log("Done");
