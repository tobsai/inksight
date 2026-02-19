/**
 * Metadata Extraction Transformer — Phase 4.4
 *
 * Extracts structured metadata from reMarkable documents:
 * dates, people, organizations, topics, tags, action items, locations.
 *
 * Uses AI vision to analyze each page and returns a merged result.
 */

import type { DocumentRenderer } from '../renderer/document-renderer.js';
import type { AIProviderRegistry } from '../ai/provider-registry.js';
import type { DownloadedDocument } from '../cloud/types.js';

export interface ExtractedMetadata {
  /** Dates found in text */
  dates: string[];
  /** Names of people mentioned */
  people: string[];
  /** Company/org names */
  organizations: string[];
  /** Main topics/subjects */
  topics: string[];
  /** Suggested tags for search */
  tags: string[];
  /** Todos with context */
  actionItems: string[];
  /** Places mentioned */
  locations: string[];
  /** Raw JSON string from AI (for debugging) */
  raw?: string;
}

const EMPTY_METADATA: ExtractedMetadata = {
  dates: [],
  people: [],
  organizations: [],
  topics: [],
  tags: [],
  actionItems: [],
  locations: [],
};

export class MetadataTransformer {
  constructor(
    private renderer: DocumentRenderer,
    private registry: AIProviderRegistry
  ) {}

  /**
   * Extract metadata from a document. If pageIndices is omitted, all pages are processed.
   * Results are merged (deduplicated) across pages.
   */
  async extract(
    document: DownloadedDocument,
    pageIndices?: number[]
  ): Promise<ExtractedMetadata> {
    const indices =
      pageIndices ?? Array.from({ length: document.pages.length }, (_, i) => i);

    const pageResults: ExtractedMetadata[] = [];

    for (const idx of indices) {
      const { png, mimeType } = await this.renderer.renderForAI(document, idx);
      const result = await this.registry.transform({
        imageData: png,
        mimeType,
        transformType: 'action-items', // closest available transform type for metadata
      });

      const parsed = this.parseMetadataResponse(result.content);
      pageResults.push(parsed);
    }

    return this.mergeMetadata(pageResults);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Parse JSON metadata from AI response.
   * Handles clean JSON, JSON embedded in markdown code blocks, and partial responses.
   * Falls back to empty arrays for missing fields.
   */
  private parseMetadataResponse(response: string): ExtractedMetadata {
    // 1. Try direct JSON parse
    try {
      const parsed = JSON.parse(response.trim());
      return this.normalizeMetadata(parsed, response);
    } catch {
      // fall through
    }

    // 2. Extract JSON block from markdown (```json ... ``` or ``` ... ```)
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        return this.normalizeMetadata(parsed, response);
      } catch {
        // fall through
      }
    }

    // 3. Try to extract inline JSON object { ... }
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.normalizeMetadata(parsed, response);
      } catch {
        // fall through
      }
    }

    // 4. Fallback: return empty metadata with raw response stored
    return { ...EMPTY_METADATA, raw: response };
  }

  /** Normalize a parsed object to ExtractedMetadata, coercing fields to arrays. */
  private normalizeMetadata(obj: Record<string, unknown>, raw: string): ExtractedMetadata {
    const toStringArray = (val: unknown): string[] => {
      if (Array.isArray(val)) {
        return val.filter((v) => typeof v === 'string') as string[];
      }
      if (typeof val === 'string' && val.trim()) return [val.trim()];
      return [];
    };

    return {
      dates: toStringArray(obj['dates'] ?? obj['date']),
      people: toStringArray(obj['people'] ?? obj['persons'] ?? obj['names']),
      organizations: toStringArray(obj['organizations'] ?? obj['orgs'] ?? obj['companies']),
      topics: toStringArray(obj['topics'] ?? obj['subjects'] ?? obj['themes']),
      tags: toStringArray(obj['tags'] ?? obj['keywords']),
      actionItems: toStringArray(
        obj['actionItems'] ?? obj['action_items'] ?? obj['todos'] ?? obj['actions']
      ),
      locations: toStringArray(obj['locations'] ?? obj['places']),
      raw,
    };
  }

  /** Merge multiple page metadata results, deduplicating by lowercase string. */
  private mergeMetadata(results: ExtractedMetadata[]): ExtractedMetadata {
    const merge = (arrays: string[][]): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const arr of arrays) {
        for (const item of arr) {
          const key = item.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(item);
          }
        }
      }
      return out;
    };

    const raw = results
      .map((r) => r.raw)
      .filter(Boolean)
      .join('\n---\n');

    return {
      dates: merge(results.map((r) => r.dates)),
      people: merge(results.map((r) => r.people)),
      organizations: merge(results.map((r) => r.organizations)),
      topics: merge(results.map((r) => r.topics)),
      tags: merge(results.map((r) => r.tags)),
      actionItems: merge(results.map((r) => r.actionItems)),
      locations: merge(results.map((r) => r.locations)),
      raw: raw || undefined,
    };
  }
}
