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

const ALL_APPS = [
  {
    id: "roots_cod_dashboard",
    href: "/roots_cod_dashboard",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
    title: t('app_cod', "COD Reconciliation")
  },
  {
    id: "pickup_tracker",
    href: "/pickup_tracker",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
    title: t('app_pickup', "Pick Up Tracker")
  },
  {
    id: "cases_tracker",
    href: "/cases_tracker",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
    title: t('app_cases', "Cases Tracker")
  },
  {
    id: "kpi_dashboard",
    href: "https://rootsdashboardjun2026.netlify.app/",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    title: t('app_kpi', "KPI Dashboard"),
    external: true
  },
  {
    id: "shift_tracker",
    href: "/shift_tracker",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    title: t('app_shift', "Shift Tracker")
  },
  {
    id: "orders",
    href: "/orders",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
    title: t('app_orders', "Orders")
  },
  {
    id: "collection_tracker",
    href: "/collection_tracker",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    title: t('app_coll_tracker', "Collection Tracker")
  }
];

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
  const grid = document.getElementById("apps-grid");
  grid.innerHTML = "";
  
  try {
    const snapshot = await get(ref(db, `users/${username}`));
    const data = snapshot?.val() || { apps: {} };
    
    const appsObj = data.apps || {};
    let rendered = 0;
    
    ALL_APPS.forEach(appInfo => {
      if (appsObj[appInfo.id] || username === "Roots") {
        grid.innerHTML += `
          <a href="${appInfo.href}" class="option-card" ${appInfo.external ? 'target="_blank"' : ''}>
            <div class="icon-wrap">${appInfo.icon}</div>
            <h2 class="card-title">${appInfo.title}</h2>
          </a>
        `;
        rendered++;
      }
    });

    // Admin Portal
    if (username === "Roots" || localStorage.getItem("roots-isAdmin") === "true") {
      grid.innerHTML += `
        <a href="/admin.html" class="option-card" style="border: 1px solid var(--accent);">
          <div class="icon-wrap" style="color: var(--accent); background: var(--accent-dim);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--orange, #F37828)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>
          <h2 class="card-title">${t('app_admin', 'Admin Portal')}</h2>
        </a>
      `;
    }

  } catch (e) {
    console.error("Failed to fetch apps", e);
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
