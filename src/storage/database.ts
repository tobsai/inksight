/**
 * InkSight Local Database
 *
 * SQLite-backed storage for documents, transform results, and settings.
 * Uses better-sqlite3 for synchronous access.
 */

import Database from 'better-sqlite3';

export interface StoredDocument {
  id: string;
  name: string;
  type: 'document' | 'folder';
  parentId?: string;
  createdAt: string;   // ISO string
  modifiedAt: string;
  lastSyncedAt: string;
  pageCount?: number;
  sizeBytes?: number;
}

export interface StoredTransformResult {
  id: string;
  documentId: string;
  pageIndex: number;
  transformType: string;
  output: string;       // JSON-serialized
  costUsd: number;
  durationMs: number;
  createdAt: string;
  providerUsed: string;
}

export interface StoredSettings {
  key: string;
  value: string;
  updatedAt: string;
}

export class InkSightDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  // ─── Migration ──────────────────────────────────────────────────────────────

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        modified_at TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        page_count INTEGER,
        size_bytes INTEGER
      );

      CREATE TABLE IF NOT EXISTS transform_results (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        page_index INTEGER NOT NULL,
        transform_type TEXT NOT NULL,
        output TEXT NOT NULL,
        cost_usd REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        provider_used TEXT NOT NULL,
        UNIQUE(document_id, page_index, transform_type)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transform_results_document_id
        ON transform_results(document_id);

      CREATE INDEX IF NOT EXISTS idx_documents_parent_id
        ON documents(parent_id);
    `);
  }

  // ─── Document operations ────────────────────────────────────────────────────

  upsertDocument(doc: StoredDocument): void {
    this.db.prepare(`
      INSERT INTO documents (id, name, type, parent_id, created_at, modified_at, last_synced_at, page_count, size_bytes)
      VALUES (@id, @name, @type, @parentId, @createdAt, @modifiedAt, @lastSyncedAt, @pageCount, @sizeBytes)
      ON CONFLICT(id) DO UPDATE SET
        name          = excluded.name,
        type          = excluded.type,
        parent_id     = excluded.parent_id,
        created_at    = excluded.created_at,
        modified_at   = excluded.modified_at,
        last_synced_at = excluded.last_synced_at,
        page_count    = excluded.page_count,
        size_bytes    = excluded.size_bytes
    `).run({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      parentId: doc.parentId ?? null,
      createdAt: doc.createdAt,
      modifiedAt: doc.modifiedAt,
      lastSyncedAt: doc.lastSyncedAt,
      pageCount: doc.pageCount ?? null,
      sizeBytes: doc.sizeBytes ?? null,
    });
  }

  getDocument(id: string): StoredDocument | null {
    const row = this.db.prepare(
      'SELECT * FROM documents WHERE id = ?'
    ).get(id) as any;
    return row ? this.rowToDocument(row) : null;
  }

  listDocuments(parentId?: string): StoredDocument[] {
    let rows: any[];
    if (parentId === undefined) {
      rows = this.db.prepare('SELECT * FROM documents').all() as any[];
    } else {
      rows = this.db.prepare(
        'SELECT * FROM documents WHERE parent_id = ?'
      ).all(parentId) as any[];
    }
    return rows.map(r => this.rowToDocument(r));
  }

  deleteDocument(id: string): void {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  private rowToDocument(row: any): StoredDocument {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      parentId: row.parent_id ?? undefined,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      lastSyncedAt: row.last_synced_at,
      pageCount: row.page_count ?? undefined,
      sizeBytes: row.size_bytes ?? undefined,
    };
  }

  // ─── Transform result operations ─────────────────────────────────────────────

  saveTransformResult(result: StoredTransformResult): void {
    this.db.prepare(`
      INSERT INTO transform_results
        (id, document_id, page_index, transform_type, output, cost_usd, duration_ms, created_at, provider_used)
      VALUES
        (@id, @documentId, @pageIndex, @transformType, @output, @costUsd, @durationMs, @createdAt, @providerUsed)
      ON CONFLICT(document_id, page_index, transform_type) DO UPDATE SET
        id            = excluded.id,
        output        = excluded.output,
        cost_usd      = excluded.cost_usd,
        duration_ms   = excluded.duration_ms,
        created_at    = excluded.created_at,
        provider_used = excluded.provider_used
    `).run({
      id: result.id,
      documentId: result.documentId,
      pageIndex: result.pageIndex,
      transformType: result.transformType,
      output: result.output,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      createdAt: result.createdAt,
      providerUsed: result.providerUsed,
    });
  }

  getTransformResult(
    documentId: string,
    pageIndex: number,
    transformType: string,
  ): StoredTransformResult | null {
    const row = this.db.prepare(`
      SELECT * FROM transform_results
      WHERE document_id = ? AND page_index = ? AND transform_type = ?
    `).get(documentId, pageIndex, transformType) as any;
    return row ? this.rowToTransformResult(row) : null;
  }

  listTransformResults(documentId: string): StoredTransformResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM transform_results WHERE document_id = ?'
    ).all(documentId) as any[];
    return rows.map(r => this.rowToTransformResult(r));
  }

  deleteTransformResults(documentId: string): void {
    this.db.prepare(
      'DELETE FROM transform_results WHERE document_id = ?'
    ).run(documentId);
  }

  private rowToTransformResult(row: any): StoredTransformResult {
    return {
      id: row.id,
      documentId: row.document_id,
      pageIndex: row.page_index,
      transformType: row.transform_type,
      output: row.output,
      costUsd: row.cost_usd,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      providerUsed: row.provider_used,
    };
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).get(key) as any;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, updatedAt);
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  // ─── Internal accessor (for SearchIndex) ─────────────────────────────────────

  /** @internal — exposes the raw better-sqlite3 instance for SearchIndex FTS5 */
  _db(): Database.Database {
    return this.db;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
