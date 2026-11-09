// Removed / banned / renamed accounts and hung requests must never freeze or abort a batch.
import { JSDOM, VirtualConsole } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, nfb_onboarded: true, minDelay: 0, maxDelay: 0 };
const listeners: Array<(ch: any) => void> = [];
const mkUsers = (n: number) => Array.from({ length: n }, (_, i) => ({ pk: "p" + i, username: "user" + i, full_name: "", pic: "", verified: false }));
const OK = { status: 200, body: { status: "ok", friendship_status: { following: false } } };
let destroy: (pk: string, n?: number) => any = () => OK;
let info: (pk: string) => any = () => ({ status: 200, body: { user: { username: "x" } } });
const calls: Record<string, number> = {}, infoCalls: string[] = [];

function boot(acct: string, users: any[], settings: any = {}) {
  Object.assign(store, { igMethod: "api" }, settings);   // each scenario starts from the default method
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"x\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  doms.push(dom);
  const w = dom.window; (w.document as any).cookie = "ds_user_id=" + acct;
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { const ch: any = {}; (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; }); listeners.forEach((f) => f(ch)); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: { sendMessage: (_m: any, cb?: any) => cb && cb(), onMessage: { addListener() {} }, getManifest: () => ({ version: "1.8.0" }) },
  };
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = (url: string): any => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
    let m = /destroy\/(\w+)\//.exec(url);
    if (m) { calls[m[1]] = (calls[m[1]] || 0) + 1; const r = destroy(m[1], calls[m[1]]); return r === "hang" ? new Promise(() => {}) : Promise.resolve(j(r.body, r.status)); }
    m = /users\/(\w+)\/info\//.exec(url);
    if (m && /^p\d+$/.test(m[1])) { infoCalls.push(m[1]); const r = info(m[1]); return r === "hang" ? new Promise(() => {}) : Promise.resolve(j(r.body, r.status)); }
    if (/friendships\/show\//.test(url)) return Promise.resolve(j({ following: false }));
    return Promise.resolve(j({}));
  };
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 1, following: users.length, users, username: "me" };
  store.nfb_accounts = { instagram: [...new Set([...(store.nfb_accounts?.instagram || []), acct])] };
  w.eval(bundle);
  (w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1)); (w as any).NFB.skipDelay = 0;
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true }));
  return {
    w, sh, click, $: (id: string) => sh().getElementById(id),
    run: async (ms: number) => { click(sh().getElementById("all")); await sleep(120); click(sh().getElementById("del")); await sleep(120); click(sh().querySelector(".modal .btn.danger")); await sleep(ms); },
  };
}
const reset = () => {
  for (const k in calls) delete calls[k];
  infoCalls.length = 0;
  destroy = () => OK;
  info = () => ({ status: 200, body: { user: { username: "x" } } });
};
const title = (a: any) => a.$("rcTitle").textContent;

