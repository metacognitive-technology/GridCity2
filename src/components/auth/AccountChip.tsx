import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthProvider';
import { OverdueBadge } from '../tasks/OverdueBadge';
import { AuditDialog } from './AuditDialog';

export function AccountChip({ onOpenUsers }: { onOpenUsers: () => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const label = auth.user ? `Account ${auth.user.name}` : 'Log in';
  const initial = auth.user?.name?.trim()?.charAt(0)?.toUpperCase() || '?';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="account-chip"
        aria-label={label}
        title={label}
        onClick={() => {
          if (!auth.user) {
            auth.openLogin();
            return;
          }
          setOpen((value) => !value);
        }}
        className="relative shrink-0 p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-[11px] font-bold"
      >
        {auth.user ? (
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
            {initial}
          </span>
        ) : (
          'Log in'
        )}
        {auth.can('tasks.view') && <OverdueBadge counts={auth.counts} testId="tasks-overdue-badge" />}
      </button>
      {open && auth.user && pos && createPortal(
        <div
          ref={menuRef}
          data-testid="account-menu"
          className="fixed z-[260] w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 text-sm"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
            <div data-testid="account-name" className="font-bold text-slate-800 truncate">{auth.user.name}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{auth.user.role}</div>
          </div>
          <button
            type="button"
            data-testid="account-menu-password"
            className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 font-medium"
            onClick={() => {
              setOpen(false);
              auth.openPassword();
            }}
          >
            Change password
          </button>
          {auth.can('users.manage') && (
            <button
              type="button"
              data-testid="account-menu-users"
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 font-medium"
              onClick={() => {
                setOpen(false);
                onOpenUsers();
              }}
            >
              Admin &gt; Users
            </button>
          )}
          {auth.can('audit.view') && (
            <button
              type="button"
              data-testid="account-menu-audit"
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 font-medium"
              onClick={() => {
                setOpen(false);
                setAuditOpen(true);
              }}
            >
              Audit
            </button>
          )}
          <button
            type="button"
            data-testid="account-menu-logout"
            className="w-full text-left px-2 py-2 rounded-lg hover:bg-red-50 text-red-600 font-medium"
            onClick={() => {
              setOpen(false);
              void auth.logout();
            }}
          >
            Log out
          </button>
        </div>,
        document.body,
      )}
      <AuditDialog open={auditOpen} onClose={() => setAuditOpen(false)} />
    </>
  );
}
