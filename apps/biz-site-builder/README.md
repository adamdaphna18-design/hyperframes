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
                                   # (English CSV/JSON + the Hebrew רשם החברות registry, side by side)
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

| File                         | Purpose                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `content.wxr.xml`            | WordPress **WXR** import — Home / About / Reviews / Contact pages (Gutenberg blocks) + reviews as approved comments        |
| `theme/<slug>/`              | A **block child theme** of the base theme: `theme.json` palette from the brand colour + a `front-page.html` template       |
| `provision.sh`               | **WP-CLI** script: download core, install the language pack (`he_IL` for Israel), theme, plugins, and import content       |
| `composer.json`              | **roots/wordpress + wpackagist** dependencies (the Composer path to the same site)                                         |
| `mu-plugins/*-schema.php`    | Must-use plugin emitting **schema.org LocalBusiness** JSON-LD in `wp_head` (SEO)                                           |
| `theme/<slug>/functions.php` | `[bsb_map]` shortcode — **Leaflet + OpenStreetMap** map (only when the business has coordinates)                           |
| `woocommerce/products.csv`   | **WooCommerce** starter catalog (draft products seeded from photos) — retail businesses only; import via Products → Import |
| `plugins.json`               | Resolved **WordPress.org** plugin slugs + rationale                                                                        |
| `wp-cli.yml`, `README.md`    | WP-CLI config and three ways to deploy                                                                                     |

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
| `registry:q=מאפייה,limit=200`     | **Registrar of Companies (רשם החברות)** via data.gov.il — active companies by default (`active=false` for struck-off); a large pool of Israeli businesses that mostly have **no website** yet           |
| `datagovil:resource=<id>`         | **data.gov.il** — any other CKAN `datastore_search` resource by id; add `q=`/`limit=`/`active=`                                                                                                         |

### Registrar of Companies (רשם החברות)

`registry:` is a preset over data.gov.il's CKAN API — it resolves to the Registrar resource
(`f004176c-b85f-4542-8901-7b3176f9a054`) and filters to active companies (`filters={"סטטוס חברה":"פעילה"}`)
unless you pass `active=false`. The registry's Hebrew columns (`שם חברה`, `מספר חברה`, `מטרת החברה`,
`שם רחוב`+`מספר בית`+`שם עיר`) are mapped by the normalizer to name / id / description / address; a
registry record has **no website**, which is exactly the signal to build one. Company number, purpose
and address come through; phone, category and reviews do not (enrich those with a `csv:`/`overpass:`
source merged after). Override the resource with `datagovil:resource=<id>` if the id ever changes.

> This environment's network policy may block outbound calls to `data.gov.il` (the request 403s at the
> proxy); the source is fully unit-tested against the real CKAN request/response shape, and runs live
> under a network policy that allows `data.gov.il`.

**Offline replay.** `registry:file=<path>` (or `datagovil:file=<path>`) reads a **saved CKAN response**
from disk instead of the network — the exact same parse path, no egress. `bun run demo:registry` uses
this to build the full registry → Hebrew-WordPress flow from `fixtures/registry.sample.json` (five
active Israeli companies, no websites) with zero network. Save a real response once
(`curl '.../datastore_search?resource_id=…&limit=500' > companies.json`) and replay it deterministically.

### Israeli-market data

The normalizer understands **Hebrew field names** (`שם`/`שם עסק`, `רחוב`+`עיר`, `טלפון`, `קטגוריה`,
`דירוג`, …), so Israeli datasets map to the Business shape without a per-source adapter, and Hebrew
name/place/phone auto-selects the Hebrew/RTL site. Good free sources: **data.gov.il** (via
`datagovil:`), **OpenStreetMap** (via `overpass:`), and Hebrew CSV/JSON datasets
([mluggy/techmap](https://github.com/mluggy/techmap), OpenIsraeliSupermarkets, Israel-Online-Stores,
company-registry exports) ingested via `csv:`/`json:`. Respect each dataset's licence (e.g. techmap is
ODbL — attribute Michael Lugassy and share-alike).

#### Israeli business directories & registries — how each is ingested

There is no single free bulk feed of "all Israeli businesses", so these split by **what they expose**:
official **open data** (bulk, via CKAN) vs. **HTML directories** (per-business pages, via the `web:`
scraper) vs. **paid/manual lookups**. Only the first is bulk-automatable for free.

