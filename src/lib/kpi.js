// KPI formulas exactly per PRD §7.
const pct = (x) => Math.round(x * 1000) / 10;

export function attendanceRate({ present = 0, late = 0, missingCheckout = 0, halfDay = 0, onLeave = 0, workingDays = 0 }) {
  const denom = workingDays - onLeave;
  if (denom <= 0) return null;
  return pct((present + late + missingCheckout + 0.5 * halfDay) / denom);
}

export function latePercentage({ late = 0, present = 0 }) {
  const denom = present + late;
  if (denom <= 0) return null;
  return pct(late / denom);
}

export function absenteeismRate({ absent = 0, expectedDays = 0 }) {
  if (expectedDays <= 0) return null;
  return pct(absent / expectedDays);
}

export function attritionRate({ exits = 0, avgHeadcount = 0 }) {
  if (avgHeadcount <= 0) return null;
  return pct(exits / avgHeadcount);
}
