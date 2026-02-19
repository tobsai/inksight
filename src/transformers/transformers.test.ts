/**
 * Phase 4 — Transformer Tests
 *
 * All dependencies are mocked. No real AI calls, no real rendering.
 * 25+ tests covering all four transformers and the registry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TextTransformer } from './text-transformer.js';
import { DiagramTransformer } from './diagram-transformer.js';
import { SummarizationTransformer } from './summarization-transformer.js';
import { MetadataTransformer } from './metadata-transformer.js';
import { TransformerRegistry } from './transformer-registry.js';

import type { DownloadedDocument } from '../cloud/types.js';
import type { TextTransformResult } from './text-transformer.js';
import type { DiagramTransformResult } from './diagram-transformer.js';
import type { SummarizationResult } from './summarization-transformer.js';
import type { ExtractedMetadata } from './metadata-transformer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDocument(pageCount = 2): DownloadedDocument {
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
      formatVersion: 2,
      lineHeight: -1,
      margins: 100,
      orientation: 'portrait',
      pageCount,
      pages: Array.from({ length: pageCount }, (_, i) => `page-uuid-${i}`),
      pageTags: [],
      textAlignment: 'left',
      textScale: 1,
    },
    pages: Array.from({ length: pageCount }, () => new Uint8Array([0, 1, 2, 3])),
  };
}

function makeRenderer() {
  return {
    renderForAI: vi.fn().mockResolvedValue({
      png: Buffer.from('PNG_DATA'),
      mimeType: 'image/png' as const,
    }),
  };
}

function makeRegistry(content = 'Default AI response content.') {
  return {
    transform: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      content,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.005,
      durationMs: 300,
    }),
  };
}

// ─── TextTransformer ─────────────────────────────────────────────────────────

describe('TextTransformer', () => {
  afterEach(() => vi.clearAllMocks());

  describe('transform()', () => {
    it('renders each page and calls AI provider', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('Hello world.');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(2);

      await transformer.transform(doc);

      expect(renderer.renderForAI).toHaveBeenCalledTimes(2);
      expect(registry.transform).toHaveBeenCalledTimes(2);
    });

    it('transforms a single page when pageIndex is provided', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('Single page text.');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(3);

      const result = await transformer.transform(doc, 1);

      expect(renderer.renderForAI).toHaveBeenCalledTimes(1);
      expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 1);
      expect(result.text).toContain('Single page text.');
    });

    it('returns a TextTransformResult with all required fields', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry(
        'This is a sample note with some content to read.\n\nSecond paragraph here.'
      );
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(1);

      const result = await transformer.transform(doc, 0);

      expect(result).toMatchObject({
        text: expect.any(String),
        paragraphs: expect.any(Array),
        lists: expect.any(Array),
        wordCount: expect.any(Number),
        estimatedReadingTimeMin: expect.any(Number),
        confidence: expect.any(Number),
        costUsd: expect.any(Number),
        durationMs: expect.any(Number),
      });
      expect(result.language).toMatchObject({
        language: expect.any(String),
        confidence: expect.any(Number),
        script: expect.any(String),
      });
    });

    it('detects paragraphs split on double newlines', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('First paragraph here.\n\nSecond paragraph here.\n\nThird.');
      const transformer = new TextTransformer(renderer as any, registry as any, {
        detectParagraphs: true,
      });
      const doc = makeDocument(1);

      const result = await transformer.transform(doc, 0);

      expect(result.paragraphs).toHaveLength(3);
      expect(result.paragraphs[0]).toBe('First paragraph here.');
      expect(result.paragraphs[1]).toBe('Second paragraph here.');
    });

    it('detects bullet list items', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('- Item one\n- Item two\n- Item three');
      const transformer = new TextTransformer(renderer as any, registry as any, {
        detectLists: true,
      });
      const doc = makeDocument(1);

      const result = await transformer.transform(doc, 0);

      expect(result.lists).toHaveLength(1);
      expect(result.lists[0].type).toBe('bullet');
      expect(result.lists[0].items).toEqual(['Item one', 'Item two', 'Item three']);
    });

    it('detects numbered list items', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('1. First item\n2. Second item\n3. Third item');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(1);

      const result = await transformer.transform(doc, 0);

      const numbered = result.lists.find((l) => l.type === 'numbered');
      expect(numbered).toBeDefined();
      expect(numbered!.items).toHaveLength(3);
    });

    it('detects checklist items', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('- [ ] Buy groceries\n- [x] Call dentist\n- [ ] Fix bug');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(1);

      const result = await transformer.transform(doc, 0);

      const checklist = result.lists.find((l) => l.type === 'checklist');
      expect(checklist).toBeDefined();
      expect(checklist!.items).toHaveLength(3);
    });

    it('accumulates costUsd across all pages', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('Page content.');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const doc = makeDocument(3);

      const result = await transformer.transform(doc);

      // 3 pages × $0.005 each
      expect(result.costUsd).toBeCloseTo(0.015);
    });

    it('throws when AI provider fails', async () => {
      const renderer = makeRenderer();
      const registry = { transform: vi.fn().mockRejectedValue(new Error('AI unavailable')) };
      const transformer = new TextTransformer(renderer as any, registry as any);

      await expect(transformer.transform(makeDocument(1), 0)).rejects.toThrow('AI unavailable');
    });
  });

  describe('exportTo()', () => {
    let baseResult: TextTransformResult;

    beforeEach(async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry(
        'The quick brown fox.\n\nJumps over the lazy dog.'
      );
      const transformer = new TextTransformer(renderer as any, registry as any);
      baseResult = await transformer.transform(makeDocument(1), 0);
    });

    it('exports to txt — strips markdown formatting', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('**Bold text** and *italic* here.');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const result = await transformer.transform(makeDocument(1), 0);

      const txt = await transformer.exportTo(result, 'txt');
      expect(txt).not.toContain('**');
      expect(txt).not.toContain('*italic*');
      expect(txt).toContain('Bold text');
    });

    it('exports to md — returns markdown text', async () => {
      const md = await new TextTransformer(makeRenderer() as any, makeRegistry() as any).exportTo(
        baseResult,
        'md'
      );
      expect(typeof md).toBe('string');
      expect(md.length).toBeGreaterThan(0);
    });

    it('exports to docx-ready — includes YAML front matter', async () => {
      const renderer = makeRenderer();
      const registry = makeRegistry('Some content for docx export.');
      const transformer = new TextTransformer(renderer as any, registry as any);
      const result = await transformer.transform(makeDocument(1), 0);

      const docx = await transformer.exportTo(result, 'docx-ready');
      expect(docx).toMatch(/^---\n/);
      expect(docx).toContain('Word count:');
      expect(docx).toContain('Reading time:');
      expect(docx).toContain('Language:');
    });
  });
});

// ─── DiagramTransformer ───────────────────────────────────────────────────────

describe('DiagramTransformer', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders page and calls AI with diagram transform type', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('flowchart TD\n    A[Start] --> B[End]');
    const transformer = new DiagramTransformer(renderer as any, registry as any);
    const doc = makeDocument(1);

    await transformer.transform(doc, 0);

    expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 0);
    expect(registry.transform).toHaveBeenCalledWith(
      expect.objectContaining({ transformType: 'diagram' })
    );
  });

  it('extracts Mermaid block from AI response', async () => {
    const renderer = makeRenderer();
    const mermaidContent = '```mermaid\nflowchart TD\n    A[Start] --> B[End]\n```';
    const registry = makeRegistry(mermaidContent);
    const transformer = new DiagramTransformer(renderer as any, registry as any, {
      outputFormat: 'mermaid',
    });

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.output).toContain('flowchart TD');
    expect(result.output).not.toContain('```');
  });

  it('detects flowchart type from AI response keywords', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('flowchart TD\n    A --> B');
    const transformer = new DiagramTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.detectedType).toBe('flowchart');
  });

  it('detects sequence diagram type', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('sequenceDiagram\n    Alice->>Bob: Hello');
    const transformer = new DiagramTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.detectedType).toBe('sequence');
  });

  it('detects arrows in response', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('A --> B --> C is the flow');
    const transformer = new DiagramTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.hasArrows).toBe(true);
  });

  it('outputs description format when requested', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('This is a flowchart with boxes and arrows connecting them.');
    const transformer = new DiagramTransformer(renderer as any, registry as any, {
      outputFormat: 'description',
    });

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.outputFormat).toBe('description');
    expect(result.output).toContain('flowchart');
  });

  it('outputs SVG placeholder when requested', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('flowchart with nodes');
    const transformer = new DiagramTransformer(renderer as any, registry as any, {
      outputFormat: 'svg-placeholder',
    });

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.outputFormat).toBe('svg-placeholder');
    expect(result.output).toContain('<svg');
    expect(result.output).toContain('</svg>');
  });

  it('returns correct costUsd from AI result', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('graph TD\n    A --> B');
    const transformer = new DiagramTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1), 0);

    expect(result.costUsd).toBe(0.005);
  });

  it('throws when AI provider fails', async () => {
    const renderer = makeRenderer();
    const registry = { transform: vi.fn().mockRejectedValue(new Error('API error')) };
    const transformer = new DiagramTransformer(renderer as any, registry as any);

    await expect(transformer.transform(makeDocument(1), 0)).rejects.toThrow('API error');
  });
});

// ─── SummarizationTransformer ─────────────────────────────────────────────────

describe('SummarizationTransformer', () => {
  afterEach(() => vi.clearAllMocks());

  it('processes all pages by default', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('Key points:\n- Point one\n- Point two');
    const transformer = new SummarizationTransformer(renderer as any, registry as any);
    const doc = makeDocument(3);

    await transformer.transform(doc);

    expect(renderer.renderForAI).toHaveBeenCalledTimes(3);
  });

  it('processes only specified page indices', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('Summary content here.');
    const transformer = new SummarizationTransformer(renderer as any, registry as any);
    const doc = makeDocument(5);

    await transformer.transform(doc, [0, 2]);

    expect(renderer.renderForAI).toHaveBeenCalledTimes(2);
  });

  it('returns SummarizationResult with all required fields', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('Key Points:\n- Main idea\n- Secondary idea\n\nAction Items:\n- [ ] Follow up');
    const transformer = new SummarizationTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1));

    expect(result).toMatchObject({
      summary: expect.any(String),
      keyPoints: expect.any(Array),
      actionItems: expect.any(Array),
      pageCount: 1,
      confidence: expect.any(Number),
      costUsd: expect.any(Number),
      durationMs: expect.any(Number),
    });
  });

  it('extracts key points from "Key Points:" section', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry(
      'Key Points:\n- Important finding A\n- Important finding B\n- Important finding C'
    );
    const transformer = new SummarizationTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1));

    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.keyPoints.some((kp) => kp.includes('Important finding'))).toBe(true);
  });

  it('extracts action items from "- [ ]" checkbox patterns', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry(
      'Summary text.\n\n- [ ] Send report to team\n- [ ] Schedule follow-up meeting\n- [x] Update docs'
    );
    const transformer = new SummarizationTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1));

    expect(result.actionItems.length).toBe(3);
    expect(result.actionItems).toContain('Send report to team');
  });

  it('extracts action items from "Action Items:" section', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry(
      'Summary here.\n\nAction Items:\n- Call the client\n- Review the PR\n- Deploy hotfix'
    );
    const transformer = new SummarizationTransformer(renderer as any, registry as any);

    const result = await transformer.transform(makeDocument(1));

    expect(result.actionItems.length).toBeGreaterThan(0);
  });

  it('aggregates multi-page summaries in hierarchical mode', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('Page summary content.');
    const transformer = new SummarizationTransformer(renderer as any, registry as any, {
      hierarchical: true,
    });
    const doc = makeDocument(3);

    const result = await transformer.transform(doc);

    // With 3 pages, summary should reference multiple pages
    expect(result.pageCount).toBe(3);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('omits action items when includeActionItems is false', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('- [ ] Task A\n- [ ] Task B');
    const transformer = new SummarizationTransformer(renderer as any, registry as any, {
      includeActionItems: false,
    });

    const result = await transformer.transform(makeDocument(1));

    expect(result.actionItems).toHaveLength(0);
  });

  it('throws when AI provider fails', async () => {
    const renderer = makeRenderer();
    const registry = { transform: vi.fn().mockRejectedValue(new Error('Timeout')) };
    const transformer = new SummarizationTransformer(renderer as any, registry as any);

    await expect(transformer.transform(makeDocument(1))).rejects.toThrow('Timeout');
  });
});

// ─── MetadataTransformer ──────────────────────────────────────────────────────

describe('MetadataTransformer', () => {
  afterEach(() => vi.clearAllMocks());

  it('parses clean JSON from AI response', async () => {
    const renderer = makeRenderer();
    const jsonContent = JSON.stringify({
      dates: ['2026-02-15', '2026-03-01'],
      people: ['Alice Smith', 'Bob Jones'],
      organizations: ['Acme Corp'],
      topics: ['Q1 Planning', 'Budget'],
      tags: ['meeting', 'finance'],
      actionItems: ['Submit budget by Friday'],
      locations: ['New York'],
    });
    const registry = makeRegistry(jsonContent);
    const transformer = new MetadataTransformer(renderer as any, registry as any);

    const result = await transformer.extract(makeDocument(1));

    expect(result.dates).toEqual(['2026-02-15', '2026-03-01']);
    expect(result.people).toContain('Alice Smith');
    expect(result.organizations).toContain('Acme Corp');
    expect(result.topics).toContain('Q1 Planning');
    expect(result.tags).toContain('meeting');
    expect(result.actionItems).toContain('Submit budget by Friday');
    expect(result.locations).toContain('New York');
  });

  it('parses JSON embedded in markdown code block', async () => {
    const renderer = makeRenderer();
    const content =
      'Here is the extracted metadata:\n\n```json\n' +
      JSON.stringify({
        dates: ['2026-01-10'],
        people: ['Carol'],
        organizations: [],
        topics: ['Research'],
        tags: ['note'],
        actionItems: [],
        locations: [],
      }) +
      '\n```';
    const registry = makeRegistry(content);
    const transformer = new MetadataTransformer(renderer as any, registry as any);

    const result = await transformer.extract(makeDocument(1));

    expect(result.dates).toContain('2026-01-10');
    expect(result.people).toContain('Carol');
  });

  it('falls back to empty arrays for unparseable response', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry('This is plain text with no JSON at all.');
    const transformer = new MetadataTransformer(renderer as any, registry as any);

    const result = await transformer.extract(makeDocument(1));

    expect(result.dates).toEqual([]);
    expect(result.people).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.raw).toContain('This is plain text');
  });

  it('deduplicates entries across multiple pages', async () => {
    const renderer = makeRenderer();
    const registry = {
      transform: vi.fn()
        .mockResolvedValueOnce({
          provider: 'anthropic', model: 'claude', costUsd: 0.005, durationMs: 100,
          inputTokens: 50, outputTokens: 50,
          content: JSON.stringify({
            dates: ['2026-01-01'], people: ['Alice'], organizations: [],
            topics: ['Topic A'], tags: ['tag1'], actionItems: [], locations: [],
          }),
        })
        .mockResolvedValueOnce({
          provider: 'anthropic', model: 'claude', costUsd: 0.005, durationMs: 100,
          inputTokens: 50, outputTokens: 50,
          content: JSON.stringify({
            dates: ['2026-01-01'], people: ['Alice', 'Bob'], organizations: [],
            topics: ['Topic B'], tags: ['tag1', 'tag2'], actionItems: [], locations: [],
          }),
        }),
    };
    const transformer = new MetadataTransformer(renderer as any, registry as any);

    const result = await transformer.extract(makeDocument(2));

    // 'Alice' and '2026-01-01' and 'tag1' should appear only once
    expect(result.people.filter((p) => p === 'Alice')).toHaveLength(1);
    expect(result.dates.filter((d) => d === '2026-01-01')).toHaveLength(1);
    expect(result.tags.filter((t) => t === 'tag1')).toHaveLength(1);
    // Bob and tag2 should be present
    expect(result.people).toContain('Bob');
    expect(result.tags).toContain('tag2');
  });

  it('processes only specified page indices', async () => {
    const renderer = makeRenderer();
    const registry = makeRegistry(JSON.stringify({
      dates: [], people: [], organizations: [], topics: [],
      tags: [], actionItems: [], locations: [],
    }));
    const transformer = new MetadataTransformer(renderer as any, registry as any);
    const doc = makeDocument(5);

    await transformer.extract(doc, [1, 3]);

    expect(renderer.renderForAI).toHaveBeenCalledTimes(2);
    expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 1);
    expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 3);
  });

  it('throws when AI provider fails', async () => {
    const renderer = makeRenderer();
    const registry = { transform: vi.fn().mockRejectedValue(new Error('Network error')) };
    const transformer = new MetadataTransformer(renderer as any, registry as any);

    await expect(transformer.extract(makeDocument(1))).rejects.toThrow('Network error');
  });
});

// ─── TransformerRegistry ──────────────────────────────────────────────────────

describe('TransformerRegistry', () => {
  afterEach(() => vi.clearAllMocks());

  function makeTextTransformer(result?: Partial<TextTransformResult>) {
    return {
      transform: vi.fn().mockResolvedValue({
        text: 'Extracted text.', paragraphs: ['Extracted text.'],
        lists: [], wordCount: 2, estimatedReadingTimeMin: 1,
        language: { language: 'en', confidence: 0.9, script: 'latin' },
        confidence: 0.9, costUsd: 0.01, durationMs: 200,
        ...result,
      }),
    };
  }

  function makeDiagramTransformer(result?: Partial<DiagramTransformResult>) {
    return {
      transform: vi.fn().mockResolvedValue({
        output: 'flowchart TD\n    A --> B', outputFormat: 'mermaid' as const,
        detectedType: 'flowchart', hasArrows: true, nodeCount: 2,
        confidence: 0.85, costUsd: 0.008, durationMs: 350,
        ...result,
      }),
    };
  }

  function makeSummarizationTransformer(result?: Partial<SummarizationResult>) {
    return {
      transform: vi.fn().mockResolvedValue({
        summary: 'This is the summary.', keyPoints: ['Key point 1'],
        actionItems: ['Do something'], pageCount: 1,
        confidence: 0.88, costUsd: 0.012, durationMs: 400,
        ...result,
      }),
    };
  }

  function makeMetadataTransformer(result?: Partial<ExtractedMetadata>) {
    return {
      extract: vi.fn().mockResolvedValue({
        dates: ['2026-02-01'], people: ['Dave'],
        organizations: ['InkCorp'], topics: ['Notes'],
        tags: ['note'], actionItems: [], locations: ['Chicago'],
        ...result,
      }),
    };
  }

  it('runs text + summary + metadata by default', async () => {
    const registry = new TransformerRegistry();
    const text = makeTextTransformer();
    const summary = makeSummarizationTransformer();
    const metadata = makeMetadataTransformer();

    registry.registerText(text as any);
    registry.registerSummarization(summary as any);
    registry.registerMetadata(metadata as any);

    const result = await registry.runAll(makeDocument(1));

    expect(text.transform).toHaveBeenCalledTimes(1);
    expect(summary.transform).toHaveBeenCalledTimes(1);
    expect(metadata.extract).toHaveBeenCalledTimes(1);
    expect(result.text).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.diagram).toBeUndefined();
  });

  it('runs only the specified transformer types', async () => {
    const registry = new TransformerRegistry();
    const text = makeTextTransformer();
    const summary = makeSummarizationTransformer();
    const metadata = makeMetadataTransformer();

    registry.registerText(text as any);
    registry.registerSummarization(summary as any);
    registry.registerMetadata(metadata as any);

    const result = await registry.runAll(makeDocument(1), ['text']);

    expect(text.transform).toHaveBeenCalledTimes(1);
    expect(summary.transform).not.toHaveBeenCalled();
    expect(metadata.extract).not.toHaveBeenCalled();
    expect(result.text).toBeDefined();
    expect(result.summary).toBeUndefined();
  });

  it('runs diagram transformer when requested', async () => {
    const registry = new TransformerRegistry();
    const diagram = makeDiagramTransformer();

    registry.registerDiagram(diagram as any);

    const result = await registry.runAll(makeDocument(2), ['diagram']);

    expect(diagram.transform).toHaveBeenCalledTimes(1);
    expect(diagram.transform).toHaveBeenCalledWith(expect.anything(), 0);
    expect(result.diagram).toBeDefined();
    expect(result.diagram!.detectedType).toBe('flowchart');
  });

  it('aggregates totalCostUsd across transformers', async () => {
    const registry = new TransformerRegistry();
    registry.registerText(makeTextTransformer({ costUsd: 0.01 }) as any);
    registry.registerSummarization(makeSummarizationTransformer({ costUsd: 0.012 }) as any);
    registry.registerMetadata(makeMetadataTransformer() as any); // no costUsd in metadata

    const result = await registry.runAll(makeDocument(1));

    // text (0.01) + summary (0.012) = 0.022
    expect(result.totalCostUsd).toBeCloseTo(0.022);
  });

  it('records totalDurationMs', async () => {
    const registry = new TransformerRegistry();
    registry.registerText(makeTextTransformer() as any);

    const result = await registry.runAll(makeDocument(1), ['text']);

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('skips transformer type when not registered', async () => {
    const registry = new TransformerRegistry();
    // No transformers registered at all

    const result = await registry.runAll(makeDocument(1), ['text', 'summary', 'metadata']);

    expect(result.text).toBeUndefined();
    expect(result.summary).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(result.totalCostUsd).toBe(0);
  });

  it('propagates errors from individual transformers', async () => {
    const registry = new TransformerRegistry();
    const text = { transform: vi.fn().mockRejectedValue(new Error('Text fail')) };
    registry.registerText(text as any);

    await expect(registry.runAll(makeDocument(1), ['text'])).rejects.toThrow('Text fail');
  });
});
