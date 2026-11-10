import { Hono } from 'hono';
import type { Account, App, Ctx } from '../env';
import { hashPassword, newId, randomToken, sha256Hex, verifyPassword } from '../lib/crypto';
import { body, clientIp, DAY_MS, fail } from '../lib/http';
import { audit, checkTurnstile, limit, mailEnabled, sendMail } from '../lib/services';
import { endSession, isStaff, requireAccount, startSession } from '../lib/session';
import { cleanText } from '../lib/text';
import { newTotpSecret, otpauthUri, verifyTotp } from '../lib/totp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;
const VERIFY_TTL_MS = 2 * DAY_MS;
const RESET_TTL_MS = 60 * 60 * 1000;
const MIN = 60 * 1000;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function passwordOk(password: unknown, email?: string): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 256 && password.trim().toLowerCase() !== email;
}

export function publicMe(c: Ctx) {
  const a = c.get('account');
  return {
    user: a
      ? {
          id: a.id,
          email: a.email,
          name: a.name,
          city: a.city,
          danceSince: a.dance_since,
          instagram: a.instagram,
          references: a.references_text,
          emailVerified: Boolean(a.email_verified),
          role: a.role,
          status: a.status,
          statusNote: a.status_note,
          totpEnabled: Boolean(a.totp_enabled),
          mfa: c.get('mfa'),
          createdAt: a.created_at,
        }
      : null,
  };
}

async function issueToken(c: Ctx, accountId: string, purpose: 'verify' | 'reset'): Promise<string> {
  const token = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_token WHERE account_id = ? AND purpose = ?').bind(accountId, purpose),
    c.env.DB.prepare('INSERT INTO auth_token (id, account_id, purpose, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256Hex(token),
      accountId,
      purpose,
      Date.now() + (purpose === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS),
    ),
  ]);
  return token;
}

async function consumeToken(c: Ctx, token: unknown, purpose: 'verify' | 'reset'): Promise<string> {
  if (typeof token !== 'string' || token.length > 128) fail(400, 'bad_token');
  const id = await sha256Hex(token);
  const row = await c.env.DB.prepare('DELETE FROM auth_token WHERE id = ? AND purpose = ? AND expires_at > ? RETURNING account_id')
    .bind(id, purpose, Date.now())
    .first<{ account_id: string }>();
  if (!row) fail(400, 'bad_token');
  return row.account_id;
}

export const auth = new Hono<App>();

auth.get('/me', (c) => c.json(publicMe(c)));

/** Shared by sign-up and by a visitor's first story, which opens an account in the same request. */
export async function createAccount(c: Ctx, b: Record<string, unknown>): Promise<string> {
  await limit(c, `register:${clientIp(c)}`, 10, 60 * MIN);
  const email = normalizeEmail(b.email);
  const name = cleanText(b.name, 120);
  if (!email) fail(400, 'bad_email');
  if (!passwordOk(b.password, email)) fail(400, 'weak_password');
  if (!name || name.split(/\s+/).length < 2) fail(400, 'full_name_required');
  const exists = await c.env.DB.prepare('SELECT 1 FROM account WHERE email = ?').bind(email).first();
  if (exists) fail(409, 'email_taken');
  const id = newId('acc');
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO account (id, email, pw, name, city, dance_since, instagram, references_text, created_at, pw_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      email,
      await hashPassword(b.password),
      name,
      cleanText(b.city, 80),
      cleanText(b.danceSince, 40),
      cleanText(b.instagram, 80),
      cleanText(b.references, 1000),
      now,
      now,
    )
    .run();
  await startSession(c, id, false);
  const account = await c.env.DB.prepare('SELECT * FROM account WHERE id = ?').bind(id).first<Account>();
  c.set('account', account);
  await audit(c, 'account.register', 'account', id);
  if (mailEnabled(c.env)) {
    const token = await issueToken(c, id, 'verify');
    await sendMail(c, email, 'tangossip — e-posta adresini doğrula', ['Hesabını doğrulamak için bağlantıya tıkla. Bağlantı 48 saat geçerli.'], {
      href: `/dogrula#${token}`,
      label: 'E-postamı doğrula',
    });
  }
  return id;
}

auth.post('/register', async (c) => {
  const b = await body(c);
  await checkTurnstile(c, b.turnstile);
  await createAccount(c, b);
  return c.json({ ok: true, verifyEmail: mailEnabled(c.env) });
});

