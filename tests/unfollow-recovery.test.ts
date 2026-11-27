// Regression tests for the two ways an unfollow batch could silently die:
// 1) the extension is reloaded/updated while an Instagram tab stays open (Chrome removes its APIs);
// 2) a captured fb_dtsg/jazoest pair stops matching the token the page currently uses.
import { JSDOM, VirtualConsole } from "jsdom";
import { checks, readBundle } from "./helpers/harness.ts";
import { it } from "vitest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const content = readBundle("content.js");
const adapters = readBundle("adapters.js");

it("orphaned content script: stops its timers and asks for a page reload", async () => {
  const { ok, finish } = checks();
  const store: Record<string, any> = { nfb_onboarded: true, enabled: true, minDelay: 10, maxDelay: 10 };
  let invalid = false;
  let calls = 0;
  const storageError = () => new Error("Extension context invalidated.");
  const local = {
    get: async (k: any) => {
      calls++;
      if (invalid) throw storageError();
      const o: any = {};
      (Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); });
      return o;
    },
    set: async (o: any) => { calls++; if (invalid) throw storageError(); Object.assign(store, JSON.parse(JSON.stringify(o))); },
    remove: async (k: any) => { calls++; if (invalid) throw storageError(); (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); },
    onChanged: { addListener() {} },
  };
  const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", {
    url: "https://www.instagram.com/x/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window as any;
  (w.document as any).cookie = "ds_user_id=777";
  (w.document as any).cookie = "csrftoken=abc";
  w.chrome = { runtime: { id: "test-extension" }, storage: { local, onChanged: { addListener() {} } } };
  w.Element.prototype.scrollIntoView = function () {};
  w.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });

  w.eval(content);
  await sleep(500);
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  ok("R1 panel boots with a live extension context", !!sh() && !sh().querySelector(".deadcard") && !!w.NFB.alive());

  // Chrome's real behaviour after chrome.runtime.reload(): the old content script keeps running,
  // but runtime.id becomes undefined and every storage call rejects.
  invalid = true;
  w.chrome.runtime.id = "";
  await sleep(2200);
  const card = sh().querySelector(".deadcard");
  ok("R2 panel is replaced by the reload banner", !!card && sh().getElementById("panel").style.display === "none", card && card.textContent);
  ok("R3 banner explains what happened", /Extension updated/.test(card ? card.textContent : "") && /Reload page/.test(card ? card.textContent : ""), card && card.textContent);
  ok("R4 liveness flag is set", w.NFB.dead === true && w.NFB.alive() === false);
  ok("R4b an in-flight batch is stopped in memory", typeof w.NFB.shouldStop === "function" && w.NFB.shouldStop() === true);

  await sleep(300);
  const stopped = calls;
  await sleep(2000);
  ok("R5 all panel timers stopped (no more storage calls)", calls === stopped, `${stopped} -> ${calls}`);

  dom.window.close();
  finish();
});

it("captured Instagram tokens expire and jazoest always matches the token that is sent", async () => {
  const { ok, finish } = checks();
  const dom = new JSDOM(
    `<!doctype html><html lang="en" data-nfb='{"fb_dtsg":"OLDT","jazoest":"2CAP","x-ig-www-claim":"claim-1"}'><body></body></html>`,
    { url: "https://www.instagram.com/user1/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() },
  );
  const w = dom.window as any;
  w.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => ({}), onChanged: { addListener() {} } },
      onChanged: { addListener() {} },
    },
  };
  w.Element.prototype.scrollIntoView = function () {};
  const requests: Array<{ url: string; init: any }> = [];
  w.fetch = async (url: string, init: any) => {
    requests.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: "ok", friendship_status: { following: false } }) };
  };
  w.eval(adapters);
  const A = w.NFB.adapters.instagram;

  await A.unfollow({ pk: "42", username: "user1" }, { igMethod: "api" });
  const first = new URLSearchParams(requests[0].init.body);
  ok("T1 a fresh captured token is used", first.get("fb_dtsg") === "OLDT", String(first.get("fb_dtsg")));
  ok("T2 the site's matching jazoest is forwarded", first.get("jazoest") === "2CAP", String(first.get("jazoest")));

  // 31 minutes later the captured token is past DTSG_TTL and the page has rotated it.
  const base = w.Date.now();
  w.Date.now = () => base + 31 * 60 * 1000;
  w.document.body.insertAdjacentHTML("beforeend", '<input name="fb_dtsg" value="NEWTOKEN">');

  await A.unfollow({ pk: "43", username: "user2" }, { igMethod: "api" });
  const second = new URLSearchParams(requests[1].init.body);
  const expectedJz = "2" + [..."NEWTOKEN"].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  ok("T3 the stale captured token is not reused", second.get("fb_dtsg") === "NEWTOKEN", String(second.get("fb_dtsg")));
  ok("T4 jazoest is derived from the new token", second.get("jazoest") === expectedJz && second.get("jazoest") !== "2CAP", String(second.get("jazoest")));
  ok("T5 other captured headers still apply", requests[1].init.headers["x-ig-www-claim"] === "claim-1", String(requests[1].init.headers["x-ig-www-claim"]));

  dom.window.close();
  finish();
});

