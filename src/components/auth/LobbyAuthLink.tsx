import { useAuth } from './AuthProvider';

/** Lobby entry. Wording is "Log in" so the anonymous lobby does not say "sign in". */
export function LobbyAuthLink() {
  const auth = useAuth();
  if (auth.user) {
    return (
      <button
        type="button"
        data-testid="lobby-login-link"
        onClick={() => void auth.logout()}
        className="mb-4 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        Hi, {auth.user.name} · Log out
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="lobby-login-link"
      onClick={auth.openLogin}
      className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
    >
      Log in
    </button>
  );
}
