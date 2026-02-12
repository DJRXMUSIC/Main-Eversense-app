import { useState } from 'react';

export default function Header({ currentIOB, todayBasal, glucoseData, onOpenSettings }) {
  const lastReading = glucoseData.length > 0 ? glucoseData[glucoseData.length - 1] : null;

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-bold tracking-tight">Supercharged</h1>
        <button
          onClick={onOpenSettings}
          className="p-3 rounded-lg bg-bg-secondary text-text-secondary hover:text-text-primary"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex items-end gap-6">
        {/* IOB Display */}
        <div>
          <div className="text-text-secondary text-xs uppercase tracking-wider">Insulin on Board</div>
          <div className="text-4xl font-bold text-insulin tabular-nums">
            {currentIOB.toFixed(1)}<span className="text-lg ml-1">u</span>
          </div>
        </div>

        {/* Last glucose */}
        <div className="flex-1">
          {lastReading && (
            <div>
              <div className="text-text-secondary text-xs">Last Reading</div>
              <div className="text-xl font-semibold text-glucose">
                {lastReading.value} <span className="text-sm text-text-secondary">mg/dL</span>
              </div>
              <div className="text-xs text-text-secondary">{formatTime(lastReading.timestamp)}</div>
            </div>
          )}
        </div>

        {/* Basal status */}
        <div className="text-right">
          <div className="text-text-secondary text-xs">Toujeo</div>
          {todayBasal ? (
            <div className="text-sm font-medium text-target">
              {todayBasal.units}u ✓
            </div>
          ) : (
            <div className="text-sm font-medium text-danger">
              Not logged
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
