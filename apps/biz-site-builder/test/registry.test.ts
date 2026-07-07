import { describe, expect, test } from "bun:test";
import {
  COMPANY_REGISTRY_RESOURCE,
  DataGovIlSource,
  parseDataGovIlSpec,
  REGISTRY_STATUS_FIELD,
} from "../src/sources/datagovil.ts";
import { normalizeRecord } from "../src/sources/normalize.ts";
import { createSource } from "../src/sources/index.ts";
import { isIsraelMarket } from "../src/i18n/locale.ts";

// A record shaped like a row from the Registrar of Companies (רשם החברות) dataset.
const registryRecord = {
  "מספר חברה": "512345678",
  "שם חברה": 'מאפיית הבוקר בע"מ',
  "שם באנגלית": "MORNING BAKERY LTD",
  "סטטוס חברה": "פעילה",
  "סוג תאגיד": "חברה פרטית",
  "מטרת החברה": "לעסוק באפייה ומכירת מוצרי מזון",
  "שם רחוב": "הרצל",
  "מספר בית": "45",
  "שם עיר": "רחובות",
  מיקוד: "7630000",
  "תאריך התאגדות": "2015-03-01",
};

describe("registrar of companies field mapping", () => {
  test("maps registry Hebrew columns to the Business shape", () => {
    const b = normalizeRecord(registryRecord, "datagovil", 0);
    expect(b.name).toBe('מאפיית הבוקר בע"מ');
    expect(b.id).toBe("512345678"); // company number
    expect(b.address).toBe("הרצל 45, רחובות"); // street + house no + city
    expect(b.description).toContain("אפייה"); // company purpose
    // A registry record has no website → the signal to build one.
    expect(b.website).toBeNull();
    expect(isIsraelMarket(b)).toBe(true);
  });
});

describe("registry preset resolution", () => {
  test("`registry` alias resolves to the registrar resource + active filter", () => {
    const opts = parseDataGovIlSpec("registry");
    expect(opts.resourceId).toBe(COMPANY_REGISTRY_RESOURCE);
    expect(opts.filters).toEqual({ [REGISTRY_STATUS_FIELD]: "פעילה" });
  });
  test("Hebrew alias `רשם` works too", () => {
    expect(parseDataGovIlSpec("רשם").resourceId).toBe(COMPANY_REGISTRY_RESOURCE);
  });
  test("carries query + limit through the alias", () => {
    const opts = parseDataGovIlSpec("registry,q=מאפייה,limit=250");
    expect(opts.resourceId).toBe(COMPANY_REGISTRY_RESOURCE);
    expect(opts.query).toBe("מאפייה");
    expect(opts.limit).toBe(250);
  });
  test("`active=false` includes struck-off companies (no filter)", () => {
    expect(parseDataGovIlSpec("registry,active=false").filters).toBeUndefined();
  });
  test("createSource wires registry: and rasham:", () => {
    expect(createSource("registry:q=מסעדה").name).toBe(`datagovil:${COMPANY_REGISTRY_RESOURCE}`);
    expect(createSource("rasham:").name).toBe(`datagovil:${COMPANY_REGISTRY_RESOURCE}`);
  });
});

describe("registry API call shape", () => {
  test("issues a datastore_search with the resource id and active filter", async () => {
    let calledUrl = "";
    const body = JSON.stringify({ success: true, result: { records: [registryRecord] } });
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const opts = parseDataGovIlSpec("registry,q=מאפייה,limit=5");
    const src = new DataGovIlSource({ ...opts, fetchImpl });
    const out = await src.load();

    expect(calledUrl).toContain(`resource_id=${COMPANY_REGISTRY_RESOURCE}`);
    expect(calledUrl).toContain("filters=");
    expect(decodeURIComponent(calledUrl)).toContain("פעילה");
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('מאפיית הבוקר בע"מ');
    expect(out[0]!.website).toBeNull();
  });
});
