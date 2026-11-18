import type { Server } from 'socket.io';
import type { Database } from 'better-sqlite3';
import { audit } from '../auth/audit.ts';
import { dueBucket } from './due.ts';
import { publishTaskChange } from './notify.ts';
import { withGoalAchievements } from './rollup.ts';
import {
  countMetricValue,
  evaluateCriteria,
  type CheckResult,
  type CriteriaWorld,
} from '../../src/shared/taskCriteria.ts';

/** Wait after the first edit in a burst, and do not extend that wait past 3s. */
export const IN_GAME_CHECK_DEBOUNCE_MS = 3000;

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  bot: boolean;
  actorId: string | null;
};

const pending = new Map<string, Pending>();

type TaskSql = {
  id: string;
  title: string;
  kind: string;
  status: string;
  world_id: string | null;
  criteria: string | null;
  archived_at: number | null;
};

export function scheduleInGameChecks(
  io: Server,
  db: Database,
  worldId: string,
  opts: { bot?: boolean; actorId?: string | null } = {},
) {
  if (!worldId) return;
  const existing = pending.get(worldId);
  const startedAt = existing?.startedAt ?? Date.now();
  if (existing) clearTimeout(existing.timer);
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, IN_GAME_CHECK_DEBOUNCE_MS - elapsed);
  const timer = setTimeout(() => {
    pending.delete(worldId);
    try {
      runWorldChecks(io, db, worldId, {
        bot: !!(existing?.bot || opts.bot),
        actorId: opts.actorId || existing?.actorId || null,
      });
    } catch (err) {
      console.log('in-game check failed');
      void err;
    }
  }, wait);
  pending.set(worldId, {
    timer,
    startedAt,
    bot: !!(existing?.bot || opts.bot),
    actorId: opts.actorId || existing?.actorId || null,
  });
}

export function checkTaskNow(
  io: Server,
  db: Database,
  taskId: string,
  actorId: string | null,
): { ok: true; checkState: CheckResult } | { ok: false; status: number; error: string } {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskSql | undefined;
  if (!task) return { ok: false, status: 404, error: 'not found' };
  if (task.kind !== 'in_game') return { ok: false, status: 400, error: 'not an in-game task' };
  const world = task.world_id ? loadWorld(db, task.world_id) : null;
  const outcome = applyChecks(io, db, [task], world, { bot: false, actorId });
  const saved = outcome.states.get(task.id);
  return { ok: true, checkState: saved || { met: false, progress: 0, detail: 'no criteria' } };
}

function runWorldChecks(
  io: Server,
  db: Database,
  worldId: string,
  actor: { bot: boolean; actorId: string | null },
) {
  const tasks = db.prepare(
    `SELECT * FROM tasks
     WHERE kind = 'in_game' AND world_id = ? AND archived_at IS NULL AND status != 'cancelled'`,
  ).all(worldId) as TaskSql[];
  if (!tasks.length) return;
  const world = loadWorld(db, worldId);
  applyChecks(io, db, tasks, world, actor);
}

function applyChecks(
  io: Server,
  db: Database,
  tasks: TaskSql[],
  world: CriteriaWorld | null,
  actor: { bot: boolean; actorId: string | null },
): { states: Map<string, CheckResult> } {
  const states = new Map<string, CheckResult>();
  const changed: string[] = [];
  const celebrations: { taskId: string; title: string; worldId: string }[] = [];
  const now = Date.now();
  withGoalAchievements(db, { id: actor.actorId, ip: null }, () => {
    for (const task of tasks) {
      const result = evaluateTask(task, world, now);
      states.set(task.id, result);
      db.prepare('UPDATE tasks SET check_state = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(result),
        now,
        task.id,
      );
      changed.push(task.id);
      feedManualGoals(db, task, world, now);
      const open = task.status === 'todo' || task.status === 'in_progress' || task.status === 'blocked';
      if (!open || !result.met || task.archived_at) continue;
      const info = db.prepare(
        `UPDATE tasks SET status = 'done', completed_by = 'auto', completed_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('todo','in_progress','blocked') AND archived_at IS NULL`,
      ).run(now, now, task.id);
      if (!info.changes) continue;
      audit(db, {
        actorId: actor.actorId,
        actorLabel: actor.bot ? 'gridbot' : 'auto',
        action: 'task.auto_complete',
        entity: 'task',
        entityId: task.id,
        detail: { worldId: task.world_id, detail: result.detail },
      });
      if (task.world_id) {
        celebrations.push({ taskId: task.id, title: task.title, worldId: task.world_id });
      }
    }
  });
  for (const id of changed) publishTaskChange(io, db, id);
  for (const party of celebrations) io.to(party.worldId).emit('task-celebrate', party);
  return { states };
}

