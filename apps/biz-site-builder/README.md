# biz-site-builder

Scrape / ingest local **business listings**, detect which ones **don't have their own website**, and
auto-build them one — by default a full **WordPress** deploy bundle, plus an optional **hyperframes
promo video** — from the business's public profile, images and community reviews. Israel-market
businesses are rendered in **Hebrew (RTL)** automatically.

It's a standalone TypeScript/Bun app that lives alongside — but is independent of — the hyperframes
video framework. The whole run is orchestrated as a small **dynamic workflow** (concurrency, a unit
budget, and deterministic resume).

```
ingest (parallel sources) ─▶ detect website + localise ─▶ select ─▶ build WordPress bundle (+ static/video)
                                                                  └─▶ browsable directory
```

## Quick start

```bash
bun install
bun run demo                       # builds WordPress + static + video into ./.out from fixtures
open .out/index.html               # browsable directory of every business + what was built
```

Point it at your own data and a market:

```bash
bun run src/cli.ts build \
  --source overpass:area="Tel Aviv",limit=150 \
  --source csv:./reviews.csv \
  --market israel --target wordpress --video --out ./directory
```

## Output targets (`--target`, default `wordpress`)

| Target      | Per site-less business                             |
| ----------- | -------------------------------------------------- |
| `wordpress` | A complete WordPress **deploy bundle** (see below) |
| `static`    | A self-contained static HTML site                  |
| `both`      | Static site **and** WordPress bundle               |

### The WordPress bundle — `sites/<slug>/`

Every site-less business gets a directory you can deploy to any WordPress host. It integrates the
WordPress ecosystem end to end:

| File                         | Purpose                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `content.wxr.xml`            | WordPress **WXR** import — Home / About / Reviews / Contact pages (Gutenberg blocks) + reviews as approved comments  |
| `theme/<slug>/`              | A **block child theme** of the base theme: `theme.json` palette from the brand colour + a `front-page.html` template |
| `provision.sh`               | **WP-CLI** script: download core, install the language pack (`he_IL` for Israel), theme, plugins, and import content |
| `composer.json`              | **roots/wordpress + wpackagist** dependencies (the Composer path to the same site)                                   |
| `mu-plugins/*-schema.php`    | Must-use plugin emitting **schema.org LocalBusiness** JSON-LD in `wp_head` (SEO)                                     |
| `theme/<slug>/functions.php` | `[bsb_map]` shortcode — **Leaflet + OpenStreetMap** map (only when the business has coordinates)                     |
| `plugins.json`               | Resolved **WordPress.org** plugin slugs + rationale                                                                  |
| `wp-cli.yml`, `README.md`    | WP-CLI config and three ways to deploy                                                                               |

Plugins are resolved by business category against a curated WordPress.org map (SEO, contact form,
cache always; reservations for restaurants, WooCommerce for retail, appointments for salons/clinics,
testimonials when reviews exist). `--live-plugins` augments this with a live query to the WordPress.org
plugins API (`api.wordpress.org/plugins/info/1.2/`).

Deploy the fastest way (from inside a bundle):

```bash
DB_NAME=wp DB_USER=root DB_PASS=secret SITE_URL=https://example.com bash provision.sh
```

## Data sources (`--source type:spec`, repeatable, merged in order)

Later sources **enrich** earlier ones (fill gaps, append reviews/photos) — never blank them out.

| Spec                              | What it does                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csv:./businesses.csv`            | Ingest a CSV export (aliased columns; multi-value cells split on `\|`/`;`/newline)                                                                                                                      |
| `json:./businesses.json`          | Ingest a JSON array or `{businesses\|results\|elements:[…]}`                                                                                                                                            |
| `overpass:area=Brooklyn`          | **Scrape OpenStreetMap** businesses in a named area (free, no key); OSM carries the `website` tag                                                                                                       |
| `overpass:bbox=S,W,N,E`           | …within a bounding box, e.g. `40.6,-74.0,40.7,-73.9`                                                                                                                                                    |
| `web:https://a.com,https://b.com` | **Ladder-style** server-side scrape (see [everywall/ladder](https://github.com/everywall/ladder)): fetches host-side, extracts schema.org JSON-LD / OpenGraph, rewrites relative image URLs to absolute |
| `web:https://a.com;ua=googlebot`  | …with a crawler user-agent (`googlebot`/`bingbot`/`facebook`/`chrome`) to slip past soft paywalls                                                                                                       |

