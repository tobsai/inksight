/**
 * InkSight Configuration System — Phase 6.2
 *
 * Manages config file at ~/.inksight/config.json.
 * Supports environment variable overrides.
 * Validates config based on connection mode.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface InkSightConfig {
  connection: {
    mode: 'cloud' | 'ssh' | 'hybrid';
    cloud?: {
      email: string;
      /** Stored as plaintext. Use INKSIGHT_CLOUD_PASSWORD env var for security. */
      password: string;
    };
    ssh?: {
      host: string;
      username: string;
      keyPath?: string;
      /** Default: 22 */
      port?: number;
    };
  };
  ai: {
    provider: 'openai' | 'anthropic' | 'auto';
    openaiApiKey?: string;
    anthropicApiKey?: string;
    defaultModel?: string;
    /** Max cost per document in USD. Default: 0.10 */
    maxCostPerDocument?: number;
  };
  transforms: {
    defaultType: 'text' | 'diagram' | 'summary' | 'metadata';
    /** Default: ~/inksight-output */
    outputDir: string;
    outputFormat: 'plain' | 'markdown' | 'structured';
  };
  storage: {
    /** Default: ~/.inksight/inksight.db */
    dbPath: string;
    /** Default: ~/.inksight/cache */
    cacheDir: string;
    /** Default: 500 */
    maxCacheMb: number;
  };
}

