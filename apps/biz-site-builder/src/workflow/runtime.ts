import { Journal } from "./journal.ts";

/**
 * A small, provider-agnostic dynamic-workflow runtime in the spirit of Claude
 * Code's Workflow tool and its open re-implementations (odw,
 * open-dynamic-workflows): a deterministic script owns orchestration and only
 * leaf `step()` calls do work. It offers:
 *
 *  - step()      — a labelled unit of work, cached in the journal for resume
 *  - parallel()  — a concurrency-capped barrier over thunks
 *  - pipeline()  — per-item staged execution with NO barrier between stages
 *  - budget      — a hard unit/token ceiling; steps charge against it
 *  - resume      — re-running with the same journal replays completed steps
 *
 * The work executor is pluggable: `step` runs any async function, so a host with
 * an LLM can make those calls agentic while this app uses them for deterministic
 * site/video generation.
 */

export class BudgetExceededError extends Error {
  constructor(label: string, cost: number, remaining: number) {
    super(`Budget exceeded at step "${label}": needs ${cost}, ${remaining} remaining.`);
    this.name = "BudgetExceededError";
  }
}

export interface Budget {
  readonly total: number | null;
  spent(): number;
  remaining(): number;
}

export interface StepOptions {
  /** Units/tokens this step consumes from the budget (default 0). */
  cost?: number;
  /** Assign an explicit journal key; defaults to the label. */
  phase?: string;
}

export interface RuntimeOptions {
  /** Max concurrent steps (default: 8). */
  concurrency?: number;
  /** Hard ceiling on total step cost; null = unlimited. */
  budget?: number | null;
  /** Pre-loaded journal for resume; a fresh one is created otherwise. */
  journal?: Journal;
  runId?: string;
  log?: (msg: string) => void;
}

/** FIFO semaphore bounding how many steps run at once. */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export interface Runtime {
  readonly runId: string;
  readonly journal: Journal;
  readonly budget: Budget;
  step<T>(label: string, fn: () => Promise<T> | T, opts?: StepOptions): Promise<T>;
  parallel<T>(thunks: Array<() => Promise<T>>): Promise<Array<T | null>>;
  pipeline<T>(
    items: T[],
    ...stages: Array<(prev: unknown, item: T, index: number) => Promise<unknown> | unknown>
  ): Promise<unknown[]>;
  log(msg: string): void;
  cacheHits(): number;
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const sem = new Semaphore(concurrency);
  const journal = opts.journal ?? new Journal();
  const budgetTotal = opts.budget ?? null;
  const runId = opts.runId ?? "run";
  const log = opts.log ?? (() => {});
  let spent = 0;
  let hits = 0;

  const budget: Budget = {
    total: budgetTotal,
    spent: () => spent,
    remaining: () =>
      budgetTotal === null ? Number.POSITIVE_INFINITY : Math.max(0, budgetTotal - spent),
  };

  async function step<T>(
    label: string,
    fn: () => Promise<T> | T,
    stepOpts: StepOptions = {},
  ): Promise<T> {
    const key = stepOpts.phase ? `${stepOpts.phase}/${label}` : label;
    const cached = journal.get<T>(key);
    if (cached.hit) {
      hits++;
      return cached.value;
    }
    const cost = stepOpts.cost ?? 0;
    if (budgetTotal !== null && spent + cost > budgetTotal) {
      throw new BudgetExceededError(key, cost, budget.remaining());
    }
    spent += cost;
    const value = await sem.run(async () => fn());
    journal.set(key, value);
    return value;
  }

  async function parallel<T>(thunks: Array<() => Promise<T>>): Promise<Array<T | null>> {
    return Promise.all(
      thunks.map((t) =>
        t().catch((err) => {
          log(`parallel task failed: ${(err as Error).message}`);
          return null;
        }),
      ),
    );
  }

  async function pipeline<T>(
    items: T[],
    ...stages: Array<(prev: unknown, item: T, index: number) => Promise<unknown> | unknown>
  ): Promise<unknown[]> {
    return Promise.all(
      items.map(async (item, index) => {
        let acc: unknown = item;
        for (const stage of stages) {
          try {
            acc = await stage(acc, item, index);
          } catch (err) {
            log(`pipeline item ${index} dropped: ${(err as Error).message}`);
            return null;
          }
        }
        return acc;
      }),
    );
  }

  return {
    runId,
    journal,
    budget,
    step,
    parallel,
    pipeline,
    log,
    cacheHits: () => hits,
  };
}
