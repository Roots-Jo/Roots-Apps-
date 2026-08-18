const fs = require('fs');
const path = require('path');

const files = [
    { file: 'orders.html', active: 'fetching' },
    { file: 'deliveries.html', active: 'deliveries' },
    { file: 'master-sheet.html', active: 'master' }
];

const dir = path.join(__dirname, 'public', 'html');

files.forEach(({file, active}) => {
    let filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Match the current nav injected previously
    const navRegex = /<nav class="orders-nav"[\s\S]*?<\/nav>/;
    
    const styleActive = 'color: var(--orange); font-weight: 600; text-decoration: none; border-bottom: 3px solid var(--orange); padding-bottom: 4px;';
    const styleInactive = 'color: var(--muted); font-weight: 600; text-decoration: none; border-bottom: 3px solid transparent; padding-bottom: 4px;';

    const newNav = `<nav class="orders-nav" style="width: 100%; border-bottom: 1px solid var(--border); margin-bottom: 20px; background: var(--bg);">
        <div class="nav-content" style="display: flex; justify-content: center; padding: 0 20px;">
            <div class="nav-links" style="display: flex; gap: 2rem; padding-top: 10px;">
                <a href="/orders" class="nav-link" data-i18n="order_tab_fetching" style="${active === 'fetching' ? styleActive : styleInactive}">Order Fetching</a>
                <a href="/master-sheet" class="nav-link" data-i18n="order_tab_master" style="${active === 'master' ? styleActive : styleInactive}">Master Sheet</a>
                <a href="/deliveries" class="nav-link" data-i18n="order_tab_deliveries" style="${active === 'deliveries' ? styleActive : styleInactive}">Deliveries</a>
            </div>
        </div>
    </nav>`;

    content = content.replace(navRegex, newNav);
    fs.writeFileSync(filePath, content);
});
console.log("Navbars updated again!");
