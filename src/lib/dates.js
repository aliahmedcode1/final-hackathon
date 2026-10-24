// Date helpers. All dates travel as 'YYYY-MM-DD' strings; timestamps are ISO.

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStr(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun .. 6=Sat
}

export function listDates(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  let guard = 0;
  while (cur <= toStr && guard++ < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function monthBounds(period) {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export function makeHolidaySet(holidays) {
  return new Set((holidays || []).map((h) => String(h.date).slice(0, 10)));
}

export function isWorkingDate(dateStr, settings, holidaySet) {
  if ((settings.weekend_days || []).includes(weekdayOf(dateStr))) return false;
  if (holidaySet.has(dateStr)) return false;
  return true;
}

// Count working dates in [from, to] (inclusive), optionally capped at `today`.
export function workingDaysBetween(fromStr, toStr, settings, holidaySet, capToday = false) {
  const today = todayStr();
  return listDates(fromStr, toStr).filter(
    (d) => isWorkingDate(d, settings, holidaySet) && (!capToday || d <= today)
  ).length;
}

// ---------------------------------------------------------------------------
// Natural-language date parsing (shared by smart leave + AI engine).

const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function fmt(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function nextWeekday(base, target, forceNext) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  let diff = (target - dt.getDay() + 7) % 7;
  if (diff === 0 && !forceNext) diff = 7; // "monday" said on a monday → next monday
  if (forceNext && diff === 0) diff = 7;
  dt.setDate(dt.getDate() + diff);
  return fmt(dt);
}

// Returns {date, matched} or null.
export function parseNaturalDate(text, base = todayStr()) {
  const t = text.toLowerCase();
  const [by, bm, bd] = base.split('-').map(Number);

  if (/\b(today|aaj)\b/.test(t)) return base;
  if (/\btomorrow\b|\bkal\b/.test(t)) return addDays(base, 1);
  if (/day after tomorrow/.test(t)) return addDays(base, 2);

  const inDays = t.match(/in (\d+) days?/);
  if (inDays) return addDays(base, Number(inDays[1]));

  const weekdayMatch = t.match(/\b(next|this)?\s*(sun|mon|tue|wed|thu|fri|sat)(day|nesday|rsday|urday)?\b/);
  if (weekdayMatch) {
    const target = WEEKDAYS[weekdayMatch[2]];
    if (target !== undefined) return nextWeekday(base, target, weekdayMatch[1] === 'next');
  }

  if (/next week/.test(t)) return addDays(nextWeekday(base, 1, true), 0); // next Monday

  // "dec 1" / "1 dec" / "1st december" / "december 1st"
  const dmy = t.match(/\b(\d{1,2})(st|nd|rd|th)?\s+([a-z]{3,9})\b/);
  const md = t.match(/\b([a-z]{3,9})\s+(\d{1,2})(st|nd|rd|th)?\b/);
  const tryMonth = (monStr, day) => {
    const idx = MONTHS.findIndex((mo) => monStr.startsWith(mo));
    if (idx === -1 || day < 1 || day > 31) return null;
    let year = by;
    if (idx < bm - 1 || (idx === bm - 1 && day < bd)) year += 1; // past date → next year
    const dt = new Date(year, idx, day);
    return isNaN(dt) ? null : fmt(dt);
  };
  if (dmy) { const r = tryMonth(dmy[3], Number(dmy[1])); if (r) return r; }
  if (md) { const r = tryMonth(md[1], Number(md[2])); if (r) return r; }

  // Explicit ISO date
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  return null;
}

// Interpret a duration phrase in text; returns number of leave days mentioned.
export function parseDayCount(text) {
  const t = text.toLowerCase();
  const m = t.match(/(\d+)\s*(?:working\s*)?days?/) || t.match(/\b(?:for|next)\s+(\d+)\b/);
  if (m) return Number(m[1]);
  return null;
}
