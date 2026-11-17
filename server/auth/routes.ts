import type { Express, Request } from 'express';
import type { Database } from 'better-sqlite3';
import type { Server } from 'socket.io';
import { isRole, parseOverrides, type RoleName } from '../../src/permissions.ts';
import { audit } from './audit.ts';
import { asyncRoute, gcUser } from './guards.ts';
import { can, effectivePerms } from './permissions.ts';
import {
  generateTempPassword,
  hashPassword,
  passwordError,
  verifyAgainstDummy,
  verifyPassword,
} from './passwords.ts';
import { allowLoginAttempt } from './rateLimit.ts';
import {
  clearSessionCookie,
  createSession,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
} from './sessions.ts';
import { publishAuthChanged } from '../tasks/notify.ts';

const GENERIC = 'Email or password is incorrect';
const LOCK_MS = 15 * 60 * 1000;
const LOCK_AFTER = 5;

export type AuthCtx = { db: Database; io: Server };

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: RoleName;
  permissions: string;
  active: number;
  must_change_password: number;
  failed_login_count: number;
  locked_until: number | null;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
};

function clientIp(req: Request): string {
  return (req.ip || '').slice(0, 64);
}

export function playerToast(): string {
  const value = process.env.QUICK_TASK_PLAYER_TOAST?.trim();
  return value || 'Task added.';
}

function authConfig() {
  return { quickTaskPlayerToast: playerToast() };
}

function identityOf(row: {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  must_change_password?: number;
  mustChangePassword?: boolean;
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mustChangePassword: row.mustChangePassword ?? !!row.must_change_password,
  };
}

