import { expect, request as playwrightRequest, test } from '@playwright/test';
import { TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD } from './auth-constants';
import {
  CSRF,
  browserJson,
  createUser,
  ensureAdmin,
  enterRoom,
  loginApi,
  loginThroughLobby,
} from './auth-helpers';
import { createFreshRoom } from './helpers';

type TaskJson = {
  id: string;
  title: string;
  source: string;
  tags: string[];
};

async function listTasks(request: { get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<{ tasks: TaskJson[] }> }> }) {
  const res = await request.get('/api/tasks');
  expect(res.ok()).toBeTruthy();
  return (await res.json()).tasks;
}

test('player Request and Idea buttons tag tasks for the admin', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `req-idea-${stamp}@test.local`;
  const password = 'req-idea-pass';
  await createUser(request, {
    email,
    name: 'Request Idea Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await page.getByTestId('tasks-panel-toggle').click();
  await expect(page.getByTestId('tasks-panel')).toBeVisible();
  await page.getByTestId('tasks-tab-all').click();
  await expect(page.getByTestId('tasks-all-quick')).toHaveText('New Request');

  const ctx = await browser.newContext();
  const kid = await ctx.newPage();
  try {
    await kid.goto('/');
    await loginThroughLobby(kid, email, password);
    await expect(kid.getByTestId('login-dialog')).toBeHidden();
    await enterRoom(kid);
    await expect(kid.getByTestId('quick-task-button')).toBeVisible();
    await expect(kid.getByTestId('quick-task-button')).toContainText('New Request for Grampa');
    await expect(kid.getByTestId('new-idea-button')).toBeVisible();
    await expect(kid.getByTestId('new-idea-button')).toContainText('New Idea');

    const requestTitle = `grampa-request-${stamp}`;
    await kid.getByTestId('quick-task-button').click();
    await expect(kid.getByTestId('quick-task-dialog')).toBeVisible();
    await expect(kid.getByTestId('quick-task-dialog-title')).toHaveText('New Request for Grampa');
    await expect(kid.getByTestId('quick-task-dialog')).toHaveAttribute('data-mode', 'request');
    await kid.getByTestId('quick-task-title').fill(requestTitle);
    await kid.getByTestId('quick-task-submit').click();
    await expect(kid.getByTestId('quick-task-dialog')).toHaveCount(0);

    const requestRow = page.locator(`[data-testid="task-row"][data-title="${requestTitle}"]`);
    await expect(requestRow).toBeVisible();
    await expect(requestRow.getByTestId('task-tag')).toHaveText('Request');
    const requestTasks = await listTasks(request);
    const requestTask = requestTasks.find((task) => task.title === requestTitle);
    expect(requestTask?.source).toBe('quick');
    expect(requestTask?.tags).toEqual(['Request']);

    await requestRow.click();
    await expect(page.getByTestId('task-dialog').getByTestId('task-tag')).toHaveText('Request');
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click();

    const ideaTitle = `grampa-idea-${stamp}`;
    await kid.getByTestId('new-idea-button').click();
    await expect(kid.getByTestId('quick-task-dialog')).toBeVisible();
    await expect(kid.getByTestId('quick-task-dialog-title')).toHaveText('New Idea');
    await expect(kid.getByTestId('quick-task-dialog')).toHaveAttribute('data-mode', 'idea');
    await kid.getByTestId('quick-task-title').fill(ideaTitle);
    await kid.getByTestId('quick-task-submit').click();
    await expect(kid.getByTestId('quick-task-dialog')).toHaveCount(0);

    const ideaRow = page.locator(`[data-testid="task-row"][data-title="${ideaTitle}"]`);
    await expect(ideaRow).toBeVisible();
    await expect(ideaRow.getByTestId('task-tag')).toHaveText('Idea');
    const ideaTasks = await listTasks(request);
    const ideaTask = ideaTasks.find((task) => task.title === ideaTitle);
    expect(ideaTask?.source).toBe('quick');
    expect(ideaTask?.tags).toEqual(['Idea']);
  } finally {
    await ctx.close();
  }
});

test('quick route rejects forged source and never stores client tags', async ({ request, baseURL }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `forge-tags-${stamp}@test.local`;
  const password = 'forge-tags-pass';
  await createUser(request, {
    email,
    name: 'Forge Tags',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  const player = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    const login = await loginApi(player, email, password);
    expect(login.ok()).toBeTruthy();

    const hacked = await player.post('/api/tasks/quick', {
      headers: CSRF,
      data: { title: `hack-${stamp}`, source: 'hack', tags: ['X'] },
    });
    expect(hacked.status()).toBe(400);
    const hackBody = await hacked.json();
    expect(hackBody.error).toMatch(/invalid source/i);

    const afterHack = await listTasks(request);
    expect(afterHack.some((task) => task.title === `hack-${stamp}`)).toBeFalsy();
    expect(afterHack.some((task) => task.tags?.includes('X'))).toBeFalsy();

    const coerced = await player.post('/api/tasks/quick', {
      headers: CSRF,
      data: { title: `coerced-${stamp}`, source: 'request', tags: ['X'] },
    });
    expect(coerced.ok()).toBeTruthy();
    const coercedId = (await coerced.json()).id as string;
    const coercedTask = (await listTasks(request)).find((task) => task.id === coercedId);
    expect(coercedTask?.source).toBe('quick');
    expect(coercedTask?.tags).toEqual(['Request']);
    expect(coercedTask?.tags).not.toContain('X');

    const ideaCoerced = await player.post('/api/tasks/quick', {
      headers: CSRF,
      data: { title: `idea-coerced-${stamp}`, source: 'idea', tags: ['Hack'] },
    });
    expect(ideaCoerced.ok()).toBeTruthy();
    const ideaId = (await ideaCoerced.json()).id as string;
    const ideaTask = (await listTasks(request)).find((task) => task.id === ideaId);
    expect(ideaTask?.tags).toEqual(['Idea']);
  } finally {
    await player.dispose();
  }

  const form = await request.post('/api/tasks', {
    headers: CSRF,
    data: { title: `form-tags-${stamp}`, tags: ['X', 'Idea'] },
  });
  expect(form.status()).toBe(201);
  const formTask = (await form.json()).task as TaskJson;
  expect(formTask.tags).toEqual([]);
});

test('Shift+T opens the Request dialog', async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `shift-t-${stamp}@test.local`;
  const password = 'shift-t-pass';
  await createUser(request, {
    email,
    name: 'Shift T Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await page.keyboard.press('Shift+T');
  await expect(page.getByTestId('quick-task-dialog')).toBeVisible();
  await expect(page.getByTestId('quick-task-dialog-title')).toHaveText('New Request for Grampa');
  await expect(page.getByTestId('quick-task-dialog')).toHaveAttribute('data-mode', 'request');
});

test('untagged tasks still render and anonymous users see neither button', async ({ page, request, browser }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const title = `untagged-${stamp}`;
  const created = await request.post('/api/tasks', {
    headers: CSRF,
    data: { title },
  });
  expect(created.status()).toBe(201);
  const task = (await created.json()).task as TaskJson;
  expect(task.tags).toEqual([]);

  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await page.getByTestId('tasks-panel-toggle').click();
  await page.getByTestId('tasks-tab-all').click();
  const row = page.locator(`[data-testid="task-row"][data-title="${title}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('task-tag')).toHaveCount(0);

  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  try {
    const roomCode = await createFreshRoom(anon);
    expect(roomCode.length).toBeGreaterThan(0);
    await expect(anon.getByTestId('quick-task-button')).toHaveCount(0);
    await expect(anon.getByTestId('new-idea-button')).toHaveCount(0);
    await anon.getByTitle('Hide panel').click();
    await expect(anon.getByTestId('quick-task-button-compact')).toHaveCount(0);
    await expect(anon.getByTestId('new-idea-button-compact')).toHaveCount(0);
  } finally {
    await anonContext.close();
  }
});

test('player browser cannot persist forged tags on the quick route', async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const email = `browser-forge-${stamp}@test.local`;
  const password = 'browser-forge-pass';
  await createUser(request, {
    email,
    name: 'Browser Forge',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  await page.goto('/');
  await loginThroughLobby(page, email, password);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);

  const forged = await browserJson(page, '/api/tasks/quick', {
    method: 'POST',
    body: { title: `browser-hack-${stamp}`, source: 'hack', tags: ['X'] },
  });
  expect(forged.status).toBe(400);

  const coerced = await browserJson(page, '/api/tasks/quick', {
    method: 'POST',
    body: { title: `browser-coerced-${stamp}`, source: 'idea', tags: ['X'] },
  });
  expect(coerced.status).toBe(200);
  const stored = (await listTasks(request)).find((task) => task.id === coerced.data.id);
  expect(stored?.tags).toEqual(['Idea']);
  expect(stored?.source).toBe('quick');
});
