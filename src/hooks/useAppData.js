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
  getSettings,
  setSetting,
  cleanupOldData,
  exportAllData,
  clearAllData,
} from '../lib/db';
import { calcTotalIOB } from '../lib/iob';

export function useAppData() {
  const [glucoseData, setGlucoseData] = useState([]);
  const [bolusDoses, setBolusDoses] = useState([]);
  const [basalDoses, setBasalDoses] = useState([]);
  const [todayBasal, setTodayBasal] = useState(null);
  const [currentIOB, setCurrentIOB] = useState(0);
  const [settings, setSettingsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const iobInterval = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettingsState(s);

      // Load glucose for graph window (past 6 hours to now)
      const now = new Date();
      const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const glucose = await getGlucoseReadings(windowStart.toISOString(), now.toISOString());
      setGlucoseData(glucose);

      // Load all bolus doses (need full range for IOB calc)
      const allBolus = await getAllBolusDoses();
      setBolusDoses(allBolus);

      // Load recent basal doses
      const basal = await getBasalDoses(7);
      setBasalDoses(basal);

      // Today's basal
      const todayB = await getBasalDoseForDate(today);
      setTodayBasal(todayB);

      // Calculate current IOB
      const iob = calcTotalIOB(allBolus, now, s.bolusDIA, s.bolusPeakTime);
      setCurrentIOB(iob);

      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
    }
  }, [today]);

  // Initial load and cleanup
  useEffect(() => {
    cleanupOldData().then(loadData);
  }, [loadData]);

  // Update IOB every minute
  useEffect(() => {
    iobInterval.current = setInterval(() => {
      if (bolusDoses.length > 0 && settings) {
        const iob = calcTotalIOB(bolusDoses, new Date(), settings.bolusDIA, settings.bolusPeakTime);
        setCurrentIOB(iob);
      }
    }, 60000);

    return () => clearInterval(iobInterval.current);
  }, [bolusDoses, settings]);

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

  const updateSetting = useCallback(async (key, value) => {
    await setSetting(key, value);
    const s = await getSettings();
    setSettingsState(s);
  }, []);

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
    logBolus,
    logBasal,
    importGlucose,
    removeBolus,
    updateSetting,
    doExport,
    doClearAll,
    refreshData: loadData,
  };
}
