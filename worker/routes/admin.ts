import { Hono } from 'hono';
import type { App } from '../env';
import { newId } from '../lib/crypto';
import { body, fail } from '../lib/http';
import { audit, sendMail } from '../lib/services';
import { requireStaff } from '../lib/session';
import { cleanText, normalizeName, slugify } from '../lib/text';

export const admin = new Hono<App>();

admin.use('*', async (c, next) => {
  requireStaff(c);
  await next();
});

async function emailOf(c: Parameters<typeof requireStaff>[0], accountId: string) {
  const row = await c.env.DB.prepare("SELECT email FROM account WHERE id = ? AND status != 'deleted'").bind(accountId).first<{ email: string }>();
  return row?.email ?? null;
}

admin.get('/queues', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM account WHERE status = 'pending') AS accounts,
      (SELECT COUNT(*) FROM report WHERE status = 'pending') AS reports,
      (SELECT COUNT(*) FROM person WHERE status = 'pending') AS persons,
      (SELECT COUNT(*) FROM category WHERE status = 'proposed') AS categories,
      (SELECT COUNT(*) FROM reply WHERE status = 'pending') AS replies,
      (SELECT COUNT(*) FROM appeal WHERE status = 'open') AS appeals,
      (SELECT COUNT(*) FROM claim_request WHERE status = 'open') AS claims,
      (SELECT COUNT(*) FROM flag WHERE status = 'open') AS flags,
      (SELECT COUNT(*) FROM takedown_request WHERE status = 'open') AS takedowns`,
  ).first();
  return c.json({ queues: row });
});

// ---- accounts
admin.get('/accounts', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const q = c.req.query('q');
  let sql = `SELECT a.id, a.email, a.name, a.city, a.dance_since, a.instagram, a.references_text, a.email_verified, a.role, a.status, a.status_note,
               a.trust_score, a.created_at, a.approved_at,
               (SELECT COUNT(*) FROM report r WHERE r.author_id = a.id) AS report_count,
               (SELECT COUNT(*) FROM report r WHERE r.author_id = a.id AND r.status = 'removed') AS removed_count
             FROM account a WHERE 1 = 1`;
  const params: unknown[] = [];
  if (status !== 'all') {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (a.email LIKE ? OR a.name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY a.created_at DESC LIMIT 200';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ accounts: results });
});

admin.post('/accounts/:id', async (c) => {
  const actor = requireStaff(c);
  const id = c.req.param('id');
  const b = await body(c);
  const note = cleanText(b.note, 1000);
  const target = await c.env.DB.prepare('SELECT id, email, role, status FROM account WHERE id = ?').bind(id).first<{ email: string; role: string; status: string }>();
  if (!target || target.status === 'deleted') fail(404, 'not_found');
  if (id === actor.id) fail(400, 'cannot_moderate_self');
  if (target.role !== 'user' && actor.role !== 'admin') fail(403, 'forbidden');
  const now = Date.now();
  switch (b.action) {
    case 'approve':
      await c.env.DB.prepare("UPDATE account SET status = 'approved', status_note = NULL, approved_by = ?, approved_at = ? WHERE id = ?").bind(actor.id, now, id).run();
      await sendMail(c, target.email, 'tangossip — hesabın onaylandı', ['Hesabın onaylandı. Artık hikayeleri tam olarak okuyabilir ve oy verebilirsin.'], { href: '/', label: 'Siteye git' });
      break;
    case 'needs_info':
      if (!note) fail(400, 'note_required');
      await c.env.DB.prepare("UPDATE account SET status = 'needs_info', status_note = ? WHERE id = ?").bind(note, id).run();
      await sendMail(c, target.email, 'tangossip — hesabın için ek bilgi gerekiyor', [note], { href: '/hesabim', label: 'Profilimi güncelle' });
      break;
    case 'reject':
      await c.env.DB.prepare("UPDATE account SET status = 'rejected', status_note = ? WHERE id = ?").bind(note, id).run();
      await sendMail(c, target.email, 'tangossip — hesap başvurun', ['Hesap başvurun onaylanmadı.', note ?? '']);
      break;
    case 'ban':
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE account SET status = 'banned', status_note = ? WHERE id = ?").bind(note, id),
        c.env.DB.prepare('DELETE FROM session WHERE account_id = ?').bind(id),
      ]);
      break;
    case 'unban':
      await c.env.DB.prepare("UPDATE account SET status = 'approved', status_note = NULL WHERE id = ? AND status = 'banned'").bind(id).run();
      break;
    case 'role': {
      if (actor.role !== 'admin') fail(403, 'forbidden');
      const role = String(b.role);
      if (!['user', 'moderator', 'admin'].includes(role)) fail(400, 'bad_role');
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE account SET role = ? WHERE id = ?').bind(role, id),
        c.env.DB.prepare('UPDATE session SET mfa = 0 WHERE account_id = ?').bind(id),
      ]);
      break;
    }
    default:
      fail(400, 'bad_action');
  }
  await audit(c, `account.${b.action}`, 'account', id, { note, role: b.role });
  return c.json({ ok: true });
});

// ---- reports
admin.get('/reports', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.title, r.status, r.score, r.entry_recommendation, r.content_flags, r.created_at, r.updated_at, r.version,
       p.id AS person_id, p.full_name AS person_name, p.status AS person_status, a.name AS author_name, a.trust_score AS author_trust, a.status AS author_status,
       (SELECT COUNT(*) FROM flag f WHERE f.target_type = 'report' AND f.target_id = r.id AND f.status = 'open') AS open_flags
     FROM report r JOIN person p ON p.id = r.person_id JOIN account a ON a.id = r.author_id
     WHERE (? = 'all' OR r.status = ?) ORDER BY r.created_at ASC LIMIT 200`,
  )
    .bind(status, status)
    .all();
  return c.json({ reports: results });
});

