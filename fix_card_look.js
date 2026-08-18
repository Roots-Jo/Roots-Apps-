const fs = require('fs');
const path = require('path');

const filesToUpdate = ['orders.html', 'deliveries.html', 'master-sheet.html'];
const dir = path.join(__dirname, 'public', 'html');

filesToUpdate.forEach(file => {
    let filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove margin-bottom from orders-nav
    content = content.replace(/margin-bottom: 20px;/g, 'margin-bottom: 0;');
    
    fs.writeFileSync(filePath, content);
});

const cssPath = path.join(__dirname, 'public', 'css', 'orders.css');
if (fs.existsSync(cssPath)) {
    let cssContent = fs.readFileSync(cssPath, 'utf8');
    
    cssContent = cssContent.replace(/\.page-card \{[\s\S]*?\}\s*\.page-card:hover \{[\s\S]*?\}/, 
        \.page-card {
    background: var(--bg);
    padding: 1.5rem 2rem;
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    box-sizing: border-box;
}\);
    fs.writeFileSync(cssPath, cssContent);
}

console.log("Updated styles to remove card look");
