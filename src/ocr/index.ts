/**
 * OCR module — Phase 3.3
 *
 * Exports TextRecognizer, DiagramAnalyzer, DocumentProcessor and all related types.
 */

export { TextRecognizer } from './text-recognizer.js';
export { DiagramAnalyzer } from './diagram-analyzer.js';
export { DocumentProcessor } from './document-processor.js';

export type {
  RecognitionOptions,
  RecognizedPage,
  RecognitionResult,
} from './text-recognizer.js';

export type {
  DiagramType,
  DiagramAnalysisResult,
} from './diagram-analyzer.js';

export type {
  ProcessingMode,
  ProcessingResult,
} from './document-processor.js';