admin.get('/reports/:id', async (c) => {
  const id = c.req.param('id');
  const report = await c.env.DB.prepare(
    `SELECT r.*, (SELECT json_group_array(category_id) FROM report_category WHERE report_id = r.id) AS categories FROM report r WHERE r.id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown> & { categories: string; person_id: string; author_id: string }>();
  if (!report) fail(404, 'not_found');
  const [person, author, revisions, flags, votes, others, replyRow, appeals, categories] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM person WHERE id = ?').bind(report.person_id).first(),
    c.env.DB.prepare(
      `SELECT id, name, email, city, dance_since, instagram, references_text, trust_score, created_at, status,
         (SELECT COUNT(*) FROM report WHERE author_id = account.id) AS report_count,
         (SELECT COUNT(*) FROM report WHERE author_id = account.id AND status = 'removed') AS removed_count
       FROM account WHERE id = ?`,
    )
      .bind(report.author_id)
      .first(),
    c.env.DB.prepare('SELECT version, snapshot, created_at FROM report_revision WHERE report_id = ? ORDER BY version DESC').bind(id).all(),
    c.env.DB.prepare("SELECT f.reason, f.details, f.status, f.created_at, a.name FROM flag f JOIN account a ON a.id = f.account_id WHERE target_type = 'report' AND target_id = ?").bind(id).all(),
    c.env.DB.prepare(
      `SELECT kind, value, COUNT(*) AS n, COUNT(DISTINCT ip_hash) AS ips FROM vote WHERE report_id = ? GROUP BY kind, value`,
    )
      .bind(id)
      .all(),
    c.env.DB.prepare('SELECT r.id, r.title, r.status, a.name AS author_name FROM report r JOIN account a ON a.id = r.author_id WHERE r.person_id = ? AND r.id != ?')
      .bind(report.person_id, id)
      .all(),
    c.env.DB.prepare('SELECT * FROM reply WHERE report_id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT * FROM appeal WHERE report_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare("SELECT id, name, status FROM category WHERE status != 'rejected' ORDER BY sort, name").all(),
  ]);
  return c.json({
    report: { ...report, categories: JSON.parse(report.categories), content_flags: JSON.parse(String(report.content_flags)) },
    person,
    author,
    revisions: revisions.results,
    flags: flags.results,
    votes: votes.results,
    otherReports: others.results,
    reply: replyRow,
    appeals: appeals.results,
    categories: categories.results,
  });
});

admin.post('/reports/:id', async (c) => {
  const actor = requireStaff(c);
  const id = c.req.param('id');
  const b = await body(c, 64 * 1024);
  const r = await c.env.DB.prepare('SELECT r.*, a.email AS author_email FROM report r JOIN account a ON a.id = r.author_id WHERE r.id = ?')
    .bind(id)
    .first<{ person_id: string; author_id: string; author_email: string; status: string; title: string }>();
  if (!r) fail(404, 'not_found');
  if (r.author_id === actor.id) fail(400, 'cannot_moderate_own');
  const note = cleanText(b.note, 2000);
  const feedback = cleanText(b.feedback, 2000);
  const summary = cleanText(b.publicSummary, 1000);
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];

  switch (b.action) {
    case 'approve': {
      const author = await c.env.DB.prepare('SELECT status FROM account WHERE id = ?').bind(r.author_id).first<{ status: string }>();
      if (author?.status !== 'approved') fail(409, 'author_not_approved');
      const cats = Array.isArray(b.categoryIds) ? (b.categoryIds as unknown[]).filter((x): x is string => typeof x === 'string') : null;
      if (cats) {
        if (!cats.length) fail(400, 'category_required');
        stmts.push(c.env.DB.prepare('DELETE FROM report_category WHERE report_id = ?').bind(id));
        for (const cat of cats) {
          stmts.push(c.env.DB.prepare('INSERT INTO report_category (report_id, category_id) VALUES (?, ?)').bind(id, cat));
          stmts.push(c.env.DB.prepare("UPDATE category SET status = 'active' WHERE id = ? AND status = 'proposed'").bind(cat));
        }
      } else {
        stmts.push(
          c.env.DB.prepare(
            "UPDATE category SET status = 'active' WHERE status = 'proposed' AND id IN (SELECT category_id FROM report_category WHERE report_id = ?)",
          ).bind(id),
        );
      }
      stmts.push(
        c.env.DB.prepare(
          "UPDATE report SET status = 'approved', public_summary = COALESCE(?, public_summary), moderator_note = COALESCE(?, moderator_note), author_feedback = NULL, approved_by = ?, approved_at = COALESCE(approved_at, ?), updated_at = ? WHERE id = ?",
        ).bind(summary, note, actor.id, now, now, id),
        c.env.DB.prepare("UPDATE person SET status = 'active' WHERE id = ? AND status = 'pending'").bind(r.person_id),
      );
      await c.env.DB.batch(stmts);
      await sendMail(c, r.author_email, 'tangossip — yazın yayında', [`"${r.title}" başlıklı yazın onaylandı ve yayınlandı.`], { href: `/kisi/${r.person_id}`, label: 'Profili gör' });
      break;
    }
    case 'needs_info':
    case 'reject': {
      if (!feedback) fail(400, 'feedback_required');
      const status = b.action === 'reject' ? 'rejected' : 'needs_info';
      await c.env.DB.prepare('UPDATE report SET status = ?, author_feedback = ?, moderator_note = COALESCE(?, moderator_note), updated_at = ? WHERE id = ?')
        .bind(status, feedback, note, now, id)
        .run();
      await sendMail(
        c,
        r.author_email,
        b.action === 'reject' ? 'tangossip — yazın yayınlanmadı' : 'tangossip — yazın için ek bilgi gerekiyor',
        [`"${r.title}"`, feedback],
        { href: '/hesabim', label: 'Yazılarımı gör' },
      );
      break;
    }
    case 'summary':
      await c.env.DB.prepare('UPDATE report SET public_summary = ?, moderator_note = COALESCE(?, moderator_note), updated_at = ? WHERE id = ?').bind(summary, note, now, id).run();
      break;
    case 'remove':
      await c.env.DB.prepare("UPDATE report SET status = 'removed', moderator_note = COALESCE(?, moderator_note), updated_at = ? WHERE id = ?").bind(note, now, id).run();
      break;
    case 'restore':
      await c.env.DB.prepare("UPDATE report SET status = 'approved', updated_at = ? WHERE id = ? AND status IN ('removed', 'disputed')").bind(now, id).run();
      break;
    case 'move': {
      const target = typeof b.personId === 'string' ? b.personId : null;
      const exists = target && (await c.env.DB.prepare("SELECT 1 FROM person WHERE id = ? AND status IN ('active', 'pending')").bind(target).first());
      if (!exists) fail(400, 'unknown_person');
      await c.env.DB.prepare('UPDATE report SET person_id = ?, updated_at = ? WHERE id = ?').bind(target, now, id).run();
      break;
    }
    case 'false': {
      if (actor.role !== 'admin') fail(403, 'forbidden');
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE report SET status = 'removed', moderator_note = ?, updated_at = ? WHERE id = ?").bind(`[YALAN] ${note ?? ''}`, now, id),
        c.env.DB.prepare("UPDATE account SET status = 'banned', status_note = 'Yalan hikaye', trust_score = trust_score - 100 WHERE id = ?").bind(r.author_id),
        c.env.DB.prepare('DELETE FROM session WHERE account_id = ?').bind(r.author_id),
        c.env.DB.prepare("UPDATE report SET status = 'pending', moderator_note = COALESCE(moderator_note, '') || ' [Yazarı yalan hikayeden banlandı, yeniden incele]' WHERE author_id = ? AND id != ? AND status IN ('approved', 'disputed')").bind(r.author_id, id),
        c.env.DB.prepare("DELETE FROM vote WHERE account_id = ?").bind(r.author_id),
      ]);
      break;
    }
    default:
      fail(400, 'bad_action');
  }
  await audit(c, `report.${b.action}`, 'report', id, { note, feedback, summary });
  return c.json({ ok: true });
});

// ---- persons
admin.get('/persons', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const q = c.req.query('q');
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM report r WHERE r.person_id = p.id) AS report_count,
       (SELECT json_group_array(alias) FROM person_alias WHERE person_id = p.id) AS aliases
     FROM person p WHERE (? = 'all' OR p.status = ?) AND (? IS NULL OR p.normalized_name LIKE ?) ORDER BY p.created_at DESC LIMIT 200`,
  )
    .bind(status, status, q ?? null, q ? `%${normalizeName(q)}%` : null)
    .all();
  return c.json({ persons: results });
});

