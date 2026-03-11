import { openDB } from 'idb';

const DB_NAME = 'InsulinTrackerDB';
const DB_VERSION = 1;

let dbPromise = null;

function createDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('glucoseReadings')) {
        const glucoseStore = db.createObjectStore('glucoseReadings', { keyPath: 'id' });
        glucoseStore.createIndex('timestamp', 'timestamp', { unique: false });
        glucoseStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('bolusDoses')) {
        const bolusStore = db.createObjectStore('bolusDoses', { keyPath: 'id' });
        bolusStore.createIndex('timestamp', 'timestamp', { unique: false });
        bolusStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('basalDoses')) {
        const basalStore = db.createObjectStore('basalDoses', { keyPath: 'id' });
        basalStore.createIndex('date', 'date', { unique: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
}

function getDB() {
  if (!dbPromise) {
    dbPromise = createDB();
  }
  return dbPromise;
}

// Reset the cached connection so the next getDB() opens a fresh one.
// Called automatically when a DB operation fails (e.g. after iOS suspend).
function resetDB() {
  dbPromise = null;
}

// Wrap a DB operation with automatic retry on connection failure.
// If the first attempt fails, reset the connection and try once more.
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn('DB operation failed, reconnecting:', err.message);
    resetDB();
    return await fn();
  }
}

// === Glucose Readings ===

export function addGlucoseReadings(readings) {
  return withRetry(async () => {
    const db = await getDB();
    const tx = db.transaction('glucoseReadings', 'readwrite');
    const store = tx.objectStore('glucoseReadings');
    const existing = await store.getAll();

    const normalizeTs = (ts) => {
      try {
        const d = new Date(ts);
        d.setSeconds(0, 0);
        return d.toISOString();
      } catch { return ts; }
    };

    const existingKeys = new Set(existing.map(r => normalizeTs(r.timestamp)));
    let added = 0;
    let skipped = 0;

    for (const reading of readings) {
      const key = normalizeTs(reading.timestamp);
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        await store.put(reading);
        existingKeys.add(key);
        added++;
      }
    }

    await tx.done;
    return { added, skipped };
  });
}

export function getGlucoseReadings(startTime, endTime) {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('glucoseReadings');
    return all
      .filter(r => r.timestamp >= startTime && r.timestamp <= endTime)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  });
}

export function getAllGlucoseReadings() {
  return withRetry(async () => {
    const db = await getDB();
    return db.getAll('glucoseReadings');
  });
}

// === Bolus Doses ===

export function addBolusDose(dose) {
  return withRetry(async () => {
    const db = await getDB();
    await db.put('bolusDoses', dose);
  });
}

export function getBolusDoses(startTime, endTime) {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('bolusDoses');
    return all
      .filter(d => d.timestamp >= startTime && d.timestamp <= endTime)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  });
}

export function getAllBolusDoses() {
  return withRetry(async () => {
    const db = await getDB();
    return db.getAll('bolusDoses');
  });
}

export function updateBolusDose(id, updates) {
  return withRetry(async () => {
    const db = await getDB();
    const dose = await db.get('bolusDoses', id);
    if (!dose) return;
    Object.assign(dose, updates);
    await db.put('bolusDoses', dose);
  });
}

export function deleteBolusDose(id) {
  return withRetry(async () => {
    const db = await getDB();
    await db.delete('bolusDoses', id);
  });
}

// === Basal Doses ===

export function addBasalDose(dose) {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('basalDoses');
    const existing = all.find(d => d.date === dose.date);
    if (existing) {
      dose.id = existing.id;
    }
    await db.put('basalDoses', dose);
  });
}

export function getBasalDoses(days = 7) {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('basalDoses');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return all
      .filter(d => d.date >= cutoffStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}

export function getAllBasalDoses() {
  return withRetry(async () => {
    const db = await getDB();
    return db.getAll('basalDoses');
  });
}

export function deleteBasalDose(id) {
  return withRetry(async () => {
    const db = await getDB();
    await db.delete('basalDoses', id);
  });
}

export function updateBasalDose(id, updates) {
  return withRetry(async () => {
    const db = await getDB();
    const dose = await db.get('basalDoses', id);
    if (!dose) return;
    Object.assign(dose, updates);
    await db.put('basalDoses', dose);
  });
}

export function getBasalDoseForDate(date) {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('basalDoses');
    return all.find(d => d.date === date) || null;
  });
}

// === Settings ===

const DEFAULT_SETTINGS = {
  bolusDIA: 240,
  bolusPeakTime: 60,
  targetRangeLow: 70,
  targetRangeHigh: 160,
  graphDisplayLow: 50,
  graphDisplayHigh: 350,
  defaultBasalUnits: 24,
  theme: 'fidelity',
  dataSource: 'health-export',
  nightscoutUrl: '',
  appIcon: 'default',
};

export function getSetting(key) {
  return withRetry(async () => {
    const db = await getDB();
    const result = await db.get('settings', key);
    return result ? result.value : DEFAULT_SETTINGS[key];
  });
}

export function getSettings() {
  return withRetry(async () => {
    const db = await getDB();
    const all = await db.getAll('settings');
    const settings = { ...DEFAULT_SETTINGS };
    for (const item of all) {
      settings[item.key] = item.value;
    }
    return settings;
  });
}

export function setSetting(key, value) {
  return withRetry(async () => {
    const db = await getDB();
    await db.put('settings', { key, value });
  });
}

// === Data Cleanup ===

export function cleanupOldData() {
  return withRetry(async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
    const cutoffTimestamp = thirtyDaysAgo.toISOString();

    const db = await getDB();

    const glucoseTx = db.transaction('glucoseReadings', 'readwrite');
    const glucoseStore = glucoseTx.objectStore('glucoseReadings');
    const allGlucose = await glucoseStore.getAll();
    for (const reading of allGlucose) {
      if (reading.timestamp < cutoffTimestamp) {
        await glucoseStore.delete(reading.id);
      }
    }
    await glucoseTx.done;

    const bolusTx = db.transaction('bolusDoses', 'readwrite');
    const bolusStore = bolusTx.objectStore('bolusDoses');
    const allBolus = await bolusStore.getAll();
    for (const dose of allBolus) {
      if (dose.timestamp < cutoffTimestamp) {
        await bolusStore.delete(dose.id);
      }
    }
    await bolusTx.done;

    const basalTx = db.transaction('basalDoses', 'readwrite');
    const basalStore = basalTx.objectStore('basalDoses');
    const allBasal = await basalStore.getAll();
    for (const dose of allBasal) {
      if (dose.date < cutoffDate) {
        await basalStore.delete(dose.id);
      }
    }
    await basalTx.done;
  });
}

// === Export ===

export function exportAllData() {
  return withRetry(async () => {
    const [glucoseReadings, bolusDoses, basalDoses] = await Promise.all([
      getAllGlucoseReadings(),
      getAllBolusDoses(),
      getAllBasalDoses(),
    ]);
    const db = await getDB();
    const settings = await db.getAll('settings');
    return {
      exportDate: new Date().toISOString(),
      glucoseReadings,
      bolusDoses,
      basalDoses,
      settings,
    };
  });
}

// === Clear All ===

export function clearAllData() {
  return withRetry(async () => {
    const db = await getDB();
    await db.clear('glucoseReadings');
    await db.clear('bolusDoses');
    await db.clear('basalDoses');
    await db.clear('settings');
  });
}
