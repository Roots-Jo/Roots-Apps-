import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const usersRef = ref(db, "users");

let usersData = {};

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// The master account is hardcoded in the login flow (index.js) and in the auth bypass
// (auth.js) rather than stored under /users, so it is normally invisible here. It is
// pinned into the list below so admins can see and manage it like any other account.
const MASTER_USERNAME = "Roots";

const APP_KEYS = [
  'roots_cod_dashboard',
  'pickup_tracker',
  'collection_tracker',
  'kpi_dashboard',
  'cases_tracker',
  'shift_tracker',
  'orders'
];

// Returns the /users key matching the master account, whatever its casing, or null.
function findMasterKey() {
  return Object.keys(usersData).find(k => k.toLowerCase() === MASTER_USERNAME.toLowerCase()) || null;
}

// Every account the portal should list: the master account first, then the DB records.
// The master is synthesized when it has no /users record, which is the normal state.
function getListedUsers() {
  const masterKey = findMasterKey();
  const masterData = masterKey ? usersData[masterKey] : null;

  const master = [MASTER_USERNAME, {
    ...(masterData || {}),
    isAdmin: true,
    apps: APP_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
    isMaster: true,
    hasDbRecord: !!masterKey
  }];

  const others = Object.entries(usersData).filter(([username]) => username !== masterKey);

  return [master, ...others];
}

