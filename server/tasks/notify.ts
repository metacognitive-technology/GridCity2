import type { Server } from 'socket.io';
import type { Database } from 'better-sqlite3';
import { can } from '../auth/permissions.ts';
import type { RoleName } from '../../src/permissions.ts';
import { taskCounts, taskCountsForAssignee } from './counts.ts';

export function publishTaskChange(io: Server, db: Database, taskId: string | null, alsoUserId?: string | null) {
  const counts = taskCounts(db);
  io.to('role:admin').emit('task-counts', counts);
  if (taskId) io.to('role:admin').emit('task-updated', { id: taskId });
  io.to('role:admin').emit('goals-updated', {});

  const ids = new Set<string>();
  if (alsoUserId) ids.add(alsoUserId);
  if (taskId) {
    const row = db.prepare('SELECT assignee_id FROM tasks WHERE id = ?').get(taskId) as
      | { assignee_id: string | null }
      | undefined;
    if (row?.assignee_id) ids.add(row.assignee_id);
  }
  for (const userId of ids) notifyPlayer(io, db, userId, taskId);
}

/** Live My Tasks / goal refresh for a non-admin who holds the matching override. */
function notifyPlayer(io: Server, db: Database, userId: string, taskId: string | null) {
  const player = db.prepare(
    'SELECT id, role, permissions FROM users WHERE id = ? AND active = 1',
  ).get(userId) as { id: string; role: RoleName; permissions: string } | undefined;
  if (!player || player.role === 'admin') return;
  const viewTasks = can(player, 'tasks.view');
  const viewGoals = can(player, 'goals.view');
  if (!viewTasks && !viewGoals) return;
  if (viewTasks) io.to(`user:${player.id}`).emit('task-counts', taskCountsForAssignee(db, player.id));
  io.to(`user:${player.id}`).emit('task-updated', taskId ? { id: taskId } : {});
  if (viewGoals) io.to(`user:${player.id}`).emit('goals-updated', {});
}

/** Goal or project writes. Task lists refetch because links may have changed. */
export function publishGoalsChange(io: Server) {
  io.to('role:admin').emit('goals-updated', {});
  io.to('role:admin').emit('task-updated', {});
}

export function publishAuthChanged(io: Server, userId: string) {
  io.to(`user:${userId}`).emit('auth-changed', { userId });
}
