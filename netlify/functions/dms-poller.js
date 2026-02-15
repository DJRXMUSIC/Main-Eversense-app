import { getStore } from "@netlify/blobs";

/**
 * Eversense DMS Poller — Scheduled Netlify Function
 *
 * Authenticates to the Eversense DMS cloud API, fetches current and recent
 * glucose readings, and stores them in Netlify Blobs (same store as glucose.js
 * and nightscout.js so the PWA can read them via GET /api/glucose).
 *
 * Data flow:
 *   Eversense Sensor → Eversense App → Eversense DMS Cloud → This Poller → Netlify Blobs → PWA
 *
 * API discovered from ESEL open-source project:
 *   https://github.com/BernhardRo/Esel
 *
 * Environment variables required:
 *   EVERSENSE_EMAIL    - Eversense account email
 *   EVERSENSE_PASSWORD - Eversense account password
 */

const DMS_BASE = "https://apiservice.eversensedms.com";
const DMS_TOKEN_URL = `${DMS_BASE}/token`;
const DMS_PROFILE_URL = `${DMS_BASE}/api/care/GetUserProfile`;
const DMS_CURRENT_URL = `${DMS_BASE}/api/care/GetCurrentValues`;
const DMS_HISTORY_URL = `${DMS_BASE}/api/care/GetFollowingUserSensorGlucose`;

// OAuth client credentials (from Eversense app, per ESEL source)
const CLIENT_ID = "eversenseMMAAndroid";
const CLIENT_SECRET = "6ksPx#]~wQ3U";

const STORE_NAME = "glucose-data";
const READINGS_KEY = "readings";
const DMS_STATE_KEY = "dms-poller-state";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Trend mapping: DMS trend integers → Nightscout direction strings
const TREND_MAP = {
  1: "DoubleDown",
  2: "SingleDown",
  3: "FortyFiveDown",
  4: "Flat",
  5: "FortyFiveUp",
  6: "SingleUp",
  7: "DoubleUp",
};

function normalizeTimestamp(dateStr) {
  try {
    // DMS returns timestamps like "2026-02-15T14:30:00" (no timezone)
    // Treat as UTC
    let ts = dateStr;
    if (!ts.endsWith("Z") && !ts.includes("+")) {
      ts += "Z";
    }
    const d = new Date(ts);
    d.setSeconds(0, 0);
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Authenticate with Eversense DMS OAuth endpoint
 */
async function authenticate(email, password) {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password: password,
  });

  const response = await fetch(DMS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DMS auth failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    expiresAt: Date.now() + data.expires_in * 1000,
    refreshToken: data.refresh_token,
  };
}

/**
 * Get user profile (needed for UserID)
 */
async function getUserProfile(accessToken) {
  const response = await fetch(DMS_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`DMS profile fetch failed: ${response.status}`);
  }

  const profiles = await response.json();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error("No user profile returned from DMS");
  }

  return profiles[0].UserID;
}

/**
 * Get current glucose value
 */
async function getCurrentValues(accessToken, userId) {
  const url = `${DMS_CURRENT_URL}?FollowerUserID=${userId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`DMS current values failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return [];

  return data
    .filter((d) => d.CurrentGlucose > 0 && d.CurrentGlucose <= 500)
    .map((d) => ({
      value: Math.round(
        Math.min(400, Math.max(d.CurrentGlucose < 40 ? 39 : d.CurrentGlucose, 39))
      ),
      timestamp: normalizeTimestamp(d.TimeStamp),
      direction: TREND_MAP[d.GlucoseTrend] || "NONE",
    }))
    .filter((d) => d.timestamp);
}

/**
 * Get historical glucose readings for a time range
 */
