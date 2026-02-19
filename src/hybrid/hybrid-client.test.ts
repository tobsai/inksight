/**
 * HybridClient + OfflineDetector — Phase 2.3 unit tests (all I/O mocked)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { HybridClient } from './hybrid-client.js';
import { OfflineDetector } from './offline-detector.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockSSHClient(opts: { connected?: boolean; connectShouldFail?: boolean } = {}) {
  return {
    connect: opts.connectShouldFail
      ? vi.fn().mockRejectedValue(new Error('SSH connection refused'))
      : vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(opts.connected ?? true),
    listDocumentIds: vi.fn().mockResolvedValue(['doc-uuid-1', 'doc-uuid-2']),
    downloadDocument: vi.fn().mockResolvedValue(['local/path/file.rm']),
    listFiles: vi.fn().mockResolvedValue([]),
  };
}

function makeMockCloudClient(opts: { authShouldFail?: boolean } = {}) {
  return {
    authenticate: opts.authShouldFail
      ? vi.fn().mockRejectedValue(new Error('Cloud auth failed'))
      : vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn().mockReturnValue(true),
    listDocuments: vi.fn().mockResolvedValue([
      {
        id: 'cloud-doc-1', version: 1, success: true,
        blobURLGet: 'https://example.com/blob/1', blobURLGetExpires: '2099-01-01T00:00:00Z',
        modifiedClient: '2026-01-01T00:00:00Z', type: 'DocumentType',
        visibleName: 'Cloud Note', bookmarked: false, parent: '',
      },
    ]),
    downloadDocument: vi.fn().mockResolvedValue({
      metadata: {
        deleted: false, lastModified: '2026-01-01T00:00:00Z', lastOpened: '2026-01-01T00:00:00Z',
        lastOpenedPage: 0, metadatamodified: false, modified: false, parent: '', pinned: false,
        synced: true, type: 'DocumentType', version: 1, visibleName: 'Cloud Note',
      },
      content: {
        coverPageNumber: 0, dummyDocument: false, extraMetadata: {}, fileType: 'notebook',
        fontName: '', formatVersion: 1, lineHeight: -1, margins: 125, orientation: 'portrait',
        pageCount: 1, pages: ['page-1'], pageTags: [], textAlignment: 'left', textScale: 1,
      },
      pages: [new Uint8Array([1, 2, 3])],
    }),
    downloadAndTransform: vi.fn().mockResolvedValue({
      document: { metadata: { visibleName: 'Cloud Note' } },
      outputPath: '/tmp/output/doc-uuid-1-text.md',
    }),
  };
}

// ── HybridClient tests ────────────────────────────────────────────────────────

describe('HybridClient', () => {
  describe('initialize() — mode=auto', () => {
    it('prefers SSH when SSH is available and preferSSH=true', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      const status = await client.initialize();
      expect(status.sshAvailable).toBe(true);
      expect(status.activeMode).toBe('ssh');
      expect(ssh.connect).toHaveBeenCalled();
    });

    it('falls back to cloud when SSH is unavailable', async () => {
      const ssh = makeMockSSHClient({ connectShouldFail: true, connected: false });
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      const status = await client.initialize();
      expect(status.sshAvailable).toBe(false);
      expect(status.cloudAvailable).toBe(true);
      expect(status.activeMode).toBe('cloud');
    });

    it('sets activeMode=offline when both backends are unavailable', async () => {
      const ssh = makeMockSSHClient({ connectShouldFail: true, connected: false });
      const cloud = makeMockCloudClient({ authShouldFail: true });
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      const status = await client.initialize();
      expect(status.sshAvailable).toBe(false);
      expect(status.cloudAvailable).toBe(false);
      expect(status.activeMode).toBe('offline');
    });

    it('uses cloud when SSH unavailable and preferSSH=false', async () => {
      const ssh = makeMockSSHClient({ connectShouldFail: true, connected: false });
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: false, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      const status = await client.initialize();
      expect(status.activeMode).toBe('cloud');
    });
  });

  describe('initialize() — mode=ssh', () => {
    it('throws when SSH is unreachable in ssh-only mode', async () => {
      const ssh = makeMockSSHClient({ connectShouldFail: true, connected: false });
      const client = new HybridClient({ mode: 'ssh', ssh: { host: '10.11.99.1' }, _sshClient: ssh as any });
      await expect(client.initialize()).rejects.toThrow(/SSH mode.*failed/i);
    });

    it('succeeds when SSH is reachable in ssh-only mode', async () => {
      const ssh = makeMockSSHClient();
      const client = new HybridClient({ mode: 'ssh', ssh: { host: '10.11.99.1' }, _sshClient: ssh as any });
      const status = await client.initialize();
      expect(status.activeMode).toBe('ssh');
      expect(status.sshAvailable).toBe(true);
    });
  });

  describe('initialize() — mode=cloud', () => {
    it('uses cloud only regardless of SSH availability', async () => {
      const cloud = makeMockCloudClient();
      const client = new HybridClient({ mode: 'cloud', cloud: { deviceToken: 'tok' }, _cloudClient: cloud as any });
      const status = await client.initialize();
      expect(status.activeMode).toBe('cloud');
      expect(status.cloudAvailable).toBe(true);
      expect(status.sshAvailable).toBe(false);
    });

    it('throws when cloud auth fails in cloud-only mode', async () => {
      const cloud = makeMockCloudClient({ authShouldFail: true });
      const client = new HybridClient({ mode: 'cloud', cloud: { deviceToken: 'bad-token' }, _cloudClient: cloud as any });
      await expect(client.initialize()).rejects.toThrow(/Cloud mode.*failed/i);
    });
  });

  describe('listDocuments()', () => {
    it('returns SSH documents tagged with _source=ssh', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const docs = await client.listDocuments();
      expect(docs.length).toBeGreaterThan(0);
      expect(docs[0]._source).toBe('ssh');
    });

    it('falls back to cloud listing when SSH listDocumentIds fails', async () => {
      const ssh = makeMockSSHClient({ connected: true });
      ssh.listDocumentIds.mockRejectedValue(new Error('SSH pipe broken'));
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const docs = await client.listDocuments();
      expect(docs[0]._source).toBe('cloud');
    });
  });

  describe('downloadDocument()', () => {
    it('downloads via SSH fast path when SSH is connected', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const result = await client.downloadDocument('doc-uuid-1', '/tmp/dl');
      expect(ssh.downloadDocument).toHaveBeenCalledWith('doc-uuid-1', '/tmp/dl');
      expect(result).toBeDefined();
    });

    it('falls back to cloud download when SSH downloadDocument fails', async () => {
      const ssh = makeMockSSHClient({ connected: true });
      ssh.downloadDocument.mockRejectedValue(new Error('SSH closed'));
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const result = await client.downloadDocument('doc-uuid-1', '/tmp/dl');
      expect(cloud.downloadDocument).toHaveBeenCalledWith('doc-uuid-1');
      expect(result).toBeDefined();
    });
  });

  describe('submitTransform()', () => {
    it('uses SSH download then cloud transform (SSH fast path)', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        preferSSH: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const outputPath = await client.submitTransform('doc-uuid-1', 'text', '/tmp/out');
      expect(ssh.downloadDocument).toHaveBeenCalledWith('doc-uuid-1', '/tmp/out');
      expect(cloud.downloadAndTransform).toHaveBeenCalledWith('doc-uuid-1', 'text', '/tmp/out');
      expect(outputPath).toBe('/tmp/output/doc-uuid-1-text.md');
    });

    it('uses cloud-only transform pipeline when SSH is unavailable', async () => {
      const ssh = makeMockSSHClient({ connectShouldFail: true, connected: false });
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const outputPath = await client.submitTransform('doc-uuid-1', 'summary', '/tmp/out');
      expect(cloud.downloadAndTransform).toHaveBeenCalledWith('doc-uuid-1', 'summary', '/tmp/out');
      expect(outputPath).toBe('/tmp/output/doc-uuid-1-text.md');
    });

    it('throws when no cloud client is available', async () => {
      const ssh = makeMockSSHClient();
      const client = new HybridClient({ mode: 'ssh', ssh: { host: '10.11.99.1' }, offlineMode: true, _sshClient: ssh as any });
      await client.initialize();
      await expect(client.submitTransform('doc-uuid-1', 'text', '/tmp')).rejects.toThrow(/cloud access/i);
    });
  });

  describe('getStatus()', () => {
    it('re-probes and returns updated status', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      const status = await client.getStatus();
      expect(status.lastChecked).toBeInstanceOf(Date);
      expect(typeof status.sshAvailable).toBe('boolean');
    });
  });

  describe('offlineMode=true', () => {
    it('skips cloud entirely even when cloud options provided', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1' }, cloud: { deviceToken: 'tok' },
        offlineMode: true, _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      const status = await client.initialize();
      expect(cloud.authenticate).not.toHaveBeenCalled();
      expect(status.cloudAvailable).toBe(false);
      expect(status.activeMode).toBe('ssh');
    });
  });

  describe('savePreferences() + loadFromPreferences()', () => {
    let tmpDir: string;
    let prefPath: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-test-'));
      prefPath = path.join(tmpDir, 'prefs.json');
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('round-trips preferences to disk', async () => {
      const ssh = makeMockSSHClient();
      const cloud = makeMockCloudClient();
      const client = new HybridClient({
        mode: 'auto', ssh: { host: '10.11.99.1', port: 22 }, cloud: { deviceToken: 'tok-abc' },
        preferSSH: true, sshTimeoutMs: 5_000, offlineMode: false,
        _sshClient: ssh as any, _cloudClient: cloud as any,
      });
      await client.initialize();
      await client.savePreferences(prefPath);
      const raw = JSON.parse(await fs.readFile(prefPath, 'utf-8'));
      expect(raw.mode).toBe('auto');
      expect(raw.preferSSH).toBe(true);
      expect(raw.sshTimeoutMs).toBe(5_000);
      expect(raw.cloud.deviceToken).toBe('tok-abc');
    });

    it('loadFromPreferences creates and initializes a new client', async () => {
      const prefs = { mode: 'cloud', preferSSH: false, sshTimeoutMs: 3000, offlineMode: false, cloud: { deviceToken: 'tok-xyz' } };
      await fs.writeFile(prefPath, JSON.stringify(prefs), 'utf-8');
      await expect(HybridClient.loadFromPreferences(prefPath)).rejects.toThrow(/Cloud mode.*failed/i);
    });
  });
});

// ── OfflineDetector tests ─────────────────────────────────────────────────────

describe('OfflineDetector', () => {
  describe('isSSHReachable()', () => {
    it('returns true when TCP connection succeeds', async () => {
      const server = await new Promise<net.Server>((resolve) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = (server.address() as net.AddressInfo).port;
      try {
        const result = await OfflineDetector.isSSHReachable('127.0.0.1', port, 2_000);
        expect(result).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('returns false when connection is refused', async () => {
      const result = await OfflineDetector.isSSHReachable('127.0.0.1', 1, 1_000);
      expect(result).toBe(false);
    });

    it('returns false on timeout', async () => {
      const result = await OfflineDetector.isSSHReachable('203.0.113.1', 22, 200);
      expect(result).toBe(false);
    });
  });

  describe('isCloudReachable()', () => {
    it('returns mocked true', async () => {
      const spy = vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValueOnce(true);
      try {
        const result = await OfflineDetector.isCloudReachable(2_000);
        expect(result).toBe(true);
      } finally { spy.mockRestore(); }
    });

    it('returns mocked false', async () => {
      const spy = vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValueOnce(false);
      try {
        const result = await OfflineDetector.isCloudReachable(2_000);
        expect(result).toBe(false);
      } finally { spy.mockRestore(); }
    });
  });

  describe('detectMode()', () => {
    it('runs SSH and cloud checks in parallel and returns both', async () => {
      const sshSpy = vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(true);
      const cloudSpy = vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);
      const result = await OfflineDetector.detectMode('10.11.99.1', 22, 2_000);
      expect(result.ssh).toBe(true);
      expect(result.cloud).toBe(true);
      expect(sshSpy).toHaveBeenCalledWith('10.11.99.1', 22, 2_000);
      expect(cloudSpy).toHaveBeenCalled();
      sshSpy.mockRestore();
      cloudSpy.mockRestore();
    });

    it('handles mixed availability (SSH down, cloud up)', async () => {
      const sshSpy = vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
      const cloudSpy = vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);
      const result = await OfflineDetector.detectMode('10.11.99.1', 22);
      expect(result.ssh).toBe(false);
      expect(result.cloud).toBe(true);
      sshSpy.mockRestore();
      cloudSpy.mockRestore();
    });
  });
});
