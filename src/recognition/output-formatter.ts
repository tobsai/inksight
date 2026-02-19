/**
 * Output Formatter — Phase 3.3
 *
 * Formats DocumentRecognitionResult / RecognitionResult into various
 * output formats: plain text, markdown, JSON, and docx-ready markdown.
 */

import type { DocumentRecognitionResult, RecognitionResult } from './text-recognizer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutputFormat = 'plain' | 'markdown' | 'json' | 'docx-ready';

export interface FormatterOptions {
  format: OutputFormat;
  /** Include page numbers, confidence scores, cost info. Default: false */
  includeMetadata?: boolean;
  /** Add separator between pages. Default: true */
  pageBreaks?: boolean;
}

// ─── OutputFormatter ──────────────────────────────────────────────────────────

export class OutputFormatter {
  /**
   * Format a full document recognition result.
   */
  format(result: DocumentRecognitionResult, options: FormatterOptions): string {
    const { format } = options;

    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    const pageBreaks = options.pageBreaks !== false; // default true

    switch (format) {
      case 'plain':
        return this._formatPlain(result, options, pageBreaks);
      case 'markdown':
        return this._formatMarkdown(result, options, pageBreaks);
      case 'docx-ready':
        return this._formatDocxReady(result, options, pageBreaks);
      default:
        return this._formatPlain(result, options, pageBreaks);
    }
  }

  /**
   * Format a single page recognition result.
   */
  formatPage(result: RecognitionResult, options: FormatterOptions): string {
    const { format, includeMetadata } = options;

    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    let output = '';

    switch (format) {
      case 'plain':
        output = result.text;
        if (includeMetadata) {
          output += `\n[Page ${result.pageIndex + 1} | confidence: ${(result.confidence * 100).toFixed(0)}%]`;
        }
        break;

      case 'markdown':
      case 'docx-ready': {
        const pageNum = result.pageIndex + 1;
        output = `# Page ${pageNum}\n\n${result.text}`;
        if (includeMetadata) {
          output += `\n\n*Confidence: ${(result.confidence * 100).toFixed(0)}% | Cost: $${result.costUsd.toFixed(4)} | Words: ${result.wordCount}*`;
        }
        break;
      }

      default:
        output = result.text;
    }

    return output;
  }

  // ─── Private format helpers ──────────────────────────────────────────────────

  private _formatPlain(
    result: DocumentRecognitionResult,
    options: FormatterOptions,
    pageBreaks: boolean
  ): string {
    const parts: string[] = [];

    for (const page of result.pages) {
      let section = page.text;
      if (options.includeMetadata) {
        section += `\n[Page ${page.pageIndex + 1} | confidence: ${(page.confidence * 100).toFixed(0)}%]`;
      }
      parts.push(section);
    }

    const separator = pageBreaks ? '\n\n---\n\n' : '\n\n';
    let output = parts.join(separator);

    if (options.includeMetadata) {
      output += `\n\n---\nTotal pages: ${result.pageCount} | Successful: ${result.successfulPages} | Cost: $${result.totalCostUsd.toFixed(4)}`;
    }

    return output;
  }

  private _formatMarkdown(
    result: DocumentRecognitionResult,
    options: FormatterOptions,
    pageBreaks: boolean
  ): string {
    const parts: string[] = [];

    if (options.includeMetadata) {
      parts.push(`# ${result.documentId}\n`);
      parts.push(
        `*${result.pageCount} pages | ${result.successfulPages} recognized | avg. confidence ${(result.averageConfidence * 100).toFixed(0)}% | cost $${result.totalCostUsd.toFixed(4)}*\n`
      );
    }

    for (const page of result.pages) {
      const pageNum = page.pageIndex + 1;
      let section = `## Page ${pageNum}\n\n${page.text}`;

      if (options.includeMetadata) {
        section += `\n\n> *Confidence: ${(page.confidence * 100).toFixed(0)}% | Words: ${page.wordCount}${page.language ? ` | Language: ${page.language}` : ''}*`;
      }

      parts.push(section);
    }

    const separator = pageBreaks ? '\n\n---\n\n' : '\n\n';
    return parts.join(separator);
  }

  private _formatDocxReady(
    result: DocumentRecognitionResult,
    options: FormatterOptions,
    pageBreaks: boolean
  ): string {
    // Clean markdown optimised for Pandoc conversion
    const parts: string[] = [];

    for (const page of result.pages) {
      const pageNum = page.pageIndex + 1;
      let section = `# Page ${pageNum}\n\n${page.text}`;

      if (options.includeMetadata) {
        section += `\n\n---\n*Page ${pageNum} — confidence ${(page.confidence * 100).toFixed(0)}% | $${page.costUsd.toFixed(4)}*`;
      }

      parts.push(section);
    }

    const separator = pageBreaks ? '\n\n' : '\n\n';
    return parts.join(separator);
  }
}
