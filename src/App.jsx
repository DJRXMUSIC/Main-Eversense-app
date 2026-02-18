import { useState, useEffect, lazy, Suspense, Component } from 'react';
import { useAppData } from './hooks/useAppData';
import Header from './components/Header';
import History from './components/History';
import Stats from './components/Stats';
import { getAllGlucoseReadings, getAllBolusDoses, getAllBasalDoses } from './lib/db';

// Lazy-load chart and modals for faster initial render (IOB + bolus buttons load first)
// Retry wrapper: if chunk fails (stale SW cache), bust cache and retry once
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk load failed — likely stale service worker cache. Force reload.
      window.location.reload();
      return new Promise(() => {}); // never resolves, page is reloading
    })
  );
}

const GlucoseChart = lazyRetry(() => import('./components/GlucoseChart'));
const BolusModal = lazyRetry(() => import('./components/BolusModal'));
const BasalModal = lazyRetry(() => import('./components/BasalModal'));
const ImportModal = lazyRetry(() => import('./components/ImportModal'));
const Settings = lazyRetry(() => import('./components/Settings'));

// Error boundary: catches render errors from stale chunks or hydration failures
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Force full reload to get fresh assets
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
  } = useAppData();

  const [showBolus, setShowBolus] = useState(false);
  const [showBasal, setShowBasal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dataCounts, setDataCounts] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

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
        <div className="bg-bg-secondary mx-4 mt-2 p-3 rounded-xl flex items-center gap-3">
          <div className="flex-1 text-sm text-text-secondary">
            Install this app: tap Share then "Add to Home Screen"
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

      {/* Quick actions — first thing after header for fast insulin logging */}
      <div className="px-4 py-2 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Quick Bolus</div>
        <div className="grid grid-cols-5 gap-2">
          {[2, 3, 4, 5, 6].map((u) => (
            <button
              key={u}
              onClick={() => logBolus(u)}
              className="py-3.5 rounded-xl font-bold text-lg bg-accent text-white active:opacity-70 active:scale-95 transition-transform"
            >
              {u}u
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBolus(true)}
            className="flex-1 py-3 rounded-xl font-medium bg-bg-secondary text-accent active:opacity-80 border border-accent/30"
          >
            Custom Bolus
          </button>
          <button
            onClick={() => setShowBasal(true)}
            className="flex-1 py-3 rounded-xl font-medium bg-bg-secondary text-text-primary active:opacity-80 border border-bg-tertiary"
          >
            Log Basal
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 py-3 rounded-xl font-medium bg-bg-secondary text-text-secondary active:opacity-80 border border-bg-tertiary"
          >
            Import
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="h-[300px]" />}>
        <GlucoseChart
          glucoseData={glucoseData}
          bolusDoses={bolusDoses}
          settings={settings}
          themeId={themeId}
        />
      </Suspense>

      <History
        bolusDoses={bolusDoses}
        basalDoses={basalDoses}
        onEditBolus={editBolus}
        onDeleteBolus={removeBolus}
        onEditBasal={editBasal}
        onDeleteBasal={removeBasal}
      />

      <Stats bolusDoses={bolusDoses} basalDoses={basalDoses} />

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
