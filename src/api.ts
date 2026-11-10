const MESSAGES: Record<string, string> = {
  login_required: 'Bu işlem için giriş yapmalısın.',
  not_approved: 'Hesabın henüz onaylanmadı.',
  forbidden: 'Bu işlem için yetkin yok.',
  mfa_required: 'Yönetim paneli için iki adımlı doğrulama gerekli.',
  bad_credentials: 'E-posta veya şifre hatalı.',
  totp_required: 'Doğrulama uygulamandaki 6 haneli kodu gir.',
  bad_totp: 'Doğrulama kodu hatalı.',
  banned: 'Bu hesap kapatıldı.',
  bad_email: 'Geçerli bir e-posta adresi gir.',
  weak_password: 'Şifre en az 10 karakter olmalı ve e-postan olmamalı.',
  full_name_required: 'Ad ve soyadını tam yaz.',
  email_taken: 'Bu e-posta ile zaten bir hesap var.',
  rate_limited: 'Çok fazla deneme yaptın, biraz bekle.',
  bad_token: 'Bağlantı geçersiz veya süresi dolmuş.',
  account_too_new: 'Hesabın yeni; oy vermek için birkaç gün beklemelisin.',
  declaration_required: 'Beyanı onaylamadan gönderemezsin.',
  title_required: 'Başlık gerekli.',
  story_too_short: 'Hikaye en az 80 karakter olmalı.',
  bad_score: 'Ciddiyet puanı seç.',
  bad_recommendation: 'Milonga tavsiyesi seç.',
  firsthand_required: 'Olayı yaşadın mı, şahit mi oldun? Seç.',
  category_required: 'En az bir kategori seç veya yeni kategori öner.',
  person_full_name_required: 'Kişinin ad ve soyadını tam yaz.',
  unknown_person: 'Kişi bulunamadı.',
  cannot_report_self: 'Kendin hakkında hikaye paylaşamazsın.',
  cannot_vote_own: 'Kendi yazına veya kendi hakkındaki yazıya oy veremezsin.',
  not_editable: 'Bu yazı artık düzenlenemez.',
  reply_too_short: 'Yanıt en az 20 karakter olmalı.',
  appeal_too_short: 'İtiraz gerekçesi en az 40 karakter olmalı.',
  appeal_open: 'Bu yazı için açık bir itirazın zaten var.',
  not_subject: 'Bu işlem sadece profil sahibi içindir.',
  already_claimed: 'Bu profil zaten sahiplenilmiş.',
  members_only_search: 'İsimle arama sadece onaylı üyelere açık.',
  turnstile_required: 'Robot doğrulamasını tamamla.',
  turnstile_failed: 'Robot doğrulaması başarısız, tekrar dene.',
  feedback_required: 'Yazara iletilecek gerekçeyi yaz.',
  note_required: 'Not gerekli.',
  resolution_required: 'Karar açıklaması gerekli.',
  missing_fields: 'Zorunlu alanları doldur.',
  not_found: 'Bulunamadı.',
  author_not_approved: 'Önce yazarın hesabını onayla.',
  server_error: 'Sunucu hatası, tekrar dene.',
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public data: Record<string, unknown>,
  ) {
    super(MESSAGES[code] ?? code);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    credentials: 'same-origin',
  });
  const data: any = await res.json().catch(() => ({ error: 'server_error' }));
  if (!res.ok) throw new ApiError(data.error ?? 'server_error', res.status, data);
  return data as T;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Beklenmeyen hata.';
}
