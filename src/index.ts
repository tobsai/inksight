/**
 * InkSight - AI-powered ink transformation for reMarkable Paper Pro
 *
 * Main entry point for the library.
 * Exports all public APIs and utilities.
 */

// Cloud API
import { RemarkableCloudClient } from './cloud/client.js';
export { RemarkableCloudClient, RemarkableCloudError } from './cloud/client.js';
export type {
  RemarkableAuthTokens,
  RemarkableDocument,
  DownloadedDocument,
  DocumentMetadata,
  DocumentContent,
  InkSightConfig as CloudApiConfig,
  TransformPreset,
  TransformSubmitResult,
  TransformStatusResult,
  TransformJobStatus,
  WaitForTransformOptions,
} from './cloud/types.js';

// Device Access — Phase 2.1: SSH layer, Phase 2.2: file monitoring + sync
import { RemarkableSSHClient } from './device/ssh-client.js';
export { RemarkableSSHClient } from './device/ssh-client.js';
export { FileMonitor } from './device/file-monitor.js';
export type { ChangeHandler, FileMonitorOptions, SyncEngineInterface } from './device/file-monitor.js';
export { IncrementalSyncEngine } from './device/sync-engine.js';
export { ConflictResolver } from './device/conflict-resolver.js';
export { IncrementalSyncManager } from './device/sync-manager.js';
export type {
  SSHConnectionOptions,
  RemoteFile,
  DeviceInfo,
  DocumentChange,
  WatchOptions,
  WatchHandle,
  SyncState,
  SyncResult,
  ConflictStrategy,
} from './device/types.js';
export type { VersionInfo, ConflictResolutionResult } from './device/conflict-resolver.js';

// Parser
export { RMParser } from './parser/rm-parser.js';
export type {
  RMFile,
  RMPage,
  RMLayer,
  RMLine,
  RMPoint,
  ParsedDocument,
  ParsedPage,
  BrushType,
  Color,
} from './parser/types.js';

// AI Providers — Phase 3.1
export * from './ai/index.js';

// Renderer — Phase 3.2: .rm stroke → PNG
// Note: RMPage/RMLayer/RMPoint already exported from parser; export only new renderer types + classes
export { parseRMFile, PageRenderer, RenderCache, DocumentRenderer } from './renderer/index.js';
export type { RenderOptions, RenderResult } from './renderer/index.js';
// CacheOptions from renderer (distinct from storage CacheOptions — use RendererCacheOptions alias)
export type { CacheOptions as RendererCacheOptions } from './renderer/index.js';

// Transformers — Phase 3 (legacy) + Phase 4 (core transformers)
export * from './transformers/index.js';

// Storage — Phase 5 (SQLite, FTS5, LRU cache)
export * from './storage/index.js';

// Hybrid Access Layer (Phase 2.3: SSH + Cloud with offline detection)
export * from './hybrid/index.js';

// Recognition — Phase 3.3: text recognition pipeline
export * from './recognition/index.js';

// OCR — Phase 3.3: Text recognition + diagram analysis + document processor
export * from './ocr/index.js';

// Config — Phase 6
export * from './config/index.js';

// CLI utilities — Phase 6
export * from './cli/exports.js';

// CLI — Phase 6.1: command-line interface, setup wizard, formatter
export * from './cli/index.js';

// Config — Phase 6.2: configuration system, presets, export templates
export * from './config/index.js';

/**
 * Library version
 */
export const VERSION = '0.1.0';

/**
 * Quick start helper function
 */
export function createClient(
  type: 'cloud' | 'ssh',
  config: any
): RemarkableCloudClient | RemarkableSSHClient {
  if (type === 'cloud') {
    return new RemarkableCloudClient(config);
  } else {
    return new RemarkableSSHClient(config);
  }
}
