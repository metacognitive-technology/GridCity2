const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();

function limit(): number {
  const raw = process.env.GRIDCITY_LOGIN_RATE_LIMIT;
  if (raw === undefined || raw.trim() === '') return 20;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.floor(n);
}

/** In-memory per-IP cap for POST /api/auth/login. */
export function allowLoginAttempt(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= limit()) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}
