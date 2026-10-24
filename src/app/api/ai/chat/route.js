import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { TOOLS, toolAllowed } from '@/lib/ai/tools';
import { offlineAnswer, formatAnswer } from '@/lib/ai/engine';
import { audit } from '@/lib/audit';

// AI chat endpoint (PRD §6): guardrails — 15s timeout, 20 req/user/hour,
// 1 retry on JSON parse failure; key stays server-side; RBAC-scoped tools.

const RATE_LIMIT = 20;
const TIMEOUT_MS = 15000;

async function checkRateLimit(session) {
  const hour = new Date().toISOString().slice(0, 13);
  const existing = await store.findOne('ai_usage', [['user_id', 'eq', session.id], ['hour_bucket', 'eq', hour]]);
  const count = existing?.count || 0;
  if (count >= RATE_LIMIT) {
    return { ok: false, count };
  }
  if (existing) await store.update('ai_usage', existing.id, { count: count + 1 });
  else await store.insert('ai_usage', { user_id: session.id, hour_bucket: hour, count: 1 });
  return { ok: true, count: count + 1 };
}

async function runTool(name, args, session) {
  if (!TOOLS[name]) return { error: `Unknown tool "${name}"` };
  if (!toolAllowed(name, session)) {
    return { error: 'FORBIDDEN', message: 'You do not have permission for this data' };
  }
  try {
    return await TOOLS[name].run({ session, args: args || {} });
  } catch (e) {
    return { error: e.message };
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('AI request timed out')), ms)),
  ]);
}

export const POST = withAuth(null, async (req, ctx, session) => {
  const body = await req.json().catch(() => null);
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return fail(422, 'UNPROCESSABLE', 'messages array required');
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  const rate = await checkRateLimit(session);
  if (!rate.ok) {
    return fail(429, 'RATE_LIMITED', 'AI limit reached (20 requests/hour). Try again later.');
  }

  const llmConfigured = process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL;

  try {
    if (llmConfigured) {
      const result = await withTimeout(llmLoop(lastUser, session), TIMEOUT_MS);
      return json({ ...result, source: 'llm', ai_generated: true, rate_used: rate.count });
    }
    const { reply, toolCalls } = await offlineAnswer(lastUser, session);
    if (reply) {
      return json({ reply, toolCalls: [], source: 'offline', ai_generated: true, rate_used: rate.count });
    }
    // execute tools offline and format
    const executed = [];
    const parts = [];
    for (const call of toolCalls) {
      const data = await runTool(call.name, call.args, session);
      executed.push({ name: call.name, args: call.args });
      parts.push(data.error ? `⚠️ ${data.error}${data.message ? ` — ${data.message}` : ''}` : formatAnswer(call.name, data));
    }
    await audit(session.email, 'ai.chat', 'ai', '', { tools: executed.map((e) => e.name) });
    return json({ reply: parts.join('\n\n') || 'No data.', toolCalls: executed, source: 'offline', ai_generated: true, rate_used: rate.count });
  } catch (e) {
    const status = e.message.includes('timed out') ? 504 : 500;
    return fail(status, e.message.includes('timed out') ? 'TIMEOUT' : 'AI_ERROR', e.message);
  }
});

// OpenAI-compatible tool-calling loop with 1 JSON-parse retry (FR-08.3).
async function llmLoop(userText, session) {
  const base = process.env.LLM_BASE_URL.replace(/\/$/, '');
  const model = process.env.LLM_MODEL;
  const toolDefs = Object.entries(TOOLS).map(([name, t]) => ({
    type: 'function',
    function: { name, description: `${t.description} Roles allowed: ${t.roles.join('/')}.`, parameters: t.parameters },
  }));

  const systemPrompt = [
    'You are the HCM Lite assistant for an HR system. Answer using the provided tools only — never invent data.',
    `Today is ${new Date().toISOString().slice(0, 10)}. The user's role is "${session.role}".`,
    'If a tool returns an error (e.g. permission denied), tell the user politely they lack access.',
    'For policy questions answer from company settings via tools or general policy text.',
  ].join(' ');

  const callLlm = async (payload) => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('LLM returned no message');
    return msg;
  };

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];

  const executed = [];
  for (let hop = 0; hop < 4; hop++) {
    let msg;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        msg = await callLlm({ model, messages, tools: toolDefs });
        break;
      } catch (e) {
        if (attempt === 1) throw e;
      }
    }
    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const result = await runTool(tc.function.name, args, session);
        executed.push({ name: tc.function.name, args });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return { reply: msg.content || '…', toolCalls: executed };
  }
  return { reply: 'The question needed too many steps — try narrowing it.', toolCalls: executed };
}
