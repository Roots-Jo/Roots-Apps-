// COD Reconciliation page: what was collected against what was expected.
// Fulfilment health (CLA, on hold) lives on the Operations page.

import {
    t, el, scope, getOrders, subscribeToData, THRESHOLDS, DEFAULT_WINDOW_DAYS, gradeByThreshold, inScope, inWindow, buildCourierGroups, renderTiles, renderDrill, buildBarsSvg, attachChartHover, populateFilterOptions, defaultBusinessDay, wireRefreshButton
} from "/js/cod_core.js?v=1.0.0";
import {
    escapeHtml, checkNearestIntegerMatch, formatDisplayDate, dayNameOf, isClosedBusinessDay
} from "/js/cod_shared.js?v=1.3.0";

let filterDate = '';
let filterBasis = 'delivered';
let openIndicator = null;
let chartTableVisible = false;


// ── Indicator ──

// A delivered day counts as unreconciled when any courier group on it is unmatched,
// including groups where nothing has been entered yet.
function computeIndicators() {
    const deliveredDates = new Set();
    getOrders().forEach(o => {
        if (o.isDelivered && o.deliveredKey && inWindow(o.deliveredKey) && !o.jafarExcluded && inScope(o)) {
            deliveredDates.add(o.deliveredKey);
        }
    });

    const unreconciledDays = [];
    Array.from(deliveredDates).sort().forEach(dateKey => {
        // Fridays are not a collection day, matching the COD Orders summary.
        if (dayNameOf(dateKey) === 'Friday') return;
        // Today is still collecting, so it is not yet a day that can fail to reconcile.
        if (!isClosedBusinessDay(dateKey)) return;
        const groups = buildCourierGroups(dateKey);
        if (groups.length === 0) return;
        const unmatched = groups.filter(g => !g.matched);
        if (unmatched.length > 0) {
            unreconciledDays.push({ dateKey, groups: unmatched, allGroups: groups });
        }
    });

    return [{
        id: 'recon',
        name: t("codh_ind_recon", "COD reconciliation"),
        desc: t("codh_ind_recon_desc", "Delivery days where collected cash still does not match."),
        grade: gradeByThreshold(unreconciledDays.length, THRESHOLDS.reconDays),
        rows: unreconciledDays,
        kind: 'days'
    }];
}

// ── Charts ──

function buildChartRows() {
    if (filterBasis === 'shipped') {
        const groups = {};
        getOrders().forEach(o => {
            if (o.shippedKey !== filterDate) return;
            if (o.jafarExcluded || !inScope(o)) return;
            if (!groups[o.courier]) groups[o.courier] = { courier: o.courier, label: o.courier, count: 0, expected: 0, received: null, hasReceived: false, matched: false, difference: null };
            groups[o.courier].count++;
            groups[o.courier].expected += o.due;
        });
        return Object.values(groups).sort((a, b) => b.expected - a.expected);
    }

    return buildCourierGroups(filterDate);
}

function renderChart() {
    const host = el('codh-chart');
    const legend = el('codh-legend');
    const caption = el('codh-figcaption');
    const titleEl = el('codh-chart-title');
    if (!host) return;

    const rows = buildChartRows();
    const showReceived = filterBasis === 'delivered';

    if (titleEl) {
        titleEl.textContent = showReceived
            ? t("codh_chart_title_delivered", "COD expected vs received by courier")
            : t("codh_chart_title_shipped", "COD value shipped by courier");
    }

    if (caption) {
        caption.textContent = showReceived
            ? `${t("codh_cap_delivered", "Orders delivered on")} ${formatDisplayDate(filterDate)}. ${t("codh_cap_expected_note", "Expected is the collected total less the per-order courier fee; received is what was entered on the COD Orders page.")}`
            : `${t("codh_cap_shipped", "Orders shipped on")} ${formatDisplayDate(filterDate)}. ${t("codh_cap_shipped_note", "Cash is reconciled against the delivery date, so received is not shown on this basis.")}`;
    }

    if (legend) {
        legend.innerHTML = `
      <span class="codh-legend-item"><span class="codh-swatch" style="background: var(--codh-expected);"></span>${t("codh_legend_expected", "COD expected")}</span>
      ${showReceived ? `<span class="codh-legend-item"><span class="codh-swatch" style="background: var(--codh-received);"></span>${t("codh_legend_received", "COD received")}</span>` : ''}
    `;
    }

    if (rows.length === 0) {
        host.innerHTML = `<div class="codh-empty">${t("codh_chart_empty", "No orders match this day and filter.")}</div>`;
        renderChartTable(rows, showReceived);
        return;
    }

    const width = host.parentElement ? host.parentElement.clientWidth : 720;

    host.innerHTML = buildBarsSvg(rows, showReceived, width);

    attachChartHover(host, rows, showReceived, el('codh-tooltip'));
    renderChartTable(rows, showReceived);
}

// ── Second chart: COD expected vs received per delivery day ──

function buildDailyRows() {
    const dates = new Set();
    getOrders().forEach(o => {
        if (o.isDelivered && o.deliveredKey && inWindow(o.deliveredKey) && !o.jafarExcluded && inScope(o)) {
            // The open day is left off: a half-collected bar beside full ones reads as a
            // shortfall rather than as a day still in progress.
            if (!isClosedBusinessDay(o.deliveredKey)) return;
            dates.add(o.deliveredKey);
        }
    });

    return Array.from(dates).sort().reverse().slice(0, 21).reverse().map(dateKey => {
        const groups = buildCourierGroups(dateKey);
        const expected = groups.reduce((s, g) => s + g.expected, 0);
        const received = groups.reduce((s, g) => s + (g.hasReceived ? g.received : 0), 0);
        const hasReceived = groups.some(g => g.hasReceived);
        return {
            label: `${formatDisplayDate(dateKey).slice(0, 5)} ${dayNameOf(dateKey).slice(0, 3)}`,
            dateKey,
            count: groups.reduce((s, g) => s + g.count, 0),
            expected,
            received: hasReceived ? received : null,
            hasReceived,
            matched: hasReceived && checkNearestIntegerMatch(expected, received),
            difference: hasReceived ? received - expected : null
        };
    });
}

