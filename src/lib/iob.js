/**
 * Insulin on Board (IOB) calculation using the OpenAPS exponential model.
 * Based on: https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js
 */

export function insulinActivity(t, dia = 300, peak = 75) {
  if (t <= 0 || t >= dia) return 0;
  const tau = peak * (1 - peak / dia) / (1 - 2 * peak / dia);
  const a = 2 * tau / dia;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-dia / tau));
  return (S / (tau * tau)) * t * (1 - t / dia) * Math.exp(-t / tau);
}

export function iobFraction(t, dia = 300, peak = 75) {
  if (t <= 0) return 1;
  if (t >= dia) return 0;
  const steps = Math.min(Math.ceil(t), 500);
  const dt = t / steps;
  let integral = 0;
  for (let i = 0; i < steps; i++) {
    const t1 = i * dt;
    const t2 = (i + 1) * dt;
    integral += (insulinActivity(t1, dia, peak) + insulinActivity(t2, dia, peak)) * dt / 2;
  }
  return Math.max(0, 1 - integral);
}

export function calcDoseIOB(dose, atTime, dia = 300, peak = 75) {
  const doseTime = new Date(dose.timestamp);
  const minutesElapsed = (atTime.getTime() - doseTime.getTime()) / (1000 * 60);
  if (minutesElapsed < 0 || minutesElapsed >= dia) return 0;
  return dose.units * iobFraction(minutesElapsed, dia, peak);
}

export function calcTotalIOB(doses, atTime, dia = 300, peak = 75) {
  let total = 0;
  for (const dose of doses) {
    total += calcDoseIOB(dose, atTime, dia, peak);
  }
  return total;
}

export function getDoseIOBCurve(dose, startTime, endTime, intervalMinutes = 5, dia = 300, peak = 75) {
  const points = [];
  const current = new Date(startTime);
  while (current <= endTime) {
    const iob = calcDoseIOB(dose, current, dia, peak);
    if (iob > 0.01) {
      points.push({ time: new Date(current), iob });
    }
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return points;
}

export function getAggregatedIOBCurve(doses, startTime, endTime, intervalMinutes = 5, dia = 300, peak = 75) {
  const points = [];
  const current = new Date(startTime);
  while (current <= endTime) {
    const iob = calcTotalIOB(doses, current, dia, peak);
    points.push({ time: new Date(current), iob });
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return points;
}
