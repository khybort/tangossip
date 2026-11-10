import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, errorText } from '../api';
import { Badge, Button, Card, ErrorText, Field, Input, Loading, Notice, Textarea, useAsync } from '../components/ui';
import { ACCOUNT_STATUS, formatDate, REPORT_STATUS } from '../labels';
import { useSession } from '../session';

interface MyReport {
  id: string;
  title: string;
  status: string;
  author_feedback: string | null;
  created_at: number;
  person_id: string;
  person_name: string;
  person_status: string;
}

export function Account() {
  const { me, loading, refresh, config } = useSession();
  const navigate = useNavigate();
  const reports = useAsync(() => (me ? api<{ reports: MyReport[] }>('/me/reports').then((r) => r.reports) : Promise.resolve([])), [me?.id]);
  const claims = useAsync(() => (me ? api('/me/claims') : Promise.resolve(null)), [me?.id]);

  if (loading) return <Loading />;
  if (!me) return <Navigate to="/giris" replace />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Hesabım</h1>
        <Badge tone={me.status === 'approved' ? 'ok' : me.status === 'pending' ? 'warn' : 'accent'}>{ACCOUNT_STATUS[me.status] ?? me.status}</Badge>
        {me.role !== 'user' && <Badge>{me.role === 'admin' ? 'Yönetici' : 'Moderatör'}</Badge>}
      </div>

      {me.status === 'pending' && <Notice tone="warn">Başvurun moderatör incelemesinde. Onaylandığında tam isimleri ve hikayeleri görebilirsin.</Notice>}
      {me.status === 'needs_info' && (
        <Notice tone="warn">
          Moderatör ek bilgi istedi: <strong>{me.statusNote}</strong>. Aşağıdan profilini güncellediğinde başvurun tekrar incelemeye alınır.
        </Notice>
      )}
      {me.status === 'rejected' && <Notice tone="accent">Başvurun onaylanmadı. {me.statusNote}</Notice>}
      {config.mailEnabled && !me.emailVerified && <ResendVerify />}

      {(me.role === 'moderator' || me.role === 'admin') && <TotpSetup />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Yazılarım</h2>
          {me.status === 'approved' && (
            <Link to="/paylas">
              <Button>Hikayeni paylaş</Button>
            </Link>
          )}
        </div>
        {reports.loading ? (
          <Loading />
        ) : !reports.data?.length ? (
          <p className="text-sm text-muted">Henüz bir yazın yok.</p>
        ) : (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.title}</strong>
                    <Badge tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' || r.status === 'removed' ? 'accent' : 'warn'}>{REPORT_STATUS[r.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {r.person_name} · {formatDate(r.created_at)}
                  </p>
                  {r.author_feedback && <Notice tone="warn">Moderatör notu: {r.author_feedback}</Notice>}
                  <div className="flex gap-2">
                    {['approved', 'disputed'].includes(r.status) && r.person_status === 'active' && (
                      <Link to={`/kisi/${r.person_id}`}>
                        <Button variant="secondary">Yayında gör</Button>
                      </Link>
                    )}
                    {['pending', 'needs_info', 'approved'].includes(r.status) && (
                      <Link to={`/hikaye/${r.id}/duzenle`}>
                        <Button variant="secondary">Düzenle</Button>
                      </Link>
                    )}
                    {!['withdrawn', 'removed'].includes(r.status) && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm('Bu yazıyı geri çekmek istediğine emin misin? Yayından kalkar.')) return;
                          await api(`/reports/${r.id}/withdraw`, { body: {} });
                          reports.reload();
                        }}
                      >
                        Geri çek
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claims.data && (claims.data.claims.length > 0 || claims.data.owned.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Profil sahiplenme</h2>
          {claims.data.owned.map((p: { id: string; full_name: string }) => (
            <Notice key={p.id} tone="ok">
              <Link className="underline" to={`/kisi/${p.id}`}>
                {p.full_name}
              </Link>{' '}
              profili hesabına bağlı. Hikayelere yanıt yazabilir ve itiraz açabilirsin.
            </Notice>
          ))}
          {claims.data.claims
            .filter((c: { status: string }) => c.status === 'open')
            .map((c: { id: string; full_name: string; code: string }) => (
              <Notice key={c.id} tone="warn">
                {c.full_name} için sahiplenme talebin bekliyor. Kodun: <strong className="font-mono">{c.code}</strong>
              </Notice>
            ))}
        </section>
      )}

      <ProfileForm onSaved={refresh} />
      <PasswordForm />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Verilerim</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const data = await api('/me/export');
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'tangossip-verilerim.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Verilerimi indir
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Hesabın ve kişisel verilerin silinecek. Onaylanmış yazıların anonim olarak yayında kalır; istersen önce geri çek. Emin misin?')) return;
              await api('/me', { method: 'DELETE', body: {} });
              await refresh();
              navigate('/');
            }}
          >
            Hesabımı sil
          </Button>
        </div>
      </section>
    </div>
  );
}

