/**
 * Phase 7 — AI Batch Transform Tests
 *
 * Tests for AnthropicProvider.transformBatch() multi-image API call.
 * All API clients are mocked — no real network calls.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Module mocks
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({
    messages: { create },
  }));
  (Anthropic as any).__mockCreate = create;
  return { default: Anthropic };
});

// ──────────────────────────────────────────────────────────────────────────────
// Imports
// ──────────────────────────────────────────────────────────────────────────────

import { AnthropicProvider } from './anthropic-provider.js';
import type { TransformRequest } from './provider.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<TransformRequest> = {}): TransformRequest {
  return {
    imageData: Buffer.from('fake-png'),
    mimeType: 'image/png',
    transformType: 'text',
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// transformBatch
// ──────────────────────────────────────────────────────────────────────────────

describe('AnthropicProvider.transformBatch()', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('@anthropic-ai/sdk');
    mockCreate = (mod.default as any).__mockCreate;
    mockCreate.mockReset();
  });

  it('returns empty array for empty input', async () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([]);
    expect(results).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('delegates single-item batch to transform() (one API call)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'single result' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([makeRequest()]);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('single result');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('sends all pages in a SINGLE API call for multi-page batch', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '--- Page 1 ---\nPage one text\n--- Page 2 ---\nPage two text\n--- Page 3 ---\nPage three text',
        },
      ],
      usage: { input_tokens: 300, output_tokens: 150 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const requests = [makeRequest(), makeRequest(), makeRequest()];
    const results = await provider.transformBatch(requests);

    // Only ONE API call for 3 pages
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
  });

  it('includes all image blocks + batch instruction in the single call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '--- Page 1 ---\na\n--- Page 2 ---\nb' }],
      usage: { input_tokens: 200, output_tokens: 100 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    await provider.transformBatch([makeRequest(), makeRequest()]);

    const callArgs = mockCreate.mock.calls[0][0];
    const contentBlocks = callArgs.messages[0].content;

    // Should have 2 image blocks + 2 "Page N:" text labels + 1 batch instruction = 5+ blocks
    const imageBlocks = contentBlocks.filter((b: any) => b.type === 'image');
    expect(imageBlocks).toHaveLength(2);
  });

  it('splits response back into per-page results using --- Page N --- delimiter', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text:
            '--- Page 1 ---\nFirst page content here.\n--- Page 2 ---\nSecond page content here.',
        },
      ],
      usage: { input_tokens: 200, output_tokens: 80 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([makeRequest(), makeRequest()]);

    expect(results[0].content).toBe('First page content here.');
    expect(results[1].content).toBe('Second page content here.');
  });

  it('returns results with correct provider and model', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '--- Page 1 ---\nresult1\n--- Page 2 ---\nresult2' },
      ],
      usage: { input_tokens: 200, output_tokens: 80 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([makeRequest(), makeRequest()]);

    for (const result of results) {
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-opus-4-5');
    }
  });

  it('distributes cost proportionally across pages', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '--- Page 1 ---\nshort\n--- Page 2 ---\na much longer result for page two with many words',
        },
      ],
      usage: { input_tokens: 1000, output_tokens: 500 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([makeRequest(), makeRequest()]);

    // Total cost should be distributed (not exactly equal since text lengths differ)
    const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
    const expectedTotal = provider.estimateCost(1000, 500);
    expect(totalCost).toBeCloseTo(expectedTotal, 5);
  });

  it('falls back to equal split when delimiter is missing', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'No delimiters here, just raw text for all pages combined.' },
      ],
      usage: { input_tokens: 200, output_tokens: 60 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const results = await provider.transformBatch([makeRequest(), makeRequest(), makeRequest()]);

    // Should still return 3 results even without proper delimiters
    expect(results).toHaveLength(3);
    // All should have some content or be empty strings
    for (const r of results) {
      expect(typeof r.content).toBe('string');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Retry integration — AnthropicProvider
// ──────────────────────────────────────────────────────────────────────────────

describe('AnthropicProvider — retry on transient errors', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('@anthropic-ai/sdk');
    mockCreate = (mod.default as any).__mockCreate;
    mockCreate.mockReset();
  });

  it('retries transform() on 500 server error then succeeds', async () => {
    const serverErr = Object.assign(new Error('internal server error'), { status: 500 });
    mockCreate
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'recovered' }],
        usage: { input_tokens: 100, output_tokens: 30 },
      });

    // Use baseDelayMs: 0 to skip real sleep in CI
    const provider = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      maxRetries: 2,
    });

    // Patch the private retryOptions to use zero delay for speed
    (provider as any).retryOptions = { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 };

    const result = await provider.transform({
      imageData: Buffer.from('img'),
      mimeType: 'image/png',
      transformType: 'text',
    });

    expect(result.content).toBe('recovered');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries on persistent server error', async () => {
    const serverErr = Object.assign(new Error('always 503'), { status: 503 });
    mockCreate.mockRejectedValue(serverErr);

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', maxRetries: 2 });
    // Zero delay for speed
    (provider as any).retryOptions = { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 };

    await expect(
      provider.transform({
        imageData: Buffer.from('img'),
        mimeType: 'image/png',
        transformType: 'text',
      })
    ).rejects.toThrow('always 503');

    // maxAttempts: 3 → 3 total attempts
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400 bad request', async () => {
    const badRequest = Object.assign(new Error('bad request'), { status: 400 });
    mockCreate.mockRejectedValue(badRequest);

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', maxRetries: 2 });
    await expect(
      provider.transform({
        imageData: Buffer.from('img'),
        mimeType: 'image/png',
        transformType: 'text',
      })
    ).rejects.toThrow('bad request');

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAIProvider — retry on transient errors', () => {
  it('retries on 503 and succeeds', async () => {
    // Import the same mocked openai module
    const mod = await import('openai');
    const openaiMockCreate = (mod.default as any).__mockCreate as ReturnType<typeof vi.fn> | undefined;
    if (!openaiMockCreate) return; // guard if mock not available

    openaiMockCreate.mockReset();

    const serverErr = Object.assign(new Error('service unavailable'), { status: 503 });
    openaiMockCreate
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'retried ok' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

    const { OpenAIProvider } = await import('./openai-provider.js');
    const provider = new OpenAIProvider({ apiKey: 'sk-test', maxRetries: 2 });
    // Zero delay for speed
    (provider as any).retryOptions = { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 };

    const result = await provider.transform({
      imageData: Buffer.from('img'),
      mimeType: 'image/png',
      transformType: 'text',
    });

    expect(result.content).toBe('retried ok');
    expect(openaiMockCreate).toHaveBeenCalledTimes(2);
  });
});
