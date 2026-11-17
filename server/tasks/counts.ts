import type { Database } from 'better-sqlite3';
import { todayISO } from './due.ts';

export type TaskCounts = { overdue: number; dueToday: number; open: number };

const OPEN = `archived_at IS NULL AND status IN ('todo','in_progress','blocked')`;

export function taskCounts(db: Database): TaskCounts {
  const today = todayISO();
  const row = db.prepare(
    `SELECT
       SUM(CASE WHEN ${OPEN} AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN ${OPEN} AND due_date = ? THEN 1 ELSE 0 END) AS dueToday,
       SUM(CASE WHEN ${OPEN} THEN 1 ELSE 0 END) AS open
     FROM tasks`,
  ).get(today, today) as { overdue: number | null; dueToday: number | null; open: number | null };
  return {
    overdue: row?.overdue || 0,
    dueToday: row?.dueToday || 0,
    open: row?.open || 0,
  };
}
