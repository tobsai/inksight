/**
 * IncrementalSyncManager — Download and keep local copies of reMarkable
 * documents in sync with the device.
 *
 * Supports four conflict-resolution strategies:
 *   'local'  — Always keep the local copy, never overwrite
 *   'remote' — Always download the remote copy, overwriting local
 *   'newest' — Compare mtimes; keep whichever is newer
 *   'manual' — Invoke the caller-supplied onConflict callback
 */

import { stat } from 'fs/promises';
import { join } from 'path';
import { RemarkableSSHClient } from './ssh-client.js';
import type { FileMonitor, ChangeHandler } from './file-monitor.js';
import type { DocumentChange } from './types.js';

export interface SyncState {
  documentId: string;
  /** Local file mtime (ms since epoch). 0 if file does not exist locally. */
  localVersion: number;
  /** Remote file mtime (ms since epoch). 0 if unknown. */
  remoteVersion: number;
  syncedAt: Date;
  status: 'synced' | 'local-ahead' | 'remote-ahead' | 'conflict';
}

export type ConflictResolution = 'local' | 'remote' | 'newest' | 'manual';

export interface SyncOptions {
  /** Directory where downloaded documents are stored. */
  localDir: string;
  /** How to resolve conflicts. Default: 'newest'. */
  conflictResolution?: ConflictResolution;
  /**
   * Called only when conflictResolution='manual'. Must return 'local' or
   * 'remote' to indicate which version should win.
   */
  onConflict?: (
    docId: string,
    local: SyncState,
    remote: SyncState
  ) => Promise<'local' | 'remote'>;
}

export class IncrementalSyncManager {
  private client: RemarkableSSHClient;
  private localDir: string;
  private conflictResolution: ConflictResolution;
  private onConflict?: SyncOptions['onConflict'];

  private syncStates: Map<string, SyncState> = new Map();
  private liveMonitor: FileMonitor | null = null;
  private liveHandler: ChangeHandler | null = null;

