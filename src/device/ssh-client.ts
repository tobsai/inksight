/**
 * SSH Client for Direct reMarkable Device Access
 *
 * Provides direct access to the reMarkable device via SSH over USB or Wi-Fi.
 * Uses node-ssh which wraps ssh2 with a clean async/SFTP API.
 *
 * Default connection:
 *   host:     10.11.99.1   (USB web interface)
 *   username: root
 *   password: <empty>      (unless user has set one)
 *   port:     22
 */

import { NodeSSH } from 'node-ssh';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { SSHConnectionOptions, RemoteFile, DeviceInfo } from './types.js';

export type { SSHConnectionOptions, RemoteFile, DeviceInfo } from './types.js';

// UUID pattern (8-4-4-4-12 hex)
const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export class RemarkableSSHClient {
  /** Path on the device where xochitl document files live */
  static readonly DOCUMENTS_PATH = '/home/root/.local/share/remarkable/xochitl';

  private ssh: NodeSSH;
  private options: Required<SSHConnectionOptions>;
  private connected: boolean = false;

  constructor(options: SSHConnectionOptions) {
    this.ssh = new NodeSSH();
    this.options = {
      host: options.host,
      port: options.port ?? 22,
      username: options.username ?? 'root',
      password: options.password ?? '',
      privateKeyPath: options.privateKeyPath ?? '',
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      keepAliveIntervalMs: options.keepAliveIntervalMs ?? 30_000,
    };
  }

  // ---------------------------------------------------------------------------
  // Connection management
  // ---------------------------------------------------------------------------

  /**
   * Connect to the device with retry logic (3 attempts, exponential backoff).
   */
  async connect(): Promise<void> {
    const maxAttempts = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const connectConfig: Record<string, unknown> = {
          host: this.options.host,
          port: this.options.port,
          username: this.options.username,
          readyTimeout: this.options.connectTimeoutMs,
          keepaliveInterval: this.options.keepAliveIntervalMs,
        };

        if (this.options.privateKeyPath) {
          connectConfig.privateKeyPath = this.options.privateKeyPath;
        } else {
          connectConfig.password = this.options.password;
        }

        await this.ssh.connect(connectConfig as Parameters<NodeSSH['connect']>[0]);
        this.connected = true;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          // Exponential backoff: 500ms, 1000ms
          await delay(500 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw new Error(
      `SSH connection failed after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Gracefully disconnect from the device.
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      this.ssh.dispose();
      this.connected = false;
    }
  }

  /**
   * Returns true if currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ---------------------------------------------------------------------------
  // File system operations
  // ---------------------------------------------------------------------------

  /**
   * List files in the documents path (or a custom remote path).
   * Returns structured RemoteFile objects.
   */
  async listFiles(remotePath?: string): Promise<RemoteFile[]> {
    const targetPath = remotePath ?? RemarkableSSHClient.DOCUMENTS_PATH;
    const sftp = await this.ssh.requestSFTP();

    return new Promise<RemoteFile[]>((resolve, reject) => {
      sftp.readdir(targetPath, (err, list) => {
        if (err) {
          reject(new Error(`SFTP readdir failed: ${err.message}`));
          return;
        }

        const files: RemoteFile[] = list.map((entry) => {
          const isDir = !!(entry.attrs.mode && (entry.attrs.mode & 0o40000));
          return {
            path: `${targetPath}/${entry.filename}`,
            name: entry.filename,
            size: entry.attrs.size ?? 0,
            isDirectory: isDir,
            modifiedAt: new Date((entry.attrs.mtime ?? 0) * 1000),
          };
        });

        resolve(files);
      });
    });
  }

  /**
   * Download a single file via SFTP.
   * Creates parent directories on the local side as needed.
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    await mkdir(dirname(localPath), { recursive: true });
    await this.ssh.getFile(localPath, remotePath);
  }

  /**
   * Download all files belonging to a document (by UUID).
   * Matches {uuid}.* files and a {uuid}/ directory.
   * Returns the list of local paths that were downloaded.
   */
  async downloadDocument(documentId: string, localDir: string): Promise<string[]> {
    const allFiles = await this.listFiles();
    const matching = allFiles.filter(
      (f) => f.name === documentId || f.name.startsWith(`${documentId}.`)
    );

    const downloaded: string[] = [];

    for (const remote of matching) {
      if (remote.isDirectory) {
        // Download all files inside the sub-directory
        const subFiles = await this.listFiles(remote.path);
        for (const sub of subFiles) {
          const localPath = `${localDir}/${documentId}/${sub.name}`;
          await this.downloadFile(sub.path, localPath);
          downloaded.push(localPath);
        }
      } else {
        const localPath = `${localDir}/${remote.name}`;
        await this.downloadFile(remote.path, localPath);
        downloaded.push(localPath);
      }
    }

    return downloaded;
  }

  /**
   * List unique document UUIDs in the documents path.
   * Each document may appear as {uuid}.metadata, {uuid}.content, {uuid}/, etc.
   */
  async listDocumentIds(): Promise<string[]> {
    const files = await this.listFiles();
    const ids = new Set<string>();

    for (const f of files) {
      const match = UUID_RE.exec(f.name);
      if (match) {
        ids.add(match[1]);
      }
    }

    return Array.from(ids).sort();
  }

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  /**
   * Run a shell command on the device.
   * Returns stdout, stderr, and the exit code.
   */
  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const result = await this.ssh.execCommand(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code ?? 0,
    };
  }

  /**
   * Read device information: model, firmware version, serial number.
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const [modelRes, firmwareRes, serialRes] = await Promise.all([
      this.executeCommand('cat /sys/devices/soc0/machine 2>/dev/null || echo unknown'),
      this.executeCommand(
        'cat /etc/remarkable/update.conf 2>/dev/null || cat /etc/version 2>/dev/null || echo unknown'
      ),
      this.executeCommand(
        'cat /sys/devices/soc0/serial_number 2>/dev/null || echo unknown'
      ),
    ]);

    // Extract firmware version from update.conf (format: SERVER_VERSION=x.x.x.x)
    const firmwareRaw = firmwareRes.stdout.trim();
    const firmwareMatch = firmwareRaw.match(/SERVER_VERSION=([^\s]+)/);
    const firmware = firmwareMatch ? firmwareMatch[1] : firmwareRaw;

    return {
      model: modelRes.stdout.trim(),
      firmware,
      serial: serialRes.stdout.trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Change monitoring
  // ---------------------------------------------------------------------------

  /**
   * Poll for file changes every intervalMs (default 5000ms).
   * Calls the provided callback with the list of changed document IDs.
   * Returns a cleanup function that stops the polling.
   */
  async watchForChanges(
    callback: (changedIds: string[]) => void,
    intervalMs: number = 5_000
  ): Promise<() => void> {
    // Build the initial snapshot
    let snapshot = await this._buildSnapshot();
    let running = true;

    const poll = async (): Promise<void> => {
      if (!running) return;

      try {
        const current = await this._buildSnapshot();
        const changedIds = new Set<string>();

        // Detect new or modified files
        for (const [key, entry] of current) {
          const prev = snapshot.get(key);
          if (!prev || prev.mtime !== entry.mtime || prev.size !== entry.size) {
            const match = UUID_RE.exec(key);
            if (match) changedIds.add(match[1]);
          }
        }

        if (changedIds.size > 0) {
          callback(Array.from(changedIds));
        }

        snapshot = current;
      } catch {
        // Swallow errors during polling — connection may be temporarily lost
      }

      if (running) {
        setTimeout(() => { void poll(); }, intervalMs);
      }
    };

    setTimeout(() => { void poll(); }, intervalMs);

    return () => {
      running = false;
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _buildSnapshot(): Promise<Map<string, { mtime: number; size: number }>> {
    const files = await this.listFiles();
    const map = new Map<string, { mtime: number; size: number }>();
    for (const f of files) {
      map.set(f.name, { mtime: f.modifiedAt.getTime(), size: f.size });
    }
    return map;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
