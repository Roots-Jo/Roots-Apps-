// Redeploy trigger
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getFirestore } = require("firebase-admin/firestore");

const adminApp = !getApps().length ? initializeApp({
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app"
}) : getApps()[0];
const db = getDatabase(adminApp);
const firestore = getFirestore(adminApp);

require("dotenv").config();

// ==========================================
// Omniful Authentication Module (read-only consumer — see the contract below)
// ==========================================
// OMNIFUL_CLIENT_ID and OMNIFUL_CLIENT_SECRET are deliberately absent: they exist only to mint
// tokens, which this app must never do. Leaving them unread means the minting credentials can
// be removed from this app's .env entirely, so the rule is enforced by what is deployed and
// not only by what the code happens to call.
let memoryTokens = {
  accessToken: process.env.OMNIFUL_API_TOKEN || process.env.OMNIFUL_ACCESS_TOKEN || "",
  // Kept only so the health endpoint can report when the shared pair is next due for rotation.
  refreshToken: process.env.OMNIFUL_REFRESH_TOKEN || "",
  baseUrl: (process.env.OMNIFUL_BASE_URL || "https://prodapi.omniful.com").replace(/\/+$/, "")
};

// ==========================================================================================
// This app is a CONSUMER of the Omniful credentials, never a minter of them
// ==========================================================================================
// The same Omniful credential pair is shared with the LogesTechs bridge. Omniful's grant
// endpoint mints a new access token and invalidates the previous one FOR EVERY HOLDER, not
// just for the caller — so whenever either app refreshed, the other app's token died
// instantly and somebody had to paste a new one in by hand.
//
// No amount of locking inside this app can fix that, because the other app is a separate
// codebase that cannot join our lease. Rotation therefore has exactly one owner, and it is
// not us: it is the manual script in the bridge repo, python/scripts/rotate_omniful_tokens.py,
// run inside the last 5 days of the access token's 30-day life.
//
// The rules here follow from that:
//   * No code path in this file may ever call the Omniful token endpoint. Not a 401 handler,
//     not a retry wrapper, not a scheduled warm-up. If you are about to add one, don't — you
//     will break the bridge and every dashboard it feeds.
//   * Firestore logestechs_config/omniful_auth is the source of truth. The bridge writes it on
//     every deliberate rotation; we only ever read it. .env is a cold-start fallback for when
//     Firestore cannot be reached.
//   * A 401 means re-read the shared token in case a rotation just happened, then retry once.
//     If the token is demonstrably still alive, the 401 is a PERMISSIONS verdict — typically a
//     request against a seller code this tenant does not own — and no token change can fix it.
//     That case produced 14 rotations from a single status update before this was understood.
// ==========================================================================================

const AUTH_DOC = ["logestechs_config", "omniful_auth"];
const authDoc = () => firestore.collection(AUTH_DOC[0]).doc(AUTH_DOC[1]);

// How long a shared-token read is cached before a 401 is allowed to trigger another one. The
// bridge rotates roughly monthly, so re-reading more often than this buys nothing and would
// turn a burst of permission 401s into a burst of Firestore reads.
const SHARED_TOKEN_MIN_REFETCH_MS = 30 * 1000;

// Only a hash is ever logged — the token itself never leaves this process.
function fingerprintToken(token) {
  if (!token) return "";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}


// Raised when Omniful rejects our credentials. Callers must surface this rather than
// treating it as "no data" — a silently empty result made a token outage invisible before.
class OmnifulAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "OmnifulAuthError";
    this.isAuthError = true;
  }
}

function parseJwtExp(token) {
  try {
    if (!token || typeof token !== "string") return 0;
    const parts = token.split(".");
    if (parts.length < 2) return 0;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return (payload.exp || 0) * 1000;
  } catch (e) {
    return 0;
  }
}

function isTokenExpired(token) {
  const exp = parseJwtExp(token);
  if (!exp) return false;
  // Proactively treat token as expired 5 minutes before actual expiry
  return Date.now() >= (exp - 5 * 60 * 1000);
}

// Reads the shared access token from Firestore, which the bridge's rotation script writes.
// This is the ONLY place the token comes from in steady state; .env is a fallback for a cold
// start that cannot reach Firestore. Nothing here ever writes the document — the bridge owns
// it, and a write from this side would clobber a rotation it had just performed.
let sharedTokenFetchedAt = 0;
let sharedTokenLoadPromise = null;
// Whether the token currently in memory actually came from the shared document. Reported by
// the health endpoint, because "running on the .env fallback" and "running on the shared
// record" fail in completely different ways at the next rotation.
let sharedTokenIsAuthoritative = false;

