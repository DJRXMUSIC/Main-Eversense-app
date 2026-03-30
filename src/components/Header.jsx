import { useMemo } from 'react';

const DIRECTION_ARROWS = {
  DoubleUp: '\u21C8',
  SingleUp: '\u2191',
  FortyFiveUp: '\u2197',
  Flat: '\u2192',
  FortyFiveDown: '\u2198',
  SingleDown: '\u2193',
  DoubleDown: '\u21CA',
  'NOT COMPUTABLE': '?',
  'RATE OUT OF RANGE': '\u26A0',
  NONE: '',
};


export default function Header({ currentIOB, todayBasal, glucoseData, onOpenSettings, syncing, lastSyncResult, onSync, settings }) {
  const lastReading = glucoseData.length > 0 ? glucoseData[glucoseData.length - 1] : null;

  const bgStatus = useMemo(() => {
    if (!lastReading) return { color: 'text-text-secondary', label: '---', stale: true };
    const v = lastReading.value;
    const low = settings?.targetRangeLow || 70;
    const high = settings?.targetRangeHigh || 160;
    const minutesAgo = (Date.now() - new Date(lastReading.timestamp).getTime()) / 60000;
    const stale = minutesAgo > 15;

    if (v < low) return { color: 'text-danger', label: 'LOW', stale };
    if (v > high + 40) return { color: 'text-danger', label: 'HIGH', stale };
    if (v > high) return { color: 'text-yellow-400', label: 'Above', stale };
    return { color: 'text-accent', label: 'In Range', stale };
  }, [lastReading, settings]);

  const minutesAgo = useMemo(() => {
    if (!lastReading) return null;
    const mins = Math.round((Date.now() - new Date(lastReading.timestamp).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }, [lastReading]);

  const trendArrow = useMemo(() => {
    if (!lastReading?.direction) return '';
    return DIRECTION_ARROWS[lastReading.direction] || '';
  }, [lastReading]);

  const syncStatus = useMemo(() => {
    if (!lastSyncResult) return null;
    const secsAgo = Math.round((Date.now() - new Date(lastSyncResult.time).getTime()) / 1000);
    if (secsAgo > 120) return null;
    if (lastSyncResult.error) {
      const msg = lastSyncResult.error.length > 500 ? lastSyncResult.error.slice(0, 500) + '...' : lastSyncResult.error;
      return { text: `Sync error: ${msg}`, ok: false };
    }
    if (lastSyncResult.imported > 0) return { text: `+${lastSyncResult.imported} new readings`, ok: true };
    return { text: 'Synced — no new data', ok: true };
  }, [lastSyncResult]);

  return (
    <div className="px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
      {/* Top bar — sync status replaces title text to avoid layout shift */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {syncStatus ? (
            <div className={`text-[10px] truncate ${syncStatus.ok ? 'text-text-secondary' : 'text-danger'}`}>
              {syncStatus.text}
            </div>
          ) : (
            <h1 className="text-sm font-bold tracking-tight opacity-60">Supercharged</h1>
          )}
          {syncing && (
            <svg className="h-3 w-3 text-accent animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onSync} disabled={syncing} className="p-2 rounded-lg text-text-secondary active:opacity-70 disabled:opacity-50" aria-label="Sync">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button onClick={onOpenSettings} className="p-2 rounded-lg text-text-secondary active:opacity-70" aria-label="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hero: BG + right column */}
      <div className="flex items-stretch gap-2 mb-1">
        {/* Blood Glucose */}
        <div className="flex-1 bg-bg-secondary rounded-xl p-3 flex flex-col items-center justify-center min-h-[80px]">
          <div className="text-[9px] uppercase tracking-widest text-text-secondary mb-0.5">Blood Glucose</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-black tabular-nums ${bgStatus.color} ${bgStatus.stale ? 'opacity-50' : ''}`}>
              {lastReading ? lastReading.value : '---'}
            </span>
            {trendArrow && (
              <span className={`text-base ${bgStatus.color}`}>{trendArrow}</span>
            )}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            {minutesAgo ? <span>{minutesAgo}</span> : <span>No data</span>}
          </div>
          {lastReading && (
            <div className={`text-[9px] font-medium mt-0.5 ${bgStatus.color}`}>{bgStatus.label}</div>
          )}
        </div>

        {/* Right column: IOB + Basal stacked */}
        <div className="flex flex-col gap-1.5 w-[130px]">
          <div className="flex-1 bg-bg-secondary rounded-xl p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] uppercase tracking-widest text-text-secondary">IOB</div>
            <div className="text-4xl font-black text-accent tabular-nums">{currentIOB.toFixed(1)}</div>
            <div className="text-[9px] text-text-secondary">units</div>
          </div>
          <div className="bg-bg-secondary rounded-xl p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] uppercase tracking-widest text-text-secondary">Toujeo</div>
            {todayBasal ? (
              <div className="text-base font-bold text-accent tabular-nums">{todayBasal.units}u</div>
            ) : (
              <div className="text-[10px] font-medium text-danger mt-0.5">Not logged</div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
