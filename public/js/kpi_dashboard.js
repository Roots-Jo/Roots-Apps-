// Fulfilment KPI dashboard, reading the live Omniful feed in Firebase.
//
// Ported from the standalone Netlify build, which parsed a manually maintained Google
// Sheet. The business rules (10pm cutoff, Friday excluded, SLA deadline) are unchanged;
// only the data source is. See MAPPING below for what the live feed does and does not
// carry, and where the pick/pack timeline comes from.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, query, orderByKey, startAt, endAt, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    escapeHtml, flattenObject, extractStoreName, extractOrderTotalDue,
    normalizedStatus, isDeliveredOrder, dateKeyOf, addDays, isNonProductionStore
} from "/js/cod_shared.js?v=1.3.0";

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
const el = (id) => document.getElementById(id);

// ── MAPPING ───────────────────────────────────────────────────────────────────
// Sheet column            → live Omniful field                    fill rate
//   ORDER CREATED AT      → order_created_at                        100%
//   ORDER SHIPPED AT      → shipment.order_shipped_at                64%
//   ORDER DELIVERED AT    → shipment.order_delivered_at              53%
//   (new)                 → shipment.shipment_created_at             90%
//   SELLER NAME           → store_name                              100%
//   ORDER STATUS          → status_code / display_status            100%
//   ORDER AMOUNT          → invoice.total                           100%
//   COLLECTION AMOUNT     → invoice.total_due                       100%
//     (the single COD basis app-wide, matching the reconciliation. shipment.cod_amount
//      is read only to classify an order as COD, never to value one.)
//   PAYMENT MODE          → payment_method (Postpaid == COD here)   100%
//   DELIVERY TYPE         → delivery_type                           100%
//   DESTINATION CITY      → shipping_address.city                   100%
//   COURIER PARTNER       → shipment.courier_partner.name           100%
//   CREATED BY            → sales_channel.name                       77%
//
// Pick and pack times, the operator who did each, and why an order waited are NOT in this
// endpoint. They come from a second source — Omniful's per-order log — which the Cloud
// Function parses into cod_order_stages and this page joins on order id. See
// captureOrderStages in functions/index.js.
//
// Still with no source anywhere: the SkyNet/Click courier re-labelling, which the old
// sheet derived from a SHIPMENT REMARKS column that does not exist in the API.

const MISSING_NOTE = () => `<b>${t('kpi_note_title', 'Not in the order feed:')}</b> ${t('kpi_note_body', 'the order feed carries no pick time, pack time or packer name, so stage-by-stage pick and pack timings, same-day pick rate and packer performance cannot be measured. Shipment-created time is used as the warehouse-processing stage instead.')}`;

// === AMMAN WALL CLOCK ===
// The rules below are Amman rules: a 10pm cutoff, a Friday exclusion, a deadline that
// ends at local midnight. But getHours()/getDay() answer in the *viewer's* zone, and the
// feed's timestamps are absolute instants. Read straight, the same order is "after 10pm"
// in Tokyo and not in Amman — measured across 20 days that swung SLA from 83.2% to 68.7%
// depending on where the page was opened.
//
// So every instant used by a rule is first converted to a proxy Date whose LOCAL fields
// carry the Amman wall clock. Durations stay on the true instants, where the zone cannot
// matter. Jordan has been on UTC+3 year-round since 2022; the formatter is used anyway so
// historical DST dates stay right.
const AMMAN_TZ = 'Asia/Amman';
const ammanFmt = (() => {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: AMMAN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    } catch (e) { return null; }
})();

function ammanWall(d) {
    if (!d) return null;
    if (ammanFmt) {
        const p = {};
        ammanFmt.formatToParts(d).forEach(x => { if (x.type !== 'literal') p[x.type] = x.value; });
        if (p.year && p.month && p.day) {
            // hourCycle h23 still reports midnight as "24" in some engines.
            return new Date(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
        }
    }
    // Fallback: shift by the fixed +03:00 offset and read the result as UTC fields.
    const shifted = new Date(d.getTime() + 3 * 3600000);
    return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
        shifted.getUTCHours(), shifted.getUTCMinutes(), shifted.getUTCSeconds());
}

// === BUSINESS RULES (unchanged from the original, now fed Amman wall time) ===
const FRIDAY = 5, CUTOFF = 22;
const isFri = (d) => d.getDay() === FRIDAY;
function nextWD(d) { const n = new Date(d); n.setDate(n.getDate() + 1); while (isFri(n)) n.setDate(n.getDate() + 1); return n; }
function slaDeadline(c) {
    if (!c) return null;
    const dd = c.getHours() < CUTOFF ? nextWD(c) : nextWD(nextWD(c));
    return new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), 23, 59, 59);
}
function workHrs(s, e) {
    if (!s || !e || e <= s) return null;
    let h = 0; const c = new Date(s);
    while (c < e) {
        if (!isFri(c)) {
            const de = new Date(c); de.setHours(23, 59, 59);
            const se = e < de ? e : de;
            if (se > c) h += (se - c) / 3600000;
        }
        c.setDate(c.getDate() + 1); c.setHours(0, 0, 0, 0);
    }
    return h;
}

