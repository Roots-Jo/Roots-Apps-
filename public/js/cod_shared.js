// Shared COD order-shape helpers.
//
// These are the field-extraction rules the COD dashboard uses to turn a raw Omniful
// order into the numbers finance works with. They live here so the COD Orders page and
// the COD Health page cannot disagree about what an order is worth or who shipped it.
//
// Copied verbatim from roots_cod_dashboard.js — that file still carries its own copies
// and should be switched over to import from here; until it is, any change made here
// must be made there too.

export function sanitizeKey(str) {
    return encodeURIComponent(str || '').replace(/\./g, '%2E');
}

export function escapeHtml(str) {
    if (str === 0) return '0';
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function flattenObject(ob) {
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

// ── Reconciliation record accessors ──

export function getGroupVal(item) {
    if (item === undefined || item === null) return '';
    if (typeof item === 'object') {
        return item.received !== undefined && item.received !== null ? item.received : '';
    }
    return item;
}

export function getGroupRemarks(item) {
    if (item === undefined || item === null) return '';
    if (typeof item === 'object') {
        return item.remarks || '';
    }
    return '';
}

export function isGroupLocked(item) {
    if (item === undefined || item === null) return false;
    if (typeof item === 'object') {
        return item.locked === true;
    }
    return false;
}

// A group counts as reconciled when the received cash lands within 1 JOD of what was
// due — the same tolerance the COD Orders page shows in its Match column.
export function checkNearestIntegerMatch(dueVal, receivedVal) {
    if (receivedVal === '' || receivedVal === null || receivedVal === undefined) return false;
    const due = parseFloat(dueVal);
    const rec = parseFloat(receivedVal);
    if (isNaN(due) || isNaN(rec)) return false;
    return Math.round(due) === Math.round(rec) || Math.abs(due - rec) < 1.0;
}

// ── Label / tag extraction ──

export function extractOrderCustomLabelsList(originalOrder, flat) {
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

export function extractOrderTagsList(originalOrder, flat) {
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

// Orders carry courier identity in custom_labels and almost never in tags, so the tag
// filter has to look at both to be useful.
export function extractOrderLabelAndTagList(originalOrder, flat) {
    const combined = new Set();
    extractOrderCustomLabelsList(originalOrder, flat).forEach(v => combined.add(v));
    extractOrderTagsList(originalOrder, flat).forEach(v => combined.add(v));
    return Array.from(combined);
}

// ── Store ──

export function extractStoreName(originalOrder, flat) {
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

export function isJafarShopStore(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const store = String(originalOrder.store_name || flat.store_name || originalOrder.seller_name || flat.seller_name || originalOrder.seller_code || flat.seller_code || originalOrder.store || flat.store || '').toLowerCase().trim();
    return store.includes('jafar') || store === 'js';
}

export function hasRootsOrGoldenDeliveryCustomLabel(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const labelList = extractOrderCustomLabelsList(originalOrder, flat);
    return labelList.some(t => {
        const lower = t.toLowerCase().trim();
        return lower.includes('roots') || lower.includes('golden delivery') || lower.includes('golden');
    });
}

// ── Money ──

export function extractOrderInvoiceTotal(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const val = originalOrder.invoice?.total !== undefined ? originalOrder.invoice.total :
        (flat.invoice_total !== undefined ? flat.invoice_total :
            (originalOrder.total_amount !== undefined ? originalOrder.total_amount : 0));
    const num = parseFloat(val);
    return !isNaN(num) ? num : 0;
}

export function extractOrderTotalDue(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    // Strictly read total_due from invoice or order with ZERO fallbacks to shipment.cod_amount or invoice.total
    const rawDue = originalOrder.invoice?.total_due !== undefined ? originalOrder.invoice.total_due :
        (originalOrder.total_due !== undefined ? originalOrder.total_due :
            (flat.invoice_total_due !== undefined ? flat.invoice_total_due : (flat.total_due !== undefined ? flat.total_due : 0)));
    const num = parseFloat(rawDue);
    return (!isNaN(num) && num > 0) ? num : 0;
}

export function extractOrderCodAmount(originalOrder, flat) {
    return extractOrderTotalDue(originalOrder, flat);
}

// ── Courier ──

export function extractShippingPartner(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
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

// ── Dates ──

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The business day is always Amman's, never the viewer's. Without this an order stamped
// 21:30 UTC — half past midnight in Amman — lands on the previous day for anyone opening
// the page from a western timezone, shifting its whole CLA by a day.
const AMMAN_TZ = 'Asia/Amman';

const ammanParts = (() => {
    let fmt = null;
    try {
        fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: AMMAN_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
        });
    } catch (e) {
        fmt = null;
    }

    return (d) => {
        if (fmt) {
            const out = {};
            fmt.formatToParts(d).forEach(p => { out[p.type] = p.value; });
            if (out.year && out.month && out.day) {
                return { year: +out.year, month: +out.month, day: +out.day };
            }
        }
        // Jordan has been on UTC+3 year-round since it dropped DST in 2022, so a fixed
        // offset is a safe fallback where Intl has no timezone data.
        const shifted = new Date(d.getTime() + 3 * 3600000);
        return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
    };
})();

// Omniful timestamps come back without a zone on some fields; the business runs on
// Amman time, so an unqualified stamp is read as +03:00 rather than as UTC.
function parseOrderTimestamp(raw) {
    if (!raw) return null;

    // A bare date is anchored at Amman midday so it resolves to that same calendar day
    // no matter where the page is opened.
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        const d = new Date(`${raw.trim()}T12:00:00+03:00`);
        return isNaN(d.getTime()) ? null : d;
    }

    let dateStr = typeof raw === 'string' ? raw.trim() : '';
    if (dateStr) {
        if (!dateStr.includes('T')) dateStr = dateStr.replace(' ', 'T');
        if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += '+03:00';
    }

    const d = new Date(dateStr || raw);
    return isNaN(d.getTime()) ? null : d;
}

function toDateInfo(d) {
    if (!d) return null;
    const p = ammanParts(d);
    const day = String(p.day).padStart(2, '0');
    const month = String(p.month).padStart(2, '0');
    return {
        dateKey: `${p.year}-${month}-${day}`,
        displayDate: `${day}/${month}/${p.year}`,
        // Derived from the Amman calendar parts, not from the instant, so the weekday
        // matches the date key it is shown beside.
        dayName: DAY_NAMES[new Date(p.year, p.month - 1, p.day, 12, 0, 0).getDay()],
        timestamp: d.getTime()
    };
}

export function isDeliveredOrder(originalOrder, flat) {
    const status = (originalOrder.display_status || originalOrder.status_code || (flat && flat.display_status) || (flat && flat.status) || '').toString().toLowerCase().trim();
    return status === 'delivered';
}

export function extractOrderDeliveredDate(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const isDelivered = isDeliveredOrder(originalOrder, flat);

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

    return toDateInfo(parseOrderTimestamp(raw));
}

export function extractOrderCreatedDate(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const isDelivered = isDeliveredOrder(originalOrder, flat);

    let raw = originalOrder.order_created_at || originalOrder.created_at || flat.order_created_at || flat.created_at;

    if (!raw && !isDelivered && originalOrder._dateKey && /^\d{4}-\d{2}-\d{2}$/.test(originalOrder._dateKey)) {
        raw = originalOrder._dateKey;
    }

    return toDateInfo(parseOrderTimestamp(raw));
}

// Only ever populated once a shipment actually leaves, so its absence is the signal
// that an order has not shipped yet.
export function extractOrderShippedDate(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const raw = originalOrder.shipment?.order_shipped_at ||
        originalOrder.order_shipped_at ||
        flat.shipment_order_shipped_at ||
        flat.order_shipped_at;

    return toDateInfo(parseOrderTimestamp(raw));
}

export function extractOrderDateInfo(originalOrder, flat) {
    if (!flat) flat = flattenObject(originalOrder);
    const isDelivered = isDeliveredOrder(originalOrder, flat);

    let dateInfo = null;
    if (isDelivered) {
        dateInfo = extractOrderDeliveredDate(originalOrder, flat);
    }
    if (!dateInfo) {
        dateInfo = extractOrderCreatedDate(originalOrder, flat);
    }
    if (dateInfo) {
        return { ...dateInfo, shortDate: dateInfo.displayDate };
    }

    if (originalOrder._dateKey && /^\d{4}-\d{2}-\d{2}$/.test(originalOrder._dateKey)) {
        const info = toDateInfo(parseOrderTimestamp(originalOrder._dateKey));
        if (info) return { ...info, shortDate: info.displayDate };
    }

    return {
        dateKey: 'Unknown',
        displayDate: 'Unknown',
        shortDate: 'Unknown',
        dayName: '-',
        timestamp: 0
    };
}

// ── Status classification ──

// The status vocabulary Omniful actually returns for these sellers.
export const STATUS_NOT_SHIPPED = ['new_order', 'in_picking', 'in_packing', 'picked', 'packed', 'ready_to_ship', 'on_hold'];

// Terminal states. An order that went back to the warehouse is finished with as far as
// delivery goes — leaving return_to_origin out of this list counted every RTO order as
// an overdue delivery forever.
export const STATUS_CLOSED = ['delivered', 'cancelled', 'canceled', 'returned', 'return_to_origin', 'rto'];

export function normalizedStatus(originalOrder, flat) {
    return (originalOrder.status_code || originalOrder.display_status || (flat && flat.status_code) || (flat && flat.display_status) || '')
        .toString().toLowerCase().trim().replace(/\s+/g, '_');
}

export function isOnHoldOrder(originalOrder, flat) {
    return normalizedStatus(originalOrder, flat) === 'on_hold';
}

export function isCancelledOrder(originalOrder, flat) {
    const s = normalizedStatus(originalOrder, flat);
    return s === 'cancelled' || s === 'canceled';
}

// Reached a terminal state — nothing more is owed on it, so it is never "late".
export function isClosedOrder(originalOrder, flat) {
    return STATUS_CLOSED.includes(normalizedStatus(originalOrder, flat));
}

// "Awaiting shipment": still open, and no shipment has left the warehouse.
export function isAwaitingShipment(originalOrder, flat) {
    const s = normalizedStatus(originalOrder, flat);
    if (STATUS_CLOSED.includes(s)) return false;
    if (s === 'shipped' || s === 'in_transit' || s === 'out_for_delivery') return false;
    return STATUS_NOT_SHIPPED.includes(s) || !extractOrderShippedDate(originalOrder, flat);
}

// ── Date helpers shared by the health page ──

// The Amman business day an instant falls on. `dateKeyOf(new Date())` is "today" as the
// warehouse sees it, wherever the viewer happens to be.
export function dateKeyOf(d) {
    const p = ammanParts(d);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Pure key arithmetic: builds a local Date from the key's own parts and reads them back
// the same way, so it never converts between zones and is safe wherever it runs.
export function addDays(dateKey, delta) {
    const parts = dateKey.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(fromKey, toKey) {
    const p1 = fromKey.split('-').map(Number);
    const p2 = toKey.split('-').map(Number);
    const a = new Date(p1[0], p1[1] - 1, p1[2], 12, 0, 0).getTime();
    const b = new Date(p2[0], p2[1] - 1, p2[2], 12, 0, 0).getTime();
    return Math.round((b - a) / 86400000);
}

export function formatDisplayDate(dateKey) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || '-';
    const [y, m, d] = dateKey.split('-');
    return `${d}/${m}/${y}`;
}

// Test Seller is a scratch account, not a real merchant — its orders are dropped at the
// point each page builds its order set, so nothing downstream has to remember to filter
// them. Roughly 12 orders / 360 JOD a month, small enough to be invisible in a total and
// large enough to be wrong.
//
// Deliberately only Test Seller. Jafar Shop is a real merchant that runs its own
// fulfilment, so it is handled by the narrower per-indicator rules that already exist and
// is NOT excluded here.
const NON_PRODUCTION_STORES = ['test seller'];

export function isNonProductionStore(storeName) {
    const s = (storeName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s) return false;
    return NON_PRODUCTION_STORES.some(n => s === n || s.replace(/\s+/g, '') === n.replace(/\s+/g, ''));
}

// A collection day is only reconcilable once it is over. Orders used to arrive in one
// nightly batch, so a day was always complete by the time it appeared; the hourly fetch
// now files today's deliveries as they happen, which would otherwise show the current
// day as a COD group whose expected total climbs all afternoon — and mark it unreconciled
// for being incomplete. Cash pages call this to leave the open day out; pages about work
// in progress (Operations Health, the KPI dashboard) deliberately do not.
export function isClosedBusinessDay(dateKey) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
    return dateKey < dateKeyOf(new Date());
}

export function dayNameOf(dateKey) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '-';
    const parts = dateKey.split('-').map(Number);
    return DAY_NAMES[new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getDay()];
}
