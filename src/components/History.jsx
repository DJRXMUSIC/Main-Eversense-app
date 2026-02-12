import { useState, useMemo } from 'react';

export default function History({ bolusDoses, basalDoses, glucoseData }) {
  const [expanded, setExpanded] = useState(false);

  // Merge all events into a single sorted timeline
  const events = useMemo(() => {
    const all = [];

    for (const dose of bolusDoses) {
      all.push({
        id: dose.id,
        type: 'bolus',
        time: new Date(dose.timestamp),
        label: `${dose.units}u Humalog`,
        detail: new Date(dose.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      });
    }

    for (const dose of basalDoses) {
      all.push({
        id: dose.id,
        type: 'basal',
        time: new Date(dose.date + 'T12:00:00'),
        label: `${dose.units}u Toujeo`,
        detail: 'Daily basal',
      });
    }

    // Sort newest first
    all.sort((a, b) => b.time - a.time);
    return all;
  }, [bolusDoses, basalDoses]);

  // Group events by date
  const grouped = useMemo(() => {
    const groups = {};
    for (const event of events) {
      const dateKey = event.time.toISOString().split('T')[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [events]);

  const formatDateHeader = (dateStr) => {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const displayGroups = expanded ? grouped : grouped.slice(0, 2);

  return (
    <div className="px-4 pb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-text-secondary mb-2"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        History ({events.length} entries)
      </button>

      {expanded || events.length <= 8 ? (
        <div className="space-y-3">
          {displayGroups.map(([dateStr, dateEvents]) => (
            <div key={dateStr}>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                {formatDateHeader(dateStr)}
              </div>
              <div className="bg-bg-secondary rounded-xl overflow-hidden">
                {dateEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-bg-tertiary last:border-b-0"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${event.type === 'bolus' ? 'bg-accent' : 'bg-glucose'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{event.label}</div>
                      <div className="text-xs text-text-secondary">{event.detail}</div>
                    </div>
                    <div className="text-xs text-text-secondary flex-shrink-0">
                      {event.type === 'bolus' ? 'Bolus' : 'Basal'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!expanded && grouped.length > 2 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full text-center text-sm text-accent py-2"
            >
              Show more ({grouped.length - 2} more days)
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
