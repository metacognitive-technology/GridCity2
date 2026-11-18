import type { Express } from 'express';
import type { Database } from 'better-sqlite3';
import type { Server } from 'socket.io';
import { audit } from '../auth/audit.ts';
import { asyncRoute, gcUser } from '../auth/guards.ts';
import { can } from '../auth/permissions.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { taskCounts, taskCountsForAssignee } from './counts.ts';
import { addDays, dueBucket, todayISO, type DueBucket } from './due.ts';
import { idsExist, parseIdList, replaceTaskGoals, replaceTaskProjects, taskLinkMap } from './links.ts';
import { publishTaskChange } from './notify.ts';
import { spawnNextOccurrence } from './recurrence.ts';
import { withGoalAchievements } from './rollup.ts';
import { checkTaskNow } from './checker.ts';
import { parseCriteria } from '../../src/shared/taskCriteria.ts';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const KINDS = ['real_world', 'in_game'] as const;
const RECURRENCE = ['none', 'daily', 'weekly', 'monthly'] as const;
const OPEN = `t.archived_at IS NULL AND t.status IN ('todo','in_progress','blocked')`;
const HOUR_MS = 60 * 60 * 1000;
const QUICK_LIMIT = 20;

type Status = (typeof STATUSES)[number];
type Priority = (typeof PRIORITIES)[number];
type Kind = (typeof KINDS)[number];
type Recurrence = (typeof RECURRENCE)[number];

