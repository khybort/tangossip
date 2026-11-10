import { useCallback, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import { Button, Card, ErrorText, Field, Input, Notice, Textarea, Turnstile } from '../components/ui';

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </article>
  );
}

export function Rules() {
  return (
    <Doc title="İçerik kuralları">
      <p>
        tangossip, tango camiasında zarar görmüş kişilerin sesini duyurmak ve toplulukları uyarmak için var. Bu güç kötüye kullanılırsa masum insanlara zarar verir. Bu yüzden
        kurallar katıdır ve her yazı yayından önce moderatörlerce tek tek incelenir.
      </p>
      <h2>Yazabileceklerin</h2>
      <ul>
        <li>Bizzat yaşadığın veya gözünle gördüğün olaylar. Duyduğun, başkasından aktarılan olaylar kabul edilmez.</li>
        <li>Olayın ne olduğu, yaklaşık ne zaman ve nerede olduğu; kişinin davranışı ve sende bıraktığı etki.</li>
        <li>Mümkün olduğunca somut, abartısız ve tarafsız bir anlatım.</li>
      </ul>
      <h2>Yazamayacakların</h2>
      <ul>
        <li>Bilerek yanlış veya çarpıtılmış bilgi. Tespit edilirse yazı kaldırılır, hesabın kapatılır ve diğer yazıların yeniden incelenir.</li>
        <li>Kişinin ev/iş adresi, telefonu, ailesi, sağlık durumu, cinsel yönelimi gibi olayla ilgisiz özel bilgiler.</li>
        <li>Mağdur veya tanık olan üçüncü kişilerin isimleri (kendi rızaları olsa bile).</li>
        <li>Hakaret, küfür, tehdit veya kişiye yönelik şiddet çağrısı.</li>
        <li>Kişisel husumet, iş rekabeti veya ilişki bitiminden kaynaklanan intikam amaçlı içerik.</li>
      </ul>
      <h2>Moderasyon</h2>
      <ul>
        <li>Her hesap ve her yazı moderatör onayından geçer. Moderatör ek bilgi isteyebilir, yazıyı düzenletebilir veya reddedebilir.</li>
        <li>Ziyaretçiler isimleri maskeli, hikayeleri ise yalnızca moderatörün yazdığı tarafsız bir özet olarak görür.</li>
        <li>Yazarlar herkese anonimdir; kimlikleri yalnızca moderatörlerce bilinir ve yasal zorunluluk olmadıkça kimseyle paylaşılmaz.</li>
        <li>Hakkında yazılan kişi profilini sahiplenip her yazıya bir yanıt yazabilir ve itiraz edebilir. İtiraz incelenirken yazı "itiraz edildi" etiketiyle görünür.</li>
        <li>Üyeler, yalan veya kişisel veri içerdiğini düşündükleri yazıları bildirebilir.</li>
      </ul>
      <h2>Acil durumlar</h2>
      <p>Bu site bir şikayet mercii değildir. Suç teşkil eden bir olay yaşadıysan veya tehlikedeysen 112'yi ara, savcılığa veya kolluğa başvur.</p>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc title="Kullanım şartları">
      <Notice tone="warn">Bu metin bir taslaktır ve yayına almadan önce bir hukukçu tarafından gözden geçirilmelidir.</Notice>
      <p>Siteyi kullanarak aşağıdaki şartları kabul etmiş olursun.</p>
      <h2>Hesap</h2>
      <ul>
        <li>Hesabını yalnızca gerçek kimliğinle açabilirsin. Sahte, ikinci veya başkası adına hesap açmak yasaktır.</li>
        <li>Hesabın moderatör onayıyla aktif olur; yönetim bir başvuruyu gerekçe göstermeden reddedebilir.</li>
      </ul>
      <h2>İçerik sorumluluğu</h2>
      <ul>
        <li>Yazdığın içerikten hukuken sen sorumlusun. Yayınlanmadan önce yaptığın doğruluk beyanı kayıt altına alınır.</li>
        <li>Yönetim, içerik kurallarına aykırı gördüğü içeriği uyarı yapmaksızın düzenleyebilir, yayından kaldırabilir.</li>
        <li>Mahkeme kararı veya yetkili makam talebi halinde içerik kaldırılır ve yasal yükümlülükler çerçevesinde bilgi paylaşılabilir.</li>
      </ul>
      <h2>Yaptırımlar</h2>
      <p>Kuralları ihlal eden hesaplar kapatılır. Bilerek yalan içerik yayınlayanların tüm yazıları yeniden incelemeye alınır.</p>
      <h2>Kaldırma talepleri</h2>
      <p>Hakkında içerik bulunan herkes "Kaldırma talebi" formu ile başvurabilir; talepler yönetim tarafından incelenir.</p>
    </Doc>
  );
}

