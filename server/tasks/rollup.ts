import type { Database } from 'better-sqlite3';
import { audit } from '../auth/audit.ts';

/**
 * Progress is computed on read so stored rows cannot drift.
 *
 * Task value: done = 1, in_progress = 0.5, todo/blocked = 0.
 * Cancelled tasks, and archived tasks that are not done, are left out.
 * Archived done tasks still count.
 *
 * Project % is the mean of those values. The API returns it rounded, but a
 * goal uses the unrounded project percent. That is why 2 done + 1 in-progress
 * + 1 todo is 62.5, and a goal of that project plus one done task is
 * round((62.5 + 100) / 2) = 81, not round((63 + 100) / 2).
 *
 * A project with no included tasks is null (the UI shows "—") and is not a
 * goal unit. Manual goals use clamp(current/target) and ignore links.
 * Auto-achieve fires only when an active auto goal's rounded percent moves
 * to 100. It never reverts, and a goal reopened at 100% stays active until
 * the percent drops and comes back.
 */

export type GoalRecord = {
  id: string;
  title: string;
  description: string;
  status: string;
  ownerId: string | null;
  dueDate: string | null;
  progressMode: string;
  targetAmount: number | null;
  currentAmount: number | null;
  unit: string | null;
  icon: string | null;
  createdById: string | null;
  createdAt: number;
  updatedAt: number;
  progress: number | null;
  projectIds: string[];
  taskIds: string[];
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  status: string;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  createdById: string | null;
  createdAt: number;
  updatedAt: number;
  progress: number | null;
  taskIds: string[];
  goalIds: string[];
};

type TaskLite = { id: string; status: string; archived_at: number | null };

type GoalRow = {
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
  created_by_id: string | null;
  created_at: number;
  updated_at: number;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_by_id: string | null;
  created_at: number;
  updated_at: number;
};

export function includedTaskValue(status: string, archivedAt: number | null): number | null {
  if (status === 'cancelled') return null;
  if (archivedAt != null && status !== 'done') return null;
  if (status === 'done') return 1;
  if (status === 'in_progress') return 0.5;
  if (status === 'todo' || status === 'blocked') return 0;
  return null;
}

export function meanRatio(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function displayPercent(ratio: number | null): number | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return Math.round(ratio * 100);
}

/** Manual bar. A missing or non-positive target cannot be divided, so it stays blank. */
export function manualDisplayPercent(current: number | null, target: number | null): number | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;
  const amount = current == null || !Number.isFinite(current) ? 0 : current;
  const clamped = Math.min(1, Math.max(0, amount / target));
  return Math.round(clamped * 100);
}

/** projectRatios are 0..1 (unrounded). taskValues are 0, 0.5, or 1. Nulls are skipped. */
export function autoGoalPercent(
  projectRatios: Array<number | null>,
  taskValues: Array<number | null>,
): number | null {
  const units: number[] = [];
  for (const ratio of projectRatios) {
    if (ratio != null && Number.isFinite(ratio)) units.push(ratio * 100);
  }
  for (const value of taskValues) {
    if (value != null && Number.isFinite(value)) units.push(value * 100);
  }
  if (units.length === 0) return null;
  return Math.round(units.reduce((sum, value) => sum + value, 0) / units.length);
}

type Model = {
  tasks: Map<string, TaskLite>;
  tasksByProject: Map<string, string[]>;
  tasksByGoal: Map<string, string[]>;
  projectsByGoal: Map<string, string[]>;
  goalsByProject: Map<string, string[]>;
  projectRatio: Map<string, number | null>;
};

function group(rows: { key: string; value: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.key) || [];
    list.push(row.value);
    map.set(row.key, list);
  }
  for (const list of map.values()) list.sort();
  return map;
}

