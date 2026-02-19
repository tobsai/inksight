/**
 * Text Recognizer — Phase 3.3
 *
 * Connects DocumentRenderer + AIProviderRegistry into a complete OCR pipeline.
 * Renders .rm pages to PNG, sends to AI, returns structured recognition results.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { AIProvider } from '../ai/provider.js';
import type { DownloadedDocument } from '../cloud/types.js';

export interface RecognitionOptions {
  /** Which AI provider to use. Default: 'auto' */
  provider?: 'openai' | 'anthropic' | 'auto';
  /** Language hint for multilingual docs (e.g. 'en', 'fr', 'he') */
  language?: string;
  /** Which pages to process (default: all) */
  pageIndices?: number[];
  /** Image scale for rendering (default: 1.0, not currently used directly but passed to renderForAI) */
  renderScale?: number;
  /** Max parallel pages to process (default: 3) */
  maxConcurrentPages?: number;
}

export interface RecognizedPage {
  pageIndex: number;
  /** Extracted text */
  text: string;
  /** 0.0–1.0 confidence estimate */
  confidence: number;
  provider: string;
  model: string;
  costUsd: number;
  durationMs: number;
  wordCount: number;
}

export interface RecognitionResult {
  documentId?: string;
  pages: RecognizedPage[];
  /** All pages joined with \n\n---\n\n */
  fullText: string;
  totalCostUsd: number;
  totalDurationMs: number;
  provider: string;
}

export class TextRecognizer {
  constructor(
    private renderer: DocumentRenderer,
    private aiRegistry: AIProviderRegistry,
    private defaultOptions?: RecognitionOptions
  ) {}

  /**
   * Recognize text on a single page.
   */
  async recognizePage(
    document: DownloadedDocument,
    pageIndex: number,
    options?: RecognitionOptions
  ): Promise<RecognizedPage> {
    const opts = { ...this.defaultOptions, ...options };
    const provider = (opts.provider ?? 'auto') as AIProvider;

    const startMs = Date.now();

    // 1. Render page to PNG
    const { png, mimeType } = await this.renderer.renderForAI(document, pageIndex);

    // 2. Submit to AI
    const result = await this.aiRegistry.transform(
      {
        imageData: png,
        mimeType,
        transformType: 'text',
        options: opts.language ? { language: opts.language } : undefined,
      },
      provider
    );

    const durationMs = Date.now() - startMs;
    const text = result.content;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

    return {
      pageIndex,
      text,
      confidence: this.estimateConfidence(text),
      provider: result.provider,
      model: result.model,
      costUsd: result.costUsd,
      durationMs,
      wordCount,
    };
  }

  /**
   * Recognize text for an entire document (or selected pages).
   * Processes pages in batches of maxConcurrentPages.
   */
  async recognizeDocument(
    document: DownloadedDocument,
    options?: RecognitionOptions
  ): Promise<RecognitionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const maxConcurrent = opts.maxConcurrentPages ?? 3;

    const totalPages = document.pages.length;
    const indices = opts.pageIndices
      ? opts.pageIndices.filter((i) => i >= 0 && i < totalPages)
      : Array.from({ length: totalPages }, (_, i) => i);

    const startMs = Date.now();
    const recognizedPages: RecognizedPage[] = [];

    // Process in batches
    for (let batch = 0; batch < indices.length; batch += maxConcurrent) {
      const batchIndices = indices.slice(batch, batch + maxConcurrent);
      const batchResults = await Promise.all(
        batchIndices.map((idx) => this.recognizePage(document, idx, opts))
      );
      recognizedPages.push(...batchResults);
    }

    // Sort by page index (batches may complete out of order conceptually)
    recognizedPages.sort((a, b) => a.pageIndex - b.pageIndex);

    const fullText = recognizedPages.map((p) => p.text).join('\n\n---\n\n');
    const totalCostUsd = recognizedPages.reduce((s, p) => s + p.costUsd, 0);
    const totalDurationMs = Date.now() - startMs;

    // Use provider from first page, or 'auto' if none
    const provider = recognizedPages[0]?.provider ?? 'auto';

    return {
      documentId: document.metadata.visibleName,
      pages: recognizedPages,
      fullText,
      totalCostUsd,
      totalDurationMs,
      provider,
    };
  }

  /**
   * Heuristic confidence estimate based on word count.
   *
   * - Empty text → 0.0
   * - 1–10 words → 0.3
   * - 11–50 words → 0.7
   * - 51+ words → 0.9
   */
  estimateConfidence(text: string): number {
    const trimmed = text.trim();
    if (trimmed === '') return 0.0;

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 10) return 0.3;
    if (wordCount <= 50) return 0.7;
    return 0.9;
  }
}
