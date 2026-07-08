import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc, paletteFor } from "./util.ts";
import { getIndustryProfile } from "./industry.ts";
import { servicesFor } from "./services.ts";
import { extractKeywords } from "./keywords.ts";
import { cityOf } from "./meta.ts";

/**
 * A deterministic **SEO blog generator** — the content half of the per-profession
 * workflow. Every business ships with a set of ready-to-publish articles built
 * from its trade's keyword targets (pricing guide, how-to-choose, common
 * mistakes, service how-to, FAQ), with **internal links** between posts, the
 * services section and contact (the "backlinked, everything ready" part) plus
 * Article schema. No LLM, no network, no invented facts about the business — it
 * templates real, on-topic SEO scaffolding the owner publishes or edits. EN + HE.
 */

/** Rate-card year used in pricing-guide titles (kept constant for determinism). */
const GUIDE_YEAR = 2026;

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  /** Rendered, self-contained article HTML. */
  html: string;
}

interface Section {
  h2: string;
  paras: string[];
  list?: string[];
}
interface Draft {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  sections: Section[];
  faq?: Array<{ q: string; a: string }>;
}

function slugify(base: string, i: number): string {
  return `post-${i + 1}-${base}`;
}

/** Build the article drafts (content only) for a business's trade. */
function drafts(business: Business, s: Strings): Draft[] {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const profile = getIndustryProfile(business, s);
  const trade = profile.displayName;
  const city = cityOf(business) ?? t("your area", "האזור שלכם");
  const services = servicesFor(business, s);
  const topService = services[0]?.name ?? t("our service", "השירות שלנו");
  const kw = extractKeywords(business, s).all.slice(0, 6);
  const features = profile.requiredFeatures;

  const out: Draft[] = [];

  // 1) Pricing guide — anchored to the real service menu.
  out.push({
    slug: slugify("pricing", 0),
    title: t(
      `How much does a ${trade.toLowerCase()} cost in ${city}? ${GUIDE_YEAR} price guide`,
      `כמה עולה ${trade} ב${city}? מדריך מחירים ${GUIDE_YEAR}`,
    ),
    description: t(
      `A transparent ${GUIDE_YEAR} price guide for ${trade.toLowerCase()} services in ${city}.`,
      `מדריך מחירים שקוף ל${GUIDE_YEAR} לשירותי ${trade} ב${city}.`,
    ),
    keywords: [...kw, t("price", "מחיר"), t("cost", "עלות")],
    intro: t(
      `Wondering what to budget? Here's an honest breakdown of typical ${trade.toLowerCase()} prices in ${city}, and what changes them.`,
      `תוהים כמה לתקצב? הנה פירוט הוגן של מחירים אופייניים ל${trade} ב${city}, ומה משפיע עליהם.`,
    ),
    sections: [
      {
        h2: t("Typical prices", "מחירים אופייניים"),
        paras: [
          t(
            "Prices vary by experience, materials and timing — use these as a starting point.",
            "המחירים משתנים לפי ניסיון, חומרים ועיתוי — קחו אותם כנקודת התחלה.",
          ),
        ],
        list: services.slice(0, 6).map((x) => `${x.name}${x.price ? ` — ${x.price}` : ""}`),
      },
      {
        h2: t("What changes the price", "מה משפיע על המחיר"),
        paras: [
          t(
            "Complexity, add-ons and peak hours all move the number. Ask for a written quote before you start.",
            "מורכבות, תוספות ושעות עומס משפיעים על המחיר. בקשו הצעת מחיר כתובה לפני שמתחילים.",
          ),
        ],
      },
    ],
  });

  // 2) How to choose — trust signals from the profile.
  out.push({
    slug: slugify("choose", 1),
    title: t(
      `How to choose a ${trade.toLowerCase()} in ${city}: a checklist`,
      `איך לבחור ${trade} ב${city}: צ׳קליסט`,
    ),
    description: t(
      `What to check before booking a ${trade.toLowerCase()} in ${city}.`,
      `מה לבדוק לפני שקובעים ${trade} ב${city}.`,
    ),
    keywords: [...kw, t("reviews", "ביקורות"), t("recommended", "מומלץ")],
    intro: t(
      `Not all ${trade.toLowerCase()}s are equal. Run through this checklist to pick with confidence.`,
      `לא כל ${trade} זהה. עברו על הצ׳קליסט הזה כדי לבחור בביטחון.`,
    ),
    sections: [
      {
        h2: t("Your checklist", "הצ׳קליסט שלכם"),
        paras: [],
        list: [
          t("Real reviews from local customers", "ביקורות אמיתיות מלקוחות מקומיים"),
          t("Clear, upfront pricing", "מחירים ברורים ומראש"),
          t("Easy online booking or quick response", "קביעה אונליין נוחה או מענה מהיר"),
          ...features.slice(0, 2),
        ],
      },
      {
        h2: t("Red flags", "סימני אזהרה"),
        paras: [
          t(
            "No reviews, no price transparency, and no easy way to reach them — keep looking.",
            "אין ביקורות, אין שקיפות מחירים, ואין דרך קלה ליצור קשר — המשיכו לחפש.",
          ),
        ],
      },
    ],
  });

  // 3) Common mistakes — built from the trade pain point.
  out.push({
    slug: slugify("mistakes", 2),
    title: t(
      `5 mistakes customers make with ${trade.toLowerCase()}s`,
      `5 טעויות שלקוחות עושים עם ${trade}`,
    ),
    description: t(
      `Avoid the common pitfalls when hiring a ${trade.toLowerCase()}.`,
      `הימנעו מהטעויות הנפוצות בבחירת ${trade}.`,
    ),
    keywords: [...kw, t("mistakes", "טעויות"), t("tips", "טיפים")],
    intro: profile.painPoint,
    sections: [
      {
        h2: t("The five to avoid", "החמש שכדאי להימנע מהן"),
        paras: [],
        list: [
          t("Choosing on price alone", "לבחור לפי מחיר בלבד"),
          t("Skipping the reviews", "לדלג על הביקורות"),
          t("Not asking for a written quote", "לא לבקש הצעת מחיר כתובה"),
          t("Waiting until the last minute", "לחכות לרגע האחרון"),
          t("Not booking ahead", "לא לקבוע מראש"),
        ],
      },
    ],
  });

  // 4) Service how-to — the top service.
  out.push({
    slug: slugify("guide", 3),
    title: t(`The complete guide to ${topService}`, `המדריך המלא ל${topService}`),
    description: t(
      `Everything you need to know about ${topService.toLowerCase()}.`,
      `כל מה שצריך לדעת על ${topService}.`,
    ),
    keywords: [...kw, topService],
    intro: t(
      `Here's what to expect, how to prepare, and how to get the best result from ${topService.toLowerCase()}.`,
      `הנה למה לצפות, איך להתכונן, ואיך להפיק את המרב מ${topService}.`,
    ),
    sections: [
      {
        h2: t("Before you come", "לפני שמגיעים"),
        paras: [
          t(
            "A little preparation goes a long way. Book ahead and tell us what you're after.",
            "קצת הכנה עושה הבדל גדול. קבעו מראש וספרו לנו מה אתם רוצים.",
          ),
        ],
      },
      {
        h2: t("What to expect", "למה לצפות"),
        paras: [profile.closingPitch],
      },
    ],
  });

  // 5) FAQ.
  out.push({
    slug: slugify("faq", 4),
    title: t(`${trade} FAQ: your questions answered`, `שאלות נפוצות על ${trade}`),
    description: t(
      `Answers to the most common ${trade.toLowerCase()} questions in ${city}.`,
      `תשובות לשאלות הנפוצות על ${trade} ב${city}.`,
    ),
    keywords: [...kw, t("faq", "שאלות נפוצות")],
    intro: t(
      "The questions we hear most — answered.",
      "השאלות שאנחנו שומעים הכי הרבה — עם תשובות.",
    ),
    sections: [],
    faq: [
      {
        q: t("Do I need to book ahead?", "צריך לקבוע מראש?"),
        a: t(
          "Booking ahead guarantees your spot, but we do our best to fit in walk-ins.",
          "קביעה מראש מבטיחה מקום, אבל נשתדל לקלוט גם מגיעים ללא תור.",
        ),
      },
      {
        q: t("How much does it cost?", "כמה זה עולה?"),
        a: t(
          "See our services section for current pricing, or ask for a quick quote.",
          "ראו את מדור השירותים למחירים עדכניים, או בקשו הצעת מחיר מהירה.",
        ),
      },
      {
        q: t("Where are you located?", "איפה אתם ממוקמים?"),
        a: t(
          `We're in ${city}. See the contact section for directions.`,
          `אנחנו ב${city}. ראו את מדור צור הקשר להוראות הגעה.`,
        ),
      },
    ],
  });

  return out;
}

