// Shared machinery for the COD Reconciliation and COD Operations pages: data loading,
// the derived order model, the filter scope, the indicator tiles and the bar-chart
// drawer. Anything specific to one page lives in that page's own module.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    sanitizeKey,
    escapeHtml,
    flattenObject,
    getGroupVal,
    isGroupLocked,
    checkNearestIntegerMatch,
    extractOrderLabelAndTagList,
    extractOrderTotalDue,
    extractShippingPartner,
    extractStoreName,
    isJafarShopStore,
    hasRootsOrGoldenDeliveryCustomLabel,
    extractOrderDeliveredDate,
    extractOrderCreatedDate,
    extractOrderShippedDate,
    isDeliveredOrder,
    isOnHoldOrder,
    isCancelledOrder,
    isClosedOrder,
    isAwaitingShipment,
    normalizedStatus,
    dateKeyOf,
    addDays,
    daysBetween,
    formatDisplayDate,
    dayNameOf
} from "/js/cod_shared.js?v=1.1.0";

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

export const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// Thresholds, exactly as specified by ops.
export const THRESHOLDS = {
    count: { good: 5, warning: 10 },          // <=5 green, 6-10 orange, >10 red
    reconDays: { good: 3, warning: 7 }        // <=3 green, 4-7 orange, >7 red
};

// The CLA is one calendar day, not 24 hours: an order created on Tuesday is due
// delivered on Wednesday. It is only in breach once Thursday starts, so the breach
// test is a day difference of 2 or more.
export const CLA_DAYS = 1;

// Orders created longer ago than this are left out of the CLA count. Their stored
// status comes from a snapshot that has not been refreshed since, so "not delivered"
// cannot be trusted: resyncing 2026-09-04..18 turned ~119 apparently-stuck orders into
// delivered ones. Counting them made the tile read red on stale data rather than on
// late deliveries. Raise this only as far back as the backfill actually reaches — the
// sync pages 1,500 orders per seller, so roughly three weeks.
export const CLA_MAX_AGE_DAYS = 14;

// Default span the indicators are evaluated over; the filter accepts any day count.
export const DEFAULT_WINDOW_DAYS = 30;

// Sellers kept out of the two operational indicators (past CLA, on hold). Jafar Shop
// runs its own fulfilment, so its lateness is not Roots' to chase; Test Seller is not a
// real account. This deliberately does NOT touch the reconciliation indicator, the
// chart or the movement panel — those keep the COD rules the COD Orders page uses, so
// the money on both pages still agrees.
const EXCLUDED_SELLERS = ['jafar shop', 'test seller'];

