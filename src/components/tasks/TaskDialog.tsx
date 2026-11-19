import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { parseCriteria } from '../../shared/taskCriteria';
import { blockGridPointerEvents } from '../dockEvents';
import { CriteriaFields } from './CriteriaFields';
import { TaskTags } from './TaskTags';
import type { GoalItem, PersonOption, ProjectItem, TaskItem } from './types';

type Draft = {
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  kind: 'real_world' | 'in_game';
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  worldId: string;
  aimX: string;
  aimY: string;
  criteria: string;
  goalIds: string[];
  projectIds: string[];
};

const emptyDraft = (): Draft => ({
  title: '',
  description: '',
  assigneeId: '',
  dueDate: '',
  priority: 'medium',
  kind: 'real_world',
  recurrence: 'none',
  worldId: '',
  aimX: '',
  aimY: '',
  criteria: '',
  goalIds: [],
  projectIds: [],
});

function fromTask(task: TaskItem): Draft {
  return {
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId || '',
    dueDate: task.dueDate || '',
    priority: task.priority,
    kind: task.kind,
    recurrence: task.recurrence,
    worldId: task.worldId || '',
    aimX: task.aimX == null ? '' : String(task.aimX),
    aimY: task.aimY == null ? '' : String(task.aimY),
    criteria: task.criteria == null ? '' : JSON.stringify(task.criteria, null, 2),
    goalIds: task.goalIds ? [...task.goalIds] : [],
    projectIds: task.projectIds ? [...task.projectIds] : [],
  };
}