export function registerTaskRoutes(app: Express, ctx: { db: Database; io: Server }) {
  const { db, io } = ctx;

  app.get('/api/tasks/counts', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.view');
    if (!user) return;
    return res.json(user.role === 'admin' ? taskCounts(db) : taskCountsForAssignee(db, user.id));
  }));

  app.get('/api/tasks', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.view');
    if (!user) return;
    const today = todayISO();
    const where: string[] = [];
    const args: unknown[] = [];
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const assignee = typeof req.query.assignee === 'string' ? req.query.assignee : '';
    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
    const due = typeof req.query.due === 'string' ? req.query.due : '';
    const world = typeof req.query.world === 'string' ? req.query.world : '';

    if (status === 'open') {
      where.push(`t.status IN ('todo','in_progress','blocked')`, 't.archived_at IS NULL');
    } else if ((STATUSES as readonly string[]).includes(status)) {
      where.push('t.status = ?');
      args.push(status);
    }
    if (user.role !== 'admin') {
      where.push('t.assignee_id = ?');
      args.push(user.id);
    } else if (assignee === 'me') {
      where.push('t.assignee_id = ?');
      args.push(user.id);
    } else if (assignee === 'unassigned') {
      where.push('t.assignee_id IS NULL');
    } else if (assignee) {
      where.push('t.assignee_id = ?');
      args.push(assignee);
    }
    if ((KINDS as readonly string[]).includes(kind)) {
      where.push('t.kind = ?');
      args.push(kind);
    }
    if (due === 'overdue') {
      where.push(`${OPEN} AND t.due_date IS NOT NULL AND t.due_date < ?`);
      args.push(today);
    } else if (due === 'today') {
      where.push(`${OPEN} AND t.due_date = ?`);
      args.push(today);
    } else if (due === 'soon') {
      where.push(`${OPEN} AND t.due_date > ? AND t.due_date <= ?`);
      args.push(today, addDays(today, 3));
    } else if (due === 'none') {
      where.push('t.due_date IS NULL');
    }
    if (world) {
      where.push('t.world_id = ?');
      args.push(world);
    }
    const goal = typeof req.query.goal === 'string' ? req.query.goal : '';
    const project = typeof req.query.project === 'string' ? req.query.project : '';
    if (goal) {
      where.push('EXISTS (SELECT 1 FROM task_goals tg WHERE tg.task_id = t.id AND tg.goal_id = ?)');
      args.push(goal);
    }
    if (project) {
      where.push('EXISTS (SELECT 1 FROM task_projects tp WHERE tp.task_id = t.id AND tp.project_id = ?)');
      args.push(project);
    }

    const sql = `
      SELECT t.*, au.name AS assignee_name, cu.name AS created_by_name
      FROM tasks t
      LEFT JOIN users au ON au.id = t.assignee_id
      LEFT JOIN users cu ON cu.id = t.created_by_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.created_at DESC`;
    const rows = db.prepare(sql).all(...args) as TaskRow[];
    const comments = commentsByTask(db, rows.map((row) => row.id));
    const links = taskLinkMap(db, rows.map((row) => row.id));
    const people = user.role === 'admin'
      ? db.prepare(
        'SELECT id, name FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE',
      ).all() as { id: string; name: string }[]
      : [{ id: user.id, name: user.name }];
    return res.json({
      tasks: rows.map((row) => mapTask(row, comments.get(row.id) || [], today, links.get(row.id))),
      people,
    });
  }));

  app.post('/api/tasks/quick', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.create');
    if (!user) return;
    if (user.role !== 'admin' && createsInLastHour(db, user.id) >= QUICK_LIMIT) {
      return res.status(429).json({ error: 'Too many tasks. Try again later.' });
    }
    const title = cleanTitle(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Title must be 1-140 characters' });
    const notes = cleanNotes(req.body?.notes ?? req.body?.description);
    if (notes == null) return res.status(400).json({ error: 'Notes are too long' });
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const assignee = pickAssignee(db, user, body);
    if (assignee === 'invalid') return res.status(400).json({ error: 'invalid assignee' });
    let kind: Kind = 'real_world';
    let worldId: string | null = null;
    let aimX: number | null = null;
    let aimY: number | null = null;
    if (can(user, 'tasks.edit') && (body.kind === 'real_world' || body.kind === 'in_game')) {
      kind = body.kind;
    }
    if (can(user, 'tasks.edit') && kind === 'in_game') {
      if (typeof body.worldId === 'string' && body.worldId.trim()) worldId = body.worldId.trim().slice(0, 80);
      if (typeof body.aimX === 'number' && Number.isFinite(body.aimX)) aimX = Math.trunc(body.aimX);
      if (typeof body.aimY === 'number' && Number.isFinite(body.aimY)) aimY = Math.trunc(body.aimY);
    }
    const id = insertTask(db, {
      title,
      description: notes,
      kind,
      priority: 'medium',
      dueDate: null,
      assigneeId: assignee,
      createdById: user.id,
      source: 'quick',
      recurrence: 'none',
      worldId,
      aimX,
      aimY,
    });
    audit(db, {
      actorId: user.id,
      action: 'task.create',
      entity: 'task',
      entityId: id,
      ip: (req.ip || '').slice(0, 64),
      detail: { source: 'quick' },
    });
    publishTaskChange(io, db, id);
    return res.json({ ok: true, id });
  }));

  app.post('/api/tasks', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    if (user.role !== 'admin' && createsInLastHour(db, user.id) >= QUICK_LIMIT) {
      return res.status(429).json({ error: 'Too many tasks. Try again later.' });
    }
    const parsed = parseTaskBody(db, req.body, true);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    if (user.role !== 'admin' && !parsed.assigneeId) parsed.assigneeId = user.id;
    const actor = { id: user.id, ip: (req.ip || '').slice(0, 64) };
    const id = withGoalAchievements(db, actor, () => {
      const created = insertTask(db, { ...parsed, createdById: user.id, source: parsed.source });
      if (parsed.goalIds) replaceTaskGoals(db, created, parsed.goalIds);
      if (parsed.projectIds) replaceTaskProjects(db, created, parsed.projectIds);
      if ((parsed.status || 'todo') === 'done') spawnNextOccurrence(db, created, Date.now());
      return created;
    });
    audit(db, {
      actorId: user.id,
      action: 'task.create',
      entity: 'task',
      entityId: id,
      ip: actor.ip,
      detail: { source: 'form' },
    });
    publishTaskChange(io, db, id);
    return res.status(201).json({ task: loadTask(db, id) });
  }));

  app.patch('/api/tasks/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as TaskRow | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!ownTask(user, existing)) return res.status(403).json({ error: 'forbidden' });
    const parsed = parseTaskPatch(db, req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const actor = { id: user.id, ip: (req.ip || '').slice(0, 64) };
    const spawnedTaskId = withGoalAchievements(db, actor, () => {
      const now = Date.now();
      const nextStatus = (parsed.status ?? existing.status) as Status;
      const completed = completionFields(nextStatus, existing.status, user.id, now, existing);
      const leavingDone = nextStatus !== 'done' ? 1 : 0;
      db.prepare(
        `UPDATE tasks SET
           title = ?, description = ?, kind = ?, status = ?, priority = ?, due_date = ?,
           assignee_id = ?, recurrence = ?, world_id = ?, aim_x = ?, aim_y = ?, criteria = ?,
           completed_at = ?, completed_by = ?,
           archived_at = CASE WHEN ? = 1 THEN NULL ELSE archived_at END,
           updated_at = ?
         WHERE id = ?`,
      ).run(
        parsed.title ?? existing.title,
        parsed.description ?? existing.description,
        parsed.kind ?? existing.kind,
        nextStatus,
        parsed.priority ?? existing.priority,
        parsed.dueDate !== undefined ? parsed.dueDate : existing.due_date,
        parsed.assigneeId !== undefined ? parsed.assigneeId : existing.assignee_id,
        parsed.recurrence ?? existing.recurrence,
        parsed.worldId !== undefined ? parsed.worldId : existing.world_id,
        parsed.aimX !== undefined ? parsed.aimX : existing.aim_x,
        parsed.aimY !== undefined ? parsed.aimY : existing.aim_y,
        parsed.criteria !== undefined ? parsed.criteria : existing.criteria,
        completed.completed_at,
        completed.completed_by,
        leavingDone,
        now,
        existing.id,
      );
      if (parsed.goalIds) replaceTaskGoals(db, existing.id, parsed.goalIds);
      if (parsed.projectIds) replaceTaskProjects(db, existing.id, parsed.projectIds);
      if (nextStatus === 'done' && existing.status !== 'done') return spawnNextOccurrence(db, existing.id, now);
      return null;
    });
    audit(db, {
      actorId: user.id,
      action: 'task.update',
      entity: 'task',
      entityId: existing.id,
      ip: actor.ip,
    });
    publishTaskChange(io, db, existing.id, existing.assignee_id);
    return res.json({ task: loadTask(db, existing.id), spawnedTaskId });
  }));

  app.delete('/api/tasks/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    const existing = db.prepare('SELECT id, assignee_id FROM tasks WHERE id = ?').get(req.params.id) as
      | { id: string; assignee_id: string | null }
      | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!ownTask(user, existing)) return res.status(403).json({ error: 'forbidden' });
    const actor = { id: user.id, ip: (req.ip || '').slice(0, 64) };
    const info = withGoalAchievements(db, actor, () => db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id));
    if (!info.changes) return res.status(404).json({ error: 'not found' });
    audit(db, {
      actorId: user.id,
      action: 'task.delete',
      entity: 'task',
      entityId: req.params.id,
      ip: (req.ip || '').slice(0, 64),
    });
    publishTaskChange(io, db, req.params.id, existing.assignee_id);
    return res.json({ ok: true });
  }));

  app.post('/api/tasks/:id/status', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    const status = req.body?.status;
    if (!(STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as TaskRow | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!ownTask(user, existing)) return res.status(403).json({ error: 'forbidden' });
    const actor = { id: user.id, ip: (req.ip || '').slice(0, 64) };
    const spawnedTaskId = withGoalAchievements(db, actor, () => {
      const now = Date.now();
      const completed = completionFields(status, existing.status, user.id, now, existing);
      const leavingDone = status !== 'done' ? 1 : 0;
      db.prepare(
        `UPDATE tasks SET status = ?, completed_at = ?, completed_by = ?,
           archived_at = CASE WHEN ? = 1 THEN NULL ELSE archived_at END,
           updated_at = ?
         WHERE id = ?`,
      ).run(status, completed.completed_at, completed.completed_by, leavingDone, now, existing.id);
      if (status === 'done' && existing.status !== 'done') return spawnNextOccurrence(db, existing.id, now);
      return null;
    });
    audit(db, {
      actorId: user.id,
      action: 'task.status',
      entity: 'task',
      entityId: existing.id,
      ip: actor.ip,
      detail: { status, previous: existing.status },
    });
    publishTaskChange(io, db, existing.id);
    if (spawnedTaskId) publishTaskChange(io, db, spawnedTaskId);
    return res.json({ task: loadTask(db, existing.id), spawnedTaskId });
  }));

  app.post('/api/tasks/:id/check', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.ingame.check');
    if (!user) return;
    const result = checkTaskNow(io, db, req.params.id, user.id);
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    return res.json({ checkState: result.checkState, task: loadTask(db, req.params.id) });
  }));

  app.post('/api/tasks/:id/comments', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    const task = db.prepare('SELECT id, assignee_id FROM tasks WHERE id = ?').get(req.params.id) as
      | { id: string; assignee_id: string | null }
      | undefined;
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!ownTask(user, task)) return res.status(403).json({ error: 'forbidden' });
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 2000) return res.status(400).json({ error: 'Comment must be 1-2000 characters' });
    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(
      'INSERT INTO task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, task.id, user.id, body, now);
    audit(db, {
      actorId: user.id,
      action: 'task.comment',
      entity: 'task',
      entityId: task.id,
      ip: (req.ip || '').slice(0, 64),
    });
    publishTaskChange(io, db, task.id);
    return res.status(201).json({
      id,
      taskId: task.id,
      authorId: user.id,
      authorName: user.name,
      body,
      createdAt: now,
    });
  }));

  app.delete('/api/tasks/:id/comments/:cid', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'tasks.edit');
    if (!user) return;
    const task = db.prepare('SELECT id, assignee_id FROM tasks WHERE id = ?').get(req.params.id) as
      | { id: string; assignee_id: string | null }
      | undefined;
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!ownTask(user, task)) return res.status(403).json({ error: 'forbidden' });
    const row = db.prepare(
      'SELECT id FROM task_comments WHERE id = ? AND task_id = ?',
    ).get(req.params.cid, req.params.id) as { id: string } | undefined;
    if (!row) return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(row.id);
    audit(db, {
      actorId: user.id,
      action: 'task.comment.delete',
      entity: 'task',
      entityId: req.params.id,
      ip: (req.ip || '').slice(0, 64),
    });
    publishTaskChange(io, db, req.params.id);
    return res.json({ ok: true });
  }));
}

