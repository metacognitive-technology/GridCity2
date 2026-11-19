import type { Database } from 'better-sqlite3';
import { can } from '../auth/permissions.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { PLAYFUL_BUILD_IDEA } from '../../src/shared/taskBot.ts';
import { urgentOpenTasks } from './checker.ts';

type BotPayload = {
  reply?: string;
  actions?: unknown[];
  ask?: unknown;
  escalate?: unknown;
};

/** System-prompt addendum. Lists only the task actions this caller may use. Never includes emails. */
export function taskPromptSection(user: SessionUser, db: Database): string {
  const lines: string[] = [
    `Signed-in user: ${JSON.stringify({ name: user.name, role: user.role })}.`,
    'Never mention email addresses.',
  ];
  if (user.role === 'admin') {
    const open = urgentOpenTasks(db, 5);
    lines.push(`openTasks (most urgent, at most 5): ${JSON.stringify(open.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      kind: task.kind,
      dueDate: task.dueDate,
    })))}`);
  } else if (can(user, 'tasks.view')) {
    lines.push('This user can see only tasks assigned to them. Do not mention tasks assigned to anyone else.');
  }
  if (user.role !== 'admin' && can(user, 'tasks.edit')) {
    lines.push('suggest_goal is allowed for this player. Propose one in-game goal and wait for them to choose Create it. Do not emit create_task until then.');
  }
  const actions: string[] = [];
  if (can(user, 'tasks.create') && can(user, 'tasks.edit')) {
    actions.push(
      '{"op":"create_task","title":"...","notes":"...","kind":"in_game","criteria":{...},"region":{"minX":0,"minY":0,"maxX":10,"maxY":10},"dueDate":"YYYY-MM-DD","goalId":"..."}',
    );
  } else if (can(user, 'tasks.create')) {
    actions.push('{"op":"create_task","title":"...","notes":"..."} — quick Request only. Keep title and notes. Do not add kind, criteria, region, dueDate, or goalId.');
    lines.push('This user cannot view tasks. If they ask what is next, give a playful build idea and do not list, quote, or invent existing tasks.');
  }
  if (can(user, 'tasks.view')) {
    actions.push('{"op":"list_tasks","filter":"mine"|"overdue"|"in_game"}');
  }
  if (can(user, 'tasks.ingame.check') || can(user, 'goals.view')) {
    actions.push('{"op":"check_goal","taskId":"..."} or {"op":"check_goal","goalId":"..."}');
  }
  if (can(user, 'tasks.edit')) {
    actions.push(
      '{"op":"suggest_goal","worldId":"...","aim":{"x":0,"y":0},"title":"...","criteria":{...}} — propose only. Also set ask to {"type":"choice","prompt":"...","options":["Create it","Not now"]}. Do not emit create_task until the user chooses Create it.',
    );
  }
  if (!actions.length) {
    lines.push('Task actions are not available for this user. Do not return create_task, list_tasks, check_goal, or suggest_goal.');
  } else {
    lines.push('Extra data actions this user may use (the client runs them; do not invent others):');
    for (const action of actions) lines.push(`- ${action}`);
  }
  return lines.join('\n');
}

/**
 * Test seam. GRIDBOT_FAKE_LLM=1 returns a scripted reply and never calls xAI.
 * Returns null when the seam is off.
 */
