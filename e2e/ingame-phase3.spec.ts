import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { CSRF, browserJson, createUser, ensureAdmin, enterRoom, loginThroughLobby } from './auth-helpers';
import { TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD } from './auth-constants';

type TaskJson = {
  id: string;
  title: string;
  status: string;
  kind: string;
  source: string;
  criteria: { type?: string } | null;
  checkState: { met: boolean; detail: string; progress: number } | null;
  completedBy: string | null;
  assigneeId: string | null;
  worldId: string | null;
  tags: string[];
};

async function roomCodeOf(page: Page): Promise<string> {
  const code = page.getByTestId('active-room-code');
  await expect(code).toBeVisible();
  const text = (await code.innerText()).trim();
  expect(text.length).toBeGreaterThan(0);
  return text;
}

async function adminSocket(page: Page, baseURL: string): Promise<Socket> {
  const cookies = await page.context().cookies();
  const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const socket = io(baseURL, {
    transports: ['websocket'],
    extraHeaders: { Cookie: header },
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

function tile(type: string, rotation = 0) {
  return [{ type, rotation }];
}

async function createTask(request: APIRequestContext, body: Record<string, unknown>): Promise<TaskJson> {
  const res = await request.post('/api/tasks', { headers: CSRF, data: body });
  const data = await res.json().catch(() => null);
  expect(res.status(), JSON.stringify(data)).toBe(201);
  return data.task as TaskJson;
}

async function taskById(request: APIRequestContext, id: string): Promise<TaskJson | undefined> {
  const res = await request.get('/api/tasks');
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return (data.tasks as TaskJson[]).find((task) => task.id === id);
}

async function checkTask(request: APIRequestContext, id: string) {
  const res = await request.post(`/api/tasks/${id}/check`, { headers: CSRF });
  const data = await res.json().catch(() => null);
  expect(res.status(), JSON.stringify(data)).toBe(200);
  return data as { checkState: { met: boolean; detail: string }; task: TaskJson };
}

async function signIn(page: Page) {
  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
}

async function askBot(page: Page, text: string) {
  await expect(page.getByTestId('bot-chat-loading')).toHaveCount(0);
  await expect(page.getByTestId('bot-chat-executing')).toHaveCount(0);
  await page.getByTestId('bot-chat-input').fill(text);
  await page.getByTestId('bot-chat-send').click();
}

test('P3-01 homes in a region auto-complete', async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  const me = await ensureAdmin(request);
  const adminId = me.user.id as string;
  await signIn(page);
  const room = await roomCodeOf(page);
  const title = `p3-homes-${Date.now()}`;
  const task = await createTask(request, {
    title,
    kind: 'in_game',
    worldId: room,
    aimX: 1,
    aimY: 1,
    assigneeId: adminId,
    priority: 'high',
    criteria: {
      type: 'homes_in_region',
      min: 3,
      region: { minX: 0, minY: 0, maxX: 9, maxY: 9 },
    },
  });

  await page.getByTestId('tasks-panel-toggle').click();
  const row = page.locator(`[data-testid="task-row"][data-title="${title}"]`);
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();

  const socket = await adminSocket(page, baseURL);
  const seen: string[] = [];
  let watch = false;
  socket.on('task-updated', (payload: { id?: string }) => {
    if (watch && payload?.id) seen.push(payload.id);
  });
  try {
    await emitGrid(socket, room, {
      '1,1': tile('building-home'),
      '2,1': tile('building-home'),
      '30,30': tile('building-home'),
    });
    await expect(row.getByTestId('task-progress-chip')).toHaveText('2 / 3 homes', { timeout: 12_000 });
    const mid = await taskById(request, task.id);
    expect(mid?.status).not.toBe('done');
    expect(mid?.checkState?.met).toBe(false);
    expect(mid?.checkState?.detail).toBe('2 / 3 homes');

    await row.getByTestId('task-show-me').click();
    await expect(page.getByTestId('map-viewport')).toHaveAttribute('data-show-aim', '1,1');

    watch = true;
    await emitGrid(socket, room, { '3,1': tile('building-home') });
    await expect.poll(async () => {
      const saved = await taskById(request, task.id);
      return saved?.status === 'done' ? saved.completedBy : '';
    }, { timeout: 5_000 }).toBe('auto');
    expect(seen).toContain(task.id);

    const audit = await request.get('/api/admin/audit?limit=50');
    expect(audit.ok()).toBeTruthy();
    const entries = (await audit.json()).entries as { action: string; entityId: string | null; actorLabel: string | null }[];
    expect(entries.some((entry) => (
      entry.action === 'task.auto_complete' && entry.entityId === task.id && entry.actorLabel === 'auto'
    ))).toBeTruthy();
  } finally {
    socket.close();
  }
});

test('P3-02 road_connected ports', async ({ page, request, baseURL }) => {
  test.setTimeout(45_000);
  await ensureAdmin(request);
  await signIn(page);
  const room = await roomCodeOf(page);
  const socket = await adminSocket(page, baseURL);
  try {
    const straight = {
      '0,0': tile('road-straight', 90),
      '1,0': tile('road-curve', 270),
      '1,1': tile('road-straight', 0),
    };
    await emitGrid(socket, room, straight);
    const linked = await createTask(request, {
      title: `p3-road-${Date.now()}`,
      kind: 'in_game',
      worldId: room,
      criteria: { type: 'road_connected', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    });
    const good = await checkTask(request, linked.id);
    expect(good.checkState.met).toBe(true);
    expect(good.checkState.detail).toBe('connected');
    expect(good.task.status).toBe('done');
    expect(good.task.completedBy).toBe('auto');

    await emitGrid(socket, room, { '1,0': tile('road-cul-de-sac', 0) });
    const broken = await checkTask(request, linked.id);
    expect(broken.checkState.met).toBe(false);
    expect(broken.checkState.detail).toBe('not connected');
    expect(broken.task.status).toBe('done');

    await emitGrid(socket, room, { '1,0': tile('road-curve', 0) });
    const wrong = await createTask(request, {
      title: `p3-road-rot-${Date.now()}`,
      kind: 'in_game',
      worldId: room,
      criteria: { type: 'road_connected', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    });
    const turned = await checkTask(request, wrong.id);
    expect(turned.checkState.met).toBe(false);
    expect(turned.task.status).not.toBe('done');
  } finally {
    socket.close();
  }
});

test('P3-03 bus_line_serves', async ({ page, request, baseURL }) => {
  test.setTimeout(45_000);
  await ensureAdmin(request);
  await signIn(page);
  const room = await roomCodeOf(page);
  const task = await createTask(request, {
    title: `p3-bus-${Date.now()}`,
    kind: 'in_game',
    worldId: room,
    criteria: {
      type: 'bus_line_serves',
      stops: [{ x: 3, y: 1 }, { x: 5, y: 1 }],
      minBuses: 1,
    },
  });
  const socket = await adminSocket(page, baseURL);
  const station = (stops: string[]) => ({
    itemDefs: [],
    buildings: {
      '10,10': {
        anchorKey: '10,10',
        role: 'bus-station',
        inventory: {},
        busFleetIds: stops.length > 1 ? ['bus-1'] : [],
        busRoutes: [{ id: 'route-1', name: 'Route 1', stops }],
      },
    },
    people: {},
  });
  try {
    const missing = await checkTask(request, task.id);
    expect(missing.checkState.met).toBe(false);
    expect(missing.checkState.detail).toBe('0 / 2 stops');

    socket.emit('update-economy', { roomCode: room, economy: station(['3,1']) });
    await expect.poll(async () => (await checkTask(request, task.id)).checkState.detail, { timeout: 4_000 }).toBe('0 / 2 stops');

    socket.emit('update-economy', { roomCode: room, economy: station(['3,1', '5,1']) });
    await expect.poll(async () => {
      const result = await checkTask(request, task.id);
      return `${result.checkState.met}:${result.checkState.detail}`;
    }, { timeout: 4_000 }).toBe('false:0 / 1 buses');

    socket.emit('update-vehicles', {
      roomCode: room,
      vehicles: {
        'bus-1': {
          id: 'bus-1',
          x: 10,
          y: 10,
          heading: 0,
          lane: 1,
          progress: 0,
          color: '#2563eb',
          zIndex: 0,
          type: 'bus',
          isMoving: false,
          speed: 0,
          manualOverride: true,
          busStationKey: '10,10',
          busRouteId: 'route-1',
          busRoute: ['3,1', '5,1'],
        },
      },
    });
    await expect.poll(async () => {
      const result = await checkTask(request, task.id);
      return result.checkState.met ? `${result.task.status}:${result.task.completedBy}:${result.checkState.detail}` : 'open';
    }, { timeout: 4_000 }).toBe('done:auto:1 / 1 buses');
  } finally {
    socket.close();
  }
});

test('P3-04 bot neighborhood completes the task', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  await signIn(page);
  const room = await roomCodeOf(page);
  const task = await createTask(request, {
    title: `p3-neighborhood-${Date.now()}`,
    kind: 'in_game',
    worldId: room,
    aimX: 4,
    aimY: 4,
    criteria: {
      type: 'homes_in_region',
      min: 3,
      region: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
    },
  });

  await page.getByTestId('bot-panel-toggle').click();
  await askBot(page, 'build a neighborhood');
  await expect(page.getByTestId('bot-chat-message').filter({ hasText: /Done near|buildings/ }).last()).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => (await taskById(request, task.id))?.status || '', { timeout: 8_000 }).toBe('done');
  const saved = await taskById(request, task.id);
  expect(saved?.completedBy).toBe('auto');

  const audit = await request.get('/api/admin/audit?limit=80');
  const entries = (await audit.json()).entries as { action: string; entityId: string | null; actorLabel: string | null }[];
  expect(entries.some((entry) => (
    entry.action === 'task.auto_complete' && entry.entityId === task.id && entry.actorLabel === 'gridbot'
  ))).toBeTruthy();
});

test('P3-05 admin lists tasks and a player files a quick task', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const me = await ensureAdmin(request);
  const adminId = me.user.id as string;
  const stamp = Date.now();
  const secret = `p3-secret-water-tower-${stamp}`;
  await createTask(request, {
    title: secret,
    dueDate: '1999-01-01',
    priority: 'high',
    assigneeId: adminId,
  });

  await signIn(page);
  await page.getByTestId('bot-panel-toggle').click();
  await askBot(page, "what's next?");
  await expect(page.getByTestId('bot-chat-message').filter({ hasText: secret }).first()).toBeVisible();

  const email = `isaiah-${stamp}@test.local`;
  const password = 'player-stable-pass';
  await createUser(request, {
    email,
    name: 'Isaiah',
    role: 'player',
    password,
    mustChangePassword: false,
  });
  const ctx = await browser.newContext();
  const kid = await ctx.newPage();
  try {
    await kid.goto('/');
    await loginThroughLobby(kid, email, password);
    await expect(kid.getByTestId('login-dialog')).toBeHidden();
    await enterRoom(kid);
    await kid.getByTestId('bot-panel-toggle').click();
    await askBot(kid, "what's next?");
    await expect(kid.getByTestId('bot-chat-message').filter({ hasText: 'looping path' })).toBeVisible();
    await expect(kid.getByTestId('bot-panel')).not.toContainText(secret);

    await askBot(kid, 'remind Grandpa to get me a train set');
    await expect(
      kid.getByTestId('bot-chat-message').and(kid.locator('[data-role="assistant"]')).filter({ hasText: /train set/i }),
    ).toBeVisible();
    await expect(kid.getByTestId('bot-panel')).not.toContainText(secret);

    expect((await browserJson(kid, '/api/tasks')).status).toBe(403);
    expect((await browserJson(kid, `/api/tasks/${secret}/check`, { method: 'POST' })).status).toBe(403);

    const list = await request.get('/api/tasks');
    const tasks = (await list.json()).tasks as TaskJson[];
    const train = tasks.find((item) => /train set/i.test(item.title));
    expect(train?.source).toBe('quick');
    expect(train?.kind).toBe('real_world');
    expect(train?.criteria).toBeNull();
    expect(train?.assigneeId).toBe(adminId);
    expect(train?.title).toBe('Get me a train set');
    expect(train?.tags).toEqual(['Request']);
  } finally {
    await ctx.close();
  }
});

test('P3-06 suggest_goal waits for confirmation', async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  await signIn(page);
  const titles = async () => {
    const res = await request.get('/api/tasks');
    const tasks = (await res.json()).tasks as TaskJson[];
    return tasks.filter((task) => task.title === 'Connect the neighborhoods').map((task) => task.id);
  };
  const before = await titles();

  await page.getByTestId('bot-panel-toggle').click();
  await askBot(page, 'suggest a goal');
  await expect(page.getByTestId('bot-choice-banner')).toBeVisible();
  await expect(page.getByTestId('bot-choice-option').filter({ hasText: 'Create it' })).toBeVisible();
  expect(await titles()).toEqual(before);

  await page.getByTestId('bot-choice-option').filter({ hasText: 'Create it' }).click();
  await expect(page.getByTestId('bot-chat-message').filter({ hasText: 'Task created.' })).toBeVisible();

  const after = await titles();
  expect(after.length).toBe(before.length + 1);
  const createdId = after.find((id) => !before.includes(id));
  expect(createdId).toBeTruthy();
  const saved = await taskById(request, createdId as string);
  expect(saved?.source).toBe('bot');
  expect(saved?.kind).toBe('in_game');
  expect(saved?.criteria?.type).toBe('road_connected');
});
