/**
 * HybridClient — unified access layer over SSH and Cloud.
 *
 * Strategy:
 *  - mode='ssh'   → SSH only; throws if unavailable.
 *  - mode='cloud' → Cloud only; throws if unavailable.
 *  - mode='auto'  → Probes SSH first (fast LAN path); falls back to Cloud.
 *
 * Both underlying clients are injectable via constructor options for testing.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { RemarkableSSHClient } from '../device/ssh-client.js';
import type { SSHConnectionOptions } from '../device/ssh-client.js';
import { RemarkableCloudClient } from '../cloud/client.js';
import type { RemarkableDocument, DownloadedDocument } from '../cloud/types.js';

export type { SSHConnectionOptions };

export type AccessMode = 'ssh' | 'cloud' | 'auto';

export interface HybridClientOptions {
  /** Access mode. 'auto' tries SSH first, falls back to cloud. Default: 'auto' */
  mode?: AccessMode;
  /** SSH connection config — required when mode is 'ssh' or 'auto' */
  ssh?: SSHConnectionOptions;
  /** Cloud auth config — required when mode is 'cloud' or 'auto' */
  cloud?: {
    deviceToken: string;
    userToken?: string;
    tokenPath?: string;
    inksightApiKey?: string;
    inksightApiUrl?: string;
  };
  /** In auto mode, prefer SSH when both are available. Default: true */
  preferSSH?: boolean;
  /** How long to wait for SSH before falling back to cloud (ms). Default: 3000 */
  sshTimeoutMs?: number;
  /** Skip all cloud calls — SSH only (even in auto mode). Default: false */
  offlineMode?: boolean;
  /** Pre-built SSH client (for tests / DI). */
  _sshClient?: RemarkableSSHClient;
  /** Pre-built Cloud client (for tests / DI). */
  _cloudClient?: RemarkableCloudClient;
}

export interface HybridStatus {
  sshAvailable: boolean;
  cloudAvailable: boolean;
  activeMode: 'ssh' | 'cloud' | 'offline';
  lastChecked: Date;
}

interface PersistedPreferences {
  mode: AccessMode;
  preferSSH: boolean;
  sshTimeoutMs: number;
  offlineMode: boolean;
  ssh?: SSHConnectionOptions;
  cloud?: {
    deviceToken: string;
    userToken?: string;
    tokenPath?: string;
    inksightApiKey?: string;
    inksightApiUrl?: string;
  };
}

export class HybridClient {
  private readonly mode: AccessMode;
  private readonly preferSSH: boolean;
  private readonly sshTimeoutMs: number;
  private readonly offlineMode: boolean;
  private readonly sshOptions?: SSHConnectionOptions;
  private readonly cloudOptions?: HybridClientOptions['cloud'];

  private sshClient?: RemarkableSSHClient;
  private cloudClient?: RemarkableCloudClient;

  private status: HybridStatus = {
    sshAvailable: false,
    cloudAvailable: false,
    activeMode: 'offline',
    lastChecked: new Date(0),
  };

  constructor(private readonly rawOptions: HybridClientOptions) {
    this.mode = rawOptions.mode ?? 'auto';
    this.preferSSH = rawOptions.preferSSH ?? true;
    this.sshTimeoutMs = rawOptions.sshTimeoutMs ?? 3_000;
    this.offlineMode = rawOptions.offlineMode ?? false;
    this.sshOptions = rawOptions.ssh;
    this.cloudOptions = rawOptions.cloud;
    this.sshClient = rawOptions._sshClient;
    this.cloudClient = rawOptions._cloudClient;
  }

  async initialize(): Promise<HybridStatus> {
    switch (this.mode) {
      case 'ssh':
        return this._initSSHOnly();
      case 'cloud':
        return this._initCloudOnly();
      case 'auto':
      default:
        return this._initAuto();
    }
  }

  private async _initSSHOnly(): Promise<HybridStatus> {
    const client = this._getOrCreateSSHClient();
    try {
      await this._connectSSH(client, this.sshTimeoutMs);
      this.sshClient = client;
      this.status = { sshAvailable: true, cloudAvailable: false, activeMode: 'ssh', lastChecked: new Date() };
      return this.status;
    } catch (err) {
      throw new Error(`SSH mode: connection failed — ${(err as Error).message}`);
    }
  }

  private async _initCloudOnly(): Promise<HybridStatus> {
    const client = this._getOrCreateCloudClient();
    try {
      await client.authenticate();
      this.cloudClient = client;
      this.status = { sshAvailable: false, cloudAvailable: true, activeMode: 'cloud', lastChecked: new Date() };
      return this.status;
    } catch (err) {
      throw new Error(`Cloud mode: authentication failed — ${(err as Error).message}`);
    }
  }

  private async _initAuto(): Promise<HybridStatus> {
    let sshAvailable = false;
    let cloudAvailable = false;

    if (this.sshOptions || this.rawOptions._sshClient) {
      try {
        const client = this._getOrCreateSSHClient();
        await this._connectSSH(client, this.sshTimeoutMs);
        this.sshClient = client;
        sshAvailable = true;
      } catch {
        sshAvailable = false;
      }
    }

    if (!this.offlineMode && (this.cloudOptions || this.rawOptions._cloudClient)) {
      try {
        const client = this._getOrCreateCloudClient();
        await client.authenticate();
        this.cloudClient = client;
        cloudAvailable = true;
      } catch {
        cloudAvailable = false;
      }
    }

    let activeMode: 'ssh' | 'cloud' | 'offline';
    if (this.offlineMode) {
      activeMode = sshAvailable ? 'ssh' : 'offline';
    } else if (this.preferSSH && sshAvailable) {
      activeMode = 'ssh';
    } else if (cloudAvailable) {
      activeMode = 'cloud';
    } else if (sshAvailable) {
      activeMode = 'ssh';
    } else {
      activeMode = 'offline';
    }

    this.status = { sshAvailable, cloudAvailable, activeMode, lastChecked: new Date() };
    return this.status;
  }

