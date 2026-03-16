import { useState, useEffect } from 'react';
import { getBasalDoseForDate } from '../lib/db';

function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function BasalModal({ onClose, onSave, defaultUnits }) {
  const [units, setUnits] = useState('');
  const [date, setDate] = useState(() => localDate());
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    getBasalDoseForDate(date).then((existing) => {
      if (existing) {
        setUnits(String(Math.round(existing.units)));
        setIsEditing(true);
      } else {
        setUnits(defaultUnits ? String(Math.round(defaultUnits)) : '');
        setIsEditing(false);
      }
    });
  }, [date, defaultUnits]);

  const unitsNum = parseInt(units) || 0;

  const adjustUnits = (delta) => {
    const newVal = Math.max(0, unitsNum + delta);
    setUnits(newVal > 0 ? String(newVal) : '');
  };

  const handleSave = () => {
    if (unitsNum <= 0) return;
    onSave(unitsNum, date);
    onClose();
  };

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(localDate(d));
  }

  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = localDate();
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === localDate(yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-secondary rounded-t-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{isEditing ? 'Edit' : 'Log'} Basal</h2>
          <button onClick={onClose} className="text-text-secondary text-2xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <label className="text-text-secondary text-xs mb-1.5 block">Date</label>
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${d === date ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary'}`}
              >
                {formatDateLabel(d)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-text-secondary text-xs mb-1.5 block">Units (Toujeo)</label>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => adjustUnits(-1)}
              className="w-11 h-11 rounded-xl bg-bg-tertiary text-lg font-bold active:bg-bg-primary"
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
              className="w-11 h-11 rounded-xl bg-bg-tertiary text-lg font-bold active:bg-bg-primary"
            >
              +1
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={unitsNum <= 0}
          className="w-full py-3 rounded-xl font-bold text-base bg-accent text-white disabled:opacity-40 active:opacity-80"
        >
          {isEditing ? 'Update' : 'Log'} {unitsNum > 0 ? `${unitsNum}u Toujeo` : 'Basal'}
        </button>
      </div>
    </div>
  );
}
