export { RemarkableSSHClient } from './ssh-client.js';
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
} from './types.js';

export { FileMonitor } from './file-monitor.js';
export type { ChangeHandler, FileMonitorOptions, SyncEngineInterface } from './file-monitor.js';

export { IncrementalSyncManager } from './sync-manager.js';
export type { SyncOptions, ConflictResolution } from './sync-manager.js';

// Phase 2.2: Incremental sync engine + conflict resolution
export { IncrementalSyncEngine } from './sync-engine.js';
export { ConflictResolver } from './conflict-resolver.js';
export type { VersionInfo, ConflictResolutionResult } from './conflict-resolver.js';
