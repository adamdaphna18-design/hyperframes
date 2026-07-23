import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { taglineFor } from "../generate/util.ts";

/**
 * Generate a WooCommerce **Product CSV Importer** feed for a retail business.
 * The column names match WooCommerce's importer so it auto-maps on
 * Products → Import. Products are created as **drafts** (Published=0) seeded from
 * the business's photos — a starter catalog the owner edits/publishes, not fake
 * live inventory. Only emitted for businesses whose resolved plugins include
 * WooCommerce.
 */

const HEADER = [
  "Type",
  "SKU",
  "Name",
  "Published",
  "Is featured?",
  "Visibility in catalog",
  "Short description",
  "Description",
  "In stock?",
  "Regular price",
  "Categories",
  "Images",
];

/** Quote a CSV cell per RFC 4180 (double internal quotes; quote if needed). */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

interface Product {
  sku: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  image: string;
}

export function starterProducts(business: Business, s: Strings): Product[] {
  const category = business.category ?? "Products";
  const base = taglineFor(business, s);
  const slugSku =
    business.id
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "item";
  const images = business.images.slice(0, 6);
  const rows: Product[] = images.map((image, i) => ({
    sku: `${slugSku}-${i + 1}`,
    name: `${business.name} — ${s.code === "he" ? "פריט" : "Item"} ${i + 1}`,
    shortDescription: base,
    description: business.description ?? base,
    category,
    image,
  }));
  // Always ship at least one starter row so the importer has something to map.
  if (rows.length === 0) {
    rows.push({
      sku: `${slugSku}-1`,
      name: `${business.name} — ${s.code === "he" ? "מוצר לדוגמה" : "Sample Product"}`,
      shortDescription: base,
      description: business.description ?? base,
      category,
      image: "",
    });
  }
  return rows;
}

export function generateProductsCsv(business: Business, s: Strings = stringsFor("en")): string {
  const rows = starterProducts(business, s).map((p) =>
    [
      "simple",
      p.sku,
      p.name,
      "0", // Published=0 → draft
      "0", // Is featured?
      "visible",
      p.shortDescription,
      p.description,
      "1", // In stock?
      "", // Regular price — owner sets it
      p.category,
      p.image,
    ]
      .map((c) => csvCell(String(c)))
      .join(","),
  );
  return [HEADER.map(csvCell).join(","), ...rows].join("\n") + "\n";
}
