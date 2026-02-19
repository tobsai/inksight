/**
 * Phase 3.2 — Renderer Tests
 *
 * All canvas, fs, and crypto operations are mocked.
 * No actual .rm files or PNG files are read/written.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock definitions ─────────────────────────────────────────────────
// Variables used in vi.mock factories must be declared with vi.hoisted()

const { mockCtx, mockCanvas, mockPngBuffer, mockFs } = vi.hoisted(() => {
  const mockPngBuffer = Buffer.from('PNG_MOCK_DATA');

  const mockCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'round' as CanvasLineCap,
    lineJoin: 'round' as CanvasLineJoin,
    globalAlpha: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
  };

  const mockCanvas = {
    getContext: vi.fn(() => mockCtx),
    toBuffer: vi.fn(() => mockPngBuffer),
  };

  const mockFs = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn(),
  };

  return { mockCtx, mockCanvas, mockPngBuffer, mockFs };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('canvas', () => ({
  createCanvas: vi.fn(() => mockCanvas),
}));

vi.mock('fs/promises', () => mockFs);

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { parseRMFile } from './rm-parser.js';
import { PageRenderer } from './page-renderer.js';
import { RenderCache } from './render-cache.js';
import { DocumentRenderer } from './document-renderer.js';
import type { RMPage, RenderOptions } from './rm-parser.js';
import { createCanvas } from 'canvas';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Build a minimal valid .rm v6 binary buffer with the given layers/strokes/points */
function buildRMBuffer(
  version: number,
  layers: Array<{
    strokes: Array<{
      penType: number;
      color: number;
      width: number;
      points: Array<{ x: number; y: number; pressure: number; tiltX: number; tiltY: number }>;
    }>;
  }>
): Buffer {
  // Header: exactly 43 bytes
  const prefix = `reMarkable .lines file, version=${version}`;
  const padding = ' '.repeat(43 - prefix.length - 1) + '\n';
  const header = prefix + padding;
  if (header.length !== 43) throw new Error(`Header wrong length: ${header.length}`);

  const parts: Buffer[] = [Buffer.from(header, 'ascii')];

  // Number of layers
  const layerCount = Buffer.allocUnsafe(4);
  layerCount.writeInt32LE(layers.length, 0);
  parts.push(layerCount);

  for (const layer of layers) {
    const strokeCount = Buffer.allocUnsafe(4);
    strokeCount.writeInt32LE(layer.strokes.length, 0);
    parts.push(strokeCount);

    for (const stroke of layer.strokes) {
      // Stroke header: penType(4) + color(4) + unknown(4) + width(4) + unknown(4) + numPoints(4)
      const strokeHeader = Buffer.allocUnsafe(24);
      strokeHeader.writeInt32LE(stroke.penType, 0);
      strokeHeader.writeInt32LE(stroke.color, 4);
      strokeHeader.writeInt32LE(0, 8);
      strokeHeader.writeFloatLE(stroke.width, 12);
      strokeHeader.writeInt32LE(0, 16);
      strokeHeader.writeInt32LE(stroke.points.length, 20);
      parts.push(strokeHeader);

      for (const pt of stroke.points) {
        const pointBuf = Buffer.allocUnsafe(20);
        pointBuf.writeFloatLE(pt.x, 0);
        pointBuf.writeFloatLE(pt.y, 4);
        pointBuf.writeFloatLE(pt.pressure, 8);
        pointBuf.writeFloatLE(pt.tiltX, 12);
        pointBuf.writeFloatLE(pt.tiltY, 16);
        parts.push(pointBuf);
      }
    }
  }

  return Buffer.concat(parts);
}

/** Minimal DownloadedDocument stub */
function makeDocument(pages: Buffer[]) {
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
      synced: false,
      type: 'DocumentType' as const,
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
      orientation: 'portrait' as const,
      pageCount: pages.length,
      pages: pages.map((_, i) => `page-${i}`),
      pageTags: [],
      textAlignment: 'left',
      textScale: 1,
    },
    pages: pages.map(p => new Uint8Array(p)),
  };
}

