#!/usr/bin/env bun
/**
 * SEO gate: build the sample static sites, then run the deterministic on-page
 * SEO audit over every generated page. Fails on any error-level issue. Run with
 * `bun run verify:seo`. No browser required.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../src/pipeline.ts";
import { CsvSource } from "../src/sources/csv.ts";
import { JsonSource } from "../src/sources/json.ts";
import { auditSeo, formatSeoReport } from "../src/verify/seo.ts";

const OUT = ".seo-out";
await rm(OUT, { recursive: true, force: true });
await build({
  sources: [
    new CsvSource("fixtures/businesses.sample.csv"),
    new JsonSource("fixtures/businesses.sample.json"),
  ],
  outDir: OUT,
  target: "static",
  baseUrl: "https://dir.example",
  brand: "Demo Directory",
});

const sitesDir = join(OUT, "sites");
const files = (await readdir(sitesDir))
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(sitesDir, f));

let failed = 0;
for (const file of files) {
  const report = auditSeo(await readFile(file, "utf8"), { expectCanonical: true });
  process.stdout.write(formatSeoReport(file, report) + "\n");
  if (!report.passed) failed++;
}
process.stdout.write(`\n${files.length - failed}/${files.length} pages pass the SEO gate.\n`);
await rm(OUT, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
