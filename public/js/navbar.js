(async function() {
  // --- Dark Mode Setup ---
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Dark theme CSS moved to navbar.css
  // ----------------------

  async function injectNavbar() {
    const navContainer = document.getElementById('navbar');
    if (!navContainer) return;

    const username = localStorage.getItem("roots-user");
    if (!username) return; // Not logged in, no navbar

    // Fetch user permissions
    let userApps = {};
    if (username === "Roots" && localStorage.getItem("roots-isAdmin") === "true") {
      // Master admin sees all
      userApps = {
        'roots_cod_dashboard': true,
        'pickup_tracker': true,
        'cases_tracker': true,
        'kpi_dashboard': true,
        'shift_tracker': true,
        'collection_tracker': true,
        'orders': true
      };
    } else {
      try {
        const res = await fetch(`https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/users/${username}.json`);
        const data = await res.json();
        userApps = (data && data.apps) ? data.apps : {};
      } catch (e) {
        console.error("Failed to fetch permissions for navbar", e);
      }
    }

    const currentPath = window.location.pathname;
    const fileName = decodeURIComponent(currentPath.split('/').pop()) || '';

    const isActive = (name) => {
      if (name === 'index' && (fileName === '' || fileName === 'index.html' || fileName === 'index')) return 'active-home';
      // Normalize fileName (remove .html for matching)
      const cleanFileName = fileName.replace('.html', '');
      if (cleanFileName.includes(name)) return 'active-link';
      return '';
    };

    const firstLetter = username.charAt(0).toUpperCase();

    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    let centerLinks = ``;
    
    if (userApps['roots_cod_dashboard']) {
      centerLinks += `<a href="/roots_cod_dashboard" class="${isActive('roots_cod_dashboard')}" data-i18n="nav_cod">${t('nav_cod', 'COD Reconciliation')}</a>`;
    }
    if (userApps['pickup_tracker']) {
      centerLinks += `<a href="/pickup_tracker" class="${isActive('pickup_tracker')}" data-i18n="nav_pickup">${t('nav_pickup', 'Pick Up Tracker')}</a>`;
    }
    if (userApps['cases_tracker']) {
      centerLinks += `<a href="/cases_tracker" class="${isActive('cases_tracker')}" data-i18n="nav_cases">${t('nav_cases', 'Cases Tracker')}</a>`;
    }
    if (userApps['kpi_dashboard']) {
      centerLinks += `<a href="https://rootsdashboardjun2026.netlify.app/" target="_blank" data-i18n="nav_kpi">${t('nav_kpi', 'KPI Tracking')}</a>`;
    }
    if (userApps['shift_tracker']) {
      centerLinks += `<a href="/shift_tracker" class="${isActive('shift_tracker')}" data-i18n="nav_shift">${t('nav_shift', 'Shift Tracker')}</a>`;
    }
    if (userApps['collection_tracker']) {
      centerLinks += `<a href="/collection_tracker" class="${isActive('collection_tracker')}" data-i18n="nav_coll_tracker">${t('nav_coll_tracker', 'Collection Tracker')}</a>`;
    }
    if (userApps['orders']) {
      centerLinks += `<a href="/orders" class="${isActive('orders')}" data-i18n="nav_orders">${t('nav_orders', 'Orders')}</a>`;
    }

    if (username === "Roots" || localStorage.getItem("roots-isAdmin") === "true") {
      centerLinks += `<a href="/admin" class="${isActive('admin')}" data-i18n="nav_admin">${t('nav_admin', 'Admin Portal')}</a>`;
    }

    const navHtml = `
      <nav class="global-nav">
        <div class="g-nav-left">
          <button id="mobile-hamburger" class="hamburger-btn">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <a href="/" class="brand-link ${isActive('index')}" data-i18n="brand_title">${t('brand_title', 'Roots AI apps')}</a>
        </div>
        <div class="g-nav-center" id="nav-menu">
          ${centerLinks}
        </div>
        <div class="g-nav-right" style="display: flex; align-items: center; gap: 16px;">
          <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Dark Mode">
            <svg id="theme-icon-sun" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: ${savedTheme === 'dark' ? 'block' : 'none'};"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <svg id="theme-icon-moon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: ${savedTheme === 'dark' ? 'none' : 'block'};"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          </button>
          
          <div class="user-controls" style="display: flex; align-items: center; gap: 10px;">
            <button id="lang-toggle-btn" style="background: var(--orange, #F37828); color: white; border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center;">
              ${window.i18n && window.i18n.getLang() === 'ar' ? 'E' : 'ع'}
            </button>
            <a href="/account_settings" data-i18n-title="update_password" title="${t('update_password', 'Update Password')}" style="text-decoration: none; color: inherit;">
              <div class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid rgba(255, 255, 255, 0.2);" title="Logged in as ${username}">
                ${firstLetter}
              </div>
            </a>
            <button id="nav-logout-btn" data-i18n="nav_logout" style="background: #F37828; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 14px;">${t('nav_logout', 'Log Out')}</button>
          </div>
        </div>
      </nav>
    `;

    navContainer.innerHTML = navHtml;

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
        
        document.getElementById("theme-icon-sun").style.display = nextTheme === "dark" ? "block" : "none";
        document.getElementById("theme-icon-moon").style.display = nextTheme === "dark" ? "none" : "block";
      });
    }

    const langBtn = document.getElementById("lang-toggle-btn");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        if (window.i18n) {
          const current = window.i18n.getLang();
          const next = current === 'ar' ? 'en' : 'ar';
          window.i18n.setLang(next);
          window.location.reload();
        }
      });
    }

    const logoutBtn = document.getElementById("nav-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("roots-user");
        localStorage.removeItem("roots-isAdmin");
        window.location.href = "/";
      });
    }

    const hamburgerBtn = document.getElementById("mobile-hamburger");
    const navMenu = document.getElementById("nav-menu");
    if (hamburgerBtn && navMenu) {
      hamburgerBtn.addEventListener("click", () => {
        navMenu.classList.toggle("open");
      });
    }
  }

  // Expose it globally so other scripts (like index.js login) can trigger it
  window.injectNavbar = injectNavbar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavbar);
  } else {
    injectNavbar();
  }
})();
