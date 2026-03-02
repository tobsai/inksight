/**
 * Document Renderer — Phase 3.2 / Phase 7 (parallel processing)
 *
 * High-level renderer that combines parser + page renderer + cache
 * to produce PNG Buffers from DownloadedDocument objects.
 *
 * Phase 7: renderAllPages() now uses ParallelProcessor for concurrency-limited
 * parallel rendering (default: 4 concurrent pages).
 */

import type { DownloadedDocument } from '../cloud/types.js';
import { parseRMFile } from './rm-parser.js';
import { PageRenderer } from './page-renderer.js';
import { RenderCache } from './render-cache.js';
import type { RenderOptions } from './rm-parser.js';
import { ParallelProcessor } from '../performance/parallel-processor.js';

// Target size for AI-ready images (500 KB default)
const DEFAULT_TARGET_KB = 500;

/** Default number of pages to render in parallel */
const DEFAULT_RENDER_CONCURRENCY = 4;

export interface RenderAllOptions {
  /** Maximum pages rendered in parallel. Default: 4 */
  concurrency?: number;
}

export class DocumentRenderer {
  private renderer: PageRenderer;
  private cache?: RenderCache;

  constructor(cache?: RenderCache, options?: RenderOptions) {
    this.cache = cache;
    this.renderer = new PageRenderer(options);
  }

  /**
   * Render a single page from a DownloadedDocument.
   * Checks cache first, falls back to parse + render.
   */
  async renderPage(document: DownloadedDocument, pageIndex: number): Promise<Buffer> {
    this._validatePageIndex(document, pageIndex);

    const docId = document.metadata.visibleName + '_' + pageIndex;

    // 1. Check cache
    if (this.cache) {
      const cached = await this.cache.get(docId, pageIndex, {});
      if (cached) {
        return cached;
      }
    }

    // 2. Parse .rm file
    const rmData = document.pages[pageIndex];
    const rmBuffer = Buffer.isBuffer(rmData) ? rmData : Buffer.from(rmData);
    const page = parseRMFile(rmBuffer);

    // 3. Render
    const result = this.renderer.render(page);

    // 4. Store in cache
    if (this.cache) {
      await this.cache.set(docId, pageIndex, {}, result.png);
    }

    // 5. Return
    return result.png;
  }

  /**
   * Render all pages of a document with a configurable concurrency limit.
   *
   * Uses ParallelProcessor to cap concurrent renders (default: 4),
   * preventing memory exhaustion on large documents.
   * Results are returned in page order regardless of completion order.
   */
  async renderAllPages(
    document: DownloadedDocument,
    options?: RenderAllOptions
  ): Promise<Buffer[]> {
    const pageCount = document.pages.length;
    if (pageCount === 0) return [];

    const concurrency = options?.concurrency ?? DEFAULT_RENDER_CONCURRENCY;
    const pageIndices = Array.from({ length: pageCount }, (_, i) => i);

    const processor = new ParallelProcessor<number, Buffer>(
      (pageIndex) => this.renderPage(document, pageIndex),
      { concurrency }
    );

    const results = await processor.processAll(pageIndices);

    // Collect results in order; re-throw any page-level errors
    return results.map((r, i) => {
      if (r.error) {
        throw new Error(`Failed to render page ${i}: ${r.error.message}`);
      }
      return r.output as Buffer;
    });
  }

  /**
   * Render a page and resize/compress it to be suitable for AI vision APIs.
   * AI models prefer images < 1 MB; by default target 500 KB.
   */
  async renderForAI(
    document: DownloadedDocument,
    pageIndex: number,
    targetSizeKB: number = DEFAULT_TARGET_KB
  ): Promise<{ png: Buffer; mimeType: 'image/png' }> {
    let png = await this.renderPage(document, pageIndex);

    const targetBytes = targetSizeKB * 1024;

    // If already within target, return as-is
    if (png.length <= targetBytes) {
      return { png, mimeType: 'image/png' };
    }

    // Resize by rendering at a reduced scale until it fits
    // Calculate rough scale factor needed (PNG compression is ~3:1 over raw)
    const ratio = Math.sqrt(targetBytes / png.length);
    const scale = Math.max(0.25, ratio); // never go below 25%

    const docId = document.metadata.visibleName + '_' + pageIndex;
    const scaleOptions: RenderOptions = { scale };
    const scaledRenderer = new PageRenderer(scaleOptions);

    // Check cache for scaled version
    if (this.cache) {
      const cached = await this.cache.get(docId, pageIndex, scaleOptions);
      if (cached) {
        return { png: cached, mimeType: 'image/png' };
      }
    }

    const rmData = document.pages[pageIndex];
    const rmBuffer = Buffer.isBuffer(rmData) ? rmData : Buffer.from(rmData);
    const page = parseRMFile(rmBuffer);
    const result = scaledRenderer.render(page);
    png = result.png;

    if (this.cache) {
      await this.cache.set(docId, pageIndex, scaleOptions, png);
    }

    return { png, mimeType: 'image/png' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _validatePageIndex(document: DownloadedDocument, pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= document.pages.length) {
      throw new Error(
        `Page index ${pageIndex} out of range (document has ${document.pages.length} pages)`
      );
    }
  }
}
