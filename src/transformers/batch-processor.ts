/**
 * Batch Processor — Phase 4.1
 *
 * Process multiple documents through TextTransformer,
 * with configurable concurrency and error handling.
 */

import type { DownloadedDocument } from '../cloud/types.js';
import type { TextTransformer, TextTransformOptions, TextTransformResult } from './text-transformer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchOptions {
  /** Max concurrent transforms (default: 1 — sequential, avoids rate limits) */
  maxConcurrent?: number;
  /** Continue on error (default: true) */
  continueOnError?: boolean;
  /** Called after each document completes or fails */
  progressCallback?: (processed: number, total: number, documentId: string) => void;
}

export interface BatchResult {
  successful: Array<{ documentId: string; result: TextTransformResult }>;
  failed: Array<{ documentId: string; error: string }>;
  totalCostUsd: number;
  totalDurationMs: number;
}

// ─── BatchProcessor ──────────────────────────────────────────────────────────

export class BatchProcessor {
  constructor(private transformer: TextTransformer) {}

  /**
   * Process a batch of documents through the text transformer.
   *
   * Documents are processed in groups of `maxConcurrent` (default: 1 = sequential).
   * When `continueOnError` is true (default), failed documents are recorded in
   * `result.failed` and processing continues.
   */
  async processBatch(
    documents: DownloadedDocument[],
    transformOptions?: TextTransformOptions,
    batchOptions?: BatchOptions
  ): Promise<BatchResult> {
    const maxConcurrent = batchOptions?.maxConcurrent ?? 1;
    const continueOnError = batchOptions?.continueOnError ?? true;
    const progressCallback = batchOptions?.progressCallback;

    const startMs = Date.now();
    const successful: BatchResult['successful'] = [];
    const failed: BatchResult['failed'] = [];
    let processed = 0;
    const total = documents.length;

    // Process in batches of maxConcurrent
    for (let i = 0; i < documents.length; i += maxConcurrent) {
      const batch = documents.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (doc) => {
        const documentId = doc.metadata.visibleName;
        try {
          const result = await this.transformer.transform(doc, transformOptions);
          successful.push({ documentId, result });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          failed.push({ documentId, error });
          if (!continueOnError) {
            throw new Error(`Batch aborted: ${documentId} — ${error}`);
          }
        } finally {
          processed++;
          progressCallback?.(processed, total, documentId);
        }
      });

      await Promise.all(batchPromises);
    }

    const totalCostUsd = successful.reduce((sum, item) => sum + item.result.costUsd, 0);

    return {
      successful,
      failed,
      totalCostUsd,
      totalDurationMs: Date.now() - startMs,
    };
  }
}