admin.post('/persons/:id', async (c) => {
  const id = c.req.param('id');
  const b = await body(c);
  const p = await c.env.DB.prepare('SELECT * FROM person WHERE id = ?').bind(id).first<{ status: string }>();
  if (!p) fail(404, 'not_found');
  switch (b.action) {
    case 'edit': {
      const fullName = cleanText(b.fullName, 120);
      if (!fullName) fail(400, 'full_name_required');
      await c.env.DB.prepare('UPDATE person SET full_name = ?, normalized_name = ?, city = ?, instagram = ?, roles = ? WHERE id = ?')
        .bind(fullName, normalizeName(fullName), cleanText(b.city, 80), cleanText(b.instagram, 80), JSON.stringify(Array.isArray(b.roles) ? b.roles : []), id)
        .run();
      break;
    }
    case 'alias': {
      const alias = cleanText(b.alias, 120);
      if (!alias) fail(400, 'alias_required');
      await c.env.DB.prepare('INSERT INTO person_alias (id, person_id, alias, normalized_alias) VALUES (?, ?, ?, ?)').bind(newId('als'), id, alias, normalizeName(alias)).run();
      break;
    }
    case 'remove_alias':
      await c.env.DB.prepare('DELETE FROM person_alias WHERE id = ? AND person_id = ?').bind(String(b.aliasId), id).run();
      break;
    case 'hide':
    case 'activate':
    case 'reject':
      await c.env.DB.prepare('UPDATE person SET status = ? WHERE id = ?').bind(b.action === 'hide' ? 'hidden' : b.action === 'reject' ? 'rejected' : 'active', id).run();
      if (b.action === 'reject') await c.env.DB.prepare("UPDATE report SET status = 'rejected', author_feedback = COALESCE(author_feedback, 'Kişi kaydı reddedildi.') WHERE person_id = ? AND status IN ('pending', 'needs_info')").bind(id).run();
      break;
    case 'merge': {
      const into = typeof b.mergeInto === 'string' ? b.mergeInto : null;
      if (!into || into === id) fail(400, 'bad_merge_target');
      const target = await c.env.DB.prepare('SELECT full_name FROM person WHERE id = ?').bind(into).first<{ full_name: string }>();
      if (!target) fail(404, 'not_found');
      const old = await c.env.DB.prepare('SELECT full_name FROM person WHERE id = ?').bind(id).first<{ full_name: string }>();
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE report SET person_id = ? WHERE person_id = ?').bind(into, id),
        c.env.DB.prepare('UPDATE person_alias SET person_id = ? WHERE person_id = ?').bind(into, id),
        c.env.DB.prepare('INSERT INTO person_alias (id, person_id, alias, normalized_alias) VALUES (?, ?, ?, ?)').bind(newId('als'), into, old!.full_name, normalizeName(old!.full_name)),
        c.env.DB.prepare("UPDATE person SET status = 'merged', merged_into = ? WHERE id = ?").bind(into, id),
        c.env.DB.prepare("UPDATE person SET status = 'active' WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM report WHERE person_id = ? AND status IN ('approved', 'disputed'))").bind(into, into),
      ]);
      break;
    }
    case 'unclaim':
      await c.env.DB.prepare('UPDATE person SET claimed_by = NULL WHERE id = ?').bind(id).run();
      break;
    default:
      fail(400, 'bad_action');
  }
  await audit(c, `person.${b.action}`, 'person', id, b);
  return c.json({ ok: true });
});

