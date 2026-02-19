/**
 * InkSight Parallel Processor — Phase 7.1
 *
 * Concurrency-limited parallel task runner with timeout and retry support.
 * Collects results and errors without stopping on individual failures.
 */

export interface ProcessorOptions {
  /** Maximum parallel tasks (default: 3) */
  concurrency: number;
  /** Per-task timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Retry count on failure (default: 0) */
  retries?: number;
}

export interface ProcessorResult<TInput, TOutput> {
  input: TInput;
  output?: TOutput;
  error?: Error;
}

export class ParallelProcessor<TInput, TOutput> {
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    private handler: (item: TInput) => Promise<TOutput>,
    private options: ProcessorOptions = { concurrency: 3 }
  ) {
    this.concurrency = options.concurrency ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.retries = options.retries ?? 0;
  }

  /**
   * Process all items with the configured concurrency limit.
   * Never throws — failures are captured as error entries.
   */
  async processAll(
    items: TInput[]
  ): Promise<Array<ProcessorResult<TInput, TOutput>>> {
    const results: Array<ProcessorResult<TInput, TOutput>> = new Array(items.length);
    const queue = items.map((input, index) => ({ input, index }));

    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        results[task.index] = await this.runWithRetry(task.input);
      }
    };

    const workerCount = Math.min(this.concurrency, items.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    return results;
  }

  private async runWithRetry(input: TInput): Promise<ProcessorResult<TInput, TOutput>> {
    let lastError: Error | undefined;
    const attempts = this.retries + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const output = await this.runWithTimeout(input);
        return { input, output };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    return { input, error: lastError };
  }

  private runWithTimeout(input: TInput): Promise<TOutput> {
    return new Promise<TOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.handler(input).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }
}
