// Disabling from the panel asks first; re-enabling from the toolbar popup restores it.
import { JSDOM } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("reenable: disable asks first and a storage change brings the panel back", async () => {
  const { ok, finish } = checks();
  const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window as any; const store: Record<string, any> = { igMethodV2: true }; const ls: Array<(ch: any) => void> = [];
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } ls.forEach((f) => f(ch)); },
    remove: async () => {},
    onChanged: { addListener: (f: any) => ls.push(f) },
  };
  w.chrome = { storage: { local, onChanged: { addListener: (f: any) => ls.push(f) } } };
  w.Element.prototype.scrollIntoView = function () {};
  w.eval(readBundle("content.js"));

  await sleep(300);
  const host = w.document.getElementById("nfb-host"), sh = host.shadowRoot;
  ok("E1 shown initially", host.style.display === "");
  // disable from the panel's own settings -> asks first
  const sw = sh.getElementById("enabled"); sw.checked = false; sw.dispatchEvent(new w.Event("change")); await sleep(100);
  ok("E2 asked first", !!sh.querySelector(".overlay") && !!sh.querySelector(".modal h3").textContent, sh.querySelector(".modal h3") && sh.querySelector(".modal h3").textContent);
  ok("E3 still shown while asking", host.style.display === "");
  sh.querySelector(".modal .btn.danger").dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await sleep(100);
  ok("E4 hidden after confirming", host.style.display === "none");
  // re-enable from the toolbar popup (storage change)
  await w.chrome.storage.local.set({ enabled: true }); await sleep(50);
  ok("E5 shown again", host.style.display === "");
  // declining keeps it on
  sw.checked = false; sw.dispatchEvent(new w.Event("change")); await sleep(100);
  sh.querySelector(".modal .btn:not(.danger)").dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await sleep(100);
  ok("E6 declining keeps it on", host.style.display === "" && sw.checked === true);

  w.close();
  finish();
});
