import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { CSRF, browserJson, createUser, ensureAdmin, enterRoom, loginThroughLobby } from './auth-helpers';

async function roomCodeOf(page: Page): Promise<string> {
  const code = page.getByTestId('active-room-code');
  await expect(code).toBeVisible();
  const text = (await code.innerText()).trim();
  expect(text.length).toBeGreaterThan(0);
  return text;
}

async function pageSocket(page: Page, baseURL: string): Promise<Socket> {
  const cookies = await page.context().cookies();
  const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const socket = io(baseURL, {
    transports: ['websocket'],
    extraHeaders: header ? { Cookie: header } : undefined,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

function emitGrid(socket: Socket, room: string, updates: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('grid-update-ack timeout')), 8_000);
    socket.once('grid-update-ack', (ack: { accepted?: Record<string, unknown> }) => {
      clearTimeout(timer);
      const keys = ack?.accepted ? Object.keys(ack.accepted) : [];
      if (!keys.length) reject(new Error(`grid update rejected ${JSON.stringify(ack)}`));
      else resolve();
    });
    socket.emit('update-grid', { roomCode: room, updates });
  });
}

function homeTile() {
  return [{ type: 'building-home', rotation: 0 }];
}

async function titlesOf(request: APIRequestContext, title: string): Promise<string[]> {
  const res = await request.get('/api/tasks');
  expect(res.ok()).toBeTruthy();
  const tasks = (await res.json()).tasks as { id: string; title: string }[];
  return tasks.filter((task) => task.title === title).map((task) => task.id);
}

async function askBot(page: Page, text: string) {
  await expect(page.getByTestId('bot-chat-loading')).toHaveCount(0);
  await expect(page.getByTestId('bot-chat-executing')).toHaveCount(0);
  await page.getByTestId('bot-chat-input').fill(text);
  await page.getByTestId('bot-chat-send').click();
}