async function getHistoricalReadings(accessToken, userId, startDate, endDate) {
  const fmt = (d) => d.toISOString().replace(/\.\d+Z$/, "");
  const url = `${DMS_HISTORY_URL}?UserID=${userId}&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`DMS history fetch failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((d) => d.Value > 0 && d.Value <= 500)
    .map((d) => ({
      value: Math.round(Math.min(400, Math.max(d.Value < 40 ? 39 : d.Value, 39))),
      timestamp: normalizeTimestamp(d.EventDate),
      direction: "NONE",
    }))
    .filter((d) => d.timestamp);
}

/**
 * Store readings into Netlify Blobs (same format as glucose.js)
 */
async function storeReadings(store, newReadings) {
  const data = await store.get(READINGS_KEY, { type: "json" });
  const existing = Array.isArray(data) ? data : [];

  const existingKeys = new Set(existing.map((r) => r.timestamp));
  let imported = 0;

  for (const reading of newReadings) {
    if (!existingKeys.has(reading.timestamp)) {
      existing.push({
        id: crypto.randomUUID(),
        timestamp: reading.timestamp,
        date: reading.timestamp.split("T")[0],
        value: reading.value,
        source: "eversense-dms",
        direction: reading.direction || null,
      });
      existingKeys.add(reading.timestamp);
      imported++;
    }
  }

  // Sort and enforce 30-day retention
  existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const filtered = existing.filter((r) => r.timestamp > cutoff);
  await store.setJSON(READINGS_KEY, filtered);

  return { imported, total: filtered.length };
}

/**
 * Load/save poller state (auth token, userId) across invocations
 */
async function getPollerState(store) {
  try {
    const state = await store.get(DMS_STATE_KEY, { type: "json" });
    return state || {};
  } catch {
    return {};
  }
}

async function savePollerState(store, state) {
  await store.setJSON(DMS_STATE_KEY, state);
}

export default async function handler() {
  const email = process.env.EVERSENSE_EMAIL;
  const password = process.env.EVERSENSE_PASSWORD;

  if (!email || !password) {
    console.log("DMS poller: EVERSENSE_EMAIL or EVERSENSE_PASSWORD not set, skipping");
    return new Response(
      JSON.stringify({ skipped: true, reason: "No credentials configured" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const store = getStore(STORE_NAME);
  let state = await getPollerState(store);

  try {
    // Re-authenticate if no token or expired
    if (!state.accessToken || !state.expiresAt || Date.now() > state.expiresAt - 60000) {
      console.log("DMS poller: authenticating...");
      const auth = await authenticate(email, password);
      state.accessToken = auth.accessToken;
      state.expiresAt = auth.expiresAt;

      // Get user profile for UserID
      state.userId = await getUserProfile(auth.accessToken);
      console.log(`DMS poller: authenticated, userId=${state.userId}`);
    }

    // Fetch current value
    const current = await getCurrentValues(state.accessToken, state.userId);

    // Fetch last 3 hours of history to backfill any gaps
    const now = new Date();
    const fifteenMinsAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const history = await getHistoricalReadings(
      state.accessToken,
      state.userId,
      fifteenMinsAgo,
      now
    );

    // Merge current + history readings
    const allReadings = [...current, ...history];

    // Deduplicate by timestamp
    const seen = new Set();
    const unique = allReadings.filter((r) => {
      if (seen.has(r.timestamp)) return false;
      seen.add(r.timestamp);
      return true;
    });

    // Store in Netlify Blobs
    const result = await storeReadings(store, unique);

    // Save state
    await savePollerState(store, state);

    console.log(
      `DMS poller: fetched ${unique.length} readings, imported ${result.imported}, total stored ${result.total}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        fetched: unique.length,
        imported: result.imported,
        total: result.total,
        latestTimestamp: unique.length > 0 ? unique[unique.length - 1].timestamp : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("DMS poller error:", err.message);

    // If auth failed, clear token so next run re-authenticates
    if (err.message.includes("auth failed") || err.message.includes("401")) {
      state.accessToken = null;
      state.expiresAt = null;
      await savePollerState(store, state);
    }

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Run every 5 minutes
export const config = {
  schedule: "*/5 * * * *",
};
