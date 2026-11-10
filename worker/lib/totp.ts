const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function hotp(secret: string, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

export async function totpCode(secret: string, at = Date.now()): Promise<string> {
  return hotp(secret, Math.floor(at / 30_000));
}

export async function verifyTotp(secret: string, code: unknown, at = Date.now()): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  const step = Math.floor(at / 30_000);
  for (const drift of [-1, 0, 1]) {
    if ((await hotp(secret, step + drift)) === code.trim()) return true;
  }
  return false;
}

export function otpauthUri(secret: string, label: string): string {
  return `otpauth://totp/${encodeURIComponent(`tangossip:${label}`)}?secret=${secret}&issuer=${encodeURIComponent('tangossip')}`;
}
