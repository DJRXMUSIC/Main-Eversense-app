import { useState, useEffect, lazy, Suspense, Component, useMemo } from 'react';
import { useAppData } from './hooks/useAppData';
import Header from './components/Header';
import History from './components/History';
import Stats from './components/Stats';
import { getAllGlucoseReadings, getAllBolusDoses, getAllBasalDoses } from './lib/db';

function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      window.location.reload();
      return new Promise(() => {});
    })
  );
}

const GlucoseChart = lazyRetry(() => import('./components/GlucoseChart'));
const BolusModal = lazyRetry(() => import('./components/BolusModal'));
const BasalModal = lazyRetry(() => import('./components/BasalModal'));
const ImportModal = lazyRetry(() => import('./components/ImportModal'));
const Settings = lazyRetry(() => import('./components/Settings'));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    setTimeout(() => window.location.reload(), 100);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center">
          <div className="text-text-secondary text-sm">Reloading...</div>
        </div>
      );
    }
    return this.props.children;
  }
}

const INTENSITY_LABELS = ['', 'Light Exercise', 'Moderate Exercise', 'Intense Exercise'];
const INTENSITY_STYLES = [
  '',
  'bg-green-500/15 text-green-400 border-green-500/30',
  'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  'bg-red-500/15 text-red-400 border-red-500/30',
];
const FAT_DURATION_MS = 5 * 60 * 60 * 1000;

