import { useMemo } from 'react';
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

export default function GlucoseChart({ glucoseData, bolusDoses, settings }) {
  const now = useMemo(() => new Date(), []);
  const windowStart = useMemo(() => new Date(now.getTime() - 3 * 60 * 60 * 1000), [now]);
  const windowEnd = useMemo(() => new Date(now.getTime() + 3 * 60 * 60 * 1000), [now]);

  const { dia, peak, targetLow, targetHigh, displayLow, displayHigh } = useMemo(() => ({
    dia: settings?.bolusDIA || 300,
    peak: settings?.bolusPeakTime || 75,
    targetLow: settings?.targetRangeLow || 70,
    targetHigh: settings?.targetRangeHigh || 160,
    displayLow: settings?.graphDisplayLow || 50,
    displayHigh: settings?.graphDisplayHigh || 350,
  }), [settings]);

  // Filter bolus doses active in our window (injected within DIA minutes before windowEnd)
  const activeDoses = useMemo(() => {
    const diaMs = dia * 60 * 1000;
    return bolusDoses.filter(d => {
      const t = new Date(d.timestamp).getTime();
      return t >= windowStart.getTime() - diaMs && t <= windowEnd.getTime();
    });
  }, [bolusDoses, windowStart, windowEnd, dia]);

  // Glucose line data
  const glucosePoints = useMemo(() => {
    return glucoseData
      .filter(r => {
        const t = new Date(r.timestamp).getTime();
        return t >= windowStart.getTime() && t <= windowEnd.getTime();
      })
      .map(r => ({ x: new Date(r.timestamp), y: r.value }));
  }, [glucoseData, windowStart, windowEnd]);

  // Individual dose IOB curves
  const doseCurves = useMemo(() => {
    return activeDoses.map(dose => {
      const points = getDoseIOBCurve(dose, windowStart, windowEnd, 5, dia, peak);
      return {
        dose,
        points: points.map(p => ({ x: p.time, y: p.iob })),
      };
    });
  }, [activeDoses, windowStart, windowEnd, dia, peak]);

  // Aggregated IOB curve
  const aggregatedIOB = useMemo(() => {
    if (activeDoses.length === 0) return [];
    const points = getAggregatedIOBCurve(activeDoses, windowStart, windowEnd, 5, dia, peak);
    return points.map(p => ({ x: p.time, y: p.iob }));
  }, [activeDoses, windowStart, windowEnd, dia, peak]);

  // Max IOB for y-axis scaling
  const maxIOB = useMemo(() => {
    const max = aggregatedIOB.reduce((m, p) => Math.max(m, p.y), 0);
    return Math.max(10, Math.ceil(max + 1));
  }, [aggregatedIOB]);

  // Dose annotation points (markers)
  const doseMarkers = useMemo(() => {
    return activeDoses
      .filter(d => {
        const t = new Date(d.timestamp).getTime();
        return t >= windowStart.getTime() && t <= windowEnd.getTime();
      })
      .map(d => ({ x: new Date(d.timestamp), y: d.units }));
  }, [activeDoses, windowStart, windowEnd]);

  const formatDoseLabel = (dose) => {
    const t = new Date(dose.timestamp);
    const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dose.units}u @ ${time}`;
  };

  // Build datasets
  const datasets = useMemo(() => {
    const ds = [];

    // Target range band (upper boundary)
    ds.push({
      label: 'Target High',
      data: [{ x: windowStart, y: targetHigh }, { x: windowEnd, y: targetHigh }],
      borderColor: 'transparent',
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      fill: '+1',
      pointRadius: 0,
      yAxisID: 'yGlucose',
      order: 10,
    });

    // Target range band (lower boundary)
    ds.push({
      label: 'Target Low',
      data: [{ x: windowStart, y: targetLow }, { x: windowEnd, y: targetLow }],
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      fill: false,
      pointRadius: 0,
      yAxisID: 'yGlucose',
      order: 10,
    });

    // Glucose line
    ds.push({
      label: 'Glucose',
      data: glucosePoints,
      borderColor: '#3b82f6',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 1.5,
      pointBackgroundColor: '#3b82f6',
      tension: 0.3,
      yAxisID: 'yGlucose',
      order: 3,
    });

    // Individual dose decay curves (dashed, faded)
    doseCurves.forEach((curve, i) => {
      ds.push({
        label: formatDoseLabel(curve.dose),
        data: curve.points,
        borderColor: 'rgba(249, 115, 22, 0.4)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'yInsulin',
        order: 4,
      });
    });

    // Aggregated IOB curve (solid, prominent)
    if (aggregatedIOB.length > 0) {
      ds.push({
        label: 'Total IOB',
        data: aggregatedIOB,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        yAxisID: 'yInsulin',
        order: 2,
      });
    }

    // Dose markers
    if (doseMarkers.length > 0) {
      ds.push({
        label: 'Bolus Doses',
        data: doseMarkers,
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        pointRadius: 6,
        pointStyle: 'triangle',
        pointRotation: 180,
        showLine: false,
        yAxisID: 'yInsulin',
        order: 1,
      });
    }

    return ds;
  }, [glucosePoints, doseCurves, aggregatedIOB, doseMarkers, windowStart, windowEnd, targetLow, targetHigh]);

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
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
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
            if (label === 'Glucose') return `${item.parsed.y} mg/dL`;
            if (label === 'Total IOB') return `IOB: ${item.parsed.y.toFixed(1)}u`;
            if (label === 'Bolus Doses') return `Bolus: ${item.parsed.y}u`;
            if (label.includes('@')) return `${label}: ${item.parsed.y.toFixed(1)}u remaining`;
            return '';
          },
          filter: (item) => {
            const label = item.dataset.label || '';
            return label !== 'Target High' && label !== 'Target Low';
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
          color: '#3b82f6',
          font: { size: 11 },
          stepSize: 50,
          callback: (v) => `${v}`,
        },
        title: { display: false },
      },
      yInsulin: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: maxIOB,
        grid: { display: false },
        ticks: {
          color: '#f97316',
          font: { size: 11 },
          callback: (v) => `${v}u`,
        },
        title: { display: false },
      },
    },
  }), [windowStart, windowEnd, displayLow, displayHigh, maxIOB]);

  // "Now" line annotation via plugin
  const nowLinePlugin = useMemo(() => ({
    id: 'nowLine',
    afterDraw: (chart) => {
      const { ctx, scales } = chart;
      const xScale = scales.x;
      const x = xScale.getPixelForValue(now.getTime());
      if (x < xScale.left || x > xScale.right) return;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.moveTo(x, chart.chartArea.top);
      ctx.lineTo(x, chart.chartArea.bottom);
      ctx.stroke();
      ctx.restore();

      // "Now" label
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Now', x, chart.chartArea.top - 4);
      ctx.restore();
    },
  }), [now]);

  // Dose labels plugin
  const doseLabelsPlugin = useMemo(() => ({
    id: 'doseLabels',
    afterDraw: (chart) => {
      const { ctx, scales } = chart;
      const xScale = scales.x;
      const yScale = scales.yInsulin;

      activeDoses.forEach((dose, i) => {
        const t = new Date(dose.timestamp).getTime();
        if (t < windowStart.getTime() || t > windowEnd.getTime()) return;

        const x = xScale.getPixelForValue(t);
        const y = yScale.getPixelForValue(dose.units);

        ctx.save();
        ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        // Offset labels vertically to avoid overlap
        const offset = (i % 2 === 0) ? -14 : -26;
        ctx.fillText(`${dose.units}u`, x, y + offset);
        ctx.restore();
      });
    },
  }), [activeDoses, windowStart, windowEnd]);

  return (
    <div className="px-2 py-2" style={{ height: '300px' }}>
      <Line
        data={{ datasets }}
        options={options}
        plugins={[nowLinePlugin, doseLabelsPlugin]}
      />
    </div>
  );
}
