import type { Database } from 'better-sqlite3';
import { advanceDueDate } from './due.ts';

type SourceTask = {
  id: string;
  title: string;
  description: string;
  kind: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  created_by_id: string | null;
  source: string;
  recurrence: string;
  world_id: string | null;
  aim_x: number | null;
  aim_y: number | null;
  criteria: string | null;
  archived_at: number | null;
};

/**
 * When a repeating task is marked done, archive it and spawn the next row.
 * Both task_goals and task_projects links are copied onto the new row.
 * Returns the new id, or null when the task does not repeat.
 */
export function spawnNextOccurrence(db: Database, taskId: string, now: number): string | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as SourceTask | undefined;
  if (!row || row.status !== 'done' || row.archived_at) return null;
  if (row.recurrence !== 'daily' && row.recurrence !== 'weekly' && row.recurrence !== 'monthly') return null;

  const id = crypto.randomUUID();
  const due = advanceDueDate(row.due_date, row.recurrence);
  db.prepare(
    `INSERT INTO tasks (
       id, title, description, kind, status, priority, due_date, assignee_id, created_by_id,
       source, recurrence, world_id, aim_x, aim_y, criteria, completed_at, completed_by,
       archived_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  ).run(
    id,
    row.title,
    row.description,
    row.kind,
    row.priority,
    due,
    row.assignee_id,
    row.created_by_id,
    row.source,
    row.recurrence,
    row.world_id,
    row.aim_x,
    row.aim_y,
    row.criteria,
    now,
    now,
  );
  db.prepare(
    'INSERT INTO task_goals (task_id, goal_id) SELECT ?, goal_id FROM task_goals WHERE task_id = ?',
  ).run(id, row.id);
  db.prepare(
    'INSERT INTO task_projects (task_id, project_id) SELECT ?, project_id FROM task_projects WHERE task_id = ?',
  ).run(id, row.id);
  db.prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
  return id;
}
