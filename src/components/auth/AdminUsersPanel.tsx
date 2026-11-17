import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  roleAllows,
  type PermissionKey,
  type RoleName,
} from '../../permissions';
import { blockGridPointerEvents } from '../dockEvents';

type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  permissions: Partial<Record<PermissionKey, boolean>>;
  active: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: number | null;
};

type Tri = 'default' | 'allow' | 'deny';

const inputClass = 'w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-500';

export function AdminUsersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleName>('player');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<RoleName>('player');
  const [editActive, setEditActive] = useState(true);
  const [tri, setTri] = useState<Record<string, Tri>>({});
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const res = await api('/api/admin/users');
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not load users');
      return;
    }
    setError(null);
    setUsers(Array.isArray(data?.users) ? data.users : []);
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  if (!open) return null;

  const startEdit = (user: PublicUser) => {
    setEditing(user.id);
    setEditName(user.name);
    setEditRole(user.role);
    setEditActive(user.active);
    const next: Record<string, Tri> = {};
    for (const key of PERMISSION_KEYS) {
      if (user.permissions[key] === true) next[key] = 'allow';
      else if (user.permissions[key] === false) next[key] = 'deny';
      else next[key] = 'default';
    }
    setTri(next);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const permissions: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) {
      if (tri[key] === 'allow') permissions[key] = true;
      if (tri[key] === 'deny') permissions[key] = false;
    }
    const res = await api(`/api/admin/users/${editing}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: editName, role: editRole, active: editActive, permissions }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not save user');
      return;
    }
    setEditing(null);
    await load();
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {
      email,
      name,
      role,
      mustChangePassword: mustChange,
    };
    if (password.trim()) body.password = password;
    const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not create user');
      return;
    }
    setEmail('');
    setName('');
    setPassword('');
    setRole('player');
    setMustChange(true);
    if (typeof data?.tempPassword === 'string') {
      setTempPassword(data.tempPassword);
      setCopied(false);
    }
    await load();
  };

  const resetPassword = async (id: string) => {
    const res = await api(`/api/admin/users/${id}/reset-password`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Could not reset password');
      return;
    }
    setTempPassword(typeof data?.tempPassword === 'string' ? data.tempPassword : null);
    setCopied(false);
    await load();
  };

  const postAction = async (path: string) => {
    const res = await api(path, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Request failed');
      return;
    }
    await load();
  };

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[110] flex flex-col min-h-0"
      data-grid-control
      data-testid="admin-users-panel"
      {...blockGridPointerEvents}
    >
      <div className="p-4 border-b flex items-center justify-between bg-slate-50">
        <span className="font-bold">Admin &gt; Users</span>
        <button type="button" onClick={onClose} title="Close" className="p-1 rounded-lg hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {error && <p className="text-red-600">{error}</p>}
        {tempPassword && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="font-bold text-amber-800 mb-1">Temporary password (shown once)</p>
            <p data-testid="temp-password" className="font-mono text-sm break-all">{tempPassword}</p>
            <button
              type="button"
              data-testid="temp-password-copy"
              className="mt-2 px-2 py-1 rounded-lg bg-amber-600 text-white font-bold"
              onClick={() => {
                void navigator.clipboard.writeText(tempPassword).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        <form data-testid="create-user-form" onSubmit={createUser} className="space-y-2 border border-slate-100 rounded-xl p-3">
          <p className="font-bold text-slate-700">New account</p>
          <input data-testid="create-user-email" required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <input data-testid="create-user-name" required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <select data-testid="create-user-role" value={role} onChange={(e) => setRole(e.target.value as RoleName)} className={inputClass}>
            <option value="player">player</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          <input data-testid="create-user-password" type="text" placeholder="Password (blank generates one)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <label className="flex items-center gap-2 text-slate-600">
            <input
              data-testid="must-change-password"
              type="checkbox"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
            />
            Require password change at first sign-in
          </label>
          <button type="submit" data-testid="create-user-submit" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">
            Create user
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400">
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Role</th>
                <th className="py-1">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} data-testid={`user-row-${user.id}`} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-bold text-slate-800">{user.name}</div>
                    <div className="text-slate-400 break-all">{user.email}</div>
                    <div className="text-slate-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never signed in'}
                      {user.locked && <span className="ml-1 text-red-600 font-bold">Locked</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button type="button" className="underline" onClick={() => startEdit(user)}>Edit</button>
                      <button type="button" className="underline" onClick={() => void resetPassword(user.id)}>Reset password</button>
                      <button type="button" className="underline" onClick={() => void postAction(`/api/admin/users/${user.id}/unlock`)}>Unlock</button>
                      <button type="button" className="underline" onClick={() => void postAction(`/api/admin/users/${user.id}/revoke-sessions`)}>Sign out everywhere</button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void api(`/api/admin/users/${user.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !user.active }),
                        }).then(async (res) => {
                          const data = await res.json().catch(() => null);
                          if (!res.ok) setError(typeof data?.error === 'string' ? data.error : 'Could not update user');
                          else await load();
                        })}
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-2">{user.role}</td>
                  <td className="py-2">{user.active ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing && (
          <form
            data-testid="user-editor"
            className="space-y-2 border border-blue-100 rounded-xl p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <p className="font-bold">Edit user</p>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
            <select value={editRole} onChange={(e) => setEditRole(e.target.value as RoleName)} className={inputClass}>
              <option value="player">player</option>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              Active
            </label>
            {editRole === 'admin' && (
              <p className="text-slate-400">Permission overrides are ignored for admins.</p>
            )}
            <div className="space-y-1">
              {PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center justify-between gap-2">
                  <span>
                    {PERMISSION_LABELS[key]}
                    <span className="text-slate-400"> · default {roleAllows(editRole, key) ? 'allow' : 'deny'}</span>
                  </span>
                  <select
                    data-testid={`perm-${key}`}
                    value={tri[key] || 'default'}
                    onChange={(e) => setTri((prev) => ({ ...prev, [key]: e.target.value as Tri }))}
                    className="border border-slate-200 rounded px-1 py-0.5"
                  >
                    <option value="default">Default</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" data-testid="user-editor-save" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 font-bold">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
