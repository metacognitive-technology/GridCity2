import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_INITIAL_PASSWORD,
  TEST_ADMIN_STABLE_PASSWORD,
} from './auth-constants';

export const CSRF = { 'X-GridCity': '1' };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loginApi(api: APIRequestContext, email: string, password: string) {
  return api.post('/api/auth/login', {
    headers: CSRF,
    data: { email, password },
  });
}

/** Log in as the seeded admin and finish the one-time password change when it is still pending. */
export async function ensureAdmin(api: APIRequestContext) {
  const stable = await loginApi(api, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  if (stable.ok()) {
    const body = await stable.json();
    if (!body.mustChangePassword) return body;
  }
  const initial = await loginApi(api, TEST_ADMIN_EMAIL, TEST_ADMIN_INITIAL_PASSWORD);
  expect(initial.ok(), `seed admin login failed: ${initial.status()}`).toBeTruthy();
  const body = await initial.json();
  if (body.mustChangePassword) {
    const change = await api.post('/api/auth/change-password', {
      headers: CSRF,
      data: { current: TEST_ADMIN_INITIAL_PASSWORD, new: TEST_ADMIN_STABLE_PASSWORD },
    });
    expect(change.ok(), `seed admin password change failed: ${change.status()}`).toBeTruthy();
  }
  const me = await api.get('/api/auth/me');
  expect(me.ok()).toBeTruthy();
  return me.json();
}

export async function createUser(
  api: APIRequestContext,
  input: {
    email: string;
    name: string;
    role: 'admin' | 'player' | 'viewer';
    password?: string;
    mustChangePassword?: boolean;
    permissions?: Record<string, boolean>;
  },
) {
  const res = await api.post('/api/admin/users', { headers: CSRF, data: input });
  expect(res.status(), `create user ${res.status()}`).toBe(201);
  return res.json() as Promise<{
    user: { id: string; email: string; name: string; role: string; mustChangePassword: boolean };
    tempPassword?: string;
  }>;
}

export async function loginThroughLobby(page: Page, email: string, password: string) {
  if (!page.url() || page.url() === 'about:blank') await page.goto('/');
  const link = page.getByTestId('lobby-login-link');
  await expect(link).toBeVisible();
  if (/log out/i.test((await link.innerText()) || '')) return;
  await link.click();
  await expect(page.getByTestId('login-dialog')).toBeVisible();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

export async function enterRoom(page: Page) {
  if (await page.getByTestId('lobby-dialog').isVisible().catch(() => false)) {
    await page.getByTestId('create-room-button').click();
    await expect(page.getByTestId('lobby-dialog')).toBeHidden();
  }
  await expect(page.getByTestId('active-room')).toBeVisible();
}

export async function browserJson(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(async ({ path, init }) => {
    const headers: Record<string, string> = { 'X-GridCity': '1' };
    const options: RequestInit = { method: init?.method || 'GET', headers, credentials: 'include' };
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(init.body);
    }
    const res = await fetch(path, options);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }, { path, init });
}

/** Calendar date in America/New_York, plus or minus a number of days. */
export function nyDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

export type UserRow = {
  id: string;
  email: string;
  role: string;
  must_change_password: number;
  password_hash: string;
  active: number;
};

export function readUsers(dbPath: string): UserRow[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(
      'SELECT id, email, role, must_change_password, password_hash, active FROM users ORDER BY created_at',
    ).all() as UserRow[];
  } finally {
    db.close();
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

export async function stopChild(child: ChildProcess) {
  if (child.exitCode != null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function bootServer(dbPath: string, env: {
  email: string;
  password: string;
  name?: string;
  forceChange: '0' | '1';
}) {
  const port = await freePort();
  let log = '';
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      GRIDCITY_DB: dbPath,
      GRIDCITY_ADMIN_EMAIL: env.email,
      GRIDCITY_ADMIN_NAME: env.name || 'Seed Admin',
      GRIDCITY_ADMIN_INITIAL_PASSWORD: env.password,
      GRIDCITY_ADMIN_PASSWORD: '',
      GRIDCITY_ADMIN_FORCE_CHANGE: env.forceChange,
      GRIDCITY_LOGIN_RATE_LIMIT: '10000',
      GRIDCITY_TZ: 'America/New_York',
      GRIDCITY_SKIP_VERSION_BUMP: '1',
      GRIDBOT_ESCALATE_WEBHOOK_URL: '',
      GRIDBOT_ESCALATE_WEBHOOK_AUTH: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-2000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  const deadline = Date.now() + 25_000;
  let up = false;
  while (Date.now() < deadline) {
    if (child.exitCode != null) break;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* server still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!up) {
    await stopChild(child);
    throw new Error(`isolated server failed to start (${child.exitCode}). ${log.slice(-400)}`);
  }
  return { port, child, dbPath };
}

export function freshDbPath(label: string) {
  const dbPath = path.join(repoRoot, 'e2e', '.tmp', `${label}-${Date.now()}.db`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  return dbPath;
}

export function removeDb(dbPath: string) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
}

export async function apiLogin(port: number, email: string, password: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GridCity': '1' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  const parts = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const match = /gc_session=([^;]+)/.exec(parts.join('; '));
  return { status: res.status, data, cookie: match ? `gc_session=${match[1]}` : '' };
}
