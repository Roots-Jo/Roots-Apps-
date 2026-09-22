// COD Operations page: fulfilment health — orders past the delivery CLA and orders
// stuck on hold, with the shipped-to-delivered movement behind them.
// The cash side lives on the COD Reconciliation page.

import {
    t, el, scope, getOrders, subscribeToData, THRESHOLDS, CLA_DAYS, CLA_MAX_AGE_DAYS, DEFAULT_WINDOW_DAYS, gradeByThreshold, isExcludedSeller, inScope, inWindow, renderTiles, renderDrill, buildBarsSvg, attachChartHover, populateFilterOptions, defaultBusinessDay, wireRefreshButton
} from "/js/cod_core.js?v=1.0.0";
import {
    escapeHtml, dateKeyOf, daysBetween, formatDisplayDate, dayNameOf
} from "/js/cod_shared.js?v=1.3.0";

let filterDate = '';
let openIndicator = null;

// ── Indicators ──

function computeIndicators() {
    const today = dateKeyOf(new Date());

    // Past CLA: an order created on day D is due delivered on D+1, so it is in breach
    // once D+2 has started and it still has not been delivered. Calendar days, not
    // elapsed hours — an order placed at 23:50 still has all of the next day.
    //
    // Only orders late *right now* count: one delivered on D+3 was late, but it is no
    // longer a thing to chase. Orders older than CLA_MAX_AGE_DAYS are left out because
    // their stored status has not been refreshed and cannot be trusted. On-hold orders
    // have their own indicator, so counting them here would light up two tiles.
    const pastCla = getOrders().filter(o => {
        if (o.isClosed || o.isOnHold) return false;
        if (isExcludedSeller(o)) return false;
        if (!o.createdKey || !inWindow(o.createdKey)) return false;
        if (!inScope(o)) return false;
        const age = daysBetween(o.createdKey, today);
        return age > CLA_DAYS && age <= CLA_MAX_AGE_DAYS;
    });

    const onHold = getOrders().filter(o => {
        if (!o.isOnHold) return false;
        if (isExcludedSeller(o)) return false;
        const key = o.createdKey || o.bucketKey;
        if (!inWindow(key)) return false;
        return inScope(o);
    });

    // Filtering to an excluded seller would otherwise show a clean green zero, which
    // reads as "nothing late" rather than "not measured here".
    const sellerIsExcluded = scope.seller !== 'all' && isExcludedSeller({ store: scope.seller });
    const excludedNote = ` ${t("codh_excluded_note", "Jafar Shop and Test Seller are not counted.")}`;

    return [
        {
            id: 'cla',
            name: t("codh_ind_cla", "Orders past delivery CLA"),
            desc: t("codh_ind_cla_desc", "Past the next-day deadline and still not delivered, within the last 14 days. Excludes orders on hold.") + excludedNote,
            grade: sellerIsExcluded ? 'unknown' : gradeByThreshold(pastCla.length, THRESHOLDS.count),
            rows: sellerIsExcluded ? [] : pastCla,
            excluded: sellerIsExcluded,
            kind: 'orders'
        },
        {
            id: 'hold',
            name: t("codh_ind_hold", "Orders on hold"),
            desc: t("codh_ind_hold_desc", "Stuck in shipping and not moving.") + excludedNote,
            grade: sellerIsExcluded ? 'unknown' : gradeByThreshold(onHold.length, THRESHOLDS.count),
            rows: sellerIsExcluded ? [] : onHold,
            excluded: sellerIsExcluded,
            kind: 'orders'
        }
    ];
}

// ── Rendering: Shipped → Delivered movement ──

