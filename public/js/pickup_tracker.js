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
const trackerRef = ref(db, "trackers/pickup-tracker-v2");

// --- State ---
let state = {
  config: { drivers: [], locations: [], rates: {} },
  pickups: [],
  merchants: {},
  currentUser: null,
  tab: "dashboard",
  editingPickupId: null
};

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// --- Icons (Same as JSX) ---
const I = {
  trash: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  edit: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`
};

// --- Utils ---
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function fmtCur(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "JOD", minimumFractionDigits: 2 }).format(n); }

function flash(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 2200);
}

// --- Firebase Sync ---
onValue(trackerRef, (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.val();
    state.config = data.config || { drivers: [], locations: [], rates: {} };
    // Convert pickups object to array if it's an object from Firebase
    const pickupsData = data.pickups || {};
    state.pickups = Object.values(pickupsData);
    renderAll();
  } else {
    // Initial setup if database is empty
    state.config = { drivers: [], locations: [], rates: {} };
    state.pickups = [];
    renderAll();
  }
});

onValue(ref(db, "cases_tracker/merchants"), (snap) => {
  state.merchants = snap.val() || {};
  renderAll(); // Re-render to show merchant names in the table if they updated
});

async function cloudUpdate(path, value) {
  try {
    const rtdbPath = path.replace(/\./g, "/");
    await update(trackerRef, { [rtdbPath]: value });
  } catch (e) {
    console.error("Sync failed", e);
  }
}

// --- Actions ---
window.addDriver = async (name) => {
  if (!name.trim()) return;
  const drivers = [...(state.config.drivers || []), { id: uid(), name: name.trim() }];
  await cloudUpdate("config/drivers", drivers);
  flash(t("coll_toast_driver_add", "Driver added"));
};

window.rmDriver = async (id) => {
  const drivers = (state.config.drivers || []).filter(d => d.id !== id);
  await cloudUpdate("config/drivers", drivers);
  flash(t("coll_toast_driver_rm", "Driver removed"));
};

window.addLocation = async (name, rate) => {
  if (!name.trim()) return;
  const id = uid();
  const locations = [...(state.config.locations || []), { id, name: name.trim() }];
  const rates = { ...(state.config.rates || {}), [id]: parseFloat(rate) || 0 };
  await update(trackerRef, {
    "config/locations": locations,
    [`config/rates/${id}`]: parseFloat(rate) || 0
  });
  flash(t("coll_toast_loc_add", "Location added"));
};

window.rmLocation = async (id) => {
  const locations = (state.config.locations || []).filter(l => l.id !== id);
  const rates = { ...(state.config.rates || {}) };
  delete rates[id];
  await update(trackerRef, {
    "config/locations": locations,
    [`config/rates/${id}`]: null
  });
  flash(t("coll_toast_loc_rm", "Location removed"));
};

window.setRate = async (id, v) => {
  await cloudUpdate(`config/rates/${id}`, parseFloat(v) || 0);
};

window.addPickup = async (p) => {
  const id = uid();
  const rate = state.config.rates[p.locationId] || 0;
  
  let createdAt;
  try {
    const chosenDateStr = p.date || new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    createdAt = new Date(`${chosenDateStr}T${timeStr}`).toISOString();
  } catch (e) {
    createdAt = new Date().toISOString();
  }

  const newPickup = {
    id,
    ...p,
    type: p.type || "Pickup",
    codAmount: p.type === 'Delivery' ? (parseFloat(p.codAmount) || 0) : 0,
    cost: rate,
    loggedBy: state.currentUser,
    createdAt: createdAt,
    arrivalTime: p.arrivalTime || ""
  };
  delete newPickup.date;

  await cloudUpdate(`pickups/${id}`, newPickup);
  flash(t("coll_toast_logged", "Pickup logged ✓"));
  closeModal();
};

window.editPickup = (id) => {
  const p = state.pickups.find(x => x.id === id);
  if (!p) return;
  
  state.editingPickupId = id;
  
  // Open modal which builds selects
  openModal();
  
  // Change Title and Button text
  document.querySelector("#pickup-modal .modal-title").textContent = t("cases_modal_edit", "Edit Pickup");
  document.getElementById("confirm-pickup-btn").textContent = t("cases_update_btn", "Save Changes");
  
  // Set values
  document.getElementById("modal-driver").value = p.driverId;
  document.getElementById("modal-location").value = p.locationId;
  document.getElementById("modal-items").value = p.items || "";
  document.getElementById("modal-notes").value = p.notes || "";
  document.getElementById("modal-arrival").value = p.arrivalTime || "";
  document.getElementById("modal-type").value = p.type || "Pickup";
  document.getElementById("modal-cod").value = p.codAmount || "";
  document.getElementById("modal-orderid").value = p.orderId || "";
  document.getElementById("modal-pickup-merchant").value = p.merchantId || "";
  document.getElementById("modal-cod-group").style.display = (p.type === 'Delivery') ? 'block' : 'none';
  document.getElementById("modal-orderid-group").style.display = (p.type === 'Delivery') ? 'block' : 'none';
  document.getElementById("modal-merchant-group").style.display = (p.type === 'Delivery') ? 'block' : 'none';
  document.getElementById("modal-arrival-group").style.display = (p.type === 'Delivery') ? 'none' : 'block';
  
  // Format local date for input calendar
  const dateObj = new Date(p.createdAt);
  const offset = dateObj.getTimezoneOffset();
  const localDate = new Date(dateObj.getTime() - (offset*60*1000));
  const localISODate = localDate.toISOString().split('T')[0];
  document.getElementById("modal-date").value = localISODate;
  
  updateModalCost();
};

window.saveEditedPickup = async (p) => {
  const rate = state.config.rates[p.locationId] || 0;
  
  let createdAt;
  try {
    const chosenDateStr = p.date || new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    createdAt = new Date(`${chosenDateStr}T${timeStr}`).toISOString();
  } catch (e) {
    createdAt = new Date().toISOString();
  }

  const updatedPickup = {
    driverId: p.driverId,
    locationId: p.locationId,
    items: p.items,
    notes: p.notes,
    arrivalTime: p.arrivalTime || "",
    type: p.type || "Pickup",
    codAmount: p.type === 'Delivery' ? (parseFloat(p.codAmount) || 0) : 0,
    orderId: p.type === 'Delivery' ? (p.orderId || "") : "",
    merchantId: p.type === 'Delivery' ? (p.merchantId || "") : "",
    cost: rate,
    createdAt: createdAt
  };

  const original = state.pickups.find(x => x.id === p.id);
  if (original) {
    updatedPickup.loggedBy = original.loggedBy || state.currentUser;
    updatedPickup.id = p.id;
  }

  await cloudUpdate(`pickups/${p.id}`, updatedPickup);
  flash(t("coll_toast_updated", "Pickup updated ✓"));
  closeModal();
};

window.rmPickup = async (id) => {
  if (!confirm("Delete this log?")) return;
  await remove(ref(db, `trackers/pickup-tracker-v2/pickups/${id}`));
  flash(t("coll_toast_deleted", "Deleted"));
};

window.togglePaid = async (id, val) => {
  const isPaid = val === 'paid';
  await cloudUpdate(`pickups/${id}/paid`, isPaid);
  flash(isPaid ? t("coll_toast_paid", "Marked as Paid") : t("coll_toast_unpaid", "Marked as Not Paid"));
};

window.resetAll = async () => {
  if (!confirm("⚠️ This will delete ALL shared data for every team member. Continue?")) return;
  await set(trackerRef, null);
  flash(t("coll_toast_reset", "All data reset"));
};

// --- UI Handlers ---
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".view-section").forEach(view => {
    view.classList.toggle("active", view.id === `view-${tab}`);
  });
  renderAll();
}

function openModal() {
  const modal = document.getElementById("pickup-modal");
  const form = document.getElementById("modal-form");
  const setupReq = document.getElementById("modal-setup-required");

  if (!state.config.drivers.length || !state.config.locations.length) {
    form.style.display = "none";
    setupReq.style.display = "block";
  } else {
    form.style.display = "block";
    setupReq.style.display = "none";
    
    // Fill selects
    const dSel = document.getElementById("modal-driver");
    dSel.innerHTML = state.config.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    
    const lSel = document.getElementById("modal-location");
    lSel.innerHTML = state.config.locations.map(l => `<option value="${l.id}">${l.name} — ${fmtCur(state.config.rates[l.id] || 0)}</option>`).join("");
    
    const mSel = document.getElementById("modal-pickup-merchant");
    if (mSel) {
      mSel.innerHTML = `<option value="">${t("coll_none", "None")}</option>` + Object.entries(state.merchants).map(([id, m]) => `<option value="${id}">${m.name}</option>`).join("");
    }
    
    // Default time
    const now = new Date();
    document.getElementById("modal-arrival").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    
    // Default date to today
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset*60*1000));
    const localISODate = localDate.toISOString().split('T')[0];
    document.getElementById("modal-date").value = localISODate;

    // Reset Title and Button text for Log mode
    if (!state.editingPickupId) {
      document.querySelector("#pickup-modal .modal-title").textContent = t("coll_modal_title", "Log Pickup");
      document.getElementById("confirm-pickup-btn").textContent = t("coll_confirm_btn", "Confirm Pickup");
      
      // Clear inputs
      document.getElementById("modal-items").value = "";
      document.getElementById("modal-notes").value = "";
      document.getElementById("modal-type").value = "Pickup";
      document.getElementById("modal-cod").value = "";
      document.getElementById("modal-orderid").value = "";
      document.getElementById("modal-pickup-merchant").value = "";
      document.getElementById("modal-cod-group").style.display = "none";
      document.getElementById("modal-orderid-group").style.display = "none";
      document.getElementById("modal-merchant-group").style.display = "none";
      document.getElementById("modal-arrival-group").style.display = "block";
    }
    
    updateModalCost();
  }
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("pickup-modal").style.display = "none";
  document.body.style.overflow = "";
  state.editingPickupId = null;
}

function updateModalCost() {
  const lId = document.getElementById("modal-location").value;
  const rate = state.config.rates[lId] || 0;
  document.getElementById("modal-cost-display").textContent = fmtCur(rate);
}

// --- Rendering ---
function renderAll() {
  if (!state.currentUser) return;
  
  if (state.tab === "dashboard") renderDashboard();
  else if (state.tab === "setup") renderSetup();
}

function renderDashboard() {
  const statsEl = document.getElementById("dashboard-stats");
  const chartsEl = document.getElementById("dashboard-charts");
  const emptyEl = document.getElementById("dashboard-empty");

  const tableWrap = document.getElementById("pickup-table-wrap");
  const filterBar = document.querySelector(".filters-bar");

  if (state.pickups.length === 0) {
    statsEl.innerHTML = "";
    chartsEl.innerHTML = "";
    emptyEl.style.display = "block";
    tableWrap.style.display = "none";
    if (filterBar) filterBar.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  tableWrap.style.display = "block";
  if (filterBar) filterBar.style.display = "flex";

  const totalCost = state.pickups.reduce((s, p) => s + p.cost, 0);
  const now = new Date();
  const monthPicks = state.pickups.filter(p => {
    const d = new Date(p.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthCost = monthPicks.reduce((s, p) => s + p.cost, 0);

  // Stats
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">${t("coll_stat_total", "Total Pickups")}</div>
      <div class="stat-value">${state.pickups.length}</div>
      <div class="stat-sub">${t("coll_stat_all_time", "all time")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("coll_stat_cost", "Total Cost")}</div>
      <div class="stat-value">${fmtCur(totalCost)}</div>
      <div class="stat-sub">${t("coll_stat_all_time", "all time")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("coll_stat_month", "This Month")}</div>
      <div class="stat-value" style="color: var(--accent)">${fmtCur(monthCost)}</div>
      <div class="stat-sub">${monthPicks.length} ${t("coll_stat_pickups", "pickups")}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("coll_stat_avg", "Avg / Trip")}</div>
      <div class="stat-value" style="color: var(--green)">${fmtCur(totalCost / state.pickups.length)}</div>
      <div class="stat-sub">${t("coll_stat_overall", "overall")}</div>
    </div>
  `;

  // Charts Logic
  const byDriver = {};
  const byLoc = {};
  const tripsByDriver = {};
  const tripsByLoc = {};
  state.pickups.forEach(p => {
    byDriver[p.driverId] = (byDriver[p.driverId] || 0) + p.cost;
    byLoc[p.locationId] = (byLoc[p.locationId] || 0) + p.cost;
    tripsByDriver[p.driverId] = (tripsByDriver[p.driverId] || 0) + 1;
    tripsByLoc[p.locationId] = (tripsByLoc[p.locationId] || 0) + 1;
  });
  const maxD = Math.max(...Object.values(byDriver), 1);
  const maxL = Math.max(...Object.values(byLoc), 1);

  chartsEl.innerHTML = `
    <div class="chart-card">
      <div class="chart-title">${t("coll_chart_driver", "Cost by Driver")}</div>
      ${state.config.drivers.map(d => {
        const cost = byDriver[d.id] || 0;
        const trips = tripsByDriver[d.id] || 0;
        return `
          <div class="bar-row">
            <div class="bar-info">
              <span class="bar-name">${d.name}</span>
              <span class="bar-val" style="color: var(--accent)">${fmtCur(cost)} <span style="color: var(--dim); font-family: var(--font)">(${trips})</span></span>
            </div>
            <div class="bar-bg">
              <div class="bar-fill" style="width: ${(cost / maxD) * 100}%; background: linear-gradient(90deg, var(--accent), var(--accent-glow))"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="chart-card">
      <div class="chart-title">${t("coll_chart_loc", "Cost by Location")}</div>
      ${state.config.locations.map(l => {
        const cost = byLoc[l.id] || 0;
        const trips = tripsByLoc[l.id] || 0;
        return `
          <div class="bar-row">
            <div class="bar-info">
              <span class="bar-name">${l.name}</span>
              <span class="bar-val" style="color: var(--green)">${fmtCur(cost)} <span style="color: var(--dim); font-family: var(--font)">(${trips})</span></span>
            </div>
            <div class="bar-bg">
              <div class="bar-fill" style="width: ${(cost / maxL) * 100}%; background: linear-gradient(90deg, var(--green), rgba(52,211,153,.25))"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  // Filters & Table Logic
  const tF = document.getElementById("filter-type") ? document.getElementById("filter-type").value : "all";
  const dF = document.getElementById("filter-driver").value;
  const lF = document.getElementById("filter-location").value;
  const mF = document.getElementById("filter-month").value;
  const dateF = document.getElementById("filter-date").value;

  const dSel = document.getElementById("filter-driver");
  const lSel = document.getElementById("filter-location");
  const mSel = document.getElementById("filter-month");

  dSel.innerHTML = `<option value="all">${t("coll_filter_drivers", "All Drivers")}</option>`;
  state.config.drivers.forEach(d => dSel.add(new Option(d.name, d.id)));
  [...new Set(state.pickups.map(p => p.driverId))].forEach(id => {
    if (!state.config.drivers.some(d => d.id === id)) dSel.add(new Option(t("coll_deleted_driver", "Deleted Driver"), id));
  });
  if (Array.from(dSel.options).some(o => o.value === dF)) dSel.value = dF;

  lSel.innerHTML = `<option value="all">${t("coll_filter_locations", "All Locations")}</option>`;
  state.config.locations.forEach(l => lSel.add(new Option(l.name, l.id)));
  [...new Set(state.pickups.map(p => p.locationId))].forEach(id => {
    if (!state.config.locations.some(l => l.id === id)) lSel.add(new Option(t("coll_deleted_loc", "Deleted Location"), id));
  });
  if (Array.from(lSel.options).some(o => o.value === lF)) lSel.value = lF;
  
  const uniqueMonths = [...new Set(state.pickups.map(p => {
    const d = new Date(p.createdAt);
    return `${d.getFullYear()}-${d.getMonth()}`;
  }))].sort().reverse();
  
  mSel.innerHTML = `<option value="all">${t("coll_filter_months", "All Months")}</option>`;
  uniqueMonths.forEach(m => {
    const [y, mo] = m.split("-");
    const label = new Date(parseInt(y), parseInt(mo)).toLocaleDateString(window.i18n && window.i18n.currentLang === 'ar' ? 'ar-EG' : 'en-US', { month: "short", year: "numeric" });
    mSel.add(new Option(label, m));
  });
  if (Array.from(mSel.options).some(o => o.value === mF)) mSel.value = mF;

  const filtered = state.pickups.filter(p => {
    if (tF !== "all" && (p.type || "Pickup") !== tF) return false;
    if (dF !== "all" && p.driverId !== dF) return false;
    if (lF !== "all" && p.locationId !== lF) return false;
    if (mF !== "all") {
      const d = new Date(p.createdAt);
      if (`${d.getFullYear()}-${d.getMonth()}` !== mF) return false;
    }
    if (dateF) {
      const pDate = p.date || new Date(p.createdAt).toISOString().split('T')[0];
      if (pDate !== dateF) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  window.currentFilteredPickups = filtered;

  const fTotal = filtered.reduce((s, p) => s + p.cost, 0);
  document.getElementById("history-stats").textContent = `${filtered.length} records · ${fmtCur(fTotal)}`;

  const listEl = document.getElementById("history-list");
  const histEmptyEl = document.getElementById("history-empty");

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    tableWrap.style.display = "none";
    histEmptyEl.style.display = "block";
  } else {
    histEmptyEl.style.display = "none";
    tableWrap.style.display = "block";
    listEl.innerHTML = filtered.map(p => {
      const driver = state.config.drivers.find(d => d.id === p.driverId)?.name || "?";
      const loc = state.config.locations.find(l => l.id === p.locationId)?.name || "?";
      const typeHtml = p.type === 'Delivery' ? `<span class="status-badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">🚚 Delivery</span>` : `<span class="status-badge" style="background: rgba(243, 120, 40, 0.1); color: var(--accent);">📦 Pickup</span>`;
      
      const paidSel = `<select onchange="togglePaid('${p.id}', this.value)" style="appearance: none; -webkit-appearance: none; color: white !important; background: ${p.paid ? 'var(--green)' : 'var(--red)'} !important; border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; outline: none; text-align: center;">
        <option value="unpaid" ${!p.paid ? 'selected' : ''} style="color: var(--text); background: var(--card);">${t("coll_not_paid", "Not Paid")}</option>
        <option value="paid" ${p.paid ? 'selected' : ''} style="color: var(--text); background: var(--card);">${t("coll_paid", "Paid")}</option>
      </select>`;

      return `
        <tr>
          <td><input type="checkbox" class="pickup-checkbox" data-id="${p.id}"></td>
          <td>
            <div style="font-weight: 600; margin-bottom: 4px;">${fmtDate(p.createdAt)}</div>
            <div style="color: var(--dim); font-size: 11px;">${fmtTime(p.createdAt)}</div>
          </td>
          <td>${typeHtml}</td>
          <td><span style="font-weight: 600;">${driver}</span></td>
          <td>${loc}</td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted);">
              ${p.type === 'Delivery' && p.merchantId ? `<div><span style="font-weight: 600;">${t("th_merchant", "Merchant")}:</span> ${state.merchants[p.merchantId]?.name || t("cases_unknown_merchant", "Unknown")}</div>` : ''}
              ${p.type === 'Delivery' && p.orderId ? `<div><span style="font-weight: 600;">${t("coll_th_order", "Order:")}</span> ${p.orderId}</div>` : ''}
              ${p.type === 'Delivery' && p.codAmount ? `<div><span style="font-weight: 600;">${t("coll_th_cod", "COD:")}</span> ${fmtCur(p.codAmount)}</div>` : ''}
              ${p.arrivalTime ? `<div><span style="color: var(--green);">🏭 ${t("coll_th_arrived", "Arrived:")}</span> ${p.arrivalTime}</div>` : ''}
              ${p.items ? `<div><span style="font-weight: 600;">${t("coll_th_items", "Items:")}</span> ${p.items}</div>` : ''}
              ${p.notes ? `<div><span style="font-weight: 600;">${t("coll_th_notes", "Notes:")}</span> <span style="font-style: italic;">"${p.notes}"</span></div>` : ''}
              ${p.loggedBy ? `<div><span style="font-weight: 600;">${t("coll_th_by", "By:")}</span> ${p.loggedBy}</div>` : ''}
            </div>
          </td>
          <td>${paidSel}</td>
          <td style="font-family: var(--mono); font-weight: 700; color: var(--accent);">${fmtCur(p.cost)}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn-transparent" onclick="editPickup('${p.id}')" style="color: var(--blue); padding: 4px;" title="Edit">${I.edit}</button>
              <button class="btn-transparent" onclick="rmPickup('${p.id}')" style="color: var(--red); padding: 4px;" title="Delete">${I.trash}</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }
  
  const selectAllPickups = document.getElementById("select-all-pickups");
  if (selectAllPickups) {
    selectAllPickups.checked = false;
    selectAllPickups.indeterminate = false;
  }
  updateBulkDeleteBtn();
}

function updateBulkDeleteBtn() {
  const btn = document.getElementById("delete-selected-btn");
  if (!btn) return;
  const checkedCount = document.querySelectorAll(".pickup-checkbox:checked").length;
  if (checkedCount > 0) {
    btn.style.display = "inline-block";
    btn.textContent = `Delete Selected (${checkedCount})`;
  } else {
    btn.style.display = "none";
  }
}

function renderSetup() {
  const dList = document.getElementById("drivers-list");
  const lList = document.getElementById("locations-list");

  dList.innerHTML = state.config.drivers.length === 0 ? `<div style="color: var(--dim); font-size: 13px; padding: 6px 0">No drivers yet</div>` :
    state.config.drivers.map(d => `
      <div class="setup-row">
        <span style="font-size: 14px; font-weight: 600">${d.name}</span>
        <button class="btn-transparent" onclick="rmDriver('${d.id}')" style="color: var(--red); padding: 4px">${I.trash}</button>
      </div>
    `).join("");

  lList.innerHTML = state.config.locations.length === 0 ? `<div style="color: var(--dim); font-size: 13px; padding: 6px 0">No locations yet</div>` :
    state.config.locations.map(l => `
      <div class="setup-row">
        <span style="font-size: 14px; font-weight: 600; flex: 1">${l.name}</span>
        <input type="number" value="${state.config.rates[l.id] || 0}" onchange="setRate('${l.id}', this.value)" style="width: 100px; text-align: right; font-family: var(--mono)">
        <span style="font-size: 12px; color: var(--muted)">JOD</span>
        <button class="btn-transparent" onclick="rmLocation('${l.id}')" style="color: var(--red); padding: 4px">${I.trash}</button>
      </div>
    `).join("");
}

// --- Init ---
function init() {
  const savedUser = localStorage.getItem("roots-user");
  if (savedUser) {
    state.currentUser = savedUser;
    showApp();
  } else {
    window.location.href = "/";
    return;
  }

  // Event Listeners
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  document.getElementById("open-log-btn").onclick = () => {
    state.editingPickupId = null;
    openModal();
  };
  document.getElementById("close-modal-btn").onclick = closeModal;
  document.getElementById("modal-setup-ok").onclick = closeModal;
  
  document.getElementById("pickup-modal").addEventListener("click", (e) => {
    if (e.target.id === "pickup-modal") closeModal();
  });
  
  document.getElementById("add-driver-btn").onclick = () => {
    const input = document.getElementById("new-driver-name");
    window.addDriver(input.value);
    input.value = "";
  };

  document.getElementById("add-location-btn").onclick = () => {
    const nameInp = document.getElementById("new-location-name");
    const rateInp = document.getElementById("new-location-rate");
    window.addLocation(nameInp.value, rateInp.value);
    nameInp.value = "";
    rateInp.value = "";
  };

  document.getElementById("reset-all-btn").onclick = window.resetAll;
  document.getElementById("refresh-btn").onclick = () => { renderAll(); flash(t("coll_toast_refreshed", "Refreshed")); };

  document.getElementById("confirm-pickup-btn").onclick = () => {
    const driverId = document.getElementById("modal-driver").value;
    const locationId = document.getElementById("modal-location").value;
    const items = document.getElementById("modal-items").value;
    const notes = document.getElementById("modal-notes").value;
    const type = document.getElementById("modal-type").value;
    const codAmount = document.getElementById("modal-cod").value;
    const orderId = type === 'Delivery' ? document.getElementById("modal-orderid").value : "";
    const merchantId = type === 'Delivery' ? document.getElementById("modal-pickup-merchant").value : "";
    const arrivalTime = type === 'Delivery' ? "" : document.getElementById("modal-arrival").value;
    const date = document.getElementById("modal-date").value;
    
    if (state.editingPickupId) {
      window.saveEditedPickup({ id: state.editingPickupId, driverId, locationId, items, notes, arrivalTime, date, type, codAmount, orderId, merchantId });
    } else {
      window.addPickup({ driverId, locationId, items, notes, arrivalTime, date, type, codAmount, orderId, merchantId });
    }
  };

  document.getElementById("modal-location").onchange = updateModalCost;

  const tEl = document.getElementById("filter-type");
  if (tEl) tEl.onchange = renderDashboard;
  document.getElementById("filter-driver").onchange = renderDashboard;
  document.getElementById("filter-location").onchange = renderDashboard;
  document.getElementById("filter-month").onchange = renderDashboard;
  document.getElementById("filter-date").onchange = renderDashboard;
  document.getElementById("group-by").onchange = renderDashboard;
  
  document.getElementById("export-csv-btn").onclick = exportCSV;

  const selectAllPickups = document.getElementById("select-all-pickups");
  if (selectAllPickups) {
    selectAllPickups.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll(".pickup-checkbox").forEach(cb => cb.checked = isChecked);
      updateBulkDeleteBtn();
    });
  }

  const historyList = document.getElementById("history-list");
  if (historyList) {
    historyList.addEventListener("change", (e) => {
      if (e.target.classList.contains("pickup-checkbox")) {
        updateBulkDeleteBtn();
        const checkboxes = document.querySelectorAll(".pickup-checkbox");
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        if (selectAllPickups) {
          selectAllPickups.checked = allChecked;
          selectAllPickups.indeterminate = someChecked && !allChecked;
        }
      }
    });
  }

  const deleteSelectedBtn = document.getElementById("delete-selected-btn");
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const checkedBoxes = document.querySelectorAll(".pickup-checkbox:checked");
      if (checkedBoxes.length === 0) return;
      if (confirm(`Are you sure you want to permanently delete ${checkedBoxes.length} pickup(s)?`)) {
        try {
          const promises = Array.from(checkedBoxes).map(cb => {
            const id = cb.getAttribute("data-id");
            return remove(ref(db, `trackers/pickup-tracker-v2/pickups/${id}`));
          });
          await Promise.all(promises);
          flash(`Deleted ${checkedBoxes.length} pickup(s)`);
        } catch (error) {
          console.error("Failed to delete some pickups", error);
          alert("Failed to delete some pickups.");
        }
      }
    });
  }
}

function showApp() {
  renderAll();
}

function exportCSV() {
  const h = "Date,Time,Driver,Location,Type,Merchant,Order ID,COD Amount (JOD),Items,Cost (JOD),Arrival at Roots,Notes,Logged By\n";
  const targetPickups = window.currentFilteredPickups || state.pickups;
  const rows = targetPickups.map(p => {
    const d = state.config.drivers.find(x => x.id === p.driverId)?.name || "";
    const l = state.config.locations.find(x => x.id === p.locationId)?.name || "";
    const mName = (p.type === 'Delivery' && p.merchantId) ? (state.merchants[p.merchantId]?.name || "Unknown") : "";
    return `"${fmtDate(p.createdAt)}","${fmtTime(p.createdAt)}","${d}","${l}","${p.type || 'Pickup'}","${mName}","${p.orderId || ""}",${p.codAmount || 0},"${p.items || ""}",${p.cost},"${p.arrivalTime || ""}","${p.notes || ""}","${p.loggedBy || ""}"`;
  }).join("\n");
  const blob = new Blob([h + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pickups_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  flash(t("coll_toast_csv", "CSV exported"));
}

init();
