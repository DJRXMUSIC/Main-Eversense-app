import { getStore } from "@netlify/blobs";

/**
 * Eversense DMS Poller — Scheduled Netlify Function (every 5 min)
 *
 * Authenticates to the Eversense DMS cloud API, fetches current and recent
 * glucose readings, and stores them in Netlify Blobs so the PWA can read
 * them via GET /api/glucose or via the dms-trigger response.
 *
 * Tries multiple DMS endpoints (follower + patient) to maximise coverage.
 *
 * Environment variables required:
 *   EVERSENSE_EMAIL    - Eversense account email
 *   EVERSENSE_PASSWORD - Eversense account password
 */

const DMS_HOSTS = [
  "https://us.eversensedms.com",
  "https://global.eversensedms.com",
];
const AUTH_PATHS = ["/token", "/api/token", "/connect/token", "/oauth/token", "/api/v1/token"];

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
    if (!ts.endsWith("Z") && !ts.includes("+") && !ts.includes("-", 10)) {
      ts += "Z";
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    d.setSeconds(0, 0);
    return d.toISOString();
  } catch { return null; }
}

function fmtDate(d) {
  return d.toISOString().replace(/\.\d+Z$/, "");
}

async function authenticate(email, password) {
  const oauthBody = new URLSearchParams({
    grant_type: "password", client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, username: email, password: password,
  }).toString();
  const jsonBody = JSON.stringify({ email, password, username: email });

  const errors = [];
  for (const host of DMS_HOSTS) {
    for (const path of AUTH_PATHS) {
      try {
        const r = await fetch(`${host}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: oauthBody,
        });
        if (r.ok) {
          const data = await r.json();
          console.log(`DMS poller: authenticated via ${host}${path}`);
          return {
            accessToken: data.access_token || data.token || data.accessToken,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            dmsBase: host,
          };
        }
        errors.push(`${host}${path}[form]:${r.status}`);
      } catch (err) {
        errors.push(`${host}${path}[form]:dns/net`);
      }
    }
    for (const path of ["/api/auth/login", "/api/account/login", "/api/v1/auth"]) {
      try {
        const r = await fetch(`${host}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody,
        });
        if (r.ok) {
          const data = await r.json();
          console.log(`DMS poller: authenticated via ${host}${path} (JSON)`);
          return {
            accessToken: data.access_token || data.token || data.accessToken,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            dmsBase: host,
          };
        }
        errors.push(`${host}${path}[json]:${r.status}`);
      } catch (err) {
        errors.push(`${host}${path}[json]:dns/net`);
      }
    }
  }
  throw new Error(`All auth failed: ${errors.join(", ")}`);
}

async function getPollerState(store) {
  try {
    return (await store.get(DMS_STATE_KEY, { type: "json" })) || {};
  } catch { return {}; }
}

async function savePollerState(store, state) {
  await store.setJSON(DMS_STATE_KEY, state);
}

async function storeReadings(store, newReadings) {
  const data = await store.get(READINGS_KEY, { type: "json" }).catch(() => null);
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

  existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const filtered = existing.filter((r) => r.timestamp > cutoff);
  await store.setJSON(READINGS_KEY, filtered);
  return { imported, total: filtered.length };
}

export default async function handler() {
  const email = process.env.EVERSENSE_EMAIL;
  const password = process.env.EVERSENSE_PASSWORD;

  if (!email || !password) {
    console.log("DMS poller: credentials not set, skipping");
    return new Response(
      JSON.stringify({ skipped: true, reason: "No credentials configured" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const store = getStore(STORE_NAME);
  let state = await getPollerState(store);

  try {
    // Re-auth if token is missing or expires within 5 minutes
    if (!state.accessToken || !state.expiresAt || Date.now() > state.expiresAt - 5 * 60 * 1000) {
      console.log("DMS poller: authenticating...");
      const auth = await authenticate(email, password);
      state.accessToken = auth.accessToken;
      state.expiresAt = auth.expiresAt;
      state.dmsBase = auth.dmsBase;

      const profileRes = await fetch(`${auth.dmsBase}/api/care/GetUserProfile`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
      const profiles = await profileRes.json();
      state.userId = profiles[0]?.UserID;
      state.patientId = profiles[0]?.PatientId || profiles[0]?.PatientID || profiles[0]?.UserID;
      console.log(`DMS poller: authenticated, userId=${state.userId}`);
    }

    const base = state.dmsBase || DMS_HOSTS[0];
    const authHeaders = { Authorization: `Bearer ${state.accessToken}` };
    const now = new Date();
    const historyStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch all endpoints in parallel
    const [currentReadings, followerReadings, patientReadings] = await Promise.all([
      // Current value
      fetch(`${base}/api/care/GetCurrentValues?FollowerUserID=${state.userId}`, { headers: authHeaders })
        .then(async (r) => {
          if (!r.ok) return [];
          const data = await r.json();
          return (Array.isArray(data) ? data : [])
            .filter((d) => d.CurrentGlucose > 0 && d.CurrentGlucose <= 500)
            .map((d) => ({
              value: Math.round(d.CurrentGlucose),
              timestamp: normalizeTimestamp(d.TimeStamp),
              direction: TREND_MAP[d.GlucoseTrend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch(() => []),

      // Follower history
      fetch(
        `${base}/api/care/GetFollowingUserSensorGlucose?UserID=${state.userId}&startDate=${fmtDate(historyStart)}&endDate=${fmtDate(now)}`,
        { headers: authHeaders }
      )
        .then(async (r) => {
          if (!r.ok) return [];
          const data = await r.json();
          return (Array.isArray(data) ? data : [])
            .filter((d) => d.Value > 0 && d.Value <= 500)
            .map((d) => ({
              value: Math.round(d.Value),
              timestamp: normalizeTimestamp(d.EventDate),
              direction: TREND_MAP[d.Trend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch(() => []),

      // Patient history
      fetch(
        `${base}/api/care/GetPatientGlucoseValues?patientId=${state.patientId}&startDate=${fmtDate(historyStart)}&endDate=${fmtDate(now)}`,
        { headers: authHeaders }
      )
        .then(async (r) => {
          if (!r.ok) return [];
          const data = await r.json();
          return (Array.isArray(data) ? data : [])
            .filter((d) => (d.Value || d.GlucoseValue) > 0 && (d.Value || d.GlucoseValue) <= 500)
            .map((d) => ({
              value: Math.round(d.Value || d.GlucoseValue),
              timestamp: normalizeTimestamp(d.EventDate || d.TimeStamp || d.Date),
              direction: TREND_MAP[d.Trend || d.GlucoseTrend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch(() => []),
    ]);

    // Merge + dedup
    const allReadings = [...currentReadings, ...followerReadings, ...patientReadings];
    const seen = new Set();
    const unique = allReadings.filter((r) => {
      if (seen.has(r.timestamp)) return false;
      seen.add(r.timestamp);
      return true;
    });

    const result = await storeReadings(store, unique);
    await savePollerState(store, state);

    console.log(
      `DMS poller: fetched ${unique.length} readings (cur=${currentReadings.length} fol=${followerReadings.length} pat=${patientReadings.length}), imported ${result.imported}, total ${result.total}`
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
