import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { maskName, normalizeName } from '../worker/lib/text';
import { personRank, wilsonLower } from '../worker/lib/ranking';
import { Client, registered, staff, validReport } from './helpers';

describe('text helpers', () => {
  it('masks names without leaking length', () => {
    expect(maskName('Ahmet Yılmaz')).toBe('A*** Y***');
    expect(maskName('İsmail Şahinoğlu')).toBe('İ*** Ş***');
  });
  it('normalizes Turkish characters for search', () => {
    expect(normalizeName('İSMAİL Şahinoğlu')).toBe('ismail sahinoglu');
    expect(normalizeName('Çağrı  Öztürk')).toBe('cagri ozturk');
  });
});

describe('ranking', () => {
  it('two independent authors outrank one heavily upvoted report', () => {
    const one = personRank([{ author_id: 'a', up: 50, down: 0, corroborations: 5 }]);
    const two = personRank([
      { author_id: 'a', up: 0, down: 0, corroborations: 0 },
      { author_id: 'b', up: 0, down: 0, corroborations: 0 },
    ]);
    expect(two).toBeGreaterThan(one);
    expect(wilsonLower(1, 0)).toBeLessThan(wilsonLower(20, 2));
  });
});

describe('access rules', () => {
  it('pending accounts can submit, but the story waits until the author is approved', async () => {
    const u = await registered({ approve: false });
    const res = await u.client.post('/reports', { ...validReport, newPerson: { fullName: 'Bekleyen Kişi', city: 'Ankara' } });
    expect(res.status).toBe(200);
    const admin = await staff('admin');
    const blocked = await admin.client.post(`/admin/reports/${res.json.id}`, { action: 'approve' });
    expect(blocked.json.error).toBe('author_not_approved');
    await admin.client.post(`/admin/accounts/${u.id}`, { action: 'approve' });
    expect((await admin.client.post(`/admin/reports/${res.json.id}`, { action: 'approve' })).status).toBe(200);
  });

  it('a visitor shares a story and opens an account in one step', async () => {
    const visitor = new Client();
    await env.DB.prepare('DELETE FROM throttle').run();
    const res = await visitor.post('/reports', {
      ...validReport,
      personId: 'per_ignored_for_non_members',
      newPerson: { fullName: 'Dışarıdan Kişi', city: 'İzmir' },
      account: { email: `visitor-${Date.now()}@example.com`, password: 'visitor password 1', name: 'Ziyaretçi Kişi' },
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT r.status, a.status AS author_status, p.full_name FROM report r JOIN account a ON a.id = r.author_id JOIN person p ON p.id = r.person_id WHERE r.id = ?')
      .bind(res.json.id)
      .first<{ status: string; author_status: string; full_name: string }>();
    expect(row).toEqual({ status: 'pending', author_status: 'pending', full_name: 'Dışarıdan Kişi' });
    expect((await visitor.get('/auth/me')).json.user.status).toBe('pending');
  });

  it('a visitor without account details is asked to sign in', async () => {
    const res = await new Client().post('/reports', validReport);
    expect(res.json.error).toBe('login_required');
  });

  it('fresh accounts must wait before voting', async () => {
    const u = await registered({ ageDays: 0 });
    const res = await u.client.post('/reports/rep_x/vote', { kind: 'credible', value: 1 });
    expect(res.json.error).toBe('account_too_new');
  });

  it('requires the truthfulness declaration', async () => {
    const u = await registered();
    const res = await u.client.post('/reports', { ...validReport, declaration: false });
    expect(res.json.error).toBe('declaration_required');
  });

  it('staff endpoints need TOTP', async () => {
    const mod = await registered({ role: 'moderator' });
    expect((await mod.client.get('/admin/queues')).json.error).toBe('mfa_required');
    const visitor = new Client();
    expect((await visitor.get('/admin/queues')).status).toBe(401);
  });

  it('a password-only session cannot re-enable TOTP to gain mfa', async () => {
    const u = await staff('moderator');
    const fresh = new (await import('./helpers')).Client();
    const login = await fresh.post('/auth/login', { email: u.email, password: 'correct horse battery' });
    expect(login.json.error).toBe('totp_required');
    const again = await u.client.post('/auth/totp/enable', { code: '000000' });
    expect(again.json.error).toBe('totp_already_enabled');
  });

  it('data export never includes password hash or TOTP secret', async () => {
    const u = await staff('moderator');
    const out = await u.client.get('/me/export');
    expect(JSON.stringify(out.json)).not.toMatch(/pbkdf2|totp_secret|"pw"/);
  });

  it('rejects cross-origin writes', async () => {
    const res = await (await import('cloudflare:test')).SELF.fetch('https://tangossip.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });
});

describe('report lifecycle', () => {
  it('nothing is public until approved; visitors see masked data only', async () => {
    const author = await registered();
    const created = await author.client.post('/reports', validReport);
    expect(created.status).toBe(200);
    const reportId = created.json.id;

    const visitor = new Client();
    const before = await visitor.get('/persons');
    expect(before.json.persons.find((p: any) => p.name.includes('Y***'))).toBeUndefined();

    const admin = await staff('admin');
    const approve = await admin.client.post(`/admin/reports/${reportId}`, { action: 'approve', publicSummary: 'Milongada rıza dışı temas bildirimi.' });
    expect(approve.status).toBe(200);

    const list = await visitor.get('/persons');
    const masked = list.json.persons.find((p: any) => p.name === 'A*** Y***');
    expect(masked).toBeTruthy();
    expect(JSON.stringify(list.json)).not.toContain('Ahmet');
    expect(JSON.stringify(list.json)).not.toContain('@ahmet');

    const profile = await visitor.get(`/persons/${masked.id}`);
    expect(profile.json.reports[0].story).toBeNull();
    expect(profile.json.reports[0].summary).toBe('Milongada rıza dışı temas bildirimi.');
    expect(JSON.stringify(profile.json)).not.toContain(author.id);
    expect((await visitor.get('/persons?q=ahmet')).status).toBe(403);

    const reader = await registered();
    const full = await reader.client.get(`/persons/${masked.id}`);
    expect(full.json.person.name).toBe('Ahmet Yılmaz');
    expect(full.json.reports[0].story).toContain('milongada');
    expect(JSON.stringify(full.json)).not.toContain(author.id);
  });

  it('one vote per member per kind; authors cannot vote on their own report', async () => {
    const author = await registered();
    const { json } = await author.client.post('/reports', { ...validReport, newPerson: { fullName: 'Mehmet Demir', city: 'Ankara' } });
    const admin = await staff('admin');
    await admin.client.post(`/admin/reports/${json.id}`, { action: 'approve' });

    expect((await author.client.post(`/reports/${json.id}/vote`, { kind: 'credible', value: 1 })).json.error).toBe('cannot_vote_own');
    const voter = await registered();
    await voter.client.post(`/reports/${json.id}/vote`, { kind: 'credible', value: 1 });
    await voter.client.post(`/reports/${json.id}/vote`, { kind: 'credible', value: -1 });
    const rows = await env.DB.prepare("SELECT value FROM vote WHERE report_id = ? AND kind = 'credible'").bind(json.id).all<{ value: number }>();
    expect(rows.results).toEqual([{ value: -1 }]);
  });

  it('claimed subject can reply and appeal; appeal marks report disputed', async () => {
    const author = await registered();
    const { json } = await author.client.post('/reports', { ...validReport, newPerson: { fullName: 'Kemal Ak', city: 'İzmir' } });
    const admin = await staff('admin');
    await admin.client.post(`/admin/reports/${json.id}`, { action: 'approve' });
    const report = await env.DB.prepare('SELECT person_id FROM report WHERE id = ?').bind(json.id).first<{ person_id: string }>();

    const subject = await registered();
    const claim = await subject.client.post(`/persons/${report!.person_id}/claim`, { message: 'Benim profilim' });
    expect(claim.json.code).toMatch(/^TG-/);
    const claimRow = await env.DB.prepare('SELECT id FROM claim_request WHERE person_id = ?').bind(report!.person_id).first<{ id: string }>();
    await admin.client.post(`/admin/claims/${claimRow!.id}`, { action: 'approve' });

    expect((await subject.client.put(`/reports/${json.id}/reply`, { body: 'Bu olay anlatıldığı gibi gerçekleşmedi, açıklamam şudur.' })).status).toBe(200);
    expect((await subject.client.post(`/reports/${json.id}/appeal`, { reason: 'Olay tarihinde şehirde değildim, bunu belgeleyebilirim. Lütfen inceleyin.' })).status).toBe(200);
    const status = await env.DB.prepare('SELECT status FROM report WHERE id = ?').bind(json.id).first<{ status: string }>();
    expect(status!.status).toBe('disputed');

    const stranger = await registered();
    expect((await stranger.client.put(`/reports/${json.id}/reply`, { body: 'Ben de yanıt yazmak istiyorum burada uzun uzun.' })).status).toBe(403);
  });

  it('marking a report false bans the author and requeues their other reports', async () => {
    const author = await registered();
    const a = await author.client.post('/reports', { ...validReport, newPerson: { fullName: 'Ali Veli', city: 'Bursa' } });
    const b = await author.client.post('/reports', { ...validReport, newPerson: { fullName: 'Veli Ali', city: 'Bursa' } });
    const admin = await staff('admin');
    await admin.client.post(`/admin/reports/${a.json.id}`, { action: 'approve' });
    await admin.client.post(`/admin/reports/${b.json.id}`, { action: 'approve' });
    await admin.client.post(`/admin/reports/${a.json.id}`, { action: 'false', note: 'Uydurma' });
    const acc = await env.DB.prepare('SELECT status FROM account WHERE id = ?').bind(author.id).first<{ status: string }>();
    expect(acc!.status).toBe('banned');
    const other = await env.DB.prepare('SELECT status FROM report WHERE id = ?').bind(b.json.id).first<{ status: string }>();
    expect(other!.status).toBe('pending');
  });

  it('proposed category becomes active when its report is approved', async () => {
    const author = await registered();
    const { json } = await author.client.post('/reports', {
      ...validReport,
      categoryIds: [],
      newCategory: { name: 'Sahte ders ücreti', description: 'Verilmeyen ders için ücret' },
      newPerson: { fullName: 'Can Er', city: 'Eskişehir' },
    });
    expect(json.ok).toBe(true);
    const cat = await env.DB.prepare("SELECT status FROM category WHERE slug = 'sahte-ders-ucreti'").first<{ status: string }>();
    expect(cat!.status).toBe('proposed');
    const admin = await staff('admin');
    await admin.client.post(`/admin/reports/${json.id}`, { action: 'approve' });
    const after = await env.DB.prepare("SELECT status FROM category WHERE slug = 'sahte-ders-ucreti'").first<{ status: string }>();
    expect(after!.status).toBe('active');
  });
});
