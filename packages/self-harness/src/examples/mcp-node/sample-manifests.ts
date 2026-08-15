import type { ServerManifest } from "./scorecard.js";

/**
 * Illustrative MCP server manifests in the shapes public servers actually publish —
 * a CRM, a payments server, a calendar, a search tool, and one well-built reference.
 * These stand in for what a live scan reads from the public MCP registry's `tools/list`;
 * they are generic shapes, not claims about any real named project.
 */
export const SAMPLE_SERVERS: ServerManifest[] = [
  {
    name: "crm-mcp",
    declaresRateLimits: false,
    tools: [
      { name: "contacts.get", args: [{ name: "user", type: "string" }] },
      {
        name: "contacts.update",
        args: [{ name: "patch", type: "object" }],
        mutation: true,
        idempotent: false,
      },
    ],
  },
  {
    name: "payments-mcp",
    declaresRateLimits: true,
    tools: [
      {
        name: "charge.create",
        args: [{ name: "amount", type: "string" }],
        mutation: true,
        idempotent: false,
      },
    ],
  },
  {
    name: "calendar-mcp",
    declaresRateLimits: true,
    tools: [
      {
        name: "event.create",
        args: [{ name: "date", type: "string" }],
        mutation: true,
        idempotent: true,
      },
    ],
  },
  {
    name: "search-mcp",
    declaresRateLimits: false,
    tools: [{ name: "docs.search", args: [{ name: "q", type: "string", constrained: true }] }],
  },
  {
    name: "well-built-mcp",
    declaresRateLimits: true,
    tools: [
      { name: "user.get", args: [{ name: "userId", type: "string", constrained: true }] },
      {
        name: "order.refund",
        args: [{ name: "orderId", type: "string", constrained: true }],
        mutation: true,
        idempotent: true,
      },
    ],
  },
];
