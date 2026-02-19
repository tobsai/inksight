/**
 * Render Cache — Phase 3.2
 *
 * File-system cache for rendered PNG images.
 * Cache key: sha256(documentId + pageIndex + JSON.stringify(options))
 * LRU eviction when maxSizeBytes is exceeded.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile, unlink, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { RenderOptions } from './rm-parser.js';

export interface CacheOptions {
  cacheDir: string;
  maxSizeBytes?: number;  // default: 500 MB
  ttlMs?: number;         // default: 7 days
}

interface CacheMeta {
  key: string;
  documentId: string;
  pageIndex: number;
  sizeBytes: number;
  createdAt: number;  // unix ms
  lastAccessedAt: number;
}

const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const META_FILE = 'cache-meta.json';

export class RenderCache {
  private opts: Required<CacheOptions>;
  private hits = 0;
  private misses = 0;
  private initialized = false;
  private meta: Map<string, CacheMeta> = new Map();

  constructor(options: CacheOptions) {
    this.opts = {
      maxSizeBytes: options.maxSizeBytes ?? DEFAULT_MAX_SIZE,
      ttlMs: options.ttlMs ?? DEFAULT_TTL,
      cacheDir: options.cacheDir,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async get(
    documentId: string,
    pageIndex: number,
    options: RenderOptions
  ): Promise<Buffer | null> {
    await this._init();

    const key = this._key(documentId, pageIndex, options);
    const entry = this.meta.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.opts.ttlMs) {
      await this._evictEntry(key, entry);
      this.misses++;
      return null;
    }

    // Read file
    const filePath = join(this.opts.cacheDir, `${key}.png`);
    try {
      const png = await readFile(filePath);
      // Update last accessed time
      entry.lastAccessedAt = Date.now();
      await this._saveMeta();
      this.hits++;
      return png;
    } catch {
      // File missing on disk — remove from meta
      this.meta.delete(key);
      await this._saveMeta();
      this.misses++;
      return null;
    }
  }

  async set(
    documentId: string,
    pageIndex: number,
    options: RenderOptions,
    png: Buffer
  ): Promise<void> {
    await this._init();

    const key = this._key(documentId, pageIndex, options);
    const filePath = join(this.opts.cacheDir, `${key}.png`);

    await writeFile(filePath, png);

    const entry: CacheMeta = {
      key,
      documentId,
      pageIndex,
      sizeBytes: png.length,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    this.meta.set(key, entry);
    await this._saveMeta();

    // Enforce size limit
    await this._enforceSizeLimit();
  }

  async invalidate(documentId: string): Promise<void> {
    await this._init();

    const keysToRemove: string[] = [];
    for (const [key, entry] of this.meta) {
      if (entry.documentId === documentId) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const entry = this.meta.get(key)!;
      await this._evictEntry(key, entry);
    }
  }

  async getStats(): Promise<{ entries: number; totalBytes: number; hitRate: number }> {
    await this._init();

    let totalBytes = 0;
    for (const entry of this.meta.values()) {
      totalBytes += entry.sizeBytes;
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests === 0 ? 0 : this.hits / totalRequests;

    return {
      entries: this.meta.size,
      totalBytes,
      hitRate,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _key(documentId: string, pageIndex: number, options: RenderOptions): string {
    const raw = `${documentId}:${pageIndex}:${JSON.stringify(options)}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  private async _init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await mkdir(this.opts.cacheDir, { recursive: true });
    await this._loadMeta();
  }

  private async _loadMeta(): Promise<void> {
    const metaPath = join(this.opts.cacheDir, META_FILE);
    try {
      const raw = await readFile(metaPath, 'utf-8');
      const entries: CacheMeta[] = JSON.parse(raw);
      for (const entry of entries) {
        this.meta.set(entry.key, entry);
      }
    } catch {
      // No meta file yet — start fresh
    }
  }

  private async _saveMeta(): Promise<void> {
    const metaPath = join(this.opts.cacheDir, META_FILE);
    const entries = Array.from(this.meta.values());
    await writeFile(metaPath, JSON.stringify(entries), 'utf-8');
  }

  private async _evictEntry(key: string, entry: CacheMeta): Promise<void> {
    this.meta.delete(key);
    const filePath = join(this.opts.cacheDir, `${key}.png`);
    try {
      await unlink(filePath);
    } catch {
      // Already gone
    }
  }

  private async _enforceSizeLimit(): Promise<void> {
    let totalBytes = 0;
    for (const entry of this.meta.values()) {
      totalBytes += entry.sizeBytes;
    }

    if (totalBytes <= this.opts.maxSizeBytes) return;

    // LRU eviction: sort by lastAccessedAt ascending (oldest first)
    const sorted = Array.from(this.meta.values()).sort(
      (a, b) => a.lastAccessedAt - b.lastAccessedAt
    );

    for (const entry of sorted) {
      if (totalBytes <= this.opts.maxSizeBytes) break;
      totalBytes -= entry.sizeBytes;
      await this._evictEntry(entry.key, entry);
    }

    await this._saveMeta();
  }
}
