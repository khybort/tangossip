import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  MAIL_FROM: string;
  TURNSTILE_SITE_KEY: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  HASH_KEY?: string;
  SITE_ORIGIN?: string;
}

export interface Account {
  id: string;
  email: string;
  name: string;
  city: string | null;
  dance_since: string | null;
  instagram: string | null;
  references_text: string | null;
  email_verified: number;
  role: 'user' | 'moderator' | 'admin';
  status: 'pending' | 'needs_info' | 'approved' | 'rejected' | 'banned' | 'deleted';
  status_note: string | null;
  trust_score: number;
  totp_secret: string | null;
  totp_enabled: number;
  created_at: number;
  approved_at: number | null;
}

export interface Vars {
  account: Account | null;
  sessionId: string | null;
  mfa: boolean;
}

export type App = { Bindings: Env; Variables: Vars };
export type Ctx = Context<App>;
