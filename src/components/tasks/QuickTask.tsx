import React, { createContext, useContext, useEffect, useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../auth/AuthProvider';
import { blockGridPointerEvents } from '../dockEvents';

type AimContext = {
  aim?: { x: number; y: number };
};

export type QuickMode = 'request' | 'idea';

type QuickTaskApi = { open: (mode?: QuickMode) => void };

const QuickTaskContext = createContext<QuickTaskApi | null>(null);

export function useQuickTask(): QuickTaskApi {
  const ctx = useContext(QuickTaskContext);
  if (!ctx) throw new Error('Quick task is unavailable');
  return ctx;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function canCreate(auth: ReturnType<typeof useAuth>): boolean {
  return auth.can('tasks.create') && !auth.user?.mustChangePassword;
}

export function QuickTaskProvider({
  children,
  roomCode,
  getContext,
}: {
  children: React.ReactNode;
  roomCode: string | null;
  getContext: () => AimContext;
}) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<QuickMode>('request');

  const openWith = (next: QuickMode = 'request') => {
    if (!auth.can('tasks.create')) return;
    setMode(next);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.shiftKey && (event.key === 'T' || event.key === 't'))) return;
      if (isTypingTarget(event.target)) return;
      if (!canCreate(auth)) return;
      event.preventDefault();
      openWith('request');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth]);

  return (
    <QuickTaskContext.Provider value={{ open: openWith }}>
      {children}
      <QuickTaskDialog
        open={open}
        mode={mode}
        roomCode={roomCode}
        getContext={getContext}
        onClose={() => setOpen(false)}
      />
    </QuickTaskContext.Provider>
  );
}

export function QuickTaskButton({ variant }: { variant: 'pill' | 'compact' }) {
  const auth = useAuth();
  const quick = useContext(QuickTaskContext);
  if (!canCreate(auth)) return null;
  if (variant === 'compact') {
    return (
      <button
        type="button"
        data-testid="quick-task-button-compact"
        data-grid-control
        title="New Request for Grampa"
        aria-label="New Request for Grampa"
        className="absolute top-[4.75rem] left-4 z-[60] p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
        {...blockGridPointerEvents}
        onClick={(event) => {
          event.stopPropagation();
          quick?.open('request');
        }}
      >
        <Plus className="w-5 h-5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="quick-task-button"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
      onClick={() => quick?.open('request')}
    >
      <Plus className="w-3.5 h-3.5 shrink-0" /> New Request for Grampa
    </button>
  );
}

export function NewIdeaButton({ variant }: { variant: 'pill' | 'compact' }) {
  const auth = useAuth();
  const quick = useContext(QuickTaskContext);
  if (!canCreate(auth)) return null;
  if (variant === 'compact') {
    return (
      <button
        type="button"
        data-testid="new-idea-button-compact"
        data-grid-control
        title="New Idea"
        aria-label="New Idea"
        className="absolute top-[8.5rem] left-4 z-[60] p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-amber-700 hover:bg-amber-50"
        {...blockGridPointerEvents}
        onClick={(event) => {
          event.stopPropagation();
          quick?.open('idea');
        }}
      >
        <Lightbulb className="w-5 h-5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="new-idea-button"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600"
      onClick={() => quick?.open('idea')}
    >
      <Lightbulb className="w-3.5 h-3.5 shrink-0" /> New Idea
    </button>
  );
}

function QuickTaskDialog({
  open,
  mode,
  onClose,
  roomCode,
  getContext,
}: {
  open: boolean;
  mode: QuickMode;
  onClose: () => void;
  roomCode: string | null;
  getContext: () => AimContext;
}) {
  const auth = useAuth();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [kind, setKind] = useState<'real_world' | 'in_game'>('real_world');
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = auth.can('tasks.edit');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setNotes('');
    setKind('real_world');
    setError(null);
    setAssigneeId(auth.user?.id || '');
    if (!canEdit) return;
    void api('/api/admin/users').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.users)
        ? data.users.filter((user: { active?: boolean }) => user.active !== false).map((user: { id: string; name: string }) => ({
          id: user.id,
          name: user.name,
        }))
        : [];
      setPeople(list);
    });
  }, [open, auth.user?.id, canEdit]);

  if (!open) return null;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        notes: notes.trim(),
        source: mode,
      };
      if (canEdit) {
        body.assigneeId = assigneeId || null;
        body.kind = kind;
        if (kind === 'in_game') {
          const aim = getContext().aim;
          if (roomCode) body.worldId = roomCode;
          if (aim) {
            body.aimX = aim.x;
            body.aimY = aim.y;
          }
        }
      }
      const res = await api('/api/tasks/quick', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not add the task');
        return;
      }
      auth.pushToast(auth.user?.role === 'admin' ? 'Task created.' : auth.quickTaskToast);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const heading = mode === 'idea' ? 'New Idea' : 'New Request for Grampa';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4"
      data-grid-control
      data-testid="quick-task-dialog"
      data-mode={mode}
      {...blockGridPointerEvents}
    >
      <form
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <h2 className="text-lg font-black mb-4" data-testid="quick-task-dialog-title">{heading}</h2>
        <input
          data-testid="quick-task-title"
          autoFocus
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
        />
        <textarea
          data-testid="quick-task-notes"
          placeholder="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
        />
        {canEdit && (
          <>
            <label className="block text-xs font-bold text-slate-500 mb-1">Assignee</label>
            <select
              data-testid="quick-task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200"
            >
              <option value="">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
            <div data-testid="quick-task-kind" className="flex gap-2 mb-4">
              <button
                type="button"
                data-testid="quick-task-kind-real"
                onClick={() => setKind('real_world')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${kind === 'real_world' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
              >
                Real-world
              </button>
              <button
                type="button"
                data-testid="quick-task-kind-game"
                onClick={() => setKind('in_game')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${kind === 'in_game' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
              >
                In-game
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !title.trim()}
            data-testid="quick-task-submit"
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
          >
            Add task
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 font-bold">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
