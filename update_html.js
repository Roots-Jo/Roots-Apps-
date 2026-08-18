const fs = require('fs');
const path = require('path');

const files = ['orders.html', 'deliveries.html', 'master-sheet.html'];
const dir = path.join(__dirname, 'public', 'html');

files.forEach(file => {
    let filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Add global css and auth.js
    content = content.replace(
        '<link rel="stylesheet" href="../css/styles.css">',
        '<link rel="stylesheet" href="/css/index.css?v=2.0.1">\n    <link rel="stylesheet" href="/css/navbar.css?v=10.0.7">\n    <link rel="stylesheet" href="../css/orders.css">\n    <script type="module" src="/js/auth.js"></script>\n    <script src="/js/arabic.js?v=2"></script>'
    );

    // Inject global navbar and rename their old navbar
    content = content.replace(
        '<body>',
        '<body>\n    <div id="navbar"></div>\n    <script src="/js/navbar.js?v=1.0.7"></script>'
    );
    
    // Rename class
    content = content.replace(/global-nav/g, 'orders-nav');

    // Update app.js reference
    content = content.replace('../js/app.js', '../js/orders_app.js');

    fs.writeFileSync(filePath, content);
});

// Update orders.css
const cssPath = path.join(__dirname, 'public', 'css', 'orders.css');
if (fs.existsSync(cssPath)) {
    let css = fs.readFileSync(cssPath, 'utf8');
    css = css.replace(/\.global-nav/g, '.orders-nav');
    css = css.replace(/position:\s*fixed;/g, 'position: relative;'); // Avoid overlapping with global fixed navbar
    css = css.replace(/top:\s*0;/g, 'top: auto;'); 
    fs.writeFileSync(cssPath, css);
}

console.log("HTML and CSS files updated successfully!");