function ResendVerify() {
  const [sent, setSent] = useState(false);
  return (
    <Notice tone="warn">
      E-posta adresin doğrulanmadı.{' '}
      {sent ? (
        'Bağlantı gönderildi.'
      ) : (
        <button className="underline" onClick={() => api('/auth/resend-verify', { body: {} }).then(() => setSent(true))}>
          Doğrulama bağlantısını tekrar gönder
        </button>
      )}
    </Notice>
  );
}

function TotpSetup() {
  const { me, refresh } = useSession();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (me?.totpEnabled && me.mfa) return null;
  if (me?.totpEnabled && !me.mfa) return <Notice tone="warn">Yönetim paneli için çıkış yapıp doğrulama koduyla tekrar giriş yap.</Notice>;
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">İki adımlı doğrulama</h2>
      <p className="text-sm text-muted">Moderatör ve yöneticiler, yönetim paneline erişmeden önce bir doğrulama uygulaması (Google Authenticator, 1Password, Authy…) bağlamalı.</p>
      {!setup ? (
        <Button onClick={async () => setSetup(await api('/auth/totp/setup', { body: {} }))}>Kurulumu başlat</Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/auth/totp/enable', { body: { code } });
              await refresh();
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <p className="text-sm">
            Uygulamana bu anahtarı ekle: <code className="rounded bg-line/60 px-1.5 py-0.5 font-mono break-all">{setup.secret}</code>
          </p>
          <p className="text-xs break-all text-muted">
            veya bağlantı: <a className="underline" href={setup.uri}>{setup.uri}</a>
          </p>
          <Field label="Uygulamadaki 6 haneli kod">
            <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <ErrorText error={error} />
          <Button type="submit">Etkinleştir</Button>
        </form>
      )}
    </Card>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const { me } = useSession();
  const [f, setF] = useState({ name: me!.name, city: me!.city ?? '', danceSince: me!.danceSince ?? '', instagram: me!.instagram ?? '', references: me!.references ?? '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Profil bilgilerim</h2>
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api('/me/profile', { method: 'PUT', body: f });
              await onSaved();
              setMsg('Kaydedildi.');
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <p className="text-xs text-muted">Bu bilgiler sadece moderatörlere görünür. E-posta: {me!.email}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ad soyad">
              <Input value={f.name} onChange={set('name')} />
            </Field>
            <Field label="Şehir">
              <Input value={f.city} onChange={set('city')} />
            </Field>
            <Field label="Ne zamandır dans ediyorsun?">
              <Input value={f.danceSince} onChange={set('danceSince')} />
            </Field>
            <Field label="Instagram">
              <Input value={f.instagram} onChange={set('instagram')} />
            </Field>
          </div>
          <Field label="Seni tanıyan biri / gittiğin milongalar">
            <Textarea value={f.references} onChange={set('references')} className="min-h-20" />
          </Field>
          <ErrorText error={error} />
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <Button type="submit" variant="secondary">
            Kaydet
          </Button>
        </form>
      </Card>
    </section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Şifre değiştir</h2>
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api('/auth/password', { body: { current, password } });
              setMsg('Şifre değişti; diğer cihazlardaki oturumlar kapatıldı.');
              setCurrent('');
              setPassword('');
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <Field label="Mevcut şifre">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Yeni şifre">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} />
          </Field>
          <Button type="submit" variant="secondary">
            Değiştir
          </Button>
        </form>
        <ErrorText error={error} />
        {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
      </Card>
    </section>
  );
}