function formatTimeSince(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  const remainHrs = hrs % 24;
  if (remainHrs === 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''}, ${remainHrs}h ago`;
}

function formatCountdown(ts) {
  const remaining = FAT_DURATION_MS - (Date.now() - new Date(ts).getTime());
  if (remaining <= 0) return null;
  const hrs = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  return `${hrs}h ${mins}m`;
}

function App() {
  const {
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
    updateSetting,
    doExport,
    doClearAll,
    removeBolus,
    editBolus,
    removeBasal,
    editBasal,
    syncing,
    lastSyncResult,
    doSync,
    refreshData,
    toast,
    exerciseLogs,
    logExercise,
    removeExercise,
    highFatTime,
    logHighFat,
    clearHighFat,
  } = useAppData();

  const [showBolus, setShowBolus] = useState(false);
  const [showBasal, setShowBasal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dataCounts, setDataCounts] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [, setTick] = useState(0);

  // Tick every 30s to update time-since displays
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (!isStandalone) {
      const timer = setTimeout(() => setShowInstallPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (showSettings) {
      Promise.all([getAllGlucoseReadings(), getAllBolusDoses(), getAllBasalDoses()]).then(
        ([glucose, bolus, basal]) => {
          setDataCounts({ glucose: glucose.length, bolus: bolus.length, basal: basal.length });
        }
      );
    }
  }, [showSettings]);

  // Last 3 exercise entries
  const recentExercise = useMemo(() => {
    return (exerciseLogs || []).slice(0, 3);
  }, [exerciseLogs]);

  // Fat countdown
  const fatCountdown = useMemo(() => {
    if (!highFatTime) return null;
    return formatCountdown(highFatTime);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highFatTime]);

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  const themeId = settings.theme || 'fidelity';

  return (
    <div className="min-h-screen bg-bg-primary max-w-lg mx-auto relative" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {showInstallPrompt && (
        <div className="bg-bg-secondary mx-3 mt-1 p-2 rounded-xl flex items-center gap-2">
          <div className="flex-1 text-xs text-text-secondary">
            Install: tap Share then "Add to Home Screen"
          </div>
          <button onClick={() => setShowInstallPrompt(false)} className="text-text-secondary text-lg">&times;</button>
        </div>
      )}

      <Header
        currentIOB={currentIOB}
        todayBasal={todayBasal}
        glucoseData={glucoseData}
        onOpenSettings={() => setShowSettings(true)}
        syncing={syncing}
        lastSyncResult={lastSyncResult}
        onSync={doSync}
        settings={settings}
      />

      {/* Quick actions — compact */}
      <div className="px-3 py-1.5 space-y-1.5">
        <div className="text-[9px] uppercase tracking-widest text-text-secondary">Quick Bolus</div>
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((u) => (
            <button
              key={u}
              onClick={() => logBolus(u)}
              className="py-2 rounded-lg font-bold text-sm bg-accent text-white active:opacity-70 active:scale-95 transition-transform"
            >
              {u}u
            </button>
          ))}
          <button
            onClick={() => setShowBolus(true)}
            className="py-2 rounded-lg font-bold text-sm bg-bg-secondary text-accent active:opacity-80 border border-accent/30"
          >
            ...
          </button>
        </div>

        {/* Secondary actions row */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowBasal(true)}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-bg-secondary text-text-primary active:opacity-80 border border-bg-tertiary"
          >
            Basal
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-bg-secondary text-text-secondary active:opacity-80 border border-bg-tertiary"
          >
            Import
          </button>
        </div>

        {/* Log exercise + insulin resistance buttons */}
        <div className="flex gap-1">
          <button onClick={() => logExercise(1)} className="flex-1 py-2 rounded-lg text-[10px] font-bold bg-green-500/20 text-green-400 active:opacity-70 border border-green-500/30">Light</button>
          <button onClick={() => logExercise(2)} className="flex-1 py-2 rounded-lg text-[10px] font-bold bg-yellow-400/20 text-yellow-300 active:opacity-70 border border-yellow-400/30">Med</button>
          <button onClick={() => logExercise(3)} className="flex-1 py-2 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-400 active:opacity-70 border border-red-500/30">Hard</button>
        </div>

        {/* Stacked exercise display — last 3 as full-width bars */}
        {recentExercise.length > 0 && (
          <div className="space-y-1">
            {recentExercise.map((ex) => (
              <div key={ex.id} className={`w-full py-2 px-3 rounded-lg text-xs font-semibold border ${INTENSITY_STYLES[ex.intensity] || 'bg-bg-secondary text-text-secondary border-bg-tertiary'}`}>
                {INTENSITY_LABELS[ex.intensity] || 'Exercise'} — {formatTimeSince(ex.timestamp)}
              </div>
            ))}
          </div>
        )}

        {/* Insulin Resistance toggle */}
        <button
          onClick={highFatTime ? clearHighFat : logHighFat}
          className={`w-full py-2.5 rounded-lg text-xs font-bold active:opacity-70 border ${
            highFatTime
              ? 'bg-accent/20 text-accent border-accent/40'
              : 'bg-bg-secondary text-text-secondary border-bg-tertiary'
          }`}
        >
          {highFatTime ? `Insulin Resistance — ${formatCountdown(highFatTime) || '0m'} remaining` : '+ Insulin Resistance'}
        </button>
      </div>

      <Suspense fallback={<div className="h-[240px]" />}>
        <GlucoseChart
          glucoseData={glucoseData}
          bolusDoses={bolusDoses}
          settings={settings}
          themeId={themeId}
        />
      </Suspense>

      <Stats bolusDoses={bolusDoses} basalDoses={basalDoses} />

      <History
        bolusDoses={bolusDoses}
        basalDoses={basalDoses}
        exerciseLogs={exerciseLogs}
        onEditBolus={editBolus}
        onDeleteBolus={removeBolus}
        onEditBasal={editBasal}
        onDeleteBasal={removeBasal}
        onDeleteExercise={removeExercise}
      />

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-danger text-white text-sm font-medium shadow-lg animate-slide-up">
          {toast.message}
        </div>
      )}

      {/* Lazy-loaded modals */}
      <Suspense fallback={null}>
        {showBolus && (
          <BolusModal onClose={() => setShowBolus(false)} onSave={logBolus} />
        )}
        {showBasal && (
          <BasalModal onClose={() => setShowBasal(false)} onSave={logBasal} defaultUnits={settings.defaultBasalUnits} />
        )}
        {showImport && (
          <ImportModal onClose={() => { setShowImport(false); refreshData(); }} onImport={importGlucose} />
        )}
        {showSettings && (
          <Settings
            settings={settings}
            onUpdateSetting={updateSetting}
            onExport={doExport}
            onClearAll={doClearAll}
            onClose={() => setShowSettings(false)}
            dataCounts={dataCounts}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
