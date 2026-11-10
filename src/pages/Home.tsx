import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Badge, Card, Input, Loading, Notice, Select, useAsync } from '../components/ui';
import { RECOMMENDATION, ROLES } from '../labels';
import { useSession } from '../session';

export interface PersonSummary {
  id: string;
  name: string;
  masked: boolean;
  city: string | null;
  roles: string[];
  claimed: boolean;
  reportCount: number;
  authorCount: number;
  avgScore: number;
  recommendation: Record<'deny' | 'caution' | 'allow', number>;
  categories: Record<string, number>;
  disputed: boolean;
  lastReportAt: number | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export function useCategories() {
  return useAsync(() => api<{ categories: Category[] }>('/categories').then((r) => r.categories), []);
}

export function topRecommendation(rec: PersonSummary['recommendation']): 'deny' | 'caution' | 'allow' {
  return (Object.entries(rec).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'caution') as 'deny' | 'caution' | 'allow';
}

export function Home() {
  const { isMember, me } = useSession();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState('rank');
  const categories = useCategories();
  const params = new URLSearchParams({ sort, ...(category && { category }), ...(city && { city }), ...(q.trim().length > 1 && isMember && { q: q.trim() }) });
  const list = useAsync(() => api<{ persons: PersonSummary[]; cities: string[] }>(`/persons?${params}`), [params.toString()]);
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Unutulmasın.</h1>
        <p className="max-w-2xl text-muted">
          Tango camiasında taciz eden, çalan ya da konumunu kötüye kullanan kişiler hakkında üyelerimizin anlattıkları. Anlatanların adı görünmez; hakkında yazılan herkesin
          cevap verme ve itiraz etme hakkı var.
        </p>
        {!me && (
          <Notice>
            Üye olmayanlar isimleri maskeli görür. Tam isimleri ve hikayeleri okumak için <Link className="underline" to="/kayit">üye ol</Link>.
          </Notice>
        )}
        {me && !isMember && <Notice tone="warn">Hesabın onay bekliyor. Onaylanınca tam isimleri ve hikayeleri görebileceksin.</Notice>}
      </section>

      <section className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div>
          <Input
            placeholder={isMember ? 'İsim veya takma ad ara' : 'İsimle arama sadece üyelere açık'}
            disabled={!isMember}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
          <option value="">Tüm kategoriler</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Şehir">
          <option value="">Tüm şehirler</option>
          {list.data?.cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
          <option value="rank">En çok anlatılan</option>
          <option value="recent">Son onaylanan</option>
        </Select>
      </section>

      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <Notice tone="accent">{list.error}</Notice>
      ) : !list.data?.persons.length ? (
        <p className="py-10 text-center text-muted">Henüz yayınlanmış bir hikaye yok.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.data.persons.map((p) => {
            const rec = topRecommendation(p.recommendation);
            return (
              <li key={p.id}>
                <Link to={`/kisi/${p.id}`} className="block h-full">
                  <Card className="h-full space-y-3 transition hover:border-ink">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">{p.name}</h2>
                        <p className="text-sm text-muted">
                          {[p.city, ...p.roles.map((r) => ROLES[r] ?? r)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Badge tone={rec === 'deny' ? 'accent' : rec === 'caution' ? 'warn' : 'ok'}>{RECOMMENDATION[rec]}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(p.categories)
                        .sort((a, b) => b[1] - a[1])
                        .map(([id, n]) => (
                          <Badge key={id}>
                            {catName(id)}
                            {n > 1 && ` ×${n}`}
                          </Badge>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
                      <span>{p.reportCount} hikaye</span>
                      <span>{p.authorCount} farklı kişi</span>
                      <span>Ciddiyet {p.avgScore}/5</span>
                      {p.disputed && <Badge tone="warn">İtiraz var</Badge>}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
