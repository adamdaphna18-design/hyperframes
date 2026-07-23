import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { cityOf } from "./meta.ts";
import { cuisineOf } from "./schema.ts";

/**
 * Dependency-free keyword extraction (RAKE — Rapid Automatic Keyword Extraction,
 * Rose et al. 2010) over the business description, seeded with the location and
 * category to produce locally-relevant long-tail phrases ("best specialty
 * coffee in Tel Aviv"). No external NLP service; deterministic output.
 *
 * Extraction runs on English text; for Hebrew (and when there's no usable
 * description) we fall back to location/category-seeded phrases only.
 */

// Compact English stopword list for RAKE phrase splitting.
const STOPWORDS = new Set(
  "a about above after again against all am an and any are aren't as at be because been before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves we our us also serving since made".split(
    /\s+/,
  ),
);

const WORD = /[a-z][a-z'-]*/g;

interface Scored {
  phrase: string;
  score: number;
}

/** RAKE over a block of English text → ranked candidate phrases. */
export function rake(text: string, maxWords = 3): Scored[] {
  const lower = text.toLowerCase();
  // Split into candidate phrases at stopwords and punctuation.
  const phrases: string[][] = [];
  for (const sentence of lower.split(/[.!?,;:()"–—\n]+/)) {
    let current: string[] = [];
    for (const token of sentence.match(WORD) ?? []) {
      if (STOPWORDS.has(token) || token.length < 3) {
        if (current.length) phrases.push(current);
        current = [];
      } else {
        current.push(token);
      }
    }
    if (current.length) phrases.push(current);
  }

  // Word frequency + degree (co-occurrence) → word score = degree / freq.
  const freq: Record<string, number> = {};
  const degree: Record<string, number> = {};
  for (const phrase of phrases) {
    const d = phrase.length - 1;
    for (const w of phrase) {
      freq[w] = (freq[w] ?? 0) + 1;
      degree[w] = (degree[w] ?? 0) + d;
    }
  }
  const wordScore: Record<string, number> = {};
  for (const w of Object.keys(freq)) wordScore[w] = (degree[w]! + freq[w]!) / freq[w]!;

  // Phrase score = sum of member word scores; dedupe, cap length.
  const seen = new Map<string, number>();
  for (const phrase of phrases) {
    if (phrase.length > maxWords) continue;
    const key = phrase.join(" ");
    const score = phrase.reduce((sum, w) => sum + (wordScore[w] ?? 0), 0);
    if (!seen.has(key) || seen.get(key)! < score) seen.set(key, score);
  }

  return (
    [...seen.entries()]
      .map(([phrase, score]) => ({ phrase, score }))
      // Stable order: score desc, then alphabetical.
      .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase))
  );
}

function titleCase(phrase: string): string {
  return phrase.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Keywords {
  /** Short head terms (category, cuisine, top RAKE terms). */
  primary: string[];
  /** Location-seeded long-tail phrases. */
  longTail: string[];
  /** Everything, deduped, primary first. */
  all: string[];
}

/** Extract keywords for a business, seeded with its city + category. */
export function extractKeywords(
  business: Business,
  s: Strings = stringsFor("en"),
  limit = 8,
): Keywords {
  const city = cityOf(business);
  const category = business.category?.trim();
  const cuisines = cuisineOf(business);

  const primary: string[] = [];
  const push = (arr: string[], v: string | undefined) => {
    const val = v?.trim();
    if (val && !arr.some((x) => x.toLowerCase() === val.toLowerCase())) arr.push(val);
  };

  if (category) push(primary, category);
  for (const c of cuisines) push(primary, titleCase(c));

  // RAKE the description (English only — Hebrew falls back to seeds).
  if (business.description && s.code === "en") {
    for (const { phrase } of rake(business.description).slice(0, 5))
      push(primary, titleCase(phrase));
  }

  const longTail: string[] = [];
  if (category && city) {
    push(longTail, s.code === "he" ? `${category} ב${city}` : `${category} in ${city}`);
    push(longTail, s.code === "he" ? `${category} מומלץ ב${city}` : `best ${category} in ${city}`);
  }
  for (const c of cuisines) {
    if (city)
      push(
        longTail,
        s.code === "he" ? `אוכל ${titleCase(c)} ב${city}` : `${titleCase(c)} food in ${city}`,
      );
  }
  // A top RAKE phrase + location.
  if (business.description && s.code === "en" && city) {
    const top = rake(business.description)[0];
    if (top) push(longTail, `${titleCase(top.phrase)} in ${city}`);
  }

  const all: string[] = [];
  for (const v of [...primary, ...longTail]) push(all, v);
  return {
    primary: primary.slice(0, limit),
    longTail: longTail.slice(0, limit),
    all: all.slice(0, limit),
  };
}
