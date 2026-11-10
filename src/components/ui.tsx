import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useSession } from '../session';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90',
  secondary: 'border border-line bg-card hover:border-ink',
  danger: 'bg-accent text-white hover:opacity-90',
  ghost: 'hover:bg-line/50',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const INPUT = 'w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-ink';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT} min-h-28 ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT} ${props.className ?? ''}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-card p-5 ${className}`}>{children}</div>;
}

type Tone = 'neutral' | 'accent' | 'warn' | 'ok';
const TONES: Record<Tone, string> = {
  neutral: 'bg-line/60 text-ink',
  accent: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-md px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-accent">{error}</p>;
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

/** Renders nothing when the server has no Turnstile key configured. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const { config } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(Boolean(window.turnstile));

  useEffect(() => {
    if (!config.turnstileSiteKey || window.turnstile) return;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, [config.turnstileSiteKey]);

  useEffect(() => {
    if (!config.turnstileSiteKey || !ready || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, { sitekey: config.turnstileSiteKey, callback: onToken, language: 'tr' });
    return () => window.turnstile?.remove(id);
  }, [config.turnstileSiteKey, ready, onToken]);

  if (!config.turnstileSiteKey) return null;
  return <div ref={ref} />;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Hata'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-muted">Yükleniyor…</p>;
}
