/**
 * The external resources behind a self-correcting MCP node — a real, deterministic
 * stand-in for the databases and APIs a node bridges. Each tool validates the
 * payload against its *current* schema, so failures are computed, not declared: a
 * call fails because a required field is missing (schema drift), an argument is the
 * wrong format, or the tool rate-limits. A live drop-in swaps `callTool` for a real
 * MCP `CallToolRequest` behind the same shape.
 */

export interface ToolSchema {
  tool: string;
  /** Required field names under the tool's *current* schema (post-drift). */
  required: string[];
  /** Fields that must be an ISO `YYYY-MM-DD` date. */
  isoDateFields: string[];
  /** When true, the tool returns 429 unless the call backs off. */
  rateLimited: boolean;
  /** When true, the operation mutates state — a double-execution is a real bug. */
  mutation: boolean;
}

export const TOOLS: Record<string, ToolSchema> = {
  "users.get": {
    tool: "users.get",
    required: ["userId"],
    isoDateFields: [],
    rateLimited: false,
    mutation: false,
  },
  "events.create": {
    tool: "events.create",
    required: ["date"],
    isoDateFields: ["date"],
    rateLimited: false,
    mutation: false,
  },
  "orders.search": {
    tool: "orders.search",
    required: ["q"],
    isoDateFields: [],
    rateLimited: true,
    mutation: false,
  },
  "payments.charge": {
    tool: "payments.charge",
    required: ["amount"],
    isoDateFields: [],
    rateLimited: false,
    mutation: true,
  },
};

/** Look a tool schema up by name (throws on an unknown tool — calls are validated data). */
export function getTool(tool: string): ToolSchema {
  const schema = TOOLS[tool];
  if (!schema) throw new Error(`unknown tool: ${tool}`);
  return schema;
}

export interface ToolResult {
  ok: boolean;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Execute one call against a tool's current schema. Deterministic, offline. */
export function callTool(
  schema: ToolSchema,
  payload: Record<string, string>,
  opts: { backoff: boolean },
): ToolResult {
  for (const field of schema.required) {
    if (!(field in payload)) return { ok: false, error: `missing field '${field}'` };
  }
  for (const field of schema.isoDateFields) {
    if (!ISO_DATE.test(payload[field] ?? ""))
      return { ok: false, error: `field '${field}' not ISO date` };
  }
  if (schema.rateLimited && !opts.backoff) return { ok: false, error: "429 rate limited" };
  return { ok: true };
}
