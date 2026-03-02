/**
 * Phase 7 — Storage Error Boundary Tests
 *
 * Verifies that InkSightDatabase wraps SQLite exceptions in StorageError
 * instead of leaking raw driver errors to callers.
 *
 * Uses an in-memory SQLite DB (`:memory:`) — no disk I/O, no mocks required.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { InkSightDatabase } from './database.js';
import { StorageError } from '../errors/inksight-error.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeDoc(id = 'doc-1') {
  return {
    id,
    name: 'Test Doc',
    type: 'document' as const,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  };
}

function makeTransformResult(id = 'tr-1', docId = 'doc-1') {
  return {
    id,
    documentId: docId,
    pageIndex: 0,
    transformType: 'text',
    output: JSON.stringify({ text: 'hello' }),
    costUsd: 0.001,
    durationMs: 120,
    createdAt: new Date().toISOString(),
    providerUsed: 'anthropic',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Happy-path — operations succeed on a clean in-memory DB
// ──────────────────────────────────────────────────────────────────────────────

describe('InkSightDatabase — happy path', () => {
  let db: InkSightDatabase;

  beforeEach(() => {
    db = new InkSightDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('upsertDocument and getDocument round-trip', () => {
    const doc = makeDoc('d1');
    db.upsertDocument(doc);

    const retrieved = db.getDocument('d1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('d1');
    expect(retrieved!.name).toBe('Test Doc');
  });

  it('listDocuments returns all documents when no parentId', () => {
    db.upsertDocument(makeDoc('d1'));
    db.upsertDocument(makeDoc('d2'));

    const docs = db.listDocuments();
    expect(docs).toHaveLength(2);
  });

  it('deleteDocument removes the document', () => {
    db.upsertDocument(makeDoc('del-1'));
    db.deleteDocument('del-1');

    expect(db.getDocument('del-1')).toBeNull();
  });

  it('saveTransformResult and getTransformResult round-trip', () => {
    db.upsertDocument(makeDoc('doc-tr'));
    const tr = makeTransformResult('tr-1', 'doc-tr');
    db.saveTransformResult(tr);

    const retrieved = db.getTransformResult('doc-tr', 0, 'text');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.output).toBe(tr.output);
    expect(retrieved!.costUsd).toBeCloseTo(0.001, 5);
  });

  it('listTransformResults returns results for a document', () => {
    db.upsertDocument(makeDoc('doc-list'));
    db.saveTransformResult(makeTransformResult('tr-a', 'doc-list'));
    db.saveTransformResult({ ...makeTransformResult('tr-b', 'doc-list'), pageIndex: 1 });

    const results = db.listTransformResults('doc-list');
    expect(results).toHaveLength(2);
  });

  it('deleteTransformResults removes all results for a document', () => {
    db.upsertDocument(makeDoc('doc-del'));
    db.saveTransformResult(makeTransformResult('tr-x', 'doc-del'));
    db.deleteTransformResults('doc-del');

    const results = db.listTransformResults('doc-del');
    expect(results).toHaveLength(0);
  });

  it('setSetting, getSetting, deleteSetting round-trip', () => {
    db.setSetting('api_key', 'secret');
    expect(db.getSetting('api_key')).toBe('secret');

    db.deleteSetting('api_key');
    expect(db.getSetting('api_key')).toBeNull();
  });

  it('getSetting returns null for unknown key', () => {
    expect(db.getSetting('nonexistent')).toBeNull();
  });

  it('getDocument returns null for unknown id', () => {
    expect(db.getDocument('no-such-doc')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Error boundary — StorageError is thrown on DB failures
// ──────────────────────────────────────────────────────────────────────────────

describe('InkSightDatabase — StorageError boundaries', () => {
  it('throws StorageError when DB is closed before upsertDocument', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.upsertDocument(makeDoc('d1'))).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before getDocument', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.getDocument('d1')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before listDocuments', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.listDocuments()).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before deleteDocument', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.deleteDocument('d1')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before saveTransformResult', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.saveTransformResult(makeTransformResult())).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before getTransformResult', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.getTransformResult('doc-1', 0, 'text')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before listTransformResults', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.listTransformResults('doc-1')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before deleteTransformResults', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.deleteTransformResults('doc-1')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before setSetting', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.setSetting('k', 'v')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before getSetting', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.getSetting('k')).toThrow(StorageError);
  });

  it('throws StorageError when DB is closed before deleteSetting', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    expect(() => db.deleteSetting('k')).toThrow(StorageError);
  });

  it('StorageError has code STORAGE_ERROR', () => {
    const db = new InkSightDatabase(':memory:');
    db.close();

    try {
      db.getDocument('x');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(StorageError);
      expect((err as StorageError).code).toBe('STORAGE_ERROR');
    }
  });
});
