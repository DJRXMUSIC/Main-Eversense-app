import { getStore } from "@netlify/blobs";

/**
 * Manual DMS trigger — the PWA calls this to pull fresh readings from
 * the Eversense DMS cloud.  Returns the readings directly in the response
 * so the frontend can store them immediately (no second round-trip needed).
 *
 * GET /api/dms-trigger?key=<API_KEY>&action=poll   → fetch + return readings
 * GET /api/dms-trigger?key=<API_KEY>&action=status → config check only
 */

// Known DMS domains and auth paths.
// /connect/token = IdentityServer4 (Duende) — the standard .NET OAuth server.
// /token and /oauth/token also return 405 — likely aliases.
const DMS_HOSTS = [
  "https://us.eversensedms.com",
  "https://global.eversensedms.com",
];

// Client IDs to try — the old Android app creds may have been revoked,
// the Eversense 365 app likely uses new ones.
const CLIENT_CREDS = [
  { id: "eversenseMMAAndroid", secret: "6ksPx#]~wQ3U" },
  { id: "eversense365", secret: "" },
  { id: "eversense_mobile", secret: "" },
  { id: "EversenseDMS", secret: "" },
];

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
  const errors = [];

  // The 405 paths (/token, /connect/token, /oauth/token) exist but reject our POST.
  // Try multiple strategies: different client creds, Origin header, scope param, JSON body.
  const authPaths = ["/connect/token", "/token", "/oauth/token"];

  for (const host of DMS_HOSTS) {
    for (const cred of CLIENT_CREDS) {
      for (const path of authPaths) {
        // Form-encoded OAuth2 with Origin header and scope
        try {
          const params = {
            grant_type: "password",
            client_id: cred.id,
            username: email,
            password: password,
          };
          if (cred.secret) params.client_secret = cred.secret;
          // IdentityServer4 often requires scope
          params.scope = "openid profile offline_access";

          const r = await fetch(`${host}${path}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Origin": host,
              "Accept": "application/json",
            },
            body: new URLSearchParams(params).toString(),
          });
          const txt = await r.text();
          if (r.ok) {
            const data = JSON.parse(txt);
            return {
              accessToken: data.access_token || data.token || data.accessToken,
              expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
              dmsBase: host,
            };
          }
          // Strip HTML, keep short excerpt for diagnostics
          const excerpt = txt.replace(/<[^>]*>/g, "").trim().slice(0, 40);
          errors.push(`${path}[${cred.id}]:${r.status}${excerpt ? " " + excerpt : ""}`);
        } catch {
          errors.push(`${path}[${cred.id}]:net`);
        }
      }
    }

    // Also try JSON body on /connect/token (some IdentityServer configs accept it)
    for (const path of ["/connect/token", "/api/auth/login", "/api/account/login"]) {
      try {
        const r = await fetch(`${host}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": host,
            "Accept": "application/json",
          },
          body: JSON.stringify({
            grant_type: "password",
            client_id: CLIENT_CREDS[0].id,
            client_secret: CLIENT_CREDS[0].secret,
            username: email,
            password: password,
            email: email,
          }),
        });
        const txt = await r.text();
        if (r.ok) {
          const data = JSON.parse(txt);
          return {
            accessToken: data.access_token || data.token || data.accessToken,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            dmsBase: host,
          };
        }
        const excerpt = txt.replace(/<[^>]*>/g, "").trim().slice(0, 40);
        errors.push(`${path}[json]:${r.status}${excerpt ? " " + excerpt : ""}`);
      } catch {
        errors.push(`${path}[json]:net`);
      }
    }
  }

  throw new Error(`Auth failed: ${errors.join(", ")}`);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export const config = { path: "/api/dms-trigger" };

