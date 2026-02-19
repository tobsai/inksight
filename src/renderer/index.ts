/**
 * Renderer module — Phase 3.2
 *
 * Converts reMarkable .rm stroke data to PNG images for AI processing.
 */

export { parseRMFile } from './rm-parser.js';
export { PageRenderer } from './page-renderer.js';
export { RenderCache } from './render-cache.js';
export { DocumentRenderer } from './document-renderer.js';

// Shared types (RenderOptions, RenderResult used by PageRenderer; CacheOptions used by RenderCache)
export type {
  RMPage,
  RMLayer,
  RMStroke,
  RMPoint,
  RenderOptions,
  RenderResult,
  CacheOptions,
} from './rm-parser.js';
