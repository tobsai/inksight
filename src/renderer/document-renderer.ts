/**
 * Document Renderer — Phase 3.2
 *
 * High-level renderer that combines parser + page renderer + cache
 * to produce PNG Buffers from DownloadedDocument objects.
 */

import type { DownloadedDocument } from '../cloud/types.js';
import { parseRMFile } from './rm-parser.js';
import { PageRenderer } from './page-renderer.js';
import { RenderCache } from './render-cache.js';
import type { RenderOptions } from './rm-parser.js';

// Target size for AI-ready images (500 KB default)
const DEFAULT_TARGET_KB = 500;

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
   * Render all pages of a document in parallel (respects cache).
   */
  async renderAllPages(document: DownloadedDocument): Promise<Buffer[]> {
    const pageCount = document.pages.length;
    const tasks: Promise<Buffer>[] = [];

    for (let i = 0; i < pageCount; i++) {
      tasks.push(this.renderPage(document, i));
    }

    return Promise.all(tasks);
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
