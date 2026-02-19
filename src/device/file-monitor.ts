/**
 * FileMonitor — Real-time change detection for the reMarkable device.
 *
 * Strategy:
 *   1. If useInotify=true (default), attempt to use inotifywait on the device.
 *      The reMarkable runs Linux and inotifywait is bundled in most firmware
 *      versions. Events are streamed line-by-line via executeCommand.
 *   2. If inotifywait is not available, fall back to polling via SFTP listing
 *      (same mtime/size comparison as ssh-client watchForChanges).
 *   3. Rapid changes to the same document within debounceMs are coalesced into
 *      a single callback invocation (affectedFiles are merged across events).
 *   4. If autoReconnect=true, a dropped SSH connection triggers a 5-second
 *      wait followed by a reconnect attempt.
 *   5. FileMonitor extends EventEmitter and emits 'change', 'synced', 'error'
 *      events in addition to calling the optional start(handler) callback.
 */

import { EventEmitter } from 'events';
import { RemarkableSSHClient } from './ssh-client.js';
import type { DocumentChange, SyncResult } from './types.js';

export type ChangeHandler = (changes: DocumentChange[]) => void | Promise<void>;

/** Minimal interface for the sync engine — avoids circular import */
export interface SyncEngineInterface {
  fullSync(): Promise<SyncResult>;
  incrementalSync(changes: DocumentChange[]): Promise<SyncResult>;
}

export interface FileMonitorOptions {
  /** Fallback polling interval in ms. Default: 3000 */
  pollIntervalMs?: number;
  /** Try inotifywait before polling. Default: true */
  useInotify?: boolean;
  /** Debounce window in ms — rapid events for the same doc collapse to one. Default: 500 */
  debounceMs?: number;
  /** Reconnect SSH automatically if the connection drops. Default: true */
  autoReconnect?: boolean;
  /** Optional sync engine — when provided, start() runs fullSync first, then
   *  incrementalSync on each batch of changes. Emits 'synced' events. */
  syncEngine?: SyncEngineInterface;
}

/** Map from event string prefix → DocumentChange changeType */
const EVENT_TYPE_MAP: Record<string, DocumentChange['changeType']> = {
  CREATE: 'created',
  CLOSE_WRITE: 'modified',
  MOVED_TO: 'created',
  DELETE: 'deleted',
  MOVED_FROM: 'deleted',
};

// UUID pattern at the start of a filename / path segment
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * Extract the document UUID from a filename / path emitted by inotifywait.
 * Examples:
 *   "abc123-def.metadata"  → "abc123-def"
 *   "abc123-def/"          → "abc123-def"
 *   "/full/path/abc123.rm" → "abc123"
 */
function extractDocumentId(filePath: string): string | null {
  const basename = filePath.split('/').pop() ?? filePath;
  const match = UUID_RE.exec(basename);
  return match ? match[1] : null;
}

/**
 * Parse a single inotifywait output line.
 * Format with `--format '%w%f %e'`:
 *   "/home/root/.local/share/remarkable/xochitl/abc-def.metadata CLOSE_WRITE,CLOSE"
 * Or with `--format '%e %f'`:
 *   "CREATE,ISDIR somedir"
 * We emit lines in '%w%f %e' format (path first, then events).
 *
 * Returns null if the line can't be parsed or has no UUID.
 */
export function parseInotifyLine(line: string): DocumentChange | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Split on the last space to separate path from event flags
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return null;

  const filePath = trimmed.slice(0, lastSpace);
  const events = trimmed.slice(lastSpace + 1);

  const docId = extractDocumentId(filePath);
  if (!docId) return null;

  // events looks like "CLOSE_WRITE,CLOSE" or "CREATE,ISDIR"
  const eventParts = events.split(',');
  let changeType: DocumentChange['changeType'] | undefined;

  for (const part of eventParts) {
    const mapped = EVENT_TYPE_MAP[part.toUpperCase()];
    if (mapped) {
      changeType = mapped;
      break;
    }
  }

  if (!changeType) return null;

  return {
    documentId: docId,
    changedAt: new Date(),
    changeType,
    affectedFiles: [filePath],
  };
}

