/**
 * InkSight Export Templates — Phase 6.2
 *
 * Defines how transform results are serialised to files.
 * Each template targets a specific output format or destination app.
 */

import type { ExtractedMetadata } from '../transformers/metadata-transformer.js';

/**
 * Generic result container passed to every template function.
 * Uses loose typing so callers can pass any RunAllResult subset.
 */
export interface TransformResult {
  text?: { text: string; wordCount?: number; paragraphs?: string[] };
  diagram?: { output: string; detectedType?: string };
  summary?: { summary: string; keyPoints?: string[]; actionItems?: string[] };
  metadata?: ExtractedMetadata;
  totalCostUsd?: number;
  totalDurationMs?: number;
}

export interface ExportTemplate {
  name: string;
  extension: 'md' | 'txt' | 'json' | 'html';
  template: (result: TransformResult, metadata: ExtractedMetadata) => string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

// ─── Templates ───────────────────────────────────────────────────────────────

export const EXPORT_TEMPLATES: Record<string, ExportTemplate> = {
  'obsidian-note': {
    name: 'Obsidian Note',
    extension: 'md',
    template: (result, metadata) => {
      const tags = metadata.tags?.length ? metadata.tags.map((t) => `  - ${t}`).join('\n') : '  - inksight';
      const wordCount = result.text?.wordCount ?? 0;
      const topics = metadata.topics?.join(', ') ?? '';
      const lines: string[] = [
        '---',
        `date: ${isoDate()}`,
        `word_count: ${wordCount}`,
        `topics: ${topics}`,
        'tags:',
        tags,
        '---',
        '',
      ];

      if (result.text?.text) {
        lines.push('## Notes', '', result.text.text, '');
      }
      if (result.summary?.keyPoints?.length) {
        lines.push('## Key Points', '', bulletList(result.summary.keyPoints), '');
      }
      if (result.summary?.actionItems?.length) {
        lines.push('## Action Items', '', result.summary.actionItems.map((a) => `- [ ] ${a}`).join('\n'), '');
      }
      if (result.diagram?.output) {
        lines.push('## Diagram', '', '```mermaid', result.diagram.output, '```', '');
      }
      if (metadata.people?.length) {
        lines.push('## People', '', bulletList(metadata.people), '');
      }
      return lines.join('\n');
    },
  },

  'notion-import': {
    name: 'Notion Import',
    extension: 'md',
    template: (result, metadata) => {
      const lines: string[] = [];

      // Notion uses flat Markdown — no frontmatter (it imports as a page)
      lines.push(`# InkSight Note — ${isoDate()}`, '');

      if (metadata.topics?.length) {
        lines.push(`**Topics:** ${metadata.topics.join(', ')}`, '');
      }
      if (metadata.tags?.length) {
        lines.push(`**Tags:** ${metadata.tags.join(', ')}`, '');
      }
      lines.push('---', '');

      if (result.text?.text) {
        lines.push('## Content', '', result.text.text, '');
      }
      if (result.summary?.summary) {
        lines.push('## Summary', '', result.summary.summary, '');
      }
      if (result.summary?.actionItems?.length) {
        lines.push('## Action Items', '');
        result.summary.actionItems.forEach((a) => lines.push(`- [ ] ${a}`));
        lines.push('');
      }
      if (result.diagram?.output) {
        lines.push('## Diagram', '', '```', result.diagram.output, '```', '');
      }
      if (metadata.people?.length) {
        lines.push(`**People mentioned:** ${metadata.people.join(', ')}`, '');
      }
      return lines.join('\n');
    },
  },

  'plain-text': {
    name: 'Plain Text',
    extension: 'txt',
    template: (result, metadata) => {
      const lines: string[] = [];
      lines.push(`InkSight Export — ${isoDate()}`, '='.repeat(40), '');

      if (result.text?.text) {
        lines.push('CONTENT', '-'.repeat(20), result.text.text, '');
      }
      if (result.summary?.summary) {
        lines.push('SUMMARY', '-'.repeat(20), result.summary.summary, '');
      }
      if (result.summary?.actionItems?.length) {
        lines.push('ACTION ITEMS', '-'.repeat(20));
        result.summary.actionItems.forEach((a) => lines.push(`[ ] ${a}`));
        lines.push('');
      }
      if (metadata.tags?.length) {
        lines.push(`Tags: ${metadata.tags.join(', ')}`, '');
      }
      return lines.join('\n');
    },
  },

  'json-export': {
    name: 'JSON Export',
    extension: 'json',
    template: (result, metadata) => {
      const payload = {
        exportedAt: new Date().toISOString(),
        result,
        metadata,
      };
      return JSON.stringify(payload, null, 2);
    },
  },
} as const;

/** Return a template by name, or undefined. */
export function getExportTemplate(name: string): ExportTemplate | undefined {
  return EXPORT_TEMPLATES[name] as ExportTemplate | undefined;
}

/** List all template names. */
export function listExportTemplates(): string[] {
  return Object.keys(EXPORT_TEMPLATES);
}
