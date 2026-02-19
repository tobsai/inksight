/**
 * Unit tests for FileMonitor
 *
 * All SSH interactions are mocked — no real device required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileMonitor, parseInotifyLine } from './file-monitor.js';
import type { ChangeHandler } from './file-monitor.js';

// ---------------------------------------------------------------------------
// Mock RemarkableSSHClient
// ---------------------------------------------------------------------------

const mockExecuteCommand = vi.fn();
const mockListFiles = vi.fn();
const mockConnect = vi.fn();
const mockDownloadDocument = vi.fn();

const mockClient = {
  executeCommand: mockExecuteCommand,
  listFiles: mockListFiles,
  connect: mockConnect,
  downloadDocument: mockDownloadDocument,
  isConnected: vi.fn().mockReturnValue(true),
} as unknown as import('./ssh-client.js').RemarkableSSHClient;

// Provide the static constant that FileMonitor references
(mockClient as unknown as Record<string, unknown>).DOCUMENTS_PATH =
  '/home/root/.local/share/remarkable/xochitl';

// ---------------------------------------------------------------------------
// Sample file listings for polling tests
// ---------------------------------------------------------------------------

const UUID_A = 'aaaabbbb-1111-2222-3333-ccccddddeeee';
const UUID_B = 'bbbbcccc-2222-3333-4444-ddddeeeeffff';

function makeFile(name: string, mtime: number, size = 512, isDir = false) {
  return {
    path: `/home/root/.local/share/remarkable/xochitl/${name}`,
    name,
    size,
    isDirectory: isDir,
    modifiedAt: new Date(mtime),
  };
}

const BASE_FILES = [
  makeFile(`${UUID_A}.metadata`, 1_700_000_000_000),
  makeFile(`${UUID_A}.content`, 1_700_000_000_000),
  makeFile(`${UUID_B}.metadata`, 1_700_001_000_000),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseInotifyLine()', () => {
  it('parses CLOSE_WRITE,CLOSE → modified', () => {
    const result = parseInotifyLine(
      '/home/root/.local/share/remarkable/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.metadata CLOSE_WRITE,CLOSE'
    );
    expect(result).not.toBeNull();
    expect(result!.documentId).toBe('aaaabbbb-1111-2222-3333-ccccddddeeee');
    expect(result!.changeType).toBe('modified');
  });

  it('parses CREATE → created', () => {
    const result = parseInotifyLine(
      '/xochitl/bbbbcccc-2222-3333-4444-ddddeeeeffff.content CREATE'
    );
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('created');
    expect(result!.documentId).toBe('bbbbcccc-2222-3333-4444-ddddeeeeffff');
  });

  it('parses DELETE → deleted', () => {
    const result = parseInotifyLine(
      '/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.metadata DELETE'
    );
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('deleted');
  });

  it('parses MOVED_TO → created', () => {
    const result = parseInotifyLine(
      '/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.rm MOVED_TO'
    );
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('created');
  });

  it('parses MOVED_FROM → deleted', () => {
    const result = parseInotifyLine(
      '/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.rm MOVED_FROM'
    );
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('deleted');
  });

  it('returns null for empty string', () => {
    expect(parseInotifyLine('')).toBeNull();
  });

  it('returns null for lines without a UUID', () => {
    expect(parseInotifyLine('/xochitl/thumbnails.db CREATE')).toBeNull();
  });

  it('returns null for lines with unrecognised event type', () => {
    expect(parseInotifyLine('/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.rm ATTRIB')).toBeNull();
  });

  it('returns a changedAt Date', () => {
    const result = parseInotifyLine(
      '/xochitl/aaaabbbb-1111-2222-3333-ccccddddeeee.rm CREATE'
    );
    expect(result!.changedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — isRunning()', () => {
  let monitor: FileMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new FileMonitor(mockClient, { useInotify: false, pollIntervalMs: 100_000 });
  });

  it('returns false before start()', () => {
    expect(monitor.isRunning()).toBe(false);
  });

  it('returns true after start()', async () => {
    mockListFiles.mockResolvedValue(BASE_FILES);
    await monitor.start(vi.fn());
    expect(monitor.isRunning()).toBe(true);
    await monitor.stop();
  });

  it('returns false after stop()', async () => {
    mockListFiles.mockResolvedValue(BASE_FILES);
    await monitor.start(vi.fn());
    await monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('start() is idempotent — second call does nothing', async () => {
    mockListFiles.mockResolvedValue(BASE_FILES);
    const handler = vi.fn();
    await monitor.start(handler);
    await monitor.start(handler); // should be no-op
    expect(monitor.isRunning()).toBe(true);
    await monitor.stop();
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — inotify mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('uses inotify when inotifywait is available', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: true,
      debounceMs: 0,
      pollIntervalMs: 50,
    });

    // which inotifywait → found
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd.includes('which inotifywait')) {
        return Promise.resolve({ stdout: '/usr/bin/inotifywait', stderr: '', code: 0 });
      }
      if (cmd.includes('inotifywait -m')) {
        return Promise.resolve({ stdout: '12345', stderr: '', code: 0 });
      }
      // tail -n +1 → first poll returns an event line
      if (cmd.includes('tail -n +1')) {
        return Promise.resolve({
          stdout: `/xochitl/${UUID_A}.metadata CLOSE_WRITE,CLOSE\n`,
          stderr: '',
          code: 0,
        });
      }
      // subsequent tail calls return empty
      return Promise.resolve({ stdout: '', stderr: '', code: 0 });
    });

    const handler = vi.fn();
    await monitor.start(handler);

    // Advance past one poll
    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalled();
    const firstCall = handler.mock.calls[0][0];
    expect(firstCall[0].documentId).toBe(UUID_A);
    expect(firstCall[0].changeType).toBe('modified');

    await monitor.stop();
  });

  it('falls back to polling when inotifywait is not available', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: true,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    // which inotifywait → not found
    mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', code: 1 });

    // First poll: base files. Second poll: new file.
    const newFile = makeFile(`ccccdddd-3333-4444-5555-eeeeffff0000.metadata`, 1_700_005_000_000);
    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockResolvedValueOnce([...BASE_FILES, newFile]);

    const handler = vi.fn();
    await monitor.start(handler);

    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalled();
    const changes = handler.mock.calls[0][0];
    expect(changes.some((c: import('./types.js').DocumentChange) => c.changeType === 'created')).toBe(true);

    await monitor.stop();
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — polling fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('detects newly created files', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    const newFile = makeFile(`ccccdddd-3333-4444-5555-eeeeffff0000.metadata`, 1_700_005_000_000);
    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockResolvedValueOnce([...BASE_FILES, newFile]);

    const handler = vi.fn();
    await monitor.start(handler);
    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0][0].changeType).toBe('created');
    expect(handler.mock.calls[0][0][0].documentId).toBe('ccccdddd-3333-4444-5555-eeeeffff0000');

    await monitor.stop();
  });

  it('detects modified files (mtime change)', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    const modified = BASE_FILES.map((f) =>
      f.name === `${UUID_A}.metadata`
        ? { ...f, modifiedAt: new Date(1_700_999_999_000) }
        : f
    );
    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockResolvedValueOnce(modified);

    const handler = vi.fn();
    await monitor.start(handler);
    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalledOnce();
    const changes = handler.mock.calls[0][0];
    const mod = changes.find((c: import('./types.js').DocumentChange) => c.changeType === 'modified');
    expect(mod?.documentId).toBe(UUID_A);

    await monitor.stop();
  });

  it('detects deleted files', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    const withoutA = BASE_FILES.filter((f) => !f.name.startsWith(UUID_A));
    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockResolvedValueOnce(withoutA);

    const handler = vi.fn();
    await monitor.start(handler);
    await vi.advanceTimersByTimeAsync(100);

    expect(handler).toHaveBeenCalled();
    const changes: import('./types.js').DocumentChange[] = handler.mock.calls[0][0];
    expect(changes.every((c) => c.changeType === 'deleted')).toBe(true);
    expect(changes[0].documentId).toBe(UUID_A);

    await monitor.stop();
  });

  it('does not call handler when nothing changed', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockResolvedValueOnce(BASE_FILES);

    const handler = vi.fn();
    await monitor.start(handler);
    await vi.advanceTimersByTimeAsync(100);

    expect(handler).not.toHaveBeenCalled();

    await monitor.stop();
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — debouncing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('coalesces rapid changes to the same document', async () => {
    // Use pollIntervalMs > debounceMs so that within one poll window, multiple
    // _enqueueChange calls for the same doc collapse to a single callback.
    // With pollIntervalMs=200 and debounceMs=50:
    //   t=0:   initial snapshot (no change emitted)
    //   t=200: 2nd poll → change detected → debounce timer set (fires at t=250)
    //   t=250: debounce fires → handler called once with one UUID_A entry
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 200,
      debounceMs: 50,
    });

    // Alternate mtime so every poll sees a change for UUID_A
    let mtime = 1_700_000_000_000;
    mockListFiles.mockImplementation(() => {
      mtime += 1_000;
      return Promise.resolve(
        BASE_FILES.map((f) =>
          f.name.startsWith(UUID_A)
            ? { ...f, modifiedAt: new Date(mtime) }
            : f
        )
      );
    });

    const handler = vi.fn();
    await monitor.start(handler);

    // Let 2 polls fire and the debounce window expire
    await vi.advanceTimersByTimeAsync(500);

    // Handler must have been called at least once
    expect(handler.mock.calls.length).toBeGreaterThan(0);

    // Every call should contain exactly one change for UUID_A (no duplicates)
    for (const [changes] of handler.mock.calls) {
      const forA = changes.filter((c: import('./types.js').DocumentChange) => c.documentId === UUID_A);
      expect(forA.length).toBe(1);
    }

    await monitor.stop();
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — auto-reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('attempts to reconnect when listFiles throws', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
      autoReconnect: true,
    });

    // First poll succeeds (snapshot), second poll fails (disconnect)
    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockRejectedValueOnce(new Error('Connection lost'));

    mockConnect.mockResolvedValue(undefined);

    await monitor.start(vi.fn());
    await vi.advanceTimersByTimeAsync(100);

    // After reconnect delay (5s) + some buffer
    await vi.advanceTimersByTimeAsync(6_000);

    expect(mockConnect).toHaveBeenCalled();

    await monitor.stop();
  });

  it('does not reconnect when autoReconnect is false', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
      autoReconnect: false,
    });

    mockListFiles
      .mockResolvedValueOnce(BASE_FILES)
      .mockRejectedValueOnce(new Error('Connection lost'));

    await monitor.start(vi.fn());
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(mockConnect).not.toHaveBeenCalled();

    await monitor.stop();
  });
});

// ---------------------------------------------------------------------------

describe('FileMonitor — stop()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('stops polling after stop() is called', async () => {
    const monitor = new FileMonitor(mockClient, {
      useInotify: false,
      pollIntervalMs: 50,
      debounceMs: 0,
    });

    mockListFiles.mockResolvedValue(BASE_FILES);

    const handler = vi.fn();
    await monitor.start(handler);

    const callCountAtStop = mockListFiles.mock.calls.length;
    await monitor.stop();

    // Advance well past interval — no further polls should happen
    await vi.advanceTimersByTimeAsync(500);

    expect(mockListFiles.mock.calls.length).toBe(callCountAtStop);
  });

  it('stop() is safe to call when not running', async () => {
    const monitor = new FileMonitor(mockClient);
    await expect(monitor.stop()).resolves.not.toThrow();
  });
});
