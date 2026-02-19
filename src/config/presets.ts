/**
 * InkSight Transformer Presets — Phase 6.2
 *
 * Predefined combinations of transformer types and options
 * for common use cases.
 */

import type { TransformerType } from '../transformers/transformer-registry.js';

/**
 * Loose options bag used in presets.
 * Each transformer reads only the keys it understands, so we can mix keys
 * from TextTransformOptions, DiagramTransformOptions and SummarizationOptions.
 */
export interface PresetOptions {
  // TextTransformOptions
  outputFormat?: 'plain' | 'markdown' | 'structured' | 'mermaid' | 'description' | 'svg-placeholder';
  detectParagraphs?: boolean;
  detectLists?: boolean;
  preserveLineBreaks?: boolean;
  language?: string;
  // DiagramTransformOptions
  diagramType?: 'flowchart' | 'mindmap' | 'sequence' | 'er' | 'auto';
  // SummarizationOptions
  style?: 'bullets' | 'paragraph' | 'executive';
  maxLength?: number;
  includeActionItems?: boolean;
  hierarchical?: boolean;
}

export interface TransformPresetConfig {
  name: string;
  description: string;
  transforms: TransformerType[];
  options: PresetOptions;
}

export const PRESETS: Record<string, TransformPresetConfig> = {
  'quick-text': {
    name: 'Quick Text',
    description: 'Fast text extraction with plain output. Best for quick reads.',
    transforms: ['text'],
    options: {
      outputFormat: 'plain',
      detectParagraphs: true,
      detectLists: false,
    },
  },

  'full-analysis': {
    name: 'Full Analysis',
    description: 'Text extraction, summary, and metadata. Best for thorough review.',
    transforms: ['text', 'summary', 'metadata'],
    options: {
      outputFormat: 'markdown',
      detectParagraphs: true,
      detectLists: true,
      style: 'bullets',
      includeActionItems: true,
    },
  },

  'diagram-focus': {
    name: 'Diagram Focus',
    description: 'Diagram detection, Mermaid export, and plain-English description.',
    transforms: ['diagram'],
    options: {
      outputFormat: 'mermaid',
      diagramType: 'auto',
    },
  },

  'meeting-notes': {
    name: 'Meeting Notes',
    description: 'Summary with action items and metadata extraction.',
    transforms: ['summary', 'metadata'],
    options: {
      style: 'bullets',
      includeActionItems: true,
      maxLength: 500,
    },
  },

  'archive': {
    name: 'Archive',
    description: 'All transforms with structured output. Best for archiving.',
    transforms: ['text', 'diagram', 'summary', 'metadata'],
    options: {
      outputFormat: 'structured',
      detectParagraphs: true,
      detectLists: true,
      style: 'paragraph',
      includeActionItems: true,
      hierarchical: true,
    },
  },
} as const;

/** Return the preset by name, or undefined. */
export function getPreset(name: string): TransformPresetConfig | undefined {
  return PRESETS[name] as TransformPresetConfig | undefined;
}

/** List all preset names. */
export function listPresets(): string[] {
  return Object.keys(PRESETS);
}
