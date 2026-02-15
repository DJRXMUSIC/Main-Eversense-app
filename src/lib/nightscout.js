/**
 * Nightscout API client for fetching glucose data from external Nightscout instances.
 *
 * Works with:
 *   - Standard Nightscout (cgm-remote-monitor)
 *   - Railway, Northflank, Render, Heroku, etc.
 *   - xDrip+ local web service (port 17580)
 */

const DIRECTION_MAP = {
  DoubleUp: 2,
  SingleUp: 1,
  FortyFiveUp: 0.5,
  Flat: 0,
  FortyFiveDown: -0.5,
  SingleDown: -1,
  DoubleDown: -2,
  'NOT COMPUTABLE': null,
  'RATE OUT OF RANGE': null,
};

/**
 * Fetch glucose readings from a Nightscout instance.
 */
export async function fetchNightscoutReadings(baseUrl, hours = 6, apiSecret = null) {
  if (!baseUrl) return [];

  const since = Date.now() - hours * 60 * 60 * 1000;

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    console.error('Invalid Nightscout URL:', baseUrl);
    return [];
  }

  // Ensure we hit the entries endpoint
  if (!url.pathname.includes('/entries') && !url.pathname.includes('/sgv')) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1/entries/sgv.json';
  }

  url.searchParams.set('find[date][$gte]', String(since));
  url.searchParams.set('count', '500');

  const headers = {};
  if (apiSecret) {
    // Nightscout expects SHA1 hash of the secret, but also accepts raw for simplicity
    headers['api-secret'] = apiSecret;
  }

  try {
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Nightscout fetch failed: ${response.status}`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) return [];

    return entries
      .filter(e => (e.sgv || e.glucose) && (e.date || e.dateString))
      .map(e => {
        const ts = new Date(e.date || e.dateString);
        return {
          timestamp: ts.toISOString(),
          value: Math.round(e.sgv || e.glucose),
          direction: e.direction || 'NONE',
          trend: DIRECTION_MAP[e.direction] ?? null,
          source: 'nightscout',
        };
      });
  } catch (err) {
    console.error('Nightscout fetch error:', err);
    return [];
  }
}

/**
 * Get the most recent reading from Nightscout.
 */
export async function getLatestNightscoutReading(baseUrl, apiSecret = null) {
  if (!baseUrl) return null;

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }

  url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1/entries/current.json';

  const headers = {};
  if (apiSecret) headers['api-secret'] = apiSecret;

  try {
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) return null;

    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry || !entry.sgv) return null;

    return {
      timestamp: new Date(entry.date || entry.dateString).toISOString(),
      value: Math.round(entry.sgv),
      direction: entry.direction || 'NONE',
      trend: DIRECTION_MAP[entry.direction] ?? null,
      source: 'nightscout',
    };
  } catch {
    return null;
  }
}

/**
 * Check Nightscout connectivity and API status.
 */
export async function checkNightscoutStatus(baseUrl) {
  if (!baseUrl) return { ok: false, error: 'No URL' };

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1/status.json';

  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const data = await response.json();
    return {
      ok: data.status === 'ok' && data.apiEnabled === true,
      name: data.name,
      version: data.version,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
