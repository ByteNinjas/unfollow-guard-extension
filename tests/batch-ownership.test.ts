// Two tabs must never drive the same batch: the second tab is refused while the first tab's lease
// is fresh, and an owner that loses the lease stops without deleting the new owner's run.
import { JSDOM, VirtualConsole } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { isFreshForeign } from "../src/content/batch.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bundle = readBundle("content.js");
const doms: JSDOM[] = [];
const store: Record<string, any> = { nfb_onboarded: true };
const listeners: Array<(ch: any) => void> = [];
const mkUsers = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ pk: prefix + i, username: prefix + "user" + i, full_name: "", pic: "", verified: false }));
const OK = { status: 200, body: { status: "ok", friendship_status: { following: false } } };

function boot(acct: string, users: any[], settings: any = {}) {
  Object.assign(store, { igMethod: "api", minDelay: 0, maxDelay: 0, maxTouchPoints: 0 }, settings);
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"x\"}'><body></body></html>", { url: "https://www.instagram.com/x/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  doms.push(dom);
  const w = dom.window;
  (w.document as any).cookie = "ds_user_id=" + acct;
  const local = {
    get: async (k: any) => {
      const o: any = {};
      (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => {
        if (x in store) o[x] = JSON.parse(JSON.stringify(store[x]));
      });
      return o;
    },
    set: async (o: any) => {
      const ch: any = {};
      for (const k in o) { ch[k] = { oldValue: store[k], newValue: o[k] }; store[k] = JSON.parse(JSON.stringify(o[k])); }
      listeners.forEach((f) => f(ch));
    },
    remove: async (ks: any) => {
      const ch: any = {};
      (Array.isArray(ks) ? ks : [ks]).forEach((k) => { ch[k] = { oldValue: store[k] }; delete store[k]; });
      listeners.forEach((f) => f(ch));
    },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  (w as any).chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: { sendMessage: (_m: any, cb?: any) => cb && cb(), onMessage: { addListener() {} }, getManifest: () => ({ version: "1.9.0" }) },
  };
  (w as any).Element.prototype.scrollIntoView = function () {};
  (w as any).fetch = (url: string): any => {
    const j = (body: any, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
    if (/destroy\//.test(url)) return Promise.resolve(j(OK.body));
    if (/friendships\/show\//.test(url)) return Promise.resolve(j({ following: false }));
    return Promise.resolve(j({}));
  };
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 1, following: users.length, users, username: "me" };
  store.nfb_accounts = { instagram: [...new Set([...(store.nfb_accounts?.instagram || []), acct])] };
  w.eval(bundle);
  (w as any).NFB.sleep = () => new Promise((r) => setTimeout(r, 1));
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new (w as any).MouseEvent("click", { bubbles: true }));
  return {
    w,
    sh,
    $: (id: string) => sh().getElementById(id),
    start: async () => {
      click(sh().getElementById("all"));
      await sleep(120);
      click(sh().getElementById("del"));
      await sleep(120);
      click(sh().querySelector(".modal .btn.danger"));
      await sleep(150);
    },
    text: () => (sh().getElementById("rcTitle").textContent || "") + " " + (sh().getElementById("status").textContent || "") + " " + [...sh().querySelectorAll(".toast")].map((x: any) => x.textContent).join(" "),
  };
}

it("batch ownership: a second tab cannot take over a live batch", async () => {
  const { ok, finish } = checks();

  const a = boot("1", mkUsers("p", 2), { minDelay: 3, maxDelay: 3 });
  await sleep(450);
  await a.start();
  ok("A starts and owns the run", !!store.nfb_run_instagram_1 && store.nfb_run_instagram_1.queue.length === 2, JSON.stringify(store.nfb_run_instagram_1 && store.nfb_run_instagram_1.queue));

  const b = boot("1", mkUsers("q", 2), { minDelay: 3, maxDelay: 3 });
  await sleep(450);
  await b.start();
  ok("B is refused with the busy message", /A batch is already running in another tab/.test(b.text()), b.text());
  ok("B did not replace the queue", store.nfb_run_instagram_1 && store.nfb_run_instagram_1.queue[0].username === "puser0", JSON.stringify(store.nfb_run_instagram_1 && store.nfb_run_instagram_1.queue));

  await sleep(5000);
  const hist = store.nfb_hist_instagram_1 || [];
  ok("only A's accounts were unfollowed", hist.length === 2 && hist.every((u: any) => /^p/.test(u.username)), JSON.stringify(hist));
  ok("the run is cleaned up after the owner finishes", !store.nfb_run_instagram_1);

  // A foreign lease must stop the old loop and must not be deleted by it.
  const c = boot("2", mkUsers("r", 2), { minDelay: 5, maxDelay: 5 });
  await sleep(450);
  await c.start();
  const live = store.nfb_run_instagram_2;
  ok("C owns a live run", !!live && live.queue.length === 2, JSON.stringify(live));
  store.nfb_run_instagram_2 = { ...live, owner: "other-tab", beat: Date.now() };
  await sleep(1400);
  ok("C reports the takeover instead of silently continuing", /another tab took over/.test(c.text()), c.text());
  ok("C leaves the other tab's run untouched", !!store.nfb_run_instagram_2 && store.nfb_run_instagram_2.owner === "other-tab", JSON.stringify(store.nfb_run_instagram_2));
  delete store.nfb_run_instagram_2;

  doms.forEach((d) => d.window.close());
  finish();
});

it("isFreshForeign only protects a recent run from another tab", () => {
  const now = 1_000_000;
  if (!isFreshForeign({ owner: "b", queue: [], idx: 0, done: 0, beat: now - 1000 }, "a", now)) throw new Error("fresh foreign run must be protected");
  if (isFreshForeign({ owner: "b", queue: [], idx: 0, done: 0, beat: now - 6 * 60 * 1000 }, "a", now)) throw new Error("stale foreign run must be replaceable");
  if (isFreshForeign({ owner: "a", queue: [], idx: 0, done: 0, beat: now }, "a", now)) throw new Error("own run is not foreign");
  if (isFreshForeign(null, "a", now)) throw new Error("no run is not foreign");
});
