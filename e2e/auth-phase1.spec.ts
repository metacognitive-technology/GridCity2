import { expect, request as playwrightRequest, test } from '@playwright/test';
import { createFreshRoom } from './helpers';
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_STABLE_PASSWORD,
  TEST_INJECT_TOKEN,
} from './auth-constants';
import {
  CSRF,
  apiLogin,
  bootServer,
  browserJson,
  createUser,
  ensureAdmin,
  enterRoom,
  freshDbPath,
  loginApi,
  loginThroughLobby,
  nyDate,
  readUsers,
  removeDb,
  stopChild,
} from './auth-helpers';

test('P1-01 seed', async () => {
  test.setTimeout(90_000);
  const email = 'seed-admin@test.local';
  const password = 'seed-initial-pass';
  const dbPath = freshDbPath('p1-seed');
  const env = { email, password, forceChange: '1' as const };
  const first = await bootServer(dbPath, env);
  try {
    const login = await apiLogin(first.port, email, password);
    expect(login.status).toBe(200);
    expect(login.data.user.role).toBe('admin');
    expect(login.data.mustChangePassword).toBe(true);
    expect(login.data.user.email).toBe(email);
    await stopChild(first.child);
    const before = readUsers(dbPath);
    expect(before).toHaveLength(1);
    expect(before[0].role).toBe('admin');
    expect(before[0].must_change_password).toBe(1);
    const hash = before[0].password_hash;

    const second = await bootServer(dbPath, env);
    try {
      const again = await apiLogin(second.port, email, password);
      expect(again.status).toBe(200);
      expect(again.data.mustChangePassword).toBe(true);
      await stopChild(second.child);
      const after = readUsers(dbPath);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before[0].id);
      expect(after[0].password_hash).toBe(hash);
      expect(after[0].must_change_password).toBe(1);
    } finally {
      await stopChild(second.child);
    }
  } finally {
    await stopChild(first.child);
    removeDb(dbPath);
  }
});

test('P1-02 first login', async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const email = `gate-${Date.now()}@test.local`;
  const initial = 'gate-initial-pass';
  const next = 'gate-stable-pass';
  await createUser(request, { email, name: 'Gate Admin', role: 'admin', password: initial, mustChangePassword: true });

  await page.goto('/');
  await page.getByTestId('lobby-login-link').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(initial);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('choose-password-title')).toHaveText('Choose a new password');

  const blocked = await browserJson(page, '/api/tasks');
  expect(blocked.status).toBe(403);
  expect(blocked.data.error).toBe('password_change_required');
  const me = await browserJson(page, '/api/auth/me');
  expect(me.status).toBe(200);
  expect(me.data.user.role).toBe('admin');
  expect(me.data.user.mustChangePassword).toBe(true);

  await page.getByTestId('new-password').fill(next);
  await page.getByTestId('confirm-password').fill(next);
  await page.getByTestId('new-password-submit').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();

  const after = await browserJson(page, '/api/auth/me');
  expect(after.data.user.role).toBe('admin');
  expect(after.data.user.mustChangePassword).toBe(false);
  const tasks = await browserJson(page, '/api/tasks');
  expect(tasks.status).toBe(200);
});

