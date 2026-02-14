import { useMemo } from 'react';

const DIRECTION_ARROWS = {
  DoubleUp: '⇈',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '⇊',
  'NOT COMPUTABLE': '?',
  'RATE OUT OF RANGE': '⚠',
  NONE: '',
};

export default function Header({ currentIOB, todayBasal, glucoseData, onOpenSettings, syncing, onSync, settings }) {
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

  return (
    <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1">
      {/* Top bar: app name + action buttons */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold tracking-tight opacity-60">Supercharged</h1>
          {syncing && (
            <svg className="h-3.5 w-3.5 text-accent animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onSync}
            disabled={syncing}
            className="p-2.5 rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-50 active:opacity-70"
            aria-label="Sync"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-lg text-text-secondary hover:text-text-primary active:opacity-70"
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hero: BG + IOB side by side, big and bold */}
      <div className="flex items-stretch gap-3 mb-2">
        {/* Blood Glucose — the biggest element */}
        <div className="flex-1 bg-bg-secondary rounded-2xl p-4 flex flex-col items-center justify-center min-h-[120px]">
          <div className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">Blood Glucose</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-5xl font-black tabular-nums ${bgStatus.color} ${bgStatus.stale ? 'opacity-50' : ''}`}>
              {lastReading ? lastReading.value : '---'}
            </span>
            {trendArrow && (
              <span className={`text-2xl ${bgStatus.color}`}>{trendArrow}</span>
            )}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {minutesAgo ? (
              <span className={bgStatus.stale ? 'text-danger' : ''}>
                {bgStatus.stale ? '⚠ ' : ''}{minutesAgo}
              </span>
            ) : (
              <span>No data</span>
            )}
          </div>
          {lastReading && (
            <div className={`text-[10px] font-medium mt-0.5 ${bgStatus.color}`}>
              {bgStatus.label}
            </div>
          )}
        </div>

        {/* Right column: IOB + Basal stacked */}
        <div className="flex flex-col gap-2 w-[120px]">
          {/* IOB */}
          <div className="flex-1 bg-bg-secondary rounded-2xl p-3 flex flex-col items-center justify-center">
            <div className="text-[10px] uppercase tracking-widest text-text-secondary">IOB</div>
            <div className="text-3xl font-black text-accent tabular-nums">
              {currentIOB.toFixed(1)}
            </div>
            <div className="text-[10px] text-text-secondary">units</div>
          </div>

          {/* Basal status */}
          <div className="bg-bg-secondary rounded-2xl p-3 flex flex-col items-center justify-center">
            <div className="text-[10px] uppercase tracking-widest text-text-secondary">Toujeo</div>
            {todayBasal ? (
              <div className="text-lg font-bold text-accent tabular-nums">{todayBasal.units}u</div>
            ) : (
              <div className="text-xs font-medium text-danger mt-0.5">Not logged</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
