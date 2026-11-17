import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import type { RoleName } from '../../src/permissions.ts';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 10 * 60 * 1000;
export const SESSION_COOKIE = 'gc_session';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  permissions: string;
  mustChangePassword: boolean;
  sessionId: string;
};

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: req.secure,
    maxAge: SESSION_MS,
  };
}

export function setSessionCookie(req: Request, res: Response, raw: string) {
  res.cookie(SESSION_COOKIE, raw, cookieOptions(req));
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: req.secure,
  });
}

type SessionRow = {
  session_id: string;
  expires_at: number;
  last_seen_at: number;
  id: string;
  email: string;
  name: string;
  role: RoleName;
  permissions: string;
  active: number;
  must_change_password: number;
};

function load(db: Database, token: string | null): SessionUser | null {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
            u.id, u.email, u.name, u.role, u.permissions, u.active, u.must_change_password
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  ).get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now || !row.active) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (now - row.last_seen_at >= TOUCH_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      now,
      now + SESSION_MS,
      row.session_id,
    );
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions: row.permissions || '{}',
    mustChangePassword: !!row.must_change_password,
    sessionId: row.session_id,
  };
}

export function readSession(db: Database, req: Request): SessionUser | null {
  return load(db, readCookie(req.headers.cookie, SESSION_COOKIE));
}

export function userFromCookieHeader(db: Database, header: string | undefined): SessionUser | null {
  return load(db, readCookie(header, SESSION_COOKIE));
}

export function createSession(
  db: Database,
  req: Request,
  res: Response,
  userId: string,
): { raw: string; sessionId: string } {
  const raw = randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const ip = (req.ip || '').slice(0, 64);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, userId, hashToken(raw), now, now, now + SESSION_MS, ip, userAgent);
  setSessionCookie(req, res, raw);
  return { raw, sessionId };
}

export function revokeSession(db: Database, sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function revokeOtherSessions(db: Database, userId: string, keepSessionId: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, keepSessionId);
}

export function revokeAllSessions(db: Database, userId: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
