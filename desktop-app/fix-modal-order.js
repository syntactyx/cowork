const fs = require("fs");
let html = fs.readFileSync("src/renderer/index.html", "utf8");

// Move the API modal to before the script tag
const modalMatch = html.match(/<!-- API Key Modal -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
if (modalMatch) {
    html = html.replace(modalMatch[0], "");
    html = html.replace('<script src="renderer.js"></script>', modalMatch[0] + '\n    <script src="renderer.js"></script>');
    fs.writeFileSync("src/renderer/index.html", html, "utf8");
    console.log("Done");
} else {
    console.log("Modal not found - checking structure...");
    console.log(html.slice(-500));
}