async function readSharedToken() {
  try {
    const doc = await authDoc().get();
    if (!doc.exists) {
      logger.warn(`[OmnifulAuth] ${AUTH_DOC[0]}/${AUTH_DOC[1]} does not exist. Falling back to the token in .env.`);
      return null;
    }
    const data = doc.data() || {};
    if (!data.access_token) {
      logger.warn(`[OmnifulAuth] ${AUTH_DOC[0]}/${AUTH_DOC[1]} has no access_token field. Falling back to the token in .env.`);
      return null;
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      updatedAt: data.updated_at || null
    };
  } catch (err) {
    logger.warn(`[OmnifulAuth] Could not read the shared token from Firestore: ${err.message}. Falling back to the token in .env.`);
    return null;
  }
}

// Pulls the shared token into memory. Concurrent callers share one read: the promise is
// assigned before the first await, so a fan-out cannot slip past a half-finished load and
// carry on with a stale token (which is how six sellers used to produce six 401s at midnight).
function loadSharedToken({ force = false } = {}) {
  if (sharedTokenLoadPromise) return sharedTokenLoadPromise;

  if (!force && sharedTokenFetchedAt && (Date.now() - sharedTokenFetchedAt) < SHARED_TOKEN_MIN_REFETCH_MS) {
    return Promise.resolve(false);
  }

  sharedTokenLoadPromise = (async () => {
    const shared = await readSharedToken();
    sharedTokenFetchedAt = Date.now();
    if (!shared) {
      sharedTokenIsAuthoritative = false;
      return false;
    }
    sharedTokenIsAuthoritative = true;

    const changed = shared.accessToken !== memoryTokens.accessToken;
    memoryTokens.accessToken = shared.accessToken;
    if (shared.refreshToken) memoryTokens.refreshToken = shared.refreshToken;

    if (changed) {
      logger.info(`[OmnifulAuth] Loaded the shared access token ${fingerprintToken(shared.accessToken)} from Firestore (rotated ${shared.updatedAt || "at an unrecorded time"}).`);
    }
    return changed;
  })().finally(() => {
    sharedTokenLoadPromise = null;
  });

  return sharedTokenLoadPromise;
}

function tokenLifetimeDescription(token) {
  const exp = parseJwtExp(token);
  if (!exp) return "an unknown remaining lifetime";
  const ms = exp - Date.now();
  if (ms <= 0) return "an expiry that has already passed";
  const days = ms / 86400000;
  return days >= 1 ? `${days.toFixed(1)} days left` : `${(ms / 3600000).toFixed(1)} hours left`;
}

async function getOmnifulAccessToken() {
  await loadSharedToken();

  if (!memoryTokens.accessToken) {
    throw new OmnifulAuthError(`No Omniful access token is available. ${AUTH_DOC[0]}/${AUTH_DOC[1]} could not be read and OMNIFUL_API_TOKEN is not set in functions/.env.`);
  }

  // Deliberately NOT refreshed when expired. Rotation belongs to the bridge; all we can do is
  // say so loudly, because minting a token here would revoke the bridge's copy.
  if (isTokenExpired(memoryTokens.accessToken)) {
    logger.error(`[OmnifulAuth] The shared Omniful access token has expired (${tokenLifetimeDescription(memoryTokens.accessToken)}). This app does not rotate — run python/scripts/rotate_omniful_tokens.py in the bridge repo.`);
  }

  return memoryTokens.accessToken;
}
// endpoint, because a JWT's `exp` says nothing about server-side revocation.
async function probeOmnifulToken(token) {
  try {
    await axios.get(`${memoryTokens.baseUrl}/sales-channel/public/v1/tenants/sellers`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      params: { page: 1, per_page: 1 },
      timeout: 10000
    });
    return { ok: true, status: 200 };
  } catch (err) {
    return { ok: false, status: err.response ? err.response.status : "no response" };
  }
}

function upstreamMessage(res) {
  const body = res && res.data;
  if (!body) return "no response body";
  if (typeof body === "string") return body.slice(0, 300);
  return (body.error?.message || body.error_description || body.message || JSON.stringify(body)).slice(0, 300);
}

