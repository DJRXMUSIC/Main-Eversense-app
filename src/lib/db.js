import { openDB } from 'idb';

const DB_NAME = 'InsulinTrackerDB';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
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
  return dbPromise;
}

// === Glucose Readings ===

export async function addGlucoseReadings(readings) {
  const db = await getDB();
  const tx = db.transaction('glucoseReadings', 'readwrite');
  const store = tx.objectStore('glucoseReadings');
  const existing = await store.getAll();

  // Normalize to nearest minute for dedup (matches server-side logic)
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
}

export async function getGlucoseReadings(startTime, endTime) {
  const db = await getDB();
  const all = await db.getAll('glucoseReadings');
  return all
    .filter(r => r.timestamp >= startTime && r.timestamp <= endTime)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getAllGlucoseReadings() {
  const db = await getDB();
  return db.getAll('glucoseReadings');
}

// === Bolus Doses ===

export async function addBolusDose(dose) {
  const db = await getDB();
  await db.put('bolusDoses', dose);
}

export async function getBolusDoses(startTime, endTime) {
  const db = await getDB();
  const all = await db.getAll('bolusDoses');
  return all
    .filter(d => d.timestamp >= startTime && d.timestamp <= endTime)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getAllBolusDoses() {
  const db = await getDB();
  return db.getAll('bolusDoses');
}

export async function updateBolusDose(id, updates) {
  const db = await getDB();
  const dose = await db.get('bolusDoses', id);
  if (!dose) return;
  Object.assign(dose, updates);
  await db.put('bolusDoses', dose);
}

export async function deleteBolusDose(id) {
  const db = await getDB();
  await db.delete('bolusDoses', id);
}

// === Basal Doses ===

export async function addBasalDose(dose) {
  const db = await getDB();
  const all = await db.getAll('basalDoses');
  const existing = all.find(d => d.date === dose.date);
  if (existing) {
    dose.id = existing.id;
  }
  await db.put('basalDoses', dose);
}

export async function getBasalDoses(days = 7) {
  const db = await getDB();
  const all = await db.getAll('basalDoses');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return all
    .filter(d => d.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getAllBasalDoses() {
  const db = await getDB();
  return db.getAll('basalDoses');
}

export async function deleteBasalDose(id) {
  const db = await getDB();
  await db.delete('basalDoses', id);
}

export async function updateBasalDose(id, updates) {
  const db = await getDB();
  const dose = await db.get('basalDoses', id);
  if (!dose) return;
  Object.assign(dose, updates);
  await db.put('basalDoses', dose);
}

export async function getBasalDoseForDate(date) {
  const db = await getDB();
  const all = await db.getAll('basalDoses');
  return all.find(d => d.date === date) || null;
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

export async function getSetting(key) {
  const db = await getDB();
  const result = await db.get('settings', key);
  return result ? result.value : DEFAULT_SETTINGS[key];
}

export async function getSettings() {
  const db = await getDB();
  const all = await db.getAll('settings');
  const settings = { ...DEFAULT_SETTINGS };
  for (const item of all) {
    settings[item.key] = item.value;
  }
  return settings;
}

export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

// === Data Cleanup ===

export async function cleanupOldData() {
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
}

// === Export ===

export async function exportAllData() {
  const data = {
    exportDate: new Date().toISOString(),
    glucoseReadings: await getAllGlucoseReadings(),
    bolusDoses: await getAllBolusDoses(),
    basalDoses: await getAllBasalDoses(),
    settings: (await getDB()).getAll('settings'),
  };
  // Resolve settings promise
  data.settings = await data.settings;
  return data;
}

// === Clear All ===

export async function clearAllData() {
  const db = await getDB();
  await db.clear('glucoseReadings');
  await db.clear('bolusDoses');
  await db.clear('basalDoses');
  await db.clear('settings');
}