export function publicUser(row: UserRow) {
  const now = Date.now();
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions: parseOverrides(row.permissions),
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    locked: !!(row.locked_until && row.locked_until > now),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

function loadUser(db: Database, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

function activeAdminCount(db: Database, exceptId?: string): number {
  const row = exceptId
    ? db.prepare(
        `SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id != ?`,
      ).get(exceptId)
    : db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`).get();
  return (row as { c: number }).c;
}

function lockMessage(until: number): string {
  const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return `${GENERIC}. Try again in ${mins} min`;
}

export function registerAuthRoutes(app: Express, ctx: AuthCtx) {
  const { db, io } = ctx;

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const ip = clientIp(req);
    if (!allowLoginAttempt(ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const row = email
      ? (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined)
      : undefined;

    if (!row || !row.active) {
      await verifyAgainstDummy(password);
      audit(db, {
        action: 'auth.login.fail',
        entity: 'user',
        entityId: row?.id ?? null,
        ip,
        detail: { reason: row ? 'inactive' : 'unknown' },
      });
      return res.status(401).json({ error: GENERIC });
    }

    const now = Date.now();
    if (row.locked_until && row.locked_until > now) {
      audit(db, {
        actorId: row.id,
        action: 'auth.login.fail',
        entity: 'user',
        entityId: row.id,
        ip,
        detail: { locked: true },
      });
      return res.status(401).json({ error: lockMessage(row.locked_until) });
    }
    if (row.locked_until && row.locked_until <= now) {
      db.prepare(
        'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
      ).run(now, row.id);
      row.failed_login_count = 0;
      row.locked_until = null;
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      const count = row.failed_login_count + 1;
      const lockedUntil = count >= LOCK_AFTER ? now + LOCK_MS : null;
      db.prepare(
        'UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?',
      ).run(count, lockedUntil, now, row.id);
      audit(db, {
        actorId: row.id,
        action: 'auth.login.fail',
        entity: 'user',
        entityId: row.id,
        ip,
        detail: { count },
      });
      if (lockedUntil) {
        audit(db, {
          actorId: row.id,
          action: 'auth.login.lockout',
          entity: 'user',
          entityId: row.id,
          ip,
          detail: { until: lockedUntil },
        });
        return res.status(401).json({ error: lockMessage(lockedUntil) });
      }
      return res.status(401).json({ error: GENERIC });
    }

    db.prepare(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, row.id);
    createSession(db, req, res, row.id);
    audit(db, {
      actorId: row.id,
      action: 'auth.login.success',
      entity: 'user',
      entityId: row.id,
      ip,
    });
    const subject = { role: row.role, permissions: row.permissions };
    return res.json({
      user: identityOf(row),
      perms: effectivePerms(subject),
      mustChangePassword: !!row.must_change_password,
      config: authConfig(),
    });
  }));

  app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    const user = gcUser(req);
    if (user) revokeSession(db, user.sessionId);
    clearSessionCookie(req, res);
    return res.json({ ok: true });
  }));

  app.get('/api/auth/me', asyncRoute(async (req, res) => {
    const user = gcUser(req);
    if (!user) {
      return res.json({
        user: null,
        perms: effectivePerms(null),
        config: authConfig(),
      });
    }
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      perms: effectivePerms(user),
      config: authConfig(),
    });
  }));

  app.post('/api/auth/change-password', asyncRoute(async (req, res) => {
    const user = gcUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const current = typeof req.body?.current === 'string' ? req.body.current : '';
    const next = typeof req.body?.new === 'string' ? req.body.new : '';
    const policy = passwordError(next, user.email);
    if (policy) return res.status(400).json({ error: policy });
    const row = loadUser(db, user.id);
    if (!row || !row.active) return res.status(401).json({ error: 'unauthorized' });
    const matches = await verifyPassword(current, row.password_hash);
    if (!matches) return res.status(400).json({ error: 'Current password is incorrect' });
    const passwordHash = await hashPassword(next);
    const now = Date.now();
    db.prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, failed_login_count = 0,
           locked_until = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(passwordHash, now, user.id);
    revokeOtherSessions(db, user.id, user.sessionId);
    audit(db, {
      actorId: user.id,
      action: 'auth.password.change',
      entity: 'user',
      entityId: user.id,
      ip: clientIp(req),
    });
    const fresh = { ...user, mustChangePassword: false, permissions: row.permissions };
    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false },
      perms: effectivePerms(fresh),
      mustChangePassword: false,
    });
  }));

  app.get('/api/admin/users', asyncRoute(async (req, res) => {
    const user = gcUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!can(user, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const rows = db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as UserRow[];
    return res.json({ users: rows.map(publicUser) });
  }));

  app.post('/api/admin/users', asyncRoute(async (req, res) => {
    const actor = gcUser(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    if (!can(actor, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const role = req.body?.role;
    if (!validEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (!name || name.length > 80) return res.status(400).json({ error: 'Name must be 1-80 characters' });
    if (!isRole(role)) return res.status(400).json({ error: 'Role must be admin, player, or viewer' });
    if (req.body?.permissions !== undefined && !isOverrideMap(req.body.permissions)) {
      return res.status(400).json({ error: 'permissions must be an object' });
    }
    const permissions = JSON.stringify(parseOverrides(req.body?.permissions ?? {}));
    const mustChange = req.body?.mustChangePassword === false ? 0 : 1;
    let tempPassword: string | undefined;
    let password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      tempPassword = generateTempPassword();
      password = tempPassword;
    }
    const policy = passwordError(password, email);
    if (policy) return res.status(400).json({ error: policy });
    const now = Date.now();
    const id = crypto.randomUUID();
    try {
      db.prepare(
        `INSERT INTO users (
           id, email, name, password_hash, role, permissions, active, must_change_password,
           failed_login_count, locked_until, last_login_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, NULL, NULL, ?, ?)`,
      ).run(id, email, name, await hashPassword(password), role, permissions, mustChange, now, now);
    } catch (err) {
      if (String(err).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Email is already in use' });
      }
      throw err;
    }
    audit(db, {
      actorId: actor.id,
      action: 'user.create',
      entity: 'user',
      entityId: id,
      ip: clientIp(req),
      detail: { role },
    });
    const created = loadUser(db, id)!;
    const body: { user: ReturnType<typeof publicUser>; tempPassword?: string } = {
      user: publicUser(created),
    };
    if (tempPassword) body.tempPassword = tempPassword;
    return res.status(201).json(body);
  }));

  app.patch('/api/admin/users/:id', asyncRoute(async (req, res) => {
    const actor = gcUser(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    if (!can(actor, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const row = loadUser(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const name = req.body?.name !== undefined
      ? (typeof req.body.name === 'string' ? req.body.name.trim() : '')
      : row.name;
    if (!name || name.length > 80) return res.status(400).json({ error: 'Name must be 1-80 characters' });
    const role = req.body?.role !== undefined ? req.body.role : row.role;
    if (!isRole(role)) return res.status(400).json({ error: 'Role must be admin, player, or viewer' });
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : row.active;
    if (req.body?.permissions !== undefined && !isOverrideMap(req.body.permissions)) {
      return res.status(400).json({ error: 'permissions must be an object' });
    }
    const permissions = req.body?.permissions !== undefined
      ? JSON.stringify(parseOverrides(req.body.permissions))
      : row.permissions;
    const wasActiveAdmin = row.role === 'admin' && row.active === 1;
    const staysActiveAdmin = role === 'admin' && active === 1;
    if (wasActiveAdmin && !staysActiveAdmin && activeAdminCount(db, row.id) === 0) {
      return res.status(409).json({ error: 'Cannot demote or deactivate the last active admin' });
    }
    const now = Date.now();
    db.prepare(
      'UPDATE users SET name = ?, role = ?, active = ?, permissions = ?, updated_at = ? WHERE id = ?',
    ).run(name, role, active, permissions, now, row.id);
    if (active === 0) revokeAllSessions(db, row.id);
    audit(db, {
      actorId: actor.id,
      action: 'user.edit',
      entity: 'user',
      entityId: row.id,
      ip: clientIp(req),
      detail: { role, active: !!active },
    });
    publishAuthChanged(io, row.id);
    return res.json({ user: publicUser(loadUser(db, row.id)!) });
  }));

  app.post('/api/admin/users/:id/reset-password', asyncRoute(async (req, res) => {
    const actor = gcUser(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    if (!can(actor, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const row = loadUser(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const tempPassword = generateTempPassword();
    const now = Date.now();
    db.prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 1, failed_login_count = 0,
           locked_until = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(await hashPassword(tempPassword), now, row.id);
    revokeAllSessions(db, row.id);
    audit(db, {
      actorId: actor.id,
      action: 'user.reset_password',
      entity: 'user',
      entityId: row.id,
      ip: clientIp(req),
    });
    publishAuthChanged(io, row.id);
    return res.json({ tempPassword });
  }));

  app.post('/api/admin/users/:id/unlock', asyncRoute(async (req, res) => {
    const actor = gcUser(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    if (!can(actor, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const row = loadUser(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    db.prepare(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
    ).run(Date.now(), row.id);
    audit(db, {
      actorId: actor.id,
      action: 'auth.unlock',
      entity: 'user',
      entityId: row.id,
      ip: clientIp(req),
    });
    return res.json({ user: publicUser(loadUser(db, row.id)!) });
  }));

  app.post('/api/admin/users/:id/revoke-sessions', asyncRoute(async (req, res) => {
    const actor = gcUser(req);
    if (!actor) return res.status(401).json({ error: 'unauthorized' });
    if (!can(actor, 'users.manage')) return res.status(403).json({ error: 'forbidden' });
    const row = loadUser(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    revokeAllSessions(db, row.id);
    audit(db, {
      actorId: actor.id,
      action: 'user.revoke_sessions',
      entity: 'user',
      entityId: row.id,
      ip: clientIp(req),
    });
    publishAuthChanged(io, row.id);
    return res.json({ ok: true });
  }));

  app.get('/api/admin/audit', asyncRoute(async (req, res) => {
    const user = gcUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!can(user, 'audit.view')) return res.status(403).json({ error: 'forbidden' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const beforeRaw = req.query.before;
    const before = beforeRaw != null && beforeRaw !== '' ? Number(beforeRaw) : null;
    const rows = (before != null && Number.isFinite(before)
      ? db.prepare('SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit)
      : db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit)) as AuditRow[];
    return res.json({
      entries: rows.map((row) => ({
        id: row.id,
        at: row.at,
        actorId: row.actor_id,
        actorLabel: row.actor_label,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        detail: parseDetail(row.detail),
        ip: row.ip,
      })),
    });
  }));
}

function isOverrideMap(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type AuditRow = {
  id: number;
  at: number;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
  ip: string | null;
};

function parseDetail(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
