import { TOOLS, toolAllowed } from './tools';
import { parseNaturalDate, todayStr, monthStr } from '@/lib/dates';

// Offline deterministic AI engine: intent classification → tool call → formatted
// markdown answer. Same tools + RBAC as the live LLM path. No external deps.

const INTENTS = [
  { tool: 'get_my_leave_balance', re: /\b(my|own)\b.*\b(balance|leave left|leave remaining|days? left|quota)\b|\bbalance\b/i, args: () => ({}) },
  { tool: 'get_late_comers', re: /\blate\s*(comers?|arrivals?|employees|people|today|staff)\b|who.*(is|was|came)\s*late/i, args: (t) => ({ date: extractDate(t) || undefined }) },
  { tool: 'get_headcount', re: /\b(headcount|how many employees|number of employees|team size|staff count|head ?count)\b/i, args: (t) => ({ status: /exited|left|attrition/i.test(t) ? 'exited' : undefined, department: extractDept(t) }) },
  { tool: 'get_payroll_summary', re: /\b(payroll|salary totals|net paid|gross paid|paysl?ip run|salary bill)\b/i, args: (t) => ({ period: extractMonth(t) }) },
  { tool: 'get_leave_summary', re: /\bleave\b.*(summary|stats|statistics|how many|pending|requests)|(pending|approved)\s+leaves?\b/i, args: (t) => ({ month: extractMonth(t), status: /pending/i.test(t) ? 'pending' : /approved/i.test(t) ? 'approved' : undefined }) },
  { tool: 'get_attendance_summary', re: /\b(attendance|present|absent(abs)?|absenteeism|checked in|check-?ins?)\b/i, args: (t) => (extractDate(t) ? { date: extractDate(t) } : { month: extractMonth(t) }) },
  { tool: 'search_employees', re: /\b(find|search|who is|show me|list|directory|contact|email of|lookup)\b.*\b(employee|person|people|staff|engineer|manager|worker)?\b/i, args: (t) => ({ q: extractQuery(t), department: extractDept(t) }) },
];

