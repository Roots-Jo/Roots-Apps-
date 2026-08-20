// Redeploy trigger
const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const fs = require('fs');
const path = require('path');

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
    const sellerCodes = sellers && sellers.length > 0 ? sellers : ["SEM", "BAM"];
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    let allOrders = [];

    try {
      for (const sellerCode of sellerCodes) {
        logger.info(`Fetching orders for seller: ${sellerCode}`);
        const endpoint = `/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders`;
        const fullUrl = `${baseUrl}${endpoint}`;

        let searchAfter = null;
        let pageCount = 1; // Used for logging purposes

        while (true) {
          const queryParams = {
            per_page: "100"
          };
          if (searchAfter) {
            queryParams.search_after = searchAfter;
          }

          const response = await axios.get(fullUrl, { headers, params: queryParams, timeout: 10000 });
          const orderData = response.data;
          const pageOrders = orderData.data || [];

          if (pageOrders.length === 0) {
            break;
          }

          let validOrders = [];
          let stopFetching = false;

          for (const order of pageOrders) {
            let createdAt = order.order_created_at || "";

            // Normalize space to T and append Z to ensure UTC parsing if it's missing
            if (createdAt && !createdAt.includes('T')) {
              createdAt = createdAt.replace(' ', 'T');
            }
            if (createdAt && !createdAt.endsWith('Z') && !createdAt.includes('+')) {
              // The API returns time in KSA (+03:00), not UTC.
              createdAt += '+03:00';
            }

            const orderTimestamp = new Date(createdAt).getTime();

            if (orderTimestamp >= startTimestamp && orderTimestamp <= endTimestamp) {
              validOrders.push(order);
            } else if (orderTimestamp < startTimestamp) {
              // Since orders are sorted newest to oldest, we can stop when we hit a date older than our start time
              stopFetching = true;
            }
          }

          allOrders.push(...validOrders);
          logger.info(`Fetched page ${pageCount} (${validOrders.length} valid orders) for ${sellerCode}`);

          if (stopFetching) {
            logger.info(`Encountered orders older than ${startDate}. Stopping fetch for ${sellerCode}.`);
            break;
          }

          // Extract the next cursor
          if (orderData.meta) {
            searchAfter = orderData.meta.search_after || orderData.meta.next_cursor || orderData.meta.cursor;
          } else if (pageOrders.length > 0) {
            // Fallback: if meta is null, some APIs use the last order's ID as the cursor
            searchAfter = pageOrders[pageOrders.length - 1].id;
          } else {
            searchAfter = null;
          }

          if (!searchAfter) {
            break;
          }

          pageCount++;
        }
      }

      logger.info(`Successfully fetched a total of ${allOrders.length} orders`);
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

    const token = process.env.OMNIFUL_API_TOKEN;
    if (!token) {
      logger.error("Missing OMNIFUL_API_TOKEN environment variable.");
      res.status(500).send({ data: { error: "Server Configuration Error" } });
      return;
    }
    const baseUrl = "https://prodapi.omniful.com";
    const sellerCodes = sellers && sellers.length > 0 ? sellers : ["SEM", "BAM"];
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    let allOrders = [];

    try {
      // 1. Fetch Orders (Duplicate of getOrders logic but optimized)
      for (const sellerCode of sellerCodes) {
        logger.info(`Fetching COD orders for seller: ${sellerCode}`);
        const endpoint = `/sales-channel/public/v2/tenants/sellers/${sellerCode}/orders`;
        const fullUrl = `${baseUrl}${endpoint}`;

        let searchAfter = null;
        while (true) {
          const queryParams = { per_page: "100" };
          if (searchAfter) queryParams.search_after = searchAfter;

          const response = await axios.get(fullUrl, { headers, params: queryParams, timeout: 15000 });
          const orderData = response.data;
          const pageOrders = orderData.data || [];

          if (pageOrders.length === 0) break;

          let validOrders = [];
          let stopFetching = false;

          for (const order of pageOrders) {
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

          allOrders.push(...validOrders);
          if (stopFetching) break;

          if (orderData.meta) {
            searchAfter = orderData.meta.search_after || orderData.meta.next_cursor || orderData.meta.cursor;
          } else if (pageOrders.length > 0) {
            searchAfter = pageOrders[pageOrders.length - 1].id;
          } else {
            searchAfter = null;
          }

          if (!searchAfter) break;
        }
      }

      // 2. Fetch Shipments for the Date Range
      let allShipments = [];
      let shipmentPage = 1;
      const fromDate = new Date(startTimestamp).toISOString();
      // Add one day to toDate to ensure we cover the whole day because of timezone differences
      const toDate = new Date(endTimestamp + 86400000).toISOString(); 
      
      const shipmentEndpoint = "/fulfillment/public/v2/tenants/shipments";
      
      while (true) {
         const shipmentParams = {
            from_date: fromDate,
            to_date: toDate,
            page: shipmentPage,
            limit: 100
         };
         logger.info(`Fetching shipments page ${shipmentPage}`);
         const shipResponse = await axios.get(`${baseUrl}${shipmentEndpoint}`, { headers, params: shipmentParams, timeout: 15000 });
         const shipData = shipResponse.data;
         const pageShipments = shipData.data || [];
         
         if (pageShipments.length > 0) {
            allShipments.push(...pageShipments);
         }
         
         if (pageShipments.length < 100) {
            break; // Last page
         }
         shipmentPage++;
      }
      
      // 3. Combine Orders and Shipments
      const shipmentsByOrderAlias = {};
      for (const ship of allShipments) {
         if (ship.order_alias) shipmentsByOrderAlias[ship.order_alias] = ship;
         if (ship.order_id) shipmentsByOrderAlias[ship.order_id] = ship;
      }
      
      for (let i = 0; i < allOrders.length; i++) {
         const o = allOrders[i];
         const ship = shipmentsByOrderAlias[o.order_alias] || shipmentsByOrderAlias[o.order_id] || shipmentsByOrderAlias[o.id];
         if (ship) {
             o.shipment_details = ship; // includes remarks, etc.
         }
      }

      logger.info(`Successfully fetched combined COD data for ${allOrders.length} orders`);
      res.status(200).send({ data: { orders: allOrders } });

    } catch (error) {
      logger.error("Error fetching COD orders", error.message);
      if (error.response) {
        logger.error("Server Response", error.response.data);
      }
      res.status(500).send({ data: { error: "Failed to fetch COD orders from the external API." } });
    }
  });
});

