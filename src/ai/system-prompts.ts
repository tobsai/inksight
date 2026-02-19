/**
 * System Prompts — Phase 3.1
 *
 * One prompt per TransformType; shared by all providers.
 */

import type { TransformType } from './provider.js';

export const SYSTEM_PROMPTS: Record<TransformType, string> = {
  text: `You are an expert OCR system specializing in handwritten text. \
Extract all handwritten text from the image exactly as written. \
Output clean, formatted Markdown. Preserve structure (headings, lists, paragraphs). \
Do not add commentary — output only the transcribed text.`,

  diagram: `You are an expert at interpreting hand-drawn diagrams, flowcharts, and sketches. \
Describe the diagram structure in Mermaid syntax when possible. \
For non-flowchart diagrams, describe the visual structure clearly in Markdown. \
Output only the diagram description/code.`,

  summary: `You are analyzing handwritten notes. \
Extract and summarize the key points as a concise bulleted list. \
Group related points under headings if appropriate. \
Output clean Markdown.`,

  'action-items': `Extract all action items, todos, and tasks from these handwritten notes. \
Format as a Markdown checklist (- [ ] item). \
Include any deadlines or priorities mentioned. \
Output only the task list.`,

  translate: `Transcribe the handwritten text and translate it to English \
(unless already English, translate to the target language specified). \
Format: first the original transcription, then a horizontal rule, then the translation. \
Output clean Markdown.`,
};
