import { z } from 'zod';
import { withAuth, fail, json } from '@/lib/auth';
import { parseNaturalDate, todayStr, addDays } from '@/lib/dates';

// Smart leave (PRD 21): NL text → pre-filled leave form JSON. Never auto-submits.

const schema = z.object({ text: z.string().min(3) });

const TYPE_HINTS = [
  { re: /wedding|marriage|shaadi|vacation|trip|holiday|travel|family/, type: 'annual' },
  { re: /sick|fever|ill|flu|cough|doctor|hospital|migraine|headache|dentist|pain/, type: 'sick' },
  { re: /urgent|errand|personal|emergency|appointment|bank|dmv|errands/, type: 'casual' },
  { re: /unpaid|no pay|without pay/, type: 'unpaid' },
];

function extractReason(text) {
  const m = text.match(/\bfor\s+(.+)$/i);
  return (m ? m[1] : text).replace(/[.!?]+$/, '').slice(0, 140);
}

function nextWeekdayStr(base, target) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  let diff = (target - dt.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const POST = withAuth(null, async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'text required');
  const text = parsed.data.text;

  const lower = text.toLowerCase();
  const today = todayStr();
  const type = TYPE_HINTS.find((t) => t.re.test(lower))?.type || 'casual';

  // Range forms: "from X to Y" / "X and Y" (two dates), "next N days", single date.
  let from = null, to = null;

  const rangeMatch = lower.match(/(?:from\s+)?(.+?)\s+(?:and|to|through|till|until)\s+(.+?)(?:\s+for\b|$|[.,])/);
  const d1 = rangeMatch ? parseNaturalDate(rangeMatch[1], today) : null;
  const d2 = rangeMatch ? parseNaturalDate(rangeMatch[2], today) : null;
  if (d1 && d2) {
    from = d1 <= d2 ? d1 : d2;
    to = d1 <= d2 ? d2 : d1;
  }

  if (!from) {
    const nDays = lower.match(/(\d+)\s*(?:working\s*)?days?\b/);
    if (nDays) {
      const n = Math.min(30, Number(nDays[1]));
      const startGuess = parseNaturalDate(lower, today);
      from = startGuess && startGuess !== today ? startGuess : addDays(today, 1);
      to = addDays(from, n - 1);
    }
  }

  if (!from) {
    const single = parseNaturalDate(lower, today);
    if (single) {
      from = single;
      to = single;
    }
  }

  // "next mon and tue" pattern: two weekdays in one phrase
  if (from && from === to) {
    const wdMatch = lower.match(/\b(next|this)?\s*(sun|mon|tue|wed|thu|fri|sat)(day|nesday|rsday|urday)?\b.*?\b(and|&)\s*(next\s+)?(sun|mon|tue|wed|thu|fri|sat)(day|nesday|rsday|urday)?\b/);
    if (wdMatch) {
      const WD = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const a = WD[wdMatch[2]];
      const b = WD[wdMatch[6]];
      if (a !== undefined && b !== undefined) {
        const base = today;
        const da = nextWeekdayStr(base, a);
        const db = nextWeekdayStr(base, b);
        from = da <= db ? da : db;
        to = da <= db ? db : da;
      }
    }
  }

  if (!from) {
    return json({
      parsed: false,
      message: 'Could not find dates in that text. Try e.g. "Need next Mon and Tue off for wedding" or "Sick leave tomorrow, fever".',
      form: { type, from_date: addDays(today, 1), to_date: addDays(today, 1), reason: extractReason(text) },
    });
  }

  return json({
    parsed: true,
    form: { type, from_date: from, to_date: to, reason: extractReason(text) },
    ai_generated: true,
  });
});
