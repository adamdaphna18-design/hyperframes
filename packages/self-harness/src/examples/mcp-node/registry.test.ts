import { describe, expect, it } from "vitest";
import {
  fetchRegistryLive,
  latestOnly,
  mapRegistryEntry,
  registryReport,
  scoreReadiness,
  type RegistryServer,
} from "./registry.js";
import { REGISTRY_SNAPSHOT } from "./registry-snapshot.js";

const wellFormed: RegistryServer = {
  name: "good/mcp",
  description: "A well-documented server with a clear description of what it does.",
  hasRepository: true,
  remoteTypes: ["streamable-http"],
  packageCount: 0,
  status: "active",
  isLatest: true,
  version: "1.0.0",
};

describe("registry readiness scoring", () => {
  it("gives a complete, active, installable server an A", () => {
    const card = scoreReadiness(wellFormed);
    expect(card.grade).toBe("A");
    expect(card.reachable).toBe(true);
    expect(card.findings).toHaveLength(0);
  });

  it("flags an uninstallable, sourceless, inactive server", () => {
    const card = scoreReadiness({
      ...wellFormed,
      hasRepository: false,
      remoteTypes: [],
      packageCount: 0,
      status: "deleted",
      description: "x",
    });
    const risks = card.findings.map((f) => f.risk);
    expect(risks).toEqual(
      expect.arrayContaining(["no-install", "no-source", "inactive", "undocumented"]),
    );
    expect(card.reachable).toBe(false);
    expect(card.grade).toBe("F"); // 5 + 2 + 3 + 1 = 11
  });
});

describe("latestOnly dedupes multi-version entries", () => {
  it("keeps one row per name", () => {
    const servers: RegistryServer[] = [
      { ...wellFormed, name: "a", version: "1.0.0", isLatest: false },
      { ...wellFormed, name: "a", version: "1.0.1", isLatest: true },
      { ...wellFormed, name: "b", version: "2.0.0", isLatest: true },
    ];
    const latest = latestOnly(servers);
    expect(latest).toHaveLength(2);
    expect(latest.find((s) => s.name === "a")?.version).toBe("1.0.1");
  });
});

describe("the vendored snapshot is real registry data", () => {
  it("scans and reports over 100 genuine servers", () => {
    expect(REGISTRY_SNAPSHOT.length).toBe(100);
    const latest = latestOnly(REGISTRY_SNAPSHOT);
    const cards = latest.map(scoreReadiness);
    const report = registryReport(cards, latest);
    expect(report.servers).toBe(latest.length);
    expect(report.reachable).toBeGreaterThan(0);
    expect(report.withSource).toBeGreaterThan(0);
    // Every server lands in exactly one grade bucket.
    const bucketed = (["A", "B", "C", "D", "F"] as const).reduce(
      (n, g) => n + report.gradeDistribution[g],
      0,
    );
    expect(bucketed).toBe(latest.length);
  });
});

describe("the live-fetch drop-in maps the raw API shape", () => {
  it("parses a registry response through an injected fetch", async () => {
    const raw = {
      servers: [
        {
          server: {
            name: "x/mcp",
            description: "hi",
            version: "1.0.0",
            remotes: [{ type: "streamable-http" }],
          },
          _meta: {
            "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true },
          },
        },
      ],
      metadata: {},
    };
    const fakeFetch = (async () =>
      new Response(JSON.stringify(raw), { status: 200 })) as unknown as typeof fetch;
    const servers = await fetchRegistryLive({ fetchImpl: fakeFetch });
    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("x/mcp");
    expect(servers[0]?.remoteTypes).toEqual(["streamable-http"]);
    // The mapper handles a bare entry too.
    expect(mapRegistryEntry(raw.servers[0]).status).toBe("active");
  });
});
