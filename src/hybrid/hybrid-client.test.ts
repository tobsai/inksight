/**
 * HybridClient — unit tests (all external I/O and clients are mocked)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridClient } from './hybrid-client.js';
import { OfflineDetector } from './offline-detector.js';
import type { RemarkableCloudClient } from '../cloud/client.js';
import type { RemarkableSSHClient } from '../device/ssh-client.js';
import type { RemarkableDocument, DownloadedDocument } from '../cloud/types.js';

// ── Mock factories ─────────────────────────────────────────────────────────

function makeDoc(id: string, name = id): RemarkableDocument {
  return {
    id,
    version: 1,
    success: true,
    blobURLGet: '',
    blobURLGetExpires: '',
    modifiedClient: '',
    type: 'DocumentType' as const,
    visibleName: name,
    bookmarked: false,
    parent: '',
  };
}

function makeDownloadedDoc(id: string): DownloadedDocument {
  return {
    metadata: {
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
      version: 1,
      visibleName: id,
    },
    content: {
      coverPageNumber: 0,
      dummyDocument: false,
      extraMetadata: {},
      fileType: 'notebook',
      fontName: '',
      formatVersion: 1,
      lineHeight: -1,
      margins: 125,
      orientation: 'portrait',
      pageCount: 1,
      pages: ['page-1'],
      pageTags: [],
      textAlignment: 'left',
      textScale: 1,
    },
    pages: [new Uint8Array([0x72, 0x4d])],
  };
}

function makeMockCloud(docs: RemarkableDocument[] = []): RemarkableCloudClient {
  return {
    listDocuments: vi.fn().mockResolvedValue(docs),
    downloadDocument: vi.fn().mockResolvedValue(makeDownloadedDoc('doc-1')),
    isAuthenticated: vi.fn().mockReturnValue(true),
  } as unknown as RemarkableCloudClient;
}

function makeMockSSH(
  docIds: string[] = [],
  opts = { host: '10.11.99.1', port: 22 }
): RemarkableSSHClient {
  return {
    options: opts,
    isConnected: vi.fn().mockReturnValue(true),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listDocumentIds: vi.fn().mockResolvedValue(docIds),
    downloadDocument: vi.fn().mockResolvedValue([]),
  } as unknown as RemarkableSSHClient;
}

function mockConnectivity(ssh: boolean, cloud: boolean) {
  vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(ssh);
  vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(cloud);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HybridClient.getStatus()', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns "ssh" when SSH is reachable', async () => {
    mockConnectivity(true, true);
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    expect(await client.getStatus()).toBe('ssh');
  });

  it('returns "cloud" when SSH is down but cloud is up', async () => {
    mockConnectivity(false, true);
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    expect(await client.getStatus()).toBe('cloud');
  });

  it('returns "offline" when both are unreachable', async () => {
    mockConnectivity(false, false);
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    expect(await client.getStatus()).toBe('offline');
  });

  it('fires onStatusChange when status changes', async () => {
    mockConnectivity(false, true);
    const onChange = vi.fn();
    const client = new HybridClient(makeMockCloud(), makeMockSSH(), {
      onStatusChange: onChange,
    });

    await client.getStatus();
    expect(onChange).toHaveBeenCalledWith('cloud');
  });

  it('does not fire onStatusChange when status is unchanged', async () => {
    mockConnectivity(true, false);
    const onChange = vi.fn();
    const client = new HybridClient(makeMockCloud(), makeMockSSH(), {
      onStatusChange: onChange,
    });

    await client.getStatus();
    await client.getStatus();

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('HybridClient.getCurrentMode() and setMode()', () => {
  it('defaults to hybrid-ssh-first', () => {
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    expect(client.getCurrentMode()).toBe('hybrid-ssh-first');
  });

  it('respects the mode option', () => {
    const client = new HybridClient(makeMockCloud(), makeMockSSH(), {
      mode: 'cloud-only',
    });
    expect(client.getCurrentMode()).toBe('cloud-only');
  });

  it('setMode() changes the mode at runtime', () => {
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    client.setMode('ssh-only');
    expect(client.getCurrentMode()).toBe('ssh-only');
  });
});

describe('HybridClient.isOnline()', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns false before any getStatus() call', () => {
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    expect(client.isOnline()).toBe(false);
  });

  it('returns true after a successful status probe', async () => {
    mockConnectivity(true, false);
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    await client.getStatus();
    expect(client.isOnline()).toBe(true);
  });

  it('returns false when offline', async () => {
    mockConnectivity(false, false);
    const client = new HybridClient(makeMockCloud(), makeMockSSH());
    await client.getStatus();
    expect(client.isOnline()).toBe(false);
  });
});

describe('HybridClient.listDocuments()', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('ssh-first: uses SSH when available', async () => {
    const ssh = makeMockSSH(['doc-1', 'doc-2']);
    const cloud = makeMockCloud([makeDoc('cloud-doc')]);

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    const docs = await client.listDocuments();

    const ids = docs.map((d) => d.id);
    expect(ids).toContain('doc-1');
    expect(ids).toContain('doc-2');
  });

  it('ssh-first: falls back to cloud when SSH throws', async () => {
    const ssh = makeMockSSH();
    const cloudDocs = [makeDoc('cloud-doc-1'), makeDoc('cloud-doc-2')];
    const cloud = makeMockCloud(cloudDocs);

    vi.spyOn(ssh, 'listDocumentIds').mockRejectedValue(new Error('SSH down'));

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    const docs = await client.listDocuments();

    expect(docs).toEqual(cloudDocs);
  });

  it('cloud-first mode uses cloud as primary', async () => {
    const cloudDocs = [makeDoc('cloud-doc')];
    const cloud = makeMockCloud(cloudDocs);
    const ssh = makeMockSSH(['ssh-doc']);

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-cloud-first' });
    const docs = await client.listDocuments();

    const ids = docs.map((d) => d.id);
    expect(ids).toContain('cloud-doc');
  });

  it('cloud-only mode skips SSH entirely', async () => {
    const cloudDocs = [makeDoc('cloud-doc')];
    const cloud = makeMockCloud(cloudDocs);
    const ssh = makeMockSSH(['ssh-doc']);
    const listIdsSpy = vi.spyOn(ssh, 'listDocumentIds');

    const client = new HybridClient(cloud, ssh, { mode: 'cloud-only' });
    const docs = await client.listDocuments();

    expect(listIdsSpy).not.toHaveBeenCalled();
    expect(docs).toEqual(cloudDocs);
  });

  it('ssh-only mode skips cloud', async () => {
    const cloud = makeMockCloud([makeDoc('cloud-doc')]);
    const ssh = makeMockSSH(['ssh-doc']);
    const cloudSpy = vi.spyOn(cloud, 'listDocuments');

    const client = new HybridClient(cloud, ssh, { mode: 'ssh-only' });
    const docs = await client.listDocuments();

    expect(cloudSpy).not.toHaveBeenCalled();
    const ids = docs.map((d) => d.id);
    expect(ids).toContain('ssh-doc');
  });

  it('deduplicates by ID — SSH doc wins over cloud on same ID', async () => {
    const cloudDoc = { ...makeDoc('shared-id'), visibleName: 'Cloud Version' };
    const cloud = makeMockCloud([cloudDoc]);
    const ssh = makeMockSSH(['shared-id']);

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    const docs = await client.listDocuments();

    const shared = docs.filter((d) => d.id === 'shared-id');
    expect(shared).toHaveLength(1);
  });
});

describe('HybridClient.downloadDocument()', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('hybrid-ssh-first: falls back to cloud when SSH download fails', async () => {
    const cloudDoc = makeDownloadedDoc('doc-1');
    const cloud = makeMockCloud();
    (cloud.downloadDocument as ReturnType<typeof vi.fn>).mockResolvedValue(cloudDoc);

    const ssh = makeMockSSH(['doc-1']);
    vi.spyOn(ssh, 'isConnected').mockReturnValue(true);

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    vi.spyOn(client as any, 'downloadFromSSH').mockRejectedValue(new Error('SSH error'));

    const result = await client.downloadDocument('doc-1');
    expect(result).toEqual(cloudDoc);
    expect(cloud.downloadDocument).toHaveBeenCalledWith('doc-1');
  });

  it('cloud-only: delegates directly to cloud client', async () => {
    const cloudDoc = makeDownloadedDoc('doc-1');
    const cloud = makeMockCloud();
    (cloud.downloadDocument as ReturnType<typeof vi.fn>).mockResolvedValue(cloudDoc);
    const ssh = makeMockSSH();

    const client = new HybridClient(cloud, ssh, { mode: 'cloud-only' });
    const result = await client.downloadDocument('doc-1');

    expect(result).toEqual(cloudDoc);
    expect(cloud.downloadDocument).toHaveBeenCalledWith('doc-1');
  });

  it('cloud-first: uses cloud, falls back to SSH', async () => {
    const cloud = makeMockCloud();
    (cloud.downloadDocument as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Cloud down')
    );

    const sshDoc = makeDownloadedDoc('doc-1');
    const ssh = makeMockSSH(['doc-1']);

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-cloud-first' });
    vi.spyOn(client as any, 'downloadFromSSH').mockResolvedValue(sshDoc);

    const result = await client.downloadDocument('doc-1');
    expect(result).toEqual(sshDoc);
  });
});

describe('HybridClient.syncAll()', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses SSH sync when SSH is available in ssh-first mode', async () => {
    mockConnectivity(true, true);
    const cloud = makeMockCloud();
    const ssh = makeMockSSH();

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    vi.spyOn(client as any, 'syncViaSSH').mockResolvedValue({
      synced: 3,
      source: 'ssh',
      errors: [],
    });

    const result = await client.syncAll('/tmp/test-sync');
    expect(result.source).toBe('ssh');
    expect(result.synced).toBe(3);
  });

  it('falls back to cloud sync when SSH is down', async () => {
    mockConnectivity(false, true);
    const cloud = makeMockCloud([makeDoc('doc-1')]);
    const ssh = makeMockSSH();

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    vi.spyOn(client as any, 'syncViaCloud').mockResolvedValue({
      synced: 2,
      source: 'cloud',
      errors: [],
    });

    const result = await client.syncAll('/tmp/test-sync');
    expect(result.source).toBe('cloud');
    expect(result.synced).toBe(2);
  });

  it('returns offline result when both sources unavailable', async () => {
    mockConnectivity(false, false);
    const client = new HybridClient(makeMockCloud(), makeMockSSH(), {
      mode: 'hybrid-ssh-first',
    });

    const result = await client.syncAll('/tmp/test-sync');
    expect(result.source).toBe('offline');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('cloud-only mode uses cloud sync', async () => {
    mockConnectivity(false, true);
    const cloud = makeMockCloud();
    const ssh = makeMockSSH();

    const client = new HybridClient(cloud, ssh, { mode: 'cloud-only' });
    vi.spyOn(client as any, 'syncViaCloud').mockResolvedValue({
      synced: 1,
      source: 'cloud',
      errors: [],
    });

    const result = await client.syncAll('/tmp/test-sync');
    expect(result.source).toBe('cloud');
  });

  it('ssh-only mode throws when SSH unavailable', async () => {
    mockConnectivity(false, true);
    const client = new HybridClient(makeMockCloud(), makeMockSSH(), {
      mode: 'ssh-only',
    });

    await expect(client.syncAll('/tmp/test-sync')).rejects.toThrow(/SSH-only/);
  });
});

describe('HybridClient.setMode() — runtime switching', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('switching from hybrid to cloud-only routes subsequent calls to cloud', async () => {
    const cloudDocs = [makeDoc('cloud-doc')];
    const cloud = makeMockCloud(cloudDocs);
    const ssh = makeMockSSH();
    const cloudSpy = vi.spyOn(cloud, 'listDocuments');

    const client = new HybridClient(cloud, ssh, { mode: 'hybrid-ssh-first' });
    client.setMode('cloud-only');

    await client.listDocuments();
    expect(cloudSpy).toHaveBeenCalledTimes(1);
  });

  it('switching to ssh-only routes calls to SSH', async () => {
    const cloud = makeMockCloud([makeDoc('cloud-doc')]);
    const ssh = makeMockSSH(['ssh-doc']);
    const cloudSpy = vi.spyOn(cloud, 'listDocuments');

    const client = new HybridClient(cloud, ssh, { mode: 'cloud-only' });
    client.setMode('ssh-only');

    const docs = await client.listDocuments();
    expect(cloudSpy).not.toHaveBeenCalled();
    expect(docs.map((d) => d.id)).toContain('ssh-doc');
  });
});