function evaluateTask(task: TaskSql, world: CriteriaWorld | null, now: number): CheckResult {
  if (!task.criteria) return stamp({ met: false, progress: 0, detail: 'no criteria' }, now);
  if (!world) return stamp({ met: false, progress: 0, detail: 'world missing' }, now);
  let raw: unknown = null;
  try {
    raw = JSON.parse(task.criteria);
  } catch {
    return stamp({ met: false, progress: 0, detail: 'invalid criteria' }, now);
  }
  return stamp(evaluateCriteria(raw, world), now);
}

function feedManualGoals(db: Database, task: TaskSql, world: CriteriaWorld | null, now: number) {
  if (!task.criteria || !world) return;
  let raw: unknown = null;
  try {
    raw = JSON.parse(task.criteria);
  } catch {
    return;
  }
  const amount = countMetricValue(raw, world);
  if (amount == null) return;
  const goals = db.prepare(
    `SELECT g.id FROM goals g
     JOIN task_goals tg ON tg.goal_id = g.id
     WHERE tg.task_id = ? AND g.progress_mode = 'manual' AND g.status != 'cancelled'`,
  ).all(task.id) as { id: string }[];
  for (const goal of goals) {
    db.prepare('UPDATE goals SET current_amount = ?, updated_at = ? WHERE id = ?').run(amount, now, goal.id);
  }
}

function loadWorld(db: Database, worldId: string): CriteriaWorld | null {
  const row = db.prepare('SELECT grid, economy, vehicles FROM worlds WHERE id = ?').get(worldId) as
    | { grid: string | null; economy: string | null; vehicles: string | null }
    | undefined;
  if (!row) return null;
  return {
    grid: parseObject(row.grid) as CriteriaWorld['grid'],
    economy: parseObject(row.economy) as CriteriaWorld['economy'],
    vehicles: parseObject(row.vehicles) as CriteriaWorld['vehicles'],
  };
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function stamp(result: CheckResult, now: number): CheckResult {
  return { ...result, checkedAt: now };
}

export type UrgentTask = {
  id: string;
  title: string;
  status: string;
  kind: string;
  priority: string;
  dueDate: string | null;
};

const BUCKET_RANK = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Five most urgent open tasks. Pass assigneeId to keep a player inside My Tasks. */
export function urgentOpenTasks(db: Database, limit = 5, assigneeId?: string): UrgentTask[] {
  const scoped = assigneeId
    ? ` AND assignee_id = ?`
    : '';
  const rows = db.prepare(
    `SELECT id, title, status, kind, priority, due_date
     FROM tasks
     WHERE archived_at IS NULL AND status IN ('todo','in_progress','blocked')${scoped}`,
  ).all(...(assigneeId ? [assigneeId] : [])) as {
    id: string;
    title: string;
    status: string;
    kind: string;
    priority: string;
    due_date: string | null;
  }[];
  const ranked = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    kind: row.kind,
    priority: row.priority,
    dueDate: row.due_date,
    bucket: dueBucket(row.due_date, row.status, null),
  }));
  ranked.sort((a, b) => {
    const bucket = (BUCKET_RANK[a.bucket] ?? 4) - (BUCKET_RANK[b.bucket] ?? 4);
    if (bucket) return bucket;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && !b.dueDate) return -1;
    return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  });
  return ranked.slice(0, limit).map(({ bucket: _bucket, ...task }) => task);
}
