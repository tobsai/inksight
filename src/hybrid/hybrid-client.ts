/**
 * HybridClient — unified access layer that composes SSH and Cloud clients.
 *
 * Routing strategy (controlled by `AccessMode`):
 *   'ssh-only'          — only attempt SSH; throw if unavailable
 *   'cloud-only'        — only attempt Cloud; throw if unavailable
 *   'hybrid-ssh-first'  — try SSH, fall back to Cloud on failure (default)
 *   'hybrid-cloud-first'— try Cloud, fall back to SSH on failure
 *
 * For list operations in hybrid modes, results from both sources are merged
 * and deduplicated by document ID (SSH copy preferred — fresher data).
 */

import type { RemarkableCloudClient } from '../cloud/client.js';
import type { RemarkableSSHClient } from '../device/ssh-client.js';
import type { SSHConnectionOptions } from '../device/types.js';
import type { DownloadedDocument, RemarkableDocument } from '../cloud/types.js';
import { OfflineDetector } from './offline-detector.js';
import type { ConnectionStatus } from './offline-detector.js';
import { IncrementalSyncManager } from '../device/sync-manager.js';
import { existsSync } from 'fs';
import { join } from 'path';

export type { ConnectionStatus } from './offline-detector.js';

export type AccessMode =
  | 'ssh-only'
  | 'cloud-only'
  | 'hybrid-ssh-first'
  | 'hybrid-cloud-first';

export interface HybridClientOptions {
  /** Routing strategy. Default: 'hybrid-ssh-first' */
  mode?: AccessMode;
  /** SSH connection options (used for probing and connection) */
  sshConfig?: SSHConnectionOptions;
  /** Path to saved cloud tokens */
  cloudTokensPath?: string;
  /**
   * How long (ms) to tolerate the primary source being offline before failing.
   * Default: 0 (fail fast — try fallback immediately)
   */
  offlineGracePeriodMs?: number;
  /** Called whenever the detected connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
}

/** SSH probe timeout used inside getStatus() — short to stay responsive. */
const STATUS_SSH_PROBE_TIMEOUT_MS = 2_000;
/** Cloud probe timeout used inside getStatus(). */
const STATUS_CLOUD_PROBE_TIMEOUT_MS = 4_000;

export class HybridClient {
  private cloud: RemarkableCloudClient;
  private ssh: RemarkableSSHClient;
  private mode: AccessMode;
  private offlineGracePeriodMs: number;
  private onStatusChange?: (status: ConnectionStatus) => void;

  private lastKnownStatus: ConnectionStatus | null = null;

