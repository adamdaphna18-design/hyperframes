import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CsvSource } from "../src/sources/csv.ts";
import { JsonSource } from "../src/sources/json.ts";
import { build } from "../src/pipeline.ts";

const FIX = join(import.meta.dir, "..", "fixtures");
const tmpDirs: string[] = [];

async function out(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bsb-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("build (end to end)", () => {
  test("builds sites + videos for site-less businesses and writes a directory", async () => {
    const outDir = await out();
    const result = await build({
      sources: [new CsvSource(join(FIX, "businesses.sample.csv"))],
      outDir,
      target: "both",
      video: true,
    });

    // 5 CSV rows. Site-less: Rosa's (empty), Corner Cuts (facebook), Daily Grind (empty).
    // Have sites: Bright Smile, Pit Stop.
    expect(result.total).toBe(5);
    expect(result.needsWebsite).toBe(3);
    expect(result.sitesBuilt).toBe(3);
    expect(result.staticBuilt).toBe(3);
    expect(result.wordpressBuilt).toBe(3);
    expect(result.videosBuilt).toBe(3);

    const index = JSON.parse(await readFile(join(outDir, "index.json"), "utf8"));
    expect(index).toHaveLength(5);
    const rosa = index.find((e: { name: string }) => e.name === "Rosa's Trattoria");
    expect(rosa.needsWebsite).toBe(true);
    expect(rosa.generatedSite).toBeTruthy();
    expect(rosa.generatedWordPress).toBeTruthy();
    expect(rosa.generatedVideo).toBeTruthy();

    const cornerCuts = index.find((e: { name: string }) => e.name === "Corner Cuts Barbershop");
    expect(cornerCuts.needsWebsite).toBe(true);
    expect(cornerCuts.reason).toContain("social");

    // The generated static site file actually exists and contains the name.
    const siteHtml = await readFile(join(outDir, rosa.generatedSite), "utf8");
    expect(siteHtml).toContain("Rosa&#39;s Trattoria");

    // The WordPress bundle exists with its key files.
    const wxr = await readFile(join(outDir, rosa.generatedWordPress, "content.wxr.xml"), "utf8");
    expect(wxr).toContain("<wp:wxr_version>1.2</wp:wxr_version>");
    const provision = await readFile(join(outDir, rosa.generatedWordPress, "provision.sh"), "utf8");
    expect(provision).toContain("wp import content.wxr.xml");
  });

  test("defaults to the WordPress target", async () => {
    const outDir = await out();
    const result = await build({
      sources: [new CsvSource(join(FIX, "businesses.sample.csv"))],
      outDir,
    });
    expect(result.wordpressBuilt).toBe(3);
    expect(result.staticBuilt).toBe(0);
    const rosa = result.entries.find((e) => e.business.name === "Rosa's Trattoria")!;
    expect(rosa.wpBundlePath).toBeTruthy();
    expect(rosa.sitePath).toBeUndefined();
  });

  test("merges multiple sources, enriching reviews and images", async () => {
    const outDir = await out();
    const result = await build({
      sources: [
        new CsvSource(join(FIX, "businesses.sample.csv")),
        new JsonSource(join(FIX, "businesses.sample.json")),
      ],
      outDir,
      video: false,
    });

    // Rosa's appears in both → merged into one record, not two.
    const rosaEntries = result.entries.filter((e) => e.business.name === "Rosa's Trattoria");
    expect(rosaEntries).toHaveLength(1);
    // CSV has 2 reviews, JSON adds 1 → 3 total after merge.
    expect(rosaEntries[0]!.business.reviews.length).toBe(3);
    // CSV has 2 images, JSON adds 1 unique → 3.
    expect(rosaEntries[0]!.business.images.length).toBe(3);

    // Willow & Wax and Harbor View come only from JSON.
    expect(result.entries.some((e) => e.business.name === "Willow & Wax Candle Co.")).toBe(true);
  });

  test("honours --limit for how many sites to build", async () => {
    const outDir = await out();
    const result = await build({
      sources: [new CsvSource(join(FIX, "businesses.sample.csv"))],
      outDir,
      limit: 1,
    });
    expect(result.sitesBuilt).toBe(1);
    // Still lists all businesses, just doesn't build past the cap.
    expect(result.total).toBe(5);
  });

  test("verifyLive rebuilds for a dead listed link", async () => {
    const outDir = await out();
    const fetchImpl = (async () =>
      new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const result = await build({
      sources: [new CsvSource(join(FIX, "businesses.sample.csv"))],
      outDir,
      verifyLive: true,
      fetchImpl,
    });
    // Bright Smile + Pit Stop have real URLs but both 404 → now need sites too.
    expect(result.needsWebsite).toBe(5);
    expect(result.sitesBuilt).toBe(5);
  });

  test("--include-weak builds a redesign for an outdated existing site", async () => {
    const outDir = await out();
    // One business with a live, but Wix (weak) + jQuery-1.x (outdated) site.
    const source = {
      name: "mem",
      async load() {
        return [
          {
            id: "wixco",
            name: "Wix Co",
            website: "https://wixco.example",
            images: [],
            reviews: [],
          },
        ];
      },
    };
    const fetchImpl = (async () =>
      new Response(
        '<script src="https://static.wixstatic.com/x.js"></script><script src="/jquery-1.12.4.min.js">',
        {
          status: 200,
        },
      )) as unknown as typeof fetch;
    const result = await build({
      sources: [source],
      outDir,
      target: "static",
      verifyLive: true,
      includeWeak: true,
      quotes: true,
      fetchImpl,
    });
    // It "has a website", so it isn't counted as needing one...
    expect(result.needsWebsite).toBe(0);
    // ...but --include-weak still builds a redesign + quote for it.
    expect(result.staticBuilt).toBe(1);
    const entry = result.entries[0]!;
    expect(entry.status.platform).toBe("Wix");
    expect(entry.status.weakBuilder).toBe(true);
    expect(entry.status.outdated).toBe(true);
    expect(entry.sitePath).toBeTruthy();
    expect(entry.quotePath).toBeTruthy();
  });
});