// ---- categories
admin.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, a.name AS proposed_by_name, (SELECT COUNT(*) FROM report_category rc WHERE rc.category_id = c.id) AS usage
     FROM category c LEFT JOIN account a ON a.id = c.proposed_by ORDER BY CASE c.status WHEN 'proposed' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, c.sort, c.name`,
  ).all();
  return c.json({ categories: results });
});

admin.post('/categories', async (c) => {
  const b = await body(c);
  const name = cleanText(b.name, 60);
  if (!name) fail(400, 'name_required');
  const id = newId('cat');
  await c.env.DB.prepare("INSERT INTO category (id, slug, name, description, status, sort, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)")
    .bind(id, slugify(name), name, cleanText(b.description, 300), Number(b.sort) || 100, Date.now())
    .run();
  await audit(c, 'category.create', 'category', id, { name });
  return c.json({ ok: true, id });
});

admin.post('/categories/:id', async (c) => {
  const id = c.req.param('id');
  const b = await body(c);
  switch (b.action) {
    case 'approve':
      await c.env.DB.prepare("UPDATE category SET status = 'active', name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?")
        .bind(cleanText(b.name, 60), cleanText(b.description, 300), id)
        .run();
      break;
    case 'reject': {
      const mapTo = typeof b.mapTo === 'string' ? b.mapTo : null;
      const stmts = [c.env.DB.prepare("UPDATE category SET status = 'rejected' WHERE id = ?").bind(id)];
      if (mapTo) {
        stmts.unshift(
          c.env.DB.prepare('INSERT OR IGNORE INTO report_category (report_id, category_id) SELECT report_id, ? FROM report_category WHERE category_id = ?').bind(mapTo, id),
        );
      }
      stmts.push(c.env.DB.prepare('DELETE FROM report_category WHERE category_id = ?').bind(id));
      await c.env.DB.batch(stmts);
      break;
    }
    case 'edit':
      await c.env.DB.prepare('UPDATE category SET name = ?, description = ?, sort = ? WHERE id = ?')
        .bind(cleanText(b.name, 60), cleanText(b.description, 300), Number(b.sort) || 100, id)
        .run();
      break;
    default:
      fail(400, 'bad_action');
  }
  await audit(c, `category.${b.action}`, 'category', id, b);
  return c.json({ ok: true });
});

// ---- replies
admin.get('/replies', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT rp.*, r.title AS report_title, r.person_id, p.full_name AS person_name FROM reply rp
     JOIN report r ON r.id = rp.report_id JOIN person p ON p.id = r.person_id WHERE rp.status = ? ORDER BY rp.updated_at ASC`,
  )
    .bind(c.req.query('status') ?? 'pending')
    .all();
  return c.json({ replies: results });
});