test('P1-03 Isaiah', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await enterRoom(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('account-chip').click();
  await page.getByTestId('account-menu-users').click();
  await expect(page.getByTestId('admin-users-panel')).toBeVisible();
  await expect(page.getByTestId('must-change-password')).toBeChecked();

  const email = `isaiah-${Date.now()}@test.local`;
  await page.getByTestId('create-user-email').fill(email);
  await page.getByTestId('create-user-name').fill('Isaiah');
  await page.getByTestId('create-user-role').selectOption('player');
  await page.getByTestId('create-user-submit').click();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(8);
  await page.getByTestId('temp-password-copy').click();
  await expect(page.getByTestId('temp-password-copy')).toHaveText('Copied');

  const ctx = await browser.newContext();
  const kid = await ctx.newPage();
  try {
    await kid.goto('/');
    await kid.getByTestId('lobby-login-link').click();
    await kid.getByTestId('login-email').fill(email);
    await kid.getByTestId('login-password').fill(temp);
    await kid.getByTestId('login-submit').click();
    await expect(kid.getByTestId('choose-password-title')).toBeVisible();
    const blocked = await browserJson(kid, '/api/tasks');
    expect(blocked.status).toBe(403);
    await kid.getByTestId('new-password').fill('isaiah-stable-pass');
    await kid.getByTestId('confirm-password').fill('isaiah-stable-pass');
    await kid.getByTestId('new-password-submit').click();
    await expect(kid.getByTestId('login-dialog')).toBeHidden();
    const me = await browserJson(kid, '/api/auth/me');
    expect(me.data.user.role).toBe('player');
    expect(me.data.user.mustChangePassword).toBe(false);
    await expect(kid.getByTestId('lobby-login-link')).toContainText('Hi, Isaiah');
  } finally {
    await ctx.close();
  }
});

test('P1-04 lockout', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  await ensureAdmin(request);
  const email = `lock-${Date.now()}@test.local`;
  const password = 'lockout-test-pass';
  const created = await createUser(request, {
    email,
    name: 'Lockout User',
    role: 'player',
    password,
    mustChangePassword: false,
  });
  const attacker = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    for (let i = 0; i < 5; i += 1) {
      const bad = await loginApi(attacker, email, 'wrong-password-1');
      expect(bad.status()).toBe(401);
    }
    const locked = await loginApi(attacker, email, password);
    expect(locked.status()).toBe(401);
    const lockedBody = await locked.json();
    expect(lockedBody.error).toMatch(/email or password is incorrect/i);
    expect(lockedBody.error).toMatch(/try again in \d+ min/i);

    await page.goto('/');
    await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
    await enterRoom(page);
    await page.getByTestId('account-chip').click();
    await page.getByTestId('account-menu-users').click();
    const row = page.getByTestId(`user-row-${created.user.id}`);
    await expect(row).toContainText('Locked');
    await row.getByRole('button', { name: 'Unlock' }).click();
    await expect(row).not.toContainText('Locked');

    const restored = await loginApi(attacker, email, password);
    expect(restored.ok()).toBeTruthy();
    const restoredBody = await restored.json();
    expect(restoredBody.mustChangePassword).toBe(false);

    const audit = await request.get('/api/admin/audit?limit=200');
    expect(audit.ok()).toBeTruthy();
    const entries = (await audit.json()).entries as { action: string; entityId: string | null }[];
    const mine = entries.filter((entry) => entry.entityId === created.user.id);
    expect(mine.filter((entry) => entry.action === 'auth.login.fail').length).toBeGreaterThanOrEqual(6);
    expect(mine.some((entry) => entry.action === 'auth.login.lockout')).toBeTruthy();
    expect(mine.some((entry) => entry.action === 'auth.unlock')).toBeTruthy();
    expect(mine.some((entry) => entry.action === 'auth.login.success')).toBeTruthy();

    await page.getByTestId('account-chip').click();
    await page.getByTestId('account-menu-audit').click();
    await expect(page.getByTestId('audit-panel')).toBeVisible();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'auth.login.lockout' }).first()).toBeVisible();
  } finally {
    await attacker.dispose();
  }
});

