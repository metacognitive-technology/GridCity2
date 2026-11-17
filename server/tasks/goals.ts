import type { Express, Request, Response } from 'express';
import type { Database } from 'better-sqlite3';
import type { Server } from 'socket.io';
import { audit } from '../auth/audit.ts';
import { asyncRoute, gcUser } from '../auth/guards.ts';
import { can } from '../auth/permissions.ts';
import type { SessionUser } from '../auth/sessions.ts';
import type { PermissionKey } from '../../src/permissions.ts';
import {
  idsExist,
  parseIdList,
  replaceGoalProjects,
  replaceGoalTasks,
  replaceProjectTasks,
} from './links.ts';
import { publishGoalsChange } from './notify.ts';
import { loadGoal, loadGoals, loadProject, loadProjects, withGoalAchievements } from './rollup.ts';

const GOAL_STATUSES = ['active', 'achieved', 'paused', 'cancelled'] as const;
const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled'] as const;
const MODES = ['auto', 'manual'] as const;

type GoalStatus = (typeof GOAL_STATUSES)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];
type Mode = (typeof MODES)[number];

export function registerGoalRoutes(app: Express, ctx: { db: Database; io: Server }) {
  const { db, io } = ctx;

  app.get('/api/goals', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.view');
    if (!user) return;
    return res.json({ goals: loadGoals(db) });
  }));

  app.post('/api/goals', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const parsed = parseGoalBody(db, req.body, true);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const actor = actorOf(user, req);
    const id = withGoalAchievements(db, actor, () => {
      const goalId = insertGoal(db, parsed, user.id);
      if (parsed.projectIds) replaceGoalProjects(db, goalId, parsed.projectIds);
      if (parsed.taskIds) replaceGoalTasks(db, goalId, parsed.taskIds);
      return goalId;
    });
    audit(db, {
      actorId: user.id,
      action: 'goal.create',
      entity: 'goal',
      entityId: id,
      ip: actor.ip,
      detail: { progressMode: parsed.progressMode },
    });
    publishGoalsChange(io);
    return res.status(201).json({ goal: loadGoal(db, id) });
  }));

  app.patch('/api/goals/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id) as GoalSql | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    const parsed = parseGoalBody(db, req.body, false);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const actor = actorOf(user, req);
    withGoalAchievements(db, actor, () => {
      const now = Date.now();
      db.prepare(
        `UPDATE goals SET
           title = ?, description = ?, status = ?, owner_id = ?, due_date = ?, progress_mode = ?,
           target_amount = ?, current_amount = ?, unit = ?, icon = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        parsed.title ?? existing.title,
        parsed.description ?? existing.description,
        parsed.status ?? existing.status,
        parsed.ownerId !== undefined ? parsed.ownerId : existing.owner_id,
        parsed.dueDate !== undefined ? parsed.dueDate : existing.due_date,
        parsed.progressMode ?? existing.progress_mode,
        parsed.targetAmount !== undefined ? parsed.targetAmount : existing.target_amount,
        parsed.currentAmount !== undefined ? parsed.currentAmount : existing.current_amount,
        parsed.unit !== undefined ? parsed.unit : existing.unit,
        parsed.icon !== undefined ? parsed.icon : existing.icon,
        now,
        existing.id,
      );
      if (parsed.projectIds) replaceGoalProjects(db, existing.id, parsed.projectIds);
      if (parsed.taskIds) replaceGoalTasks(db, existing.id, parsed.taskIds);
    });
    audit(db, {
      actorId: user.id,
      action: 'goal.update',
      entity: 'goal',
      entityId: existing.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ goal: loadGoal(db, existing.id) });
  }));

  app.delete('/api/goals/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const actor = actorOf(user, req);
    const info = withGoalAchievements(db, actor, () => db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id));
    if (!info.changes) return res.status(404).json({ error: 'not found' });
    audit(db, {
      actorId: user.id,
      action: 'goal.delete',
      entity: 'goal',
      entityId: req.params.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ ok: true });
  }));

  app.put('/api/goals/:id/links', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const existing = db.prepare('SELECT id FROM goals WHERE id = ?').get(req.params.id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    const links = parseLinkBody(db, req.body, true);
    if ('error' in links) return res.status(400).json({ error: links.error });
    const actor = actorOf(user, req);
    withGoalAchievements(db, actor, () => {
      replaceGoalProjects(db, existing.id, links.projectIds || []);
      replaceGoalTasks(db, existing.id, links.taskIds || []);
      db.prepare('UPDATE goals SET updated_at = ? WHERE id = ?').run(Date.now(), existing.id);
    });
    audit(db, {
      actorId: user.id,
      action: 'goal.links',
      entity: 'goal',
      entityId: existing.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ goal: loadGoal(db, existing.id) });
  }));

  app.get('/api/projects', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.view');
    if (!user) return;
    return res.json({ projects: loadProjects(db) });
  }));

  app.post('/api/projects', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const parsed = parseProjectBody(db, req.body, true);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const actor = actorOf(user, req);
    const id = withGoalAchievements(db, actor, () => {
      const projectId = insertProject(db, parsed, user.id);
      if (parsed.taskIds) replaceProjectTasks(db, projectId, parsed.taskIds);
      return projectId;
    });
    audit(db, {
      actorId: user.id,
      action: 'project.create',
      entity: 'project',
      entityId: id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.status(201).json({ project: loadProject(db, id) });
  }));

  app.patch('/api/projects/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as ProjectSql | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    const parsed = parseProjectBody(db, req.body, false);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const actor = actorOf(user, req);
    withGoalAchievements(db, actor, () => {
      db.prepare(
        `UPDATE projects SET
           name = ?, description = ?, status = ?, owner_id = ?, start_date = ?, end_date = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        parsed.name ?? existing.name,
        parsed.description ?? existing.description,
        parsed.status ?? existing.status,
        parsed.ownerId !== undefined ? parsed.ownerId : existing.owner_id,
        parsed.startDate !== undefined ? parsed.startDate : existing.start_date,
        parsed.endDate !== undefined ? parsed.endDate : existing.end_date,
        Date.now(),
        existing.id,
      );
      if (parsed.taskIds) replaceProjectTasks(db, existing.id, parsed.taskIds);
    });
    audit(db, {
      actorId: user.id,
      action: 'project.update',
      entity: 'project',
      entityId: existing.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ project: loadProject(db, existing.id) });
  }));

  app.delete('/api/projects/:id', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const actor = actorOf(user, req);
    const info = withGoalAchievements(db, actor, () => (
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
    ));
    if (!info.changes) return res.status(404).json({ error: 'not found' });
    audit(db, {
      actorId: user.id,
      action: 'project.delete',
      entity: 'project',
      entityId: req.params.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ ok: true });
  }));

  app.put('/api/projects/:id/links', asyncRoute(async (req, res) => {
    const user = requirePerm(req, res, 'goals.edit');
    if (!user) return;
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    const links = parseLinkBody(db, req.body, false);
    if ('error' in links) return res.status(400).json({ error: links.error });
    if (!links.taskIds) return res.status(400).json({ error: 'invalid links' });
    const actor = actorOf(user, req);
    withGoalAchievements(db, actor, () => {
      replaceProjectTasks(db, existing.id, links.taskIds || []);
      db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), existing.id);
    });
    audit(db, {
      actorId: user.id,
      action: 'project.links',
      entity: 'project',
      entityId: existing.id,
      ip: actor.ip,
    });
    publishGoalsChange(io);
    return res.json({ project: loadProject(db, existing.id) });
  }));
}

