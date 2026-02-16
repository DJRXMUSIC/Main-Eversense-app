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
import { calcTotalIOB } from '../lib/iob';
import { syncGlucoseReadings, pushWidgetData } from '../lib/sync';
import { applyTheme } from '../lib/themes';

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

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettingsState(s);

      // Apply theme immediately on load
      applyTheme(s.theme || 'fidelity');

      const now = new Date();
      const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const glucose = await getGlucoseReadings(windowStart.toISOString(), now.toISOString());
      setGlucoseData(glucose);

      const allBolus = await getAllBolusDoses();
      setBolusDoses(allBolus);

      const basal = await getBasalDoses(7);
      setBasalDoses(basal);

      const todayB = await getBasalDoseForDate(today);
      setTodayBasal(todayB);

      const iob = calcTotalIOB(allBolus, now, s.bolusDIA, s.bolusPeakTime);
      setCurrentIOB(iob);

      setLoading(false);

      // Push widget snapshot (fire and forget)
      pushWidgetData({ iob, glucoseData: glucose, todayBasal: todayB });
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
    }
  }, [today]);

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

  // Initial load
  useEffect(() => {
    cleanupOldData().then(loadData);
  }, [loadData]);

  // Auto-sync once after initial load
  useEffect(() => {
    if (!loading && !hasSynced.current && settings) {
      hasSynced.current = true;
      doSync();
    }
  }, [loading, doSync, settings]);

  // Auto-refresh polling for real-time data sources (every 30s)
  // Use syncingRef (not syncing state) to avoid resetting the timer on every sync
  // Also re-sync when the tab regains focus (covers phone lock/unlock)
  useEffect(() => {
    clearInterval(syncInterval.current);
    const realTimeSources = ['nightscout', 'nightscout-local', 'xdrip'];
    const isRealTime = settings && realTimeSources.includes(settings.dataSource);

    if (isRealTime) {
      syncInterval.current = setInterval(() => {
        if (!syncingRef.current) doSync();
      }, 30000);
    }

    // Re-sync when tab becomes visible again (phone wake, tab switch)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRealTime && !syncingRef.current) {
        doSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(syncInterval.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [settings?.dataSource, doSync]);

  // Update IOB every minute — only filter recent doses for performance
  useEffect(() => {
    iobInterval.current = setInterval(() => {
      if (bolusDoses.length > 0 && settings) {
        const diaMs = (settings.bolusDIA || 300) * 60 * 1000;
        const now = new Date();
        const recentDoses = bolusDoses.filter(d =>
          now.getTime() - new Date(d.timestamp).getTime() < diaMs
        );
        const iob = calcTotalIOB(recentDoses, now, settings.bolusDIA, settings.bolusPeakTime);
        setCurrentIOB(iob);
      }
    }, 60000);

    return () => clearInterval(iobInterval.current);
  }, [bolusDoses, settings]);

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
    const dose = {
      id: crypto.randomUUID(),
      timestamp: timestamp || new Date().toISOString(),
      date: (timestamp ? new Date(timestamp) : new Date()).toISOString().split('T')[0],
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
      date: date || today,
      units,
      type: 'basal',
      insulinType: 'toujeo',
    };
    await addBasalDose(dose);
    await loadData();
  }, [today, loadData]);

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

  const editBolus = useCallback(async (id, units) => {
    await updateBolusDose(id, { units: Math.round(units) });
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
    a.download = `supercharged-backup-${new Date().toISOString().split('T')[0]}.json`;
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
