/**
 * ObsidianWriter — Obsidian Vault Output
 *
 * Writes transformed InkSight documents as Markdown files with YAML frontmatter
 * into a target Obsidian vault directory.
 *
 * Frontmatter fields:
 *   title          — document title
 *   date           — ISO 8601 date
 *   tags           — list extracted from metadata
 *   source         — always "remarkably"
 *   inksight_version — semver from package.json
 *
 * Filename: sanitized title + date suffix to avoid collisions.
 * Example: "meeting-notes-2026-03-17.md"
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A document that has been transformed by InkSight and is ready to write. */
export interface TransformedDocument {
  /** Display title of the note */
  title: string;
  /** ISO 8601 datetime string (e.g. "2026-03-17T20:00:00.000Z") */
  date: string;
  /** Markdown body content (no frontmatter) */
  content: string;
  /** Optional tags extracted from reMarkable metadata */
  tags?: string[];
}

/** Result returned after writing a document to the vault. */
export interface ObsidianWriteResult {
  /** Absolute path of the written file */
  filePath: string;
  /** Basename of the written file */
  filename: string;
  /** Whether a timestamp suffix was appended to resolve a filename collision */
  hadConflict: boolean;
}

// ─── ObsidianWriter ───────────────────────────────────────────────────────────

export class ObsidianWriter {
  private readonly vaultPath: string;
  private readonly inksightVersion: string;

  /**
   * @param vaultPath  Absolute or `~`-prefixed path to the target Obsidian vault directory.
   */
  constructor(vaultPath: string) {
    this.vaultPath = this._expandTilde(vaultPath);
    this.inksightVersion = this._readVersion();
  }

  /**
   * Write a transformed document to the vault as a Markdown file.
   *
   * @param document  The transformed document to write.
   * @returns         Details about the written file.
   */
  async write(document: TransformedDocument): Promise<ObsidianWriteResult> {
    const date = document.date
      ? document.date.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const tags: string[] = document.tags ?? [];

    // Ensure vault directory exists
    await fs.mkdir(this.vaultPath, { recursive: true });

    const filename = this._buildFilename(document.title, date);
    const initialPath = join(this.vaultPath, filename);
    const { resolvedPath, hadConflict } = await this._resolveConflict(initialPath, date);
    const resolvedFilename = resolvedPath.slice(dirname(resolvedPath).length + 1);

    const resolvedTitle = document.title?.trim() || this._dateFallbackTitle(date);

    const frontmatter = this._buildFrontmatter(resolvedTitle, date, tags);
    await fs.writeFile(resolvedPath, frontmatter + document.content, 'utf-8');

    return {
      filePath: resolvedPath,
      filename: resolvedFilename,
      hadConflict,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Build a YAML frontmatter block. Tags are rendered as a YAML list. */
  private _buildFrontmatter(title: string, date: string, tags: string[]): string {
    const lines: string[] = [
      `title: ${this._yamlString(title)}`,
      `date: ${date}`,
    ];

    if (tags.length > 0) {
      lines.push('tags:');
      for (const tag of tags) {
        lines.push(`  - ${this._yamlString(tag)}`);
      }
    } else {
      lines.push('tags: []');
    }

    lines.push('source: remarkably');
    lines.push(`inksight_version: ${this._yamlString(this.inksightVersion)}`);

    return `---\n${lines.join('\n')}\n---\n\n`;
  }

  /** Derive a safe filename from the title + date. */
  private _buildFilename(title: string, date: string): string {
    const sanitized = this._sanitizeTitle(title);
    const base = sanitized ? `${sanitized}-${date}` : date;
    return `${base}.md`;
  }

  /**
   * Strip characters that are unsafe in filenames across macOS / Windows / Linux.
   * Returns an empty string if nothing usable remains.
   */
  private _sanitizeTitle(title: string): string {
    return (title ?? '')
      .replace(/[/\\:*?"<>|]/g, '')       // forbidden on Windows / macOS / Linux
      .replace(/[\x00-\x1f\x7f]/g, '')    // control characters
      .replace(/\.{2,}/g, '.')             // collapse consecutive dots
      .replace(/\s+/g, '-')               // spaces → hyphens
      .toLowerCase()
      .replace(/-{2,}/g, '-')             // collapse consecutive hyphens
      .replace(/^-+|-+$/g, '')            // trim leading/trailing hyphens
      .slice(0, 150);                      // practical filename length cap
  }

  /** Fallback title when there is no usable note title. */
  private _dateFallbackTitle(date: string): string {
    return date;
  }

  /**
   * If `targetPath` already exists, append a timestamp suffix.
   * Suffix format: `-YYYY-MM-DDTHH-MM-SS` (colons → dashes).
   */
  private async _resolveConflict(
    targetPath: string,
    _date: string
  ): Promise<{ resolvedPath: string; hadConflict: boolean }> {
    try {
      await fs.access(targetPath);
    } catch {
      return { resolvedPath: targetPath, hadConflict: false };
    }

    const suffix = new Date()
      .toISOString()
      .replace(/:/g, '-')
      .replace(/\.\d{3}Z$/, '');

    const withoutExt = targetPath.slice(0, -3);
    const resolvedPath = `${withoutExt}-${suffix}.md`;

    return { resolvedPath, hadConflict: true };
  }

  /**
   * Quote a YAML string value if it contains characters that require quoting.
   * Keeps simple values bare.
   */
  private _yamlString(value: string): string {
    if (/[:#\[\]{}&*!|>'"%@`,]/.test(value) || value.includes('\n')) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  /** Expand a leading `~/` to the user's home directory. */
  private _expandTilde(p: string): string {
    if (p.startsWith('~/')) {
      return join(process.env.HOME ?? process.env.USERPROFILE ?? '', p.slice(2));
    }
    return p;
  }

  /** Read the package version for frontmatter (falls back to "unknown"). */
  private _readVersion(): string {
    try {
      const require = createRequire(import.meta.url);
      const pkg = require('../../package.json') as { version?: string };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