function extractDate(t) {
  return parseNaturalDate(t, todayStr());
}
function extractMonth(t) {
  const m = t.match(/\b(20\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}`;
  const named = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(20\d{2})?\b/i);
  if (named) {
    const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[1].toLowerCase().slice(0, 3));
    const year = named[2] ? Number(named[2]) : new Date().getFullYear();
    return `${year}-${String(idx + 1).padStart(2, '0')}`;
  }
  return /last month/i.test(t) ? monthStr(-1) : undefined;
}
function extractDept(t) {
  const m = t.match(/\b(engineering|sales|hr|marketing|finance|operations|support|design)\b/i);
  return m ? m[1] : undefined;
}
function extractQuery(t) {
  const m = t.match(/(?:named|called|find|search(?: for)?)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  return m ? m[1] : undefined;
}

const fmtNum = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 }));

function formatAnswer(tool, data) {
  switch (tool) {
    case 'get_headcount':
      return `**Headcount:** ${data.headcount} employee${data.headcount === 1 ? '' : 's'} — ${data.active} active, ${data.exited} exited.`;
    case 'get_attendance_summary': {
      if (data.date) {
        return `**Attendance on ${data.date}:** ${data.present} present, ${data.late} late, ${data.half_day} half-day, ${data.missing_checkout} missing check-out.`;
      }
      return [
        `**Attendance — ${data.month}** (${data.scoped_to}):`,
        `• Records: ${data.records} of ${data.expected_records} expected`,
        `• Present ${data.present} · Late ${data.late} · Half-day ${data.half_day} · Missing check-out ${data.missing_checkout}`,
        `• On-leave days ${data.on_leave_days} · Absent days ${data.absent_days}`,
      ].join('\n');
    }
    case 'get_late_comers': {
      if (!data.late_comers.length) return `No late check-ins on ${data.date}. 🎉`;
      return `**Late on ${data.date}** (${data.late_comers.length}):\n${data.late_comers.map((l) => `• ${l.name} — in at ${new Date(l.check_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`).join('\n')}`;
    }
    case 'get_leave_summary': {
      const statuses = Object.entries(data.by_status).map(([k, v]) => `${k}: ${v}`).join(', ') || 'no requests';
      const types = Object.entries(data.days_by_type).map(([k, v]) => `${k}: ${v}d`).join(', ') || '—';
      return `**Leave summary:** ${data.total_requests} requests (${statuses}).\nDays by type — ${types}.`;
    }
    case 'get_my_leave_balance': {
      if (data.error) return data.error;
      const b = data.balances;
      return [
        `**Your leave balances (${data.year})**`,
        ...Object.entries(b).map(([type, v]) =>
          `• ${type[0].toUpperCase() + type.slice(1)}: ${v.quota === null ? `${v.used} days used (unlimited)` : `${v.remaining} of ${v.quota} remaining (${v.used} used${v.pending ? `, ${v.pending} pending` : ''})`}`),
      ].join('\n');
    }
    case 'get_payroll_summary': {
      if (!data.runs?.length) return data.note || 'No payroll runs found.';
      return `**Payroll:**\n${data.runs.map((r) => `• ${r.period} (${r.status}): ${r.employees} employees · gross ${fmtNum(r.gross)} · deductions ${fmtNum(r.deductions)} · tax ${fmtNum(r.tax)} · net ${fmtNum(r.net)}`).join('\n')}`;
    }
    case 'search_employees': {
      if (!data.count) return 'No matching employees found.';
      return `**${data.count} match${data.count === 1 ? '' : 'es'}:**\n${data.employees.map((e) => `• ${e.name} (${e.code})${e.department ? ` — ${e.department}` : ''}${e.email ? ` · ${e.email}` : ''}${e.basic_salary !== undefined ? ` · basic ${fmtNum(e.basic_salary)}` : ''}`).join('\n')}`;
    }
    default:
      return 'Done.';
  }
}

// Policy Q&A from live settings (FR-08.5).
async function policyAnswer(text) {
  const settings = await import('@/lib/store').then((m) => m.store.findOne('company_settings', []));
  if (!settings) return null;
  const t = text.toLowerCase();

  if (/grace period|grace time|how late/.test(t)) {
    return `The office starts at **${settings.start_time}** with a **${settings.grace_minutes}-minute grace period** — check-in after ${addMinutes(settings.start_time, settings.grace_minutes)} is tagged **Late**.`;
  }
  if (/half.?day/.test(t)) {
    return `Working fewer than **${settings.halfday_hours} hours** in a day is tagged a **half-day**.`;
  }
  if (/weekend/.test(t)) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Weekends are: **${(settings.weekend_days || []).map((d) => names[d]).join(', ')}**.`;
  }
  if (/annual leave|vacation days|leave quota|how many.*leave|casual leave|sick leave|unpaid/.test(t)) {
    const q = settings.quotas || {};
    return `Annual leave quotas per year: **Annual ${q.annual}**, **Sick ${q.sick}**, **Casual ${q.casual}**, **Unpaid unlimited**. Leave days exclude weekends and public holidays.`;
  }
  if (/tax|taxable|slab/.test(t)) {
    return [
      '**Annual income tax slabs (PKR):**',
      '• 0 – 600,000: 0%',
      '• 600,001 – 1,200,000: 5% of excess over 600k',
      '• 1,200,001 – 2,400,000: 30,000 + 15% of excess over 1.2M',
      '• 2,400,001 – 3,600,000: 210,000 + 25% of excess over 2.4M',
      '• above 3,600,000: 510,000 + 35% of excess',
      'Applied annually to 12 × your monthly taxable amount, then divided by 12 for monthly withholding.',
    ].join('\n');
  }
  if (/geofence|office location|check.?in from home|distance/.test(t)) {
    return `Camera check-in must be within **${settings.radius_m} m** of the office coordinates, with GPS accuracy better than 100 m and exactly one face in frame.`;
  }
  if (/overtime|gross.*basic|salary structure/.test(t)) {
    return 'Gross monthly salary = **1.5 × basic**. Deductions use the daily rate (gross ÷ working days) for absent days and approved unpaid leave.';
  }
  return null;
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Returns {reply, toolCalls: [{name, args}]}.
export async function offlineAnswer(text, session) {
  // 1. policy Q&A
  const policy = await policyAnswer(text);
  if (policy) return { reply: policy, toolCalls: [] };

  // 2. tool intents (first match whose RBAC allows)
  for (const intent of INTENTS) {
    if (!intent.re.test(text)) continue;
    if (!toolAllowed(intent.tool, session)) {
      const adminOnly = ['get_late_comers', 'get_leave_summary', 'get_payroll_summary'].includes(intent.tool);
      if (adminOnly) {
        return {
          reply: "⚠️ That data is restricted to **Admin/HR** — your account doesn't have permission for it.",
          toolCalls: [],
        };
      }
      continue;
    }
    const args = intent.args(text) || {};
    return { reply: null, toolCalls: [{ name: intent.tool, args }] };
  }

  // 3. fallback
  return {
    reply: [
      "I can help with:",
      "• **Headcount** — “How many employees do we have?”",
      "• **Attendance** — “Attendance summary for October”, “Who was late today?”",
      "• **Leave** — “My leave balance”, “How many pending leave requests?”",
      "• **Payroll** (Admin/HR) — “Payroll summary for 2026-10”",
      "• **Directory** — “Find Ayesha”",
      "• **Policy** — “What is the grace period?”, “Tax slabs”, “Leave quotas”",
    ].join('\n'),
    toolCalls: [],
  };
}

export { formatAnswer };
