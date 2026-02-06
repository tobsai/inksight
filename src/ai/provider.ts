/**
 * AI Provider Abstraction
 * 
 * Unified interface for different AI services (OpenAI, Anthropic, etc.)
 * Allows swapping providers or using multiple providers for different tasks.
 */

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TextRecognitionRequest {
  image: Uint8Array; // PNG or JPEG
  language?: string;
  confidence?: boolean;
}

export interface TextRecognitionResponse {
  text: string;
  confidence?: number;
  words?: Array<{
    text: string;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
}

export interface TextAnalysisRequest {
  text: string;
  task: 'summarize' | 'extract-metadata' | 'generate-tags' | 'find-tasks';
  options?: Record<string, unknown>;
}

export interface TextAnalysisResponse {
  result: string | Record<string, unknown>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost?: number;
  };
}

export interface DiagramAnalysisRequest {
  image: Uint8Array;
  task: 'describe' | 'extract-elements' | 'generate-mermaid';
}

export interface DiagramAnalysisResponse {
  description?: string;
  elements?: Array<{
    type: 'box' | 'circle' | 'arrow' | 'line' | 'text';
    properties: Record<string, unknown>;
  }>;
  mermaidCode?: string;
}

/**
 * Abstract base class for AI providers
 */
export abstract class AIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * Recognize text from image (OCR/Handwriting recognition)
   */
  abstract recognizeText(
    request: TextRecognitionRequest
  ): Promise<TextRecognitionResponse>;

  /**
   * Analyze text (summarization, extraction, etc.)
   */
  abstract analyzeText(
    request: TextAnalysisRequest
  ): Promise<TextAnalysisResponse>;

  /**
   * Analyze diagram/drawing
   */
  abstract analyzeDiagram(
    request: DiagramAnalysisRequest
  ): Promise<DiagramAnalysisResponse>;

  /**
   * Get provider name
   */
  abstract getName(): string;

  /**
   * Check if provider is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get cost estimate for operation
   */
  abstract estimateCost(
    operation: 'text-recognition' | 'text-analysis' | 'diagram-analysis',
    inputSize: number
  ): number;
}
