# biz-site-builder

Scrape / ingest local **business listings**, detect which ones **don't have their own website**, and
auto-build both a **static website** and a **hyperframes promo video** for each of those businesses —
from its public profile, images and community reviews.

It's a standalone TypeScript/Bun app that lives alongside — but is independent of — the hyperframes
video framework. The promo videos it emits are hyperframes compositions, so you render them with the
`hyperframes` CLI.

```
ingest sources ─▶ merge/dedupe ─▶ detect website ─▶ (no site?) ─▶ build static site
                                                              └────▶ build promo video
                                          └──────────────────────▶ write browsable directory
```

## Quick start

```bash
bun install
bun run demo          # builds into ./.out from the sample fixtures
open .out/index.html  # browsable directory of every business + what was built
```

Or point it at your own data:

```bash
bun run src/cli.ts build \
  --source overpass:area=Brooklyn,limit=150 \
  --source csv:./reviews-and-photos.csv \
  --out ./directory --video --verify-live
```

## Data sources (`--source type:spec`, repeatable)

Sources are **merged in order** — later sources *enrich* earlier ones (fill gaps, append reviews and
photos) but never blank out data that's already set. This is how you combine a bare listing with a
separate reviews/photos file.

| Spec | What it does |
| --- | --- |
| `csv:./businesses.csv` | Ingest a CSV export. Columns are matched case-insensitively against common aliases (`name`/`business`/`title`, `website`/`url`/`site`, `phone`/`tel`, `images`/`photos`, `reviews`, …). Multi-value cells use `\|`, `;` or newlines. |
| `json:./businesses.json` | Ingest a JSON array, or an object wrapping one in `businesses` / `results` / `data` / `elements` / `items`. Reviews may be structured objects. |
| `overpass:area=Brooklyn` | **Scrape OpenStreetMap** businesses (POIs) in a named area via the free, no-key [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). OSM crucially carries a `website` tag — exactly the signal this tool keys off. |
| `overpass:bbox=S,W,N,E` | Same, but within a bounding box, e.g. `overpass:bbox=40.6,-74.0,40.7,-73.9`. |
| `overpass:area=Brooklyn,limit=200` | Cap the number of scraped POIs (be polite to the community-run API). |

Adding another source type is one file in `src/sources/` plus a case in `src/sources/index.ts:createSource`.

### On data sources, honestly

- **OpenStreetMap** is the free/open dataset that pairs listings *with* a website tag, so it's the
  natural scraping backbone. But OSM has **no community reviews** and rarely photos — merge a reviews
  CSV (Google/Yelp export, your own DB) as a second `--source` to enrich those listings.
- The CSV/JSON sources are the portable path for **any** dataset — an open business-listings dump, a
  places-API export, or hand-curated data.
- Respect each provider's Terms of Service and the Overpass usage policy. This tool doesn't bundle a
  scraper for sites that forbid it.

## Website detection

A business "has a website" only if it lists a **real, owned** URL. A Facebook / Instagram / Yelp /
Google-Maps / Linktree link is treated as *not* a website — those businesses still get one built.
With `--verify-live`, listed URLs are also HTTP-checked and **dead links** fall back to needing a site
(network errors are treated as "unknown" and don't penalise the business unless you want them to).

## Output

```
<out>/index.html      Browsable directory: every business, whether it needed a site, and links
<out>/index.json      Machine-readable listing (id, needsWebsite, reason, generated paths, …)
<out>/sites/*.html    A self-contained static website per site-less business
<out>/videos/*.html   Hyperframes promo compositions (only with --video)
```

Static sites are single-file, dependency-free (portable to any static host). Each has a hero, about,
photo gallery, reviews, and contact/hours with a maps link — styled from a stable palette derived
from the business name.

### Rendering the promo videos

The `videos/*.html` files are hyperframes compositions (a paused GSAP timeline registered on
`window.__timelines`, per the framework conventions). Render one to MP4 with the hyperframes CLI:

```bash
npx hyperframes render .out/videos/rosa-s-trattoria-3m5dkk.html
```

## CLI options

```
-s, --source <type:spec>  Add a source (repeatable)
-o, --out <dir>           Output directory (default: .out)
    --video               Also build a promo video per site-less business
    --verify-live         HTTP-check listed sites; rebuild for dead links
    --limit <n>           Only build for the first N site-less businesses
-h, --help                Show help
```

## Development

```bash
bun test         # unit + end-to-end pipeline tests
bun run typecheck
```

Deterministic by design (no `Date.now`, no unseeded randomness, no render-time fetches in generated
compositions) so output is reproducible and the promo videos render cleanly under hyperframes.