// Raised when Omniful authenticated the token but refused this particular request. It is NOT
// an auth error: no token change can fix it, so it must never reach a rotation path and must
// not abort a whole multi-seller sync.
class OmnifulPermissionError extends Error {
  constructor(message, response) {
    super(message);
    this.name = "OmnifulPermissionError";
    this.isPermissionError = true;
    this.response = response;
  }
}

// Executes Omniful HTTP requests with a per-attempt Bearer token, a re-read (never a rotation)
// on 401, and 429 rate-limit backoff.
async function omnifulRequest(config) {
  config.headers = config.headers || {};
  config.headers["Content-Type"] = config.headers["Content-Type"] || "application/json";

  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    // Built fresh every attempt. A header captured once outside this loop keeps sending the
    // replaced token after a rotation, so every retry 401s and asks for another rotation —
    // one of the two amplifiers that turned a single status update into 14 rotations.
    const token = await getOmnifulAccessToken();
    config.headers["Authorization"] = `Bearer ${token}`;

    try {
      return await axios(config);
    } catch (error) {
      const status = error.response ? error.response.status : null;

      if (status === 401 && attempt < maxAttempts) {
        // Re-read the shared token in case the bridge rotated it a moment ago. This is the
        // ONLY recovery available to us — minting a replacement here would revoke the copy
        // the bridge and every other consumer are using.
        logger.warn(`[OmnifulAuth] 401 from Omniful (attempt ${attempt}). Re-reading the shared token from Firestore; this app never rotates.`);
        const changed = await loadSharedToken({ force: true });
        if (changed) continue;

        // The token did not change, so ask Omniful directly whether it still accepts it. If it
        // does, this 401 was a permissions verdict on the specific resource — almost always a
        // seller code this tenant does not own — and retrying or rotating cannot help.
        const probe = await probeOmnifulToken(token);
        if (probe.ok) {
          throw new OmnifulPermissionError(
            `Omniful returned 401 for ${config.url || "this request"} but still accepts the token (${tokenLifetimeDescription(token)}). This is a permissions problem with the requested resource, not an expired credential, so no rotation was attempted.`,
            error.response
          );
        }

        throw new OmnifulAuthError(
          `Omniful rejected the shared access token (HTTP 401, ${tokenLifetimeDescription(token)}, fingerprint ${fingerprintToken(token)}). This app does not rotate — run python/scripts/rotate_omniful_tokens.py in the bridge repo, which updates ${AUTH_DOC[0]}/${AUTH_DOC[1]} for every consumer.`
        );
      }

      if (status === 401) {
        throw new OmnifulAuthError(
          `Omniful rejected the shared access token (HTTP 401, ${tokenLifetimeDescription(token)}) after ${attempt} attempts. Rotation is owned by the bridge — run python/scripts/rotate_omniful_tokens.py there.`
        );
      }

      // A 403 is a verdict on a token the server already authenticated, so it is the same class
      // of problem as a permissions 401 and is reported the same way.
      if (status === 403) {
        const detail = error.response && error.response.data ? upstreamMessage(error.response) : "no detail";
        throw new OmnifulPermissionError(
          `Omniful refused this request (HTTP 403): ${detail}. The token was accepted but this tenant is not permitted to make the call, so no rotation was attempted.`,
          error.response
        );
      }

      if (status === 429 && attempt < maxAttempts) {
        const retryAfterHeader = error.response.headers ? error.response.headers["retry-after"] : null;
        const waitMs = Math.min((parseInt(retryAfterHeader, 10) || attempt * 2) * 1000, 5000);
        logger.warn(`[OmnifulAuth] Rate limit (429) hit from Omniful. Waiting ${waitMs}ms before retry ${attempt}...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw error;
    }
  }
}

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

    const baseUrl = memoryTokens.baseUrl;
    const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
    const sellerCodes = sellers && sellers.length > 0 ? sellers : defaultSellerCodes;

    let allOrders = [];
    const failedSellers = [];

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

            const response = await omnifulRequest({
              method: "GET",
              url: fullUrl,
              params: queryParams,
              timeout: 15000
            });
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
        } catch (sellerErr) {
          // A permissions verdict means this tenant does not own this seller code. It is a
          // property of the seller, not of the credentials, so it degrades to a failed seller
          // rather than aborting — and above all it never reaches a rotation path.
          if (sellerErr.isPermissionError) {
            logger.warn(`[Omniful] Seller ${sellerCode} is not accessible to this tenant: ${sellerErr.message}`);
            failedSellers.push(sellerCode);
            return sellerOrders;
          }
          logger.error(`Error fetching orders for seller ${sellerCode}: ${sellerErr.message}`);
          // An auth failure is not "this seller has no orders" — let it reach the caller
          // instead of degrading into a silently empty, successful-looking response.
          if (sellerErr.isAuthError) throw sellerErr;
          failedSellers.push(sellerCode);
        }

        return sellerOrders;
      });

      const results = await Promise.all(sellerFetchPromises);
      for (const res of results) {
        allOrders.push(...res);
      }

      logger.info(`Successfully fetched a total of ${allOrders.length} orders across ${sellerCodes.length} sellers`);
      res.status(200).send({
        data: {
          orders: allOrders,
          ...(failedSellers.length > 0 ? { partial: true, failedSellers } : {})
        }
      });

    } catch (error) {
      logger.error("Error fetching orders", error.message);
      if (error.response) {
        logger.error("Server Response", error.response.data);
      }
      if (error.isAuthError) {
        res.status(502).send({
          data: {
            error: "Omniful authentication failed. The API credentials need to be renewed.",
            reason: "omniful_auth",
            detail: error.message
          }
        });
        return;
      }
      res.status(500).send({ data: { error: "Failed to fetch orders from the external API." } });
    }
  });
});

// ==========================================
// Seller roster (cached)
// ==========================================
// The roster changes a few times a year, but every page load was paying a cold start plus a
// live Omniful round trip for it — that is what made the sellers dropdown slow. Cache it in
// RTDB so any instance (and any of the two dashboards) can serve it without calling Omniful,
// and keep a per-instance copy so a warm instance skips the database read too.
// Kept in Firestore rather than RTDB: the runtime service account authenticates to Firestore
// but not to RTDB, and this cache sits on the critical path of every page load.
const SELLERS_CACHE_DOC = ["logestechs_config", "sellers_cache"];
const SELLERS_CACHE_TTL_MS = 10 * 60 * 1000;
let sellersMemoryCache = null; // { sellers, cachedAt }

function sellersCacheAge(entry) {
  return entry ? Date.now() - entry.cachedAt : Infinity;
}

async function readSellersCache() {
  // Only trust the in-process copy while it is fresh; once it ages out, another instance may
  // already have refreshed the shared copy, and re-reading is far cheaper than hitting Omniful.
  if (sellersMemoryCache && sellersCacheAge(sellersMemoryCache) < SELLERS_CACHE_TTL_MS) {
    return sellersMemoryCache;
  }

  try {
    const doc = await firestore.collection(SELLERS_CACHE_DOC[0]).doc(SELLERS_CACHE_DOC[1]).get();
    const data = doc.exists ? doc.data() : null;
    if (data && Array.isArray(data.sellers) && data.sellers.length > 0) {
      sellersMemoryCache = { sellers: data.sellers, cachedAt: data.cached_at || 0 };
    }
  } catch (err) {
    logger.warn(`[Sellers] Could not read the sellers cache: ${err.message}`);
  }

  return sellersMemoryCache;
}

async function writeSellersCache(sellers) {
  sellersMemoryCache = { sellers, cachedAt: Date.now() };
  try {
    await firestore.collection(SELLERS_CACHE_DOC[0]).doc(SELLERS_CACHE_DOC[1])
      .set({ sellers, cached_at: sellersMemoryCache.cachedAt });
  } catch (err) {
    logger.warn(`[Sellers] Could not write the sellers cache: ${err.message}`);
  }
}

// Returns { sellers, fromCache, ageMs, stale }. `force` bypasses the cache for a manual retry.
// A failed Omniful lookup falls back to the cached roster rather than emptying the dropdown —
// a stale seller list is far more useful here than an error state.
async function getSellersList({ force = false } = {}) {
  const cached = force ? null : await readSellersCache();
  if (cached && sellersCacheAge(cached) < SELLERS_CACHE_TTL_MS) {
    return { sellers: cached.sellers, fromCache: true, ageMs: sellersCacheAge(cached), stale: false };
  }

  try {
    const response = await omnifulRequest({
      method: "GET",
      url: `${memoryTokens.baseUrl}/sales-channel/public/v1/tenants/sellers`,
      params: { page: 1, per_page: 100, is_active: true, include_all_sellers: true },
      timeout: 15000
    });
    const sellers = response.data?.data || [];
    if (sellers.length > 0) await writeSellersCache(sellers);
    return { sellers, fromCache: false, ageMs: 0, stale: false };
  } catch (err) {
    const fallback = cached || sellersMemoryCache;
    if (fallback && fallback.sellers.length > 0) {
      logger.warn(`[Sellers] Omniful lookup failed (${err.message}); serving the cached roster instead.`);
      return { sellers: fallback.sellers, fromCache: true, ageMs: sellersCacheAge(fallback), stale: true };
    }
    throw err;
  }
}

exports.getSellers = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // ?refresh=1 is the manual escape hatch behind the dropdown's Retry button.
    const force = req.query.refresh === "1" || req.query.refresh === "true";

    try {
      const { sellers, fromCache, ageMs, stale } = await getSellersList({ force });

      // The roster is identical for every viewer, so let Hosting's CDN answer most of these
      // without ever waking the function — that removes the cold start, which was the bulk of
      // the wait. A forced refresh must never be cached, or Retry would return the same body.
      res.set('Cache-Control', force
        ? 'no-store'
        : 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400');
      res.status(200).send({ data: { sellers, cached: fromCache, ageMs, stale: !!stale } });
    } catch (error) {
      logger.error("Error fetching sellers list", error.message);
      if (error.isAuthError) {
        res.status(502).send({
          data: {
            error: "Omniful authentication failed. The API credentials need to be renewed.",
            reason: "omniful_auth",
            detail: error.message
          }
        });
        return;
      }
      const upstreamStatus = error.response ? error.response.status : null;
      res.status(502).send({
        data: {
          error: upstreamStatus
            ? `Omniful returned HTTP ${upstreamStatus} when listing sellers.`
            : `Could not reach Omniful: ${error.message}`,
          reason: "omniful_upstream",
          upstreamStatus
        }
      });
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
  const baseUrl = memoryTokens.baseUrl;

  const defaultSellerCodes = ["SEM", "BAM", "JS", "AA", "HOJ", "JAT"];
  let targetSellerCodes = sellerCodes && sellerCodes.length > 0 ? sellerCodes : null;

  // If no specific sellers requested, dynamically fetch ALL active sellers from Omniful
  if (!targetSellerCodes || targetSellerCodes.length === 0) {
    try {
      const { sellers: activeSellers } = await getSellersList();
      const fetchedCodes = activeSellers.map(s => s.code).filter(Boolean);
      if (fetchedCodes.length > 0) {
        targetSellerCodes = fetchedCodes;
        logger.info(`[COD Fetch] Dynamically fetched ${targetSellerCodes.length} active sellers: ${targetSellerCodes.join(', ')}`);
      }
    } catch (err) {
      if (err.isAuthError) throw err;
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

          const response = await omnifulRequest({
            method: "GET",
            url: fullUrl,
            params: queryParams,
            timeout: 15000
          });
          const orderData = response.data;
          const pageOrders = orderData.data || [];

          if (pageOrders.length === 0) break;

          let validOrders = [];

          for (const order of pageOrders) {
            order.tags = order.tags || [];
            order.custom_labels = order.custom_labels || [];
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
        // A permissions verdict means this tenant does not own this seller code — expected for
        // the hardcoded default roster, and never a reason to touch the credentials.
        if (sellerErr.isPermissionError) {
          logger.warn(`[COD Fetch] Seller ${sellerCode} is not accessible to this tenant (${fetchMode}): ${sellerErr.message}`);
          continue;
        }
        logger.error(`[COD Fetch] Error fetching ${fetchMode} orders for seller ${sellerCode}: ${sellerErr.message}`);
        // Credentials being rejected must abort the whole sync. Swallowing it here is what
        // made a dead token look like a successful sync that simply found no orders.
        if (sellerErr.isAuthError) throw sellerErr;
      }
    }

    return sellerOrders;
  });

  const results = await Promise.all(sellerFetchPromises);
  const uniqueOrdersMap = new Map();
  for (const sellerOrders of results) {
    for (const order of sellerOrders) {
      const rawId = order.order_id || order.id || order.order_alias || '';
      if (!rawId) continue;
      const idKey = String(rawId).trim();
      if (!uniqueOrdersMap.has(idKey)) {
        uniqueOrdersMap.set(idKey, order);
      } else {
        const existing = uniqueOrdersMap.get(idKey);
        const isCurDel = ((order.display_status || order.status_code || '').toString().toLowerCase().trim() === 'delivered');
        const isPrevDel = ((existing.display_status || existing.status_code || '').toString().toLowerCase().trim() === 'delivered');
        if (isCurDel && !isPrevDel) {
          uniqueOrdersMap.set(idKey, order);
        }
      }
    }
  }

  allOrders = Array.from(uniqueOrdersMap.values());

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

  // An order that has not been delivered is stored under its CREATED date, so once that
  // date falls out of the nightly window its status can never be refreshed again — it
  // stays frozen at whatever it was the night it first appeared. That is why orders sat
  // at "ready_to_ship" or "on_hold" here long after Omniful had moved them on. Reaching
  // back over the created dates of orders that may still be open keeps them current;
  // delivered orders are unaffected, since they are keyed by their delivery date.
  const OPEN_ORDER_LOOKBACK_DAYS = 14;
  const lookbackStart = new Date(ammanNow);
  lookbackStart.setDate(lookbackStart.getDate() - OPEN_ORDER_LOOKBACK_DAYS);
  const lookbackStartTs = new Date(`${formatDateStr(lookbackStart)}T00:00:00+03:00`).getTime();
  startTimestamp = Math.min(startTimestamp, lookbackStartTs);
  windowDescription += ` plus open orders back to ${formatDateStr(lookbackStart)}`;

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
      const status = error.isAuthError ? 502 : 500;
      res.status(status).send({
        data: {
          error: error.message,
          ...(error.isAuthError ? { reason: "omniful_auth" } : {})
        }
      });
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
      if (error.isAuthError) {
        res.status(502).send({ data: { error: "Omniful authentication failed. The API credentials need to be renewed.", reason: "omniful_auth", detail: error.message } });
        return;
      }
      res.status(500).send({ data: { error: "Failed to fetch COD orders from the external API." } });
    }
  });
});

// HTTP Endpoint: report Omniful authentication status. READ-ONLY BY DESIGN.
//
// The `force` and `hard` parameters this endpoint used to accept both called the grant
// endpoint, which revoked the bridge's copy of the token. They are gone. Rotation lives in the
// bridge repo's python/scripts/rotate_omniful_tokens.py and has no trigger here — if you are
// adding one back, you are re-creating the outage this endpoint exists to diagnose.
exports.refreshOmnifulAuth = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      // Always read through to Firestore: the whole point of a status check is to see what the
      // shared record actually holds right now, not what this instance cached.
      await loadSharedToken({ force: true });

      let token;
      try {
        token = await getOmnifulAccessToken();
      } catch (err) {
        if (err.isAuthError) {
          res.status(502).send({ data: { success: false, reason: "omniful_auth", message: err.message } });
          return;
        }
        throw err;
      }

      // A JWT that has not hit its `exp` can still be revoked server-side. Checking `exp` alone
      // reported a dead token as healthy, which hid a live outage — so actually call Omniful.
      const probe = await probeOmnifulToken(token);
      const exp = parseJwtExp(token);
      const refreshExp = parseJwtExp(memoryTokens.refreshToken);

      const message = probe.ok
        ? `Token is active and accepted by Omniful (${tokenLifetimeDescription(token)}). This app never rotates; the bridge owns rotation.`
        : `Omniful rejected the shared token (HTTP ${probe.status}, ${tokenLifetimeDescription(token)}). Run python/scripts/rotate_omniful_tokens.py in the bridge repo — it updates ${AUTH_DOC[0]}/${AUTH_DOC[1]} for every consumer, including this app.`;

      res.status(probe.ok ? 200 : 502).send({
        data: {
          success: probe.ok,
          message,
          rotatesHere: false,
          // "env" here is a warning sign, not a detail: it means the shared document could not
          // be read, so the next bridge rotation will not reach this app automatically.
          tokenSource: sharedTokenIsAuthoritative ? `firestore:${AUTH_DOC[0]}/${AUTH_DOC[1]}` : "env-fallback",
          tokenFingerprint: fingerprintToken(token),
          expiresAt: exp ? new Date(exp).toISOString() : null,
          refreshTokenExpiresAt: refreshExp ? new Date(refreshExp).toISOString() : null,
          isExpired: isTokenExpired(token),
          acceptedByOmniful: probe.ok,
          upstreamStatus: probe.status
        }
      });
    } catch (err) {
      logger.error("Error in refreshOmnifulAuth", err.message);
      res.status(500).send({ data: { success: false, error: err.message } });
    }
  });
});


