import { ENDPOINTS, type ApiEndpoint } from "./endpoints.js";
import type { ApiTask } from "./http-agent.js";

/** Build one verifiable task per curated endpoint. */
export function buildPublicApiSuite(): ApiTask[] {
  return ENDPOINTS.map(makeApiTask);
}

function makeApiTask(endpoint: ApiEndpoint): ApiTask {
  return {
    id: slug(endpoint.name),
    prompt: `GET the ${endpoint.name} API (${endpoint.category}) and return its JSON.`,
    endpoint,
    check(output: string) {
      const passed = output.includes(`"${endpoint.expectKey}"`);
      return { passed, detail: passed ? `found "${endpoint.expectKey}"` : output };
    },
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
