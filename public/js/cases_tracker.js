import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let merchants = {};
let cases = {};
let currentLayout = localStorage.getItem("cases_layout") || "list";

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

// ── Layout Toggles ──
const listBtn = document.getElementById("layout-list-btn");
const kanbanBtn = document.getElementById("layout-kanban-btn");
if (listBtn && kanbanBtn) {
  listBtn.addEventListener("click", () => { currentLayout = "list"; localStorage.setItem("cases_layout", "list"); renderLayoutToggle(); renderCases(); });
  kanbanBtn.addEventListener("click", () => { currentLayout = "kanban"; localStorage.setItem("cases_layout", "kanban"); renderLayoutToggle(); renderCases(); });
}

function renderLayoutToggle() {
  if (!listBtn || !kanbanBtn) return;
  if (currentLayout === "list") {
    listBtn.classList.add("active");
    kanbanBtn.classList.remove("active");
  } else {
    kanbanBtn.classList.add("active");
    listBtn.classList.remove("active");
  }
}
renderLayoutToggle();

// ── Tabs ──
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view-section").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.tab}`).classList.add("active");
  });
});

const showDescToggle = document.getElementById("show-desc-toggle");
if (showDescToggle) {
  showDescToggle.addEventListener("change", (e) => {
    const table = document.querySelector(".cases-table");
    if (table) {
      if (e.target.checked) table.classList.add("show-all-desc");
      else table.classList.remove("show-all-desc");
    }
  });
}

// ══════════════════════════════════════════════
//  MERCHANTS
// ══════════════════════════════════════════════

function loadMerchants() {
  onValue(ref(db, "cases_tracker/merchants"), (snap) => {
    merchants = snap.val() || {};
    renderMerchants();
    populateMerchantFilter();
    populateModalMerchant();
    renderCases(); // re-render cases to pick up merchant colors
  });
}

function renderMerchants() {
  const list = document.getElementById("merchants-list");
  const entries = Object.entries(merchants);

  if (entries.length === 0) {
    list.innerHTML = `<div style="color: var(--muted); font-size: 13px;">${t("cases_no_merchants", "No merchants yet. Add one above.")}</div>`;
    return;
  }

  list.innerHTML = entries.map(([id, m]) => `
    <div class="merchant-item">
      <div class="merchant-info">
        <input type="color" class="merchant-color-swatch editable-color" value="${m.color}" onchange="updateMerchantColor('${id}', this.value)" title="Change color">
        <span class="merchant-name">${m.name}</span>
      </div>
      <button class="btn-delete" onclick="deleteMerchant('${id}')" title="Remove merchant">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  `).join("");
}

function populateMerchantFilter() {
  const sel = document.getElementById("filter-merchant");
  const current = sel.value;
  sel.innerHTML = `<option value="all">${t("cases_filter_merchants", "All Merchants")}</option>`;
  Object.entries(merchants).forEach(([id, m]) => {
    sel.innerHTML += `<option value="${id}">${m.name}</option>`;
  });
  sel.value = current || "all";
}

function populateModalMerchant() {
  const sel = document.getElementById("modal-merchant");
  sel.innerHTML = "";
  const entries = Object.entries(merchants);
  if (entries.length === 0) {
    sel.innerHTML = `<option value="">${t("cases_add_merchant_first", "— Add a merchant first —")}</option>`;
    return;
  }
  entries.forEach(([id, m]) => {
    sel.innerHTML += `<option value="${id}">${m.name}</option>`;
  });
}

// Add Merchant
document.getElementById("add-merchant-btn").addEventListener("click", async () => {
  const nameInp = document.getElementById("new-merchant-name");
  const colorInp = document.getElementById("new-merchant-color");
  const name = nameInp.value.trim();
  const color = colorInp.value;

  if (!name) { alert("Enter a merchant name."); return; }

  try {
    const newRef = push(ref(db, "cases_tracker/merchants"));
    await set(newRef, { name, color });
    nameInp.value = "";
    showToast(`${name} added`);
  } catch (e) {
    console.error("Failed to add merchant", e);
  }
});

