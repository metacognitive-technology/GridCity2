import type { Database } from 'better-sqlite3';

/**
 * Ordered schema migrations. Worlds, layouts, and simulations stay in server.ts.
 * Version 2 adds goals and projects. It only creates tables, so an existing
 * Phase 1 database keeps its users, sessions, tasks, and audit rows.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','player','viewer')),
        permissions TEXT NOT NULL DEFAULT '{}',
        active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'real_world' CHECK (kind IN ('real_world','in_game')),
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
        due_date TEXT,
        assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        source TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form','quick','bot')),
        recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
        world_id TEXT,
        aim_x INTEGER,
        aim_y INTEGER,
        criteria TEXT,
        check_state TEXT,
        completed_at INTEGER,
        completed_by TEXT,
        archived_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_tasks_status_due ON tasks(status, due_date);
      CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
      CREATE INDEX idx_tasks_world ON tasks(world_id) WHERE kind = 'in_game';

      CREATE TABLE task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        actor_id TEXT,
        actor_label TEXT,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        detail TEXT,
        ip TEXT
      );
      CREATE INDEX idx_audit_at ON audit_log(at);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','paused','cancelled')),
        owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        due_date TEXT,
        progress_mode TEXT NOT NULL DEFAULT 'auto' CHECK (progress_mode IN ('auto','manual')),
        target_amount REAL,
        current_amount REAL,
        unit TEXT,
        icon TEXT,
        created_by_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','on_hold','completed','cancelled')),
        owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        start_date TEXT,
        end_date TEXT,
        created_by_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE task_goals (
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, goal_id)
      );

      CREATE TABLE task_projects (
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, project_id)
      );

      CREATE TABLE project_goals (
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, goal_id)
      );
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
    `,
  },
];

export function migrate(db: Database) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get() as { v: number };
  let current = row?.v ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        Date.now(),
      );
    });
    apply();
    current = migration.version;
  }
}
