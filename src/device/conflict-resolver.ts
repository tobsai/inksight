/**
 * ConflictResolver — Simple rules-based conflict resolution for document sync.
 *
 * Determines whether to use the device copy or the local copy when both
 * versions have diverged. Three built-in strategies are supported:
 *
 *   'device-wins' — Always trust the device. Safe default for read-only sync.
 *   'local-wins'  — Preserve any local edits regardless of device state.
 *   'newest-wins' — Use whichever copy has the more recent modifiedAt timestamp.
 *                   Ties are broken in favour of the device.
 *
 * A 'no-conflict' result is returned when the two versions are byte-identical
 * (same hash), regardless of strategy.
 */

import type { ConflictStrategy } from './types.js';

export type { ConflictStrategy } from './types.js';

export interface VersionInfo {
  modifiedAt: Date;
  hash: string;
}

export type ConflictResolutionResult = 'use-device' | 'use-local' | 'no-conflict';

export class ConflictResolver {
  constructor(private readonly strategy: ConflictStrategy = 'device-wins') {}

  /**
   * Compare device and local versions and return the appropriate action.
   *
   * @param deviceVersion - Version info from the reMarkable device
   * @param localVersion  - Version info from the local cache
   * @returns
   *   'no-conflict' — both versions are identical (same hash)
   *   'use-device'  — strategy says to apply the device version
   *   'use-local'   — strategy says to keep the local version
   */
  resolve(
    deviceVersion: VersionInfo,
    localVersion: VersionInfo,
  ): ConflictResolutionResult {
    // If content is identical there's nothing to resolve
    if (deviceVersion.hash === localVersion.hash) {
      return 'no-conflict';
    }

    switch (this.strategy) {
      case 'device-wins':
        return 'use-device';

      case 'local-wins':
        return 'use-local';

      case 'newest-wins': {
        const deviceMs = deviceVersion.modifiedAt.getTime();
        const localMs = localVersion.modifiedAt.getTime();

        if (deviceMs > localMs) return 'use-device';
        if (localMs > deviceMs) return 'use-local';
        // Tie — device wins as a deterministic tie-breaker
        return 'use-device';
      }
    }
  }

  getStrategy(): ConflictStrategy {
    return this.strategy;
  }
}