auth.post('/login', async (c) => {
  const b = await body(c);
  const email = normalizeEmail(b.email);
  await limit(c, `login-ip:${clientIp(c)}`, 50, 15 * MIN);
  if (email) await limit(c, `login:${email}`, 10, 15 * MIN);
  const account = email
    ? await c.env.DB.prepare("SELECT * FROM account WHERE email = ? AND status != 'deleted'").bind(email).first<Account & { pw: string }>()
    : null;
  const ok = await verifyPassword(typeof b.password === 'string' ? b.password : '', account?.pw ?? null);
  if (!account || !ok) fail(401, 'bad_credentials');
  if (account.status === 'banned') fail(403, 'banned');
  let mfa = false;
  if (account.totp_enabled && account.totp_secret) {
    if (!b.totp) fail(401, 'totp_required');
    if (!(await verifyTotp(account.totp_secret, b.totp))) fail(401, 'bad_totp');
    mfa = true;
  }
  await startSession(c, account.id, mfa);
  c.set('account', account);
  c.set('mfa', mfa);
  return c.json(publicMe(c));
});

auth.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

auth.post('/verify', async (c) => {
  const b = await body(c);
  const accountId = await consumeToken(c, b.token, 'verify');
  await c.env.DB.prepare('UPDATE account SET email_verified = 1 WHERE id = ?').bind(accountId).run();
  return c.json({ ok: true });
});

auth.post('/resend-verify', async (c) => {
  const a = requireAccount(c);
  if (a.email_verified || !mailEnabled(c.env)) return c.json({ ok: true });
  await limit(c, `resend:${a.id}`, 5, 60 * MIN);
  const token = await issueToken(c, a.id, 'verify');
  await sendMail(c, a.email, 'tangossip — e-posta adresini doğrula', ['Hesabını doğrulamak için bağlantıya tıkla.'], { href: `/dogrula#${token}`, label: 'E-postamı doğrula' });
  return c.json({ ok: true });
});

auth.post('/forgot', async (c) => {
  const b = await body(c);
  const email = normalizeEmail(b.email);
  await limit(c, `forgot-ip:${clientIp(c)}`, 20, 60 * MIN);
  if (email && mailEnabled(c.env)) {
    await limit(c, `forgot:${email}`, 3, 60 * MIN);
    const account = await c.env.DB.prepare("SELECT id FROM account WHERE email = ? AND status NOT IN ('banned', 'deleted')").bind(email).first<{ id: string }>();
    if (account) {
      const token = await issueToken(c, account.id, 'reset');
      await sendMail(c, email, 'tangossip — şifre sıfırlama', ['Şifreni sıfırlamak için bağlantıya tıkla. Bu sen değilsen e-postayı yok say. Bağlantı 1 saat geçerli.'], {
        href: `/sifre-sifirla#${token}`,
        label: 'Yeni şifre belirle',
      });
    }
  }
  return c.json({ ok: true, mailEnabled: mailEnabled(c.env) });
});

auth.post('/reset', async (c) => {
  const b = await body(c);
  if (!passwordOk(b.password)) fail(400, 'weak_password');
  const accountId = await consumeToken(c, b.token, 'reset');
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE account SET pw = ?, pw_changed_at = ?, email_verified = 1 WHERE id = ?').bind(await hashPassword(b.password), now, accountId),
    c.env.DB.prepare('DELETE FROM session WHERE account_id = ?').bind(accountId),
  ]);
  return c.json({ ok: true });
});

auth.post('/password', async (c) => {
  const a = requireAccount(c);
  const b = await body(c);
  await limit(c, `pw:${a.id}`, 10, 15 * MIN);
  const row = await c.env.DB.prepare('SELECT pw FROM account WHERE id = ?').bind(a.id).first<{ pw: string }>();
  if (!(await verifyPassword(typeof b.current === 'string' ? b.current : '', row?.pw ?? null))) fail(401, 'bad_credentials');
  if (!passwordOk(b.password, a.email)) fail(400, 'weak_password');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE account SET pw = ?, pw_changed_at = ? WHERE id = ?').bind(await hashPassword(b.password), Date.now(), a.id),
    c.env.DB.prepare('DELETE FROM session WHERE account_id = ? AND id != ?').bind(a.id, c.get('sessionId')),
  ]);
  return c.json({ ok: true });
});

auth.post('/totp/setup', async (c) => {
  const a = requireAccount(c);
  if (!isStaff(a)) fail(403, 'forbidden');
  if (a.totp_enabled) fail(409, 'totp_already_enabled');
  const secret = newTotpSecret();
  await c.env.DB.prepare('UPDATE account SET totp_secret = ? WHERE id = ?').bind(secret, a.id).run();
  return c.json({ secret, uri: otpauthUri(secret, a.email) });
});

auth.post('/totp/enable', async (c) => {
  const a = requireAccount(c);
  const b = await body(c);
  if (!isStaff(a) || !a.totp_secret) fail(400, 'totp_not_setup');
  if (!(await verifyTotp(a.totp_secret, b.code))) fail(400, 'bad_totp');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE account SET totp_enabled = 1 WHERE id = ?').bind(a.id),
    c.env.DB.prepare('UPDATE session SET mfa = 1 WHERE id = ?').bind(c.get('sessionId')),
  ]);
  await audit(c, 'account.totp_enabled', 'account', a.id);
  return c.json({ ok: true });
});
