const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fixed-length stars so the mask never leaks how long a name is.
export function maskName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase('tr')}***`)
    .join(' ');
}

export function slugify(value: string): string {
  return normalizeName(value).replace(/ /g, '-').slice(0, 48);
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

const CHECKS: [string, RegExp][] = [
  ['phone', /(\+?90[\s-]?)?\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/],
  ['email', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['address', /\b(mahalles[ıi]|mah\.|sokak|sok\.|cadde(si)?|cad\.|apt\.?|apartman[ıi]|daire|no\s*:\s*\d+)/i],
  ['url', /https?:\/\/\S+/i],
];

/** Moderator hints for personal data in a story; never blocks submission on its own. */
export function contentFlags(...texts: (string | null | undefined)[]): string[] {
  const joined = texts.filter(Boolean).join('\n');
  return CHECKS.filter(([, re]) => re.test(joined)).map(([name]) => name);
}