window.deleteMerchant = async (id) => {
  const m = merchants[id];
  if (confirm(`Delete merchant "${m?.name}"?`)) {
    try {
      await remove(ref(db, `cases_tracker/merchants/${id}`));
      showToast("Merchant removed");
    } catch (e) {
      console.error("Failed to delete merchant", e);
    }
  }
};

window.updateMerchantColor = async (id, newColor) => {
  try {
    await update(ref(db, `cases_tracker/merchants/${id}`), { color: newColor });
    showToast("Color updated");
  } catch (e) {
    console.error("Failed to update color", e);
  }
};

// ══════════════════════════════════════════════
//  CASES
// ══════════════════════════════════════════════

function loadCases() {
  onValue(ref(db, "cases_tracker/cases"), (snap) => {
    const raw = snap.val() || {};
    cases = {};
    for (const [id, c] of Object.entries(raw)) {
      if (c.status === "open" || !c.status) c.status = "unresolved"; // legacy mapping
      cases[id] = c;
    }
    renderCases();
  });
}

function renderCases() {
  const tbody = document.getElementById("cases-tbody");
  const emptyEl = document.getElementById("cases-empty");
  const tableWrap = document.getElementById("cases-table-wrap");
  const kanbanWrap = document.getElementById("cases-kanban-wrap");
  const statsEl = document.getElementById("cases-stats");

  // Get filter values
  const merchantFilter = document.getElementById("filter-merchant").value;
  const statusFilter = document.getElementById("filter-status").value;
  const chargeFilter = document.getElementById("filter-charge") ? document.getElementById("filter-charge").value : "all";
  const searchFilter = document.getElementById("filter-search") ? document.getElementById("filter-search").value.toLowerCase() : "";

  let entries = Object.entries(cases);

  // Apply filters
  if (merchantFilter !== "all") {
    entries = entries.filter(([, c]) => c.merchantId === merchantFilter);
  }
  if (statusFilter !== "all") {
    entries = entries.filter(([, c]) => c.status === statusFilter);
  }
  if (chargeFilter !== "all") {
    entries = entries.filter(([, c]) => (c.charge || "NONE") === chargeFilter);
  }
  if (searchFilter) {
    entries = entries.filter(([, c]) => {
      const oid = (c.orderId || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      return oid.includes(searchFilter) || desc.includes(searchFilter);
    });
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b[1].datetime || 0) - new Date(a[1].datetime || 0));

  window.currentFilteredCases = entries;

  // Stats (from all cases, not filtered)
  const allEntries = Object.values(cases);
  const totalCases = allEntries.length;
  const unresolvedCases = allEntries.filter(c => c.status === "unresolved").length;
  const investigatingCases = allEntries.filter(c => c.status === "investigating").length;
  const resolvedCases = allEntries.filter(c => c.status === "resolved").length;

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">${t("cases_stats_total", "Total Cases")}</div>
      <div class="stat-val">${totalCases}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("status_unresolved", "Unresolved")}</div>
      <div class="stat-val" style="color: var(--red);">${unresolvedCases}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("status_investigating", "Investigating")}</div>
      <div class="stat-val" style="color: var(--amber);">${investigatingCases}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t("status_resolved", "Resolved")}</div>
      <div class="stat-val" style="color: var(--green);">${resolvedCases}</div>
    </div>
  `;

  if (entries.length === 0) {
    emptyEl.style.display = "block";
    if (tableWrap) tableWrap.style.display = "none";
    if (kanbanWrap) kanbanWrap.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  if (currentLayout === "list") {
    if (tableWrap) tableWrap.style.display = "block";
    if (kanbanWrap) kanbanWrap.style.display = "none";
  } else {
    if (tableWrap) tableWrap.style.display = "none";
    if (kanbanWrap) kanbanWrap.style.display = "flex";
  }

  // ── Render List View ──
  tbody.innerHTML = entries.map(([id, c]) => {
    const m = merchants[c.merchantId] || { name: t("cases_unknown_merchant", "Unknown"), color: "#999" };
    const statusClass = `status-${c.status}`;
    const statusLabel = t(`status_${c.status}`, c.status.charAt(0).toUpperCase() + c.status.slice(1));

    // Format datetime
    let dtDisplay = "—";
    if (c.datetime) {
      const dt = new Date(c.datetime);
      dtDisplay = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        + " " + dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }

    // Format Charge Badge
    const rawCharge = c.charge || "NONE";
    const chargeVal = rawCharge === "NONE" ? "None" : rawCharge;
    const chargeBadgeClass = `charge-${rawCharge.toLowerCase()}`;

    return `
      <tr>
        <td><input type="checkbox" class="case-checkbox" data-id="${id}"></td>
        <td>
          <span class="merchant-badge" style="background: ${m.color}18; color: ${m.color};">
            <span class="merchant-dot" style="background: ${m.color};"></span>
            ${m.name}
          </span>
        </td>
        <td style="font-family: var(--mono); font-size: 12px; font-weight: 600;">${c.orderId || "—"}</td>
        <td class="desc-cell" title="Double click to expand/collapse" ondblclick="this.classList.toggle('expanded')">${c.description || "—"}</td>
        <td class="desc-cell" title="Double click to expand/collapse" ondblclick="this.classList.toggle('expanded')">${c.action || "—"}</td>
        <td><span class="charge-badge ${chargeBadgeClass}">${chargeVal}</span></td>
        <td style="font-size: 12px; white-space: nowrap;">${dtDisplay}</td>
        <td>
          <span class="status-badge ${statusClass}" onclick="toggleStatus('${id}')" title="Click to cycle status">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button class="btn-action btn-edit" onclick="editCase('${id}')" title="Edit case">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="btn-action btn-delete" onclick="deleteCase('${id}')" title="Delete case">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const selectAllCases = document.getElementById("select-all-cases");
  if (selectAllCases) {
    selectAllCases.checked = false;
    selectAllCases.indeterminate = false;
  }
  updateBulkDeleteBtn();

  // ── Render Kanban View ──
  renderKanban(entries);
}

