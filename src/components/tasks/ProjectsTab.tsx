import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../auth/AuthProvider';
import { ProgressMeter } from './ProgressMeter';
import { ProjectDialog } from './ProjectDialog';
import { TaskTags } from './TaskTags';
import type { ProjectItem, TaskItem } from './types';

export function ProjectsTab({
  epoch,
  onComplete,
}: {
  epoch: number;
  onComplete: (task: TaskItem) => Promise<void> | void;
}) {
  const auth = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [projectRes, taskRes] = await Promise.all([api('/api/projects'), api('/api/tasks')]);
      const projectData = await projectRes.json().catch(() => null);
      const taskData = await taskRes.json().catch(() => null);
      if (cancelled) return;
      if (!projectRes.ok || (!taskRes.ok && taskRes.status !== 403)) {
        setError('Could not load projects');
        return;
      }
      setError(null);
      setProjects(Array.isArray(projectData?.projects) ? projectData.projects : []);
      setTasks(taskRes.ok && Array.isArray(taskData?.tasks) ? taskData.tasks : []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [epoch, revision]);

  const complete = async (task: TaskItem) => {
    await onComplete(task);
    setRevision((value) => value + 1);
  };

  return (
    <div className="space-y-2">
      {auth.can('goals.edit') && (
        <button
          type="button"
          data-testid="project-new"
          className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold"
          onClick={() => setCreating(true)}
        >
          New project
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {projects.length === 0 && !error && <p className="text-xs text-slate-400">No projects.</p>}
      {projects.map((project) => {
        const expanded = openId === project.id;
        return (
          <article
            key={project.id}
            data-testid="project-row"
            data-name={project.name}
            data-status={project.status}
            className="border border-slate-100 rounded-xl p-3"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                data-testid="project-row-toggle"
                className="flex-1 min-w-0 text-left"
                onClick={() => setOpenId(expanded ? null : project.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate">{project.name}</span>
                  <span className="text-[10px] uppercase text-slate-400 shrink-0">{project.status.replace('_', ' ')}</span>
                </div>
                <div className="mt-2">
                  <ProgressMeter percent={project.progress} testId="project-progress" />
                </div>
              </button>
              {auth.can('goals.edit') && (
                <button
                  type="button"
                  data-testid="project-edit"
                  className="text-[11px] font-bold text-slate-500"
                  onClick={() => setEditing(project)}
                >
                  Edit
                </button>
              )}
            </div>
            {expanded && (
              <div data-testid="project-expanded" className="mt-3 space-y-1 border-t border-slate-100 pt-2">
                {project.taskIds.length === 0 && <p className="text-xs text-slate-400">No tasks linked.</p>}
                {project.taskIds.map((id) => {
                  const task = tasks.find((item) => item.id === id);
                  if (!task) return null;
                  const canFinish = auth.can('tasks.edit')
                    && task.status !== 'done'
                    && task.status !== 'cancelled'
                    && !task.archivedAt;
                  return (
                    <div key={task.id} data-testid="project-task" data-title={task.title} data-status={task.status} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">{task.title}</span>
                      <TaskTags tags={task.tags} />
                      <span className="text-[10px] uppercase text-slate-400">{task.status === 'in_progress' ? 'In progress' : task.status}</span>
                      {canFinish && (
                        <button type="button" data-testid="task-complete" className="font-bold text-blue-600" onClick={() => void complete(task)}>
                          Complete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        );
      })}
      {(creating || editing) && (
        <ProjectDialog
          project={editing}
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
