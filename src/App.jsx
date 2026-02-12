import { useState, useEffect } from 'react';
import { useAppData } from './hooks/useAppData';
import Header from './components/Header';
import GlucoseChart from './components/GlucoseChart';
import BolusModal from './components/BolusModal';
import BasalModal from './components/BasalModal';
import ImportModal from './components/ImportModal';
import BasalLog from './components/BasalLog';
import Settings from './components/Settings';
import { getAllGlucoseReadings, getAllBolusDoses, getAllBasalDoses } from './lib/db';

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
    refreshData,
  } = useAppData();

  const [showBolus, setShowBolus] = useState(false);
  const [showBasal, setShowBasal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dataCounts, setDataCounts] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Check if running in standalone mode (installed to home screen)
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (!isStandalone) {
      // Show install prompt after a delay
      const timer = setTimeout(() => setShowInstallPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Load data counts when settings opens
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
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary max-w-lg mx-auto relative">
      {/* Install prompt for iOS Safari */}
      {showInstallPrompt && (
        <div className="bg-bg-secondary mx-4 mt-2 p-3 rounded-xl flex items-center gap-3">
          <div className="flex-1 text-sm text-text-secondary">
            Install this app: tap <span className="inline-block">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" viewBox="0 0 20 20" fill="currentColor">
                <path d="M15 8a1 1 0 01-1 1h-3v3a1 1 0 11-2 0V9H6a1 1 0 110-2h3V4a1 1 0 112 0v3h3a1 1 0 011 1z" />
              </svg>
            </span> Share then "Add to Home Screen"
          </div>
          <button onClick={() => setShowInstallPrompt(false)} className="text-text-secondary text-lg">&times;</button>
        </div>
      )}

      <Header
        currentIOB={currentIOB}
        todayBasal={todayBasal}
        glucoseData={glucoseData}
        onOpenSettings={() => setShowSettings(true)}
      />

      <GlucoseChart
        glucoseData={glucoseData}
        bolusDoses={bolusDoses}
        settings={settings}
      />

      {/* Quick actions */}
      <div className="px-4 py-3 flex gap-3">
        <button
          onClick={() => setShowBolus(true)}
          className="flex-1 py-4 rounded-xl font-bold text-lg bg-insulin text-white active:opacity-80"
        >
          Log Bolus
        </button>
        <button
          onClick={() => setShowBasal(true)}
          className="flex-1 py-4 rounded-xl font-bold bg-bg-secondary text-text-primary active:opacity-80 border border-bg-tertiary"
        >
          Log Basal
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="py-4 px-5 rounded-xl font-medium bg-bg-secondary text-text-secondary active:opacity-80 border border-bg-tertiary"
        >
          Import
        </button>
      </div>

      <BasalLog basalDoses={basalDoses} />

      {/* Modals */}
      {showBolus && (
        <BolusModal
          onClose={() => setShowBolus(false)}
          onSave={logBolus}
        />
      )}
      {showBasal && (
        <BasalModal
          onClose={() => setShowBasal(false)}
          onSave={logBasal}
          defaultUnits={settings.defaultBasalUnits}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => { setShowImport(false); refreshData(); }}
          onImport={importGlucose}
        />
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
    </div>
  );
}

export default App;
