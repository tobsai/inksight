/**
 * InkSight Performance Profiler — Phase 7.1
 *
 * Lightweight timing utility for profiling async operations.
 * Collects named timing entries and provides summary statistics.
 */

export interface TimingEntry {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export class PerformanceProfiler {
  private entries: TimingEntry[] = [];

  /**
   * Start timing a named operation.
   * Returns a stop function that records the timing when called.
   */
  start(name: string, metadata?: Record<string, unknown>): () => void {
    const startMs = Date.now();
    return () => {
      const endMs = Date.now();
      this.entries.push({
        name,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        metadata,
      });
    };
  }

  /**
   * Get all recorded timing entries.
   */
  getEntries(): TimingEntry[] {
    return [...this.entries];
  }

  /**
   * Get a summary grouped by operation name.
   */
  getSummary(): Record<string, { count: number; totalMs: number; avgMs: number; maxMs: number }> {
    const summary: Record<string, { count: number; totalMs: number; avgMs: number; maxMs: number }> = {};

    for (const entry of this.entries) {
      if (!summary[entry.name]) {
        summary[entry.name] = { count: 0, totalMs: 0, avgMs: 0, maxMs: 0 };
      }
      const s = summary[entry.name];
      s.count++;
      s.totalMs += entry.durationMs;
      if (entry.durationMs > s.maxMs) s.maxMs = entry.durationMs;
    }

    // Compute averages
    for (const name of Object.keys(summary)) {
      const s = summary[name];
      s.avgMs = s.count > 0 ? s.totalMs / s.count : 0;
    }

    return summary;
  }

  /**
   * Reset all recorded entries.
   */
  reset(): void {
    this.entries = [];
  }

  /**
   * Convenience: time an async operation and return its result.
   */
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const stop = this.start(name, metadata);
    try {
      const result = await fn();
      return result;
    } finally {
      stop();
    }
  }
}
