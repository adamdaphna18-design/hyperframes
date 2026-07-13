import type { McpCall } from "./node-agent.js";

/**
 * A batch of host→tool calls hitting a messy enterprise environment. Six fail in the
 * three ways a real MCP node breaks (a drifted field name, a wrong date format, a
 * rate limit); three already work and are the baseline-passing set the gate must
 * protect — including a payment charge that must never be double-executed.
 */
export function buildCalls(): McpCall[] {
  return [
    // schema drift: the host still sends the old field name `user` (renamed to `userId`).
    {
      id: "drift-1",
      tool: "users.get",
      kind: "read",
      payload: { user: "u1" },
      failure: "schema-drift",
    },
    {
      id: "drift-2",
      tool: "users.get",
      kind: "read",
      payload: { user: "u2" },
      failure: "schema-drift",
    },
    // bad argument format: a slash date where the tool wants ISO `YYYY-MM-DD`.
    {
      id: "fmt-1",
      tool: "events.create",
      kind: "read",
      payload: { date: "2020/01/05" },
      failure: "bad-arg-format",
    },
    {
      id: "fmt-2",
      tool: "events.create",
      kind: "read",
      payload: { date: "2021/12/31" },
      failure: "bad-arg-format",
    },
    // rate limit: the tool 429s until the node backs off.
    {
      id: "rate-1",
      tool: "orders.search",
      kind: "read",
      payload: { q: "widgets" },
      failure: "rate-limit",
    },
    {
      id: "rate-2",
      tool: "orders.search",
      kind: "read",
      payload: { q: "gadgets" },
      failure: "rate-limit",
    },
    // already-correct calls — the gate's protected set.
    { id: "clean-user", tool: "users.get", kind: "read", payload: { userId: "u9" } },
    { id: "clean-date", tool: "events.create", kind: "read", payload: { date: "2022-06-01" } },
    // the mutation guard: a charge that must never be double-executed.
    { id: "charge-guard", tool: "payments.charge", kind: "mutation", payload: { amount: "1000" } },
  ];
}
