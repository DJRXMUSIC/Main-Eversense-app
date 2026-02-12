import { useState } from 'react';

export default function BasalLog({ basalDoses }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="px-4 pb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-text-secondary mb-2"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        Basal Log ({basalDoses.length} days)
      </button>

      {expanded && (
        <div className="bg-bg-secondary rounded-xl overflow-hidden">
          {basalDoses.length === 0 ? (
            <div className="p-4 text-text-secondary text-sm text-center">No basal doses logged</div>
          ) : (
            basalDoses.map((dose) => (
              <div key={dose.id} className="flex justify-between items-center px-4 py-3 border-b border-bg-tertiary last:border-b-0">
                <span className="text-sm">{formatDate(dose.date)}</span>
                <span className="font-medium">{dose.units}u</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
