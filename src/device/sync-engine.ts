/**
 * IncrementalSyncEngine — Downloads and keeps local copies of reMarkable
 * documents in sync with the device.
 *
 * State is persisted to `{cacheDir}/.sync-state.json` after every sync so
 * the engine can resume across process restarts without re-downloading
 * everything.
 *
 * Usage:
 *   const engine = new IncrementalSyncEngine(sshClient, '/tmp/rm-cache');
 *   await engine.initialize();        // load or create state
 *   await engine.fullSync();          // initial full download
 *   // ... later, on a DocumentChange event:
 *   await engine.incrementalSync(changes);
 */

import { createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { RemarkableSSHClient } from './ssh-client.js';
import type { DocumentChange, SyncState, SyncResult } from './types.js';

// UUID pattern to group files by document UUID
const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Serialised form stored in .sync-state.json */
interface PersistedState {
  lastSyncAt: string;
  localCacheDir: string;
  documentVersions: Array<[string, { hash: string; modifiedAt: string }]>;
}

export class IncrementalSyncEngine {
  private state: SyncState;
  private readonly stateFile: string;

  constructor(
    private readonly sshClient: RemarkableSSHClient,
    private readonly cacheDir: string,
  ) {
    this.stateFile = join(cacheDir, '.sync-state.json');
    this.state = {
      lastSyncAt: new Date(0),
      documentVersions: new Map(),
      localCacheDir: cacheDir,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load existing sync state from `{cacheDir}/.sync-state.json`.
   * If the file does not exist or is corrupt, starts with a fresh empty state.
   */
  async initialize(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    try {
      const raw = await readFile(this.stateFile, 'utf-8');
      const persisted = JSON.parse(raw) as PersistedState;

      this.state = {
        lastSyncAt: new Date(persisted.lastSyncAt),
        localCacheDir: persisted.localCacheDir ?? this.cacheDir,
        documentVersions: new Map(
          persisted.documentVersions.map(([id, v]) => [
            id,
            { hash: v.hash, modifiedAt: new Date(v.modifiedAt) },
          ]),
        ),
      };
    } catch {
      // No state file or parse error — start fresh
      this.state = {
        lastSyncAt: new Date(0),
        documentVersions: new Map(),
        localCacheDir: this.cacheDir,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync operations
  // ---------------------------------------------------------------------------

  /**
   * Full sync: enumerate all device documents, compare with known state,
   * download new/changed documents, and mark deleted ones.
   */
  async fullSync(): Promise<SyncResult> {
    const start = Date.now();
    const synced: string[] = [];
    const failed: string[] = [];
    const deleted: string[] = [];

    // Enumerate all files on the device
    const allFiles = await this.sshClient.listFiles();

    // Group files by UUID → track the maximum mtime per document
    const deviceDocs = new Map<string, { maxMtime: number }>();
    for (const file of allFiles) {
      const match = UUID_RE.exec(file.name);
      if (!match) continue;
      const uuid = match[1];
      const mtime = file.modifiedAt.getTime();
      const existing = deviceDocs.get(uuid);
      if (!existing || mtime > existing.maxMtime) {
        deviceDocs.set(uuid, { maxMtime: mtime });
      }
    }

    // Mark documents that exist in state but are gone from device
    for (const [uuid] of this.state.documentVersions) {
      if (!deviceDocs.has(uuid)) {
        deleted.push(uuid);
        this.state.documentVersions.delete(uuid);
      }
    }

    // Download new or modified documents
    for (const [uuid, { maxMtime }] of deviceDocs) {
      const storedVersion = this.state.documentVersions.get(uuid);
      const deviceModifiedAt = new Date(maxMtime);

      const needsDownload =
        !storedVersion ||
        storedVersion.modifiedAt.getTime() < deviceModifiedAt.getTime();

      if (!needsDownload) continue;

      try {
        const localPaths = await this.sshClient.downloadDocument(uuid, this.cacheDir);
        const hashPath = localPaths.find((p) => p.endsWith('.metadata')) ?? localPaths[0];
        const hash = hashPath ? await this.computeFileHash(hashPath) : '';

        this.state.documentVersions.set(uuid, { hash, modifiedAt: deviceModifiedAt });
        synced.push(uuid);
      } catch {
        failed.push(uuid);
      }
    }

    this.state.lastSyncAt = new Date();
    await this._persistState();

    return { synced, failed, deleted, duration: Date.now() - start };
  }

  /**
   * Incremental sync: only process the documents referenced in `changes`.
   * More efficient than fullSync for ongoing change monitoring.
   */
  async incrementalSync(changes: DocumentChange[]): Promise<SyncResult> {
    const start = Date.now();
    const synced: string[] = [];
    const failed: string[] = [];
    const deleted: string[] = [];

    for (const change of changes) {
      if (change.changeType === 'deleted') {
        if (this.state.documentVersions.has(change.documentId)) {
          this.state.documentVersions.delete(change.documentId);
          deleted.push(change.documentId);
        }
        continue;
      }

      // 'created' or 'modified' — download the document
      try {
        const localPaths = await this.sshClient.downloadDocument(
          change.documentId,
          this.cacheDir,
        );
        const hashPath =
          localPaths.find((p) => p.endsWith('.metadata')) ?? localPaths[0];
        const hash = hashPath ? await this.computeFileHash(hashPath) : '';

        this.state.documentVersions.set(change.documentId, {
          hash,
          modifiedAt: change.changedAt,
        });
        synced.push(change.documentId);
      } catch {
        failed.push(change.documentId);
      }
    }

    this.state.lastSyncAt = new Date();
    await this._persistState();

    return { synced, failed, deleted, duration: Date.now() - start };
  }

  /**
   * Return a snapshot of the current sync state.
   */
  async getSyncState(): Promise<SyncState> {
    return {
      lastSyncAt: this.state.lastSyncAt,
      documentVersions: new Map(this.state.documentVersions),
      localCacheDir: this.state.localCacheDir,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Compute SHA-256 hex digest of a local file's contents. */
  async computeFileHash(localPath: string): Promise<string> {
    const contents = await readFile(localPath);
    return createHash('sha256').update(contents).digest('hex');
  }

  /** Serialise and write state to disk. */
  private async _persistState(): Promise<void> {
    const persisted: PersistedState = {
      lastSyncAt: this.state.lastSyncAt.toISOString(),
      localCacheDir: this.state.localCacheDir,
      documentVersions: Array.from(this.state.documentVersions.entries()).map(
        ([id, v]) => [id, { hash: v.hash, modifiedAt: v.modifiedAt.toISOString() }],
      ),
    };
    await writeFile(this.stateFile, JSON.stringify(persisted, null, 2), 'utf-8');
  }
}