admin.post('/replies/:id', async (c) => {
  const id = c.req.param('id');
  const b = await body(c);
  if (b.action !== 'approve' && b.action !== 'reject') fail(400, 'bad_action');
  const row = await c.env.DB.prepare('UPDATE reply SET status = ?, moderator_note = ? WHERE id = ? RETURNING account_id')
    .bind(b.action === 'approve' ? 'approved' : 'rejected', cleanText(b.note, 1000), id)
    .first<{ account_id: string }>();
  if (!row) fail(404, 'not_found');
  const email = await emailOf(c, row.account_id);
  if (email) await sendMail(c, email, 'tangossip — yanıtın', [b.action === 'approve' ? 'Yanıtın yayınlandı.' : `Yanıtın yayınlanmadı. ${cleanText(b.note, 1000) ?? ''}`]);
  await audit(c, `reply.${b.action}`, 'reply', id);
  return c.json({ ok: true });
});

// ---- appeals
admin.get('/appeals', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ap.*, r.title AS report_title, r.story AS report_story, r.person_id, p.full_name AS person_name FROM appeal ap
     JOIN report r ON r.id = ap.report_id JOIN person p ON p.id = r.person_id WHERE ap.status = ? ORDER BY ap.created_at ASC`,
  )
    .bind(c.req.query('status') ?? 'open')
    .all();
  return c.json({ appeals: results });
});

admin.post('/appeals/:id', async (c) => {
  const actor = requireStaff(c);
  const id = c.req.param('id');
  const b = await body(c);
  const resolution = cleanText(b.resolution, 2000);
  if (!resolution) fail(400, 'resolution_required');
  const ap = await c.env.DB.prepare("SELECT report_id, account_id FROM appeal WHERE id = ? AND status = 'open'").bind(id).first<{ report_id: string; account_id: string }>();
  if (!ap) fail(404, 'not_found');
  const outcome = { upheld: 'approved', removed: 'removed', edited: 'approved' }[String(b.action)];
  if (!outcome) fail(400, 'bad_action');
  const summary = cleanText(b.publicSummary, 1000);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE appeal SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').bind(b.action, resolution, actor.id, Date.now(), id),
    c.env.DB.prepare('UPDATE report SET status = ?, public_summary = COALESCE(?, public_summary), updated_at = ? WHERE id = ?').bind(outcome, summary, Date.now(), ap.report_id),
  ]);
  const email = await emailOf(c, ap.account_id);
  if (email) await sendMail(c, email, 'tangossip — itirazın sonuçlandı', [resolution]);
  await audit(c, `appeal.${b.action}`, 'appeal', id, { resolution });
  return c.json({ ok: true });
});

// ---- claims
admin.get('/claims', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT cr.*, p.full_name AS person_name, p.instagram AS person_instagram, a.name AS account_name, a.email AS account_email, a.instagram AS account_instagram
     FROM claim_request cr JOIN person p ON p.id = cr.person_id JOIN account a ON a.id = cr.account_id WHERE cr.status = ? ORDER BY cr.created_at ASC`,
  )
    .bind(c.req.query('status') ?? 'open')
    .all();
  return c.json({ claims: results });
});

