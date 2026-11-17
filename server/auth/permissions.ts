import {
  PERMISSION_KEYS,
  parseOverrides,
  roleAllows,
  type PermissionKey,
  type RoleName,
} from '../../src/permissions.ts';

export type PermissionSubject = {
  role: RoleName;
  permissions?: unknown;
} | null;

/** Single server-side permission check. Admin overrides are ignored. Anonymous play keeps world.edit. */
export function can(user: PermissionSubject, key: PermissionKey): boolean {
  if (!user) return key === 'world.edit';
  if (user.role === 'admin') return true;
  const overrides = parseOverrides(user.permissions);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return !!overrides[key];
  return roleAllows(user.role, key);
}

export function effectivePerms(user: PermissionSubject): PermissionKey[] {
  if (!user) return ['world.edit'];
  return PERMISSION_KEYS.filter((key) => can(user, key));
}

export function permsInclude(perms: readonly string[] | undefined, key: PermissionKey): boolean {
  return !!perms?.includes(key);
}
