import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Business, BusinessSource, WebsiteStatus } from "./types.ts";
import type { LocaleCode } from "./i18n/strings.ts";
import { stringsFor } from "./i18n/strings.ts";
import { resolveLocale } from "./i18n/locale.ts";
import { loadAndMerge } from "./sources/index.ts";
import { detectWebsite, verifyLive } from "./website/detect.ts";
import { generateSite, siteSlug } from "./generate/site.ts";
import { generateVideo, videoSlug } from "./generate/video.ts";
import { generateIndexHtml, generateIndexJson, type ListingEntry } from "./generate/listing.ts";
import { generateRobots, generateSitemap } from "./generate/sitemap.ts";
import { generateWordPressBundle } from "./wordpress/bundle.ts";
import { geocodeAddress } from "./sources/geocode.ts";
import { createRuntime } from "./workflow/runtime.ts";
import { Journal } from "./workflow/journal.ts";

export type OutputTarget = "static" | "wordpress" | "both";

export interface BuildOptions {
  sources: BusinessSource[];
  outDir: string;
  /** What to build per site-less business (default: "wordpress"). */
  target?: OutputTarget;
  /** Base WP theme the generated block child theme extends. */
  wpBaseTheme?: string;
  /** Best-effort live WordPress.org plugin lookup. */
  livePlugins?: boolean;
  /** Also generate a hyperframes promo video per site-less business. */
  video?: boolean;
  /** HTTP-check listed websites and rebuild for dead links. */
  verifyLive?: boolean;
  /** Only build sites for the first N site-less businesses (0 = no cap). */
  limit?: number;
  /** Max concurrent build steps (workflow runtime). */
  concurrency?: number;
  /** Hard ceiling on build "units" (one per site). null = unlimited. */
  budget?: number | null;
  /** Persist a resume journal to <out>/.workflow.json and replay it next run. */
  resume?: boolean;
  /** Force a locale for every business (overrides auto-detect). */
  locale?: LocaleCode;
  /** Market hint, e.g. "israel" → Hebrew. */
  market?: string;
  /** Geocode addresses lacking coordinates via OpenStreetMap Nominatim. */
  geocode?: boolean;
  /** Contact string for Nominatim's required User-Agent. */
  geocodeEmail?: string;
  /** Base URL where <out> will be hosted (for sitemap.xml / robots.txt / canonical). */
  baseUrl?: string;
  /** Brand suffix appended to page titles. */
  brand?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export interface BuildResult {
  total: number;
  needsWebsite: number;
  /** Businesses that got any site (static and/or WordPress). */
  sitesBuilt: number;
  /** Businesses that got a static HTML site. */
  staticBuilt: number;
  /** Businesses that got a WordPress bundle. */
  wordpressBuilt: number;
  videosBuilt: number;
  entries: ListingEntry[];
  outDir: string;
  /** Count of businesses rendered per locale. */
  localesUsed: Record<string, number>;
  /** Steps that replayed from the resume journal instead of re-running. */
  resumedSteps: number;
}

interface Detected {
  business: Business;
  status: WebsiteStatus;
  locale: LocaleCode;
}

/**
 * End-to-end, orchestrated as a dynamic workflow:
 *   ingest (parallel sources) ─▶ detect+localise (pipeline, resumable)
 *     ─▶ select ─▶ generate site + video (parallel, budgeted) ─▶ directory.
 *
 * The workflow runtime supplies concurrency, a unit budget, and deterministic
 * resume via a journal — the same primitives the Claude Code Workflow tool and
 * its open re-implementations expose.
 */
export async function build(opts: BuildOptions): Promise<BuildResult> {
  const log = opts.log ?? (() => {});
  const journalPath = join(opts.outDir, ".workflow.json");
  const journal = opts.resume ? await Journal.load(journalPath) : new Journal();
  const rt = createRuntime({
    concurrency: opts.concurrency ?? 8,
    budget: opts.budget ?? null,
    journal,
    runId: "build",
    log,
  });

  // ── Phase 1: ingest (sources merged in order) ──
  const businesses = await loadAndMerge(opts.sources);
  log(`Loaded ${businesses.length} unique businesses from ${opts.sources.length} source(s).`);

  await mkdir(opts.outDir, { recursive: true });
  const sitesDir = join(opts.outDir, "sites");
  const videosDir = join(opts.outDir, "videos");

  // ── Phase 2: detect website + geocode + resolve locale (concurrent, resumable) ──
  const detected = (await rt.pipeline(businesses, async (_prev, business) => {
    const status = await rt.step(`detect/${business.id}`, async () => {
      let s = detectWebsite(business);
      if (s.hasWebsite && opts.verifyLive) {
        s = await verifyLive(s, { fetchImpl: opts.fetchImpl });
      }
      return s;
    });
    if (opts.geocode && !business.location && business.address) {
      const point = await rt.step(`geocode/${business.id}`, () =>
        geocodeAddress(business.address!, { email: opts.geocodeEmail, fetchImpl: opts.fetchImpl }),
      );
      if (point) business.location = point;
    }
    const locale = resolveLocale(business, { override: opts.locale, market: opts.market });
    return { business, status, locale } satisfies Detected;
  })) as Detected[];

  // ── Phase 3: select which businesses need a site (order-preserving cap) ──
  const target: OutputTarget = opts.target ?? "wordpress";
  const wantStatic = target === "static" || target === "both";
  const wantWordPress = target === "wordpress" || target === "both";
  const needing = detected.filter((d) => !d.status.hasWebsite);
  const selected = opts.limit ? needing.slice(0, opts.limit) : needing;
  if (opts.limit && needing.length > selected.length) {
    log(`Limit ${opts.limit}: building ${selected.length}/${needing.length} site-less businesses.`);
  }

  // ── Phase 4: generate per selected business (parallel, budgeted, resumable) ──
  const built = await rt.parallel(
    selected.map((d) => async () => {
      const s = stringsFor(d.locale);
      const slug = siteSlug(d.business);
      const result: BuiltArtifacts = { id: d.business.id };

      if (wantStatic) {
        await mkdir(sitesDir, { recursive: true });
        result.sitePath = await rt.step(
          `site/${d.business.id}`,
          async () => {
            const html = generateSite(d.business, s, {
              baseUrl: opts.baseUrl,
              path: `sites/${slug}.html`,
              brand: opts.brand,
            });
            await writeFile(join(sitesDir, `${slug}.html`), html, "utf8");
            return `sites/${slug}.html`;
          },
          { cost: 1 },
        );
      }

      if (wantWordPress) {
        result.wpBundlePath = await rt.step(
          `wordpress/${d.business.id}`,
          async () => {
            const bundle = await generateWordPressBundle(d.business, {
              strings: s,
              baseTheme: opts.wpBaseTheme,
              livePlugins: opts.livePlugins,
              fetchImpl: opts.fetchImpl,
            });
            const dir = join(sitesDir, bundle.slug);
            await writeBundle(join(dir), bundle.files);
            return `sites/${bundle.slug}/`;
          },
          { cost: 1 },
        );
      }

      if (opts.video) {
        const vslug = videoSlug(d.business);
        await mkdir(videosDir, { recursive: true });
        result.videoPath = await rt.step(`video/${d.business.id}`, async () => {
          await writeFile(
            join(videosDir, `${vslug}.html`),
            generateVideo(d.business, { strings: s }),
            "utf8",
          );
          return `videos/${vslug}.html`;
        });
      }
      log(`Built ${target} for ${d.business.name} [${d.locale}].`);
      return result;
    }),
  );

  const builtById = new Map(built.filter(Boolean).map((b) => [b!.id, b!]));

  // ── Assemble entries + directory ──
  const entries: ListingEntry[] = detected.map((d) => {
    const b = builtById.get(d.business.id);
    const entry: ListingEntry = { business: d.business, status: d.status, locale: d.locale };
    if (b?.sitePath) entry.sitePath = b.sitePath;
    if (b?.wpBundlePath) entry.wpBundlePath = b.wpBundlePath;
    if (b?.videoPath) entry.videoPath = b.videoPath;
    return entry;
  });

  const directoryLocale = resolveDirectoryLocale(entries, opts);
  await writeFile(
    join(opts.outDir, "index.html"),
    generateIndexHtml(entries, stringsFor(directoryLocale)),
    "utf8",
  );
  await writeFile(join(opts.outDir, "index.json"), generateIndexJson(entries), "utf8");

  // sitemap.xml + robots.txt for crawlability of the directory.
  const baseUrl = opts.baseUrl ?? "https://example.com";
  await writeFile(join(opts.outDir, "sitemap.xml"), generateSitemap(entries, baseUrl), "utf8");
  await writeFile(join(opts.outDir, "robots.txt"), generateRobots(baseUrl), "utf8");

  if (opts.resume) await journal.save(journalPath, rt.runId);

  const localesUsed: Record<string, number> = {};
  for (const e of entries) localesUsed[e.locale ?? "en"] = (localesUsed[e.locale ?? "en"] ?? 0) + 1;

  const staticBuilt = entries.filter((e) => e.sitePath).length;
  const wordpressBuilt = entries.filter((e) => e.wpBundlePath).length;
  const sitesBuilt = entries.filter((e) => e.sitePath || e.wpBundlePath).length;
  const videosBuilt = entries.filter((e) => e.videoPath).length;
  const needsWebsite = needing.length;
  log(
    `Done. ${needsWebsite}/${businesses.length} needed a website; built ${sitesBuilt} site(s) [${target}], ${videosBuilt} video(s). ${rt.cacheHits()} step(s) resumed.`,
  );

  return {
    total: businesses.length,
    needsWebsite,
    sitesBuilt,
    staticBuilt,
    wordpressBuilt,
    videosBuilt,
    entries,
    outDir: opts.outDir,
    localesUsed,
    resumedSteps: rt.cacheHits(),
  };
}

interface BuiltArtifacts {
  id: string;
  sitePath?: string;
  wpBundlePath?: string;
  videoPath?: string;
}

/** Write a WordPress bundle's files, creating dirs and marking scripts +x. */
async function writeBundle(
  dir: string,
  files: Array<{ path: string; content: string; executable?: boolean }>,
): Promise<void> {
  for (const file of files) {
    const full = join(dir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, "utf8");
    if (file.executable) await chmod(full, 0o755);
  }
}

/** Pick the directory page's language: explicit override wins, else majority. */
function resolveDirectoryLocale(entries: ListingEntry[], opts: BuildOptions): LocaleCode {
  if (opts.locale) return opts.locale;
  if (opts.market && ["israel", "il", "he", "hebrew"].includes(opts.market.toLowerCase()))
    return "he";
  let he = 0;
  let en = 0;
  for (const e of entries) {
    if (e.locale === "he") he++;
    else en++;
  }
  return he > en ? "he" : "en";
}
