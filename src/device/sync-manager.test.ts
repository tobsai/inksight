/**
 * Unit tests for IncrementalSyncManager
 *
 * All SSH and filesystem interactions are mocked — no real device or disk I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncrementalSyncManager } from './sync-manager.js';
import type { SyncState } from './sync-manager.js';

// ---------------------------------------------------------------------------
// Mock fs/promises
// ---------------------------------------------------------------------------

const mockStat = vi.fn();
vi.mock('fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

// ---------------------------------------------------------------------------
// Mock RemarkableSSHClient
// ---------------------------------------------------------------------------

const mockListDocumentIds = vi.fn();
const mockListFiles = vi.fn();
const mockDownloadDocument = vi.fn();

const mockClient = {
  listDocumentIds: mockListDocumentIds,
  listFiles: mockListFiles,
  downloadDocument: mockDownloadDocument,
} as unknown as import('./ssh-client.js').RemarkableSSHClient;

// ---------------------------------------------------------------------------
// Mock FileMonitor
// ---------------------------------------------------------------------------

let capturedHandler: import('./file-monitor.js').ChangeHandler | null = null;
const mockMonitorStart = vi.fn(async (handler: import('./file-monitor.js').ChangeHandler) => {
  capturedHandler = handler;
});
const mockMonitorStop = vi.fn(async () => {
  capturedHandler = null;
});
const mockMonitorIsRunning = vi.fn().mockReturnValue(false);

const mockMonitor = {
  start: mockMonitorStart,
  stop: mockMonitorStop,
  isRunning: mockMonitorIsRunning,
} as unknown as import('./file-monitor.js').FileMonitor;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_A = 'aaaabbbb-1111-2222-3333-ccccddddeeee';
const UUID_B = 'bbbbcccc-2222-3333-4444-ddddeeeeffff';
const LOCAL_DIR = '/tmp/inksight-sync-test';

function makeRemoteFile(name: string, mtime: number) {
  return {
    path: `/xochitl/${name}`,
    name,
    size: 512,
    isDirectory: false,
    modifiedAt: new Date(mtime),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncrementalSyncManager — initialSync()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;
  });

  it('downloads all remote documents when localDir is empty', async () => {
    mockListDocumentIds.mockResolvedValue([UUID_A, UUID_B]);
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_B}.metadata`, 1_700_001_000_000),
    ]);
    mockStat.mockRejectedValue(new Error('ENOENT')); // no local files
    mockDownloadDocument.mockResolvedValue([]);

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const result = await manager.initialSync();

    expect(result.synced).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(mockDownloadDocument).toHaveBeenCalledTimes(2);
  });

  it('skips documents already synced (same mtime)', async () => {
    mockListDocumentIds.mockResolvedValue([UUID_A]);
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    // Local file exists with same mtime
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });
    mockDownloadDocument.mockResolvedValue([]);

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const result = await manager.initialSync();

    // status = 'synced' → counted
    expect(result.synced).toBe(1);
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('downloads when remote is newer (remote-ahead)', async () => {
    mockListDocumentIds.mockResolvedValue([UUID_A]);
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_999_999_000), // newer remote
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 }); // older local
    mockDownloadDocument.mockResolvedValue([]);
    // After download, local mtime is updated
    mockStat
      .mockResolvedValueOnce({ mtimeMs: 1_700_000_000_000 })
      .mockResolvedValueOnce({ mtimeMs: 1_700_999_999_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const result = await manager.initialSync();

    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, LOCAL_DIR);
    expect(result.synced).toBe(1);
  });

  it('accumulates errors per document without aborting', async () => {
    mockListDocumentIds.mockResolvedValue([UUID_A, UUID_B]);
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_B}.metadata`, 1_700_001_000_000),
    ]);
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockDownloadDocument
      .mockRejectedValueOnce(new Error('Transfer failed'))
      .mockResolvedValueOnce([]);

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const result = await manager.initialSync();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Transfer failed');
    expect(result.synced).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('IncrementalSyncManager — syncDocument()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns synced status when mtimes match', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const state = await manager.syncDocument(UUID_A);

    expect(state.status).toBe('synced');
    expect(state.documentId).toBe(UUID_A);
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('detects local-ahead when local mtime > remote mtime', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_999_999_000 }); // local newer

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'local',
    });
    const state = await manager.syncDocument(UUID_A);

    expect(state.status).toBe('local-ahead');
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('detects remote-ahead and downloads', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_999_999_000),
    ]);
    mockStat
      .mockResolvedValueOnce({ mtimeMs: 1_700_000_000_000 })  // initial local check
      .mockResolvedValueOnce({ mtimeMs: 1_700_999_999_000 }); // after download
    mockDownloadDocument.mockResolvedValue([]);

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    const state = await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, LOCAL_DIR);
    expect(state.status).toBe('synced');
  });

  it('getSyncState() returns state after sync', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.syncDocument(UUID_A);

    expect(manager.getSyncState(UUID_A)).toBeDefined();
    expect(manager.getSyncState(UUID_A)!.documentId).toBe(UUID_A);
  });

  it('getSyncState() returns undefined for unknown document', () => {
    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    expect(manager.getSyncState('unknown-id')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('IncrementalSyncManager — conflict resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownloadDocument.mockResolvedValue([]);
  });

  it('resolution=local keeps local, no download', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_999_999_000 }); // local newer

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'local',
    });
    await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('resolution=remote always downloads', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    // Local is newer but resolution=remote → should still download
    mockStat
      .mockResolvedValueOnce({ mtimeMs: 1_700_999_999_000 })
      .mockResolvedValueOnce({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'remote',
    });
    await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, LOCAL_DIR);
  });

  it('resolution=newest picks local when local is newer', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_999_999_000 }); // local newer

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'newest',
    });
    await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('resolution=newest picks remote when remote is newer', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_999_999_000), // remote newer
    ]);
    mockStat
      .mockResolvedValueOnce({ mtimeMs: 1_700_000_000_000 })
      .mockResolvedValueOnce({ mtimeMs: 1_700_999_999_000 });

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'newest',
    });
    await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).toHaveBeenCalled();
  });

  it('resolution=manual calls onConflict and respects its decision', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_999_999_000 }); // local newer

    const onConflict = vi.fn().mockResolvedValue('remote');

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'manual',
      onConflict,
    });
    await manager.syncDocument(UUID_A);

    expect(onConflict).toHaveBeenCalled();
    expect(mockDownloadDocument).toHaveBeenCalled(); // chose remote
  });

  it('resolution=manual keeps local when onConflict returns local', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_999_999_000 });

    const onConflict = vi.fn().mockResolvedValue('local');

    const manager = new IncrementalSyncManager(mockClient, {
      localDir: LOCAL_DIR,
      conflictResolution: 'manual',
      onConflict,
    });
    await manager.syncDocument(UUID_A);

    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('IncrementalSyncManager — startLiveSync / stopLiveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;
    mockDownloadDocument.mockResolvedValue([]);
  });

  it('starts the FileMonitor and wires changes to syncDocument', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.startLiveSync(mockMonitor);

    expect(mockMonitorStart).toHaveBeenCalledOnce();

    // Simulate a file change event
    expect(capturedHandler).not.toBeNull();
    await capturedHandler!([
      { documentId: UUID_A, changedAt: new Date(), changeType: 'modified' },
    ]);

    expect(manager.getSyncState(UUID_A)).toBeDefined();
  });

  it('calls syncDocument for each changed document in the batch', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_B}.metadata`, 1_700_001_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.startLiveSync(mockMonitor);

    await capturedHandler!([
      { documentId: UUID_A, changedAt: new Date(), changeType: 'modified' },
      { documentId: UUID_B, changedAt: new Date(), changeType: 'created' },
    ]);

    expect(manager.getSyncState(UUID_A)).toBeDefined();
    expect(manager.getSyncState(UUID_B)).toBeDefined();
  });

  it('marks deleted documents as local-ahead in state', async () => {
    // Pre-seed a state for UUID_A
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.syncDocument(UUID_A); // sets initial state

    await manager.startLiveSync(mockMonitor);

    await capturedHandler!([
      { documentId: UUID_A, changedAt: new Date(), changeType: 'deleted' },
    ]);

    const state = manager.getSyncState(UUID_A);
    expect(state?.status).toBe('local-ahead');
    expect(state?.remoteVersion).toBe(0);
  });

  it('stopLiveSync() stops the monitor', async () => {
    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.startLiveSync(mockMonitor);
    await manager.stopLiveSync();

    expect(mockMonitorStop).toHaveBeenCalledOnce();
  });

  it('stopLiveSync() is safe to call without prior startLiveSync', async () => {
    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await expect(manager.stopLiveSync()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('IncrementalSyncManager — getAllSyncStates()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownloadDocument.mockResolvedValue([]);
  });

  it('returns all states after syncing multiple documents', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_B}.metadata`, 1_700_001_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.syncDocument(UUID_A);
    await manager.syncDocument(UUID_B);

    const states = manager.getAllSyncStates();
    expect(states).toHaveLength(2);
    const ids = states.map((s: SyncState) => s.documentId);
    expect(ids).toContain(UUID_A);
    expect(ids).toContain(UUID_B);
  });

  it('returns empty array when no documents have been synced', () => {
    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    expect(manager.getAllSyncStates()).toEqual([]);
  });

  it('each state has required fields', async () => {
    mockListFiles.mockResolvedValue([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockStat.mockResolvedValue({ mtimeMs: 1_700_000_000_000 });

    const manager = new IncrementalSyncManager(mockClient, { localDir: LOCAL_DIR });
    await manager.syncDocument(UUID_A);

    const [state] = manager.getAllSyncStates();
    expect(state.documentId).toBe(UUID_A);
    expect(typeof state.localVersion).toBe('number');
    expect(typeof state.remoteVersion).toBe('number');
    expect(state.syncedAt).toBeInstanceOf(Date);
    expect(['synced', 'local-ahead', 'remote-ahead', 'conflict']).toContain(state.status);
  });
});
