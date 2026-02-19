/**
 * OpenAI Provider — Phase 3.1
 *
 * Sends rendered ink images to GPT-4o (vision-capable) for transformation.
 *
 * Pricing (as of 2024):
 *   gpt-4o: $2.50 / 1M input tokens, $10.00 / 1M output tokens
 */

import OpenAI from 'openai';
import type {
  AIProvider,
  AIProviderConfig,
  AITransformProvider,
  TransformRequest,
  TransformResult,
} from './provider.js';
import { SYSTEM_PROMPTS } from './system-prompts.js';

const INPUT_COST_PER_TOKEN = 2.5 / 1_000_000;   // $2.50 / 1M
const OUTPUT_COST_PER_TOKEN = 10.0 / 1_000_000; // $10.00 / 1M

export class OpenAIProvider implements AITransformProvider {
  readonly name: AIProvider = 'openai';
  readonly defaultModel = 'gpt-4o';

  private client: OpenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
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

    const base64Image = request.imageData.toString('base64');
    const dataUrl = `data:${request.mimeType};base64,${base64Image}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' },
          },
          {
            type: 'text',
            text:
              request.transformType === 'translate' && request.options?.language
                ? `Please translate to: ${request.options.language}`
                : 'Please process this handwritten ink page.',
          },
        ],
      },
    ];

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: request.options?.maxTokens ?? 4096,
      temperature: request.options?.temperature ?? 0,
    });

    const choice = response.choices[0];
    const content = choice.message.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
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
    return (
      inputTokens * INPUT_COST_PER_TOKEN +
      outputTokens * OUTPUT_COST_PER_TOKEN
    );
  }
}