export function Kvkk() {
  return (
    <Doc title="KVKK aydınlatma metni">
      <Notice tone="warn">Bu metin bir taslaktır; veri sorumlusu bilgileri doldurulmalı ve bir hukukçu tarafından gözden geçirilmelidir.</Notice>
      <h2>Veri sorumlusu</h2>
      <p>[Veri sorumlusunun adı ve iletişim adresi]</p>
      <h2>İşlenen veriler</h2>
      <ul>
        <li>Üyeler: ad soyad, e-posta, şehir, dans geçmişi, Instagram kullanıcı adı, referans bilgisi, oturum ve güvenlik kayıtları (IP adresinin geri döndürülemez özeti).</li>
        <li>Hakkında içerik bulunan kişiler: ad soyad, şehir, tango camiasındaki rolü, varsa Instagram kullanıcı adı ve onaylı yazılardaki anlatımlar.</li>
      </ul>
      <h2>Amaç ve hukuki sebep</h2>
      <p>
        Veriler; tango topluluğunun güvenliği için deneyim paylaşımına aracılık etmek, kötüye kullanımı önlemek, kullanıcıların gerçek kişi olduğunu doğrulamak ve yasal
        yükümlülükleri yerine getirmek amacıyla, KVKK m.5/2 kapsamında meşru menfaat ve bir hakkın tesisi, kullanılması veya korunması hukuki sebeplerine dayanılarak işlenir.
      </p>
      <h2>Aktarım</h2>
      <p>Veriler altyapı hizmeti alınan Cloudflare (barındırma) ve e-posta gönderimi için Resend ile paylaşılır; bu hizmetler yurt dışında bulunabilir.</p>
      <h2>Haklarınız</h2>
      <p>
        KVKK m.11 kapsamındaki haklarınızı (bilgi talep etme, düzeltme, silme, itiraz) "Kaldırma talebi" formu üzerinden kullanabilirsiniz. Üyeler hesaplarından verilerini
        indirebilir ve hesaplarını silebilir.
      </p>
    </Doc>
  );
}

export function Takedown() {
  const [f, setF] = useState({ name: '', email: '', url: '', reason: '' });
  const [turnstile, setTurnstile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const onToken = useCallback((t: string) => setTurnstile(t), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Doc title="Kaldırma ve KVKK talebi">
      <p>
        Hakkında yanlış veya hukuka aykırı içerik olduğunu düşünüyorsan ya da KVKK kapsamındaki haklarını kullanmak istiyorsan bu formu doldur. Profil sahibiysen, hesabınla
        profili sahiplenerek doğrudan yanıt yazabilir ve itiraz açabilirsin.
      </p>
      {sent ? (
        <Notice tone="ok">Talebin alındı. Yönetim inceleyip e-posta ile dönüş yapacak.</Notice>
      ) : (
        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api('/takedown', { body: { ...f, turnstile } });
                setSent(true);
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            <Field label="Ad soyad *">
              <Input value={f.name} onChange={set('name')} required />
            </Field>
            <Field label="E-posta *">
              <Input type="email" value={f.email} onChange={set('email')} required />
            </Field>
            <Field label="İlgili sayfa bağlantısı">
              <Input value={f.url} onChange={set('url')} />
            </Field>
            <Field label="Talebin ve gerekçen *">
              <Textarea value={f.reason} onChange={set('reason')} required />
            </Field>
            <Turnstile onToken={onToken} />
            <ErrorText error={error} />
            <Button type="submit">Gönder</Button>
          </form>
        </Card>
      )}
    </Doc>
  );
}