/** Admins can change any task. A player with tasks.edit can change only tasks assigned to them. */
function ownTask(user: SessionUser, task: { assignee_id: string | null }): boolean {
  return user.role === 'admin' || task.assignee_id === user.id;
}

function requirePerm(
  req: Parameters<typeof gcUser>[0],
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  key: Parameters<typeof can>[1],
): SessionUser | null {
  const user = gcUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  if (!can(user, key)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return user;
}

function createsInLastHour(db: Database, userId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM tasks WHERE created_by_id = ? AND created_at >= ?',
  ).get(userId, Date.now() - HOUR_MS) as { c: number };
  return row.c;
}

function defaultAssigneeId(db: Database): string | null {
  const raw = (process.env.QUICK_TASK_DEFAULT_ASSIGNEE || '').trim();
  if (raw) {
    const byId = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(raw) as { id: string } | undefined;
    if (byId) return byId.id;
    const byEmail = db.prepare('SELECT id FROM users WHERE email = ? AND active = 1').get(raw) as { id: string } | undefined;
    if (byEmail) return byEmail.id;
  }
  const admin = db.prepare(
    `SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at ASC LIMIT 1`,
  ).get() as { id: string } | undefined;
  return admin?.id ?? null;
}

function resolveAssignee(db: Database, raw: unknown): string | null | 'invalid' {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(raw) as { id: string } | undefined;
  return row ? row.id : 'invalid';
}