function renderMovement() {
    const host = el('codh-movement');
    const badge = el('codh-movement-day');
    if (!host) return;

    if (badge) badge.textContent = `${formatDisplayDate(filterDate)} · ${dayNameOf(filterDate)}`;

    const shippedThatDay = getOrders().filter(o => o.shippedKey === filterDate && inScope(o));
    const deliveredThatDay = getOrders().filter(o => o.isDelivered && o.deliveredKey === filterDate && inScope(o));

    // Of the orders that shipped that day, how many have since been delivered — the
    // Shipped → Delivered movement itself.
    const shippedThenDelivered = shippedThatDay.filter(o => o.isDelivered);
    const stillInTransit = shippedThatDay.filter(o => !o.isDelivered && !o.isCancelled);
    const conversion = shippedThatDay.length > 0
        ? Math.round((shippedThenDelivered.length / shippedThatDay.length) * 100)
        : null;

    const deliveredValue = deliveredThatDay.reduce((sum, o) => sum + o.due, 0);

    // Breakdown of delivered items by courier.
    const byCourier = {};
    deliveredThatDay.forEach(o => {
        if (!byCourier[o.courier]) byCourier[o.courier] = { courier: o.courier, count: 0, value: 0 };
        byCourier[o.courier].count++;
        byCourier[o.courier].value += o.due;
    });
    const breakdown = Object.values(byCourier).sort((a, b) => b.count - a.count);
    const maxCount = breakdown.reduce((m, b) => Math.max(m, b.count), 0);

    host.innerHTML = `
    <div class="codh-stat">
      <div class="codh-stat-label">${t("codh_m_shipped", "Shipped that day")}</div>
      <div class="codh-stat-value">${shippedThatDay.length}</div>
      <div class="codh-stat-sub">${stillInTransit.length} ${t("codh_m_transit", "still in transit")}</div>
    </div>
    <div class="codh-stat">
      <div class="codh-stat-label">${t("codh_m_delivered", "Delivered that day")}</div>
      <div class="codh-stat-value">${deliveredThatDay.length}</div>
      <div class="codh-stat-sub">${deliveredValue.toFixed(2)} JOD ${t("codh_m_collectible", "collectible")}</div>
    </div>
    <div class="codh-stat">
      <div class="codh-stat-label">${t("codh_m_conversion", "Shipped → Delivered")}</div>
      <div class="codh-stat-value">${conversion === null ? '—' : conversion + '%'}</div>
      <div class="codh-stat-sub">${shippedThenDelivered.length} ${t("codh_m_of", "of")} ${shippedThatDay.length} ${t("codh_m_reached", "reached the customer")}</div>
    </div>
    <div class="codh-breakdown">
      <div class="codh-stat-label" style="margin-bottom: 10px;">${t("codh_m_breakdown", "Delivered items by courier")}</div>
      ${breakdown.length === 0
            ? `<div class="codh-empty">${t("codh_m_none", "No deliveries recorded for this day.")}</div>`
            : breakdown.map(b => `
          <div class="codh-breakdown-row">
            <span class="codh-breakdown-name">${escapeHtml(b.courier)}</span>
            <span class="codh-breakdown-bar">
              <span class="codh-breakdown-fill" style="width: ${maxCount ? Math.max(3, (b.count / maxCount) * 100) : 0}%"></span>
            </span>
            <span class="codh-breakdown-val">${b.count} ${t("codh_m_items", "items")} · ${b.value.toFixed(2)} JOD</span>
          </div>
        `).join('')}
    </div>
  `;
}

// ── Charts: where the late and held orders sit ──

// Counts per seller, drawn with the same bar geometry as the COD charts. `expected`
// is the count here rather than a cash amount — the drawer only cares about the number.
function countsBySeller(orders) {
    const bySeller = {};
    orders.forEach(o => {
        const name = o.store || '—';
        bySeller[name] = (bySeller[name] || 0) + 1;
    });
    return Object.entries(bySeller)
        .map(([label, count]) => ({ label, count, expected: count, received: null, hasReceived: false }))
        .sort((a, b) => b.expected - a.expected);
}

function renderSellerChart(hostId, tooltipId, emptyId, rows) {
    const host = el(hostId);
    if (!host) return;

    if (rows.length === 0) {
        host.innerHTML = `<div class="codh-empty">${t(emptyId, "Nothing to show — this indicator is clear.")}</div>`;
        return;
    }

    host.innerHTML = buildBarsSvg(rows, false, host.parentElement ? host.parentElement.clientWidth : 720);
    attachChartHover(host, rows, false, el(tooltipId));
}

