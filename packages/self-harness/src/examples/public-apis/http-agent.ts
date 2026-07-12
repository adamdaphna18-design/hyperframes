import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { ApiEndpoint } from "./endpoints.js";
import { RecordedHttpClient, TimeoutError, type HttpClient } from "./http-client.js";

/** A task bound to one public-apis endpoint. */
export interface ApiTask extends Task {
  endpoint: ApiEndpoint;
}

/** Options controlling how the agent reports results. */
export interface HttpAgentOptions {
  /**
   * When true the agent's `output` is a JSON envelope carrying the real HTTP
   * status and body, so downstream verifiers (e.g. Bruno `assert` blocks) can
   * check `res.status`. When false (default) it emits the body on success and a
   * "GAVE UP: <signal>" string on failure.
   */
  envelope?: boolean;
}

/** The structured result the agent can emit when `envelope` is enabled. */
export interface HttpEnvelope {
  status: number;
  body?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 150;
const TIMEOUT_STATUS = 408;

/** Read the effective HTTP policy out of the harness rules + limits. */
function readPolicy(harness: Harness) {
  const has = (re: RegExp) => harness.rules.some((r) => re.test(r));
  const timeoutRule = harness.rules.map((r) => /timeout-ms=(\d+)/.exec(r)).find(Boolean);
  return {
    followRedirects: has(/follow-redirects/i),
    retryOn429: has(/retry-on-429/i),
    timeoutMs: timeoutRule ? Number(timeoutRule[1]) : DEFAULT_TIMEOUT_MS,
    maxAttempts: harness.limits.maxToolCalls,
  };
}

interface Attempt {
  call: ToolCall;
  status: number;
  signal?: string;
  /** True when the response counts as one collected page. */
  collected: boolean;
  /** True when the failure is terminal (stop the loop). */
  fatal: boolean;
}

/**
 * A real HTTP agent for public-apis endpoints. Its behavior is governed by the
 * harness: the timeout, redirect, and retry rules a proposer can add, plus the
 * `maxToolCalls` attempt budget. Swap {@link RecordedHttpClient} for
 * {@link FetchHttpClient} to run the identical loop against the live APIs.
 */
export class HttpAgent implements Agent {
  constructor(
    private readonly client: HttpClient = new RecordedHttpClient(),
    private readonly options: HttpAgentOptions = {},
  ) {}

  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const endpoint = (task as ApiTask).endpoint;
    const policy = readPolicy(harness);
    const toolCalls: ToolCall[] = [];
    const failureSignals: string[] = [];
    let collected = 0;
    let lastBody = "";

    for (let attempt = 1; collected < endpoint.pagesNeeded; attempt++) {
      if (attempt > policy.maxAttempts) {
        failureSignals.push("tool-budget-exhausted");
        return this.finish(task.id, toolCalls, failureSignals, {
          status: 0,
          error: "tool-budget-exhausted",
        });
      }
      const step = await this.attempt(endpoint, policy, attempt);
      toolCalls.push(step.call);
      if (step.signal) failureSignals.push(step.signal);
      if (step.fatal) {
        return this.finish(task.id, toolCalls, failureSignals, {
          status: step.status,
          error: step.signal,
        });
      }
      if (step.collected) {
        collected += 1;
        lastBody = step.call.note ?? "";
      }
    }
    return this.finish(task.id, toolCalls, failureSignals, { status: 200, body: lastBody });
  }

  private finish(
    taskId: string,
    toolCalls: ToolCall[],
    failureSignals: string[],
    envelope: HttpEnvelope,
  ): Trajectory {
    const output = this.options.envelope
      ? JSON.stringify(envelope)
      : envelope.status === 200
        ? (envelope.body ?? "")
        : `GAVE UP: ${envelope.error}`;
    return { taskId, toolCalls, output, failureSignals };
  }

  private async attempt(
    endpoint: ApiEndpoint,
    policy: ReturnType<typeof readPolicy>,
    attempt: number,
  ): Promise<Attempt> {
    try {
      const res = await this.client.request(endpoint.url, {
        timeoutMs: policy.timeoutMs,
        followRedirects: policy.followRedirects,
        attempt,
      });
      return classify(endpoint, policy, res.status, res.body);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return {
          call: { name: "http.get", args: endpoint.url, ok: false, note: "timed out" },
          status: TIMEOUT_STATUS,
          signal: "request-timeout",
          collected: false,
          fatal: true,
        };
      }
      throw err;
    }
  }
}

function classify(
  endpoint: ApiEndpoint,
  policy: ReturnType<typeof readPolicy>,
  status: number,
  body: string,
): Attempt {
  const name = "http.get";
  const args = endpoint.url;
  if (status === 301 || status === 302) {
    return {
      call: { name, args, ok: false, note: `${status} redirect` },
      status,
      signal: "redirect-not-followed",
      collected: false,
      fatal: true,
    };
  }
  if (status === 429) {
    // A retry is a non-fatal attempt: loop again (bounded by maxAttempts).
    if (policy.retryOn429) {
      return {
        call: { name, args, ok: false, note: "429 (will retry)" },
        status,
        collected: false,
        fatal: false,
      };
    }
    return {
      call: { name, args, ok: false, note: "429" },
      status,
      signal: "http-429-no-retry",
      collected: false,
      fatal: true,
    };
  }
  if (status === 200) {
    return { call: { name, args, ok: true, note: body }, status, collected: true, fatal: false };
  }
  return {
    call: { name, args, ok: false, note: `HTTP ${status}` },
    status,
    signal: "http-error",
    collected: false,
    fatal: true,
  };
}