  constructor(
    cloud: RemarkableCloudClient,
    ssh: RemarkableSSHClient,
    options?: HybridClientOptions
  ) {
    this.cloud = cloud;
    this.ssh = ssh;
    this.mode = options?.mode ?? 'hybrid-ssh-first';
    this.offlineGracePeriodMs = options?.offlineGracePeriodMs ?? 0;
    this.onStatusChange = options?.onStatusChange;
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  /**
   * Probe SSH and Cloud connectivity and return the best available source.
   *
   * Returns 'ssh' if the device is reachable, 'cloud' if the cloud API
   * is reachable, or 'offline' if neither is accessible.
   */
  async getStatus(): Promise<ConnectionStatus> {
    const sshOptions = (this.ssh as any).options as {
      host: string;
      port: number;
    } | undefined;

    const sshHost = sshOptions?.host ?? '10.11.99.1';
    const sshPort = sshOptions?.port ?? 22;

    const [sshReachable, cloudReachable] = await Promise.all([
      OfflineDetector.isSSHReachable(sshHost, sshPort, STATUS_SSH_PROBE_TIMEOUT_MS),
      OfflineDetector.isCloudReachable(STATUS_CLOUD_PROBE_TIMEOUT_MS),
    ]);

    let status: ConnectionStatus;
    if (sshReachable) {
      status = 'ssh';
    } else if (cloudReachable) {
      status = 'cloud';
    } else {
      status = 'offline';
    }

    if (status !== this.lastKnownStatus) {
      this.lastKnownStatus = status;
      this.onStatusChange?.(status);
    }

    return status;
  }

  /** Return the current access mode. */
  getCurrentMode(): AccessMode {
    return this.mode;
  }

  /**
   * Returns true if the last known status is not 'offline'.
   * Will return false until getStatus() has been called at least once.
   */
  isOnline(): boolean {
    return this.lastKnownStatus !== null && this.lastKnownStatus !== 'offline';
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  /**
   * List documents from the best available source.
   *
   * - ssh-only / cloud-only: use that source exclusively
   * - hybrid modes: try primary first, fall back to secondary on failure
   *
   * If both sources succeed in hybrid mode, results are merged and
   * deduplicated by document ID (SSH copy wins as it is typically fresher).
   */
  async listDocuments(): Promise<RemarkableDocument[]> {
    switch (this.mode) {
      case 'ssh-only':
        return this.listDocumentsFromSSH();
      case 'cloud-only':
        return this.cloud.listDocuments();
      case 'hybrid-ssh-first':
        return this.listWithFallback('ssh');
      case 'hybrid-cloud-first':
        return this.listWithFallback('cloud');
    }
  }

  /**
   * Download a document from the best available source.
   * Falls back to secondary source on failure in hybrid modes.
   */
  async downloadDocument(documentId: string): Promise<DownloadedDocument> {
    switch (this.mode) {
      case 'ssh-only':
        return this.downloadFromSSH(documentId);
      case 'cloud-only':
        return this.cloud.downloadDocument(documentId);
      case 'hybrid-ssh-first':
        return this.downloadWithFallback(documentId, 'ssh');
      case 'hybrid-cloud-first':
        return this.downloadWithFallback(documentId, 'cloud');
    }
  }

  // ── Smart sync ─────────────────────────────────────────────────────────────

  /**
   * Sync all documents to localDir using the best available source.
   *
   * SSH: IncrementalSyncManager.initialSync()
   * Cloud: download each document not present locally
   */
  async syncAll(localDir: string): Promise<{
    synced: number;
    source: ConnectionStatus;
    errors: string[];
  }> {
    const status = await this.getStatus();

    if (this.mode === 'ssh-only') {
      if (status !== 'ssh') {
        throw new Error('syncAll: SSH-only mode but SSH is not available');
      }
      return this.syncViaSSH(localDir);
    }

    if (this.mode === 'cloud-only') {
      if (status !== 'cloud') {
        throw new Error('syncAll: cloud-only mode but Cloud is not available');
      }
      return this.syncViaCloud(localDir);
    }

    // Hybrid modes: pick best available source
    if (this.mode === 'hybrid-ssh-first') {
      if (status === 'ssh') return this.syncViaSSH(localDir);
      if (status === 'cloud') return this.syncViaCloud(localDir);
    }

    if (this.mode === 'hybrid-cloud-first') {
      if (status === 'cloud') return this.syncViaCloud(localDir);
      if (status === 'ssh') return this.syncViaSSH(localDir);
    }

    return {
      synced: 0,
      source: 'offline',
      errors: ['Both SSH and Cloud are unreachable'],
    };
  }

  // ── Preference ─────────────────────────────────────────────────────────────

  /**
   * Switch the access mode at runtime (e.g. user goes offline and switches
   * to cloud-only from a preferences panel).
   */
  setMode(mode: AccessMode): void {
    this.mode = mode;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * List documents from the SSH device by reading document IDs.
   * Returns lightweight RemarkableDocument stubs from UUID list.
   */
  private async listDocumentsFromSSH(): Promise<RemarkableDocument[]> {
    if (!this.ssh.isConnected()) {
      await this.ssh.connect();
    }

    const ids = await this.ssh.listDocumentIds();
    return ids.map((id) => ({
      id,
      version: 0,
      success: true,
      blobURLGet: '',
      blobURLGetExpires: '',
      modifiedClient: '',
      type: 'DocumentType' as const,
      visibleName: id,
      bookmarked: false,
      parent: '',
    }));
  }

  private async listWithFallback(primary: 'ssh' | 'cloud'): Promise<RemarkableDocument[]> {
    const trySSH = async () => this.listDocumentsFromSSH();
    const tryCloud = async () => this.cloud.listDocuments();

    const primaryFn = primary === 'ssh' ? trySSH : tryCloud;
    const fallbackFn = primary === 'ssh' ? tryCloud : trySSH;

    let primaryDocs: RemarkableDocument[] | null = null;

    try {
      primaryDocs = await primaryFn();
    } catch {
      // Primary failed — use fallback only
      return fallbackFn();
    }

    // Primary succeeded — try to merge with fallback for completeness
    let fallbackDocs: RemarkableDocument[] = [];
    try {
      fallbackDocs = await fallbackFn();
    } catch {
      // Fallback unavailable — return primary results only
      return primaryDocs;
    }

    // Merge: build a map from fallback, then overwrite with primary (fresher)
    const merged = new Map<string, RemarkableDocument>();
    for (const doc of fallbackDocs) {
      merged.set(doc.id, doc);
    }
    for (const doc of primaryDocs) {
      merged.set(doc.id, doc);
    }
    return Array.from(merged.values());
  }

  private async downloadFromSSH(documentId: string): Promise<DownloadedDocument> {
    if (!this.ssh.isConnected()) {
      await this.ssh.connect();
    }

    const tmpDir = join(
      process.env['TMPDIR'] ?? '/tmp',
      `inksight-hybrid-${documentId}-${Date.now()}`
    );

    const localPaths = await this.ssh.downloadDocument(documentId, tmpDir);

    const { readFile } = await import('fs/promises');

    const metadataPath = localPaths.find((p) => p.endsWith('.metadata'));
    const contentPath = localPaths.find((p) => p.endsWith('.content'));
    const rmPaths = localPaths.filter((p) => p.endsWith('.rm'));

    const metadata = metadataPath
      ? JSON.parse(await readFile(metadataPath, 'utf-8'))
      : {
          deleted: false,
          lastModified: '',
          lastOpened: '',
          lastOpenedPage: 0,
          metadatamodified: false,
          modified: false,
          parent: '',
          pinned: false,
          synced: true,
          type: 'DocumentType',
          version: 0,
          visibleName: documentId,
        };

    const content = contentPath
      ? JSON.parse(await readFile(contentPath, 'utf-8'))
      : {
          coverPageNumber: 0,
          dummyDocument: false,
          extraMetadata: {},
          fileType: 'notebook',
          fontName: '',
          formatVersion: 1,
          lineHeight: -1,
          margins: 125,
          orientation: 'portrait',
          pageCount: rmPaths.length,
          pages: [],
          pageTags: [],
          textAlignment: 'left',
          textScale: 1,
        };

    const pages: Uint8Array[] = await Promise.all(
      rmPaths.map((p) => readFile(p).then((buf) => new Uint8Array(buf)))
    );

    return { metadata, content, pages };
  }

  private async downloadWithFallback(
    documentId: string,
    primary: 'ssh' | 'cloud'
  ): Promise<DownloadedDocument> {
    const primaryFn =
      primary === 'ssh'
        ? () => this.downloadFromSSH(documentId)
        : () => this.cloud.downloadDocument(documentId);

    const fallbackFn =
      primary === 'ssh'
        ? () => this.cloud.downloadDocument(documentId)
        : () => this.downloadFromSSH(documentId);

    try {
      return await primaryFn();
    } catch {
      return fallbackFn();
    }
  }

  private async syncViaSSH(localDir: string): Promise<{
    synced: number;
    source: ConnectionStatus;
    errors: string[];
  }> {
    if (!this.ssh.isConnected()) {
      await this.ssh.connect();
    }

    const manager = new IncrementalSyncManager(this.ssh, {
      localDir,
      conflictResolution: 'newest',
    });

    const result = await manager.initialSync();
    return { synced: result.synced, source: 'ssh', errors: result.errors };
  }

  private async syncViaCloud(localDir: string): Promise<{
    synced: number;
    source: ConnectionStatus;
    errors: string[];
  }> {
    const docs = await this.cloud.listDocuments();
    const errors: string[] = [];
    let synced = 0;

    for (const doc of docs) {
      try {
        const metadataPath = join(localDir, `${doc.id}.metadata`);
        if (existsSync(metadataPath)) {
          continue;
        }
        await this.cloud.downloadDocument(doc.id);
        synced++;
      } catch (err) {
        errors.push(
          `${doc.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { synced, source: 'cloud', errors };
  }
}
