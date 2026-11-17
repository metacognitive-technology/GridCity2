import type { Database } from 'better-sqlite3';

export type AuditInput = {
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  detail?: unknown;
  ip?: string | null;
};

/** detail must never include passwords, hashes, or session tokens. */
export function audit(db: Database, row: AuditInput) {
  const detail = row.detail === undefined ? null : JSON.stringify(row.detail);
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_label, action, entity, entity_id, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    Date.now(),
    row.actorId ?? null,
    row.actorLabel ?? null,
    row.action,
    row.entity ?? null,
    row.entityId ?? null,
    detail,
    row.ip ?? null,
  );
}
