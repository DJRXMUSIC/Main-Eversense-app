/**
 * Server-side proxy for xDrip+ local web service requests.
 *
 * The PWA runs on HTTPS (Netlify), so it cannot directly fetch from
 * http://127.0.0.1:17580 (mixed-content block). This function proxies
 * those requests server-side where there is no such restriction.
 *
 * Usage: GET /api/bg/proxy?url=http://127.0.0.1:17580/sgv.json&count=500
 */

function authenticate(event) {
  const url = new URL(event.url);
  const key =
    event.headers.get("x-api-key") ||
    url.searchParams.get("key");
  if (!key || key !== process.env.SYNC_API_KEY) return false;
  return true;
}

export default async function handler(event) {
  if (event.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  if (event.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URL(event.url).searchParams;
  const targetUrl = params.get("url");

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only allow proxying to localhost/private IPs (xDrip+ web service)
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const host = parsed.hostname;
  const isLocal =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("172.16.") ||
    host === "::1";

  if (!isLocal) {
    return new Response(
      JSON.stringify({ error: "Proxy only supports local/private addresses" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15000),
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy fetch failed: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const config = {
  path: "/api/bg/proxy",
};