| Source                                                            | What it is                                           | How to ingest                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **רשם החברות / נסח חברה** ([gov.il](https://www.gov.il/))         | Registrar of Companies (official)                    | `registry:` preset — **bulk, free, already wired** (see above)                                                                  |
| **Guidestar** ([guidestar.org.il](https://www.guidestar.org.il/)) | Nonprofits / עמותות registry (Ministry of Justice)   | Its dataset is published on data.gov.il — `datagovil:resource=<amutot-id>` (grab the current resource id from the dataset page) |
| **דפי זהב / D.co.il** ([d.co.il](https://www.d.co.il/))           | Golden Pages business directory (addr/phone/reviews) | Per-business page via `web:https://www.d.co.il/<listing>` (JSON-LD/OG extract) — no free bulk API                               |
| **B144** ([b144.co.il](https://www.b144.co.il/))                  | Bezeq's business index                               | Per-business page via `web:<url>` — no free bulk API                                                                            |
| **CheckID** ([checkid.co.il](https://www.checkid.co.il/))         | Business-info directory                              | Per-business page via `web:<url>` — no free bulk API                                                                            |

**Honest caveats.** (1) The HTML directories (D.co.il, B144, CheckID) have **no free bulk API** — the
`web:` source reads one listing URL at a time; enumerating a whole category means a crawler, which is
their **Terms-of-Service and rate-limit territory** — check each site's ToS before scraping at scale.
(2) Guidestar covers **nonprofits (עמותות)**, not for-profit companies — for companies use `registry:`.
(3) I have **not hardcoded** the Guidestar/עמותות CKAN resource id because I couldn't verify it live
from this locked environment; pull the current id from the data.gov.il dataset page and pass it via
`datagovil:resource=<id>` (or ask and I'll add an `amutot:` preset like `registry:`).

## Agency landing page (`agency`)

`biz-site-builder agency --brand "Your Studio" [--tagline …] [--email …] [--phone …] [--market israel]`
writes **your agency's own** public landing page (`src/generate/agency.ts`) — a self-contained,
localized (RTL for Hebrew), brandable one-pager: how-it-works, website-build price bands, the recurring
**AI-workforce menu** (incl. the flagship AI Agent), a **50%-off launch offer** (original prices shown
struck through), **payment options** (50/50, up to 3 interest-free installments, card · bank transfer ·
Bit / PayBox), and a free-audit CTA. Prices come from the **same rate cards** as the quote/opportunity
generators (`siteBuildMenu`, `aiServiceMenu`), so the marketing page never drifts from what you'd quote.

## AI chat widget on built sites (`--chat-widget`)

`--chat-widget <embed-src> [--chat-embed-id <id>]` embeds an AI chat widget into every generated site —
the deliverable of the **AI Agent** service. Like the analytics snippet, it's pure templating
(`src/generate/chatwidget.ts`): a `<script src>` + `data-*` config for the operator's chosen embed
(AnythingLLM's `anythingllm-embed`, Fleek's chatbox, or any `data-*`-driven widget). It runs **no LLM
at build time** and injects nothing when unconfigured (no fake bubble); the bubble docks left on RTL
sites automatically. The live agent backend is the operator's (stateful) responsibility — same boundary
as a GA id.

## Website detection

A business "has a website" only if it lists a **real, owned** URL. Facebook / Instagram / Yelp /
Google-Maps / Linktree links count as _not_ a website — those businesses still get one built. With
`--verify-live`, listed URLs are HTTP-checked and **dead links** fall back to needing a site.

With `--verify-live`, the fetched page is also run through a **tech-stack detector**
(`src/website/techstack.ts`, WhatWeb / webanalyze / site-platform-detector style): signature-based
identification of the CMS/builder (WordPress, Wix, Shopify, Squarespace, Webflow, Joomla, Drupal, …)
plus auxiliary tech (WooCommerce, jQuery, React, GTM, server). A business on a locked-in **DIY builder**
(Wix/Squarespace/GoDaddy/Weebly/Webflow) is flagged `weakBuilder` — a weak online presence that's still
a lead, so it gets a lead-score bump. The platform shows on the directory card and in `index.json`.

## Website audit (customer-facing lead magnet)

`biz-site-builder audit --url https://a-business.com [--competitor https://rival.com] [--out report.html] [--locale he] [--brand X]`
scans a business that **already has a site** and writes a branded, localized (RTL for Hebrew) audit
report. It composes the existing deterministic analyzers — the on-page **SEO audit**, the
**tech-stack detector**, and a few heuristics — into findings where **every issue maps to a service
you sell** (SEO, social, accessibility, mobile, security, redesign, maintenance), with a 0–100 health
score, an **estimate** (a redesign when the stack is weak/outdated or there are ≥2 serious issues,
else a fix-and-optimize package), an **industry pain point** (a category-specific cost-of-inaction
line), and a call to action. The point is to turn a scanned business into a customer and cut
acquisition cost. No browser, no LLM — deterministic, and the generator
(`src/generate/audit.ts`) is pure/testable (the CLI just fetches the page).

With `--competitor <url>`, the audit also scans a rival and writes a side-by-side **"you vs. them"
comparison** (`<out>.compare.html`) over six checks (SEO, mobile, security, social, accessibility,
platform) plus overall score — a loss-prevention close that flags exactly where the prospect is
behind. Deciding _when_ to run this (which competitor, which lead) is orchestration for the separate
operational layer; the generator just takes the two URLs.

**Industry profile.** Each report carries a per-category profile (`src/generate/industry.ts`) covering
the trades (electrician, plumber, handyman) as well as restaurant/salon/lawyer/clinic/gym/shop/auto/
hotel + a generic fallback. It drives a **"what a {category} site needs"** section (the must-have
features for that industry) and a category-specific closing line, and it carries industry-average
benchmarks (deal size, close rate) used by the ROI estimator. Pass `--category <x>` on `audit --url`
to tailor it; without one, the generic profile is used.

**AI-workforce upsell.** Below the one-time fix estimate, the report renders a recurring-revenue
section (`src/generate/opportunities.ts`): each recommended AI service is **anchored to a finding the
audit actually produced** — an SEO/tech gap → an SEO & Content Agent, a social/mobile gap → a 24/7 AI
Receptionist, a security/perf/accessibility gap → a Lead Qualifier — priced from a fixed monthly rate
card with a 20%-off bundle. When the audit finds gaps across **two or more areas**, it also offers the
flagship **AI Agent (autonomous workflows)** tier — one agent that runs the whole funnel end to end
(answer → qualify → follow-up → schedule → post → report) rather than a single channel. A healthy site
(no findings) gets **no** upsell — recommendations are grounded, not manufactured, and no invented
traffic/revenue figures are asserted. The report _recommends_ these services; actually provisioning a
Twilio/LLM agent is stateful, network-bound work that belongs to the operational layer.

**ROI panel (operator-driven).** `src/generate/roi.ts` computes a return estimate — revenue recovered,
monthly ROI %, and break-even leads — but **only when the operator supplies a lead volume**
(`--leads-per-month N`, optionally `--deal-size N`). It never invents a traffic or lead figure; every
number is pure arithmetic over the stated inputs and the industry-average deal size / close rate, and
the panel prints those assumptions verbatim ("…industry averages, not a measurement of this
business"). No input → no panel.

**Batch mode.** `audit --csv <file>` audits a whole list at once — each row needs a website column
(English or Hebrew header aliases, same normalizer as the ingest sources), plus an optional
`competitor` column that triggers the comparison per row. It writes one report per business under
`<out>/reports/` and a roll-up `<out>/index.html` + `index.json` sorted **worst-score-first** (the
hottest leads on top), so the operational layer has a ready prospect list to work down.

## Lead scoring & quotes

Every business gets a deterministic **lead score** (0–100, `src/generate/lead.ts`) — rewarding no
owned site (the opportunity), rating, review volume, and reachability — surfaced in `index.json` and
the directory. With `--quotes`, each site-less business also gets a client-ready **price quote**
(`src/generate/quote.ts`): the recommended site type is picked from the category (EN + Hebrew
keywords), priced from a fixed 2026 rate card scaled by review volume, and rendered as a
self-contained localized (RTL for Hebrew) `sites/<slug>.quote.html`. Each quote carries an
**industry pain point** (`src/generate/painpoints.ts` — a category → cost-of-inaction lookup, EN +
Hebrew) and an **urgency** note (the price is locked for the validity window). This is the "lead →
quote" step; delivery (email/WhatsApp) and CRM are intentionally out of scope for this generator.

## Local SEO, social & maps

Every generated site is built for local search and social sharing, and closes the loop with the
scraper (which _reads_ this same data):

- **schema.org LocalBusiness JSON-LD** — static `<head>` + a WordPress `mu-plugin` in `wp_head`.
  Includes `aggregateRating` + `review[]` (star ratings in Google Rich Results / Bing) and
  `openingHoursSpecification` parsed from OSM `opening_hours`.
- **schema.org BreadcrumbList** — Home → Category → Business, on the static site (WordPress gets
  breadcrumbs from Yoast).
- **Open Graph + Twitter Cards** ([ogp.me](https://ogp.me) + Twitter Cards) — `og:*` and `twitter:*`
  tags for rich link previews.
- **Dynamic branded share image** — a deterministic 1200×630 **SVG** OG card per business (brand
  gradient + initials badge + name + category + star rating), used as `og:image`. No headless browser
  at build time; rasterise to PNG offline for legacy platforms if needed.
- **`servesCuisine`** — added to LocalBusiness JSON-LD for food businesses, from the OSM `cuisine` tag
  or the category.
- **Analytics** (opt-in) — inject **GA4** (`--ga-id`, fires a `view_item` event with
  business/category/city) or **Plausible** (`--plausible`), into the static `<head>` and a WordPress
  `mu-plugin`.
- **Keyword-rich titles & descriptions** — `{name} — {category} in {city} | {brand}` (`--brand`),
  a `<meta name="description">` from the profile, `robots: index,follow`, `canonical`, and `hreflang`
  (en/he) when a base URL is set.
- **Keyword engine** — dependency-free **RAKE** extraction over the description, seeded with the city
  - category for local long-tail phrases ("best coffee shop in Tel Aviv"). Flows into
    `<meta name="keywords">`, schema.org `keywords`, descriptive image `alt` text, and a per-business
    keyword report in `index.json`. Hebrew falls back to seed phrases (no English RAKE).
- **Structured opening hours** — the common OSM `opening_hours` subset (`Mo-Fr 08:00-18:00; Sa …;
Su off`, `24/7`) parsed into a localized `<time>` table on the site and `openingHoursSpecification`
  in JSON-LD; unparseable strings fall back to raw text.
- **Leaflet + OpenStreetMap map** — self-hosted, key-free interactive map on the contact section when
  the business has coordinates (static inline; WordPress via a `[bsb_map]` shortcode).
- **Nominatim geocoding** (`--geocode`) — fills missing coordinates from the address via
  OpenStreetMap Nominatim (descriptive User-Agent via `--geocode-email`; geocode sparingly).
- **sitemap.xml + robots.txt** — written to `<out>` for crawlability; set the host with `--base-url`.

On WordPress the resolved **Yoast SEO** plugin owns the OG/Twitter/canonical/breadcrumb tags at
runtime, so the bundle ships the _richer_ LocalBusiness + hours JSON-LD via the mu-plugin and lets
Yoast handle the rest; the static site emits everything itself.

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
    --base-url <url>      Host URL for sitemap.xml / robots.txt / canonical + OG URLs
    --brand <name>        Brand suffix appended to page titles
    --ga-id <id>          Inject Google Analytics 4 (view_item event)
    --plausible <domain>  Inject the Plausible analytics snippet
-h, --help
```

## Quality gates

- **Accessibility** — `bun run verify:a11y` builds the sample sites and runs **axe-core**
  ([dequelabs/axe-core](https://github.com/dequelabs/axe-core)) over every page in headless Chromium,
  failing on any **critical** or **serious** violation. The report logic (`src/verify/axe.ts`) is
  unit-tested; Playwright + axe-core load dynamically, so it's a dev/CI gate, not a build dependency.
  The generated palette is tuned to pass WCAG AA contrast for every brand hue.
- **SEO** — `bun run verify:seo` runs a deterministic on-page SEO audit (`src/verify/seo.ts`) over
  every generated page: `<title>` + length, meta description + length, exactly one `<h1>`,
  `<html lang>`, viewport, JSON-LD, non-empty image `alt`, OG tags and canonical. No browser — this is
  the durable half of a Lighthouse SEO run, fast and stable enough to gate on (live Lighthouse
  _performance_ is environment-sensitive and unsuitable as a hard gate here).

## Development

```bash
bun test           # 147 tests: sources, detection, generators, WordPress, workflow, i18n, SEO, a11y, pipeline
bun run typecheck
bun run verify:a11y  # accessibility gate (needs playwright + axe-core devDeps)
```

Deterministic by design (no `Date.now`, no unseeded randomness, no render-time fetches in generated
compositions or WXR) so output is reproducible and the promo videos render cleanly under hyperframes.
