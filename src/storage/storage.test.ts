/**
 * Phase 5 Storage Tests
 *
 * InkSightDatabase — in-memory SQLite
 * SearchIndex — FTS5
 * CacheManager / DocumentCache — pure in-memory LRU
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InkSightDatabase, StoredDocument, StoredTransformResult } from './database.js';
import { SearchIndex, IndexedDocument } from './search-index.js';
import { CacheManager, DocumentCache } from './cache-manager.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: 'doc-1',
    name: 'My Note',
    type: 'document',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-02T00:00:00.000Z',
    lastSyncedAt: '2024-01-03T00:00:00.000Z',
    pageCount: 3,
    sizeBytes: 1024,
    ...overrides,
  };
}

function makeResult(overrides: Partial<StoredTransformResult> = {}): StoredTransformResult {
  return {
    id: 'result-1',
    documentId: 'doc-1',
    pageIndex: 0,
    transformType: 'text',
    output: JSON.stringify({ text: 'hello world' }),
    costUsd: 0.01,
    durationMs: 200,
    createdAt: '2024-01-01T00:00:00.000Z',
    providerUsed: 'openai',
    ...overrides,
  };
}

// ─── InkSightDatabase ────────────────────────────────────────────────────────

describe('InkSightDatabase', () => {
  let db: InkSightDatabase;

  beforeEach(() => {
    db = new InkSightDatabase(':memory:');
  });

  it('upsertDocument + getDocument round-trip', () => {
    const doc = makeDoc();
    db.upsertDocument(doc);
    const retrieved = db.getDocument('doc-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('doc-1');
    expect(retrieved!.name).toBe('My Note');
    expect(retrieved!.type).toBe('document');
    expect(retrieved!.pageCount).toBe(3);
    expect(retrieved!.sizeBytes).toBe(1024);
  });

  it('upsertDocument updates existing row', () => {
    db.upsertDocument(makeDoc());
    db.upsertDocument(makeDoc({ name: 'Updated Name' }));
    const retrieved = db.getDocument('doc-1');
    expect(retrieved!.name).toBe('Updated Name');
  });

  it('getDocument returns null for missing id', () => {
    expect(db.getDocument('nonexistent')).toBeNull();
  });

  it('listDocuments returns all documents when no parentId given', () => {
    db.upsertDocument(makeDoc({ id: 'a' }));
    db.upsertDocument(makeDoc({ id: 'b', parentId: 'folder-1' }));
    db.upsertDocument(makeDoc({ id: 'c', parentId: 'folder-1' }));
    expect(db.listDocuments().length).toBe(3);
  });

  it('listDocuments filters by parentId', () => {
    db.upsertDocument(makeDoc({ id: 'a' }));
    db.upsertDocument(makeDoc({ id: 'b', parentId: 'folder-1' }));
    db.upsertDocument(makeDoc({ id: 'c', parentId: 'folder-1' }));
    const results = db.listDocuments('folder-1');
    expect(results.length).toBe(2);
    expect(results.every(r => r.parentId === 'folder-1')).toBe(true);
  });

  it('deleteDocument removes the row', () => {
    db.upsertDocument(makeDoc());
    db.deleteDocument('doc-1');
    expect(db.getDocument('doc-1')).toBeNull();
  });

  it('saveTransformResult + getTransformResult round-trip', () => {
    const result = makeResult();
    db.saveTransformResult(result);
    const retrieved = db.getTransformResult('doc-1', 0, 'text');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('result-1');
    expect(retrieved!.costUsd).toBe(0.01);
    expect(retrieved!.providerUsed).toBe('openai');
  });

  it('saveTransformResult with UNIQUE constraint replaces on duplicate', () => {
    db.saveTransformResult(makeResult({ id: 'result-1', output: '{"text":"first"}' }));
    db.saveTransformResult(makeResult({ id: 'result-2', output: '{"text":"second"}' }));
    const retrieved = db.getTransformResult('doc-1', 0, 'text');
    expect(retrieved!.output).toBe('{"text":"second"}');
    expect(db.listTransformResults('doc-1').length).toBe(1);
  });

  it('listTransformResults returns all results for a document', () => {
    db.saveTransformResult(makeResult({ id: 'r1', pageIndex: 0, transformType: 'text' }));
    db.saveTransformResult(makeResult({ id: 'r2', pageIndex: 0, transformType: 'summary' }));
    db.saveTransformResult(makeResult({ id: 'r3', pageIndex: 1, transformType: 'text' }));
    const results = db.listTransformResults('doc-1');
    expect(results.length).toBe(3);
  });

  it('listTransformResults returns empty for unknown document', () => {
    expect(db.listTransformResults('no-such-doc').length).toBe(0);
  });

  it('deleteTransformResults removes all for document', () => {
    db.saveTransformResult(makeResult({ id: 'r1', pageIndex: 0, transformType: 'text' }));
    db.saveTransformResult(makeResult({ id: 'r2', pageIndex: 1, transformType: 'summary' }));
    db.deleteTransformResults('doc-1');
    expect(db.listTransformResults('doc-1').length).toBe(0);
  });

  it('getSetting returns null for missing key', () => {
    expect(db.getSetting('missing')).toBeNull();
  });

  it('setSetting + getSetting round-trip', () => {
    db.setSetting('api-key', 'secret');
    expect(db.getSetting('api-key')).toBe('secret');
  });

  it('setSetting updates existing value', () => {
    db.setSetting('theme', 'light');
    db.setSetting('theme', 'dark');
    expect(db.getSetting('theme')).toBe('dark');
  });

  it('deleteSetting removes the key', () => {
    db.setSetting('temp', 'value');
    db.deleteSetting('temp');
    expect(db.getSetting('temp')).toBeNull();
  });

  it('migrate() is idempotent — safe to call twice', () => {
    expect(() => {
      db.migrate();
      db.migrate();
    }).not.toThrow();
  });

  it('preserves optional fields as undefined when null in DB', () => {
    const doc = makeDoc({ parentId: undefined, pageCount: undefined, sizeBytes: undefined });
    db.upsertDocument(doc);
    const retrieved = db.getDocument('doc-1');
    expect(retrieved!.parentId).toBeUndefined();
    expect(retrieved!.pageCount).toBeUndefined();
    expect(retrieved!.sizeBytes).toBeUndefined();
  });

  it('close() does not throw', () => {
    expect(() => db.close()).not.toThrow();
  });
});

// ─── SearchIndex ──────────────────────────────────────────────────────────────

describe('SearchIndex', () => {
  let db: InkSightDatabase;
  let index: SearchIndex;

  beforeEach(() => {
    db = new InkSightDatabase(':memory:');
    index = new SearchIndex(db);
  });

  function insertDoc(overrides: Partial<IndexedDocument> = {}) {
    const doc: IndexedDocument = {
      documentId: 'doc-1',
      pageIndex: 0,
      transformType: 'text',
      text: 'The quick brown fox jumps over the lazy dog',
      tags: ['animal', 'nature'],
      ...overrides,
    };
    // Also upsert into documents table so resolveDocumentName works
    db.upsertDocument({
      id: doc.documentId,
      name: `Document ${doc.documentId}`,
      type: 'document',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-02T00:00:00.000Z',
      lastSyncedAt: '2024-01-03T00:00:00.000Z',
    });
    index.indexDocument(doc);
    return doc;
  }

  it('indexDocument then search finds the document', () => {
    insertDoc();
    const results = index.search('fox');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe('doc-1');
    expect(results[0].matchType).toBe('fulltext');
  });

  it('search returns empty array for no matches', () => {
    insertDoc();
    const results = index.search('xyzzy');
    expect(results).toEqual([]);
  });

  it('search with fuzzy matching finds prefix', () => {
    insertDoc({ text: 'handwriting recognition engine' });
    const results = index.search('handwrit', { fuzzy: true });
    expect(results.length).toBeGreaterThan(0);
  });

  it('search without fuzzy matching', () => {
    insertDoc({ text: 'hello world' });
    // exact match should still work
    const results = index.search('hello', { fuzzy: false });
    expect(results.length).toBeGreaterThan(0);
  });

  it('search respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      insertDoc({
        documentId: `doc-${i}`,
        pageIndex: 0,
        text: 'shared keyword result',
      });
    }
    const results = index.search('keyword', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('searchByTag returns correct results', () => {
    insertDoc({ tags: ['recipe', 'cooking'] });
    insertDoc({ documentId: 'doc-2', pageIndex: 0, tags: ['finance', 'budget'] });
    const results = index.searchByTag('recipe');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchType).toBe('tag');
  });

  it('removeDocument removes from index', () => {
    insertDoc();
    index.removeDocument('doc-1');
    const results = index.search('fox');
    expect(results.length).toBe(0);
  });

  it('snippet length is ≤ 150 characters', () => {
    const longText = 'word '.repeat(100); // 500 chars
    insertDoc({ text: longText + 'needle ' + longText });
    const results = index.search('needle');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet.length).toBeLessThanOrEqual(150);
  });

  it('snippet contains text near the match', () => {
    insertDoc({ text: 'This is a long text. The target word is here. More text follows.' });
    const results = index.search('target');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('target');
  });

  it('indexDocument replaces existing entry for same doc/page/type', () => {
    insertDoc({ text: 'original text' });
    insertDoc({ text: 'updated text' }); // same documentId, pageIndex, transformType
    const results = index.search('original');
    expect(results.length).toBe(0); // old content gone
    const results2 = index.search('updated');
    expect(results2.length).toBeGreaterThan(0);
  });
});

// ─── CacheManager ─────────────────────────────────────────────────────────────

describe('CacheManager', () => {
  it('set + get round-trip', () => {
    const cache = new CacheManager<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('get returns null for missing key', () => {
    const cache = new CacheManager<string>();
    expect(cache.get('missing')).toBeNull();
  });

  it('has returns true for existing key', () => {
    const cache = new CacheManager<string>();
    cache.set('key', 'val');
    expect(cache.has('key')).toBe(true);
  });

  it('has returns false for missing key', () => {
    const cache = new CacheManager<string>();
    expect(cache.has('missing')).toBe(false);
  });

  it('delete removes entry', () => {
    const cache = new CacheManager<string>();
    cache.set('key', 'val');
    expect(cache.delete('key')).toBe(true);
    expect(cache.get('key')).toBeNull();
  });

  it('delete returns false for missing key', () => {
    const cache = new CacheManager<string>();
    expect(cache.delete('missing')).toBe(false);
  });

  it('clear empties cache', () => {
    const cache = new CacheManager<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.getStats().entryCount).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('LRU eviction: maxEntries=2, insert 3 → oldest evicted', async () => {
    const cache = new CacheManager<string>({ maxEntries: 2 });
    cache.set('a', 'val-a');
    await new Promise(r => setTimeout(r, 5));
    cache.set('b', 'val-b');
    await new Promise(r => setTimeout(r, 5));
    cache.set('c', 'val-c'); // should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  it('size eviction: evicts when maxSizeBytes exceeded', () => {
    const cache = new CacheManager<string>({ maxSizeBytes: 100 });
    // Each entry is 60 bytes
    cache.set('a', 'x', 60);
    cache.set('b', 'x', 60); // total would be 120 > 100, should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
  });

  it('TTL expiry: set ttlMs=1, wait 5ms, get returns null', async () => {
    const cache = new CacheManager<string>({ ttlMs: 1 });
    cache.set('key', 'value');
    await new Promise(r => setTimeout(r, 10));
    expect(cache.get('key')).toBeNull();
  });

  it('TTL=0 means no expiry', async () => {
    const cache = new CacheManager<string>({ ttlMs: 0 });
    cache.set('key', 'value');
    await new Promise(r => setTimeout(r, 10));
    expect(cache.get('key')).toBe('value');
  });

  it('getStats returns correct hitRate', () => {
    const cache = new CacheManager<string>();
    cache.set('key', 'val');
    cache.get('key');   // hit
    cache.get('key');   // hit
    cache.get('miss');  // miss
    const stats = cache.getStats();
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('getStats returns 0 hitRate when nothing accessed', () => {
    const cache = new CacheManager<string>();
    expect(cache.getStats().hitRate).toBe(0);
  });

  it('getStats reflects correct entryCount and totalSizeBytes', () => {
    const cache = new CacheManager<string>();
    cache.set('a', 'hello', 50);
    cache.set('b', 'world', 30);
    const stats = cache.getStats();
    expect(stats.entryCount).toBe(2);
    expect(stats.totalSizeBytes).toBe(80);
  });

  it('resetStats resets hit/miss counters', () => {
    const cache = new CacheManager<string>();
    cache.set('k', 'v');
    cache.get('k');       // hit
    cache.get('missing'); // miss
    cache.resetStats();
    expect(cache.getStats().hitRate).toBe(0);
  });
});

// ─── DocumentCache ────────────────────────────────────────────────────────────

describe('DocumentCache', () => {
  it('cacheRenderedPage + getRenderedPage round-trip', () => {
    const dc = new DocumentCache();
    const buf = Buffer.from([1, 2, 3, 4]);
    dc.cacheRenderedPage('doc-1', 0, buf);
    const result = dc.getRenderedPage('doc-1', 0);
    expect(result).not.toBeNull();
    expect(result!.equals(buf)).toBe(true);
  });

  it('getRenderedPage returns null for missing entry', () => {
    const dc = new DocumentCache();
    expect(dc.getRenderedPage('doc-999', 0)).toBeNull();
  });

  it('getUsageMb() returns correct size', () => {
    const dc = new DocumentCache();
    const buf = Buffer.alloc(1024 * 1024); // 1 MB
    dc.cacheRenderedPage('doc-1', 0, buf);
    expect(dc.getUsageMb()).toBeCloseTo(1, 1);
  });

  it('purgeOlderThan removes old entries', async () => {
    const dc = new DocumentCache();
    dc.cacheRenderedPage('doc-1', 0, Buffer.from([1]));
    await new Promise(r => setTimeout(r, 20));
    dc.cacheRenderedPage('doc-2', 0, Buffer.from([2]));
    const purged = dc.purgeOlderThan(10); // purge entries older than 10ms
    expect(purged).toBe(1);
    expect(dc.getRenderedPage('doc-1', 0)).toBeNull();
    expect(dc.getRenderedPage('doc-2', 0)).not.toBeNull();
  });

  it('purgeOlderThan returns 0 when nothing is old enough', () => {
    const dc = new DocumentCache();
    dc.cacheRenderedPage('doc-1', 0, Buffer.from([1]));
    const purged = dc.purgeOlderThan(10000);
    expect(purged).toBe(0);
  });

  it('respects maxSizeMb limit', () => {
    const dc = new DocumentCache(1); // 1 MB max
    const buf1 = Buffer.alloc(600 * 1024); // 600 KB
    const buf2 = Buffer.alloc(600 * 1024); // 600 KB — should trigger eviction
    dc.cacheRenderedPage('doc-1', 0, buf1);
    dc.cacheRenderedPage('doc-2', 0, buf2);
    expect(dc.getUsageMb()).toBeLessThanOrEqual(1);
  });
});
