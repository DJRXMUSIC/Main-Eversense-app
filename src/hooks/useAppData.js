import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getGlucoseReadings,
  getAllBolusDoses,
  getBasalDoses,
  getBasalDoseForDate,
  addBolusDose,
  addBasalDose,
  addGlucoseReadings,
  deleteBolusDose,
  updateBolusDose,
  deleteBasalDose,
  updateBasalDose,
  getSettings,
  setSetting,
  cleanupOldData,
  exportAllData,
  clearAllData,
} from '../lib/db';
import { calcTotalIOB, HUMALOG_DIA } from '../lib/iob';
import { syncGlucoseReadings, pushWidgetData } from '../lib/sync';
import { applyTheme } from '../lib/themes';

// Local calendar date as YYYY-MM-DD (Eastern/device timezone, not UTC)
function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function useAppData() {
  const [glucoseData, setGlucoseData] = useState([]);
  const [bolusDoses, setBolusDoses] = useState([]);
  const [basalDoses, setBasalDoses] = useState([]);
  const [todayBasal, setTodayBasal] = useState(null);
  const [currentIOB, setCurrentIOB] = useState(0);
  const [settings, setSettingsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const iobInterval = useRef(null);
  const syncInterval = useRef(null);
  const hasSynced = useRef(false);
  const syncingRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const today = localDate();
      const now = new Date();
      const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Parallel DB reads — all independent, no reason to wait sequentially
      const [s, glucose, rawBolus, basal, todayB] = await Promise.all([
        getSettings(),
        getGlucoseReadings(windowStart.toISOString(), now.toISOString()),
        getAllBolusDoses(),
        getBasalDoses(7),
        getBasalDoseForDate(today),
      ]);

      applyTheme(s.theme || 'fidelity');
      setSettingsState(s);
      setGlucoseData(glucose);
      setBasalDoses(basal);
      setTodayBasal(todayB);

      // Fix dates from UTC to local timezone in memory (instant)
      const allBolus = rawBolus.map(d => {
        const correctDate = d.timestamp ? localDate(new Date(d.timestamp)) : d.date;
        return correctDate !== d.date ? { ...d, date: correctDate } : d;
      });
      setBolusDoses(allBolus);

      const iob = calcTotalIOB(allBolus, now);
      setCurrentIOB(iob);

      setLoading(false);

      // Non-critical work after render: persist date fixes + widget push
      const toFix = allBolus.filter((d, i) => d !== rawBolus[i]);
      if (toFix.length > 0) {
        for (const d of toFix) updateBolusDose(d.id, { date: d.date });
      }
      pushWidgetData({ iob, glucoseData: glucose, todayBasal: todayB });
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
    }
  }, []);

  // Sync using the configured data source
  const doSync = useCallback(async () => {
    if (!settings) return;
    if (syncingRef.current) return;
    try {
      syncingRef.current = true;
      setSyncing(true);
      const result = await syncGlucoseReadings(
        settings.dataSource || 'health-export',
        settings.nightscoutUrl || null
      );
      setLastSyncResult({ time: new Date(), ...result });
      // Always reload data — server may have new readings even if
      // this particular trigger didn't import (e.g. background poller did)
      await loadData();
    } catch (err) {
      console.error('Sync failed:', err);
      setLastSyncResult({ time: new Date(), error: err.message, imported: 0 });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [loadData, settings]);

  // Initial load — data first, cleanup deferred
  useEffect(() => {
    loadData().then(() => cleanupOldData());
  }, [loadData]);

  // Auto-sync once after initial load
  useEffect(() => {
    if (!loading && !hasSynced.current && settings) {
      hasSynced.current = true;
      doSync();
    }
  }, [loading, doSync, settings]);

  // Auto-refresh polling for real-time data sources (every 30s)
  useEffect(() => {
    clearInterval(syncInterval.current);
    const realTimeSources = ['nightscout', 'nightscout-local', 'xdrip'];
    const isRealTime = settings && realTimeSources.includes(settings.dataSource);

    if (isRealTime) {
      syncInterval.current = setInterval(() => {
        if (!syncingRef.current) doSync();
      }, 30000);
    }

    return () => clearInterval(syncInterval.current);
  }, [settings?.dataSource, doSync]);

  // Always reload data when the app resumes from background.
  // iOS/Android may evict the webview — when restored, React state is
  // stale or empty. This ensures IOB + doses are fresh on every resume.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadData]);

  // Update IOB every minute — only filter recent doses for performance
  useEffect(() => {
    iobInterval.current = setInterval(() => {
      if (bolusDoses.length > 0) {
        const diaMs = HUMALOG_DIA * 60 * 1000;
        const now = new Date();
        const recentDoses = bolusDoses.filter(d =>
          now.getTime() - new Date(d.timestamp).getTime() < diaMs
        );
        const iob = calcTotalIOB(recentDoses, now);
        setCurrentIOB(iob);
      }
    }, 60000);

    return () => clearInterval(iobInterval.current);
  }, [bolusDoses]);

  // Apply theme when setting changes
  const updateSetting = useCallback(async (key, value) => {
    await setSetting(key, value);
    const s = await getSettings();
    setSettingsState(s);

    if (key === 'theme') {
      applyTheme(value);
    }
  }, []);

  const logBolus = useCallback(async (units, timestamp) => {
    const doseTime = timestamp ? new Date(timestamp) : new Date();
    const dose = {
      id: crypto.randomUUID(),
      timestamp: timestamp || new Date().toISOString(),
      date: localDate(doseTime),
      units: Math.round(units),
      type: 'bolus',
      insulinType: 'humalog',
    };
    await addBolusDose(dose);
    await loadData();
  }, [loadData]);

  const logBasal = useCallback(async (units, date) => {
    const dose = {
      id: crypto.randomUUID(),
      date: date || localDate(),
      units,
      type: 'basal',
      insulinType: 'toujeo',
    };
    await addBasalDose(dose);
    await loadData();
  }, [loadData]);

  const importGlucose = useCallback(async (readings) => {
    const result = await addGlucoseReadings(readings);
    await cleanupOldData();
    await loadData();
    return result;
  }, [loadData]);

  const removeBolus = useCallback(async (id) => {
    await deleteBolusDose(id);
    await loadData();
  }, [loadData]);

  const editBolus = useCallback(async (id, updates) => {
    // Accept either (id, number) for units-only or (id, {units, timestamp, date})
    if (typeof updates === 'number') {
      await updateBolusDose(id, { units: Math.round(updates) });
    } else {
      const patch = {};
      if (updates.units != null) patch.units = Math.round(updates.units);
      if (updates.timestamp) {
        patch.timestamp = updates.timestamp;
        patch.date = localDate(new Date(updates.timestamp));
      }
      await updateBolusDose(id, patch);
    }
    await loadData();
  }, [loadData]);

  const removeBasal = useCallback(async (id) => {
    await deleteBasalDose(id);
    await loadData();
  }, [loadData]);

  const editBasal = useCallback(async (id, units) => {
    await updateBasalDose(id, { units });
    await loadData();
  }, [loadData]);

  const doExport = useCallback(async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supercharged-backup-${localDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const doClearAll = useCallback(async () => {
    await clearAllData();
    await loadData();
  }, [loadData]);

  return {
    glucoseData,
    bolusDoses,
    basalDoses,
    todayBasal,
    currentIOB,
    settings,
    loading,
    syncing,
    lastSyncResult,
    logBolus,
    logBasal,
    importGlucose,
    removeBolus,
    editBolus,
    removeBasal,
    editBasal,
    updateSetting,
    doExport,
    doClearAll,
    doSync,
    refreshData: loadData,
  };
}
