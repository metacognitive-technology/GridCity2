/** App display version. Bumped by 0.1 after each production Vite build. */
export const APP_VERSION = '1.21';

/** `1.0` → `v1`, `1.1` → `v1.1`, `1.10` → `v1.10` */
export function formatAppVersion(version: string = APP_VERSION): string {
  const m = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (m) {
    return m[2] === '0' ? `v${m[1]}` : `v${m[1]}.${m[2]}`;
  }
  const n = Number(version);
  if (!Number.isFinite(n)) return `v${version}`;
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `v${rounded}` : `v${rounded.toFixed(1)}`;
}
