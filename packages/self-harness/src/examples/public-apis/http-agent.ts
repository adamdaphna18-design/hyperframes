import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { ApiEndpoint } from "./endpoints.js";
import { RecordedHttpClient, TimeoutError, type HttpClient } from "./http-client.js";

/** A task bound to one public-apis endpoint. */
export interface ApiTask extends Task {
  endpoint: ApiEndpoint;
}

const DEFAULT_TIMEOUT_MS = 150;

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
  constructor(private readonly client: HttpClient = new RecordedHttpClient()) {}

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
        return trajectory(
          task.id,
          toolCalls,
          "GAVE UP: exhausted tool-call budget",
          failureSignals,
        );
      }
      const step = await this.attempt(endpoint, policy, attempt);
      toolCalls.push(step.call);
      if (step.signal) failureSignals.push(step.signal);
      if (step.fatal) {
        return trajectory(task.id, toolCalls, `GAVE UP: ${step.signal}`, failureSignals);
      }
      if (step.collected) {
        collected += 1;
        lastBody = step.call.note ?? "";
      }
    }
    return trajectory(task.id, toolCalls, lastBody, failureSignals);
  }

  private async attempt(
    endpoint: ApiEndpoint,
    policy: ReturnType<typeof readPolicy>,
    attempt: number,
  ): Promise<Attempt> {
    const name = "http.get";
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
          call: { name, args: endpoint.url, ok: false, note: "timed out" },
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
        collected: false,
        fatal: false,
      };
    }
    return {
      call: { name, args, ok: false, note: "429" },
      signal: "http-429-no-retry",
      collected: false,
      fatal: true,
    };
  }
  if (status === 200) {
    return { call: { name, args, ok: true, note: body }, collected: true, fatal: false };
  }
  return {
    call: { name, args, ok: false, note: `HTTP ${status}` },
    signal: "http-error",
    collected: false,
    fatal: true,
  };
}

function trajectory(
  taskId: string,
  toolCalls: ToolCall[],
  output: string,
  failureSignals: string[],
): Trajectory {
  return { taskId, toolCalls, output, failureSignals };
}
