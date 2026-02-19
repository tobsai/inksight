#!/usr/bin/env node
/**
 * InkSight CLI — Phase 6.1
 *
 * Commander-based CLI with transform, search, config, and sync subcommands.
 */

import { Command } from 'commander';
import { ConfigManager } from '../config/index.js';

// ─── transform ───────────────────────────────────────────────────────────────

export function transformCommand(): Command {
  const cmd = new Command('transform');
  cmd
    .description('Transform a reMarkable document using AI')
    .argument('<document-id>', 'Document ID to transform')
    .option('--type <text|diagram|summary|metadata>', 'Transform type', 'text')
    .option('--output <path>', 'Output file path (default: stdout)')
    .option('--format <plain|markdown|structured>', 'Output format', 'markdown')
    .option('--page <number>', 'Transform a specific page only', parseInt)
    .option('--all-pages', 'Transform all pages')
    .option('--provider <openai|anthropic|auto>', 'AI provider override')
    .option('--dry-run', 'Show cost estimate without transforming')
    .action(async (documentId, options) => {
      try {
        const manager = new ConfigManager();
        const config = manager.loadWithEnvOverrides();

        if (options.dryRun) {
          console.log(`[dry-run] Would transform document: ${documentId}`);
          console.log(`[dry-run] Type: ${options.type}, Format: ${options.format}`);
          console.log('[dry-run] Estimated cost: $0.0000 (stub)');
          return;
        }

        // Stub: no live credentials
        console.log(`Not connected — configure with \`inksight config set\``);
        console.log(`(Current mode: ${config.connection.mode}, document: ${documentId})`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
  return cmd;
}

// ─── search ──────────────────────────────────────────────────────────────────

export function searchCommand(): Command {
  const cmd = new Command('search');
  cmd
    .description('Search across transformed documents')
    .argument('<query>', 'Search query string')
    .option('--limit <number>', 'Maximum number of results', '10')
    .option('--tags <tag,...>', 'Filter by comma-separated tags')
    .option('--from <date>', 'Filter from ISO date')
    .option('--to <date>', 'Filter to ISO date')
    .option('--format <json|table|plain>', 'Output format', 'table')
    .action(async (query, options) => {
      try {
        const manager = new ConfigManager();
        manager.loadWithEnvOverrides();

        // Stub: no live search index
        console.log(`Not connected — configure with \`inksight config set\``);
        console.log(`(Query: "${query}", limit: ${options.limit})`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
  return cmd;
}

// ─── config ──────────────────────────────────────────────────────────────────

export function configCommand(): Command {
  const cmd = new Command('config');
  cmd.description('Manage InkSight configuration');

  // config get [key]
  cmd
    .command('get [key]')
    .description('Show full config or a specific key')
    .action((key?: string) => {
      try {
        const manager = new ConfigManager();
        const config = manager.loadWithEnvOverrides();
        if (key) {
          const parts = key.split('.');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let value: any = config;
          for (const part of parts) {
            value = value?.[part];
          }
          console.log(value !== undefined ? JSON.stringify(value, null, 2) : `Key not found: ${key}`);
        } else {
          console.log(JSON.stringify(config, null, 2));
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // config set <key> <value>
  cmd
    .command('set <key> <value>')
    .description('Set a configuration key')
    .action((key: string, value: string) => {
      try {
        const manager = new ConfigManager();
        const config = manager.loadWithEnvOverrides();
        const parts = key.split('.');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let obj: any = config;
        for (let i = 0; i < parts.length - 1; i++) {
          if (obj[parts[i]] === undefined) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        const lastKey = parts[parts.length - 1];
        try {
          obj[lastKey] = JSON.parse(value);
        } catch {
          obj[lastKey] = value;
        }
        manager.save(config);
        console.log(`✅ Set ${key} = ${value}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // config validate
  cmd
    .command('validate')
    .description('Validate the current configuration')
    .action(() => {
      try {
        const manager = new ConfigManager();
        const config = manager.loadWithEnvOverrides();
        const { valid, errors } = manager.validate(config);
        if (valid) {
          console.log('✅ Configuration is valid');
        } else {
          console.error('❌ Configuration has errors:');
          for (const err of errors) {
            console.error(`  - ${err}`);
          }
          process.exit(1);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // config reset
  cmd
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      try {
        const manager = new ConfigManager();
        const defaults = ConfigManager.defaults();
        manager.save(defaults);
        console.log('✅ Configuration reset to defaults');
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}

// ─── sync ────────────────────────────────────────────────────────────────────

export function syncCommand(): Command {
  const cmd = new Command('sync');
  cmd
    .description('Sync documents from your reMarkable device')
    .option('--once', 'Sync once and exit')
    .option('--watch', 'Watch for changes (default)')
    .option('--mode <cloud|ssh|hybrid>', 'Connection mode override')
    .action(async (options) => {
      try {
        const manager = new ConfigManager();
        const config = manager.loadWithEnvOverrides();
        const mode = options.mode ?? config.connection.mode;

        // Stub: no live connection
        console.log(`Not connected — configure with \`inksight config set\``);
        console.log(`(Mode: ${mode}, once: ${!!options.once})`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
  return cmd;
}

// ─── program factory ─────────────────────────────────────────────────────────

export function createProgram(): Command {
  const program = new Command();

  program
    .name('inksight')
    .description('AI-powered ink transformation for reMarkable')
    .version('1.0.0');

  program.addCommand(transformCommand());
  program.addCommand(searchCommand());
  program.addCommand(configCommand());
  program.addCommand(syncCommand());

  return program;
}

// ─── entry ───────────────────────────────────────────────────────────────────
// Only auto-parse when run directly (not imported in tests)
// Using a simple env-var guard for test environments
if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
  createProgram().parse();
}
