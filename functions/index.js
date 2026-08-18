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

    // The token from your python script. In a real app, this should be in Firebase Secrets.
    const token = process.env.OMNIFUL_API_TOKEN || "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODg2OTU5NDgsImp0aSI6ImVhY2QxYjJkLTExYmYtNGZmZC04M2NhLTQzNGI0Y2Q5YzRhNiIsInVzZXJfZGV0YWlscyI6eyJUZW5hbnRDb2RlIjoiMzAyNjgyNTUzNCIsIlRlbmFudElEIjoiIiwiVXNlcklEIjoiMTQ0NDAiLCJVc2VyTmFtZSI6IkJhc2hhciIsIlJhdGVMaW1pdERldGFpbHMiOnsiRW5hYmxlZCI6dHJ1ZSwiUmVxdWVzdHNQZXJNaW51dGUiOjEyMH19LCJ0b2tlbl90eXBlIjoiQmVhcmVyIn0.ckEiC9UrSbidem6ITi6vR87yBbe3Ng1QBpruqY260OlK9R7WlvudfRmwn_8U-dnyjCXtI9z_nf99P9cdOIYbF5noLMi4krn_fvMzD6ZoRQfJxN-cdfbIh8X9QNYZY_-jYBNQFmKXF0DdKn-EDoTLEPvlk82re-cw_f0kuVdwqBwhmxPjU-GEkvN8JlSNxDSlfvsWc5BZgibIuZOfgsf5Zwy52egfMXpz5YzQ-FduN6VT4kqzKZuDgZajwGbtRB-SvJqlddJlcDK3ttsotiGLI0Gstoxnfa3xgnJGGGKpPXtHlI1HXqNlN5YWiOWsr2rK0ahhJwYp77Z7PeroLjUsyMAb3CAvUkalIx1EYKX07J9JgpkyYlFt1h3Dl_KqREiMAGGYJjgkS3ybpV9-8Qdxq6UjlmlBXDVglsYn4fqvF4GnJ0KZkT3xgF5XgHOiajJJqdw4BNbd4KqGIj39oiYhfujG7DbvUKmO1E7j_g_Tv3IZ4NgYXoF0u2ESykkEDMC5-y53ZGsRsxFOrC1r5_1zKTxLiyj6EZFSJIUUgfM8KaDg6Qd1SYAa8mxJcyLEnmFskydA4LLRBciiqcMCUKsMSNdvADBp2GEVCjLHvJ-E4dAEqvKNBCLDVvpyliLzCk3hA4sAs6TYpMKnOh6QBmD1-Sq77jHNr-YQEylrdiUY2pI";
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
        const endpoint = `/sales-channel/public/v1/tenants/sellers/${sellerCode}/orders`;
        const fullUrl = `${baseUrl}${endpoint}`;

        let page = 1;

        while (true) {
          const queryParams = {
            page: page.toString(),
            per_page: "100"
          };

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
          logger.info(`Fetched page ${page} (${validOrders.length} valid orders) for ${sellerCode}`);

          if (stopFetching) {
            logger.info(`Encountered orders older than ${startDate}. Stopping fetch for ${sellerCode}.`);
            break;
          }

          page++;
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

    const token = process.env.OMNIFUL_API_TOKEN || "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODg2OTU5NDgsImp0aSI6ImVhY2QxYjJkLTExYmYtNGZmZC04M2NhLTQzNGI0Y2Q5YzRhNiIsInVzZXJfZGV0YWlscyI6eyJUZW5hbnRDb2RlIjoiMzAyNjgyNTUzNCIsIlRlbmFudElEIjoiIiwiVXNlcklEIjoiMTQ0NDAiLCJVc2VyTmFtZSI6IkJhc2hhciIsIlJhdGVMaW1pdERldGFpbHMiOnsiRW5hYmxlZCI6dHJ1ZSwiUmVxdWVzdHNQZXJNaW51dGUiOjEyMH19LCJ0b2tlbl90eXBlIjoiQmVhcmVyIn0.ckEiC9UrSbidem6ITi6vR87yBbe3Ng1QBpruqY260OlK9R7WlvudfRmwn_8U-dnyjCXtI9z_nf99P9cdOIYbF5noLMi4krn_fvMzD6ZoRQfJxN-cdfbIh8X9QNYZY_-jYBNQFmKXF0DdKn-EDoTLEPvlk82re-cw_f0kuVdwqBwhmxPjU-GEkvN8JlSNxDSlfvsWc5BZgibIuZOfgsf5Zwy52egfMXpz5YzQ-FduN6VT4kqzKZuDgZajwGbtRB-SvJqlddJlcDK3ttsotiGLI0Gstoxnfa3xgnJGGGKpPXtHlI1HXqNlN5YWiOWsr2rK0ahhJwYp77Z7PeroLjUsyMAb3CAvUkalIx1EYKX07J9JgpkyYlFt1h3Dl_KqREiMAGGYJjgkS3ybpV9-8Qdxq6UjlmlBXDVglsYn4fqvF4GnJ0KZkT3xgF5XgHOiajJJqdw4BNbd4KqGIj39oiYhfujG7DbvUKmO1E7j_g_Tv3IZ4NgYXoF0u2ESykkEDMC5-y53ZGsRsxFOrC1r5_1zKTxLiyj6EZFSJIUUgfM8KaDg6Qd1SYAa8mxJcyLEnmFskydA4LLRBciiqcMCUKsMSNdvADBp2GEVCjLHvJ-E4dAEqvKNBCLDVvpyliLzCk3hA4sAs6TYpMKnOh6QBmD1-Sq77jHNr-YQEylrdiUY2pI";
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