const SAMPLE_STROKE = {
  penType: 4,
  color: 0,
  width: 1.5,
  points: [
    { x: 100, y: 200, pressure: 0.5, tiltX: 0.1, tiltY: 0.2 },
    { x: 200, y: 300, pressure: 0.7, tiltX: 0.1, tiltY: 0.2 },
    { x: 300, y: 400, pressure: 0.4, tiltX: 0.1, tiltY: 0.2 },
  ],
};

// ─── parseRMFile tests ─────────────────────────────────────────────────────────

describe('parseRMFile', () => {
  it('parses a valid v6 file with one layer and one stroke', () => {
    const buf = buildRMBuffer(6, [{ strokes: [SAMPLE_STROKE] }]);
    const page = parseRMFile(buf);

    expect(page.version).toBe(6);
    expect(page.layers).toHaveLength(1);
    expect(page.layers[0].strokes).toHaveLength(1);

    const stroke = page.layers[0].strokes[0];
    expect(stroke.penType).toBe(4);
    expect(stroke.color).toBe(0);
    expect(stroke.width).toBeCloseTo(1.5, 2);
    expect(stroke.points).toHaveLength(3);
    expect(stroke.points[0].x).toBeCloseTo(100, 0);
    expect(stroke.points[0].y).toBeCloseTo(200, 0);
    expect(stroke.points[0].pressure).toBeCloseTo(0.5, 2);
  });

  it('parses a valid v5 file', () => {
    const buf = buildRMBuffer(5, [{ strokes: [SAMPLE_STROKE] }]);
    const page = parseRMFile(buf);
    expect(page.version).toBe(5);
    expect(page.layers).toHaveLength(1);
  });

  it('parses a file with multiple layers', () => {
    const buf = buildRMBuffer(6, [
      { strokes: [SAMPLE_STROKE] },
      { strokes: [SAMPLE_STROKE, SAMPLE_STROKE] },
    ]);
    const page = parseRMFile(buf);

    expect(page.layers).toHaveLength(2);
    expect(page.layers[0].strokes).toHaveLength(1);
    expect(page.layers[1].strokes).toHaveLength(2);
  });

  it('parses a file with no strokes (empty layer)', () => {
    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const page = parseRMFile(buf);

    expect(page.layers).toHaveLength(1);
    expect(page.layers[0].strokes).toHaveLength(0);
  });

  it('returns empty layers array for header-only file', () => {
    const prefix = `reMarkable .lines file, version=6`;
    const padding = ' '.repeat(43 - prefix.length - 1) + '\n';
    const buf = Buffer.from(prefix + padding, 'ascii');

    const page = parseRMFile(buf);
    expect(page.layers).toHaveLength(0);
  });

  it('throws for a buffer that is too short to be a valid header', () => {
    const buf = Buffer.from('too short');
    expect(() => parseRMFile(buf)).toThrow(/too short/i);
  });

  it('throws for an invalid header (wrong prefix)', () => {
    const buf = Buffer.alloc(43, 0);
    buf.write('NOT a remarkable file at all!!!!!!!!!!!!!!!', 'ascii');
    expect(() => parseRMFile(buf)).toThrow(/invalid .rm file/i);
  });

  it('throws for an unsupported version (v4)', () => {
    const prefix = `reMarkable .lines file, version=4`;
    const padding = ' '.repeat(43 - prefix.length - 1) + '\n';
    const buf = Buffer.from(prefix + padding, 'ascii');
    expect(() => parseRMFile(buf)).toThrow(/unsupported .rm file version 4/i);
  });

  it('correctly maps all five point fields', () => {
    const stroke = {
      penType: 2,
      color: 1,
      width: 2.0,
      points: [
        { x: 50.5, y: 75.25, pressure: 0.8, tiltX: 0.3, tiltY: 0.4 },
        { x: 100.1, y: 200.9, pressure: 0.6, tiltX: 0.1, tiltY: 0.2 },
      ],
    };

    const buf = buildRMBuffer(6, [{ strokes: [stroke] }]);
    const page = parseRMFile(buf);
    const pt = page.layers[0].strokes[0].points[0];

    expect(pt.x).toBeCloseTo(50.5, 1);
    expect(pt.y).toBeCloseTo(75.25, 1);
    expect(pt.pressure).toBeCloseTo(0.8, 2);
    expect(pt.tiltX).toBeCloseTo(0.3, 2);
    expect(pt.tiltY).toBeCloseTo(0.4, 2);
  });
});

