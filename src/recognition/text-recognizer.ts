/**
 * Text Recognizer — Phase 3.3
 *
 * Wires DocumentRenderer → AIProviderRegistry to extract text from
 * handwritten pages, with confidence estimation and cost tracking.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { DownloadedDocument } from '../cloud/types.js';
import type { AIProvider } from '../ai/provider.js';
import { detectLanguage } from './language-detector.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecognitionResult {
  pageIndex: number;
  /** Extracted text content */
  text: string;
  /** 0.0–1.0, estimated from response characteristics */
  confidence: number;
  /** Which AI provider was used */
  provider: string;
  model: string;
  transformType: 'text' | 'diagram' | 'summary' | 'action-items';
  costUsd: number;
  durationMs: number;
  wordCount: number;
  /** Detected language ISO 639-1 code, if identifiable */
  language?: string;
}

export interface DocumentRecognitionResult {
  documentId: string;
  pages: RecognitionResult[];
  /** All page texts joined with '\n\n---\n\n' */
  fullText: string;
  totalCostUsd: number;
  totalDurationMs: number;
  pageCount: number;
  successfulPages: number;
  averageConfidence: number;
}

export interface RecognitionOptions {
  /** Transform type to apply. Default: 'text' */
  transformType?: 'text' | 'diagram' | 'summary' | 'action-items';
  /** AI provider preference. Default: 'auto' */
  preferredProvider?: 'openai' | 'anthropic' | 'auto';
  /** Target image size KB passed to renderForAI. Default: 500 */
  targetSizeKB?: number;
  /** Skip pages whose estimated confidence falls below this. Default: 0 */
  confidenceThreshold?: number;
}

// ─── Confidence estimation ────────────────────────────────────────────────────

const LOW_CONFIDENCE_PHRASES = ['unable to read', 'unclear', 'cannot', 'can\'t read', 'illegible'];

/**
 * Estimate recognition confidence from the raw AI response text.
 *
 * Tiers:
 *   - Contains low-confidence phrase → 0.1
 *   - Very short (< 20 chars) → 0.3
 *   - Long and detailed (≥ 200 chars) → 0.9
 *   - Normal → scaled 0.7–0.85 based on length
 */
export function estimateConfidence(text: string): number {
  if (!text || text.trim().length === 0) return 0.3;

  const lower = text.toLowerCase();
  for (const phrase of LOW_CONFIDENCE_PHRASES) {
    if (lower.includes(phrase)) return 0.1;
  }

  const len = text.trim().length;

  if (len < 20) return 0.3;
  if (len >= 200) return 0.9;

  // Scale between 0.7 and 0.85 for lengths 20–199
  const ratio = (len - 20) / (200 - 20); // 0.0 → 1.0
  return 0.7 + ratio * 0.15;
}

/**
 * Count words in a string.
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ─── TextRecognizer ───────────────────────────────────────────────────────────

export class TextRecognizer {
  private defaultOptions: Required<RecognitionOptions>;

  constructor(
    private renderer: DocumentRenderer,
    private registry: AIProviderRegistry,
    options?: RecognitionOptions
  ) {
    this.defaultOptions = {
      transformType: options?.transformType ?? 'text',
      preferredProvider: options?.preferredProvider ?? 'auto',
      targetSizeKB: options?.targetSizeKB ?? 500,
      confidenceThreshold: options?.confidenceThreshold ?? 0,
    };
  }

  /**
   * Recognize handwriting on a single page.
   * 1. Renders the page to PNG via DocumentRenderer
   * 2. Submits to AI via AIProviderRegistry.transform()
   * 3. Estimates confidence and detects language
   */
  async recognizePage(
    document: DownloadedDocument,
    pageIndex: number,
    options?: RecognitionOptions
  ): Promise<RecognitionResult> {
    const opts = this._mergeOptions(options);

    // 1. Render
    const { png, mimeType } = await this.renderer.renderForAI(
      document,
      pageIndex,
      opts.targetSizeKB
    );

    // 2. Transform via AI
    const preferredProvider: AIProvider =
      opts.preferredProvider === 'openai' || opts.preferredProvider === 'anthropic'
        ? opts.preferredProvider
        : 'auto';

    const result = await this.registry.transform(
      {
        imageData: png,
        mimeType,
        transformType: opts.transformType,
      },
      preferredProvider
    );

    // 3. Post-process
    const text = result.content;
    const confidence = estimateConfidence(text);
    const langResult = detectLanguage(text);

    return {
      pageIndex,
      text,
      confidence,
      provider: result.provider,
      model: result.model,
      transformType: opts.transformType,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      wordCount: countWords(text),
      language: langResult.language !== 'unknown' ? langResult.language : undefined,
    };
  }

  /**
   * Recognize all pages of a document sequentially (to avoid rate limits).
   * Pages below `confidenceThreshold` are skipped from the result.
   */
  async recognizeAllPages(
    document: DownloadedDocument,
    options?: RecognitionOptions
  ): Promise<RecognitionResult[]> {
    const opts = this._mergeOptions(options);
    const results: RecognitionResult[] = [];

    for (let i = 0; i < document.pages.length; i++) {
      const pageResult = await this.recognizePage(document, i, options);

      if (pageResult.confidence >= opts.confidenceThreshold) {
        results.push(pageResult);
      }
    }

    return results;
  }

  /**
   * Recognize all pages and assemble into a DocumentRecognitionResult.
   */
  async recognizeDocument(
    document: DownloadedDocument,
    options?: RecognitionOptions
  ): Promise<DocumentRecognitionResult> {
    const pages = await this.recognizeAllPages(document, options);

    const fullText = pages.map((p) => p.text).join('\n\n---\n\n');
    const totalCostUsd = pages.reduce((sum, p) => sum + p.costUsd, 0);
    const totalDurationMs = pages.reduce((sum, p) => sum + p.durationMs, 0);
    const averageConfidence =
      pages.length > 0
        ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
        : 0;

    return {
      documentId: document.metadata.visibleName,
      pages,
      fullText,
      totalCostUsd,
      totalDurationMs,
      pageCount: document.pages.length,
      successfulPages: pages.length,
      averageConfidence,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _mergeOptions(options?: RecognitionOptions): Required<RecognitionOptions> {
    return {
      transformType: options?.transformType ?? this.defaultOptions.transformType,
      preferredProvider: options?.preferredProvider ?? this.defaultOptions.preferredProvider,
      targetSizeKB: options?.targetSizeKB ?? this.defaultOptions.targetSizeKB,
      confidenceThreshold:
        options?.confidenceThreshold ?? this.defaultOptions.confidenceThreshold,
    };
  }
}