test('P1-05 Isaiah view', async ({ page, request }) => {
  test.setTimeout(90_000);
  const adminMe = await ensureAdmin(request);
  const adminId = adminMe.user?.id || (await (await request.get('/api/auth/me')).json()).user.id;
  const email = `player-${Date.now()}@test.local`;
  const password = 'player-view-pass';
  await createUser(request, {
    email,
    name: 'Player View',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('choose-password-title')).toHaveCount(0);
  await enterRoom(page);
  await expect(page.getByTestId('quick-task-button')).toBeVisible();
  await expect(page.getByTestId('quick-task-button')).toContainText('New Request for Grampa');
  await expect(page.getByTestId('new-idea-button')).toBeVisible();
  await expect(page.getByTestId('new-idea-button')).toContainText('New Idea');
  await expect(page.getByTestId('tasks-panel-toggle')).toHaveCount(0);
  await expect(page.getByTestId('tasks-overdue-badge')).toHaveCount(0);

  await page.keyboard.press('Shift+T');
  await expect(page.getByTestId('quick-task-dialog')).toBeVisible();
  await expect(page.getByTestId('quick-task-dialog-title')).toHaveText('New Request for Grampa');
  await expect(page.getByTestId('quick-task-assignee')).toHaveCount(0);
  await page.getByTestId('quick-task-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('quick-task-dialog')).toHaveCount(0);

  const title = `isaiah-quick-${Date.now()}`;
  const pending = page.waitForResponse((res) => res.url().includes('/api/tasks/quick') && res.request().method() === 'POST');
  await page.getByTestId('quick-task-button').click();
  await page.getByTestId('quick-task-title').fill(title);
  await page.getByTestId('quick-task-submit').click();
  const createdRes = await pending;
  const created = await createdRes.json();
  expect(createdRes.status()).toBe(200);
  expect(Object.keys(created).sort()).toEqual(['id', 'ok']);
  expect(created.ok).toBe(true);
  await expect(page.getByTestId('app-toast')).toHaveText('Task added.');

  const forged = await browserJson(page, '/api/tasks/quick', {
    method: 'POST',
    body: { title: `${title}-forged`, assigneeId: '00000000-0000-4000-8000-000000000099' },
  });
  expect(forged.status).toBe(200);
  expect(Object.keys(forged.data).sort()).toEqual(['id', 'ok']);

  expect((await browserJson(page, '/api/tasks')).status).toBe(403);
  expect((await browserJson(page, `/api/tasks/${created.id}`, { method: 'PATCH', body: { title: 'nope' } })).status).toBe(403);
  expect((await browserJson(page, `/api/tasks/${created.id}/status`, { method: 'POST', body: { status: 'done' } })).status).toBe(403);
  expect((await browserJson(page, '/api/tasks/counts')).status).toBe(403);

  const list = await request.get('/api/tasks');
  expect(list.ok()).toBeTruthy();
  const tasks = (await list.json()).tasks as { id: string; source: string; assigneeId: string | null }[];
  const forgedTask = tasks.find((task) => task.id === forged.data.id);
  expect(forgedTask?.source).toBe('quick');
  expect(forgedTask?.assigneeId).toBe(adminId);
  expect(forgedTask?.assigneeId).not.toBe('00000000-0000-4000-8000-000000000099');

  await page.getByTitle('Hide panel').click();
  await expect(page.getByTestId('quick-task-button-compact')).toBeVisible();
  await expect(page.getByTestId('quick-task-button-compact')).toHaveAttribute('title', 'New Request for Grampa');
  await expect(page.getByTestId('quick-task-button-compact')).toHaveAttribute('aria-label', 'New Request for Grampa');
  await expect(page.getByTestId('new-idea-button-compact')).toBeVisible();
  await expect(page.getByTestId('new-idea-button-compact')).toHaveAttribute('title', 'New Idea');
  await expect(page.getByTestId('new-idea-button-compact')).toHaveAttribute('aria-label', 'New Idea');
});

test('P1-06 admin view', async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  const email = `quick-player-${Date.now()}@test.local`;
  const password = 'quick-player-pass';
  await createUser(request, {
    email,
    name: 'Quick Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await enterRoom(page);
  const me = await browserJson(page, '/api/auth/me');
  const adminId = me.data.user.id as string;
  const before = await browserJson(page, '/api/tasks/counts');
  const overdueBefore = Number(before.data.overdue) || 0;

  await page.getByTestId('tasks-panel-toggle').click();
  await expect(page.getByTestId('tasks-panel')).toBeVisible();
  await page.getByTestId('tasks-tab-all').click();

  const player = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    const login = await loginApi(player, email, password);
    expect(login.ok()).toBeTruthy();
    const title = `live-quick-${Date.now()}`;
    const created = await player.post('/api/tasks/quick', { headers: CSRF, data: { title } });
    expect(created.ok()).toBeTruthy();
    const row = page.locator(`[data-testid="task-row"][data-title="${title}"]`);
    await expect(row).toHaveAttribute('data-source', 'quick');
    await expect(row).toHaveAttribute('data-assignee', adminId);
  } finally {
    await player.dispose();
  }

  const overdueTitle = `live-overdue-${Date.now()}`;
  const made = await browserJson(page, '/api/tasks', {
    method: 'POST',
    body: { title: overdueTitle, dueDate: nyDate(-1), assigneeId: adminId },
  });
  expect(made.status).toBe(201);
  await expect(page.getByTestId('tasks-overdue-badge').first()).toHaveText(String(overdueBefore + 1));
  await expect(page.getByTestId('tasks-overdue-badge').first()).toHaveAttribute('data-tone', 'red');
});

test('P1-07 my tasks', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await enterRoom(page);
  const me = await browserJson(page, '/api/auth/me');
  const adminId = me.data.user.id as string;
  const prefix = `ord-${Date.now()}`;
  const specs = [
    { title: `${prefix}-soon`, dueDate: nyDate(2), priority: 'low', status: 'todo' },
    { title: `${prefix}-undated`, priority: 'low', status: 'todo' },
    { title: `${prefix}-today`, dueDate: nyDate(0), priority: 'low', status: 'todo' },
    { title: `${prefix}-overdue`, dueDate: nyDate(-1), priority: 'low', status: 'in_progress' },
  ];
  for (const spec of specs) {
    const res = await browserJson(page, '/api/tasks', {
      method: 'POST',
      body: { ...spec, assigneeId: adminId },
    });
    expect(res.status).toBe(201);
  }

  await page.getByTestId('tasks-panel-toggle').click();
  await page.getByTestId('tasks-tab-mine').click();
  await expect(page.locator(`[data-title="${prefix}-overdue"]`)).toBeVisible();
  const titles = await page.locator('[data-testid="task-row"]').evaluateAll((nodes) => (
    nodes.map((node) => node.getAttribute('data-title'))
  ));
  const indexOf = (name: string) => titles.indexOf(`${prefix}-${name}`);
  expect(indexOf('overdue')).toBeGreaterThanOrEqual(0);
  expect(indexOf('overdue')).toBeLessThan(indexOf('today'));
  expect(indexOf('today')).toBeLessThan(indexOf('soon'));
  expect(indexOf('soon')).toBeLessThan(indexOf('undated'));

  const row = page.locator(`[data-title="${prefix}-overdue"]`);
  await expect(row).toHaveAttribute('data-status', 'in_progress');
  await row.getByTestId('task-complete').click();
  await expect(page.getByTestId('task-undo')).toBeVisible();
  await page.getByTestId('task-undo-button').click();
  await expect(page.locator(`[data-title="${prefix}-overdue"]`)).toHaveAttribute('data-status', 'in_progress');
});

test('P1-08 anonymous play', async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const roomCode = await createFreshRoom(page);
  await expect(page.getByTestId('quick-task-button')).toHaveCount(0);
  await expect(page.getByTestId('new-idea-button')).toHaveCount(0);
  await page.getByTitle('Hide panel').click();
  await expect(page.getByTestId('quick-task-button-compact')).toHaveCount(0);
  await expect(page.getByTestId('new-idea-button-compact')).toHaveCount(0);
  await page.getByTitle('Show tile palette').click();
  await page.getByRole('button', { name: 'Roads', exact: true }).click();
  const road = page.getByTitle('Straight Road', { exact: true });
  await road.scrollIntoViewIfNeeded();
  await road.click();
  const map = page.getByTestId('map-viewport');
  const before = await map.locator('svg').count();
  await map.click({ position: { x: (2 + 0.5) * 64, y: (2 + 0.5) * 64 } });
  await expect.poll(async () => map.locator('svg').count()).toBeGreaterThan(before);

  await page.getByTitle('Leave Room').click();
  await expect(page.getByTestId('lobby-dialog')).toBeVisible();
  await expect(page.getByText(roomCode, { exact: true })).toBeVisible();
  await page.getByText(roomCode, { exact: true }).click();
  await expect(page.getByTestId('active-room-code')).toHaveText(roomCode);
  await page.getByTitle('Leave Room').click();
  await expect(page.getByTestId('lobby-dialog')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  const row = page.locator('[data-testid="lobby-dialog"] div.group', { hasText: roomCode });
  await row.getByTitle('Delete Room').click({ force: true });
  await page.waitForTimeout(400);
  await expect(page.getByText(roomCode, { exact: true })).toBeVisible();

  const anon = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    const chat = await anon.post('/api/bot/chat', { data: { message: 'hello from anonymous' } });
    expect(chat.status()).toBe(401);

    const escalated = await request.post('/api/bot/chat', {
      headers: CSRF,
      data: { message: 'please escalate this', escalate: true },
    });
    expect(escalated.status()).toBe(200);
    const id = (await escalated.json()).escalate.id as string;
    expect(id).toBeTruthy();

    const missing = await anon.post(`/api/bot/escalate/${id}/reply`, { data: { reply: 'no token' } });
    expect(missing.status()).toBe(401);
    const unknown = await anon.post('/api/bot/escalate/missing-id/reply', { data: { reply: 'no token' } });
    expect(unknown.status()).toBe(401);
    const injected = await anon.post(`/api/bot/escalate/${id}/reply`, {
      headers: { Authorization: `Bearer ${TEST_INJECT_TOKEN}` },
      data: { reply: 'injected reply' },
    });
    expect(injected.status()).toBe(200);
    const open = await anon.get(`/api/bot/escalate/${id}`);
    expect(open.status()).toBe(200);
    expect((await open.json()).reply).toBe('injected reply');
  } finally {
    await anon.dispose();
  }
});