  async getStatus(): Promise<HybridStatus> {
    return this.initialize();
  }

  async listDocuments(): Promise<(RemarkableDocument & { _source: 'ssh' | 'cloud' })[]> {
    if (this.sshClient?.isConnected()) {
      try {
        return await this._listViaSSH();
      } catch {
        if (this.cloudClient) return await this._listViaCloud();
        throw new Error('listDocuments: SSH failed and no cloud client available');
      }
    }
    if (this.cloudClient) return await this._listViaCloud();
    throw new Error('listDocuments: no backend available');
  }

  async downloadDocument(documentId: string, localDir: string): Promise<DownloadedDocument> {
    if (this.sshClient?.isConnected()) {
      try {
        return await this._downloadViaSSH(documentId, localDir);
      } catch {
        if (this.cloudClient) return await this._downloadViaCloud(documentId);
        throw new Error('downloadDocument: SSH failed and no cloud client available');
      }
    }
    if (this.cloudClient) return await this._downloadViaCloud(documentId);
    throw new Error('downloadDocument: no backend available');
  }

  async submitTransform(
    documentId: string,
    transformType: 'text' | 'diagram' | 'summary',
    outputDir: string
  ): Promise<string> {
    if (!this.cloudClient) {
      throw new Error('submitTransform requires cloud access — no cloud client available');
    }
    if (this.sshClient?.isConnected()) {
      try { await this._downloadViaSSH(documentId, outputDir); } catch { /* fall through */ }
    }
    const result = await this.cloudClient.downloadAndTransform(documentId, transformType, outputDir);
    return result.outputPath;
  }

  async savePreferences(path: string): Promise<void> {
    const prefs: PersistedPreferences = {
      mode: this.mode,
      preferSSH: this.preferSSH,
      sshTimeoutMs: this.sshTimeoutMs,
      offlineMode: this.offlineMode,
      ssh: this.sshOptions,
      cloud: this.cloudOptions,
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(prefs, null, 2), 'utf-8');
  }

  static async loadFromPreferences(path: string): Promise<HybridClient> {
    const raw = await readFile(path, 'utf-8');
    const prefs: PersistedPreferences = JSON.parse(raw);
    const client = new HybridClient({
      mode: prefs.mode,
      preferSSH: prefs.preferSSH,
      sshTimeoutMs: prefs.sshTimeoutMs,
      offlineMode: prefs.offlineMode,
      ssh: prefs.ssh,
      cloud: prefs.cloud,
    });
    await client.initialize();
    return client;
  }

  private _getOrCreateSSHClient(): RemarkableSSHClient {
    if (this.rawOptions._sshClient) return this.rawOptions._sshClient;
    if (!this.sshOptions) throw new Error('No SSH options provided');
    return new RemarkableSSHClient(this.sshOptions);
  }

  private _getOrCreateCloudClient(): RemarkableCloudClient {
    if (this.rawOptions._cloudClient) return this.rawOptions._cloudClient;
    if (!this.cloudOptions) throw new Error('No cloud options provided');
    return new RemarkableCloudClient(
      { deviceToken: this.cloudOptions.deviceToken, userToken: this.cloudOptions.userToken ?? '' },
      { inksightApiKey: this.cloudOptions.inksightApiKey, inksightApiUrl: this.cloudOptions.inksightApiUrl }
    );
  }

  private _connectSSH(client: RemarkableSSHClient, timeoutMs: number): Promise<void> {
    return Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`SSH connect timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  private async _listViaSSH(): Promise<(RemarkableDocument & { _source: 'ssh' | 'cloud' })[]> {
    if (!this.sshClient) throw new Error('SSH client not available');
    const ids = await this.sshClient.listDocumentIds();
    return ids.map((id) => ({
      id, version: 1, success: true, blobURLGet: '', blobURLGetExpires: '',
      modifiedClient: '', type: 'DocumentType' as const, visibleName: id,
      bookmarked: false, parent: '', _source: 'ssh' as const,
    }));
  }

  private async _listViaCloud(): Promise<(RemarkableDocument & { _source: 'ssh' | 'cloud' })[]> {
    if (!this.cloudClient) throw new Error('Cloud client not available');
    const docs = await this.cloudClient.listDocuments();
    return docs.map((d) => ({ ...d, _source: 'cloud' as const }));
  }

  private async _downloadViaSSH(documentId: string, localDir: string): Promise<DownloadedDocument> {
    if (!this.sshClient) throw new Error('SSH client not available');
    await this.sshClient.downloadDocument(documentId, localDir);
    return {
      metadata: {
        deleted: false, lastModified: new Date().toISOString(), lastOpened: new Date().toISOString(),
        lastOpenedPage: 0, metadatamodified: false, modified: false, parent: '', pinned: false,
        synced: true, type: 'DocumentType', version: 1, visibleName: documentId,
      },
      content: {
        coverPageNumber: 0, dummyDocument: false, extraMetadata: {}, fileType: 'notebook',
        fontName: '', formatVersion: 1, lineHeight: -1, margins: 125, orientation: 'portrait',
        pageCount: 0, pages: [], pageTags: [], textAlignment: 'left', textScale: 1,
      },
      pages: [],
    };
  }

  private async _downloadViaCloud(documentId: string): Promise<DownloadedDocument> {
    if (!this.cloudClient) throw new Error('Cloud client not available');
    return this.cloudClient.downloadDocument(documentId);
  }
}
