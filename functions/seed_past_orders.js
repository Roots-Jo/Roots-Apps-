require('dotenv').config();
const { initializeApp, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const axios = require('axios');

const adminApp = !getApps().length ? initializeApp({
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app"
}) : getApps()[0];
const db = getDatabase(adminApp);

async function seedOrders() {
  const token = process.env.OMNIFUL_API_TOKEN;
  if (!token) {
    console.error("Missing OMNIFUL_API_TOKEN in .env");
    process.exit(1);
  }

  const baseUrl = "https://prodapi.omniful.com";
  const sellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // Seed past days: Wednesday (Aug 19), Thursday (Aug 20), Saturday (Aug 22), Sunday (Aug 23) - skipping Friday (Aug 21)
  const startDateStr = "2026-08-19"; // Wednesday
  const endDateStr = "2026-08-23";   // Sunday

  const startTimestamp = new Date(`${startDateStr}T00:00:00+03:00`).getTime();
  const endTimestamp = new Date(`${endDateStr}T23:59:59.999+03:00`).getTime();

  console.log(`[Seed] Fetching COD orders from ${startDateStr} to ${endDateStr} (skipping Fridays)...`);
  console.log(`[Seed] Timestamps: ${startTimestamp} -> ${endTimestamp}`);

  let allOrders = [];

  for (const sellerCode of sellerCodes) {
    console.log(`[Seed] Fetching seller ${sellerCode}...`);
    const endpoint = `/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders`;
    const fullUrl = `${baseUrl}${endpoint}`;

    let searchAfter = null;
    let maxPages = 50;
    let pageCount = 0;
    let sellerOrders = [];

    try {
      while (pageCount < maxPages) {
        pageCount++;
        const queryParams = { per_page: "100" };
        if (searchAfter) queryParams.search_after = searchAfter;

        const response = await axios.get(fullUrl, { headers, params: queryParams, timeout: 20000 });
        const orderData = response.data;
        const pageOrders = orderData.data || [];

        if (pageOrders.length === 0) break;

        let validOrders = [];
        let stopFetching = false;

        for (const order of pageOrders) {
          order.tags = order.tags || [];
          order.custom_labels = order.custom_labels || [];
          let createdAt = order.order_created_at || "";
          if (createdAt && !createdAt.includes('T')) createdAt = createdAt.replace(' ', 'T');
          if (createdAt && !createdAt.endsWith('Z') && !createdAt.includes('+')) createdAt += '+03:00';
          const orderTimestamp = new Date(createdAt).getTime();

          if (orderTimestamp >= startTimestamp && orderTimestamp <= endTimestamp) {
            validOrders.push(order);
          } else if (orderTimestamp < startTimestamp) {
            stopFetching = true;
          }
        }

        sellerOrders.push(...validOrders);
        if (stopFetching) break;

        if (orderData.meta) {
          searchAfter = orderData.meta.end_cursor || orderData.meta.search_after || orderData.meta.next_cursor || orderData.meta.cursor || null;
        } else if (pageOrders.length > 0) {
          searchAfter = pageOrders[pageOrders.length - 1].id;
        } else {
          searchAfter = null;
        }

        if (!searchAfter) break;
      }
      console.log(`[Seed] Seller ${sellerCode}: ${sellerOrders.length} valid orders`);
      allOrders.push(...sellerOrders);
    } catch (err) {
      console.error(`[Seed] Error fetching seller ${sellerCode}:`, err.message);
    }
  }

  console.log(`[Seed] Total orders retrieved: ${allOrders.length}. Saving to Firebase Realtime Database...`);

  function extractOrderDateKey(order) {
    const isDelivered = ((order.display_status || order.status_code || '').toString().toLowerCase().trim() === 'delivered');
    let rawDate = null;
    if (isDelivered) {
      rawDate = order.shipment?.order_delivered_at || order.order_delivered_at || order.shipment?.delivered_at || order.delivered_at;
    }
    if (!rawDate) {
      rawDate = order.order_created_at || order.created_at;
    }
    if (!rawDate) return null;
    if (typeof rawDate === 'string') {
      if (!rawDate.includes('T')) rawDate = rawDate.replace(' ', 'T');
      if (!rawDate.endsWith('Z') && !rawDate.includes('+')) rawDate += '+03:00';
    }
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return {
      dateKey: `${y}-${m}-${day}`,
      timestamp: d.getTime(),
      dayOfWeek: d.getDay()
    };
  }

  const updates = {};
  const dateCounts = {};

  const uniqueOrders = new Map();
  for (const order of allOrders) {
    const rawId = order.order_id || order.id || order.order_alias || '';
    if (!rawId) continue;
    const idKey = String(rawId).trim();
    if (!uniqueOrders.has(idKey)) {
      uniqueOrders.set(idKey, order);
    } else {
      const existing = uniqueOrders.get(idKey);
      const isCurDel = ((order.display_status || order.status_code || '').toString().toLowerCase().trim() === 'delivered');
      const isPrevDel = ((existing.display_status || existing.status_code || '').toString().toLowerCase().trim() === 'delivered');
      if (isCurDel && !isPrevDel) {
        uniqueOrders.set(idKey, order);
      }
    }
  }

  for (const order of uniqueOrders.values()) {
    const dateInfo = extractOrderDateKey(order);
    if (dateInfo) {
      if (dateInfo.dayOfWeek === 5) continue; // Skip Friday
      const dateKey = dateInfo.dateKey;
      const rawId = order.order_id || order.id || order.order_alias || '';
      const orderId = String(rawId).replace(/[.#$/[\]]/g, '_');
      if (orderId) {
        updates[`cod_daily_orders/${dateKey}/${orderId}`] = order;
        dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
      }
    }
  }

  // Explicitly remove Friday (2026-08-21) if present
  try {
    const deleteFridayUrl = "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/cod_daily_orders/2026-08-21.json";
    await axios.delete(deleteFridayUrl);
    console.log(`[Seed] Successfully cleaned up Friday (2026-08-21) from RTDB.`);
  } catch (err) {
    console.warn(`[Seed] Could not remove Friday node: ${err.message}`);
  }

  if (Object.keys(updates).length > 0) {
    console.log(`[Seed] Sending ${Object.keys(updates).length} records to Firebase RTDB via REST API...`);
    const rtdbUrl = "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/.json";
    await axios.patch(rtdbUrl, updates);
    console.log(`[Seed] Successfully saved orders to Firebase RTDB!`);
    console.log(`[Seed] Breakdown by date:`, dateCounts);
  } else {
    console.log(`[Seed] No orders to save.`);
  }

  process.exit(0);
}

seedOrders().catch(err => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
