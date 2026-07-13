import { describe, expect, it } from "vitest";
import { deepScan, toolsToManifest } from "./deep-scan.js";
import { FixtureToolSource, McpClient, type McpTool } from "./mcp-client.js";
import { scoreServer } from "./scorecard.js";
import { SAMPLE_REACHABLE, SAMPLE_TOOL_LISTS } from "./sample-tool-lists.js";

describe("mapping real tools/list into a manifest", () => {
  it("reads a destructive, non-idempotent tool as an unsafe-retry risk", () => {
    const tools: McpTool[] = [
      {
        name: "charge.create",
        inputSchema: { type: "object", properties: { amount: { type: "string" } } },
        annotations: { destructiveHint: true },
      },
    ];
    const card = scoreServer(toolsToManifest("pay", tools));
    const risks = card.findings.map((f) => f.risk);
    expect(risks).toContain("unsafe-retry");
    expect(risks).toContain("format-ambiguity"); // unconstrained 'amount'
  });

  it("treats a read-only tool with constrained args as clean", () => {
    const tools: McpTool[] = [
      {
        name: "contacts.get",
        inputSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        annotations: { readOnlyHint: true },
      },
    ];
    expect(scoreServer(toolsToManifest("crm", tools)).findings).toHaveLength(0);
  });

  it("an idempotent write carries no unsafe-retry risk", () => {
    const tools: McpTool[] = [
      {
        name: "event.create",
        inputSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        annotations: { readOnlyHint: false, idempotentHint: true },
      },
    ];
    const risks = scoreServer(toolsToManifest("cal", tools)).findings.map((f) => f.risk);
    expect(risks).not.toContain("unsafe-retry");
  });
});

describe("deepScan over a fixture source", () => {
  it("scores every reachable server and reports coverage", async () => {
    const result = await deepScan(SAMPLE_REACHABLE, new FixtureToolSource(SAMPLE_TOOL_LISTS));
    expect(result.reached).toBe(SAMPLE_REACHABLE.length);
    expect(result.errors).toBe(0);
    // payments (destructive charge) and crm (readOnlyHint:false update) both carry unsafe-retry.
    expect(result.report.withUnsafeRetry).toBe(2);
  });

  it("counts an unreachable server as an error, not a crash", async () => {
    const result = await deepScan(
      [{ name: "missing", url: "demo://nope" }],
      new FixtureToolSource(SAMPLE_TOOL_LISTS),
    );
    expect(result.reached).toBe(0);
    expect(result.errors).toBe(1);
  });
});

describe("the MCP client speaks the protocol", () => {
  it("runs initialize → tools/list through an injected fetch", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.method);
      if (body.method === "initialize") {
        return new Response(JSON.stringify({ result: { protocolVersion: "2025-06-18" } }), {
          status: 200,
          headers: { "content-type": "application/json", "mcp-session-id": "sess-1" },
        });
      }
      if (body.method === "tools/list") {
        return new Response(
          JSON.stringify({
            result: { tools: [{ name: "ping", inputSchema: { type: "object" } }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 202 }); // notifications/initialized
    }) as unknown as typeof fetch;

    const tools = await new McpClient(fakeFetch).listTools("https://example.test/mcp");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("ping");
    expect(calls).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });

  it("parses an SSE-framed tools/list response", async () => {
    const sse = `event: message\ndata: ${JSON.stringify({ result: { tools: [{ name: "sse.tool" }] } })}\n\n`;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === "tools/list") {
        return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const tools = await new McpClient(fakeFetch).listTools("https://example.test/mcp");
    expect(tools[0]?.name).toBe("sse.tool");
  });
});
