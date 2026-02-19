/**
 * InkSight Search Index
 *
 * FTS5-backed full-text search using SQLite via better-sqlite3.
 * Supports full-text, tag, and date-range search.
 */

import { InkSightDatabase } from './database.js';
import Database from 'better-sqlite3';

export interface SearchResult {
  documentId: string;
  documentName: string;
  transformType: string;
  pageIndex: number;
  snippet: string;    // ≤150-char excerpt around match
  score: number;      // relevance score 0–1
  matchType: 'fulltext' | 'semantic' | 'tag';
}

export interface IndexedDocument {
  documentId: string;
  pageIndex: number;
  transformType: string;
  text: string;
  tags: string[];
}

export interface SearchOptions {
  limit?: number;          // default: 20
  transformTypes?: string[];
  fuzzy?: boolean;         // prefix matching (default: true)
}

export class SearchIndex {
  // Access the underlying better-sqlite3 db via the private field.
  // InkSightDatabase doesn't expose it, so we keep our own reference.
  private db: Database.Database;

  constructor(private inkDb: InkSightDatabase) {
    // Access the internal db by calling the special accessor we add below.
    this.db = (inkDb as any)._db();
    this.initFTS();
  }

  // ─── FTS5 init ──────────────────────────────────────────────────────────────

  private initFTS(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        document_id UNINDEXED,
        page_index UNINDEXED,
        transform_type UNINDEXED,
        text,
        tags,
        tokenize='porter ascii'
      );
    `);
  }

  // ─── Index operations ────────────────────────────────────────────────────────

  indexDocument(doc: IndexedDocument): void {
    // Remove existing entry for this doc/page/type combo first
    this.db.prepare(`
      DELETE FROM search_fts
      WHERE document_id = ? AND page_index = ? AND transform_type = ?
    `).run(doc.documentId, doc.pageIndex, doc.transformType);

    this.db.prepare(`
      INSERT INTO search_fts (document_id, page_index, transform_type, text, tags)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      doc.documentId,
      doc.pageIndex,
      doc.transformType,
      doc.text,
      doc.tags.join(' '),
    );
  }

  removeDocument(documentId: string): void {
    this.db.prepare(
      'DELETE FROM search_fts WHERE document_id = ?'
    ).run(documentId);
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit ?? 20;
    const fuzzy = options.fuzzy !== false; // default true

    // Build FTS5 query string
    const ftsQuery = this.buildFtsQuery(query, fuzzy);

    let sql = `
      SELECT
        document_id,
        page_index,
        transform_type,
        text,
        tags,
        bm25(search_fts) AS bm25_score
      FROM search_fts
      WHERE search_fts MATCH ?
    `;
    const params: any[] = [ftsQuery];

    if (options.transformTypes && options.transformTypes.length > 0) {
      sql += ` AND transform_type IN (${options.transformTypes.map(() => '?').join(',')})`;
      params.push(...options.transformTypes);
    }

    sql += ' ORDER BY bm25_score LIMIT ?';
    params.push(limit);

    let rows: any[];
    try {
      rows = this.db.prepare(sql).all(...params) as any[];
    } catch {
      return [];
    }

    return rows.map(row => {
      const rawScore = row.bm25_score as number; // negative from bm25
      const score = Math.min(1, Math.max(0, 1 / (1 + Math.abs(rawScore))));
      const docName = this.resolveDocumentName(row.document_id);

      return {
        documentId: row.document_id,
        documentName: docName,
        transformType: row.transform_type,
        pageIndex: row.page_index,
        snippet: this.extractSnippet(row.text as string, query),
        score,
        matchType: 'fulltext' as const,
      };
    });
  }

  searchByTag(tag: string): SearchResult[] {
    let rows: any[];
    try {
      rows = this.db.prepare(`
        SELECT document_id, page_index, transform_type, text, tags
        FROM search_fts
        WHERE tags MATCH ?
      `).all(tag) as any[];
    } catch {
      return [];
    }

    return rows.map(row => {
      const docName = this.resolveDocumentName(row.document_id);
      return {
        documentId: row.document_id,
        documentName: docName,
        transformType: row.transform_type,
        pageIndex: row.page_index,
        snippet: this.extractSnippet(row.text as string, tag),
        score: 1,
        matchType: 'tag' as const,
      };
    });
  }

  searchByDateRange(from: Date, to: Date): SearchResult[] {
    // The FTS5 table doesn't store dates; pull from the documents table
    // joined via document_id.
    const rows = this.db.prepare(`
      SELECT fts.document_id, fts.page_index, fts.transform_type, fts.text, fts.tags
      FROM search_fts fts
      INNER JOIN documents d ON d.id = fts.document_id
      WHERE d.modified_at >= ? AND d.modified_at <= ?
    `).all(from.toISOString(), to.toISOString()) as any[];

    return rows.map(row => {
      const docName = this.resolveDocumentName(row.document_id);
      return {
        documentId: row.document_id,
        documentName: docName,
        transformType: row.transform_type,
        pageIndex: row.page_index,
        snippet: (row.text as string).slice(0, 150),
        score: 1,
        matchType: 'fulltext' as const,
      };
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildFtsQuery(query: string, fuzzy: boolean): string {
    const words = query.trim().split(/\s+/).filter(Boolean);
    return words
      .map(w => {
        // Escape special FTS5 chars
        const escaped = w.replace(/["*^]/g, '');
        return fuzzy ? `${escaped}*` : escaped;
      })
      .join(' ');
  }

  private extractSnippet(text: string, query: string, maxLen = 150): string {
    const words = query.trim().split(/\s+/).filter(Boolean);
    const lower = text.toLowerCase();
    let matchPos = -1;

    for (const word of words) {
      const pos = lower.indexOf(word.toLowerCase().replace(/["*^]/g, ''));
      if (pos !== -1) {
        matchPos = pos;
        break;
      }
    }

    if (matchPos === -1) {
      // No match found — return start of text
      return text.slice(0, maxLen);
    }

    const half = Math.floor(maxLen / 2);
    let start = Math.max(0, matchPos - half);
    let end = start + maxLen;

    if (end > text.length) {
      end = text.length;
      start = Math.max(0, end - maxLen);
    }

    // Trim to word boundaries
    if (start > 0) {
      const spaceAfter = text.indexOf(' ', start);
      if (spaceAfter !== -1 && spaceAfter < matchPos) {
        start = spaceAfter + 1;
      }
    }
    if (end < text.length) {
      const spaceBefore = text.lastIndexOf(' ', end);
      if (spaceBefore > start) {
        end = spaceBefore;
      }
    }

    const snippet = text.slice(start, end);
    return snippet.length > maxLen ? snippet.slice(0, maxLen) : snippet;
  }

  private resolveDocumentName(documentId: string): string {
    const row = this.db.prepare(
      'SELECT name FROM documents WHERE id = ?'
    ).get(documentId) as any;
    return row ? row.name : documentId;
  }
}
