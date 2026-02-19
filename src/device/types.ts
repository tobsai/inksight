/**
 * Type definitions for reMarkable device access layer.
 */

export interface SSHConnectionOptions {
  /** Device host — typically 10.11.99.1 (USB) or device IP (Wi-Fi) */
  host: string;
  /** SSH port. Default: 22 */
  port?: number;
  /** SSH username. Default: 'root' */
  username?: string;
  /** SSH password. reMarkable default is empty string unless user-set */
  password?: string;
  /** Path to SSH private key (alternative to password) */
  privateKeyPath?: string;
  /** Connection timeout in ms. Default: 10000 */
  connectTimeoutMs?: number;
  /** Keep-alive interval in ms. Default: 30000 */
  keepAliveIntervalMs?: number;
}

export interface RemoteFile {
  /** Full remote path */
  path: string;
  /** Filename only */
  name: string;
  /** File size in bytes */
  size: number;
  /** True if this entry is a directory */
  isDirectory: boolean;
  /** Last-modified timestamp */
  modifiedAt: Date;
}

export interface DeviceInfo {
  /** Device model, e.g. "reMarkable Paper Pro" */
  model: string;
  /** Firmware version string */
  firmware: string;
  /** Device serial number */
  serial: string;
}

export interface DocumentChange {
  documentId: string;
  changedAt: Date;
  changeType: 'created' | 'modified' | 'deleted';
  /** Which device files changed for this document (e.g. .metadata, .content, .rm) */
  affectedFiles: string[];
}

// ---------------------------------------------------------------------------
// Phase 2.2 types
// ---------------------------------------------------------------------------

export interface WatchOptions {
  /** Detection mode. Default: 'inotify', falls back to 'poll' if inotifywait unavailable */
  mode?: 'inotify' | 'poll';
  /** Poll interval in ms (poll mode only). Default: 5000 */
  pollIntervalMs?: number;
  /** Debounce window in ms — rapid events for the same doc collapse to one. Default: 500 */
  debounceMs?: number;
  /** Watch subdirectories too. Default: true */
  recursive?: boolean;
}

export interface WatchHandle {
  stop(): Promise<void>;
  on(event: 'change', handler: (changes: DocumentChange[]) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
}

export interface SyncState {
  lastSyncAt: Date;
  /** Per-document version info: hash + modification timestamp */
  documentVersions: Map<string, { hash: string; modifiedAt: Date }>;
  localCacheDir: string;
}

export interface SyncResult {
  /** Document IDs successfully synced */
  synced: string[];
  /** Document IDs that failed to sync */
  failed: string[];
  /** Document IDs no longer present on device */
  deleted: string[];
  /** Wall-clock duration in ms */
  duration: number;
}

export type ConflictStrategy = 'device-wins' | 'local-wins' | 'newest-wins';
