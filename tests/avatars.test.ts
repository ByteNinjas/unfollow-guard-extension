// Profile pictures: direct load -> through the extension -> refreshed link -> letter; expiry; back-off; self-check; background fetcher.
import { JSDOM } from "jsdom";
import vm from "node:vm";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { igMethodV2: true, nfb_onboarded: true };
const listeners: Array<(ch: any) => void> = [];
const FUT = Math.floor(Date.now() / 1000 + 86400).toString(16);
const CDN = "https://scontent-x.cdninstagram.com/v/";
const mk = (n: number, pic: string) => ({ pk: "p" + n, username: "user" + n, full_name: "N" + n, pic, verified: false });
const refreshCalls: string[] = []; let refreshMode = "fresh";

function boot(acct: string, users: any[]) {
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"NAc\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true });
  doms.push(dom);
  const w = dom.window; (w.document as any).cookie = "ds_user_id=" + acct;
  const srcs: string[] = [], bgReqs: string[] = [];
  const local = {
    get: async (k: any) => { const o: any = {}; (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
    set: async (o: any) => { const ch: any = {}; for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach((f) => f(ch)); },
    remove: async (ks: any) => { (Array.isArray(ks) ? ks : [ks]).forEach((k) => delete store[k]); },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: {
      sendMessage: (m: any, cb?: any) => { if (m.type === "fetch-image") { bgReqs.push(m.url); cb && cb(/viabg/.test(m.url) ? { ok: true, data: "data:image/jpeg;base64,AAAA" } : { ok: false }); } else cb && cb(); },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: "1.7.1" }),
    },
  };
  // an <img> whose load result depends on the address (jsdom doesn't load pictures)
  (w as any).Image = function () {
    const el = w.document.createElement("img");
    Object.defineProperty(el, "src", { get: () => el.getAttribute("src"), set: (v: string) => { srcs.push(v); el.setAttribute("src", v); setTimeout(() => { const good = /good|^data:/.test(v); const fn = good ? el.onload : el.onerror; fn && fn(); }, 1); } });
    return el;
  };
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = async (url: string) => {
    const j = (b: any, status = 200) => ({ ok: status < 400, status, json: async () => b, text: async () => JSON.stringify(b) });
    const m = /\/users\/(\w+)\/info\//.exec(url);
    if (m) {
      refreshCalls.push(m[1]);
      if (refreshMode === "429") return j({}, 429);
      return j({ user: { profile_pic_url: m[1] === "p5" ? null : CDN + "good-fresh-" + m[1] + ".jpg", follower_count: 1, following_count: 1, username: "me" } });
    }
    return j({});
  };
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 1, following: users.length, users, username: "me" };
  store[k("lists")] = { at: Date.now(), followers: [], following: users, followingComplete: true };
  w.eval(bundle);
  (w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1));       // don't wait out the 1 s pauses in the test
  return { w, srcs, bgReqs, sh: () => (w.document.getElementById("nfb-host") as any).shadowRoot, click: (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true })) };
}