export class FileMonitor extends EventEmitter {
  private client: RemarkableSSHClient;
  private pollIntervalMs: number;
  private useInotify: boolean;
  private debounceMs: number;
  private autoReconnect: boolean;
  private syncEngine?: SyncEngineInterface;

  private running: boolean = false;
  private stopPollFn: (() => void) | null = null;

  // Debounce state: pending changes per docId
  private pendingChanges: Map<string, DocumentChange> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private handler: ChangeHandler | null = null;

  constructor(client: RemarkableSSHClient, options?: FileMonitorOptions) {
    super();
    this.client = client;
    this.pollIntervalMs = options?.pollIntervalMs ?? 3_000;
    this.useInotify = options?.useInotify ?? true;
    this.debounceMs = options?.debounceMs ?? 500;
    this.autoReconnect = options?.autoReconnect ?? true;
    this.syncEngine = options?.syncEngine;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start monitoring. Optionally registers `handler` as the change callback.
   * If a syncEngine was provided, performs a full initial sync first, then
   * runs incrementalSync on each batch of changes.
   * Idempotent — calling start() while already running is a no-op.
   */
  async start(handler?: ChangeHandler): Promise<void> {
    if (this.running) return;

    this.running = true;
    if (handler) this.handler = handler;

    // If sync engine provided: full sync first, then start watching
    if (this.syncEngine) {
      try {
        const result = await this.syncEngine.fullSync();
        this.emit('synced', result);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }

    await this._startMonitoring();
  }

  /**
   * Stop monitoring and clean up all resources.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.handler = null;

    if (this.stopPollFn) {
      this.stopPollFn();
      this.stopPollFn = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingChanges.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async _startMonitoring(): Promise<void> {
    if (!this.running) return;

    if (this.useInotify) {
      const hasInotify = await this._checkInotify();
      if (hasInotify) {
        await this._startInotify();
        return;
      }
    }

    // Fall back to polling
    this._startPolling();
  }

  /** Check whether inotifywait is available on the device */
  async _checkInotify(): Promise<boolean> {
    try {
      const result = await this.client.executeCommand('which inotifywait');
      return result.code === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Start inotifywait in monitor mode.
   * We use --format '%w%f %e' so the full path and event are on each line.
   *
   * node-ssh's execCommand buffers output and waits for the command to exit,
   * which won't happen in monitor mode. We therefore use a hybrid approach:
   * launch inotifywait in background on the device, check a temp log file
   * periodically for new lines.
   */
  private async _startInotify(): Promise<void> {
    const logFile = `/tmp/inksight-inotify-$$.log`;
    const docsPath = RemarkableSSHClient.DOCUMENTS_PATH;
    const cmd = `inotifywait -m -r -e close_write,create,delete,moved_from,moved_to --format '%w%f %e' '${docsPath}' > '${logFile}' 2>&1 & echo $!`;

    let pid: string;
    try {
      const res = await this.client.executeCommand(cmd);
      pid = res.stdout.trim();
      if (!pid) throw new Error('No PID returned');
    } catch {
      // Fall back to polling if we can't start inotifywait
      this._startPolling();
      return;
    }

    let lastLine = 0;
    let inotifyRunning = true;

    const poll = async (): Promise<void> => {
      if (!this.running || !inotifyRunning) return;

      try {
        // Read new lines from the log file
        const result = await this.client.executeCommand(
          `tail -n +${lastLine + 1} '${logFile}' 2>/dev/null`
        );
        const lines = result.stdout.split('\n').filter((l) => l.trim().length > 0);

        if (lines.length > 0) {
          lastLine += lines.length;
          for (const line of lines) {
            const change = parseInotifyLine(line);
            if (change) {
              this._enqueueChange(change);
            }
          }
        }
      } catch {
        // If the inotify poll fails, fall through to reconnect logic
        inotifyRunning = false;
        await this._handleDisconnect(pid, logFile);
        return;
      }

      if (this.running) {
        const timer = setTimeout(() => {
          void poll();
        }, this.pollIntervalMs);
        this.stopPollFn = () => {
          clearTimeout(timer);
          inotifyRunning = false;
          void this.client.executeCommand(`kill ${pid} 2>/dev/null; rm -f '${logFile}'`).catch(() => {});
        };
      }
    };

    this.stopPollFn = () => {
      inotifyRunning = false;
      void this.client.executeCommand(`kill ${pid} 2>/dev/null; rm -f '${logFile}'`).catch(() => {});
    };

    void poll();
  }

  /** Start SFTP polling fallback */
  private _startPolling(): void {
    let snapshot: Map<string, { mtime: number; size: number }> = new Map();
    let initialized = false;
    let pollingActive = true;

    const buildSnapshot = async (): Promise<Map<string, { mtime: number; size: number }>> => {
      const files = await this.client.listFiles();
      const map = new Map<string, { mtime: number; size: number }>();
      for (const f of files) {
        map.set(f.name, { mtime: f.modifiedAt.getTime(), size: f.size });
      }
      return map;
    };

    const poll = async (): Promise<void> => {
      if (!this.running || !pollingActive) return;

      try {
        const current = await buildSnapshot();

        if (initialized) {
          // Detect new / modified
          for (const [name, entry] of current) {
            const prev = snapshot.get(name);
            const docId = extractDocumentId(name);
            if (!docId) continue;

            if (!prev) {
              this._enqueueChange({
                documentId: docId,
                changedAt: new Date(),
                changeType: 'created',
                affectedFiles: [name],
              });
            } else if (prev.mtime !== entry.mtime || prev.size !== entry.size) {
              this._enqueueChange({
                documentId: docId,
                changedAt: new Date(),
                changeType: 'modified',
                affectedFiles: [name],
              });
            }
          }

          // Detect deleted
          for (const [name] of snapshot) {
            if (!current.has(name)) {
              const docId = extractDocumentId(name);
              if (docId) {
                this._enqueueChange({
                  documentId: docId,
                  changedAt: new Date(),
                  changeType: 'deleted',
                  affectedFiles: [name],
                });
              }
            }
          }
        }

        snapshot = current;
        initialized = true;
      } catch {
        // Possible disconnect — handle reconnect
        if (this.autoReconnect && this.running) {
          pollingActive = false;
          await this._reconnect();
          return;
        }
      }

      if (this.running && pollingActive) {
        const timer = setTimeout(() => {
          void poll();
        }, this.pollIntervalMs);

        this.stopPollFn = () => {
          pollingActive = false;
          clearTimeout(timer);
        };
      }
    };

    this.stopPollFn = () => {
      pollingActive = false;
    };

    void poll();
  }

  private async _handleDisconnect(pid: string, logFile: string): Promise<void> {
    // Attempt cleanup
    await this.client.executeCommand(`kill ${pid} 2>/dev/null; rm -f '${logFile}'`).catch(() => {});
    if (this.autoReconnect && this.running) {
      await this._reconnect();
    }
  }

  private async _reconnect(): Promise<void> {
    if (!this.running) return;
    await delay(5_000);
    if (!this.running) return;

    try {
      await this.client.connect();
      // Restart monitoring after reconnect
      await this._startMonitoring();
    } catch {
      // Reconnect failed — try again
      if (this.running) {
        await this._reconnect();
      }
    }
  }

  /**
   * Add a change to the debounce buffer.
   * If another change for the same docId arrives within debounceMs, the
   * affectedFiles are merged and the changeType is updated to the latest.
   */
  private _enqueueChange(change: DocumentChange): void {
    const existing = this.pendingChanges.get(change.documentId);
    if (existing) {
      // Merge affectedFiles, keep latest changeType
      this.pendingChanges.set(change.documentId, {
        ...change,
        affectedFiles: [...new Set([...existing.affectedFiles, ...change.affectedFiles])],
      });
    } else {
      this.pendingChanges.set(change.documentId, change);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this._flushChanges();
    }, this.debounceMs);
  }

  private async _flushChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.debounceTimer = null;

    // Emit 'change' event for EventEmitter consumers
    this.emit('change', changes);

    // Call legacy callback handler if registered
    if (this.handler) {
      void Promise.resolve(this.handler(changes)).catch(() => {});
    }

    // If sync engine provided, run incremental sync and emit 'synced'
    if (this.syncEngine && this.running) {
      try {
        const result = await this.syncEngine.incrementalSync(changes);
        this.emit('synced', result);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
