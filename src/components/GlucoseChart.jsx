import { useMemo, useState, useCallback } from 'react';
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
import { getDoseIOBCurve, getAggregatedIOBCurve } from '../lib/iob';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, TimeScale, Legend);

const ACCENT = '#00843D';
const ACCENT_40 = 'rgba(0, 132, 61, 0.4)';
const ACCENT_20 = 'rgba(0, 132, 61, 0.2)';
const ACCENT_90 = 'rgba(0, 132, 61, 0.9)';
const GLUCOSE_COLOR = '#3b82f6';
const HOUR_MS = 60 * 60 * 1000;

export default function GlucoseChart({ glucoseData, bolusDoses, settings }) {
  const now = useMemo(() => Date.now(), []);

  // Scrollable: offset in hours from "now centered". 0 = now, -6 = 6 hours back, etc.
  const [offsetHours, setOffsetHours] = useState(0);

  const centerTime = now + offsetHours * HOUR_MS;
  const windowStart = centerTime - 3 * HOUR_MS;
  const windowEnd = centerTime + 3 * HOUR_MS;

  const { dia, peak, targetLow, targetHigh, displayLow, displayHigh } = useMemo(() => ({
    dia: settings?.bolusDIA || 300,
    peak: settings?.bolusPeakTime || 75,
    targetLow: settings?.targetRangeLow || 70,
    targetHigh: settings?.targetRangeHigh || 160,
    displayLow: settings?.graphDisplayLow || 50,
    displayHigh: settings?.graphDisplayHigh || 350,
  }), [settings]);

  // Filter bolus doses active in our window
  const activeDoses = useMemo(() => {
    const diaMs = dia * 60 * 1000;
    return bolusDoses.filter(d => {
      const t = new Date(d.timestamp).getTime();
      return t >= windowStart - diaMs && t <= windowEnd;
    });
  }, [bolusDoses, windowStart, windowEnd, dia]);

  // Glucose line data
  const glucosePoints = useMemo(() => {
    return glucoseData
      .filter(r => {
        const t = new Date(r.timestamp).getTime();
        return t >= windowStart && t <= windowEnd;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(r => ({ x: new Date(r.timestamp).getTime(), y: r.value }));
  }, [glucoseData, windowStart, windowEnd]);

  // Individual dose IOB curves
  const doseCurves = useMemo(() => {
    const ws = new Date(windowStart);
    const we = new Date(windowEnd);
    return activeDoses.map(dose => {
      const points = getDoseIOBCurve(dose, ws, we, 5, dia, peak);
      return {
        dose,
        points: points.map(p => ({ x: p.time.getTime(), y: p.iob })),
      };
    });
  }, [activeDoses, windowStart, windowEnd, dia, peak]);

  // Aggregated IOB curve
  const aggregatedIOB = useMemo(() => {
    if (activeDoses.length === 0) return [];
    const ws = new Date(windowStart);
    const we = new Date(windowEnd);
    const points = getAggregatedIOBCurve(activeDoses, ws, we, 5, dia, peak);
    return points.map(p => ({ x: p.time.getTime(), y: p.iob }));
  }, [activeDoses, windowStart, windowEnd, dia, peak]);

  const maxIOB = useMemo(() => {
    const max = aggregatedIOB.reduce((m, p) => Math.max(m, p.y), 0);
    return Math.max(10, Math.ceil(max + 1));
  }, [aggregatedIOB]);

  // Dose marker points
  const doseMarkers = useMemo(() => {
    return activeDoses
      .filter(d => {
        const t = new Date(d.timestamp).getTime();
        return t >= windowStart && t <= windowEnd;
      })
      .map(d => ({ x: new Date(d.timestamp).getTime(), y: d.units }));
  }, [activeDoses, windowStart, windowEnd]);

  const formatDoseLabel = (dose) => {
    const t = new Date(dose.timestamp);
    const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dose.units}u @ ${time}`;
  };

  // Build datasets
  const datasets = useMemo(() => {
    const ds = [];

    ds.push({
      label: 'Glucose',
      data: glucosePoints,
      borderColor: GLUCOSE_COLOR,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: glucosePoints.length > 100 ? 0 : 2,
      pointBackgroundColor: GLUCOSE_COLOR,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: GLUCOSE_COLOR,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      tension: 0.3,
      yAxisID: 'yGlucose',
      order: 2,
      spanGaps: false,
    });

    doseCurves.forEach((curve) => {
      ds.push({
        label: formatDoseLabel(curve.dose),
        data: curve.points,
        borderColor: ACCENT_40,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'yInsulin',
        order: 4,
      });
    });

    if (aggregatedIOB.length > 0) {
      ds.push({
        label: 'Total IOB',
        data: aggregatedIOB,
        borderColor: ACCENT,
        backgroundColor: ACCENT_20,
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
        label: 'Bolus Doses',
        data: doseMarkers,
        borderColor: ACCENT,
        backgroundColor: ACCENT,
        pointRadius: 6,
        pointStyle: 'triangle',
        pointRotation: 180,
        showLine: false,
        yAxisID: 'yInsulin',
        order: 1,
      });
    }

    return ds;
  }, [glucosePoints, doseCurves, aggregatedIOB, doseMarkers]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#333',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 13 },
        padding: 10,
        displayColors: false,
        callbacks: {
          title: (items) => {
            if (items[0]) {
              const d = new Date(items[0].parsed.x);
              return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            return '';
          },
          label: (item) => {
            const label = item.dataset.label || '';
            if (label === 'Glucose') return `  ${item.parsed.y} mg/dL`;
            if (label === 'Total IOB') return `  IOB: ${item.parsed.y.toFixed(1)}u`;
            if (label === 'Bolus Doses') return `  Bolus: ${item.parsed.y}u`;
            if (label.includes('@')) return `  ${label}: ${item.parsed.y.toFixed(1)}u remaining`;
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        min: windowStart,
        max: windowEnd,
        time: {
          unit: 'hour',
          displayFormats: { hour: 'h:mm a' },
        },
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#a3a3a3', font: { size: 11 }, maxTicksLimit: 7 },
      },
      yGlucose: {
        type: 'linear',
        position: 'left',
        min: displayLow,
        max: displayHigh,
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: {
          color: GLUCOSE_COLOR,
          font: { size: 11 },
          stepSize: 50,
          callback: (v) => `${v}`,
        },
      },
      yInsulin: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: maxIOB,
        grid: { display: false },
        ticks: {
          color: ACCENT,
          font: { size: 11 },
          callback: (v) => `${v}u`,
        },
      },
    },
  }), [windowStart, windowEnd, displayLow, displayHigh, maxIOB]);

  // Target range band plugin
  const targetRangePlugin = useMemo(() => ({
    id: 'targetRange',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const yScale = scales.yGlucose;
      const top = yScale.getPixelForValue(targetHigh);
      const bottom = yScale.getPixelForValue(targetLow);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 132, 61, 0.08)';
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      ctx.restore();
    },
  }), [targetLow, targetHigh]);

  // "Now" line plugin
  const nowLinePlugin = useMemo(() => ({
    id: 'nowLine',
    afterDraw: (chart) => {
      const { ctx, scales, chartArea } = chart;
      if (!chartArea) return;
      const xScale = scales.x;
      const x = xScale.getPixelForValue(now);
      if (x < xScale.left || x > xScale.right) return;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Now', x, chartArea.top - 4);
      ctx.restore();
    },
  }), [now]);

  // Dose labels plugin
  const doseLabelsPlugin = useMemo(() => ({
    id: 'doseLabels',
    afterDraw: (chart) => {
      const { ctx, scales, chartArea } = chart;
      if (!chartArea) return;
      const xScale = scales.x;
      const yScale = scales.yInsulin;

      activeDoses.forEach((dose, i) => {
        const t = new Date(dose.timestamp).getTime();
        if (t < windowStart || t > windowEnd) return;

        const x = xScale.getPixelForValue(t);
        const y = yScale.getPixelForValue(dose.units);

        ctx.save();
        ctx.fillStyle = ACCENT_90;
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        const offset = (i % 2 === 0) ? -14 : -26;
        ctx.fillText(`${dose.units}u`, x, y + offset);
        ctx.restore();
      });
    },
  }), [activeDoses, windowStart, windowEnd]);

  // Navigation: scroll back/forward in 3-hour increments, max 3 days back
  const canGoBack = offsetHours > -72 + 3; // 3 days = 72 hours
  const canGoForward = offsetHours < 0;
  const isAtNow = offsetHours === 0;

  const goBack = useCallback(() => {
    setOffsetHours(prev => Math.max(-69, prev - 3));
  }, []);
  const goForward = useCallback(() => {
    setOffsetHours(prev => Math.min(0, prev + 3));
  }, []);
  const goToNow = useCallback(() => {
    setOffsetHours(0);
  }, []);

  // Time range label
  const rangeLabel = useMemo(() => {
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    const fmt = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const startStr = fmt(start);
    const endHr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${startStr} - ${endHr}`;
  }, [windowStart, windowEnd]);

  return (
    <div className="px-2 py-2">
      {/* Navigation controls */}
      <div className="flex items-center justify-between px-2 mb-1">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="px-3 py-1 rounded-lg text-sm font-medium bg-bg-secondary text-text-secondary disabled:opacity-30 active:opacity-70"
        >
          &#9664; Earlier
        </button>
        <div className="text-xs text-text-secondary text-center flex-1 px-2">{rangeLabel}</div>
        {isAtNow ? (
          <div className="px-3 py-1 rounded-lg text-sm font-medium text-accent">Live</div>
        ) : (
          <button
            onClick={canGoForward ? goForward : goToNow}
            className="px-3 py-1 rounded-lg text-sm font-medium bg-bg-secondary text-text-secondary active:opacity-70"
          >
            {canGoForward ? 'Later &#9654;' : 'Now'}
          </button>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: '300px' }}>
        <Line
          data={{ datasets }}
          options={options}
          plugins={[targetRangePlugin, nowLinePlugin, doseLabelsPlugin]}
        />
      </div>

      {/* Jump to Now button when scrolled back */}
      {!isAtNow && (
        <div className="text-center mt-1">
          <button
            onClick={goToNow}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent text-white active:opacity-80"
          >
            Jump to Now
          </button>
        </div>
      )}
    </div>
  );
}
