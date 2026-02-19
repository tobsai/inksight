/**
 * Phase 6.2 Configuration Tests
 *
 * ConfigManager — load / save / validate / env overrides
 * PRESETS — structure validation
 * EXPORT_TEMPLATES — non-empty output
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from './config.js';
import type { InkSightConfig } from './config.js';
import { PRESETS, getPreset, listPresets } from './presets.js';
import { EXPORT_TEMPLATES, getExportTemplate, listExportTemplates } from './export-templates.js';
import type { TransformResult } from './export-templates.js';
import type { ExtractedMetadata } from '../transformers/metadata-transformer.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function tmpConfigPath(): string {
  return path.join(os.tmpdir(), `inksight-test-${Date.now()}.json`);
}

function makeConfig(overrides: Partial<InkSightConfig> = {}): InkSightConfig {
  return {
    connection: { mode: 'cloud', cloud: { email: 'test@example.com', password: 'secret123' } },
    ai: { provider: 'openai', openaiApiKey: 'sk-test', maxCostPerDocument: 0.1 },
    transforms: { defaultType: 'text', outputDir: '/tmp/out', outputFormat: 'markdown' },
    storage: { dbPath: '/tmp/inksight.db', cacheDir: '/tmp/cache', maxCacheMb: 100 },
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<ExtractedMetadata> = {}): ExtractedMetadata {
  return {
    dates: ['2024-01-15'],
    people: ['Alice', 'Bob'],
    organizations: ['Acme Corp'],
    topics: ['project planning'],
    tags: ['meeting', 'planning'],
    actionItems: ['Send report by Friday'],
    locations: [],
    ...overrides,
  };
}

function makeTransformResult(overrides: Partial<TransformResult> = {}): TransformResult {
  return {
    text: { text: 'Hello world notes.', wordCount: 3, paragraphs: ['Hello world notes.'] },
    summary: { summary: 'A brief summary.', keyPoints: ['Point 1'], actionItems: ['Task A'] },
    metadata: makeMetadata(),
    totalCostUsd: 0.02,
    totalDurationMs: 1200,
    ...overrides,
  };
}

// ─── ConfigManager.load ───────────────────────────────────────────────────────

describe('ConfigManager.load', () => {
  it('returns defaults when config file does not exist', () => {
    const mgr = new ConfigManager('/tmp/nonexistent-inksight-config.json');
    const config = mgr.load();
    expect(config.connection.mode).toBe('hybrid');
    expect(config.ai.provider).toBe('auto');
    expect(config.ai.maxCostPerDocument).toBe(0.10);
    expect(config.transforms.defaultType).toBe('text');
    expect(config.storage.maxCacheMb).toBe(500);
  });

  it('loads config from a JSON file', () => {
    const configPath = tmpConfigPath();
    const data = makeConfig({ connection: { mode: 'ssh', ssh: { host: '10.11.99.1', username: 'root' } } });
    fs.writeFileSync(configPath, JSON.stringify(data), 'utf-8');
    const mgr = new ConfigManager(configPath);
    const loaded = mgr.load();
    expect(loaded.connection.mode).toBe('ssh');
    expect(loaded.connection.ssh?.host).toBe('10.11.99.1');
    fs.unlinkSync(configPath);
  });

  it('throws on malformed JSON', () => {
    const configPath = tmpConfigPath();
    fs.writeFileSync(configPath, 'not json at all', 'utf-8');
    const mgr = new ConfigManager(configPath);
    expect(() => mgr.load()).toThrow(/Failed to read config/);
    fs.unlinkSync(configPath);
  });
});

// ─── ConfigManager.save ──────────────────────────────────────────────────────

describe('ConfigManager.save', () => {
  it('writes config JSON to disk and re-reads it', () => {
    const configPath = tmpConfigPath();
    const mgr = new ConfigManager(configPath);
    const config = makeConfig();
    mgr.save(config);
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as InkSightConfig;
    expect(parsed.connection.mode).toBe('cloud');
    expect(parsed.ai.provider).toBe('openai');
    fs.unlinkSync(configPath);
  });

  it('creates parent directory if it does not exist', () => {
    const dir = path.join(os.tmpdir(), `inksight-dir-${Date.now()}`);
    const configPath = path.join(dir, 'config.json');
    const mgr = new ConfigManager(configPath);
    mgr.save(makeConfig());
    expect(fs.existsSync(configPath)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });
});

// ─── ConfigManager.validate ──────────────────────────────────────────────────

describe('ConfigManager.validate', () => {
  const mgr = new ConfigManager('/tmp/dummy.json');

  it('returns valid for a complete cloud config', () => {
    const result = mgr.validate(makeConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when connection.mode is missing', () => {
    const result = mgr.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('connection.mode'))).toBe(true);
  });

  it('requires cloud.email and cloud.password for cloud mode', () => {
    const result = mgr.validate({ connection: { mode: 'cloud' } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cloud.email'))).toBe(true);
    expect(result.errors.some((e) => e.includes('cloud.password'))).toBe(true);
  });

  it('requires ssh.host and ssh.username for ssh mode', () => {
    const result = mgr.validate({ connection: { mode: 'ssh' } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ssh.host'))).toBe(true);
    expect(result.errors.some((e) => e.includes('ssh.username'))).toBe(true);
  });

  it('accepts valid hybrid config with both cloud and ssh', () => {
    const result = mgr.validate({
      connection: {
        mode: 'hybrid',
        cloud: { email: 'a@b.com', password: 'pass1234' },
        ssh: { host: '10.11.99.1', username: 'root' },
      },
    });
    expect(result.valid).toBe(true);
  });
});

// ─── ConfigManager.loadWithEnvOverrides ──────────────────────────────────────

describe('ConfigManager.loadWithEnvOverrides', () => {
  let configPath: string;

  beforeEach(() => {
    configPath = tmpConfigPath();
    const mgr = new ConfigManager(configPath);
    mgr.save(makeConfig());
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    // Restore env vars
    delete process.env.INKSIGHT_AI_PROVIDER;
    delete process.env.INKSIGHT_OPENAI_KEY;
    delete process.env.INKSIGHT_CONNECTION_MODE;
    delete process.env.INKSIGHT_MAX_CACHE_MB;
    delete process.env.INKSIGHT_OUTPUT_DIR;
  });

  it('env INKSIGHT_AI_PROVIDER overrides file provider', () => {
    process.env.INKSIGHT_AI_PROVIDER = 'anthropic';
    const mgr = new ConfigManager(configPath);
    const config = mgr.loadWithEnvOverrides();
    expect(config.ai.provider).toBe('anthropic');
  });

  it('env INKSIGHT_OPENAI_KEY overrides file key', () => {
    process.env.INKSIGHT_OPENAI_KEY = 'sk-env-override';
    const mgr = new ConfigManager(configPath);
    const config = mgr.loadWithEnvOverrides();
    expect(config.ai.openaiApiKey).toBe('sk-env-override');
  });

  it('env INKSIGHT_CONNECTION_MODE overrides mode', () => {
    process.env.INKSIGHT_CONNECTION_MODE = 'ssh';
    const mgr = new ConfigManager(configPath);
    const config = mgr.loadWithEnvOverrides();
    expect(config.connection.mode).toBe('ssh');
  });

  it('env INKSIGHT_MAX_CACHE_MB overrides cache size', () => {
    process.env.INKSIGHT_MAX_CACHE_MB = '999';
    const mgr = new ConfigManager(configPath);
    const config = mgr.loadWithEnvOverrides();
    expect(config.storage.maxCacheMb).toBe(999);
  });

  it('env INKSIGHT_OUTPUT_DIR overrides outputDir', () => {
    process.env.INKSIGHT_OUTPUT_DIR = '/custom/output';
    const mgr = new ConfigManager(configPath);
    const config = mgr.loadWithEnvOverrides();
    expect(config.transforms.outputDir).toBe('/custom/output');
  });
});

// ─── ConfigManager.defaults ──────────────────────────────────────────────────

describe('ConfigManager.defaults', () => {
  it('returns a complete config with required fields', () => {
    const d = ConfigManager.defaults();
    expect(d.connection.mode).toBeTruthy();
    expect(d.ai.provider).toBeTruthy();
    expect(d.transforms.outputDir).toBeTruthy();
    expect(d.storage.dbPath).toBeTruthy();
    expect(d.storage.maxCacheMb).toBeGreaterThan(0);
  });
});

// ─── PRESETS ─────────────────────────────────────────────────────────────────

describe('PRESETS', () => {
  it('all presets have name, description, transforms, options', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(preset.name, `${key}.name`).toBeTruthy();
      expect(preset.description, `${key}.description`).toBeTruthy();
      expect(Array.isArray(preset.transforms), `${key}.transforms`).toBe(true);
      expect(preset.transforms.length, `${key}.transforms.length`).toBeGreaterThan(0);
      expect(typeof preset.options, `${key}.options`).toBe('object');
    }
  });

  it('all preset transform types are valid', () => {
    const valid = new Set(['text', 'diagram', 'summary', 'metadata']);
    for (const [key, preset] of Object.entries(PRESETS)) {
      for (const t of preset.transforms) {
        expect(valid.has(t), `${key} has invalid transform type: ${t}`).toBe(true);
      }
    }
  });

  it('getPreset returns correct preset by name', () => {
    const p = getPreset('quick-text');
    expect(p).toBeDefined();
    expect(p!.name).toBe('Quick Text');
  });

  it('getPreset returns undefined for unknown name', () => {
    expect(getPreset('nonexistent')).toBeUndefined();
  });

  it('listPresets returns all preset keys', () => {
    const keys = listPresets();
    expect(keys).toContain('quick-text');
    expect(keys).toContain('full-analysis');
    expect(keys).toContain('diagram-focus');
    expect(keys).toContain('meeting-notes');
    expect(keys).toContain('archive');
  });
});

// ─── EXPORT_TEMPLATES ────────────────────────────────────────────────────────

describe('EXPORT_TEMPLATES', () => {
  const result = makeTransformResult();
  const meta = makeMetadata();

  it('all templates produce non-empty output', () => {
    for (const [name, tpl] of Object.entries(EXPORT_TEMPLATES)) {
      const out = tpl.template(result, meta);
      expect(out.length, `${name} produced empty output`).toBeGreaterThan(0);
    }
  });

  it('obsidian-note includes YAML frontmatter and tags', () => {
    const out = EXPORT_TEMPLATES['obsidian-note'].template(result, meta);
    expect(out).toContain('---');
    expect(out).toContain('tags:');
    expect(out).toContain('date:');
  });

  it('obsidian-note extension is md', () => {
    expect(EXPORT_TEMPLATES['obsidian-note'].extension).toBe('md');
  });

  it('notion-import produces Markdown without YAML frontmatter', () => {
    const out = EXPORT_TEMPLATES['notion-import'].template(result, meta);
    expect(out).toContain('# InkSight Note');
    expect(out).not.toMatch(/^---\n/);
  });

  it('plain-text extension is txt', () => {
    expect(EXPORT_TEMPLATES['plain-text'].extension).toBe('txt');
  });

  it('json-export produces valid JSON', () => {
    const out = EXPORT_TEMPLATES['json-export'].template(result, meta);
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.result).toBeTruthy();
    expect(parsed.metadata).toBeTruthy();
  });

  it('getExportTemplate returns template by name', () => {
    const tpl = getExportTemplate('plain-text');
    expect(tpl).toBeDefined();
    expect(tpl!.name).toBe('Plain Text');
  });

  it('getExportTemplate returns undefined for unknown name', () => {
    expect(getExportTemplate('nonexistent')).toBeUndefined();
  });

  it('listExportTemplates returns all keys', () => {
    const keys = listExportTemplates();
    expect(keys).toContain('obsidian-note');
    expect(keys).toContain('notion-import');
    expect(keys).toContain('plain-text');
    expect(keys).toContain('json-export');
  });
});
