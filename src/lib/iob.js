/**
 * Insulin on Board (IOB) — Humalog pharmacokinetic model.
 *
 * Based on Humalog (lispro) PK data:
 *   Onset:              22 min   (15% active)
 *   Peak activity:      60 min   (100% active)
 *   End of peak:        90 min   (85% active)
 *   Majority cleared:  200 min   (20% active)
 *   Fully cleared:     330 min   (5.5 hrs)
 *
 * Activity is modelled as piecewise-linear through empirical landmarks,
 * then numerically integrated to derive IOB fraction remaining.
 */

const DIA = 330; // full duration in minutes

// Insulin activity curve landmarks: [time (min), relative activity]
// Normalized so the integral = 1 (all insulin absorbed over DIA).
const ACTIVITY_POINTS = [
  [0,   0],       // injection
  [22,  0.15],    // onset
  [60,  1.00],    // peak activity
  [90,  0.85],    // end of peak
  [200, 0.20],    // majority cleared
  [330, 0],       // fully cleared
];

// Pre-compute normalization constant (trapezoidal integral of raw curve)
let _rawIntegral = 0;
for (let i = 0; i < ACTIVITY_POINTS.length - 1; i++) {
  const [t0, a0] = ACTIVITY_POINTS[i];
  const [t1, a1] = ACTIVITY_POINTS[i + 1];
  _rawIntegral += (a0 + a1) * (t1 - t0) / 2;
}
const NORM = 1 / _rawIntegral;

// Interpolate activity at arbitrary time t (minutes after dose)
function rawActivity(t) {
  if (t <= 0 || t >= DIA) return 0;
  for (let i = 0; i < ACTIVITY_POINTS.length - 1; i++) {
    const [t0, a0] = ACTIVITY_POINTS[i];
    const [t1, a1] = ACTIVITY_POINTS[i + 1];
    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0);
      return a0 + frac * (a1 - a0);
    }
  }
  return 0;
}

/**
 * Normalized insulin activity at time t minutes after injection.
 * Integral from 0 to DIA = 1.
 */
export function insulinActivity(t) {
  return rawActivity(t) * NORM;
}

/**
 * Fraction of insulin remaining (IOB) at t minutes after injection.
 * = 1 − integral(activity, 0..t)
 *
 * Uses the piecewise-linear segments directly for exact integration
 * up to each landmark, then linear interp for the partial segment.
 */
export function iobFraction(t) {
  if (t <= 0) return 1;
  if (t >= DIA) return 0;

  let absorbed = 0;

  for (let i = 0; i < ACTIVITY_POINTS.length - 1; i++) {
    const [t0, a0] = ACTIVITY_POINTS[i];
    const [t1, a1] = ACTIVITY_POINTS[i + 1];

    if (t <= t0) break;

    const segEnd = Math.min(t, t1);
    // Activity at segEnd via linear interpolation within this segment
    const frac = (segEnd - t0) / (t1 - t0);
    const aEnd = a0 + frac * (a1 - a0);

    absorbed += (a0 + aEnd) * (segEnd - t0) / 2;

    if (t <= t1) break;
  }

  return Math.max(0, Math.min(1, 1 - absorbed * NORM));
}

/**
 * IOB (in units) for a single dose at a given time.
 */
export function calcDoseIOB(dose, atTime) {
  const doseTime = new Date(dose.timestamp);
  const minutesElapsed = (atTime.getTime() - doseTime.getTime()) / (1000 * 60);
  if (minutesElapsed < 0 || minutesElapsed >= DIA) return 0;
  return dose.units * iobFraction(minutesElapsed);
}

/**
 * Total IOB across all doses at a given time.
 */
export function calcTotalIOB(doses, atTime) {
  let total = 0;
  for (const dose of doses) {
    total += calcDoseIOB(dose, atTime);
  }
  return total;
}

/**
 * IOB curve for a single dose over a time window (for per-bolus chart lines).
 */
export function getDoseIOBCurve(dose, startTime, endTime, intervalMinutes = 5) {
  const points = [];
  const current = new Date(startTime);
  while (current <= endTime) {
    const iob = calcDoseIOB(dose, current);
    if (iob > 0.01) {
      points.push({ time: new Date(current), iob });
    }
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return points;
}

/**
 * Insulin ACTIVITY curve for a single dose (bell-shaped: rises to peak, falls).
 * Scaled so peak = dose.units (e.g. a 5u dose peaks at 5.0 on the y-axis).
 * This shows the onset → peak → decline profile for chart visualization.
 */
export function getDoseActivityCurve(dose, startTime, endTime, intervalMinutes = 3) {
  const points = [];
  const doseTime = new Date(dose.timestamp).getTime();
  const current = new Date(startTime);
  while (current <= endTime) {
    const minutesElapsed = (current.getTime() - doseTime) / (1000 * 60);
    const activity = rawActivity(minutesElapsed);
    if (activity > 0.005) {
      points.push({ time: new Date(current), activity: activity * dose.units });
    }
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return points;
}

/**
 * Aggregated IOB curve (sum of all doses) over a time window.
 */
export function getAggregatedIOBCurve(doses, startTime, endTime, intervalMinutes = 5) {
  const points = [];
  const current = new Date(startTime);
  while (current <= endTime) {
    const iob = calcTotalIOB(doses, current);
    points.push({ time: new Date(current), iob });
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return points;
}

/** DIA constant for external use */
export const HUMALOG_DIA = DIA;
