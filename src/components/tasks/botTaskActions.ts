import type { BotAction, BotPoint, BotRegion } from '../../botActions';
import { isTaskBotAction } from '../../botActions';
import { api } from '../../api';
import { PLAYFUL_BUILD_IDEA } from '../../shared/taskBot';
import { parseCriteria } from '../../shared/taskCriteria';
import type { GoalItem, TaskItem } from './types';

export { isTaskBotAction };

type Can = {
  edit: boolean;
  view: boolean;
  check: boolean;
  goals: boolean;
};

type Ctx = {
  can: Can;
  roomCode: string | null;
  aim: BotPoint | null;
};

/** Data actions run through REST with the session cookie. suggest_goal never creates a row. */
export async function executeTaskBotActions(actions: BotAction[], ctx: Ctx): Promise<string> {
  const lines: string[] = [];
  for (const action of actions) {
    if (action.op === 'create_task') lines.push(await createTask(action, ctx));
    else if (action.op === 'list_tasks') lines.push(await listTasks(action.filter, ctx));
    else if (action.op === 'check_goal') lines.push(await checkGoal(action, ctx));
    else if (action.op === 'suggest_goal') {
      const title = action.title?.trim() || 'that goal';
      lines.push(`I'll wait for you to confirm “${title}” before creating it.`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

async function createTask(action: Extract<BotAction, { op: 'create_task' }>, ctx: Ctx): Promise<string> {
  const title = action.title.trim();
  if (!title) return 'I need a title for that task.';
  if (!ctx.can.edit) {
    const res = await api('/api/tasks/quick', {
      method: 'POST',
      body: JSON.stringify({ title, notes: action.notes || '' }),
    });
    if (!res.ok) return 'I could not save that task.';
    return 'Task created.';
  }
  const criteria = attachRegion(action.criteria, action.region);
  const kind = action.kind || (criteria ? 'in_game' : 'real_world');
  const aim = action.aim || (action.region ? { x: action.region.minX, y: action.region.minY } : ctx.aim);
  const body: Record<string, unknown> = {
    title,
    description: action.notes || '',
    kind,
    source: 'bot',
    priority: 'medium',
    dueDate: action.dueDate || null,
  };
  if (kind === 'in_game') {
    const worldId = action.worldId && action.worldId !== 'current' ? action.worldId : ctx.roomCode;
    if (worldId) body.worldId = worldId;
    if (aim) {
      body.aimX = aim.x;
      body.aimY = aim.y;
    }
  }
  if (criteria) body.criteria = criteria;
  if (action.goalId) body.goalIds = [action.goalId];
  const res = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (res.status === 403) {
    const quick = await api('/api/tasks/quick', {
      method: 'POST',
      body: JSON.stringify({ title, notes: action.notes || '' }),
    });
    return quick.ok ? 'Task created.' : 'I could not save that task.';
  }
  if (!res.ok) return 'I could not save that task.';
  return 'Task created.';
}

async function listTasks(filter: 'mine' | 'overdue' | 'in_game' | undefined, ctx: Ctx): Promise<string> {
  if (!ctx.can.view) return PLAYFUL_BUILD_IDEA;
  const params = new URLSearchParams();
  if (filter === 'mine') {
    params.set('assignee', 'me');
    params.set('status', 'open');
  } else if (filter === 'overdue') {
    params.set('due', 'overdue');
  } else if (filter === 'in_game') {
    params.set('kind', 'in_game');
    params.set('status', 'open');
  } else {
    params.set('status', 'open');
  }
  const res = await api(`/api/tasks?${params.toString()}`);
  if (res.status === 403 || res.status === 401) return PLAYFUL_BUILD_IDEA;
  const data = await res.json().catch(() => null);
  if (!res.ok) return 'I could not read the task list.';
  const tasks = Array.isArray(data?.tasks) ? data.tasks as TaskItem[] : [];
  const top = tasks.slice(0, 5);
  if (!top.length) return "What's next:\nNothing is open.";
  return `What's next:\n${top.map((task) => `- ${task.title}`).join('\n')}`;
}

async function checkGoal(action: Extract<BotAction, { op: 'check_goal' }>, ctx: Ctx): Promise<string> {
  const lines: string[] = [];
  if (action.taskId && ctx.can.check) {
    const res = await api(`/api/tasks/${action.taskId}/check`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok) lines.push('I could not check that task.');
    else lines.push(progressSentence(data?.checkState?.detail, data?.checkState?.met));
  }
  if (action.goalId && ctx.can.goals) {
    const res = await api('/api/goals');
    const data = await res.json().catch(() => null);
    if (!res.ok) lines.push('I could not read that goal.');
    else {
      const goals = Array.isArray(data?.goals) ? data.goals as GoalItem[] : [];
      const goal = goals.find((item) => item.id === action.goalId);
      if (!goal) lines.push('I could not find that goal.');
      else {
        const pct = goal.progress == null ? '—' : `${goal.progress}%`;
        const amount = goal.progressMode === 'manual' && goal.targetAmount != null
          ? ` (${goal.currentAmount ?? 0} / ${goal.targetAmount}${goal.unit ? ` ${goal.unit}` : ''})`
          : '';
        lines.push(`Goal “${goal.title}” is ${pct}${amount}.`);
      }
    }
  }
  if (!lines.length) return 'Tell me which task or goal to check.';
  return lines.join('\n');
}

function progressSentence(detail: unknown, met: unknown): string {
  if (typeof detail !== 'string' || !detail) return met ? 'Done.' : 'Not yet.';
  const match = detail.match(/^(\d+)\s*\/\s*(\d+)\s+(.+)$/);
  if (!match) return detail;
  const have = Number(match[1]);
  const need = Number(match[2]);
  const label = match[3];
  const left = Math.max(0, need - have);
  if (met || left === 0) return `${have} of ${need} ${label}`;
  return `${have} of ${need} ${label} — ${left} to go`;
}

function attachRegion(criteria: unknown, region: BotRegion | undefined): unknown {
  if (criteria == null) return undefined;
  const parsed = parseCriteria(criteria);
  if (!parsed.ok) return undefined;
  const value = parsed.value;
  if (!region) return value;
  if (value.type === 'tile_count' || value.type === 'homes_in_region' || value.type === 'count') {
    if (!('region' in value) || !value.region) return { ...value, region };
  }
  return value;
}
