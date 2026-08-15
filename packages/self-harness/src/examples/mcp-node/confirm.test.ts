import { describe, expect, it } from "vitest";
import { scanTargets } from "./advisor.js";
import { classifyTool, confirmServer, summarize, toCsv } from "./confirm.js";
import { FixtureToolSource, type McpTool } from "./mcp-client.js";
import type { RegistryServer } from "./registry.js";

describe("honest tool classification from annotations", () => {
  const cases: Array<[string, McpTool, string]> = [
    [
      "destructive + no idempotency → candidate",
      { name: "charge", annotations: { destructiveHint: true } },
      "candidate",
    ],
    [
      "destructive + idempotency → safe",
      { name: "refund", annotations: { destructiveHint: true, idempotentHint: true } },
      "idempotent-safe",
    ],
    ["read-only → read-only", { name: "get", annotations: { readOnlyHint: true } }, "read-only"],
    ["no annotations → unannotated (cannot classify)", { name: "mystery" }, "unannotated"],
  ];
  for (const [label, tool, expected] of cases) {
    it(label, () => {
      expect(classifyTool(tool).kind).toBe(expected);
    });
  }

  it("never calls an unannotated write tool 'safe' — the honesty guarantee", () => {
    // A tool that is really a write but declares nothing must not read as idempotent-safe.
    expect(classifyTool({ name: "sendMoney" }).kind).not.toBe("idempotent-safe");
  });
});

describe("confirmServer over a ToolSource", () => {
  it("classifies a reached server's tools", async () => {
    const source = new FixtureToolSource({
      "demo://pay": [{ name: "charge.create", annotations: { destructiveHint: true } }],
    });
    const c = await confirmServer({ server: "pay", url: "demo://pay" }, source);
    expect(c.status).toBe("reached");
    expect(c.verdicts[0]?.kind).toBe("candidate");
  });

  it("labels an unreachable endpoint honestly, no crash", async () => {
    const source = new FixtureToolSource({});
    const c = await confirmServer({ server: "gone", url: "demo://gone" }, source);
    expect(c.status).toBe("unreachable");
    expect(c.verdicts).toHaveLength(0);
  });
});

describe("coverage summary and CSV", () => {
  it("tallies reached vs unreached and never overcounts", async () => {
    const source = new FixtureToolSource({
      "demo://a": [
        { name: "w", annotations: { destructiveHint: true } },
        { name: "r", annotations: { readOnlyHint: true } },
        { name: "u" },
      ],
    });
    const confirmations = [
      await confirmServer({ server: "a", url: "demo://a" }, source),
      await confirmServer({ server: "b", url: "demo://b" }, source),
    ];
    const s = summarize(confirmations);
    expect(s.serversReached).toBe(1);
    expect(s.unreachable).toBe(1);
    expect(s.candidates).toBe(1);
    expect(s.unannotated).toBe(1);
  });

  it("escapes commas, quotes, and newlines in the CSV", () => {
    const csv = toCsv([
      {
        server: "a,b",
        url: "demo://a",
        status: "reached",
        verdicts: [
          {
            tool: 'say "hi"',
            kind: "candidate",
            destructive: true,
            idempotent: false,
            evidence: '{"x":1}',
          },
        ],
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("server,url,tool,kind,destructive,idempotent,status,evidence");
    expect(lines[1]).toContain('"a,b"');
    expect(lines[1]).toContain('"say ""hi"""');
  });
});

describe("scanTargets extraction", () => {
  function server(over: Partial<RegistryServer>): RegistryServer {
    return {
      name: "x/mcp",
      description: "a description long enough to avoid the undocumented flag",
      hasRepository: true,
      remoteTypes: ["streamable-http"],
      remoteUrls: ["https://x.example/mcp"],
      packageCount: 0,
      status: "active",
      isLatest: true,
      version: "1.0.0",
      ...over,
    };
  }

  it("returns only high-stakes servers that expose a real URL", () => {
    const targets = scanTargets([
      server({ name: "safe/mcp" }), // grade A, not high-stakes
      server({
        name: "pay/mcp",
        description: "charge customers",
        hasRepository: false,
        remoteUrls: ["https://pay.example/mcp"],
      }),
      server({
        name: "pay-no-url/mcp",
        description: "charge customers",
        hasRepository: false,
        remoteUrls: [],
      }),
    ]);
    expect(targets.map((t) => t.server)).toEqual(["pay/mcp"]);
    expect(targets[0]?.url).toBe("https://pay.example/mcp");
  });
});