function renderKanban(entries) {
  const cols = ["unresolved", "investigating", "resolved"];
  cols.forEach(status => {
    const colEl = document.getElementById(`kanban-${status}`);
    const countEl = document.getElementById(`count-${status}`);
    if (!colEl || !countEl) return;
    
    const colCases = entries.filter(([, c]) => c.status === status);
    countEl.textContent = colCases.length;
    
    colEl.innerHTML = colCases.map(([id, c]) => {
      const m = merchants[c.merchantId] || { name: t("cases_unknown_merchant", "Unknown"), color: "#999" };
      
      const rawCharge = c.charge || "NONE";
      const chargeVal = rawCharge === "NONE" ? "None" : rawCharge;
      const chargeBadgeClass = `charge-${rawCharge.toLowerCase()}`;
      
      let dtDisplay = "—";
      if (c.datetime) {
        const dt = new Date(c.datetime);
        dtDisplay = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      }

      return `
        <div class="kanban-card" draggable="true" data-id="${id}">
          <div class="kanban-card-header">
            <span class="merchant-badge" style="background: ${m.color}18; color: ${m.color}; padding: 3px 8px; font-size: 11px;">
              <span class="merchant-dot" style="background: ${m.color}; width: 6px; height: 6px;"></span>
              ${m.name}
            </span>
            <span class="kanban-order-id">${c.orderId || "—"}</span>
          </div>
          <div class="kanban-card-body">${c.description || "—"}</div>
          <div class="kanban-card-footer">
            <span class="charge-badge ${chargeBadgeClass}">${chargeVal}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="font-size: 11px; color: var(--muted);">${dtDisplay}</span>
              <button class="btn-action btn-edit" onclick="editCase('${id}')" title="Edit case">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  });

  setupKanbanDragAndDrop();
}

function setupKanbanDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-column');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  columns.forEach(column => {
    column.addEventListener('dragover', e => {
      e.preventDefault();
      const afterElement = getDragAfterElement(column.querySelector('.kanban-cards'), e.clientY);
      const draggable = document.querySelector('.dragging');
      if (draggable) {
        const container = column.querySelector('.kanban-cards');
        if (afterElement == null) {
          container.appendChild(draggable);
        } else {
          container.insertBefore(draggable, afterElement);
        }
      }
    });

    column.addEventListener('drop', async e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const newStatus = column.dataset.status;
      if (id && cases[id] && cases[id].status !== newStatus) {
        try {
          await update(ref(db, `cases_tracker/cases/${id}`), { status: newStatus });
          showToast(`Case moved to ${newStatus}`);
        } catch (error) {
          console.error("Failed to move case", error);
        }
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child }
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateBulkDeleteBtn() {
  const btn = document.getElementById("delete-selected-btn");
  if (!btn) return;
  const checkedCount = document.querySelectorAll(".case-checkbox:checked").length;
  if (checkedCount > 0) {
    btn.style.display = "inline-block";
    btn.textContent = `${t("btn_delete_selected", "Delete Selected")} (${checkedCount})`;
  } else {
    btn.style.display = "none";
  }
}

const selectAllCases = document.getElementById("select-all-cases");
if (selectAllCases) {
  selectAllCases.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll(".case-checkbox").forEach(cb => cb.checked = isChecked);
    updateBulkDeleteBtn();
  });
}

document.getElementById("cases-tbody").addEventListener("change", (e) => {
  if (e.target.classList.contains("case-checkbox")) {
    updateBulkDeleteBtn();
    const checkboxes = document.querySelectorAll(".case-checkbox");
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    if (selectAllCases) {
      selectAllCases.checked = allChecked;
      selectAllCases.indeterminate = someChecked && !allChecked;
    }
  }
});

const deleteSelectedBtn = document.getElementById("delete-selected-btn");
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener("click", async () => {
    const checkedBoxes = document.querySelectorAll(".case-checkbox:checked");
    if (checkedBoxes.length === 0) return;
    if (confirm(`Are you sure you want to permanently delete ${checkedBoxes.length} case(s)?`)) {
      try {
        const promises = Array.from(checkedBoxes).map(cb => {
          const id = cb.getAttribute("data-id");
          return remove(ref(db, `cases_tracker/cases/${id}`));
        });
        await Promise.all(promises);
        showToast(`Deleted ${checkedBoxes.length} case(s)`);
      } catch (error) {
        console.error("Failed to delete some cases", error);
        alert("Failed to delete some cases.");
      }
    }
  });
}

// Cycle status
window.toggleStatus = async (id) => {
  const c = cases[id];
  if (!c) return;
  const statuses = ["unresolved", "investigating", "resolved"];
  const currentIndex = statuses.indexOf(c.status);
  const newStatus = statuses[(currentIndex + 1) % statuses.length];
  try {
    await update(ref(db, `cases_tracker/cases/${id}`), { status: newStatus });
    showToast(`Case marked as ${newStatus}`);
  } catch (e) {
    console.error("Failed to cycle status", e);
  }
};

// Delete case
window.deleteCase = async (id) => {
  if (confirm("Are you sure you want to permanently delete this case?")) {
    try {
      await remove(ref(db, `cases_tracker/cases/${id}`));
      showToast("Case deleted");
    } catch (e) {
      console.error("Failed to delete case", e);
    }
  }
};

// Filters
document.getElementById("filter-merchant").addEventListener("change", renderCases);
document.getElementById("filter-status").addEventListener("change", renderCases);
const chargeEl = document.getElementById("filter-charge");
if (chargeEl) chargeEl.addEventListener("change", renderCases);
const searchEl = document.getElementById("filter-search");
if (searchEl) searchEl.addEventListener("input", renderCases);

// ══════════════════════════════════════════════
//  MODAL: New Case
// ══════════════════════════════════════════════

const modal = document.getElementById("case-modal");
const merchantSelect = document.getElementById("modal-merchant");
const merchantColor = document.getElementById("modal-merchant-color");
let editingCaseId = null;

function updateModalMerchantColor() {
  if (!merchantSelect || !merchantColor) return;
  const m = merchants[merchantSelect.value];
  merchantColor.style.background = m ? m.color : "transparent";
}

if (merchantSelect) {
  merchantSelect.addEventListener("change", updateModalMerchantColor);
}

document.getElementById("open-case-btn").addEventListener("click", () => {
  if (Object.keys(merchants).length === 0) {
    alert("Add at least one merchant in the Merchants tab first.");
    return;
  }
  
  editingCaseId = null;
  document.querySelector(".modal-title").textContent = t("cases_modal_title", "New Case");
  document.getElementById("confirm-case-btn").textContent = t("cases_create_btn", "Create Case");

  // Set default datetime to now
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  document.getElementById("modal-datetime").value = local.toISOString().slice(0, 16);

  // Clear fields
  document.getElementById("modal-order-id").value = "";
  document.getElementById("modal-description").value = "";
  document.getElementById("modal-action").value = "";
  document.getElementById("modal-charge").value = "NONE";
  document.getElementById("modal-status").value = "unresolved"; // new default
  
  // Set default merchant color
  setTimeout(updateModalMerchantColor, 0);

  modal.style.display = "flex";
});

window.editCase = (id) => {
  const c = cases[id];
  if (!c) return;

  editingCaseId = id;
  document.querySelector(".modal-title").textContent = t("cases_modal_edit", "Edit Case");
  document.getElementById("confirm-case-btn").textContent = t("cases_update_btn", "Update Case");

  document.getElementById("modal-merchant").value = c.merchantId || "";
  document.getElementById("modal-order-id").value = c.orderId || "";
  document.getElementById("modal-description").value = c.description || "";
  document.getElementById("modal-action").value = c.action || "";
  document.getElementById("modal-charge").value = c.charge || "NONE";
  document.getElementById("modal-status").value = c.status || "unresolved";
  document.getElementById("modal-datetime").value = c.datetime ? c.datetime.slice(0, 16) : "";

  updateModalMerchantColor();

  modal.style.display = "flex";
};

document.getElementById("close-modal-btn").addEventListener("click", () => {
  modal.style.display = "none";
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

document.getElementById("confirm-case-btn").addEventListener("click", async () => {
  const merchantId = document.getElementById("modal-merchant").value;
  const orderId = document.getElementById("modal-order-id").value.trim();
  const description = document.getElementById("modal-description").value.trim();
  const action = document.getElementById("modal-action").value.trim();
  const charge = document.getElementById("modal-charge").value;
  const status = document.getElementById("modal-status").value;
  const datetime = document.getElementById("modal-datetime").value;

  if (!merchantId) { alert("Select a merchant."); return; }
  if (!orderId) { alert("Enter an Order ID."); return; }

  try {
    if (editingCaseId) {
      await update(ref(db, `cases_tracker/cases/${editingCaseId}`), {
        merchantId,
        orderId,
        description,
        action,
        charge,
        status,
        datetime: datetime || new Date().toISOString()
      });
      showToast("Case updated");
    } else {
      const newRef = push(ref(db, "cases_tracker/cases"));
      await set(newRef, {
        merchantId,
        orderId,
        description,
        action,
        charge,
        status,
        datetime: datetime || new Date().toISOString(),
        createdBy: localStorage.getItem("roots-user") || "unknown",
        createdAt: new Date().toISOString()
      });
      showToast("Case created");
    }
    modal.style.display = "none";
  } catch (e) {
    console.error("Failed to save case", e);
  }
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
  const targetCases = window.currentFilteredCases || Object.entries(cases);
  
  const h = "Date,Time,Merchant,Order ID,Description,Action Taken,Type/Charge,Status,Logged By\n";
  const rows = targetCases.map(([id, c]) => {
    const m = merchants[c.merchantId] || { name: "Unknown" };
    let d = "", t = "";
    if (c.datetime) {
      const dt = new Date(c.datetime);
      d = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      t = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    
    // Escape quotes in description and action
    const desc = (c.description || "").replace(/"/g, '""');
    const act = (c.action || "").replace(/"/g, '""');
    
    return `"${d}","${t}","${m.name}","${c.orderId || ""}","${desc}","${act}","${c.charge || 'NONE'}","${c.status}","${c.createdBy || ""}"`;
  }).join("\n");
  
  const blob = new Blob([h + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cases_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast("CSV exported");
});

// ── Init ──
loadMerchants();
loadCases();
