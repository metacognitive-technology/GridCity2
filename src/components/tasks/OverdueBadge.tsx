import type { TaskCounts } from '../auth/AuthProvider';

/** Red when something is overdue. Amber when the only urgency is due today. */
export function OverdueBadge({ counts, testId }: { counts: TaskCounts; testId?: string }) {
  if (counts.overdue > 0) {
    return (
      <span
        data-testid={testId}
        data-tone="red"
        className="absolute -top-1 -right-1 min-w-[1.1rem] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
      >
        {counts.overdue}
      </span>
    );
  }
  if (counts.dueToday > 0) {
    return (
      <span
        data-testid={testId}
        data-tone="amber"
        className="absolute -top-1 -right-1 min-w-[1.1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center"
      >
        {counts.dueToday}
      </span>
    );
  }
  return null;
}
