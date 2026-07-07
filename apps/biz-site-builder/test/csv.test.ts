import { describe, expect, test } from "bun:test";
import { csvToRecords, parseCsv } from "../src/sources/csv.ts";

describe("parseCsv", () => {
  test("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("handles quoted fields with commas and newlines", () => {
    const rows = parseCsv('name,note\n"Rosa, Inc.","line1\nline2"');
    expect(rows[1]).toEqual(["Rosa, Inc.", "line1\nline2"]);
  });

  test("handles escaped quotes", () => {
    const rows = parseCsv('q\n"she said ""hi"""');
    expect(rows[1]).toEqual(['she said "hi"']);
  });

  test("strips BOM and CRLF", () => {
    const rows = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("drops fully blank rows", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvToRecords", () => {
  test("keys cells by header", () => {
    const recs = csvToRecords("name,website\nRosa,\nDan,https://x.example");
    expect(recs).toEqual([
      { name: "Rosa", website: "" },
      { name: "Dan", website: "https://x.example" },
    ]);
  });

  test("empty input yields no records", () => {
    expect(csvToRecords("")).toEqual([]);
  });
});