// === HELPERS ===
// Omniful returns some stamps without a zone; the business runs on Amman time, so an
// unqualified stamp is read as +03:00 rather than as UTC (same rule as cod_shared).
function parseDT(raw) {
    if (!raw) return null;
    if (typeof raw !== 'string') { const d0 = new Date(raw); return isNaN(d0) ? null : d0; }
    let s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T12:00:00+03:00`;
    else {
        if (!s.includes('T')) s = s.replace(' ', 'T');
        if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += '+03:00';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}
const fH = (h) => h == null ? '—' : h < 1 ? Math.round(h * 60) + 'm' : h < 24 ? h.toFixed(1) + 'h' : (h / 24).toFixed(1) + 'd';
const fN = (n) => n.toLocaleString();
const fDtT = (d) => d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const dN = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// === STAGE TIMELINES ===
// cod_order_stages holds what the orders feed does not: when each order was picked and
// packed, who did it, and how long it sat On Hold. Written by the Cloud Function from
// Omniful's per-order log, keyed by order id. Loaded once and joined on id — it is small
// (a few hundred bytes an order) and only exists for orders that have finished.
let STAGES = {};

const stageOf = (id) => STAGES[String(id).replace(/[.#$/[\]]/g, '_')] || null;

// === STATE ===
let ALL = [], AM = 'All', AT = 'overview';
let BREACH_MERCHANT = 'All', ORDERS_MERCHANT = 'All', ORDERS_SEARCH = '';
let loadedFrom = null, loadedTo = null;

// The window the dashboard opens on. Every extra day is a full bucket fetched over the
// wire (~470 KB raw, far less gzipped), so this stays modest and widens on demand when
// the date filter asks for more.
const DEFAULT_WINDOW_DAYS = 30;
// An order created inside the window may not be delivered until well after it, and it is
// stored under its DELIVERED date once delivered. Buckets past the window end are pulled
// too, or those orders would look permanently undelivered.
const DELIVERY_SLACK_DAYS = 21;

// ── Loading ───────────────────────────────────────────────────────────────────

function setStatus(kind, txt) {
    const dot = el('kpi-status-dot'), text = el('kpi-status-text');
    if (dot) dot.className = 'kpi-dot ' + kind;
    if (text) text.textContent = txt;
}

function show(which) {
    ['kpi-loading', 'kpi-error', 'kpi-app'].forEach(id => el(id)?.classList.add('kpi-hidden'));
    el(which)?.classList.remove('kpi-hidden');
}

// Orders are stored under their delivered date once delivered and under their created
// date before that, so a single order can sit in two buckets with different statuses.
// Keeping only the most recently updated copy is what stops a delivered order from also
// being counted as still in the warehouse. (Same rule as cod_core.dedupeLatestPerOrder.)
function dedupeLatestPerOrder(buckets) {
    const byId = new Map();
    Object.keys(buckets).forEach(dateKey => {
        const dayMap = buckets[dateKey] || {};
        Object.keys(dayMap).forEach(orderKey => {
            const order = dayMap[orderKey];
            if (!order || typeof order !== 'object') return;
            const id = String(order.order_id || order.order_alias || order.id || orderKey);
            const stamp = Date.parse(order.updated_at || '') || 0;
            const existing = byId.get(id);
            if (!existing) { byId.set(id, { order, dateKey, stamp }); return; }
            if (stamp !== existing.stamp) {
                if (stamp > existing.stamp) byId.set(id, { order, dateKey, stamp });
                return;
            }
            const thisDel = (order.status_code || order.display_status || '').toString().toLowerCase().trim() === 'delivered';
            const thatDel = (existing.order.status_code || existing.order.display_status || '').toString().toLowerCase().trim() === 'delivered';
            if (thisDel !== thatDel) { if (thisDel) byId.set(id, { order, dateKey, stamp }); return; }
            if (dateKey > existing.dateKey) byId.set(id, { order, dateKey, stamp });
        });
    });
    return Array.from(byId.values());
}

const CLOSED = ['delivered', 'cancelled', 'canceled', 'returned', 'return_to_origin', 'rto'];

function toKpiOrder({ order, dateKey }) {
    const flat = flattenObject(order);
    const shipment = order.shipment || {};

    // Absolute instants, used only where a duration is measured.
    const crAbs = parseDT(order.order_created_at || order.created_at || flat.order_created_at);
    const shAbs = parseDT(shipment.order_shipped_at || order.order_shipped_at || flat.shipment_order_shipped_at);
    const dlAbs = parseDT(shipment.order_delivered_at || order.order_delivered_at || flat.shipment_order_delivered_at);
    const scAbs = parseDT(shipment.shipment_created_at || flat.shipment_shipment_created_at);

    // Amman wall clock, used by every rule and by every date shown on screen.
    const cr = ammanWall(crAbs), sh = ammanWall(shAbs);
    const dl = ammanWall(dlAbs), sc = ammanWall(scAbs);

    const status = normalizedStatus(order, flat);
    const delivered = isDeliveredOrder(order, flat);
    const amt = parseFloat(order.invoice?.total ?? flat.invoice_total ?? 0) || 0;
    const codAmt = parseFloat(shipment.cod_amount ?? flat.shipment_cod_amount ?? 0) || 0;

    const courier = (shipment.courier_partner && shipment.courier_partner.name)
        || shipment.shipping_partner_name || flat.shipment_courier_partner_name || '';

    const channel = (order.sales_channel && order.sales_channel.name) || flat.sales_channel_name || '';

    const sla = slaDeadline(cr);

    return {
        _id: String(order.order_id || order.order_alias || order.id || ''),
        _ref: String(order.order_alias || order.order_id || order.id || ''),
        _bucket: dateKey,
        _cr: cr, _sh: sh, _dl: dl, _sc: sc,
        _sel: extractStoreName(order, flat) || 'Unknown',
        _st: (order.display_status || order.status_code || '').toString().toUpperCase().trim() || '—',
        _status: status,
        _delivered: delivered,
        _amt: amt,
        // The only COD value in the model. shipment.cod_amount is deliberately NOT carried
        // as a field: it would sit here looking like an interchangeable COD figure and
        // eventually get summed, which is exactly the fallback the app does not allow.
        _due: extractOrderTotalDue(order, flat),
        // Classification only — whether the order is COD at all, not what it is worth.
        // This tenant bills COD as "Postpaid"; Prepaid orders carry a zero cod_amount.
        _isCod: codAmt > 0 || /postpaid/i.test(order.payment_method || ''),
        _pm: (order.payment_method || 'Other').toString(),
        _dt: (order.delivery_type || '').toString(),
        _city: (order.shipping_address && order.shipping_address.city) || flat.shipping_address_city || '',
        _courier: courier || 'Unassigned',
        _channel: channel || 'Manual entry',
        _auto: /custom|shopify|woocommerce|salla|zid/i.test(channel),
        _canc: status === 'cancelled' || status === 'canceled' || status === 'return_to_origin' || status === 'rto' || status === 'returned',
        _closed: CLOSED.includes(status),
        _sla: sla,
        _breach: (dl && sla) ? dl > sla : null,
        _late: cr ? cr.getHours() >= CUTOFF : false,
        _wShip: workHrs(cr, sh),        // order → handed to courier
        // Elapsed time is zone-independent, so it is measured on the true instants.
        _cour: (shAbs && dlAbs) ? (dlAbs - shAbs) / 3600000 : null,
        _e2e: (crAbs && dlAbs) ? (dlAbs - crAbs) / 3600000 : null,

        // Filled in by attachStages() once the timelines have loaded.
        _pk: null, _pa: null, _picker: null, _packer: null,
        _holdH: null, _holdReason: null, _closedReason: null,
        _wPick: null, _wPack: null, _wPS: null
    };
}

// Joins the stage timeline onto each order. Kept separate from toKpiOrder so the orders
// can render the moment they arrive, with the stage detail filling in when it loads.
function attachStages(rows) {
    rows.forEach(o => {
        const s = stageOf(o._id);
        if (!s) return;
        const pk = ammanWall(parseDT(s.picked_at));
        const pa = ammanWall(parseDT(s.packed_at));
        o._pk = pk;
        o._pa = pa;
        o._picker = s.picker || null;
        o._packer = s.packer || null;
        o._holdH = s.hold_ms ? s.hold_ms / 3600000 : null;
        o._holdReason = s.hold_reason || null;
        o._closedReason = s.closed_reason || null;
        // Working hours, Friday excluded — the same rule as every other stage here.
        o._wPick = workHrs(o._cr, pk);
        o._wPack = workHrs(pk, pa);
        o._wPS = workHrs(pa, o._sh);
    });
    return rows;
}

// A live subscription, scoped to the loaded window rather than the whole node. The first
// event carries the window; after that the database pushes only the buckets that changed,
// so the hourly ingest lands on screen without a reload and without refetching everything.
let unsubscribe = null;
let repaintTimer = null;

function subscribeRange(fromKey, toKey, onFirst, onError) {
    const today = dateKeyOf(new Date());
    let fetchTo = addDays(toKey, DELIVERY_SLACK_DAYS);
    if (fetchTo > today) fetchTo = today;

    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    setStatus('load', t('kpi_status_loading', 'Loading…'));
    const bar = el('kpi-load-bar'), fill = el('kpi-load-fill');
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = '20%';

    let first = true;
    const q = query(ref(db, 'cod_daily_orders'), orderByKey(), startAt(fromKey), endAt(fetchTo));

    unsubscribe = onValue(q, (snap) => {
        const buckets = snap.val() || {};
        // Test Seller is dropped here rather than in each metric, so every tab, chart and
        // export below is already free of it.
        ALL = attachStages(dedupeLatestPerOrder(buckets).map(toKpiOrder)
            .filter(o => o._cr && !isNonProductionStore(o._sel)));
        loadedFrom = fromKey;
        loadedTo = toKey;

        if (fill) fill.style.width = '100%';
        setTimeout(() => { if (bar) bar.hidden = true; if (fill) fill.style.width = '0'; }, 350);

        if (first) {
            first = false;
            onFirst();
            return;
        }

        // The ingest writes hundreds of orders in one patch, which can arrive as a burst
        // of events. Coalesce them so the tab is rebuilt once, not once per order.
        clearTimeout(repaintTimer);
        repaintTimer = setTimeout(() => {
            markLive();
            rTab();
        }, 400);
    }, (err) => {
        if (bar) bar.hidden = true;
        onError(err);
    });
}

function markLive() {
    const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setStatus('live', `${t('kpi_status_live', 'Live')} · ${fN(ALL.length)} ${t('kpi_orders', 'orders')} · ${t('kpi_updated', 'updated')} ${at}`);
}

// Loaded once per page, not per range: the node is small and an order's timeline never
// changes once captured. A failure here is not fatal — the stage-dependent panels say so
// and everything else renders as normal.
async function loadStages() {
    try {
        const snap = await get(ref(db, 'cod_order_stages'));
        STAGES = snap.val() || {};
    } catch (err) {
        console.warn('Stage timelines unavailable', err);
        STAGES = {};
    }
}

function boot(fromKey, toKey) {
    show('kpi-loading');
    const detail = el('kpi-loading-detail');
    if (detail) detail.textContent = `${fromKey} → ${toKey}`;

    const fail = (err) => {
        console.error('KPI load failed', err);
        el('kpi-error-msg').textContent = err.message || String(err);
        show('kpi-error');
        setStatus('err', t('kpi_status_err', 'Error'));
    };

    try {
        subscribeRange(fromKey, toKey, () => {
            if (!ALL.length) {
                el('kpi-error-msg').textContent = t('kpi_err_empty', 'No orders stored for this date range.');
                show('kpi-error');
                setStatus('err', t('kpi_status_empty', 'No data'));
                return;
            }

            el('kpi-df-from').value = fromKey;
            el('kpi-df-to').value = toKey;
            el('kpi-date-bar').style.display = 'flex';

            show('kpi-app');
            markLive();
            rTabs(); rTab();
        }, fail);
    } catch (err) {
        fail(err);
    }
}

// ── Filtering ─────────────────────────────────────────────────────────────────

// `new Date("2026-09-21")` is parsed as UTC midnight, which is already the 20th anywhere
// west of Greenwich — setHours() then pins the wrong day and the range silently slips.
// The input's own parts are used instead, matching the Amman wall clock on `_cr`.
function dayBound(value, endOfDay) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return null;
    return endOfDay
        ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
        : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
}

function getFiltered() {
    let f = AM === 'All' ? [...ALL] : ALL.filter(o => o._sel === AM);
    const from = dayBound(el('kpi-df-from').value, false);
    const to = dayBound(el('kpi-df-to').value, true);
    if (from) f = f.filter(o => o._cr && o._cr >= from);
    if (to) f = f.filter(o => o._cr && o._cr <= to);
    return f;
}

// Widening the range past what is in memory triggers a refetch; narrowing filters what
// is already loaded.
function onDateChange() {
    const from = el('kpi-df-from').value, to = el('kpi-df-to').value;
    if (!from || !to) return;
    // Inside the subscribed window this is just a client-side filter; widening it
    // re-subscribes over the larger range.
    if (loadedFrom && loadedTo && from >= loadedFrom && to <= loadedTo) { rTab(); return; }
    boot(from < (loadedFrom || from) ? from : loadedFrom, to > (loadedTo || to) ? to : loadedTo);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'overview', label: () => t('kpi_tab_overview', 'Overview') },
    { id: 'sla', label: () => t('kpi_tab_sla', 'SLA Compliance') },
    { id: 'merchants', label: () => t('kpi_tab_merchants', 'Merchants') },
    { id: 'biz', label: () => t('kpi_tab_biz', 'Business') },
    { id: 'breaches', label: () => t('kpi_tab_breaches', 'Breached Orders') },
    { id: 'orders', label: () => t('kpi_tab_orders', 'All Orders') },
    { id: 'kpis', label: () => t('kpi_tab_kpis', 'Suggested KPIs') }
];

function rTabs() {
    el('kpi-tab-bar').innerHTML = TABS.map(tb =>
        `<button class="kpi-tab ${tb.id === AT ? 'active' : ''}" data-tab="${tb.id}">${escapeHtml(tb.label())}</button>`
    ).join('');
    el('kpi-tab-bar').querySelectorAll('.kpi-tab').forEach(b =>
        b.addEventListener('click', () => { AT = b.getAttribute('data-tab'); rTabs(); rTab(); }));
}

function rTab() {
    const host = el('kpi-tab-content');
    const f = getFiltered();
    const del = f.filter(o => o._delivered);
    const canc = f.filter(o => o._canc);
    const ms = [...new Set(ALL.map(o => o._sel))].sort();

    el('kpi-df-count').textContent = `${fN(f.length)} ${t('kpi_in_range', 'orders in range')}`;

    const ds = f.map(o => o._cr).filter(Boolean).sort((a, b) => a - b);
    const fmtD = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    el('kpi-date-range').textContent = ds.length
        ? `${fmtD(ds[0])} — ${fmtD(ds[ds.length - 1])} · ${fN(f.length)} ${t('kpi_orders', 'orders')}`
        : t('kpi_none_range', 'No orders in range');

    switch (AT) {
        case 'overview': host.innerHTML = rOverview(f, del, canc, ms); break;
        case 'sla': host.innerHTML = rSLA(f, del); break;
        case 'merchants': host.innerHTML = rMerch(f, ms); break;
        case 'biz': host.innerHTML = rBiz(f, del, ms); break;
        case 'breaches': host.innerHTML = rBreach(del, ms); break;
        case 'orders': host.innerHTML = rOrders(f, ms); break;
        case 'kpis': host.innerHTML = rKPIs(f, del, canc); break;
    }
    wireTabControls();
}

// Chips, search and export are re-rendered with each tab, so their handlers are bound
// after every paint rather than once at boot.
function wireTabControls() {
    const host = el('kpi-tab-content');
    host.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
        const scope = b.getAttribute('data-chip'), val = b.getAttribute('data-val');
        if (scope === 'merchant') AM = val;
        if (scope === 'breach') BREACH_MERCHANT = val;
        if (scope === 'orders') ORDERS_MERCHANT = val;
        rTab();
    }));
    const search = host.querySelector('[data-search]');
    if (search) search.addEventListener('input', (e) => {
        ORDERS_SEARCH = e.target.value;
        rTab();
        const again = el('kpi-tab-content').querySelector('[data-search]');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    host.querySelector('[data-export]')?.addEventListener('click', exportBreaches);
}

const chips = (list, active, scope) => ['All', ...list].map(m =>
    `<button class="kpi-chip ${m === active ? 'on' : ''}" data-chip="${scope}" data-val="${escapeHtml(m)}">${escapeHtml(m)}${scope === 'merchant' ? ` (${m === 'All' ? ALL.length : ALL.filter(o => o._sel === m).length})` : ''}</button>`
).join('');

// ── Overview ──────────────────────────────────────────────────────────────────

function rOverview(f, del, canc, ms) {
    const tot = f.length, cr = tot ? canc.length / tot * 100 : 0;
    const rev = del.reduce((s, o) => s + o._amt, 0), aov = del.length ? rev / del.length : 0;
    const st = del.map(o => o._wShip).filter(h => h != null && h > 0);
    const ws = del.filter(o => o._breach !== null), br = ws.filter(o => o._breach);
    const sla = ws.length ? ((ws.length - br.length) / ws.length * 100) : 0;
    const ct = del.map(o => o._cour).filter(h => h != null && h > 0);
    const pick = del.map(o => o._wPick).filter(h => h != null && h > 0);
    const pack = del.map(o => o._wPack).filter(h => h != null && h >= 0);
    const ps = del.map(o => o._wPS).filter(h => h != null && h > 0);
    const held = del.map(o => o._holdH).filter(h => h != null && h > 0);
    const hasStages = pick.length > 0;
    const cc = f.filter(o => /click/i.test(o._dt)).length, nd = f.filter(o => /normal/i.test(o._dt)).length;
    const e2e = del.map(o => o._e2e).filter(h => h != null && h > 0);
    const ae2e = avg(e2e), me2e = med(e2e), as = avg(st), ms2 = med(st), ac = avg(ct);
    const col = v => v >= 90 ? 'var(--kpi-good)' : v >= 75 ? 'var(--kpi-warn)' : 'var(--kpi-bad)';

    return `
  <div class="kpi-filters" style="padding-top:16px">${chips(ms, AM, 'merchant')}</div>
  ${hasStages ? '' : `<div class="kpi-note">${MISSING_NOTE()}</div>`}
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-muted)"></div>${t('kpi_total_orders', 'Total Orders')}</div><div class="kpi-big">${fN(tot)}</div><div class="kpi-sub">${fN(del.length)} delivered · ${fN(canc.length)} cancelled</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:${col(sla)}"></div>${t('kpi_sla', 'SLA Compliance')}</div><div class="kpi-big" style="color:${col(sla)}">${sla.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${br.length} of ${ws.length} breached</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-purple)"></div>Order to Delivery <small style="color:var(--kpi-muted)">(merchant KPI)</small></div><div class="kpi-big" style="color:var(--kpi-purple)">${fH(ae2e)}</div><div class="kpi-sub">Median: <b>${fH(me2e)}</b> · What merchants see</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-blue)"></div>Avg Fulfilment <small style="color:var(--kpi-muted)">(working hrs)</small></div><div class="kpi-big" style="color:var(--kpi-blue)">${fH(as)}</div><div class="kpi-sub">Median: <b>${fH(ms2)}</b> · Order → Shipped</div></div>

    <div class="kpi-card kpi-c4"><div class="kpi-card-t">Fulfilment Pipeline — Working Hours (excl. Friday)</div>
      <div class="kpi-flow">
        <div class="kpi-flow-box ours"><div class="kpi-flow-tag ours">WE CONTROL</div><div class="kpi-flow-val" style="color:var(--kpi-blue)">${fH(avg(pick))}</div><div class="kpi-flow-lbl">Order → Pick</div><div class="kpi-flow-med">median ${fH(med(pick))}</div></div>
        <div class="kpi-flow-arrow">→</div>
        <div class="kpi-flow-box ours"><div class="kpi-flow-val" style="color:var(--kpi-accent)">${fH(avg(pack))}</div><div class="kpi-flow-lbl">Pick → Pack</div><div class="kpi-flow-med">median ${fH(med(pack))}</div></div>
        <div class="kpi-flow-arrow">→</div>
        <div class="kpi-flow-box ours"><div class="kpi-flow-val" style="color:var(--kpi-good)">${fH(avg(ps))}</div><div class="kpi-flow-lbl">Pack → Ship</div><div class="kpi-flow-med">median ${fH(med(ps))}</div></div>
        <div class="kpi-flow-arrow" style="font-size:20px">⇥</div>
        <div class="kpi-flow-box ext"><div class="kpi-flow-tag theirs">COURIER</div><div class="kpi-flow-val" style="color:var(--kpi-muted)">${fH(ac)}</div><div class="kpi-flow-lbl">Ship → Deliver</div><div class="kpi-flow-med">not in our control</div></div>
        <div class="kpi-flow-arrow">=</div>
        <div class="kpi-flow-box total"><div class="kpi-flow-tag total">MERCHANT KPI</div><div class="kpi-flow-val" style="color:var(--kpi-purple)">${fH(ae2e)}</div><div class="kpi-flow-lbl">Order → Deliver</div><div class="kpi-flow-med">median ${fH(me2e)}</div></div>
      </div>
      ${held.length ? `<div class="kpi-sub" style="margin-top:14px">
        <b>${held.length}</b> of these orders were held before picking, for <b>${fH(med(held))}</b> median.
        Order → Pick is mostly waiting, not warehouse work — see the Business tab for what they were waiting on.</div>` : ''}
    </div>

    <div class="kpi-card"><div class="kpi-card-t">Revenue</div><div class="kpi-big" style="font-size:26px">${rev.toFixed(0)}<span class="u">JOD</span></div><div class="kpi-sub">AOV: <b>${aov.toFixed(1)} JOD</b></div></div>
    <div class="kpi-card"><div class="kpi-card-t">Cancel Rate <small style="color:var(--kpi-muted)">(incl. RTO)</small></div><div class="kpi-big" style="color:${cr > 5 ? 'var(--kpi-bad)' : cr > 3 ? 'var(--kpi-warn)' : 'var(--kpi-good)'}">${cr.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${canc.filter(o => !/return|rto/.test(o._status)).length} cancelled · ${canc.filter(o => /return|rto/.test(o._status)).length} RTO</div></div>
    <div class="kpi-card"><div class="kpi-card-t">Delivery Split</div><div style="margin-top:6px"><div class="kpi-legend-item"><div class="kpi-legend-dot" style="background:var(--kpi-accent)"></div>Click &amp; Collect<span class="kpi-legend-val">${cc}</span></div><div class="kpi-legend-item"><div class="kpi-legend-dot" style="background:var(--kpi-blue)"></div>Normal Delivery<span class="kpi-legend-val">${nd}</span></div></div></div>
    <div class="kpi-card"><div class="kpi-card-t">Payment Modes</div><div style="margin-top:6px">${renderPM(f)}</div></div>
  </div>`;
}

function renderPM(f) {
    const m = {};
    f.forEach(o => { const k = o._pm || 'Other'; m[k] = (m[k] || 0) + 1; });
    const cols = { 'Prepaid': 'var(--kpi-good)', 'Postpaid': 'var(--kpi-warn)' };
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) =>
        `<div class="kpi-legend-item"><div class="kpi-legend-dot" style="background:${cols[k] || 'var(--kpi-purple)'}"></div>${escapeHtml(k)}${k === 'Postpaid' ? ' <span style="color:var(--kpi-muted)">(COD)</span>' : ''}<span class="kpi-legend-val">${v}</span></div>`
    ).join('');
}

// ── SLA ───────────────────────────────────────────────────────────────────────

function rSLA(f, del) {
    const ws = del.filter(o => o._breach !== null), br = ws.filter(o => o._breach), on = ws.length - br.length;
    const sla = ws.length ? (on / ws.length * 100) : 0;
    const bc = del.filter(o => !o._late), ac = del.filter(o => o._late);
    const bcB = bc.filter(o => o._breach).length, acB = ac.filter(o => o._breach).length;
    const bcR = bc.length ? ((bc.length - bcB) / bc.length * 100) : 0;
    const acR = ac.length ? ((ac.length - acB) / ac.length * 100) : 0;
    const ms = [...new Set(del.map(o => o._sel))];
    const mSLA = ms.map(m => {
        const mo = del.filter(o => o._sel === m && o._breach !== null), mb = mo.filter(o => o._breach);
        return { name: m, total: mo.length, breached: mb.length, rate: mo.length ? ((mo.length - mb.length) / mo.length * 100) : 0 };
    }).sort((a, b) => a.rate - b.rate);
    const days = [0, 1, 2, 3, 4, 6].map(d => {
        const dO = del.filter(o => o._cr && o._cr.getDay() === d && o._breach !== null), dB = dO.filter(o => o._breach);
        return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d], total: dO.length, rate: dO.length ? ((dO.length - dB.length) / dO.length * 100) : 0 };
    });
    const col = v => v >= 90 ? 'var(--kpi-good)' : v >= 75 ? 'var(--kpi-warn)' : 'var(--kpi-bad)';
    const bar = (label, rate, extra) => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(label)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(rate, 8)}%;background:${col(rate)}">${rate.toFixed(0)}%${extra || ''}</div></div></div>`;

    return `
  <div class="kpi-grid" style="padding-top:20px">
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:${col(sla)}"></div>Overall SLA</div><div class="kpi-big" style="color:${col(sla)}">${sla.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${on} on-time · ${br.length} breached</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-blue)"></div>Before 10 PM</div><div class="kpi-big" style="color:${col(bcR)}">${bcR.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${bc.length} orders · ${bcB} breached</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-purple)"></div>After 10 PM</div><div class="kpi-big" style="color:${col(acR)}">${acR.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${ac.length} orders · ${acB} breached</div></div>
    <div class="kpi-card"><div class="kpi-card-t">SLA Rules</div><div style="font-size:12px;line-height:1.8;margin-top:4px"><div>🕙 Cutoff: <b>10 PM</b></div><div>📦 Before → <b>delivered next working day</b></div><div>🌙 After → <b>delivered day after next</b></div><div>🚫 <b>Friday excluded</b></div></div></div>
    <div class="kpi-card kpi-c2"><div class="kpi-card-t">SLA by Merchant</div><div class="kpi-bars">${mSLA.map(m => bar(m.name, m.rate, ` (${m.breached})`)).join('')}</div></div>
    <div class="kpi-card kpi-c2"><div class="kpi-card-t">SLA by Day Created</div><div class="kpi-bars">${days.map(d => bar(`${d.day} (${d.total})`, d.rate)).join('')}</div></div>
  </div>`;
}

