import { getStore } from "@netlify/blobs";

/**
 * Manual trigger for DMS poller — allows the PWA to request an immediate
 * pull from Eversense DMS (instead of waiting for the 5-min scheduled run).
 *
 * GET /api/dms-trigger?key=<API_KEY>
 *
 * Also serves as a status check — returns the latest poller state.
 */

const DMS_BASE = "https://apiservice.eversensedms.com";
const DMS_TOKEN_URL = `${DMS_BASE}/token`;
const DMS_PROFILE_URL = `${DMS_BASE}/api/care/GetUserProfile`;
const DMS_CURRENT_URL = `${DMS_BASE}/api/care/GetCurrentValues`;
const DMS_HISTORY_URL = `${DMS_BASE}/api/care/GetFollowingUserSensorGlucose`;

const CLIENT_ID = "eversenseMMAAndroid";
const CLIENT_SECRET = "6ksPx#]~wQ3U";

const STORE_NAME = "glucose-data";
const READINGS_KEY = "readings";
const DMS_STATE_KEY = "dms-poller-state";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const TREND_MAP = {
  1: "DoubleDown", 2: "SingleDown", 3: "FortyFiveDown",
  4: "Flat", 5: "FortyFiveUp", 6: "SingleUp", 7: "DoubleUp",
};

function normalizeTimestamp(dateStr) {
  try {
    let ts = dateStr;
    if (!ts.endsWith("Z") && !ts.includes("+")) ts += "Z";
    const d = new Date(ts);
    d.setSeconds(0, 0);
    return d.toISOString();
  } catch { return null; }
}

function authenticate(email, password) {
  const body = new URLSearchParams({
    grant_type: "password", client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, username: email, password: password,
  });
  return fetch(DMS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`DMS auth failed: ${r.status}`);
    const data = await r.json();
    return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default async function handler(event) {
  if (event.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
      },
    });
  }

  // Auth
  const url = new URL(event.url);
  const key = url.searchParams.get("key") || event.headers.get("x-api-key");
  if (!key || key !== process.env.SYNC_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const email = process.env.EVERSENSE_EMAIL;
  const password = process.env.EVERSENSE_PASSWORD;

  if (!email || !password) {
    return jsonResponse({
      configured: false,
      error: "EVERSENSE_EMAIL or EVERSENSE_PASSWORD not set on server",
    });
  }

  // Check if this is just a status check
  const action = url.searchParams.get("action") || "poll";

  const store = getStore(STORE_NAME);

  if (action === "status") {
    const state = await store.get(DMS_STATE_KEY, { type: "json" }).catch(() => null);
    return jsonResponse({
      configured: true,
      hasToken: !!(state?.accessToken),
      userId: state?.userId || null,
      tokenExpires: state?.expiresAt ? new Date(state.expiresAt).toISOString() : null,
    });
  }

  // Full poll
  try {
    let state = (await store.get(DMS_STATE_KEY, { type: "json" }).catch(() => null)) || {};

    // Auth
    if (!state.accessToken || !state.expiresAt || Date.now() > state.expiresAt - 60000) {
      const auth = await authenticate(email, password);
      state.accessToken = auth.accessToken;
      state.expiresAt = auth.expiresAt;

      const profileRes = await fetch(DMS_PROFILE_URL, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
      const profiles = await profileRes.json();
      state.userId = profiles[0]?.UserID;
    }

    // Get current value
    const curRes = await fetch(`${DMS_CURRENT_URL}?FollowerUserID=${state.userId}`, {
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    const curData = curRes.ok ? await curRes.json() : [];

    // Get last 15 min history
    const now = new Date();
    const ago = new Date(now.getTime() - 15 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/\.\d+Z$/, "");
    const histRes = await fetch(
      `${DMS_HISTORY_URL}?UserID=${state.userId}&startDate=${fmt(ago)}&endDate=${fmt(now)}`,
      { headers: { Authorization: `Bearer ${state.accessToken}` } }
    );
    const histData = histRes.ok ? await histRes.json() : [];

    // Transform
    const readings = [];
    for (const d of (Array.isArray(curData) ? curData : [])) {
      if (d.CurrentGlucose > 0 && d.CurrentGlucose <= 500) {
        const ts = normalizeTimestamp(d.TimeStamp);
        if (ts) readings.push({ value: Math.round(d.CurrentGlucose), timestamp: ts, direction: TREND_MAP[d.GlucoseTrend] || "NONE" });
      }
    }
    for (const d of (Array.isArray(histData) ? histData : [])) {
      if (d.Value > 0 && d.Value <= 500) {
        const ts = normalizeTimestamp(d.EventDate);
        if (ts) readings.push({ value: Math.round(d.Value), timestamp: ts, direction: "NONE" });
      }
    }

    // Dedup
    const seen = new Set();
    const unique = readings.filter((r) => { if (seen.has(r.timestamp)) return false; seen.add(r.timestamp); return true; });

    // Store
    const existing = (await store.get(READINGS_KEY, { type: "json" })) || [];
    const existingKeys = new Set(existing.map((r) => r.timestamp));
    let imported = 0;
    for (const r of unique) {
      if (!existingKeys.has(r.timestamp)) {
        existing.push({ id: crypto.randomUUID(), timestamp: r.timestamp, date: r.timestamp.split("T")[0], value: r.value, source: "eversense-dms", direction: r.direction });
        existingKeys.add(r.timestamp);
        imported++;
      }
    }
    existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const filtered = existing.filter((r) => r.timestamp > cutoff);
    await store.setJSON(READINGS_KEY, filtered);

    await store.setJSON(DMS_STATE_KEY, state);

    return jsonResponse({
      success: true,
      configured: true,
      fetched: unique.length,
      imported,
      total: filtered.length,
      latest: unique.length > 0 ? unique[unique.length - 1] : null,
    });
  } catch (err) {
    return jsonResponse({ success: false, configured: true, error: err.message }, 500);
  }
}

export const config = {
  path: "/api/dms-trigger",
};
