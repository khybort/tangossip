import { HTTPException } from 'hono/http-exception';
import type { Ctx } from '../env';

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429, error: string, extra: Record<string, unknown> = {}): never {
  throw new HTTPException(status, { res: Response.json({ error, ...extra }, { status, headers: { 'cache-control': 'no-store' } }) });
}

export async function body<T = Record<string, unknown>>(c: Ctx, maxBytes = 32 * 1024): Promise<T> {
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > maxBytes) fail(413, 'too_large');
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'bad_request');
    return parsed as T;
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    fail(400, 'bad_request');
  }
}

export function clientIp(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}

export function now(): number {
  return Date.now();
}

export const DAY_MS = 24 * 60 * 60 * 1000;
