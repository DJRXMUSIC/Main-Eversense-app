import { useState } from 'react';

export default function BolusModal({ onClose, onSave }) {
  const [units, setUnits] = useState('2');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  const unitsNum = parseInt(units) || 0;

  const adjustUnits = (delta) => {
    const newVal = Math.max(0, unitsNum + delta);
    setUnits(newVal > 0 ? String(newVal) : '');
  };

  const handleSave = () => {
    if (unitsNum <= 0) return;
    const timestamp = useCustomTime
      ? new Date(customTime).toISOString()
      : new Date().toISOString();
    onSave(unitsNum, timestamp);
    onClose();
  };

  const getRelativeTime = () => {
    if (!useCustomTime) return 'Now';
    const diff = Date.now() - new Date(customTime).getTime();
    const mins = Math.round(diff / 60000);
    if (mins <= 0) return 'Now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-6 pb-10 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Log Bolus</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        {/* Units input */}
        <div className="mb-6">
          <label className="text-text-secondary text-sm mb-2 block">Units (Humalog)</label>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => adjustUnits(-1)}
              className="w-14 h-14 rounded-xl bg-bg-tertiary text-2xl font-bold active:bg-bg-primary"
            >
              -1
            </button>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={units}
              onChange={(e) => setUnits(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-24 h-16 text-center text-4xl font-bold bg-bg-primary rounded-xl border border-bg-tertiary focus:border-accent outline-none"
            />
            <button
              onClick={() => adjustUnits(1)}
              className="w-14 h-14 rounded-xl bg-bg-tertiary text-2xl font-bold active:bg-bg-primary"
            >
              +1
            </button>
            <button
              onClick={() => adjustUnits(5)}
              className="w-14 h-14 rounded-xl bg-bg-tertiary text-xl font-bold active:bg-bg-primary"
            >
              +5
            </button>
          </div>
        </div>

        {/* Time selection */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-text-secondary text-sm">Time</label>
            <span className="text-xs text-text-secondary">({getRelativeTime()})</span>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setUseCustomTime(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${!useCustomTime ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary'}`}
            >
              Now
            </button>
            <button
              onClick={() => setUseCustomTime(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${useCustomTime ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary'}`}
            >
              Custom Time
            </button>
          </div>
          {useCustomTime && (
            <input
              type="datetime-local"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-full p-3 rounded-lg bg-bg-primary border border-bg-tertiary text-text-primary"
            />
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={unitsNum <= 0}
          className="w-full py-4 rounded-xl font-bold text-lg bg-accent text-white disabled:opacity-40 active:opacity-80"
        >
          Log {unitsNum > 0 ? `${unitsNum}u Bolus` : 'Bolus'}
        </button>
      </div>
    </div>
  );
}
