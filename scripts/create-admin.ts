// Usage: ADMIN_PASSWORD=... node scripts/create-admin.ts --email a@b.c --name "Ad Soyad" [--remote] [--env staging]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, newId } from '../worker/lib/crypto.ts';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim();
const password = process.env.ADMIN_PASSWORD;
if (!email || !name || !password || password.length < 10) {
  console.error('Need --email, --name and ADMIN_PASSWORD (10+ chars).');
  process.exit(1);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = Date.now();
const sql = `INSERT INTO account (id, email, pw, name, email_verified, role, status, approved_at, created_at, pw_changed_at)
VALUES (${q(newId('acc'))}, ${q(email)}, ${q(await hashPassword(password))}, ${q(name)}, 1, 'admin', 'approved', ${now}, ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET role = 'admin', status = 'approved', pw = excluded.pw;`;

const file = join(mkdtempSync(join(tmpdir(), 'tangossip-')), 'admin.sql');
writeFileSync(file, sql);
const target = args.includes('--remote') ? '--remote' : '--local';
const env = arg('env');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, `--file=${file}`, ...(env ? ['--env', env] : [])], { stdio: 'inherit' });
console.log(`Admin ready: ${email}. Sign in, then set up TOTP on /hesabim to open /yonetim.`);
