import { useMemo, useState, useCallback, useRef, memo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  TimeScale,
  Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { getAggregatedIOBCurve, getDoseIOBCurve, calcTotalIOB, HUMALOG_DIA } from '../lib/iob';
import { getThemeColors } from '../lib/themes';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, TimeScale, Legend);

const HOUR_MS = 60 * 60 * 1000;
const PAST_HOURS = 5;
const FUTURE_HOURS = 1;
const DIA_MS = HUMALOG_DIA * 60 * 1000;

function GlucoseChart({ glucoseData, bolusDoses, settings, themeId }) {
  const now = useMemo(() => Date.now(), []);
  const chartRef = useRef(null);
  const [crosshair, setCrosshair] = useState(null);
  const [offsetHours, setOffsetHours] = useState(0);

  const colors = useMemo(() => getThemeColors(themeId), [themeId]);
  const ACCENT = colors.accent;
  const GLUCOSE_COLOR = colors.glucose;

  const windowEnd = now + (FUTURE_HOURS + offsetHours) * HOUR_MS;
  const windowStart = now + (offsetHours - PAST_HOURS) * HOUR_MS;

  const { targetLow, targetHigh, displayLow, displayHigh } = useMemo(() => ({
    targetLow: settings?.targetRangeLow || 70,
    targetHigh: settings?.targetRangeHigh || 160,
    displayLow: settings?.graphDisplayLow || 50,
    displayHigh: settings?.graphDisplayHigh || 350,
  }), [settings]);

  const activeDoses = useMemo(() => {
    return bolusDoses.filter(d => {
      const t = new Date(d.timestamp).getTime();
      return t >= windowStart - DIA_MS && t <= windowEnd;
    });
  }, [bolusDoses, windowStart, windowEnd]);

  const glucosePoints = useMemo(() => {
    return glucoseData
      .filter(r => {
        const t = new Date(r.timestamp).getTime();
        return t >= windowStart && t <= windowEnd;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(r => ({ x: new Date(r.timestamp).getTime(), y: r.value }));
  }, [glucoseData, windowStart, windowEnd]);

  const aggregatedIOB = useMemo(() => {
    if (activeDoses.length === 0) return [];
    const ws = new Date(windowStart);
    const we = new Date(windowEnd);
    return getAggregatedIOBCurve(activeDoses, ws, we, 5)
      .map(p => ({ x: p.time.getTime(), y: p.iob }));
  }, [activeDoses, windowStart, windowEnd]);

  // Per-bolus IOB curves — each dose gets its own line showing rise/peak/fall
  const perDoseIOBCurves = useMemo(() => {
    if (activeDoses.length === 0) return [];
    const ws = new Date(windowStart);
    const we = new Date(windowEnd);
    return activeDoses.map(dose => {
      const points = getDoseIOBCurve(dose, ws, we, 3);
      return {
        id: dose.id,
        units: dose.units,
        data: points.map(p => ({ x: p.time.getTime(), y: p.iob })),
      };
    }).filter(c => c.data.length > 0);
  }, [activeDoses, windowStart, windowEnd]);

  const maxIOB = useMemo(() => {
    const max = aggregatedIOB.reduce((m, p) => Math.max(m, p.y), 0);
    return Math.max(10, Math.ceil(max + 1));
  }, [aggregatedIOB]);

  const doseMarkers = useMemo(() => {
    return activeDoses
      .filter(d => {
        const t = new Date(d.timestamp).getTime();
        return t >= windowStart && t <= windowEnd;
      })
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.units }));
  }, [activeDoses, windowStart, windowEnd]);

  const datasets = useMemo(() => {
    const ds = [];

    ds.push({
      label: 'Glucose',
      data: glucosePoints,
      borderColor: GLUCOSE_COLOR,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: glucosePoints.length > 80 ? 0 : 2.5,
      pointBackgroundColor: GLUCOSE_COLOR,
      tension: 0.3,
      yAxisID: 'yGlucose',
      order: 2,
      spanGaps: false,
    });

    // Per-bolus IOB curves — faded individual lines showing each dose's activity
    perDoseIOBCurves.forEach((curve, i) => {
      ds.push({
        label: `Bolus ${curve.units}u`,
        data: curve.data,
        borderColor: `rgba(${colors.accentRgb}, 0.35)`,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        yAxisID: 'yInsulin',
        order: 4,
      });
    });

    // Aggregated IOB — bold filled curve (sum of all individual doses)
    if (aggregatedIOB.length > 0) {
      ds.push({
        label: 'IOB',
        data: aggregatedIOB,
        borderColor: ACCENT,
        backgroundColor: `rgba(${colors.accentRgb}, 0.15)`,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        yAxisID: 'yInsulin',
        order: 3,
      });
    }

    if (doseMarkers.length > 0) {
      ds.push({
        label: 'Bolus',
        data: doseMarkers,
        borderColor: ACCENT,
        backgroundColor: ACCENT,
        pointRadius: 5,
        pointStyle: 'triangle',
        pointRotation: 180,
        showLine: false,
        yAxisID: 'yInsulin',
        order: 1,
      });
    }

    return ds;
  }, [glucosePoints, aggregatedIOB, perDoseIOBCurves, doseMarkers, ACCENT, GLUCOSE_COLOR, colors.accentRgb]);

  const handleChartClick = useCallback((event) => {
    const chart = chartRef.current;
    if (!chart) return;
    const { chartArea, scales } = chart;
    if (!chartArea) return;

    const rect = chart.canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const x = clientX - rect.left;

    if (x < chartArea.left || x > chartArea.right) { setCrosshair(null); return; }

    const timeAtX = scales.x.getValueForPixel(x);

    let nearestBG = null;
    let minDist = Infinity;
    for (const p of glucosePoints) {
      const dist = Math.abs(p.x - timeAtX);
      if (dist < minDist) { minDist = dist; nearestBG = p; }
    }
    const bgValue = (nearestBG && minDist < 15 * 60 * 1000) ? nearestBG.y : null;
    const iobAtTime = calcTotalIOB(bolusDoses, new Date(timeAtX));

    const timeStr = new Date(timeAtX).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });

    setCrosshair({ pixelX: x, time: timeAtX, timeStr, bg: bgValue, iob: iobAtTime });
  }, [glucosePoints, bolusDoses]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        type: 'time',
        min: windowStart,
        max: windowEnd,
        time: { unit: 'hour', displayFormats: { hour: 'h a' } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#888', font: { size: 10 }, maxTicksLimit: 6 },
      },
      yGlucose: {
        type: 'linear',
        position: 'left',
        min: displayLow,
        max: displayHigh,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: GLUCOSE_COLOR, font: { size: 10 }, stepSize: 50, callback: (v) => v },
      },
      yInsulin: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: maxIOB,
        grid: { display: false },
        ticks: { color: ACCENT, font: { size: 10 }, callback: (v) => `${v}u` },
      },
    },
  }), [windowStart, windowEnd, displayLow, displayHigh, maxIOB, ACCENT, GLUCOSE_COLOR]);

  // Canvas plugins
  const targetRangePlugin = useMemo(() => ({
    id: 'targetRange',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const top = scales.yGlucose.getPixelForValue(targetHigh);
      const bottom = scales.yGlucose.getPixelForValue(targetLow);
      ctx.save();
      ctx.fillStyle = `rgba(${colors.accentRgb}, 0.06)`;
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      ctx.restore();
    },
  }), [targetLow, targetHigh, colors.accentRgb]);

  const nowLinePlugin = useMemo(() => ({
    id: 'nowLine',
    afterDraw: (chart) => {
      const { ctx, scales, chartArea } = chart;
      if (!chartArea) return;
      const x = scales.x.getPixelForValue(now);
      if (x < scales.x.left || x > scales.x.right) return;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  }), [now]);

  const doseLabelsPlugin = useMemo(() => ({
    id: 'doseLabels',
    afterDraw: (chart) => {
      const { ctx, scales, chartArea } = chart;
      if (!chartArea) return;
      activeDoses.forEach((dose, i) => {
        const t = new Date(dose.timestamp).getTime();
        if (t < windowStart || t > windowEnd) return;
        const x = scales.x.getPixelForValue(t);
        const y = scales.yInsulin.getPixelForValue(dose.units);
        ctx.save();
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${dose.units}u`, x, y + ((i % 2 === 0) ? -12 : -24));
        ctx.restore();
      });
    },
  }), [activeDoses, windowStart, windowEnd, ACCENT]);

  const crosshairPlugin = useMemo(() => ({
    id: 'crosshairLine',
    afterDraw: (chart) => {
      if (!crosshair) return;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const x = scales.x.getPixelForValue(crosshair.time);
      if (x < chartArea.left || x > chartArea.right) return;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();

      if (crosshair.bg !== null) {
        const yBG = scales.yGlucose.getPixelForValue(crosshair.bg);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, yBG, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = GLUCOSE_COLOR;
        ctx.beginPath(); ctx.arc(x, yBG, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (crosshair.iob > 0.05) {
        const yIOB = scales.yInsulin.getPixelForValue(crosshair.iob);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, yIOB, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.beginPath(); ctx.arc(x, yIOB, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
  }), [crosshair, ACCENT, GLUCOSE_COLOR]);

  const maxBackHours = 72;
  const canGoBack = offsetHours > -(maxBackHours - PAST_HOURS);
  const canGoForward = offsetHours < 0;
  const isAtNow = offsetHours === 0;

  const goBack = useCallback(() => { setOffsetHours(prev => Math.max(-(maxBackHours - PAST_HOURS), prev - 3)); setCrosshair(null); }, []);
  const goForward = useCallback(() => { setOffsetHours(prev => Math.min(0, prev + 3)); setCrosshair(null); }, []);
  const goToNow = useCallback(() => { setOffsetHours(0); setCrosshair(null); }, []);

  const rangeLabel = useMemo(() => {
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    const fmt = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true });
    return `${fmt(start)} — ${fmt(end)}`;
  }, [windowStart, windowEnd]);

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-2 mb-1">
        <button onClick={goBack} disabled={!canGoBack}
          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-secondary text-text-secondary disabled:opacity-30 active:opacity-70">
          &#9664;
        </button>
        <div className="text-center flex-1 px-1">
          <div className="text-[10px] text-text-secondary">{rangeLabel}</div>
        </div>
        {isAtNow ? (
          <div className="px-2.5 py-1 rounded-lg text-xs font-medium text-accent">Live</div>
        ) : (
          <button onClick={canGoForward ? goForward : goToNow}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-secondary text-text-secondary active:opacity-70">
            {canGoForward ? '\u25B6' : 'Now'}
          </button>
        )}
      </div>

      {crosshair && (
        <div className="flex items-center justify-between mx-2 mb-1 px-3 py-1 bg-bg-secondary rounded-lg">
          <div className="text-[11px] font-medium text-text-primary">{crosshair.timeStr}</div>
          <div className="flex items-center gap-3">
            {crosshair.bg !== null && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-glucose" />
                <span className="text-[11px] font-bold text-glucose">{crosshair.bg}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[11px] font-bold text-accent">{crosshair.iob.toFixed(1)}u</span>
            </div>
          </div>
          <button onClick={() => setCrosshair(null)} className="text-text-secondary text-xs ml-1">&times;</button>
        </div>
      )}

      <div style={{ height: '240px' }} onClick={handleChartClick} onTouchStart={handleChartClick}>
        <Line
          ref={chartRef}
          data={{ datasets }}
          options={options}
          plugins={[targetRangePlugin, nowLinePlugin, doseLabelsPlugin, crosshairPlugin]}
        />
      </div>

      {!isAtNow && (
        <div className="text-center mt-1">
          <button onClick={goToNow}
            className="px-4 py-1 rounded-lg text-xs font-medium bg-accent text-white active:opacity-80">
            Jump to Now
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(GlucoseChart);
