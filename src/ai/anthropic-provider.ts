/**
 * Anthropic Provider — Phase 3.1
 *
 * Sends rendered ink images to Claude for transformation.
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

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 60_000,
      maxRetries: config.maxRetries ?? 3,
    });
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

    const response = await this.client.messages.create({
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
    });

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

  estimateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.model ?? this.defaultModel;
    const pricing = PRICING[model] ?? DEFAULT_PRICING;
    return inputTokens * pricing.input + outputTokens * pricing.output;
  }
}
