/**
 * Export Manager — Phase 4.1
 *
 * Multi-format export for TextTransformResult.
 * Supports: txt, md, json, html
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { TextTransformResult } from './text-transformer.js';

export type ExportFormat = 'txt' | 'md' | 'json' | 'html';

export interface ExportOptions {
  /** Target format */
  format: ExportFormat;
  /** File path to write to */
  outputPath: string;
  /** Prepend YAML frontmatter (default: false) */
  includeMetadata?: boolean;
  /** Document title for frontmatter */
  title?: string;
}

// ─── ExportManager ────────────────────────────────────────────────────────────

export class ExportManager {
  /**
   * Export a TextTransformResult to a file in the specified format.
   *
   * - txt  → plainText
   * - md   → markdown with optional YAML frontmatter
   * - json → full TextTransformResult as JSON
   * - html → converted HTML
   */
  async export(result: TextTransformResult, options: ExportOptions): Promise<void> {
    const { format, outputPath, includeMetadata = false, title } = options;

    let content: string;

    switch (format) {
      case 'txt':
        content = result.plainText;
        break;

      case 'md': {
        let md = result.markdown;
        if (includeMetadata) {
          const frontmatter = this._buildFrontmatter({
            title: title ?? 'Untitled',
            wordCount: result.wordCount,
            pageCount: result.pageCount,
            language: result.language,
            confidence: result.confidence,
          });
          md = frontmatter + md;
        }
        content = md;
        break;
      }

      case 'json':
        content = JSON.stringify(result, null, 2);
        break;

      case 'html':
        content = this.toHTML(result);
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    // Ensure output directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Convert a TextTransformResult to basic HTML.
   *
   * Simple regex-based conversion — no external dependencies.
   * Converts: ## → <h2>, **bold** → <strong>, *italic* → <em>,
   *           - item → <li> (wrapped in <ul>), paragraphs → <p>
   */
  toHTML(result: TextTransformResult): string {
    const title = result.markdown.split('\n')[0]?.replace(/^#+\s*/, '') ?? 'Document';

    const body = this._markdownToHTML(result.markdown);

    return `<!DOCTYPE html>
<html lang="${result.language || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this._escapeHTML(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Convert a markdown string to basic HTML. */
  private _markdownToHTML(markdown: string): string {
    const lines = markdown.split('\n');
    const output: string[] = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headings: # ## ###
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        if (inList) {
          output.push('</ul>');
          inList = false;
        }
        const level = headingMatch[1].length;
        const text = this._inlineMarkdown(headingMatch[2]);
        output.push(`<h${level}>${text}</h${level}>`);
        continue;
      }

      // List items: - item
      const listMatch = line.match(/^[-*]\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          output.push('<ul>');
          inList = true;
        }
        output.push(`<li>${this._inlineMarkdown(listMatch[1])}</li>`);
        continue;
      }

      // Code blocks: ```
      if (line.trim() === '```' || line.trim().startsWith('```')) {
        if (inList) {
          output.push('</ul>');
          inList = false;
        }
        // Collect until closing ```
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '```') {
          codeLines.push(lines[i]);
          i++;
        }
        output.push(`<pre><code>${this._escapeHTML(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      // Empty line — close list if open
      if (!line.trim()) {
        if (inList) {
          output.push('</ul>');
          inList = false;
        }
        continue;
      }

      // Paragraph
      if (inList) {
        output.push('</ul>');
        inList = false;
      }
      output.push(`<p>${this._inlineMarkdown(line)}</p>`);
    }

    if (inList) {
      output.push('</ul>');
    }

    return output.join('\n');
  }

  /** Convert inline markdown (**bold**, *italic*, `code`) to HTML. */
  private _inlineMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  /** HTML-escape a string. */
  private _escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Build YAML frontmatter block. */
  private _buildFrontmatter(meta: Record<string, unknown>): string {
    const lines = Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `---\n${lines.join('\n')}\n---\n\n`;
  }
}
