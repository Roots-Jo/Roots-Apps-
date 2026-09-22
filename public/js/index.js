import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDd8w3D3i0fehq-uvyCzag3PbtknAuV0jQ",
  authDomain: "roots-weekly.firebaseapp.com",
  projectId: "roots-weekly",
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "roots-weekly.firebasestorage.app",
  messagingSenderId: "844033965231",
  appId: "1:844033965231:web:2269218005bc40d86be85a",
  measurementId: "G-YJZY8XN577"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

// The master account is granted every app by a hardcoded check in the login flow rather
// than by a /users record, so it never appears in an app's permission list on its own.
const MASTER_USERNAME = "Roots";

const ICONS = {
  cod: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  kpi: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  orders: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
  cases: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
  collection: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  pickup: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
  shift: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  admin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  dots: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>`
};

// The home page is grouped by what the app is *for*, not by who owns it: a column you
// read (Dashboards), a column you work out of all day (Daily Ops) and a column about the
// people (Team & Staff). Titles resolve at render time so a language switch picks them up.
const CATEGORIES = [
  {
    id: "dashboards",
    title: () => t('cat_dashboards', "Dashboards"),
    apps: [
      { id: "roots_cod_dashboard", href: "/roots_cod_dashboard", icon: ICONS.cod, title: () => t('app_cod', "COD Analysis") },
      { id: "kpi_dashboard", href: "/kpi_dashboard", icon: ICONS.kpi, title: () => t('app_kpi', "KPI Dashboard") }
    ]
  },
  {
    id: "daily_ops",
    title: () => t('cat_daily_ops', "Daily Ops"),
    apps: [
      { id: "orders", href: "/orders", icon: ICONS.orders, title: () => t('app_orders', "Orders") },
      { id: "cases_tracker", href: "/cases_tracker", icon: ICONS.cases, title: () => t('app_cases', "Cases Tracker") },
      { id: "collection_tracker", href: "/collection_tracker", icon: ICONS.collection, title: () => t('app_coll_tracker', "Collection Tracker") },
      { id: "pickup_tracker", href: "/pickup_tracker", icon: ICONS.pickup, title: () => t('app_pickup', "Pick Up Tracker") }
    ]
  },
  {
    id: "team",
    title: () => t('cat_team', "Team & Staff"),
    apps: [
      { id: "shift_tracker", href: "/shift_tracker", icon: ICONS.shift, title: () => t('app_shift', "Shift Tracker") },
      // Not a /users app permission: the portal is gated on the isAdmin flag instead,
      // so both its visibility and its access list read that rather than apps{}.
      { id: "admin_portal", href: "/admin.html", icon: ICONS.admin, title: () => t('app_admin', "Admin Portal"), adminOnly: true, accent: true }
    ]
  }
];

const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Who can open each app, from the same /users records the login flow reads. Only names
// and the admin flag are taken — nothing else from the record is surfaced. The master
// account is prepended because its access is hardcoded and would otherwise be invisible.
function buildAccessIndex(allUsers) {
  const index = {};
  const push = (appId, entry) => {
    if (!index[appId]) index[appId] = [];
    index[appId].push(entry);
  };

  const masterKey = Object.keys(allUsers).find(k => k.toLowerCase() === MASTER_USERNAME.toLowerCase());

  CATEGORIES.forEach(cat => cat.apps.forEach(appInfo => {
    push(appInfo.id, { name: MASTER_USERNAME, isAdmin: true, isMaster: true });

    Object.keys(allUsers).forEach(name => {
      if (name === masterKey) return;
      const data = allUsers[name] || {};
      const granted = appInfo.adminOnly ? data.isAdmin === true : !!(data.apps || {})[appInfo.id];
      if (granted) push(appInfo.id, { name, isAdmin: data.isAdmin === true, isMaster: false });
    });
  }));

  return index;
}

function accessListHtml(entries) {
  if (!entries || entries.length === 0) {
    return `<p class="access-empty">${escapeHtml(t('access_nobody', "No one has been given access yet."))}</p>`;
  }
  const adminTag = escapeHtml(t('admin_role_admin', "Admin"));
  return `<ul class="access-list">${entries.map(e => `
    <li class="access-row">
      <span class="access-avatar" aria-hidden="true">${escapeHtml(e.name.slice(0, 1).toUpperCase())}</span>
      <span class="access-name">${escapeHtml(e.name)}</span>
      ${e.isAdmin ? `<span class="access-tag">${adminTag}</span>` : ''}
    </li>`).join('')}</ul>`;
}

function appCardHtml(appInfo, entries) {
  const count = entries.length;
  const label = `${escapeHtml(t('access_who', "Who has access"))} — ${escapeHtml(appInfo.title())}`;
  return `
    <div class="option-card app-card${appInfo.accent ? ' app-card-accent' : ''}" data-app="${escapeHtml(appInfo.id)}">
      <a href="${escapeHtml(appInfo.href)}" class="app-card-link" ${appInfo.external ? 'target="_blank" rel="noopener"' : ''}>
        <span class="sr-only">${escapeHtml(appInfo.title())}</span>
      </a>
      <div class="icon-wrap app-card-icon">${appInfo.icon}</div>
      <div class="app-card-text">
        <h2 class="card-title">${escapeHtml(appInfo.title())}</h2>
        <span class="app-card-meta">${count} ${escapeHtml(count === 1 ? t('access_person', "person") : t('access_people', "people"))}</span>
      </div>
      <button type="button" class="app-card-dots" aria-haspopup="true" aria-expanded="false"
              aria-label="${label}" title="${label}">${ICONS.dots}</button>
      <div class="access-pop" role="dialog" aria-label="${label}" popover="manual" hidden>
        <div class="access-pop-head">
          <strong>${escapeHtml(t('access_who', "Who has access"))}</strong>
          <span class="access-count">${count}</span>
        </div>
        ${accessListHtml(entries)}
      </div>
    </div>`;
}

// The dismiss handlers sit on document, so they are bound once for the page rather than
// once per render — checkLogin() runs loadDashboard again after a successful login.
let dismissBound = false;

// Cards paint in DOM order and .app-card:hover applies a transform, which makes each card
// its own stacking context — a popover positioned inside one is trapped there and slides
// under the cards that follow it. So the popover is promoted out of the flow entirely:
// popover="manual" puts it in the browser's top layer where supported, and it is placed
// with fixed coordinates off the button's own rect either way.
const POP_WIDTH = 232;
const POP_GAP = 8;

function placePopover(btn, pop) {
  const r = btn.getBoundingClientRect();

  // Right-aligned to the button, pulled back inside the viewport on narrow screens.
  const left = Math.max(POP_GAP, Math.min(r.right - POP_WIDTH, window.innerWidth - POP_WIDTH - POP_GAP));

  // Measured after it is on screen, so a list near the bottom can flip above the button.
  const h = pop.offsetHeight;
  let top = r.bottom + POP_GAP;
  if (top + h > window.innerHeight - POP_GAP) {
    top = r.top - h - POP_GAP < POP_GAP ? Math.max(POP_GAP, window.innerHeight - h - POP_GAP) : r.top - h - POP_GAP;
  }

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

// One popover open at a time; clicking the card behind it must not follow the link.
function wireAccessMenus(host) {
  const closeAll = (except) => {
    document.querySelectorAll('.app-card').forEach(card => {
      if (card === except) return;
      const pop = card.querySelector('.access-pop');
      // hidePopover throws if it was never shown, which is the common case here.
      if (pop.togglePopover) { try { pop.hidePopover(); } catch (_) { /* not open */ } }
      pop.hidden = true;
      card.classList.remove('menu-open');
      card.querySelector('.app-card-dots').setAttribute('aria-expanded', 'false');
    });
  };

  host.querySelectorAll('.app-card').forEach(card => {
    const btn = card.querySelector('.app-card-dots');
    const pop = card.querySelector('.access-pop');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const opening = pop.hidden;
      closeAll(null);

      if (opening) {
        pop.hidden = false;
        if (pop.showPopover) { try { pop.showPopover(); } catch (_) { /* already open */ } }
        placePopover(btn, pop);
      }
      card.classList.toggle('menu-open', opening);
      btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });

    pop.addEventListener('click', (e) => e.stopPropagation());
  });

  if (!dismissBound) {
    dismissBound = true;
    document.addEventListener('click', () => closeAll(null));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(null); });
    // Fixed coordinates stop tracking the button once the page moves under it.
    window.addEventListener('scroll', () => closeAll(null), true);
    window.addEventListener('resize', () => closeAll(null));
  }
}

const checkLogin = async () => {
  const user = localStorage.getItem("roots-user");
  const navbar = document.getElementById("navbar");
  if (user) {
    if (window.injectNavbar) await window.injectNavbar();
    if (navbar) navbar.style.display = "block";
    document.getElementById("global-login-screen").style.display = "none";
    document.getElementById("dashboard-container").style.display = "block";
    const welcomeMsg = window.i18n ? window.i18n.t('welcome_user') : "Welcome";
    document.getElementById("welcome-message").textContent = `${welcomeMsg}, ${user}`;
    await loadDashboard(user);
  } else {
    if (navbar) navbar.style.display = "none";
    document.getElementById("global-login-screen").style.display = "flex";
    document.getElementById("dashboard-container").style.display = "none";
  }
};

const loadDashboard = async (username) => {
  const host = document.getElementById("app-columns");
  if (!host) return;
  host.innerHTML = "";

  const isMaster = username.toLowerCase() === MASTER_USERNAME.toLowerCase();
  const isAdmin = isMaster || localStorage.getItem("roots-isAdmin") === "true";

  try {
    // One read of /users serves both jobs: this account's own grants, and the access
    // list behind every card's three-dot menu.
    const snapshot = await get(ref(db, `users`));
    const allUsers = snapshot?.val() || {};

    const myKey = Object.keys(allUsers).find(k => k.toLowerCase() === username.toLowerCase());
    const myApps = (myKey && allUsers[myKey] && allUsers[myKey].apps) || {};
    const accessIndex = buildAccessIndex(allUsers);

    const canSee = (appInfo) => appInfo.adminOnly ? isAdmin : (isMaster || !!myApps[appInfo.id]);

    // A column with nothing in it for this account is dropped rather than left as an
    // empty heading, so a single-app user does not stare at two blank columns.
    const columns = CATEGORIES
      .map(cat => ({ cat, apps: cat.apps.filter(canSee) }))
      .filter(c => c.apps.length > 0);

    if (columns.length === 0) {
      host.innerHTML = `<p class="app-columns-empty">${escapeHtml(t('no_apps', "You have no apps assigned yet. Ask an admin for access."))}</p>`;
      return;
    }

    host.innerHTML = columns.map(({ cat, apps }) => `
      <section class="app-column" aria-labelledby="col-${escapeHtml(cat.id)}">
        <header class="app-column-head">
          <h2 class="app-column-title" id="col-${escapeHtml(cat.id)}">${escapeHtml(cat.title())}</h2>
          <span class="app-column-count">${apps.length}</span>
        </header>
        <div class="app-column-body">
          ${apps.map(appInfo => appCardHtml(appInfo, accessIndex[appInfo.id] || [])).join('')}
        </div>
      </section>`).join('');

    host.style.setProperty('--app-column-count', String(columns.length));
    wireAccessMenus(host);

  } catch (e) {
    console.error("Failed to fetch apps", e);
    host.innerHTML = `<p class="app-columns-empty">${escapeHtml(t('apps_load_error', "Could not load your apps. Check the connection and refresh."))}</p>`;
  }
};

document.getElementById("global-login-btn").addEventListener("click", async () => {
  const userInp = document.getElementById("global-username");
  const passInp = document.getElementById("global-password");
  const username = userInp.value.trim();
  const password = passInp.value;
  const err = document.getElementById("global-login-error");
  
  if (!username) return;

  // Normal User Check
  const snapshot = await get(ref(db, `users`));
  let data = null;
  let realUsername = username;
  
  if (snapshot.exists()) {
    const allUsers = snapshot.val();
    const foundKey = Object.keys(allUsers).find(k => k.toLowerCase() === username.toLowerCase());
    if (foundKey) {
      data = allUsers[foundKey];
      realUsername = foundKey;
    }
  }

  // Master Admin Check
  if (username.toLowerCase() === "roots") {
    if ((data && data.password === password) || password === "RootsOpsJo@25") {
      localStorage.setItem("roots-user", "Roots");
      localStorage.setItem("roots-isAdmin", "true");
      err.style.display = "none";
      userInp.value = "";
      passInp.value = "";
      checkLogin();
      return;
    } else {
      err.textContent = t('invalid_credentials', "Invalid username or password");
      err.style.display = "block";
      return;
    }
  }


  if (data) {
    if (data.password === password) {
      localStorage.setItem("roots-user", realUsername);
      if (data.isAdmin) {
        localStorage.setItem("roots-isAdmin", "true");
      } else {
        localStorage.removeItem("roots-isAdmin");
      }
      err.style.display = "none";
      userInp.value = "";
      passInp.value = "";
      checkLogin();
    } else {
      err.textContent = t('invalid_password', "Invalid password");
      err.style.display = "block";
    }
  } else {
    err.textContent = t('user_not_found', "User not found");
    err.style.display = "block";
  }
});

const passInput = document.getElementById("global-password");
if (passInput) {
  passInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("global-login-btn").click();
  });
}

const toggleBtn = document.getElementById("toggle-password");
if (toggleBtn && passInput) {
  toggleBtn.addEventListener("click", () => {
    if (passInput.type === "password") {
      passInput.type = "text";
    } else {
      passInput.type = "password";
    }
  });
}

const userInput = document.getElementById("global-username");
if (userInput) {
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("global-login-btn").click();
  });
}

checkLogin();
