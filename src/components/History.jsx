import { useState, useMemo } from 'react';

function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const INTENSITY_LABELS = ['', 'Light', 'Moderate', 'Intense'];
const INTENSITY_DOT = ['', 'bg-green-500', 'bg-yellow-400', 'bg-red-500'];

// Generate 15-min time offset options for editing
const TIME_OFFSETS = [];
for (let m = -120; m <= 120; m += 15) {
  if (m === 0) TIME_OFFSETS.push({ label: 'No change', minutes: 0 });
  else if (m < 0) TIME_OFFSETS.push({ label: `${Math.abs(m)}m earlier`, minutes: m });
  else TIME_OFFSETS.push({ label: `${m}m later`, minutes: m });
}

export default function History({ bolusDoses, basalDoses, exerciseLogs, onEditBolus, onDeleteBolus, onEditBasal, onDeleteBasal, onEditExercise, onDeleteExercise }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editTimeOffset, setEditTimeOffset] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const cutoff48h = useMemo(() => Date.now() - 48 * 60 * 60 * 1000, []);

  const allEvents = useMemo(() => {
    const all = [];

    for (const dose of bolusDoses) {
      all.push({
        id: dose.id,
        type: 'bolus',
        dateKey: dose.date,
        time: new Date(dose.timestamp),
        timestamp: dose.timestamp,
        units: dose.units,
        label: `${dose.units}u Humalog`,
        detail: new Date(dose.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      });
    }

    for (const dose of basalDoses) {
      all.push({
        id: dose.id,
        type: 'basal',
        dateKey: dose.date,
        time: new Date(dose.date + 'T12:00:00'),
        units: dose.units,
        label: `${dose.units}u Toujeo`,
        detail: 'Daily basal',
      });
    }

    for (const ex of (exerciseLogs || [])) {
      const t = new Date(ex.timestamp);
      all.push({
        id: ex.id,
        type: 'exercise',
        dateKey: localDate(t),
        time: t,
        intensity: ex.intensity,
        label: `${INTENSITY_LABELS[ex.intensity] || 'Exercise'}`,
        detail: t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      });
    }

    all.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
      if (a.type === 'basal' && b.type !== 'basal') return 1;
      if (b.type === 'basal' && a.type !== 'basal') return -1;
      return b.time - a.time;
    });
    return all;
  }, [bolusDoses, basalDoses, exerciseLogs]);

  const recentEvents = useMemo(() => {
    return allEvents.filter(e => e.time.getTime() >= cutoff48h);
  }, [allEvents, cutoff48h]);

  const olderCount = allEvents.length - recentEvents.length;
  const events = showAll ? allEvents : recentEvents;

  const grouped = useMemo(() => {
    const groups = {};
    for (const event of events) {
      if (!groups[event.dateKey]) groups[event.dateKey] = [];
      groups[event.dateKey].push(event);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [events]);

  const formatDateHeader = (dateStr) => {
    const today = localDate();
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === localDate(yesterday)) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const startEdit = (event) => {
    setEditingId(event.id);
    setEditValue(event.units != null ? String(event.units) : '');
    setEditTimeOffset(0);
    setConfirmDeleteId(null);
  };

  const saveEdit = (event) => {
    if (event.type === 'exercise') {
      if (editTimeOffset !== 0 && event.timestamp) {
        const newTime = new Date(new Date(event.timestamp).getTime() + editTimeOffset * 60000);
        onEditExercise(event.id, { timestamp: newTime.toISOString() });
      }
      setEditingId(null);
      return;
    }
    const newUnits = parseInt(editValue);
    if (!newUnits || newUnits <= 0) {
      setEditingId(null);
      return;
    }
    if (event.type === 'bolus') {
      const updates = { units: newUnits };
      if (editTimeOffset !== 0 && event.timestamp) {
        const newTime = new Date(new Date(event.timestamp).getTime() + editTimeOffset * 60000);
        updates.timestamp = newTime.toISOString();
      }
      onEditBolus(event.id, updates);
    } else {
      onEditBasal(event.id, newUnits);
    }
    setEditingId(null);
  };

  const handleDelete = (event) => {
    if (event.type === 'bolus') onDeleteBolus(event.id);
    else if (event.type === 'basal') onDeleteBasal(event.id);
    else if (event.type === 'exercise') onDeleteExercise(event.id);
    setConfirmDeleteId(null);
  };

  const getDotColor = (event) => {
    if (event.type === 'bolus') return 'bg-accent';
    if (event.type === 'basal') return 'bg-glucose';
    return INTENSITY_DOT[event.intensity] || 'bg-gray-400';
  };

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-text-secondary">
          History ({recentEvents.length})
        </div>
        {olderCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-accent font-medium active:opacity-70"
          >
            {showAll ? 'Recent' : `+${olderCount} older`}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {grouped.map(([dateStr, dateEvents]) => (
          <div key={dateStr}>
            <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-0.5">
              {formatDateHeader(dateStr)}
            </div>
            <div className="bg-bg-secondary rounded-lg overflow-hidden">
              {dateEvents.map((event) => (
                <div key={event.id} className="border-b border-bg-tertiary last:border-b-0">
                  {confirmDeleteId === event.id ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 text-xs text-danger">Delete {event.label}?</div>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded text-[10px] font-medium bg-bg-tertiary text-text-secondary">Cancel</button>
                      <button onClick={() => handleDelete(event)} className="px-2 py-1 rounded text-[10px] font-medium bg-danger text-white">Delete</button>
                    </div>
                  ) : editingId === event.id ? (
                    <div className="px-3 py-2 space-y-1.5" style={{ paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}>
                      {event.type !== 'exercise' && (
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getDotColor(event)}`} />
                          <div className="flex items-center gap-1 flex-1">
                            <button onClick={() => setEditValue(String(Math.max(1, (parseInt(editValue) || 0) - 1)))} className="w-7 h-7 rounded bg-bg-tertiary text-xs font-bold active:bg-bg-primary">-</button>
                            <input type="number" inputMode="numeric" value={editValue} onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))} className="w-12 h-7 text-center text-xs font-bold bg-bg-primary rounded border border-bg-tertiary outline-none" autoFocus />
                            <button onClick={() => setEditValue(String((parseInt(editValue) || 0) + 1))} className="w-7 h-7 rounded bg-bg-tertiary text-xs font-bold active:bg-bg-primary">+</button>
                            <span className="text-[10px] text-text-secondary ml-0.5">u</span>
                          </div>
                        </div>
                      )}
                      {event.type === 'exercise' && (
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getDotColor(event)}`} />
                          <span className="text-xs font-medium">{event.label}</span>
                          <span className="text-[10px] text-text-secondary">— adjust time</span>
                        </div>
                      )}
                      {(event.type === 'bolus' || event.type === 'exercise') && (
                        <div className="flex gap-1 flex-wrap">
                          {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map((m) => (
                            <button
                              key={m}
                              onClick={() => setEditTimeOffset(m)}
                              className={`px-1.5 py-1 rounded text-[9px] font-medium ${
                                editTimeOffset === m
                                  ? 'bg-accent text-white'
                                  : 'bg-bg-tertiary text-text-secondary'
                              }`}
                            >
                              {m === 0 ? 'Same' : m < 0 ? `${Math.abs(m)}m \u25C0` : `${m}m \u25B6`}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded text-[10px] font-medium bg-bg-tertiary text-text-secondary">Cancel</button>
                        <button onClick={() => saveEdit(event)} className="flex-1 py-1.5 rounded text-[10px] font-medium bg-accent text-white">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getDotColor(event)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{event.label}</div>
                        <div className="text-[10px] text-text-secondary">{event.detail}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(event)} className="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-secondary active:bg-bg-primary">Edit</button>
                        <button onClick={() => { setConfirmDeleteId(event.id); setEditingId(null); }} className="px-1.5 py-0.5 rounded text-[10px] bg-danger/20 text-danger active:bg-danger/30">Del</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <div className="text-center text-xs text-text-secondary py-3">No entries yet</div>
        )}
      </div>
    </div>
  );
}
