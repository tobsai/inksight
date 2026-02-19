/**
 * Recognition Pipeline — Phase 3.3
 *
 * End-to-end pipeline: document → recognize → format → optionally save to file.
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { DownloadedDocument } from '../cloud/types.js';
import type { TextRecognizer, DocumentRecognitionResult, RecognitionOptions } from './text-recognizer.js';
import type { OutputFormatter, FormatterOptions } from './output-formatter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineOptions {
  recognition?: RecognitionOptions;
  output?: FormatterOptions;
  /** If provided, save the formatted output to this file path */
  saveToFile?: string;
}

export interface PipelineResult {
  result: DocumentRecognitionResult;
  formatted: string;
  /** Path the output was saved to, if saveToFile was specified */
  savedTo?: string;
}

// ─── RecognitionPipeline ──────────────────────────────────────────────────────

export class RecognitionPipeline {
  constructor(
    private recognizer: TextRecognizer,
    private formatter: OutputFormatter
  ) {}

  /**
   * Run the full pipeline on a document:
   * 1. Recognize all pages
   * 2. Format the output
   * 3. Optionally save to a file
   */
  async run(document: DownloadedDocument, options?: PipelineOptions): Promise<PipelineResult> {
    // 1. Recognize
    const result = await this.recognizer.recognizeDocument(document, options?.recognition);

    // 2. Format
    const formatOptions: FormatterOptions = options?.output ?? {
      format: 'plain',
      includeMetadata: false,
      pageBreaks: true,
    };
    const formatted = this.formatter.format(result, formatOptions);

    // 3. Optionally save
    let savedTo: string | undefined;
    if (options?.saveToFile) {
      const filePath = options.saveToFile;
      // Ensure parent directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, formatted, 'utf-8');
      savedTo = filePath;
    }

    return { result, formatted, savedTo };
  }
}
