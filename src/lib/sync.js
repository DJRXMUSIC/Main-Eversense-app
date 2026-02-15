import { addGlucoseReadings, getAllGlucoseReadings } from './db';
import { fetchNightscoutReadings } from './nightscout';

const API_PATH = '/api/glucose';
const NS_API_PATH = '/api/v1/entries/sgv.json';
const WIDGET_PATH = '/api/widget';
const DMS_TRIGGER_PATH = '/api/dms-trigger';

function getApiKey() {
  return import.meta.env.VITE_SYNC_API_KEY;
}

/**
 * Sync glucose readings from the configured data source(s).
 *
 * dataSource options:
 *   'health-export'     — Original Health Auto Export endpoint
 *   'eversense-dms'     — Trigger DMS poller, then fetch from our blob store
 *   'nightscout-local'  — Fetch from our Nightscout-compat endpoint
 *   'nightscout'        — Fetch from external Nightscout instance
 *   'xdrip'             — Fetch from xDrip+ local web service
 */
export async function syncGlucoseReadings(dataSource = 'health-export', nightscoutUrl = null) {
  const apiKey = getApiKey();

  // Eversense DMS: trigger server-side poll, then fetch results
  if (dataSource === 'eversense-dms') {
    return syncFromDMS(apiKey);
  }

  // External Nightscout or xDrip+ web service
  if ((dataSource === 'nightscout' || dataSource === 'xdrip') && nightscoutUrl) {
    return syncFromExternalNightscout(nightscoutUrl, apiKey);
  }

  // Our own Nightscout-compatible endpoint
  if (dataSource === 'nightscout-local') {
    return syncFromOwnNightscout(apiKey);
  }

  // Default: Health Auto Export
  return syncFromHealthExport(apiKey);
}

/**
 * Trigger the DMS poller on the server, then fetch the latest readings.
 */
async function syncFromDMS(apiKey) {
  if (!apiKey) return { imported: 0, skipped: 0, error: 'No API key configured' };

  // Step 1: Trigger DMS poll on server
  try {
    const triggerUrl = new URL(DMS_TRIGGER_PATH, window.location.origin);
    triggerUrl.searchParams.set('key', apiKey);
    triggerUrl.searchParams.set('action', 'poll');
    const triggerRes = await fetch(triggerUrl);
    if (triggerRes.ok) {
      const triggerData = await triggerRes.json();
      console.log('DMS trigger result:', triggerData);
    }
  } catch (err) {
    console.warn('DMS trigger failed (will still try fetch):', err.message);
  }

  // Step 2: Fetch readings from our glucose endpoint (DMS poller stores in same blob)
  return syncFromHealthExport(apiKey);
}

async function syncFromHealthExport(apiKey) {
  if (!apiKey) return { imported: 0, skipped: 0, error: 'No API key configured' };

  const existing = await getAllGlucoseReadings();
  let since = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    since = sorted[0].timestamp;
  }

  const url = new URL(API_PATH, window.location.origin);
  url.searchParams.set('key', apiKey);
  if (since) url.searchParams.set('since', since);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

  const { readings } = await response.json();
  if (!readings || readings.length === 0) return { imported: 0, skipped: 0 };

  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}

async function syncFromOwnNightscout(apiKey) {
  if (!apiKey) return { imported: 0, skipped: 0, error: 'No API key configured' };

  const existing = await getAllGlucoseReadings();
  let sinceMs = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    sinceMs = new Date(sorted[0].timestamp).getTime() - 5 * 60 * 1000;
  }

  const url = new URL(NS_API_PATH, window.location.origin);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('count', '288');
  if (sinceMs) url.searchParams.set('find[date][$gte]', String(sinceMs));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nightscout sync failed: ${response.status}`);

  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length === 0) return { imported: 0, skipped: 0 };

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
 * Sync from an external Nightscout instance or xDrip+ web service.
 */
async function syncFromExternalNightscout(baseUrl, apiKey) {
  const nsReadings = await fetchNightscoutReadings(baseUrl, 6, apiKey);
  if (nsReadings.length === 0) return { imported: 0, skipped: 0 };

  const readings = nsReadings.map(r => {
    const ts = new Date(r.timestamp);
    ts.setSeconds(0, 0);
    return {
      id: crypto.randomUUID(),
      timestamp: ts.toISOString(),
      date: ts.toISOString().split('T')[0],
      value: r.value,
      source: r.source || 'nightscout',
      direction: r.direction || null,
    };
  });

  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}

/**
 * Check DMS poller status on the server.
 */
export async function checkDMSStatus() {
  const apiKey = getApiKey();
  if (!apiKey) return { configured: false };

  try {
    const url = new URL(DMS_TRIGGER_PATH, window.location.origin);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('action', 'status');
    const res = await fetch(url);
    if (!res.ok) return { configured: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { configured: false, error: err.message };
  }
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