export function scriptedBotReply(user: SessionUser, db: Database, message: string): BotPayload | null {
  if (process.env.GRIDBOT_FAKE_LLM !== '1') return null;
  const text = message.trim();
  const lower = text.toLowerCase();
  if (/^not now\.?$/i.test(text)) {
    return { reply: 'Okay, I will not create that task.' };
  }
  if (/create it/i.test(lower)) {
    return {
      reply: 'Creating that task.',
      actions: [{
        op: 'create_task',
        title: 'Connect the neighborhoods',
        notes: 'Suggested by GridBot',
        kind: 'in_game',
        criteria: { type: 'road_connected', from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
      }],
    };
  }
  if (/suggest a goal|give me a goal|suggest_goal/i.test(lower)) {
    if (!can(user, 'tasks.edit')) return { reply: PLAYFUL_BUILD_IDEA };
    return {
      reply: 'Connect the two neighborhoods?',
      actions: [{
        op: 'suggest_goal',
        worldId: 'current',
        aim: { x: 2, y: 2 },
        title: 'Connect the neighborhoods',
        criteria: { type: 'road_connected', from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
      }],
      ask: {
        type: 'choice',
        prompt: 'Create this in-game task?',
        options: ['Create it', 'Not now'],
      },
    };
  }
  if (/build a neighborhood|build_neighborhood/i.test(lower)) {
    return {
      reply: 'Building a neighborhood.',
      actions: [{ op: 'build_neighborhood', homes: 3, school: false, origin: { x: 4, y: 4 } }],
    };
  }
  if (/remind grandpa/i.test(lower)) {
    return {
      reply: 'I will remind Grandpa about the train set.',
      actions: [{
        op: 'create_task',
        title: 'Get me a train set',
        notes: text,
        kind: 'in_game',
        criteria: { type: 'tile_count', tiles: ['building-train-station'], min: 1 },
      }],
    };
  }
  if (/what'?s next/i.test(lower)) {
    if (can(user, 'tasks.view')) {
      const tasks = urgentOpenTasks(db, 5, user.role === 'admin' ? undefined : user.id);
      const lines = tasks.length
        ? tasks.map((task) => `- ${task.title}`).join('\n')
        : 'Nothing is open.';
      return {
        reply: `Here's what's next:\n${lines}`,
        actions: [{ op: 'list_tasks' }],
      };
    }
    return { reply: PLAYFUL_BUILD_IDEA };
  }
  return { reply: 'OK' };
}

function isChoiceAsk(ask: unknown): boolean {
  return !!ask && typeof ask === 'object' && (ask as { type?: unknown }).type === 'choice';
}

/** Drop task actions the caller cannot perform. Players keep title and notes only. */
export function presentBotPayload(user: SessionUser, payload: BotPayload): BotPayload {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const next: unknown[] = [];
  let strippedSuggest = false;
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    const body = action as Record<string, unknown>;
    if (body.op === 'create_task') {
      if (!can(user, 'tasks.create')) continue;
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 140) : '';
      if (!title) continue;
      if (!can(user, 'tasks.edit')) {
        next.push({
          op: 'create_task',
          title,
          notes: typeof body.notes === 'string' ? body.notes.slice(0, 5000) : undefined,
        });
        continue;
      }
      next.push(action);
      continue;
    }
    if (body.op === 'list_tasks') {
      if (!can(user, 'tasks.view')) continue;
      const filter = body.filter === 'mine' || body.filter === 'overdue' || body.filter === 'in_game'
        ? body.filter
        : undefined;
      next.push(filter ? { op: 'list_tasks', filter } : { op: 'list_tasks' });
      continue;
    }
    if (body.op === 'check_goal') {
      if (!can(user, 'tasks.ingame.check') && !can(user, 'goals.view')) continue;
      const kept: Record<string, unknown> = { op: 'check_goal' };
      if (typeof body.taskId === 'string') kept.taskId = body.taskId;
      if (typeof body.goalId === 'string') kept.goalId = body.goalId;
      next.push(kept);
      continue;
    }
    if (body.op === 'suggest_goal') {
      if (!can(user, 'tasks.edit')) {
        strippedSuggest = true;
        continue;
      }
      next.push(action);
      continue;
    }
    next.push(action);
  }
  const keptSuggest = next.some((action) => (
    !!action && typeof action === 'object' && (action as { op?: unknown }).op === 'suggest_goal'
  ));
  const ask = strippedSuggest && !keptSuggest && isChoiceAsk(payload.ask) ? undefined : payload.ask;
  return {
    reply: typeof payload.reply === 'string' ? payload.reply : '',
    ...(next.length ? { actions: next } : {}),
    ...(ask ? { ask } : {}),
    ...(payload.escalate ? { escalate: payload.escalate } : {}),
  };
}
