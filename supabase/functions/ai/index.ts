// Supabase Edge Function — AI proxy for Easy Bible, with server-side metering.
//
// The app sends ready-made chat messages; this adds the secret OpenAI key (Secret OPENAI_API_KEY,
// never written in code) and returns the model's reply. Before calling the model it decides whether
// the caller may, so the free tier and the abuse caps can't be bypassed by editing the app or calling
// this endpoint directly. Counting happens in public.ai_usage (migration 0004), per Supabase user.
// Caveat: a signed-out reader who reinstalls gets a new anonymous user, and with it one more free
// question; Supabase's anonymous sign-in rate limit (and CAPTCHA, if enabled) bounds that.
//
// Every request must carry:
//   - a Supabase user JWT: a real account, or the anonymous user the app creates for a signed-out
//     reader (src/lib/api.ts, ensureAiSession). No user → 401 { code: 'auth_required' }.
//   - `kind: 'chat' | 'suggestions'`. Anything else → 400.
//
// Limits (each can be overridden with an Edge Function secret of the same name):
//   AI_FREE_CHAT_LIMIT          1    lifetime chat questions for a non-premium user
//   AI_PREMIUM_DAILY_LIMIT      300  chat questions per day for premium (an abuse ceiling, not a product limit)
//   AI_SUGGESTIONS_DAILY_LIMIT  60   suggestion-card generations per user per day
//
// Premium = any active row in public.entitlements (written by stripe-webhook / revenuecat-webhook).
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// config.toml sets verify_jwt = false: the gateway doesn't check the JWT, this function does (below),
// so it can answer with a clear auth_required code instead of a bare gateway 401.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const envInt = (name: string, fallback: number): number => {
  const n = Number.parseInt(Deno.env.get(name) ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const LIMITS = {
  freeChat: envInt('AI_FREE_CHAT_LIMIT', 1),
  premiumDaily: envInt('AI_PREMIUM_DAILY_LIMIT', 300),
  suggestionsDaily: envInt('AI_SUGGESTIONS_DAILY_LIMIT', 60),
};

// Hard caps on a single request, whatever the client asks for. The message caps are generous on
// purpose: the app resends the whole conversation each turn, and long chats must keep working.
const MAX_MESSAGES = 120;
const MAX_TOTAL_CHARS = 250_000;
const MAX_TOKENS = { chat: 3500, suggestions: 500 } as const;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Kind = keyof typeof MAX_TOKENS;
type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
type Grant = { subject: string; bucket: string };
type Denial = { status: number; code: 'auth_required' | 'paywall' | 'rate_limited'; error: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const today = () => new Date().toISOString().slice(0, 10);
const isKind = (v: unknown): v is Kind => v === 'chat' || v === 'suggestions';

const AUTH_REQUIRED: Denial = { status: 401, code: 'auth_required', error: 'Please sign in to ask a question.' };
const PAYWALL: Denial = {
  status: 402,
  code: 'paywall',
  error: 'You have used your free question. Start Premium to keep asking.',
};
const RATE_LIMITED: Denial = {
  status: 429,
  code: 'rate_limited',
  error: 'You have reached today’s limit. Please try again tomorrow.',
};

/** The Supabase user behind the request's JWT, or null (publishable key only, expired, or invalid). */
async function callerUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  // The publishable key isn't a JWT. Only a session token (three dot-separated parts) can be a user.
  if (token.split('.').length !== 3) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function isPremium(userId: string): Promise<boolean> {
  const { data, error } = await admin.from('entitlements').select('is_active').eq('user_id', userId);
  if (error) throw new Error(`entitlement check failed: ${error.message}`);
  return (data ?? []).some((row) => row.is_active === true);
}

/** Take one unit from a usage bucket; false when the bucket is full. */
async function consume(subject: string, bucket: string, limit: number): Promise<boolean> {
  const { data, error } = await admin.rpc('ai_consume', { p_subject: subject, p_bucket: bucket, p_limit: limit });
  if (error) throw new Error(`usage check failed: ${error.message}`);
  return data === true;
}

async function refund(grant: Grant): Promise<void> {
  await admin.rpc('ai_refund', { p_subject: grant.subject, p_bucket: grant.bucket });
}

async function take(subject: string, bucket: string, limit: number, onFull: Denial): Promise<Grant | Denial> {
  return (await consume(subject, bucket, limit)) ? { subject, bucket } : onFull;
}

/** Decide whether this user may call the model, and record it against the right bucket. */
async function authorize(userId: string, kind: Kind): Promise<Grant | Denial> {
  const subject = `user:${userId}`;
  if (kind === 'suggestions') {
    return take(subject, `suggest:${today()}`, LIMITS.suggestionsDaily, RATE_LIMITED);
  }
  if (await isPremium(userId)) {
    return take(subject, `chat:${today()}`, LIMITS.premiumDaily, RATE_LIMITED);
  }
  return take(subject, 'free_chat', LIMITS.freeChat, PAYWALL);
}

function validMessages(value: unknown): ChatMsg[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  let total = 0;
  const out: ChatMsg[] = [];
  for (const m of value) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'system' && role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    total += content.length;
    if (total > MAX_TOTAL_CHARS) return null;
    out.push({ role, content });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Set once a usage unit has been taken, so any later failure can give it back.
  let grant: Grant | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = body.kind;
    if (!isKind(kind)) return json({ error: "kind must be 'chat' or 'suggestions'" }, 400);
    const messages = validMessages(body.messages);
    if (!messages) return json({ error: 'messages[] is missing, malformed, or too long' }, 400);

    const userId = await callerUserId(req);
    if (!userId) return json({ error: AUTH_REQUIRED.error, code: AUTH_REQUIRED.code }, AUTH_REQUIRED.status);
    const decision = await authorize(userId, kind);
    if ('code' in decision) return json({ error: decision.error, code: decision.code }, decision.status);
    grant = decision;

    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) throw new Error('OPENAI_API_KEY is not set');

    const requestedTokens = Number(body.maxTokens) > 0 ? Math.floor(Number(body.maxTokens)) : 600;
    const rawTemp = Number(body.temperature);
    const temperature = Number.isFinite(rawTemp) ? Math.min(Math.max(rawTemp, 0), 1.5) : 0.7;

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        max_tokens: Math.min(requestedTokens, MAX_TOKENS[kind]),
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return json({ content: data.choices?.[0]?.message?.content ?? '' });
  } catch (e) {
    // Don't charge the user for an answer they never got.
    if (grant) await refund(grant).catch(() => {});
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
