/**
 * InkSight Storage — Phase 5
 *
 * Barrel export for all storage modules.
 */

export { InkSightDatabase } from './database.js';
export type { StoredDocument, StoredTransformResult, StoredSettings } from './database.js';

export { SearchIndex } from './search-index.js';
export type { SearchResult, IndexedDocument, SearchOptions } from './search-index.js';

export { CacheManager, DocumentCache } from './cache-manager.js';
export type { CacheEntry, CacheStats } from './cache-manager.js';
