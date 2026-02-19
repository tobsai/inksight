/**
 * AI Provider Abstraction — Phase 3.1
 *
 * Base interfaces and types for the multi-provider AI system.
 * Providers receive a rendered image of an ink page and return
 * transformed text/markdown without any cloud dependency.
 */

export type TransformType =
  | 'text'
  | 'diagram'
  | 'summary'
  | 'action-items'
  | 'translate';

export type AIProvider = 'openai' | 'anthropic' | 'auto';

export interface TransformRequest {
  /** PNG or JPEG image of the ink page */
  imageData: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  transformType: TransformType;
  options?: {
    /** Target language for translate type */
    language?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

export interface TransformResult {
  provider: AIProvider;
  model: string;
  /** The transformed text/markdown output */
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD */
  costUsd: number;
  durationMs: number;
}

export interface AIProviderConfig {
  apiKey: string;
  /** Override the provider's default model */
  model?: string;
  /** Default: 3 */
  maxRetries?: number;
  /** Default: 60 000 ms */
  timeoutMs?: number;
}

export interface AITransformProvider {
  readonly name: AIProvider;
  readonly defaultModel: string;

  /** Returns true if the API key is configured */
  isAvailable(): boolean;

  transform(request: TransformRequest): Promise<TransformResult>;

  estimateCost(inputTokens: number, outputTokens: number): number;
}
