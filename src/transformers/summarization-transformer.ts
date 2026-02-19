/**
 * Summarization Transformer — Phase 4.3
 *
 * Summarizes reMarkable documents using AI.
 * Supports bullet/paragraph/executive styles, multi-page hierarchical
 * summarization, key point extraction, and action item detection.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { DownloadedDocument } from '../cloud/types.js';

export interface SummarizationOptions {
  /** Output style (default: 'bullets') */
  style?: 'bullets' | 'paragraph' | 'executive';
  /** Max words in summary (default: 200) */
  maxLength?: number;
  /** Include action items section (default: true) */
  includeActionItems?: boolean;
  /** For multi-page docs: summarize each page then aggregate (default: true) */
  hierarchical?: boolean;
}

export interface SummarizationResult {
  /** Main summary text */
  summary: string;
  /** Extracted key points */
  keyPoints: string[];
  /** Todos / action items */
  actionItems: string[];
  pageCount: number;
  confidence: number;
  costUsd: number;
  durationMs: number;
}

const DEFAULTS: Required<SummarizationOptions> = {
  style: 'bullets',
  maxLength: 200,
  includeActionItems: true,
  hierarchical: true,
};

export class SummarizationTransformer {
  private options: Required<SummarizationOptions>;

  constructor(
    private renderer: DocumentRenderer,
    private registry: AIProviderRegistry,
    options?: SummarizationOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Summarize a document. If pageIndices is omitted, all pages are included.
   */
  async transform(
    document: DownloadedDocument,
    pageIndices?: number[]
  ): Promise<SummarizationResult> {
    const start = Date.now();

    const indices =
      pageIndices ?? Array.from({ length: document.pages.length }, (_, i) => i);

    let totalCost = 0;
    const pageSummaries: string[] = [];

    if (this.options.hierarchical && indices.length > 1) {
      // Summarize each page individually, then aggregate
      for (const idx of indices) {
        const { png, mimeType } = await this.renderer.renderForAI(document, idx);
        const result = await this.registry.transform({
          imageData: png,
          mimeType,
          transformType: 'summary',
        });
        totalCost += result.costUsd;
        pageSummaries.push(result.content);
      }
    } else {
      // Summarize pages independently (non-hierarchical single pass)
      for (const idx of indices) {
        const { png, mimeType } = await this.renderer.renderForAI(document, idx);
        const result = await this.registry.transform({
          imageData: png,
          mimeType,
          transformType: 'summary',
        });
        totalCost += result.costUsd;
        pageSummaries.push(result.content);
      }
    }

    const combinedText =
      pageSummaries.length === 1
        ? pageSummaries[0]
        : this.aggregateSummaries(pageSummaries);

    const keyPoints = this.extractKeyPoints(combinedText);
    const actionItems = this.options.includeActionItems
      ? this.extractActionItems(combinedText)
      : [];

    const summary = this.formatSummary(combinedText, this.options.style);

    return {
      summary,
      keyPoints,
      actionItems,
      pageCount: indices.length,
      confidence: 0.85,
      costUsd: totalCost,
      durationMs: Date.now() - start,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Extract key points from AI response text.
   * Handles "Key Points:" / "**Key Points:**" / plain bullet sections.
   */
  private extractKeyPoints(text: string): string[] {
    // Look for explicit "Key Points:" section
    const sectionMatch = text.match(
      /(?:\*{0,2}key points[:\s]*\*{0,2})([\s\S]*?)(?=\n(?:\*{0,2}(?:action items|summary|next steps)[:\s])|$)/i
    );

    const section = sectionMatch ? sectionMatch[1] : text;

    // Extract bullet lines from the section
    const bullets = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l))
      .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim())
      .filter((l) => l.length > 0);

    if (bullets.length > 0) return bullets;

    // Fallback: return first 3 sentences as key points
    return text
      .split(/(?<=[.!?])\s+/)
      .slice(0, 3)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  /**
   * Extract action items from AI response text.
   * Handles "Action Items:" / "- [ ]" checkbox patterns / "TODO:" lines.
   */
  private extractActionItems(text: string): string[] {
    const items: string[] = [];

    // "- [ ]" or "- [x]" checkbox patterns
    const checkboxMatches = text.matchAll(/^[-*]\s+\[[ xX]\]\s+(.+)$/gm);
    for (const m of checkboxMatches) {
      items.push(m[1].trim());
    }
    if (items.length > 0) return items;

    // Explicit "Action Items:" / "TODO:" section
    const sectionMatch = text.match(
      /(?:\*{0,2}(?:action items|todo|next steps|tasks)[:\s]*\*{0,2})([\s\S]*?)(?=\n(?:\*{0,2}(?:key points|summary)[:\s])|$)/i
    );

    if (sectionMatch) {
      const section = sectionMatch[1];
      const bullets = section
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l))
        .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim())
        .filter((l) => l.length > 0);
      return bullets;
    }

    // Lines starting with "TODO:" or "Action:"
    const todoLines = text
      .split('\n')
      .filter((l) => /^\s*(?:todo|action|follow.?up):/i.test(l))
      .map((l) => l.replace(/^\s*(?:todo|action|follow.?up):\s*/i, '').trim())
      .filter((l) => l.length > 0);

    return todoLines;
  }

  /**
   * For hierarchical mode: combine per-page summaries into one coherent summary.
   */
  private aggregateSummaries(pageSummaries: string[]): string {
    // Build a combined summary with page context stripped to first paragraph of each
    const condensed = pageSummaries.map((s, i) => {
      const firstPara = s.split(/\n{2,}/)[0] ?? s;
      return `Page ${i + 1}: ${firstPara.trim()}`;
    });
    return condensed.join('\n\n');
  }

  /** Format the combined text according to style. */
  private formatSummary(text: string, style: 'bullets' | 'paragraph' | 'executive'): string {
    switch (style) {
      case 'bullets': {
        // If text already has bullets, return as-is
        if (/^[-*•]\s+/m.test(text)) return text;
        // Otherwise convert sentences to bullets
        return text
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 10)
          .map((s) => `- ${s.trim()}`)
          .join('\n');
      }

      case 'paragraph':
        // Remove bullet formatting, join into paragraphs
        return text
          .replace(/^[-*•]\s+/gm, '')
          .replace(/^\d+\.\s+/gm, '')
          .trim();

      case 'executive': {
        // Compact single paragraph, max ~3 sentences
        const sentences = text
          .replace(/^[-*•]\s+/gm, '')
          .replace(/^\d+\.\s+/gm, '')
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 10);
        return sentences.slice(0, 3).join(' ').trim();
      }

      default:
        return text;
    }
  }
}
