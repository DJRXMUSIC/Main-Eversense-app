import { useMemo } from 'react';

export default function Stats({ bolusDoses, basalDoses }) {
  const today = new Date().toISOString().split('T')[0];

  // Today's bolus since midnight (00:00)
  const todayBolusDoses = useMemo(() => {
    return bolusDoses.filter(d => d.date === today);
  }, [bolusDoses, today]);

  const todayBolusTotal = useMemo(() => {
    return todayBolusDoses.reduce((sum, d) => sum + d.units, 0);
  }, [todayBolusDoses]);

  // Number of bolus injections today
  const todayDoseCount = todayBolusDoses.length;

  // Today's basal
  const todayBasalUnits = useMemo(() => {
    const dose = basalDoses.find(d => d.date === today);
    return dose ? dose.units : 0;
  }, [basalDoses, today]);

  // Total Daily Insulin (bolus + basal)
  const todayTDI = todayBolusTotal + todayBasalUnits;

  // Bolus : Basal ratio
  const bolusRatio = useMemo(() => {
    if (todayTDI === 0) return null;
    return Math.round((todayBolusTotal / todayTDI) * 100);
  }, [todayBolusTotal, todayTDI]);

  // 7-day rolling average TDI
  const weekAvgTDI = useMemo(() => {
    const days = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    let total = 0;
    let daysWithData = 0;
    for (const day of days) {
      const dayBolus = bolusDoses.filter(d => d.date === day).reduce((s, d) => s + d.units, 0);
      const dayBasal = basalDoses.find(d => d.date === day)?.units || 0;
      const dayTotal = dayBolus + dayBasal;
      if (dayTotal > 0) {
        total += dayTotal;
        daysWithData++;
      }
    }
    return daysWithData > 0 ? total / daysWithData : 0;
  }, [bolusDoses, basalDoses]);

  const tiles = [
    {
      id: 'today-bolus',
      label: 'Bolus Today',
      value: `${todayBolusTotal}u`,
      sublabel: `${todayDoseCount} injection${todayDoseCount !== 1 ? 's' : ''}`,
      color: 'text-accent',
    },
    {
      id: 'today-tdi',
      label: 'Total Insulin Today',
      value: `${todayTDI}u`,
      sublabel: todayBasalUnits > 0 ? `${todayBolusTotal}u bolus + ${todayBasalUnits}u basal` : 'Basal not logged',
      color: 'text-accent',
    },
    {
      id: 'bolus-basal-ratio',
      label: 'Bolus : Basal',
      value: bolusRatio !== null ? `${bolusRatio}:${100 - bolusRatio}` : '--',
      sublabel: bolusRatio !== null ? 'Target ~50:50' : 'Log basal to see ratio',
      color: bolusRatio !== null && bolusRatio >= 40 && bolusRatio <= 60 ? 'text-accent' : 'text-yellow-400',
    },
    {
      id: '7d-avg-tdi',
      label: '7-Day Avg TDI',
      value: weekAvgTDI > 0 ? `${weekAvgTDI.toFixed(0)}u` : '--',
      sublabel: 'Units/day',
      color: 'text-accent',
    },
    {
      id: 'doses-today',
      label: 'Injections Today',
      value: `${todayDoseCount}`,
      sublabel: todayDoseCount > 0 ? `Avg ${(todayBolusTotal / todayDoseCount).toFixed(1)}u each` : 'No boluses yet',
      color: 'text-text-primary',
    },
    {
      id: '7d-avg-bolus',
      label: '7-Day Avg Bolus',
      value: (() => {
        const days = [];
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(d.toISOString().split('T')[0]);
        }
        let total = 0;
        let count = 0;
        for (const day of days) {
          const dayDoses = bolusDoses.filter(d => d.date === day);
          if (dayDoses.length > 0) {
            total += dayDoses.reduce((s, d) => s + d.units, 0);
            count++;
          }
        }
        return count > 0 ? `${(total / count).toFixed(0)}u` : '--';
      })(),
      sublabel: 'Units/day',
      color: 'text-accent',
    },
  ];

  return (
    <div className="px-4 pb-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Stats</h3>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.id} className="bg-bg-secondary rounded-xl p-3">
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