export interface BlogOptions {
  /** Relative href from a blog file back to the business's site homepage. */
  homeHref?: string;
}

/** Render one article to self-contained HTML with internal backlinks + schema. */
function renderPost(
  business: Business,
  s: Strings,
  d: Draft,
  siblings: Draft[],
  home: string,
): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const p = paletteFor(business);
  const related = siblings.filter((x) => x.slug !== d.slug).slice(0, 3);

  const body = [
    `<p class="lede">${esc(d.intro)}</p>`,
    ...d.sections.map(
      (sec) =>
        `<h2>${esc(sec.h2)}</h2>${sec.paras.map((x) => `<p>${esc(x)}</p>`).join("")}${
          sec.list?.length ? `<ul>${sec.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""
        }`,
    ),
    d.faq?.length
      ? `<h2>${t("FAQ", "שאלות נפוצות")}</h2>${d.faq
          .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
          .join("")}`
      : "",
  ].join("\n      ");

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: d.title,
    about: business.category ?? business.name,
    keywords: d.keywords.join(", "),
    publisher: { "@type": "Organization", name: business.name },
  };

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(d.title)} — ${esc(business.name)}</title>
    <meta name="description" content="${esc(d.description)}" />
    <meta name="keywords" content="${esc(d.keywords.join(", "))}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(d.title)}" />
    <script type="application/ld+json">
${JSON.stringify(articleLd, null, 2).replace(/</g, "\\u003c")}
    </script>
    <style>
      :root { --accent: ${p.accent}; --ink: ${p.accentInk}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #1f2430; line-height: 1.7; }
      .wrap { max-width: 760px; margin: 0 auto; padding: 32px 24px 64px; }
      nav.crumb { font-size: 14px; margin-bottom: 20px; }
      nav.crumb a { color: var(--ink); text-decoration: none; }
      h1 { font-size: clamp(26px, 5vw, 40px); line-height: 1.15; margin-bottom: 12px; }
      .lede { font-size: 19px; color: #3a3f4b; margin: 16px 0 24px; }
      h2 { font-size: 22px; margin: 30px 0 10px; }
      h3 { font-size: 17px; margin: 18px 0 6px; }
      p { margin: 10px 0; }
      ul { margin: 10px 0; padding-inline-start: 22px; }
      li { margin: 6px 0; }
      .cta { margin: 34px 0; padding: 22px; background: #f4f5fb; border-radius: 14px; text-align: center; }
      .cta a { display: inline-block; margin-top: 12px; background: var(--accent); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 700; }
      .related { margin-top: 40px; border-top: 1px solid #eceef4; padding-top: 20px; }
      .related a { display: block; color: var(--ink); font-weight: 600; padding: 8px 0; text-decoration: none; }
      footer { color: #5b6270; font-size: 13px; margin-top: 40px; }
    </style>
  </head>
  <body>
    <article class="wrap">
      <nav class="crumb"><a href="${esc(home)}">${esc(business.name)}</a> ›
        <a href="./index.html">${t("Blog", "בלוג")}</a></nav>
      <h1>${esc(d.title)}</h1>
      ${body}
      <div class="cta">
        <div>${esc(t("Ready when you are.", "מוכנים כשאתם מוכנים."))}</div>
        <a href="${esc(home)}#contact">${t("Book now", "לקביעת תור")}</a>
        · <a href="${esc(home)}#services" style="background:transparent;color:var(--ink)">${t("See prices", "למחירון")}</a>
      </div>
      <div class="related">
        <strong>${t("Read next", "המשיכו לקרוא")}</strong>
        ${related.map((r) => `<a href="./${r.slug}.html">${esc(r.title)}</a>`).join("\n        ")}
      </div>
      <footer>© ${esc(business.name)}</footer>
    </article>
  </body>
</html>
`;
}

/** The blog index page linking every post (internal-link hub). */
function renderIndex(business: Business, s: Strings, ds: Draft[], home: string): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const p = paletteFor(business);
  const cards = ds
    .map(
      (d) =>
        `<li><a href="./${d.slug}.html"><span class="pt">${esc(d.title)}</span><span class="pd">${esc(d.description)}</span></a></li>`,
    )
    .join("\n        ");
  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t("Blog", "בלוג")} — ${esc(business.name)}</title>
    <meta name="description" content="${esc(t(`Guides & tips from ${business.name}.`, `מדריכים וטיפים מ${business.name}.`))}" />
    <style>
      :root { --ink: ${p.accentInk}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #1f2430; }
      .wrap { max-width: 760px; margin: 0 auto; padding: 40px 24px 64px; }
      h1 { font-size: 32px; margin-bottom: 6px; }
      .sub { color: #5b6270; margin-bottom: 24px; }
      ul { list-style: none; display: grid; gap: 12px; }
      li a { display: block; border: 1px solid #e6e8f0; border-radius: 12px; padding: 18px; text-decoration: none; color: inherit; }
      .pt { display: block; font-weight: 700; font-size: 18px; color: var(--ink); }
      .pd { display: block; color: #5b6270; margin-top: 4px; }
      a.home { color: var(--ink); text-decoration: none; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <a class="home" href="${esc(home)}">← ${esc(business.name)}</a>
      <h1>${t("Blog", "בלוג")}</h1>
      <p class="sub">${esc(t(`Guides, prices and tips.`, `מדריכים, מחירים וטיפים.`))}</p>
      <ul>
        ${cards}
      </ul>
    </div>
  </body>
</html>
`;
}

/** Generate the full blog for a business: an index + N ready SEO articles. */
export function generateBlog(
  business: Business,
  s: Strings = stringsFor("en"),
  opts: BlogOptions = {},
): { index: string; posts: BlogPost[] } {
  const home = opts.homeHref ?? "../index.html";
  const ds = drafts(business, s);
  const posts: BlogPost[] = ds.map((d) => ({
    slug: d.slug,
    title: d.title,
    description: d.description,
    keywords: d.keywords,
    html: renderPost(business, s, d, ds, home),
  }));
  return { index: renderIndex(business, s, ds, home), posts };
}
