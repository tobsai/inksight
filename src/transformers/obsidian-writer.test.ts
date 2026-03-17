/**
 * ObsidianWriter Tests
 *
 * Uses real temp directories so we test actual file I/O without mocking `fs`.
 * No AI calls, no reMarkable API calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import { ObsidianWriter } from './obsidian-writer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

// ─── ObsidianWriter ───────────────────────────────────────────────────────────

describe('ObsidianWriter', () => {
  let tmpDir: string;
  let writer: ObsidianWriter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'inksight-obsidian-'));
    writer = new ObsidianWriter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Basic write ────────────────────────────────────────────────────────────

  it('writes a Markdown file to the vault directory', async () => {
    const result = await writer.write('# Hello World\n\nSome note content.', {
      vaultPath: tmpDir,
      title: 'Hello World',
      date: '2024-03-15',
    });

    expect(result.filename).toBe('Hello World.md');
    expect(result.hadConflict).toBe(false);

    const content = await readFile(result.filePath);
    expect(content).toContain('# Hello World');
    expect(content).toContain('Some note content.');
  });

  // ── YAML frontmatter ───────────────────────────────────────────────────────

  it('writes correct YAML frontmatter with title, date, tags, and source', async () => {
    const result = await writer.write('Body text.', {
      vaultPath: tmpDir,
      title: 'Meeting Notes',
      date: '2024-03-15',
      tags: ['meeting', 'q1'],
    });

    const content = await readFile(result.filePath);
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('title: Meeting Notes');
    expect(content).toContain('date: 2024-03-15');
    expect(content).toContain('tags:');
    expect(content).toContain('  - meeting');
    expect(content).toContain('  - q1');
    expect(content).toContain('source: remarkable');
    expect(content).toMatch(/---\n\n/);
  });

  it('writes empty tags list when no tags provided', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: 'No Tags',
      date: '2024-03-15',
    });

    const content = await readFile(result.filePath);
    expect(content).toContain('tags: []');
  });

  it('quotes titles with special YAML characters', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: 'Title: with colon',
      date: '2024-03-15',
    });

    const content = await readFile(result.filePath);
    expect(content).toContain('title: "Title: with colon"');
  });

  // ── File naming ────────────────────────────────────────────────────────────

  it('uses date as fallback filename when title is empty', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: '',
      date: '2024-03-15',
    });

    expect(result.filename).toBe('2024-03-15.md');
  });

  it('uses date as fallback filename when title is only whitespace', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: '   ',
      date: '2024-03-15',
    });

    expect(result.filename).toBe('2024-03-15.md');
  });

  it('strips unsafe filename characters from the title', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: 'Note: "Draft" <2024>',
      date: '2024-03-15',
    });

    // Forbidden chars stripped; safe chars remain
    expect(result.filename).not.toContain(':');
    expect(result.filename).not.toContain('"');
    expect(result.filename).not.toContain('<');
    expect(result.filename).not.toContain('>');
    expect(result.filename).toMatch(/\.md$/);
  });

  it('falls back to date when title sanitizes to empty string', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: '///\\\\',
      date: '2024-03-15',
    });

    expect(result.filename).toBe('2024-03-15.md');
  });

  // ── Conflict resolution ────────────────────────────────────────────────────

  it('appends a timestamp suffix when the filename already exists', async () => {
    // Write first note
    const first = await writer.write('First.', {
      vaultPath: tmpDir,
      title: 'My Note',
      date: '2024-03-15',
    });
    expect(first.hadConflict).toBe(false);
    expect(first.filename).toBe('My Note.md');

    // Write second note with same title
    const second = await writer.write('Second.', {
      vaultPath: tmpDir,
      title: 'My Note',
      date: '2024-03-15',
    });
    expect(second.hadConflict).toBe(true);
    expect(second.filename).not.toBe('My Note.md');
    expect(second.filename).toMatch(/^My Note .+\.md$/);

    // Both files should exist
    const firstContent = await readFile(first.filePath);
    const secondContent = await readFile(second.filePath);
    expect(firstContent).toContain('First.');
    expect(secondContent).toContain('Second.');
  });

  // ── Vault directory creation ───────────────────────────────────────────────

  it('creates vault subdirectory if it does not exist', async () => {
    const nestedVault = join(tmpDir, 'nested', 'vault');

    const result = await writer.write('Content.', {
      vaultPath: nestedVault,
      title: 'New Note',
      date: '2024-03-15',
    });

    const content = await readFile(result.filePath);
    expect(content).toContain('Content.');
  });

  // ── Default date ──────────────────────────────────────────────────────────

  it('defaults to today when no date is provided', async () => {
    const before = new Date().toISOString().split('T')[0];

    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: 'Today Note',
    });

    const content = await readFile(result.filePath);
    // The date in frontmatter should be a valid ISO date string
    expect(content).toMatch(/date: \d{4}-\d{2}-\d{2}/);
    // Should match today's date (within the same day boundary)
    expect(content).toContain(`date: ${before}`);
  });

  // ── Return values ─────────────────────────────────────────────────────────

  it('returns the correct filePath and filename', async () => {
    const result = await writer.write('Content.', {
      vaultPath: tmpDir,
      title: 'Return Test',
      date: '2024-03-15',
    });

    expect(result.filePath).toBe(join(tmpDir, 'Return Test.md'));
    expect(result.filename).toBe('Return Test.md');
    expect(result.hadConflict).toBe(false);
  });
});
