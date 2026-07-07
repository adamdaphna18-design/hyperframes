import type { Business } from "../types.ts";
import type { LocaleCode } from "./strings.ts";

/** Israeli cities/regions (English + Hebrew) used to infer the Israel market. */
const ISRAEL_PLACES = [
  "israel",
  "ישראל",
  "tel aviv",
  "תל אביב",
  "jerusalem",
  "ירושלים",
  "haifa",
  "חיפה",
  "beer sheva",
  "be'er sheva",
  "באר שבע",
  "netanya",
  "נתניה",
  "herzliya",
  "הרצליה",
  "rishon",
  "ראשון לציון",
  "petah tikva",
  "פתח תקווה",
  "ramat gan",
  "רמת גן",
  "ashdod",
  "אשדוד",
  "eilat",
  "אילת",
];

const HEBREW_RANGE = /[֐-׿ﬠ-ﭏ]/;

/** True if any Hebrew character appears in the text. */
export function hasHebrew(text: string | undefined | null): boolean {
  return !!text && HEBREW_RANGE.test(text);
}

/**
 * Decide whether a business belongs to the Israel market. Signals, any of which
 * is sufficient: an Israeli phone prefix (+972 / 05x national), an Israeli place
 * name in the address, an explicit country tag, or Hebrew text in the name.
 */
export function isIsraelMarket(business: Business): boolean {
  const country = (business.tags?.["addr:country"] ?? business.tags?.country ?? "").toLowerCase();
  if (country === "il" || country === "israel" || country === "ישראל") return true;

  const phone = (business.phone ?? "").replace(/[\s-]/g, "");
  if (
    phone.startsWith("+972") ||
    phone.startsWith("00972") ||
    /^0(5\d|[2-489])\d{7}$/.test(phone)
  ) {
    return true;
  }

  const haystack = `${business.address ?? ""} ${business.name}`.toLowerCase();
  if (ISRAEL_PLACES.some((p) => haystack.includes(p))) return true;

  return hasHebrew(business.name) || hasHebrew(business.address);
}

/**
 * Resolve the locale to render a business in.
 * `override` forces a locale; `market` = "israel" forces Hebrew; otherwise we
 * auto-detect Israel → Hebrew and fall back to English.
 */
export function resolveLocale(
  business: Business,
  opts: { override?: LocaleCode; market?: string } = {},
): LocaleCode {
  if (opts.override) return opts.override;
  if (opts.market && ["israel", "il", "he", "hebrew"].includes(opts.market.toLowerCase()))
    return "he";
  return isIsraelMarket(business) ? "he" : "en";
}
