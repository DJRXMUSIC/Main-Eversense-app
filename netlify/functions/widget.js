import { getStore } from "@netlify/blobs";

const STORE_NAME = "glucose-data";
const WIDGET_KEY = "widget-data";

function authenticate(event) {
  const apiKey =
    event.headers.get("x-api-key") ||
    new URL(event.url).searchParams.get("key");
  if (!apiKey || apiKey !== process.env.SYNC_API_KEY) {
    return false;
  }
  return true;
}

// POST: PWA pushes current widget snapshot
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

  const widgetData = {
    iob: body.iob ?? 0,
    lastGlucose: body.lastGlucose ?? null,
    lastGlucoseTime: body.lastGlucoseTime ?? null,
    glucoseHistory: body.glucoseHistory ?? [],
    todayBasal: body.todayBasal ?? null,
    updatedAt: new Date().toISOString(),
  };

  const store = getStore(STORE_NAME);
  await store.setJSON(WIDGET_KEY, widgetData);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// GET: Scriptable widget fetches current snapshot
async function handleGet() {
  const store = getStore(STORE_NAME);
  const data = await store.get(WIDGET_KEY, { type: "json" });

  if (!data) {
    return new Response(
      JSON.stringify({
        iob: 0,
        lastGlucose: null,
        lastGlucoseTime: null,
        glucoseHistory: [],
        todayBasal: null,
        updatedAt: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
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
    return handleGet();
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  path: "/api/widget",
};