export function isExcludedSeller(order) {
    const store = (order.store || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!store) return false;
    return EXCLUDED_SELLERS.some(name => store === name || store.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
}

export function gradeByThreshold(value, bands) {
    if (value <= bands.good) return 'good';
    if (value <= bands.warning) return 'warning';
    return 'critical';
}

export const STATE_WORD = {
    good: () => t("codh_state_good", "Healthy"),
    warning: () => t("codh_state_warning", "Needs attention"),
    critical: () => t("codh_state_critical", "Critical"),
    unknown: () => t("codh_state_unknown", "No data")
};

export const STATE_GLYPH = { good: '✓', warning: '!', critical: '✕', unknown: '–' };

// ── State ──

let ordersByDate = {};
let reconData = {};
let enrichedOrders = [];
let ordersLoaded = false;
let reconLoaded = false;

export const getOrders = () => enrichedOrders;
export const getRecon = () => reconData;

// Filter slice shared by every page that imports this module. Pages mutate these
// fields directly; the scope predicates below always read the current values.
export const scope = {
    tag: 'all',
    seller: 'all',
    windowDays: DEFAULT_WINDOW_DAYS
};

export const el = (id) => document.getElementById(id);

// ── Derived order model ──

// Orders are stored under their delivered date once delivered, and under their created
// date before that — so an order that shipped later still has a stale copy sitting in
// its created-date bucket with an out-of-date status. Roughly a third of stored orders
// are duplicated this way. Keeping only the most recently updated copy per order id is
// what stops a long-since-delivered order from being counted as stuck forever.
function dedupeLatestPerOrder() {
    const byId = new Map();

    Object.keys(ordersByDate).forEach(dateKey => {
        const dayMap = ordersByDate[dateKey] || {};
        Object.keys(dayMap).forEach(orderId => {
            const order = dayMap[orderId];
            if (!order || typeof order !== 'object') return;

            const id = String(order.order_id || order.order_alias || order.id || orderId);
            const stamp = Date.parse(order.updated_at || '') || 0;
            const existing = byId.get(id);

            if (!existing) {
                byId.set(id, { order, dateKey, stamp });
                return;
            }

            // Later update wins; if neither carries a usable stamp, a delivered copy
            // beats a pre-delivery one, and failing that the later bucket wins.
            if (stamp !== existing.stamp) {
                if (stamp > existing.stamp) byId.set(id, { order, dateKey, stamp });
                return;
            }

            const thisDelivered = (order.status_code || order.display_status || '').toString().toLowerCase().trim() === 'delivered';
            const thatDelivered = (existing.order.status_code || existing.order.display_status || '').toString().toLowerCase().trim() === 'delivered';
            if (thisDelivered !== thatDelivered) {
                if (thisDelivered) byId.set(id, { order, dateKey, stamp });
                return;
            }

            if (dateKey > existing.dateKey) byId.set(id, { order, dateKey, stamp });
        });
    });

    return Array.from(byId.values());
}

// Flattening and date parsing are the expensive part, so each order is enriched once
// and every indicator reads the cheap derived fields.
export function enrichOrders() {
    const list = [];
    dedupeLatestPerOrder().forEach(({ order, dateKey }) => {
        const orderId = String(order.order_id || order.order_alias || order.id || '');
        order._dateKey = dateKey;

        const flat = flattenObject(order);
        const delivered = extractOrderDeliveredDate(order, flat);
        const created = extractOrderCreatedDate(order, flat);
        const shipped = extractOrderShippedDate(order, flat);

        list.push({
            id: orderId,
            raw: order,
            bucketKey: dateKey,
            orderId: orderId,
            status: normalizedStatus(order, flat),
            displayStatus: order.display_status || order.status_code || '',
            store: extractStoreName(order, flat),
            courier: extractShippingPartner(order, flat),
            due: extractOrderTotalDue(order, flat),
            labels: extractOrderLabelAndTagList(order, flat),
            isDelivered: isDeliveredOrder(order, flat),
            isOnHold: isOnHoldOrder(order, flat),
            isCancelled: isCancelledOrder(order, flat),
            isClosed: isClosedOrder(order, flat),
            awaitingShipment: isAwaitingShipment(order, flat),
            jafarExcluded: isJafarShopStore(order, flat) && !hasRootsOrGoldenDeliveryCustomLabel(order, flat),
            deliveredKey: delivered ? delivered.dateKey : null,
            createdKey: created ? created.dateKey : null,
            shippedKey: shipped ? shipped.dateKey : null
        });
    });
    enrichedOrders = list;
}

export function matchesTag(order) {
    if (scope.tag === 'all') return true;
    return order.labels.some(l => l.toLowerCase() === scope.tag.toLowerCase());
}

export function matchesSeller(order) {
    if (scope.seller === 'all') return true;
    return (order.store || '').toLowerCase() === scope.seller.toLowerCase();
}

// Every indicator and chart scopes to the same slice.
export function inScope(order) {
    return matchesTag(order) && matchesSeller(order);
}

export function windowStartKey() {
    if (!scope.windowDays) return null;
    return addDays(dateKeyOf(new Date()), -scope.windowDays);
}

export function inWindow(dateKey) {
    if (!dateKey) return false;
    const start = windowStartKey();
    if (!start) return true;
    return dateKey >= start;
}

// ── Reconciliation lookup ──

// Groups are stored under "<delivered date>____<courier>", URI-encoded.
export function reconRecordFor(dateKey, courier) {
    const groupKey = `${dateKey}____${courier}`;
    return reconData[sanitizeKey(groupKey)] || reconData[groupKey] || null;
}

export function groupFeeOf(record) {
    if (!record || typeof record !== 'object') return 0;
    const fee = parseFloat(record.codFee);
    return isNaN(fee) ? 0 : fee;
}

// Expected COD is the collected total minus the per-order courier fee — the same
// arithmetic the COD Orders summary table shows.
export function buildCourierGroups(dateKey) {
    const groups = {};

    enrichedOrders.forEach(o => {
        if (!o.isDelivered || o.deliveredKey !== dateKey) return;
        if (o.jafarExcluded) return;
        if (!inScope(o)) return;

        if (!groups[o.courier]) {
            groups[o.courier] = { courier: o.courier, count: 0, totalDue: 0, orders: [] };
        }
        const g = groups[o.courier];
        g.count++;
        g.totalDue += o.due;
        g.orders.push(o);
    });

    return Object.values(groups).map(g => {
        g.label = g.courier;
        const record = reconRecordFor(dateKey, g.courier);
        const fee = groupFeeOf(record);
        const expected = g.totalDue - (fee * g.count);
        const receivedRaw = getGroupVal(record);
        const hasReceived = receivedRaw !== '' && receivedRaw !== null && receivedRaw !== undefined;
        const received = hasReceived ? parseFloat(receivedRaw) : null;

        return {
            ...g,
            fee,
            expected,
            received,
            hasReceived,
            locked: isGroupLocked(record),
            matched: checkNearestIntegerMatch(expected, hasReceived ? received : ''),
            difference: hasReceived ? received - expected : null
        };
    }).sort((a, b) => b.expected - a.expected);
}


// ── Rendering: indicator tiles ──

// ── Rendering: tiles ──

// A tile says one thing: what this measure is, and whether it is green, amber or red.
// Each tile carries its own list: clicking it opens the orders behind that indicator
// in the panel below. The full rule stays in the tooltip so the tile itself is still
// just a lamp, a name and a state word.
export function renderTiles(indicators, openId, onToggle) {
    const host = el('codh-tiles');
    if (!host) return;

    host.innerHTML = indicators.map(ind => {
        const grade = ind.grade;
        const isOpen = openId === ind.id;
        const state = ind.excluded ? t("codh_state_excluded", "Not measured") : STATE_WORD[grade]();
        return `
      <button type="button" class="codh-tile" role="listitem" data-id="${escapeHtml(ind.id)}"
              aria-expanded="${isOpen ? 'true' : 'false'}" title="${escapeHtml(ind.desc)}">
        <span class="codh-lamp ${grade}" aria-hidden="true">${STATE_GLYPH[grade]}</span>
        <span class="codh-tile-body">
          <span class="codh-tile-name">${escapeHtml(ind.name)}</span>
          <span class="codh-tile-state ${grade}">${escapeHtml(state)}</span>
          <span class="codh-tile-cta">${isOpen ? t("codh_hide_list", "Hide list ▲") : t("codh_show_list", "Show list ▼")}</span>
        </span>
      </button>
    `;
    }).join('');

    host.querySelectorAll('.codh-tile').forEach(btn => {
        btn.addEventListener('click', () => onToggle(btn.getAttribute('data-id')));
    });
}

// Shows the rows for whichever tile is currently open, in the panel beneath the tiles.
export function renderDrill(indicators, openId) {
    const wrap = el('codh-drill');
    const head = el('codh-drill-head');
    const body = el('codh-drill-body');
    const title = el('codh-drill-title');
    if (!wrap || !head || !body) return;

    const ind = indicators.find(i => i.id === openId);
    if (!ind) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    if (title) {
        title.textContent = `${ind.name} — ${ind.rows.length} ${ind.kind === 'days' ? t("codh_days", "day(s)") : t("codh_orders", "order(s)")}`;
    }

    if (ind.rows.length === 0) {
        head.innerHTML = '';
        body.innerHTML = `<tr><td class="codh-empty">${ind.excluded
            ? t("codh_excluded_body", "This seller is excluded from this indicator.")
            : t("codh_nothing", "Nothing to show — this indicator is clear.")}</td></tr>`;
        return;
    }

    if (ind.kind === 'days') {
        head.innerHTML = `<tr>
      <th>${t("codh_th_date", "Delivery Date")}</th>
      <th>${t("codh_th_day", "Day")}</th>
      <th>${t("codh_th_courier", "Courier")}</th>
      <th style="text-align:right;">${t("codh_th_expected", "COD Expected (JOD)")}</th>
      <th style="text-align:right;">${t("codh_th_received", "COD Received (JOD)")}</th>
      <th style="text-align:center;">${t("codh_th_status", "Status")}</th>
    </tr>`;

        body.innerHTML = ind.rows.map(day => day.groups.map((g, idx) => `
      <tr>
        <td>${idx === 0 ? formatDisplayDate(day.dateKey) : ''}</td>
        <td>${idx === 0 ? dayNameOf(day.dateKey) : ''}</td>
        <td>${escapeHtml(g.courier)}</td>
        <td style="text-align:right; font-variant-numeric: tabular-nums;">${g.expected.toFixed(2)}</td>
        <td style="text-align:right; font-variant-numeric: tabular-nums;">${g.hasReceived ? g.received.toFixed(2) : '—'}</td>
        <td style="text-align:center;">${g.hasReceived
            ? `<span style="color: var(--codh-critical); font-weight:700;">✕ ${t("codh_mismatch", "Mismatch")}</span>`
            : `<span style="color: var(--codh-muted); font-weight:700;">– ${t("codh_pending", "Not entered")}</span>`}</td>
      </tr>
    `).join('')).join('');
        return;
    }

    head.innerHTML = `<tr>
    <th>${t("codh_th_order", "Order ID")}</th>
    <th>${t("codh_th_store", "Store")}</th>
    <th>${t("codh_th_created", "Created")}</th>
    <th>${t("codh_th_age", "Days Open")}</th>
    <th>${t("codh_th_courier", "Courier")}</th>
    <th>${t("codh_th_status", "Status")}</th>
    <th style="text-align:right;">${t("codh_th_due", "Total Due (JOD)")}</th>
  </tr>`;

    const today = dateKeyOf(new Date());
    const sorted = [...ind.rows].sort((a, b) => (a.createdKey || '').localeCompare(b.createdKey || ''));

    body.innerHTML = sorted.map(o => `
    <tr>
      <td>${escapeHtml(o.orderId)}</td>
      <td>${escapeHtml(o.store)}</td>
      <td>${o.createdKey ? formatDisplayDate(o.createdKey) : '—'}</td>
      <td style="font-variant-numeric: tabular-nums;">${o.createdKey ? daysBetween(o.createdKey, today) : '—'}</td>
      <td>${escapeHtml(o.courier)}</td>
      <td>${escapeHtml(o.displayStatus || o.status)}</td>
      <td style="text-align:right; font-variant-numeric: tabular-nums;">${o.due.toFixed(2)}</td>
    </tr>
  `).join('');
}

// ── Chart primitives ──

export function buildBarsSvg(rows, showReceived, availableWidth) {
    const width = Math.max(320, availableWidth || 720);
    const labelGutter = width < 520 ? 96 : 150;
    const valueGutter = 104;
    const padTop = 8;
    const padBottom = 30;
    const barH = showReceived ? 13 : 17;
    const barGap = 2;                       // 2px surface gap between adjacent bars
    const groupH = showReceived ? (barH * 2 + barGap) : barH;
    const groupGap = 20;
    const plotW = Math.max(60, width - labelGutter - valueGutter);
    const height = padTop + rows.length * (groupH + groupGap) + padBottom;

    const maxVal = rows.reduce((m, r) => Math.max(m, r.expected || 0, r.hasReceived ? r.received : 0), 0) || 1;
    const niceMax = niceCeiling(maxVal);
    const x = (v) => (Math.max(0, v) / niceMax) * plotW;

    const ticks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="${escapeHtml(showReceived ? 'COD expected versus received' : 'COD value')}">`;

    // Recessive solid hairline grid
    ticks.forEach(tv => {
        const gx = labelGutter + x(tv);
        svg += `<line x1="${gx}" y1="${padTop}" x2="${gx}" y2="${height - padBottom}" stroke="var(--codh-grid)" stroke-width="1" />`;
        svg += `<text x="${gx}" y="${height - padBottom + 16}" text-anchor="middle" font-size="10"
      fill="var(--codh-muted)" style="font-variant-numeric: tabular-nums;">${formatAxis(tv)}</text>`;
    });

    // Baseline
    svg += `<line x1="${labelGutter}" y1="${padTop}" x2="${labelGutter}" y2="${height - padBottom}" stroke="var(--codh-baseline)" stroke-width="1" />`;

    rows.forEach((r, i) => {
        const gy = padTop + i * (groupH + groupGap);

        svg += `<text x="${labelGutter - 10}" y="${gy + groupH / 2 + 4}" text-anchor="end" font-size="12"
      fill="var(--codh-ink)" font-weight="600">${escapeHtml(truncate(r.label, width < 520 ? 12 : 20))}</text>`;

        svg += bar(labelGutter, gy, x(r.expected), barH, 'var(--codh-expected)', r.expected, i, 'expected');

        if (showReceived) {
            const ry = gy + barH + barGap;
            if (r.hasReceived) {
                svg += bar(labelGutter, ry, x(r.received), barH, 'var(--codh-received)', r.received, i, 'received');
            } else {
                svg += `<text x="${labelGutter + 6}" y="${ry + barH - 2}" font-size="10" fill="var(--codh-muted)">${t("codh_pending", "Not entered")}</text>`;
            }
        }
    });

    return svg + `</svg>`;
}

// Rounded 4px data-end anchored to the baseline; the value sits outside the bar end so
// it can never be clipped by a short bar.
export function bar(x0, y, w, h, fill, value, idx, series) {
    const r = Math.min(4, Math.max(0, w));
    const drawW = Math.max(w, 1);
    const path = `M ${x0} ${y} H ${x0 + drawW - r} Q ${x0 + drawW} ${y} ${x0 + drawW} ${y + r}
    V ${y + h - r} Q ${x0 + drawW} ${y + h} ${x0 + drawW - r} ${y + h} H ${x0} Z`;

    return `<path d="${path}" fill="${fill}" data-idx="${idx}" data-series="${series}" />`
        + `<text x="${x0 + drawW + 8}" y="${y + h - 2}" font-size="11" fill="var(--codh-ink-2)"
       style="font-variant-numeric: tabular-nums;">${value.toFixed(2)}</text>`;
}

export function niceCeiling(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
}

export function formatAxis(v) {
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(v));
}

export function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function attachChartHover(host, rows, showReceived, tip) {
    if (!tip) return;

    host.querySelectorAll('path[data-idx]').forEach(pathEl => {
        const show = (evt) => {
            const r = rows[parseInt(pathEl.getAttribute('data-idx'), 10)];
            if (!r) return;
            tip.innerHTML = `
        <div class="codh-tooltip-name">${escapeHtml(r.label)}</div>
        <div class="codh-tooltip-row">
          <span class="codh-swatch" style="background: var(--codh-expected);"></span>
          <span>${t("codh_legend_expected", "COD expected")}</span>
          <span class="codh-tooltip-val">${r.expected.toFixed(2)}</span>
        </div>
        ${showReceived ? `<div class="codh-tooltip-row">
          <span class="codh-swatch" style="background: var(--codh-received);"></span>
          <span>${t("codh_legend_received", "COD received")}</span>
          <span class="codh-tooltip-val">${r.hasReceived ? r.received.toFixed(2) : '—'}</span>
        </div>` : ''}
        <div class="codh-tooltip-row">
          <span style="width:11px;"></span>
          <span>${t("codh_th_orders", "Orders")}</span>
          <span class="codh-tooltip-val">${r.count}</span>
        </div>
      `;
            tip.hidden = false;

            const wrapRect = host.parentElement.getBoundingClientRect();
            const px = (evt.clientX !== undefined ? evt.clientX : wrapRect.left + wrapRect.width / 2) - wrapRect.left;
            const py = (evt.clientY !== undefined ? evt.clientY : wrapRect.top) - wrapRect.top;
            tip.style.left = Math.min(Math.max(8, px + 14), Math.max(8, wrapRect.width - tip.offsetWidth - 8)) + 'px';
            tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + 'px';
        };

        pathEl.addEventListener('mouseenter', show);
        pathEl.addEventListener('mousemove', show);
        pathEl.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
}


// ── Filter helpers ──

export function fillSelect(sel, values, allLabel) {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="all">${allLabel}</option>`;
    Array.from(values).sort((a, b) => a.localeCompare(b)).forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
    if (prev && (prev === 'all' || values.has(prev))) sel.value = prev;
}

export function populateFilterOptions() {
    const tags = new Set();
    const sellers = new Set();
    enrichedOrders.forEach(o => {
        o.labels.forEach(l => { if (l) tags.add(l); });
        if (o.store) sellers.add(o.store);
    });

    fillSelect(el('codh-tag'), tags, t("codh_tag_all", "All tags"));
    fillSelect(el('codh-seller'), sellers, t("codh_seller_all", "All sellers"));
}

export function defaultBusinessDay() {
    // "Yesterday", skipping Friday — the same day the nightly fetch treats as the last
    // collection day.
    let key = addDays(dateKeyOf(new Date()), -1);
    if (dayNameOf(key) === 'Friday') key = addDays(key, -1);
    return key;
}

// ── Data ──

// Both pages need the same two nodes. `onReady` fires once each has arrived, and
// again on every subsequent change.
export function subscribeToData(onReady, onError) {
    onValue(ref(db, 'cod_daily_orders'), (snap) => {
        ordersByDate = snap.val() || {};
        enrichOrders();
        ordersLoaded = true;
        if (reconLoaded) onReady();
    }, (error) => {
        console.error('Failed to load COD orders', error);
        if (onError) onError(error);
    });

    onValue(ref(db, 'cod_reconciliation'), (snap) => {
        reconData = snap.val() || {};
        reconLoaded = true;
        if (ordersLoaded) onReady();
    }, (error) => {
        console.error('Failed to load reconciliation data', error);
        reconLoaded = true;
        if (ordersLoaded) onReady();
    });
}