// ─── PageRenderer tests ──────────────────────────────────────────────────────

describe('PageRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvas.toBuffer.mockReturnValue(mockPngBuffer);
    mockCanvas.getContext.mockReturnValue(mockCtx);
    (createCanvas as ReturnType<typeof vi.fn>).mockReturnValue(mockCanvas);
  });

  it('creates a canvas with default dimensions', () => {
    const renderer = new PageRenderer();
    const page: RMPage = { version: 6, layers: [] };

    renderer.render(page);

    expect(createCanvas).toHaveBeenCalledWith(1404, 1872);
  });

  it('creates a canvas with custom dimensions', () => {
    const renderer = new PageRenderer({ width: 702, height: 936 });
    const page: RMPage = { version: 6, layers: [] };

    renderer.render(page);

    expect(createCanvas).toHaveBeenCalledWith(702, 936);
  });

  it('applies scale factor to dimensions', () => {
    const renderer = new PageRenderer({ scale: 0.5 });
    const page: RMPage = { version: 6, layers: [] };

    renderer.render(page);

    expect(createCanvas).toHaveBeenCalledWith(702, 936);
  });

  it('fills background color on render', () => {
    const renderer = new PageRenderer({ backgroundColor: 'white' });
    const page: RMPage = { version: 6, layers: [] };

    renderer.render(page);

    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1404, 1872);
  });

  it('returns a RenderResult with PNG buffer', () => {
    const renderer = new PageRenderer();
    const page: RMPage = { version: 6, layers: [] };

    const result = renderer.render(page);

    expect(result.png).toBe(mockPngBuffer);
    expect(result.width).toBe(1404);
    expect(result.height).toBe(1872);
    expect(result.layerCount).toBe(0);
    expect(result.strokeCount).toBe(0);
    expect(typeof result.renderTimeMs).toBe('number');
  });

  it('counts strokes correctly across multiple layers', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 10, y: 10, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [
        {
          strokes: [
            { penType: 4, color: 0, width: 1, points: [pt, pt2] },
            { penType: 4, color: 0, width: 1, points: [pt, pt2] },
          ],
        },
        {
          strokes: [
            { penType: 2, color: 1, width: 2, points: [pt, pt2] },
          ],
        },
      ],
    };

    const result = renderer.render(page);

    expect(result.strokeCount).toBe(3);
    expect(result.layerCount).toBe(2);
  });

  it('calls stroke() for each stroke with 2+ points', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 10, y: 10, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [{ strokes: [{ penType: 4, color: 0, width: 1, points: [pt, pt2] }] }],
    };

    renderer.render(page);

    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('skips strokes with fewer than 2 points', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [{ strokes: [{ penType: 4, color: 0, width: 1, points: [pt] }] }],
    };

    renderer.render(page);

    expect(mockCtx.stroke).not.toHaveBeenCalled();
  });

  it('renderLayer renders only the specified layer', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 10, y: 10, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [
        { strokes: [{ penType: 4, color: 0, width: 1, points: [pt, pt2] }] },
        { strokes: [{ penType: 2, color: 1, width: 2, points: [pt, pt2] }] },
      ],
    };

    const result = renderer.renderLayer(page, 0);

    expect(result.strokeCount).toBe(1);
    expect(result.layerCount).toBe(1);
  });

  it('renderLayer throws for out-of-range index', () => {
    const renderer = new PageRenderer();
    const page: RMPage = { version: 6, layers: [] };

    expect(() => renderer.renderLayer(page, 0)).toThrow(/out of range/i);
  });

  it('maps highlighter pen type to semi-transparent color', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 100, y: 100, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [
        { strokes: [{ penType: 5, color: 0, width: 4, points: [pt, pt2] }] },
      ],
    };

    renderer.render(page);

    expect(mockCtx.strokeStyle).toMatch(/rgba\(\d+, \d+, \d+, 0\.5\)/);
  });

  it('applies 50% opacity for highlighter pen', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 100, y: 100, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [
        { strokes: [{ penType: 5, color: 3, width: 4, points: [pt, pt2] }] },
      ],
    };

    renderer.render(page);
    expect(mockCtx.globalAlpha).toBe(0.5);
  });

  it('uses full opacity for fineliner pen', () => {
    const renderer = new PageRenderer();
    const pt = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const pt2 = { x: 100, y: 100, pressure: 0.5, tiltX: 0, tiltY: 0, speed: 0 };
    const page: RMPage = {
      version: 6,
      layers: [
        { strokes: [{ penType: 4, color: 0, width: 1, points: [pt, pt2] }] },
      ],
    };

    renderer.render(page);
    expect(mockCtx.globalAlpha).toBe(1.0);
  });
});

