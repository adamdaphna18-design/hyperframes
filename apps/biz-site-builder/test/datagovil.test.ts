import { describe, expect, test } from "bun:test";
import {
  ckanRecordsToBusinesses,
  DataGovIlSource,
  parseDataGovIlSpec,
} from "../src/sources/datagovil.ts";
import { normalizeRecord } from "../src/sources/normalize.ts";
import { createSource } from "../src/sources/index.ts";
import { isIsraelMarket } from "../src/i18n/locale.ts";

describe("Hebrew field aliases", () => {
  test("maps Hebrew keys to the Business shape", () => {
    const b = normalizeRecord(
      {
        "שם עסק": "מאפיית לחם הארץ",
        קטגוריה: "מאפייה",
        רחוב: "אבן גבירול 30",
        עיר: "תל אביב",
        טלפון: "03-5551234",
        אתר: "",
        דירוג: "4.6",
      },
      "datagovil",
      0,
    );
    expect(b.name).toBe("מאפיית לחם הארץ");
    expect(b.category).toBe("מאפייה");
    expect(b.address).toBe("אבן גבירול 30, תל אביב");
    expect(b.phone).toBe("03-5551234");
    expect(b.website).toBeNull();
    expect(b.rating).toBe(4.6);
    // Hebrew name/place → Israel market → Hebrew site.
    expect(isIsraelMarket(b)).toBe(true);
  });

  test("does not duplicate the city when the street already contains it", () => {
    const b = normalizeRecord({ שם: "עסק", רחוב: "דיזנגוף 1, תל אביב", עיר: "תל אביב" }, "x", 0);
    expect(b.address).toBe("דיזנגוף 1, תל אביב");
  });
});

describe("parseDataGovIlSpec", () => {
  test("parses resource, query and limit", () => {
    expect(parseDataGovIlSpec("resource=abc-123,q=מאפייה,limit=50")).toEqual({
      resourceId: "abc-123",
      query: "מאפייה",
      limit: 50,
    });
  });
  test("bare value is a resource id", () => {
    expect(parseDataGovIlSpec("res-xyz")).toEqual({ resourceId: "res-xyz" });
  });
});

describe("ckanRecordsToBusinesses + DataGovIlSource", () => {
  test("maps CKAN records", () => {
    const businesses = ckanRecordsToBusinesses([
      { שם: "קפה נמל", קטגוריה: "בית קפה", עיר: "חיפה" },
    ]);
    expect(businesses[0]!.name).toBe("קפה נמל");
  });

  test("loads via injected fetch (CKAN datastore_search shape)", async () => {
    const body = JSON.stringify({
      success: true,
      result: { records: [{ שם: "מסעדת הדגים", קטגוריה: "מסעדה", עיר: "יפו" }] },
    });
    const fetchImpl = (async (url: string) => {
      expect(url).toContain("resource_id=res-1");
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const src = new DataGovIlSource({ resourceId: "res-1", fetchImpl });
    const out = await src.load();
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("מסעדת הדגים");
    expect(out[0]!.source).toBe("datagovil");
  });

  test("createSource wires datagovil:", () => {
    const src = createSource("datagovil:resource=abc");
    expect(src.name).toBe("datagovil:abc");
  });

  test("throws without a resource id", () => {
    expect(() => new DataGovIlSource({ resourceId: "" })).toThrow();
  });
});
