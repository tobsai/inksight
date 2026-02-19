/**
 * Cost Tracker — Phase 3.1
 *
 * Records AI transform costs and provides aggregation helpers.
 * Optional file persistence so costs survive process restarts.
 */

import { promises as fs } from 'fs';
import type { AIProvider, TransformResult, TransformType } from './provider.js';

export interface CostEntry {
  timestamp: Date;
  provider: AIProvider;
  model: string;
  transformType: TransformType;
  documentId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Serialisable form stored in JSON */
interface SerializedEntry {
  timestamp: string;
  provider: AIProvider;
  model: string;
  transformType: TransformType;
  documentId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export class CostTracker {
  private entries: CostEntry[] = [];

  record(
    result: TransformResult,
    transformType: TransformType,
    documentId?: string
  ): void {
    this.entries.push({
      timestamp: new Date(),
      provider: result.provider,
      model: result.model,
      transformType,
      documentId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });
  }

  getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  getCostByProvider(): Record<AIProvider, number> {
    const totals: Record<string, number> = {
      openai: 0,
      anthropic: 0,
      auto: 0,
    };
    for (const e of this.entries) {
      totals[e.provider] = (totals[e.provider] ?? 0) + e.costUsd;
    }
    return totals as Record<AIProvider, number>;
  }

  getCostByTransformType(): Record<TransformType, number> {
    const totals: Record<string, number> = {
      text: 0,
      diagram: 0,
      summary: 0,
      'action-items': 0,
      translate: 0,
    };
    for (const e of this.entries) {
      totals[e.transformType] = (totals[e.transformType] ?? 0) + e.costUsd;
    }
    return totals as Record<TransformType, number>;
  }

  getEntries(since?: Date): CostEntry[] {
    if (!since) return [...this.entries];
    return this.entries.filter((e) => e.timestamp >= since);
  }

  async saveToFile(path: string): Promise<void> {
    const serialized: SerializedEntry[] = this.entries.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    }));
    await fs.writeFile(path, JSON.stringify(serialized, null, 2), 'utf8');
  }

  async loadFromFile(path: string): Promise<void> {
    const raw = await fs.readFile(path, 'utf8');
    const serialized: SerializedEntry[] = JSON.parse(raw);
    this.entries = serialized.map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  }
}
