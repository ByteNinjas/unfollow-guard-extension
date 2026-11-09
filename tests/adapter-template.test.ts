// Proves the documented adapter interface: a tiny fake site runs through the real panel (scan → select → unfollow).
import { JSDOM } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("adapter template: a new site plugs into the shared panel", async () => {
  const { ok, finish } = checks();
  const store: Record<string, any> = { igMethodV2: true, nfb_onboarded: true, minDelay: 10, maxDelay: 10, allowScan_example: true, dailyCap_example: 10 };
  const ls: Array<(ch: any) => void> = [];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.example.test/home", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window as any;
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } ls.forEach((f) => f(ch)); },
    remove: async (ks: any) => { (Array.isArray(ks) ? ks : [ks]).forEach((k) => delete store[k]); },
    onChanged: { addListener: (f: any) => ls.push(f) },
  };
  w.chrome = { storage: { local, onChanged: { addListener: (f: any) => ls.push(f) } } };
  w.Element.prototype.scrollIntoView = function () {};
  w.eval(readBundle("example-content.js"));

  await sleep(400);
  const sh = w.document.getElementById("nfb-host").shadowRoot, click = (el: any) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok("X1 panel starts for the new site", !!sh && sh.querySelector(".sub").textContent.includes("Example"));
  click(sh.getElementById("scan")); await sleep(120); click(sh.querySelector(".modal .btn.primary")); await sleep(300);
  ok("X2 scan result appears (2 non-followers)", sh.querySelectorAll("#list .row").length === 2 && store.nfb_scan_example_default.users.length === 2);
  sh.querySelector("#list input[type=checkbox]").click(); await sleep(260);
  click(sh.getElementById("del")); await sleep(120); click(sh.querySelector(".modal .btn.danger")); await sleep(900);
  ok("X3 unfollow() called through the shared batch loop", JSON.stringify(w.__unfollowed) === '["e2"]', JSON.stringify(w.__unfollowed));
  ok("X4 history + per-site daily counter", store.nfb_hist_example_default.length === 1 && store.nfb_daily_example_default.count === 1);

  finish();
});
