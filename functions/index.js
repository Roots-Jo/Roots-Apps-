// Redeploy trigger
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const fs = require('fs');
const path = require('path');
const { initializeApp, getApps } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const adminApp = !getApps().length ? initializeApp({
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app"
}) : getApps()[0];
const db = getDatabase(adminApp);

// Using standard Firebase config to hide secrets, but for this example,
// we will load it from process.env if available. 
// IN PRODUCTION: Use Firebase Secret Manager for OMNIFUL_API_TOKEN.
require("dotenv").config();

exports.getOrders = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { startDate, endDate, startTimestamp, endTimestamp, sellers } = req.body.data || {};

    if (!startDate || !endDate || !startTimestamp || !endTimestamp) {
      res.status(400).send({ data: { error: "startDate, endDate, and timestamps are required." } });
      return;
    }

    const token = process.env.OMNIFUL_API_TOKEN;
    if (!token) {
      logger.error("Missing OMNIFUL_API_TOKEN environment variable.");
      res.status(500).send({ data: { error: "Server Configuration Error" } });
      return;
    }
    const baseUrl = "https://prodapi.omniful.com";
    const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
    const sellerCodes = sellers && sellers.length > 0 ? sellers : defaultSellerCodes;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    let allOrders = [];

    try {
      const sellerFetchPromises = sellerCodes.map(async (sellerCode) => {
        const sellerOrders = [];
        logger.info(`Fetching orders for seller: ${sellerCode}`);
        const endpoint = `/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders`;
        const fullUrl = `${baseUrl}${endpoint}`;

        let searchAfter = null;
        let pageCount = 0;
        const maxPages = 50;

        try {
          while (pageCount < maxPages) {
            pageCount++;
            const queryParams = { per_page: "100" };
            if (searchAfter) queryParams.search_after = searchAfter;

            const response = await axios.get(fullUrl, { headers, params: queryParams, timeout: 15000 });
            const orderData = response.data;
            const pageOrders = orderData.data || [];

            if (pageOrders.length === 0) break;

            let validOrders = [];
            let stopFetching = false;

            for (const order of pageOrders) {
              order.tags = order.tags || order.custom_labels || order.labels || [];
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
        } catch (sellerErr) {
          logger.error(`Error fetching orders for seller ${sellerCode}: ${sellerErr.message}`);
        }

        return sellerOrders;
      });

      const results = await Promise.all(sellerFetchPromises);
      for (const res of results) {
        allOrders.push(...res);
      }

      logger.info(`Successfully fetched a total of ${allOrders.length} orders across ${sellerCodes.length} sellers`);
      res.status(200).send({ data: { orders: allOrders } });

    } catch (error) {
      logger.error("Error fetching orders", error.message);
      if (error.response) {
        logger.error("Server Response", error.response.data);
      }
      res.status(500).send({ data: { error: "Failed to fetch orders from the external API." } });
    }
  });
});