test('P4-01 player My Tasks complete and undo', async ({ page, request }) => {
  test.setTimeout(90_000);
  const admin = await ensureAdmin(request);
  const adminId = admin.user.id as string;
  const stamp = Date.now();
  const email = `kid-${stamp}@test.local`;
  const password = 'kid-player-pass';
  const created = await createUser(request, {
    email,
    name: 'Kid Player',
    role: 'player',
    password,
    mustChangePassword: false,
    permissions: { 'tasks.view': true, 'tasks.edit': true, 'goals.view': true },
  });

  const title = `p4-mine-${stamp}`;
  const mine = await request.post('/api/tasks', {
    headers: CSRF,
    data: { title, assigneeId: created.user.id, status: 'todo' },
  });
  expect(mine.status()).toBe(201);
  const secretTitle = `p4-secret-${stamp}`;
  const secret = await request.post('/api/tasks', {
    headers: CSRF,
    data: { title: secretTitle, assigneeId: adminId, status: 'todo' },
  });
  expect(secret.status()).toBe(201);
  const secretId = (await secret.json()).task.id as string;

  const goalTitle = `p4-goal-${stamp}`;
  const goal = await request.post('/api/goals', {
    headers: CSRF,
    data: { title: goalTitle, icon: '🌟' },
  });
  expect(goal.status()).toBe(201);

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await expect(page.getByTestId('quick-task-button')).toBeVisible();
  await expect(page.getByTestId('tasks-panel-toggle')).toBeVisible();
  await page.getByTestId('tasks-panel-toggle').click();
  await expect(page.getByTestId('tasks-panel')).toBeVisible();
  await expect(page.getByTestId('tasks-tab-mine')).toBeVisible();
  await expect(page.getByTestId('tasks-tab-all')).toHaveCount(0);

  const row = page.locator(`[data-testid="task-row"][data-title="${title}"]`);
  await expect(row).toBeVisible();
  await expect(page.locator(`[data-testid="task-row"][data-title="${secretTitle}"]`)).toHaveCount(0);

  const blocked = await browserJson(page, `/api/tasks/${secretId}/status`, {
    method: 'POST',
    body: { status: 'done' },
  });
  expect(blocked.status).toBe(403);
  const listed = await browserJson(page, '/api/tasks');
  expect(listed.status).toBe(200);
  const seen = (listed.data.tasks as { title: string }[]).map((task) => task.title);
  expect(seen).toContain(title);
  expect(seen).not.toContain(secretTitle);

  await row.getByTestId('task-complete').click();
  await expect(page.getByTestId('task-undo')).toBeVisible();
  await expect(page.getByTestId('task-undo-button')).toHaveText('Undo');
  await page.getByTestId('task-undo-button').click();
  await expect(row.getByTestId('task-complete')).toBeVisible();

  await page.getByTestId('goals-tab').click();
  const card = page.locator(`[data-testid="goal-card"][data-title="${goalTitle}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-variant', 'friendly');
  await expect(card.getByTestId('goal-icon')).toHaveText('🌟');

  const before = await titlesOf(request, 'Connect the neighborhoods');
  await page.getByTestId('bot-panel-toggle').click();
  await askBot(page, 'suggest a goal');
  await expect(page.getByTestId('bot-choice-banner')).toBeVisible();
  await expect(page.getByTestId('bot-choice-option').filter({ hasText: 'Create it' })).toBeVisible();
  expect(await titlesOf(request, 'Connect the neighborhoods')).toEqual(before);
  await page.getByTestId('bot-choice-option').filter({ hasText: 'Not now' }).click();
  await expect(page.getByTestId('bot-chat-message').filter({ hasText: 'will not create' })).toBeVisible();
  expect(await titlesOf(request, 'Connect the neighborhoods')).toEqual(before);
});

test('P4-02 in-game auto-complete celebrates in the room', async ({ page, request, browser, baseURL }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `party-${stamp}@test.local`;
  const password = 'party-player-pass';
  await createUser(request, {
    email,
    name: 'Party Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  const room = await roomCodeOf(page);
  await expect(page.getByTestId('tasks-panel-toggle')).toHaveCount(0);

  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  const socket = await pageSocket(page, baseURL);
  try {
    await anon.goto('/');
    const roomRow = anon.getByText(room, { exact: true });
    await expect(roomRow).toBeVisible();
    await roomRow.click();
    await expect(anon.getByTestId('active-room-code')).toHaveText(room);

    const task = await request.post('/api/tasks', {
      headers: CSRF,
      data: {
        title: `p4-party-${stamp}`,
        kind: 'in_game',
        worldId: room,
        criteria: {
          type: 'homes_in_region',
          min: 3,
          region: { minX: 0, minY: 0, maxX: 9, maxY: 9 },
        },
      },
    });
    expect(task.status()).toBe(201);

    socket.emit('join-room', room);
    await emitGrid(socket, room, {
      '1,1': homeTile(),
      '2,1': homeTile(),
      '3,1': homeTile(),
    });

    await expect(page.getByTestId('celebrate-banner')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('celebrate-banner')).toContainText('🎉 You built it!');
    await expect(page.getByTestId('confetti')).toBeVisible();
    await expect(page.getByTestId('celebrate-stars')).toHaveText('★ 1');
    await expect(anon.getByTestId('celebrate-banner')).toBeVisible();
    await expect(anon.getByTestId('confetti')).toBeVisible();
  } finally {
    socket.close();
    await anonContext.close();
  }
});

test('P4-03 default player still sees only Quick task', async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `plain-${stamp}@test.local`;
  const password = 'plain-player-pass';
  await createUser(request, {
    email,
    name: 'Plain Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await expect(page.getByTestId('quick-task-button')).toBeVisible();
  await expect(page.getByTestId('tasks-panel-toggle')).toHaveCount(0);
  await expect(page.getByTestId('tasks-panel')).toHaveCount(0);
  await expect(page.getByTestId('celebrate-banner')).toHaveCount(0);
  await expect(page.getByTestId('goals-tab')).toHaveCount(0);

  expect((await browserJson(page, '/api/tasks')).status).toBe(403);
  expect((await browserJson(page, '/api/tasks/counts')).status).toBe(403);
  expect((await browserJson(page, '/api/goals')).status).toBe(403);
  expect((await browserJson(page, '/api/projects')).status).toBe(403);

  const before = await titlesOf(request, 'Connect the neighborhoods');
  await page.getByTestId('bot-panel-toggle').click();
  await askBot(page, 'suggest a goal');
  await expect(page.getByTestId('bot-chat-message').filter({ hasText: 'looping path' })).toBeVisible();
  await expect(page.getByTestId('bot-choice-banner')).toHaveCount(0);
  expect(await titlesOf(request, 'Connect the neighborhoods')).toEqual(before);
});
