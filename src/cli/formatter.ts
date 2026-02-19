/**
 * InkSight Output Formatter — Phase 6.1
 *
 * Formats various result types into human-readable strings for CLI output.
 */

import type { DocumentMetadata } from '../cloud/types.js';
import type { TextTransformResult } from '../transformers/text-transformer.js';
import type { DiagramTransformResult } from '../transformers/diagram-transformer.js';
import type { SummarizationResult } from '../transformers/summarization-transformer.js';
import type { SearchResult } from '../storage/search-index.js';

/** Minimal connection status shape passed to formatStatus. */
export interface ConnectionStatus {
  mode: 'cloud' | 'ssh' | 'hybrid';
  cloudConnected?: boolean;
  sshConnected?: boolean;
  totalCostUsd?: number;
  documentsProcessed?: number;
  cacheHitRate?: number;
}

const LINE = '─'.repeat(60);
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function header(title: string): string {
  return `\n${BOLD}${title}${RESET}\n${LINE}`;
}

function field(label: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  return `  ${DIM}${label.padEnd(22)}${RESET}${value}`;
}

export class OutputFormatter {
  /**
   * Format a list of document metadata into a table-like display.
   */
  formatDocumentList(docs: DocumentMetadata[]): string {
    if (!docs.length) {
      return `${YELLOW}No documents found.${RESET}`;
    }
    const lines: string[] = [header(`Documents (${docs.length})`)];
    docs.forEach((doc, i) => {
      const modified = doc.lastModified
        ? new Date(doc.lastModified).toLocaleDateString()
        : 'Unknown';
      const pinned = doc.pinned ? ' 📌' : '';
      const name = doc.visibleName ?? 'Untitled';
      const type = doc.type === 'CollectionType' ? '📁' : '📄';
      lines.push(`  ${DIM}${String(i + 1).padStart(3)}.${RESET} ${type} ${BOLD}${name}${RESET}${pinned}`);
      lines.push(`       ${DIM}Modified: ${modified} | Version: ${doc.version ?? '-'}${RESET}`);
    });
    return lines.join('\n');
  }

