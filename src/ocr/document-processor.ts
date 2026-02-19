/**
 * Document Processor — Phase 3.3
 *
 * High-level convenience class that orchestrates TextRecognizer + DiagramAnalyzer
 * to produce fully-structured output from a DownloadedDocument.
 */

import type { DownloadedDocument } from '../cloud/types.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { TextRecognizer, RecognizedPage } from './text-recognizer.js';
import type { DiagramAnalyzer, DiagramAnalysisResult } from './diagram-analyzer.js';

export type ProcessingMode = 'text' | 'diagram' | 'summary' | 'auto';

export interface ProcessingResult {
  mode: ProcessingMode;
  pages: Array<RecognizedPage | DiagramAnalysisResult>;
  /** Populated when mode includes summary */
  summary?: string;
  /** Extracted action items (if requested) */
  actionItems?: string[];
  metadata?: {
    dates: string[];
    people: string[];
    topics: string[];
  };
  totalCostUsd: number;
  totalDurationMs: number;
}

export class DocumentProcessor {
  constructor(
    private recognizer: TextRecognizer,
    private analyzer: DiagramAnalyzer,
    private aiRegistry: AIProviderRegistry
  ) {}

  /**
   * Process a document according to the specified mode.
   *
   * - 'auto':    text recognition → summarize if >1 page
   * - 'text':    text recognition only
   * - 'diagram': diagram analysis only
   * - 'summary': text recognition → summarize full text
   */
  async process(
    document: DownloadedDocument,
    mode: ProcessingMode = 'auto'
  ): Promise<ProcessingResult> {
    const startMs = Date.now();
    let totalCostUsd = 0;

    if (mode === 'text') {
      const recognition = await this.recognizer.recognizeDocument(document);
      totalCostUsd = recognition.totalCostUsd;
      return {
        mode,
        pages: recognition.pages,
        totalCostUsd,
        totalDurationMs: Date.now() - startMs,
      };
    }

    if (mode === 'diagram') {
      const diagrams = await this.analyzer.analyzeDocument(document);
      totalCostUsd = diagrams.reduce((s, d) => s + d.costUsd, 0);
      return {
        mode,
        pages: diagrams,
        totalCostUsd,
        totalDurationMs: Date.now() - startMs,
      };
    }

    // 'auto' or 'summary' — run text recognition first
    const recognition = await this.recognizer.recognizeDocument(document);
    totalCostUsd += recognition.totalCostUsd;

    const shouldSummarize =
      mode === 'summary' || (mode === 'auto' && recognition.pages.length > 1);

    let summary: string | undefined;

    if (shouldSummarize && recognition.fullText.trim() !== '') {
      // Create a synthetic single-byte buffer; summary prompt doesn't need an image
      // — use a 1×1 blank PNG (minimum valid PNG)
      const blankPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      );

      // Encode the full text as context in a translate-style request.
      // Since the summary prompt is defined for image input, we use a workaround:
      // pass a minimal image and embed the text in the language option field isn't ideal.
      // Instead, we directly call an available provider with a 'summary' transform.
      try {
        const summaryResult = await this.aiRegistry.transform({
          imageData: blankPng,
          mimeType: 'image/png',
          transformType: 'summary',
          options: { language: recognition.fullText },
        });
        summary = summaryResult.content;
        totalCostUsd += summaryResult.costUsd;
      } catch {
        // Non-fatal: summary is best-effort
        summary = undefined;
      }
    }

    return {
      mode,
      pages: recognition.pages,
      summary,
      totalCostUsd,
      totalDurationMs: Date.now() - startMs,
    };
  }

  /**
   * Extract action items from text using the 'action-items' AI transform.
   * Parses Markdown checklist output into a string array.
   */
  async extractActionItems(text: string): Promise<string[]> {
    const blankPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    const result = await this.aiRegistry.transform({
      imageData: blankPng,
      mimeType: 'image/png',
      transformType: 'action-items',
      options: { language: text },
    }, undefined);

    return this._parseChecklistItems(result.content);
  }

  /**
   * Extract structured metadata from text.
   * Returns dates, people, and topics.
   */
  async extractMetadata(text: string): Promise<ProcessingResult['metadata']> {
    const blankPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    const result = await this.aiRegistry.transform({
      imageData: blankPng,
      mimeType: 'image/png',
      transformType: 'translate',
      options: {
        language: text,
      },
    });

    return this._parseMetadata(result.content);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Parse Markdown checklist lines into plain strings.
   *
   * Input:
   *   - [ ] Buy groceries
   *   - [x] Call dentist
   *
   * Output: ['Buy groceries', 'Call dentist']
   */
  private _parseChecklistItems(markdown: string): string[] {
    const items: string[] = [];
    for (const line of markdown.split('\n')) {
      const match = line.match(/^[-*]\s*\[[ xX]\]\s*(.+)$/);
      if (match) {
        items.push(match[1].trim());
      }
    }
    return items;
  }

  /**
   * Parse JSON metadata from AI response.
   * Expected format:
   * {
   *   "dates": [...],
   *   "people": [...],
   *   "topics": [...]
   * }
   *
   * Falls back to empty arrays if JSON is missing/malformed.
   */
  private _parseMetadata(content: string): ProcessingResult['metadata'] {
    const empty = { dates: [] as string[], people: [] as string[], topics: [] as string[] };

    if (!content.trim()) return empty;

    // Try to extract JSON block from markdown fences or raw JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ||
                      content.match(/```\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) return empty;

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        dates: Array.isArray(parsed.dates) ? parsed.dates.map(String) : [],
        people: Array.isArray(parsed.people) ? parsed.people.map(String) : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : [],
      };
    } catch {
      return empty;
    }
  }
}
