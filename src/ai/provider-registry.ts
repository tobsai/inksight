/**
 * AI Provider Registry — Phase 3.1
 *
 * Central hub for provider registration, selection, and cost tracking.
 * 'auto' mode tries providers in registration order and uses the first available one.
 */

import { CostTracker } from './cost-tracker.js';
import type {
  AIProvider,
  AITransformProvider,
  TransformRequest,
  TransformResult,
  TransformType,
} from './provider.js';

export class AIProviderRegistry {
  private providers: Map<AIProvider, AITransformProvider> = new Map();
  private costTracker = new CostTracker();

  /** Register (or overwrite) a provider. */
  register(provider: AITransformProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Retrieve a registered provider by name. */
  get(name: AIProvider): AITransformProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Run a transform, routing to the chosen provider.
   *
   * - `preferredProvider = 'auto'` (or undefined): try all registered providers
   *   in insertion order; use the first that `isAvailable()`.
   * - Specific provider name: use that provider or throw if missing/unavailable.
   */
  async transform(
    request: TransformRequest,
    preferredProvider?: AIProvider
  ): Promise<TransformResult> {
    const transformType: TransformType = request.transformType;

    if (!preferredProvider || preferredProvider === 'auto') {
      for (const provider of this.providers.values()) {
        if (provider.isAvailable()) {
          const result = await provider.transform(request);
          this.costTracker.record(result, transformType);
          return result;
        }
      }
      throw new Error(
        'No available AI provider found. Register at least one provider with a valid API key.'
      );
    }

    const provider = this.providers.get(preferredProvider);
    if (!provider) {
      throw new Error(
        `AI provider '${preferredProvider}' is not registered. Call register() first.`
      );
    }
    if (!provider.isAvailable()) {
      throw new Error(
        `AI provider '${preferredProvider}' is registered but not available (check API key).`
      );
    }

    const result = await provider.transform(request);
    this.costTracker.record(result, transformType);
    return result;
  }

  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  /** Return names of all currently available (key-configured) providers. */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.values())
      .filter((p) => p.isAvailable())
      .map((p) => p.name);
  }
}
