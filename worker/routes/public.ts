import { Hono } from 'hono';
import type { App, Ctx, Env } from '../env';
import { fail } from '../lib/http';
import { personRank, wilsonLower } from '../lib/ranking';
import { isMember, isStaff, requireMember } from '../lib/session';
import { maskName, normalizeName } from '../lib/text';

export const VISIBLE = "('approved', 'disputed')";

interface PersonRow {
  id: string;
  full_name: string;
  city: string | null;
  roles: string;
  instagram: string | null;
  claimed_by: string | null;
  created_at: number;
}

interface ReportRow {
  id: string;
  person_id: string;
  author_id: string;
  title: string;
  story: string;
  public_summary: string | null;
  incident_date: string | null;
  location: string | null;
  score: number;
  entry_recommendation: 'deny' | 'caution' | 'allow';
  firsthand: string;
  status: string;
  approved_at: number | null;
  up: number;
  down: number;
  corroborations: number;
  categories: string | null;
}

async function visibleReports(env: Env, personIds: string[]): Promise<ReportRow[]> {
  if (!personIds.length) return [];
  const marks = personIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM vote v WHERE v.report_id = r.id AND v.kind = 'credible' AND v.value = 1) AS up,
       (SELECT COUNT(*) FROM vote v WHERE v.report_id = r.id AND v.kind = 'credible' AND v.value = -1) AS down,
       (SELECT COUNT(*) FROM vote v WHERE v.report_id = r.id AND v.kind = 'corroborate') AS corroborations,
       (SELECT json_group_array(rc.category_id) FROM report_category rc WHERE rc.report_id = r.id) AS categories
     FROM report r WHERE r.person_id IN (${marks}) AND r.status IN ${VISIBLE}
     ORDER BY r.approved_at DESC`,
  )
    .bind(...personIds)
    .all<ReportRow>();
  return results;
}

function summarize(person: PersonRow, reports: ReportRow[], full: boolean) {
  const categories: Record<string, number> = {};
  const recommendation = { deny: 0, caution: 0, allow: 0 };
  for (const r of reports) {
    for (const cat of JSON.parse(r.categories ?? '[]') as string[]) categories[cat] = (categories[cat] ?? 0) + 1;
    recommendation[r.entry_recommendation]++;
  }
  return {
    id: person.id,
    name: full ? person.full_name : maskName(person.full_name),
    masked: !full,
    city: person.city,
    roles: JSON.parse(person.roles) as string[],
    instagram: full ? person.instagram : null,
    claimed: Boolean(person.claimed_by),
    reportCount: reports.length,
    authorCount: new Set(reports.map((r) => r.author_id)).size,
    avgScore: reports.length ? Math.round((reports.reduce((s, r) => s + r.score, 0) / reports.length) * 10) / 10 : 0,
    recommendation,
    categories,
    disputed: reports.some((r) => r.status === 'disputed'),
    lastReportAt: reports[0]?.approved_at ?? null,
    rank: personRank(reports),
  };
}

export const pub = new Hono<App>();

pub.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, slug, name, description FROM category WHERE status = 'active' ORDER BY sort, name").all();
  return c.json({ categories: results });
});

pub.get('/stats', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(DISTINCT r.person_id) FROM report r JOIN person p ON p.id = r.person_id WHERE p.status = 'active' AND r.status IN ${VISIBLE}) AS persons,
       (SELECT COUNT(*) FROM report r JOIN person p ON p.id = r.person_id WHERE p.status = 'active' AND r.status IN ${VISIBLE}) AS reports,
       (SELECT COUNT(*) FROM account WHERE status = 'approved') AS members`,
  ).first<{ persons: number; reports: number; members: number }>();
  return c.json(row);
});

