import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD } from './auth-constants';
import { CSRF, createUser, ensureAdmin, enterRoom, loginApi, loginThroughLobby } from './auth-helpers';

type TaskJson = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  recurrence: string;
  archivedAt: number | null;
  goalIds: string[];
  projectIds: string[];
};

type GoalJson = {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  progressMode: string;
  projectIds: string[];
  taskIds: string[];
  targetAmount: number | null;
  currentAmount: number | null;
};

type ProjectJson = {
  id: string;
  name: string;
  progress: number | null;
  taskIds: string[];
  status: string;
};

async function readJson(res: APIResponse) {
  const data = await res.json().catch(() => null);
  return { status: res.status(), data };
}

async function createTask(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await readJson(await request.post('/api/tasks', { headers: CSRF, data: body }));
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.task as TaskJson;
}

async function createProject(request: APIRequestContext, name: string) {
  const res = await readJson(await request.post('/api/projects', { headers: CSRF, data: { name } }));
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.project as ProjectJson;
}

async function createGoal(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await readJson(await request.post('/api/goals', { headers: CSRF, data: body }));
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.goal as GoalJson;
}

async function openAdminTab(page: Page, tab: 'goals-tab' | 'projects-tab') {
  await page.goto('/');
  await loginThroughLobby(page, TEST_ADMIN_EMAIL, TEST_ADMIN_STABLE_PASSWORD);
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await enterRoom(page);
  await expect(page.getByTestId('tasks-panel-toggle')).toBeVisible();
  await page.getByTestId('tasks-panel-toggle').click();
  await expect(page.getByTestId('tasks-panel')).toBeVisible();
  await page.getByTestId(tab).click();
}