// ── Merchants ─────────────────────────────────────────────────────────────────

function rMerch(filtered, ms) {
    const data = ms.map(m => {
        const o = filtered.filter(x => x._sel === m);
        const d = o.filter(x => x._delivered), c = o.filter(x => x._canc);
        const so = d.filter(x => x._breach !== null), sb = so.filter(x => x._breach);
        const st = d.map(x => x._wShip).filter(h => h != null && h > 0);
        const pr = d.map(x => x._wPick).filter(h => h != null && h > 0);
        const ct = d.map(x => x._cour).filter(h => h != null && h > 0);
        const e2et = d.map(x => x._e2e).filter(h => h != null && h > 0);
        const rev = d.reduce((s, x) => s + x._amt, 0);
        return {
            name: m, total: o.length, delivered: d.length, cancelled: c.length,
            dr: o.length ? (d.length / o.length * 100) : 0,
            sla: so.length ? ((so.length - sb.length) / so.length * 100) : 0, slB: sb.length,
            aShip: avg(st), aPick: avg(pr), aCour: avg(ct), aE2E: avg(e2et), mE2E: med(e2et),
            rev, aov: d.length ? rev / d.length : 0
        };
    }).filter(m => m.total > 0);

    const badge = v => v >= 90 ? 'good' : v >= 75 ? 'warn' : 'bad';
    const maxE = Math.max(...data.map(x => x.aE2E), 1);

    return `
  <div class="kpi-grid" style="padding-top:20px">
    <div class="kpi-card kpi-c4"><div class="kpi-card-t">Merchant Comparison — Working Hours (excl. Friday)</div><div class="table-container"><table>
      <thead><tr><th>Merchant</th><th>Orders</th><th>Del %</th><th>SLA</th><th>Breaches</th><th>Avg Pick</th><th>Avg Ship</th><th style="color:var(--kpi-muted)">Courier</th><th style="color:var(--kpi-purple)">Order→Deliver</th><th>Revenue</th><th>AOV</th></tr></thead>
      <tbody>${data.map(m => `<tr>
        <td><b>${escapeHtml(m.name)}</b></td>
        <td class="num">${m.total}</td>
        <td><span class="kpi-badge ${m.dr >= 95 ? 'good' : m.dr >= 90 ? 'warn' : 'bad'}">${m.dr.toFixed(0)}%</span></td>
        <td><span class="kpi-badge ${badge(m.sla)}">${m.sla.toFixed(0)}%</span></td>
        <td class="num" style="color:${m.slB > 0 ? 'var(--kpi-bad)' : 'var(--kpi-good)'}">${m.slB}</td>
        <td class="num">${fH(m.aPick)}</td>
        <td class="num">${fH(m.aShip)}</td>
        <td class="num" style="color:var(--kpi-muted)">${fH(m.aCour)}</td>
        <td class="num" style="color:var(--kpi-purple);font-weight:700">${fH(m.aE2E)}</td>
        <td class="num">${m.rev.toFixed(0)}</td>
        <td class="num">${m.aov.toFixed(0)}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>
    <div class="kpi-card kpi-c2"><div class="kpi-card-t">SLA by Merchant</div><div class="kpi-bars">${[...data].sort((a, b) => a.sla - b.sla).map(m => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(m.name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(m.sla, 8)}%;background:${m.sla >= 90 ? 'var(--kpi-good)' : m.sla >= 75 ? 'var(--kpi-warn)' : 'var(--kpi-bad)'}">${m.sla.toFixed(0)}%</div></div></div>`).join('')}</div></div>
    <div class="kpi-card kpi-c2"><div class="kpi-card-t" style="color:var(--kpi-purple)">Order → Delivered by Merchant</div><div class="kpi-bars">${[...data].sort((a, b) => b.aE2E - a.aE2E).map(m => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(m.name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.min(m.aE2E / maxE * 100, 100)}%;background:${m.aE2E < 48 ? 'var(--kpi-good)' : m.aE2E < 96 ? 'var(--kpi-warn)' : 'var(--kpi-bad)'}">${fH(m.aE2E)} <span class="sm">med ${fH(m.mE2E)}</span></div></div></div>`).join('')}</div></div>
  </div>`;
}

// ── Breaches ──────────────────────────────────────────────────────────────────

function rBreach(del, ms) {
    let br = del.filter(o => o._breach);
    if (BREACH_MERCHANT !== 'All') br = br.filter(o => o._sel === BREACH_MERCHANT);
    br.sort((a, b) => (b._e2e || 0) - (a._e2e || 0));

    return `
  <div class="kpi-filters" style="padding-top:16px">
    ${chips(ms, BREACH_MERCHANT, 'breach')}
    <span style="color:var(--kpi-muted);font-size:12px;margin-left:8px">${br.length} breached orders</span>
    <button class="kpi-chip" data-export="1" style="margin-inline-start:auto;">⬇ Export CSV</button>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card kpi-c4">
      <div class="kpi-card-t" style="color:var(--kpi-bad)"><div class="tdot" style="background:var(--kpi-bad)"></div>SLA Breached — delivered past deadline</div>
      <div class="table-container kpi-scroll"><table>
        <thead><tr><th>Ref</th><th>Merchant</th><th>Created</th><th>Day</th><th>After 10pm</th><th>SLA Deadline</th><th>Shipped At</th><th>Delivered At</th><th>E2E</th><th>Over</th></tr></thead>
        <tbody>${br.slice(0, 200).map(o => {
        const ov = o._dl && o._sla ? (o._dl - o._sla) / 3600000 : 0;
        return `<tr class="breach-row">
          <td class="num" style="font-size:11px">${escapeHtml(o._ref)}</td>
          <td>${escapeHtml(o._sel)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._cr)}</td>
          <td>${o._cr ? dN(o._cr) : '—'}</td>
          <td>${o._late ? '<span class="kpi-badge warn">Yes</span>' : 'No'}</td>
          <td class="num" style="font-size:10px">${fDtT(o._sla)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._sh)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._dl)}</td>
          <td class="num">${fH(o._e2e)}</td>
          <td class="num" style="color:var(--kpi-bad)">+${fH(ov)}</td>
        </tr>`;
    }).join('')}</tbody>
      </table></div>
      ${br.length > 200 ? `<div class="kpi-sub" style="margin-top:12px">Showing 200 of ${br.length}</div>` : ''}
    </div>
  </div>`;
}

// ── All orders ────────────────────────────────────────────────────────────────

function rOrders(f, ms) {
    let filtered = [...f];
    if (ORDERS_MERCHANT !== 'All') filtered = filtered.filter(o => o._sel === ORDERS_MERCHANT);
    if (ORDERS_SEARCH) {
        const q = ORDERS_SEARCH.toLowerCase();
        filtered = filtered.filter(o => (o._ref || '').toLowerCase().includes(q) || (o._id || '').toLowerCase().includes(q));
    }
    filtered.sort((a, b) => (b._cr || 0) - (a._cr || 0));

    return `
  <div class="kpi-filters" style="padding-top:16px">
    ${chips(ms, ORDERS_MERCHANT, 'orders')}
    <input class="kpi-search" type="text" data-search="1" placeholder="Search order #…" value="${escapeHtml(ORDERS_SEARCH)}">
    <span style="color:var(--kpi-muted);font-size:12px;margin-left:8px">${fN(filtered.length)} orders</span>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card kpi-c4">
      <div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-muted)"></div>All Orders</div>
      <div class="table-container kpi-scroll"><table>
        <thead><tr><th>Ref</th><th>Merchant</th><th>Status</th><th>Created At</th><th>Day</th><th>Picked</th><th>Packed</th><th>Shipped At</th><th>Delivered At</th><th>Courier</th><th>SLA</th><th>E2E</th></tr></thead>
        <tbody>${filtered.slice(0, 300).map(o => {
        const cls = o._breach === false ? 'good' : o._breach === true ? 'bad' : 'info';
        const lbl = o._breach === false ? 'OK' : o._breach === true ? 'BREACH' : '—';
        return `<tr${o._breach ? ' class="breach-row"' : ''}>
          <td class="num" style="font-size:11px">${escapeHtml(o._ref)}</td>
          <td>${escapeHtml(o._sel)}</td>
          <td><span class="kpi-badge ${o._delivered ? 'good' : o._canc ? 'bad' : /ship|transit/i.test(o._status) ? 'info' : 'warn'}">${escapeHtml(o._st)}</span></td>
          <td class="num" style="font-size:10px">${fDtT(o._cr)}</td>
          <td>${o._cr ? dN(o._cr) : '—'}</td>
          <td class="num" style="font-size:10px">${fDtT(o._pk)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._pa)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._sh)}</td>
          <td class="num" style="font-size:10px">${fDtT(o._dl)}</td>
          <td style="font-size:11px">${escapeHtml(o._courier)}</td>
          <td><span class="kpi-badge ${cls}">${lbl}</span></td>
          <td class="num">${fH(o._e2e)}</td>
        </tr>`;
    }).join('')}</tbody>
      </table></div>
      ${filtered.length > 300 ? `<div class="kpi-sub" style="margin-top:12px">Showing 300 of ${fN(filtered.length)}</div>` : ''}
    </div>
  </div>`;
}

// ── Suggested KPIs ────────────────────────────────────────────────────────────

function rKPIs(f, del, canc) {
    const ws = del.filter(o => o._breach !== null);
    const sla = ws.length ? ((ws.length - ws.filter(o => o._breach).length) / ws.length * 100) : 0;
    const cr = f.length ? (canc.length / f.length * 100) : 0;
    const pick = del.map(o => o._wPick).filter(h => h != null && h > 0);
    const pack = del.map(o => o._wPack).filter(h => h != null && h >= 0);
    const ps = del.map(o => o._wPS).filter(h => h != null && h > 0);
    const held = del.map(o => o._holdH).filter(h => h != null && h > 0);
    const st = del.map(o => o._wShip).filter(h => h != null && h > 0);
    const ct = del.map(o => o._cour).filter(h => h != null && h > 0);
    const e2e = del.map(o => o._e2e).filter(h => h != null && h > 0);
    const hasStages = pick.length > 0;

    // Holding is its own stage rather than part of Order → Pick: it is usually the single
    // largest block of time and it is not warehouse work, so folding it in hides the cause.
    const stages = hasStages
        ? { 'Waiting on hold': avg(held), 'Order → Pick': avg(pick), 'Pick → Pack': avg(pack), 'Pack → Ship': avg(ps), 'Courier transit': avg(ct) }
        : { 'Courier transit': avg(ct) };
    const bn = Object.entries(stages).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];

    // Same-day PICK, as the original measured it — the pick stamp comes from the order log.
    const sdp = del.filter(o => o._cr && o._pk && !isFri(o._cr) && o._cr.toDateString() === o._pk.toDateString()).length;
    const sdpR = del.length ? (sdp / del.length * 100) : 0;
    const codPct = f.length ? (f.filter(o => o._isCod).length / f.length * 100) : 0;
    const rto = canc.filter(o => /return|rto/.test(o._status)).length;
    const rtoR = f.length ? rto / f.length * 100 : 0;

    return `
  <div class="kpi-grid" style="padding-top:20px">
    <div class="kpi-card kpi-c2">
      <div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-good)"></div>Core KPIs — Track Weekly</div>
      <div style="margin-top:8px">
        <div class="kpi-item good" style="border-left-color:var(--kpi-purple)"><div class="kpi-item-n">🎯 Order to Delivery (Full Cycle)</div><div class="kpi-item-d">Calendar hours from order placed to customer received. <b>This is what your merchants care about most.</b></div><div class="kpi-item-v">Current: avg ${fH(avg(e2e))}, median ${fH(med(e2e))} · Target: under 48h</div></div>
        <div class="kpi-item good"><div class="kpi-item-n">📦 SLA Compliance Rate</div><div class="kpi-item-d">% of orders delivered before SLA deadline. Before 10pm = next working day. After 10pm = day after next.</div><div class="kpi-item-v">Current: ${sla.toFixed(1)}% · Target: 90%+</div></div>
        <div class="kpi-item info"><div class="kpi-item-n">⏱️ Same-Day Pick Rate</div><div class="kpi-item-d">Orders picked the same day they were created (excl. Friday).</div><div class="kpi-item-v">Current: ${sdpR.toFixed(1)}% · Target: 85%+</div></div>
        <div class="kpi-item warn"><div class="kpi-item-n">🔄 Pick-to-Pack Cycle</div><div class="kpi-item-d">Working hours from picked to packed — the warehouse's own handling time.</div><div class="kpi-item-v">Current: ${fH(avg(pack))} · Target: under 30m</div></div>
        ${held.length ? `<div class="kpi-item bad"><div class="kpi-item-n">⏸️ Time Waiting on Hold</div><div class="kpi-item-d">Wall-clock hours an order sat blocked before picking could start. Not warehouse time.</div><div class="kpi-item-v">Median: ${fH(med(held))} across ${held.length} held orders</div></div>` : ''}
        <div class="kpi-item good"><div class="kpi-item-n">🚀 Fulfilment Speed</div><div class="kpi-item-d">Working hours, order created → handed to courier.</div><div class="kpi-item-v">Current: ${fH(avg(st))} avg</div></div>
        <div class="kpi-item warn"><div class="kpi-item-n">🚫 Cancellation Rate</div><div class="kpi-item-d">Cancelled and returned orders as a share of the range.</div><div class="kpi-item-v">Current: ${cr.toFixed(1)}% · Target: below 3%</div></div>
        <div class="kpi-item bad"><div class="kpi-item-n">🔙 Return / RTO Rate</div><div class="kpi-item-d">Critical for COD markets.</div><div class="kpi-item-v">Current: ${rtoR.toFixed(1)}% (${rto} orders) · Target: below 5%</div></div>
      </div>
    </div>
    <div class="kpi-card kpi-c2">
      <div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-warn)"></div>Insights &amp; Actions</div>
      <div style="margin-top:8px">
        <div class="kpi-item bad"><div class="kpi-item-n">🔍 Bottleneck: ${bn ? escapeHtml(bn[0]) : '—'}</div><div class="kpi-item-d">Slowest stage: <b>${bn ? fH(bn[1]) : '—'}</b>. ${
        !bn ? '' :
            bn[0] === 'Waiting on hold' ? 'Orders are blocked before picking can start — this is a stock and approvals problem, not a warehouse one. See "Why Orders Waited" on the Business tab.'
                : bn[0] === 'Order → Pick' ? 'Picking starts late — assign pickers earlier in the day.'
                    : bn[0] === 'Pick → Pack' ? 'Packing is the constraint — check station coverage at peak.'
                        : bn[0] === 'Pack → Ship' ? 'Parcels are packed but waiting on pickup — add a second daily courier collection.'
                            : 'Courier transit dominates — review the carrier mix.'}</div></div>
        <div class="kpi-item warn"><div class="kpi-item-n">💵 COD: ${codPct.toFixed(0)}%</div><div class="kpi-item-d">Reconciled daily on the COD Analysis app. Track COD delivery failures separately.</div></div>
        <div class="kpi-item info"><div class="kpi-item-n">📊 Operator Throughput</div><div class="kpi-item-d">Orders picked and packed per person. Full table on the Business tab. Benchmark: 15–25/op/hr.</div><div class="kpi-item-v">${(() => {
            const ppl = new Set(); f.forEach(o => { if (o._picker) ppl.add(o._picker); if (o._packer) ppl.add(o._packer); });
            return ppl.size ? `${ppl.size} operators active in range` : 'No operator data in range';
        })()}</div></div>
      </div>
    </div>
  </div>`;
}

// ── Business ──────────────────────────────────────────────────────────────────

function rBiz(f, del, ms) {
    const tot = f.length;
    const active = [...new Set(f.map(o => o._sel))];
    const delPerM = active.map(m => ({ name: m, n: del.filter(o => o._sel === m).length, total: f.filter(o => o._sel === m).length })).sort((a, b) => b.n - a.n);

    const shipped = f.filter(o => o._sh);
    const courierCount = {};
    shipped.forEach(o => { courierCount[o._courier] = (courierCount[o._courier] || 0) + 1; });
    const courierList = Object.entries(courierCount).sort((a, b) => b[1] - a[1]);

    const codOrders = f.filter(o => o._isCod);
    const codPct = tot ? codOrders.length / tot * 100 : 0;
    // invoice.total_due is the single basis for COD value across the whole app — the same
    // field the COD Analysis reconciliation builds "expected" from, with no fallback to
    // shipment.cod_amount. Both screens therefore report the same number for the same day.
    // A settled order whose due Omniful has zeroed correctly contributes nothing here,
    // because nothing is still owed in cash on it.
    const codTotal = del.filter(o => o._isCod).reduce((s, o) => s + o._due, 0);

    const auto = f.filter(o => o._auto).length;
    const autoPct = tot ? auto / tot * 100 : 0;

    const chanCount = {};
    f.forEach(o => { chanCount[o._channel] = (chanCount[o._channel] || 0) + 1; });
    const chanList = Object.entries(chanCount).sort((a, b) => b[1] - a[1]);

    const cityCount = {};
    f.forEach(o => { if (o._city) cityCount[o._city] = (cityCount[o._city] || 0) + 1; });
    const cityList = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const maxDel = Math.max(...delPerM.map(x => x.n), 1);
    const maxCour = courierList.length ? courierList[0][1] : 1;
    const maxCity = cityList.length ? cityList[0][1] : 1;

    return `
  <div class="kpi-grid" style="padding-top:20px">
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-good)"></div>Active Merchants</div><div class="kpi-big" style="color:var(--kpi-good)">${active.length}</div><div class="kpi-sub">≥1 order in selected period</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-muted)"></div>Delivered Orders</div><div class="kpi-big">${fN(del.length)}</div><div class="kpi-sub">of ${fN(tot)} total in range</div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-warn)"></div>COD Share</div><div class="kpi-big" style="color:var(--kpi-warn)">${codPct.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${codOrders.length} COD orders · <b>${codTotal.toFixed(0)} JOD</b> due on delivered orders<br><span style="opacity:.75">Outstanding COD, same basis as the COD Analysis reconciliation.</span></div></div>
    <div class="kpi-card"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-accent)"></div>Automated Orders</div><div class="kpi-big" style="color:var(--kpi-accent)">${autoPct.toFixed(1)}<span class="u">%</span></div><div class="kpi-sub">${auto} via integration · ${tot - auto} manual</div></div>

    <div class="kpi-card kpi-c2"><div class="kpi-card-t">Delivered Orders per Merchant</div><div class="kpi-bars">
      ${delPerM.map(m => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(m.name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(m.n / maxDel * 100, 6)}%;background:var(--kpi-good)">${m.n} <span class="sm">of ${m.total}</span></div></div></div>`).join('')}
    </div></div>

    <div class="kpi-card kpi-c2"><div class="kpi-card-t">Courier Split (shipped orders)</div><div class="kpi-bars">
      ${courierList.length ? courierList.map(([name, n]) => {
        const pct = shipped.length ? n / shipped.length * 100 : 0;
        return `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(n / maxCour * 100, 6)}%;background:var(--kpi-blue)">${n} (${pct.toFixed(0)}%)</div></div></div>`;
    }).join('') : '<div class="kpi-sub">No shipped orders in range.</div>'}
    </div>
    <div class="kpi-sub" style="margin-top:10px">Courier names come straight from the Omniful shipment record. "Manual" means an in-house delivery with no carrier account attached.</div></div>

    <div class="kpi-card kpi-c2"><div class="kpi-card-t">Sales Channel</div><div class="kpi-bars">
      ${chanList.map(([name, n]) => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(n / (chanList[0][1] || 1) * 100, 6)}%;background:var(--kpi-accent)">${n}</div></div></div>`).join('')}
    </div></div>

    <div class="kpi-card kpi-c2"><div class="kpi-card-t">Top Destination Cities</div><div class="kpi-bars">
      ${cityList.length ? cityList.map(([name, n]) => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(name)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(n / maxCity * 100, 6)}%;background:var(--kpi-purple)">${n}</div></div></div>`).join('') : '<div class="kpi-sub">No destination data in range.</div>'}
    </div></div>

    ${renderHoldReasons(f)}
    ${renderOperators(f)}
  </div>`;
}

// Why orders waited before picking. The order feed has no such field — this comes from
// the On Hold events in each order's log, which carry the reason as a note.
function renderHoldReasons(f) {
    const held = f.filter(o => o._holdH != null && o._holdH > 0);
    if (!held.length) return '';

    const byReason = {};
    held.forEach(o => {
        const r = o._holdReason || 'Not stated';
        byReason[r] = byReason[r] || { n: 0, hours: [] };
        byReason[r].n++;
        byReason[r].hours.push(o._holdH);
    });
    const rows = Object.entries(byReason)
        .map(([reason, v]) => ({ reason, n: v.n, med: med(v.hours), total: v.hours.reduce((s, h) => s + h, 0) }))
        .sort((a, b) => b.total - a.total);
    const maxTotal = Math.max(...rows.map(r => r.total), 1);

    return `
    <div class="kpi-card kpi-c2"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-warn)"></div>Why Orders Waited Before Picking</div>
      <div class="kpi-bars">
        ${rows.map(r => `<div class="kpi-brow"><div class="kpi-blbl">${escapeHtml(r.reason)}</div><div class="kpi-btrack"><div class="kpi-bfill" style="width:${Math.max(r.total / maxTotal * 100, 6)}%;background:var(--kpi-warn)">${r.n} orders <span class="sm">median ${fH(r.med)}</span></div></div></div>`).join('')}
      </div>
      <div class="kpi-sub" style="margin-top:10px">${held.length} of ${f.length} orders in range were held. Hours are wall-clock from the first hold to whatever released it.</div>
    </div>`;
}

// Orders picked and packed per person, from the order log's event actor. Integrations
// (System, Custom, Shopify, the tenant integration) are not people and are excluded.
function renderOperators(f) {
    const ops = {};
    const bump = (name, role, speed) => {
        if (!name) return;
        const o = ops[name] = ops[name] || { picked: 0, packed: 0, speeds: [] };
        o[role]++;
        if (speed != null && speed >= 0) o.speeds.push(speed);
    };
    f.forEach(o => {
        bump(o._picker, 'picked', null);
        bump(o._packer, 'packed', o._wPack);
    });

    const rows = Object.entries(ops)
        .map(([name, v]) => ({ name, picked: v.picked, packed: v.packed, avg: avg(v.speeds), med: med(v.speeds) }))
        .filter(r => r.picked || r.packed)
        .sort((a, b) => (b.picked + b.packed) - (a.picked + a.packed));

    if (!rows.length) return '';
    const totalPacked = rows.reduce((s, r) => s + r.packed, 0);

    return `
    <div class="kpi-card kpi-c4"><div class="kpi-card-t"><div class="tdot" style="background:var(--kpi-blue)"></div>Operator Performance — Picking &amp; Packing</div>
      <div class="table-container"><table>
        <thead><tr><th>Operator</th><th>Orders Picked</th><th>Orders Packed</th><th>% of All Packed</th><th>Avg Pick → Pack</th><th>Median</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><b>${escapeHtml(r.name)}</b></td>
          <td class="num">${r.picked}</td>
          <td class="num">${r.packed}</td>
          <td class="num">${totalPacked ? (r.packed / totalPacked * 100).toFixed(1) : '0.0'}%</td>
          <td class="num" style="color:${r.avg < 0.25 ? 'var(--kpi-good)' : r.avg < 1 ? 'var(--kpi-warn)' : 'var(--kpi-bad)'}">${fH(r.avg)}</td>
          <td class="num">${fH(r.med)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="kpi-sub" style="margin-top:10px">Pick → Pack is working hours between the two events, Friday excluded. Automated actors are not listed.</div>
    </div>`;
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportBreaches() {
    const del = getFiltered().filter(o => o._delivered);
    let br = del.filter(o => o._breach);
    if (BREACH_MERCHANT !== 'All') br = br.filter(o => o._sel === BREACH_MERCHANT);
    br.sort((a, b) => (b._e2e || 0) - (a._e2e || 0));

    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const head = ['Ref', 'Merchant', 'Created At', 'Created Day', 'After 10pm', 'SLA Deadline', 'Picked At', 'Packed At', 'Picker', 'Packer', 'Held Hours', 'Hold Reason', 'Shipped At', 'Delivered At', 'Courier', 'E2E Hours', 'Overshoot Hours'];
    const lines = [head.map(esc).join(',')];
    br.forEach(o => {
        const ov = o._dl && o._sla ? ((o._dl - o._sla) / 3600000).toFixed(1) : '';
        lines.push([o._ref, o._sel, fDtT(o._cr), o._cr ? dN(o._cr) : '', o._late ? 'Yes' : 'No',
        fDtT(o._sla), fDtT(o._pk), fDtT(o._pa), o._picker || '', o._packer || '', o._holdH != null ? o._holdH.toFixed(1) : '', o._holdReason || '', fDtT(o._sh), fDtT(o._dl), o._courier,
        o._e2e != null ? o._e2e.toFixed(1) : '', ov].map(esc).join(','));
    });

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `breached-orders-${dateKeyOf(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

const today = dateKeyOf(new Date());
const defaultFrom = addDays(today, -DEFAULT_WINDOW_DAYS);

el('kpi-df-from')?.addEventListener('change', onDateChange);
el('kpi-df-to')?.addEventListener('change', onDateChange);
// Refresh asks the server to pull the last two days from Omniful. The page is already
// subscribed, so the new rows arrive over the listener — there is nothing to re-read here.
el('kpi-refresh')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('cod_refreshing', 'Refreshing…');
    setStatus('load', t('kpi_status_loading', 'Loading…'));

    try {
        const r = await fetch('/refreshCODNow', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        const d = (await r.json().catch(() => ({}))).data || {};
        if (d.skipped) {
            setStatus('live', `${t('cod_refresh_soon', 'Just refreshed — try again in')} ${d.retryInSeconds}s`);
            setTimeout(markLive, 3000);
        } else if (d.error) {
            setStatus('err', d.reason === 'omniful_auth'
                ? t('cod_refresh_auth', 'Omniful rejected the credentials. The token needs rotating.')
                : `${t('cod_refresh_failed', 'Refresh failed')}: ${d.error}`);
        } else {
            markLive();
        }
    } catch (err) {
        setStatus('err', `${t('cod_refresh_failed', 'Refresh failed')}: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
});
el('kpi-df-reset')?.addEventListener('click', () => {
    el('kpi-df-from').value = defaultFrom;
    el('kpi-df-to').value = today;
    loadStages().then(() => boot(defaultFrom, today));
});

boot(defaultFrom, today);
