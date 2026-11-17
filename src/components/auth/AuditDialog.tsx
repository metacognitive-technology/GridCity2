import { useEffect, useState } from 'react';
import { api } from '../../api';
import { blockGridPointerEvents } from '../dockEvents';

type AuditEntry = {
  id: number;
  at: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorLabel: string | null;
};

export function AuditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api('/api/admin/audit?limit=50').then(async (res) => {
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not load the audit log');
        return;
      }
      setError(null);
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/50 p-4"
      data-grid-control
      data-testid="audit-panel"
      {...blockGridPointerEvents}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-black">Audit</h2>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">Close</button>
        </div>
        <div className="overflow-y-auto p-4 text-xs">
          {error && <p className="text-red-600 mb-2">{error}</p>}
          {entries.length === 0 && !error && <p className="text-slate-400">No audit rows yet.</p>}
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} data-testid="audit-row" className="border border-slate-100 rounded-lg px-3 py-2">
                <div className="font-bold text-slate-700">{entry.action}</div>
                <div className="text-slate-400">
                  {new Date(entry.at).toLocaleString()}
                  {entry.entityId ? ` · ${entry.entityId}` : ''}
                  {entry.actorLabel ? ` · ${entry.actorLabel}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
