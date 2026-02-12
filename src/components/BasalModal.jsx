import { useState, useEffect } from 'react';
import { getBasalDoseForDate } from '../lib/db';

export default function BasalModal({ onClose, onSave, defaultUnits }) {
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Check if there's an existing dose for the selected date
    getBasalDoseForDate(date).then((existing) => {
      if (existing) {
        setUnits(String(existing.units));
        setIsEditing(true);
      } else {
        setUnits(defaultUnits ? String(defaultUnits) : '');
        setIsEditing(false);
      }
    });
  }, [date, defaultUnits]);

  const unitsNum = parseFloat(units) || 0;

  const adjustUnits = (delta) => {
    const newVal = Math.max(0, Math.round((unitsNum + delta) * 2) / 2);
    setUnits(newVal > 0 ? String(newVal) : '');
  };

  const handleSave = () => {
    if (unitsNum <= 0) return;
    onSave(unitsNum, date);
    onClose();
  };

  // Generate past 7 days for date picker
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{isEditing ? 'Edit' : 'Log'} Basal</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        {/* Date selection */}
        <div className="mb-6">
          <label className="text-text-secondary text-sm mb-2 block">Date</label>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${d === date ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary'}`}
              >
                {formatDateLabel(d)}
              </button>
            ))}
          </div>
        </div>

        {/* Units input */}
        <div className="mb-6">
          <label className="text-text-secondary text-sm mb-2 block">Units (Toujeo)</label>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => adjustUnits(-1)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-xl font-bold active:bg-bg-primary"
            >
              -1
            </button>
            <button
              onClick={() => adjustUnits(-0.5)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-lg font-bold active:bg-bg-primary"
            >
              -.5
            </button>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="0"
              className="w-24 h-16 text-center text-4xl font-bold bg-bg-primary rounded-xl border border-bg-tertiary focus:border-accent outline-none"
            />
            <button
              onClick={() => adjustUnits(0.5)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-lg font-bold active:bg-bg-primary"
            >
              +.5
            </button>
            <button
              onClick={() => adjustUnits(1)}
              className="w-12 h-12 rounded-xl bg-bg-tertiary text-xl font-bold active:bg-bg-primary"
            >
              +1
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={unitsNum <= 0}
          className="w-full py-4 rounded-xl font-bold text-lg bg-accent text-white disabled:opacity-40 active:opacity-80"
        >
          {isEditing ? 'Update' : 'Log'} {unitsNum > 0 ? `${unitsNum}u Toujeo` : 'Basal'}
        </button>
      </div>
    </div>
  );
}
