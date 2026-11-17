import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../auth/AuthProvider';
import { GoalDialog } from './GoalDialog';
import { ProgressMeter } from './ProgressMeter';
import type { GoalItem, ProjectItem, TaskItem } from './types';

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function GoalsTab({
  epoch,
  onComplete,
}: {
  epoch: number;
  onComplete: (task: TaskItem) => Promise<void> | void;
}) {
  const auth = useAuth();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<GoalItem | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [goalRes, projectRes, taskRes] = await Promise.all([
        api('/api/goals'),
        api('/api/projects'),
        api('/api/tasks'),
      ]);
      const goalData = await goalRes.json().catch(() => null);
      const projectData = await projectRes.json().catch(() => null);
      const taskData = await taskRes.json().catch(() => null);
      if (cancelled) return;
      if (!goalRes.ok || !projectRes.ok || !taskRes.ok) {
        setError('Could not load goals');
        return;
      }
      setError(null);
      setGoals(Array.isArray(goalData?.goals) ? goalData.goals : []);
      setProjects(Array.isArray(projectData?.projects) ? projectData.projects : []);
      setTasks(Array.isArray(taskData?.tasks) ? taskData.tasks : []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [epoch, revision]);

  const taskById = (id: string) => tasks.find((task) => task.id === id);
  const projectById = (id: string) => projects.find((project) => project.id === id);

  const complete = async (task: TaskItem) => {
    await onComplete(task);
    setRevision((value) => value + 1);
  };

  const canFinish = (task: TaskItem) => (
    auth.can('tasks.edit') && task.status !== 'done' && task.status !== 'cancelled' && !task.archivedAt
  );

  const linkedTask = (task: TaskItem) => (
    <div key={task.id} data-testid="goal-linked-task" data-title={task.title} data-status={task.status} className="flex items-center gap-2 text-xs">
      <span className="flex-1 truncate">{task.title}</span>
      <span className="text-[10px] uppercase text-slate-400">{task.status === 'in_progress' ? 'In progress' : task.status}</span>
      {canFinish(task) && (
        <button type="button" data-testid="task-complete" className="font-bold text-blue-600" onClick={() => void complete(task)}>
          Complete
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {auth.can('goals.edit') && (
        <button
          type="button"
          data-testid="goal-new"
          className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold"
          onClick={() => setCreating(true)}
        >
          New goal
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {goals.length === 0 && !error && <p className="text-xs text-slate-400">No goals.</p>}
      {goals.map((goal) => {
        const expanded = openId === goal.id;
        const linkedTaskIds = new Set(goal.taskIds);
        for (const projectId of goal.projectIds) {
          for (const taskId of projectById(projectId)?.taskIds || []) linkedTaskIds.add(taskId);
        }
        return (
          <article
            key={goal.id}
            data-testid="goal-card"
            data-title={goal.title}
            data-status={goal.status}
            className="border border-slate-100 rounded-xl p-3"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                data-testid="goal-card-toggle"
                className="flex-1 min-w-0 text-left"
                onClick={() => setOpenId(expanded ? null : goal.id)}
              >
                <div className="flex items-center gap-2">
                  <span data-testid="goal-icon" className="text-lg leading-none">{goal.icon || '🎯'}</span>
                  <span className="text-sm font-bold text-slate-800 truncate">{goal.title}</span>
                  {goal.status === 'achieved' && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">Achieved</span>
                  )}
                </div>
                <div className="mt-2">
                  <ProgressMeter percent={goal.progress} testId="goal-progress" />
                </div>
                <div className="mt-1 flex justify-between gap-2 text-[10px] text-slate-500">
                  <span data-testid="goal-due">{goal.dueDate || 'No date'}</span>
                  <span data-testid="goal-counts">
                    {countLabel(goal.projectIds.length, 'project', 'projects')}
                    {' · '}
                    {countLabel(linkedTaskIds.size, 'task', 'tasks')}
                  </span>
                </div>
              </button>
              {auth.can('goals.edit') && (
                <button
                  type="button"
                  data-testid="goal-edit"
                  className="text-[11px] font-bold text-slate-500"
                  onClick={() => setEditing(goal)}
                >
                  Edit
                </button>
              )}
            </div>
            {expanded && (
              <div data-testid="goal-expanded" className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                {goal.projectIds.length === 0 && goal.taskIds.length === 0 && (
                  <p className="text-xs text-slate-400">Nothing linked yet.</p>
                )}
                {goal.projectIds.map((id) => {
                  const project = projectById(id);
                  if (!project) return null;
                  return (
                    <div
                      key={project.id}
                      data-testid="goal-linked-project"
                      data-name={project.name}
                      data-progress={project.progress == null ? '' : String(project.progress)}
                      className="rounded-lg bg-slate-50 p-2"
                    >
                      <div className="text-xs font-bold text-slate-700 mb-1">{project.name}</div>
                      <ProgressMeter percent={project.progress} testId="goal-project-progress" />
                      <div className="mt-1 space-y-1">
                        {project.taskIds.map((taskId) => {
                          const task = taskById(taskId);
                          if (!task) return null;
                          return linkedTask(task);
                        })}
                      </div>
                    </div>
                  );
                })}
                {goal.taskIds.map((id) => {
                  const task = taskById(id);
                  if (!task) return null;
                  return linkedTask(task);
                })}
              </div>
            )}
          </article>
        );
      })}
      {(creating || editing) && (
        <GoalDialog
          goal={editing}
          projects={projects}
          tasks={tasks}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  );
}