  constructor(client: RemarkableSSHClient, options: SyncOptions) {
    this.client = client;
    this.localDir = options.localDir;
    this.conflictResolution = options.conflictResolution ?? 'newest';
    this.onConflict = options.onConflict;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Download all remote documents that are missing or newer than the local
   * copy. Skips documents that are already synced.
   */
  async initialSync(): Promise<{ synced: number; errors: string[] }> {
    const remoteIds = await this.client.listDocumentIds();
    const errors: string[] = [];
    let synced = 0;

    for (const docId of remoteIds) {
      try {
        const state = await this.syncDocument(docId);
        if (state.status === 'synced') {
          synced++;
        }
      } catch (err) {
        errors.push(`${docId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { synced, errors };
  }

  /**
   * Sync a single document identified by its UUID.
   * Returns the resulting SyncState.
   */
  async syncDocument(documentId: string): Promise<SyncState> {
    const localVersion = await this._getLocalVersion(documentId);
    const remoteVersion = await this._getRemoteVersion(documentId);

    const localState: SyncState = {
      documentId,
      localVersion,
      remoteVersion,
      syncedAt: new Date(),
      status: 'synced',
    };

    if (localVersion === 0) {
      // Document doesn't exist locally — always download
      await this._downloadDocument(documentId);
      const newLocalVersion = await this._getLocalVersion(documentId);
      const state: SyncState = {
        documentId,
        localVersion: newLocalVersion,
        remoteVersion,
        syncedAt: new Date(),
        status: 'synced',
      };
      this.syncStates.set(documentId, state);
      return state;
    }

    // Both exist — determine status
    const status = this._computeStatus(localVersion, remoteVersion);

    if (status === 'synced' || status === 'local-ahead') {
      // Nothing to download for 'local-ahead' unless resolution says remote wins
      if (status === 'local-ahead') {
        const winner = await this._resolveConflict(
          documentId,
          localState,
          { ...localState, status: 'local-ahead' }
        );
        if (winner === 'remote') {
          await this._downloadDocument(documentId);
          const updatedLocal = await this._getLocalVersion(documentId);
          const resolved: SyncState = {
            documentId,
            localVersion: updatedLocal,
            remoteVersion,
            syncedAt: new Date(),
            status: 'synced',
          };
          this.syncStates.set(documentId, resolved);
          return resolved;
        }
      }
      const state: SyncState = { ...localState, status };
      this.syncStates.set(documentId, state);
      return state;
    }

    if (status === 'remote-ahead') {
      await this._downloadDocument(documentId);
      const updatedLocal = await this._getLocalVersion(documentId);
      const state: SyncState = {
        documentId,
        localVersion: updatedLocal,
        remoteVersion,
        syncedAt: new Date(),
        status: 'synced',
      };
      this.syncStates.set(documentId, state);
      return state;
    }

    // status === 'conflict' — both changed since we last synced
    const winner = await this._resolveConflict(documentId, localState, {
      ...localState,
      status: 'conflict',
    });

    if (winner === 'remote') {
      await this._downloadDocument(documentId);
      const updatedLocal = await this._getLocalVersion(documentId);
      const state: SyncState = {
        documentId,
        localVersion: updatedLocal,
        remoteVersion,
        syncedAt: new Date(),
        status: 'synced',
      };
      this.syncStates.set(documentId, state);
      return state;
    }

    // Keep local
    const kept: SyncState = { ...localState, status: 'synced' };
    this.syncStates.set(documentId, kept);
    return kept;
  }

  /**
   * Wire the FileMonitor to automatically call syncDocument whenever the
   * monitor emits changes.
   */
  async startLiveSync(monitor: FileMonitor): Promise<void> {
    this.liveMonitor = monitor;

    this.liveHandler = async (changes: DocumentChange[]) => {
      for (const change of changes) {
        try {
          if (change.changeType === 'deleted') {
            // Mark as removed in state (don't delete local file)
            const existing = this.syncStates.get(change.documentId);
            if (existing) {
              this.syncStates.set(change.documentId, {
                ...existing,
                remoteVersion: 0,
                syncedAt: new Date(),
                status: 'local-ahead',
              });
            }
          } else {
            await this.syncDocument(change.documentId);
          }
        } catch {
          // Swallow per-document errors during live sync
        }
      }
    };

    await monitor.start(this.liveHandler);
  }

  /**
   * Stop live sync (stops the underlying FileMonitor).
   */
  async stopLiveSync(): Promise<void> {
    if (this.liveMonitor) {
      await this.liveMonitor.stop();
      this.liveMonitor = null;
      this.liveHandler = null;
    }
  }

  getSyncState(documentId: string): SyncState | undefined {
    return this.syncStates.get(documentId);
  }

  getAllSyncStates(): SyncState[] {
    return Array.from(this.syncStates.values());
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the local mtime for the document's metadata file.
   * Returns 0 if the file does not exist.
   */
  async _getLocalVersion(documentId: string): Promise<number> {
    const metadataPath = join(this.localDir, `${documentId}.metadata`);
    try {
      const s = await stat(metadataPath);
      return s.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Get the remote mtime for the document's metadata file.
   * Returns 0 if not found.
   */
  async _getRemoteVersion(documentId: string): Promise<number> {
    try {
      const files = await this.client.listFiles();
      const meta = files.find((f) => f.name === `${documentId}.metadata`);
      return meta ? meta.modifiedAt.getTime() : 0;
    } catch {
      return 0;
    }
  }

  private _computeStatus(
    localVersion: number,
    remoteVersion: number
  ): SyncState['status'] {
    if (localVersion === remoteVersion) return 'synced';
    if (localVersion > remoteVersion) return 'local-ahead';
    return 'remote-ahead';
  }

  private async _resolveConflict(
    docId: string,
    local: SyncState,
    remote: SyncState
  ): Promise<'local' | 'remote'> {
    switch (this.conflictResolution) {
      case 'local':
        return 'local';

      case 'remote':
        return 'remote';

      case 'newest':
        return local.localVersion >= remote.remoteVersion ? 'local' : 'remote';

      case 'manual':
        if (this.onConflict) {
          return this.onConflict(docId, local, remote);
        }
        // If no callback provided, default to newest
        return local.localVersion >= remote.remoteVersion ? 'local' : 'remote';
    }
  }

  private async _downloadDocument(documentId: string): Promise<void> {
    await this.client.downloadDocument(documentId, this.localDir);
  }
}
