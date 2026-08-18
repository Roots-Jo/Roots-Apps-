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

console.log("Removed margin from navbar");
