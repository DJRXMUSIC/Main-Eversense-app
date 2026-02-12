import { useState } from 'react';

export default function Settings({ settings, onUpdateSetting, onExport, onClearAll, onClose, dataCounts }) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const SettingRow = ({ label, settingKey, min, max, step = 1, unit, displayTransform }) => {
    const value = settings[settingKey];
    const displayValue = displayTransform ? displayTransform(value) : value;

    return (
      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
        <div>
          <div className="text-sm font-medium">{label}</div>
          {unit && <div className="text-xs text-text-secondary">{unit}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateSetting(settingKey, Math.max(min, value - step))}
            className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
          >
            -
          </button>
          <span className="w-16 text-center font-medium tabular-nums">{displayValue}</span>
          <button
            onClick={() => onUpdateSetting(settingKey, Math.min(max, value + step))}
            className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto">
      <div className="max-w-lg mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        {/* Bolus insulin settings */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Bolus Insulin (Humalog)</h3>
          <div className="bg-bg-secondary rounded-xl px-4">
            <SettingRow
              label="Duration of Insulin Action"
              settingKey="bolusDIA"
              min={180}
              max={420}
              step={15}
              unit="minutes"
              displayTransform={(v) => `${(v / 60).toFixed(1)} hrs`}
            />
            <SettingRow
              label="Peak Activity Time"
              settingKey="bolusPeakTime"
              min={45}
              max={90}
              step={5}
              unit="minutes"
              displayTransform={(v) => `${v} min`}
            />
          </div>
        </div>

        {/* Basal settings */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Basal Insulin (Toujeo)</h3>
          <div className="bg-bg-secondary rounded-xl px-4">
            <SettingRow
              label="Default Daily Units"
              settingKey="defaultBasalUnits"
              min={1}
              max={100}
              step={1}
              displayTransform={(v) => `${v}u`}
            />
          </div>
        </div>

        {/* Display settings */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Display</h3>
          <div className="bg-bg-secondary rounded-xl px-4">
            <SettingRow label="Target Range Low" settingKey="targetRangeLow" min={50} max={100} displayTransform={(v) => `${v} mg/dL`} />
            <SettingRow label="Target Range High" settingKey="targetRangeHigh" min={120} max={250} displayTransform={(v) => `${v} mg/dL`} />
          </div>
        </div>

        {/* Data management */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Data Management</h3>
          <div className="bg-bg-secondary rounded-xl p-4 space-y-3">
            {dataCounts && (
              <div className="text-sm text-text-secondary space-y-1">
                <div>Glucose readings: {dataCounts.glucose}</div>
                <div>Bolus doses: {dataCounts.bolus}</div>
                <div>Basal doses: {dataCounts.basal}</div>
              </div>
            )}
            <button
              onClick={onExport}
              className="w-full py-3 rounded-xl font-medium bg-bg-tertiary text-text-primary active:opacity-80"
            >
              Export All Data (JSON)
            </button>

            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-3 rounded-xl font-medium bg-danger/20 text-danger active:opacity-80"
              >
                Clear All Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-danger text-center">This will permanently delete all data. Are you sure?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-3 rounded-xl font-medium bg-bg-tertiary text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onClearAll(); setShowClearConfirm(false); }}
                    className="flex-1 py-3 rounded-xl font-medium bg-danger text-white"
                  >
                    Delete Everything
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary pb-8 space-y-2">
          <div>Supercharged v1.0</div>
          <div>Build: {new Date(__BUILD_TIME__).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
          <button
            onClick={async () => {
              if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                  await reg.unregister();
                }
              }
              if ('caches' in window) {
                const names = await caches.keys();
                for (const name of names) {
                  await caches.delete(name);
                }
              }
              window.location.reload();
            }}
            className="mt-1 px-4 py-2 rounded-lg bg-bg-tertiary text-text-secondary active:opacity-80"
          >
            Force Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