// ─── RenderCache tests ──────────────────────────────────────────────────────

describe('RenderCache', () => {
  const cacheDir = '/tmp/test-render-cache';
  const options: RenderOptions = { width: 1404, height: 1872 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('returns null on cache miss', async () => {
    const cache = new RenderCache({ cacheDir });
    const result = await cache.get('doc-1', 0, options);
    expect(result).toBeNull();
  });

  it('stores and retrieves a PNG buffer (cache hit)', async () => {
    const png = Buffer.from('fake-png-data');
    const cache = new RenderCache({ cacheDir });

    // First call: miss
    const miss = await cache.get('doc-1', 0, options);
    expect(miss).toBeNull();

    // Set the value
    await cache.set('doc-1', 0, options, png);

    // Mock readFile to return the PNG
    mockFs.readFile.mockResolvedValueOnce(png);

    const hit = await cache.get('doc-1', 0, options);
    expect(hit).toEqual(png);
  });

  it('returns null after TTL expires', async () => {
    const ttlMs = 1;
    const cache = new RenderCache({ cacheDir, ttlMs });

    const png = Buffer.from('test-png');
    await cache.set('doc-1', 0, options, png);

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 10));

    mockFs.readFile.mockResolvedValue(png);

    const result = await cache.get('doc-1', 0, options);
    expect(result).toBeNull();
  });

  it('removes all cached entries for a document on invalidate', async () => {
    const cache = new RenderCache({ cacheDir });

    const png = Buffer.from('test-png');
    await cache.set('doc-1', 0, options, png);
    await cache.set('doc-1', 1, options, png);

    await cache.invalidate('doc-1');

    const stats = await cache.getStats();
    expect(stats.entries).toBe(0);
  });

  it('getStats returns correct entry count', async () => {
    const cache = new RenderCache({ cacheDir });

    await cache.set('doc-1', 0, options, Buffer.from('png1'));
    await cache.set('doc-2', 0, options, Buffer.from('png2-data'));

    const stats = await cache.getStats();
    expect(stats.entries).toBe(2);
    expect(stats.totalBytes).toBeGreaterThan(0);
  });

  it('getStats tracks hit rate correctly', async () => {
    const png = Buffer.from('test');
    const cache = new RenderCache({ cacheDir });

    // 1 miss
    await cache.get('doc-1', 0, options);

    // Set + hit
    await cache.set('doc-1', 0, options, png);
    mockFs.readFile.mockResolvedValueOnce(png);
    await cache.get('doc-1', 0, options);

    const stats = await cache.getStats();
    expect(stats.hitRate).toBeCloseTo(0.5, 5);
  });

  it('enforces size limit with LRU eviction', async () => {
    const cache = new RenderCache({ cacheDir, maxSizeBytes: 10 });

    const largePng = Buffer.alloc(8, 1);
    await cache.set('doc-1', 0, options, largePng);

    const largePng2 = Buffer.alloc(8, 2);
    await cache.set('doc-2', 0, options, largePng2);

    const stats = await cache.getStats();
    expect(stats.totalBytes).toBeLessThanOrEqual(10);
  });

  it('uses different cache keys for different options', async () => {
    const cache = new RenderCache({ cacheDir });

    await cache.set('doc-1', 0, { width: 1404 }, Buffer.from('png-full'));
    await cache.set('doc-1', 0, { width: 702 }, Buffer.from('png-half'));

    const stats = await cache.getStats();
    expect(stats.entries).toBe(2);
  });
});

