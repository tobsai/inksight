/**
 * InkSight CLI — Phase 6.1
 *
 * Commands:
 *   inksight setup
 *   inksight list [--limit 20]
 *   inksight get <documentId>
 *   inksight transform <documentId> [--type text|diagram|summary|metadata] [--page 0]
 *   inksight search <query> [--tag <tag>] [--limit 10]
 *   inksight batch <pattern>
 *   inksight status
 */

import { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { SetupWizard } from './setup-wizard.js';
import { OutputFormatter } from './formatter.js';

// Spinner factory — lazily imported so tests can run without a real TTY.
async function spinner(text: string): Promise<{ stop: (symbol?: string, text?: string) => void }> {
  try {
    const { default: ora } = await import('ora');
    const s = ora(text).start();
    return {
      stop: (symbol?: string, text?: string) => {
        if (symbol === '✓' || symbol === '✅') {
          s.succeed(text);
        } else if (symbol === '✗' || symbol === '❌') {
          s.fail(text);
        } else {
          s.stop();
        }
      },
    };
  } catch {
    // Fallback for environments without ora
    process.stdout.write(`${text}...\n`);
    return { stop: () => {} };
  }
}

export class InkSightCLI {
  private readonly program: Command;
  private readonly formatter: OutputFormatter;
  private readonly configManager: ConfigManager;

  constructor(
    configManager: ConfigManager = new ConfigManager(),
    formatter: OutputFormatter = new OutputFormatter()
  ) {
    this.configManager = configManager;
    this.formatter = formatter;
    this.program = this.buildProgram();
  }

  /** Parse argv and execute the matching command. */
  async run(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }

  // ─── Program builder ──────────────────────────────────────────────────────

  private buildProgram(): Command {
    const program = new Command('inksight')
      .version('0.1.0', '-V, --version', 'Print version')
      .description('AI-powered ink transformation for reMarkable Paper Pro');

    // ── setup ──────────────────────────────────────────────────────────────
    program
      .command('setup')
      .description('Run the interactive setup wizard')
      .action(async () => {
        try {
          const wizard = new SetupWizard(this.configManager);
          await wizard.run();
        } catch (err) {
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── list ───────────────────────────────────────────────────────────────
    program
      .command('list')
      .description('List documents from cloud or local cache')
      .option('-l, --limit <n>', 'Maximum number of documents to show', '20')
      .action(async (opts: { limit: string }) => {
        const spin = await spinner('Fetching document list');
        try {
          const config = this.configManager.loadWithEnvOverrides();
          const docs = await this.fetchDocumentList(config, parseInt(opts.limit, 10));
          spin.stop('✓', 'Done');
          console.log(this.formatter.formatDocumentList(docs));
        } catch (err) {
          spin.stop('✗', 'Failed');
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── get ────────────────────────────────────────────────────────────────
    program
      .command('get <documentId>')
      .description('Download a document from the cloud or device')
      .action(async (documentId: string) => {
        const spin = await spinner(`Downloading ${documentId}`);
        try {
          const config = this.configManager.loadWithEnvOverrides();
          await this.downloadDocument(config, documentId);
          spin.stop('✓', 'Document downloaded');
        } catch (err) {
          spin.stop('✗', 'Download failed');
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── transform ──────────────────────────────────────────────────────────
    program
      .command('transform <documentId>')
      .description('Transform a document with AI')
      .option('-t, --type <type>', 'Transform type: text|diagram|summary|metadata', 'text')
      .option('-p, --page <n>', 'Page index to transform (0-based)', '0')
      .action(async (documentId: string, opts: { type: string; page: string }) => {
        const spin = await spinner(`Transforming ${documentId} (${opts.type})`);
        try {
          const config = this.configManager.loadWithEnvOverrides();
          const result = await this.transformDocument(
            config,
            documentId,
            opts.type as 'text' | 'diagram' | 'summary' | 'metadata',
            parseInt(opts.page, 10)
          );
          spin.stop('✓', 'Transform complete');
          console.log(this.formatter.formatTransformResult(result));
        } catch (err) {
          spin.stop('✗', 'Transform failed');
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── search ─────────────────────────────────────────────────────────────
    program
      .command('search <query>')
      .description('Search documents by text or tag')
      .option('--tag <tag>', 'Filter by tag')
      .option('-l, --limit <n>', 'Maximum results', '10')
      .action(async (query: string, opts: { tag?: string; limit: string }) => {
        const spin = await spinner(`Searching for "${query}"`);
        try {
          const config = this.configManager.loadWithEnvOverrides();
          const results = await this.searchDocuments(config, query, opts.tag, parseInt(opts.limit, 10));
          spin.stop('✓', 'Done');
          console.log(this.formatter.formatSearchResults(results));
        } catch (err) {
          spin.stop('✗', 'Search failed');
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── batch ──────────────────────────────────────────────────────────────
    program
      .command('batch <pattern>')
      .description('Batch process documents matching a name pattern')
      .option('-t, --type <type>', 'Transform type', 'text')
      .action(async (pattern: string, opts: { type: string }) => {
        const spin = await spinner(`Batch processing "${pattern}"`);
        try {
          const config = this.configManager.loadWithEnvOverrides();
          const count = await this.batchProcess(config, pattern, opts.type as 'text' | 'diagram' | 'summary' | 'metadata');
          spin.stop('✓', `Processed ${count} document(s)`);
        } catch (err) {
          spin.stop('✗', 'Batch failed');
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    // ── status ─────────────────────────────────────────────────────────────
    program
      .command('status')
      .description('Show connection status and cost statistics')
      .action(async () => {
        try {
          const config = this.configManager.loadWithEnvOverrides();
          const status = await this.getStatus(config);
          console.log(this.formatter.formatStatus(status));
        } catch (err) {
          console.error(this.formatter.formatError(err as Error));
          process.exitCode = 1;
        }
      });

    return program;
  }

  // ─── Service adapters (swappable for testing) ─────────────────────────────

  /**
   * Fetch document list. Returns empty array by default — concrete apps
   * should subclass or inject a service layer here.
   */
  protected async fetchDocumentList(
    _config: ReturnType<ConfigManager['loadWithEnvOverrides']>,
    _limit: number
  ): Promise<import('../cloud/types.js').DocumentMetadata[]> {
    // TODO: wire to HybridClient once service layer is connected
    return [];
  }

  protected async downloadDocument(
    _config: ReturnType<ConfigManager['loadWithEnvOverrides']>,
    _documentId: string
  ): Promise<void> {
    // TODO: wire to HybridClient
  }

  protected async transformDocument(
    config: ReturnType<ConfigManager['loadWithEnvOverrides']>,
    _documentId: string,
    type: 'text' | 'diagram' | 'summary' | 'metadata',
    _pageIndex: number
  ): Promise<import('../transformers/text-transformer.js').TextTransformResult | import('../transformers/diagram-transformer.js').DiagramTransformResult | import('../transformers/summarization-transformer.js').SummarizationResult> {
    const effectiveType = type ?? config.transforms.defaultType;
    // Return stub — override in concrete subclass
    return {
      text: `[Stub] Transform type: ${effectiveType}`,
      paragraphs: [],
      lists: [],
      wordCount: 0,
      estimatedReadingTimeMin: 0,
      language: { language: 'en', confidence: 1, script: 'latin' },
      confidence: 0,
      costUsd: 0,
      durationMs: 0,
    };
  }

  protected async searchDocuments(
    _config: ReturnType<ConfigManager['loadWithEnvOverrides']>,
    _query: string,
    _tag: string | undefined,
    _limit: number
  ): Promise<import('../storage/search-index.js').SearchResult[]> {
    return [];
  }

  protected async batchProcess(
    _config: ReturnType<ConfigManager['loadWithEnvOverrides']>,
    _pattern: string,
    _type: 'text' | 'diagram' | 'summary' | 'metadata'
  ): Promise<number> {
    return 0;
  }

  protected async getStatus(
    config: ReturnType<ConfigManager['loadWithEnvOverrides']>
  ): Promise<import('./formatter.js').ConnectionStatus> {
    return {
      mode: config.connection.mode,
      cloudConnected: false,
      sshConnected: false,
      totalCostUsd: 0,
      documentsProcessed: 0,
      cacheHitRate: 0,
    };
  }
}
