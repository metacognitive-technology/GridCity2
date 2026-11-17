import type { Express, NextFunction, Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import { APP_VERSION } from '../../src/version.ts';
import { INJECT_REPLY_PATH } from './bearer.ts';
import { readSession, type SessionUser } from './sessions.ts';

type WithUser = Request & { gcUser?: SessionUser | null };

export function gcUser(req: Request): SessionUser | null {
  return (req as WithUser).gcUser ?? null;
}

function needsCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (!req.path.startsWith('/api/')) return false;
  if (INJECT_REPLY_PATH.test(req.path)) return false;
  if (req.path === '/api/auth/login') return true;
  if (gcUser(req)) return true;
  return /(?:^|;\s*)gc_session=/.test(req.headers.cookie || '');
}

function passwordExempt(req: Request): boolean {
  if (req.path === '/api/health') return true;
  if (req.method === 'GET' && req.path === '/api/auth/me') return true;
  if (
    req.method === 'POST' &&
    (req.path === '/api/auth/logout' ||
      req.path === '/api/auth/change-password' ||
      req.path === '/api/auth/login')
  ) {
    return true;
  }
  if (req.method === 'POST' && INJECT_REPLY_PATH.test(req.path)) return true;
  return false;
}

export function installGuards(app: Express, db: Database) {
  app.use((_req, res, next) => {
    res.setHeader('X-App-Version', APP_VERSION);
    next();
  });

  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/')) {
      (req as WithUser).gcUser = readSession(db, req);
    }
    next();
  });

  app.use((req, res, next) => {
    if (!needsCsrf(req)) return next();
    if (req.get('X-GridCity') !== '1') {
      return res.status(403).json({ error: 'missing_csrf_header' });
    }
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const user = gcUser(req);
    if (!user?.mustChangePassword || passwordExempt(req)) return next();
    return res.status(403).json({ error: 'password_change_required' });
  });
}

export function asyncRoute(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('api error', req.method, req.path);
      if (res.headersSent) next(err);
      else res.status(500).json({ error: 'server_error' });
    });
  };
}