// ── Render Users ──
function renderUsers() {
  const container = document.getElementById("users-container");
  if (!container) return;

  const searchInp = document.getElementById("user-search");
  const searchTerm = searchInp ? searchInp.value.toLowerCase() : "";

  let visibleCount = 0;
  const html = getListedUsers().map(([username, data]) => {
    if (searchTerm && !username.toLowerCase().includes(searchTerm)) {
      return '';
    }
    visibleCount++;
    const apps = data.apps || {};
    const isMaster = data.isMaster === true;
    // The master's access comes from hardcoded checks, so these toggles would be
    // decorative — and a delete would not revoke anything. Disable them rather than
    // present controls that silently do nothing.
    const lockAttr = isMaster ? 'disabled title="Built-in master account — access is always granted"' : '';
    return `
      <div class="user-item" ${data.isAdmin ? 'style="border-color: var(--accent);"' : ''}>
        <div class="user-header">
          <strong>${username} ${data.isAdmin ? `<span style="color:var(--accent); font-size:11px;">(${t("admin_role_admin", "Admin")})</span>` : ''}</strong>
          ${isMaster ? '' : `<button onclick="deleteUser('${username}')">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>`}
        </div>

        ${isMaster ? `<div class="master-note">
          ${t("admin_master_note", "Built-in master account. It has permanent access to every app and cannot be deleted or demoted from this portal.")}
          ${data.hasDbRecord ? '' : ` ${t("admin_master_no_record", "It has no saved record yet — setting a password below creates one.")}`}
        </div>` : ''}

        <div class="user-password-section">
          <label class="user-section-label">${t("admin_lbl_password", "Password")}</label>
          <div class="password-input-group">
            <div class="password-field-wrapper">
              <input type="password" id="pass-${username}" value="${data.password || ''}" class="password-input">
              <button class="toggle-password-btn" onclick="toggleViewPassword('pass-${username}')" title="Toggle Visibility">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
            </div>
            <button class="btn-save-password" onclick="updatePassword('${username}')">${t("admin_btn_save", "Save")}</button>
          </div>
        </div>
        
        <div class="perm-row" style="border-bottom: 1px solid var(--border-light); margin-bottom: 8px; padding-bottom: 12px;">
          <span style="font-weight: 600;">${t("admin_privileges", "Admin Privileges")}</span>
          <label class="switch">
            <input type="checkbox" ${data.isAdmin ? 'checked' : ''} ${lockAttr} onchange="toggleAdmin('${username}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        
        <div class="perm-row">
          <span>${t("app_cod", "COD Reconciliation")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['roots_cod_dashboard'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'roots_cod_dashboard', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        
        <div class="perm-row">
          <span>${t("app_pickup", "Pick Up Tracker")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['pickup_tracker'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'pickup_tracker', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        
        <div class="perm-row">
          <span>${t("app_coll_tracker", "Collection Tracker")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['collection_tracker'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'collection_tracker', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        
        <div class="perm-row">
          <span>${t("app_kpi", "KPI Dashboard")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['kpi_dashboard'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'kpi_dashboard', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        
        <div class="perm-row">
          <span>${t("app_cases", "Cases Tracker")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['cases_tracker'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'cases_tracker', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="perm-row">
          <span>${t("app_shift", "Shift Tracker")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['shift_tracker'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'shift_tracker', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="perm-row">
          <span>${t("app_orders", "Orders")}</span>
          <label class="switch">
            <input type="checkbox" ${apps['orders'] ? 'checked' : ''} ${lockAttr} onchange="togglePerm('${username}', 'orders', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join("");

  // The master account is always listed, so an empty result can only mean the search
  // matched nothing.
  if (visibleCount === 0) {
    container.innerHTML = `<div style="color: var(--dim)">${t("admin_no_match", "No matching users found.")}</div>`;
  } else {
    container.innerHTML = html;
  }
}

const searchInputEl = document.getElementById("user-search");
if (searchInputEl) {
  searchInputEl.addEventListener("input", renderUsers);
}

// ── Load Users (real-time listener) ──
function loadUsers() {
  onValue(usersRef, (snapshot) => {
    usersData = snapshot.val() || {};
    renderUsers();
  });
}

// ── Permission & Admin Toggles ──
window.togglePerm = async (username, appKey, val) => {
  try {
    await update(ref(db, `users/${username}/apps`), { [appKey]: val });
  } catch (e) {
    console.error("Failed to update permission", e);
  }
};

window.toggleAdmin = async (username, val) => {
  try {
    await update(ref(db, `users/${username}`), { isAdmin: val });
  } catch (e) {
    console.error("Failed to update admin role", e);
  }
};

window.deleteUser = async (username) => {
  if (confirm(`${t("admin_conf_del", "Are you sure you want to delete user ")}"${username}"?`)) {
    try {
      await remove(ref(db, `users/${username}`));
    } catch (e) {
      console.error("Failed to delete user", e);
    }
  }
};

window.toggleViewPassword = (inputId) => {
  const inp = document.getElementById(inputId);
  if (inp) {
    inp.type = inp.type === "password" ? "text" : "password";
  }
};

window.updatePassword = async (username) => {
  const inp = document.getElementById(`pass-${username}`);
  if (!inp) return;
  const newPass = inp.value;
  if (!newPass) {
    alert(t("admin_err_pass_empty", "Password cannot be empty."));
    return;
  }
  
  // Saving a password for the master account creates its /users record on first save,
  // so stamp the admin flag too rather than leaving a record with only a password.
  const isMaster = username.toLowerCase() === MASTER_USERNAME.toLowerCase();
  const payload = isMaster ? { password: newPass, isAdmin: true } : { password: newPass };

  try {
    await update(ref(db, `users/${username}`), payload);
    alert(t("admin_ok_pass", "Password updated successfully!"));
  } catch (e) {
    console.error("Failed to update password", e);
    alert(t("admin_err_pass_upd", "Error updating password."));
  }
};

// ── Password Toggle ──
const toggleBtn = document.getElementById("toggle-new-password");
const passInp = document.getElementById("new-password");
if (toggleBtn && passInp) {
  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    passInp.type = passInp.type === "password" ? "text" : "password";
  });
}

// ── Add User ──
const addBtn = document.getElementById("add-user-btn");
if (addBtn) {
  addBtn.addEventListener("click", async () => {
    const userInp = document.getElementById("new-username");
    const username = userInp.value.trim();
    const password = passInp.value;
    
    if (!username || !password) {
      alert(t("admin_err_both_req", "Both username and password are required."));
      return;
    }
    
    const userExists = Object.keys(usersData).some(k => k.toLowerCase() === username.toLowerCase());
    if (userExists) {
      alert(t("admin_err_exists", "User already exists!"));
      return;
    }
    
    try {
      await set(ref(db, `users/${username}`), {
        password: password,
        isAdmin: false,
        apps: {
          'roots_cod_dashboard': false,
          'pickup_tracker': false,
          'collection_tracker': false,
          'kpi_dashboard': false,
          'cases_tracker': false,
          'shift_tracker': false,
          'orders': false
        }
      });
      userInp.value = "";
      passInp.value = "";
    } catch (e) {
      console.error("Failed to add user", e);
    }
  });
}

// ── Logout ──
const logoutBtn = document.getElementById("admin-logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("roots-user");
    localStorage.removeItem("roots-isAdmin");
    window.location.href = "/";
  });
}

// ── Start ──
loadUsers();
