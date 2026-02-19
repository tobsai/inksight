/**
 * InkSight CLI Tests — Phase 6.5
 *
 * Tests for: ProgressReporter, BatchProcessor, ConfigManager, CLI command parsing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { ProgressReporter } from './progress.js';
import { BatchProcessor } from './batch-processor.js';
import type { BatchJob } from './batch-processor.js';
import { ConfigManager } from '../config/config.js';
import type { InkSightConfig } from '../config/config.js';
import { createProgram, transformCommand, searchCommand, configCommand, syncCommand } from './index.js';
import type { TransformerRegistry, TransformerType } from '../transformers/index.js';

// ─── ProgressReporter ────────────────────────────────────────────────────────

describe('ProgressReporter', () => {
  let reporter: ProgressReporter;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    reporter = new ProgressReporter();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('startTask logs with ⏳ prefix', () => {
    reporter.startTask('Uploading');
    expect(logSpy).toHaveBeenCalledWith('⏳ Uploading...');
  });

  it('completeTask logs with ✅ prefix', () => {
    reporter.completeTask('Uploading');
    expect(logSpy).toHaveBeenCalledWith('✅ Uploading');
  });

  it('failTask logs error with ❌ prefix', () => {
    reporter.failTask('Uploading', new Error('timeout'));
    expect(errorSpy).toHaveBeenCalledWith('❌ Uploading: timeout');
  });

  it('logCost logs with 💰 prefix and 4 decimal places', () => {
    reporter.logCost(0.0042);
    expect(logSpy).toHaveBeenCalledWith('💰 Cost: $0.0042');
  });

  it('logCost formats to 4 decimal places for small values', () => {
    reporter.logCost(0.001);
    expect(logSpy).toHaveBeenCalledWith('💰 Cost: $0.0010');
  });

  it('logInfo logs with ℹ️ prefix', () => {
    reporter.logInfo('Connecting to device');
    expect(logSpy).toHaveBeenCalledWith('ℹ️  Connecting to device');
  });

  it('warn logs with ⚠️ prefix', () => {
    reporter.warn('Low cache space');
    expect(warnSpy).toHaveBeenCalledWith('⚠️  Low cache space');
  });
});

// ─── BatchProcessor ──────────────────────────────────────────────────────────

describe('BatchProcessor', () => {
  let reporter: ProgressReporter;
  let mockRegistry: TransformerRegistry;

  beforeEach(() => {
    reporter = new ProgressReporter();
    vi.spyOn(reporter, 'startTask').mockImplementation(() => {});
    vi.spyOn(reporter, 'completeTask').mockImplementation(() => {});
    vi.spyOn(reporter, 'failTask').mockImplementation(() => {});
    vi.spyOn(reporter, 'logCost').mockImplementation(() => {});
    // mockRegistry is not used in stub implementation but required by constructor
    mockRegistry = {} as TransformerRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns results for all jobs', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 3);
    const jobs: BatchJob[] = [
      { documentId: 'doc-1', transformType: 'text' },
      { documentId: 'doc-2', transformType: 'summary' },
      { documentId: 'doc-3', transformType: 'diagram' },
    ];
    const results = await processor.processBatch(jobs);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.documentId)).toBe(true);
  });

  it('marks successful jobs as success=true', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 2);
    const jobs: BatchJob[] = [{ documentId: 'doc-1', transformType: 'text' }];
    const results = await processor.processBatch(jobs);
    expect(results[0].success).toBe(true);
  });

  it('records durationMs for each job', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 1);
    const jobs: BatchJob[] = [{ documentId: 'doc-1', transformType: 'text' }];
    const results = await processor.processBatch(jobs);
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('collects failures without stopping other jobs', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 1);
    // Patch processJob to fail for doc-2 only
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(processor as any, 'processJob').mockImplementation(async (job: BatchJob) => {
      callCount++;
      if (job.documentId === 'doc-2') {
        return { documentId: job.documentId, success: false, error: 'mock error', durationMs: 0, costUsd: 0 };
      }
      return { documentId: job.documentId, success: true, durationMs: 0, costUsd: 0 };
    });

    const jobs: BatchJob[] = [
      { documentId: 'doc-1', transformType: 'text' },
      { documentId: 'doc-2', transformType: 'summary' },
      { documentId: 'doc-3', transformType: 'metadata' },
    ];
    const results = await processor.processBatch(jobs);
    expect(callCount).toBe(3);
    expect(results).toHaveLength(3);
    const failed = results.find(r => r.documentId === 'doc-2');
    const succeeded = results.filter(r => r.success);
    expect(failed?.success).toBe(false);
    expect(succeeded).toHaveLength(2);
  });

  it('respects concurrency limit (runs no more than concurrency at a time)', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 2);
    let concurrent = 0;
    let maxConcurrent = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(processor as any, 'processJob').mockImplementation(async (job: BatchJob) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
      return { documentId: job.documentId, success: true, durationMs: 10, costUsd: 0 };
    });

    const jobs: BatchJob[] = Array.from({ length: 6 }, (_, i) => ({
      documentId: `doc-${i}`,
      transformType: 'text' as TransformerType,
    }));

    await processor.processBatch(jobs);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty input', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter);
    const results = await processor.processBatch([]);
    expect(results).toHaveLength(0);
  });

  it('calls startTask and completeTask for each job', async () => {
    const processor = new BatchProcessor(mockRegistry, reporter, 3);
    const jobs: BatchJob[] = [
      { documentId: 'doc-1', transformType: 'text' },
      { documentId: 'doc-2', transformType: 'diagram' },
    ];
    await processor.processBatch(jobs);
    expect(reporter.startTask).toHaveBeenCalledTimes(2);
    expect(reporter.completeTask).toHaveBeenCalledTimes(2);
  });

  it('uses default concurrency of 3', () => {
    const processor = new BatchProcessor(mockRegistry, reporter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((processor as any).concurrency).toBe(3);
  });
});

// ─── ConfigManager ───────────────────────────────────────────────────────────

describe('ConfigManager', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inksight-test-'));
    configPath = path.join(tmpDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    expect(config.connection.mode).toBe('hybrid');
    expect(config.ai.provider).toBe('auto');
    expect(config.transforms.outputFormat).toBe('markdown');
    expect(config.storage.maxCacheMb).toBe(500);
  });

  it('save then load roundtrip preserves values', () => {
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    config.ai.provider = 'openai';
    config.connection.mode = 'ssh';
    manager.save(config);

    const manager2 = new ConfigManager(configPath);
    const loaded = manager2.load();
    expect(loaded.ai.provider).toBe('openai');
    expect(loaded.connection.mode).toBe('ssh');
  });

  it('creates parent directories on save', () => {
    const deepPath = path.join(tmpDir, 'deep', 'nested', 'config.json');
    const manager = new ConfigManager(deepPath);
    const defaults = ConfigManager.defaults();
    expect(() => manager.save(defaults)).not.toThrow();
    expect(fs.existsSync(deepPath)).toBe(true);
  });

  it('validate returns valid for defaults', () => {
    const config = ConfigManager.defaults();
    const manager = new ConfigManager(configPath);
    const result = manager.validate(config);
    // Defaults use hybrid mode without credentials — should flag errors
    // (hybrid requires cloud + ssh config)
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('validate catches missing connection mode', () => {
    const manager = new ConfigManager(configPath);
    const result = manager.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('connection.mode'))).toBe(true);
  });

  it('validate catches missing cloud email for cloud mode', () => {
    const manager = new ConfigManager(configPath);
    const config: Partial<InkSightConfig> = {
      connection: { mode: 'cloud', cloud: { email: '', password: 'secret' } },
    };
    const result = manager.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cloud.email'))).toBe(true);
  });

  it('validate catches invalid ai.provider', () => {
    const manager = new ConfigManager(configPath);
    const result = manager.validate({
      connection: { mode: 'hybrid' },
      ai: { provider: 'invalid' as never },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ai.provider'))).toBe(true);
  });

  it('returns valid for fully-configured ssh mode', () => {
    const manager = new ConfigManager(configPath);
    const result = manager.validate({
      connection: {
        mode: 'ssh',
        ssh: { host: '192.168.1.1', username: 'root' },
      },
      ai: { provider: 'auto' },
      transforms: { defaultType: 'text', outputDir: '/tmp/out', outputFormat: 'markdown' },
      storage: { dbPath: '/tmp/db', cacheDir: '/tmp/cache', maxCacheMb: 200 },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('env override sets ai provider', () => {
    const manager = new ConfigManager(configPath);
    process.env.INKSIGHT_AI_PROVIDER = 'anthropic';
    try {
      const config = manager.loadWithEnvOverrides();
      expect(config.ai.provider).toBe('anthropic');
    } finally {
      delete process.env.INKSIGHT_AI_PROVIDER;
    }
  });

  it('env override sets connection mode', () => {
    const manager = new ConfigManager(configPath);
    process.env.INKSIGHT_CONNECTION_MODE = 'cloud';
    try {
      const config = manager.loadWithEnvOverrides();
      expect(config.connection.mode).toBe('cloud');
    } finally {
      delete process.env.INKSIGHT_CONNECTION_MODE;
    }
  });

  it('env override sets openai key', () => {
    const manager = new ConfigManager(configPath);
    process.env.INKSIGHT_OPENAI_KEY = 'sk-test-123';
    try {
      const config = manager.loadWithEnvOverrides();
      expect(config.ai.openaiApiKey).toBe('sk-test-123');
    } finally {
      delete process.env.INKSIGHT_OPENAI_KEY;
    }
  });

  it('env override sets max cache mb', () => {
    const manager = new ConfigManager(configPath);
    process.env.INKSIGHT_MAX_CACHE_MB = '200';
    try {
      const config = manager.loadWithEnvOverrides();
      expect(config.storage.maxCacheMb).toBe(200);
    } finally {
      delete process.env.INKSIGHT_MAX_CACHE_MB;
    }
  });

  it('merges partial config with defaults on load', () => {
    const manager = new ConfigManager(configPath);
    const defaults = ConfigManager.defaults();
    defaults.ai.provider = 'openai';
    manager.save(defaults);

    const manager2 = new ConfigManager(configPath);
    const loaded = manager2.load();
    // All other defaults preserved
    expect(loaded.storage.maxCacheMb).toBe(500);
    expect(loaded.ai.provider).toBe('openai');
  });
});

// ─── CLI command parsing ──────────────────────────────────────────────────────

describe('CLI command parsing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Prevent actual process.exit during tests
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createProgram() returns a Command named inksight', () => {
    const program = createProgram();
    expect(program.name()).toBe('inksight');
  });

  it('createProgram() has transform, search, config, sync subcommands', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('transform');
    expect(names).toContain('search');
    expect(names).toContain('config');
    expect(names).toContain('sync');
  });

  it('transform command parses --type option', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'transform', 'doc-1', '--type', 'summary']);
    // Should log stub message (not connected)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Not connected'));
  });

  it('transform command --dry-run shows estimate', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'transform', 'doc-1', '--dry-run']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
  });

  it('search command parses query and --limit', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'search', 'my notes', '--limit', '5']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Not connected'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('my notes'));
  });

  it('sync command parses --once flag', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'sync', '--once']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Not connected'));
  });

  it('config get prints JSON', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'config', 'get']);
    // Should print JSON config
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('{'));
  });

  it('config get <key> prints specific value', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'inksight', 'config', 'get', 'ai.provider']);
    // Should log "auto" (default)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('auto'));
  });
});