admin.post('/claims/:id', async (c) => {
  const id = c.req.param('id');
  const b = await body(c);
  const cr = await c.env.DB.prepare("SELECT person_id, account_id FROM claim_request WHERE id = ? AND status = 'open'").bind(id).first<{ person_id: string; account_id: string }>();
  if (!cr) fail(404, 'not_found');
  if (b.action === 'approve') {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE claim_request SET status = 'approved', resolved_at = ? WHERE id = ?").bind(Date.now(), id),
      c.env.DB.prepare("UPDATE claim_request SET status = 'rejected', resolved_at = ? WHERE person_id = ? AND id != ? AND status = 'open'").bind(Date.now(), cr.person_id, id),
      c.env.DB.prepare('UPDATE person SET claimed_by = ? WHERE id = ?').bind(cr.account_id, cr.person_id),
      c.env.DB.prepare('DELETE FROM vote WHERE account_id = ? AND report_id IN (SELECT id FROM report WHERE person_id = ?)').bind(cr.account_id, cr.person_id),
    ]);
  } else if (b.action === 'reject') {
    await c.env.DB.prepare("UPDATE claim_request SET status = 'rejected', resolved_at = ? WHERE id = ?").bind(Date.now(), id).run();
  } else fail(400, 'bad_action');
  const email = await emailOf(c, cr.account_id);
  if (email) await sendMail(c, email, 'tangossip — profil sahiplenme', [b.action === 'approve' ? 'Profil sahiplenme talebin onaylandı. Artık hikayelere yanıt yazabilir ve itiraz edebilirsin.' : 'Profil sahiplenme talebin onaylanmadı.']);
  await audit(c, `claim.${b.action}`, 'claim', id);
  return c.json({ ok: true });
});