// Boots the real panel with one account and a controllable destroy endpoint.
function bootBatch(acct: string, users: any[], destroy: (n: number) => { status: number; body: any }) {
  const store: Record<string, any> = { nfb_onboarded: true, igMethod: "api", minDelay: 0, maxDelay: 0 };
  const listeners: Array<(ch: any) => void> = [];
  const k = (n: string) => `nfb_${n}_instagram_${acct}`;
  store[k("scan")] = { at: Date.now(), followers: 0, following: users.length, username: "me", users };
  store[k("lists")] = { at: Date.now(), followers: [], following: users, followingComplete: true };
  store.nfb_accounts = { instagram: [acct] };
  const dom = new JSDOM("<!doctype html><html lang='en' data-nfb='{\"fb_dtsg\":\"T\"}'><body></body></html>", {
    url: "https://www.instagram.com/x/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window as any;
  (w.document as any).cookie = "ds_user_id=" + acct;
  (w.document as any).cookie = "csrftoken=abc";
  const local = {
    get: async (key: any) => {
      const o: any = {};
      (Array.isArray(key) ? key : typeof key === "string" ? [key] : Object.keys(key || {})).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); });
      return o;
    },
    set: async (o: any) => {
      const ch: any = {};
      for (const x in o) { ch[x] = { oldValue: store[x], newValue: o[x] }; store[x] = JSON.parse(JSON.stringify(o[x])); }
      listeners.forEach((f) => f(ch));
    },
    remove: async (key: any) => {
      const ch: any = {};
      (Array.isArray(key) ? key : [key]).forEach((x) => { ch[x] = { oldValue: store[x] }; delete store[x]; });
      listeners.forEach((f) => f(ch));
    },
    onChanged: { addListener: (f: any) => listeners.push(f) },
  };
  w.chrome = {
    storage: { local, onChanged: { addListener: (f: any) => listeners.push(f) } },
    runtime: { sendMessage: (_m: any, cb?: any) => cb && cb(), onMessage: { addListener() {} }, getManifest: () => ({ version: "1.9.0" }) },
  };
  w.Element.prototype.scrollIntoView = function () {};
  let calls = 0;
  w.fetch = async (url: string) => {
    const res = (body: any, status = 200) => ({
      ok: status < 400,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    });
    if (/\/destroy\//.test(url)) { calls++; const r = destroy(calls); return res(r.body, r.status); }
    if (/\/users\/\w+\/info\//.test(url)) return res({ user: { username: "renamed" } });
    if (/friendships\/show\//.test(url)) return res({ following: false });
    return res({});
  };
  w.eval(content);
  const sh = () => (w.document.getElementById("nfb-host") as any).shadowRoot;
  const click = (el: any) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const $ = (id: string) => sh().getElementById(id);
  const run = async (ms = 900) => {
    click(sh().getElementById("all"));
    await sleep(100);
    click($("del"));
    await sleep(100);
    click(sh().querySelector(".modal .btn.danger"));
    await sleep(ms);
  };
  return { w, store, sh, $, click, run, k, calls: () => calls };
}

it("an empty 429 switches the batch to browser clicks before pausing", async () => {
  const { ok, finish } = checks();
  const b = bootBatch("rl1", [{ pk: "p1", username: "user1", full_name: "", pic: "", verified: false }], () => ({ status: 429, body: "" }));
  await sleep(500);
  await b.run();
  const run = b.store[b.k("run")];
  ok("F1 the API was tried once", b.calls() === 1, String(b.calls()));
  ok("F2 the batch switched to browser clicks", !!run && run.forceUI === true, JSON.stringify(run && { forceUI: run.forceUI, navFor: run.navFor }));
  ok("F3 the profile was opened instead of pausing", !!run && run.navFor === 0, JSON.stringify(run && run.navFor));
  ok("F4 no cool-down was started", !b.store[b.k("cool")], String(b.store[b.k("cool")]));
  ok("F5 the log explains the switch", /rate-limited the direct API/i.test(b.$("log").textContent), b.$("log").textContent.slice(0, 240));
  b.w.close();
  finish();
});

it("repeated blocks double the cool-down instead of retrying every 6 hours", async () => {
  const { ok, finish } = checks();
  const b = bootBatch("rl2", [{ pk: "p1", username: "user1", full_name: "", pic: "", verified: false }], () => ({ status: 429, body: { message: "feedback_required", status: "fail" } }));
  await sleep(500);
  await b.run();
  const first = b.store[b.k("cool")];
  const streak1 = b.store[b.k("block")];
  ok("B1 the first block pauses for ~6h", !!first && Math.abs(first - (Date.now() + 6 * 3600000)) < 60000, String(first && (first - Date.now()) / 3600000));
  ok("B2 the streak is recorded", !!streak1 && streak1.count === 1, JSON.stringify(streak1));
  ok("B3 the status names the pause", /Cool-down started/.test(b.$("status").textContent), b.$("status").textContent);

  // The user ends the cool-down from the panel; the block streak must survive.
  await b.w.chrome.storage.local.remove(b.k("cool"));
  await sleep(250);
  await b.run();
  const second = b.store[b.k("cool")];
  const streak2 = b.store[b.k("block")];
  ok("B4 a second block within a week pauses for ~12h", !!second && Math.abs(second - (Date.now() + 12 * 3600000)) < 60000, String(second && (second - Date.now()) / 3600000));
  ok("B5 the streak grows", !!streak2 && streak2.count === 2, JSON.stringify(streak2));
  ok("B6 the status explains the repeat", /block #2/i.test(b.$("status").textContent), b.$("status").textContent);
  b.w.close();
  finish();
});