function renderCharts(indicators) {
    const cla = indicators.find(i => i.id === 'cla');
    const hold = indicators.find(i => i.id === 'hold');

    const claCap = el('codh-cla-figcaption');
    if (claCap) claCap.textContent = t("codh_cla_chart_cap", "Orders past the delivery CLA, by seller.");
    const holdCap = el('codh-hold-figcaption');
    if (holdCap) holdCap.textContent = t("codh_hold_chart_cap", "Orders currently on hold, by seller.");

    renderSellerChart('codh-cla-chart', 'codh-cla-tooltip', 'codh_nothing', countsBySeller(cla ? cla.rows : []));
    renderSellerChart('codh-hold-chart', 'codh-hold-tooltip', 'codh_nothing', countsBySeller(hold ? hold.rows : []));
}

// ── Filters ──

function initFilters() {
    const dateInp = el('codh-date');
    const tagSel = el('codh-tag');
    const sellerSel = el('codh-seller');
    const winSel = el('codh-window');

    if (dateInp && !dateInp.value) {
        filterDate = defaultBusinessDay();
        dateInp.value = filterDate;
    }

    dateInp?.addEventListener('change', (e) => {
        filterDate = e.target.value || defaultBusinessDay();
        render();
    });

    tagSel?.addEventListener('change', (e) => { scope.tag = e.target.value; render(); });
    sellerSel?.addEventListener('change', (e) => { scope.seller = e.target.value; render(); });

    const applyWindow = (e) => {
        const raw = parseInt(e.target.value, 10);
        scope.windowDays = (!isNaN(raw) && raw > 0) ? Math.min(raw, 365) : DEFAULT_WINDOW_DAYS;
        render();
    };
    winSel?.addEventListener('change', applyWindow);
    winSel?.addEventListener('input', applyWindow);

    wireRefreshButton('codh-refresh', 'codh-refresh-note');

    el('codh-reset')?.addEventListener('click', () => {
        filterDate = defaultBusinessDay();
        scope.tag = 'all';
        scope.seller = 'all';
        scope.windowDays = DEFAULT_WINDOW_DAYS;
        openIndicator = null;
        if (dateInp) dateInp.value = filterDate;
        if (tagSel) tagSel.value = 'all';
        if (sellerSel) sellerSel.value = 'all';
        if (winSel) winSel.value = String(DEFAULT_WINDOW_DAYS);
        render();
    });

    el('codh-drill-close')?.addEventListener('click', () => { openIndicator = null; render(); });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderCharts(computeIndicators()), 150);
    });
}

// ── Orchestration ──

function render() {
    const indicators = computeIndicators();
    renderTiles(indicators, openIndicator, (id) => {
        openIndicator = openIndicator === id ? null : id;
        render();
    });
    renderDrill(indicators, openIndicator);
    renderMovement();
    renderCharts(indicators);

    const asOf = el('codh-asof');
    if (asOf) {
        asOf.textContent = `${t("codh_asof", "Evaluated over")} ${t("codh_asof_window", "last")} ${scope.windowDays} ${t("codh_asof_days", "days")}`;
    }

    const note = el('codh-freshness-note');
    if (note) {
        note.textContent = t("codh_freshness",
            "Statuses come from the nightly fetch and are only as current as the last sync for each date. An order that has moved since its date was last synced will still show its status as of that sync.");
    }

    el('codh-loading')?.classList.add('hidden');
    el('codh-content')?.classList.remove('hidden');
}

filterDate = defaultBusinessDay();
initFilters();

subscribeToData(() => {
    populateFilterOptions();
    render();
}, () => {
    const loading = el('codh-loading');
    if (loading) loading.innerHTML = `<h3>${t("codh_err_load", "Could not load COD orders.")}</h3>`;
});