it("avatars: direct load, extension relay, refreshed links, expiry, back-off and the background fetcher", async () => {
  const { ok, finish } = checks();

  const users = [
    mk(1, CDN + "good1.jpg?oe=" + FUT),                 // loads directly
    mk(2, CDN + "bad-viabg-2.jpg?oe=" + FUT),           // blocked in the page, works through the extension
    mk(3, CDN + "bad3.jpg?oe=" + FUT),                  // dead link -> refreshed
    mk(4, CDN + "good4.jpg?oe=1"),                      // expired link (1970): never tried, refreshed
    mk(5, CDN + "bad5.jpg?oe=" + FUT),                  // nothing works -> letter
  ];
  const a = boot("1", users); await sleep(900);
  const img = (pk: string) => a.sh().querySelector(`.row[data-pk="${pk}"] img.av`);
  const ph = (pk: string) => a.sh().querySelector(`.row[data-pk="${pk}"] .av.ph`);
  ok("A1 direct load keeps the original link, no extension request", img("p1") && img("p1").getAttribute("src") === users[0].pic && !a.bgReqs.some((u) => /good1/.test(u)));
  ok("A2 blocked in the page -> loaded through the extension", img("p2") && /^data:image\/jpeg/.test(img("p2").getAttribute("src")) && a.bgReqs.some((u) => /viabg/.test(u)), img("p2") && img("p2").getAttribute("src"));
  ok("A3 dead link -> fresh link from the site", img("p3") && /good-fresh-p3/.test(img("p3").getAttribute("src")) && refreshCalls.includes("p3"), img("p3") && img("p3").getAttribute("src"));
  ok("A4 expired link is never requested, fresh one used", !a.srcs.some((u) => /good4\.jpg\?oe=1$/.test(u)) && img("p4") && /good-fresh-p4/.test(img("p4").getAttribute("src")), a.srcs.join(" | "));
  ok("A5 nothing works -> letter placeholder", !!ph("p5") && ph("p5").textContent === "U", ph("p5") && ph("p5").textContent);
  await sleep(1100);
  ok("A6 refreshed links are remembered", store.nfb_pics_instagram_1 && /good-fresh-p3/.test(store.nfb_pics_instagram_1.p3) && /good-fresh-p4/.test(store.nfb_pics_instagram_1.p4), JSON.stringify(store.nfb_pics_instagram_1));
  ok("A7 refresh is sequential and limited to accounts that needed it", JSON.stringify([...refreshCalls].sort()) === '["p3","p4","p5"]', JSON.stringify(refreshCalls));

  // self-check explains where the problem is
  a.click(a.sh().getElementById("diagBtn")); await sleep(500);
  const rep = (a.sh().querySelector(".modal pre") || ({} as any)).textContent || "";
  ok("A8 self-check reports the picture steps", /Picture link/.test(rep) && /loads directly in the page/.test(rep) && /through the extension/.test(rep) && /refreshed/.test(rep), rep);
  a.click(a.sh().querySelector(".modal .btn:not(.primary)"));

  // a reload remembers the refreshed links (no new requests for them)
  refreshCalls.length = 0;
  const b2 = boot("1", users); await sleep(600);
  const img2 = b2.sh().querySelector('.row[data-pk="p3"] img.av');
  ok("A9 after a reload the saved fresh link is used first", img2 && /good-fresh-p3/.test(img2.getAttribute("src")) && !refreshCalls.includes("p3"), img2 && img2.getAttribute("src"));

  // back off when the site answers with a limit
  refreshMode = "429"; refreshCalls.length = 0;
  const many = [1, 2, 3, 4, 5, 6].map((n) => mk(n + 20, CDN + "bad-" + n + ".jpg?oe=" + FUT));
  const c = boot("2", many); await sleep(900);
  ok("B1 a 429 stops further lookups for this page load", refreshCalls.length === 1, JSON.stringify(refreshCalls));
  ok("B2 pictures fall back to letters", c.sh().querySelectorAll("#list .av.ph").length === 6, c.sh().querySelectorAll("#list .av.ph").length);

  // ---------- background worker: fetch-image ----------
  {
    const handlers: Array<(m: any, s: any, cb: any) => boolean | void> = []; let fetched = 0; let reply: any = { ok: true, type: "image/jpeg", bytes: [1, 2, 3] };
    const ctx: any = {
      console, URL, AbortController, setTimeout, clearTimeout, Uint8Array, btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
      fetch: async (_u: string, o: any) => { fetched++; ctx.__opts = o; return { ok: reply.ok, headers: { get: () => reply.type }, arrayBuffer: async () => new Uint8Array(reply.bytes).buffer }; },
      chrome: {
        storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
        action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
        runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f: any) => handlers.push(f) } },
        notifications: { create() {} }, commands: { onCommand: { addListener() {} } }, tabs: { query: async () => [], sendMessage: async () => {} },
      },
    };
    vm.runInNewContext(readBundle("background.js"), ctx); await sleep(20);
    const ask = (url: string) => new Promise<any>((resolve) => { let used = false; handlers.forEach((h) => { if (h({ type: "fetch-image", url }, {}, resolve) === true) used = true; }); if (!used) resolve({ ok: false, unhandled: true }); });
    let r = await ask("https://scontent-x.cdninstagram.com/a.jpg"); ok("BG1 returns a data URL for an Instagram picture", r.ok && r.data === "data:image/jpeg;base64,AQID", JSON.stringify(r));
    ok("BG2 sends no cookies and no referrer", ctx.__opts && ctx.__opts.credentials === "omit" && ctx.__opts.referrerPolicy === "no-referrer");
    r = await ask("https://scontent.xx.fbcdn.net/b.jpg"); ok("BG3 accepts Facebook picture hosts", r.ok);
    fetched = 0; r = await ask("https://evil.example/x.jpg"); ok("BG4 refuses other hosts (not a proxy)", !r.ok && fetched === 0);
    r = await ask("https://cdninstagram.com.evil.example/x.jpg"); ok("BG5 refuses look-alike hosts", !r.ok && fetched === 0);
    r = await ask("http://scontent-x.cdninstagram.com/a.jpg"); ok("BG6 refuses plain http", !r.ok && fetched === 0);
    reply = { ok: true, type: "text/html", bytes: [60] }; r = await ask("https://scontent-x.cdninstagram.com/a.jpg"); ok("BG7 refuses non-images", !r.ok);
    reply = { ok: true, type: "image/png", bytes: new Array(700000).fill(1) }; r = await ask("https://scontent-x.cdninstagram.com/a.jpg"); ok("BG8 refuses very large files", !r.ok);
    reply = { ok: false, type: "image/jpeg", bytes: [1] }; r = await ask("https://scontent-x.cdninstagram.com/a.jpg"); ok("BG9 failed download -> ok:false", !r.ok);
  }

  doms.forEach((d) => d.window.close());
  finish();
});
