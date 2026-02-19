/**
 * Transformer Registry — Phase 4.5
 *
 * Central hub for running multiple transformers on a single document.
 * Supports selective execution via the `types` parameter.
 * Aggregates cost and duration across all transformers.
 */

import type { DownloadedDocument } from '../cloud/types.js';
import type { TextTransformer, TextTransformResult } from './text-transformer.js';
import type { DiagramTransformer, DiagramTransformResult } from './diagram-transformer.js';
import type {
  SummarizationTransformer,
  SummarizationResult,
} from './summarization-transformer.js';
import type { MetadataTransformer, ExtractedMetadata } from './metadata-transformer.js';

export type TransformerType = 'text' | 'diagram' | 'summary' | 'metadata';

export interface RunAllResult {
  text?: TextTransformResult;
  diagram?: DiagramTransformResult;
  summary?: SummarizationResult;
  metadata?: ExtractedMetadata;
  totalCostUsd: number;
  totalDurationMs: number;
}

const DEFAULT_TYPES: TransformerType[] = ['text', 'summary', 'metadata'];

export class TransformerRegistry {
  private textTransformer?: TextTransformer;
  private diagramTransformer?: DiagramTransformer;
  private summarizationTransformer?: SummarizationTransformer;
  private metadataTransformer?: MetadataTransformer;

  registerText(transformer: TextTransformer): void {
    this.textTransformer = transformer;
  }

  registerDiagram(transformer: DiagramTransformer): void {
    this.diagramTransformer = transformer;
  }

  registerSummarization(transformer: SummarizationTransformer): void {
    this.summarizationTransformer = transformer;
  }

  registerMetadata(transformer: MetadataTransformer): void {
    this.metadataTransformer = transformer;
  }

  /**
   * Run registered transformers on a document.
   *
   * @param document  The document to transform
   * @param types     Which transformers to run (default: ['text', 'summary', 'metadata'])
   *                  Pass ['diagram'] explicitly to run the diagram transformer on page 0.
   */
  async runAll(
    document: DownloadedDocument,
    types: TransformerType[] = DEFAULT_TYPES
  ): Promise<RunAllResult> {
    const overallStart = Date.now();
    const result: RunAllResult = { totalCostUsd: 0, totalDurationMs: 0 };

    const tasks: Promise<void>[] = [];

    if (types.includes('text') && this.textTransformer) {
      const t = this.textTransformer;
      tasks.push(
        t.transform(document).then((r) => {
          result.text = r;
          result.totalCostUsd += r.costUsd;
        })
      );
    }

    if (types.includes('diagram') && this.diagramTransformer) {
      const t = this.diagramTransformer;
      // Default to first page for diagram transformer
      tasks.push(
        t.transform(document, 0).then((r) => {
          result.diagram = r;
          result.totalCostUsd += r.costUsd;
        })
      );
    }

    if (types.includes('summary') && this.summarizationTransformer) {
      const t = this.summarizationTransformer;
      tasks.push(
        t.transform(document).then((r) => {
          result.summary = r;
          result.totalCostUsd += r.costUsd;
        })
      );
    }

    if (types.includes('metadata') && this.metadataTransformer) {
      const t = this.metadataTransformer;
      tasks.push(
        t.extract(document).then((r) => {
          result.metadata = r;
          // ExtractedMetadata has no costUsd — no-op
        })
      );
    }

    await Promise.all(tasks);

    result.totalDurationMs = Date.now() - overallStart;
    return result;
  }
}
