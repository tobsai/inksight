/**
 * InkSight Cache Manager
 *
 * Pure in-memory LRU cache with TTL support and size-based eviction.
 * DocumentCache specialises it for rendered page images (Buffers).
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  sizeBytes: number;
  createdAt: number;       // ms timestamp
  lastAccessedAt: number;
  accessCount: number;
}

export interface CacheStats {
  entryCount: number;
  totalSizeBytes: number;
  hitRate: number;         // hits / (hits + misses)
  oldestEntryAge: number;  // ms since oldest entry was created
}

export class CacheManager<T> {
  protected cache = new Map<string, CacheEntry<T>>();
  private maxEntries: number;
  private maxSizeBytes: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;
  private totalSizeBytes = 0;

  constructor(options: {
    maxEntries?: number;
    maxSizeBytes?: number;
    ttlMs?: number;
  } = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.maxSizeBytes = options.maxSizeBytes ?? 100 * 1024 * 1024; // 100 MB
    this.ttlMs = options.ttlMs ?? 0;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (this.isExpired(entry)) {
      this.delete(key);
      this.misses++;
      return null;
    }
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, sizeBytes?: number): void {
    const size = sizeBytes ?? this.estimateSize(value);

    // If the key already exists, remove its old size first
    if (this.cache.has(key)) {
      const old = this.cache.get(key)!;
      this.totalSizeBytes -= old.sizeBytes;
      this.cache.delete(key);
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      sizeBytes: size,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    };

    this.cache.set(key, entry);
    this.totalSizeBytes += size;

    this.evict();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    this.totalSizeBytes -= entry.sizeBytes;
    this.cache.delete(key);
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.totalSizeBytes = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;

    let oldestAge = 0;
    if (this.cache.size > 0) {
      const now = Date.now();
      let oldest = now;
      for (const entry of this.cache.values()) {
        if (entry.createdAt < oldest) oldest = entry.createdAt;
      }
      oldestAge = now - oldest;
    }

    return {
      entryCount: this.cache.size,
      totalSizeBytes: this.totalSizeBytes,
      hitRate,
      oldestEntryAge: oldestAge,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  // ─── Eviction ────────────────────────────────────────────────────────────────

  private evict(): void {
    // First evict expired entries
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.delete(key);
      }
    }

    // Then evict LRU entries while over limits
    while (
      this.cache.size > this.maxEntries ||
      this.totalSizeBytes > this.maxSizeBytes
    ) {
      const lruKey = this.findLRUKey();
      if (!lruKey) break;
      this.delete(lruKey);
    }
  }

  private findLRUKey(): string | null {
    let lruKey: string | null = null;
    let lruTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }
    return lruKey;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    if (this.ttlMs === 0) return false;
    return Date.now() - entry.createdAt > this.ttlMs;
  }

  private estimateSize(value: T): number {
    if (Buffer.isBuffer(value as any)) {
      return (value as any as Buffer).length;
    }
    if (typeof value === 'string') {
      return (value as any as string).length * 2;
    }
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // fallback 1 KB
    }
  }
}

// ─── DocumentCache ────────────────────────────────────────────────────────────

/**
 * Specialised LRU cache for rendered page images (PNG Buffers).
 */
export class DocumentCache extends CacheManager<Buffer> {
  constructor(maxSizeMb = 100) {
    super({ maxSizeBytes: maxSizeMb * 1024 * 1024 });
  }

  cacheRenderedPage(documentId: string, pageIndex: number, png: Buffer): void {
    this.set(`${documentId}:${pageIndex}`, png, png.length);
  }

  getRenderedPage(documentId: string, pageIndex: number): Buffer | null {
    return this.get(`${documentId}:${pageIndex}`);
  }

  getUsageMb(): number {
    return this.getStats().totalSizeBytes / (1024 * 1024);
  }

  /**
   * Remove entries older than ageMs milliseconds.
   * Returns the number of entries purged.
   */
  purgeOlderThan(ageMs: number): number {
    const cutoff = Date.now() - ageMs;
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.createdAt < cutoff) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }
}
