import { endpointByUrl } from "./endpoints.js";

/** Per-request options derived from the harness. */
export interface HttpOptions {
  timeoutMs: number;
  followRedirects: boolean;
  /** 1-based attempt counter, so a client can model "429 on first hit". */
  attempt: number;
}

export interface HttpResult {
  status: number;
  body: string;
}

/** Thrown when a request exceeds its timeout budget. */
export class TimeoutError extends Error {
  constructor(public readonly url: string) {
    super(`request to ${url} timed out`);
    this.name = "TimeoutError";
  }
}

/** Pluggable HTTP surface: a real fetch client or a deterministic recorded one. */
export interface HttpClient {
  request(url: string, opts: HttpOptions): Promise<HttpResult>;
}

/**
 * Deterministic client that replays the recorded behavior of the curated
 * public-apis endpoints. No network — the Self-Harness loop runs and tests
 * reproducibly, and each pathology is guaranteed rather than luck-of-the-network.
 */
export class RecordedHttpClient implements HttpClient {
  async request(url: string, opts: HttpOptions): Promise<HttpResult> {
    const ep = endpointByUrl(url);
    if (!ep) return { status: 404, body: "" };
    if (opts.timeoutMs < ep.latencyMs) throw new TimeoutError(url);
    if (ep.redirects && !opts.followRedirects) return { status: 301, body: "" };
    if (ep.rateLimited && opts.attempt === 1) return { status: 429, body: "" };
    return { status: 200, body: ep.sampleBody };
  }
}

/**
 * Real client backed by `fetch`, honoring the harness's timeout and redirect
 * policy. Use this to run the exact same loop against the live public APIs
 * wherever outbound network is permitted.
 */
export class FetchHttpClient implements HttpClient {
  async request(url: string, opts: HttpOptions): Promise<HttpResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: opts.followRedirects ? "follow" : "manual",
        signal: controller.signal,
      });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      if (controller.signal.aborted) throw new TimeoutError(url);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
