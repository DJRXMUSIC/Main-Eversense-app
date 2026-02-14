import { getStore } from "@netlify/blobs";

/**
 * Nightscout-compatible API endpoint for ESEL, xDrip+, and other CGM uploaders.
 *
 * Supports:
 *   POST /api/v1/entries     — Upload SGV entries (Nightscout format)
 *   GET  /api/v1/entries     — Fetch SGV entries (Nightscout format)
 *   GET  /api/v1/entries/sgv — Alias for GET entries filtered to sgv type
 *
 * Authentication via:
 *   - x-api-secret header (SHA1 hash of API_SECRET, or plain text for simplicity)
 *   - ?token= query parameter
 *   - ?key= query parameter (backwards compat with existing sync)
 *
 * ESEL/xDrip+ data flow:
 *   Eversense → ESEL → xDrip+/NSClient → Nightscout API (this endpoint) → PWA
 */

const STORE_NAME = "glucose-data";
const NS_READINGS_KEY = "readings"; // Share the same store as glucose.js

function authenticate(event) {
  const url = new URL(event.url);

  // Check multiple auth methods
  const apiSecret = event.headers.get("api-secret") || event.headers.get("x-api-secret");
  const token = url.searchParams.get("token");
  const key = url.searchParams.get("key");

  const expected = process.env.SYNC_API_KEY;
  if (!expected) return false;

  // Accept plain API key or the key itself as the "secret"
  if (apiSecret === expected) return true;
  if (token === expected) return true;
  if (key === expected) return true;

  return false;
}

async function getReadings(store) {
  const data = await store.get(NS_READINGS_KEY, { type: "json" });
  return Array.isArray(data) ? data : [];
}

async function saveReadings(store, readings) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const filtered = readings.filter((r) => r.timestamp > cutoff);
  filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await store.setJSON(NS_READINGS_KEY, filtered);
  return filtered;
}

function normalizeTimestamp(dateInput) {
  try {
    let d;
    if (typeof dateInput === "number") {
      // Unix epoch milliseconds (Nightscout/ESEL format)
      d = new Date(dateInput);
    } else {
      d = new Date(dateInput);
    }
    d.setSeconds(0, 0);
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Convert a Nightscout SGV entry to our internal format.
 * Nightscout format: { type: "sgv", date: 1526817691000, sgv: 158, direction: "SingleUp" }
 */
function nightscoutToInternal(entry) {
  const timestamp = normalizeTimestamp(entry.date || entry.dateString);
  if (!timestamp) return null;

  const value = entry.sgv || entry.mbg || entry.glucose;
  if (value == null || isNaN(value) || value < 20 || value > 600) return null;

  return {
    id: crypto.randomUUID(),
    timestamp,
    date: timestamp.split("T")[0],
    value: Math.round(value),
    source: "nightscout",
    direction: entry.direction || null,
  };
}

/**
 * Convert our internal format to Nightscout SGV entry.
 */
function internalToNightscout(reading) {
  return {
    type: "sgv",
    date: new Date(reading.timestamp).getTime(),
    dateString: reading.timestamp,
    sgv: reading.value,
    direction: reading.direction || "NONE",
    device: "Supercharged",
  };
}

// POST: Receive entries (Nightscout format)
async function handlePost(event) {
  let body;
  try {
    body = await event.json();
  } catch {
    return jsonResponse({ status: [{ code: 400, message: "Invalid JSON" }] }, 400);
  }

  // Accept single entry or array
  const entries = Array.isArray(body) ? body : [body];

  const store = getStore(STORE_NAME);
  const existing = await getReadings(store);
  const existingKeys = new Set(existing.map((r) => normalizeTimestamp(r.timestamp)));

  let imported = 0;
  let duplicates = 0;

  for (const entry of entries) {
    // Only process SGV type (skip cal, mbg, etc.)
    if (entry.type && entry.type !== "sgv") continue;

    const reading = nightscoutToInternal(entry);
    if (!reading) continue;

    const key = normalizeTimestamp(reading.timestamp);
    if (key && existingKeys.has(key)) {
      duplicates++;
    } else if (key) {
      existing.push(reading);
      existingKeys.add(key);
      imported++;
    }
  }

  const saved = await saveReadings(store, existing);

  return jsonResponse({
    status: [{ code: 200, message: "OK" }],
    imported,
    duplicates,
    total: saved.length,
  });
}

// GET: Return entries (Nightscout format)
async function handleGet(event) {
  const url = new URL(event.url);
  const count = parseInt(url.searchParams.get("count")) || 10;
  const since = url.searchParams.get("find[date][$gte]") || url.searchParams.get("since");

  const store = getStore(STORE_NAME);
  let readings = await getReadings(store);

  // Filter by date if requested
  if (since) {
    const sinceTs = typeof since === "string" && since.match(/^\d+$/)
      ? new Date(parseInt(since)).toISOString()
      : new Date(since).toISOString();
    readings = readings.filter((r) => r.timestamp >= sinceTs);
  }

  // Sort newest first (Nightscout convention) and limit
  readings.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  readings = readings.slice(0, count);

  // Convert to Nightscout format
  const nsEntries = readings.map(internalToNightscout);

  return jsonResponse(nsEntries);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, api-secret, x-api-secret",
    },
  });
}

export default async function handler(event) {
  if (event.method === "OPTIONS") {
    return jsonResponse("", 204);
  }

  if (!authenticate(event)) {
    return jsonResponse({ status: [{ code: 401, message: "Unauthorized" }] }, 401);
  }

  if (event.method === "POST") {
    return handlePost(event);
  }

  if (event.method === "GET") {
    return handleGet(event);
  }

  return jsonResponse({ status: [{ code: 405, message: "Method not allowed" }] }, 405);
}

export const config = {
  path: ["/api/v1/entries", "/api/v1/entries/*", "/api/v1/entries/sgv", "/api/v1/entries/sgv.json"],
};