function requirePerm(req: Request, res: Response, key: PermissionKey): SessionUser | null {
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

function actorOf(user: SessionUser, req: Request) {
  return { id: user.id, ip: (req.ip || '').slice(0, 64) };
}

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > max) return null;
  return text;
}

function cleanOptional(raw: unknown, max: number): string | null | undefined {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (text.length > max) return undefined;
  return text;
}

function cleanDate(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

function cleanAmount(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function resolveOwner(db: Database, raw: unknown): string | null | 'invalid' {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(raw) as { id: string } | undefined;
  return row ? row.id : 'invalid';
}

type GoalWrite = {
  title?: string;
  description?: string;
  status?: GoalStatus;
  ownerId?: string | null;
  dueDate?: string | null;
  progressMode?: Mode;
  targetAmount?: number | null;
  currentAmount?: number | null;
  unit?: string | null;
  icon?: string | null;
  projectIds?: string[];
  taskIds?: string[];
};

type ProjectWrite = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  ownerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  taskIds?: string[];
};

function parseGoalBody(db: Database, body: any, creating: boolean): GoalWrite | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' };
  const write: GoalWrite = {};
  if (creating || 'title' in body) {
    const title = cleanText(body.title, 140);
    if (!title) return { error: 'Title must be 1-140 characters' };
    write.title = title;
  }
  if ('description' in body) {
    const description = cleanOptional(body.description, 5000);
    if (description === undefined) return { error: 'Description is too long' };
    write.description = description ?? '';
  }
  if ('status' in body && body.status != null && body.status !== '') {
    if (!(GOAL_STATUSES as readonly string[]).includes(body.status)) return { error: 'invalid status' };
    write.status = body.status;
  }
  if ('ownerId' in body) {
    const owner = resolveOwner(db, body.ownerId);
    if (owner === 'invalid') return { error: 'invalid owner' };
    write.ownerId = owner;
  }
  if ('dueDate' in body) {
    const due = cleanDate(body.dueDate);
    if (due === undefined) return { error: 'invalid due date' };
    write.dueDate = due;
  }
  if ('progressMode' in body && body.progressMode != null && body.progressMode !== '') {
    if (!(MODES as readonly string[]).includes(body.progressMode)) return { error: 'invalid progress mode' };
    write.progressMode = body.progressMode;
  }
  if ('targetAmount' in body) {
    const amount = cleanAmount(body.targetAmount);
    if (amount === undefined) return { error: 'invalid target' };
    write.targetAmount = amount;
  }
  if ('currentAmount' in body) {
    const amount = cleanAmount(body.currentAmount);
    if (amount === undefined) return { error: 'invalid current amount' };
    write.currentAmount = amount;
  }
  if ('unit' in body) {
    const unit = cleanOptional(body.unit, 40);
    if (unit === undefined) return { error: 'invalid unit' };
    write.unit = unit;
  }
  if ('icon' in body) {
    const icon = cleanOptional(body.icon, 16);
    if (icon === undefined) return { error: 'invalid icon' };
    write.icon = icon;
  }
  const links = parseLinkBody(db, body, false);
  if ('error' in links) return links;
  if (links.projectIds) write.projectIds = links.projectIds;
  if (links.taskIds) write.taskIds = links.taskIds;
  return write;
}

