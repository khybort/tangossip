import { Hono } from 'hono';
import type { App, Ctx } from '../env';
import { newId, shortCode } from '../lib/crypto';
import { body, clientIp, DAY_MS, fail } from '../lib/http';
import { audit, checkTurnstile, ipHash, limit, setting } from '../lib/services';
import { isMember, requireAccount, requireMember, requireSeasoned } from '../lib/session';
import { createAccount } from './auth';
import { cleanText, contentFlags, normalizeName, slugify } from '../lib/text';
import { VISIBLE } from './public';

const RECOMMENDATIONS = ['deny', 'caution', 'allow'];
const FIRSTHAND = ['experienced', 'witnessed'];
const ROLES = ['dancer', 'teacher', 'dj', 'organizer', 'other'];

interface ReportInput {
  title: string;
  story: string;
  incidentDate: string | null;
  location: string | null;
  score: number;
  recommendation: string;
  firsthand: string;
  categoryIds: string[];
}

function parseReport(b: Record<string, unknown>): ReportInput {
  const title = cleanText(b.title, 160);
  const story = cleanText(b.story, 20_000);
  const score = Number(b.score);
  if (!title) fail(400, 'title_required');
  if (!story || story.length < 80) fail(400, 'story_too_short');
  if (!Number.isInteger(score) || score < 1 || score > 5) fail(400, 'bad_score');
  if (!RECOMMENDATIONS.includes(String(b.recommendation))) fail(400, 'bad_recommendation');
  if (!FIRSTHAND.includes(String(b.firsthand))) fail(400, 'firsthand_required');
  const categoryIds = Array.isArray(b.categoryIds) ? [...new Set(b.categoryIds.filter((x): x is string => typeof x === 'string'))].slice(0, 6) : [];
  return {
    title,
    story,
    incidentDate: cleanText(b.incidentDate, 40),
    location: cleanText(b.location, 160),
    score,
    recommendation: String(b.recommendation),
    firsthand: String(b.firsthand),
    categoryIds,
  };
}

async function activeCategoryIds(c: Ctx, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { results } = await c.env.DB.prepare(`SELECT id FROM category WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export const member = new Hono<App>();

/** Anyone can share a story; a visitor's account is opened in the same request and both wait for review together. */
member.post('/reports', async (c) => {
  const b = await body(c, 64 * 1024);
  await checkTurnstile(c, b.turnstile);
  if (b.declaration !== true) fail(400, 'declaration_required');
  const input = parseReport(b);
  const np0 = (b.newPerson ?? {}) as Record<string, unknown>;
  if (typeof b.personId !== 'string' && (cleanText(np0.fullName, 120) ?? '').split(/\s+/).length < 2) fail(400, 'person_full_name_required');
  if (!(Array.isArray(b.categoryIds) && b.categoryIds.length) && !cleanText((b.newCategory as Record<string, unknown> | null)?.name, 60)) fail(400, 'category_required');
  if (!c.get('account')) {
    if (!b.account || typeof b.account !== 'object') fail(401, 'login_required');
    await createAccount(c, b.account as Record<string, unknown>);
  }
  const a = requireAccount(c);
  const perDay = await setting(c.env, 'daily_report_limit', 3);
  await limit(c, `report:${a.id}`, perDay, DAY_MS);

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  // Only members can search people, so only they can point at an existing profile; moderators merge duplicates.
  let personId = typeof b.personId === 'string' && isMember(a) ? b.personId : null;
  if (personId) {
    const p = await c.env.DB.prepare("SELECT id, claimed_by FROM person WHERE id = ? AND status IN ('active', 'pending')").bind(personId).first<{ claimed_by: string | null }>();
    if (!p) fail(400, 'unknown_person');
    if (p.claimed_by === a.id) fail(400, 'cannot_report_self');
  } else {
    const np = (b.newPerson ?? {}) as Record<string, unknown>;
    const fullName = cleanText(np.fullName, 120);
    if (!fullName || fullName.split(/\s+/).length < 2) fail(400, 'person_full_name_required');
    const roles = Array.isArray(np.roles) ? np.roles.filter((r): r is string => ROLES.includes(r as string)) : [];
    personId = newId('per');
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO person (id, full_name, normalized_name, city, roles, instagram, status, proposed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(personId, fullName, normalizeName(fullName), cleanText(np.city, 80), JSON.stringify(roles), cleanText(np.instagram, 80), 'pending', a.id, now),
    );
  }

  const categoryIds = await activeCategoryIds(c, input.categoryIds);
  const nc = (b.newCategory ?? null) as Record<string, unknown> | null;
  const ncName = nc ? cleanText(nc.name, 60) : null;
  if (ncName) {
    const slug = slugify(ncName);
    const existing = await c.env.DB.prepare('SELECT id, status FROM category WHERE slug = ?').bind(slug).first<{ id: string; status: string }>();
    if (existing && existing.status !== 'rejected') {
      categoryIds.push(existing.id);
    } else if (!existing) {
      const catId = newId('cat');
      stmts.push(
        c.env.DB.prepare('INSERT INTO category (id, slug, name, description, status, proposed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
          catId,
          slug,
          ncName,
          cleanText(nc!.description, 300),
          'proposed',
          a.id,
          now,
        ),
      );
      categoryIds.push(catId);
    }
  }
  if (!categoryIds.length) fail(400, 'category_required');

  const id = newId('rep');
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO report (id, person_id, author_id, title, story, incident_date, location, score, entry_recommendation, firsthand,
         declaration_at, content_flags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(
      id,
      personId,
      a.id,
      input.title,
      input.story,
      input.incidentDate,
      input.location,
      input.score,
      input.recommendation,
      input.firsthand,
      now,
      JSON.stringify(contentFlags(input.title, input.story, input.location)),
      now,
      now,
    ),
    ...[...new Set(categoryIds)].map((cat) => c.env.DB.prepare('INSERT INTO report_category (report_id, category_id) VALUES (?, ?)').bind(id, cat)),
  );
  await c.env.DB.batch(stmts);
  await audit(c, 'report.create', 'report', id, { personId });
  return c.json({ ok: true, id, warnings: contentFlags(input.title, input.story, input.location) });
});

member.get('/me/reports', async (c) => {
  const a = requireAccount(c);
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.title, r.status, r.author_feedback, r.created_at, r.updated_at, r.person_id, p.full_name AS person_name, p.status AS person_status
     FROM report r JOIN person p ON p.id = r.person_id WHERE r.author_id = ? ORDER BY r.created_at DESC`,
  )
    .bind(a.id)
    .all();
  return c.json({ reports: results });
});

