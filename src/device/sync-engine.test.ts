/**
 * Unit tests for ConflictResolver and IncrementalSyncEngine.
 *
 * All SSH and filesystem interactions are fully mocked — no real device or
 * disk I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictResolver } from './conflict-resolver.js';
import { IncrementalSyncEngine } from './sync-engine.js';

// ---------------------------------------------------------------------------
// Filesystem mocks
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

// ---------------------------------------------------------------------------
// SSH client mock
// ---------------------------------------------------------------------------

const mockListFiles = vi.fn();
const mockDownloadDocument = vi.fn();

const mockSshClient = {
  listFiles: mockListFiles,
  downloadDocument: mockDownloadDocument,
} as unknown as import('./ssh-client.js').RemarkableSSHClient;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_A = 'aaaabbbb-1111-2222-3333-ccccddddeeee';
const UUID_B = 'bbbbcccc-2222-3333-4444-ddddeeeeffff';
const CACHE_DIR = '/tmp/inksight-test-cache';
const STATE_FILE = `${CACHE_DIR}/.sync-state.json`;

function makeRemoteFile(name: string, mtimeMs: number) {
  return {
    path: `/xochitl/${name}`,
    name,
    size: 512,
    isDirectory: false,
    modifiedAt: new Date(mtimeMs),
  };
}

function makeChange(
  documentId: string,
  changeType: 'created' | 'modified' | 'deleted',
  changedAt = new Date(),
): import('./types.js').DocumentChange {
  return { documentId, changeType, changedAt, affectedFiles: [`${documentId}.metadata`] };
}

function makePersistedState(
  versions: Array<[string, { hash: string; modifiedAt: string }]> = [],
): string {
  return JSON.stringify({
    lastSyncAt: new Date(1_700_000_000_000).toISOString(),
    localCacheDir: CACHE_DIR,
    documentVersions: versions,
  });
}

// ---------------------------------------------------------------------------
// ConflictResolver tests
// ---------------------------------------------------------------------------

describe('ConflictResolver — device-wins strategy', () => {
  const resolver = new ConflictResolver('device-wins');

  it('returns use-device when hashes differ', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-01-01'), hash: 'aaa' },
        { modifiedAt: new Date('2026-01-02'), hash: 'bbb' },
      ),
    ).toBe('use-device');
  });

  it('returns use-device even when local is newer', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-01-01'), hash: 'aaa' },
        { modifiedAt: new Date('2026-06-01'), hash: 'bbb' }, // local much newer
      ),
    ).toBe('use-device');
  });

  it('returns no-conflict when hashes match', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-01-01'), hash: 'same' },
        { modifiedAt: new Date('2026-01-02'), hash: 'same' },
      ),
    ).toBe('no-conflict');
  });
});

describe('ConflictResolver — local-wins strategy', () => {
  const resolver = new ConflictResolver('local-wins');

  it('returns use-local when hashes differ', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-06-01'), hash: 'aaa' }, // device newer
        { modifiedAt: new Date('2026-01-01'), hash: 'bbb' },
      ),
    ).toBe('use-local');
  });

  it('returns use-local even when device is newer', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-12-31'), hash: 'device' },
        { modifiedAt: new Date('2026-01-01'), hash: 'local' },
      ),
    ).toBe('use-local');
  });

  it('returns no-conflict when hashes match', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date(), hash: 'identical' },
        { modifiedAt: new Date(), hash: 'identical' },
      ),
    ).toBe('no-conflict');
  });
});

describe('ConflictResolver — newest-wins strategy', () => {
  const resolver = new ConflictResolver('newest-wins');

  it('returns use-device when device is newer', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-06-01'), hash: 'device' },
        { modifiedAt: new Date('2026-01-01'), hash: 'local' },
      ),
    ).toBe('use-device');
  });

  it('returns use-local when local is newer', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-01-01'), hash: 'device' },
        { modifiedAt: new Date('2026-06-01'), hash: 'local' },
      ),
    ).toBe('use-local');
  });

  it('breaks ties in favour of device', () => {
    const ts = new Date('2026-03-15');
    expect(
      resolver.resolve(
        { modifiedAt: ts, hash: 'aaa' },
        { modifiedAt: ts, hash: 'bbb' },
      ),
    ).toBe('use-device');
  });

  it('returns no-conflict when hashes match (regardless of timestamps)', () => {
    expect(
      resolver.resolve(
        { modifiedAt: new Date('2026-01-01'), hash: 'same' },
        { modifiedAt: new Date('2026-06-01'), hash: 'same' },
      ),
    ).toBe('no-conflict');
  });
});

describe('ConflictResolver — default strategy', () => {
  it('defaults to device-wins when no strategy is provided', () => {
    const resolver = new ConflictResolver();
    expect(resolver.getStrategy()).toBe('device-wins');
    expect(
      resolver.resolve(
        { modifiedAt: new Date(), hash: 'a' },
        { modifiedAt: new Date(), hash: 'b' },
      ),
    ).toBe('use-device');
  });
});

// ---------------------------------------------------------------------------
// IncrementalSyncEngine — initialize()
// ---------------------------------------------------------------------------

describe('IncrementalSyncEngine — initialize()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('starts with empty state when no state file exists', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();

    const state = await engine.getSyncState();
    expect(state.documentVersions.size).toBe(0);
    expect(state.localCacheDir).toBe(CACHE_DIR);
  });

  it('loads existing state from JSON file', async () => {
    mockReadFile.mockResolvedValueOnce(
      makePersistedState([
        [UUID_A, { hash: 'abc123', modifiedAt: new Date(1_700_000_000_000).toISOString() }],
      ]),
    );

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();

    const state = await engine.getSyncState();
    expect(state.documentVersions.size).toBe(1);
    expect(state.documentVersions.get(UUID_A)?.hash).toBe('abc123');
    expect(state.documentVersions.get(UUID_A)?.modifiedAt).toEqual(
      new Date(1_700_000_000_000),
    );
  });

  it('handles corrupted state file gracefully (starts fresh)', async () => {
    mockReadFile.mockResolvedValueOnce('{ invalid json }}}');

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize(); // should not throw

    const state = await engine.getSyncState();
    expect(state.documentVersions.size).toBe(0);
  });

  it('creates the cache directory on first initialize', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();

    expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// IncrementalSyncEngine — fullSync()
// ---------------------------------------------------------------------------

describe('IncrementalSyncEngine — fullSync()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    // Make readFile return a buffer for hash computation
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith('.sync-state.json')) return Promise.reject(new Error('ENOENT'));
      return Promise.resolve(Buffer.from('file-contents'));
    });
  });

  it('downloads new documents not yet in state', async () => {
    mockListFiles.mockResolvedValueOnce([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_A}.content`, 1_700_000_000_000),
    ]);
    mockDownloadDocument.mockResolvedValueOnce([
      `${CACHE_DIR}/${UUID_A}.metadata`,
      `${CACHE_DIR}/${UUID_A}.content`,
    ]);

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(result.synced).toContain(UUID_A);
    expect(result.failed).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, CACHE_DIR);
  });

  it('skips documents with unchanged modification time', async () => {
    // Load state that already has UUID_A at mtime 1_700_000_000_000
    mockReadFile.mockImplementationOnce(() =>
      Promise.resolve(
        makePersistedState([
          [UUID_A, { hash: 'existing-hash', modifiedAt: new Date(1_700_000_000_000).toISOString() }],
        ]),
      ),
    );
    // Device reports same mtime
    mockListFiles.mockResolvedValueOnce([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(mockDownloadDocument).not.toHaveBeenCalled();
    expect(result.synced).toHaveLength(0);
  });

  it('downloads modified documents (newer mtime)', async () => {
    mockReadFile.mockImplementationOnce(() =>
      Promise.resolve(
        makePersistedState([
          [UUID_A, { hash: 'old-hash', modifiedAt: new Date(1_700_000_000_000).toISOString() }],
        ]),
      ),
    );
    // Device has a newer mtime
    mockListFiles.mockResolvedValueOnce([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_999_999_000),
    ]);
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    // second readFile call is for hash computation
    mockReadFile.mockResolvedValueOnce(Buffer.from('new-content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(result.synced).toContain(UUID_A);
    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, CACHE_DIR);
  });

  it('marks documents as deleted when absent from device', async () => {
    mockReadFile.mockImplementationOnce(() =>
      Promise.resolve(
        makePersistedState([
          [UUID_A, { hash: 'hash-a', modifiedAt: new Date(1_700_000_000_000).toISOString() }],
        ]),
      ),
    );
    // Device no longer has UUID_A
    mockListFiles.mockResolvedValueOnce([]);

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(result.deleted).toContain(UUID_A);
    const state = await engine.getSyncState();
    expect(state.documentVersions.has(UUID_A)).toBe(false);
  });

  it('records download failures without aborting the sync', async () => {
    mockListFiles.mockResolvedValueOnce([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
      makeRemoteFile(`${UUID_B}.metadata`, 1_700_001_000_000),
    ]);
    mockDownloadDocument
      .mockRejectedValueOnce(new Error('Transfer error'))
      .mockResolvedValueOnce([`${CACHE_DIR}/${UUID_B}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('content-b'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(result.failed).toContain(UUID_A);
    expect(result.synced).toContain(UUID_B);
  });

  it('persists state to disk after sync', async () => {
    mockListFiles.mockResolvedValueOnce([
      makeRemoteFile(`${UUID_A}.metadata`, 1_700_000_000_000),
    ]);
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('metadata-content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    await engine.fullSync();

    expect(mockWriteFile).toHaveBeenCalledWith(
      STATE_FILE,
      expect.stringContaining(UUID_A),
      'utf-8',
    );
  });

  it('returns a duration >= 0 ms', async () => {
    mockListFiles.mockResolvedValueOnce([]);

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.fullSync();

    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// IncrementalSyncEngine — incrementalSync()
// ---------------------------------------------------------------------------

describe('IncrementalSyncEngine — incrementalSync()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith('.sync-state.json')) return Promise.reject(new Error('ENOENT'));
      return Promise.resolve(Buffer.from('file-contents'));
    });
  });

  it('downloads document for created change', async () => {
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([makeChange(UUID_A, 'created')]);

    expect(result.synced).toContain(UUID_A);
    expect(mockDownloadDocument).toHaveBeenCalledWith(UUID_A, CACHE_DIR);
  });

  it('downloads document for modified change', async () => {
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('updated-content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([makeChange(UUID_A, 'modified')]);

    expect(result.synced).toContain(UUID_A);
  });

  it('removes document from state for deleted change', async () => {
    // Pre-seed state with UUID_A
    mockReadFile.mockImplementationOnce(() =>
      Promise.resolve(
        makePersistedState([
          [UUID_A, { hash: 'h', modifiedAt: new Date().toISOString() }],
        ]),
      ),
    );

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([makeChange(UUID_A, 'deleted')]);

    expect(result.deleted).toContain(UUID_A);
    const state = await engine.getSyncState();
    expect(state.documentVersions.has(UUID_A)).toBe(false);
  });

  it('handles empty changes array gracefully', async () => {
    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([]);

    expect(result.synced).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('handles mixed change types in a single batch', async () => {
    // UUID_A = modified, UUID_B = deleted (not in state → no-op)
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('content-a'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([
      makeChange(UUID_A, 'modified'),
      makeChange(UUID_B, 'deleted'),
    ]);

    expect(result.synced).toContain(UUID_A);
    // UUID_B was not in state, so not in deleted list either
    expect(result.deleted).not.toContain(UUID_B);
  });

  it('records download failures per document', async () => {
    mockDownloadDocument.mockRejectedValueOnce(new Error('SFTP error'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const result = await engine.incrementalSync([makeChange(UUID_A, 'created')]);

    expect(result.failed).toContain(UUID_A);
    expect(result.synced).toHaveLength(0);
  });

  it('updates state hash and modifiedAt after download', async () => {
    const changeTime = new Date('2026-02-18T12:00:00.000Z');
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('specific-content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    await engine.incrementalSync([makeChange(UUID_A, 'created', changeTime)]);

    const state = await engine.getSyncState();
    const version = state.documentVersions.get(UUID_A);
    expect(version).toBeDefined();
    expect(version!.hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(version!.modifiedAt).toEqual(changeTime);
  });

  it('persists updated state after incremental sync', async () => {
    mockDownloadDocument.mockResolvedValueOnce([`${CACHE_DIR}/${UUID_A}.metadata`]);
    mockReadFile.mockResolvedValueOnce(Buffer.from('content'));

    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    await engine.incrementalSync([makeChange(UUID_A, 'created')]);

    expect(mockWriteFile).toHaveBeenCalledWith(
      STATE_FILE,
      expect.stringContaining(UUID_A),
      'utf-8',
    );
  });
});

// ---------------------------------------------------------------------------
// IncrementalSyncEngine — getSyncState()
// ---------------------------------------------------------------------------

describe('IncrementalSyncEngine — getSyncState()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
  });

  it('returns a copy of the state (not a reference)', async () => {
    const engine = new IncrementalSyncEngine(mockSshClient, CACHE_DIR);
    await engine.initialize();
    const state1 = await engine.getSyncState();
    const state2 = await engine.getSyncState();

    expect(state1).not.toBe(state2); // different objects
    expect(state1.documentVersions).not.toBe(state2.documentVersions);
  });

  it('reports the correct localCacheDir', async () => {
    const engine = new IncrementalSyncEngine(mockSshClient, '/custom/path');
    await engine.initialize();
    const state = await engine.getSyncState();
    expect(state.localCacheDir).toBe('/custom/path');
  });
});
