import type { Strings } from "../i18n/strings.ts";
import { esc } from "./util.ts";

/**
 * Parse the common subset of the OSM `opening_hours` syntax
 * (https://wiki.openstreetmap.org/wiki/Key:opening_hours, as implemented by
 * opening_hours.js) into structured data, then render it as a localized HTML
 * table (with `<time>` tags) and as a schema.org `OpeningHoursSpecification`.
 *
 * Supported: `24/7`, day ranges/lists (`Mo-Fr`, `Mo,We,Fr`), multiple time
 * ranges per day (`08:00-12:00,13:00-18:00`), and `off`/`closed`. Rules that use
 * features beyond this subset (public holidays, sunset, week numbers) are
 * skipped rather than mis-parsed, and the caller falls back to the raw string.
 */

export interface TimeRange {
  open: string;
  close: string;
}
/** Ranges per weekday, Monday-first (index 0 = Monday … 6 = Sunday). */
export type WeekHours = [
  TimeRange[],
  TimeRange[],
  TimeRange[],
  TimeRange[],
  TimeRange[],
  TimeRange[],
  TimeRange[],
];

const DAY_INDEX: Record<string, number> = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
/** schema.org DayOfWeek by Monday-first index. */
const SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME = /^([01]?\d|2[0-4]):[0-5]\d$/;

function emptyWeek(): WeekHours {
  return [[], [], [], [], [], [], []];
}

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const range = part.split("-");
    if (range.length === 1) {
      const idx = DAY_INDEX[range[0]!];
      if (idx === undefined) return null;
      out.add(idx);
    } else if (range.length === 2) {
      const a = DAY_INDEX[range[0]!];
      const b = DAY_INDEX[range[1]!];
      if (a === undefined || b === undefined) return null;
      // Inclusive, wrapping (e.g. Sa-Mo).
      for (let i = a; ; i = (i + 1) % 7) {
        out.add(i);
        if (i === b) break;
      }
    } else {
      return null;
    }
  }
  return [...out];
}

function parseTimes(spec: string): TimeRange[] | null {
  const ranges: TimeRange[] = [];
  for (const part of spec.split(",")) {
    const [open, close] = part.split("-");
    if (!open || !close || !TIME.test(open) || !TIME.test(close)) return null;
    ranges.push({ open, close });
  }
  return ranges;
}

/** Parse an opening_hours string, or null if it uses unsupported features. */
export function parseOpeningHours(input: string): WeekHours | null {
  const value = input.trim();
  if (!value) return null;
  if (value === "24/7") {
    const week = emptyWeek();
    for (let i = 0; i < 7; i++) week[i] = [{ open: "00:00", close: "24:00" }];
    return week;
  }

  const week = emptyWeek();
  let matched = false;
  for (const rawRule of value.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;
    if (/\b(PH|SH|week|sunrise|sunset|dawn|dusk)\b/i.test(rule)) return null;

    const m = rule.match(/^([A-Za-z,\- ]+?)\s+(.+)$/);
    let days: number[] | null;
    let timePart: string;
    if (m) {
      days = parseDays(m[1]!.replace(/\s+/g, ""));
      timePart = m[2]!.trim();
    } else {
      // Time-only rule applies to every day (e.g. "09:00-17:00").
      days = [0, 1, 2, 3, 4, 5, 6];
      timePart = rule;
    }
    if (!days) return null;

    if (/^(off|closed)$/i.test(timePart)) {
      for (const d of days) week[d] = [];
      matched = true;
      continue;
    }
    const times = parseTimes(timePart.replace(/\s+/g, ""));
    if (!times) return null;
    for (const d of days) week[d] = times;
    matched = true;
  }
  return matched ? week : null;
}

/** Render a localized hours table with <time> elements. */
export function hoursTableHtml(week: WeekHours, s: Strings): string {
  const rows = week
    .map((ranges, i) => {
      const label = esc(s.days[i]!);
      const value =
        ranges.length === 0
          ? `<span class="closed">${esc(s.closedLabel)}</span>`
          : ranges.length === 1 && ranges[0]!.open === "00:00" && ranges[0]!.close === "24:00"
            ? esc(s.open24)
            : ranges
                .map((r) => `<time>${esc(r.open)}</time>–<time>${esc(r.close)}</time>`)
                .join(", ");
      return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
    })
    .join("");
  return `<table class="hours"><tbody>${rows}</tbody></table>`;
}

/** Build a schema.org OpeningHoursSpecification[], grouping days with identical hours. */
export function openingHoursSpecification(week: WeekHours): Array<Record<string, unknown>> {
  const specs: Array<Record<string, unknown>> = [];
  // Group by identical range signature.
  const groups = new Map<string, number[]>();
  week.forEach((ranges, i) => {
    if (!ranges.length) return;
    const key = ranges.map((r) => `${r.open}-${r.close}`).join("|");
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });
  for (const [key, dayIdx] of groups) {
    const dayOfWeek = dayIdx.map((i) => SCHEMA_DAYS[i]!);
    for (const range of key.split("|")) {
      const [opens, closes] = range.split("-");
      specs.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek,
        opens,
        closes: closes === "24:00" ? "23:59" : closes,
      });
    }
  }
  return specs;
}
