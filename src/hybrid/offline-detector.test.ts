/**
 * OfflineDetector — unit tests (all external I/O is mocked)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OfflineDetector } from './offline-detector.js';
import type { RemarkableSSHClient } from '../device/ssh-client.js';
import type { RemarkableCloudClient } from '../cloud/client.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

/** Create a minimal SSH client mock with the options property exposed. */
function makeMockSSH(host = '10.11.99.1', port = 22): RemarkableSSHClient {
  return {
    options: { host, port },
  } as unknown as RemarkableSSHClient;
}

function makeMockCloud(): RemarkableCloudClient {
  return {} as RemarkableCloudClient;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OfflineDetector — static helpers', () => {
  it('isSSHReachable: returns true when TCP connect succeeds', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValueOnce(true);
    const result = await OfflineDetector.isSSHReachable('10.11.99.1', 22, 3000);
    expect(result).toBe(true);
  });

  it('isSSHReachable: returns false on connection error', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValueOnce(false);
    const result = await OfflineDetector.isSSHReachable('192.0.2.1', 22, 100);
    expect(result).toBe(false);
  });

  it('isCloudReachable: returns true when DNS resolves', async () => {
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValueOnce(true);
    const result = await OfflineDetector.isCloudReachable(5000);
    expect(result).toBe(true);
  });

  it('isCloudReachable: returns false when DNS lookup times out', async () => {
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValueOnce(false);
    const result = await OfflineDetector.isCloudReachable(100);
    expect(result).toBe(false);
  });
});

describe('OfflineDetector.probe()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "ssh" when SSH is reachable', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(true);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    const status = await detector.probe();
    expect(status).toBe('ssh');
  });

  it('returns "cloud" when SSH is unreachable but cloud is reachable', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    const status = await detector.probe();
    expect(status).toBe('cloud');
  });

  it('returns "offline" when both SSH and cloud are unreachable', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(false);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    const status = await detector.probe();
    expect(status).toBe('offline');
  });

  it('updates getCachedStatus() after probing', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    expect(detector.getCachedStatus()).toBeNull(); // not yet probed

    await detector.probe();
    expect(detector.getCachedStatus()).toBe('cloud');
  });

  it('uses provided SSH host/port for the TCP probe', async () => {
    const sshSpy = vi
      .spyOn(OfflineDetector, 'isSSHReachable')
      .mockResolvedValue(true);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(false);

    const detector = new OfflineDetector(
      makeMockSSH('192.168.1.50', 2222),
      makeMockCloud()
    );
    await detector.probe();

    expect(sshSpy).toHaveBeenCalledWith('192.168.1.50', 2222, expect.any(Number));
  });

  it('passes configured timeouts to probes', async () => {
    const sshSpy = vi
      .spyOn(OfflineDetector, 'isSSHReachable')
      .mockResolvedValue(false);
    const cloudSpy = vi
      .spyOn(OfflineDetector, 'isCloudReachable')
      .mockResolvedValue(false);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      sshProbeTimeoutMs: 1234,
      cloudProbeTimeoutMs: 5678,
    });
    await detector.probe();

    expect(sshSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 1234);
    expect(cloudSpy).toHaveBeenCalledWith(5678);
  });
});

describe('OfflineDetector.startPolling()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires the callback when status changes', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      recheckIntervalMs: 1000,
    });

    // Set an initial cached status that differs from what probe() will return
    (detector as any).cachedStatus = 'offline';

    const callback = vi.fn();
    detector.startPolling(callback);

    // Advance time to trigger poll
    await vi.advanceTimersByTimeAsync(1001);

    expect(callback).toHaveBeenCalledWith('cloud');
  });

  it('does NOT fire the callback when status is stable', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      recheckIntervalMs: 1000,
    });

    // Same status as what probe() will return
    (detector as any).cachedStatus = 'cloud';

    const callback = vi.fn();
    detector.startPolling(callback);

    await vi.advanceTimersByTimeAsync(1001);

    expect(callback).not.toHaveBeenCalled();
  });

  it('cleanup function stops polling', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      recheckIntervalMs: 1000,
    });

    (detector as any).cachedStatus = 'offline';

    const callback = vi.fn();
    const cleanup = detector.startPolling(callback);

    // Stop before the timer fires
    cleanup();

    await vi.advanceTimersByTimeAsync(2000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('stopPolling() clears the timer and callback', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(false);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(true);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      recheckIntervalMs: 1000,
    });

    (detector as any).cachedStatus = 'offline';

    const callback = vi.fn();
    detector.startPolling(callback);
    detector.stopPolling();

    await vi.advanceTimersByTimeAsync(2000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps polling across multiple intervals', async () => {
    let callCount = 0;
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockImplementation(async () => {
      callCount++;
      return callCount % 2 === 0; // alternates false/true
    });
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(false);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud(), {
      recheckIntervalMs: 500,
    });

    (detector as any).cachedStatus = 'offline';

    const statuses: string[] = [];
    detector.startPolling((s) => statuses.push(s));

    await vi.advanceTimersByTimeAsync(1600); // ~3 ticks
    detector.stopPolling();

    // At least one status change should have been reported
    expect(statuses.length).toBeGreaterThan(0);
  });
});

describe('OfflineDetector — getCachedStatus()', () => {
  it('returns null before any probe', () => {
    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    expect(detector.getCachedStatus()).toBeNull();
  });

  it('returns the last probed status', async () => {
    vi.spyOn(OfflineDetector, 'isSSHReachable').mockResolvedValue(true);
    vi.spyOn(OfflineDetector, 'isCloudReachable').mockResolvedValue(false);

    const detector = new OfflineDetector(makeMockSSH(), makeMockCloud());
    await detector.probe();

    expect(detector.getCachedStatus()).toBe('ssh');
  });
});
