import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, errorText } from '../api';
import { Badge, Button, Card, ErrorText, Loading, Notice, Select, Textarea, useAsync } from '../components/ui';
import { FIRSTHAND, formatDate, RECOMMENDATION, ROLES, SCORE_LABEL } from '../labels';
import { useSession } from '../session';
import { topRecommendation, useCategories, type PersonSummary } from './Home';

interface ReportView {
  id: string;
  title: string | null;
  story: string | null;
  summary: string | null;
  incidentDate: string | null;
  location: string | null;
  score: number;
  recommendation: 'deny' | 'caution' | 'allow';
  firsthand: string;
  disputed: boolean;
  categories: string[];
  approvedAt: number;
  votes: { up: number; down: number; corroborations: number; credibility: number } | null;
  myVotes: { kind: string; value: number }[];
  mine: boolean;
  reply: { body: string; at: number } | null;
}

interface PersonView {
  person: PersonSummary & { aliases: string[]; instagram: string | null };
  isSubject: boolean;
  reports: ReportView[];
}

export function Person() {
  const { id } = useParams();
  const { me, isMember } = useSession();
  const view = useAsync(() => api<PersonView>(`/persons/${id}`), [id]);
  const categories = useCategories();
  const catName = (cid: string) => categories.data?.find((c) => c.id === cid)?.name ?? 'Diğer';

  if (view.loading) return <Loading />;
  if (view.error || !view.data) return <Notice tone="accent">{view.error ?? 'Bulunamadı'}</Notice>;
  const { person, reports, isSubject } = view.data;
  const rec = topRecommendation(person.recommendation);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">{person.name}</h1>
            <p className="mt-1 text-muted">
              {[person.city, ...person.roles.map((r) => ROLES[r] ?? r)].filter(Boolean).join(' · ')}
              {person.instagram && ` · ${person.instagram}`}
            </p>
            {person.aliases.length > 0 && <p className="text-sm text-muted">Diğer adları: {person.aliases.join(', ')}</p>}
          </div>
          <Badge tone={rec === 'deny' ? 'accent' : rec === 'caution' ? 'warn' : 'ok'}>{RECOMMENDATION[rec]}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Hikaye" value={person.reportCount} />
          <Stat label="Farklı yazar" value={person.authorCount} />
          <Stat label="Ortalama ciddiyet" value={`${person.avgScore}/5`} />
          <Stat
            label="Milonga tavsiyesi"
            value={`${person.recommendation.deny} / ${person.recommendation.caution} / ${person.recommendation.allow}`}
            hint="alınmasın / dikkat / alınabilir"
          />
        </div>
        {person.masked && (
          <Notice>
            Bu profil ziyaretçilere maskeli gösteriliyor. Tam isim, hikayeler ve oylama için <Link className="underline" to="/kayit">kayıt ol</Link>.
          </Notice>
        )}
        {person.claimed && <Notice tone="ok">Bu profil, kimliği doğrulanmış sahibi tarafından takip ediliyor; yanıtları hikayelerin altında görünür.</Notice>}
        {me && !person.claimed && !isSubject && <ClaimBox personId={person.id} />}
      </section>

      <section className="space-y-4">
        {reports.map((r) => (
          <ReportCard key={r.id} r={r} catName={catName} isMember={isMember} isSubject={isSubject} onChange={view.reload} />
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </Card>
  );
}

function ReportCard({ r, catName, isMember, isSubject, onChange }: { r: ReportView; catName: (id: string) => string; isMember: boolean; isSubject: boolean; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'reply' | 'appeal' | 'flag' | null>(null);
  const myCredible = r.myVotes.find((v) => v.kind === 'credible')?.value ?? 0;
  const myCorroborate = r.myVotes.some((v) => v.kind === 'corroborate');

  async function vote(kind: 'credible' | 'corroborate', value: number) {
    setError(null);
    try {
      await api(`/reports/${r.id}/vote`, { body: { kind, value } });
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {r.categories.map((c) => (
          <Badge key={c}>{catName(c)}</Badge>
        ))}
        <span>Ciddiyet: {r.score}/5 · {SCORE_LABEL[r.score]}</span>
        <span>· {FIRSTHAND[r.firsthand]}</span>
        {r.incidentDate && <span>· Olay: {r.incidentDate}</span>}
        <span>· Yayın: {formatDate(r.approvedAt)}</span>
        {r.disputed && <Badge tone="warn">İtiraz incelemede</Badge>}
        {r.mine && <Badge tone="ok">Senin yazın</Badge>}
      </div>
      {r.title && <h3 className="text-xl font-semibold">{r.title}</h3>}
      {r.story ? (
        <p className="whitespace-pre-line leading-relaxed">{r.story}</p>
      ) : (
        <p className="text-muted italic">{r.summary ?? 'Özet henüz eklenmedi. Hikayenin tamamı üyelere açık.'}</p>
      )}
      {r.location && <p className="text-sm text-muted">Yer: {r.location}</p>}
      <p className="text-sm">
        Yazarın tavsiyesi: <strong>{RECOMMENDATION[r.recommendation]}</strong>
      </p>

      {r.reply && (
        <div className="rounded-md border-l-4 border-ink bg-line/30 p-4">
          <p className="mb-1 text-sm font-semibold text-muted">Profil sahibinin yanıtı</p>
          <p className="whitespace-pre-line text-sm">{r.reply.body}</p>
        </div>
      )}

      {isMember && r.votes && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant={myCredible === 1 ? 'primary' : 'secondary'} disabled={r.mine || isSubject} onClick={() => vote('credible', myCredible === 1 ? 0 : 1)}>
            İnandırıcı · {r.votes.up}
          </Button>
          <Button variant={myCredible === -1 ? 'primary' : 'secondary'} disabled={r.mine || isSubject} onClick={() => vote('credible', myCredible === -1 ? 0 : -1)}>
            İnandırıcı değil · {r.votes.down}
          </Button>
          <Button variant={myCorroborate ? 'primary' : 'secondary'} disabled={r.mine || isSubject} onClick={() => vote('corroborate', myCorroborate ? 0 : 1)} title="Benzer bir şey yaşadım veya şahit oldum">
            Ben de yaşadım / gördüm · {r.votes.corroborations}
          </Button>
          <span className="flex-1" />
          {isSubject ? (
            <>
              <Button variant="ghost" onClick={() => setPanel(panel === 'reply' ? null : 'reply')}>
                {r.reply ? 'Yanıtı düzenle' : 'Yanıt yaz'}
              </Button>
              {!r.disputed && (
                <Button variant="ghost" onClick={() => setPanel(panel === 'appeal' ? null : 'appeal')}>
                  İtiraz et
                </Button>
              )}
            </>
          ) : (
            !r.mine && (
              <Button variant="ghost" onClick={() => setPanel(panel === 'flag' ? null : 'flag')}>
                Bildir
              </Button>
            )
          )}
        </div>
      )}
      {isSubject && !r.votes && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => setPanel('reply')}>
            Yanıt yaz
          </Button>
          {!r.disputed && (
            <Button variant="ghost" onClick={() => setPanel('appeal')}>
              İtiraz et
            </Button>
          )}
        </div>
      )}
      {r.mine && <p className="text-xs text-muted">Kendi yazına oy veremezsin. Yazını <Link className="underline" to="/hesabim">hesabından</Link> düzenleyebilir veya geri çekebilirsin.</p>}
      <ErrorText error={error} />
      {panel === 'reply' && <ReplyForm reportId={r.id} initial={r.reply?.body ?? ''} onDone={() => (setPanel(null), onChange())} />}
      {panel === 'appeal' && <AppealForm reportId={r.id} onDone={() => (setPanel(null), onChange())} />}
      {panel === 'flag' && <FlagForm targetType="report" targetId={r.id} onDone={() => setPanel(null)} />}
    </Card>
  );
}

function ReplyForm({ reportId, initial, onDone }: { reportId: string; initial: string; onDone: () => void }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (sent) return <Notice tone="ok">Yanıtın moderatör onayına gönderildi.</Notice>;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/reports/${reportId}/reply`, { method: 'PUT', body: { body: text } });
          setSent(true);
          setTimeout(onDone, 1500);
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Bu hikayeye yanıtın. Her hikayeye tek bir yanıt yazabilirsin; moderatör onayından sonra yayınlanır." />
      <ErrorText error={error} />
      <Button type="submit">Yanıtı gönder</Button>
    </form>
  );
}

function AppealForm({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/reports/${reportId}/appeal`, { body: { reason: text } });
          onDone();
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <Notice tone="warn">İtiraz moderatörlere gider; inceleme sürerken hikaye "itiraz incelemede" etiketiyle görünür. Varsa kanıtlarını nasıl sunabileceğini yaz.</Notice>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="İtiraz gerekçen" />
      <ErrorText error={error} />
      <Button type="submit" variant="danger">
        İtirazı gönder
      </Button>
    </form>
  );
}

