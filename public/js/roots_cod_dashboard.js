import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

function sanitizeKey(str) {
    return encodeURIComponent(str || '').replace(/\./g, '%2E');
}

function getGroupVal(item) {
    if (item === undefined || item === null) return '';
    if (typeof item === 'object') {
        return item.received !== undefined && item.received !== null ? item.received : '';
    }
    return item;
}

function getGroupRemarks(item) {
    if (item === undefined || item === null) return '';
    if (typeof item === 'object') {
        return item.remarks || '';
    }
    return '';
}

function isGroupLocked(item) {
    if (item === undefined || item === null) return false;
    if (typeof item === 'object') {
        return item.locked === true;
    }
    return false;
}

function checkNearestIntegerMatch(dueVal, receivedVal) {
    if (receivedVal === '' || receivedVal === null || receivedVal === undefined) return false;
    const due = parseFloat(dueVal);
    const rec = parseFloat(receivedVal);
    if (isNaN(due) || isNaN(rec)) return false;
    return Math.round(due) === Math.round(rec) || Math.abs(due - rec) < 1.0;
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(36, el.scrollHeight) + 'px';
}

let activeCodListenerUnsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem("roots-user") || "User";
    const isAdmin = currentUser === "Roots" || localStorage.getItem("roots-isAdmin") === "true";

    const adminFetchContainer = document.getElementById('admin-fetch-container');
    if (adminFetchContainer) {
        if (isAdmin) {
            adminFetchContainer.classList.remove('hidden');
        } else {
            adminFetchContainer.classList.add('hidden');
        }
    }

    // Set default dates to today
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    if (startDateInput) startDateInput.value = today;
    if (endDateInput) endDateInput.value = today;

    const form = document.getElementById('fetch-form');
    const fetchBtn = document.getElementById('fetch-btn');
    const btnText = document.querySelector('#fetch-btn .btn-text');
    const btnLoader = document.getElementById('btn-loader');
    const statusMessage = document.getElementById('status-message');

    const tableContainer = document.getElementById('table-container');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const exportBtn = document.getElementById('export-btn');
    const sellersToggle = document.getElementById('sellers-toggle');
    const sellersToggleText = document.getElementById('sellers-toggle-text');
    const emptyState = document.getElementById('empty-state');
    const sellersContainer = document.getElementById('sellers-container');

    let allSellersData = [];
    let apiOrders = [];
    let receivedCodState = {};
    let summaryCurrentPage = 1;
    let summaryPageSize = 20;
    let ordersCurrentPage = 1;
    let ordersPageSize = 20;
    let ordersFilterDeliveredDate = 'all';
    let ordersFilterDeliveredStart = '';
    let ordersFilterDeliveredEnd = '';
    let ordersFilterCreatedDate = 'all';
    let ordersFilterCreatedStart = '';
    let ordersFilterCreatedEnd = '';
    let ordersFilterStore = 'all';
    let ordersFilterPartner = 'all';
    let ordersFilterCustomLabel = 'all';
    let ordersFilterTag = 'all';
    let ordersFilterStatus = 'all';
    let ordersFilterSearch = '';
    let ordersSortColumn = 'order_created_at';
    let ordersSortDirection = 'desc';
    let ordersFiltersInitialized = false;
    let currentFilteredOrders = [];

    // Dropdown toggle
    if (sellersToggle && sellersContainer) {
        sellersToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sellersContainer.classList.toggle('show');
            sellersToggle.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (document.getElementById('sellers-dropdown') && !document.getElementById('sellers-dropdown').contains(e.target)) {
                sellersContainer.classList.remove('show');
                sellersToggle.classList.remove('open');
            }
        });
    }

    // Update Dropdown Text
    function updateSellersToggleText() {
        if (!sellersContainer || !sellersToggleText) return;
        const checkboxes = sellersContainer.querySelectorAll('input[type="checkbox"]:not(#all-sellers-cb)');
        const selected = Array.from(checkboxes).filter(cb => cb.checked);
        const selectAllCb = document.getElementById('all-sellers-cb');

        if (selected.length === 0) {
            sellersToggleText.textContent = "Select Sellers";
        } else if (selected.length === checkboxes.length) {
            sellersToggleText.textContent = "All Sellers";
            if (selectAllCb) selectAllCb.checked = true;
        } else {
            sellersToggleText.textContent = `${selected.length} Selected`;
            if (selectAllCb) selectAllCb.checked = false;
        }
    }

    // Load Sellers (if admin)
    async function loadSellers() {
        if (!isAdmin || !sellersContainer || !sellersToggleText) return;
        try {
            sellersToggleText.textContent = "Loading...";
            sellersContainer.innerHTML = '<div class="loader-small"></div> <span class="muted-text">Loading sellers...</span>';

            const response = await fetch('/fetchSellers', {
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            if (!response.ok) throw new Error(`Failed to fetch sellers (HTTP ${response.status})`);
            const data = await response.json();
            allSellersData = data.data?.sellers || [];

            if (allSellersData.length === 0) {
                sellersContainer.innerHTML = '<p style="padding:10px; color: var(--muted);">No active sellers found.</p>';
                sellersToggleText.textContent = 'No Sellers';
                return;
            }

            let html = `<label class="seller-option"><input type="checkbox" id="all-sellers-cb" checked> <strong>All Sellers (${allSellersData.length})</strong></label>`;
            allSellersData.forEach(seller => {
                html += `<label class="seller-option"><input type="checkbox" class="seller-cb" value="${seller.code}" checked> ${seller.name} (${seller.code})</label>`;
            });
            sellersContainer.innerHTML = html;

            const allCb = document.getElementById('all-sellers-cb');
            const indCbs = document.querySelectorAll('.seller-cb');

            allCb?.addEventListener('change', (e) => {
                indCbs.forEach(cb => cb.checked = e.target.checked);
                updateSellersToggleText();
            });

            indCbs.forEach(cb => {
                cb.addEventListener('change', () => {
                    const checked = document.querySelectorAll('.seller-cb:checked');
                    if (allCb) allCb.checked = checked.length === indCbs.length;
                    updateSellersToggleText();
                });
            });

            updateSellersToggleText();
        } catch (error) {
            console.error('Error loading sellers:', error);
            sellersContainer.innerHTML = `
                <div style="padding: 10px; text-align: center;">
                    <p style="color: var(--red); font-size: 12px; margin-bottom: 6px;">Failed to load sellers.</p>
                    <button type="button" id="btn-retry-sellers" style="background: var(--ol); color: var(--orange); border: 1px solid var(--orange); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">Retry ↻</button>
                </div>
            `;
            document.getElementById('btn-retry-sellers')?.addEventListener('click', (e) => {
                e.stopPropagation();
                loadSellers();
            });
            sellersToggleText.textContent = "Error Loading";
        }
    }

    if (isAdmin) {
        loadSellers();
    }

    function showStatus(message, isError = false) {
        if (!statusMessage) return;
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${isError ? 'error' : 'success'}`;
        setTimeout(() => statusMessage.classList.add('hidden'), 5000);
    }

    // 1. Setup Real-time Listener for COD Reconciliation State
    const codReconRef = ref(db, 'cod_reconciliation');
    onValue(codReconRef, (snap) => {
        receivedCodState = snap.val() || {};
        if (apiOrders && apiOrders.length > 0) {
            renderDeliveredSummary(apiOrders);
        }
    });

    // 2. Setup Real-time Listener for Stored Multi-Day Orders from Firebase RTDB
    const dailyOrdersRef = ref(db, 'cod_daily_orders');
    onValue(dailyOrdersRef, (snap) => {
        const dailyData = snap.val() || {};
        const allOrders = [];

        // Sort date keys descending (newest dates first)
        Object.keys(dailyData).sort().reverse().forEach(dateKey => {
            const dayOrdersMap = dailyData[dateKey] || {};
            Object.values(dayOrdersMap).forEach(order => {
                order._dateKey = dateKey;
                allOrders.push(order);
            });
        });

        apiOrders = allOrders;
        ordersCurrentPage = 1;

        const summarySection = document.getElementById('summary-section');
        const allOrdersSection = document.getElementById('all-orders-section');
        const tableContainerEl = document.getElementById('table-container');

        if (allOrders.length > 0) {
            if (emptyState) emptyState.style.display = 'none';
            if (summarySection) summarySection.classList.remove('hidden');
            if (allOrdersSection) allOrdersSection.classList.remove('hidden');
            if (tableContainerEl) tableContainerEl.classList.remove('hidden');
            if (exportBtn) exportBtn.classList.remove('hidden');

            renderDeliveredSummary(apiOrders);
            updateOrdersFilterDropdownOptions(apiOrders);
            renderOrdersTable();
        } else {
            if (emptyState) {
                emptyState.style.display = 'flex';
                const title = document.getElementById('empty-state-title');
                const text = document.getElementById('empty-state-text');
                if (title) title.textContent = 'No Orders in Database';
                if (text) text.textContent = 'Orders are automatically fetched every midnight, or can be synced by an Admin.';
            }
            if (summarySection) summarySection.classList.add('hidden');
            if (allOrdersSection) allOrdersSection.classList.add('hidden');
            if (tableContainerEl) tableContainerEl.classList.add('hidden');
            if (exportBtn) exportBtn.classList.add('hidden');
        }
    });

    // Admin Manual Sync Form Handler
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const selectedSellerCheckboxes = document.querySelectorAll('.seller-cb:checked');
            const selectedSellers = Array.from(selectedSellerCheckboxes).map(cb => cb.value);

            if (selectedSellers.length === 0) {
                showStatus('Please select at least one seller', true);
                return;
            }

            const startTs = new Date(`${startDateInput.value}T00:00:00+03:00`).getTime();
            const endTs = new Date(`${endDateInput.value}T23:59:59.999+03:00`).getTime();

            if (btnText) btnText.textContent = 'Syncing...';
            if (fetchBtn) fetchBtn.disabled = true;
            if (btnLoader) btnLoader.classList.remove('hidden');

            try {
                const response = await fetch('/syncCODOrders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data: {
                            startDate: startDateInput.value,
                            endDate: endDateInput.value,
                            startTimestamp: startTs,
                            endTimestamp: endTs,
                            sellers: selectedSellers
                        }
                    })
                });

                if (!response.ok) throw new Error('API request failed');

                const resData = await response.json();
                const count = resData.data?.count || 0;
                showStatus(`Successfully synced and saved ${count} orders for ${startDateInput.value} to ${endDateInput.value}.`);
            } catch (error) {
                console.error(error);
                showStatus('Error syncing COD orders: ' + error.message, true);
            } finally {
                if (btnText) btnText.textContent = 'Sync Date Range';
                if (fetchBtn) fetchBtn.disabled = false;
                if (btnLoader) btnLoader.classList.add('hidden');
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function flattenObject(ob) {
        var toReturn = {};

        for (var i in ob) {
            if (!ob.hasOwnProperty(i)) continue;

            if ((typeof ob[i]) == 'object' && ob[i] !== null) {
                if (Array.isArray(ob[i])) {
                    toReturn[i] = JSON.stringify(ob[i]);
                } else {
                    var flatObject = flattenObject(ob[i]);
                    for (var x in flatObject) {
                        if (!flatObject.hasOwnProperty(x)) continue;
                        toReturn[i + '_' + x] = flatObject[x];
                    }
                }
            } else {
                toReturn[i] = ob[i];
            }
        }
        return toReturn;
    }

    const headers = [
        "order_id",
        "order_created_at",
        "order_delivered_at",
        "store_name",
        "display_status",
        "invoice_total",
        "invoice_total_due",
        "payment_method",
        "shipment_courier_partner_name",
        "custom_labels",
        "tags"
    ];

    const headerDisplayNames = {
        "order_id": "Order ID",
        "order_created_at": "Order Created At",
        "order_delivered_at": "Order Delivered At",
        "store_name": "Store Name",
        "display_status": "Status",
        "invoice_total": "Invoice Total (JOD)",
        "invoice_total_due": "Total Due (JOD)",
        "payment_method": "Payment Method",
        "shipment_courier_partner_name": "Shipping Partner",
        "custom_labels": "Custom Labels",
        "tags": "Tags"
    };

    function extractOrderCustomLabelsList(originalOrder, flat) {
        const rawCustom = originalOrder.custom_labels || (flat ? flat.custom_labels : null) || [];
        const labelItems = new Set();

        if (Array.isArray(rawCustom)) {
            rawCustom.forEach(t => {
                if (typeof t === 'string' && t.trim()) {
                    t.split(',').map(s => s.trim()).filter(Boolean).forEach(item => labelItems.add(item));
                } else if (typeof t === 'object' && t !== null) {
                    const val = t.name || t.label || t.value || '';
                    if (val) String(val).split(',').map(s => s.trim()).filter(Boolean).forEach(item => labelItems.add(item));
                }
            });
        } else if (typeof rawCustom === 'string' && rawCustom.trim()) {
            rawCustom.split(',').map(s => s.trim()).filter(Boolean).forEach(item => labelItems.add(item));
        }

        return Array.from(labelItems);
    }

    function extractOrderTagsList(originalOrder, flat) {
        const rawTags = originalOrder.tags || (flat ? flat.tags : null) || [];
        const tagItems = new Set();

        if (Array.isArray(rawTags)) {
            rawTags.forEach(t => {
                if (typeof t === 'string' && t.trim()) {
                    t.split(',').map(s => s.trim()).filter(Boolean).forEach(item => tagItems.add(item));
                } else if (typeof t === 'object' && t !== null) {
                    const val = t.name || t.label || t.value || '';
                    if (val) String(val).split(',').map(s => s.trim()).filter(Boolean).forEach(item => tagItems.add(item));
                }
            });
        } else if (typeof rawTags === 'string' && rawTags.trim()) {
            rawTags.split(',').map(s => s.trim()).filter(Boolean).forEach(item => tagItems.add(item));
        }

        return Array.from(tagItems);
    }

    function getOrderFieldValue(header, originalOrder, flat) {
        if (header === 'order_id') {
            return originalOrder.order_id || originalOrder.order_alias || '';
        } else if (header === 'order_created_at') {
            const rawCreated = originalOrder.order_created_at || originalOrder.created_at || flat.order_created_at || flat.created_at;
            if (!rawCreated) return '-';
            const d = new Date(rawCreated);
            return isNaN(d.getTime()) ? String(rawCreated) : d.toLocaleString('en-GB');
        } else if (header === 'order_delivered_at') {
            const delAt = originalOrder.shipment?.order_delivered_at ||
                originalOrder.order_delivered_at ||
                originalOrder.shipment?.delivered_at ||
                originalOrder.delivered_at ||
                flat.shipment_order_delivered_at ||
                flat.order_delivered_at ||
                flat.shipment_delivered_at;
            if (!delAt) return '-';
            const d = new Date(delAt);
            return isNaN(d.getTime()) ? String(delAt) : d.toLocaleString('en-GB');
        } else if (header === 'store_name') {
            return extractStoreName(originalOrder, flat) || '-';
        } else if (header === 'display_status') {
            return originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '';
        } else if (header === 'invoice_total') {
            const val = extractOrderInvoiceTotal(originalOrder, flat);
            return val.toFixed(3);
        } else if (header === 'invoice_total_due') {
            const val = extractOrderTotalDue(originalOrder, flat);
            return val.toFixed(3);
        } else if (header === 'payment_method') {
            return flat.payment_method || originalOrder.payment_method || '';
        } else if (header === 'shipment_courier_partner_name') {
            return extractShippingPartner(originalOrder, flat);
        } else if (header === 'custom_labels') {
            const customList = extractOrderCustomLabelsList(originalOrder, flat);
            return customList.join(', ');
        } else if (header === 'tags') {
            const tagList = extractOrderTagsList(originalOrder, flat);
            return tagList.join(', ');
        }
        return flat[header] !== undefined && flat[header] !== null ? flat[header] : '';
    }

    function extractStoreName(originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);
        const store = originalOrder.store_name ||
            flat.store_name ||
            originalOrder.seller_name ||
            flat.seller_name ||
            originalOrder.seller_code ||
            flat.seller_code ||
            originalOrder.store ||
            flat.store ||
            '';
        return String(store).trim();
    }

    function isJafarShopStore(originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);
        const store = String(originalOrder.store_name || flat.store_name || originalOrder.seller_name || flat.seller_name || originalOrder.seller_code || flat.seller_code || originalOrder.store || flat.store || '').toLowerCase().trim();
        return store.includes('jafar') || store === 'js';
    }

    function hasRootsOrGoldenDeliveryCustomLabel(originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);
        const labelList = extractOrderCustomLabelsList(originalOrder, flat);
        return labelList.some(t => {
            const lower = t.toLowerCase().trim();
            return lower.includes('roots') || lower.includes('golden delivery') || lower.includes('golden');
        });
    }

    function extractOrderInvoiceTotal(originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);
        const val = originalOrder.invoice?.total !== undefined ? originalOrder.invoice.total : 
                    (flat.invoice_total !== undefined ? flat.invoice_total : 
                    (originalOrder.total_amount !== undefined ? originalOrder.total_amount : 0));
        const num = parseFloat(val);
        return !isNaN(num) ? num : 0;
    }

    function extractOrderTotalDue(originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);
        // Strictly read total_due from invoice or order with ZERO fallbacks to shipment.cod_amount or invoice.total
        const rawDue = originalOrder.invoice?.total_due !== undefined ? originalOrder.invoice.total_due : 
                       (originalOrder.total_due !== undefined ? originalOrder.total_due : 
                       (flat.invoice_total_due !== undefined ? flat.invoice_total_due : (flat.total_due !== undefined ? flat.total_due : 0)));
        const num = parseFloat(rawDue);
        return (!isNaN(num) && num > 0) ? num : 0;
    }

    function getOrderRawSortValue(header, originalOrder, flat) {
        if (!flat) flat = flattenObject(originalOrder);

        if (header === 'order_created_at') {
            const creInfo = extractOrderCreatedDate(originalOrder, flat);
            if (creInfo && creInfo.timestamp) return creInfo.timestamp;
            const raw = originalOrder.order_created_at || originalOrder.created_at || flat.order_created_at || flat.created_at;
            if (!raw) return 0;
            const t = new Date(raw).getTime();
            return isNaN(t) ? 0 : t;
        }

        if (header === 'order_delivered_at') {
            const delInfo = extractOrderDeliveredDate(originalOrder, flat);
            if (delInfo && delInfo.timestamp) return delInfo.timestamp;
            const raw = originalOrder.shipment?.order_delivered_at || originalOrder.order_delivered_at || flat.shipment_order_delivered_at || flat.order_delivered_at;
            if (!raw) return 0;
            const t = new Date(raw).getTime();
            return isNaN(t) ? 0 : t;
        }

        if (header === 'invoice_total') {
            return extractOrderInvoiceTotal(originalOrder, flat);
        }

        if (header === 'invoice_total_due') {
            return extractOrderTotalDue(originalOrder, flat);
        }

        if (header === 'order_id') {
            return String(originalOrder.order_id || originalOrder.order_alias || flat.order_id || '').trim();
        }

        if (header === 'store_name') {
            return extractStoreName(originalOrder, flat).toLowerCase();
        }

        if (header === 'display_status') {
            return (originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim();
        }

        if (header === 'payment_method') {
            return (flat.payment_method || originalOrder.payment_method || '').toString().toLowerCase().trim();
        }

        if (header === 'shipment_courier_partner_name') {
            return extractShippingPartner(originalOrder, flat).toLowerCase();
        }

        if (header === 'custom_labels') {
            return extractOrderCustomLabelsList(originalOrder, flat).join(', ').toLowerCase();
        }

        if (header === 'tags') {
            return extractOrderTagsList(originalOrder, flat).join(', ').toLowerCase();
        }

        return String(flat[header] || '').toLowerCase();
    }

    function extractOrderDeliveredDate(originalOrder, flat) {
        const isDelivered = ((originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim() === 'delivered');

        let raw = originalOrder.shipment?.order_delivered_at ||
            originalOrder.order_delivered_at ||
            originalOrder.shipment?.delivered_at ||
            originalOrder.delivered_at ||
            flat.shipment_order_delivered_at ||
            flat.order_delivered_at ||
            flat.shipment_delivered_at;

        if (!raw && isDelivered && originalOrder._dateKey && /^\d{4}-\d{2}-\d{2}$/.test(originalOrder._dateKey)) {
            raw = originalOrder._dateKey;
        }

        if (!raw) return null;

        if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
            const parts = raw.trim().split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const dNum = parseInt(parts[2], 10);
            const d = new Date(y, m - 1, dNum, 12, 0, 0);
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return {
                dateKey: raw.trim(),
                displayDate: `${String(dNum).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
                dayName: dayNames[d.getDay()],
                timestamp: d.getTime()
            };
        }

        let dateStr = typeof raw === 'string' ? raw.trim() : '';
        if (dateStr) {
            if (!dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += '+03:00';
        }

        const d = new Date(dateStr || raw);
        if (isNaN(d.getTime())) return null;

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateKey = `${year}-${month}-${day}`;
        const displayDate = `${day}/${month}/${year}`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        return {
            dateKey,
            displayDate,
            dayName: dayNames[d.getDay()],
            timestamp: d.getTime()
        };
    }

    function extractOrderCreatedDate(originalOrder, flat) {
        const isDelivered = ((originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim() === 'delivered');

        let raw = originalOrder.order_created_at || originalOrder.created_at || flat.order_created_at || flat.created_at;

        if (!raw && !isDelivered && originalOrder._dateKey && /^\d{4}-\d{2}-\d{2}$/.test(originalOrder._dateKey)) {
            raw = originalOrder._dateKey;
        }

        if (!raw) return null;

        if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
            const parts = raw.trim().split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const dNum = parseInt(parts[2], 10);
            const d = new Date(y, m - 1, dNum, 12, 0, 0);
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return {
                dateKey: raw.trim(),
                displayDate: `${String(dNum).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
                dayName: dayNames[d.getDay()],
                timestamp: d.getTime()
            };
        }

        let dateStr = typeof raw === 'string' ? raw.trim() : '';
        if (dateStr) {
            if (!dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
            if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += '+03:00';
        }

        const d = new Date(dateStr || raw);
        if (isNaN(d.getTime())) return null;

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateKey = `${year}-${month}-${day}`;
        const displayDate = `${day}/${month}/${year}`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        return {
            dateKey,
            displayDate,
            dayName: dayNames[d.getDay()],
            timestamp: d.getTime()
        };
    }

    function extractOrderDateInfo(originalOrder, flat) {
        if (originalOrder._dateKey && /^\d{4}-\d{2}-\d{2}$/.test(originalOrder._dateKey)) {
            const parts = originalOrder._dateKey.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            const d = new Date(y, m - 1, day, 12, 0, 0);
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = dayNames[d.getDay()];
            const displayDate = `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
            return {
                dateKey: originalOrder._dateKey,
                displayDate,
                shortDate: displayDate,
                dayName,
                timestamp: d.getTime()
            };
        }

        const isDelivered = ((originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim() === 'delivered');
        let rawDate = null;
        if (isDelivered) {
            rawDate = originalOrder.shipment?.order_delivered_at ||
                originalOrder.order_delivered_at ||
                originalOrder.shipment?.delivered_at ||
                originalOrder.delivered_at ||
                flat.shipment_order_delivered_at ||
                flat.order_delivered_at ||
                flat.shipment_delivered_at;
        }
        if (!rawDate) {
            rawDate = originalOrder.order_created_at || originalOrder.created_at || flat.order_created_at || flat.created_at;
        }
        if (!rawDate) {
            return {
                dateKey: 'Unknown',
                displayDate: 'Unknown',
                shortDate: 'Unknown',
                dayName: '-',
                timestamp: 0
            };
        }

        if (typeof rawDate === 'string') {
            if (!rawDate.includes('T')) rawDate = rawDate.replace(' ', 'T');
            if (!rawDate.endsWith('Z') && !rawDate.includes('+')) rawDate += '+03:00';
        }

        const d = new Date(rawDate);
        if (isNaN(d.getTime())) {
            return {
                dateKey: 'Unknown',
                displayDate: 'Unknown',
                shortDate: 'Unknown',
                dayName: '-',
                timestamp: 0
            };
        }

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();

        const dateKey = `${year}-${month}-${day}`;
        const displayDate = `${day}/${month}/${year}`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[d.getDay()];

        return {
            dateKey,
            displayDate,
            shortDate: displayDate,
            dayName,
            timestamp: d.getTime()
        };
    }

    function extractShippingPartner(originalOrder, flat) {
        const rawCourier = (originalOrder.shipment?.courier_partner?.name ||
            originalOrder.shipment?.shipping_partner_name ||
            flat.shipment_courier_partner_name ||
            flat.shipment_shipping_partner_name || '').toString().trim();

        const isCourierEmpty = !rawCourier || rawCourier.toLowerCase() === 'none' || rawCourier.toLowerCase() === 'no shipping partner';
        const isCourierManual = rawCourier.toLowerCase() === 'manual';

        // If it is NOT set to manual (and not empty), take the shipping partner
        if (!isCourierEmpty && !isCourierManual) {
            return rawCourier;
        }

        // If it is manual (or empty), strictly extract from custom_labels (COD internal labels)
        const customLabels = extractOrderCustomLabelsList(originalOrder, flat);

        // Take the label to the most right
        let rightmostLabel = customLabels.length > 0 ? customLabels[customLabels.length - 1] : '';
        if (rightmostLabel.toLowerCase() === 'no tag' || rightmostLabel.toLowerCase() === 'none') {
            rightmostLabel = '';
        }

        // If manual or empty, use the rightmost custom label; otherwise fallback to 'Manual'
        return rightmostLabel || 'Manual';
    }

    function getGroupFee(item) {
        if (item === undefined || item === null) return null;
        if (typeof item === 'object') {
            return item.codFee !== undefined && item.codFee !== null && item.codFee !== '' ? parseFloat(item.codFee) : null;
        }
        return null;
    }

    function extractOrderCodAmount(originalOrder, flat) {
        return extractOrderTotalDue(originalOrder, flat);
    }

    function getDeliveredSummaryData(orders, storeFilter = 'all') {
        const deliveredOrders = orders.filter(originalOrder => {
            const flat = flattenObject(originalOrder);
            const status = (originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim();
            if (status !== 'delivered') return false;

            // Special rule: if store is Jafar Shop, ONLY take it into calculation if the custom label is 'roots' or 'golden delivery' (no fallbacks)
            if (isJafarShopStore(originalOrder, flat)) {
                if (!hasRootsOrGoldenDeliveryCustomLabel(originalOrder, flat)) {
                    return false;
                }
            }

            if (storeFilter && storeFilter !== 'all') {
                const st = extractStoreName(originalOrder, flat);
                if (st.toLowerCase() !== storeFilter.toLowerCase()) return false;
            }

            return true;
        });

        const dateMap = {};

        deliveredOrders.forEach(originalOrder => {
            const flat = flattenObject(originalOrder);
            const dateInfo = extractOrderDateInfo(originalOrder, flat);

            // Skip Fridays every time
            if (dateInfo.dayName === 'Friday') return;

            const partner = extractShippingPartner(originalOrder, flat);
            const collectionAmount = extractOrderCodAmount(originalOrder, flat);

            if (!dateMap[dateInfo.dateKey]) {
                dateMap[dateInfo.dateKey] = {
                    dateKey: dateInfo.dateKey,
                    displayDate: dateInfo.displayDate,
                    shortDate: dateInfo.shortDate,
                    dayName: dateInfo.dayName,
                    timestamp: dateInfo.timestamp,
                    partners: {}
                };
            }

            const dateGroup = dateMap[dateInfo.dateKey];
            if (!dateGroup.partners[partner]) {
                dateGroup.partners[partner] = {
                    dateKey: dateInfo.dateKey,
                    displayDate: dateInfo.displayDate,
                    shortDate: dateInfo.shortDate,
                    dayName: dateInfo.dayName,
                    partnerName: partner,
                    groupKey: `${dateInfo.dateKey}____${partner}`,
                    count: 0,
                    totalDue: 0
                };
            }

            dateGroup.partners[partner].count++;
            dateGroup.partners[partner].totalDue += collectionAmount;
        });

        // Sort dates descending by date timestamp
        const sortedDates = Object.values(dateMap).sort((a, b) => b.timestamp - a.timestamp).map(d => {
            const sortedPartners = Object.values(d.partners).sort((a, b) => a.partnerName.localeCompare(b.partnerName));
            const dayTotalOrders = sortedPartners.reduce((acc, p) => acc + p.count, 0);
            const dayTotalDue = sortedPartners.reduce((acc, p) => acc + p.totalDue, 0);
            return {
                ...d,
                dayTotalOrders,
                dayTotalDue,
                partners: sortedPartners
            };
        });

        return {
            deliveredCount: deliveredOrders.length,
            dates: sortedDates
        };
    }

    async function saveGroupReconciliation(groupKey, valStr, dueVal, remarksStr, feeValStr, lockState = null) {
        const hasNum = valStr !== '' && valStr !== null && valStr !== undefined && !isNaN(parseFloat(valStr));
        const num = hasNum ? parseFloat(valStr) : null;

        const hasFee = feeValStr !== '' && feeValStr !== null && feeValStr !== undefined && !isNaN(parseFloat(feeValStr));
        const fee = hasFee ? parseFloat(feeValStr) : null;

        const sKey = sanitizeKey(groupKey);
        const currentUser = localStorage.getItem("roots-user") || "User";

        const existing = receivedCodState[sKey] || receivedCodState[groupKey] || {};
        const finalRemarks = remarksStr !== undefined ? remarksStr : (existing.remarks || '');
        // If lockState is explicitly provided (true/false), use it; otherwise preserve existing locked state
        const finalLock = lockState !== null ? lockState : (existing.locked === true);
        const finalFee = hasFee ? fee : (existing.codFee !== undefined ? existing.codFee : null);
        const finalReceived = hasNum ? num : (existing.received !== undefined ? existing.received : null);

        const record = {
            received: finalReceived,
            codFee: finalFee,
            due: dueVal,
            remarks: finalRemarks,
            enteredBy: currentUser,
            enteredAt: Date.now(),
            locked: finalLock
        };

        receivedCodState[sKey] = record;
        receivedCodState[groupKey] = record;

        try {
            await set(ref(db, `cod_reconciliation/${sKey}`), record);
        } catch (e) {
            console.error('Failed to save COD reconciliation to Firebase:', e);
        }

        if (apiOrders.length > 0) {
            renderDeliveredSummary(apiOrders);
        }
    }

    async function clearGroupReconciliation(groupKey) {
        const currentUser = localStorage.getItem("roots-user");
        const isAdmin = currentUser === "Roots" || localStorage.getItem("roots-isAdmin") === "true";
        if (!isAdmin) {
            alert('Only Admins can unlock or clear saved COD amounts.');
            return;
        }

        const sKey = sanitizeKey(groupKey);
        delete receivedCodState[sKey];
        delete receivedCodState[groupKey];

        try {
            await remove(ref(db, `cod_reconciliation/${sKey}`));
        } catch (e) {
            console.error('Failed to remove COD reconciliation from Firebase:', e);
        }

        if (apiOrders.length > 0) {
            renderDeliveredSummary(apiOrders);
        }
    }

    let collapsedDates = new Set();
    let filterDate = 'all';
    let filterDay = 'all';
    let filterPartner = 'all';
    let filterStore = 'all';
    let filterMatch = 'all';
    let filtersInitialized = false;

    function initSummaryFilterListeners() {
        if (filtersInitialized) return;
        filtersInitialized = true;

        const dateSel = document.getElementById('filter-summary-date');
        const daySel = document.getElementById('filter-summary-day');
        const partnerSel = document.getElementById('filter-summary-partner');
        const storeSel = document.getElementById('filter-summary-store');
        const matchSel = document.getElementById('filter-summary-match');
        const resetBtn = document.getElementById('btn-reset-filters');
        const toggleCollapseBtn = document.getElementById('btn-toggle-all-collapse');

        dateSel?.addEventListener('change', (e) => {
            filterDate = e.target.value;
            summaryCurrentPage = 1;
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        daySel?.addEventListener('change', (e) => {
            filterDay = e.target.value;
            summaryCurrentPage = 1;
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        partnerSel?.addEventListener('change', (e) => {
            filterPartner = e.target.value;
            summaryCurrentPage = 1;
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        storeSel?.addEventListener('change', (e) => {
            filterStore = e.target.value;
            summaryCurrentPage = 1;
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        matchSel?.addEventListener('change', (e) => {
            filterMatch = e.target.value;
            summaryCurrentPage = 1;
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        resetBtn?.addEventListener('click', () => {
            filterDate = 'all';
            filterDay = 'all';
            filterPartner = 'all';
            filterStore = 'all';
            filterMatch = 'all';
            summaryCurrentPage = 1;
            if (dateSel) dateSel.value = 'all';
            if (daySel) daySel.value = 'all';
            if (partnerSel) partnerSel.value = 'all';
            if (storeSel) storeSel.value = 'all';
            if (matchSel) matchSel.value = 'all';
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });

        toggleCollapseBtn?.addEventListener('click', () => {
            const { dates } = getDeliveredSummaryData(apiOrders, filterStore);
            const visibleDateKeys = dates.map(d => d.dateKey);

            // If all visible are collapsed, expand all; otherwise collapse all
            const allCollapsed = visibleDateKeys.length > 0 && visibleDateKeys.every(k => collapsedDates.has(k));
            if (allCollapsed) {
                collapsedDates.clear();
            } else {
                visibleDateKeys.forEach(k => collapsedDates.add(k));
            }
            if (apiOrders.length > 0) renderDeliveredSummary(apiOrders);
        });
    }

    function updateFilterDropdownOptions(dates, orders = []) {
        const dateSel = document.getElementById('filter-summary-date');
        const partnerSel = document.getElementById('filter-summary-partner');
        const storeSel = document.getElementById('filter-summary-store');

        if (dateSel) {
            const curDate = dateSel.value;
            let dateOptionsHtml = '<option value="all">All Dates</option>';
            dates.forEach(d => {
                dateOptionsHtml += `<option value="${d.dateKey}">${d.displayDate} (${d.shortDate}) - ${d.dayName}</option>`;
            });
            dateSel.innerHTML = dateOptionsHtml;
            if (curDate && dates.some(d => d.dateKey === curDate)) {
                dateSel.value = curDate;
            } else {
                dateSel.value = 'all';
                filterDate = 'all';
            }
        }

        if (partnerSel) {
            const curPartner = partnerSel.value;
            const distinctPartners = new Set();
            dates.forEach(d => {
                d.partners.forEach(p => distinctPartners.add(p.partnerName));
            });
            const sortedPartners = Array.from(distinctPartners).sort();
            let partnerOptionsHtml = '<option value="all">All Partners</option>';
            sortedPartners.forEach(p => {
                partnerOptionsHtml += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
            });
            partnerSel.innerHTML = partnerOptionsHtml;
            if (curPartner && distinctPartners.has(curPartner)) {
                partnerSel.value = curPartner;
            } else {
                partnerSel.value = 'all';
                filterPartner = 'all';
            }
        }

        if (storeSel) {
            const curStore = storeSel.value;
            const distinctStores = new Set();
            orders.forEach(o => {
                const flat = flattenObject(o);
                const status = (o.display_status || o.status_code || flat.display_status || flat.status || '').toString().toLowerCase().trim();
                if (status === 'delivered') {
                    if (isJafarShopStore(o, flat) && !hasRootsOrGoldenDeliveryCustomLabel(o, flat)) {
                        return; // Exclude non-roots/golden Jafar Shop orders from summary store list
                    }
                    const s = extractStoreName(o, flat);
                    if (s) distinctStores.add(s);
                }
            });
            const sortedStores = Array.from(distinctStores).sort((a, b) => a.localeCompare(b));
            let storeOptionsHtml = `<option value="all">All Stores (${sortedStores.length})</option>`;
            sortedStores.forEach(s => {
                storeOptionsHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
            });
            storeSel.innerHTML = storeOptionsHtml;
            if (curStore && distinctStores.has(curStore)) {
                storeSel.value = curStore;
            } else {
                storeSel.value = 'all';
                filterStore = 'all';
            }
        }
    }

    function renderDeliveredSummary(orders) {
        const summarySection = document.getElementById('summary-section');
        const summaryBody = document.getElementById('summary-table-body');
        const summaryFoot = document.getElementById('summary-table-foot');
        const deliveredBadge = document.getElementById('delivered-badge');
        const allOrdersBadge = document.getElementById('all-orders-badge');
        const allOrdersSection = document.getElementById('all-orders-section');
        const collapseAllText = document.getElementById('collapse-all-text');
        const collapseAllIcon = document.getElementById('collapse-all-icon');

        initSummaryFilterListeners();

        if (allOrdersBadge) {
            allOrdersBadge.textContent = `${orders.length} Orders`;
        }

        if (!orders || orders.length === 0) {
            if (summarySection) summarySection.classList.add('hidden');
            if (allOrdersSection) allOrdersSection.classList.add('hidden');
            return;
        }

        if (allOrdersSection) allOrdersSection.classList.remove('hidden');

        const { deliveredCount, dates } = getDeliveredSummaryData(orders, filterStore);

        if (deliveredBadge) {
            deliveredBadge.textContent = `${deliveredCount} Delivered`;
        }

        if (dates.length === 0) {
            if (summaryBody) {
                summaryBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--muted); padding: 24px;">No delivered orders found matching the selected filters.</td></tr>`;
            }
            if (summaryFoot) summaryFoot.innerHTML = '';
            if (summarySection) summarySection.classList.remove('hidden');
            return;
        }

        updateFilterDropdownOptions(dates, orders);

        const currentUser = localStorage.getItem("roots-user") || "User";
        const isAdmin = currentUser === "Roots" || localStorage.getItem("roots-isAdmin") === "true";

        // Filter dates and partner rows
        const visibleDateGroups = [];
        let grandTotalCollection = 0;
        let grandTotalOrders = 0;
        let grandTotalExpected = 0;
        let grandTotalReceived = 0;
        let grandHasAnyReceived = false;
        let grandAllMatched = true;
        let totalRenderedPartners = 0;

        dates.forEach(d => {
            if (filterDate !== 'all' && d.dateKey !== filterDate) return;
            if (filterDay !== 'all' && d.dayName.toLowerCase() !== filterDay.toLowerCase()) return;

            const matchingPartners = [];
            d.partners.forEach(p => {
                if (filterPartner !== 'all' && p.partnerName !== filterPartner) return;

                const sKey = sanitizeKey(p.groupKey);
                const savedItem = receivedCodState[sKey] !== undefined ? receivedCodState[sKey] : receivedCodState[p.groupKey];
                const savedFee = getGroupFee(savedItem);
                const savedRec = getGroupVal(savedItem);
                const savedRemarks = getGroupRemarks(savedItem);
                const locked = isGroupLocked(savedItem);

                const hasFee = savedFee !== null && !isNaN(savedFee);
                const feePerOrder = hasFee ? savedFee : 0;
                const totalFee = feePerOrder * p.count;
                const codExpected = p.totalDue - totalFee;

                const hasRec = savedRec !== '' && savedRec !== null && !isNaN(savedRec);
                const recNum = hasRec ? parseFloat(savedRec) : null;
                const isMatch = hasRec && checkNearestIntegerMatch(codExpected, recNum);

                // Match status filtering
                if (filterMatch === 'true' && !isMatch) return;
                if (filterMatch === 'false' && (!hasRec || isMatch)) return;
                if (filterMatch === 'pending' && hasRec) return;

                matchingPartners.push({
                    ...p,
                    savedItem,
                    savedFee,
                    savedRec,
                    savedRemarks,
                    locked,
                    hasFee,
                    feePerOrder,
                    totalFee,
                    codExpected,
                    hasRec,
                    recNum,
                    isMatch
                });
            });

            if (matchingPartners.length > 0) {
                const dayCollection = matchingPartners.reduce((acc, p) => acc + p.totalDue, 0);
                const dayOrders = matchingPartners.reduce((acc, p) => acc + p.count, 0);
                const dayExpected = matchingPartners.reduce((acc, p) => acc + p.codExpected, 0);

                let dayReceived = 0;
                let dayHasAnyRec = false;
                let dayAllMatched = true;

                matchingPartners.forEach(p => {
                    if (p.hasRec) {
                        dayHasAnyRec = true;
                        dayReceived += p.recNum;
                        if (!p.isMatch) dayAllMatched = false;
                    } else {
                        dayAllMatched = false;
                    }
                });

                const dayDiff = dayHasAnyRec ? dayReceived - dayExpected : null;
                const dayMatch = dayHasAnyRec && dayAllMatched && checkNearestIntegerMatch(dayExpected, dayReceived);

                visibleDateGroups.push({
                    ...d,
                    partners: matchingPartners,
                    dayCollection,
                    dayOrders,
                    dayExpected,
                    dayReceived,
                    dayHasAnyRec,
                    dayAllMatched,
                    dayDiff,
                    dayMatch
                });

                grandTotalCollection += dayCollection;
                grandTotalOrders += dayOrders;
                grandTotalExpected += dayExpected;
                if (dayHasAnyRec) {
                    grandHasAnyReceived = true;
                    grandTotalReceived += dayReceived;
                    if (!dayMatch) grandAllMatched = false;
                } else {
                    grandAllMatched = false;
                }
                totalRenderedPartners += matchingPartners.length;
            }
        });

        // Update global collapse toggle state
        const allVisibleCollapsed = visibleDateGroups.length > 0 && visibleDateGroups.every(g => collapsedDates.has(g.dateKey));
        if (collapseAllText) {
            collapseAllText.textContent = allVisibleCollapsed ? 'Expand All' : 'Collapse All';
        }
        if (collapseAllIcon) {
            collapseAllIcon.textContent = allVisibleCollapsed ? '▶' : '▼';
        }

        if (visibleDateGroups.length === 0) {
            if (summaryBody) {
                summaryBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--muted); padding: 24px;">No matching COD records found for the selected filters.</td></tr>`;
            }
            if (summaryFoot) summaryFoot.innerHTML = '';
            if (summarySection) summarySection.classList.remove('hidden');
            return;
        }

        const effectivePageSize = summaryPageSize === 'all' ? totalRenderedPartners : parseInt(summaryPageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalRenderedPartners / effectivePageSize));

        if (summaryCurrentPage > totalPages) summaryCurrentPage = totalPages;
        if (summaryCurrentPage < 1) summaryCurrentPage = 1;

        const startPartnerIdx = summaryPageSize === 'all' ? 0 : (summaryCurrentPage - 1) * effectivePageSize;
        const endPartnerIdx = summaryPageSize === 'all' ? totalRenderedPartners : startPartnerIdx + effectivePageSize;

        let rowsHtml = '';
        let currentPartnerGlobalIdx = 0;

        visibleDateGroups.forEach(dateGroup => {
            const isCollapsed = collapsedDates.has(dateGroup.dateKey);

            const pagePartners = [];
            dateGroup.partners.forEach(p => {
                if (currentPartnerGlobalIdx >= startPartnerIdx && currentPartnerGlobalIdx < endPartnerIdx) {
                    pagePartners.push(p);
                }
                currentPartnerGlobalIdx++;
            });

            if (pagePartners.length === 0) return;

            // 1. Render partner breakdown rows
            pagePartners.forEach(p => {
                const formatDue = p.totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
                const formatExpected = p.codExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
                const diff = p.hasRec ? p.recNum - p.codExpected : 0;
                const diffFormatted = p.hasRec ? (diff > 0 ? '+' : '') + diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD' : '-';
                const diffClass = p.hasRec ? (checkNearestIntegerMatch(p.codExpected, p.recNum) ? 'zero' : (diff < 0 ? 'negative' : 'positive')) : '';

                let feeControlHtml = '';
                let codControlHtml = '';
                let remarksControlHtml = '';

                const isLocked = p.locked;

                if (isLocked && !isAdmin) {
                    const enteredBy = (p.savedItem && p.savedItem.enteredBy) ? p.savedItem.enteredBy : 'User';
                    feeControlHtml = `
                    <div class="cod-fee-wrapper">
                        <input type="number" step="0.01" class="cod-fee-input locked" disabled value="${p.savedFee !== null ? p.savedFee : ''}">
                        <span class="currency-label">JOD</span>
                    </div>
                `;
                    codControlHtml = `
                    <div class="received-cod-wrapper">
                        <input type="number" step="any" placeholder="0" class="received-cod-input locked" disabled title="Locked by ${escapeHtml(enteredBy)}. Only Admins can modify." value="${p.hasRec ? p.recNum : ''}">
                        <span class="lock-indicator" title="Locked by ${escapeHtml(enteredBy)}. Only Admins can modify.">🔒</span>
                    </div>
                `;
                    // Remarks remain always unlocked and editable by users
                    remarksControlHtml = `<textarea class="summary-remarks-input" rows="1" placeholder="Add remark..." data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}">${escapeHtml(p.savedRemarks)}</textarea>`;
                } else if (isLocked && isAdmin) {
                    feeControlHtml = `
                    <div class="cod-fee-wrapper">
                        <input type="number" step="0.01" min="0" placeholder="0.00" class="cod-fee-input" data-key="${escapeHtml(p.groupKey)}" data-count="${p.count}" data-due="${p.totalDue}" value="${p.savedFee !== null ? p.savedFee : ''}" title="Admin editing unlocked">
                        <span class="currency-label">JOD</span>
                    </div>
                `;
                    codControlHtml = `
                    <div class="received-cod-wrapper">
                        <input type="number" step="any" placeholder="0" class="received-cod-input" data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}" value="${p.hasRec ? p.recNum : ''}" title="Admin editing unlocked">
                        <span class="lock-indicator unlocked" title="Admin Unlocked. Click to clear/unlock" data-action="unlock" data-key="${escapeHtml(p.groupKey)}">🔓</span>
                    </div>
                `;
                    remarksControlHtml = `<textarea class="summary-remarks-input" rows="1" placeholder="Add remark..." data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}">${escapeHtml(p.savedRemarks)}</textarea>`;
                } else {
                    feeControlHtml = `
                    <div class="cod-fee-wrapper">
                        <input type="number" step="0.01" min="0" placeholder="0.00" class="cod-fee-input" data-key="${escapeHtml(p.groupKey)}" data-count="${p.count}" data-due="${p.totalDue}" value="${p.savedFee !== null ? p.savedFee : ''}">
                        <span class="currency-label">JOD</span>
                    </div>
                `;
                    codControlHtml = `
                    <div class="received-cod-wrapper">
                        <input type="number" step="any" placeholder="0" class="received-cod-input" data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}" value="${p.hasRec ? p.recNum : ''}">
                        <button type="button" class="btn-lock-cod" data-action="lock" data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}" title="Lock entered fee and received amount">Lock 🔒</button>
                    </div>
                `;
                    remarksControlHtml = `<textarea class="summary-remarks-input" rows="1" placeholder="Add remark..." data-key="${escapeHtml(p.groupKey)}" data-due="${p.totalDue}">${escapeHtml(p.savedRemarks)}</textarea>`;
                }

                rowsHtml += `
                <tr class="partner-row ${isCollapsed ? 'collapsed' : ''}" data-date-key="${escapeHtml(dateGroup.dateKey)}" data-key="${escapeHtml(p.groupKey)}">
                    <td><strong>${escapeHtml(dateGroup.shortDate)}</strong></td>
                    <td><span class="day-badge">${escapeHtml(dateGroup.dayName)}</span></td>
                    <td><span class="partner-tag-badge">${escapeHtml(p.partnerName)}</span></td>
                    <td style="text-align: right; font-weight: 700; color: var(--orange); font-size: 13px;">${formatDue} JOD</td>
                    <td style="text-align: center; font-weight: 700;">${p.count}</td>
                    <td style="text-align: right;">${feeControlHtml}</td>
                    <td style="text-align: right; font-weight: 700; font-size: 13px;" class="expected-cell">${formatExpected} JOD</td>
                    <td style="text-align: right;">${codControlHtml}</td>
                    <td style="text-align: right;" class="diff-cell">
                        <span class="diff-val ${diffClass}">${diffFormatted}</span>
                    </td>
                    <td style="text-align: center;" class="match-cell">
                        <span class="badge-match ${p.isMatch ? 'true' : 'false'}">${p.isMatch ? 'True' : 'False'}</span>
                    </td>
                    <td>${remarksControlHtml}</td>
                </tr>
            `;
            });

            // 2. Render Day Total Row (Subtotal for all partners of this date)
            const dayDiffFormatted = dateGroup.dayHasAnyRec ? (dateGroup.dayDiff > 0 ? '+' : '') + dateGroup.dayDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD' : '-';
            const dayDiffClass = dateGroup.dayHasAnyRec ? (checkNearestIntegerMatch(dateGroup.dayExpected, dateGroup.dayReceived) ? 'zero' : (dateGroup.dayDiff < 0 ? 'negative' : 'positive')) : '';

            rowsHtml += `
            <tr class="day-subtotal-row ${isCollapsed ? 'collapsed-view' : ''}" data-date-key="${escapeHtml(dateGroup.dateKey)}">
                <td>
                    <button type="button" class="date-toggle-btn ${isCollapsed ? 'collapsed' : ''}" data-date-key="${escapeHtml(dateGroup.dateKey)}" title="${isCollapsed ? 'Expand partner breakdown' : 'Collapse partner breakdown'}">
                        ${isCollapsed ? '▶' : '▼'}
                    </button>
                    <strong>${escapeHtml(dateGroup.shortDate)}</strong>
                </td>
                <td><span class="day-badge">${escapeHtml(dateGroup.dayName)}</span></td>
                <td><strong>Total (${dateGroup.partners.length} Partner${dateGroup.partners.length > 1 ? 's' : ''})</strong></td>
                <td style="text-align: right; font-weight: 800; color: var(--orange); font-size: 13px;">${dateGroup.dayCollection.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} JOD</td>
                <td style="text-align: center; font-weight: 800;">${dateGroup.dayOrders}</td>
                <td style="text-align: right; color: var(--muted); font-weight: 600;">-</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;" class="day-expected-cell">${dateGroup.dayExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} JOD</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;" class="day-received-cell">${dateGroup.dayHasAnyRec ? dateGroup.dayReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD' : '-'}</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;" class="day-diff-cell">
                    <span class="diff-val ${dayDiffClass}">${dayDiffFormatted}</span>
                </td>
                <td style="text-align: center;" class="day-match-cell">
                    <span class="badge-match ${dateGroup.dayMatch ? 'true' : 'false'}">${dateGroup.dayMatch ? 'True' : 'False'}</span>
                </td>
                <td></td>
            </tr>
        `;
        });

        if (summaryBody) {
            summaryBody.innerHTML = rowsHtml;

            // Auto-resize remark textareas
            summaryBody.querySelectorAll('.summary-remarks-input').forEach(ta => autoResizeTextarea(ta));

            // Date Collapse Toggle Button Listener
            summaryBody.querySelectorAll('.date-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const dKey = btn.getAttribute('data-date-key');
                    if (collapsedDates.has(dKey)) {
                        collapsedDates.delete(dKey);
                    } else {
                        collapsedDates.add(dKey);
                    }
                    renderDeliveredSummary(apiOrders);
                });
            });

            // COD Fee input listeners
            summaryBody.querySelectorAll('.cod-fee-input:not(:disabled)').forEach(feeInp => {
                feeInp.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    const key = e.target.getAttribute('data-key');
                    const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                    const count = parseInt(e.target.getAttribute('data-count'), 10) || 0;
                    const feeVal = e.target.value.trim();
                    const feeNum = (feeVal !== '' && !isNaN(parseFloat(feeVal))) ? parseFloat(feeVal) : 0;
                    const totalFee = feeNum * count;
                    const codExpected = due - totalFee;

                    const expectedCell = row?.querySelector('.expected-cell');
                    if (expectedCell) {
                        expectedCell.textContent = codExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD';
                    }

                    const recInp = row?.querySelector('.received-cod-input');
                    const recVal = recInp ? recInp.value.trim() : '';
                    const hasRec = recVal !== '' && !isNaN(parseFloat(recVal));
                    const recNum = hasRec ? parseFloat(recVal) : 0;
                    const match = hasRec && checkNearestIntegerMatch(codExpected, recNum);
                    const d = hasRec ? recNum - codExpected : 0;
                    const dFmt = hasRec ? (d > 0 ? '+' : '') + d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD' : '-';
                    const dCls = hasRec ? (checkNearestIntegerMatch(codExpected, recNum) ? 'zero' : (d < 0 ? 'negative' : 'positive')) : '';

                    const matchCell = row?.querySelector('.match-cell');
                    const diffCell = row?.querySelector('.diff-cell');
                    if (matchCell) {
                        matchCell.innerHTML = `<span class="badge-match ${match ? 'true' : 'false'}">${match ? 'True' : 'False'}</span>`;
                    }
                    if (diffCell) {
                        diffCell.innerHTML = `<span class="diff-val ${dCls}">${dFmt}</span>`;
                    }

                    // Update in-memory state
                    const sKey = sanitizeKey(key);
                    if (!receivedCodState[sKey] || typeof receivedCodState[sKey] !== 'object') {
                        receivedCodState[sKey] = { due: due };
                    }
                    receivedCodState[sKey].codFee = feeVal !== '' ? parseFloat(feeVal) : null;
                });

                feeInp.addEventListener('change', async (e) => {
                    const row = e.target.closest('tr');
                    const key = e.target.getAttribute('data-key');
                    const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                    const feeVal = e.target.value.trim();
                    const recInp = row?.querySelector('.received-cod-input');
                    const recVal = recInp ? recInp.value.trim() : '';
                    const rInput = row?.querySelector('.summary-remarks-input');
                    const remarks = rInput ? rInput.value.trim() : '';
                    await saveGroupReconciliation(key, recVal, due, remarks, feeVal, null);
                });

                feeInp.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                    }
                });
            });

            // Received COD input listeners
            summaryBody.querySelectorAll('.received-cod-input:not(:disabled)').forEach(input => {
                input.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    const key = e.target.getAttribute('data-key');
                    const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                    const feeInp = row?.querySelector('.cod-fee-input');
                    const count = parseInt(feeInp?.getAttribute('data-count'), 10) || 0;
                    const feeVal = feeInp ? feeInp.value.trim() : '';
                    const feeNum = (feeVal !== '' && !isNaN(parseFloat(feeVal))) ? parseFloat(feeVal) : 0;
                    const totalFee = feeNum * count;
                    const codExpected = due - totalFee;

                    const val = e.target.value.trim();
                    const matchCell = row?.querySelector('.match-cell');
                    const diffCell = row?.querySelector('.diff-cell');

                    const hasN = val !== '' && !isNaN(parseFloat(val));
                    const n = hasN ? parseFloat(val) : 0;
                    const match = hasN && checkNearestIntegerMatch(codExpected, n);
                    const d = hasN ? n - codExpected : 0;
                    const dFmt = hasN ? (d > 0 ? '+' : '') + d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' JOD' : '-';
                    const dCls = hasN ? (checkNearestIntegerMatch(codExpected, n) ? 'zero' : (d < 0 ? 'negative' : 'positive')) : '';

                    if (matchCell) {
                        matchCell.innerHTML = `<span class="badge-match ${match ? 'true' : 'false'}">${match ? 'True' : 'False'}</span>`;
                    }
                    if (diffCell) {
                        diffCell.innerHTML = `<span class="diff-val ${dCls}">${dFmt}</span>`;
                    }

                    const sKey = sanitizeKey(key);
                    if (!receivedCodState[sKey] || typeof receivedCodState[sKey] !== 'object') {
                        receivedCodState[sKey] = { due: due };
                    }
                    receivedCodState[sKey].received = val !== '' ? parseFloat(val) : null;
                });

                input.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const row = e.target.closest('tr');
                        const key = e.target.getAttribute('data-key');
                        const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                        const val = e.target.value.trim();
                        const feeInp = row?.querySelector('.cod-fee-input');
                        const feeVal = feeInp ? feeInp.value.trim() : '';
                        const rInput = row?.querySelector('.summary-remarks-input');
                        const remarks = rInput ? rInput.value.trim() : '';
                        if (val !== '') {
                            await saveGroupReconciliation(key, val, due, remarks, feeVal, true);
                        }
                    }
                });

                if (isAdmin) {
                    input.addEventListener('change', async (e) => {
                        const row = e.target.closest('tr');
                        const key = e.target.getAttribute('data-key');
                        const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                        const val = e.target.value.trim();
                        const feeInp = row?.querySelector('.cod-fee-input');
                        const feeVal = feeInp ? feeInp.value.trim() : '';
                        const rInput = row?.querySelector('.summary-remarks-input');
                        const remarks = rInput ? rInput.value.trim() : '';
                        if (val !== '') {
                            await saveGroupReconciliation(key, val, due, remarks, feeVal, null);
                        }
                    });
                }
            });

            // Remarks input listeners
            summaryBody.querySelectorAll('.summary-remarks-input').forEach(rInput => {
                rInput.addEventListener('input', () => {
                    autoResizeTextarea(rInput);
                });
                rInput.addEventListener('change', async (e) => {
                    const row = e.target.closest('tr');
                    const key = e.target.getAttribute('data-key');
                    const due = parseFloat(e.target.getAttribute('data-due')) || 0;
                    const codInp = row?.querySelector('.received-cod-input');
                    const val = codInp ? codInp.value.trim() : '';
                    const feeInp = row?.querySelector('.cod-fee-input');
                    const feeVal = feeInp ? feeInp.value.trim() : '';
                    const remarks = e.target.value.trim();
                    await saveGroupReconciliation(key, val, due, remarks, feeVal, null);
                });
                rInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.target.blur();
                    }
                });
            });

            // Lock button listeners
            summaryBody.querySelectorAll('.btn-lock-cod').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const row = btn.closest('tr');
                    const key = btn.getAttribute('data-key');
                    const due = parseFloat(btn.getAttribute('data-due')) || 0;
                    const input = row?.querySelector('.received-cod-input');
                    const feeInp = row?.querySelector('.cod-fee-input');
                    const rInput = row?.querySelector('.summary-remarks-input');
                    const val = input ? input.value.trim() : '';
                    const feeVal = feeInp ? feeInp.value.trim() : '';
                    const remarks = rInput ? rInput.value.trim() : '';
                    if (val === '') {
                        alert('Please enter a Received COD amount before locking.');
                        input?.focus();
                        return;
                    }
                    await saveGroupReconciliation(key, val, due, remarks, feeVal, true);
                });
            });

            // Admin unlock buttons
            summaryBody.querySelectorAll('.lock-indicator.unlocked').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const key = btn.getAttribute('data-key');
                    if (confirm('Unlock and clear this Received COD entry?')) {
                        await clearGroupReconciliation(key);
                    }
                });
            });
        }

        // Render Grand Total Footer
        if (summaryFoot) {
            const grandDueFormatted = grandTotalCollection.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const grandExpectedFormatted = grandTotalExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const grandRecFormatted = grandTotalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const grandDiff = grandHasAnyReceived ? grandTotalReceived - grandTotalExpected : 0;
            const grandDiffFormatted = (grandDiff > 0 ? '+' : '') + grandDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const grandDiffClass = checkNearestIntegerMatch(grandTotalExpected, grandTotalReceived) ? 'zero' : (grandDiff < 0 ? 'negative' : 'positive');
            const grandMatch = grandHasAnyReceived && grandAllMatched && checkNearestIntegerMatch(grandTotalExpected, grandTotalReceived);

            summaryFoot.innerHTML = `
            <tr>
                <td colspan="3" style="font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Grand Total (${visibleDateGroups.length} Days / ${totalRenderedPartners} Rows)</td>
                <td style="text-align: right; font-weight: 800; color: var(--orange); font-size: 13px;">${grandDueFormatted} JOD</td>
                <td style="text-align: center; font-weight: 800;">${grandTotalOrders}</td>
                <td style="text-align: right; color: var(--muted); font-weight: 600;">-</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;">${grandExpectedFormatted} JOD</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;">${grandHasAnyReceived ? grandRecFormatted + ' JOD' : '-'}</td>
                <td style="text-align: right; font-weight: 800; font-size: 13px;"><span class="diff-val ${grandDiffClass}">${grandHasAnyReceived ? grandDiffFormatted + ' JOD' : '-'}</span></td>
                <td style="text-align: center;">
                    <span class="badge-match ${grandMatch ? 'true' : 'false'}">${grandMatch ? 'True' : 'False'}</span>
                </td>
                <td></td>
            </tr>
        `;
        }

        renderSummaryPagination(totalRenderedPartners, visibleDateGroups.length);

        if (summarySection) summarySection.classList.remove('hidden');
    }

    function renderSummaryPagination(totalPartners, totalDates) {
        const bar = document.getElementById('summary-pagination-bar');
        if (!bar) return;

        if (!totalPartners || totalPartners === 0) {
            bar.innerHTML = '';
            bar.classList.add('hidden');
            return;
        }

        const effectivePageSize = summaryPageSize === 'all' ? totalPartners : parseInt(summaryPageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalPartners / effectivePageSize));

        if (summaryCurrentPage > totalPages) summaryCurrentPage = totalPages;
        if (summaryCurrentPage < 1) summaryCurrentPage = 1;

        const startItem = totalPartners === 0 ? 0 : (summaryCurrentPage - 1) * effectivePageSize + 1;
        const endItem = summaryPageSize === 'all' ? totalPartners : Math.min(summaryCurrentPage * effectivePageSize, totalPartners);

        bar.innerHTML = `
        <div class="pagination-left">
            <span class="pagination-info">Showing <strong>${startItem} - ${endItem}</strong> of <strong>${totalPartners}</strong> partner rows (${totalDates} days)</span>
        </div>
        <div class="pagination-right">
            <div class="pagination-size-wrapper">
                <label>Rows per page:</label>
                <select class="summary-pagination-size-select pagination-size-select">
                    <option value="20" ${summaryPageSize == 20 ? 'selected' : ''}>20 rows</option>
                    <option value="50" ${summaryPageSize == 50 ? 'selected' : ''}>50 rows</option>
                    <option value="100" ${summaryPageSize == 100 ? 'selected' : ''}>100 rows</option>
                    <option value="all" ${summaryPageSize === 'all' ? 'selected' : ''}>All rows</option>
                </select>
            </div>
            <div class="pagination-nav">
                <button class="pagination-btn first-btn" ${summaryCurrentPage === 1 ? 'disabled' : ''} title="First Page">«</button>
                <button class="pagination-btn prev-btn" ${summaryCurrentPage === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
                <span class="pagination-page-indicator">Page ${summaryCurrentPage} of ${totalPages}</span>
                <button class="pagination-btn next-btn" ${summaryCurrentPage === totalPages ? 'disabled' : ''} title="Next Page">›</button>
                <button class="pagination-btn last-btn" ${summaryCurrentPage === totalPages ? 'disabled' : ''} title="Last Page">»</button>
            </div>
        </div>
    `;
        bar.classList.remove('hidden');

        const sizeSelect = bar.querySelector('.summary-pagination-size-select');
        sizeSelect?.addEventListener('change', (e) => {
            summaryPageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
            summaryCurrentPage = 1;
            renderDeliveredSummary(apiOrders);
        });

        bar.querySelector('.first-btn')?.addEventListener('click', () => {
            if (summaryCurrentPage > 1) {
                summaryCurrentPage = 1;
                renderDeliveredSummary(apiOrders);
            }
        });

        bar.querySelector('.prev-btn')?.addEventListener('click', () => {
            if (summaryCurrentPage > 1) {
                summaryCurrentPage--;
                renderDeliveredSummary(apiOrders);
            }
        });

        bar.querySelector('.next-btn')?.addEventListener('click', () => {
            if (summaryCurrentPage < totalPages) {
                summaryCurrentPage++;
                renderDeliveredSummary(apiOrders);
            }
        });

        bar.querySelector('.last-btn')?.addEventListener('click', () => {
            if (summaryCurrentPage < totalPages) {
                summaryCurrentPage = totalPages;
                renderDeliveredSummary(apiOrders);
            }
        });
    }

    function getFilteredOrders() {
        if (!apiOrders || apiOrders.length === 0) return [];

        return apiOrders.filter(originalOrder => {
            const flat = flattenObject(originalOrder);
            const delInfo = extractOrderDeliveredDate(originalOrder, flat);
            const creInfo = extractOrderCreatedDate(originalOrder, flat);

            // 1. Delivered Date Select Filter
            if (ordersFilterDeliveredDate !== 'all') {
                if (ordersFilterDeliveredDate === 'not_delivered') {
                    if (delInfo) return false;
                } else {
                    if (!delInfo || delInfo.dateKey !== ordersFilterDeliveredDate) return false;
                }
            }

            // 2. Delivered Date Range Filter (From / To)
            if (ordersFilterDeliveredStart) {
                if (!delInfo || delInfo.dateKey < ordersFilterDeliveredStart) return false;
            }
            if (ordersFilterDeliveredEnd) {
                if (!delInfo || delInfo.dateKey > ordersFilterDeliveredEnd) return false;
            }

            // 3. Created Date Select Filter
            if (ordersFilterCreatedDate !== 'all') {
                if (!creInfo || creInfo.dateKey !== ordersFilterCreatedDate) return false;
            }

            // 4. Created Date Range Filter (From / To)
            if (ordersFilterCreatedStart) {
                if (!creInfo || creInfo.dateKey < ordersFilterCreatedStart) return false;
            }
            if (ordersFilterCreatedEnd) {
                if (!creInfo || creInfo.dateKey > ordersFilterCreatedEnd) return false;
            }

            // 5. Store Name Filter
            const store = extractStoreName(originalOrder, flat);
            if (ordersFilterStore !== 'all' && store.toLowerCase() !== ordersFilterStore.toLowerCase()) {
                return false;
            }

            // 6. Shipping partner filter
            const partner = extractShippingPartner(originalOrder, flat);
            if (ordersFilterPartner !== 'all' && partner !== ordersFilterPartner) {
                return false;
            }

            // 7. Custom Label filter
            const customLabels = extractOrderCustomLabelsList(originalOrder, flat);
            if (ordersFilterCustomLabel !== 'all' && !customLabels.includes(ordersFilterCustomLabel)) {
                return false;
            }

            // 8. Tag filter
            const tags = extractOrderTagsList(originalOrder, flat);
            if (ordersFilterTag !== 'all' && !tags.includes(ordersFilterTag)) {
                return false;
            }

            // 9. Status filter
            const status = (originalOrder.display_status || originalOrder.status_code || flat.display_status || flat.status || '').toString().trim();
            if (ordersFilterStatus !== 'all' && status.toLowerCase() !== ordersFilterStatus.toLowerCase()) {
                return false;
            }

            // 10. Search text filter
            if (ordersFilterSearch) {
                const orderId = String(originalOrder.order_id || originalOrder.order_alias || flat.order_id || '').toLowerCase();
                const storeStr = store.toLowerCase();
                const customStr = customLabels.join(', ').toLowerCase();
                const tagsStr = tags.join(', ').toLowerCase();
                const partnerStr = partner.toLowerCase();
                const statusStr = status.toLowerCase();
                const searchLower = ordersFilterSearch.toLowerCase();

                if (!orderId.includes(searchLower) &&
                    !storeStr.includes(searchLower) &&
                    !customStr.includes(searchLower) &&
                    !tagsStr.includes(searchLower) &&
                    !partnerStr.includes(searchLower) &&
                    !statusStr.includes(searchLower)) {
                    return false;
                }
            }

            return true;
        });

        // Sort filtered orders based on ordersSortColumn & ordersSortDirection (Default: order_created_at desc)
        filtered.sort((a, b) => {
            const flatA = flattenObject(a);
            const flatB = flattenObject(b);
            const valA = getOrderRawSortValue(ordersSortColumn, a, flatA);
            const valB = getOrderRawSortValue(ordersSortColumn, b, flatB);

            let cmp = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
                cmp = valA - valB;
            } else {
                cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
            }

            return ordersSortDirection === 'asc' ? cmp : -cmp;
        });

        return filtered;
    }

    function updateOrdersFilterDropdownOptions(orders) {
        const delDateSel = document.getElementById('filter-orders-delivered-date');
        const creDateSel = document.getElementById('filter-orders-created-date');
        const storeSel = document.getElementById('filter-orders-store');
        const partnerSel = document.getElementById('filter-orders-partner');
        const tagSel = document.getElementById('filter-orders-tag');
        const statusSel = document.getElementById('filter-orders-status');

        if (!orders || orders.length === 0) return;

        // 1. Delivered Dates
        if (delDateSel) {
            const curDelDate = delDateSel.value;
            const delDateMap = {};
            let undeliveredCount = 0;
            let deliveredCount = 0;

            orders.forEach(order => {
                const flat = flattenObject(order);
                const delInfo = extractOrderDeliveredDate(order, flat);
                if (delInfo) {
                    deliveredCount++;
                    const dKey = delInfo.dateKey;
                    if (!delDateMap[dKey]) {
                        delDateMap[dKey] = {
                            dateKey: dKey,
                            displayDate: delInfo.displayDate,
                            dayName: delInfo.dayName,
                            timestamp: delInfo.timestamp,
                            count: 0
                        };
                    }
                    delDateMap[dKey].count++;
                } else {
                    undeliveredCount++;
                }
            });

            const sortedDelDates = Object.values(delDateMap).sort((a, b) => b.timestamp - a.timestamp);
            let delDateHtml = `<option value="all">All Delivered Dates (${deliveredCount})</option>`;
            if (undeliveredCount > 0) {
                delDateHtml += `<option value="not_delivered">Not Delivered Yet (${undeliveredCount})</option>`;
            }
            sortedDelDates.forEach(d => {
                delDateHtml += `<option value="${d.dateKey}">${d.displayDate} - ${d.dayName} (${d.count} delivered)</option>`;
            });
            delDateSel.innerHTML = delDateHtml;
            if (curDelDate && (curDelDate === 'all' || curDelDate === 'not_delivered' || delDateMap[curDelDate])) {
                delDateSel.value = curDelDate;
            } else {
                delDateSel.value = 'all';
                ordersFilterDeliveredDate = 'all';
            }
        }

        // 2. Created Dates
        if (creDateSel) {
            const curCreDate = creDateSel.value;
            const creDateMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const creInfo = extractOrderCreatedDate(order, flat);
                if (creInfo) {
                    const dKey = creInfo.dateKey;
                    if (!creDateMap[dKey]) {
                        creDateMap[dKey] = {
                            dateKey: dKey,
                            displayDate: creInfo.displayDate,
                            dayName: creInfo.dayName,
                            timestamp: creInfo.timestamp,
                            count: 0
                        };
                    }
                    creDateMap[dKey].count++;
                }
            });

            const sortedCreDates = Object.values(creDateMap).sort((a, b) => b.timestamp - a.timestamp);
            let creDateHtml = `<option value="all">All Created Dates (${orders.length})</option>`;
            sortedCreDates.forEach(d => {
                creDateHtml += `<option value="${d.dateKey}">${d.displayDate} - ${d.dayName} (${d.count} orders)</option>`;
            });
            creDateSel.innerHTML = creDateHtml;
            if (curCreDate && (curCreDate === 'all' || creDateMap[curCreDate])) {
                creDateSel.value = curCreDate;
            } else {
                creDateSel.value = 'all';
                ordersFilterCreatedDate = 'all';
            }
        }

        // 3. Store Names
        if (storeSel) {
            const curStore = storeSel.value;
            const storeMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const s = extractStoreName(order, flat);
                if (s) {
                    storeMap[s] = (storeMap[s] || 0) + 1;
                }
            });

            const sortedStores = Object.keys(storeMap).sort((a, b) => a.localeCompare(b));
            let storeHtml = `<option value="all">All Stores (${sortedStores.length})</option>`;
            sortedStores.forEach(s => {
                storeHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${storeMap[s]})</option>`;
            });
            storeSel.innerHTML = storeHtml;
            if (curStore && (curStore === 'all' || storeMap[curStore])) {
                storeSel.value = curStore;
            } else {
                storeSel.value = 'all';
                ordersFilterStore = 'all';
            }
        }

        // 4. Shipping Partners
        if (partnerSel) {
            const curPartner = partnerSel.value;
            const partnerMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const p = extractShippingPartner(order, flat);
                if (p) {
                    partnerMap[p] = (partnerMap[p] || 0) + 1;
                }
            });

            const sortedPartners = Object.keys(partnerMap).sort((a, b) => a.localeCompare(b));
            let partnerHtml = `<option value="all">All Partners (${sortedPartners.length})</option>`;
            sortedPartners.forEach(p => {
                partnerHtml += `<option value="${escapeHtml(p)}">${escapeHtml(p)} (${partnerMap[p]})</option>`;
            });
            partnerSel.innerHTML = partnerHtml;
            if (curPartner && (curPartner === 'all' || partnerMap[curPartner])) {
                partnerSel.value = curPartner;
            } else {
                partnerSel.value = 'all';
                ordersFilterPartner = 'all';
            }
        }

        // 5. Custom Labels
        const customLabelSel = document.getElementById('filter-orders-custom-label');
        if (customLabelSel) {
            const curCustom = customLabelSel.value;
            const customMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const customLabels = extractOrderCustomLabelsList(order, flat);
                customLabels.forEach(t => {
                    if (t) customMap[t] = (customMap[t] || 0) + 1;
                });
            });

            const sortedCustom = Object.keys(customMap).sort((a, b) => a.localeCompare(b));
            let customHtml = `<option value="all">All Custom Labels (${sortedCustom.length})</option>`;
            sortedCustom.forEach(t => {
                customHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${customMap[t]})</option>`;
            });
            customLabelSel.innerHTML = customHtml;
            if (curCustom && (curCustom === 'all' || customMap[curCustom])) {
                customLabelSel.value = curCustom;
            } else {
                customLabelSel.value = 'all';
                ordersFilterCustomLabel = 'all';
            }
        }

        // 6. Tags
        if (tagSel) {
            const curTag = tagSel.value;
            const tagMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const tags = extractOrderTagsList(order, flat);
                tags.forEach(t => {
                    if (t) tagMap[t] = (tagMap[t] || 0) + 1;
                });
            });

            const sortedTags = Object.keys(tagMap).sort((a, b) => a.localeCompare(b));
            let tagHtml = `<option value="all">All Tags (${sortedTags.length})</option>`;
            sortedTags.forEach(t => {
                tagHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${tagMap[t]})</option>`;
            });
            tagSel.innerHTML = tagHtml;
            if (curTag && (curTag === 'all' || tagMap[curTag])) {
                tagSel.value = curTag;
            } else {
                tagSel.value = 'all';
                ordersFilterTag = 'all';
            }
        }

        // 7. Statuses
        if (statusSel) {
            const curStatus = statusSel.value;
            const statusMap = {};
            orders.forEach(order => {
                const flat = flattenObject(order);
                const s = (order.display_status || order.status_code || flat.display_status || flat.status || '').toString().trim();
                if (s) {
                    statusMap[s] = (statusMap[s] || 0) + 1;
                }
            });

            const sortedStatuses = Object.keys(statusMap).sort((a, b) => a.localeCompare(b));
            let statusHtml = '<option value="all">All Statuses</option>';
            sortedStatuses.forEach(s => {
                statusHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${statusMap[s]})</option>`;
            });
            statusSel.innerHTML = statusHtml;
            if (curStatus && (curStatus === 'all' || statusMap[curStatus])) {
                statusSel.value = curStatus;
            } else {
                statusSel.value = 'all';
                ordersFilterStatus = 'all';
            }
        }
    }

    function initOrdersFilterListeners() {
        if (ordersFiltersInitialized) return;
        ordersFiltersInitialized = true;

        const delDateSel = document.getElementById('filter-orders-delivered-date');
        const delStartInp = document.getElementById('filter-orders-delivered-start');
        const delEndInp = document.getElementById('filter-orders-delivered-end');
        const creDateSel = document.getElementById('filter-orders-created-date');
        const creStartInp = document.getElementById('filter-orders-created-start');
        const creEndInp = document.getElementById('filter-orders-created-end');
        const storeSel = document.getElementById('filter-orders-store');
        const partnerSel = document.getElementById('filter-orders-partner');
        const customLabelSel = document.getElementById('filter-orders-custom-label');
        const tagSel = document.getElementById('filter-orders-tag');
        const statusSel = document.getElementById('filter-orders-status');
        const searchInp = document.getElementById('filter-orders-search');
        const resetBtn = document.getElementById('btn-reset-orders-filters');

        // 1. Delivered Date select dropdown
        delDateSel?.addEventListener('change', (e) => {
            ordersFilterDeliveredDate = e.target.value;
            if (ordersFilterDeliveredDate !== 'all' && ordersFilterDeliveredDate !== 'not_delivered') {
                if (delStartInp) delStartInp.value = ordersFilterDeliveredDate;
                if (delEndInp) delEndInp.value = ordersFilterDeliveredDate;
                ordersFilterDeliveredStart = ordersFilterDeliveredDate;
                ordersFilterDeliveredEnd = ordersFilterDeliveredDate;
            } else {
                if (delStartInp) delStartInp.value = '';
                if (delEndInp) delEndInp.value = '';
                ordersFilterDeliveredStart = '';
                ordersFilterDeliveredEnd = '';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 2. Delivered From input
        delStartInp?.addEventListener('change', (e) => {
            ordersFilterDeliveredStart = e.target.value;
            if (ordersFilterDeliveredStart && ordersFilterDeliveredStart === ordersFilterDeliveredEnd) {
                ordersFilterDeliveredDate = ordersFilterDeliveredStart;
                if (delDateSel) delDateSel.value = ordersFilterDeliveredStart;
            } else {
                ordersFilterDeliveredDate = 'all';
                if (delDateSel) delDateSel.value = 'all';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 3. Delivered To input
        delEndInp?.addEventListener('change', (e) => {
            ordersFilterDeliveredEnd = e.target.value;
            if (ordersFilterDeliveredEnd && ordersFilterDeliveredStart === ordersFilterDeliveredEnd) {
                ordersFilterDeliveredDate = ordersFilterDeliveredEnd;
                if (delDateSel) delDateSel.value = ordersFilterDeliveredEnd;
            } else {
                ordersFilterDeliveredDate = 'all';
                if (delDateSel) delDateSel.value = 'all';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 4. Created Date select dropdown
        creDateSel?.addEventListener('change', (e) => {
            ordersFilterCreatedDate = e.target.value;
            if (ordersFilterCreatedDate !== 'all') {
                if (creStartInp) creStartInp.value = ordersFilterCreatedDate;
                if (creEndInp) creEndInp.value = ordersFilterCreatedDate;
                ordersFilterCreatedStart = ordersFilterCreatedDate;
                ordersFilterCreatedEnd = ordersFilterCreatedDate;
            } else {
                if (creStartInp) creStartInp.value = '';
                if (creEndInp) creEndInp.value = '';
                ordersFilterCreatedStart = '';
                ordersFilterCreatedEnd = '';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 5. Created From input
        creStartInp?.addEventListener('change', (e) => {
            ordersFilterCreatedStart = e.target.value;
            if (ordersFilterCreatedStart && ordersFilterCreatedStart === ordersFilterCreatedEnd) {
                ordersFilterCreatedDate = ordersFilterCreatedStart;
                if (creDateSel) creDateSel.value = ordersFilterCreatedStart;
            } else {
                ordersFilterCreatedDate = 'all';
                if (creDateSel) creDateSel.value = 'all';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 6. Created To input
        creEndInp?.addEventListener('change', (e) => {
            ordersFilterCreatedEnd = e.target.value;
            if (ordersFilterCreatedEnd && ordersFilterCreatedStart === ordersFilterCreatedEnd) {
                ordersFilterCreatedDate = ordersFilterCreatedEnd;
                if (creDateSel) creDateSel.value = ordersFilterCreatedEnd;
            } else {
                ordersFilterCreatedDate = 'all';
                if (creDateSel) creDateSel.value = 'all';
            }
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 7. Store Name select
        storeSel?.addEventListener('change', (e) => {
            ordersFilterStore = e.target.value;
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 8. Shipping Partner select
        partnerSel?.addEventListener('change', (e) => {
            ordersFilterPartner = e.target.value;
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 9. Custom Label select
        customLabelSel?.addEventListener('change', (e) => {
            ordersFilterCustomLabel = e.target.value;
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 10. Tag select
        tagSel?.addEventListener('change', (e) => {
            ordersFilterTag = e.target.value;
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 11. Status select
        statusSel?.addEventListener('change', (e) => {
            ordersFilterStatus = e.target.value;
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        // 12. Search input with debounce
        let searchDebounce = null;
        searchInp?.addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                ordersFilterSearch = e.target.value.toLowerCase().trim();
                ordersCurrentPage = 1;
                renderOrdersTable();
            }, 200);
        });

        // 13. Reset button
        resetBtn?.addEventListener('click', () => {
            ordersFilterDeliveredDate = 'all';
            ordersFilterDeliveredStart = '';
            ordersFilterDeliveredEnd = '';
            ordersFilterCreatedDate = 'all';
            ordersFilterCreatedStart = '';
            ordersFilterCreatedEnd = '';
            ordersFilterStore = 'all';
            ordersFilterPartner = 'all';
            ordersFilterCustomLabel = 'all';
            ordersFilterTag = 'all';
            ordersFilterStatus = 'all';
            ordersFilterSearch = '';
            ordersSortColumn = 'order_created_at';
            ordersSortDirection = 'desc';
            ordersCurrentPage = 1;

            if (delDateSel) delDateSel.value = 'all';
            if (delStartInp) delStartInp.value = '';
            if (delEndInp) delEndInp.value = '';
            if (creDateSel) creDateSel.value = 'all';
            if (creStartInp) creStartInp.value = '';
            if (creEndInp) creEndInp.value = '';
            if (storeSel) storeSel.value = 'all';
            if (partnerSel) partnerSel.value = 'all';
            if (customLabelSel) customLabelSel.value = 'all';
            if (tagSel) tagSel.value = 'all';
            if (statusSel) statusSel.value = 'all';
            if (searchInp) searchInp.value = '';

            renderOrdersTable();
        });
    }

    function renderOrdersPagination(totalCount) {
        const bar = document.getElementById('all-orders-pagination-bar');
        if (!bar) return;

        if (!totalCount || totalCount === 0) {
            bar.innerHTML = '';
            bar.classList.add('hidden');
            return;
        }

        const effectivePageSize = ordersPageSize === 'all' ? totalCount : parseInt(ordersPageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));

        if (ordersCurrentPage > totalPages) ordersCurrentPage = totalPages;
        if (ordersCurrentPage < 1) ordersCurrentPage = 1;

        const startItem = totalCount === 0 ? 0 : (ordersCurrentPage - 1) * effectivePageSize + 1;
        const endItem = ordersPageSize === 'all' ? totalCount : Math.min(ordersCurrentPage * effectivePageSize, totalCount);

        bar.innerHTML = `
        <div class="pagination-left">
            <span class="pagination-info">Showing <strong>${startItem} - ${endItem}</strong> of <strong>${totalCount}</strong> orders</span>
        </div>
        <div class="pagination-right">
            <div class="pagination-size-wrapper">
                <label>Rows:</label>
                <select class="pagination-size-select">
                    <option value="20" ${ordersPageSize == 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${ordersPageSize == 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${ordersPageSize == 100 ? 'selected' : ''}>100</option>
                    <option value="all" ${ordersPageSize === 'all' ? 'selected' : ''}>All</option>
                </select>
            </div>
            <div class="pagination-nav">
                <button class="pagination-btn first-btn" ${ordersCurrentPage === 1 ? 'disabled' : ''} title="First Page">«</button>
                <button class="pagination-btn prev-btn" ${ordersCurrentPage === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
                <span class="pagination-page-indicator">Page ${ordersCurrentPage} of ${totalPages}</span>
                <button class="pagination-btn next-btn" ${ordersCurrentPage === totalPages ? 'disabled' : ''} title="Next Page">›</button>
                <button class="pagination-btn last-btn" ${ordersCurrentPage === totalPages ? 'disabled' : ''} title="Last Page">»</button>
            </div>
        </div>
    `;
        bar.classList.remove('hidden');

        const sizeSelect = bar.querySelector('.pagination-size-select');
        sizeSelect?.addEventListener('change', (e) => {
            ordersPageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
            ordersCurrentPage = 1;
            renderOrdersTable();
        });

        bar.querySelector('.first-btn')?.addEventListener('click', () => {
            if (ordersCurrentPage > 1) {
                ordersCurrentPage = 1;
                renderOrdersTable();
            }
        });

        bar.querySelector('.prev-btn')?.addEventListener('click', () => {
            if (ordersCurrentPage > 1) {
                ordersCurrentPage--;
                renderOrdersTable();
            }
        });

        bar.querySelector('.next-btn')?.addEventListener('click', () => {
            if (ordersCurrentPage < totalPages) {
                ordersCurrentPage++;
                renderOrdersTable();
            }
        });

        bar.querySelector('.last-btn')?.addEventListener('click', () => {
            if (ordersCurrentPage < totalPages) {
                ordersCurrentPage = totalPages;
                renderOrdersTable();
            }
        });
    }

    function renderOrdersTable() {
        const allOrdersSection = document.getElementById('all-orders-section');
        const emptyStateEl = document.getElementById('empty-state');
        const allOrdersBadge = document.getElementById('all-orders-badge');

        initOrdersFilterListeners();

        if (!apiOrders || apiOrders.length === 0) {
            if (allOrdersSection) allOrdersSection.classList.add('hidden');
            if (tableContainer) tableContainer.classList.add('hidden');
            if (emptyStateEl) emptyStateEl.style.display = 'flex';
            renderOrdersPagination(0);
            return;
        }

        if (allOrdersSection) allOrdersSection.classList.remove('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');
        if (emptyStateEl) emptyStateEl.style.display = 'none';

        currentFilteredOrders = getFilteredOrders();
        const totalFiltered = currentFilteredOrders.length;
        const totalAll = apiOrders.length;

        if (allOrdersBadge) {
            if (totalFiltered === totalAll) {
                allOrdersBadge.textContent = `${totalAll} Orders`;
            } else {
                allOrdersBadge.textContent = `Showing ${totalFiltered} of ${totalAll} Orders`;
            }
        }

        function renderSortableHeadersHtml() {
            return headers.map(h => {
                const isSorted = ordersSortColumn === h;
                const sortIcon = isSorted ? (ordersSortDirection === 'asc' ? '▲' : '▼') : '↕';
                const activeClass = isSorted ? 'sorted-column' : '';
                return `<th data-sort-header="${h}" class="sortable-th ${activeClass}" style="cursor: pointer; user-select: none;" title="Click to sort by ${headerDisplayNames[h] || h}">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                        <span>${headerDisplayNames[h] || h}</span>
                        <span class="sort-indicator" style="opacity: ${isSorted ? '1' : '0.35'}; font-size: 11px;">${sortIcon}</span>
                    </div>
                </th>`;
            }).join('');
        }

        tableHead.innerHTML = renderSortableHeadersHtml();

        // Attach click listeners to each header TH
        tableHead.querySelectorAll('.sortable-th').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-sort-header');
                if (ordersSortColumn === col) {
                    ordersSortDirection = ordersSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    ordersSortColumn = col;
                    if (col === 'order_created_at' || col === 'order_delivered_at' || col === 'invoice_total' || col === 'invoice_total_due') {
                        ordersSortDirection = 'desc';
                    } else {
                        ordersSortDirection = 'asc';
                    }
                }
                ordersCurrentPage = 1;
                renderOrdersTable();
            });
        });

        if (totalFiltered === 0) {
            tableBody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--muted); padding: 32px; font-weight: 500;">No orders found matching the selected filters.</td></tr>`;
            renderOrdersPagination(0);
            return;
        }

        const effectivePageSize = ordersPageSize === 'all' ? totalFiltered : parseInt(ordersPageSize, 10);
        const totalPages = Math.max(1, Math.ceil(totalFiltered / effectivePageSize));

        if (ordersCurrentPage > totalPages) ordersCurrentPage = totalPages;
        if (ordersCurrentPage < 1) ordersCurrentPage = 1;

        const startIndex = (ordersCurrentPage - 1) * effectivePageSize;
        const endIndex = ordersPageSize === 'all' ? totalFiltered : Math.min(startIndex + effectivePageSize, totalFiltered);

        const pageSlice = currentFilteredOrders.slice(startIndex, endIndex);

        let bodyHtml = '';
        pageSlice.forEach((originalOrder) => {
            const flat = flattenObject(originalOrder);
            bodyHtml += '<tr>';
            headers.forEach(header => {
                let cellValue = getOrderFieldValue(header, originalOrder, flat);
                cellValue = String(cellValue).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                bodyHtml += `<td>${cellValue}</td>`;
            });
            bodyHtml += '</tr>';
        });
        tableBody.innerHTML = bodyHtml;

        renderOrdersPagination(totalFiltered);
    }

    exportBtn.addEventListener('click', () => {
        if (!apiOrders || apiOrders.length === 0) return;

        const wb = XLSX.utils.book_new();

        // Sheet 1: Delivered Summary with new 11-column template
        const { dates } = getDeliveredSummaryData(apiOrders);
        if (dates.length > 0) {
            const summaryExcelData = [];

            dates.forEach(d => {
                let dayTotalDue = 0;
                let dayTotalOrders = 0;
                let dayTotalExpected = 0;
                let dayTotalReceived = 0;
                let dayHasAnyRec = false;
                let dayAllMatched = true;

                d.partners.forEach(p => {
                    const sKey = sanitizeKey(p.groupKey);
                    const raw = receivedCodState[sKey] !== undefined ? receivedCodState[sKey] : receivedCodState[p.groupKey];
                    const savedFee = getGroupFee(raw);
                    const recVal = getGroupVal(raw);
                    const remarks = getGroupRemarks(raw);

                    const hasFee = savedFee !== null && !isNaN(savedFee);
                    const feePerOrder = hasFee ? savedFee : 0;
                    const totalFee = feePerOrder * p.count;
                    const codExpected = p.totalDue - totalFee;

                    const hasRec = recVal !== undefined && recVal !== '' && !isNaN(recVal);
                    const recNum = hasRec ? parseFloat(recVal) : '';
                    const match = hasRec && checkNearestIntegerMatch(codExpected, recNum);
                    const diff = hasRec ? recNum - codExpected : '';

                    dayTotalDue += p.totalDue;
                    dayTotalOrders += p.count;
                    dayTotalExpected += codExpected;
                    if (hasRec) {
                        dayHasAnyRec = true;
                        dayTotalReceived += recNum;
                        if (!match) dayAllMatched = false;
                    } else {
                        dayAllMatched = false;
                    }

                    summaryExcelData.push({
                        "Date": d.shortDate,
                        "Day": d.dayName,
                        "Shipping Partner": p.partnerName,
                        "Total Collection Amount (JOD)": Number(p.totalDue.toFixed(3)),
                        "Number of Orders": p.count,
                        "COD Fee per Order (JOD)": hasFee ? Number(feePerOrder.toFixed(3)) : '',
                        "COD Expected (JOD)": Number(codExpected.toFixed(3)),
                        "COD Received (JOD)": recNum !== '' ? Number(recNum.toFixed(3)) : '',
                        "COD Difference (JOD)": diff !== '' ? Number(diff.toFixed(3)) : '',
                        "Match": match ? "True" : (hasRec ? "False" : "-"),
                        "Remarks": remarks
                    });
                });

                // Day Subtotal Row for Excel
                const dayDiff = dayHasAnyRec ? dayTotalReceived - dayTotalExpected : '';
                const dayMatch = dayHasAnyRec && dayAllMatched && checkNearestIntegerMatch(dayTotalExpected, dayTotalReceived);

                summaryExcelData.push({
                    "Date": `${d.shortDate} Total`,
                    "Day": d.dayName,
                    "Shipping Partner": `Total (${d.partners.length} Partners)`,
                    "Total Collection Amount (JOD)": Number(dayTotalDue.toFixed(3)),
                    "Number of Orders": dayTotalOrders,
                    "COD Fee per Order (JOD)": '',
                    "COD Expected (JOD)": Number(dayTotalExpected.toFixed(3)),
                    "COD Received (JOD)": dayHasAnyRec ? Number(dayTotalReceived.toFixed(3)) : '',
                    "COD Difference (JOD)": dayDiff !== '' ? Number(dayDiff.toFixed(3)) : '',
                    "Match": dayMatch ? "True" : (dayHasAnyRec ? "False" : "-"),
                    "Remarks": ""
                });
            });

            const wsSummary = XLSX.utils.json_to_sheet(summaryExcelData);
            XLSX.utils.book_append_sheet(wb, wsSummary, "COD Delivered Summary");
        }

        // Sheet 2: All COD Orders (Filtered or all)
        const exportOrders = (currentFilteredOrders && currentFilteredOrders.length > 0) ? currentFilteredOrders : getFilteredOrders();
        const dataForExcel = exportOrders.map(originalOrder => {
            const flat = flattenObject(originalOrder);
            const row = {};
            headers.forEach(header => {
                const label = headerDisplayNames[header] || header;
                row[label] = getOrderFieldValue(header, originalOrder, flat);
            });
            return row;
        });

        const wsOrders = XLSX.utils.json_to_sheet(dataForExcel);
        XLSX.utils.book_append_sheet(wb, wsOrders, "All COD Orders");

        XLSX.writeFile(wb, `Roots_COD_Summary_${new Date().getTime()}.xlsx`);
    });
});
