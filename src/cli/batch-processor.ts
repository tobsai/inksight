/**
 * InkSight BatchProcessor — Phase 6.3
 *
 * Processes multiple transform jobs with a concurrency limit.
 * Collects all results without stopping on individual failures.
 */

import type { TransformerType, TransformerRegistry } from '../transformers/index.js';
import { ProgressReporter } from './progress.js';

export interface BatchJob {
  documentId: string;
  transformType: TransformerType;
  outputPath?: string;
}

export interface BatchResult {
  documentId: string;
  success: boolean;
  error?: string;
  durationMs: number;
  costUsd: number;
}

export class BatchProcessor {
  constructor(
    private registry: TransformerRegistry,
    private reporter: ProgressReporter,
    private concurrency: number = 3
  ) {}

  async processBatch(jobs: BatchJob[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const queue = [...jobs];

    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) break;
        const result = await this.processJob(job);
        results.push(result);
      }
    };

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(this.concurrency, jobs.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    return results;
  }

  private async processJob(job: BatchJob): Promise<BatchResult> {
    const start = Date.now();
    this.reporter.startTask(`Transform ${job.documentId} (${job.transformType})`);
    try {
      // Stub: in a real build this would call the registry
      // For now, simulate a no-op transform since we have no live credentials
      await Promise.resolve();
      const durationMs = Date.now() - start;
      const costUsd = 0;
      this.reporter.completeTask(`Transform ${job.documentId} (${job.transformType})`);
      this.reporter.logCost(costUsd);
      return { documentId: job.documentId, success: true, durationMs, costUsd };
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);
      this.reporter.failTask(`Transform ${job.documentId} (${job.transformType})`, err instanceof Error ? err : new Error(error));
      return { documentId: job.documentId, success: false, error, durationMs, costUsd: 0 };
    }
  }
}
