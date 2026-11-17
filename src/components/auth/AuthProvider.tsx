import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api';
import socket, { reconnectSocket } from '../../socket';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'player' | 'viewer';
  mustChangePassword: boolean;
};

export type TaskCounts = { overdue: number; dueToday: number; open: number };

type Toast = { id: number; text: string };

type LoginResult = { mustChangePassword: boolean };

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  perms: string[];
  counts: TaskCounts;
  tasksEpoch: number;
  quickTaskToast: string;
  loginOpen: boolean;
  passwordOpen: boolean;
  toasts: Toast[];
  versionMismatch: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  openPassword: () => void;
  closePassword: () => void;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refresh: () => Promise<void>;
  can: (key: string) => boolean;
  pushToast: (text: string) => void;
};

const EMPTY_COUNTS: TaskCounts = { overdue: 0, dueToday: 0, open: 0 };

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(raw: any): AuthUser | null {
  if (!raw || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    email: String(raw.email || ''),
    name: String(raw.name || ''),
    role: raw.role === 'admin' || raw.role === 'player' || raw.role === 'viewer' ? raw.role : 'viewer',
    mustChangePassword: !!raw.mustChangePassword,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [counts, setCounts] = useState<TaskCounts>(EMPTY_COUNTS);
  const [tasksEpoch, setTasksEpoch] = useState(0);
  const [quickTaskToast, setQuickTaskToast] = useState('Task added.');
  const [loginOpen, setLoginOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [versionMismatch, setVersionMismatch] = useState(false);

  const applyMe = useCallback((data: any) => {
    setUser(readUser(data?.user));
    setPerms(Array.isArray(data?.perms) ? data.perms : []);
    const toast = data?.config?.quickTaskPlayerToast;
    if (typeof toast === 'string' && toast.trim()) setQuickTaskToast(toast.trim());
  }, []);

  const refresh = useCallback(async () => {
    const res = await api('/api/auth/me');
    if (!res.ok) return;
    applyMe(await res.json());
    setReady(true);
  }, [applyMe]);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  useEffect(() => {
    const on401 = () => {
      setUser(null);
      setPerms([]);
      setCounts(EMPTY_COUNTS);
      setLoginOpen(true);
    };
    const onPassword = () => setLoginOpen(true);
    const onVersion = () => setVersionMismatch(true);
    window.addEventListener('gc-unauthorized', on401);
    window.addEventListener('gc-password-change-required', onPassword);
    window.addEventListener('gc-version-mismatch', onVersion);
    return () => {
      window.removeEventListener('gc-unauthorized', on401);
      window.removeEventListener('gc-password-change-required', onPassword);
      window.removeEventListener('gc-version-mismatch', onVersion);
    };
  }, []);

  useEffect(() => {
    const onCounts = (payload: TaskCounts) => {
      if (!payload || typeof payload.overdue !== 'number') return;
      setCounts({
        overdue: payload.overdue,
        dueToday: Number(payload.dueToday) || 0,
        open: Number(payload.open) || 0,
      });
    };
    const onUpdated = () => setTasksEpoch((n) => n + 1);
    const onAuth = () => {
      void refresh();
      reconnectSocket();
    };
    socket.on('task-counts', onCounts);
    socket.on('task-updated', onUpdated);
    socket.on('goals-updated', onUpdated);
    socket.on('auth-changed', onAuth);
    return () => {
      socket.off('task-counts', onCounts);
      socket.off('task-updated', onUpdated);
      socket.off('goals-updated', onUpdated);
      socket.off('auth-changed', onAuth);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user || user.mustChangePassword || !perms.includes('tasks.view')) {
      setCounts(EMPTY_COUNTS);
      return;
    }
    let cancelled = false;
    void api('/api/tasks/counts').then(async (res) => {
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setCounts({
        overdue: Number(data.overdue) || 0,
        dueToday: Number(data.dueToday) || 0,
        open: Number(data.open) || 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user, perms]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Email or password is incorrect');
    }
    const next = readUser({ ...data.user, mustChangePassword: data.mustChangePassword });
    setUser(next);
    setPerms(Array.isArray(data.perms) ? data.perms : []);
    const toast = data?.config?.quickTaskPlayerToast;
    if (typeof toast === 'string' && toast.trim()) setQuickTaskToast(toast.trim());
    reconnectSocket();
    if (!data.mustChangePassword) setLoginOpen(false);
    return { mustChangePassword: !!data.mustChangePassword };
  }, []);

  const logout = useCallback(async () => {
    const res = await api('/api/auth/logout', { method: 'POST' });
    if (!res.ok) return;
    setUser(null);
    setPerms([]);
    setCounts(EMPTY_COUNTS);
    setLoginOpen(false);
    setPasswordOpen(false);
    reconnectSocket();
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const res = await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current, new: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Could not change password');
    }
    setUser((prev) => {
      const merged = readUser(data.user) || prev;
      return merged ? { ...merged, mustChangePassword: false } : null;
    });
    if (Array.isArray(data.perms)) setPerms(data.perms);
    setLoginOpen(false);
    setPasswordOpen(false);
  }, []);

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const closeLogin = useCallback(() => {
    if (user?.mustChangePassword) return;
    setLoginOpen(false);
  }, [user?.mustChangePassword]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    user,
    perms,
    counts,
    tasksEpoch,
    quickTaskToast,
    loginOpen,
    passwordOpen,
    toasts,
    versionMismatch,
    openLogin: () => setLoginOpen(true),
    closeLogin,
    openPassword: () => setPasswordOpen(true),
    closePassword: () => setPasswordOpen(false),
    login,
    logout,
    changePassword,
    refresh,
    can: (key: string) => perms.includes(key),
    pushToast,
  }), [
    ready, user, perms, counts, tasksEpoch, quickTaskToast, loginOpen, passwordOpen,
    toasts, versionMismatch, closeLogin, login, logout, changePassword, refresh, pushToast,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