export function FlagForm({ targetType, targetId, onDone }: { targetType: 'report' | 'reply' | 'person'; targetId: string; onDone: () => void }) {
  const [reason, setReason] = useState('false');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (sent) return <Notice tone="ok">Bildirimin moderatörlere iletildi. Teşekkürler.</Notice>;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/flags', { body: { targetType, targetId, reason, details } });
          setSent(true);
          setTimeout(onDone, 1500);
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <Select value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="false">Yalan / yanıltıcı olduğunu düşünüyorum</option>
        <option value="personal_data">Kişisel veri içeriyor (adres, telefon, üçüncü kişi)</option>
        <option value="spam">Spam / alakasız</option>
        <option value="other">Diğer</option>
      </Select>
      <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ayrıntı (isteğe bağlı)" className="min-h-20" />
      <ErrorText error={error} />
      <Button type="submit" variant="secondary">
        Bildir
      </Button>
    </form>
  );
}

function ClaimBox({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button className="text-sm text-muted underline" onClick={() => setOpen(true)}>
        Bu profil benim — sahiplen ve yanıt hakkımı kullan
      </button>
    );
  if (code)
    return (
      <Notice tone="ok">
        Sahiplenme kodun: <strong className="font-mono">{code}</strong>. Bu kodu, profilde görünen Instagram hesabından yönetime mesaj olarak gönder. Moderatör eşleşmeyi
        doğruladığında profil hesabına bağlanır.
      </Notice>
    );
  return (
    <Card className="space-y-3">
      <p className="text-sm">
        Profil sahibi olduğunu doğrulamak için bir kod alacaksın. Onaylandıktan sonra her hikayeye bir yanıt yazabilir ve itiraz açabilirsin. Kimliğine dair yanlış beyan hesabının
        kapatılmasına yol açar.
      </p>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Moderatöre not (isteğe bağlı)" className="min-h-20" />
      <ErrorText error={error} />
      <Button
        onClick={async () => {
          try {
            setCode((await api<{ code: string }>(`/persons/${personId}/claim`, { body: { message } })).code);
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        Kod al
      </Button>
    </Card>
  );
}