test('P2-01 project percent', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const name = `p2-project-${stamp}`;
  const project = await createProject(request, name);
  expect(project.progress).toBeNull();

  const tasks = await Promise.all([
    createTask(request, { title: `${name}-done-a`, status: 'done' }),
    createTask(request, { title: `${name}-done-b`, status: 'done' }),
    createTask(request, { title: `${name}-progress`, status: 'in_progress' }),
    createTask(request, { title: `${name}-todo`, status: 'todo' }),
  ]);
  const linked = await readJson(await request.put(`/api/projects/${project.id}/links`, {
    headers: CSRF,
    data: { taskIds: tasks.map((task) => task.id) },
  }));
  expect(linked.status, JSON.stringify(linked.data)).toBe(200);
  expect(linked.data.project.progress).toBe(63);
  expect(linked.data.project.taskIds).toHaveLength(4);

  const listed = await readJson(await request.get('/api/projects'));
  const found = (listed.data.projects as ProjectJson[]).find((item) => item.id === project.id);
  expect(found?.progress).toBe(63);

  await openAdminTab(page, 'projects-tab');
  const row = page.locator(`[data-testid="project-row"][data-name="${name}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('project-progress')).toContainText('63%');
  await expect(row.getByTestId('project-progress')).toHaveAttribute('data-progress', '63');
});

test('P2-02 goal percent and auto-achieve', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const project = await createProject(request, `p2-goal-project-${stamp}`);
  const doneA = await createTask(request, { title: `p2-goal-done-a-${stamp}`, status: 'done' });
  const doneB = await createTask(request, { title: `p2-goal-done-b-${stamp}`, status: 'done' });
  const underway = await createTask(request, { title: `p2-goal-progress-${stamp}`, status: 'in_progress' });
  const todo = await createTask(request, { title: `p2-goal-todo-${stamp}`, status: 'todo' });
  const direct = await createTask(request, { title: `p2-goal-direct-${stamp}`, status: 'done' });
  const linked = await readJson(await request.put(`/api/projects/${project.id}/links`, {
    headers: CSRF,
    data: { taskIds: [doneA.id, doneB.id, underway.id, todo.id] },
  }));
  expect(linked.data.project.progress).toBe(63);

  const title = `p2-goal-${stamp}`;
  const goal = await createGoal(request, { title, icon: '🎯', progressMode: 'auto' });
  const withLinks = await readJson(await request.put(`/api/goals/${goal.id}/links`, {
    headers: CSRF,
    data: { projectIds: [project.id], taskIds: [direct.id] },
  }));
  expect(withLinks.status, JSON.stringify(withLinks.data)).toBe(200);
  expect(withLinks.data.goal.progress).toBe(81);
  expect(withLinks.data.goal.status).toBe('active');

  await openAdminTab(page, 'goals-tab');
  const card = page.locator(`[data-testid="goal-card"][data-title="${title}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('goal-progress')).toContainText('81%');
  await expect(card.getByTestId('goal-progress')).toHaveAttribute('data-progress', '81');
  await card.getByTestId('goal-card-toggle').click();
  await expect(card.locator('[data-testid="goal-linked-project"]')).toHaveAttribute('data-progress', '63');
  const todoRow = card.locator(`[data-testid="goal-linked-task"][data-title="${todo.title}"]`);
  await todoRow.getByTestId('task-complete').click();
  await expect(todoRow.getByTestId('task-complete')).toHaveCount(0);

  const finished = await readJson(await request.post(`/api/tasks/${underway.id}/status`, {
    headers: CSRF,
    data: { status: 'done' },
  }));
  expect(finished.status, JSON.stringify(finished.data)).toBe(200);

  await page.getByTestId('tasks-tab-mine').click();
  await page.getByTestId('goals-tab').click();
  await expect(card.getByTestId('goal-progress')).toContainText('100%');
  await expect(card).toHaveAttribute('data-status', 'achieved');

  const again = await readJson(await request.get('/api/goals'));
  const saved = (again.data.goals as GoalJson[]).find((item) => item.id === goal.id);
  expect(saved?.progress).toBe(100);
  expect(saved?.status).toBe('achieved');

  const audit = await readJson(await request.get('/api/admin/audit?limit=200'));
  const entries = audit.data.entries as { action: string; entityId: string | null }[];
  expect(entries.some((entry) => entry.action === 'goal.achieved' && entry.entityId === goal.id)).toBeTruthy();
});

test('P2-03 manual mode ignores linked tasks', async ({ request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const project = await createProject(request, `p2-manual-project-${stamp}`);
  const done = await createTask(request, { title: `p2-manual-done-${stamp}`, status: 'done' });
  const todo = await createTask(request, { title: `p2-manual-todo-${stamp}`, status: 'todo' });
  await request.put(`/api/projects/${project.id}/links`, { headers: CSRF, data: { taskIds: [done.id] } });
  const goal = await createGoal(request, {
    title: `p2-manual-${stamp}`,
    progressMode: 'manual',
    targetAmount: 500,
    currentAmount: 125,
    unit: 'people',
  });
  const linked = await readJson(await request.put(`/api/goals/${goal.id}/links`, {
    headers: CSRF,
    data: { projectIds: [project.id], taskIds: [done.id, todo.id] },
  }));
  expect(linked.data.goal.progress).toBe(25);
  expect(linked.data.goal.status).toBe('active');

  const completed = await readJson(await request.post(`/api/tasks/${todo.id}/status`, {
    headers: CSRF,
    data: { status: 'done' },
  }));
  expect(completed.status).toBe(200);
  const again = await readJson(await request.get('/api/goals'));
  const saved = (again.data.goals as GoalJson[]).find((item) => item.id === goal.id);
  expect(saved?.progress).toBe(25);
  expect(saved?.status).toBe('active');
  expect(saved?.progressMode).toBe('manual');
});

test('P2-04 weekly recurrence copies both links', async ({ request }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const stamp = Date.now();
  const title = `p2-weekly-${stamp}`;
  const goal = await createGoal(request, { title: `p2-weekly-goal-${stamp}` });
  const project = await createProject(request, `p2-weekly-project-${stamp}`);
  const task = await createTask(request, {
    title,
    status: 'todo',
    recurrence: 'weekly',
    dueDate: '2026-06-01',
    goalIds: [goal.id],
    projectIds: [project.id],
  });
  expect(task.goalIds).toContain(goal.id);
  expect(task.projectIds).toContain(project.id);

  const done = await readJson(await request.post(`/api/tasks/${task.id}/status`, {
    headers: CSRF,
    data: { status: 'done' },
  }));
  expect(done.status, JSON.stringify(done.data)).toBe(200);
  expect(done.data.task.status).toBe('done');
  expect(done.data.task.archivedAt).toBeTruthy();
  expect(done.data.task.dueDate).toBe('2026-06-01');
  expect(done.data.spawnedTaskId).toBeTruthy();

  const listed = await readJson(await request.get('/api/tasks'));
  const rows = (listed.data.tasks as TaskJson[]).filter((item) => item.title === title);
  expect(rows).toHaveLength(2);
  const next = rows.find((item) => item.id === done.data.spawnedTaskId);
  const original = rows.find((item) => item.id === task.id);
  expect(next?.status).toBe('todo');
  expect(next?.recurrence).toBe('weekly');
  expect(next?.dueDate).toBe('2026-06-08');
  expect(next?.archivedAt).toBeNull();
  expect(next?.goalIds).toContain(goal.id);
  expect(next?.projectIds).toContain(project.id);
  expect(original?.status).toBe('done');
  expect(original?.goalIds).toContain(goal.id);
  expect(original?.projectIds).toContain(project.id);
});

test('P2-05 player forbidden on goals and projects', async ({ request, baseURL }) => {
  test.setTimeout(60_000);
  await ensureAdmin(request);
  const email = `p2-player-${Date.now()}@test.local`;
  const password = 'player-phase2-pass';
  await createUser(request, {
    email,
    name: 'Phase Two Player',
    role: 'player',
    password,
    mustChangePassword: false,
  });

  const player = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    const login = await loginApi(player, email, password);
    expect(login.ok()).toBeTruthy();
    const missing = '00000000-0000-4000-8000-0000000000aa';
    const calls: { method: 'get' | 'post' | 'patch' | 'delete' | 'put'; path: string; data?: object }[] = [
      { method: 'get', path: '/api/goals' },
      { method: 'post', path: '/api/goals', data: { title: 'Nope' } },
      { method: 'patch', path: `/api/goals/${missing}`, data: { title: 'Nope' } },
      { method: 'delete', path: `/api/goals/${missing}` },
      { method: 'put', path: `/api/goals/${missing}/links`, data: { projectIds: [], taskIds: [] } },
      { method: 'get', path: '/api/projects' },
      { method: 'post', path: '/api/projects', data: { name: 'Nope' } },
      { method: 'patch', path: `/api/projects/${missing}`, data: { name: 'Nope' } },
      { method: 'delete', path: `/api/projects/${missing}` },
      { method: 'put', path: `/api/projects/${missing}/links`, data: { taskIds: [] } },
    ];
    for (const call of calls) {
      const res = await player[call.method](call.path, { headers: CSRF, data: call.data });
      const body = await res.json().catch(() => null);
      expect(res.status(), `${call.method} ${call.path} ${JSON.stringify(body)}`).toBe(403);
      expect(body?.error, `${call.method} ${call.path}`).toBe('forbidden');
    }
  } finally {
    await player.dispose();
  }
});
