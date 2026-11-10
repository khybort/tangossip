import { env, SELF } from 'cloudflare:test';
import { totpCode } from '../worker/lib/totp';

const ORIGIN = 'https://tangossip.test';
const DAY = 24 * 60 * 60 * 1000;

export class Client {
  cookie = '';

  async call(method: string, path: string, data?: unknown) {
    const res = await SELF.fetch(`${ORIGIN}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: this.cookie },
      body: data === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(data),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const json = (await res.json()) as any;
    return { status: res.status, json };
  }

  get(path: string) {
    return this.call('GET', path);
  }
  post(path: string, data?: unknown) {
    return this.call('POST', path, data);
  }
  put(path: string, data?: unknown) {
    return this.call('PUT', path, data);
  }
}

let counter = 0;

export async function registered(opts: { approve?: boolean; ageDays?: number; role?: 'user' | 'moderator' | 'admin' } = {}) {
  await env.DB.prepare('DELETE FROM throttle').run();
  const client = new Client();
  const email = `user${++counter}-${Date.now()}@example.com`;
  const res = await client.post('/auth/register', { email, password: 'correct horse battery', name: `Test Kişi ${counter}` });
  if (res.status !== 200) throw new Error(JSON.stringify(res.json));
  const row = await env.DB.prepare('SELECT id FROM account WHERE email = ?').bind(email).first<{ id: string }>();
  const id = row!.id;
  if (opts.approve !== false) {
    await env.DB.prepare("UPDATE account SET status = 'approved', created_at = ?, role = ? WHERE id = ?")
      .bind(Date.now() - (opts.ageDays ?? 10) * DAY, opts.role ?? 'user', id)
      .run();
  }
  return { client, id, email };
}

export async function staff(role: 'moderator' | 'admin' = 'admin') {
  const u = await registered({ role });
  const setup = await u.client.post('/auth/totp/setup');
  await u.client.post('/auth/totp/enable', { code: await totpCode(setup.json.secret) });
  return u;
}

export const validReport = {
  newPerson: { fullName: 'Ahmet Yılmaz', city: 'İstanbul', roles: ['teacher'], instagram: '@ahmet' },
  categoryIds: ['cat_istenmeyen_temas'],
  title: 'Milongada rıza dışı temas',
  story: 'Geçen ay bir milongada dans sırasında defalarca uyarmama rağmen ellerini sırtımdan aşağı indirdi ve beni rahatsız etmeye devam etti. Organizatöre söyledim.',
  incidentDate: '2026-10',
  location: 'Bir milonga, Kadıköy',
  score: 4,
  recommendation: 'caution',
  firsthand: 'experienced',
  declaration: true,
};
