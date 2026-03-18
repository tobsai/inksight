/**
 * tests/output/obsidian-writer.test.ts
 *
 * Tests for the src/output ObsidianWriter class.
 * Uses real temp directories — no mocking of `fs`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import { ObsidianWriter } from '../../src/output/obsidian-writer.js';
import type { TransformedDocument } from '../../src/output/obsidian-writer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

function makeDoc(overrides: Partial<TransformedDocument> = {}): TransformedDocument {
  return {
    title: 'Test Note',
    date: '2026-03-17T20:00:00.000Z',
    content: '# Test Note\n\nSome content here.',
    tags: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ObsidianWriter (output module)', () => {
  let tmpDir: string;
  let writer: ObsidianWriter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'inksight-output-obsidian-'));
    writer = new ObsidianWriter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── File creation ─────────────────────────────────────────────────────────

  it('creates a .md file in the vault directory', async () => {
    const result = await writer.write(makeDoc());

    expect(result.filename).toMatch(/\.md$/);
    expect(result.hadConflict).toBe(false);

    const stat = await fs.stat(result.filePath);
    expect(stat.isFile()).toBe(true);
  });

  it('filename includes sanitized title and date', async () => {
    const result = await writer.write(makeDoc({ title: 'My Note', date: '2026-03-17T20:00:00.000Z' }));
    expect(result.filename).toBe('my-note-2026-03-17.md');
  });

  it('filename falls back to date when title is empty', async () => {
    const result = await writer.write(makeDoc({ title: '', date: '2026-03-17T20:00:00.000Z' }));
    expect(result.filename).toBe('2026-03-17.md');
  });

  it('filename falls back to date when title is whitespace-only', async () => {
    const result = await writer.write(makeDoc({ title: '   ', date: '2026-03-17T20:00:00.000Z' }));
    expect(result.filename).toBe('2026-03-17.md');
  });

  // ── YAML frontmatter ──────────────────────────────────────────────────────

  it('writes YAML frontmatter with title key', async () => {
    const result = await writer.write(makeDoc({ title: 'Meeting Notes' }));
    const content = await readFile(result.filePath);
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('title:');
    expect(content).toMatch(/---\n\n/);
  });

  it('writes YAML frontmatter with date key', async () => {
    const result = await writer.write(makeDoc({ date: '2026-03-17T20:00:00.000Z' }));
    const content = await readFile(result.filePath);
    expect(content).toContain('date: 2026-03-17');
  });

  it('writes YAML frontmatter with tags as list', async () => {
    const result = await writer.write(makeDoc({ tags: ['meeting', 'q1'] }));
    const content = await readFile(result.filePath);
    expect(content).toContain('tags:');
    expect(content).toContain('  - meeting');
    expect(content).toContain('  - q1');
  });

  it('writes empty tags list when tags array is empty', async () => {
    const result = await writer.write(makeDoc({ tags: [] }));
    const content = await readFile(result.filePath);
    expect(content).toContain('tags: []');
  });

  it('writes empty tags list when tags is undefined', async () => {
    const doc = makeDoc();
    delete doc.tags;
    const result = await writer.write(doc);
    const content = await readFile(result.filePath);
    expect(content).toContain('tags: []');
  });

  it('writes source: remarkably in frontmatter', async () => {
    const result = await writer.write(makeDoc());
    const content = await readFile(result.filePath);
    expect(content).toContain('source: remarkably');
  });

  it('writes inksight_version in frontmatter', async () => {
    const result = await writer.write(makeDoc());
    const content = await readFile(result.filePath);
    expect(content).toMatch(/inksight_version:/);
  });

  // ── Body content ──────────────────────────────────────────────────────────

  it('writes the document content body after frontmatter', async () => {
    const result = await writer.write(makeDoc({ content: '# Hello\n\nBody text.' }));
    const content = await readFile(result.filePath);
    expect(content).toContain('# Hello');
    expect(content).toContain('Body text.');
  });

  // ── Conflict resolution ───────────────────────────────────────────────────

  it('appends a timestamp suffix when the filename already exists', async () => {
    const doc = makeDoc({ title: 'Duplicate', date: '2026-03-17T20:00:00.000Z' });

    const first = await writer.write(doc);
    expect(first.hadConflict).toBe(false);
    expect(first.filename).toBe('duplicate-2026-03-17.md');

    const second = await writer.write(doc);
    expect(second.hadConflict).toBe(true);
    expect(second.filename).not.toBe('duplicate-2026-03-17.md');
    expect(second.filename).toMatch(/\.md$/);

    // Both files should exist and contain the document content
    const [c1, c2] = await Promise.all([readFile(first.filePath), readFile(second.filePath)]);
    expect(c1).toContain('source: remarkably');
    expect(c2).toContain('source: remarkably');
    // Files are distinct paths
    expect(first.filePath).not.toBe(second.filePath);
  });

  // ── Vault directory creation ──────────────────────────────────────────────

  it('creates nested vault directory if it does not exist', async () => {
    const nestedVault = join(tmpDir, 'nested', 'vault');
    const nestedWriter = new ObsidianWriter(nestedVault);

    const result = await nestedWriter.write(makeDoc());
    const content = await readFile(result.filePath);
    expect(content).toContain('source: remarkably');
  });

  // ── Return values ─────────────────────────────────────────────────────────

  it('returns correct filePath, filename, and hadConflict', async () => {
    const result = await writer.write(
      makeDoc({ title: 'Return Test', date: '2026-03-17T20:00:00.000Z' })
    );
    expect(result.filePath).toBe(join(tmpDir, 'return-test-2026-03-17.md'));
    expect(result.filename).toBe('return-test-2026-03-17.md');
    expect(result.hadConflict).toBe(false);
  });

  // ── Filename sanitization ─────────────────────────────────────────────────

  it('strips unsafe characters from title', async () => {
    const result = await writer.write(
      makeDoc({ title: 'Note: "Draft" <2026>', date: '2026-03-17T20:00:00.000Z' })
    );
    expect(result.filename).not.toContain(':');
    expect(result.filename).not.toContain('"');
    expect(result.filename).not.toContain('<');
    expect(result.filename).not.toContain('>');
    expect(result.filename).toMatch(/\.md$/);
  });

  it('converts spaces to hyphens in filename', async () => {
    const result = await writer.write(
      makeDoc({ title: 'My Great Note', date: '2026-03-17T20:00:00.000Z' })
    );
    expect(result.filename).toBe('my-great-note-2026-03-17.md');
  });
});
