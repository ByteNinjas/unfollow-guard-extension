// Direct unit tests for the translation table: every key must exist in every language and
// placeholders must stay identical so no locale silently loses a value.
import { describe, expect, it } from "vitest";
import { NFB } from "../src/shared";
import "../src/i18n";

const CODES = ["en", "es", "fr", "de", "pt"];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  it("has the same keys in every language", () => {
    const enKeys = Object.keys(NFB.i18n.en).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const code of CODES) {
      expect(Object.keys(NFB.i18n[code]).sort(), code).toEqual(enKeys);
    }
  });

  it("keeps placeholders identical across languages", () => {
    for (const [key, english] of Object.entries(NFB.i18n.en)) {
      for (const code of CODES) {
        const text = NFB.i18n[code][key] || "";
        expect(placeholders(text), `${code}:${key}`).toEqual(placeholders(String(english)));
      }
    }
  });

  it("falls back to English for an unknown language and interpolates variables", () => {
    NFB.setLang("xx");
    expect(NFB.lang).toBe("en");
    NFB.setLang("es");
    expect(NFB.t("tab_todo")).toBe("Por dejar de seguir");
    expect(NFB.t("ts_kept", { n: 3 })).toContain("3");
  });
});
