import { useState } from 'react';

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

export default function HighFatModal({ onClose, onSave }) {
  const [minutesAgo, setMinutesAgo] = useState(0);

  const selectedLabel = TIME_OPTIONS.find(o => o.minutes === minutesAgo)?.label || 'Now';

  const handleSave = () => {
    const timestamp = new Date(Date.now() - minutesAgo * 60000).toISOString();
    onSave(timestamp);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Log Insulin Resistance</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        <p className="text-xs text-text-secondary mb-3">When did the high-fat meal start?</p>

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
          className="w-full py-3 rounded-xl font-bold text-base bg-accent text-white active:opacity-80"
        >
          Start Insulin Resistance Timer
        </button>
      </div>
    </div>
  );
}