function parseProjectBody(db: Database, body: any, creating: boolean): ProjectWrite | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' };
  const write: ProjectWrite = {};
  if (creating || 'name' in body) {
    const name = cleanText(body.name, 140);
    if (!name) return { error: 'Name must be 1-140 characters' };
    write.name = name;
  }
  if ('description' in body) {
    const description = cleanOptional(body.description, 5000);
    if (description === undefined) return { error: 'Description is too long' };
    write.description = description ?? '';
  }
  if ('status' in body && body.status != null && body.status !== '') {
    if (!(PROJECT_STATUSES as readonly string[]).includes(body.status)) return { error: 'invalid status' };
    write.status = body.status;
  }
  if ('ownerId' in body) {
    const owner = resolveOwner(db, body.ownerId);
    if (owner === 'invalid') return { error: 'invalid owner' };
    write.ownerId = owner;
  }
  if ('startDate' in body) {
    const date = cleanDate(body.startDate);
    if (date === undefined) return { error: 'invalid start date' };
    write.startDate = date;
  }
  if ('endDate' in body) {
    const date = cleanDate(body.endDate);
    if (date === undefined) return { error: 'invalid end date' };
    write.endDate = date;
  }
  if ('taskIds' in body) {
    const parsed = parseIdList(body.taskIds);
    if (parsed.ok === false) return { error: parsed.error };
    if (!idsExist(db, 'tasks', parsed.ids)) return { error: 'invalid links' };
    write.taskIds = parsed.ids;
  }
  return write;
}

function parseLinkBody(
  db: Database,
  body: any,
  requireBoth: boolean,
): { projectIds?: string[]; taskIds?: string[] } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid links' };
  const out: { projectIds?: string[]; taskIds?: string[] } = {};
  if (requireBoth && (!('projectIds' in body) || !('taskIds' in body))) return { error: 'invalid links' };
  if ('projectIds' in body) {
    const parsed = parseIdList(body.projectIds);
    if (parsed.ok === false) return { error: parsed.error };
    if (!idsExist(db, 'projects', parsed.ids)) return { error: 'invalid links' };
    out.projectIds = parsed.ids;
  }
  if ('taskIds' in body) {
    const parsed = parseIdList(body.taskIds);
    if (parsed.ok === false) return { error: parsed.error };
    if (!idsExist(db, 'tasks', parsed.ids)) return { error: 'invalid links' };
    out.taskIds = parsed.ids;
  }
  return out;
}

type GoalSql = {
  id: string;
  title: string;
  description: string;
  status: string;
  owner_id: string | null;
  due_date: string | null;
  progress_mode: string;
  target_amount: number | null;
  current_amount: number | null;
  unit: string | null;
  icon: string | null;
};

function insertGoal(db: Database, goal: GoalWrite, createdById: string): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO goals (
       id, title, description, status, owner_id, due_date, progress_mode,
       target_amount, current_amount, unit, icon, created_by_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    goal.title,
    goal.description ?? '',
    goal.status ?? 'active',
    goal.ownerId ?? null,
    goal.dueDate ?? null,
    goal.progressMode ?? 'auto',
    goal.targetAmount ?? null,
    goal.currentAmount ?? null,
    goal.unit ?? null,
    goal.icon ?? null,
    createdById,
    now,
    now,
  );
  return id;
}

type ProjectSql = {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

function insertProject(db: Database, project: ProjectWrite, createdById: string): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (
       id, name, description, status, owner_id, start_date, end_date, created_by_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    project.name,
    project.description ?? '',
    project.status ?? 'active',
    project.ownerId ?? null,
    project.startDate ?? null,
    project.endDate ?? null,
    createdById,
    now,
    now,
  );
  return id;
}
