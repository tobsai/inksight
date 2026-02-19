/**
 * Unit tests for RemarkableSSHClient
 *
 * All tests mock node-ssh and fs/promises entirely — no real SSH connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemarkableSSHClient } from './ssh-client.js';

// ---------------------------------------------------------------------------
// Mock node-ssh
// ---------------------------------------------------------------------------

const mockConnect = vi.fn();
const mockDispose = vi.fn();
const mockExecCommand = vi.fn();
const mockGetFile = vi.fn();
const mockRequestSFTP = vi.fn();

vi.mock('node-ssh', () => {
  return {
    NodeSSH: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      dispose: mockDispose,
      execCommand: mockExecCommand,
      getFile: mockGetFile,
      requestSFTP: mockRequestSFTP,
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock fs/promises
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helper: build SFTP mock that returns a given file listing
// ---------------------------------------------------------------------------

function makeSftpMock(
  files: Array<{
    filename: string;
    attrs: { size?: number; mtime?: number; mode?: number };
  }>
) {
  return {
    readdir: vi.fn((_path: string, cb: (err: null | Error, list: typeof files) => void) => {
      cb(null, files);
    }),
  };
}

function makeSftpErrorMock(message: string) {
  return {
    readdir: vi.fn((_path: string, cb: (err: Error | null, list?: unknown) => void) => {
      cb(new Error(message));
    }),
  };
}

// Standard file listing for tests
const SAMPLE_FILES = [
  {
    filename: 'aaaabbbb-1111-2222-3333-ccccddddeeee.metadata',
    attrs: { size: 512, mtime: 1_700_000_000, mode: 0o100644 },
  },
  {
    filename: 'aaaabbbb-1111-2222-3333-ccccddddeeee.content',
    attrs: { size: 1024, mtime: 1_700_000_000, mode: 0o100644 },
  },
  {
    filename: 'aaaabbbb-1111-2222-3333-ccccddddeeee.pagedata',
    attrs: { size: 256, mtime: 1_700_000_000, mode: 0o100644 },
  },
  {
    filename: 'aaaabbbb-1111-2222-3333-ccccddddeeee',
    attrs: { size: 0, mtime: 1_700_000_000, mode: 0o40755 }, // directory
  },
  {
    filename: 'bbbbcccc-2222-3333-4444-ddddeeeeffff.metadata',
    attrs: { size: 512, mtime: 1_700_001_000, mode: 0o100644 },
  },
  {
    filename: 'bbbbcccc-2222-3333-4444-ddddeeeeffff.content',
    attrs: { size: 1024, mtime: 1_700_001_000, mode: 0o100644 },
  },
  {
    filename: 'not-a-uuid.txt',
    attrs: { size: 8, mtime: 1_700_001_000, mode: 0o100644 },
  },
];

const DEFAULT_OPTIONS = {
  host: '10.11.99.1',
  username: 'root',
  password: '',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemarkableSSHClient', () => {
  let client: RemarkableSSHClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RemarkableSSHClient(DEFAULT_OPTIONS);
  });

  // -------------------------------------------------------------------------
  // Static constant
  // -------------------------------------------------------------------------

  it('exposes the correct DOCUMENTS_PATH constant', () => {
    expect(RemarkableSSHClient.DOCUMENTS_PATH).toBe(
      '/home/root/.local/share/remarkable/xochitl'
    );
  });

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('connects successfully on first attempt', async () => {
      mockConnect.mockResolvedValueOnce(undefined);

      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
    });

    it('passes correct connection config (password auth)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);

      await client.connect();

      const callArg = mockConnect.mock.calls[0][0];
      expect(callArg.host).toBe('10.11.99.1');
      expect(callArg.username).toBe('root');
      expect(callArg.password).toBe('');
      expect(callArg.port).toBe(22);
    });

    it('passes privateKeyPath when specified (no password)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);

      const clientWithKey = new RemarkableSSHClient({
        host: '10.11.99.1',
        privateKeyPath: '/home/user/.ssh/id_rsa',
      });
      await clientWithKey.connect();

      const callArg = mockConnect.mock.calls[0][0];
      expect(callArg.privateKeyPath).toBe('/home/user/.ssh/id_rsa');
      expect(callArg).not.toHaveProperty('password');
    });

    it('retries on failure and succeeds on the third attempt', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined);

      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(client.isConnected()).toBe(true);
    });

    it('throws after 3 failed attempts', async () => {
      mockConnect.mockRejectedValue(new Error('Timeout'));

      await expect(client.connect()).rejects.toThrow(
        'SSH connection failed after 3 attempts'
      );
      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(client.isConnected()).toBe(false);
    });

    it('applies custom connectTimeoutMs', async () => {
      mockConnect.mockResolvedValueOnce(undefined);

      const customClient = new RemarkableSSHClient({
        host: '192.168.1.100',
        connectTimeoutMs: 5_000,
      });
      await customClient.connect();

      const callArg = mockConnect.mock.calls[0][0];
      expect(callArg.readyTimeout).toBe(5_000);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect()', () => {
    it('disposes the SSH connection and sets connected to false', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();

      expect(mockDispose).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(false);
    });

    it('is a no-op when not connected', async () => {
      await client.disconnect();
      expect(mockDispose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // isConnected()
  // -------------------------------------------------------------------------

  describe('isConnected()', () => {
    it('returns false initially', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('returns true after successful connect', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it('returns false after disconnect', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // listFiles()
  // -------------------------------------------------------------------------

  describe('listFiles()', () => {
    it('lists files in DOCUMENTS_PATH by default', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES));

      const files = await client.listFiles();

      expect(files).toHaveLength(SAMPLE_FILES.length);
      expect(files[0].name).toBe('aaaabbbb-1111-2222-3333-ccccddddeeee.metadata');
      expect(files[0].path).toBe(
        `${RemarkableSSHClient.DOCUMENTS_PATH}/aaaabbbb-1111-2222-3333-ccccddddeeee.metadata`
      );
    });

    it('lists files in a custom remote path', async () => {
      mockRequestSFTP.mockResolvedValueOnce(
        makeSftpMock([
          { filename: 'page1.rm', attrs: { size: 4096, mtime: 1_700_000_000, mode: 0o100644 } },
        ])
      );

      const files = await client.listFiles('/custom/path');

      expect(files[0].path).toBe('/custom/path/page1.rm');
    });

    it('correctly identifies directories', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES));

      const files = await client.listFiles();
      const dir = files.find((f) => f.name === 'aaaabbbb-1111-2222-3333-ccccddddeeee');

      expect(dir?.isDirectory).toBe(true);
      const regular = files.find(
        (f) => f.name === 'aaaabbbb-1111-2222-3333-ccccddddeeee.metadata'
      );
      expect(regular?.isDirectory).toBe(false);
    });

    it('maps mtime to a Date', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES));

      const files = await client.listFiles();
      expect(files[0].modifiedAt).toBeInstanceOf(Date);
      expect(files[0].modifiedAt.getTime()).toBe(1_700_000_000 * 1000);
    });

    it('throws on SFTP error', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpErrorMock('Permission denied'));

      await expect(client.listFiles()).rejects.toThrow('SFTP readdir failed');
    });
  });

  // -------------------------------------------------------------------------
  // downloadFile()
  // -------------------------------------------------------------------------

  describe('downloadFile()', () => {
    it('downloads a file to the local path', async () => {
      mockGetFile.mockResolvedValueOnce(undefined);

      await client.downloadFile(
        `${RemarkableSSHClient.DOCUMENTS_PATH}/doc.metadata`,
        '/tmp/output/doc.metadata'
      );

      expect(mockGetFile).toHaveBeenCalledWith(
        '/tmp/output/doc.metadata',
        `${RemarkableSSHClient.DOCUMENTS_PATH}/doc.metadata`
      );
    });

    it('creates parent directories before downloading', async () => {
      const { mkdir } = await import('fs/promises');
      mockGetFile.mockResolvedValueOnce(undefined);

      await client.downloadFile('/remote/a/b/c.rm', '/local/deep/dir/c.rm');

      expect(mkdir).toHaveBeenCalledWith('/local/deep/dir', { recursive: true });
    });

    it('throws when getFile fails', async () => {
      mockGetFile.mockRejectedValueOnce(new Error('SFTP transfer error'));

      await expect(
        client.downloadFile('/remote/file.rm', '/local/file.rm')
      ).rejects.toThrow('SFTP transfer error');
    });
  });

  // -------------------------------------------------------------------------
  // downloadDocument()
  // -------------------------------------------------------------------------

  describe('downloadDocument()', () => {
    const DOC_ID = 'aaaabbbb-1111-2222-3333-ccccddddeeee';

    it('downloads all flat files matching the document ID', async () => {
      // First call: list the documents directory
      mockRequestSFTP.mockResolvedValueOnce(
        makeSftpMock([
          { filename: `${DOC_ID}.metadata`, attrs: { size: 512, mtime: 0, mode: 0o100644 } },
          { filename: `${DOC_ID}.content`, attrs: { size: 1024, mtime: 0, mode: 0o100644 } },
          { filename: 'other-uuid-1234-5678-9abc-defabc123456.metadata', attrs: { size: 512, mtime: 0, mode: 0o100644 } },
        ])
      );
      mockGetFile.mockResolvedValue(undefined);

      const paths = await client.downloadDocument(DOC_ID, '/output');

      expect(paths).toHaveLength(2);
      expect(paths).toContain(`/output/${DOC_ID}.metadata`);
      expect(paths).toContain(`/output/${DOC_ID}.content`);
    });

    it('recurses into the document directory', async () => {
      // First call: listing DOCUMENTS_PATH — doc dir + metadata
      mockRequestSFTP
        .mockResolvedValueOnce(
          makeSftpMock([
            { filename: `${DOC_ID}.metadata`, attrs: { size: 512, mtime: 0, mode: 0o100644 } },
            { filename: DOC_ID, attrs: { size: 0, mtime: 0, mode: 0o40755 } },
          ])
        )
        // Second call: listing the sub-directory
        .mockResolvedValueOnce(
          makeSftpMock([
            { filename: 'page1.rm', attrs: { size: 4096, mtime: 0, mode: 0o100644 } },
            { filename: 'page2.rm', attrs: { size: 4096, mtime: 0, mode: 0o100644 } },
          ])
        );
      mockGetFile.mockResolvedValue(undefined);

      const paths = await client.downloadDocument(DOC_ID, '/output');

      expect(paths).toContain(`/output/${DOC_ID}.metadata`);
      expect(paths).toContain(`/output/${DOC_ID}/page1.rm`);
      expect(paths).toContain(`/output/${DOC_ID}/page2.rm`);
      expect(paths).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // listDocumentIds()
  // -------------------------------------------------------------------------

  describe('listDocumentIds()', () => {
    it('extracts unique UUIDs from a mixed file listing', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES));

      const ids = await client.listDocumentIds();

      expect(ids).toContain('aaaabbbb-1111-2222-3333-ccccddddeeee');
      expect(ids).toContain('bbbbcccc-2222-3333-4444-ddddeeeeffff');
      expect(ids).not.toContain('not-a-uuid.txt');
    });

    it('returns each UUID exactly once despite multiple matching files', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES));

      const ids = await client.listDocumentIds();
      const uniqueCheck = new Set(ids);

      expect(uniqueCheck.size).toBe(ids.length);
      expect(ids).toHaveLength(2); // two distinct UUIDs in SAMPLE_FILES
    });

    it('returns an empty array when no documents exist', async () => {
      mockRequestSFTP.mockResolvedValueOnce(makeSftpMock([]));

      const ids = await client.listDocumentIds();
      expect(ids).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // executeCommand()
  // -------------------------------------------------------------------------

  describe('executeCommand()', () => {
    it('returns stdout, stderr, and exit code on success', async () => {
      mockExecCommand.mockResolvedValueOnce({
        stdout: 'reMarkable Paper Pro',
        stderr: '',
        code: 0,
      });

      const result = await client.executeCommand('cat /sys/devices/soc0/machine');

      expect(result.stdout).toBe('reMarkable Paper Pro');
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    });

    it('returns non-zero code and stderr on failure', async () => {
      mockExecCommand.mockResolvedValueOnce({
        stdout: '',
        stderr: 'No such file or directory',
        code: 1,
      });

      const result = await client.executeCommand('cat /nonexistent');

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('No such file or directory');
    });

    it('defaults code to 0 when exec returns null', async () => {
      mockExecCommand.mockResolvedValueOnce({ stdout: 'hi', stderr: '', code: null });

      const result = await client.executeCommand('echo hi');
      expect(result.code).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getDeviceInfo()
  // -------------------------------------------------------------------------

  describe('getDeviceInfo()', () => {
    it('parses model, firmware, and serial correctly', async () => {
      mockExecCommand
        .mockResolvedValueOnce({ stdout: 'reMarkable Paper Pro', stderr: '', code: 0 })
        .mockResolvedValueOnce({
          stdout: '[General]\nSERVER_VERSION=3.11.2.4\nFORCE_VERSION=0',
          stderr: '',
          code: 0,
        })
        .mockResolvedValueOnce({ stdout: 'RM110-XXXABCDEF', stderr: '', code: 0 });

      const info = await client.getDeviceInfo();

      expect(info.model).toBe('reMarkable Paper Pro');
      expect(info.firmware).toBe('3.11.2.4');
      expect(info.serial).toBe('RM110-XXXABCDEF');
    });

    it('falls back to raw firmware string when SERVER_VERSION not present', async () => {
      mockExecCommand
        .mockResolvedValueOnce({ stdout: 'reMarkable 2', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '3.9.0.1', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'RM1002-xxxxxxxx', stderr: '', code: 0 });

      const info = await client.getDeviceInfo();

      expect(info.firmware).toBe('3.9.0.1');
    });

    it('trims whitespace from all fields', async () => {
      mockExecCommand
        .mockResolvedValueOnce({ stdout: '  reMarkable Paper Pro  \n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '  3.11.2.4  \n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '  RM110-XYZ  \n', stderr: '', code: 0 });

      const info = await client.getDeviceInfo();

      expect(info.model).toBe('reMarkable Paper Pro');
      expect(info.firmware).toBe('3.11.2.4');
      expect(info.serial).toBe('RM110-XYZ');
    });
  });

  // -------------------------------------------------------------------------
  // watchForChanges()
  // -------------------------------------------------------------------------

  describe('watchForChanges()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls callback when new files are detected', async () => {
      const newFileId = 'ccccdddd-3333-4444-5555-eeeeffff0000';

      // Initial snapshot
      mockRequestSFTP
        .mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES))
        // Poll call: one new file appeared
        .mockResolvedValueOnce(
          makeSftpMock([
            ...SAMPLE_FILES,
            {
              filename: `${newFileId}.metadata`,
              attrs: { size: 512, mtime: 1_700_005_000, mode: 0o100644 },
            },
          ])
        );

      const callback = vi.fn();
      const stop = await client.watchForChanges(callback, 1_000);

      // Advance past the poll interval
      await vi.advanceTimersByTimeAsync(1_100);

      expect(callback).toHaveBeenCalledWith(expect.arrayContaining([newFileId]));

      stop();
    });

    it('does NOT call callback when nothing changed', async () => {
      mockRequestSFTP
        .mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES))
        .mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES)); // identical

      const callback = vi.fn();
      const stop = await client.watchForChanges(callback, 1_000);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(callback).not.toHaveBeenCalled();

      stop();
    });

    it('detects modified files (changed mtime)', async () => {
      const MODIFIED = SAMPLE_FILES.map((f) =>
        f.filename === 'aaaabbbb-1111-2222-3333-ccccddddeeee.metadata'
          ? { ...f, attrs: { ...f.attrs, mtime: 1_700_999_999 } }
          : f
      );

      mockRequestSFTP
        .mockResolvedValueOnce(makeSftpMock(SAMPLE_FILES))
        .mockResolvedValueOnce(makeSftpMock(MODIFIED));

      const callback = vi.fn();
      const stop = await client.watchForChanges(callback, 1_000);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining(['aaaabbbb-1111-2222-3333-ccccddddeeee'])
      );

      stop();
    });

    it('cleanup function stops polling', async () => {
      mockRequestSFTP.mockResolvedValue(makeSftpMock(SAMPLE_FILES));

      const callback = vi.fn();
      const stop = await client.watchForChanges(callback, 500);

      stop(); // stop immediately

      // Advance well past interval — should not poll again
      await vi.advanceTimersByTimeAsync(2_000);

      // Only the initial snapshot call was made (mockRequestSFTP called once)
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
