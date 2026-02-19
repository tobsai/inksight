/**
 * InkSight Memory Monitor — Phase 7.1
 *
 * Lightweight wrapper around Node.js process.memoryUsage() for
 * tracking heap usage and issuing warnings when memory is high.
 */

export interface MemorySnapshot {
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  timestamp: number;
}

const BYTES_PER_MB = 1024 * 1024;

export class MemoryMonitor {
  /**
   * Take a snapshot of the current memory usage.
   */
  snapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      heapUsedMb: mem.heapUsed / BYTES_PER_MB,
      heapTotalMb: mem.heapTotal / BYTES_PER_MB,
      externalMb: mem.external / BYTES_PER_MB,
      timestamp: Date.now(),
    };
  }

  /**
   * Returns true if current heap usage exceeds thresholdMb.
   */
  isUnderPressure(thresholdMb: number): boolean {
    const snap = this.snapshot();
    return snap.heapUsedMb > thresholdMb;
  }

  /**
   * Log memory stats to console if heap usage is above threshold.
   */
  warnIfHigh(thresholdMb: number, label?: string): void {
    const snap = this.snapshot();
    if (snap.heapUsedMb > thresholdMb) {
      const prefix = label ? `[${label}] ` : '';
      console.warn(
        `${prefix}Memory warning: heapUsed=${snap.heapUsedMb.toFixed(1)}MB ` +
        `heapTotal=${snap.heapTotalMb.toFixed(1)}MB ` +
        `external=${snap.externalMb.toFixed(1)}MB ` +
        `(threshold: ${thresholdMb}MB)`
      );
    }
  }
}
