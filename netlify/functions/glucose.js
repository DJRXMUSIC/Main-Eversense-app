import { getStore } from "@netlify/blobs";

const STORE_NAME = "glucose-data";
const READINGS_KEY = "readings";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function generateId() {
  return crypto.randomUUID();
}

function authenticate(event) {
  const apiKey =
    event.headers.get("x-api-key") ||
    new URL(event.url).searchParams.get("key");
  if (!apiKey || apiKey !== process.env.SYNC_API_KEY) {
    return false;
  }
  return true;
}

async function getReadings(store) {
  const data = await store.get(READINGS_KEY, { type: "json" });
  return Array.isArray(data) ? data : [];
}

async function saveReadings(store, readings) {
  // Enforce 30-day retention
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const filtered = readings.filter((r) => r.timestamp > cutoff);
  await store.setJSON(READINGS_KEY, filtered);
  return filtered;
}

// POST: Receive glucose data from Health Auto Export
async function handlePost(event) {
  let body;
  try {
    body = await event.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle both wrapper formats from Health Auto Export
  const metrics = body?.data?.metrics || body?.metrics;
  if (!metrics || !Array.isArray(metrics)) {
    return new Response(
      JSON.stringify({ error: "No metrics found in payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Find blood_glucose metric
  const glucoseMetric = metrics.find(
    (m) => m.name === "blood_glucose" || m.name === "Blood Glucose"
  );
  if (!glucoseMetric || !Array.isArray(glucoseMetric.data)) {
    return new Response(
      JSON.stringify({ error: "No blood_glucose metric found" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Transform to internal format
  const newReadings = glucoseMetric.data.map((r) => ({
    id: generateId(),
    timestamp: new Date(r.date).toISOString(),
    value: Math.round(r.qty),
    source: "auto-sync",
  }));

  const store = getStore(STORE_NAME);
  const existing = await getReadings(store);

  // Deduplicate by timestamp + value
  const existingKeys = new Set(
    existing.map((r) => `${r.timestamp}_${r.value}`)
  );
  let imported = 0;
  let duplicates = 0;

  for (const reading of newReadings) {
    const key = `${reading.timestamp}_${reading.value}`;
    if (existingKeys.has(key)) {
      duplicates++;
    } else {
      existing.push(reading);
      existingKeys.add(key);
      imported++;
    }
  }

  // Sort by timestamp and save
  existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const saved = await saveReadings(store, existing);

  return new Response(
    JSON.stringify({
      success: true,
      imported,
      duplicates,
      total: saved.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// GET: Return stored readings for PWA sync
async function handleGet(event) {
  const url = new URL(event.url);
  const since = url.searchParams.get("since");

  const store = getStore(STORE_NAME);
  let readings = await getReadings(store);

  if (since) {
    readings = readings.filter((r) => r.timestamp > since);
  }

  return new Response(
    JSON.stringify({
      readings,
      count: readings.length,
      oldestTimestamp: readings.length > 0 ? readings[0].timestamp : null,
      newestTimestamp:
        readings.length > 0 ? readings[readings.length - 1].timestamp : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export default async function handler(event) {
  // CORS headers for PWA
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

  if (!authenticate(event)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (event.method === "POST") {
    return handlePost(event);
  }

  if (event.method === "GET") {
    return handleGet(event);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  path: "/api/glucose",
};