export class ConfigManager {
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(os.homedir(), '.inksight', 'config.json');
  }

  /**
   * Load config from disk. Returns defaults if file doesn't exist.
   */
  load(): InkSightConfig {
    if (!fs.existsSync(this.configPath)) {
      return ConfigManager.defaults();
    }
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<InkSightConfig>;
      return this.merge(ConfigManager.defaults(), parsed);
    } catch (err) {
      throw new Error(`Failed to read config at ${this.configPath}: ${(err as Error).message}`);
    }
  }

  /**
   * Save config to disk, creating parent directories as needed.
   */
  save(config: InkSightConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  /**
   * Validate a config object. Returns errors array — empty means valid.
   */
  validate(config: Partial<InkSightConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const mode = config.connection?.mode;
    if (!mode) {
      errors.push('connection.mode is required (cloud | ssh | hybrid)');
    }

    if (mode === 'cloud' || mode === 'hybrid') {
      if (!config.connection?.cloud?.email) {
        errors.push('connection.cloud.email is required for cloud/hybrid mode');
      }
      if (!config.connection?.cloud?.password) {
        errors.push(
          'connection.cloud.password is required for cloud/hybrid mode (or set INKSIGHT_CLOUD_PASSWORD)'
        );
      }
    }

    if (mode === 'ssh' || mode === 'hybrid') {
      if (!config.connection?.ssh?.host) {
        errors.push('connection.ssh.host is required for ssh/hybrid mode');
      }
      if (!config.connection?.ssh?.username) {
        errors.push('connection.ssh.username is required for ssh/hybrid mode');
      }
    }

    const aiProvider = config.ai?.provider;
    if (aiProvider && !['openai', 'anthropic', 'auto'].includes(aiProvider)) {
      errors.push(`ai.provider must be openai | anthropic | auto, got: ${aiProvider}`);
    }

    if (aiProvider === 'openai' || aiProvider === 'auto') {
      // Key can come from env var, so only warn if not present in config
      // Not a hard error since env var INKSIGHT_OPENAI_KEY may be set
    }

    if (
      config.transforms?.defaultType &&
      !['text', 'diagram', 'summary', 'metadata'].includes(config.transforms.defaultType)
    ) {
      errors.push(
        `transforms.defaultType must be text | diagram | summary | metadata`
      );
    }

    if (
      config.transforms?.outputFormat &&
      !['plain', 'markdown', 'structured'].includes(config.transforms.outputFormat)
    ) {
      errors.push('transforms.outputFormat must be plain | markdown | structured');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Load config, then apply environment variable overrides.
   *
   * Supported env vars:
   *   INKSIGHT_CONNECTION_MODE, INKSIGHT_CLOUD_EMAIL, INKSIGHT_CLOUD_PASSWORD,
   *   INKSIGHT_SSH_HOST, INKSIGHT_SSH_USER, INKSIGHT_SSH_KEY_PATH, INKSIGHT_SSH_PORT,
   *   INKSIGHT_AI_PROVIDER, INKSIGHT_OPENAI_KEY, INKSIGHT_ANTHROPIC_KEY,
   *   INKSIGHT_DEFAULT_MODEL, INKSIGHT_MAX_COST,
   *   INKSIGHT_TRANSFORM_TYPE, INKSIGHT_OUTPUT_DIR, INKSIGHT_OUTPUT_FORMAT,
   *   INKSIGHT_DB_PATH, INKSIGHT_CACHE_DIR, INKSIGHT_MAX_CACHE_MB
   */
  loadWithEnvOverrides(): InkSightConfig {
    const config = this.load();

    // Connection
    if (process.env.INKSIGHT_CONNECTION_MODE) {
      config.connection.mode = process.env.INKSIGHT_CONNECTION_MODE as InkSightConfig['connection']['mode'];
    }
    if (process.env.INKSIGHT_CLOUD_EMAIL || process.env.INKSIGHT_CLOUD_PASSWORD) {
      config.connection.cloud = config.connection.cloud ?? { email: '', password: '' };
      if (process.env.INKSIGHT_CLOUD_EMAIL) config.connection.cloud.email = process.env.INKSIGHT_CLOUD_EMAIL;
      if (process.env.INKSIGHT_CLOUD_PASSWORD) config.connection.cloud.password = process.env.INKSIGHT_CLOUD_PASSWORD;
    }
    if (process.env.INKSIGHT_SSH_HOST || process.env.INKSIGHT_SSH_USER) {
      config.connection.ssh = config.connection.ssh ?? { host: '', username: '' };
      if (process.env.INKSIGHT_SSH_HOST) config.connection.ssh.host = process.env.INKSIGHT_SSH_HOST;
      if (process.env.INKSIGHT_SSH_USER) config.connection.ssh.username = process.env.INKSIGHT_SSH_USER;
      if (process.env.INKSIGHT_SSH_KEY_PATH) config.connection.ssh.keyPath = process.env.INKSIGHT_SSH_KEY_PATH;
      if (process.env.INKSIGHT_SSH_PORT) config.connection.ssh.port = parseInt(process.env.INKSIGHT_SSH_PORT, 10);
    }

    // AI
    if (process.env.INKSIGHT_AI_PROVIDER) {
      config.ai.provider = process.env.INKSIGHT_AI_PROVIDER as InkSightConfig['ai']['provider'];
    }
    if (process.env.INKSIGHT_OPENAI_KEY) config.ai.openaiApiKey = process.env.INKSIGHT_OPENAI_KEY;
    if (process.env.INKSIGHT_ANTHROPIC_KEY) config.ai.anthropicApiKey = process.env.INKSIGHT_ANTHROPIC_KEY;
    if (process.env.INKSIGHT_DEFAULT_MODEL) config.ai.defaultModel = process.env.INKSIGHT_DEFAULT_MODEL;
    if (process.env.INKSIGHT_MAX_COST) config.ai.maxCostPerDocument = parseFloat(process.env.INKSIGHT_MAX_COST);

    // Transforms
    if (process.env.INKSIGHT_TRANSFORM_TYPE) {
      config.transforms.defaultType = process.env.INKSIGHT_TRANSFORM_TYPE as InkSightConfig['transforms']['defaultType'];
    }
    if (process.env.INKSIGHT_OUTPUT_DIR) config.transforms.outputDir = process.env.INKSIGHT_OUTPUT_DIR;
    if (process.env.INKSIGHT_OUTPUT_FORMAT) {
      config.transforms.outputFormat = process.env.INKSIGHT_OUTPUT_FORMAT as InkSightConfig['transforms']['outputFormat'];
    }

    // Storage
    if (process.env.INKSIGHT_DB_PATH) config.storage.dbPath = process.env.INKSIGHT_DB_PATH;
    if (process.env.INKSIGHT_CACHE_DIR) config.storage.cacheDir = process.env.INKSIGHT_CACHE_DIR;
    if (process.env.INKSIGHT_MAX_CACHE_MB) config.storage.maxCacheMb = parseInt(process.env.INKSIGHT_MAX_CACHE_MB, 10);

    return config;
  }

  /**
   * Return a default configuration with safe fallback values.
   */
  static defaults(): InkSightConfig {
    const home = os.homedir();
    return {
      connection: {
        mode: 'hybrid',
      },
      ai: {
        provider: 'auto',
        maxCostPerDocument: 0.10,
      },
      transforms: {
        defaultType: 'text',
        outputDir: path.join(home, 'inksight-output'),
        outputFormat: 'markdown',
      },
      storage: {
        dbPath: path.join(home, '.inksight', 'inksight.db'),
        cacheDir: path.join(home, '.inksight', 'cache'),
        maxCacheMb: 500,
      },
    };
  }

  /** Deep-merge source into target (non-destructive). */
  private merge(target: InkSightConfig, source: Partial<InkSightConfig>): InkSightConfig {
    const result = { ...target };
    if (source.connection) {
      result.connection = { ...target.connection, ...source.connection };
      if (source.connection.cloud) result.connection.cloud = { ...source.connection.cloud };
      if (source.connection.ssh) result.connection.ssh = { ...source.connection.ssh };
    }
    if (source.ai) result.ai = { ...target.ai, ...source.ai };
    if (source.transforms) result.transforms = { ...target.transforms, ...source.transforms };
    if (source.storage) result.storage = { ...target.storage, ...source.storage };
    return result;
  }
}