## Website detection

A business "has a website" only if it lists a **real, owned** URL. Facebook / Instagram / Yelp /
Google-Maps / Linktree links count as _not_ a website — those businesses still get one built. With
`--verify-live`, listed URLs are HTTP-checked and **dead links** fall back to needing a site.

## Local SEO & maps

Every generated site is built for local search and closes the loop with the scraper (which _reads_
this same data):

- **schema.org LocalBusiness JSON-LD** — injected into the static site `<head>` and, for WordPress,
  via a `mu-plugin` in `wp_head`. Includes `aggregateRating` + `review[]` from community reviews so
  results can show star ratings (Google Rich Results / Bing).
- **Leaflet + OpenStreetMap map** — a self-hosted, key-free interactive map on the contact section
  when the business has coordinates (static site inline; WordPress via a `[bsb_map]` shortcode).
- **Nominatim geocoding** (`--geocode`) — fills missing coordinates from the address via
  OpenStreetMap Nominatim, so address-only businesses still get a map. Respects Nominatim's policy
  (descriptive User-Agent via `--geocode-email`, geocode sparingly).
- **sitemap.xml + robots.txt** — written to `<out>` for crawlability; set the host with `--base-url`.

## Localization (Israel market → Hebrew)

Locale is resolved per business: an Israeli phone prefix (`+972` / `05x`), an Israeli place in the
address, an `addr:country=IL` tag, or Hebrew characters in the name → **Hebrew, RTL**. Force it with
`--market israel` or `--locale he|en`. Hebrew flows through everything: the static site
(`<html dir="rtl">`), the promo video, the WordPress WXR (`<language>he-IL</language>`), the block
theme, and the provisioning script (`wp language core install he_IL`).

## Workflow runtime

`src/workflow/` is a provider-agnostic dynamic-workflow runtime in the spirit of Claude Code's
Workflow tool and its open re-implementations (odw, open-dynamic-workflows): `step()` (journal-cached),
`parallel()` (concurrency-capped barrier), `pipeline()` (per-item staging, no barrier), a hard unit
`budget`, and deterministic **resume** via a JSON journal. The build pipeline runs on it —
`--concurrency`, `--budget`, and `--resume` are exposed on the CLI.

## CLI options

```
-s, --source <type:spec>  Add a source (repeatable)
-o, --out <dir>           Output directory (default: .out)
-t, --target <t>          wordpress | static | both (default: wordpress)
    --video               Also build a hyperframes promo video per site-less business
    --verify-live         HTTP-check listed sites; rebuild for dead links
    --limit <n>           Only build for the first N site-less businesses
    --concurrency <n>     Max parallel build steps (default: 8)
    --budget <n>          Hard ceiling on build units
    --resume              Persist + replay a resume journal (<out>/.workflow.json)
    --locale <en|he>      Force a language for all sites
    --market <name>       Market hint; "israel" → Hebrew
    --wp-theme <slug>     Base WordPress theme to extend (default: twentytwentyfour)
    --live-plugins        Augment plugin choices via the WordPress.org plugins API
    --geocode             Geocode missing coordinates via OSM Nominatim (adds a map)
    --geocode-email <e>   Contact string for Nominatim's User-Agent
    --base-url <url>      Host URL for sitemap.xml / robots.txt
-h, --help
```

## Development

```bash
bun test          # 101 tests: sources, detection, generators, WordPress, workflow, i18n, pipeline
bun run typecheck
```

Deterministic by design (no `Date.now`, no unseeded randomness, no render-time fetches in generated
compositions or WXR) so output is reproducible and the promo videos render cleanly under hyperframes.
