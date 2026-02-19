/**
 * InkSight ProgressReporter — Phase 6.2
 *
 * Provides structured console output for CLI operations.
 */

export class ProgressReporter {
  startTask(name: string): void {
    console.log(`⏳ ${name}...`);
  }

  completeTask(name: string): void {
    console.log(`✅ ${name}`);
  }

  failTask(name: string, err: Error): void {
    console.error(`❌ ${name}: ${err.message}`);
  }

  logCost(usd: number): void {
    console.log(`💰 Cost: $${usd.toFixed(4)}`);
  }

  logInfo(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }
}
