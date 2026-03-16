import { useState } from 'react';

// Generate 15-min increment options: "Now", "15m ago", "30m ago", ... up to 8 hours
const TIME_OPTIONS = [{ label: 'Now', minutes: 0 }];
for (let m = 15; m <= 480; m += 15) {
  if (m < 60) {
    TIME_OPTIONS.push({ label: `${m}m`, minutes: m });
  } else {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    TIME_OPTIONS.push({ label: rm > 0 ? `${h}h${rm}m` : `${h}h`, minutes: m });
  }
}

export default function BolusModal({ onClose, onSave }) {
  const [units, setUnits] = useState('2');
  const [minutesAgo, setMinutesAgo] = useState(0);

  const unitsNum = parseInt(units) || 0;

  const adjustUnits = (delta) => {
    const newVal = Math.max(0, unitsNum + delta);
    setUnits(newVal > 0 ? String(newVal) : '');
  };

  const handleSave = () => {
    if (unitsNum <= 0) return;
    const timestamp = new Date(Date.now() - minutesAgo * 60000).toISOString();
    onSave(unitsNum, timestamp);
    onClose();
  };

  const selectedLabel = TIME_OPTIONS.find(o => o.minutes === minutesAgo)?.label || 'Now';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Log Bolus</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        {/* Units input */}
        <div className="mb-4">
          <label className="text-text-secondary text-xs mb-1.5 block">Units (Humalog)</label>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => adjustUnits(-1)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-xl font-bold active:bg-bg-primary"
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
              className="w-20 h-14 text-center text-3xl font-bold bg-bg-primary rounded-xl border border-bg-tertiary focus:border-accent outline-none"
            />
            <button
              onClick={() => adjustUnits(1)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-xl font-bold active:bg-bg-primary"
            >
              +1
            </button>
            <button
              onClick={() => adjustUnits(5)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-lg font-bold active:bg-bg-primary"
            >
              +5
            </button>
          </div>
        </div>

        {/* Time selection — 15 min increments */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <label className="text-text-secondary text-xs">Time</label>
            <span className="text-xs text-accent font-medium">{minutesAgo === 0 ? 'Now' : `${selectedLabel} ago`}</span>
          </div>
          <div className="max-h-28 overflow-y-auto rounded-lg bg-bg-primary border border-bg-tertiary p-1.5">
            <div className="grid grid-cols-5 gap-1">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  onClick={() => setMinutesAgo(opt.minutes)}
                  className={`py-1.5 rounded text-[11px] font-medium ${
                    minutesAgo === opt.minutes
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary active:bg-bg-tertiary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={unitsNum <= 0}
          className="w-full py-3 rounded-xl font-bold text-base bg-accent text-white disabled:opacity-40 active:opacity-80"
        >
          Log {unitsNum > 0 ? `${unitsNum}u Bolus` : 'Bolus'}
        </button>
      </div>
    </div>
  );
}
