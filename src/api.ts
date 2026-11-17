import { APP_VERSION } from './version';

/** Same-origin JSON fetch with the session cookie and the CSRF header. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('X-GridCity')) headers.set('X-GridCity', '1');
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  const version = res.headers.get('X-App-Version');
  if (version && version !== APP_VERSION) {
    window.dispatchEvent(new CustomEvent('gc-version-mismatch'));
  }
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    window.dispatchEvent(new CustomEvent('gc-unauthorized'));
  }
  if (res.status === 403) {
    const data = await res.clone().json().catch(() => null);
    if (data && data.error === 'password_change_required') {
      window.dispatchEvent(new CustomEvent('gc-password-change-required'));
    }
  }
  return res;
}
