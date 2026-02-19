/**
 * Text Recognition Transformer — Phase 4.1
 *
 * Production-quality text extraction from reMarkable documents.
 * Detects paragraphs, lists, word count, and reading time.
 * Supports plain/markdown/structured output and multi-format export.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { DownloadedDocument } from '../cloud/types.js';
import { detectLanguage, type LanguageDetectionResult } from '../recognition/language-detector.js';

export interface TextTransformOptions {
  /** Detect paragraph boundaries (default: true) */
  detectParagraphs?: boolean;
  /** Detect bullet/numbered lists (default: true) */
  detectLists?: boolean;
  /** Preserve original line breaks (default: false) */
  preserveLineBreaks?: boolean;
  /** Output format (default: 'markdown') */
  outputFormat?: 'plain' | 'markdown' | 'structured';
  /** Language hint for AI provider */
  language?: string;
}

export interface ListBlock {
  type: 'bullet' | 'numbered' | 'checklist';
  items: string[];
}

export interface TextTransformResult {
  /** Formatted output text */
  text: string;
  /** Detected paragraphs */
  paragraphs: string[];
  /** Detected list blocks */
  lists: ListBlock[];
  wordCount: number;
  estimatedReadingTimeMin: number;
  language: LanguageDetectionResult;
  confidence: number;
  costUsd: number;
  durationMs: number;
}

const DEFAULTS: Required<TextTransformOptions> = {
  detectParagraphs: true,
  detectLists: true,
  preserveLineBreaks: false,
  outputFormat: 'markdown',
  language: '',
};

export class TextTransformer {
  private options: Required<TextTransformOptions>;

  constructor(
    private renderer: DocumentRenderer,
    private registry: AIProviderRegistry,
    options?: TextTransformOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  async transform(
    document: DownloadedDocument,
    pageIndex?: number
  ): Promise<TextTransformResult> {
    const start = Date.now();

    const pageIndices =
      pageIndex !== undefined
        ? [pageIndex]
        : Array.from({ length: document.pages.length }, (_, i) => i);

    let totalCost = 0;
    let totalConfidence = 0;
    const pageTexts: string[] = [];

    for (const idx of pageIndices) {
      const { png, mimeType } = await this.renderer.renderForAI(document, idx);
      const result = await this.registry.transform({
        imageData: png,
        mimeType,
        transformType: 'text',
        options: this.options.language ? { language: this.options.language } : undefined,
      });

      totalCost += result.costUsd;
      totalConfidence += 0.85;
      pageTexts.push(result.content);
    }

    const rawText = pageTexts.join('\n\n');
    const paragraphs = this.options.detectParagraphs ? this.detectParagraphs(rawText) : [rawText];
    const lists = this.options.detectLists ? this.detectLists(rawText) : [];

    const formattedText = this.formatOutput(rawText, pageTexts, this.options.outputFormat);
    const wordCount = this.countWords(formattedText);
    const estimatedReadingTimeMin = Math.max(1, Math.ceil(wordCount / 200));
    const language = detectLanguage(rawText);
    const confidence = totalConfidence / pageIndices.length;

    return {
      text: formattedText,
      paragraphs,
      lists,
      wordCount,
      estimatedReadingTimeMin,
      language,
      confidence,
      costUsd: totalCost,
      durationMs: Date.now() - start,
    };
  }

  async exportTo(
    result: TextTransformResult,
    format: 'txt' | 'md' | 'docx-ready'
  ): Promise<string> {
    switch (format) {
      case 'txt':
        return result.text
          .replace(/#{1,6}\s+/g, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .trim();

      case 'md':
        return result.text;

      case 'docx-ready': {
        const front = `---\nWord count: ${result.wordCount}\nReading time: ~${result.estimatedReadingTimeMin} min\nLanguage: ${result.language.language}\n---\n\n`;
        return front + result.text;
      }

      default:
        return result.text;
    }
  }

  private detectParagraphs(text: string): string[] {
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  private detectLists(text: string): ListBlock[] {
    const lines = text.split('\n');
    const blocks: ListBlock[] = [];
    let currentBlock: ListBlock | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (/^-\s+\[[ xX]\]/.test(trimmed)) {
        const item = trimmed.replace(/^-\s+\[[ xX]\]\s*/, '');
        if (currentBlock?.type === 'checklist') {
          currentBlock.items.push(item);
        } else {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: 'checklist', items: [item] };
        }
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const item = trimmed.replace(/^[-*]\s+/, '');
        if (currentBlock?.type === 'bullet') {
          currentBlock.items.push(item);
        } else {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: 'bullet', items: [item] };
        }
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const item = trimmed.replace(/^\d+\.\s+/, '');
        if (currentBlock?.type === 'numbered') {
          currentBlock.items.push(item);
        } else {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: 'numbered', items: [item] };
        }
        continue;
      }

      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    }

    if (currentBlock) blocks.push(currentBlock);
    return blocks;
  }

  private formatOutput(rawText: string, pageTexts: string[], format: 'plain' | 'markdown' | 'structured'): string {
    switch (format) {
      case 'plain':
        return rawText;
      case 'markdown':
        if (pageTexts.length === 1) return pageTexts[0];
        return pageTexts.map((text, i) => `## Page ${i + 1}\n\n${text}`).join('\n\n');
      case 'structured':
        return JSON.stringify({ pages: pageTexts.map((text, i) => ({ page: i + 1, content: text })) }, null, 2);
      default:
        return rawText;
    }
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }
}
