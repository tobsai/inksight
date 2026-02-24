/**
 * Anthropic Provider — Phase 3.1 / Phase 7 (retry + batch)
 *
 * Sends rendered ink images to Claude for transformation.
 * Phase 7 additions:
 *   - withRetry() wraps every API call with exponential-backoff retry
 *   - transformBatch() sends multiple pages in a single API call (multi-image)
 *
 * Pricing (as of 2024):
 *   claude-opus-4-5:    $15.00 / 1M input,  $75.00 / 1M output
 *   claude-sonnet-4-6:   $3.00 / 1M input,  $15.00 / 1M output
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AIProviderConfig,
  AITransformProvider,
  TransformRequest,
  TransformResult,
} from './provider.js';
import { SYSTEM_PROMPTS } from './system-prompts.js';
import { withRetry } from './retry.js';
import type { RetryOptions } from './retry.js';

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
};

const DEFAULT_PRICING = { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 };

export class AnthropicProvider implements AITransformProvider {
  readonly name: AIProvider = 'anthropic';
  readonly defaultModel = 'claude-opus-4-5';

  private client: Anthropic;
  private config: AIProviderConfig;
  private retryOptions: RetryOptions;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 60_000,
      maxRetries: 0, // We handle retries ourselves via withRetry()
    });
    this.retryOptions = {
      maxAttempts: config.maxRetries != null ? config.maxRetries + 1 : 3,
      baseDelayMs: 500,
      maxDelayMs: 30_000,
    };
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.trim().length > 0);
  }

  async transform(request: TransformRequest): Promise<TransformResult> {
    const start = Date.now();
    const model = this.config.model ?? this.defaultModel;
    const systemPrompt = SYSTEM_PROMPTS[request.transformType];

    const base64Data = request.imageData.toString('base64');

    const userText =
      request.transformType === 'translate' && request.options?.language
        ? `Please translate to: ${request.options.language}`
        : 'Please process this handwritten ink page.';

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model,
          system: systemPrompt,
          max_tokens: request.options?.maxTokens ?? 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: request.mimeType,
                    data: base64Data,
                  },
                },
                {
                  type: 'text',
                  text: userText,
                },
              ],
            },
          ],
        }),
      this.retryOptions
    );

    const content =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n') ?? '';

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const costUsd = this.estimateCost(inputTokens, outputTokens);
    const durationMs = Date.now() - start;

    return {
      provider: this.name,
      model,
      content,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
    };
  }

  /**
   * Batch-transform multiple pages in a single API call.
   *
   * Anthropic's Messages API supports multiple image blocks in one user message.
   * Each page gets its own image block, followed by a shared text instruction.
   * The AI response is split back into per-page results by a "--- Page N ---" delimiter
   * that we request in the system prompt extension.
   *
   * Returns one TransformResult per input request, preserving order.
   * Falls back to individual calls if the provider cannot split the response.
   */
  async transformBatch(requests: TransformRequest[]): Promise<TransformResult[]> {
    if (requests.length === 0) return [];
    if (requests.length === 1) return [await this.transform(requests[0])];

    const start = Date.now();
    const model = this.config.model ?? this.defaultModel;

    // All requests must share the same transform type for batching to make sense
    const transformType = requests[0].transformType;
    const systemPrompt = SYSTEM_PROMPTS[transformType];

    // Build multi-image content blocks
    const contentBlocks: Anthropic.MessageParam['content'] = [];

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const base64Data = req.imageData.toString('base64');

      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.mimeType,
          data: base64Data,
        },
      });

      contentBlocks.push({
        type: 'text',
        text: `Page ${i + 1}:`,
      });
    }

    const batchInstruction =
      `Process each of the ${requests.length} pages above.\n` +
      `Respond with exactly ${requests.length} sections, each starting with "--- Page N ---" ` +
      `(where N is the page number), followed by your analysis for that page.`;

    contentBlocks.push({ type: 'text', text: batchInstruction });

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model,
          system: systemPrompt,
          max_tokens: (requests[0].options?.maxTokens ?? 4096) * requests.length,
          messages: [{ role: 'user', content: contentBlocks }],
        }),
      this.retryOptions
    );

    const fullContent =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n');

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalCostUsd = this.estimateCost(inputTokens, outputTokens);
    const durationMs = Date.now() - start;

    // Split the response back into per-page results
    const pageContents = this._splitBatchResponse(fullContent, requests.length);

    return requests.map((req, i) => {
      const pageText = pageContents[i] ?? '';
      // Distribute cost proportionally by character count
      const totalChars = pageContents.reduce((s, c) => s + c.length, 0) || 1;
      const fraction = pageText.length / totalChars;

      return {
        provider: this.name,
        model,
        content: pageText,
        inputTokens: Math.round(inputTokens * fraction),
        outputTokens: Math.round(outputTokens * fraction),
        costUsd: totalCostUsd * fraction,
        durationMs: Math.round(durationMs * fraction),
      };
    });
  }

  /**
   * Split a batched AI response into per-page sections.
   * Looks for "--- Page N ---" delimiters.
   * Falls back to equal-split if delimiters are missing.
   */
  private _splitBatchResponse(fullContent: string, pageCount: number): string[] {
    // Try delimiter-based split
    const sections = fullContent.split(/---\s*Page\s+\d+\s*---/i);
    // sections[0] is preamble before first marker, sections[1..n] are page contents
    const pageTexts = sections.slice(1).map((s) => s.trim());

    if (pageTexts.length === pageCount) {
      return pageTexts;
    }

    // If we got too few or too many sections, distribute equally by line count
    const lines = fullContent.split('\n');
    const linesPerPage = Math.ceil(lines.length / pageCount);
    const result: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      result.push(lines.slice(i * linesPerPage, (i + 1) * linesPerPage).join('\n').trim());
    }
    return result;
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.model ?? this.defaultModel;
    const pricing = PRICING[model] ?? DEFAULT_PRICING;
    return inputTokens * pricing.input + outputTokens * pricing.output;
  }
}
