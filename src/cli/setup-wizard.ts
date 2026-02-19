/**
 * InkSight Interactive Setup Wizard — Phase 6.1
 *
 * Walks the user through configuring InkSight for the first time using
 * interactive prompts powered by `inquirer`.
 */

import type { InkSightConfig } from '../config/config.js';
import { ConfigManager } from '../config/config.js';

// Inquirer is imported dynamically to keep this module compatible with
// environments where the ESM interop is tricky (e.g. test mocking).
// Tests can jest.mock / vi.mock this module.

export type InquirerInterface = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prompt: (questions: any[]) => Promise<Record<string, any>>;
};

// Dependency injection: callers can pass a custom prompter (for tests).
type PromptFn = InquirerInterface['prompt'];

export class SetupWizard {
  constructor(
    private readonly configManager: ConfigManager = new ConfigManager(),
    private readonly prompt?: PromptFn
  ) {}

  /**
   * Run the interactive wizard and return the resulting config.
   * Saves the config to disk on success.
   */
  async run(): Promise<InkSightConfig> {
    const ask = await this.getPromptFn();

    console.log('\n🖊️  Welcome to InkSight Setup Wizard\n');

    // ── Step 1: Connection mode ────────────────────────────────────────────
    const { mode } = await ask([
      {
        type: 'list',
        name: 'mode',
        message: 'How do you connect to your reMarkable device?',
        choices: [
          { name: 'Hybrid  — try SSH first, fall back to Cloud (recommended)', value: 'hybrid' },
          { name: 'Cloud   — reMarkable cloud API only', value: 'cloud' },
          { name: 'SSH     — direct device connection only', value: 'ssh' },
        ],
        default: 'hybrid',
      },
    ]);

    // ── Step 2: Cloud credentials ──────────────────────────────────────────
    let cloudConfig: InkSightConfig['connection']['cloud'] | undefined;
    if (mode === 'cloud' || mode === 'hybrid') {
      const { email, password } = await ask([
        {
          type: 'input',
          name: 'email',
          message: 'reMarkable account email:',
          validate: (v: string) => (v.includes('@') ? true : 'Please enter a valid email address'),
        },
        {
          type: 'password',
          name: 'password',
          message: 'reMarkable account password:',
          mask: '*',
          validate: (v: string) => (v.length >= 8 ? true : 'Password must be at least 8 characters'),
        },
      ]);
      cloudConfig = { email, password };
    }

    // ── Step 3: SSH credentials ────────────────────────────────────────────
    let sshConfig: InkSightConfig['connection']['ssh'] | undefined;
    if (mode === 'ssh' || mode === 'hybrid') {
      const { host, username, keyPath, port } = await ask([
        {
          type: 'input',
          name: 'host',
          message: 'Device IP address:',
          default: '10.11.99.1',
          validate: (v: string) => (v.trim().length > 0 ? true : 'IP address is required'),
        },
        {
          type: 'input',
          name: 'username',
          message: 'SSH username:',
          default: 'root',
        },
        {
          type: 'input',
          name: 'keyPath',
          message: 'Path to SSH private key (leave blank for password auth):',
          default: '',
        },
        {
          type: 'input',
          name: 'port',
          message: 'SSH port:',
          default: '22',
          validate: (v: string) => {
            const n = parseInt(v, 10);
            return n > 0 && n <= 65535 ? true : 'Invalid port number';
          },
        },
      ]);
      sshConfig = {
        host,
        username,
        ...(keyPath ? { keyPath } : {}),
        port: parseInt(port, 10),
      };
    }

    // ── Step 4: AI provider ────────────────────────────────────────────────
    const { aiProvider } = await ask([
      {
        type: 'list',
        name: 'aiProvider',
        message: 'Which AI provider should InkSight use?',
        choices: [
          { name: 'OpenAI   (GPT-4o — excellent accuracy)', value: 'openai' },
          { name: 'Anthropic (Claude Sonnet — fast + affordable)', value: 'anthropic' },
          { name: 'Auto     — use whichever key is available', value: 'auto' },
        ],
        default: 'openai',
      },
    ]);

    // ── Step 5: API key ────────────────────────────────────────────────────
    let openaiApiKey: string | undefined;
    let anthropicApiKey: string | undefined;

    if (aiProvider === 'openai' || aiProvider === 'auto') {
      const { key } = await ask([
        {
          type: 'password',
          name: 'key',
          message: 'OpenAI API key (sk-...):',
          mask: '*',
        },
      ]);
      if (key) openaiApiKey = key;
    }
    if (aiProvider === 'anthropic' || aiProvider === 'auto') {
      const { key } = await ask([
        {
          type: 'password',
          name: 'key',
          message: 'Anthropic API key (sk-ant-...):',
          mask: '*',
        },
      ]);
      if (key) anthropicApiKey = key;
    }

    // ── Step 6: Default transform type ────────────────────────────────────
    const { defaultType } = await ask([
      {
        type: 'list',
        name: 'defaultType',
        message: 'What should InkSight do with your notes by default?',
        choices: [
          { name: 'Text     — extract handwritten text', value: 'text' },
          { name: 'Summary  — generate AI summary + action items', value: 'summary' },
          { name: 'Diagram  — convert sketches to Mermaid diagrams', value: 'diagram' },
        ],
        default: 'text',
      },
    ]);

    // ── Assemble config ────────────────────────────────────────────────────
    const defaults = ConfigManager.defaults();
    const config: InkSightConfig = {
      connection: {
        mode: mode as InkSightConfig['connection']['mode'],
        ...(cloudConfig ? { cloud: cloudConfig } : {}),
        ...(sshConfig ? { ssh: sshConfig } : {}),
      },
      ai: {
        provider: aiProvider as InkSightConfig['ai']['provider'],
        ...(openaiApiKey ? { openaiApiKey } : {}),
        ...(anthropicApiKey ? { anthropicApiKey } : {}),
        maxCostPerDocument: defaults.ai.maxCostPerDocument,
      },
      transforms: {
        defaultType: defaultType as InkSightConfig['transforms']['defaultType'],
        outputDir: defaults.transforms.outputDir,
        outputFormat: defaults.transforms.outputFormat,
      },
      storage: defaults.storage,
    };

    // ── Step 7: Save config ────────────────────────────────────────────────
    this.configManager.save(config);
    console.log(`\n✅ Config saved to ${(this.configManager as unknown as { configPath: string }).configPath ?? '~/.inksight/config.json'}`);

    // ── Step 8: Connection test notice ────────────────────────────────────
    console.log('\n⚡ Run `inksight status` to verify your connection.\n');

    return config;
  }

  /** Return the injected prompter or lazily import inquirer. */
  private async getPromptFn(): Promise<PromptFn> {
    if (this.prompt) return this.prompt;
    // Dynamic import keeps tests simple to mock
    const inquirer = await import('inquirer');
    return (questions) => inquirer.default.prompt(questions);
  }
}