function renderDailyChart() {
    const host = el('codh-daily-chart');
    const legend = el('codh-daily-legend');
    const caption = el('codh-daily-figcaption');
    if (!host) return;

    const rows = buildDailyRows();

    if (caption) {
        caption.textContent = `${t("codh_daily_cap", "Every delivery day in the health window, most recent last. Bars are the whole day across all couriers.")}`;
    }
    if (legend) {
        legend.innerHTML = `
      <span class="codh-legend-item"><span class="codh-swatch" style="background: var(--codh-expected);"></span>${t("codh_legend_expected", "COD expected")}</span>
      <span class="codh-legend-item"><span class="codh-swatch" style="background: var(--codh-received);"></span>${t("codh_legend_received", "COD received")}</span>
    `;
    }

    if (rows.length === 0) {
        host.innerHTML = `<div class="codh-empty">${t("codh_chart_empty", "No orders match this day and filter.")}</div>`;
        return;
    }

    host.innerHTML = buildBarsSvg(rows, true, host.parentElement ? host.parentElement.clientWidth : 720);
    attachChartHover(host, rows, true, el('codh-daily-tooltip'));
}

function renderChartTable(rows, showReceived) {
    const body = el('codh-chart-table-body');
    const foot = el('codh-chart-table-foot');
    if (!body || !foot) return;

    if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="codh-empty">${t("codh_chart_empty", "No orders match this day and filter.")}</td></tr>`;
        foot.innerHTML = '';
        return;
    }

    body.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.courier)}</td>
      <td style="text-align:center; font-variant-numeric: tabular-nums;">${r.count}</td>
      <td style="text-align:right; font-variant-numeric: tabular-nums;">${r.expected.toFixed(2)}</td>
      <td style="text-align:right; font-variant-numeric: tabular-nums;">${showReceived && r.hasReceived ? r.received.toFixed(2) : '—'}</td>
      <td style="text-align:right; font-variant-numeric: tabular-nums;">${showReceived && r.difference !== null ? r.difference.toFixed(2) : '—'}</td>
      <td style="text-align:center;">${!showReceived ? '—' : (r.matched ? '✓' : (r.hasReceived ? '✕' : '–'))}</td>
    </tr>
  `).join('');

    const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
    const totalReceived = rows.reduce((s, r) => s + (r.hasReceived ? r.received : 0), 0);
    const totalOrders = rows.reduce((s, r) => s + r.count, 0);

    foot.innerHTML = `
    <tr>
      <td style="font-weight:700;">${t("codh_total", "Total")}</td>
      <td style="text-align:center; font-weight:700; font-variant-numeric: tabular-nums;">${totalOrders}</td>
      <td style="text-align:right; font-weight:700; font-variant-numeric: tabular-nums;">${totalExpected.toFixed(2)}</td>
      <td style="text-align:right; font-weight:700; font-variant-numeric: tabular-nums;">${showReceived ? totalReceived.toFixed(2) : '—'}</td>
      <td style="text-align:right; font-weight:700; font-variant-numeric: tabular-nums;">${showReceived ? (totalReceived - totalExpected).toFixed(2) : '—'}</td>
      <td></td>
    </tr>
  `;
}

// ── Filters ──

function initFilters() {
    const dateInp = el('codh-date');
    const basisSel = el('codh-basis');
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

    basisSel?.addEventListener('change', (e) => { filterBasis = e.target.value; render(); });
    tagSel?.addEventListener('change', (e) => { scope.tag = e.target.value; render(); });
    sellerSel?.addEventListener('change', (e) => { scope.seller = e.target.value; render(); });

    // Free-entry day count. An empty or nonsense value falls back to the default rather
    // than silently widening the window to everything.
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
        filterBasis = 'delivered';
        scope.tag = 'all';
        scope.seller = 'all';
        scope.windowDays = DEFAULT_WINDOW_DAYS;
        openIndicator = null;
        if (dateInp) dateInp.value = filterDate;
        if (basisSel) basisSel.value = 'delivered';
        if (tagSel) tagSel.value = 'all';
        if (sellerSel) sellerSel.value = 'all';
        if (winSel) winSel.value = String(DEFAULT_WINDOW_DAYS);
        render();
    });

    el('codh-drill-close')?.addEventListener('click', () => { openIndicator = null; render(); });

    el('codh-view-toggle')?.addEventListener('click', () => {
        chartTableVisible = !chartTableVisible;
        applyChartView();
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { renderChart(); renderDailyChart(); }, 150);
    });
}

function applyChartView() {
    const tableWrap = el('codh-chart-table-wrap');
    const figure = el('codh-figure');
    const btn = el('codh-view-toggle');
    if (!tableWrap || !figure || !btn) return;

    tableWrap.classList.toggle('hidden', !chartTableVisible);
    figure.classList.toggle('hidden', chartTableVisible);
    btn.textContent = chartTableVisible ? t("codh_view_chart", "Chart view") : t("codh_view_table", "Table view");
}

// ── Orchestration ──

function render() {
    const indicators = computeIndicators();
    renderTiles(indicators, openIndicator, (id) => {
        openIndicator = openIndicator === id ? null : id;
        render();
    });
    renderDrill(indicators, openIndicator);
    renderChart();
    renderDailyChart();
    applyChartView();

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
