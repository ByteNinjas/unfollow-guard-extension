// The panel must never take over an element the page already owns, and injecting the content
// script twice must not add a second panel.
import { JSDOM, VirtualConsole } from "jsdom";
import { expect, it } from "vitest";
import { readBundle } from "./helpers/harness.ts";

const bundle = readBundle("content.js");

function boot(html: string) {
  const dom = new JSDOM(html, { url: "https://www.instagram.com/x/", runScripts: "outside-only", virtualConsole: new VirtualConsole() });
  const w = dom.window as any;
  w.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener() {} },
    },
    runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: "1.9.0" }) },
  };
  (w as any).Element.prototype.scrollIntoView = function () {};
  return { dom, w };
}

it("host guard: a page-owned nfb-host is never reused", () => {
  const { dom, w } = boot("<!doctype html><html><body><div id='nfb-host'>page content</div></body></html>");
  w.eval(bundle);
  expect(w.document.getElementById("nfb-host").textContent).toBe("page content");
  const ours = w.document.getElementById("nfb-host-guard");
  expect(ours?.dataset.nfbGuard).toBe("1");
  expect(ours?.shadowRoot).toBeTruthy();

  w.eval(bundle);
  expect(w.document.querySelectorAll("#nfb-host-guard").length).toBe(1);
  dom.window.close();
});

it("host guard: our own host is detected on re-injection", () => {
  const { dom, w } = boot("<!doctype html><html><body></body></html>");
  w.eval(bundle);
  expect(w.document.querySelectorAll("#nfb-host").length).toBe(1);
  w.eval(bundle);
  expect(w.document.querySelectorAll("#nfb-host").length).toBe(1);
  dom.window.close();
});
