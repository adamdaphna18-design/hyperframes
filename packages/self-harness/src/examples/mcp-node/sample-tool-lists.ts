import type { McpTool } from "./mcp-client.js";

/**
 * Representative `tools/list` results in the real MCP protocol shape — valid
 * `inputSchema` (JSON Schema) plus the 2025 tool annotations (`readOnlyHint`,
 * `destructiveHint`, `idempotentHint`). These are genuine protocol shapes, not claims
 * about any named server, so the deep scan can be demonstrated end-to-end offline.
 * Keyed by a demo URL the FixtureToolSource resolves.
 */
export const SAMPLE_TOOL_LISTS: Record<string, McpTool[]> = {
  "demo://payments-mcp": [
    {
      name: "charge.create",
      description: "Charge a customer",
      inputSchema: {
        type: "object",
        properties: { amount: { type: "string" }, customerId: { type: "string" } },
        required: ["amount", "customerId"],
      },
      annotations: { destructiveHint: true },
    },
  ],
  "demo://crm-mcp": [
    {
      name: "contacts.get",
      inputSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      annotations: { readOnlyHint: true },
    },
    {
      name: "contacts.update",
      inputSchema: { type: "object", properties: { patch: { type: "object" } } },
      annotations: { readOnlyHint: false },
    },
  ],
  "demo://calendar-mcp": [
    {
      name: "event.create",
      inputSchema: { type: "object", properties: { date: { type: "string" } } },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
  ],
  "demo://search-mcp": [
    {
      name: "docs.search",
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" }, kind: { type: "string", enum: ["web", "code"] } },
      },
      annotations: { readOnlyHint: true },
    },
  ],
};

/** The demo URLs above, as reachable servers to deep-scan. */
export const SAMPLE_REACHABLE = Object.keys(SAMPLE_TOOL_LISTS).map((url) => ({
  name: url.replace("demo://", ""),
  url,
}));
