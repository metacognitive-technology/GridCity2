/** Shared permission keys. The server enforces them; the client only hides UI. */

export const PERMISSION_KEYS = [
  'tasks.create',
  'tasks.view',
  'tasks.edit',
  'goals.view',
  'goals.edit',
  'tasks.ingame.check',
  'bot.use',
  'world.edit',
  'world.delete',
  'users.manage',
  'audit.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type RoleName = 'admin' | 'player' | 'viewer';

export const ROLE_PRESETS: Record<RoleName, readonly PermissionKey[]> = {
  admin: PERMISSION_KEYS,
  player: ['tasks.create', 'world.edit', 'bot.use'],
  viewer: ['world.edit'],
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'tasks.create': 'Create tasks',
  'tasks.view': 'View tasks',
  'tasks.edit': 'Edit tasks',
  'goals.view': 'View goals',
  'goals.edit': 'Edit goals',
  'tasks.ingame.check': 'Check in-game tasks',
  'bot.use': 'Use GridBot',
  'world.edit': 'Edit the world',
  'world.delete': 'Delete rooms and layouts',
  'users.manage': 'Manage users',
  'audit.view': 'View the audit log',
};

export function isRole(value: unknown): value is RoleName {
  return value === 'admin' || value === 'player' || value === 'viewer';
}

export function roleAllows(role: RoleName, key: PermissionKey): boolean {
  if (role === 'admin') return true;
  return ROLE_PRESETS[role].includes(key);
}

export function parseOverrides(raw: unknown): Partial<Record<PermissionKey, boolean>> {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of PERMISSION_KEYS) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
