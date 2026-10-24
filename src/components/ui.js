'use client';

// Small shared UI primitives.

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const badgeColors = {
  present: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  late: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  half_day: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  absent: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  holiday: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  weekend: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  cancelled: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  draft: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  locked: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  exited: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  admin: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  hr: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  employee: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

export function Badge({ value, className = '' }) {
  const color = badgeColors[value?.toLowerCase?.()] || 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${color} ${className}`}>
      {String(value ?? '').replace('_', ' ')}
    </span>
  );
}

export function StatCard({ label, value, hint, accent = 'text-indigo-400' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-zinc-500">
      <span className="size-4 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', hint }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center">
      <div className="text-sm text-zinc-400">{title}</div>
      {hint && <div className="mt-1 text-xs text-zinc-600">{hint}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative max-h-[88vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

export const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50';

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-rose-400">{children}</p>;
}
