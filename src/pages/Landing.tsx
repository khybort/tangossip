import { Link } from 'react-router';
import { api } from '../api';
import { useAsync } from '../components/ui';
import { useCategories } from './Home';

const COUPLES = 12;

function Ronda() {
  return (
    <div className="ronda" aria-hidden="true">
      <div className="ronda-floor" />
      <div className="ronda-track">
        {Array.from({ length: COUPLES }, (_, i) => (
          <span key={i} className="ronda-couple" style={{ '--i': i, '--n': COUPLES } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { title: 'Yaşadığını anlat', text: 'Ne oldu, ne zaman, nerede. Ne kadar ciddi olduğunu ve bu kişinin milongalara alınıp alınmaması gerektiğini sen söyle.' },
  { title: 'Kendini tanıt', text: 'Burada herkes gerçek adıyla. Adın sadece bizde kalır; tango camiasından biri olduğunu görmemiz yeterli.' },
  { title: 'Kişinin sayfasına eklenir', text: 'Adres, telefon gibi kişisel bilgiler ayıklanır, yazın o kişinin sayfasında yerini alır. Senin adın görünmez.' },
  { title: 'Başkaları da söz alır', text: 'Tek bir hikaye bir iddiadır. Aynı kişiyi beş farklı insan anlatıyorsa, o artık bir örüntüdür.' },
];

export function Landing() {
  const stats = useAsync(() => api<{ persons: number; reports: number; members: number }>('/stats'), []);
  const categories = useCategories();

  return (
    <div className="landing">
      <section className="bg-salon text-salon-ink">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 md:grid-cols-[1.1fr_1fr] md:pt-20 md:pb-24">
          <div className="space-y-7">
            <h1 className="text-[2.75rem] leading-[1.02] font-bold tracking-[-0.02em] sm:text-6xl lg:text-7xl">Pist hepimizin.</h1>
            <p className="max-w-xl text-lg leading-relaxed text-salon-ink/80 sm:text-xl">
              Kimin dans ederken elinin sırttan aşağı kaydığını, kimin öğrencilerine gece yarısı mesaj attığını, kimin "hayır"ı duymazdan geldiğini çoğumuz biliyoruz. Kimin
              hırsızlık yaptığını da. Ama hep kulaktan kulağa anlattık. Burası, anlatılanlar unutulmasın diye var.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/kisiler" className="rounded-full bg-salon-ink px-6 py-3 text-sm font-semibold text-salon transition hover:bg-white">
                Kayıtlara göz at
              </Link>
              <Link to="/paylas" className="rounded-full border border-salon-ink/40 px-6 py-3 text-sm font-semibold transition hover:border-salon-ink">
                Hikayeni paylaş
              </Link>
            </div>
            {stats.data && stats.data.reports > 0 && (
              <p className="text-sm text-salon-ink/60">
                Şimdiye kadar {stats.data.persons} kişi hakkında {stats.data.reports} hikaye anlatıldı.
              </p>
            )}
          </div>
          <Ronda />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
          <h2 className="text-3xl leading-tight font-bold sm:text-4xl">Ronda, herkes kurala uyduğunda döner.</h2>
          <div className="space-y-5 font-display text-xl leading-[1.65] text-ink/85">
            <p>
              Bir milongada herkes aynı yöne akar. Biri çarpıp geçince, birine dokunmaması gereken yerden dokununca o akış bozulur. Çoğu zaman kimse bir şey demez. Olay
              birkaç sohbette konuşulur, sonra unutulur. Aynı kişi bir sonraki festivalde, onu hiç duymamış biriyle dans eder.
            </p>
            <p>
              Biz artık unutmak istemiyoruz. Kimseyi linç etmek için değil; ilk milongasına gelen biri de yıllardır dans edenlerin bildiğini bilebilsin, organizatörler kimi
              kapıdan içeri alacağına bakarak karar verebilsin diye.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
          <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">Nasıl çalışıyor?</h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step relative space-y-3">
                <span className="grid size-11 place-items-center rounded-full bg-ink font-display text-lg font-bold text-paper">{i + 1}</span>
                <p className="text-lg font-semibold">{s.title}</p>
                <p className="text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">Haksızlığa da yer yok.</h2>
        <p className="mt-4 max-w-2xl text-muted">
          Böyle bir yer kötü niyetle kullanılırsa masum birinin hayatını karartabilir. O yüzden hem anlatanı hem de hakkında anlatılanı düşündük.
        </p>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-line md:grid-cols-2">
          <div className="space-y-4 bg-paper p-8 md:p-10">
            <p className="font-display text-2xl font-bold">Anlatıyorsan</p>
            <p className="leading-relaxed">
              Adın hiçbir yerde görünmez. Adresin, telefonun, o gece yanında olan arkadaşının adı da. Benzer bir şey yaşayanlar yazının altında "ben de" diyerek yanında
              durabilir.
            </p>
          </div>
          <div className="space-y-4 bg-paper p-8 md:p-10">
            <p className="font-display text-2xl font-bold">Hakkında yazıldıysa</p>
            <p className="leading-relaxed">
              Üye olmayan biri adını tam göremez, sadece kısa bir özet okur. Sayfanı sahiplenip her yazıya cevap verebilir, itiraz edebilirsin. Bile bile yalan yazanın hesabı
              kapanır, yazdığı her şey yeniden okunur.
            </p>
          </div>
        </div>
      </section>

      {categories.data && categories.data.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
          <div className="grid gap-8 md:grid-cols-[1fr_2fr] md:items-start">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold sm:text-4xl">Sadece taciz değil.</h2>
              <p className="text-muted">Para meselesi, güvenin kötüye kullanılması, ısrarla peşinden gelmek… Aklındaki şey listede yoksa yazarken yenisini ekleyebilirsin.</p>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {categories.data.map((c) => (
                <li key={c.id} title={c.description ?? ''} className="rounded-full border border-line bg-card px-4 py-2 text-sm">
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-salon text-salon-ink">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.4fr_1fr] md:items-center md:py-20">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold sm:text-5xl">Unutmayalım, unutturmayalım.</h2>
            <p className="max-w-xl text-salon-ink/75">Bir şey yaşadıysan anlatmak için üye olmayı beklemene gerek yok. Formu doldur, gerisini biz hallederiz.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/paylas" className="rounded-full bg-salon-ink px-6 py-3 text-sm font-semibold text-salon transition hover:bg-white">
                Hikayeni paylaş
              </Link>
              <Link to="/kurallar" className="rounded-full border border-salon-ink/40 px-6 py-3 text-sm font-semibold transition hover:border-salon-ink">
                Kurallarımız
              </Link>
            </div>
          </div>
          <p className="rounded-2xl border border-salon-ink/20 p-6 text-sm leading-relaxed text-salon-ink/80">
            Burası bir şikayet hattı değil. Tehlikedeysen 112'yi ara, savcılığa ya da polise gitmekten çekinme.
          </p>
        </div>
      </section>
    </div>
  );
}
