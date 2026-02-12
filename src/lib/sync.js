import { addGlucoseReadings, getAllGlucoseReadings } from './db';

const API_PATH = '/api/glucose';

export async function syncGlucoseReadings() {
  const apiKey = import.meta.env.VITE_SYNC_API_KEY;
  if (!apiKey) {
    return { imported: 0, skipped: 0, error: 'No API key configured' };
  }

  // Get the most recent reading timestamp from IndexedDB
  const existing = await getAllGlucoseReadings();
  let since = null;
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    since = sorted[0].timestamp;
  }

  // Fetch new readings from backend
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

  // Import to IndexedDB (existing addGlucoseReadings handles dedup)
  const result = await addGlucoseReadings(readings);
  return { imported: result.added, skipped: result.skipped };
}