member.get('/me/reports/:id', async (c) => {
  const a = requireAccount(c);
  const r = await c.env.DB.prepare(
    `SELECT r.*, (SELECT json_group_array(category_id) FROM report_category WHERE report_id = r.id) AS categories, p.full_name AS person_name
     FROM report r JOIN person p ON p.id = r.person_id WHERE r.id = ? AND r.author_id = ?`,
  )
    .bind(c.req.param('id'), a.id)
    .first<Record<string, unknown> & { categories: string }>();
  if (!r) fail(404, 'not_found');
  const { moderator_note: _hidden, ...rest } = r;
  return c.json({ report: { ...rest, categories: JSON.parse(r.categories) } });
});

/** Any edit sends the report back to the queue; the previous text is kept as a revision. */
member.put('/reports/:id', async (c) => {
  const a = requireAccount(c);
  const id = c.req.param('id');
  const old = await c.env.DB.prepare(
    `SELECT r.*, (SELECT json_group_array(category_id) FROM report_category WHERE report_id = r.id) AS categories FROM report r WHERE id = ? AND author_id = ?`,
  )
    .bind(id, a.id)
    .first<Record<string, unknown> & { status: string; version: number }>();
  if (!old) fail(404, 'not_found');
  if (!['pending', 'needs_info', 'approved'].includes(old.status)) fail(409, 'not_editable');
  const b = await body(c, 64 * 1024);
  const input = parseReport(b);
  const categoryIds = await activeCategoryIds(c, input.categoryIds);
  if (!categoryIds.length) fail(400, 'category_required');
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO report_revision (id, report_id, version, snapshot, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      newId('rev'),
      id,
      old.version,
      JSON.stringify(old),
      a.id,
      now,
    ),
    c.env.DB.prepare(
      `UPDATE report SET title = ?, story = ?, incident_date = ?, location = ?, score = ?, entry_recommendation = ?, firsthand = ?,
         content_flags = ?, status = 'pending', version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(
      input.title,
      input.story,
      input.incidentDate,
      input.location,
      input.score,
      input.recommendation,
      input.firsthand,
      JSON.stringify(contentFlags(input.title, input.story, input.location)),
      now,
      id,
    ),
    c.env.DB.prepare('DELETE FROM report_category WHERE report_id = ?').bind(id),
    ...categoryIds.map((cat) => c.env.DB.prepare('INSERT INTO report_category (report_id, category_id) VALUES (?, ?)').bind(id, cat)),
  ]);
  await audit(c, 'report.edit', 'report', id);
  return c.json({ ok: true });
});

member.post('/reports/:id/withdraw', async (c) => {
  const a = requireAccount(c);
  const id = c.req.param('id');
  const res = await c.env.DB.prepare("UPDATE report SET status = 'withdrawn', updated_at = ? WHERE id = ? AND author_id = ? AND status NOT IN ('removed', 'withdrawn')")
    .bind(Date.now(), id, a.id)
    .run();
  if (!res.meta.changes) fail(404, 'not_found');
  await audit(c, 'report.withdraw', 'report', id);
  return c.json({ ok: true });
});

member.post('/reports/:id/vote', async (c) => {
  const a = await requireSeasoned(c);
  const id = c.req.param('id');
  const b = await body(c);
  const kind = b.kind === 'corroborate' ? 'corroborate' : b.kind === 'credible' ? 'credible' : null;
  if (!kind) fail(400, 'bad_kind');
  await limit(c, `vote:${a.id}`, 60, 60 * 60 * 1000);
  const r = await c.env.DB.prepare(`SELECT author_id, person_id FROM report WHERE id = ? AND status IN ${VISIBLE}`).bind(id).first<{ author_id: string; person_id: string }>();
  if (!r) fail(404, 'not_found');
  if (r.author_id === a.id) fail(400, 'cannot_vote_own');
  const subject = await c.env.DB.prepare('SELECT claimed_by FROM person WHERE id = ?').bind(r.person_id).first<{ claimed_by: string | null }>();
  if (subject?.claimed_by === a.id) fail(400, 'cannot_vote_own');
  if (b.value === null || b.value === 0) {
    await c.env.DB.prepare('DELETE FROM vote WHERE report_id = ? AND account_id = ? AND kind = ?').bind(id, a.id, kind).run();
    return c.json({ ok: true });
  }
  const value = kind === 'corroborate' ? 1 : b.value === -1 ? -1 : 1;
  await c.env.DB.prepare(
    `INSERT INTO vote (report_id, account_id, kind, value, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(report_id, account_id, kind) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
  )
    .bind(id, a.id, kind, value, await ipHash(c), Date.now())
    .run();
  return c.json({ ok: true });
});

member.post('/flags', async (c) => {
  const a = requireMember(c);
  const b = await body(c);
  const targetType = String(b.targetType);
  const reason = String(b.reason);
  if (!['report', 'reply', 'person'].includes(targetType) || typeof b.targetId !== 'string') fail(400, 'bad_target');
  if (!['false', 'personal_data', 'spam', 'other'].includes(reason)) fail(400, 'bad_reason');
  await limit(c, `flag:${a.id}`, 20, DAY_MS);
  await c.env.DB.prepare(
    `INSERT INTO flag (id, target_type, target_id, account_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(target_type, target_id, account_id) DO UPDATE SET reason = excluded.reason, details = excluded.details, status = 'open'`,
  )
    .bind(newId('flg'), targetType, b.targetId, a.id, reason, cleanText(b.details, 1000), Date.now())
    .run();
  return c.json({ ok: true });
});

/** A claim is proven out-of-band: the person sends the code from the Instagram account on their profile, an admin checks it. */
member.post('/persons/:id/claim', async (c) => {
  const a = requireAccount(c);
  const id = c.req.param('id');
  const b = await body(c);
  await limit(c, `claim:${a.id}`, 5, DAY_MS);
  const p = await c.env.DB.prepare("SELECT claimed_by FROM person WHERE id = ? AND status = 'active'").bind(id).first<{ claimed_by: string | null }>();
  if (!p) fail(404, 'not_found');
  if (p.claimed_by) fail(409, 'already_claimed');
  const open = await c.env.DB.prepare("SELECT code FROM claim_request WHERE person_id = ? AND account_id = ? AND status = 'open'").bind(id, a.id).first<{ code: string }>();
  if (open) return c.json({ code: open.code });
  const code = `TG-${shortCode()}`;
  await c.env.DB.prepare('INSERT INTO claim_request (id, person_id, account_id, code, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId('clm'), id, a.id, code, cleanText(b.message, 1000), Date.now())
    .run();
  await audit(c, 'claim.request', 'person', id);
  return c.json({ code });
});

async function subjectReport(c: Ctx, reportId: string) {
  const a = requireAccount(c);
  const r = await c.env.DB.prepare(
    `SELECT r.id, r.status FROM report r JOIN person p ON p.id = r.person_id WHERE r.id = ? AND p.claimed_by = ? AND r.status IN ${VISIBLE}`,
  )
    .bind(reportId, a.id)
    .first<{ id: string; status: string }>();
  if (!r) fail(403, 'not_subject');
  return { a, r };
}

member.put('/reports/:id/reply', async (c) => {
  const { a, r } = await subjectReport(c, c.req.param('id'));
  const b = await body(c);
  const text = cleanText(b.body, 5000);
  if (!text || text.length < 20) fail(400, 'reply_too_short');
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO reply (id, report_id, account_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(report_id) DO UPDATE SET body = excluded.body, status = 'pending', updated_at = excluded.updated_at`,
  )
    .bind(newId('rpl'), r.id, a.id, text, now, now)
    .run();
  await audit(c, 'reply.submit', 'report', r.id);
  return c.json({ ok: true });
});

member.post('/reports/:id/appeal', async (c) => {
  const { a, r } = await subjectReport(c, c.req.param('id'));
  const b = await body(c);
  const reason = cleanText(b.reason, 5000);
  if (!reason || reason.length < 40) fail(400, 'appeal_too_short');
  const open = await c.env.DB.prepare("SELECT 1 FROM appeal WHERE report_id = ? AND status = 'open'").bind(r.id).first();
  if (open) fail(409, 'appeal_open');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO appeal (id, report_id, account_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId('apl'), r.id, a.id, reason, Date.now()),
    c.env.DB.prepare("UPDATE report SET status = 'disputed' WHERE id = ?").bind(r.id),
  ]);
  await audit(c, 'appeal.open', 'report', r.id);
  return c.json({ ok: true });
});

member.get('/me/claims', async (c) => {
  const a = requireAccount(c);
  const { results } = await c.env.DB.prepare(
    'SELECT cr.id, cr.person_id, cr.code, cr.status, cr.created_at, p.full_name FROM claim_request cr JOIN person p ON p.id = cr.person_id WHERE cr.account_id = ? ORDER BY cr.created_at DESC',
  )
    .bind(a.id)
    .all();
  const { results: owned } = await c.env.DB.prepare('SELECT id, full_name FROM person WHERE claimed_by = ?').bind(a.id).all();
  return c.json({ claims: results, owned });
});

member.put('/me/profile', async (c) => {
  const a = requireAccount(c);
  const b = await body(c);
  const name = cleanText(b.name, 120);
  if (!name || name.split(/\s+/).length < 2) fail(400, 'full_name_required');
  const resubmit = a.status === 'needs_info';
  await c.env.DB.prepare(
    `UPDATE account SET name = ?, city = ?, dance_since = ?, instagram = ?, references_text = ?, status = CASE WHEN status = 'needs_info' THEN 'pending' ELSE status END WHERE id = ?`,
  )
    .bind(name, cleanText(b.city, 80), cleanText(b.danceSince, 40), cleanText(b.instagram, 80), cleanText(b.references, 1000), a.id)
    .run();
  if (resubmit) await audit(c, 'account.resubmit', 'account', a.id);
  return c.json({ ok: true });
});

member.get('/me/export', async (c) => {
  const a = requireAccount(c);
  const { results: reports } = await c.env.DB.prepare('SELECT id, person_id, title, story, incident_date, location, score, entry_recommendation, status, created_at FROM report WHERE author_id = ?')
    .bind(a.id)
    .all();
  const { results: votes } = await c.env.DB.prepare('SELECT report_id, kind, value, created_at FROM vote WHERE account_id = ?').bind(a.id).all();
  const { totp_secret: _s, ...profile } = a;
  return c.json({ exportedAt: Date.now(), profile, reports, votes });
});

/** Deletion scrubs personal data but keeps approved reports, which are anonymous to the public anyway. */
member.delete('/me', async (c) => {
  const a = requireAccount(c);
  const tomb = `deleted+${a.id}@invalid`;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE account SET email = ?, name = 'Silinmiş hesap', city = NULL, dance_since = NULL, instagram = NULL, references_text = NULL, pw = '!', totp_secret = NULL, status = 'deleted' WHERE id = ?",
    ).bind(tomb, a.id),
    c.env.DB.prepare('DELETE FROM session WHERE account_id = ?').bind(a.id),
    c.env.DB.prepare("UPDATE report SET status = 'withdrawn' WHERE author_id = ? AND status IN ('pending', 'needs_info')").bind(a.id),
    c.env.DB.prepare('DELETE FROM vote WHERE account_id = ?').bind(a.id),
  ]);
  await audit(c, 'account.delete', 'account', a.id);
  return c.json({ ok: true });
});

member.post('/takedown', async (c) => {
  const b = await body(c);
  await limit(c, `takedown:${clientIp(c)}`, 5, DAY_MS);
  await checkTurnstile(c, b.turnstile);
  const name = cleanText(b.name, 120);
  const email = cleanText(b.email, 254);
  const reason = cleanText(b.reason, 5000);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !reason) fail(400, 'missing_fields');
  await c.env.DB.prepare('INSERT INTO takedown_request (id, name, email, url, reason, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('tkd'), name, email, cleanText(b.url, 500), reason, await ipHash(c), Date.now())
    .run();
  return c.json({ ok: true });
});