export default async function handler(event) {
  if (event.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const email = process.env.EVERSENSE_EMAIL;
  const password = process.env.EVERSENSE_PASSWORD;
  const syncKey = process.env.SYNC_API_KEY;
  const url = new URL(event.url);
  const key = url.searchParams.get("key");

  if (!email || !password) {
    return jsonResponse({ success: false, configured: false, error: "EVERSENSE_EMAIL/PASSWORD not set" }, 200);
  }

  if (!syncKey || key !== syncKey) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 403);
  }

  const store = getStore(STORE_NAME);
  const action = url.searchParams.get("action") || "poll";

  if (action === "status") {
    const state = await store.get(DMS_STATE_KEY, { type: "json" }).catch(() => null);
    return jsonResponse({
      configured: true,
      hasToken: !!(state?.accessToken),
      userId: state?.userId || null,
      tokenExpires: state?.expiresAt ? new Date(state.expiresAt).toISOString() : null,
    });
  }

  // --- Full poll ---
  const debug = [];
  try {
    let state = (await store.get(DMS_STATE_KEY, { type: "json" }).catch(() => null)) || {};

    // Always re-auth if token expires within 5 minutes (be aggressive)
    const tokenStale = !state.accessToken || !state.expiresAt || Date.now() > state.expiresAt - 5 * 60 * 1000;
    if (tokenStale) {
      debug.push("authenticating");
      const auth = await authenticate(email, password);
      state.accessToken = auth.accessToken;
      state.expiresAt = auth.expiresAt;
      state.dmsBase = auth.dmsBase;
      debug.push(`api: ${auth.dmsBase}`);

      const profileRes = await fetch(`${auth.dmsBase}/api/care/GetUserProfile`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
      const profiles = await profileRes.json();
      debug.push(`profiles: ${JSON.stringify(profiles).slice(0, 200)}`);
      state.userId = profiles[0]?.UserID;
      // Some accounts use PatientId for the patient history endpoint
      state.patientId = profiles[0]?.PatientId || profiles[0]?.PatientID || profiles[0]?.UserID;
    }

    const base = state.dmsBase || DMS_HOSTS[0];
    const authHeaders = { Authorization: `Bearer ${state.accessToken}` };
    const now = new Date();
    const historyStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours

    // --- Fetch from all available endpoints in parallel ---
    const fetches = [];

    // 1) Current value
    fetches.push(
      fetch(`${base}/api/care/GetCurrentValues?FollowerUserID=${state.userId}`, { headers: authHeaders })
        .then(async (r) => {
          if (!r.ok) { debug.push(`current: HTTP ${r.status}`); return []; }
          const data = await r.json();
          debug.push(`current: ${Array.isArray(data) ? data.length : 0} items`);
          return (Array.isArray(data) ? data : [])
            .filter((d) => d.CurrentGlucose > 0 && d.CurrentGlucose <= 500)
            .map((d) => ({
              value: Math.round(d.CurrentGlucose),
              timestamp: normalizeTimestamp(d.TimeStamp),
              direction: TREND_MAP[d.GlucoseTrend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch((err) => { debug.push(`current err: ${err.message}`); return []; })
    );

    // 2) Follower history endpoint
    fetches.push(
      fetch(
        `${base}/api/care/GetFollowingUserSensorGlucose?UserID=${state.userId}&startDate=${fmtDate(historyStart)}&endDate=${fmtDate(now)}`,
        { headers: authHeaders }
      )
        .then(async (r) => {
          if (!r.ok) { debug.push(`follower-history: HTTP ${r.status}`); return []; }
          const data = await r.json();
          debug.push(`follower-history: ${Array.isArray(data) ? data.length : 0} items`);
          return (Array.isArray(data) ? data : [])
            .filter((d) => d.Value > 0 && d.Value <= 500)
            .map((d) => ({
              value: Math.round(d.Value),
              timestamp: normalizeTimestamp(d.EventDate),
              direction: TREND_MAP[d.Trend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch((err) => { debug.push(`follower-history err: ${err.message}`); return []; })
    );

    // 3) Patient history endpoint (may work better for direct patient accounts)
    fetches.push(
      fetch(
        `${base}/api/care/GetPatientGlucoseValues?patientId=${state.patientId}&startDate=${fmtDate(historyStart)}&endDate=${fmtDate(now)}`,
        { headers: authHeaders }
      )
        .then(async (r) => {
          if (!r.ok) { debug.push(`patient-history: HTTP ${r.status}`); return []; }
          const data = await r.json();
          debug.push(`patient-history: ${Array.isArray(data) ? data.length : 0} items`);
          return (Array.isArray(data) ? data : [])
            .filter((d) => (d.Value || d.GlucoseValue) > 0 && (d.Value || d.GlucoseValue) <= 500)
            .map((d) => ({
              value: Math.round(d.Value || d.GlucoseValue),
              timestamp: normalizeTimestamp(d.EventDate || d.TimeStamp || d.Date),
              direction: TREND_MAP[d.Trend || d.GlucoseTrend] || "NONE",
            }))
            .filter((d) => d.timestamp);
        })
        .catch((err) => { debug.push(`patient-history err: ${err.message}`); return []; })
    );

    const results = await Promise.all(fetches);
    const allReadings = results.flat();

    // Deduplicate by timestamp
    const seen = new Map();
    for (const r of allReadings) {
      if (!seen.has(r.timestamp)) seen.set(r.timestamp, r);
    }
    const unique = [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    debug.push(`unique: ${unique.length}`);
    if (unique.length === 0) {
      debug.push("no readings from any endpoint");
    }

    // Persist to blob store for the background poller / widget fallback
    const blobData = await store.get(READINGS_KEY, { type: "json" }).catch(() => null);
    const existing = Array.isArray(blobData) ? blobData : [];
    const existingKeys = new Set(existing.map((r) => r.timestamp));
    let imported = 0;
    for (const r of unique) {
      if (!existingKeys.has(r.timestamp)) {
        existing.push({
          id: crypto.randomUUID(),
          timestamp: r.timestamp,
          date: r.timestamp.split("T")[0],
          value: r.value,
          source: "eversense-dms",
          direction: r.direction || null,
        });
        existingKeys.add(r.timestamp);
        imported++;
      }
    }
    existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const filtered = existing.filter((r) => r.timestamp > cutoff);
    await store.setJSON(READINGS_KEY, filtered);

    // Save state (token, userId, etc.)
    await store.setJSON(DMS_STATE_KEY, state);

    return jsonResponse({
      success: true,
      fetched: unique.length,
      imported,
      total: filtered.length,
      latest: unique.length > 0 ? unique[unique.length - 1].timestamp : null,
      readings: unique,
      debug,
    });
  } catch (err) {
    debug.push(`fatal: ${err.message}`);

    // Clear token on auth failure
    try {
      const state = (await store.get(DMS_STATE_KEY, { type: "json" }).catch(() => null)) || {};
      state.accessToken = null;
      await store.setJSON(DMS_STATE_KEY, state);
    } catch {}

    return jsonResponse({ success: false, configured: true, error: err.message, debug }, 500);
  }
}