export function TaskDialog({
  task,
  people,
  onClose,
  onSaved,
}: {
  task: TaskItem | null;
  people: PersonOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [more, setMore] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState(task?.comments || []);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [linksReady, setLinksReady] = useState(false);

  useEffect(() => {
    setDraft(task ? fromTask(task) : emptyDraft());
    setComments(task?.comments || []);
    setMore(!!task && task.kind === 'in_game');
    setError(null);
    setComment('');
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    const loadLinks = async () => {
      const [goalRes, projectRes] = await Promise.all([api('/api/goals'), api('/api/projects')]);
      if (cancelled) return;
      if (!goalRes.ok || !projectRes.ok) {
        setLinksReady(false);
        return;
      }
      const goalData = await goalRes.json().catch(() => null);
      const projectData = await projectRes.json().catch(() => null);
      if (cancelled) return;
      setGoals(Array.isArray(goalData?.goals) ? goalData.goals : []);
      setProjects(Array.isArray(projectData?.projects) ? projectData.projects : []);
      setLinksReady(true);
    };
    void loadLinks();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const payload = () => {
    const body: Record<string, unknown> = {
      title: draft.title.trim(),
      description: draft.description,
      assigneeId: draft.assigneeId || null,
      dueDate: draft.dueDate || null,
      priority: draft.priority,
      kind: draft.kind,
      recurrence: draft.recurrence,
      worldId: draft.worldId.trim() || null,
    };
    if (draft.aimX.trim()) body.aimX = Number(draft.aimX);
    else body.aimX = null;
    if (draft.aimY.trim()) body.aimY = Number(draft.aimY);
    else body.aimY = null;
    if (draft.criteria.trim()) body.criteria = draft.criteria;
    else body.criteria = null;
    if (linksReady) {
      body.goalIds = draft.goalIds;
      body.projectIds = draft.projectIds;
    }
    return body;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.kind === 'in_game' && draft.criteria.trim()) {
      let raw: unknown;
      try {
        raw = JSON.parse(draft.criteria);
      } catch {
        setError('criteria must be JSON');
        return;
      }
      const parsed = parseCriteria(raw);
      if (!parsed.ok) {
        setError('invalid criteria');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api(task ? `/api/tasks/${task.id}` : '/api/tasks', {
        method: task ? 'PATCH' : 'POST',
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not save the task');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!task || !comment.trim()) return;
    const res = await api(`/api/tasks/${task.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: comment.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not add the comment');
      return;
    }
    setComments((list) => [...list, data]);
    setComment('');
    onSaved();
  };

  const removeComment = async (id: string) => {
    if (!task) return;
    const res = await api(`/api/tasks/${task.id}/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete the comment');
      return;
    }
    setComments((list) => list.filter((item) => item.id !== id));
    onSaved();
  };

  const removeTask = async () => {
    if (!task) return;
    const res = await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete the task');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4"
      data-grid-control
      data-testid="task-dialog"
      {...blockGridPointerEvents}
    >
      <form className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onSubmit={save}>
        <h2 className="text-lg font-black mb-4">{task ? 'Edit task' : 'New task'}</h2>
        {!!task?.tags?.length && (
          <div className="flex flex-wrap gap-1 mb-3">
            <TaskTags tags={task.tags} />
          </div>
        )}
        <input
          data-testid="task-title"
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Title"
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <textarea
          data-testid="task-notes"
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Notes"
          rows={3}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <label className="block text-xs font-bold text-slate-500 mb-1">Assignee</label>
        <select
          data-testid="task-assignee"
          value={draft.assigneeId}
          onChange={(e) => set('assigneeId', e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        >
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Due date</label>
            <input
              data-testid="task-due"
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Priority</label>
            <select
              data-testid="task-priority"
              value={draft.priority}
              onChange={(e) => set('priority', e.target.value as Draft['priority'])}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          data-testid="task-more-details"
          className="text-xs font-bold text-blue-600 mb-3"
          onClick={() => setMore((value) => !value)}
        >
          {more ? 'Hide details' : 'More details'}
        </button>
        {more && (
          <div className="space-y-2 mb-3">
            <label className="block text-xs font-bold text-slate-500">Kind</label>
            <select
              data-testid="task-kind"
              value={draft.kind}
              onChange={(e) => set('kind', e.target.value as Draft['kind'])}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            >
              <option value="real_world">Real-world</option>
              <option value="in_game">In-game</option>
            </select>
            <label className="block text-xs font-bold text-slate-500">Recurrence</label>
            <select
              data-testid="task-recurrence"
              value={draft.recurrence}
              onChange={(e) => set('recurrence', e.target.value as Draft['recurrence'])}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {linksReady && (
              <>
                <fieldset data-testid="task-goals">
                  <legend className="text-xs font-bold text-slate-500">Goals</legend>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {goals.length === 0 && <p className="text-[11px] text-slate-400">No goals yet.</p>}
                    {goals.map((goal) => (
                      <label key={goal.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          data-testid="task-goal-option"
                          data-goal-id={goal.id}
                          checked={draft.goalIds.includes(goal.id)}
                          onChange={(e) => set('goalIds', e.target.checked
                            ? (draft.goalIds.includes(goal.id) ? draft.goalIds : [...draft.goalIds, goal.id])
                            : draft.goalIds.filter((id) => id !== goal.id))}
                        />
                        <span className="truncate">{goal.icon ? `${goal.icon} ` : ''}{goal.title}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset data-testid="task-projects">
                  <legend className="text-xs font-bold text-slate-500">Projects</legend>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {projects.length === 0 && <p className="text-[11px] text-slate-400">No projects yet.</p>}
                    {projects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          data-testid="task-project-option"
                          data-project-id={project.id}
                          checked={draft.projectIds.includes(project.id)}
                          onChange={(e) => set('projectIds', e.target.checked
                            ? (draft.projectIds.includes(project.id) ? draft.projectIds : [...draft.projectIds, project.id])
                            : draft.projectIds.filter((id) => id !== project.id))}
                        />
                        <span className="truncate">{project.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {draft.kind === 'in_game' && (
              <>
                <input
                  data-testid="task-world"
                  value={draft.worldId}
                  onChange={(e) => set('worldId', e.target.value)}
                  placeholder="World / room"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    data-testid="task-aim-x"
                    value={draft.aimX}
                    onChange={(e) => set('aimX', e.target.value)}
                    placeholder="Aim X"
                    className="px-3 py-2 rounded-xl border border-slate-200"
                  />
                  <input
                    data-testid="task-aim-y"
                    value={draft.aimY}
                    onChange={(e) => set('aimY', e.target.value)}
                    placeholder="Aim Y"
                    className="px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <CriteriaFields value={draft.criteria} onChange={(json) => set('criteria', json)} />
                <textarea
                  data-testid="task-criteria"
                  value={draft.criteria}
                  onChange={(e) => set('criteria', e.target.value)}
                  placeholder="Criteria JSON"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs"
                />
              </>
            )}
            {task && (
              <div data-testid="task-comments">
                <p className="text-xs font-bold text-slate-500 mb-1">Comments</p>
                <ul className="space-y-1 mb-2">
                  {comments.map((item) => (
                    <li key={item.id} data-testid="task-comment-row" className="flex justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1">
                      <span><span className="font-bold">{item.authorName || 'Someone'}: </span>{item.body}</span>
                      <button type="button" className="text-red-500 font-bold" onClick={() => void removeComment(item.id)}>Delete</button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    data-testid="task-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comment"
                    className="flex-1 px-2 py-1 rounded-lg border border-slate-200"
                  />
                  <button type="button" data-testid="task-comment-submit" className="px-2 py-1 rounded-lg bg-slate-100 font-bold" onClick={() => void addComment()}>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !draft.title.trim()} data-testid="task-save" className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
            Save
          </button>
          {task && (
            <button type="button" data-testid="task-delete" className="px-3 py-2 rounded-xl text-red-600 font-bold" onClick={() => void removeTask()}>
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 font-bold">Cancel</button>
        </div>
      </form>
    </div>
  );
}
