/**
 * Base Transformer Class
 * 
 * Abstract base class for all document transformers.
 * Transformers take parsed reMarkable documents and apply AI-powered
 * transformations like text recognition, diagram cleanup, etc.
 */

import type { ParsedDocument } from '../parser/types.js';
import type { AIProvider } from '../ai/provider.js';

export interface TransformerConfig {
  aiProvider: AIProvider;
  options?: Record<string, unknown>;
}

export interface TransformResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata: {
    processingTime: number;
    cost?: number;
    confidence?: number;
  };
}

/**
 * Abstract base class for transformers
 */
export abstract class BaseTransformer {
  protected config: TransformerConfig;

  constructor(config: TransformerConfig) {
    this.config = config;
  }

  /**
   * Transform a document
   */
  async transform(document: ParsedDocument): Promise<TransformResult> {
    const startTime = Date.now();

    try {
      const result = await this.execute(document);
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: result.data,
        metadata: {
          processingTime,
          cost: result.cost,
          confidence: result.confidence,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          processingTime,
        },
      };
    }
  }

  /**
   * Execute the transformation (implemented by subclasses)
   */
  protected abstract execute(document: ParsedDocument): Promise<{
    data: unknown;
    cost?: number;
    confidence?: number;
  }>;

  /**
   * Get transformer name
   */
  abstract getName(): string;

  /**
   * Get transformer description
   */
  abstract getDescription(): string;

  /**
   * Validate document before transformation
   */
  protected validateDocument(document: ParsedDocument): void {
    if (!document || !document.pages || document.pages.length === 0) {
      throw new Error('Invalid document: no pages found');
    }
  }
}
