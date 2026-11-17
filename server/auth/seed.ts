import type { Database } from 'better-sqlite3';
import { audit } from './audit.ts';
import { hashPasswordSync, passwordError } from './passwords.ts';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

/**
 * Seed the first admin only when users is empty.
 * Never logs the email or password. Restart does not reseed.
 */
export function seedAdmin(db: Database) {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) return;

  const email = (process.env.GRIDCITY_ADMIN_EMAIL || '').trim();
  const password = (
    process.env.GRIDCITY_ADMIN_INITIAL_PASSWORD ||
    process.env.GRIDCITY_ADMIN_PASSWORD ||
    ''
  ).trim();
  const name = ((process.env.GRIDCITY_ADMIN_NAME || '').trim() || 'Admin').slice(0, 80);
  const mustChange = process.env.GRIDCITY_ADMIN_FORCE_CHANGE === '0' ? 0 : 1;

  if (!email || !password) {
    console.warn(
      '[gridcity] admin seed skipped: GRIDCITY_ADMIN_EMAIL and GRIDCITY_ADMIN_INITIAL_PASSWORD are not both set',
    );
    return;
  }
  if (!validEmail(email) || passwordError(password, email)) {
    console.warn('[gridcity] admin seed skipped: admin email or initial password does not meet policy');
    return;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (
       id, email, name, password_hash, role, permissions, active, must_change_password,
       failed_login_count, locked_until, last_login_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'admin', '{}', 1, ?, 0, NULL, NULL, ?, ?)`,
  ).run(id, email, name, hashPasswordSync(password), mustChange, now, now);

  audit(db, {
    actorLabel: 'bootstrap',
    action: 'user.create',
    entity: 'user',
    entityId: id,
    detail: { role: 'admin', seeded: true },
  });
}
