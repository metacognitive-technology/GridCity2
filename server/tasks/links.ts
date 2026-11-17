import type { Database } from 'better-sqlite3';

const TABLES = { tasks: 'tasks', goals: 'goals', projects: 'projects' } as const;

export type LinkTable = keyof typeof TABLES;

export type TaskLinkSets = { goalIds: string[]; projectIds: string[] };

/** Dedupe a JSON id list. Callers treat a missing field as "leave links alone". */
export function parseIdList(raw: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'invalid links' };
  if (raw.length > 200) return { ok: false, error: 'invalid links' };
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return { ok: false, error: 'invalid links' };
    const id = item.trim();
    if (!id || id.length > 80) return { ok: false, error: 'invalid links' };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids };
}

export function idsExist(db: Database, table: LinkTable, ids: string[]): boolean {
  if (ids.length === 0) return true;
  const placeholders = ids.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM ${TABLES[table]} WHERE id IN (${placeholders})`,
  ).get(...ids) as { c: number };
  return row.c === ids.length;
}

export function taskLinkMap(db: Database, ids: string[]): Map<string, TaskLinkSets> {
  const map = new Map<string, TaskLinkSets>();
  if (ids.length === 0) return map;
  const ensure = (id: string) => {
    let row = map.get(id);
    if (!row) {
      row = { goalIds: [], projectIds: [] };
      map.set(id, row);
    }
    return row;
  };
  const placeholders = ids.map(() => '?').join(',');
  const goals = db.prepare(
    `SELECT task_id, goal_id FROM task_goals WHERE task_id IN (${placeholders}) ORDER BY goal_id`,
  ).all(...ids) as { task_id: string; goal_id: string }[];
  for (const row of goals) ensure(row.task_id).goalIds.push(row.goal_id);
  const projects = db.prepare(
    `SELECT task_id, project_id FROM task_projects WHERE task_id IN (${placeholders}) ORDER BY project_id`,
  ).all(...ids) as { task_id: string; project_id: string }[];
  for (const row of projects) ensure(row.task_id).projectIds.push(row.project_id);
  return map;
}

export function replaceTaskGoals(db: Database, taskId: string, goalIds: string[]) {
  db.prepare('DELETE FROM task_goals WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_goals (task_id, goal_id) VALUES (?, ?)');
  for (const goalId of goalIds) insert.run(taskId, goalId);
}

export function replaceTaskProjects(db: Database, taskId: string, projectIds: string[]) {
  db.prepare('DELETE FROM task_projects WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_projects (task_id, project_id) VALUES (?, ?)');
  for (const projectId of projectIds) insert.run(taskId, projectId);
}

export function replaceGoalTasks(db: Database, goalId: string, taskIds: string[]) {
  db.prepare('DELETE FROM task_goals WHERE goal_id = ?').run(goalId);
  const insert = db.prepare('INSERT INTO task_goals (task_id, goal_id) VALUES (?, ?)');
  for (const taskId of taskIds) insert.run(taskId, goalId);
}

export function replaceGoalProjects(db: Database, goalId: string, projectIds: string[]) {
  db.prepare('DELETE FROM project_goals WHERE goal_id = ?').run(goalId);
  const insert = db.prepare('INSERT INTO project_goals (project_id, goal_id) VALUES (?, ?)');
  for (const projectId of projectIds) insert.run(projectId, goalId);
}

export function replaceProjectTasks(db: Database, projectId: string, taskIds: string[]) {
  db.prepare('DELETE FROM task_projects WHERE project_id = ?').run(projectId);
  const insert = db.prepare('INSERT INTO task_projects (task_id, project_id) VALUES (?, ?)');
  for (const taskId of taskIds) insert.run(taskId, projectId);
}
