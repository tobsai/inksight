/**
 * Phase 3.3 — Recognition Tests
 *
 * All dependencies are mocked. No real AI calls, no real file I/O.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockFs } = vi.hoisted(() => {
  const mockFs = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
  return { mockFs };
});

vi.mock('fs', () => ({
  promises: mockFs,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { TextRecognizer, estimateConfidence } from './text-recognizer.js';
import { detectLanguage } from './language-detector.js';
import { OutputFormatter } from './output-formatter.js';
import { RecognitionPipeline } from './recognition-pipeline.js';
import type { DocumentRecognitionResult, RecognitionResult } from './text-recognizer.js';
import type { DownloadedDocument } from '../cloud/types.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

function makeMockRenderer(textPerPage = 'Hello World') {
  return {
    renderForAI: vi.fn().mockResolvedValue({
      png: Buffer.from('PNG_DATA'),
      mimeType: 'image/png' as const,
    }),
  };
}

function makeMockRegistry(content = 'Hello World', provider = 'anthropic', model = 'claude-3-5-sonnet') {
  return {
    transform: vi.fn().mockResolvedValue({
      provider,
      model,
      content,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 200,
    }),
  };
}

// ─── estimateConfidence ───────────────────────────────────────────────────────

describe('estimateConfidence', () => {
  it('returns 0.3 for empty string', () => {
    expect(estimateConfidence('')).toBe(0.3);
  });

  it('returns 0.3 for whitespace-only string', () => {
    expect(estimateConfidence('   ')).toBe(0.3);
  });

  it('returns 0.3 for very short response (< 20 chars)', () => {
    expect(estimateConfidence('too short')).toBe(0.3);
  });

  it('returns 0.1 when response contains "unable to read"', () => {
    expect(estimateConfidence('I was unable to read this page clearly.')).toBe(0.1);
  });

  it('returns 0.1 when response contains "unclear"', () => {
    expect(estimateConfidence('The handwriting is unclear in several places.')).toBe(0.1);
  });

  it('returns 0.1 when response contains "cannot"', () => {
    expect(estimateConfidence('I cannot extract the text from this image.')).toBe(0.1);
  });

  it('returns 0.9 for long detailed response (>= 200 chars)', () => {
    const longText = 'A'.repeat(200);
    expect(estimateConfidence(longText)).toBe(0.9);
  });

  it('returns value between 0.7 and 0.85 for normal response', () => {
    const normalText = 'Meeting notes from Monday. Discussed project timeline and deliverables.';
    const confidence = estimateConfidence(normalText);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
    expect(confidence).toBeLessThanOrEqual(0.85);
  });

  it('scales confidence with length between 20 and 200 chars', () => {
    const short = 'Short note here ok.'; // ~19 chars — boundary
    const medium = 'A somewhat longer note that has more content than a short one.';
    const c1 = estimateConfidence(short + 'x'); // just over 20
    const c2 = estimateConfidence(medium);
    expect(c2).toBeGreaterThanOrEqual(c1);
  });
});

// ─── detectLanguage ───────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('detects English text', () => {
    const result = detectLanguage('The quick brown fox jumps over the lazy dog and the cat.');
    expect(result.language).toBe('en');
    expect(result.script).toBe('latin');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects Chinese/CJK text', () => {
    const result = detectLanguage('这是中文文本，包含汉字。');
    expect(result.language).toBe('zh');
    expect(result.script).toBe('cjk');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('detects Japanese text (Hiragana)', () => {
    const result = detectLanguage('これはひらがなとカタカナのテキストです。');
    expect(result.language).toBe('ja');
    expect(result.script).toBe('cjk');
  });

  it('detects Korean text', () => {
    const result = detectLanguage('이것은 한국어 텍스트입니다.');
    expect(result.language).toBe('ko');
    expect(result.script).toBe('cjk');
  });

  it('detects Arabic text', () => {
    const result = detectLanguage('هذا نص عربي يحتوي على حروف عربية.');
    expect(result.language).toBe('ar');
    expect(result.script).toBe('arabic');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('detects Cyrillic/Russian text', () => {
    const result = detectLanguage('Это русский текст написанный кириллицей.');
    expect(result.language).toBe('ru');
    expect(result.script).toBe('cyrillic');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns unknown for empty string', () => {
    const result = detectLanguage('');
    expect(result.language).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('returns unknown for numeric/symbolic text', () => {
    const result = detectLanguage('123 456 789 !!! ???');
    expect(result.language).toBe('unknown');
  });
});

// ─── TextRecognizer ───────────────────────────────────────────────────────────

describe('TextRecognizer', () => {
  let renderer: ReturnType<typeof makeMockRenderer>;
  let registry: ReturnType<typeof makeMockRegistry>;

  beforeEach(() => {
    renderer = makeMockRenderer();
    registry = makeMockRegistry('Hello World and more words here to get good confidence.');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recognizePage()', () => {
    it('renders the page and calls AI provider', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0);

      expect(renderer.renderForAI).toHaveBeenCalledWith(doc, 0, 500);
      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ imageData: expect.any(Buffer), mimeType: 'image/png', transformType: 'text' }),
        'auto'
      );
    });

    it('returns RecognitionResult with correct fields', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      const result = await recognizer.recognizePage(doc, 0);

      expect(result.pageIndex).toBe(0);
      expect(result.text).toBe('Hello World and more words here to get good confidence.');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-5-sonnet');
      expect(result.transformType).toBe('text');
      expect(result.costUsd).toBe(0.001);
      expect(result.durationMs).toBe(200);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('respects transformType option', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0, { transformType: 'summary' });

      expect(registry.transform).toHaveBeenCalledWith(
        expect.objectContaining({ transformType: 'summary' }),
        'auto'
      );
    });

    it('respects preferredProvider option', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      await recognizer.recognizePage(doc, 0, { preferredProvider: 'openai' });

      expect(registry.transform).toHaveBeenCalledWith(
        expect.anything(),
        'openai'
      );
    });

    it('includes detected language when identifiable', async () => {
      const englishRegistry = makeMockRegistry(
        'The quick brown fox jumps over the lazy dog and the cat sat on the mat.'
      );
      const recognizer = new TextRecognizer(renderer as any, englishRegistry as any);
      const doc = makeDocument(1);
      const result = await recognizer.recognizePage(doc, 0);
      expect(result.language).toBe('en');
    });

    it('sets language to undefined for unknown language', async () => {
      const unknownRegistry = makeMockRegistry('123 !!!');
      const recognizer = new TextRecognizer(renderer as any, unknownRegistry as any);
      const doc = makeDocument(1);
      const result = await recognizer.recognizePage(doc, 0);
      expect(result.language).toBeUndefined();
    });

    it('throws when renderer fails', async () => {
      renderer.renderForAI.mockRejectedValue(new Error('Render failed'));
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      await expect(recognizer.recognizePage(doc, 0)).rejects.toThrow('Render failed');
    });

    it('throws when AI provider fails', async () => {
      registry.transform.mockRejectedValue(new Error('AI error'));
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      await expect(recognizer.recognizePage(doc, 0)).rejects.toThrow('AI error');
    });
  });

  describe('recognizeAllPages()', () => {
    it('processes all pages sequentially', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(3);
      const results = await recognizer.recognizeAllPages(doc);

      expect(results).toHaveLength(3);
      expect(renderer.renderForAI).toHaveBeenCalledTimes(3);
      expect(results[0].pageIndex).toBe(0);
      expect(results[1].pageIndex).toBe(1);
      expect(results[2].pageIndex).toBe(2);
    });

    it('filters pages below confidenceThreshold', async () => {
      // Return low-confidence response for page 1
      registry.transform
        .mockResolvedValueOnce({
          provider: 'anthropic', model: 'claude', content: 'Good long text with lots of content here.',
          costUsd: 0.001, durationMs: 100, inputTokens: 10, outputTokens: 10,
        })
        .mockResolvedValueOnce({
          provider: 'anthropic', model: 'claude', content: 'unable to read',
          costUsd: 0.001, durationMs: 100, inputTokens: 10, outputTokens: 10,
        })
        .mockResolvedValueOnce({
          provider: 'anthropic', model: 'claude', content: 'Another good page with content.',
          costUsd: 0.001, durationMs: 100, inputTokens: 10, outputTokens: 10,
        });

      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(3);
      const results = await recognizer.recognizeAllPages(doc, { confidenceThreshold: 0.5 });

      // Page with "unable to read" → confidence 0.1, should be filtered
      expect(results.length).toBeLessThan(3);
      const lowConfPage = results.find((r) => r.text.includes('unable to read'));
      expect(lowConfPage).toBeUndefined();
    });

    it('returns all pages when threshold is 0', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(2);
      const results = await recognizer.recognizeAllPages(doc, { confidenceThreshold: 0 });
      expect(results).toHaveLength(2);
    });
  });

  describe('recognizeDocument()', () => {
    it('returns DocumentRecognitionResult with all required fields', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(2);
      const result = await recognizer.recognizeDocument(doc);

      expect(result.documentId).toBe('test-doc');
      expect(result.pages).toHaveLength(2);
      expect(result.fullText).toContain('---');
      expect(result.totalCostUsd).toBeCloseTo(0.002);
      expect(result.totalDurationMs).toBe(400);
      expect(result.pageCount).toBe(2);
      expect(result.successfulPages).toBe(2);
      expect(result.averageConfidence).toBeGreaterThan(0);
    });

    it('joins page texts with separator', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(2);
      const result = await recognizer.recognizeDocument(doc);
      expect(result.fullText).toMatch(/\n\n---\n\n/);
    });

    it('calculates correct averageConfidence', async () => {
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const doc = makeDocument(1);
      const result = await recognizer.recognizeDocument(doc);
      expect(result.averageConfidence).toBe(result.pages[0].confidence);
    });

    it('reports averageConfidence of 0 for empty pages array', async () => {
      // Doc with 0 pages
      const doc = makeDocument(0);
      const recognizer = new TextRecognizer(renderer as any, registry as any);
      const result = await recognizer.recognizeDocument(doc);
      expect(result.averageConfidence).toBe(0);
      expect(result.successfulPages).toBe(0);
    });
  });
});

// ─── OutputFormatter ──────────────────────────────────────────────────────────

describe('OutputFormatter', () => {
  const formatter = new OutputFormatter();

  const pageResult: RecognitionResult = {
    pageIndex: 0,
    text: 'Some handwritten text.',
    confidence: 0.85,
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    transformType: 'text',
    costUsd: 0.001,
    durationMs: 200,
    wordCount: 3,
    language: 'en',
  };

  const docResult: DocumentRecognitionResult = {
    documentId: 'my-notebook',
    pages: [
      pageResult,
      { ...pageResult, pageIndex: 1, text: 'Page two content.' },
    ],
    fullText: 'Some handwritten text.\n\n---\n\nPage two content.',
    totalCostUsd: 0.002,
    totalDurationMs: 400,
    pageCount: 2,
    successfulPages: 2,
    averageConfidence: 0.85,
  };

  describe('format() — plain', () => {
    it('outputs raw text with page separator', () => {
      const out = formatter.format(docResult, { format: 'plain', pageBreaks: true });
      expect(out).toContain('Some handwritten text.');
      expect(out).toContain('Page two content.');
      expect(out).toContain('---');
    });

    it('includes metadata when requested', () => {
      const out = formatter.format(docResult, { format: 'plain', includeMetadata: true });
      expect(out).toContain('confidence');
      expect(out).toContain('Total pages');
    });
  });

  describe('format() — markdown', () => {
    it('uses ## headings for pages', () => {
      const out = formatter.format(docResult, { format: 'markdown' });
      expect(out).toContain('## Page 1');
      expect(out).toContain('## Page 2');
    });

    it('includes document title and stats when includeMetadata', () => {
      const out = formatter.format(docResult, { format: 'markdown', includeMetadata: true });
      expect(out).toContain('# my-notebook');
      expect(out).toContain('avg. confidence');
    });
  });

  describe('format() — json', () => {
    it('outputs valid JSON', () => {
      const out = formatter.format(docResult, { format: 'json' });
      expect(() => JSON.parse(out)).not.toThrow();
      const parsed = JSON.parse(out);
      expect(parsed.documentId).toBe('my-notebook');
    });
  });

  describe('format() — docx-ready', () => {
    it('uses # headings for pages', () => {
      const out = formatter.format(docResult, { format: 'docx-ready' });
      expect(out).toContain('# Page 1');
      expect(out).toContain('# Page 2');
    });

    it('is clean markdown without extra decorators', () => {
      const out = formatter.format(docResult, { format: 'docx-ready' });
      expect(out).toContain('Some handwritten text.');
      // Should not have ## (docx-ready uses single #)
      expect(out).not.toContain('## Page');
    });
  });

  describe('formatPage()', () => {
    it('formats a single page as plain text', () => {
      const out = formatter.formatPage(pageResult, { format: 'plain' });
      expect(out).toBe('Some handwritten text.');
    });

    it('formats a single page as json', () => {
      const out = formatter.formatPage(pageResult, { format: 'json' });
      const parsed = JSON.parse(out);
      expect(parsed.pageIndex).toBe(0);
    });

    it('includes metadata annotation for markdown format', () => {
      const out = formatter.formatPage(pageResult, { format: 'markdown', includeMetadata: true });
      expect(out).toContain('# Page 1');
      expect(out).toContain('Confidence');
    });
  });
});

// ─── RecognitionPipeline ──────────────────────────────────────────────────────

describe('RecognitionPipeline', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs full pipeline and returns result + formatted output', async () => {
    const renderer = makeMockRenderer();
    const registry = makeMockRegistry('Pipeline test content that is long enough to score well.');
    const recognizer = new TextRecognizer(renderer as any, registry as any);
    const formatter = new OutputFormatter();
    const pipeline = new RecognitionPipeline(recognizer, formatter);

    const doc = makeDocument(1);
    const { result, formatted } = await pipeline.run(doc, {
      output: { format: 'plain', pageBreaks: true },
    });

    expect(result.documentId).toBe('test-doc');
    expect(formatted).toContain('Pipeline test content');
    expect(result.successfulPages).toBe(1);
  });

  it('saves output to file when saveToFile is specified', async () => {
    const renderer = makeMockRenderer();
    const registry = makeMockRegistry('Some text content here.');
    const recognizer = new TextRecognizer(renderer as any, registry as any);
    const formatter = new OutputFormatter();
    const pipeline = new RecognitionPipeline(recognizer, formatter);

    const doc = makeDocument(1);
    const { savedTo } = await pipeline.run(doc, {
      output: { format: 'plain' },
      saveToFile: '/tmp/output/test.txt',
    });

    expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/output', { recursive: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/tmp/output/test.txt',
      expect.any(String),
      'utf-8'
    );
    expect(savedTo).toBe('/tmp/output/test.txt');
  });

  it('does not save file when saveToFile is not specified', async () => {
    const renderer = makeMockRenderer();
    const registry = makeMockRegistry('Some text content here.');
    const recognizer = new TextRecognizer(renderer as any, registry as any);
    const formatter = new OutputFormatter();
    const pipeline = new RecognitionPipeline(recognizer, formatter);

    const doc = makeDocument(1);
    const { savedTo } = await pipeline.run(doc);

    expect(savedTo).toBeUndefined();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('uses plain format with no metadata by default', async () => {
    const renderer = makeMockRenderer();
    const registry = makeMockRegistry('Default format test content here for pipeline.');
    const recognizer = new TextRecognizer(renderer as any, registry as any);
    const formatter = new OutputFormatter();
    const pipeline = new RecognitionPipeline(recognizer, formatter);

    const doc = makeDocument(1);
    const { formatted } = await pipeline.run(doc);

    expect(formatted).toContain('Default format test content');
  });
});
