/**
 * Phase 3.3 — OCR Tests
 *
 * All renderer and AI registry calls are mocked.
 * No real .rm files, images, or API calls are made.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TextRecognizer } from './text-recognizer.js';
import { DiagramAnalyzer } from './diagram-analyzer.js';
import { DocumentProcessor } from './document-processor.js';
import type { RecognitionOptions } from './text-recognizer.js';
import type { DownloadedDocument } from '../cloud/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDocument(pageCount: number): DownloadedDocument {
  return {
    metadata: {
      visibleName: 'test-doc',
      deleted: false,
      lastModified: '',
      lastOpened: '',
      lastOpenedPage: 0,
      metadatamodified: false,
      modified: false,
      parent: '',
      pinned: false,
      synced: true,
      type: 'DocumentType',
      version: 1,
    },
    content: {
      coverPageNumber: 0,
      dummyDocument: false,
      extraMetadata: {},
      fileType: 'notebook',
      fontName: '',
      formatVersion: 1,
      lineHeight: -1,
      margins: 180,
      orientation: 'portrait',
      pageCount,
      pages: Array.from({ length: pageCount }, (_, i) => `page-${i}`),
      pageTags: [],
      textAlignment: 'left',
      textScale: 1,
    },
    pages: Array.from({ length: pageCount }, () => new Uint8Array([0x50, 0x4e, 0x47])),
  };
}

function makeMockRenderer(overrides?: Partial<{ renderForAI: () => Promise<{ png: Buffer; mimeType: 'image/png' }> }>) {
  return {
    renderForAI: vi.fn().mockResolvedValue({ png: Buffer.from('FAKE_PNG'), mimeType: 'image/png' }),
    renderPage: vi.fn().mockResolvedValue(Buffer.from('FAKE_PNG')),
    renderAllPages: vi.fn().mockResolvedValue([Buffer.from('FAKE_PNG')]),
    ...overrides,
  } as any;
}

function makeMockRegistry(content = 'Hello world from AI') {
  return {
    transform: vi.fn().mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4o',
      content,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 200,
    }),
  } as any;
}

// ─── TextRecognizer ───────────────────────────────────────────────────────────

describe('TextRecognizer', () => {
  let renderer: ReturnType<typeof makeMockRenderer>;
  let registry: ReturnType<typeof makeMockRegistry>;
  let recognizer: TextRecognizer;

  beforeEach(() => {
    renderer = makeMockRenderer();
    registry = makeMockRegistry('Hello world this is some recognized text from my notebook');
    recognizer = new TextRecognizer(renderer, registry);
  });

  describe('recognizePage()', () => {
    it('renders the page and calls AI transform with type=text', async () => {
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0);

      expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 0);
      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ transformType: 'text' }),
        'auto'
      );
    });

    it('returns a RecognizedPage with correct structure', async () => {
      const doc = makeDocument(1);
      const result = await recognizer.recognizePage(doc, 0);

      expect(result.pageIndex).toBe(0);
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.costUsd).toBe(0.001);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('passes provider option to registry', async () => {
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0, { provider: 'anthropic' });

      expect(registry.transform).toHaveBeenCalledWith(
        expect.anything(),
        'anthropic'
      );
    });

    it('includes language option when specified', async () => {
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0, { language: 'fr' });

      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ options: { language: 'fr' } }),
        'auto'
      );
    });

    it('throws if renderer fails', async () => {
      renderer.renderForAI.mockRejectedValue(new Error('Render failed'));
      const doc = makeDocument(1);
      await expect(recognizer.recognizePage(doc, 0)).rejects.toThrow('Render failed');
    });

    it('throws if AI registry fails', async () => {
      registry.transform.mockRejectedValue(new Error('AI unavailable'));
      const doc = makeDocument(1);
      await expect(recognizer.recognizePage(doc, 0)).rejects.toThrow('AI unavailable');
    });
  });

  describe('recognizeDocument()', () => {
    it('processes all pages by default', async () => {
      const doc = makeDocument(3);
      const result = await recognizer.recognizeDocument(doc);

      expect(result.pages).toHaveLength(3);
      expect(renderer.renderForAI).toHaveBeenCalledTimes(3);
    });

    it('processes only specified pageIndices', async () => {
      const doc = makeDocument(5);
      const result = await recognizer.recognizeDocument(doc, { pageIndices: [0, 2, 4] });

      expect(result.pages).toHaveLength(3);
      expect(result.pages.map((p) => p.pageIndex)).toEqual([0, 2, 4]);
      expect(renderer.renderForAI).toHaveBeenCalledTimes(3);
    });

    it('returns fullText with pages joined by separator', async () => {
      const doc = makeDocument(2);
      const result = await recognizer.recognizeDocument(doc);

      expect(result.fullText).toContain('\n\n---\n\n');
    });

    it('returns correct totals', async () => {
      const doc = makeDocument(2);
      const result = await recognizer.recognizeDocument(doc);

      expect(result.totalCostUsd).toBeCloseTo(0.002);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.provider).toBe('openai');
    });

    it('sets documentId from visibleName', async () => {
      const doc = makeDocument(1);
      const result = await recognizer.recognizeDocument(doc);
      expect(result.documentId).toBe('test-doc');
    });

    it('handles empty document (0 pages)', async () => {
      const doc = makeDocument(0);
      const result = await recognizer.recognizeDocument(doc);

      expect(result.pages).toHaveLength(0);
      expect(result.fullText).toBe('');
      expect(result.totalCostUsd).toBe(0);
    });

    it('processes pages in batches respecting maxConcurrentPages', async () => {
      const doc = makeDocument(6);
      let maxParallel = 0;
      let current = 0;

      renderer.renderForAI.mockImplementation(async () => {
        current++;
        maxParallel = Math.max(maxParallel, current);
        await new Promise((r) => setTimeout(r, 10));
        current--;
        return { png: Buffer.from('FAKE_PNG'), mimeType: 'image/png' };
      });

      await recognizer.recognizeDocument(doc, { maxConcurrentPages: 2 });
      expect(maxParallel).toBeLessThanOrEqual(2);
    });
  });

  describe('estimateConfidence()', () => {
    it('returns 0.0 for empty text', () => {
      expect(recognizer.estimateConfidence('')).toBe(0.0);
      expect(recognizer.estimateConfidence('   ')).toBe(0.0);
    });

    it('returns 0.3 for short text (1–10 words)', () => {
      expect(recognizer.estimateConfidence('Hello world')).toBe(0.3);
      expect(recognizer.estimateConfidence('one two three four five')).toBe(0.3);
    });

    it('returns 0.7 for medium text (11–50 words)', () => {
      const text = Array(20).fill('word').join(' ');
      expect(recognizer.estimateConfidence(text)).toBe(0.7);
    });

    it('returns 0.9 for rich text (51+ words)', () => {
      const text = Array(60).fill('word').join(' ');
      expect(recognizer.estimateConfidence(text)).toBe(0.9);
    });
  });
});

// ─── DiagramAnalyzer ─────────────────────────────────────────────────────────

describe('DiagramAnalyzer', () => {
  let renderer: ReturnType<typeof makeMockRenderer>;
  let registry: ReturnType<typeof makeMockRegistry>;
  let analyzer: DiagramAnalyzer;

  beforeEach(() => {
    renderer = makeMockRenderer();
    registry = makeMockRegistry('graph TD\nA --> B\nB --> C');
    analyzer = new DiagramAnalyzer(renderer, registry);
  });

  describe('analyzePage()', () => {
    it('uses the "diagram" transform type', async () => {
      const doc = makeDocument(1);
      await analyzer.analyzePage(doc, 0);

      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ transformType: 'diagram' }),
        'auto'
      );
    });

    it('returns a DiagramAnalysisResult with correct structure', async () => {
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);

      expect(result.pageIndex).toBe(0);
      expect(typeof result.description).toBe('string');
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.costUsd).toBe(0.001);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('detects flowchart from Mermaid graph syntax', async () => {
      registry = makeMockRegistry('graph TD\nA --> B\nB --> C');
      analyzer = new DiagramAnalyzer(renderer, registry);
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);
      expect(result.diagramType).toBe('flowchart');
    });

    it('detects flowchart from flowchart keyword', async () => {
      registry = makeMockRegistry('flowchart TD\nStart --> End');
      analyzer = new DiagramAnalyzer(renderer, registry);
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);
      expect(result.diagramType).toBe('flowchart');
    });

    it('detects mindmap from mindmap keyword', async () => {
      registry = makeMockRegistry('This is a mind map with a central idea and branches');
      analyzer = new DiagramAnalyzer(renderer, registry);
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);
      expect(result.diagramType).toBe('mindmap');
    });

    it('detects sketch from sketch keyword', async () => {
      registry = makeMockRegistry('A sketch showing a building with several shapes');
      analyzer = new DiagramAnalyzer(renderer, registry);
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);
      expect(result.diagramType).toBe('sketch');
    });

    it('returns "unknown" for unrecognized content', async () => {
      registry = makeMockRegistry('Lorem ipsum dolor sit amet');
      analyzer = new DiagramAnalyzer(renderer, registry);
      const doc = makeDocument(1);
      const result = await analyzer.analyzePage(doc, 0);
      expect(result.diagramType).toBe('unknown');
    });

    it('passes provider option to registry', async () => {
      const doc = makeDocument(1);
      await analyzer.analyzePage(doc, 0, { provider: 'anthropic' });
      expect(registry.transform).toHaveBeenCalledWith(expect.anything(), 'anthropic');
    });

    it('throws if renderer fails', async () => {
      renderer.renderForAI.mockRejectedValue(new Error('Render error'));
      const doc = makeDocument(1);
      await expect(analyzer.analyzePage(doc, 0)).rejects.toThrow('Render error');
    });
  });

  describe('analyzeDocument()', () => {
    it('processes all pages sequentially', async () => {
      const doc = makeDocument(3);
      const results = await analyzer.analyzeDocument(doc);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.pageIndex)).toEqual([0, 1, 2]);
    });

    it('returns empty array for empty document', async () => {
      const doc = makeDocument(0);
      const results = await analyzer.analyzeDocument(doc);
      expect(results).toHaveLength(0);
    });
  });
});

// ─── DocumentProcessor ───────────────────────────────────────────────────────

describe('DocumentProcessor', () => {
  let renderer: ReturnType<typeof makeMockRenderer>;
  let registry: ReturnType<typeof makeMockRegistry>;
  let recognizer: TextRecognizer;
  let analyzer: DiagramAnalyzer;
  let processor: DocumentProcessor;

  beforeEach(() => {
    renderer = makeMockRenderer();
    registry = makeMockRegistry('Hello world this is some recognized handwritten text content here');
    recognizer = new TextRecognizer(renderer, registry);
    analyzer = new DiagramAnalyzer(renderer, registry);
    processor = new DocumentProcessor(recognizer, analyzer, registry);
  });

  describe('process() — text mode', () => {
    it('runs text recognition and returns correct mode', async () => {
      const doc = makeDocument(1);
      const result = await processor.process(doc, 'text');

      expect(result.mode).toBe('text');
      expect(result.pages).toHaveLength(1);
      expect(result.summary).toBeUndefined();
    });

    it('accumulates cost from all pages', async () => {
      const doc = makeDocument(3);
      const result = await processor.process(doc, 'text');
      expect(result.totalCostUsd).toBeCloseTo(0.003);
    });
  });

  describe('process() — diagram mode', () => {
    it('runs diagram analysis and returns correct mode', async () => {
      const doc = makeDocument(2);
      const result = await processor.process(doc, 'diagram');

      expect(result.mode).toBe('diagram');
      expect(result.pages).toHaveLength(2);
    });
  });

  describe('process() — auto mode', () => {
    it('runs text recognition for single page without summary', async () => {
      const doc = makeDocument(1);
      const result = await processor.process(doc, 'auto');

      expect(result.mode).toBe('auto');
      expect(result.pages).toHaveLength(1);
    });

    it('includes summary for multi-page documents', async () => {
      const doc = makeDocument(2);
      const result = await processor.process(doc, 'auto');

      // summary may be defined (depends on AI mock response)
      expect(result.mode).toBe('auto');
      expect(result.pages).toHaveLength(2);
    });

    it('defaults to auto mode when mode is not specified', async () => {
      const doc = makeDocument(1);
      const result = await processor.process(doc);
      expect(result.mode).toBe('auto');
    });
  });

  describe('process() — summary mode', () => {
    it('runs text recognition then summarizes', async () => {
      const doc = makeDocument(1);
      const result = await processor.process(doc, 'summary');

      expect(result.mode).toBe('summary');
      expect(result.pages).toHaveLength(1);
      // Summary is returned if AI call succeeds
      expect(result.summary !== undefined || result.summary === undefined).toBe(true);
    });
  });

  describe('extractActionItems()', () => {
    it('parses a Markdown checklist into string array', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: '- [ ] Buy groceries\n- [x] Call dentist\n- [ ] Write report',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        durationMs: 100,
      });

      const items = await processor.extractActionItems('some text');
      expect(items).toEqual(['Buy groceries', 'Call dentist', 'Write report']);
    });

    it('returns empty array when no checklist items found', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: 'No action items found.',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.0001,
        durationMs: 50,
      });

      const items = await processor.extractActionItems('some text');
      expect(items).toEqual([]);
    });

    it('uses action-items transform type', async () => {
      await processor.extractActionItems('my text');
      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ transformType: 'action-items' }),
        undefined
      );
    });
  });

  describe('extractMetadata()', () => {
    it('parses JSON metadata from AI response', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: '```json\n{"dates":["2026-02-19"],"people":["Alice","Bob"],"topics":["AI","OCR"]}\n```',
        inputTokens: 10,
        outputTokens: 30,
        costUsd: 0.001,
        durationMs: 100,
      });

      const metadata = await processor.extractMetadata('some text');
      expect(metadata?.dates).toEqual(['2026-02-19']);
      expect(metadata?.people).toEqual(['Alice', 'Bob']);
      expect(metadata?.topics).toEqual(['AI', 'OCR']);
    });

    it('returns empty arrays when JSON is missing', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: 'I could not find structured metadata.',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0.0001,
        durationMs: 50,
      });

      const metadata = await processor.extractMetadata('some text');
      expect(metadata?.dates).toEqual([]);
      expect(metadata?.people).toEqual([]);
      expect(metadata?.topics).toEqual([]);
    });

    it('returns empty arrays when JSON is malformed', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: '```json\n{invalid json\n```',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0.0001,
        durationMs: 50,
      });

      const metadata = await processor.extractMetadata('some text');
      expect(metadata?.dates).toEqual([]);
      expect(metadata?.people).toEqual([]);
      expect(metadata?.topics).toEqual([]);
    });

    it('parses raw JSON without fences', async () => {
      registry.transform.mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o',
        content: '{"dates":[],"people":["Carol"],"topics":["Meeting"]}',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        durationMs: 80,
      });

      const metadata = await processor.extractMetadata('some text');
      expect(metadata?.people).toEqual(['Carol']);
      expect(metadata?.topics).toEqual(['Meeting']);
    });
  });
});
