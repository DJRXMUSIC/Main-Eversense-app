import { addGlucoseReadings, getAllGlucoseReadings } from './db';

const API_PATH = '/api/glucose';
const NS_API_PATH = '/api/v1/entries/sgv.json';
const WIDGET_PATH = '/api/widget';

function getApiKey() {
  return import.meta.env.VITE_SYNC_API_KEY;
}

/**
 * Sync glucose readings from the appropriate backend source.
 * dataSource: 'health-export' | 'nightscout-local' | 'nightscout' | 'xdrip'
 */
export async function syncGlucoseReadings(dataSource = 'health-export', nightscoutUrl = null) {
  const apiKey = getApiKey();

  // External Nightscout or xDrip+ web service
  if ((dataSource === 'nightscout' || dataSource === 'xdrip') && nightscoutUrl) {
    return syncFromNightscout(nightscoutUrl, apiKey);
  }

  // Our own Nightscout-compatible endpoint (ESEL → xDrip+ → NSClient → our server)
  if (dataSource === 'nightscout-local') {
    return syncFromOwnNightscout(apiKey);
  }

  // Default: Health Auto Export endpoint
  return syncFromHealthExport(apiKey);
}

async function syncFromHealthExport(apiKey) {
  if (!apiKey) {
    return { imported: 0, skipped: 0, error: 'No API key configured' };
  }

  const existing = await getAllGlucoseReadings();
  let since = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    since = sorted[0].timestamp;
  }

  const url = new URL(API_PATH, window.location.origin);
  url.searchParams.set('key', apiKey);
  if (since) {
    url.searchParams.set('since', since);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  const { readings } = await response.json();
  if (!readings || readings.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}

/**
 * Sync from our own Nightscout-compatible endpoint.
 * ESEL → xDrip+ → NSClient uploads to /api/v1/entries, PWA reads back.
 */
async function syncFromOwnNightscout(apiKey) {
  if (!apiKey) {
    return { imported: 0, skipped: 0, error: 'No API key configured' };
  }

  const existing = await getAllGlucoseReadings();
  let sinceMs = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    sinceMs = new Date(sorted[0].timestamp).getTime() - 5 * 60 * 1000;
  }

  const url = new URL(NS_API_PATH, window.location.origin);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('count', '288');
  if (sinceMs) {
    url.searchParams.set('find[date][$gte]', String(sinceMs));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nightscout sync failed: ${response.status}`);
  }

  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const readings = entries
    .filter(e => e.sgv && e.date)
    .map(e => {
      const ts = new Date(e.date);
      ts.setSeconds(0, 0);
      return {
        id: crypto.randomUUID(),
        timestamp: ts.toISOString(),
        date: ts.toISOString().split('T')[0],
        value: Math.round(e.sgv),
        source: 'nightscout',
        direction: e.direction || null,
      };
    });

  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}

/**
 * Sync from external Nightscout instance or xDrip+ local web service.
 * Nightscout: https://your-ns.example.com/api/v1/entries/sgv.json
 * xDrip+:    http://192.168.x.x:17580/sgv.json
 */
async function syncFromNightscout(baseUrl, apiKey) {
  const existing = await getAllGlucoseReadings();
  let sinceMs = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    sinceMs = new Date(sorted[0].timestamp).getTime() - 5 * 60 * 1000;
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Invalid Nightscout URL');
  }

  if (!url.pathname.includes('/entries') && !url.pathname.includes('/sgv')) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1/entries/sgv.json';
  }

  url.searchParams.set('count', '288');
  if (sinceMs) {
    url.searchParams.set('find[date][$gte]', String(sinceMs));
  }

  const headers = {};
  if (apiKey) {
    headers['api-secret'] = apiKey;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Nightscout sync failed: ${response.status}`);
  }

  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const readings = entries
    .filter(e => (e.sgv || e.glucose) && (e.date || e.dateString))
    .map(e => {
      const ts = new Date(e.date || e.dateString);
      ts.setSeconds(0, 0);
      return {
        id: crypto.randomUUID(),
        timestamp: ts.toISOString(),
        date: ts.toISOString().split('T')[0],
        value: Math.round(e.sgv || e.glucose),
        source: 'nightscout',
        direction: e.direction || null,
      };
    });

  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}

export async function pushWidgetData({ iob, glucoseData, todayBasal }) {
  const apiKey = getApiKey();
  if (!apiKey) return;

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const recentGlucose = glucoseData
    .filter(r => r.timestamp >= threeHoursAgo)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(r => ({ t: r.timestamp, v: r.value }));

  const lastReading = recentGlucose.length > 0 ? recentGlucose[recentGlucose.length - 1] : null;

  const payload = {
    iob: Math.round(iob * 10) / 10,
    lastGlucose: lastReading ? lastReading.v : null,
    lastGlucoseTime: lastReading ? lastReading.t : null,
    glucoseHistory: recentGlucose,
    todayBasal: todayBasal ? todayBasal.units : null,
  };

  try {
    const url = new URL(WIDGET_PATH, window.location.origin);
    url.searchParams.set('key', apiKey);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Widget push failed:', err);
  }
}