function pickAssignee(db: Database, user: SessionUser, body: Record<string, unknown>): string | null | 'invalid' {
  if (can(user, 'tasks.edit') && Object.prototype.hasOwnProperty.call(body, 'assigneeId')) {
    return resolveAssignee(db, body.assigneeId);
  }
  return defaultAssigneeId(db);
}

function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.trim();
  if (title.length < 1 || title.length > 140) return null;
  return title;
}

function cleanNotes(raw: unknown): string | null {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') return null;
  const notes = raw.trim();
  if (notes.length > 5000) return null;
  return notes;
}

function cleanDate(raw: unknown): string | null | undefined {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

type TaskWrite = {
  title: string;
  description: string;
  kind: Kind;
  priority: Priority;
  dueDate: string | null;
  assigneeId: string | null;
  createdById: string;
  source: 'form' | 'quick' | 'bot';
  recurrence: Recurrence;
  worldId: string | null;
  aimX: number | null;
  aimY: number | null;
  criteria?: string | null;
  status?: Status;
  goalIds?: string[];
  projectIds?: string[];
};

function insertTask(db: Database, task: TaskWrite): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  const status = task.status || 'todo';
  const done = status === 'done';
  db.prepare(
    `INSERT INTO tasks (
       id, title, description, kind, status, priority, due_date, assignee_id, created_by_id,
       source, recurrence, world_id, aim_x, aim_y, criteria, completed_at, completed_by,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    task.title,
    task.description,
    task.kind,
    status,
    task.priority,
    task.dueDate,
    task.assigneeId,
    task.createdById,
    task.source,
    task.recurrence,
    task.worldId,
    task.aimX,
    task.aimY,
    task.criteria ?? null,
    done ? now : null,
    done ? task.createdById : null,
    now,
    now,
  );
  return id;
}

function parseTaskBody(db: Database, body: any, creating: boolean): TaskWrite | { error: string } {
  const title = cleanTitle(body?.title);
  if (!title) return { error: 'Title must be 1-140 characters' };
  const description = cleanNotes(body?.description ?? body?.notes);
  if (description == null) return { error: 'Notes are too long' };
  const kind = body?.kind == null || body.kind === '' ? 'real_world' : body.kind;
  if (!(KINDS as readonly string[]).includes(kind)) return { error: 'invalid kind' };
  const priority = body?.priority == null || body.priority === '' ? 'medium' : body.priority;
  if (!(PRIORITIES as readonly string[]).includes(priority)) return { error: 'invalid priority' };
  const recurrence = body?.recurrence == null || body.recurrence === '' ? 'none' : body.recurrence;
  if (!(RECURRENCE as readonly string[]).includes(recurrence)) return { error: 'invalid recurrence' };
  const status = body?.status == null || body.status === '' ? 'todo' : body.status;
  if (!(STATUSES as readonly string[]).includes(status)) return { error: 'invalid status' };
  const dueDate = cleanDate(body?.dueDate);
  if (dueDate === undefined) return { error: 'invalid due date' };
  let assigneeId: string | null = null;
  if (body && Object.prototype.hasOwnProperty.call(body, 'assigneeId')) {
    const resolved = resolveAssignee(db, body.assigneeId);
    if (resolved === 'invalid') return { error: 'invalid assignee' };
    assigneeId = resolved;
  }
  const aimX = finiteInt(body?.aimX);
  const aimY = finiteInt(body?.aimY);
  if (aimX === undefined || aimY === undefined) return { error: 'invalid aim' };
  const criteria = cleanCriteria(body?.criteria);
  if (criteria.ok === false) return { error: criteria.error };
  const links = readLinkFields(db, body);
  if ('error' in links) return links;
  void creating;
  const source = body?.source === 'bot' ? 'bot' : 'form';
  return {
    title,
    description,
    kind,
    priority,
    dueDate,
    assigneeId,
    createdById: '',
    source,
    recurrence,
    worldId: typeof body?.worldId === 'string' && body.worldId.trim() ? body.worldId.trim().slice(0, 80) : null,
    aimX,
    aimY,
    criteria: criteria.value,
    status,
    ...links,
  };
}

type TaskPatch = {
  title?: string;
  description?: string;
  kind?: Kind;
  status?: Status;
  priority?: Priority;
  dueDate?: string | null;
  assigneeId?: string | null;
  recurrence?: Recurrence;
  worldId?: string | null;
  aimX?: number | null;
  aimY?: number | null;
  criteria?: string | null;
  goalIds?: string[];
  projectIds?: string[];
};

function parseTaskPatch(db: Database, body: any): TaskPatch | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' };
  const patch: TaskPatch = {};
  if ('title' in body) {
    const title = cleanTitle(body.title);
    if (!title) return { error: 'Title must be 1-140 characters' };
    patch.title = title;
  }
  if ('description' in body || 'notes' in body) {
    const description = cleanNotes(body.description ?? body.notes);
    if (description == null) return { error: 'Notes are too long' };
    patch.description = description;
  }
  if ('kind' in body) {
    if (!(KINDS as readonly string[]).includes(body.kind)) return { error: 'invalid kind' };
    patch.kind = body.kind;
  }
  if ('status' in body) {
    if (!(STATUSES as readonly string[]).includes(body.status)) return { error: 'invalid status' };
    patch.status = body.status;
  }
  if ('priority' in body) {
    if (!(PRIORITIES as readonly string[]).includes(body.priority)) return { error: 'invalid priority' };
    patch.priority = body.priority;
  }
  if ('dueDate' in body) {
    const dueDate = cleanDate(body.dueDate);
    if (dueDate === undefined) return { error: 'invalid due date' };
    patch.dueDate = dueDate;
  }
  if ('assigneeId' in body) {
    const resolved = resolveAssignee(db, body.assigneeId);
    if (resolved === 'invalid') return { error: 'invalid assignee' };
    patch.assigneeId = resolved;
  }
  if ('recurrence' in body) {
    if (!(RECURRENCE as readonly string[]).includes(body.recurrence)) return { error: 'invalid recurrence' };
    patch.recurrence = body.recurrence;
  }
  if ('worldId' in body) {
    patch.worldId = typeof body.worldId === 'string' && body.worldId.trim()
      ? body.worldId.trim().slice(0, 80)
      : null;
  }
  if ('aimX' in body) {
    const aimX = finiteInt(body.aimX);
    if (aimX === undefined) return { error: 'invalid aim' };
    patch.aimX = aimX;
  }
  if ('aimY' in body) {
    const aimY = finiteInt(body.aimY);
    if (aimY === undefined) return { error: 'invalid aim' };
    patch.aimY = aimY;
  }
  if ('criteria' in body) {
    const criteria = cleanCriteria(body.criteria);
    if (criteria.ok === false) return { error: criteria.error };
    patch.criteria = criteria.value;
  }
  const links = readLinkFields(db, body);
  if ('error' in links) return links;
  return { ...patch, ...links };
}

function finiteInt(raw: unknown): number | null | undefined {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.trunc(raw);
}

function cleanCriteria(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: null };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'criteria must be JSON' };
    }
  } else if (typeof raw !== 'object') {
    return { ok: false, error: 'criteria must be JSON' };
  }
  const parsed = parseCriteria(value);
  if (!parsed.ok) return { ok: false, error: 'invalid criteria' };
  return { ok: true, value: JSON.stringify(parsed.value) };
}

function completionFields(
  next: Status,
  previous: string,
  userId: string,
  now: number,
  existing: TaskRow,
): { completed_at: number | null; completed_by: string | null } {
  if (next === 'done') {
    if (previous === 'done' && existing.completed_at) {
      return { completed_at: existing.completed_at, completed_by: existing.completed_by };
    }
    return { completed_at: now, completed_by: userId };
  }
  return { completed_at: null, completed_by: null };
}

type TaskRow = {
  id: string;
  title: string;
  description: string;
  kind: Kind;
  status: Status;
  priority: Priority;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  created_by_id: string | null;
  created_by_name?: string | null;
  source: string;
  recurrence: Recurrence;
  world_id: string | null;
  aim_x: number | null;
  aim_y: number | null;
  criteria: string | null;
  check_state: string | null;
  completed_at: number | null;
  completed_by: string | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
};

type CommentJson = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: number;
};

function commentsByTask(db: Database, ids: string[]): Map<string, CommentJson[]> {
  const map = new Map<string, CommentJson[]>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT c.id, c.task_id, c.author_id, c.body, c.created_at, u.name AS author_name
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.task_id IN (${placeholders})
     ORDER BY c.created_at ASC`,
  ).all(...ids) as {
    id: string;
    task_id: string;
    author_id: string | null;
    body: string;
    created_at: number;
    author_name: string | null;
  }[];
  for (const row of rows) {
    const list = map.get(row.task_id) || [];
    list.push({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
    });
    map.set(row.task_id, list);
  }
  return map;
}