  /**
   * Format a transform result (text, diagram, or summary).
   */
  formatTransformResult(
    result: TextTransformResult | DiagramTransformResult | SummarizationResult
  ): string {
    const lines: string[] = [];

    // Text result
    if ('text' in result && typeof result.text === 'string') {
      const r = result as TextTransformResult;
      lines.push(header('Text Recognition Result'));
      lines.push(field('Words', r.wordCount));
      lines.push(field('Reading time', `${r.estimatedReadingTimeMin.toFixed(1)} min`));
      lines.push(field('Confidence', `${(r.confidence * 100).toFixed(0)}%`));
      lines.push(field('Language', r.language?.language ?? 'Unknown'));
      lines.push(field('Cost', `$${r.costUsd.toFixed(4)}`));
      lines.push(field('Duration', `${r.durationMs}ms`));
      lines.push(`\n${r.text}`);
    }
    // Diagram result
    else if ('output' in result && typeof (result as DiagramTransformResult).output === 'string') {
      const r = result as DiagramTransformResult;
      lines.push(header('Diagram Transform Result'));
      lines.push(field('Detected type', r.detectedType));
      lines.push(field('Output format', r.outputFormat));
      lines.push(field('Confidence', `${(r.confidence * 100).toFixed(0)}%`));
      if (r.nodeCount !== undefined) lines.push(field('Node count', r.nodeCount));
      lines.push(field('Cost', `$${r.costUsd.toFixed(4)}`));
      lines.push(field('Duration', `${r.durationMs}ms`));
      lines.push(`\n${r.output}`);
    }
    // Summarization result
    else if ('summary' in result && typeof (result as SummarizationResult).summary === 'string') {
      const r = result as SummarizationResult;
      lines.push(header('Summarization Result'));
      lines.push(field('Pages', r.pageCount));
      lines.push(field('Confidence', `${(r.confidence * 100).toFixed(0)}%`));
      lines.push(field('Cost', `$${r.costUsd.toFixed(4)}`));
      lines.push(field('Duration', `${r.durationMs}ms`));
      lines.push(`\n${r.summary}`);
      if (r.keyPoints?.length) {
        lines.push(`\n${BOLD}Key Points:${RESET}`);
        r.keyPoints.forEach((p) => lines.push(`  • ${p}`));
      }
      if (r.actionItems?.length) {
        lines.push(`\n${BOLD}Action Items:${RESET}`);
        r.actionItems.forEach((a) => lines.push(`  ☐ ${a}`));
      }
    }

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Format a list of search results.
   */
  formatSearchResults(results: SearchResult[]): string {
    if (!results.length) {
      return `${YELLOW}No results found.${RESET}`;
    }
    const lines: string[] = [header(`Search Results (${results.length})`)];
    results.forEach((r, i) => {
      lines.push(`  ${DIM}${String(i + 1).padStart(3)}.${RESET} ${BOLD}${r.documentId}${RESET}`);
      if (r.snippet) lines.push(`       ${DIM}${r.snippet}${RESET}`);
      if (r.score !== undefined) lines.push(`       ${DIM}Relevance: ${r.score.toFixed(3)}${RESET}`);
    });
    return lines.join('\n');
  }

  /**
   * Format connection status overview.
   */
  formatStatus(status: ConnectionStatus): string {
    const lines: string[] = [header('InkSight Status')];
    lines.push(field('Connection mode', status.mode.toUpperCase()));

    if (status.mode === 'cloud' || status.mode === 'hybrid') {
      const s = status.cloudConnected ? `${GREEN}✓ connected${RESET}` : `${RED}✗ disconnected${RESET}`;
      lines.push(field('Cloud', s));
    }
    if (status.mode === 'ssh' || status.mode === 'hybrid') {
      const s = status.sshConnected ? `${GREEN}✓ connected${RESET}` : `${RED}✗ disconnected${RESET}`;
      lines.push(field('SSH', s));
    }
    if (status.totalCostUsd !== undefined) {
      lines.push(field('Total AI cost', `$${status.totalCostUsd.toFixed(4)}`));
    }
    if (status.documentsProcessed !== undefined) {
      lines.push(field('Docs processed', status.documentsProcessed));
    }
    if (status.cacheHitRate !== undefined) {
      lines.push(field('Cache hit rate', `${(status.cacheHitRate * 100).toFixed(0)}%`));
    }
    return lines.filter(Boolean).join('\n');
  }

  /**
   * Format an error into a friendly, actionable message.
   */
  formatError(error: Error): string {
    const lines = [`\n${RED}${BOLD}Error:${RESET} ${error.message}`];

    // Provide hints for common error patterns
    const msg = error.message.toLowerCase();
    if (msg.includes('enoent') || msg.includes('no such file')) {
      lines.push(`${YELLOW}Hint:${RESET} The specified file or path does not exist. Check the path and try again.`);
    } else if (msg.includes('eacces') || msg.includes('permission denied')) {
      lines.push(`${YELLOW}Hint:${RESET} Permission denied. Check file permissions or try running with sudo.`);
    } else if (msg.includes('econnrefused') || msg.includes('connect')) {
      lines.push(`${YELLOW}Hint:${RESET} Connection refused. Ensure the device is on and SSH is enabled.`);
    } else if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) {
      lines.push(`${YELLOW}Hint:${RESET} Authentication failed. Run \`inksight setup\` to reconfigure credentials.`);
    } else if (msg.includes('rate limit') || msg.includes('429')) {
      lines.push(`${YELLOW}Hint:${RESET} AI provider rate limit hit. Wait a moment and retry, or switch providers.`);
    } else if (msg.includes('api key') || msg.includes('invalid key')) {
      lines.push(`${YELLOW}Hint:${RESET} Invalid API key. Run \`inksight setup\` to re-enter your AI provider key.`);
    } else if (msg.includes('config')) {
      lines.push(`${YELLOW}Hint:${RESET} Configuration issue. Run \`inksight setup\` to recreate your config file.`);
    }

    return lines.join('\n');
  }
}
