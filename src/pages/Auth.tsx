import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, errorText } from '../api';
import { Button, Card, ErrorText, Field, Input, Notice, Textarea, Turnstile } from '../components/ui';
import { useSession } from '../session';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <Card className="space-y-4">{children}</Card>
    </div>
  );
}

export function Login() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/login', { body: { email, password, totp: needTotp ? totp : undefined } });
      await refresh();
      navigate('/kisiler');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') {
        setNeedTotp(true);
        return;
      }
      setError(errorText(err));
    }
  }

  return (
    <Shell title="Giriş yap">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-posta">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Şifre">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {needTotp && (
          <Field label="Doğrulama kodu" hint="Doğrulama uygulamandaki 6 haneli kod.">
            <Input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} autoFocus />
          </Field>
        )}
        <ErrorText error={error} />
        <Button type="submit" className="w-full">
          Giriş yap
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <Link className="underline" to="/sifremi-unuttum">
          Şifremi unuttum
        </Link>
        <Link className="underline" to="/kayit">
          Hesap oluştur
        </Link>
      </div>
    </Shell>
  );
}

export function Register() {
  const { refresh, config } = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: '', password: '', name: '', city: '', danceSince: '', instagram: '', references: '' });
  const [turnstile, setTurnstile] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onToken = useCallback((t: string) => setTurnstile(t), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/register', { body: { ...f, turnstile } });
      await refresh();
      navigate('/hesabim');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Shell title="Kayıt ol">
      <Notice>
        Burada herkes gerçek kişidir. Bilgilerin sadece moderatörler tarafından, gerçek bir tango camiası üyesi olduğunu doğrulamak için görülür. Hesabın onaylanmadan içerik
        yazamaz ve tam isimleri göremezsin.
      </Notice>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ad soyad *" hint="Gerçek adın. Herkese değil, sadece moderatörlere görünür.">
          <Input value={f.name} onChange={set('name')} autoComplete="name" required />
        </Field>
        <Field label="E-posta *">
          <Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Şifre *" hint="En az 10 karakter.">
          <Input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={10} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Şehir">
            <Input value={f.city} onChange={set('city')} />
          </Field>
          <Field label="Ne zamandır dans ediyorsun?">
            <Input value={f.danceSince} onChange={set('danceSince')} placeholder="2018'den beri" />
          </Field>
        </div>
        <Field label="Instagram" hint="Doğrulamayı hızlandırır.">
          <Input value={f.instagram} onChange={set('instagram')} placeholder="@kullanici" />
        </Field>
        <Field label="Seni tanıyan biri / gittiğin milongalar" hint="Moderatörün seni doğrulayabilmesi için: öğretmenin, sık gittiğin milongalar, ortak tanıdıklar.">
          <Textarea value={f.references} onChange={set('references')} className="min-h-20" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            <Link className="underline" to="/kullanim-sartlari" target="_blank">
              Kullanım şartlarını
            </Link>
            ,{' '}
            <Link className="underline" to="/kurallar" target="_blank">
              içerik kurallarını
            </Link>{' '}
            ve{' '}
            <Link className="underline" to="/kvkk" target="_blank">
              KVKK aydınlatma metnini
            </Link>{' '}
            okudum, kabul ediyorum.
          </span>
        </label>
        <Turnstile onToken={onToken} />
        <ErrorText error={error} />
        <Button type="submit" className="w-full" disabled={!agree}>
          Başvur
        </Button>
        {!config.mailEnabled && <p className="text-xs text-muted">Şu an e-posta bildirimi kapalı; onay durumunu hesabından takip edebilirsin.</p>}
      </form>
    </Shell>
  );
}

function useHashToken() {
  return window.location.hash.slice(1);
}

export function Verify() {
  const token = useHashToken();
  const { refresh } = useSession();
  const [state, setState] = useState<'working' | 'ok' | string>('working');
  useEffect(() => {
    api('/auth/verify', { body: { token } })
      .then(() => (setState('ok'), refresh()))
      .catch((e) => setState(errorText(e)));
  }, [token, refresh]);
  return (
    <Shell title="E-posta doğrulama">
      {state === 'working' ? <p>Doğrulanıyor…</p> : state === 'ok' ? <Notice tone="ok">E-postan doğrulandı.</Notice> : <Notice tone="accent">{state}</Notice>}
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<boolean | null>(null);
  return (
    <Shell title="Şifremi unuttum">
      {sent === null ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ mailEnabled: boolean }>('/auth/forgot', { body: { email } });
            setSent(r.mailEnabled);
          }}
        >
          <Field label="E-posta">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full">
            Sıfırlama bağlantısı gönder
          </Button>
        </form>
      ) : sent ? (
        <Notice tone="ok">Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.</Notice>
      ) : (
        <Notice tone="warn">E-posta gönderimi şu an kapalı. Şifre sıfırlama için yönetimle iletişime geç.</Notice>
      )}
    </Shell>
  );
}

export function Reset() {
  const token = useHashToken();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <Shell title="Yeni şifre">
      {done ? (
        <Notice tone="ok">
          Şifren değişti. <Link className="underline" to="/giris">Giriş yap</Link>
        </Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/auth/reset', { body: { token, password } });
              setDone(true);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <Field label="Yeni şifre" hint="En az 10 karakter.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" className="w-full">
            Şifreyi değiştir
          </Button>
        </form>
      )}
    </Shell>
  );
}
