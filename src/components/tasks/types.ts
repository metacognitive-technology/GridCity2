export type TaskComment = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: number;
};

export type DueBucket = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  kind: 'real_world' | 'in_game';
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  dueBucket: DueBucket;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  source: 'form' | 'quick' | 'bot';
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  worldId: string | null;
  aimX: number | null;
  aimY: number | null;
  criteria: unknown;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  comments: TaskComment[];
};

export type PersonOption = { id: string; name: string };

const BUCKET_RANK: Record<DueBucket, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/** Overdue, today, soon, later by due date, then undated by priority. */
export function sortMyTasks(tasks: TaskItem[]): TaskItem[] {
  return tasks.slice().sort((a, b) => {
    const bucket = (BUCKET_RANK[a.dueBucket] ?? 4) - (BUCKET_RANK[b.dueBucket] ?? 4);
    if (bucket) return bucket;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  });
}
