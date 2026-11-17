import type { Server } from 'socket.io';
import type { Database } from 'better-sqlite3';
import { taskCounts } from './counts.ts';

export function publishTaskChange(io: Server, db: Database, taskId: string | null) {
  const counts = taskCounts(db);
  io.to('role:admin').emit('task-counts', counts);
  if (taskId) io.to('role:admin').emit('task-updated', { id: taskId });
  io.to('role:admin').emit('goals-updated', {});
}

/** Goal or project writes. Task lists refetch because links may have changed. */
export function publishGoalsChange(io: Server) {
  io.to('role:admin').emit('goals-updated', {});
  io.to('role:admin').emit('task-updated', {});
}

export function publishAuthChanged(io: Server, userId: string) {
  io.to(`user:${userId}`).emit('auth-changed', { userId });
}
