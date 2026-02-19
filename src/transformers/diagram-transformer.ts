/**
 * Diagram Cleanup Transformer — Phase 4.2
 *
 * Analyzes a reMarkable page as a diagram and produces:
 * - Mermaid syntax (default)
 * - A plain-English description
 * - An SVG placeholder with detected elements
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { DownloadedDocument } from '../cloud/types.js';

export type DiagramOutputFormat = 'mermaid' | 'description' | 'svg-placeholder';

export interface DiagramTransformOptions {
  /** Output format (default: 'mermaid') */
  outputFormat?: DiagramOutputFormat;
  /** Diagram type hint (default: 'auto') */
  diagramType?: 'flowchart' | 'mindmap' | 'sequence' | 'er' | 'auto';
}

export interface DiagramTransformResult {
  /** Mermaid syntax, description text, or SVG placeholder */
  output: string;
  outputFormat: DiagramOutputFormat;
  /** What type of diagram was detected */
  detectedType: string;
  hasArrows: boolean;
  /** Node count for flowcharts/mindmaps */
  nodeCount?: number;
  confidence: number;
  costUsd: number;
  durationMs: number;
}

const DEFAULTS: Required<DiagramTransformOptions> = {
  outputFormat: 'mermaid',
  diagramType: 'auto',
};

export class DiagramTransformer {
  private options: Required<DiagramTransformOptions>;

  constructor(
    private renderer: DocumentRenderer,
    private registry: AIProviderRegistry,
    options?: DiagramTransformOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Transform a single page into a diagram representation.
   */
  async transform(
    document: DownloadedDocument,
    pageIndex: number
  ): Promise<DiagramTransformResult> {
    const start = Date.now();

    const { png, mimeType } = await this.renderer.renderForAI(document, pageIndex);
    const result = await this.registry.transform({
      imageData: png,
      mimeType,
      transformType: 'diagram',
    });

    const content = result.content;
    const detectedType = this.detectDiagramType(content);
    const hasArrows = this.detectArrows(content);
    const nodeCount = this.countNodes(content, detectedType);

    let output: string;
    switch (this.options.outputFormat) {
      case 'mermaid': {
        const extracted = this.extractMermaidBlock(content);
        output = extracted ?? this.generateMermaidFallback(content, detectedType);
        break;
      }
      case 'description':
        output = this.extractDescription(content);
        break;
      case 'svg-placeholder':
        output = this.generateSVGPlaceholder(detectedType, nodeCount);
        break;
      default:
        output = content;
    }

    return {
      output,
      outputFormat: this.options.outputFormat,
      detectedType,
      hasArrows,
      nodeCount,
      confidence: 0.8,
      costUsd: result.costUsd,
      durationMs: Date.now() - start,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Heuristic diagram type detection from AI response text. */
  private detectDiagramType(response: string): string {
    const lower = response.toLowerCase();

    // Check for explicit Mermaid keywords first
    if (/\bflowchart\b|\bgraph\s+[tblr]{1,2}\b/.test(lower)) return 'flowchart';
    if (/\bsequencediagram\b/.test(lower)) return 'sequence';
    if (/\bmindmap\b/.test(lower)) return 'mindmap';
    if (/\berdiagram\b|\bentity.relationship\b/.test(lower)) return 'er';

    // Structural keywords
    if (/\barrow\b|\bedge\b|\bconnect/.test(lower)) return 'flowchart';
    if (/\bnode\b|\bbox\b|\bshape\b/.test(lower)) return 'flowchart';
    if (/\bactor\b|\bmessage\b|\blifeline\b/.test(lower)) return 'sequence';
    if (/\btopic\b|\bbranch\b|\bcentral\b/.test(lower)) return 'mindmap';
    if (/\btable\b|\brelation\b|\bforeign key\b/.test(lower)) return 'er';

    return 'unknown';
  }

  /** Extract a ```mermaid ... ``` fenced code block from AI response. */
  private extractMermaidBlock(response: string): string | null {
    const match = response.match(/```mermaid\s*\n([\s\S]*?)```/i);
    return match ? match[1].trim() : null;
  }

  /** Check if response describes arrows/directed connections. */
  private detectArrows(response: string): boolean {
    return /-->|->|==>|=>|-->/i.test(response) ||
      /\barrow\b|\bdirected\b|\bpoints to\b/i.test(response);
  }

  /** Count nodes mentioned in response for applicable diagram types. */
  private countNodes(response: string, type: string): number | undefined {
    if (type !== 'flowchart' && type !== 'mindmap') return undefined;

    // Count Mermaid node definitions: A[...] or A(...) or A{...} patterns
    const mermaidNodes = response.match(/\b[A-Za-z_]\w*[\[({]/g) ?? [];
    if (mermaidNodes.length > 0) return mermaidNodes.length;

    // Count lines with "node" or "box" mentions
    const lines = response.split('\n').filter((l) =>
      /\bnode\b|\bbox\b|\bstep\b|\bprocess\b/i.test(l)
    );
    return lines.length > 0 ? lines.length : undefined;
  }

  /** Generate a minimal Mermaid diagram as fallback when no block found. */
  private generateMermaidFallback(content: string, type: string): string {
    switch (type) {
      case 'sequence':
        return `sequenceDiagram\n    Note over Diagram: ${this.firstSentence(content)}`;
      case 'mindmap':
        return `mindmap\n  root\n    ${this.firstSentence(content)}`;
      case 'er':
        return `erDiagram\n    %% ${this.firstSentence(content)}`;
      default:
        return `flowchart TD\n    A[${this.firstSentence(content)}]`;
    }
  }

  /** Extract plain-English description from AI response. */
  private extractDescription(content: string): string {
    // Remove any fenced code blocks
    return content
      .replace(/```[\s\S]*?```/g, '')
      .trim();
  }

  /** Generate an SVG placeholder indicating detected diagram type. */
  private generateSVGPlaceholder(type: string, nodeCount?: number): string {
    const label = nodeCount
      ? `${type} (${nodeCount} nodes)`
      : type;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">`,
      `  <rect width="400" height="200" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>`,
      `  <text x="200" y="100" text-anchor="middle" font-size="18" fill="#555">`,
      `    [Diagram: ${label}]`,
      `  </text>`,
      `</svg>`,
    ].join('\n');
  }

  private firstSentence(text: string): string {
    const cleaned = text.replace(/```[\s\S]*?```/g, '').trim();
    const end = cleaned.search(/[.!?\n]/);
    const sentence = end > 0 ? cleaned.slice(0, end) : cleaned.slice(0, 60);
    return sentence.replace(/["\n]/g, ' ').trim() || 'Diagram';
  }
}
