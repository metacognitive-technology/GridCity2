import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../auth/AuthProvider';
import { blockGridPointerEvents } from '../dockEvents';
import { GoalsTab } from './GoalsTab';
import { ProjectsTab } from './ProjectsTab';
import { useQuickTask } from './QuickTask';
import { TaskDialog } from './TaskDialog';
import { sortMyTasks, type PersonOption, type TaskItem } from './types';

const fieldClass = 'px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white';

function dueChip(task: TaskItem): { label: string; className: string } {
  if (task.dueBucket === 'overdue') return { label: task.dueDate || 'Overdue', className: 'bg-red-100 text-red-700' };
  if (task.dueBucket === 'today') return { label: 'Today', className: 'bg-amber-100 text-amber-800' };
  if (task.dueBucket === 'soon' || task.dueBucket === 'later') {
    return { label: task.dueDate || '', className: 'bg-slate-100 text-slate-600' };
  }
  return { label: 'No date', className: 'bg-slate-100 text-slate-500' };
}

export function TasksPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const quick = useQuickTask();
  const [tab, setTab] = useState<'mine' | 'all' | 'goals' | 'projects'>('mine');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('open');
  const [assignee, setAssignee] = useState('');
  const [kind, setKind] = useState('');
  const [due, setDue] = useState('');
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [undo, setUndo] = useState<{ id: string; title: string; previous: TaskItem['status'] } | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (tab === 'mine') {
      params.set('assignee', 'me');
      params.set('status', 'open');
    } else {
      if (status) params.set('status', status);
      if (assignee) params.set('assignee', assignee);
      if (kind) params.set('kind', kind);
      if (due) params.set('due', due);
    }
    const res = await api(`/api/tasks?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not load tasks');
      return;
    }
    setError(null);
    const list = Array.isArray(data?.tasks) ? data.tasks as TaskItem[] : [];
    setTasks(tab === 'mine' ? sortMyTasks(list) : list);
    setPeople(Array.isArray(data?.people) ? data.people : []);
  };

  useEffect(() => {
    if (!open || tab === 'goals' || tab === 'projects') return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, status, assignee, kind, due, auth.tasksEpoch]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  if (!open) return null;

  const complete = async (task: TaskItem) => {
    const res = await api(`/api/tasks/${task.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'done' }),
    });
    if (!res.ok) {
      setError('Could not complete the task');
      return;
    }
    setUndo({ id: task.id, title: task.title, previous: task.status });
  };

  const undoComplete = async () => {
    if (!undo) return;
    const current = undo;
    setUndo(null);
    const res = await api(`/api/tasks/${current.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: current.previous }),
    });
    if (!res.ok) setError('Could not undo');
  };

  const shown = tasks;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[110] flex flex-col min-h-0"
      data-grid-control
      data-testid="tasks-panel"
      {...blockGridPointerEvents}
    >
      <div className="p-4 border-b flex items-center justify-between bg-slate-50">
        <span className="font-bold">Tasks</span>
        <button type="button" onClick={onClose} title="Close" className="p-1 rounded-lg hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex border-b text-xs font-bold">
        <button type="button" data-testid="tasks-tab-mine" className={`flex-1 py-2 ${tab === 'mine' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`} onClick={() => setTab('mine')}>My Tasks</button>
        <button type="button" data-testid="tasks-tab-all" className={`flex-1 py-2 ${tab === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`} onClick={() => setTab('all')}>All</button>
        <button
          type="button"
          data-testid="goals-tab"
          disabled={!auth.can('goals.view')}
          className={`flex-1 py-2 ${tab === 'goals' ? 'text-blue-600 border-b-2 border-blue-600' : auth.can('goals.view') ? 'text-slate-400' : 'text-slate-300 cursor-not-allowed'}`}
          onClick={() => { if (auth.can('goals.view')) setTab('goals'); }}
        >
          Goals
        </button>
        <button
          type="button"
          data-testid="projects-tab"
          disabled={!auth.can('goals.view')}
          className={`flex-1 py-2 ${tab === 'projects' ? 'text-blue-600 border-b-2 border-blue-600' : auth.can('goals.view') ? 'text-slate-400' : 'text-slate-300 cursor-not-allowed'}`}
          onClick={() => { if (auth.can('goals.view')) setTab('projects'); }}
        >
          Projects
        </button>
      </div>
      {tab === 'all' && (
        <div className="p-3 border-b space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select data-testid="tasks-filter-status" className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select data-testid="tasks-filter-assignee" className={fieldClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Any assignee</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
            <select data-testid="tasks-filter-kind" className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Any kind</option>
              <option value="real_world">Real-world</option>
              <option value="in_game">In-game</option>
            </select>
            <select data-testid="tasks-filter-due" className={fieldClass} value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="soon">Soon</option>
              <option value="none">No date</option>
            </select>
          </div>
          <div className="flex gap-2">
            {auth.can('tasks.edit') && (
              <button type="button" data-testid="tasks-new" className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold" onClick={() => setCreating(true)}>New task</button>
            )}
            {auth.can('tasks.create') && (
              <button type="button" data-testid="tasks-all-quick" className="px-3 py-1.5 rounded-full bg-slate-100 text-xs font-bold" onClick={() => quick.open()}>Quick task</button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'goals' && <GoalsTab epoch={auth.tasksEpoch} onComplete={complete} />}
        {tab === 'projects' && <ProjectsTab epoch={auth.tasksEpoch} onComplete={complete} />}
        {(tab === 'mine' || tab === 'all') && error && <p className="text-xs text-red-600">{error}</p>}
        {(tab === 'mine' || tab === 'all') && shown.length === 0 && !error && <p className="text-xs text-slate-400">No tasks.</p>}
        {(tab === 'mine' || tab === 'all') && shown.map((task) => {
          const chip = dueChip(task);
          return (
            <div
              key={task.id}
              data-testid="task-row"
              data-title={task.title}
              data-source={task.source}
              data-assignee={task.assigneeId || ''}
              data-status={task.status}
              data-due={task.dueBucket}
              className="border border-slate-100 rounded-xl p-3 flex items-start gap-2 cursor-pointer hover:border-blue-200"
              onClick={() => setEditing(task)}
            >
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${task.status === 'in_progress' ? 'bg-blue-500' : task.status === 'blocked' ? 'bg-amber-500' : 'bg-slate-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-800 truncate">{task.title}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${chip.className}`}>{chip.label}</span>
                  <span className="text-[10px] text-slate-400">{task.kind === 'in_game' ? '🌍' : '✅'} {task.priority}</span>
                </div>
              </div>
              {auth.can('tasks.edit') && task.status !== 'done' && task.status !== 'cancelled' && (
                <button
                  type="button"
                  data-testid="task-complete"
                  className="text-[11px] font-bold text-blue-600 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    void complete(task);
                  }}
                >
                  Complete
                </button>
              )}
            </div>
          );
        })}
      </div>
      {undo && (
        <div data-testid="task-undo" className="m-3 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between gap-2">
          <span className="truncate">Completed “{undo.title}”</span>
          <button type="button" data-testid="task-undo-button" className="font-bold underline shrink-0" onClick={() => void undoComplete()}>
            Undo
          </button>
        </div>
      )}
      {(creating || editing) && (
        <TaskDialog
          task={editing}
          people={people}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
}
