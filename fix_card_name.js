const fs = require('fs');
const path = require('path');

const filesToUpdate = ['orders.html', 'deliveries.html', 'master-sheet.html'];
const dir = path.join(__dirname, 'public', 'html');

filesToUpdate.forEach(file => {
    let filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/<main class="option-card">/g, '<main class="page-card">');
    // also replace modal option-card
    content = content.replace(/class="modal-content option-card"/g, 'class="modal-content page-card"');
    fs.writeFileSync(filePath, content);
});

const cssPath = path.join(__dirname, 'public', 'css', 'orders.css');
if (fs.existsSync(cssPath)) {
    let cssContent = fs.readFileSync(cssPath, 'utf8');
    cssContent = cssContent.replace(/\.option-card/g, '.page-card');
    fs.writeFileSync(cssPath, cssContent);
}

console.log("Renamed option-card to page-card");
