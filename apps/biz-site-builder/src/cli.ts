#!/usr/bin/env bun
import { createSource } from "./sources/index.ts";
import { build } from "./pipeline.ts";

interface ParsedArgs {
  command: string;
  sources: string[];
  out: string;
  video: boolean;
  verifyLive: boolean;
  limit: number;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: argv[0] && !argv[0].startsWith("-") ? argv[0] : "build",
    sources: [],
    out: ".out",
    video: false,
    verifyLive: false,
    limit: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-s":
      case "--source":
        if (argv[++i]) args.sources.push(argv[i]!);
        break;
      case "-o":
      case "--out":
        if (argv[++i]) args.out = argv[i]!;
        break;
      case "--video":
        args.video = true;
        break;
      case "--verify-live":
        args.verifyLive = true;
        break;
      case "--limit":
        args.limit = Number(argv[++i]) || 0;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
    }
  }
  return args;
}

const HELP = `biz-site-builder — scrape/list businesses, build sites + promo videos for those without one

Usage:
  biz-site-builder build --source <type:spec> [--source ...] [options]

Sources (repeatable, merged in order — later sources enrich earlier ones):
  csv:./businesses.csv              Ingest a CSV export
  json:./businesses.json            Ingest a JSON array (or {businesses|results|elements:[...]})
  overpass:area=Brooklyn            Scrape OpenStreetMap businesses in a named area (free, no key)
  overpass:bbox=40.6,-74.0,40.7,-73.9   ...or within a bounding box (south,west,north,east)
  overpass:area=Brooklyn,limit=200  Cap the number of scraped POIs

Options:
  -o, --out <dir>       Output directory (default: .out)
      --video           Also build a hyperframes promo video per site-less business
      --verify-live     HTTP-check listed sites; rebuild for dead links
      --limit <n>       Only build for the first N site-less businesses
  -h, --help            Show this help

Output:
  <out>/index.html      Browsable directory of every business + outcome
  <out>/index.json      Machine-readable listing
  <out>/sites/*.html    A generated static website per site-less business
  <out>/videos/*.html   Hyperframes promo compositions (render with: npx hyperframes render <file>)

Example:
  biz-site-builder build \\
    --source overpass:area=Brooklyn,limit=150 \\
    --source csv:./reviews-and-photos.csv \\
    --out ./directory --video --verify-live
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (args.command !== "build") {
    process.stderr.write(`Unknown command "${args.command}".\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }
  if (args.sources.length === 0) {
    process.stderr.write("Error: at least one --source is required.\n\n" + HELP);
    process.exitCode = 1;
    return;
  }

  let sources;
  try {
    sources = args.sources.map(createSource);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await build({
      sources,
      outDir: args.out,
      video: args.video,
      verifyLive: args.verifyLive,
      limit: args.limit,
      log: (msg) => process.stdout.write(msg + "\n"),
    });
    process.stdout.write(
      `\n✓ ${result.outDir}/index.html — ${result.total} listed, ${result.sitesBuilt} sites, ${result.videosBuilt} videos.\n`,
    );
  } catch (err) {
    process.stderr.write(`Build failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

main();