exports.getSellers = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const token = process.env.OMNIFUL_API_TOKEN;
    if (!token) {
      logger.error("Missing OMNIFUL_API_TOKEN environment variable.");
      res.status(500).send({ data: { error: "Server Configuration Error" } });
      return;
    }
    const baseUrl = "https://prodapi.omniful.com";
    const endpoint = "/sales-channel/public/v1/tenants/sellers";

    try {
      const response = await axios.get(`${baseUrl}${endpoint}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        params: {
          page: 1,
          per_page: 100,
          is_active: true,
          include_all_sellers: true
        }
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.status(200).send({ data: { sellers: response.data.data } });
    } catch (error) {
      logger.error("Error fetching sellers list", error.message);
      res.status(500).send({ data: { error: "Failed to fetch sellers list." } });
    }
  });
});

exports.saveMapping = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { mappings } = req.body || {};
    if (!mappings || !Array.isArray(mappings)) {
      res.status(400).send({ data: { error: "Mappings array is required." } });
      return;
    }

    try {
      // Resolve path to the mapping.json file in the public directory
      const mappingFilePath = path.join(__dirname, '../public/data/mapping.json');
      
      let existingMappings = [];
      if (fs.existsSync(mappingFilePath)) {
        const fileContent = fs.readFileSync(mappingFilePath, 'utf8');
        existingMappings = JSON.parse(fileContent);
      }

      // Add new mappings, avoiding exact duplicates
      for (const newMap of mappings) {
        const exists = existingMappings.some(
          m => m.keyword === newMap.keyword && m.area === newMap.area
        );
        if (!exists) {
          existingMappings.push(newMap);
        }
      }

      // Format as JSON and write back to file
      fs.writeFileSync(mappingFilePath, JSON.stringify(existingMappings, null, 2));

      logger.info(`Successfully saved ${mappings.length} new mappings. Total mappings: ${existingMappings.length}`);
      res.status(200).send({ data: { success: true, count: existingMappings.length } });
    } catch (error) {
      logger.error("Error saving mapping", error.message);
      res.status(500).send({ data: { error: "Failed to save mapping to JSON." } });
    }
  });
});

exports.updateMappings = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { mappings } = req.body || {};
    if (!mappings || !Array.isArray(mappings)) {
      res.status(400).send({ data: { error: "Mappings array is required." } });
      return;
    }

    try {
      // Resolve path to the mapping.json file in the public directory
      const mappingFilePath = path.join(__dirname, '../public/data/mapping.json');
      
      // Overwrite the file entirely with the new valid mappings
      fs.writeFileSync(mappingFilePath, JSON.stringify(mappings, null, 2));

      logger.info(`Successfully updated mappings. Total mappings: ${mappings.length}`);
      res.status(200).send({ data: { success: true, count: mappings.length } });
    } catch (error) {
      logger.error("Error updating mappings", error.message);
      res.status(500).send({ data: { error: "Failed to update mappings in JSON." } });
    }
  });
});

exports.saveDeliveries = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { deliveries } = req.body || {};
    if (!deliveries || !Array.isArray(deliveries)) {
      res.status(400).send({ data: { error: "Deliveries array is required." } });
      return;
    }

    try {
      const filePath = path.join(__dirname, '../public/data/deliveries.json');
      let existing = [];
      if (fs.existsSync(filePath)) {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }

      // Add new deliveries, avoiding duplicates by order_id
      for (const newDel of deliveries) {
        if (!existing.some(d => d.order_id === newDel.order_id)) {
          existing.push(newDel);
        }
      }

      // Sort existing by order_created_at descending (newest at the top)
      existing.sort((a, b) => {
        const dateA = new Date(a.order_created_at || 0).getTime();
        const dateB = new Date(b.order_created_at || 0).getTime();
        return dateB - dateA;
      });

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      logger.info(`Saved deliveries. Total: ${existing.length}`);
      res.status(200).send({ data: { success: true, count: existing.length } });
    } catch (error) {
      logger.error("Error saving deliveries", error.message);
      res.status(500).send({ data: { error: "Failed to save deliveries to JSON." } });
    }
  });
});

exports.updateDeliveries = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { deliveries } = req.body || {};
    if (!deliveries || !Array.isArray(deliveries)) {
      res.status(400).send({ data: { error: "Deliveries array is required." } });
      return;
    }

    try {
      const filePath = path.join(__dirname, '../public/data/deliveries.json');
      
      // Sort deliveries by order_created_at descending
      deliveries.sort((a, b) => {
        const dateA = new Date(a.order_created_at || 0).getTime();
        const dateB = new Date(b.order_created_at || 0).getTime();
        return dateB - dateA;
      });

      fs.writeFileSync(filePath, JSON.stringify(deliveries, null, 2));
      res.status(200).send({ data: { success: true, count: deliveries.length } });
    } catch (error) {
      logger.error("Error updating deliveries", error.message);
      res.status(500).send({ data: { error: "Failed to update deliveries in JSON." } });
    }
  });
});

exports.updateStatuses = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { statuses } = req.body || {};
    if (!statuses || !Array.isArray(statuses)) {
      res.status(400).send({ data: { error: "Statuses array is required." } });
      return;
    }

    try {
      const filePath = path.join(__dirname, '../public/data/statuses.json');
      fs.writeFileSync(filePath, JSON.stringify(statuses, null, 2));
      res.status(200).send({ data: { success: true, count: statuses.length } });
    } catch (error) {
      logger.error("Error updating statuses", error.message);
      res.status(500).send({ data: { error: "Failed to update statuses in JSON." } });
    }
  });
});
// Reusable core helper to fetch COD orders from Omniful API and save to Firebase Realtime Database
async function fetchAndStoreCODOrders(startTimestamp, endTimestamp, sellerCodes = null) {
  const token = process.env.OMNIFUL_API_TOKEN;
  if (!token) {
    throw new Error("Missing OMNIFUL_API_TOKEN environment variable.");
  }
  const baseUrl = "https://prodapi.omniful.com";
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
  let targetSellerCodes = sellerCodes && sellerCodes.length > 0 ? sellerCodes : null;

  // If no specific sellers requested, dynamically fetch ALL active sellers from Omniful
  if (!targetSellerCodes || targetSellerCodes.length === 0) {
    try {
      const sellersRes = await axios.get(`${baseUrl}/sales-channel/public/v1/tenants/sellers`, {
        headers,
        params: { page: 1, per_page: 100, is_active: true, include_all_sellers: true },
        timeout: 10000
      });
      const activeSellers = sellersRes.data?.data || [];
      const fetchedCodes = activeSellers.map(s => s.code).filter(Boolean);
      if (fetchedCodes.length > 0) {
        targetSellerCodes = fetchedCodes;
        logger.info(`[COD Fetch] Dynamically fetched ${targetSellerCodes.length} active sellers: ${targetSellerCodes.join(', ')}`);
      }
    } catch (err) {
      logger.warn(`[COD Fetch] Could not dynamically load sellers list, using default sellers: ${err.message}`);
    }
  }

  if (!targetSellerCodes || targetSellerCodes.length === 0) {
    targetSellerCodes = defaultSellerCodes;
  }

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
      timestamp: d.getTime()
    };
  }

  let allOrders = [];

  const sellerFetchPromises = targetSellerCodes.map(async (sellerCode) => {
    const sellerOrders = [];
    logger.info(`[COD Fetch] Fetching orders for seller: ${sellerCode} (${startTimestamp} - ${endTimestamp})`);
    const endpoint = `/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders`;
    const fullUrl = `${baseUrl}${endpoint}`;

    // 1. Fetch delivered orders for the seller
    for (const fetchMode of ['delivered', 'all']) {
      let searchAfter = null;
      let maxPages = 15;
      let pageCount = 0;

      try {
        while (pageCount < maxPages) {
          pageCount++;
          const queryParams = { per_page: "100" };
          if (fetchMode === 'delivered') queryParams.status = 'delivered';
          if (searchAfter) queryParams.search_after = searchAfter;

          const response = await axios.get(fullUrl, { headers, params: queryParams, timeout: 15000 });
          const orderData = response.data;
          const pageOrders = orderData.data || [];

          if (pageOrders.length === 0) break;

          let validOrders = [];

          for (const order of pageOrders) {
            order.tags = order.tags || order.custom_labels || order.labels || [];
            const dateInfo = extractOrderDateKey(order);

            if (dateInfo && dateInfo.timestamp >= startTimestamp && dateInfo.timestamp <= endTimestamp) {
              validOrders.push(order);
            }
          }

          sellerOrders.push(...validOrders);

          if (orderData.meta) {
            searchAfter = orderData.meta.end_cursor || orderData.meta.search_after || orderData.meta.next_cursor || orderData.meta.cursor || null;
          } else if (pageOrders.length > 0) {
            searchAfter = pageOrders[pageOrders.length - 1].id;
          } else {
            searchAfter = null;
          }

          if (!searchAfter) break;
        }
      } catch (sellerErr) {
        logger.error(`[COD Fetch] Error fetching ${fetchMode} orders for seller ${sellerCode}: ${sellerErr.message}`);
      }
    }

    return sellerOrders;
  });

  const results = await Promise.all(sellerFetchPromises);
  for (const res of results) {
    allOrders.push(...res);
  }

  // Save each order into Firebase Realtime Database partitioned by dateKey (YYYY-MM-DD)
  // Store under `cod_daily_orders/${dateKey}/${orderId}`
  const updates = {};
  for (const order of allOrders) {
    const dateInfo = extractOrderDateKey(order);
    if (dateInfo) {
      const rawId = order.order_id || order.id || order.order_alias || '';
      const orderId = String(rawId).replace(/[.#$/[\]]/g, '_');
      if (orderId) {
        updates[`cod_daily_orders/${dateInfo.dateKey}/${orderId}`] = order;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await db.ref().update(updates);
    } catch (dbErr) {
      logger.warn(`Direct RTDB update failed, using RTDB REST API fallback: ${dbErr.message}`);
      await axios.patch("https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/.json", updates);
    }
    logger.info(`[COD Fetch] Successfully saved ${Object.keys(updates).length} orders to RTDB across dates.`);
  }

  return { count: allOrders.length, orders: allOrders };
}

// Scheduled Cloud Function: Runs at 12:00 AM (midnight) everyday in Asia/Amman timezone (UTC+3)
// Skips Fridays every time, and on Saturday fetches the past Wednesday and Thursday
exports.scheduledFetchCODOrders = onSchedule({
  schedule: "0 0 * * *",
  timeZone: "Asia/Amman",
  timeoutSeconds: 300,
  memory: "512MiB"
}, async (event) => {
  logger.info("[Scheduled COD] Starting automated midnight fetch in Asia/Amman timezone...");

  // Current time in Amman (UTC+3)
  const now = new Date();
  const ammanOffsetMs = 3 * 60 * 60 * 1000;
  const ammanNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + ammanOffsetMs);
  const dayOfWeek = ammanNow.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat

  // Format YYYY-MM-DD
  const formatDateStr = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Rule: Skip Fridays every time
  if (dayOfWeek === 5) {
    logger.info("[Scheduled COD] Today is Friday midnight. Skipping Friday fetch as configured.");
    return;
  }

  let startTimestamp, endTimestamp, windowDescription;

  if (dayOfWeek === 6) {
    // Saturday midnight: Skip Friday and take past Wednesday and Thursday
    const thursday = new Date(ammanNow);
    thursday.setDate(thursday.getDate() - 2); // 2 days before Saturday = Thursday
    const thursdayStr = formatDateStr(thursday);

    const wednesday = new Date(ammanNow);
    wednesday.setDate(wednesday.getDate() - 3); // 3 days before Saturday = Wednesday
    const wednesdayStr = formatDateStr(wednesday);

    startTimestamp = new Date(`${wednesdayStr}T00:00:00+03:00`).getTime();
    endTimestamp = new Date(`${thursdayStr}T23:59:59.999+03:00`).getTime();
    windowDescription = `Wednesday (${wednesdayStr}) and Thursday (${thursdayStr})`;
  } else {
    // Normal day: Fetch yesterday
    const yesterday = new Date(ammanNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateStr(yesterday);

    startTimestamp = new Date(`${yesterdayStr}T00:00:00+03:00`).getTime();
    endTimestamp = new Date(`${yesterdayStr}T23:59:59.999+03:00`).getTime();
    windowDescription = `Yesterday (${yesterdayStr})`;
  }

  logger.info(`[Scheduled COD] Fetching window for ${windowDescription} (from ${startTimestamp} to ${endTimestamp})`);

  try {
    const res = await fetchAndStoreCODOrders(startTimestamp, endTimestamp);
    logger.info(`[Scheduled COD] Successfully completed automated fetch. Stored ${res.count} orders for ${windowDescription}.`);
  } catch (err) {
    logger.error(`[Scheduled COD] Failed automated fetch for ${windowDescription}: ${err.message}`, err);
  }
});

// Sync / Backfill COD Orders HTTP Endpoint (Admin or automated trigger)
exports.syncCODOrders = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const body = req.body && req.body.data ? req.body.data : (req.body || {});
      let { startTimestamp, endTimestamp, startDate, endDate, daysBack, sellers } = body;

      const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
      const sellerCodes = sellers && sellers.length > 0 ? sellers : defaultSellerCodes;

      // If daysBack is specified (e.g. 3) or default to 3 days back if neither timestamps nor dates provided
      if (daysBack || (!startTimestamp && !startDate)) {
        const numDays = parseInt(daysBack, 10) || 3;
        const now = new Date();
        const ammanOffsetMs = 3 * 60 * 60 * 1000;
        const ammanNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + ammanOffsetMs);

        // End is end of today in Amman
        const endYear = ammanNow.getFullYear();
        const endMonth = String(ammanNow.getMonth() + 1).padStart(2, '0');
        const endDay = String(ammanNow.getDate()).padStart(2, '0');
        const endDateStr = `${endYear}-${endMonth}-${endDay}`;
        endTimestamp = new Date(`${endDateStr}T23:59:59.999+03:00`).getTime();

        // Start is (numDays - 1) days before
        const startDateObj = new Date(ammanNow);
        startDateObj.setDate(startDateObj.getDate() - (numDays - 1));
        const startYear = startDateObj.getFullYear();
        const startMonth = String(startDateObj.getMonth() + 1).padStart(2, '0');
        const startDay = String(startDateObj.getDate()).padStart(2, '0');
        const startDateStr = `${startYear}-${startMonth}-${startDay}`;
        startTimestamp = new Date(`${startDateStr}T00:00:00+03:00`).getTime();
      } else if (startDate && endDate) {
        startTimestamp = startTimestamp || new Date(`${startDate}T00:00:00+03:00`).getTime();
        endTimestamp = endTimestamp || new Date(`${endDate}T23:59:59.999+03:00`).getTime();
      }

      const result = await fetchAndStoreCODOrders(startTimestamp, endTimestamp, sellerCodes);
      res.status(200).send({ data: { success: true, count: result.count, orders: result.orders } });
    } catch (error) {
      logger.error("Error in syncCODOrders", error.message);
      res.status(500).send({ data: { error: error.message } });
    }
  });
});

// Standard On-Demand Fetch (saves to RTDB and returns data)
exports.getCODOrders = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { startDate, endDate, startTimestamp, endTimestamp, sellers } = req.body.data || {};

    if (!startDate || !endDate || !startTimestamp || !endTimestamp) {
      res.status(400).send({ data: { error: "startDate, endDate, and timestamps are required." } });
      return;
    }

    const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
    const sellerCodes = sellers && sellers.length > 0 ? sellers : defaultSellerCodes;

    try {
      const result = await fetchAndStoreCODOrders(startTimestamp, endTimestamp, sellerCodes);
      res.status(200).send({ data: { orders: result.orders } });
    } catch (error) {
      logger.error("Error in getCODOrders", error.message);
      res.status(500).send({ data: { error: "Failed to fetch COD orders from the external API." } });
    }
  });
});