// ─── DocumentRenderer tests ──────────────────────────────────────────────────

describe('DocumentRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvas.toBuffer.mockReturnValue(mockPngBuffer);
    mockCanvas.getContext.mockReturnValue(mockCtx);
    (createCanvas as ReturnType<typeof vi.fn>).mockReturnValue(mockCanvas);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('renderPage returns PNG buffer from a parsed .rm file', async () => {
    const buf = buildRMBuffer(6, [{ strokes: [SAMPLE_STROKE] }]);
    const doc = makeDocument([buf]);
    const renderer = new DocumentRenderer();

    const png = await renderer.renderPage(doc, 0);

    expect(png).toBe(mockPngBuffer);
  });

  it('renderPage throws for out-of-range page index', async () => {
    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf]);
    const renderer = new DocumentRenderer();

    await expect(renderer.renderPage(doc, 1)).rejects.toThrow(/out of range/i);
    await expect(renderer.renderPage(doc, -1)).rejects.toThrow(/out of range/i);
  });

  it('renderPage uses cache hit path when available', async () => {
    const cachedPng = Buffer.from('cached-png-data');
    const cache = new RenderCache({ cacheDir: '/tmp/test-cache' });

    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf]);

    // Pre-populate cache
    await cache.set('test-doc_0', 0, {}, cachedPng);
    // Mock readFile to return cached png on next read
    mockFs.readFile.mockResolvedValueOnce(cachedPng);

    const renderer = new DocumentRenderer(cache);
    const png = await renderer.renderPage(doc, 0);

    expect(png).toEqual(cachedPng);
    // Canvas should NOT have been used (cache hit)
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('renderAllPages renders all pages in parallel', async () => {
    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf, buf, buf]);
    const renderer = new DocumentRenderer();

    const pages = await renderer.renderAllPages(doc);

    expect(pages).toHaveLength(3);
    expect(pages.every(p => p === mockPngBuffer)).toBe(true);
  });

  it('renderForAI returns correct mime type', async () => {
    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf]);
    const renderer = new DocumentRenderer();

    const result = await renderer.renderForAI(doc, 0);

    expect(result.mimeType).toBe('image/png');
    expect(result.png).toBeInstanceOf(Buffer);
  });

  it('renderForAI returns original PNG when within target size', async () => {
    const smallPng = Buffer.from('small-png');
    mockCanvas.toBuffer.mockReturnValue(smallPng);

    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf]);
    const renderer = new DocumentRenderer();

    const result = await renderer.renderForAI(doc, 0, 500);

    expect(result.png).toBe(smallPng);
  });

  it('renderForAI re-renders at smaller scale when PNG exceeds target', async () => {
    const largePng = Buffer.alloc(600 * 1024, 0);
    const smallPng = Buffer.alloc(100 * 1024, 0);

    const mockCtxLocal = { ...mockCtx };
    const largeCanvas = {
      getContext: vi.fn(() => mockCtxLocal),
      toBuffer: vi.fn(() => largePng),
    };
    const smallCanvas = {
      getContext: vi.fn(() => mockCtxLocal),
      toBuffer: vi.fn(() => smallPng),
    };

    (createCanvas as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(largeCanvas)
      .mockReturnValue(smallCanvas);

    const buf = buildRMBuffer(6, [{ strokes: [] }]);
    const doc = makeDocument([buf]);
    const renderer = new DocumentRenderer();

    const result = await renderer.renderForAI(doc, 0, 500);

    expect(createCanvas).toHaveBeenCalledTimes(2);
    expect(result.mimeType).toBe('image/png');
  });
});
