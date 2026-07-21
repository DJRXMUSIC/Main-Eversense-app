import { useState } from 'react';
import { THEMES } from '../lib/themes';
import { checkNightscoutStatus } from '../lib/nightscout';

const DATA_SOURCES = [
  { id: 'health-export', name: 'Health Auto Export', desc: 'iPhone → Health Auto Export app' },
  { id: 'nightscout-local', name: 'ESEL / Nightscout', desc: 'ESEL → xDrip+ → NSClient → this server' },
  { id: 'nightscout', name: 'External Nightscout', desc: 'Fetch from a Nightscout instance URL' },
  { id: 'xdrip', name: 'xDrip+ Web Service', desc: 'Fetch from xDrip+ local web server' },
];

const APP_ICONS = [
  { id: 'default', name: 'Default', color: '#00843D' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'red', name: 'Red', color: '#dc2626' },
  { id: 'purple', name: 'Purple', color: '#8b5cf6' },
  { id: 'teal', name: 'Teal', color: '#14b8a6' },
];

// Editable numeric setting: type a value directly, or use the -/+ steppers.
// Values are clamped to [min, max] only on commit (blur / Enter / stepper press),
// never while typing, so intermediate keystrokes are not "corrected" mid-entry.
function SettingRow({ label, value, min, max, step = 1, unit, displayTransform, onCommit }) {
  const [draft, setDraft] = useState(null); // string while editing, null when idle
  const numValue = Number.isFinite(value) ? value : (parseInt(value, 10) || 0);
  const editing = draft !== null;
  const clamp = (n) => Math.max(min, Math.min(max, n));

  const stepBy = (delta) => {
    const base = editing ? (parseInt(draft, 10) || numValue) : numValue;
    setDraft(null);
    onCommit(clamp(base + delta));
  };

  const commit = () => {
    if (draft === null) return;
    const parsed = parseInt(draft, 10);
    onCommit(Number.isNaN(parsed) ? numValue : clamp(parsed));
    setDraft(null);
  };

  const shown = editing
    ? draft
    : (displayTransform ? displayTransform(numValue) : String(numValue));

  return (
    <div className="flex items-center justify-between py-3 border-b border-bg-tertiary last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {unit && <div className="text-xs text-text-secondary">{unit}</div>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => stepBy(-step)}
          className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
        >-</button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={shown}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 text-center font-medium tabular-nums text-sm bg-bg-primary rounded-lg border border-bg-tertiary outline-none focus:border-accent py-1"
        />
        <button
          onClick={() => stepBy(step)}
          className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
        >+</button>
      </div>
    </div>
  );
}

