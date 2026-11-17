import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { blockGridPointerEvents } from '../dockEvents';
import type { GoalItem, ProjectItem, TaskItem } from './types';

type Draft = {
  title: string;
  icon: string;
  dueDate: string;
  status: GoalItem['status'];
  progressMode: 'auto' | 'manual';
  targetAmount: string;
  currentAmount: string;
  unit: string;
  description: string;
  projectIds: string[];
  taskIds: string[];
};

function fromGoal(goal: GoalItem | null): Draft {
  return {
    title: goal?.title || '',
    icon: goal?.icon || '',
    dueDate: goal?.dueDate || '',
    status: goal?.status || 'active',
    progressMode: goal?.progressMode || 'auto',
    targetAmount: goal?.targetAmount == null ? '' : String(goal.targetAmount),
    currentAmount: goal?.currentAmount == null ? '' : String(goal.currentAmount),
    unit: goal?.unit || '',
    description: goal?.description || '',
    projectIds: goal?.projectIds ? [...goal.projectIds] : [],
    taskIds: goal?.taskIds ? [...goal.taskIds] : [],
  };
}

function toggle(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

export function GoalDialog({
  goal,
  projects,
  tasks,
  onClose,
  onSaved,
}: {
  goal: GoalItem | null;
  projects: ProjectItem[];
  tasks: TaskItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromGoal(goal));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(fromGoal(goal));
    setError(null);
  }, [goal]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      title: draft.title.trim(),
      icon: draft.icon.trim() || null,
      dueDate: draft.dueDate || null,
      status: draft.status,
      progressMode: draft.progressMode,
      description: draft.description,
      projectIds: draft.projectIds,
      taskIds: draft.taskIds,
      targetAmount: draft.targetAmount.trim() === '' ? null : Number(draft.targetAmount),
      currentAmount: draft.currentAmount.trim() === '' ? null : Number(draft.currentAmount),
      unit: draft.unit.trim() || null,
    };
    try {
      const res = await api(goal ? `/api/goals/${goal.id}` : '/api/goals', {
        method: goal ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not save the goal');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    const res = await api(`/api/goals/${goal.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete the goal');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4"
      data-grid-control
      data-testid="goal-dialog"
      {...blockGridPointerEvents}
    >
      <form className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onSubmit={save}>
        <h2 className="text-lg font-black mb-4">{goal ? 'Edit goal' : 'New goal'}</h2>
        <input
          data-testid="goal-title"
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Title"
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Icon</label>
            <input
              data-testid="goal-icon-input"
              value={draft.icon}
              onChange={(e) => setDraft((prev) => ({ ...prev, icon: e.target.value }))}
              placeholder="🎯"
              maxLength={16}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Due date</label>
            <input
              data-testid="goal-due-input"
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
        </div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
        <select
          data-testid="goal-status"
          value={draft.status}
          onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as Draft['status'] }))}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        >
          <option value="active">Active</option>
          <option value="achieved">Achieved</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="block text-xs font-bold text-slate-500 mb-1">Progress</label>
        <select
          data-testid="goal-mode"
          value={draft.progressMode}
          onChange={(e) => setDraft((prev) => ({ ...prev, progressMode: e.target.value as Draft['progressMode'] }))}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        >
          <option value="auto">Auto from projects and tasks</option>
          <option value="manual">Manual</option>
        </select>
        {draft.progressMode === 'manual' && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              data-testid="goal-target"
              value={draft.targetAmount}
              onChange={(e) => setDraft((prev) => ({ ...prev, targetAmount: e.target.value }))}
              placeholder="Target"
              inputMode="decimal"
              className="px-3 py-2 rounded-xl border border-slate-200"
            />
            <input
              data-testid="goal-current"
              value={draft.currentAmount}
              onChange={(e) => setDraft((prev) => ({ ...prev, currentAmount: e.target.value }))}
              placeholder="Current"
              inputMode="decimal"
              className="px-3 py-2 rounded-xl border border-slate-200"
            />
            <input
              data-testid="goal-unit"
              value={draft.unit}
              onChange={(e) => setDraft((prev) => ({ ...prev, unit: e.target.value }))}
              placeholder="Unit"
              className="px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
        )}
        <textarea
          data-testid="goal-description"
          value={draft.description}
          onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description"
          rows={2}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <fieldset className="mb-3">
          <legend className="text-xs font-bold text-slate-500 mb-1">Projects</legend>
          <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
            {projects.length === 0 && <p className="text-xs text-slate-400">No projects yet.</p>}
            {projects.map((project) => (
              <label key={project.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  data-testid="goal-project-option"
                  data-project-id={project.id}
                  checked={draft.projectIds.includes(project.id)}
                  onChange={(e) => setDraft((prev) => ({
                    ...prev,
                    projectIds: toggle(prev.projectIds, project.id, e.target.checked),
                  }))}
                />
                <span className="truncate">{project.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mb-3">
          <legend className="text-xs font-bold text-slate-500 mb-1">Tasks</legend>
          <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
            {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
            {tasks.map((task) => (
              <label key={task.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  data-testid="goal-task-option"
                  data-task-id={task.id}
                  checked={draft.taskIds.includes(task.id)}
                  onChange={(e) => setDraft((prev) => ({
                    ...prev,
                    taskIds: toggle(prev.taskIds, task.id, e.target.checked),
                  }))}
                />
                <span className="truncate">{task.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !draft.title.trim()} data-testid="goal-save" className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
            Save
          </button>
          {goal && (
            <button type="button" data-testid="goal-delete" className="px-3 py-2 rounded-xl text-red-600 font-bold" onClick={() => void remove()}>
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 font-bold">Cancel</button>
        </div>
      </form>
    </div>
  );
}
