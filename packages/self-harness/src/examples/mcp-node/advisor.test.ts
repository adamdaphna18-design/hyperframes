import { describe, expect, it } from "vitest";
import { adviseServers, classifyDomain, renderHighStakes } from "./advisor.js";
import { latestOnly, type RegistryServer } from "./registry.js";
import { REGISTRY_SNAPSHOT } from "./registry-snapshot.js";

function server(over: Partial<RegistryServer>): RegistryServer {
  return {
    name: "x/mcp",
    description: "a server with a reasonably long description of what it does",
    hasRepository: true,
    remoteTypes: ["streamable-http"],
    packageCount: 0,
    status: "active",
    isLatest: true,
    version: "1.0.0",
    ...over,
  };
}

describe("domain classification from metadata", () => {
  it("tags financial, write-heavy, and general servers", () => {
    expect(classifyDomain(server({ name: "acme/payments-mcp" }))).toBe("financial");
    expect(classifyDomain(server({ description: "create and delete calendar events" }))).toBe(
      "write-heavy",
    );
    expect(classifyDomain(server({ name: "acme/weather", description: "read the forecast" }))).toBe(
      "general",
    );
  });
});

describe("the named advisor", () => {
  it("ranks below-A servers worst-first and flags high-stakes leads", () => {
    const servers = [
      server({ name: "clean/mcp" }), // A — excluded from the list
      server({
        name: "pay/mcp",
        description: "charge customers and issue refunds",
        hasRepository: false,
      }),
      server({
        name: "notes/mcp",
        description: "x",
        hasRepository: false,
        status: "deleted",
        remoteTypes: [],
      }),
    ];
    const { ranked, highStakes } = adviseServers(servers);
    // Clean A server is not on the lead list.
    expect(ranked.find((f) => f.server === "clean/mcp")).toBeUndefined();
    // The worst grade sorts first.
    expect(ranked[0]?.server).toBe("notes/mcp");
    // The financial server with no source repo is high-stakes and carries a suggestion.
    const pay = highStakes.find((f) => f.server === "pay/mcp");
    expect(pay).toBeDefined();
    expect(pay?.domain).toBe("financial");
    expect(pay?.suggestions.length).toBeGreaterThan(0);
  });

  it("renders a reachable financial finding with the deep-scan call-to-action", () => {
    const { highStakes } = adviseServers([
      server({ name: "pay/mcp", description: "charge customers", hasRepository: false }),
    ]);
    const finding = highStakes[0];
    expect(finding).toBeDefined();
    const lines = renderHighStakes(finding as NonNullable<typeof finding>);
    expect(lines[0]).toContain("pay/mcp");
    expect(lines.some((l) => l.includes("double-charge"))).toBe(true);
  });

  it("names real servers from the vendored registry snapshot", () => {
    const { ranked } = adviseServers(latestOnly(REGISTRY_SNAPSHOT));
    // The real snapshot has genuine below-A servers to name.
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((f) => f.grade !== "A")).toBe(true);
    expect(ranked[0]?.server).toContain("/");
  });
});
