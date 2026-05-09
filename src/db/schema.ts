import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DB_PATH = join(process.cwd(), '.ai-memory', 'data', 'memories.db');

let dbInstance: SqlJsDatabase | null = null;
let dbPath: string = DEFAULT_DB_PATH;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH || DEFAULT_DB_PATH;
}

function ensureDataDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function initializeDatabase(path?: string): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbPath = path || getDatabasePath();
  ensureDataDir(dbPath);

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    dbInstance = new SQL.Database(fileBuffer);
    updateLastDbFileMtime();
  } else {
    dbInstance = new SQL.Database();
  }

  runMigrations(dbInstance);
  saveDatabase(dbInstance);

  return dbInstance;
}

function saveDatabase(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

function updateLastDbFileMtime(): void {
  if (existsSync(dbPath)) {
    try {
      const stats = statSync(dbPath);
      lastDbFileMtime = stats.mtimeMs;
    } catch (e) {
      // Ignore errors
    }
  }
}

export function runMigrations(db: SqlJsDatabase): void {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      repo_url TEXT,
      global_memory_permission INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  try {
    db.run(`ALTER TABLE projects ADD COLUMN global_memory_permission INTEGER DEFAULT 0`);
  } catch (e) {
    // Column may already exist
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS global_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'habit', 'context')),
      trust_status TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded')),
      confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
      evidence_refs TEXT DEFAULT '[]',
      last_verified_at TEXT,
      supersedes_id TEXT,
      source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'conversation', 'commit', 'error_log', 'extracted', 'document')),
      metadata TEXT,
      importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  addColumnIfMissing(db, 'global_memories', 'trust_status', `TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded'))`);
  addColumnIfMissing(db, 'global_memories', 'confidence', `TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high'))`);
  addColumnIfMissing(db, 'global_memories', 'evidence_refs', `TEXT DEFAULT '[]'`);
  addColumnIfMissing(db, 'global_memories', 'last_verified_at', `TEXT`);
  addColumnIfMissing(db, 'global_memories', 'supersedes_id', `TEXT`);
  migrateMemorySourceConstraint(db, 'global_memories');

  db.run(`
    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL CHECK (memory_type IN ('problem', 'solution', 'error', 'decision', 'note')),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
      trust_status TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded')),
      confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
      evidence_refs TEXT DEFAULT '[]',
      last_verified_at TEXT,
      supersedes_id TEXT,
      source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'conversation', 'commit', 'error_log', 'extracted', 'document')),
      tags TEXT DEFAULT '[]',
      metadata TEXT,
      importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
      commit_hash TEXT,
      language TEXT,
      resolved_at TEXT,
      resolved_by TEXT,
      view_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  addColumnIfMissing(db, 'project_memories', 'status', `TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived'))`);
  addColumnIfMissing(db, 'project_memories', 'trust_status', `TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded'))`);
  addColumnIfMissing(db, 'project_memories', 'confidence', `TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high'))`);
  addColumnIfMissing(db, 'project_memories', 'evidence_refs', `TEXT DEFAULT '[]'`);
  addColumnIfMissing(db, 'project_memories', 'last_verified_at', `TEXT`);
  addColumnIfMissing(db, 'project_memories', 'supersedes_id', `TEXT`);
  migrateMemorySourceConstraint(db, 'project_memories');

  db.run(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      memory_scope TEXT NOT NULL CHECK (memory_scope IN ('global', 'project')),
      content_hash TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(memory_id, memory_scope)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_global_type ON global_memories(memory_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_global_created ON global_memories(created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_id ON project_memories(project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_type ON project_memories(memory_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_status ON project_memories(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_global_trust_status ON global_memories(trust_status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_trust_status ON project_memories(trust_status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_global_confidence ON global_memories(confidence)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_confidence ON project_memories(confidence)');
  db.run('CREATE INDEX IF NOT EXISTS idx_embed_memory ON embeddings(memory_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_embed_scope ON embeddings(memory_scope)');

  db.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'global_memory', 'project_memory')),
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
      changes TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_log_entity ON operation_logs(entity_type, entity_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_log_created ON operation_logs(created_at DESC)');

  db.run(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      project_id TEXT,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_token ON api_tokens(token)');
  db.run('CREATE INDEX IF NOT EXISTS idx_token_project ON api_tokens(project_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS brain_snapshots (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
      project_id TEXT,
      snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('user_profile', 'project_brief', 'ai_startup_context')),
      content TEXT NOT NULL,
      source_memory_ids TEXT DEFAULT '[]',
      generated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_brain_snapshot_scope ON brain_snapshots(scope, project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_brain_snapshot_type ON brain_snapshots(snapshot_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_brain_snapshot_generated ON brain_snapshots(generated_at DESC)');

  db.run(`
    CREATE TABLE IF NOT EXISTS memory_review_queue (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
      project_id TEXT,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      proposed_action TEXT DEFAULT 'create' CHECK (proposed_action IN ('create', 'update', 'supersede')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
      evidence_refs TEXT DEFAULT '[]',
      supersedes_id TEXT,
      source TEXT DEFAULT 'snapshot_compare' CHECK (source IN ('manual', 'snapshot_compare', 'profile_promotion')),
      from_snapshot_id TEXT,
      to_snapshot_id TEXT,
      line_index INTEGER,
      approved_memory_id TEXT,
      rejection_reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (from_snapshot_id) REFERENCES brain_snapshots(id) ON DELETE SET NULL,
      FOREIGN KEY (to_snapshot_id) REFERENCES brain_snapshots(id) ON DELETE SET NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_status ON memory_review_queue(status, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_scope ON memory_review_queue(scope, project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_snapshots ON memory_review_queue(from_snapshot_id, to_snapshot_id)');
  migrateReviewQueueSourceConstraint(db);
}

function migrateReviewQueueSourceConstraint(db: SqlJsDatabase): void {
  const tableSql = getTableSql(db, 'memory_review_queue');
  if (!tableSql || tableSql.includes('profile_promotion')) return;

  db.run('ALTER TABLE memory_review_queue RENAME TO memory_review_queue_old');
  db.run(`
    CREATE TABLE memory_review_queue (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
      project_id TEXT,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      proposed_action TEXT DEFAULT 'create' CHECK (proposed_action IN ('create', 'update', 'supersede')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
      evidence_refs TEXT DEFAULT '[]',
      supersedes_id TEXT,
      source TEXT DEFAULT 'snapshot_compare' CHECK (source IN ('manual', 'snapshot_compare', 'profile_promotion')),
      from_snapshot_id TEXT,
      to_snapshot_id TEXT,
      line_index INTEGER,
      approved_memory_id TEXT,
      rejection_reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (from_snapshot_id) REFERENCES brain_snapshots(id) ON DELETE SET NULL,
      FOREIGN KEY (to_snapshot_id) REFERENCES brain_snapshots(id) ON DELETE SET NULL
    )
  `);
  db.run(`
    INSERT INTO memory_review_queue (
      id, scope, project_id, content, memory_type, proposed_action, status, confidence,
      evidence_refs, supersedes_id, source, from_snapshot_id, to_snapshot_id, line_index,
      approved_memory_id, rejection_reason, metadata, created_at, updated_at, reviewed_at
    )
    SELECT
      id, scope, project_id, content, memory_type, proposed_action, status, confidence,
      evidence_refs, supersedes_id, source, from_snapshot_id, to_snapshot_id, line_index,
      approved_memory_id, rejection_reason, metadata, created_at, updated_at, reviewed_at
    FROM memory_review_queue_old
  `);
  db.run('DROP TABLE memory_review_queue_old');
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_status ON memory_review_queue(status, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_scope ON memory_review_queue(scope, project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_review_queue_snapshots ON memory_review_queue(from_snapshot_id, to_snapshot_id)');
}

function migrateMemorySourceConstraint(db: SqlJsDatabase, tableName: 'global_memories' | 'project_memories'): void {
  const tableSql = getTableSql(db, tableName);
  if (!tableSql || tableSql.includes("'document'")) return;

  const oldTable = `${tableName}_old`;
  db.run(`ALTER TABLE ${tableName} RENAME TO ${oldTable}`);

  if (tableName === 'global_memories') {
    db.run(`
      CREATE TABLE global_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'habit', 'context')),
        trust_status TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded')),
        confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
        evidence_refs TEXT DEFAULT '[]',
        last_verified_at TEXT,
        supersedes_id TEXT,
        source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'conversation', 'commit', 'error_log', 'extracted', 'document')),
        metadata TEXT,
        importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.run(`
      INSERT INTO global_memories (
        id, content, memory_type, trust_status, confidence, evidence_refs, last_verified_at,
        supersedes_id, source, metadata, importance, created_at, updated_at
      )
      SELECT
        id, content, memory_type, trust_status, confidence, evidence_refs, last_verified_at,
        supersedes_id, source, metadata, importance, created_at, updated_at
      FROM ${oldTable}
    `);
  } else {
    db.run(`
      CREATE TABLE project_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL CHECK (memory_type IN ('problem', 'solution', 'error', 'decision', 'note')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
        trust_status TEXT DEFAULT 'confirmed' CHECK (trust_status IN ('proposed', 'confirmed', 'rejected', 'stale', 'superseded')),
        confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
        evidence_refs TEXT DEFAULT '[]',
        last_verified_at TEXT,
        supersedes_id TEXT,
        source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'conversation', 'commit', 'error_log', 'extracted', 'document')),
        tags TEXT DEFAULT '[]',
        metadata TEXT,
        importance INTEGER DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
        commit_hash TEXT,
        language TEXT,
        resolved_at TEXT,
        resolved_by TEXT,
        view_count INTEGER DEFAULT 0,
        last_accessed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    db.run(`
      INSERT INTO project_memories (
        id, project_id, content, memory_type, status, trust_status, confidence, evidence_refs,
        last_verified_at, supersedes_id, source, tags, metadata, importance, commit_hash, language,
        resolved_at, resolved_by, view_count, last_accessed_at, created_at, updated_at
      )
      SELECT
        id, project_id, content, memory_type, status, trust_status, confidence, evidence_refs,
        last_verified_at, supersedes_id, source, tags, metadata, importance, commit_hash, language,
        resolved_at, resolved_by, view_count, last_accessed_at, created_at, updated_at
      FROM ${oldTable}
    `);
  }

  db.run(`DROP TABLE ${oldTable}`);
}

function getTableSql(db: SqlJsDatabase, tableName: string): string | null {
  const stmt = db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?');
  stmt.bind(['table', tableName]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  return typeof row.sql === 'string' ? row.sql : null;
}

function addColumnIfMissing(db: SqlJsDatabase, tableName: string, columnName: string, columnDefinition: string): void {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  let exists = false;
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    if (row.name === columnName) {
      exists = true;
      break;
    }
  }
  stmt.free();

  if (!exists) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

export function getDatabase(): SqlJsDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
}

export async function getDatabaseAsync(): Promise<SqlJsDatabase> {
  if (!dbInstance) {
    dbInstance = await initializeDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    saveDatabase(dbInstance);
    dbInstance.close();
    dbInstance = null;
  }
}

export function saveCurrentDatabase(): void {
  if (dbInstance) {
    saveDatabase(dbInstance);
    updateLastDbFileMtime();
  }
}

let lastDbFileMtime: number = 0;

export function getLastDbFileMtime(): number {
  return lastDbFileMtime;
}

export async function reloadDatabaseIfChanged(): Promise<boolean> {
  if (!dbInstance || !existsSync(dbPath)) return false;

  const stats = statSync(dbPath);
  const currentMtime = stats.mtimeMs;

  if (currentMtime > lastDbFileMtime) {
    logger.info('Database file changed externally, reloading...');
    lastDbFileMtime = currentMtime;

    const SQL = await initSqlJs();
  const fileBuffer = readFileSync(dbPath);
  dbInstance.close();
  dbInstance = new SQL.Database(fileBuffer);
  dbInstance.run('PRAGMA foreign_keys = ON');
  return true;
}
  return false;
}

export async function forceReloadDatabase(): Promise<void> {
  if (!dbInstance || !existsSync(dbPath)) return;
  
  logger.info('Force reloading database...');
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync(dbPath);
  dbInstance.close();
  dbInstance = new SQL.Database(fileBuffer);
  dbInstance.run('PRAGMA foreign_keys = ON');
  
  const stats = statSync(dbPath);
  lastDbFileMtime = stats.mtimeMs;
  logger.info('Database force reloaded successfully');
}

export { updateLastDbFileMtime };

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let logger = { info: console.log, error: console.error, warn: console.warn };
export function setLogger(customLogger: typeof logger) {
  logger = customLogger;
}
