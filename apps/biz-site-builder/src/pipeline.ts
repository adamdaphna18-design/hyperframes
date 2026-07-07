import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BusinessSource } from "./types.ts";
import { loadAndMerge } from "./sources/index.ts";
import { detectWebsite, verifyLive } from "./website/detect.ts";
import { generateSite, siteSlug } from "./generate/site.ts";
import { generateVideo, videoSlug } from "./generate/video.ts";
import { generateIndexHtml, generateIndexJson, type ListingEntry } from "./generate/listing.ts";

export interface BuildOptions {
  sources: BusinessSource[];
  outDir: string;
  /** Also generate a hyperframes promo video per site-less business. */
  video?: boolean;
  /** HTTP-check listed websites and rebuild for dead links. */
  verifyLive?: boolean;
  /** Only build sites for the first N site-less businesses (0 = no cap). */
  limit?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export interface BuildResult {
  total: number;
  needsWebsite: number;
  sitesBuilt: number;
  videosBuilt: number;
  entries: ListingEntry[];
  outDir: string;
}

/**
 * End-to-end: ingest → dedupe/merge → detect website → for the site-less,
 * generate a static site (+ optional promo video) → write a browsable
 * directory. Returns a structured summary.
 */
export async function build(opts: BuildOptions): Promise<BuildResult> {
  const log = opts.log ?? (() => {});
  const businesses = await loadAndMerge(opts.sources);
  log(`Loaded ${businesses.length} unique businesses from ${opts.sources.length} source(s).`);

  const entries: ListingEntry[] = [];
  let sitesBuilt = 0;
  let videosBuilt = 0;
  let builtCount = 0;

  const sitesDir = join(opts.outDir, "sites");
  const videosDir = join(opts.outDir, "videos");
  await mkdir(opts.outDir, { recursive: true });

  for (const business of businesses) {
    let status = detectWebsite(business);
    if (status.hasWebsite && opts.verifyLive) {
      status = await verifyLive(status, { fetchImpl: opts.fetchImpl });
    }

    const entry: ListingEntry = { business, status };

    if (!status.hasWebsite) {
      const capReached = opts.limit ? builtCount >= opts.limit : false;
      if (capReached) {
        log(`Skipping ${business.name} (limit ${opts.limit} reached).`);
      } else {
        const slug = siteSlug(business);
        await mkdir(sitesDir, { recursive: true });
        const siteFile = join(sitesDir, `${slug}.html`);
        await writeFile(siteFile, generateSite(business), "utf8");
        entry.sitePath = `sites/${slug}.html`;
        sitesBuilt++;

        if (opts.video) {
          await mkdir(videosDir, { recursive: true });
          const vslug = videoSlug(business);
          const videoFile = join(videosDir, `${vslug}.html`);
          await writeFile(videoFile, generateVideo(business), "utf8");
          entry.videoPath = `videos/${vslug}.html`;
          videosBuilt++;
        }
        builtCount++;
        log(`Built site${opts.video ? " + video" : ""} for ${business.name} (${status.reason}).`);
      }
    }

    entries.push(entry);
  }

  await writeFile(join(opts.outDir, "index.html"), generateIndexHtml(entries), "utf8");
  await writeFile(join(opts.outDir, "index.json"), generateIndexJson(entries), "utf8");

  const needsWebsite = entries.filter((e) => !e.status.hasWebsite).length;
  log(
    `Done. ${needsWebsite}/${businesses.length} needed a website; built ${sitesBuilt} site(s), ${videosBuilt} video(s).`,
  );

  return {
    total: businesses.length,
    needsWebsite,
    sitesBuilt,
    videosBuilt,
    entries,
    outDir: opts.outDir,
  };
}
