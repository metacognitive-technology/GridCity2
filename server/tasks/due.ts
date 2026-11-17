/** Task due dates use GRIDCITY_TZ (default America/New_York). Dates are YYYY-MM-DD. */

export function gridTimezone(): string {
  const tz = process.env.GRIDCITY_TZ?.trim();
  return tz || 'America/New_York';
}

export function todayISO(timeZone = gridTimezone(), now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Calendar months. Day 31 lands on the last day of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, last);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), clamped)).toISOString().slice(0, 10);
}

/** Next due date for a spawned occurrence. A blank due date stays blank. */
export function advanceDueDate(iso: string | null, recurrence: string): string | null {
  if (!iso) return null;
  if (recurrence === 'daily') return addDays(iso, 1);
  if (recurrence === 'weekly') return addDays(iso, 7);
  if (recurrence === 'monthly') return addMonths(iso, 1);
  return iso;
}

export type DueBucket = 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** Done, cancelled, and archived tasks are never overdue. Soon is 1–3 days ahead. */
export function dueBucket(
  due: string | null | undefined,
  status: string,
  archivedAt: number | null | undefined,
  today = todayISO(),
): DueBucket {
  if (archivedAt || status === 'done' || status === 'cancelled') return 'none';
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDays(today, 3)) return 'soon';
  return 'later';
}
