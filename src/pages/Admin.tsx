import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api, errorText } from '../api';
import { Badge, Button, Card, ErrorText, Field, Input, Loading, Notice, Select, Textarea, useAsync } from '../components/ui';
import { ACCOUNT_STATUS, CONTENT_FLAGS, FIRSTHAND, formatDate, RECOMMENDATION, REPORT_STATUS, ROLES } from '../labels';
import { useSession } from '../session';

type Tab = 'reports' | 'accounts' | 'persons' | 'categories' | 'replies' | 'appeals' | 'claims' | 'flags' | 'takedowns' | 'audit' | 'settings';

const TABS: { key: Tab; label: string; queue?: string; admin?: boolean }[] = [
  { key: 'reports', label: 'Hikayeler', queue: 'reports' },
  { key: 'accounts', label: 'Hesaplar', queue: 'accounts' },
  { key: 'persons', label: 'Kişiler', queue: 'persons' },
  { key: 'categories', label: 'Kategoriler', queue: 'categories' },
  { key: 'replies', label: 'Yanıtlar', queue: 'replies' },
  { key: 'appeals', label: 'İtirazlar', queue: 'appeals' },
  { key: 'claims', label: 'Sahiplenme', queue: 'claims' },
  { key: 'flags', label: 'Bildirimler', queue: 'flags' },
  { key: 'takedowns', label: 'Kaldırma talepleri', queue: 'takedowns', admin: true },
  { key: 'audit', label: 'Kayıt defteri', admin: true },
  { key: 'settings', label: 'Ayarlar' },
];