function readLinkFields(db: Database, body: any): { goalIds?: string[]; projectIds?: string[] } | { error: string } {
  const out: { goalIds?: string[]; projectIds?: string[] } = {};
  if (body && Object.prototype.hasOwnProperty.call(body, 'goalIds')) {
    const parsed = parseIdList(body.goalIds);
    if (parsed.ok === false) return { error: parsed.error };
    if (!idsExist(db, 'goals', parsed.ids)) return { error: 'invalid links' };
    out.goalIds = parsed.ids;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, 'projectIds')) {
    const parsed = parseIdList(body.projectIds);
    if (parsed.ok === false) return { error: parsed.error };
    if (!idsExist(db, 'projects', parsed.ids)) return { error: 'invalid links' };
    out.projectIds = parsed.ids;
  }
  return out;
}

function mapTask(row: TaskRow, comments: CommentJson[], today: string, links?: { goalIds: string[]; projectIds: string[] }) {
  const bucket: DueBucket = dueBucket(row.due_date, row.status, row.archived_at, today);
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    dueBucket: bucket,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    createdById: row.created_by_id,
    createdByName: row.created_by_name || null,
    source: row.source,
    recurrence: row.recurrence,
    worldId: row.world_id,
    aimX: row.aim_x,
    aimY: row.aim_y,
    criteria: parseJson(row.criteria),
    checkState: parseJson(row.check_state),
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comments,
    goalIds: links?.goalIds || [],
    projectIds: links?.projectIds || [],
  };
}

function loadTask(db: Database, id: string) {
  const today = todayISO();
  const row = db.prepare(
    `SELECT t.*, au.name AS assignee_name, cu.name AS created_by_name
     FROM tasks t
     LEFT JOIN users au ON au.id = t.assignee_id
     LEFT JOIN users cu ON cu.id = t.created_by_id
     WHERE t.id = ?`,
  ).get(id) as TaskRow;
  const comments = commentsByTask(db, [id]).get(id) || [];
  return mapTask(row, comments, today, taskLinkMap(db, [id]).get(id));
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