function readModel(db: Database): Model {
  const taskRows = db.prepare('SELECT id, status, archived_at FROM tasks').all() as TaskLite[];
  const tasks = new Map(taskRows.map((row) => [row.id, row]));
  const taskProjects = db.prepare('SELECT task_id, project_id FROM task_projects').all() as {
    task_id: string;
    project_id: string;
  }[];
  const taskGoals = db.prepare('SELECT task_id, goal_id FROM task_goals').all() as {
    task_id: string;
    goal_id: string;
  }[];
  const projectGoals = db.prepare('SELECT project_id, goal_id FROM project_goals').all() as {
    project_id: string;
    goal_id: string;
  }[];
  const tasksByProject = group(taskProjects.map((row) => ({ key: row.project_id, value: row.task_id })));
  const tasksByGoal = group(taskGoals.map((row) => ({ key: row.goal_id, value: row.task_id })));
  const projectsByGoal = group(projectGoals.map((row) => ({ key: row.goal_id, value: row.project_id })));
  const goalsByProject = group(projectGoals.map((row) => ({ key: row.project_id, value: row.goal_id })));

  const projectIds = db.prepare('SELECT id FROM projects').all() as { id: string }[];
  const projectRatio = new Map<string, number | null>();
  for (const project of projectIds) {
    const values: number[] = [];
    for (const taskId of tasksByProject.get(project.id) || []) {
      const task = tasks.get(taskId);
      if (!task) continue;
      const value = includedTaskValue(task.status, task.archived_at);
      if (value != null) values.push(value);
    }
    projectRatio.set(project.id, meanRatio(values));
  }
  return { tasks, tasksByProject, tasksByGoal, projectsByGoal, goalsByProject, projectRatio };
}

function goalPercent(row: GoalRow, model: Model): number | null {
  if (row.progress_mode === 'manual') return manualDisplayPercent(row.current_amount, row.target_amount);
  const ratios = (model.projectsByGoal.get(row.id) || []).map((id) => model.projectRatio.get(id) ?? null);
  const values = (model.tasksByGoal.get(row.id) || []).map((id) => {
    const task = model.tasks.get(id);
    return task ? includedTaskValue(task.status, task.archived_at) : null;
  });
  return autoGoalPercent(ratios, values);
}

function mapGoal(row: GoalRow, model: Model): GoalRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    ownerId: row.owner_id,
    dueDate: row.due_date,
    progressMode: row.progress_mode,
    targetAmount: row.target_amount,
    currentAmount: row.current_amount,
    unit: row.unit,
    icon: row.icon,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: goalPercent(row, model),
    projectIds: model.projectsByGoal.get(row.id) || [],
    taskIds: model.tasksByGoal.get(row.id) || [],
  };
}

function mapProject(row: ProjectRow, model: Model): ProjectRecord {
  const ratio = model.projectRatio.get(row.id) ?? null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
    ownerId: row.owner_id,
    startDate: row.start_date,
    endDate: row.end_date,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: displayPercent(ratio),
    taskIds: model.tasksByProject.get(row.id) || [],
    goalIds: model.goalsByProject.get(row.id) || [],
  };
}

export function loadGoals(db: Database): GoalRecord[] {
  const model = readModel(db);
  const rows = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as GoalRow[];
  return rows.map((row) => mapGoal(row, model));
}

export function loadGoal(db: Database, id: string): GoalRecord | null {
  return loadGoals(db).find((goal) => goal.id === id) || null;
}

export function loadProjects(db: Database): ProjectRecord[] {
  const model = readModel(db);
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map((row) => mapProject(row, model));
}

export function loadProject(db: Database, id: string): ProjectRecord | null {
  return loadProjects(db).find((project) => project.id === id) || null;
}

export function goalProgressMap(db: Database): Map<string, number | null> {
  return new Map(loadGoals(db).map((goal) => [goal.id, goal.progress]));
}

export function applyAchievements(
  db: Database,
  actor: { id: string | null; ip?: string | null },
  before: Map<string, number | null>,
): string[] {
  const achieved: string[] = [];
  const now = Date.now();
  for (const goal of loadGoals(db)) {
    if (goal.progressMode !== 'auto' || goal.status !== 'active' || goal.progress !== 100) continue;
    if (before.has(goal.id) && before.get(goal.id) === 100) continue;
    const info = db.prepare(
      `UPDATE goals SET status = 'achieved', updated_at = ? WHERE id = ? AND status = 'active'`,
    ).run(now, goal.id);
    if (!info.changes) continue;
    audit(db, {
      actorId: actor.id,
      actorLabel: actor.id ? null : 'auto',
      action: 'goal.achieved',
      entity: 'goal',
      entityId: goal.id,
      ip: actor.ip ?? null,
      detail: { progress: 100 },
    });
    achieved.push(goal.id);
  }
  return achieved;
}

export function withGoalAchievements<T>(
  db: Database,
  actor: { id: string | null; ip?: string | null },
  fn: () => T,
): T {
  const run = db.transaction(() => {
    const before = goalProgressMap(db);
    const result = fn();
    applyAchievements(db, actor, before);
    return result;
  });
  return run();
}