// ---- flags & takedowns
admin.get('/flags', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.*, a.name AS account_name FROM flag f JOIN account a ON a.id = f.account_id WHERE f.status = 'open' ORDER BY f.created_at ASC`,
  ).all();
  return c.json({ flags: results });
});

admin.post('/flags/:id/resolve', async (c) => {
  await c.env.DB.prepare("UPDATE flag SET status = 'resolved' WHERE id = ?").bind(c.req.param('id')).run();
  await audit(c, 'flag.resolve', 'flag', c.req.param('id'));
  return c.json({ ok: true });
});

admin.get('/takedowns', async (c) => {
  requireStaff(c, 'admin');
  const { results } = await c.env.DB.prepare("SELECT * FROM takedown_request WHERE status = 'open' ORDER BY created_at ASC").all();
  return c.json({ takedowns: results });
});

admin.post('/takedowns/:id/resolve', async (c) => {
  requireStaff(c, 'admin');
  const b = await body(c);
  await c.env.DB.prepare("UPDATE takedown_request SET status = 'resolved', resolution = ? WHERE id = ?").bind(cleanText(b.resolution, 2000), c.req.param('id')).run();
  await audit(c, 'takedown.resolve', 'takedown', c.req.param('id'));
  return c.json({ ok: true });
});

// ---- audit & settings
admin.get('/audit', async (c) => {
  requireStaff(c, 'admin');
  const before = Number(c.req.query('before')) || Date.now() + 1;
  const { results } = await c.env.DB.prepare(
    'SELECT l.*, a.name AS actor_name FROM audit_log l LEFT JOIN account a ON a.id = l.actor_id WHERE l.created_at < ? ORDER BY l.created_at DESC LIMIT 100',
  )
    .bind(before)
    .all();
  return c.json({ entries: results });
});

admin.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT k, v FROM setting').all<{ k: string; v: string }>();
  return c.json({ settings: Object.fromEntries(results.map((r) => [r.k, r.v])) });
});

admin.post('/settings', async (c) => {
  requireStaff(c, 'admin');
  const b = await body(c);
  const allowed = ['min_account_age_days', 'daily_report_limit'];
  const stmts = Object.entries(b)
    .filter(([k, v]) => allowed.includes(k) && Number.isFinite(Number(v)) && Number(v) >= 0)
    .map(([k, v]) => c.env.DB.prepare('INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(Number(v))));
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c, 'settings.update', null, null, b);
  return c.json({ ok: true });
});
