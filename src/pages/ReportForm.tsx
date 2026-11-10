import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../api';
import { Badge, Button, Card, ErrorText, Field, Input, Loading, Notice, Textarea, Turnstile } from '../components/ui';
import { RECOMMENDATION, ROLES, SCORE_LABEL } from '../labels';
import { useSession } from '../session';
import { useCategories } from './Home';

interface LookupPerson {
  id: string;
  name: string;
  city: string | null;
  roles: string[];
}

const DRAFT_KEY = 'tangossip-draft';

const EMPTY = {
  title: '',
  story: '',
  incidentDate: '',
  location: '',
  score: 0,
  recommendation: '',
  firsthand: '',
  categoryIds: [] as string[],
};

export function ReportForm() {
  const { id: editId } = useParams();
  const { me, isMember, loading, refresh } = useSession();
  const navigate = useNavigate();
  const categories = useCategories();
  const [form, setForm] = useState(EMPTY);
  const [person, setPerson] = useState<LookupPerson | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState<{ fullName: string; city: string; instagram: string; roles: string[] } | null>(null);
  const [account, setAccount] = useState({ name: '', email: '', password: '', instagram: '', references: '' });
  const [newCategory, setNewCategory] = useState<{ name: string; description: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupPerson[]>([]);
  const [declaration, setDeclaration] = useState(false);
  const [turnstile, setTurnstile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const onToken = useCallback((t: string) => setTurnstile(t), []);

  useEffect(() => {
    if (!editId) return;
    api(`/me/reports/${editId}`).then(({ report }) => {
      setForm({
        title: report.title,
        story: report.story,
        incidentDate: report.incident_date ?? '',
        location: report.location ?? '',
        score: report.score,
        recommendation: report.entry_recommendation,
        firsthand: report.firsthand,
        categoryIds: report.categories,
      });
      setPersonName(report.person_name);
    });
  }, [editId]);

  // A visitor who has to sign in mid-way should not lose what they wrote.
  useEffect(() => {
    if (editId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (saved) {
        setForm(saved.form ?? EMPTY);
        setNewPerson(saved.newPerson ?? null);
        setNewCategory(saved.newCategory ?? null);
      }
    } catch {
      /* storage unavailable */
    }
  }, [editId]);

  useEffect(() => {
    if (editId || done) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, newPerson, newCategory }));
    } catch {
      /* storage unavailable */
    }
  }, [editId, done, form, newPerson, newCategory]);

  useEffect(() => {
    if (!loading && !isMember && !editId && !newPerson) setNewPerson({ fullName: '', city: '', instagram: '', roles: [] });
  }, [loading, isMember, editId, newPerson]);

  useEffect(() => {
    if (!isMember || editId || query.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api<{ persons: LookupPerson[] }>(`/persons/lookup?q=${encodeURIComponent(query.trim())}`)
        .then((r) => setResults(r.persons))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, editId, isMember]);

  if (loading) return <Loading />;
  if (done)
    return (
      <Card className="space-y-3">
        <h1 className="text-2xl font-semibold">Hikayen bize ulaştı</h1>
        <p>Paylaştığın için teşekkürler. Okuyup yayına hazırladığımızda haber vereceğiz; durumunu <Link className="underline" to="/hesabim">hesabından</Link> takip edebilirsin.</p>
        {done.length > 0 && <Notice tone="warn">Yazında kişisel veri olabilecek ifadeler tespit edildi; moderatör bunları yayından önce çıkarabilir.</Notice>}
      </Card>
    );

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleCategory = (id: string) => set('categoryIds', form.categoryIds.includes(id) ? form.categoryIds.filter((c) => c !== id) : [...form.categoryIds, id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editId) {
        await api(`/reports/${editId}`, { method: 'PUT', body: form });
        navigate('/hesabim');
        return;
      }
      if (!person && !newPerson) throw new Error('Hakkında yazdığın kişiyi seç veya yeni kişi ekle.');
      const res = await api<{ warnings: string[] }>('/reports', {
        body: {
          ...form,
          personId: person?.id,
          newPerson: person ? undefined : newPerson,
          newCategory: newCategory?.name ? newCategory : undefined,
          account: me ? undefined : account,
          declaration,
          turnstile,
        },
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
      if (!me) await refresh();
      setDone(res.warnings);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{editId ? 'Yazını düzenle' : 'Hikayeni paylaş'}</h1>
        <p className="text-sm text-muted">
          Adın hiçbir yerde görünmez. Yazarken üçüncü kişilerin isimlerini, adres ya da telefon bilgisini yazmamaya dikkat et; ayrıntılar için <Link className="underline" to="/kurallar">kurallarımıza</Link> göz at.
          {editId && ' Düzenleme sonrası yazın tekrar incelemeye alınır.'}
        </p>
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">1. Kim hakkında?</h2>
        {editId ? (
          <p>{personName}</p>
        ) : person ? (
          <div className="flex items-center justify-between rounded-md border border-line p-3">
            <span>
              <strong>{person.name}</strong> <span className="text-sm text-muted">{person.city}</span>
            </span>
            <button type="button" className="text-sm underline" onClick={() => setPerson(null)}>
              Değiştir
            </button>
          </div>
        ) : newPerson ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ad soyad *">
                <Input value={newPerson.fullName} onChange={(e) => setNewPerson({ ...newPerson, fullName: e.target.value })} required />
              </Field>
              <Field label="Şehir">
                <Input value={newPerson.city} onChange={(e) => setNewPerson({ ...newPerson, city: e.target.value })} />
              </Field>
              <Field label="Instagram" hint="Kişinin doğru tanınması için; sadece üyelere görünür.">
                <Input value={newPerson.instagram} onChange={(e) => setNewPerson({ ...newPerson, instagram: e.target.value })} placeholder="@kullanici" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ROLES).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={newPerson.roles.includes(k)}
                    onChange={() => setNewPerson({ ...newPerson, roles: newPerson.roles.includes(k) ? newPerson.roles.filter((r) => r !== k) : [...newPerson.roles, k] })}
                  />
                  {label}
                </label>
              ))}
            </div>
            {isMember && (
              <button type="button" className="text-sm underline" onClick={() => setNewPerson(null)}>
                Vazgeç, mevcut kişilerde ara
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya takma ad yaz" />
            {results.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="w-full px-3 py-2 text-left hover:bg-line/40" onClick={() => setPerson(p)}>
                      <strong>{p.name}</strong> <span className="text-sm text-muted">{[p.city, ...p.roles.map((r) => ROLES[r])].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="secondary" onClick={() => setNewPerson({ fullName: query, city: '', instagram: '', roles: [] })}>
              Listede yok, yeni kişi ekle
            </Button>
            <p className="text-xs text-muted">Yeni kişi, yazın ile birlikte moderatör onayından geçer. Aynı kişinin iki kez eklenmemesi için önce aramayı dene.</p>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">2. Ne tür bir olay?</h2>
        <div className="flex flex-wrap gap-2">
          {categories.data?.map((c) => (
            <button
              type="button"
              key={c.id}
              title={c.description ?? ''}
              onClick={() => toggleCategory(c.id)}
              className={`rounded-full border px-3 py-1 text-sm ${form.categoryIds.includes(c.id) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {!editId &&
          (newCategory ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Yeni kategori adı">
                <Input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
              </Field>
              <Field label="Kısa açıklama">
                <Input value={newCategory.description} onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })} />
              </Field>
              <p className="text-xs text-muted sm:col-span-2">Önerdiğin kategori moderatör onayından sonra herkesin seçebileceği listeye eklenir.</p>
            </div>
          ) : (
            <button type="button" className="text-sm underline" onClick={() => setNewCategory({ name: '', description: '' })}>
              Uygun kategori yok, yeni kategori öner
            </button>
          ))}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">3. Hikayen</h2>
        <Field label="Başlık *">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={160} required />
        </Field>
        <Field label="Ne oldu? *" hint={`${form.story.length} karakter · en az 80. Üçüncü kişilerin isimlerini, adres veya telefon bilgisini yazma.`}>
          <Textarea value={form.story} onChange={(e) => set('story', e.target.value)} className="min-h-56" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ne zaman?" hint="Yaklaşık olabilir: 2024 yazı, Mart 2025…">
            <Input value={form.incidentDate} onChange={(e) => set('incidentDate', e.target.value)} />
          </Field>
          <Field label="Nerede?" hint="Etkinlik, milonga veya şehir.">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Olayla ilişkin *</span>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="firsthand" checked={form.firsthand === 'experienced'} onChange={() => set('firsthand', 'experienced')} /> Bizzat yaşadım
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="firsthand" checked={form.firsthand === 'witnessed'} onChange={() => set('firsthand', 'witnessed')} /> Şahit oldum
            </label>
          </div>
          <p className="text-xs text-muted">Duyduğun ama yaşamadığın veya görmediğin olaylar kabul edilmez.</p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">4. Değerlendirmen</h2>
        <div className="space-y-2">
          <span className="text-sm font-medium">Ciddiyet *</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => set('score', n)}
                className={`rounded-md border px-3 py-2 text-sm ${form.score === n ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
              >
                {n} · {SCORE_LABEL[n]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Dans gecelerine alınmalı mı? *</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(RECOMMENDATION).map(([k, label]) => (
              <button
                type="button"
                key={k}
                onClick={() => set('recommendation', k)}
                className={`rounded-md border px-3 py-2 text-sm ${form.recommendation === k ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {!editId && !me && (
        <Card className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">5. Seni tanıyalım</h2>
            <p className="text-sm text-muted">
              Burada herkes gerçek biri. Bu bilgiler sadece bizde kalır, yazının yanında hiçbir zaman görünmez. Zaten hesabın varsa{' '}
              <Link className="underline" to="/giris">giriş yap</Link>; yazdıkların kaybolmaz.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ad soyad *">
              <Input value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} autoComplete="name" required />
            </Field>
            <Field label="E-posta *">
              <Input type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} autoComplete="email" required />
            </Field>
            <Field label="Şifre *" hint="En az 10 karakter. Hikayeni sonra takip etmek için.">
              <Input type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Instagram">
              <Input value={account.instagram} onChange={(e) => setAccount({ ...account, instagram: e.target.value })} placeholder="@kullanici" />
            </Field>
          </div>
          <Field label="Seni tanıyan biri ya da gittiğin milongalar" hint="Gerçek biri olduğunu anlamamıza yardım eder.">
            <Textarea value={account.references} onChange={(e) => setAccount({ ...account, references: e.target.value })} className="min-h-20" />
          </Field>
        </Card>
      )}

      {!editId && (
        <Card className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
            <span>
              Yazdıklarımın bildiğim kadarıyla doğru olduğunu, olayı bizzat yaşadığımı veya gördüğümü beyan ederim. Bilerek yanlış bilgi vermenin hesabımın kapatılmasına ve
              hukuki sorumluluğa yol açabileceğini biliyorum.
            </span>
          </label>
          <Turnstile onToken={onToken} />
        </Card>
      )}

      {form.categoryIds.length === 0 && !newCategory?.name && <Badge tone="warn">En az bir kategori seç</Badge>}
      <ErrorText error={error} />
      <Button type="submit" disabled={busy || (!editId && !declaration)} className="w-full py-3">
        {busy ? 'Gönderiliyor…' : editId ? 'Değişiklikleri gönder' : 'Hikayemi gönder'}
      </Button>
    </form>
  );
}
