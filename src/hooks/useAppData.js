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
  getSetting,
  getSettings,
  setSetting,
  cleanupOldData,
  exportAllData,
  clearAllData,
} from '../lib/db';
import { calcTotalIOB, HUMALOG_DIA } from '../lib/iob';
import { syncGlucoseReadings, pushWidgetData } from '../lib/sync';
import { applyTheme } from '../lib/themes';
import {
  pushBolus,
  pushBasal,
  pushBolusUpdate,
  pushBasalUpdate,
  removeCloudBolus,
  removeCloudBasal,
  pushSetting,
  pullAllData,
} from '../lib/firestore-sync';

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
  const [toast, setToast] = useState(null);
  const [exerciseLogs, setExerciseLogs] = useState([]);
  const [highFatTime, setHighFatTime] = useState(null);
  const iobInterval = useRef(null);
  const syncInterval = useRef(null);
  const hasSynced = useRef(false);
  const syncingRef = useRef(false);
  const loadingRef = useRef(false);

  // Show a brief toast message (auto-dismisses after 3s)
  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    // Prevent concurrent loads from racing
    if (loadingRef.current) return;
    loadingRef.current = true;
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

      // Load exercise logs and high fat timer from settings store
      const [exLogs, fatTime] = await Promise.all([
        getSetting('exerciseLogs'),
        getSetting('highFatTime'),
      ]);
      setExerciseLogs(Array.isArray(exLogs) ? exLogs : []);
      // Only set fat time if it's still within the 8hr window
      const FAT_DURATION = 5 * 60 * 60 * 1000;
      if (fatTime && Date.now() - new Date(fatTime).getTime() < FAT_DURATION) {
        setHighFatTime(fatTime);
      } else {
        setHighFatTime(null);
      }
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
        for (const d of toFix) updateBolusDose(d.id, { date: d.date }).catch(() => {});
      }
      pushWidgetData({ iob, glucoseData: glucose, todayBasal: todayB });
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast(`Load error: ${err.message}`);
      setLoading(false);
    } finally {
      loadingRef.current = false;
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
      await loadData();
    } catch (err) {
      console.error('Sync failed:', err);
      setLastSyncResult({ time: new Date(), error: err.message, imported: 0 });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [loadData, settings]);

  // Initial load — restore from cloud first, then load locally
  useEffect(() => {
    (async () => {
      try {
        const cloud = await pullAllData();
        if (cloud) {
          // Merge cloud bolus doses missing locally
          const localBolus = await getAllBolusDoses();
          const localBolusIds = new Set(localBolus.map(d => d.id));
          for (const dose of cloud.bolusDoses) {
            if (!localBolusIds.has(dose.id)) {
              await addBolusDose(dose).catch(() => {});
            }
          }
          // Merge cloud basal doses missing locally
          const localBasal = await getBasalDoses(90);
          const localBasalIds = new Set(localBasal.map(d => d.id));
          for (const dose of cloud.basalDoses) {
            if (!localBasalIds.has(dose.id)) {
              await addBasalDose(dose).catch(() => {});
            }
          }
          // Restore settings (exercise logs, high fat, etc.) if missing locally
          if (cloud.settings.exerciseLogs) {
            const local = await getSetting('exerciseLogs');
            if (!local || !Array.isArray(local) || local.length === 0) {
              await setSetting('exerciseLogs', cloud.settings.exerciseLogs);
            }
          }
          if (cloud.settings.highFatTime) {
            const local = await getSetting('highFatTime');
            if (!local) {
              await setSetting('highFatTime', cloud.settings.highFatTime);
            }
          }
        }
      } catch (e) {
        console.error('Cloud restore failed (non-fatal):', e);
      }
      await loadData();
      cleanupOldData().catch(() => {});
    })();
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

  // Reload data when the app resumes from background.
  // iOS/Android may close the IndexedDB connection while suspended —
  // the withRetry wrapper in db.js will reconnect automatically.
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
    try {
      await setSetting(key, value);
      pushSetting(key, value);
      const s = await getSettings();
      setSettingsState(s);
      if (key === 'theme') applyTheme(value);
    } catch (err) {
      console.error('Failed to save setting:', err);
      showToast('Failed to save setting');
    }
  }, [showToast]);

  const logBolus = useCallback(async (units, timestamp) => {
    try {
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
      pushBolus(dose);
      await loadData();
    } catch (err) {
      console.error('Failed to log bolus:', err);
      showToast('Failed to log bolus — tap to retry');
    }
  }, [loadData, showToast]);

  const logBasal = useCallback(async (units, date) => {
    try {
      const dose = {
        id: crypto.randomUUID(),
        date: date || localDate(),
        units,
        type: 'basal',
        insulinType: 'toujeo',
      };
      await addBasalDose(dose);
      pushBasal(dose);
      await loadData();
    } catch (err) {
      console.error('Failed to log basal:', err);
      showToast('Failed to log basal');
    }
  }, [loadData, showToast]);

  const importGlucose = useCallback(async (readings) => {
    const result = await addGlucoseReadings(readings);
    await cleanupOldData();
    await loadData();
    return result;
  }, [loadData]);

  const removeBolus = useCallback(async (id) => {
    try {
      await deleteBolusDose(id);
      removeCloudBolus(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete bolus:', err);
      showToast('Failed to delete');
    }
  }, [loadData, showToast]);

  const editBolus = useCallback(async (id, updates) => {
    try {
      let patch;
      if (typeof updates === 'number') {
        patch = { units: Math.round(updates) };
      } else {
        patch = {};
        if (updates.units != null) patch.units = Math.round(updates.units);
        if (updates.timestamp) {
          patch.timestamp = updates.timestamp;
          patch.date = localDate(new Date(updates.timestamp));
        }
      }
      await updateBolusDose(id, patch);
      pushBolusUpdate(id, patch);
      await loadData();
    } catch (err) {
      console.error('Failed to edit bolus:', err);
      showToast('Failed to save edit');
    }
  }, [loadData, showToast]);

  const removeBasal = useCallback(async (id) => {
    try {
      await deleteBasalDose(id);
      removeCloudBasal(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete basal:', err);
      showToast('Failed to delete');
    }
  }, [loadData, showToast]);

  const editBasal = useCallback(async (id, units) => {
    try {
      await updateBasalDose(id, { units });
      pushBasalUpdate(id, { units });
      await loadData();
    } catch (err) {
      console.error('Failed to edit basal:', err);
      showToast('Failed to save edit');
    }
  }, [loadData, showToast]);

  // Exercise logging — stores as array in settings, keeps last 20
  const logExercise = useCallback(async (intensity, timestamp) => {
    try {
      const entry = {
        id: crypto.randomUUID(),
        timestamp: timestamp || new Date().toISOString(),
        intensity, // 1=light, 2=moderate, 3=intense
      };
      const existing = Array.isArray(exerciseLogs) ? exerciseLogs : [];
      const updated = [entry, ...existing].slice(0, 20);
      await setSetting('exerciseLogs', updated);
      pushSetting('exerciseLogs', updated);
      setExerciseLogs(updated);
    } catch (err) {
      console.error('Failed to log exercise:', err);
      showToast('Failed to log exercise');
    }
  }, [exerciseLogs, showToast]);

  const editExercise = useCallback(async (id, updates) => {
    try {
      const updated = exerciseLogs.map(e => {
        if (e.id !== id) return e;
        const patched = { ...e };
        if (updates.timestamp) patched.timestamp = updates.timestamp;
        if (updates.intensity) patched.intensity = updates.intensity;
        return patched;
      });
      await setSetting('exerciseLogs', updated);
      pushSetting('exerciseLogs', updated);
      setExerciseLogs(updated);
    } catch (err) {
      showToast('Failed to edit exercise');
    }
  }, [exerciseLogs, showToast]);

  const removeExercise = useCallback(async (id) => {
    try {
      const updated = exerciseLogs.filter(e => e.id !== id);
      await setSetting('exerciseLogs', updated);
      pushSetting('exerciseLogs', updated);
      setExerciseLogs(updated);
    } catch (err) {
      showToast('Failed to delete');
    }
  }, [exerciseLogs, showToast]);

  // High fat — starts countdown from given time (or now)
  const logHighFat = useCallback(async (timestamp) => {
    try {
      const ts = timestamp || new Date().toISOString();
      await setSetting('highFatTime', ts);
      pushSetting('highFatTime', ts);
      setHighFatTime(ts);
    } catch (err) {
      showToast('Failed to log high fat');
    }
  }, [showToast]);

  const clearHighFat = useCallback(async () => {
    try {
      await setSetting('highFatTime', null);
      pushSetting('highFatTime', null);
      setHighFatTime(null);
    } catch (err) {
      showToast('Failed to clear');
    }
  }, [showToast]);

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
    toast,
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
    exerciseLogs,
    logExercise,
    editExercise,
    removeExercise,
    highFatTime,
    logHighFat,
    clearHighFat,
  };
}
