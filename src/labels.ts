export const RECOMMENDATION: Record<string, string> = {
  deny: 'Milongalara alınmamalı',
  caution: 'Dikkatli olunmalı',
  allow: 'Alınabilir',
};

export const FIRSTHAND: Record<string, string> = {
  experienced: 'Bizzat yaşadım',
  witnessed: 'Şahit oldum',
};

export const ROLES: Record<string, string> = {
  dancer: 'Dansçı',
  teacher: 'Öğretmen',
  dj: 'DJ',
  organizer: 'Organizatör',
  other: 'Diğer',
};

export const REPORT_STATUS: Record<string, string> = {
  pending: 'İncelemede',
  needs_info: 'Ek bilgi istendi',
  approved: 'Yayında',
  rejected: 'Reddedildi',
  withdrawn: 'Geri çekildi',
  disputed: 'İtiraz edildi',
  removed: 'Kaldırıldı',
};

export const ACCOUNT_STATUS: Record<string, string> = {
  pending: 'Onay bekliyor',
  needs_info: 'Ek bilgi istendi',
  approved: 'Onaylı üye',
  rejected: 'Reddedildi',
  banned: 'Kapatıldı',
};

export const CONTENT_FLAGS: Record<string, string> = {
  phone: 'Telefon numarası olabilir',
  email: 'E-posta adresi olabilir',
  address: 'Adres bilgisi olabilir',
  url: 'Bağlantı içeriyor',
};

export const SCORE_LABEL = ['', 'Hafif', 'Rahatsız edici', 'Ciddi', 'Çok ciddi', 'Ağır'];

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
