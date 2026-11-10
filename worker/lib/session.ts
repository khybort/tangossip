import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Account, App, Ctx } from '../env';
import { randomToken, sha256Hex } from './crypto';
import { DAY_MS, fail } from './http';
import { setting } from './services';

const COOKIE = '__Host-tg_sid';
const SESSION_TTL_MS = 30 * DAY_MS;
const RENEW_BELOW_MS = 15 * DAY_MS;

function writeCookie(c: Ctx, token: string) {
  setCookie(c, COOKIE, token, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: SESSION_TTL_MS / 1000 });
}

export async function startSession(c: Ctx, accountId: string, mfa: boolean) {
  const token = randomToken();
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO session (id, account_id, mfa, created_at, expires_at, last_seen_at, ua) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), accountId, mfa ? 1 : 0, now, now + SESSION_TTL_MS, now, (c.req.header('user-agent') ?? '').slice(0, 160))
    .run();
  writeCookie(c, token);
}

export async function endSession(c: Ctx) {
  const id = c.get('sessionId');
  if (id) await c.env.DB.prepare('DELETE FROM session WHERE id = ?').bind(id).run();
  deleteCookie(c, COOKIE, { path: '/', secure: true });
}

export const loadSession = createMiddleware<App>(async (c, next) => {
  c.set('account', null);
  c.set('sessionId', null);
  c.set('mfa', false);
  const token = getCookie(c, COOKIE);
  if (token && token.length <= 128) {
    const id = await sha256Hex(token);
    const now = Date.now();
    const row = await c.env.DB.prepare(
      `SELECT s.expires_at AS s_expires, s.last_seen_at AS s_seen, s.mfa AS s_mfa, a.* FROM session s JOIN account a ON a.id = s.account_id
       WHERE s.id = ? AND s.expires_at > ? AND a.status NOT IN ('banned', 'deleted')`,
    )
      .bind(id, now)
      .first<Account & { s_expires: number; s_seen: number; s_mfa: number }>();
    if (row) {
      c.set('account', row);
      c.set('sessionId', id);
      c.set('mfa', row.s_mfa === 1);
      if (row.s_expires - now < RENEW_BELOW_MS) {
        await c.env.DB.prepare('UPDATE session SET expires_at = ?, last_seen_at = ? WHERE id = ?').bind(now + SESSION_TTL_MS, now, id).run();
        writeCookie(c, token);
      } else if (now - row.s_seen > 60 * 60 * 1000) {
        await c.env.DB.prepare('UPDATE session SET last_seen_at = ? WHERE id = ?').bind(now, id).run();
      }
    }
  }
  await next();
});

/** Browsers always send Origin on cross-site POST; a JSON content type forces a preflight we never answer. */
export const sameOrigin = createMiddleware<App>(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) fail(403, 'bad_origin');
    if (!origin && c.req.header('sec-fetch-site') === 'cross-site') fail(403, 'bad_origin');
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  }
  await next();
});

export function requireAccount(c: Ctx): Account {
  const account = c.get('account');
  if (!account) fail(401, 'login_required');
  return account;
}

export function isMember(account: Account | null): boolean {
  return account?.status === 'approved';
}

export function requireMember(c: Ctx): Account {
  const account = requireAccount(c);
  if (!isMember(account)) fail(403, 'not_approved');
  return account;
}

export function isStaff(account: Account | null): boolean {
  return account?.status === 'approved' && (account.role === 'moderator' || account.role === 'admin');
}

export function requireStaff(c: Ctx, role: 'moderator' | 'admin' = 'moderator'): Account {
  const account = requireAccount(c);
  if (!isStaff(account) || (role === 'admin' && account.role !== 'admin')) fail(403, 'forbidden');
  if (!c.get('mfa')) fail(403, 'mfa_required');
  return account;
}

/** Votes and new reports need an account that has existed for a while, so a fresh sock puppet cannot pile on. */
export async function requireSeasoned(c: Ctx): Promise<Account> {
  const account = requireMember(c);
  const days = await setting(c.env, 'min_account_age_days', 3);
  if (Date.now() - account.created_at < days * DAY_MS && !isStaff(account)) fail(403, 'account_too_new', { days });
  return account;
}
