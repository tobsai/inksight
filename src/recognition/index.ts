/**
 * Recognition module — Phase 3.3
 *
 * Exports all classes, interfaces, and utilities for text recognition.
 */

export { detectLanguage } from './language-detector.js';
export type { LanguageDetectionResult } from './language-detector.js';

export { TextRecognizer, estimateConfidence } from './text-recognizer.js';
export type {
  RecognitionResult,
  DocumentRecognitionResult,
  RecognitionOptions,
} from './text-recognizer.js';

export { OutputFormatter } from './output-formatter.js';
export type { OutputFormat, FormatterOptions } from './output-formatter.js';

export { RecognitionPipeline } from './recognition-pipeline.js';
export type { PipelineOptions, PipelineResult } from './recognition-pipeline.js';
