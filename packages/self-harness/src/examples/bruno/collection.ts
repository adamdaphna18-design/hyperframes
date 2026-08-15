import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAssertions } from "./assertions.js";
import { parseBru } from "./bru-parser.js";
import { parseEnvironment, type BruEnvironment } from "./environment.js";
import { toBruRequest, type BruRequest } from "./request.js";
import { endpointByUrl, type ApiEndpoint } from "../public-apis/endpoints.js";
import type { HttpEnvelope, ApiTask } from "../public-apis/http-agent.js";

/**
 * Load a Bruno collection from disk: every `.bru` request under `dir` (skipping
 * the `environments/` folder and any non-HTTP file), with an optional named
 * environment applied for `{{var}}` interpolation.
 */
export function loadBrunoCollection(
  dir: string,
  options: { environment?: string } = {},
): BruRequest[] {
  const env = options.environment ? loadEnvironment(dir, options.environment) : new Map();
  return bruFiles(dir)
    .map((file) => parseBru(readFileSync(file, "utf8")))
    .filter((doc) => hasMethod(doc))
    .map((doc) => toBruRequest(doc, env));
}

/** Build a Self-Harness task suite from a Bruno collection directory. */
export function buildBrunoSuite(dir: string, options: { environment?: string } = {}): ApiTask[] {
  return loadBrunoCollection(dir, options).map(bruRequestToTask);
}

/** Convert one Bruno request into a task whose `check` runs its `assert` block. */
export function bruRequestToTask(request: BruRequest): ApiTask {
  return {
    id: slug(request.name),
    prompt: `${request.method} ${request.name} and satisfy its assertions.`,
    endpoint: endpointByUrl(request.url) ?? syntheticEndpoint(request),
    check(output: string) {
      const envelope = parseEnvelope(output);
      if (!envelope) return { passed: false, detail: "no response envelope" };
      const body = tryParseJson(envelope.body ?? "");
      return evaluateAssertions(request.assertions, { status: envelope.status, body });
    },
  };
}

/** Absolute path to the bundled demo collection (the public-apis `.bru` set). */
export function demoCollectionDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "public-apis");
}

function loadEnvironment(dir: string, name: string): BruEnvironment {
  return parseEnvironment(readFileSync(join(dir, "environments", `${name}.bru`), "utf8"));
}

function bruFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "environments") out.push(...bruFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".bru")) {
      out.push(join(dir, entry.name));
    }
  }
  return out.sort();
}

function hasMethod(doc: ReturnType<typeof parseBru>): boolean {
  return ["get", "post", "put", "delete", "patch", "head", "options"].some((m) => doc.has(m));
}

function parseEnvelope(output: string): HttpEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as HttpEnvelope).status === "number"
    ) {
      return parsed as HttpEnvelope;
    }
  } catch {
    // not an envelope
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function syntheticEndpoint(request: BruRequest): ApiEndpoint {
  return {
    name: request.name,
    category: "bruno",
    url: request.url,
    pathology: "healthy",
    latencyMs: 40,
    rateLimited: false,
    redirects: false,
    pagesNeeded: 1,
    expectKey: "",
    sampleBody: "{}",
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