export default function Settings({ settings, onUpdateSetting, onExport, onClearAll, onClose, dataCounts }) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [nsUrlInput, setNsUrlInput] = useState(settings.nightscoutUrl || '');
  const [nsStatus, setNsStatus] = useState(null);
  const [nsChecking, setNsChecking] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto">
      <div className="max-w-lg mx-auto p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none w-10 h-10 flex items-center justify-center">&times;</button>
        </div>

        {/* Theme Picker */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Theme</h3>
          <div className="grid grid-cols-4 gap-2">
            {Object.values(THEMES).map((theme) => (
              <button
                key={theme.id}
                onClick={() => onUpdateSetting('theme', theme.id)}
                className={`relative p-2 rounded-xl text-center active:opacity-80 ${
                  settings.theme === theme.id
                    ? 'ring-2 ring-accent bg-bg-secondary'
                    : 'bg-bg-secondary opacity-70'
                }`}
              >
                <div
                  className="w-7 h-7 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: theme.preview }}
                />
                <div className="text-[9px] font-medium leading-tight">{theme.name}</div>
                {settings.theme === theme.id && (
                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Data Source */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Data Source</h3>
          <div className="bg-bg-secondary rounded-xl overflow-hidden">
            {DATA_SOURCES.map((source) => (
              <button
                key={source.id}
                onClick={() => onUpdateSetting('dataSource', source.id)}
                className={`w-full text-left px-4 py-3 border-b border-bg-tertiary last:border-b-0 active:opacity-80 ${
                  settings.dataSource === source.id ? 'bg-accent/10' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                    settings.dataSource === source.id
                      ? 'border-accent bg-accent'
                      : 'border-text-secondary'
                  }`} />
                  <div>
                    <div className="text-sm font-medium">{source.name}</div>
                    <div className="text-[10px] text-text-secondary">{source.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {(settings.dataSource === 'nightscout' || settings.dataSource === 'xdrip') && (
            <div className="mt-2">
              <label className="text-xs text-text-secondary mb-1 block">
                {settings.dataSource === 'xdrip' ? 'xDrip+ URL (e.g. http://192.168.1.x:17580)' : 'Nightscout URL'}
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={nsUrlInput}
                  onChange={(e) => setNsUrlInput(e.target.value)}
                  placeholder={settings.dataSource === 'xdrip' ? 'http://192.168.1.x:17580' : 'https://your-ns.example.com'}
                  className="flex-1 p-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent"
                />
                <button
                  onClick={() => onUpdateSetting('nightscoutUrl', nsUrlInput.trim())}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium active:opacity-80"
                >Save</button>
              </div>
            </div>
          )}

          {settings.dataSource === 'nightscout-local' && (
            <div className="mt-2 px-3 py-2 bg-bg-tertiary/50 rounded-lg space-y-2">
              <div className="text-[10px] text-text-secondary leading-relaxed">
                Configure ESEL/xDrip+/NSClient to upload to:<br />
                <span className="text-accent font-mono text-[11px]">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/entries
                </span><br />
                Use your API key as the <span className="text-accent">api-secret</span> header.
              </div>
              {nsChecking ? (
                <div className="text-[10px] text-text-secondary">Testing connection...</div>
              ) : nsStatus ? (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${nsStatus.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] text-text-secondary">
                    {nsStatus.ok
                      ? `Connected — ${nsStatus.count} reading${nsStatus.count !== 1 ? 's' : ''} on server`
                      : nsStatus.error || 'Connection failed'}
                  </span>
                </div>
              ) : null}
              <button
                onClick={async () => {
                  setNsChecking(true);
                  try {
                    const apiKey = import.meta.env.VITE_SYNC_API_KEY;
                    const url = `${window.location.origin}/api/v1/entries/sgv.json?key=${apiKey}&count=288`;
                    const res = await fetch(url);
                    if (!res.ok) {
                      setNsStatus({ ok: false, error: `HTTP ${res.status}${res.status === 401 ? ' — check API key' : ''}` });
                    } else {
                      const data = await res.json();
                      const count = Array.isArray(data) ? data.length : 0;
                      const latest = count > 0 ? new Date(data[0].dateString || data[0].date).toLocaleTimeString() : null;
                      setNsStatus({
                        ok: true,
                        count: count,
                        latest,
                      });
                    }
                  } catch (err) {
                    setNsStatus({ ok: false, error: err.message });
                  }
                  setNsChecking(false);
                }}
                className="text-[10px] text-accent font-medium active:opacity-80"
              >Test Connection</button>
            </div>
          )}

          {(settings.dataSource === 'nightscout' || settings.dataSource === 'xdrip') && nsUrlInput && (
            <div className="mt-1">
              {nsChecking ? (
                <div className="text-[10px] text-text-secondary px-1">Testing connection...</div>
              ) : nsStatus ? (
                <div className="flex items-center gap-2 px-1">
                  <div className={`w-2 h-2 rounded-full ${nsStatus.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] text-text-secondary">
                    {nsStatus.ok
                      ? `Connected${nsStatus.name ? ` — ${nsStatus.name}` : ''}`
                      : nsStatus.error || 'Connection failed'}
                  </span>
                </div>
              ) : null}
              <button
                onClick={() => {
                  setNsChecking(true);
                  checkNightscoutStatus(nsUrlInput.trim()).then(s => { setNsStatus(s); setNsChecking(false); });
                }}
                className="text-[10px] text-accent font-medium px-1 active:opacity-80"
              >Test Connection</button>
            </div>
          )}
        </div>

        {/* App Icon */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">App Icon</h3>
          <div className="flex gap-2 flex-wrap">
            {APP_ICONS.map((icon) => (
              <button
                key={icon.id}
                onClick={() => onUpdateSetting('appIcon', icon.id)}
                className={`w-14 h-14 rounded-xl flex items-center justify-center active:opacity-80 ${
                  settings.appIcon === icon.id ? 'ring-2 ring-white' : 'opacity-60'
                }`}
                style={{ backgroundColor: icon.color }}
              >
                <span className="text-white text-lg font-black">S</span>
              </button>
            ))}
          </div>
          <div className="text-[10px] text-text-secondary mt-1">
            Re-add to home screen after changing to see the new icon.
          </div>
        </div>

        {/* Bolus insulin settings */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Bolus Insulin (Humalog)</h3>
          <div className="bg-bg-secondary rounded-xl px-4">
            <SettingRow
              label="Duration of Insulin Action"
              value={settings.bolusDIA}
              onCommit={(v) => onUpdateSetting('bolusDIA', v)}
              min={180} max={420} step={15}
              unit="minutes"
              displayTransform={(v) => `${(v / 60).toFixed(1)} hrs`}
            />
            <SettingRow
              label="Peak Activity Time"
              value={settings.bolusPeakTime}
              onCommit={(v) => onUpdateSetting('bolusPeakTime', v)}
              min={45} max={90} step={5}
              unit="minutes"
              displayTransform={(v) => `${v} min`}
            />
            <SettingRow
              label="Insulin Degradation Delay"
              value={settings.insulinDegradationDelay}
              onCommit={(v) => onUpdateSetting('insulinDegradationDelay', v)}
              min={0} max={60} step={5}
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
              value={settings.defaultBasalUnits}
              onCommit={(v) => onUpdateSetting('defaultBasalUnits', v)}
              min={1} max={100} step={1}
              displayTransform={(v) => `${v}u`}
            />
          </div>
        </div>

        {/* Display settings */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Display</h3>
          <div className="bg-bg-secondary rounded-xl px-4">
            <SettingRow label="Target Range Low" value={settings.targetRangeLow} onCommit={(v) => onUpdateSetting('targetRangeLow', v)} min={50} max={100} displayTransform={(v) => `${v} mg/dL`} />
            <SettingRow label="Target Range High" value={settings.targetRangeHigh} onCommit={(v) => onUpdateSetting('targetRangeHigh', v)} min={120} max={250} displayTransform={(v) => `${v} mg/dL`} />
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
                  >Cancel</button>
                  <button
                    onClick={() => { onClearAll(); setShowClearConfirm(false); }}
                    className="flex-1 py-3 rounded-xl font-medium bg-danger text-white"
                  >Delete Everything</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary pb-8 space-y-2">
          <div>Supercharged v2.0</div>
          <div>Build: {new Date(__BUILD_TIME__).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
          <button
            onClick={async () => {
              if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) await reg.unregister();
              }
              if ('caches' in window) {
                const names = await caches.keys();
                for (const name of names) await caches.delete(name);
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
