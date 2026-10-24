'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, inputCls, btnPrimary } from '@/components/ui';

const SUGGESTIONS = [
  'How many employees do we have?',
  'What is my leave balance?',
  'Who was late today?',
  'What is the grace period?',
  'How many pending leave requests?',
  'Explain the tax slabs',
];

export default function AiPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await api('/ai/chat', { method: 'POST', body: { messages: next.slice(-12) } });
      setRate(res.rate_used);
      setMessages([...next, { role: 'assistant', content: res.reply, meta: res }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const lastRate = rate;

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      <PageHeader
        title="✦ AI Assistant"
        subtitle="Ask about attendance, leave, payroll and policy — answers come from live system data"
      />

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        {messages.length === 0 && (
          <div className="py-8 text-center text-sm text-zinc-500">
            <p className="mb-4">Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-indigo-500 hover:text-indigo-300">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : m.error ? 'border border-rose-500/40 bg-rose-500/10' : 'border border-zinc-800 bg-zinc-900'}`}>
              {m.role === 'assistant' && !m.error && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-indigo-600/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-200">AI-generated</span>
                  {m.meta?.toolCalls?.length > 0 && (
                    <span className="text-[10px] text-zinc-500">tools: {m.meta.toolCalls.map((t) => t.name).join(', ')}</span>
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{renderMd(m.content)}</p>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <span className="inline-block size-2 animate-pulse rounded-full bg-indigo-400" />
              <span className="ml-2 text-xs text-zinc-500">thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className={inputCls + ' flex-1'}
          placeholder="Ask anything about your workforce data…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        <button className={btnPrimary} onClick={() => send()} disabled={busy || !input.trim()}>Send</button>
      </div>
      {lastRate !== null && <p className="mt-1 text-right text-[10px] text-zinc-600">{lastRate}/20 requests used this hour</p>}
    </div>
  );
}

// Minimal markdown: **bold**, bullets, code.
function renderMd(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-zinc-950 px-1 py-0.5 text-xs text-emerald-300">{p.slice(1, -1)}</code>;
    return p;
  });
}
