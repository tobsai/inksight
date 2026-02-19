/**
 * Phase 3.1 — AI Provider Abstraction Tests
 *
 * All tests use mocked API clients — no real network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ──────────────────────────────────────────────────────────────────────────────
// Module mocks (must be declared before imports that use them)
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('openai', () => {
  const create = vi.fn();
  const OpenAI = vi.fn(() => ({
    chat: { completions: { create } },
  }));
  (OpenAI as any).__mockCreate = create;
  return { default: OpenAI };
});

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({
    messages: { create },
  }));
  (Anthropic as any).__mockCreate = create;
  return { default: Anthropic };
});

// ──────────────────────────────────────────────────────────────────────────────
// Imports (after mocks are defined)
// ──────────────────────────────────────────────────────────────────────────────

import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { AIProviderRegistry } from './provider-registry.js';
import { CostTracker } from './cost-tracker.js';
import { SYSTEM_PROMPTS } from './system-prompts.js';
import type { TransformRequest, TransformResult } from './provider.js';

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeImageRequest(
  overrides: Partial<TransformRequest> = {}
): TransformRequest {
  return {
    imageData: Buffer.from('fake-png-data'),
    mimeType: 'image/png',
    transformType: 'text',
    ...overrides,
  };
}

function makeTransformResult(overrides: Partial<TransformResult> = {}): TransformResult {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    content: 'Hello, world!',
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.0045,
    durationMs: 350,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// OpenAIProvider
// ──────────────────────────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  let openaiMockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const openaiMod = await import('openai');
    openaiMockCreate = (openaiMod.default as any).__mockCreate;
    openaiMockCreate.mockReset();
  });

  it('isAvailable() returns true when apiKey is set', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    expect(provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when apiKey is empty', () => {
    const provider = new OpenAIProvider({ apiKey: '' });
    expect(provider.isAvailable()).toBe(false);
  });

  it('has correct name and defaultModel', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    expect(provider.name).toBe('openai');
    expect(provider.defaultModel).toBe('gpt-4o');
  });

  it('transform() sends image as base64 data URL in message', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Transcribed text' } }],
      usage: { prompt_tokens: 500, completion_tokens: 100 },
    });

    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    const req = makeImageRequest();
    await provider.transform(req);

    expect(openaiMockCreate).toHaveBeenCalledOnce();
    const callArgs = openaiMockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[1];
    const imageContent = userMessage.content.find(
      (c: any) => c.type === 'image_url'
    );
    expect(imageContent.image_url.url).toMatch(
      /^data:image\/png;base64,/
    );
    const expectedBase64 = Buffer.from('fake-png-data').toString('base64');
    expect(imageContent.image_url.url).toContain(expectedBase64);
  });

  it('transform() uses the correct system prompt for each TransformType', async () => {
    const types = ['text', 'diagram', 'summary', 'action-items', 'translate'] as const;

    for (const transformType of types) {
      openaiMockCreate.mockResolvedValue({
        choices: [{ message: { content: 'result' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      });

      const provider = new OpenAIProvider({ apiKey: 'sk-test' });
      await provider.transform(makeImageRequest({ transformType }));

      const callArgs = openaiMockCreate.mock.calls.at(-1)![0];
      const systemMessage = callArgs.messages[0];
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toBe(SYSTEM_PROMPTS[transformType]);
    }
  });

  it('transform() returns correct TransformResult shape', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'My transcribed note' } }],
      usage: { prompt_tokens: 800, completion_tokens: 150 },
    });

    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    const result = await provider.transform(makeImageRequest());

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
    expect(result.content).toBe('My transcribed note');
    expect(result.inputTokens).toBe(800);
    expect(result.outputTokens).toBe(150);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('transform() uses overridden model from config', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });

    const provider = new OpenAIProvider({ apiKey: 'sk-test', model: 'gpt-4-turbo' });
    const result = await provider.transform(makeImageRequest());

    const callArgs = openaiMockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4-turbo');
    expect(result.model).toBe('gpt-4-turbo');
  });

  it('transform() includes language hint for translate type', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'translation' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    await provider.transform(
      makeImageRequest({ transformType: 'translate', options: { language: 'Spanish' } })
    );

    const callArgs = openaiMockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[1].content;
    const textPart = userContent.find((c: any) => c.type === 'text');
    expect(textPart.text).toContain('Spanish');
  });

  it('estimateCost() uses gpt-4o pricing', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    // 1M input + 1M output
    const cost = provider.estimateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(12.5, 1); // $2.50 + $10.00
  });

  it('estimateCost() is proportional', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    const half = provider.estimateCost(500_000, 500_000);
    const full = provider.estimateCost(1_000_000, 1_000_000);
    expect(half).toBeCloseTo(full / 2, 5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AnthropicProvider
// ──────────────────────────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  let anthropicMockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const anthropicMod = await import('@anthropic-ai/sdk');
    anthropicMockCreate = (anthropicMod.default as any).__mockCreate;
    anthropicMockCreate.mockReset();
  });

  it('isAvailable() returns true when apiKey is set', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    expect(provider.isAvailable()).toBe(true);
  });

  it('isAvailable() returns false when apiKey is empty', () => {
    const provider = new AnthropicProvider({ apiKey: '' });
    expect(provider.isAvailable()).toBe(false);
  });

  it('has correct name and defaultModel', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    expect(provider.name).toBe('anthropic');
    expect(provider.defaultModel).toBe('claude-opus-4-5');
  });

  it('transform() sends image as base64 in Anthropic source format', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Result' }],
      usage: { input_tokens: 600, output_tokens: 80 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    await provider.transform(makeImageRequest());

    expect(anthropicMockCreate).toHaveBeenCalledOnce();
    const callArgs = anthropicMockCreate.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content.find(
      (c: any) => c.type === 'image'
    );
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
    const expectedBase64 = Buffer.from('fake-png-data').toString('base64');
    expect(imageBlock.source.data).toBe(expectedBase64);
  });

  it('transform() returns correct TransformResult shape', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Claude output' }],
      usage: { input_tokens: 700, output_tokens: 120 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const result = await provider.transform(makeImageRequest());

    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-opus-4-5');
    expect(result.content).toBe('Claude output');
    expect(result.inputTokens).toBe(700);
    expect(result.outputTokens).toBe(120);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('transform() sets system prompt per TransformType', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    await provider.transform(makeImageRequest({ transformType: 'summary' }));

    const callArgs = anthropicMockCreate.mock.calls[0][0];
    expect(callArgs.system).toBe(SYSTEM_PROMPTS['summary']);
  });

  it('transform() uses overridden model from config', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const provider = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-6',
    });
    const result = await provider.transform(makeImageRequest());

    const callArgs = anthropicMockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('estimateCost() uses opus pricing by default', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const cost = provider.estimateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90.0, 1); // $15 + $75
  });

  it('estimateCost() uses sonnet pricing for sonnet model', () => {
    const provider = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-6',
    });
    const cost = provider.estimateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18.0, 1); // $3 + $15
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CostTracker
// ──────────────────────────────────────────────────────────────────────────────

describe('CostTracker', () => {
  it('starts with zero total cost', () => {
    const tracker = new CostTracker();
    expect(tracker.getTotalCost()).toBe(0);
  });

  it('record() accumulates cost entries', () => {
    const tracker = new CostTracker();
    tracker.record(makeTransformResult({ costUsd: 0.01 }), 'text');
    tracker.record(makeTransformResult({ costUsd: 0.02 }), 'summary');
    expect(tracker.getTotalCost()).toBeCloseTo(0.03, 6);
  });

  it('getCostByProvider() groups costs correctly', () => {
    const tracker = new CostTracker();
    tracker.record(makeTransformResult({ provider: 'openai', costUsd: 0.01 }), 'text');
    tracker.record(makeTransformResult({ provider: 'openai', costUsd: 0.02 }), 'text');
    tracker.record(makeTransformResult({ provider: 'anthropic', costUsd: 0.05 }), 'summary');

    const byProvider = tracker.getCostByProvider();
    expect(byProvider.openai).toBeCloseTo(0.03, 6);
    expect(byProvider.anthropic).toBeCloseTo(0.05, 6);
  });

  it('getCostByTransformType() groups costs correctly', () => {
    const tracker = new CostTracker();
    tracker.record(makeTransformResult({ costUsd: 0.01 }), 'text');
    tracker.record(makeTransformResult({ costUsd: 0.02 }), 'text');
    tracker.record(makeTransformResult({ costUsd: 0.03 }), 'diagram');

    const byType = tracker.getCostByTransformType();
    expect(byType.text).toBeCloseTo(0.03, 6);
    expect(byType.diagram).toBeCloseTo(0.03, 6);
  });

  it('getEntries() returns all entries without filter', () => {
    const tracker = new CostTracker();
    tracker.record(makeTransformResult(), 'text', 'doc-1');
    tracker.record(makeTransformResult(), 'summary', 'doc-2');
    expect(tracker.getEntries()).toHaveLength(2);
  });

  it('getEntries(since) filters by timestamp', async () => {
    const tracker = new CostTracker();
    const before = new Date();
    tracker.record(makeTransformResult(), 'text');

    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date();
    await new Promise((r) => setTimeout(r, 5));

    tracker.record(makeTransformResult(), 'summary');

    const after = tracker.getEntries(cutoff);
    expect(after).toHaveLength(1);
    expect(after[0].transformType).toBe('summary');

    const all = tracker.getEntries(before);
    expect(all).toHaveLength(2);
  });

  it('saveToFile() and loadFromFile() round-trip entries', async () => {
    const tracker = new CostTracker();
    tracker.record(
      makeTransformResult({ provider: 'anthropic', costUsd: 0.123, inputTokens: 999 }),
      'action-items',
      'doc-99'
    );

    const path = join(tmpdir(), `cost-tracker-test-${Date.now()}.json`);
    try {
      await tracker.saveToFile(path);

      const tracker2 = new CostTracker();
      await tracker2.loadFromFile(path);

      const entries = tracker2.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].provider).toBe('anthropic');
      expect(entries[0].costUsd).toBeCloseTo(0.123, 5);
      expect(entries[0].inputTokens).toBe(999);
      expect(entries[0].documentId).toBe('doc-99');
      expect(entries[0].transformType).toBe('action-items');
      expect(entries[0].timestamp).toBeInstanceOf(Date);
    } finally {
      await unlink(path).catch(() => {});
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AIProviderRegistry
// ──────────────────────────────────────────────────────────────────────────────

describe('AIProviderRegistry', () => {
  let openaiMockCreate: ReturnType<typeof vi.fn>;
  let anthropicMockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const oai = await import('openai');
    openaiMockCreate = (oai.default as any).__mockCreate;
    openaiMockCreate.mockReset();

    const ant = await import('@anthropic-ai/sdk');
    anthropicMockCreate = (ant.default as any).__mockCreate;
    anthropicMockCreate.mockReset();
  });

  it('register() and get() work correctly', () => {
    const registry = new AIProviderRegistry();
    const provider = new OpenAIProvider({ apiKey: 'sk-test' });
    registry.register(provider);
    expect(registry.get('openai')).toBe(provider);
    expect(registry.get('anthropic')).toBeUndefined();
  });

  it('getAvailableProviders() returns only available providers', () => {
    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: 'sk-test' }));
    registry.register(new AnthropicProvider({ apiKey: '' })); // no key → unavailable

    const available = registry.getAvailableProviders();
    expect(available).toContain('openai');
    expect(available).not.toContain('anthropic');
  });

  it('auto mode picks the first available provider', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'openai result' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: 'sk-test' }));
    registry.register(new AnthropicProvider({ apiKey: '' })); // unavailable

    const result = await registry.transform(makeImageRequest(), 'auto');
    expect(result.provider).toBe('openai');
    expect(result.content).toBe('openai result');
  });

  it('auto mode falls through to second provider if first unavailable', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'anthropic result' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: '' })); // unavailable
    registry.register(new AnthropicProvider({ apiKey: 'sk-ant-test' }));

    const result = await registry.transform(makeImageRequest(), 'auto');
    expect(result.provider).toBe('anthropic');
    expect(result.content).toBe('anthropic result');
  });

  it('auto mode throws when no provider is available', async () => {
    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: '' }));
    registry.register(new AnthropicProvider({ apiKey: '' }));

    await expect(registry.transform(makeImageRequest(), 'auto')).rejects.toThrow(
      /No available AI provider/
    );
  });

  it('specific provider routing works', async () => {
    anthropicMockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'claude text' }],
      usage: { input_tokens: 200, output_tokens: 60 },
    });

    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: 'sk-test' }));
    registry.register(new AnthropicProvider({ apiKey: 'sk-ant-test' }));

    const result = await registry.transform(makeImageRequest(), 'anthropic');
    expect(result.provider).toBe('anthropic');
    expect(anthropicMockCreate).toHaveBeenCalledOnce();
    expect(openaiMockCreate).not.toHaveBeenCalled();
  });

  it('throws when specific provider is not registered', async () => {
    const registry = new AIProviderRegistry();
    await expect(registry.transform(makeImageRequest(), 'openai')).rejects.toThrow(
      /not registered/
    );
  });

  it('tracks costs via getCostTracker()', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    });

    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: 'sk-test' }));

    await registry.transform(makeImageRequest());
    const tracker = registry.getCostTracker();
    expect(tracker.getTotalCost()).toBeGreaterThan(0);
    expect(tracker.getEntries()).toHaveLength(1);
  });

  it('undefined preferredProvider defaults to auto mode', async () => {
    openaiMockCreate.mockResolvedValue({
      choices: [{ message: { content: 'auto result' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const registry = new AIProviderRegistry();
    registry.register(new OpenAIProvider({ apiKey: 'sk-test' }));

    const result = await registry.transform(makeImageRequest());
    expect(result.provider).toBe('openai');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// System Prompts
// ──────────────────────────────────────────────────────────────────────────────

describe('SYSTEM_PROMPTS', () => {
  const types = ['text', 'diagram', 'summary', 'action-items', 'translate'] as const;

  it('has a prompt for every TransformType', () => {
    for (const type of types) {
      expect(SYSTEM_PROMPTS[type]).toBeTruthy();
      expect(typeof SYSTEM_PROMPTS[type]).toBe('string');
    }
  });

  it('text prompt mentions OCR / handwritten', () => {
    expect(SYSTEM_PROMPTS.text.toLowerCase()).toContain('ocr');
    expect(SYSTEM_PROMPTS.text.toLowerCase()).toContain('handwritten');
  });

  it('diagram prompt mentions mermaid', () => {
    expect(SYSTEM_PROMPTS.diagram.toLowerCase()).toContain('mermaid');
  });

  it('summary prompt mentions summarize / key points', () => {
    const lower = SYSTEM_PROMPTS.summary.toLowerCase();
    expect(lower.includes('summarize') || lower.includes('summary') || lower.includes('key points')).toBe(true);
  });

  it('action-items prompt mentions checklist', () => {
    expect(SYSTEM_PROMPTS['action-items'].toLowerCase()).toContain('checklist');
  });

  it('translate prompt mentions translation', () => {
    expect(SYSTEM_PROMPTS.translate.toLowerCase()).toContain('translat');
  });

  it('all prompts are unique (no duplicates)', () => {
    const unique = new Set(Object.values(SYSTEM_PROMPTS));
    expect(unique.size).toBe(types.length);
  });
});
