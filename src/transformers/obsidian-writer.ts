/**
 * ObsidianWriter — Obsidian Vault Integration
 *
 * Writes transformed notes as Markdown files to a target Obsidian vault
 * directory. Generates YAML frontmatter with title, date, tags, and a
 * `source: remarkable` marker.
 *
 * Filename rules:
 *   1. Sanitized title (e.g. "Meeting Notes.md")
 *   2. Fallback: ISO date (e.g. "2024-03-15.md")
 *   3. Conflict resolution: append date suffix (e.g. "Meeting Notes 2024-03-15T14-30-00.md")
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ObsidianFrontmatter {
  /** Note title — used in frontmatter and as filename */
  title: string;
  /** ISO 8601 date string */
  date: string;
  /** Tags extracted from document metadata */
  tags: string[];
  /** Always "remarkable" — marks origin for vault filtering */
  source: 'remarkable';
}

export interface ObsidianWriteOptions {
  /** Absolute or relative path to the Obsidian vault (or target subdirectory) */
  vaultPath: string;
  /** Note title — sanitized and used as filename */
  title?: string;
  /** ISO 8601 date (defaults to now) */
  date?: string;
  /** Tags to embed in frontmatter (defaults to []) */
  tags?: string[];
}

export interface ObsidianWriteResult {
  /** Absolute path of the file that was written */
  filePath: string;
  /** Filename (basename only) */
  filename: string;
  /** Whether an existing file was renamed to avoid conflict */
  hadConflict: boolean;
}

// ─── ObsidianWriter ───────────────────────────────────────────────────────────

export class ObsidianWriter {
  /**
   * Write a Markdown note to the target Obsidian vault directory.
   *
   * @param content  The Markdown body (without frontmatter)
   * @param options  Vault path, title, date, and tags
   * @returns        Details about the written file
   */
  async write(content: string, options: ObsidianWriteOptions): Promise<ObsidianWriteResult> {
    const { vaultPath, tags = [] } = options;
    const date = options.date ?? new Date().toISOString().split('T')[0];
    const title = options.title?.trim() || '';

    const filename = this._resolveFilename(title, date);
    const targetDir = vaultPath;

    // Ensure vault directory exists
    await fs.mkdir(targetDir, { recursive: true });

    const initialPath = join(targetDir, filename);
    const { resolvedPath, hadConflict } = await this._resolveConflict(initialPath, date);

    const resolvedFilename = resolvedPath.slice(dirname(resolvedPath).length + 1);
    const resolvedTitle = title || this._filenameTitleFallback(date);

    const frontmatter = this._buildFrontmatter({
      title: resolvedTitle,
      date,
      tags,
      source: 'remarkable',
    });

    await fs.writeFile(resolvedPath, frontmatter + content, 'utf-8');

    return {
      filePath: resolvedPath,
      filename: resolvedFilename,
      hadConflict,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a YAML frontmatter block from the given fields.
   * Tags are written as a YAML list.
   */
  private _buildFrontmatter(meta: ObsidianFrontmatter): string {
    const lines: string[] = [
      `title: ${this._yamlString(meta.title)}`,
      `date: ${meta.date}`,
    ];

    if (meta.tags.length > 0) {
      lines.push('tags:');
      for (const tag of meta.tags) {
        lines.push(`  - ${this._yamlString(tag)}`);
      }
    } else {
      lines.push('tags: []');
    }

    lines.push(`source: ${meta.source}`);

    return `---\n${lines.join('\n')}\n---\n\n`;
  }

  /**
   * Sanitize a title into a safe filename (no path separators, control chars, etc.)
   * Falls back to a date-based name if the title is empty.
   */
  private _resolveFilename(title: string, date: string): string {
    const sanitized = this._sanitizeTitle(title);
    if (sanitized) {
      return `${sanitized}.md`;
    }
    return `${this._filenameTitleFallback(date)}.md`;
  }

  /**
   * Strip characters that are unsafe in filenames across macOS / Windows / Linux.
   * Returns an empty string if the title contains nothing usable.
   */
  private _sanitizeTitle(title: string): string {
    return title
      .replace(/[/\\:*?"<>|]/g, '') // forbidden on Windows/macOS
      .replace(/[\x00-\x1f\x7f]/g, '') // control characters
      .replace(/\.{2,}/g, '.') // collapse multiple dots
      .trim()
      .slice(0, 200); // practical filename length cap
  }

  /** Return the date string formatted for use in a filename (colons → dashes). */
  private _filenameTitleFallback(date: string): string {
    return date.replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
  }

  /**
   * If `targetPath` already exists, append a date-time suffix to avoid overwriting.
   * Suffix format: ` YYYY-MM-DDTHH-MM-SS` (colons replaced with dashes for FS safety).
   */
  private async _resolveConflict(
    targetPath: string,
    _date: string
  ): Promise<{ resolvedPath: string; hadConflict: boolean }> {
    try {
      await fs.access(targetPath);
    } catch {
      // File does not exist — no conflict
      return { resolvedPath: targetPath, hadConflict: false };
    }

    // File exists — append a timestamp suffix
    const suffix = new Date()
      .toISOString()
      .replace(/:/g, '-')
      .replace(/\.\d{3}Z$/, '');

    const withoutExt = targetPath.slice(0, -3); // strip ".md"
    const resolvedPath = `${withoutExt} ${suffix}.md`;

    return { resolvedPath, hadConflict: true };
  }

  /**
   * Wrap a string in YAML double quotes if it contains special characters,
   * otherwise return it bare.
   */
  private _yamlString(value: string): string {
    if (/[:#\[\]{}&*!|>'"%@`,]/.test(value) || value.includes('\n')) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
}
