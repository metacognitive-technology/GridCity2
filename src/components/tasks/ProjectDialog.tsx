import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { blockGridPointerEvents } from '../dockEvents';
import type { ProjectItem, TaskItem } from './types';

type Draft = {
  name: string;
  description: string;
  status: ProjectItem['status'];
  taskIds: string[];
};

function fromProject(project: ProjectItem | null): Draft {
  return {
    name: project?.name || '',
    description: project?.description || '',
    status: project?.status || 'active',
    taskIds: project?.taskIds ? [...project.taskIds] : [],
  };
}

function toggle(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

export function ProjectDialog({
  project,
  tasks,
  onClose,
  onSaved,
}: {
  project: ProjectItem | null;
  tasks: TaskItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromProject(project));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(fromProject(project));
    setError(null);
  }, [project]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name.trim(),
      description: draft.description,
      status: draft.status,
      taskIds: draft.taskIds,
    };
    try {
      const res = await api(project ? `/api/projects/${project.id}` : '/api/projects', {
        method: project ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not save the project');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    const res = await api(`/api/projects/${project.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete the project');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4"
      data-grid-control
      data-testid="project-dialog"
      {...blockGridPointerEvents}
    >
      <form className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onSubmit={save}>
        <h2 className="text-lg font-black mb-4">{project ? 'Edit project' : 'New project'}</h2>
        <input
          data-testid="project-name"
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Name"
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
        <select
          data-testid="project-status"
          value={draft.status}
          onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as Draft['status'] }))}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <textarea
          data-testid="project-description"
          value={draft.description}
          onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description"
          rows={2}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
        />
        <fieldset className="mb-3">
          <legend className="text-xs font-bold text-slate-500 mb-1">Tasks</legend>
          <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
            {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
            {tasks.map((task) => (
              <label key={task.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  data-testid="project-task-option"
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
          <button type="submit" disabled={busy || !draft.name.trim()} data-testid="project-save" className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
            Save
          </button>
          {project && (
            <button type="button" data-testid="project-delete" className="px-3 py-2 rounded-xl text-red-600 font-bold" onClick={() => void remove()}>
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 font-bold">Cancel</button>
        </div>
      </form>
    </div>
  );
}
