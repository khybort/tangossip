const enc = new TextEncoder();

// Workers cap PBKDF2 at 100k iterations; the stored format carries the count so it can rise later.
export const PBKDF2_ITERATIONS = 100_000;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(prefix: string): string {
  return `${prefix}_${randomToken(12)}`;
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, iterations))}`;
}

// Unknown emails are checked against this so a miss costs the same time as a wrong password.
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, iter, salt, hash] = (stored ?? DUMMY_HASH).split('$');
  if (scheme !== 'pbkdf2-sha256' || !salt || !hash) return false;
  const derived = await pbkdf2(password, fromB64url(salt), Number(iter));
  return timingSafeEqual(b64url(derived), hash) && stored != null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function shortCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