export function Admin() {
  const { me, isStaff, loading } = useSession();
  const [tab, setTab] = useState<Tab>('reports');
  const queues = useAsync(() => (isStaff && me?.mfa ? api('/admin/queues').then((r) => r.queues as Record<string, number>) : Promise.resolve(null)), [tab, isStaff, me?.mfa]);

  if (loading) return <Loading />;
  if (!isStaff) return <Navigate to="/" replace />;
  if (!me?.mfa)
    return (
      <Notice tone="warn">
        Yönetim paneli için iki adımlı doğrulama gerekli. <Link className="underline" to="/hesabim">Hesabından</Link> kurulumu yap veya doğrulama koduyla yeniden giriş yap.
      </Notice>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Yönetim</h1>
      <div className="flex flex-wrap gap-1.5">
        {TABS.filter((t) => !t.admin || me.role === 'admin').map((t) => {
          const n = t.queue ? queues.data?.[t.queue] : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t.key ? 'bg-ink text-paper' : 'border border-line hover:border-ink'}`}
            >
              {t.label}
              {n ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-white">{n}</span> : null}
            </button>
          );
        })}
      </div>
      {tab === 'reports' && <ReportsTab onChange={queues.reload} />}
      {tab === 'accounts' && <AccountsTab onChange={queues.reload} />}
      {tab === 'persons' && <PersonsTab onChange={queues.reload} />}
      {tab === 'categories' && <CategoriesTab onChange={queues.reload} />}
      {tab === 'replies' && <RepliesTab onChange={queues.reload} />}
      {tab === 'appeals' && <AppealsTab onChange={queues.reload} />}
      {tab === 'claims' && <ClaimsTab onChange={queues.reload} />}
      {tab === 'flags' && <FlagsTab onChange={queues.reload} />}
      {tab === 'takedowns' && <TakedownsTab onChange={queues.reload} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function StatusFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-xs">
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
      <option value="all">Tümü</option>
    </Select>
  );
}

function useAction(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(path: string, body: unknown, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    setBusy(true);
    try {
      await api(path, { body });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy };
}

// ---------------- reports
function ReportsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState<string | null>(null);
  const list = useAsync(() => api(`/admin/reports?status=${status}`).then((r) => r.reports), [status]);
  if (open) return <ReportDetail id={open} onClose={() => (setOpen(null), list.reload(), onChange())} />;
  return (
    <div className="space-y-3">
      <StatusFilter value={status} onChange={setStatus} options={REPORT_STATUS} />
      {list.loading ? (
        <Loading />
      ) : !list.data?.length ? (
        <p className="text-sm text-muted">Kuyruk boş.</p>
      ) : (
        list.data.map((r: any) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{r.title}</strong>
                <Badge>{REPORT_STATUS[r.status]}</Badge>
                {r.person_status === 'pending' && <Badge tone="warn">Yeni kişi</Badge>}
                {JSON.parse(r.content_flags).length > 0 && <Badge tone="accent">Kişisel veri şüphesi</Badge>}
                {r.open_flags > 0 && <Badge tone="accent">{r.open_flags} bildirim</Badge>}
                {r.version > 1 && <Badge>v{r.version}</Badge>}
                {r.author_status !== 'approved' && <Badge tone="warn">Yazar onay bekliyor</Badge>}
              </div>
              <p className="text-sm text-muted">
                Hakkında: {r.person_name} · Yazar: {r.author_name} (güven {r.author_trust}) · {formatDate(r.created_at)}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setOpen(r.id)}>
              İncele
            </Button>
          </Card>
        ))
      )}
    </div>
  );
}

function ReportDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { me } = useSession();
  const d = useAsync(() => api(`/admin/reports/${id}`), [id]);
  const [summary, setSummary] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [note, setNote] = useState('');
  const [cats, setCats] = useState<string[] | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const act = useAction(onClose);
  if (d.loading || !d.data) return <Loading />;
  const { report: r, person, author, revisions, flags, votes, otherReports, reply, appeals, categories } = d.data;
  const selected = cats ?? r.categories;
  const summaryValue = summary ?? r.public_summary ?? '';

  return (
    <div className="space-y-4">
      <button className="text-sm underline" onClick={onClose}>
        ← Listeye dön
      </button>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{REPORT_STATUS[r.status]}</Badge>
              <span className="text-sm text-muted">
                Ciddiyet {r.score}/5 · {RECOMMENDATION[r.entry_recommendation]} · {FIRSTHAND[r.firsthand]} · Olay: {r.incident_date ?? '—'} · Yer: {r.location ?? '—'}
              </span>
            </div>
            <h2 className="text-2xl font-semibold">{r.title}</h2>
            <p className="whitespace-pre-line leading-relaxed">{r.story}</p>
            {r.content_flags.length > 0 && (
              <Notice tone="accent">Otomatik kontrol: {r.content_flags.map((f: string) => CONTENT_FLAGS[f] ?? f).join(', ')}. Yayından önce yazardan çıkarmasını iste.</Notice>
            )}
            {r.moderator_note && <Notice>İç not: {r.moderator_note}</Notice>}
          </Card>

          <Card className="space-y-3">
            <h3 className="font-semibold">Kategoriler</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setCats(selected.includes(c.id) ? selected.filter((x: string) => x !== c.id) : [...selected, c.id])}
                  className={`rounded-full border px-3 py-1 text-sm ${selected.includes(c.id) ? 'border-ink bg-ink text-paper' : 'border-line'}`}
                >
                  {c.name}
                  {c.status === 'proposed' && ' (önerilen)'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">Önerilen bir kategori seçili kalırsa onayla birlikte herkese açılır.</p>
          </Card>

          <Card className="space-y-3">
            <Field label="Ziyaretçilere görünen özet" hint="İsimsiz, ayrıntısız, tarafsız bir cümle. Ziyaretçiler hikayeyi göremez, sadece bunu görür.">
              <Textarea value={summaryValue} onChange={(e) => setSummary(e.target.value)} className="min-h-20" />
            </Field>
            <Field label="Yazara iletilecek gerekçe" hint="Reddetme veya ek bilgi isteme için zorunlu.">
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="min-h-20" />
            </Field>
            <Field label="İç not (sadece moderatörler)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <ErrorText error={act.error} />
            <div className="flex flex-wrap gap-2">
              {r.status !== 'approved' && (
                <Button disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'approve', publicSummary: summaryValue, note, categoryIds: selected })}>
                  Onayla ve yayınla
                </Button>
              )}
              {r.status === 'approved' && (
                <Button variant="secondary" disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'summary', publicSummary: summaryValue, note })}>
                  Özeti kaydet
                </Button>
              )}
              <Button variant="secondary" disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'needs_info', feedback, note })}>
                Ek bilgi iste
              </Button>
              <Button variant="secondary" disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'reject', feedback, note })}>
                Reddet
              </Button>
              {['approved', 'disputed'].includes(r.status) && (
                <Button variant="secondary" disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'remove', note }, 'Yayından kaldırılsın mı?')}>
                  Yayından kaldır
                </Button>
              )}
              {r.status === 'removed' && (
                <Button variant="secondary" disabled={act.busy} onClick={() => act.run(`/admin/reports/${id}`, { action: 'restore' })}>
                  Geri yükle
                </Button>
              )}
              {me?.role === 'admin' && (
                <Button
                  variant="danger"
                  disabled={act.busy}
                  onClick={() =>
                    act.run(
                      `/admin/reports/${id}`,
                      { action: 'false', note },
                      'Bu yazı YALAN olarak işaretlenecek: yazı kaldırılır, yazar banlanır, yazarın diğer yazıları yeniden incelemeye alınır. Emin misin?',
                    )
                  }
                >
                  Yalan hikaye: yazarı banla
                </Button>
              )}
            </div>
          </Card>

          {revisions.length > 0 && (
            <Card className="space-y-2">
              <h3 className="font-semibold">Önceki sürümler</h3>
              {revisions.map((rev: any) => {
                const snap = JSON.parse(rev.snapshot);
                return (
                  <details key={rev.version} className="text-sm">
                    <summary>
                      v{rev.version} · {formatDate(rev.created_at)}
                    </summary>
                    <p className="mt-2 font-medium">{snap.title}</p>
                    <p className="whitespace-pre-line text-muted">{snap.story}</p>
                  </details>
                );
              })}
            </Card>
          )}
          {reply && (
            <Card className="space-y-2">
              <h3 className="font-semibold">Profil sahibinin yanıtı ({reply.status})</h3>
              <p className="whitespace-pre-line text-sm">{reply.body}</p>
            </Card>
          )}
          {appeals.length > 0 && (
            <Card className="space-y-2">
              <h3 className="font-semibold">İtirazlar</h3>
              {appeals.map((a: any) => (
                <div key={a.id} className="text-sm">
                  <Badge>{a.status}</Badge> <span className="whitespace-pre-line">{a.reason}</span>
                  {a.resolution && <p className="text-muted">Karar: {a.resolution}</p>}
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="space-y-1 text-sm">
            <h3 className="font-semibold">Hakkında yazılan</h3>
            <p className="text-base font-medium">{person.full_name}</p>
            <p className="text-muted">{[person.city, ...JSON.parse(person.roles).map((x: string) => ROLES[x])].filter(Boolean).join(' · ')}</p>
            {person.instagram && <p>{person.instagram}</p>}
            <Badge tone={person.status === 'pending' ? 'warn' : 'neutral'}>{person.status === 'pending' ? 'Yeni kişi (onayla birlikte açılır)' : person.status}</Badge>
            <div className="pt-2">
              <Field label="Başka bir kişiye taşı (kişi ID)">
                <div className="flex gap-2">
                  <Input value={moveTo} onChange={(e) => setMoveTo(e.target.value)} placeholder="per_…" />
                  <Button variant="secondary" onClick={() => act.run(`/admin/reports/${id}`, { action: 'move', personId: moveTo })}>
                    Taşı
                  </Button>
                </div>
              </Field>
            </div>
          </Card>
          <Card className="space-y-1 text-sm">
            <h3 className="font-semibold">Yazar (sadece moderatörler görür)</h3>
            {author.status !== 'approved' && (
              <div className="space-y-2 pb-2">
                <Notice tone="warn">Bu hesap henüz onaylanmadı. Hikayeyi yayınlamadan önce yazarın gerçek biri olduğunu doğrula.</Notice>
                <Button variant="secondary" onClick={() => act.run(`/admin/accounts/${author.id}`, { action: 'approve' }, `${author.name} hesabı onaylansın mı?`).then(d.reload)}>
                  Yazarı onayla
                </Button>
              </div>
            )}
            <p className="text-base font-medium">{author.name}</p>
            <p className="text-muted">{author.email}</p>
            <p>{[author.city, author.dance_since, author.instagram].filter(Boolean).join(' · ')}</p>
            <p>
              Üyelik: {formatDate(author.created_at)} · Güven: {author.trust_score}
            </p>
            <p>
              {author.report_count} yazı, {author.removed_count} kaldırılmış
            </p>
            {author.references_text && <p className="whitespace-pre-line text-muted">Referans: {author.references_text}</p>}
          </Card>
          <Card className="space-y-1 text-sm">
            <h3 className="font-semibold">Oylar</h3>
            {votes.length === 0 ? (
              <p className="text-muted">Oy yok.</p>
            ) : (
              votes.map((v: any) => (
                <p key={`${v.kind}${v.value}`}>
                  {v.kind === 'credible' ? (v.value === 1 ? 'İnandırıcı' : 'İnandırıcı değil') : 'Ben de yaşadım'}: {v.n}{' '}
                  {v.ips < v.n && <Badge tone="accent">{v.ips} farklı IP</Badge>}
                </p>
              ))
            )}
          </Card>
          {flags.length > 0 && (
            <Card className="space-y-1 text-sm">
              <h3 className="font-semibold">Bildirimler</h3>
              {flags.map((f: any, i: number) => (
                <p key={i}>
                  <Badge tone="accent">{f.reason}</Badge> {f.name}: {f.details}
                </p>
              ))}
            </Card>
          )}
          {otherReports.length > 0 && (
            <Card className="space-y-1 text-sm">
              <h3 className="font-semibold">Aynı kişi hakkında diğer yazılar</h3>
              {otherReports.map((o: any) => (
                <p key={o.id}>
                  {o.title} — {o.author_name} <Badge>{REPORT_STATUS[o.status]}</Badge>
                </p>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- accounts
function AccountsTab({ onChange }: { onChange: () => void }) {
  const { me } = useSession();
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const list = useAsync(() => api(`/admin/accounts?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.accounts), [status, q]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatusFilter value={status} onChange={setStatus} options={ACCOUNT_STATUS} />
        <Input placeholder="E-posta veya isim" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      {list.loading ? <Loading /> : !list.data?.length ? <p className="text-sm text-muted">Kayıt yok.</p> : list.data.map((a: any) => <AccountRow key={a.id} a={a} isAdmin={me?.role === 'admin'} onDone={() => (list.reload(), onChange())} />)}
    </div>
  );
}

function AccountRow({ a, isAdmin, onDone }: { a: any; isAdmin: boolean; onDone: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction(onDone);
  const go = (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => act.run(`/admin/accounts/${a.id}`, { action, note, ...extra }, confirmText);
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{a.name}</strong>
        <span className="text-sm text-muted">{a.email}</span>
        <Badge tone={a.status === 'approved' ? 'ok' : a.status === 'pending' ? 'warn' : 'accent'}>{ACCOUNT_STATUS[a.status] ?? a.status}</Badge>
        {a.role !== 'user' && <Badge>{a.role}</Badge>}
        {!a.email_verified && <Badge>e-posta doğrulanmadı</Badge>}
      </div>
      <p className="text-sm">
        {[a.city, a.dance_since, a.instagram].filter(Boolean).join(' · ')} · Kayıt: {formatDate(a.created_at)} · {a.report_count} yazı ({a.removed_count} kaldırılmış)
      </p>
      {a.references_text && <p className="text-sm whitespace-pre-line text-muted">Referans: {a.references_text}</p>}
      {a.status_note && <p className="text-sm text-muted">Not: {a.status_note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Not / gerekçe (kullanıcıya iletilir)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-sm" />
        {a.status !== 'approved' && a.status !== 'banned' && <Button onClick={() => go('approve')}>Onayla</Button>}
        {a.status !== 'approved' && a.status !== 'banned' && (
          <Button variant="secondary" onClick={() => go('needs_info')}>
            Bilgi iste
          </Button>
        )}
        {a.status === 'pending' && (
          <Button variant="secondary" onClick={() => go('reject')}>
            Reddet
          </Button>
        )}
        {a.status === 'banned' ? (
          <Button variant="secondary" onClick={() => go('unban')}>
            Banı kaldır
          </Button>
        ) : (
          <Button variant="danger" onClick={() => go('ban', {}, 'Hesap kapatılsın mı?')}>
            Banla
          </Button>
        )}
        {isAdmin && a.status === 'approved' && (
          <Select value={a.role} onChange={(e) => go('role', { role: e.target.value }, `Rol ${e.target.value} yapılsın mı?`)} className="max-w-40">
            <option value="user">Üye</option>
            <option value="moderator">Moderatör</option>
            <option value="admin">Yönetici</option>
          </Select>
        )}
      </div>
      <ErrorText error={act.error} />
    </Card>
  );
}

// ---------------- persons
function PersonsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const list = useAsync(() => api(`/admin/persons?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.persons), [status, q]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatusFilter value={status} onChange={setStatus} options={{ pending: 'Yeni', active: 'Yayında', hidden: 'Gizli', merged: 'Birleştirilmiş', rejected: 'Reddedilmiş' }} />
        <Input placeholder="İsim ara" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      <p className="text-xs text-muted">Yeni kişiler, ilk hikayeleri onaylandığında otomatik olarak yayına girer. Aynı kişinin kopyalarını birleştir.</p>
      {list.loading ? <Loading /> : !list.data?.length ? <p className="text-sm text-muted">Kayıt yok.</p> : list.data.map((p: any) => <PersonRow key={p.id} p={p} onDone={() => (list.reload(), onChange())} />)}
    </div>
  );
}

function PersonRow({ p, onDone }: { p: any; onDone: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ fullName: p.full_name, city: p.city ?? '', instagram: p.instagram ?? '', roles: JSON.parse(p.roles) as string[] });
  const [alias, setAlias] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const act = useAction(onDone);
  const go = (body: Record<string, unknown>, confirmText?: string) => act.run(`/admin/persons/${p.id}`, body, confirmText);
  const aliases = (JSON.parse(p.aliases ?? '[]') as (string | null)[]).filter(Boolean);
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{p.full_name}</strong>
        <span className="font-mono text-xs text-muted">{p.id}</span>
        <Badge>{p.status}</Badge>
        <span className="text-sm text-muted">
          {p.city} · {p.report_count} yazı {p.claimed_by && '· sahiplenilmiş'}
        </span>
        {p.status === 'active' && (
          <Link className="text-sm underline" to={`/kisi/${p.id}`}>
            Profil
          </Link>
        )}
      </div>
      {aliases.length > 0 && <p className="text-sm text-muted">Takma adlar: {aliases.join(', ')}</p>}
      {edit ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Şehir" />
          <Input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="Instagram" />
          <Button onClick={() => (go({ action: 'edit', ...f }), setEdit(false))}>Kaydet</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setEdit(true)}>
            Düzenle
          </Button>
          <Input placeholder="Takma ad ekle" value={alias} onChange={(e) => setAlias(e.target.value)} className="max-w-44" />
          <Button variant="secondary" onClick={() => go({ action: 'alias', alias })}>
            Ekle
          </Button>
          <Input placeholder="Birleştir: hedef kişi ID" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="max-w-52" />
          <Button variant="secondary" onClick={() => go({ action: 'merge', mergeInto }, 'Bu kişi hedef kişiyle birleştirilsin mi? Tüm yazılar taşınır.')}>
            Birleştir
          </Button>
          {p.status === 'active' && (
            <Button variant="secondary" onClick={() => go({ action: 'hide' }, 'Profil gizlensin mi?')}>
              Gizle
            </Button>
          )}
          {p.status === 'hidden' && (
            <Button variant="secondary" onClick={() => go({ action: 'activate' })}>
              Yayına al
            </Button>
          )}
          {p.status === 'pending' && (
            <Button variant="secondary" onClick={() => go({ action: 'reject' }, 'Kişi kaydı ve bekleyen yazıları reddedilsin mi?')}>
              Reddet
            </Button>
          )}
          {p.claimed_by && (
            <Button variant="ghost" onClick={() => go({ action: 'unclaim' }, 'Sahiplik kaldırılsın mı?')}>
              Sahipliği kaldır
            </Button>
          )}
        </div>
      )}
      <ErrorText error={act.error} />
    </Card>
  );
}

// ---------------- categories
function CategoriesTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/categories').then((r) => r.categories), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const act = useAction(() => (list.reload(), onChange(), setName(''), setDescription('')));
  const active = (list.data ?? []).filter((c: any) => c.status === 'active');
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-2">
        <Field label="Yeni kategori">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Açıklama">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Button onClick={() => act.run('/admin/categories', { name, description })}>Ekle</Button>
      </Card>
      <ErrorText error={act.error} />
      {list.loading ? <Loading /> : (list.data ?? []).map((c: any) => <CategoryRow key={c.id} c={c} active={active} onDone={() => (list.reload(), onChange())} />)}
    </div>
  );
}

function CategoryRow({ c, active, onDone }: { c: any; active: any[]; onDone: () => void }) {
  const [mapTo, setMapTo] = useState('');
  const act = useAction(onDone);
  return (
    <Card className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <strong>{c.name}</strong> <Badge tone={c.status === 'proposed' ? 'warn' : c.status === 'active' ? 'ok' : 'neutral'}>{c.status === 'proposed' ? 'Önerilen' : c.status === 'active' ? 'Aktif' : 'Reddedildi'}</Badge>
        <p className="text-sm text-muted">
          {c.description} · {c.usage} yazıda {c.proposed_by_name && `· öneren: ${c.proposed_by_name}`}
        </p>
      </div>
      {c.status === 'proposed' && (
        <>
          <Button onClick={() => act.run(`/admin/categories/${c.id}`, { action: 'approve' })}>Onayla</Button>
          <Select value={mapTo} onChange={(e) => setMapTo(e.target.value)} className="max-w-48">
            <option value="">Reddet ve şuna eşle…</option>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => act.run(`/admin/categories/${c.id}`, { action: 'reject', mapTo: mapTo || undefined })}>
            Reddet
          </Button>
        </>
      )}
      <ErrorText error={act.error} />
    </Card>
  );
}

// ---------------- replies / appeals / claims / flags / takedowns
function RepliesTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/replies').then((r) => r.replies), []);
  const [note, setNote] = useState('');
  const act = useAction(() => (list.reload(), onChange()));
  if (list.loading) return <Loading />;
  if (!list.data?.length) return <p className="text-sm text-muted">Bekleyen yanıt yok.</p>;
  return (
    <div className="space-y-3">
      <ErrorText error={act.error} />
      {list.data.map((r: any) => (
        <Card key={r.id} className="space-y-2">
          <p className="text-sm text-muted">
            {r.person_name} → "{r.report_title}"
          </p>
          <p className="whitespace-pre-line">{r.body}</p>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Ret gerekçesi" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-sm" />
            <Button onClick={() => act.run(`/admin/replies/${r.id}`, { action: 'approve' })}>Yayınla</Button>
            <Button variant="secondary" onClick={() => act.run(`/admin/replies/${r.id}`, { action: 'reject', note })}>
              Reddet
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AppealsTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/appeals').then((r) => r.appeals), []);
  if (list.loading) return <Loading />;
  if (!list.data?.length) return <p className="text-sm text-muted">Açık itiraz yok.</p>;
  return (
    <div className="space-y-3">
      {list.data.map((a: any) => (
        <AppealRow key={a.id} a={a} onDone={() => (list.reload(), onChange())} />
      ))}
    </div>
  );
}

function AppealRow({ a, onDone }: { a: any; onDone: () => void }) {
  const [resolution, setResolution] = useState('');
  const [summary, setSummary] = useState('');
  const act = useAction(onDone);
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">
        {a.person_name} → "{a.report_title}" · {formatDate(a.created_at)}
      </p>
      <details>
        <summary className="text-sm">Hikaye metni</summary>
        <p className="mt-2 text-sm whitespace-pre-line text-muted">{a.report_story}</p>
      </details>
      <p className="whitespace-pre-line">
        <strong>İtiraz:</strong> {a.reason}
      </p>
      <Textarea placeholder="Karar açıklaması (itiraz edene iletilir)" value={resolution} onChange={(e) => setResolution(e.target.value)} className="min-h-20" />
      <Input placeholder="Yeni ziyaretçi özeti (düzenlendi seçeneği için)" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => act.run(`/admin/appeals/${a.id}`, { action: 'upheld', resolution })}>
          Hikaye geçerli, yayında kalsın
        </Button>
        <Button variant="secondary" onClick={() => act.run(`/admin/appeals/${a.id}`, { action: 'edited', resolution, publicSummary: summary })}>
          Düzenlenerek kalsın
        </Button>
        <Button variant="danger" onClick={() => act.run(`/admin/appeals/${a.id}`, { action: 'removed', resolution }, 'Hikaye yayından kaldırılsın mı?')}>
          İtiraz haklı, kaldır
        </Button>
      </div>
      <ErrorText error={act.error} />
    </Card>
  );
}

function ClaimsTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/claims').then((r) => r.claims), []);
  const act = useAction(() => (list.reload(), onChange()));
  if (list.loading) return <Loading />;
  if (!list.data?.length) return <p className="text-sm text-muted">Bekleyen sahiplenme talebi yok.</p>;
  return (
    <div className="space-y-3">
      <Notice>Onaylamadan önce, kişinin profilde kayıtlı Instagram hesabından yönetime kodu gönderdiğini doğrula.</Notice>
      <ErrorText error={act.error} />
      {list.data.map((c: any) => (
        <Card key={c.id} className="space-y-2">
          <p>
            <strong>{c.person_name}</strong> (profil Instagram: {c.person_instagram ?? '—'}) ← {c.account_name} · {c.account_email} (hesap Instagram: {c.account_instagram ?? '—'})
          </p>
          <p>
            Kod: <strong className="font-mono">{c.code}</strong>
          </p>
          {c.message && <p className="text-sm text-muted">Not: {c.message}</p>}
          <div className="flex gap-2">
            <Button onClick={() => act.run(`/admin/claims/${c.id}`, { action: 'approve' }, 'Kod doğrulandı mı? Profil bu hesaba bağlanacak.')}>Onayla</Button>
            <Button variant="secondary" onClick={() => act.run(`/admin/claims/${c.id}`, { action: 'reject' })}>
              Reddet
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FlagsTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/flags').then((r) => r.flags), []);
  const act = useAction(() => (list.reload(), onChange()));
  if (list.loading) return <Loading />;
  if (!list.data?.length) return <p className="text-sm text-muted">Açık bildirim yok.</p>;
  return (
    <div className="space-y-3">
      <ErrorText error={act.error} />
      {list.data.map((f: any) => (
        <Card key={f.id} className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <Badge tone="accent">{f.reason}</Badge> <span className="text-sm">{f.target_type}: <span className="font-mono">{f.target_id}</span></span>
            <p className="text-sm text-muted">
              {f.account_name}: {f.details}
            </p>
          </div>
          <Button variant="secondary" onClick={() => act.run(`/admin/flags/${f.id}/resolve`, {})}>
            Çözüldü
          </Button>
        </Card>
      ))}
    </div>
  );
}

function TakedownsTab({ onChange }: { onChange: () => void }) {
  const list = useAsync(() => api('/admin/takedowns').then((r) => r.takedowns), []);
  const [resolution, setResolution] = useState('');
  const act = useAction(() => (list.reload(), onChange()));
  if (list.loading) return <Loading />;
  if (!list.data?.length) return <p className="text-sm text-muted">Açık kaldırma talebi yok.</p>;
  return (
    <div className="space-y-3">
      <Notice tone="warn">Kaldırma ve KVKK talepleri yasal süreler içinde (KVKK için 30 gün) yanıtlanmalı. Mahkeme kararı veya erişim engeli kararı varsa ilgili içeriği derhal kaldır.</Notice>
      {list.data.map((t: any) => (
        <Card key={t.id} className="space-y-2">
          <p>
            <strong>{t.name}</strong> · {t.email} · {formatDate(t.created_at)}
          </p>
          {t.url && <p className="text-sm break-all">{t.url}</p>}
          <p className="whitespace-pre-line text-sm">{t.reason}</p>
          <div className="flex gap-2">
            <Input placeholder="Yapılan işlem" value={resolution} onChange={(e) => setResolution(e.target.value)} />
            <Button onClick={() => act.run(`/admin/takedowns/${t.id}/resolve`, { resolution })}>Kapat</Button>
          </div>
        </Card>
      ))}
      <ErrorText error={act.error} />
    </div>
  );
}

function AuditTab() {
  const list = useAsync(() => api('/admin/audit').then((r) => r.entries), []);
  if (list.loading) return <Loading />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            <th className="p-3">Zaman</th>
            <th className="p-3">Kişi</th>
            <th className="p-3">İşlem</th>
            <th className="p-3">Hedef</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((e: any) => (
            <tr key={e.id} className="border-b border-line/60 align-top">
              <td className="p-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString('tr-TR')}</td>
              <td className="p-3">{e.actor_name ?? '—'}</td>
              <td className="p-3 font-mono">{e.action}</td>
              <td className="p-3 font-mono text-xs break-all">
                {e.target_type}:{e.target_id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SettingsTab() {
  const { me } = useSession();
  const s = useAsync(() => api('/admin/settings').then((r) => r.settings), []);
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = useAction(() => setMsg('Kaydedildi.'));
  if (s.loading || !s.data) return <Loading />;
  const v = f ?? s.data;
  const disabled = me?.role !== 'admin';
  return (
    <Card className="max-w-md space-y-3">
      <Field label="Oy vermek için en az hesap yaşı (gün)">
        <Input type="number" min={0} disabled={disabled} value={v.min_account_age_days} onChange={(e) => setF({ ...v, min_account_age_days: e.target.value })} />
      </Field>
      <Field label="Bir üyenin günlük en fazla hikaye sayısı">
        <Input type="number" min={1} disabled={disabled} value={v.daily_report_limit} onChange={(e) => setF({ ...v, daily_report_limit: e.target.value })} />
      </Field>
      {!disabled && (
        <Button onClick={() => act.run('/admin/settings', v).catch(() => {})} className="w-full">
          Kaydet
        </Button>
      )}
      {msg && <p className="text-sm text-ok">{msg}</p>}
      <ErrorText error={act.error} />
    </Card>
  );
}
