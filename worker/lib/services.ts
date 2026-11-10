import type { Ctx, Env } from '../env';
import { hmacHex, newId } from './crypto';
import { clientIp, fail } from './http';

export async function ipHash(c: Ctx): Promise<string> {
  return (await hmacHex(c.env.HASH_KEY ?? 'dev-only-hash-key', clientIp(c))).slice(0, 32);
}

export async function audit(c: Ctx, action: string, targetType: string | null, targetId: string | null, detail?: unknown) {
  await c.env.DB.prepare(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(newId('log'), c.get('account')?.id ?? null, action, targetType, targetId, detail === undefined ? null : JSON.stringify(detail), await ipHash(c), Date.now())
    .run();
}

/** Fixed-window counter in D1; returns seconds to wait when over the limit. */
export async function throttle(env: Env, key: string, max: number, windowMs: number): Promise<number> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO throttle (k, n, window_start) VALUES (?, 1, ?)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN window_start <= ? THEN 1 ELSE n + 1 END,
       window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END
     RETURNING n, window_start`,
  )
    .bind(key, now, now - windowMs, now - windowMs, now)
    .first<{ n: number; window_start: number }>();
  if (!row || row.n <= max) return 0;
  return Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000));
}

export async function limit(c: Ctx, key: string, max: number, windowMs: number) {
  const wait = await throttle(c.env, key, max, windowMs);
  if (wait) fail(429, 'rate_limited', { retryAfter: wait });
}

export async function checkTurnstile(c: Ctx, token: unknown) {
  if (!c.env.TURNSTILE_SECRET) return;
  if (typeof token !== 'string' || !token) fail(400, 'turnstile_required');
  const form = new FormData();
  form.append('secret', c.env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', clientIp(c));
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = (await res.json()) as { success?: boolean };
  if (!out.success) fail(400, 'turnstile_failed');
}

export async function setting(env: Env, key: string, fallback: number): Promise<number> {
  const row = await env.DB.prepare('SELECT v FROM setting WHERE k = ?').bind(key).first<{ v: string }>();
  const n = Number(row?.v);
  return Number.isFinite(n) ? n : fallback;
}

export function mailEnabled(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/** Mail failures are logged, never surfaced: a moderation action must not fail because Resend did. */
export async function sendMail(c: Ctx, to: string, subject: string, lines: string[], link?: { href: string; label: string }) {
  if (!mailEnabled(c.env)) return;
  const origin = c.env.SITE_ORIGIN ?? new URL(c.req.url).origin;
  const href = link ? new URL(link.href, origin).toString() : null;
  const text = [...lines, href ? `${link!.label}: ${href}` : ''].filter(Boolean).join('\n\n');
  const html = [...lines.map((l) => `<p>${escapeHtml(l)}</p>`), href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(link!.label)}</a></p>` : ''].join('');
  const send = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${c.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: c.env.MAIL_FROM, to, subject, text, html }),
  })
    .then((res) => {
      if (!res.ok) console.error('resend', res.status);
    })
    .catch((err) => console.error('resend', err));
  try {
    c.executionCtx.waitUntil(send);
  } catch {
    await send;
  }
}
