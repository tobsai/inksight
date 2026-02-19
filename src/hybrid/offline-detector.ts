/**
 * OfflineDetector — lightweight connectivity probes for hybrid mode.
 *
 * Uses raw TCP (net module) for SSH reachability and a DNS lookup for
 * cloud reachability. No actual authentication is performed during probes.
 */

import * as net from 'net';
import * as dns from 'dns/promises';
import type { RemarkableSSHClient } from '../device/ssh-client.js';
import type { RemarkableCloudClient } from '../cloud/client.js';

/** Hostname used to verify general internet / cloud connectivity. */
const CLOUD_CHECK_HOST = 'remarkable.com';

/**
 * Current access channel:
 *  - 'ssh'     — reMarkable device reachable directly via SSH
 *  - 'cloud'   — reMarkable Cloud API reachable (internet available)
 *  - 'offline' — neither is accessible
 */
export type ConnectionStatus = 'ssh' | 'cloud' | 'offline';

export interface OfflineDetectorOptions {
  /** Timeout for SSH TCP probe. Default: 3000 ms */
  sshProbeTimeoutMs?: number;
  /** Timeout for cloud DNS check. Default: 5000 ms */
  cloudProbeTimeoutMs?: number;
  /** How often to re-probe when polling is active. Default: 30000 ms */
  recheckIntervalMs?: number;
}

export class OfflineDetector {
  private ssh: RemarkableSSHClient;
  private cloud: RemarkableCloudClient;
  private sshProbeTimeoutMs: number;
  private cloudProbeTimeoutMs: number;
  private recheckIntervalMs: number;

  private cachedStatus: ConnectionStatus | null = null;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingCallback: ((status: ConnectionStatus) => void) | null = null;

  constructor(
    ssh: RemarkableSSHClient,
    cloud: RemarkableCloudClient,
    options?: OfflineDetectorOptions
  ) {
    this.ssh = ssh;
    this.cloud = cloud;
    this.sshProbeTimeoutMs = options?.sshProbeTimeoutMs ?? 3_000;
    this.cloudProbeTimeoutMs = options?.cloudProbeTimeoutMs ?? 5_000;
    this.recheckIntervalMs = options?.recheckIntervalMs ?? 30_000;
  }

  /**
   * Quick non-blocking probe of SSH and Cloud connectivity.
   *
   * SSH: TCP port reachability only — no authentication.
   * Cloud: DNS lookup of the reMarkable hostname.
   *
   * Updates the cached status and returns the result.
   */
  async probe(): Promise<ConnectionStatus> {
    // Access the SSH connection options via the internal options object.
    const sshOptions = (this.ssh as any).options as {
      host: string;
      port: number;
    } | undefined;

    const sshHost = sshOptions?.host ?? '10.11.99.1';
    const sshPort = sshOptions?.port ?? 22;

    const [sshReachable, cloudReachable] = await Promise.all([
      OfflineDetector.isSSHReachable(sshHost, sshPort, this.sshProbeTimeoutMs),
      OfflineDetector.isCloudReachable(this.cloudProbeTimeoutMs),
    ]);

    let status: ConnectionStatus;
    if (sshReachable) {
      status = 'ssh';
    } else if (cloudReachable) {
      status = 'cloud';
    } else {
      status = 'offline';
    }

    this.cachedStatus = status;
    return status;
  }

  /**
   * Start polling connectivity every `recheckIntervalMs`. The callback is
   * invoked only when the status *changes* from the previous probe.
   *
   * @returns A cleanup function that stops polling.
   */
  startPolling(onStatusChange: (status: ConnectionStatus) => void): () => void {
    this.pollingCallback = onStatusChange;
    this.scheduleNextPoll();
    return () => this.stopPolling();
  }

  /** Stop the polling loop. */
  stopPolling(): void {
    if (this.pollingTimer !== null) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.pollingCallback = null;
  }

  /** Return the last known status without probing. Null if never probed. */
  getCachedStatus(): ConnectionStatus | null {
    return this.cachedStatus;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private scheduleNextPoll(): void {
    this.pollingTimer = setTimeout(() => {
      void this.runPoll();
    }, this.recheckIntervalMs);
  }

  private async runPoll(): Promise<void> {
    const previousStatus = this.cachedStatus;
    const newStatus = await this.probe();

    if (newStatus !== previousStatus && this.pollingCallback) {
      this.pollingCallback(newStatus);
    }

    // Schedule the next poll only if polling is still active
    if (this.pollingCallback !== null) {
      this.scheduleNextPoll();
    }
  }

  // ── Static helpers (also useful standalone) ────────────────────────────────

  /**
   * Attempt a raw TCP connect to `host:port` within `timeoutMs`.
   * Returns true if the connection succeeds; false on error or timeout.
   */
  static isSSHReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      let settled = false;

      const finish = (result: boolean): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        finish(true);
      });

      socket.once('error', () => {
        clearTimeout(timer);
        finish(false);
      });

      socket.once('timeout', () => {
        clearTimeout(timer);
        finish(false);
      });
    });
  }

  /**
   * Verify internet / cloud reachability by resolving the reMarkable hostname.
   * Returns true if the hostname resolves within `timeoutMs`.
   */
  static async isCloudReachable(timeoutMs: number = 5_000): Promise<boolean> {
    const raceTimeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    );

    const dnsCheck = dns
      .lookup(CLOUD_CHECK_HOST)
      .then(() => true)
      .catch(() => false);

    return Promise.race([dnsCheck, raceTimeout]);
  }

  /**
   * Stateless parallel probe: checks SSH reachability and cloud reachability
   * simultaneously without needing an OfflineDetector instance.
   *
   * @param host       - SSH host to probe (e.g. '10.11.99.1')
   * @param port       - SSH port (default 22)
   * @param timeoutMs  - Timeout for the SSH TCP probe in ms (default 3000)
   * @returns Object with `ssh` and `cloud` boolean flags.
   */
  static async detectMode(
    host: string,
    port: number = 22,
    timeoutMs: number = 3_000,
  ): Promise<{ ssh: boolean; cloud: boolean }> {
    const [ssh, cloud] = await Promise.all([
      OfflineDetector.isSSHReachable(host, port, timeoutMs),
      OfflineDetector.isCloudReachable(timeoutMs),
    ]);
    return { ssh, cloud };
  }
}
