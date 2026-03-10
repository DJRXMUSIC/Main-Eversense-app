import { useState, useMemo } from 'react';

function localDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toLocalDatetimeValue(isoString) {
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function History({ bolusDoses, basalDoses, onEditBolus, onDeleteBolus, onEditBasal, onDeleteBasal }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editTime, setEditTime] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const cutoff48h = useMemo(() => Date.now() - 48 * 60 * 60 * 1000, []);

  // Merge all events into a single sorted timeline
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

    all.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
      if (a.type === 'basal' && b.type !== 'basal') return 1;
      if (b.type === 'basal' && a.type !== 'basal') return -1;
      return b.time - a.time;
    });
    return all;
  }, [bolusDoses, basalDoses]);

  // Recent = last 48 hours
  const recentEvents = useMemo(() => {
    return allEvents.filter(e => e.time.getTime() >= cutoff48h);
  }, [allEvents, cutoff48h]);

  const olderCount = allEvents.length - recentEvents.length;

  const events = showAll ? allEvents : recentEvents;

  // Group events by local date
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
    setEditValue(String(event.units));
    setEditTime(event.type === 'bolus' && event.timestamp ? toLocalDatetimeValue(event.timestamp) : '');
    setConfirmDeleteId(null);
  };

  const saveEdit = (event) => {
    const newUnits = parseInt(editValue);
    if (!newUnits || newUnits <= 0) {
      setEditingId(null);
      return;
    }
    if (event.type === 'bolus') {
      const updates = { units: newUnits };
      if (editTime) {
        updates.timestamp = new Date(editTime).toISOString();
      }
      onEditBolus(event.id, updates);
    } else {
      onEditBasal(event.id, newUnits);
    }
    setEditingId(null);
  };

  const handleDelete = (event) => {
    if (event.type === 'bolus') {
      onDeleteBolus(event.id);
    } else {
      onDeleteBasal(event.id);
    }
    setConfirmDeleteId(null);
  };

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-text-secondary">
          History ({recentEvents.length} recent)
        </div>
        {olderCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-accent font-medium active:opacity-70"
          >
            {showAll ? 'Show Recent' : `+${olderCount} older`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {grouped.map(([dateStr, dateEvents]) => (
          <div key={dateStr}>
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {formatDateHeader(dateStr)}
            </div>
            <div className="bg-bg-secondary rounded-xl overflow-hidden">
              {dateEvents.map((event) => (
                <div
                  key={event.id}
                  className="border-b border-bg-tertiary last:border-b-0"
                >
                  {confirmDeleteId === event.id ? (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <div className="flex-1 text-sm text-danger">Delete {event.label}?</div>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-tertiary text-text-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(event)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-danger text-white"
                      >
                        Delete
                      </button>
                    </div>
                  ) : editingId === event.id ? (
                    /* Edit row — scrollable above keyboard */
                    <div className="px-4 py-2 space-y-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${event.type === 'bolus' ? 'bg-accent' : 'bg-glucose'}`} />
                        <div className="flex items-center gap-1 flex-1">
                          <button
                            onClick={() => setEditValue(String(Math.max(1, (parseInt(editValue) || 0) - 1)))}
                            className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
                          >-</button>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))}
                            className="w-14 h-8 text-center text-sm font-bold bg-bg-primary rounded-lg border border-bg-tertiary outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => setEditValue(String((parseInt(editValue) || 0) + 1))}
                            className="w-8 h-8 rounded-lg bg-bg-tertiary text-sm font-bold active:bg-bg-primary"
                          >+</button>
                          <span className="text-xs text-text-secondary ml-1">u</span>
                        </div>
                      </div>
                      {/* Date/time editor for bolus entries */}
                      {event.type === 'bolus' && (
                        <input
                          type="datetime-local"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-full p-2 rounded-lg bg-bg-primary border border-bg-tertiary text-text-primary text-sm"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 py-2 rounded-lg text-xs font-medium bg-bg-tertiary text-text-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(event)}
                          className="flex-1 py-2 rounded-lg text-xs font-medium bg-accent text-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${event.type === 'bolus' ? 'bg-accent' : 'bg-glucose'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{event.label}</div>
                        <div className="text-xs text-text-secondary">{event.detail}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(event)}
                          className="px-2 py-1 rounded-md text-xs bg-bg-tertiary text-text-secondary active:bg-bg-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setConfirmDeleteId(event.id); setEditingId(null); }}
                          className="px-2 py-1 rounded-md text-xs bg-danger/20 text-danger active:bg-danger/30"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <div className="text-center text-sm text-text-secondary py-4">No entries yet</div>
        )}
      </div>
    </div>
  );
}