pub.get('/persons', async (c) => {
  const full = isMember(c.get('account'));
  const q = c.req.query('q');
  const category = c.req.query('category');
  const city = c.req.query('city');
  const sort = c.req.query('sort') === 'recent' ? 'recent' : 'rank';
  if (q && !full) fail(403, 'members_only_search');

  let sql = `SELECT DISTINCT p.* FROM person p WHERE p.status = 'active'
             AND EXISTS (SELECT 1 FROM report r WHERE r.person_id = p.id AND r.status IN ${VISIBLE})`;
  const params: unknown[] = [];
  if (q) {
    const n = `%${normalizeName(q)}%`;
    sql += ' AND (p.normalized_name LIKE ? OR EXISTS (SELECT 1 FROM person_alias a WHERE a.person_id = p.id AND a.normalized_alias LIKE ?))';
    params.push(n, n);
  }
  if (city) {
    sql += ' AND p.city = ?';
    params.push(city);
  }
  if (category) {
    sql += ` AND EXISTS (SELECT 1 FROM report r JOIN report_category rc ON rc.report_id = r.id
             WHERE r.person_id = p.id AND r.status IN ${VISIBLE} AND rc.category_id = ?)`;
    params.push(category);
  }
  sql += ' LIMIT 500';
  const { results: persons } = await c.env.DB.prepare(sql).bind(...params).all<PersonRow>();
  const reports = await visibleReports(c.env, persons.map((p) => p.id));
  const byPerson = new Map<string, ReportRow[]>();
  for (const r of reports) byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), r]);
  const list = persons.map((p) => summarize(p, byPerson.get(p.id) ?? [], full));
  list.sort((a, b) => (sort === 'recent' ? (b.lastReportAt ?? 0) - (a.lastReportAt ?? 0) : b.rank - a.rank));
  const { results: cities } = await c.env.DB.prepare(
    `SELECT DISTINCT city FROM person WHERE status = 'active' AND city IS NOT NULL ORDER BY city`,
  ).all<{ city: string }>();
  return c.json({ persons: list.slice(0, 100), cities: cities.map((r) => r.city), full });
});

/** Members search every active or pending person while writing a report, so duplicates are not proposed. */
pub.get('/persons/lookup', async (c) => {
  requireMember(c);
  const q = normalizeName(c.req.query('q') ?? '');
  if (q.length < 2) return c.json({ persons: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.full_name, p.city, p.roles FROM person p
     WHERE p.status IN ('active', 'pending') AND (p.normalized_name LIKE ? OR EXISTS
       (SELECT 1 FROM person_alias a WHERE a.person_id = p.id AND a.normalized_alias LIKE ?))
     LIMIT 10`,
  )
    .bind(`%${q}%`, `%${q}%`)
    .all<{ id: string; full_name: string; city: string | null; roles: string }>();
  return c.json({ persons: results.map((p) => ({ id: p.id, name: p.full_name, city: p.city, roles: JSON.parse(p.roles) })) });
});

export async function personView(c: Ctx, id: string) {
  const account = c.get('account');
  const full = isMember(account);
  let person = await c.env.DB.prepare('SELECT * FROM person WHERE id = ?').bind(id).first<PersonRow & { status: string; merged_into: string | null }>();
  if (person?.status === 'merged' && person.merged_into) {
    person = await c.env.DB.prepare('SELECT * FROM person WHERE id = ?').bind(person.merged_into).first();
  }
  if (!person || person.status !== 'active') fail(404, 'not_found');
  const reports = await visibleReports(c.env, [person.id]);
  if (!reports.length) fail(404, 'not_found');
  const ids = reports.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const { results: replies } = await c.env.DB.prepare(`SELECT report_id, body, updated_at FROM reply WHERE status = 'approved' AND report_id IN (${marks})`)
    .bind(...ids)
    .all<{ report_id: string; body: string; updated_at: number }>();
  const myVotes = full
    ? (
        await c.env.DB.prepare(`SELECT report_id, kind, value FROM vote WHERE account_id = ? AND report_id IN (${marks})`)
          .bind(account!.id, ...ids)
          .all<{ report_id: string; kind: string; value: number }>()
      ).results
    : [];
  const { results: aliases } = full
    ? await c.env.DB.prepare('SELECT alias FROM person_alias WHERE person_id = ?').bind(person.id).all<{ alias: string }>()
    : { results: [] as { alias: string }[] };
  const isSubject = Boolean(account && person.claimed_by === account.id);
  const replyByReport = new Map(replies.map((r) => [r.report_id, r]));

  return {
    person: { ...summarize(person, reports, full), aliases: aliases.map((a) => a.alias) },
    isSubject,
    canModerate: isStaff(account),
    reports: reports.map((r) => ({
      id: r.id,
      title: full ? r.title : null,
      story: full ? r.story : null,
      summary: r.public_summary,
      incidentDate: r.incident_date,
      location: full ? r.location : null,
      score: r.score,
      recommendation: r.entry_recommendation,
      firsthand: r.firsthand,
      disputed: r.status === 'disputed',
      categories: JSON.parse(r.categories ?? '[]'),
      approvedAt: r.approved_at,
      votes: full ? { up: r.up, down: r.down, corroborations: r.corroborations, credibility: wilsonLower(r.up, r.down) } : null,
      myVotes: myVotes.filter((v) => v.report_id === r.id).map((v) => ({ kind: v.kind, value: v.value })),
      mine: Boolean(account && r.author_id === account.id),
      reply: replyByReport.get(r.id) ? { body: replyByReport.get(r.id)!.body, at: replyByReport.get(r.id)!.updated_at } : null,
    })),
  };
}

pub.get('/persons/:id', async (c) => c.json(await personView(c, c.req.param('id'))));
