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
  InkSightConfig,
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

// Transformers
export { BaseTransformer } from './transformers/base-transformer.js';
export { TextRecognitionTransformer } from './transformers/text-recognition.js';
// Note: TransformResult is exported from the AI module (Phase 3.1).
// The transformer's TransformResult is accessible via BaseTransformer directly.
export type { TransformerConfig } from './transformers/base-transformer.js';

// Storage
export { DocumentCache } from './storage/cache.js';
export type { CacheOptions, CacheEntry } from './storage/cache.js';

// Hybrid Access Layer (Phase 2.3: SSH + Cloud with offline detection)
export * from './hybrid/index.js';

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