test('P1-09 delete gate', async ({ page }) => {
  const roomCode = await createFreshRoom(page);
  await page.getByTitle('Leave Room').click();
  await expect(page.getByTestId('lobby-dialog')).toBeVisible();
  await expect(page.getByText(roomCode, { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  const row = page.locator('[data-testid="lobby-dialog"] div.group', { hasText: roomCode });
  await row.getByTitle('Delete Room').click({ force: true });
  await page.waitForTimeout(500);
  await expect(page.getByText(roomCode, { exact: true })).toBeVisible();
  await page.getByText(roomCode, { exact: true }).click();
  await expect(page.getByTestId('active-room-code')).toHaveText(roomCode);
});

test('P1-10 overrides', async ({ page, request }) => {
  test.setTimeout(90_000);
  const admin = await ensureAdmin(request);
  const adminId = admin.user?.id || (await (await request.get('/api/auth/me')).json()).user.id;
  const email = `widen-${Date.now()}@test.local`;
  const password = 'widen-player-pass';
  const created = await createUser(request, {
    email,
    name: 'Widen Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await enterRoom(page);
  await expect(page.getByTestId('tasks-panel-toggle')).toHaveCount(0);

  const grant = await request.patch(`/api/admin/users/${created.user.id}`, {
    headers: CSRF,
    data: { permissions: { 'tasks.view': true } },
  });
  expect(grant.ok()).toBeTruthy();
  await expect(page.getByTestId('tasks-panel-toggle')).toBeVisible();
  await page.getByTestId('tasks-panel-toggle').click();
  await expect(page.getByTestId('tasks-panel')).toBeVisible();
  await expect(page.getByTestId('tasks-tab-mine')).toBeVisible();

  const revoke = await request.patch(`/api/admin/users/${created.user.id}`, {
    headers: CSRF,
    data: { permissions: {} },
  });
  expect(revoke.ok()).toBeTruthy();
  await expect(page.getByTestId('tasks-panel-toggle')).toHaveCount(0);

  const ignore = await request.patch(`/api/admin/users/${adminId}`, {
    headers: CSRF,
    data: { permissions: { 'tasks.view': false } },
  });
  expect(ignore.ok()).toBeTruthy();
  const me = await request.get('/api/auth/me');
  expect((await me.json()).perms).toContain('tasks.view');
});

test('P1-11 no-forced-change', async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureAdmin(request);
  const email = `free-${Date.now()}@test.local`;
  const initial = 'free-initial-pass';
  const next = 'free-changed-pass';
  await createUser(request, {
    email,
    name: 'Free Player',
    role: 'player',
    password: initial,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, initial);
  await expect(page.getByTestId('choose-password-title')).toHaveCount(0);
  await expect(page.getByTestId('login-dialog')).toHaveCount(0);
  await expect(page.getByTestId('lobby-login-link')).toContainText('Hi, Free Player');
  await enterRoom(page);
  await page.getByTestId('account-chip').click();
  await page.getByTestId('account-menu-password').click();
  await expect(page.getByTestId('change-password-dialog')).toBeVisible();
  await page.getByTestId('change-password-current').fill(initial);
  await page.getByTestId('change-password-new').fill(next);
  await page.getByTestId('change-password-confirm').fill(next);
  await page.getByTestId('change-password-submit').click();
  await expect(page.getByTestId('change-password-dialog')).toBeHidden();
  await expect(page.getByTestId('app-toast')).toHaveText('Password changed.');

  await page.getByTestId('account-chip').click();
  await page.getByTestId('account-menu-logout').click();
  await expect(page.getByTestId('account-chip')).toHaveText('Log in');
  await page.getByTestId('account-chip').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(next);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('choose-password-title')).toHaveCount(0);
  await expect(page.getByTestId('account-chip')).toHaveAttribute('aria-label', 'Account Free Player');

  const dbPath = freshDbPath('p1-noforce');
  const seedEmail = 'noforce-admin@test.local';
  const seedPassword = 'noforce-initial-pass';
  const env = { email: seedEmail, password: seedPassword, forceChange: '0' as const, name: 'No Force Admin' };
  const first = await bootServer(dbPath, env);
  try {
    const login = await apiLogin(first.port, seedEmail, seedPassword);
    expect(login.status).toBe(200);
    expect(login.data.mustChangePassword).toBe(false);
    expect(login.data.user.role).toBe('admin');
    expect(login.cookie).toContain('gc_session=');
    const tasks = await fetch(`http://127.0.0.1:${first.port}/api/tasks`, {
      headers: { cookie: login.cookie, 'X-GridCity': '1' },
    });
    expect(tasks.status).toBe(200);
    await stopChild(first.child);
    const rows = readUsers(dbPath);
    expect(rows).toHaveLength(1);
    expect(rows[0].must_change_password).toBe(0);
    const hash = rows[0].password_hash;
    const second = await bootServer(dbPath, env);
    try {
      const again = await apiLogin(second.port, seedEmail, seedPassword);
      expect(again.status).toBe(200);
      expect(again.data.mustChangePassword).toBe(false);
      const me = await fetch(`http://127.0.0.1:${second.port}/api/auth/me`, {
        headers: { cookie: again.cookie },
      });
      expect(me.status).toBe(200);
      const meBody = await me.json();
      expect(meBody.user.role).toBe('admin');
      expect(meBody.user.mustChangePassword).toBe(false);
      await stopChild(second.child);
      const after = readUsers(dbPath);
      expect(after).toHaveLength(1);
      expect(after[0].password_hash).toBe(hash);
      expect(after[0].must_change_password).toBe(0);
    } finally {
      await stopChild(second.child);
    }
  } finally {
    await stopChild(first.child);
    removeDb(dbPath);
  }
});

