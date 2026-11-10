// Direct unit tests for the pure export helpers (no DOM/bundle needed).
import { describe, expect, it } from "vitest";
import { csvCell, isSafeKey, sanitizeCsvCell } from "../src/content/export";

describe("sanitizeCsvCell", () => {
  it("keeps ordinary text unchanged", () => {
    expect(sanitizeCsvCell("hello")).toBe("hello");
    expect(sanitizeCsvCell(42)).toBe("42");
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });

  it("defuses spreadsheet formulas", () => {
    for (const raw of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=cmd", "\r=cmd"]) {
      expect(sanitizeCsvCell(raw)).toBe("'" + raw);
    }
  });

  it("defuses formulas hidden behind leading whitespace", () => {
    expect(sanitizeCsvCell("  =1+1")).toBe("'  =1+1");
  });

  it("leaves a sign that is not at the start alone", () => {
    expect(sanitizeCsvCell("a=b")).toBe("a=b");
  });
});

describe("csvCell", () => {
  it("quotes values and doubles embedded quotes", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("plain")).toBe('"plain"');
  });

  it("quotes a sanitized formula", () => {
    expect(csvCell("=1+1")).toBe("\"'=1+1\"");
  });
});

describe("isSafeKey", () => {
  it("accepts ordinary object keys", () => {
    expect(isSafeKey("123")).toBe(true);
    expect(isSafeKey("some_user")).toBe(true);
  });

  it("rejects prototype-polluting keys and empty values", () => {
    for (const key of ["__proto__", "prototype", "constructor", "", null, undefined]) {
      expect(isSafeKey(key)).toBe(false);
    }
  });
});