it("gone accounts: removed, banned, renamed and hung requests never freeze a batch", async () => {
  const { ok, finish } = checks();

  // ---------- API method ----------
  reset(); destroy = (pk) => (pk === "p2" ? { status: 400, body: { message: "Bad request", status: "fail" } } : OK); info = (pk) => (pk === "p2" ? { status: 404, body: { message: "User not found" } } : { status: 200, body: { user: { username: "x" } } });
  let a = boot("1", mkUsers(6)); await sleep(450); await a.run(2000);
  ok("G1 unexplained 400 + account gone -> dropped, rest unfollowed", !a.sh().querySelector('.row[data-pk="p2"]') && (store.nfb_hist_instagram_1 || []).length === 5 && calls.p2 === 1 && !/Stopped|failed/.test(title(a)) && /Finished — 5 unfollowed/.test(title(a)), title(a) + " " + JSON.stringify(calls));
  reset(); destroy = (pk) => (pk === "p2" ? { status: 400, body: { message: "Bad request", status: "fail" } } : OK);   // account exists -> a real failure
  a = boot("2", mkUsers(6)); await sleep(450); await a.run(2500);
  ok("G2 unexplained 400 but the account exists -> retried, then marked Failed", calls.p2 === 2 && !!a.sh().querySelector('.row[data-pk="p2"] .tag.warn') && /1 failed/.test(title(a)), title(a));

  // ---------- browser-click method: look the account up first ----------
  reset(); info = () => ({ status: 404, body: { message: "User not found" } });
  a = boot("3", mkUsers(3), { igMethod: "ui" }); await sleep(450); await a.run(1500);
  ok("G3 3 removed/banned accounts are skipped one after another, no waiting, no stop", !a.sh().querySelector("#list .row") && /Finished — 0 unfollowed/.test(title(a)) && infoCalls.length === 3 && !calls.p0, title(a) + " " + infoCalls);
  ok("G4 they were not counted as unfollows or failures", !(store.nfb_hist_instagram_3 || []).length && !store.nfb_daily_instagram_3 && (store.nfb_gone_instagram_3 || []).length === 3);

  reset(); info = () => ({ status: 200, body: { user: { username: "brand_new_name" } } });
  a = boot("4", mkUsers(2), { igMethod: "ui" }); await sleep(450); await a.run(900);
  const run4 = store.nfb_run_instagram_4;
  ok("G5 a renamed account is opened under its new name", run4 && run4.queue[0].username === "brand_new_name" && run4.navFor === 0, JSON.stringify(run4 && run4.queue[0]));
  ok("G6 the rename is logged", /user0 is now @brand_new_name/.test(a.$("log").textContent), a.$("log").textContent.slice(0, 120));

  reset(); info = () => "hang"; a = boot("5", mkUsers(2), { igMethod: "ui" }); (a.w as any).NFB.fetchTimeout = 150; await sleep(450); await a.run(1200);
  ok("G7 an unreachable lookup is 'unknown': it goes on to open the profile instead of freezing", store.nfb_run_instagram_5 && store.nfb_run_instagram_5.navFor === 0 && (store.nfb_gone_instagram_5 || []).length === 0);

  reset(); info = () => ({ status: 429, body: { message: "rate" } }); a = boot("6", mkUsers(3), { igMethod: "ui" }); await sleep(450); await a.run(1200);
  ok("G8 a rate limit during the lookup stops the batch and starts the cool-down", /Stopped: HTTP 429/.test(title(a) + a.$("status").textContent) && !!store.nfb_cool_instagram_6, title(a));

  // ---------- the "page isn't available" screen ----------
  {
    reset(); const p = boot("7", mkUsers(1)); await sleep(300);
    const w = p.w as any;
    Object.defineProperty(w.HTMLElement.prototype, "innerText", { get() { return this.textContent; }, configurable: true });
    w.document.body.innerHTML = "<div>Sorry, this page isn't available. The link you followed may be broken, or the page may have been removed.</div>";
    const t0 = Date.now(); let err: any = null;
    try { await w.NFB.adapters.instagram.unfollow({ pk: "p0", username: "user0" }, { igMethod: "ui" }); } catch (e) { err = e; }
    ok("G9 'page isn't available' is recognised at once and skipped", !!err && err.skip === true && Date.now() - t0 < 1500, err && err.message + " in " + (Date.now() - t0) + "ms");
    w.document.body.innerHTML = "<div>Esta página no está disponible.</div>"; err = null;
    try { await w.NFB.adapters.instagram.unfollow({ pk: "p0", username: "user0" }, { igMethod: "ui" }); } catch (e) { err = e; }
    ok("G10 same in Spanish", !!err && err.skip === true);
  }

  // ---------- hung requests never freeze a batch ----------
  reset(); destroy = (pk) => (pk === "p2" ? "hang" : OK);
  a = boot("8", mkUsers(5)); (a.w as any).NFB.fetchTimeout = 150; await sleep(450); const t1 = Date.now(); await a.run(3000);
  ok("H1 one account that never answers: the other 4 are unfollowed and the batch finishes", (store.nfb_hist_instagram_8 || []).length === 4 && /Finished — 4 unfollowed, 1 failed/.test(title(a)) && calls.p2 === 2 && Date.now() - t1 < 6000, title(a) + " " + JSON.stringify(calls));
  ok("H2 the account is marked Failed with the reason", /Timed out/.test(a.sh().querySelector('.row[data-pk="p2"] .tag.warn').title));

  reset(); destroy = (pk) => (pk === "p1" ? "hang" : OK);
  a = boot("9", mkUsers(3)); (a.w as any).NFB.unfollowTimeout = 300; await sleep(450); await a.run(3000);   // the 20 s request limit is NOT what ends this one
  ok("H3 an overall per-account time limit also ends a hung attempt", /Finished — 2 unfollowed, 1 failed/.test(title(a)) && calls.p1 === 2, title(a));

  reset(); destroy = () => "hang";
  a = boot("10", mkUsers(8)); (a.w as any).NFB.fetchTimeout = 120; await sleep(450); await a.run(2500);
  ok("H4 everything hanging stops after 3 failures instead of looping", /Stopped after 3 failures in a row: Timed out/.test(title(a) + a.$("status").textContent) && Object.keys(calls).length === 3, title(a) + " " + JSON.stringify(calls));

  doms.forEach((d) => d.window.close());
  finish();
});
