import type { Business, Review } from "../types.ts";

/** Deterministic slug used for ids and output folder names. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "business"
  );
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Split a delimited string into a clean list. Accepts `|`, `;` or newline
 * separated values — the common shapes seen in exported business datasets. We
 * deliberately do NOT split on commas because addresses and review text contain
 * them; datasets that need multiple values should use `|` or a JSON array.
 */
export function splitList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  return s
    .split(/[|;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Parse reviews expressed as "Author (4): Great place | Other (5): Loved it". */
export function parseReviews(v: unknown): Review[] {
  // JSON sources may already provide structured review objects.
  if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) {
    return v
      .map((x): Review | undefined => {
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const text = str(o.text ?? o.comment ?? o.review ?? o.body);
          if (!text) return undefined;
          const review: Review = { text };
          const author = str(o.author ?? o.name ?? o.user);
          if (author) review.author = author;
          const rating = num(o.rating ?? o.stars ?? o.score);
          if (rating !== undefined) review.rating = rating;
          const date = str(o.date ?? o.created_at ?? o.time);
          if (date) review.date = date;
          return review;
        }
        const text = str(x);
        return text ? { text } : undefined;
      })
      .filter((r): r is Review => r !== undefined);
  }
  const items = splitList(v);
  return items.map((raw) => {
    // "Author (rating): text" — all parts optional.
    const m = raw.match(/^\s*(?:([^(:]+?)\s*(?:\((\d(?:\.\d)?)\))?\s*:\s*)?(.+)$/s);
    if (!m) return { text: raw };
    const [, author, rating, text] = m;
    const review: Review = { text: (text ?? raw).trim() };
    if (author && author.trim()) review.author = author.trim();
    const r = num(rating);
    if (r !== undefined) review.rating = r;
    return review;
  });
}

/**
 * Turn a loose record (CSV row or JSON object) into a normalised Business.
 * Field names are matched case-insensitively against a set of common aliases so
 * datasets from different exporters "just work".
 */
export function normalizeRecord(
  record: Record<string, unknown>,
  source: string,
  index: number,
): Business {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) lower[k.toLowerCase().trim()] = v;

  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      const v = lower[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
  };

  // Aliases include Hebrew field names common in Israeli datasets (data.gov.il,
  // techmap, company registry, supermarket feeds) so they map without a per-source adapter.
  const name =
    str(
      pick(
        "name",
        "business",
        "business_name",
        "title",
        "company",
        "שם",
        "שם_עסק",
        "שם עסק",
        "שם_חברה",
        "שם חברה",
        "שם_התאגיד",
        "שם_מוסד",
      ),
    ) ?? `Business ${index + 1}`;

  const lat = num(pick("lat", "latitude", "y", "קו_רוחב"));
  const lon = num(pick("lon", "lng", "longitude", "x", "קו_אורך"));

  const website =
    str(pick("website", "url", "site", "web", "homepage", "אתר", "אתר_אינטרנט", "כתובת_אתר")) ??
    null;

  const images = [
    ...splitList(pick("images", "photos", "image_urls", "gallery", "תמונות")),
    ...[str(pick("image", "photo", "logo", "תמונה", "לוגו"))].filter(Boolean),
  ] as string[];

  const street = str(
    pick(
      "address",
      "addr",
      "location",
      "street",
      "full_address",
      "כתובת",
      "כתובת_מלאה",
      "רחוב",
      "שם רחוב",
      "שם_רחוב",
    ),
  );
  // The company registry splits the house number into its own column.
  const houseNo = str(pick("מספר בית", "מספר_בית", "house_number", "house_no", "בית"));
  const streetFull =
    street && houseNo && !street.includes(houseNo) ? `${street} ${houseNo}` : street;
  const city = str(pick("city", "town", "עיר", "ישוב", "יישוב", "עיר_ישוב", "שם עיר", "שם_עיר"));
  const address =
    streetFull && city && !streetFull.includes(city)
      ? `${streetFull}, ${city}`
      : (streetFull ?? city);

  const business: Business = {
    id:
      str(
        pick("id", "place_id", "osm_id", "מזהה", "מספר_תאגיד", "ח_פ", "מספר חברה", "מספר_חברה"),
      ) ?? `${source}-${slugify(name)}-${index}`,
    name,
    category: str(
      pick(
        "category",
        "type",
        "cuisine",
        "amenity",
        "shop",
        "industry",
        "קטגוריה",
        "סוג",
        "ענף",
        "תחום",
      ),
    ),
    description: str(
      pick(
        "description",
        "about",
        "summary",
        "bio",
        "תיאור",
        "אודות",
        "מטרת החברה",
        "מטרת_החברה",
        "מטרת_התאגיד",
      ),
    ),
    address,
    phone: str(
      pick(
        "phone",
        "tel",
        "telephone",
        "contact",
        "phone_number",
        "טלפון",
        "מספר_טלפון",
        "נייד",
        "פלאפון",
      ),
    ),
    email: str(pick("email", "mail", "אימייל", "מייל", "דואל")),
    website,
    hours: str(
      pick(
        "hours",
        "opening_hours",
        "open_hours",
        "hours_of_operation",
        "שעות",
        "שעות_פתיחה",
        "שעות_פעילות",
      ),
    ),
    images: [...new Set(images)],
    reviews: parseReviews(pick("reviews", "review", "testimonials", "ביקורות")),
    rating: num(pick("rating", "stars", "score", "avg_rating", "דירוג")),
    source,
  };

  if (lat !== undefined && lon !== undefined) business.location = { lat, lon };
  return business;
}
