/**
 * Diagram Analyzer — Phase 3.3
 *
 * Analyzes hand-drawn diagrams using the 'diagram' transform type.
 * Detects diagram type from the AI response and returns structured results.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { AIProvider } from '../ai/provider.js';
import type { DownloadedDocument } from '../cloud/types.js';

export type DiagramType = 'flowchart' | 'mindmap' | 'sketch' | 'unknown';

export interface DiagramAnalysisResult {
  pageIndex: number;
  /** Structured description or Mermaid syntax */
  description: string;
  diagramType: DiagramType;
  provider: string;
  model: string;
  costUsd: number;
  durationMs: number;
}

export class DiagramAnalyzer {
  constructor(
    private renderer: DocumentRenderer,
    private aiRegistry: AIProviderRegistry
  ) {}

  /**
   * Analyze a single page for diagram content.
   */
  async analyzePage(
    document: DownloadedDocument,
    pageIndex: number,
    options?: { provider?: 'openai' | 'anthropic' | 'auto' }
  ): Promise<DiagramAnalysisResult> {
    const provider = ((options?.provider) ?? 'auto') as AIProvider;
    const startMs = Date.now();

    // 1. Render page to PNG
    const { png, mimeType } = await this.renderer.renderForAI(document, pageIndex);

    // 2. Submit to AI with diagram transform
    const result = await this.aiRegistry.transform(
      {
        imageData: png,
        mimeType,
        transformType: 'diagram',
      },
      provider
    );

    const durationMs = Date.now() - startMs;
    const description = result.content;

    return {
      pageIndex,
      description,
      diagramType: this._detectDiagramType(description),
      provider: result.provider,
      model: result.model,
      costUsd: result.costUsd,
      durationMs,
    };
  }

  /**
   * Analyze all pages in a document for diagram content.
   */
  async analyzeDocument(document: DownloadedDocument): Promise<DiagramAnalysisResult[]> {
    const results: DiagramAnalysisResult[] = [];
    for (let i = 0; i < document.pages.length; i++) {
      results.push(await this.analyzePage(document, i));
    }
    return results;
  }

  /**
   * Detect diagram type from AI response content.
   * Looks for Mermaid keywords, flowchart terms, and mind map indicators.
   */
  private _detectDiagramType(description: string): DiagramType {
    const lower = description.toLowerCase();

    // Mermaid flowchart syntax markers
    const flowchartKeywords = ['graph ', 'flowchart ', '-->', '---', 'subgraph', 'decision', 'process', 'flow'];
    // Mindmap markers
    const mindmapKeywords = ['mindmap', 'mind map', 'central idea', 'branch', 'node', 'topic'];
    // Sketch markers
    const sketchKeywords = ['sketch', 'drawing', 'illustration', 'figure', 'diagram', 'shape'];

    const isFlowchart = flowchartKeywords.some((k) => lower.includes(k));
    const isMindmap = mindmapKeywords.some((k) => lower.includes(k));
    const isSketch = sketchKeywords.some((k) => lower.includes(k));

    if (isFlowchart) return 'flowchart';
    if (isMindmap) return 'mindmap';
    if (isSketch) return 'sketch';
    return 'unknown';
  }
}
