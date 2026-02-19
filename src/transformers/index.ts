/**
 * Transformers — Phase 4 barrel export
 *
 * Exports all transformer classes and their public types.
 */

// Phase 4.1: Text Recognition Transformer
export { TextTransformer } from './text-transformer.js';
export type {
  TextTransformOptions,
  TextTransformResult,
  ListBlock,
} from './text-transformer.js';

// Phase 4.2: Diagram Cleanup Transformer
export { DiagramTransformer } from './diagram-transformer.js';
export type {
  DiagramTransformOptions,
  DiagramTransformResult,
  DiagramOutputFormat,
} from './diagram-transformer.js';

// Phase 4.3: Summarization Transformer
export { SummarizationTransformer } from './summarization-transformer.js';
export type {
  SummarizationOptions,
  SummarizationResult,
} from './summarization-transformer.js';

// Phase 4.4: Metadata Extraction Transformer
export { MetadataTransformer } from './metadata-transformer.js';
export type { ExtractedMetadata } from './metadata-transformer.js';

// Phase 4.5: Transformer Registry
export { TransformerRegistry } from './transformer-registry.js';
export type { TransformerType, RunAllResult } from './transformer-registry.js';

// Legacy (Phase 3) transformer exports
export { BaseTransformer } from './base-transformer.js';
export type { TransformerConfig } from './base-transformer.js';
export { TextRecognitionTransformer } from './text-recognition.js';
export type { TextRecognitionOptions, RecognizedText } from './text-recognition.js';
