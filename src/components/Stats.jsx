import { useMemo } from 'react';

export default function Stats({ bolusDoses, basalDoses }) {
  // Today's bolus since 1:00 AM
  const todayBolusTotal = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0);
    // If it's before 1am, use yesterday's 1am
    if (now < cutoff) {
      cutoff.setDate(cutoff.getDate() - 1);
    }
    const cutoffISO = cutoff.toISOString();
    return bolusDoses
      .filter(d => d.timestamp >= cutoffISO)
      .reduce((sum, d) => sum + d.units, 0);
  }, [bolusDoses]);

  // 3-day rolling average bolus (total units per day, averaged over last 3 full days)
  const threeDayAvgBolus = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const days = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    let totalUnits = 0;
    let daysWithData = 0;
    for (const day of days) {
      const dayDoses = bolusDoses.filter(d => d.date === day);
      if (dayDoses.length > 0) {
        totalUnits += dayDoses.reduce((sum, d) => sum + d.units, 0);
        daysWithData++;
      }
    }
    return daysWithData > 0 ? totalUnits / daysWithData : 0;
  }, [bolusDoses]);

  // 3-day rolling average basal
  const threeDayAvgBasal = useMemo(() => {
    const days = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    let totalUnits = 0;
    let daysWithData = 0;
    for (const day of days) {
      const dayDose = basalDoses.find(d => d.date === day);
      if (dayDose) {
        totalUnits += dayDose.units;
        daysWithData++;
      }
    }
    return daysWithData > 0 ? totalUnits / daysWithData : 0;
  }, [basalDoses]);

  const activeTiles = [
    {
      id: 'today-bolus',
      label: 'Bolus Today',
      sublabel: 'Since 1:00 AM',
      value: `${todayBolusTotal}u`,
      color: 'text-accent',
    },
    {
      id: '3d-avg-bolus',
      label: '3-Day Avg Bolus',
      sublabel: 'Units/day',
      value: `${threeDayAvgBolus.toFixed(1)}u`,
      color: 'text-accent',
    },
    {
      id: '3d-avg-basal',
      label: '3-Day Avg Basal',
      sublabel: 'Units/day',
      value: `${threeDayAvgBasal.toFixed(1)}u`,
      color: 'text-glucose',
    },
  ];

  const placeholderTiles = [];
  for (let i = 4; i <= 20; i++) {
    placeholderTiles.push({
      id: `placeholder-${i}`,
      label: `Stat ${i}`,
      sublabel: 'Coming soon',
      value: '—',
      color: 'text-text-secondary',
      placeholder: true,
    });
  }

  const allTiles = [...activeTiles, ...placeholderTiles];

  return (
    <div className="px-4 pb-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Stats</h3>
      <div className="grid grid-cols-2 gap-2">
        {allTiles.map((tile) => (
          <div
            key={tile.id}
            className={`bg-bg-secondary rounded-xl p-3 ${tile.placeholder ? 'opacity-30' : ''}`}
          >
            <div className="text-xs text-text-secondary">{tile.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${tile.color}`}>
              {tile.value}
            </div>
            {tile.sublabel && (
              <div className="text-[10px] text-text-secondary opacity-70">{tile.sublabel}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
